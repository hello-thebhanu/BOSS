import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  isTextInputElement,
  getActiveContainers,
  triggerTypingPulse,
  clearTypingState,
  initGlassInputInteraction,
  TYPING_DECAY_MS,
} from './glassInputRuntime';

interface MockElement {
  tagName: string;
  type?: string;
  attributes: Record<string, string>;
  classList: {
    classes: Set<string>;
    add: (cls: string) => void;
    remove: (cls: string) => void;
    contains: (cls: string) => boolean;
  };
  parentElement: MockElement | null;
  getAttribute: (name: string) => string | null;
  setAttribute: (name: string, val: string) => void;
  removeAttribute: (name: string) => void;
  hasAttribute: (name: string) => boolean;
  closest: (selector: string) => MockElement | null;
  className: string;
}

function createMockElement(tagName: string, type?: string, className = ''): MockElement {
  const attributes: Record<string, string> = {};
  const classSet = new Set<string>(className ? className.split(/\s+/) : []);

  const el: MockElement = {
    tagName: tagName.toUpperCase(),
    type,
    attributes,
    parentElement: null,
    className,
    classList: {
      classes: classSet,
      add(cls: string) {
        classSet.add(cls);
        el.className = Array.from(classSet).join(' ');
      },
      remove(cls: string) {
        classSet.delete(cls);
        el.className = Array.from(classSet).join(' ');
      },
      contains(cls: string) {
        return classSet.has(cls);
      },
    },
    getAttribute(name: string) {
      return attributes[name] ?? null;
    },
    setAttribute(name: string, val: string) {
      attributes[name] = val;
    },
    removeAttribute(name: string) {
      delete attributes[name];
    },
    hasAttribute(name: string) {
      return name in attributes;
    },
    closest(selector: string) {
      let current: MockElement | null = el;
      const selectorClasses = selector
        .split(',')
        .map((s) => s.trim().replace(/^\./, ''));

      while (current) {
        for (const cls of selectorClasses) {
          if (current.classList.contains(cls)) {
            return current;
          }
        }
        current = current.parentElement;
      }
      return null;
    },
  };

  return el;
}

