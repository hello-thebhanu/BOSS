/**
 * BOSS Glass Input & Micro-Interaction Runtime
 *
 * Provides ambient focus management and keystroke micro-interactions
 * for all text inputs, prompt bars, and textareas across the application.
 *
 * Design Principles:
 * - Ambient energy response: restrained, subtle luminescent bloom native to BOSS Core
 * - 0ms perceptual latency: direct GPU-accelerated CSS attributes without React re-renders
 * - Fast attack (< 70ms) and organic decay (~220ms)
 * - Rapid typing coalescing: subsequent keystrokes reset decay timer, keeping a steady alive hum
 * - Accessible: high-contrast keyboard tab focus (:focus-visible)
 * - Zero layout shifts (CLS = 0)
 * - Full respect for prefers-reduced-motion
 */

export const TYPING_DECAY_MS = 220;

let isInitialized = false;
let cleanupFn: (() => void) | null = null;
const activeTimers = new WeakMap<HTMLElement, ReturnType<typeof setTimeout>>();

/**
 * Checks if an element is a standard text input or textarea
 * (excludes checkboxes, radios, sliders, submit buttons, etc.)
 */
export function isTextInputElement(el: unknown): el is HTMLInputElement | HTMLTextAreaElement {
  if (!el || typeof el !== 'object' || !('tagName' in el)) return false;
  const domNode = el as { tagName?: string; type?: string };
  const tag = (domNode.tagName || '').toUpperCase();
  if (tag === 'TEXTAREA') return true;
  if (tag === 'INPUT') {
    const type = domNode.type ? domNode.type.toLowerCase() : 'text';
    return !['checkbox', 'radio', 'range', 'file', 'button', 'submit', 'reset', 'image', 'color'].includes(type);
  }
  return false;
}


/**
 * Resolves all target containers for a text input element, including
 * surrounding prompt bars, panels, and the input itself.
 */
export function getActiveContainers(input: HTMLElement): HTMLElement[] {
  const containers: HTMLElement[] = [input];
  let current: HTMLElement | null = input.parentElement;
  while (current) {
    if (
      current.classList &&
      (current.classList.contains('boss-prompt-container') ||
        current.classList.contains('prompt-container') ||
        current.classList.contains('prompt') ||
        current.classList.contains('terminal-prompt-bar') ||
        current.classList.contains('chat-prompt-bar') ||
        current.classList.contains('sidebar-search') ||
        current.classList.contains('panel'))
    ) {
      if (!containers.includes(current)) {
        containers.push(current);
      }
    }
    if (current.classList && (current.classList.contains('shell') || current.classList.contains('page'))) {
      break;
    }
    current = current.parentElement;
  }
  return containers;
}


/**
 * Clears typing micro-interaction state from the given elements immediately.
 */
export function clearTypingState(elements: HTMLElement[]): void {
  for (const el of elements) {
    const timer = activeTimers.get(el);
    if (timer) {
      clearTimeout(timer);
      activeTimers.delete(el);
    }
    el.removeAttribute('data-typing');
    el.classList.remove('is-typing');
  }
}

/**
 * Triggers a subtle typing pulse on the input and its parent container.
 * Subsequent keystrokes coalesce into a steady warm hum by refreshing the decay timer.
 */
export function triggerTypingPulse(input: HTMLElement): void {
  // Respect prefers-reduced-motion
  if (typeof window !== 'undefined' && typeof window.matchMedia === 'function') {
    try {
      if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
        return;
      }
    } catch {
      // Ignore in non-browser or test mock environments without matchMedia
    }
  }

  const targets = getActiveContainers(input);

  for (const el of targets) {
    el.setAttribute('data-typing', 'true');
    el.classList.add('is-typing');

    // Coalesce rapid keystrokes: cancel prior decay timer
    const existing = activeTimers.get(el);
    if (existing) {
      clearTimeout(existing);
    }

    const timer = setTimeout(() => {
      el.removeAttribute('data-typing');
      el.classList.remove('is-typing');
      activeTimers.delete(el);
    }, TYPING_DECAY_MS);

    activeTimers.set(el, timer);
  }
}

/**
 * Initializes global event capture for glass input micro-interactions.
 * Returns a teardown cleanup function.
 */
export function initGlassInputInteraction(): () => void {
  if (typeof window === 'undefined') return () => {};
  if (isInitialized && cleanupFn) {
    return cleanupFn;
  }

  const handleKeyDown = (e: KeyboardEvent) => {
    // Ignore non-typing navigation / modifier keys alone
    if (['Shift', 'Control', 'Alt', 'Meta', 'CapsLock', 'Escape', 'Tab'].includes(e.key)) {
      return;
    }
    const target = e.target;
    if (isTextInputElement(target)) {
      triggerTypingPulse(target);
    }
  };

  const handleInput = (e: Event) => {
    const target = e.target;
    if (isTextInputElement(target)) {
      triggerTypingPulse(target);
    }
  };

  const handleBlur = (e: FocusEvent) => {
    const target = e.target;
    if (isTextInputElement(target)) {
      const targets = getActiveContainers(target);
      clearTypingState(targets);
    }
  };

  window.addEventListener('keydown', handleKeyDown, { passive: true, capture: true });
  window.addEventListener('input', handleInput, { passive: true, capture: true });
  window.addEventListener('blur', handleBlur, { passive: true, capture: true });

  isInitialized = true;
  cleanupFn = () => {
    window.removeEventListener('keydown', handleKeyDown, { capture: true });
    window.removeEventListener('input', handleInput, { capture: true });
    window.removeEventListener('blur', handleBlur, { capture: true });
    isInitialized = false;
    cleanupFn = null;
  };

  return cleanupFn;
}