describe('BOSS Glass Input Micro-Interaction System', () => {
  let listeners: Record<string, ((e: any) => void)[]>;
  let mockWindow: any;

  beforeEach(() => {
    vi.useFakeTimers();
    listeners = {};

    mockWindow = {
      addEventListener: vi.fn((event: string, handler: (e: any) => void) => {
        if (!listeners[event]) listeners[event] = [];
        listeners[event].push(handler);
      }),
      removeEventListener: vi.fn((event: string, handler: (e: any) => void) => {
        if (listeners[event]) {
          listeners[event] = listeners[event].filter((h) => h !== handler);
        }
      }),
      matchMedia: vi.fn().mockImplementation((query: string) => ({
        matches: false,
        media: query,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      })),
    };

    (globalThis as any).window = mockWindow;
  });

  afterEach(() => {
    vi.restoreAllMocks();
    delete (globalThis as any).window;
  });

  describe('isTextInputElement', () => {
    it('identifies standard text input elements', () => {
      expect(isTextInputElement(createMockElement('input', 'text'))).toBe(true);
      expect(isTextInputElement(createMockElement('input', 'password'))).toBe(true);
      expect(isTextInputElement(createMockElement('input', 'search'))).toBe(true);
      expect(isTextInputElement(createMockElement('input', 'url'))).toBe(true);
      expect(isTextInputElement(createMockElement('input'))).toBe(true);
    });

    it('identifies textarea elements', () => {
      expect(isTextInputElement(createMockElement('textarea'))).toBe(true);
    });

    it('rejects non-text input types', () => {
      expect(isTextInputElement(createMockElement('input', 'checkbox'))).toBe(false);
      expect(isTextInputElement(createMockElement('input', 'radio'))).toBe(false);
      expect(isTextInputElement(createMockElement('input', 'range'))).toBe(false);
      expect(isTextInputElement(createMockElement('input', 'button'))).toBe(false);
      expect(isTextInputElement(createMockElement('input', 'submit'))).toBe(false);
    });

    it('rejects null, undefined, non-objects, and container tags', () => {
      expect(isTextInputElement(null)).toBe(false);
      expect(isTextInputElement(undefined)).toBe(false);
      expect(isTextInputElement('string')).toBe(false);
      expect(isTextInputElement(123)).toBe(false);
      expect(isTextInputElement({})).toBe(false);
      expect(isTextInputElement(createMockElement('div'))).toBe(false);
    });
  });

  describe('getActiveContainers', () => {
    it('returns the input itself if not wrapped in a prompt container', () => {
      const input = createMockElement('input', 'text') as unknown as HTMLElement;
      const containers = getActiveContainers(input);
      expect(containers).toEqual([input]);
    });

    it('includes parent .boss-prompt-container and .prompt', () => {
      const panel = createMockElement('div', undefined, 'panel boss-prompt-container');
      const promptDiv = createMockElement('div', undefined, 'prompt');
      const input = createMockElement('input', 'text');

      promptDiv.parentElement = panel;
      input.parentElement = promptDiv;

      const containers = getActiveContainers(input as unknown as HTMLElement);
      expect(containers).toContain(input);
      expect(containers).toContain(promptDiv);
      expect(containers).toContain(panel);
    });

    it('includes parent .terminal-prompt-bar', () => {
      const termBar = createMockElement('div', undefined, 'prompt terminal-prompt-bar boss-prompt-container');
      const input = createMockElement('input', 'text');
      input.parentElement = termBar;

      const containers = getActiveContainers(input as unknown as HTMLElement);
      expect(containers).toContain(input);
      expect(containers).toContain(termBar);
    });
  });

  describe('triggerTypingPulse & coalescing', () => {
    it('sets data-typing="true" and class is-typing on input and decay removes it', () => {
      const container = createMockElement('div', undefined, 'boss-prompt-container');
      const input = createMockElement('input', 'text');
      input.parentElement = container;

      triggerTypingPulse(input as unknown as HTMLElement);

      expect(input.getAttribute('data-typing')).toBe('true');
      expect(input.classList.contains('is-typing')).toBe(true);
      expect(container.getAttribute('data-typing')).toBe('true');
      expect(container.classList.contains('is-typing')).toBe(true);

      // Advance clock partially
      vi.advanceTimersByTime(100);
      expect(input.getAttribute('data-typing')).toBe('true');

      // Complete decay
      vi.advanceTimersByTime(TYPING_DECAY_MS - 100 + 10);
      expect(input.hasAttribute('data-typing')).toBe(false);
      expect(input.classList.contains('is-typing')).toBe(false);
      expect(container.hasAttribute('data-typing')).toBe(false);
      expect(container.classList.contains('is-typing')).toBe(false);
    });

    it('coalesces rapid keystrokes into a continuous hum by refreshing decay timer', () => {
      const input = createMockElement('input', 'text');

      // Keystroke 1 at t=0ms
      triggerTypingPulse(input as unknown as HTMLElement);
      expect(input.getAttribute('data-typing')).toBe('true');

      // Keystroke 2 at t=100ms (before TYPING_DECAY_MS)
      vi.advanceTimersByTime(100);
      triggerTypingPulse(input as unknown as HTMLElement);
      expect(input.getAttribute('data-typing')).toBe('true');

      // Keystroke 3 at t=200ms
      vi.advanceTimersByTime(100);
      triggerTypingPulse(input as unknown as HTMLElement);
      expect(input.getAttribute('data-typing')).toBe('true');

      // At t=350ms (150ms after Keystroke 3), should still be active
      vi.advanceTimersByTime(150);
      expect(input.getAttribute('data-typing')).toBe('true');

      // At t=430ms (230ms after Keystroke 3), decay completes
      vi.advanceTimersByTime(80);
      expect(input.hasAttribute('data-typing')).toBe(false);
    });
  });

  describe('clearTypingState', () => {
    it('immediately clears typing attributes and cancels pending timers', () => {
      const input = createMockElement('input', 'text');

      triggerTypingPulse(input as unknown as HTMLElement);
      expect(input.getAttribute('data-typing')).toBe('true');

      clearTypingState([input as unknown as HTMLElement]);
      expect(input.hasAttribute('data-typing')).toBe(false);
      expect(input.classList.contains('is-typing')).toBe(false);

      // Verify timer does not resurrect state
      vi.advanceTimersByTime(TYPING_DECAY_MS * 2);
      expect(input.hasAttribute('data-typing')).toBe(false);
    });
  });

  describe('initGlassInputInteraction', () => {
    it('attaches global listeners and activates on keydown for text inputs', () => {
      const cleanup = initGlassInputInteraction();

      expect(mockWindow.addEventListener).toHaveBeenCalledWith('keydown', expect.any(Function), { passive: true, capture: true });
      expect(mockWindow.addEventListener).toHaveBeenCalledWith('input', expect.any(Function), { passive: true, capture: true });
      expect(mockWindow.addEventListener).toHaveBeenCalledWith('blur', expect.any(Function), { passive: true, capture: true });

      const input = createMockElement('input', 'text');
      const keyEvent = { key: 'a', target: input };

      // Dispatch keydown
      listeners['keydown']?.forEach((fn) => fn(keyEvent));
      expect(input.getAttribute('data-typing')).toBe('true');

      cleanup();
      expect(mockWindow.removeEventListener).toHaveBeenCalledWith('keydown', expect.any(Function), { capture: true });
    });

    it('ignores modifier navigation keys alone', () => {
      const cleanup = initGlassInputInteraction();

      const input = createMockElement('input', 'text');

      for (const modKey of ['Shift', 'Control', 'Alt', 'Meta', 'CapsLock', 'Escape', 'Tab']) {
        const modEvent = { key: modKey, target: input };
        listeners['keydown']?.forEach((fn) => fn(modEvent));
        expect(input.hasAttribute('data-typing')).toBe(false);
      }

      cleanup();
    });

    it('activates on input event', () => {
      const cleanup = initGlassInputInteraction();

      const textarea = createMockElement('textarea');
      const inputEvent = { target: textarea };

      listeners['input']?.forEach((fn) => fn(inputEvent));
      expect(textarea.getAttribute('data-typing')).toBe('true');

      cleanup();
    });

    it('clears typing state immediately on blur event', () => {
      const cleanup = initGlassInputInteraction();

      const input = createMockElement('input', 'text');
      triggerTypingPulse(input as unknown as HTMLElement);
      expect(input.getAttribute('data-typing')).toBe('true');

      const blurEvent = { target: input };
      listeners['blur']?.forEach((fn) => fn(blurEvent));
      expect(input.hasAttribute('data-typing')).toBe(false);

      cleanup();
    });

    it('handles prefers-reduced-motion and skips animation pulse', () => {
      mockWindow.matchMedia = vi.fn().mockImplementation((query: string) => ({
        matches: query.includes('prefers-reduced-motion: reduce'),
        media: query,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      }));

      const input = createMockElement('input', 'text');
      triggerTypingPulse(input as unknown as HTMLElement);
      expect(input.hasAttribute('data-typing')).toBe(false);
    });
  });
});
