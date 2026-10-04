import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  bindLiquidGlassController,
  LIQUID_GLASS_DEFAULTS,
  isWebGLAvailable,
} from './liquidGlassRuntime';

describe('BOSS Liquid Glass Interaction System', () => {
  let mockWindow: any;
  let mockDocument: any;

  beforeEach(() => {
    // Setup lightweight node mock for window & document
    mockDocument = {
      fonts: { ready: Promise.resolve() },
      hidden: false,
      activeElement: null,
      contains: () => true,
    };

    const activeTimers = new Set<any>();

    mockWindow = {
      innerWidth: 1024,
      innerHeight: 768,
      matchMedia: vi.fn().mockImplementation((query: string) => ({
        matches: query.includes('pointer:fine'),
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      })),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      requestAnimationFrame: vi.fn().mockImplementation((cb: (n: number) => void) => {
        const id = setTimeout(() => {
          activeTimers.delete(id);
          cb(Date.now());
        }, 16);
        activeTimers.add(id);
        return id as unknown as number;
      }),
      cancelAnimationFrame: vi.fn().mockImplementation((id: any) => {
        clearTimeout(id);
        activeTimers.delete(id);
      }),
    };

    (globalThis as any).window = mockWindow;
    (globalThis as any).document = mockDocument;
    (globalThis as any).requestAnimationFrame = mockWindow.requestAnimationFrame;
    (globalThis as any).cancelAnimationFrame = mockWindow.cancelAnimationFrame;
    (globalThis as any).ResizeObserver = class {
      observe() {}
      disconnect() {}
    };

    (mockWindow as any)._activeTimers = activeTimers;
  });

  afterEach(() => {
    if (mockWindow && mockWindow._activeTimers) {
      mockWindow._activeTimers.forEach((id: any) => clearTimeout(id));
      mockWindow._activeTimers.clear();
    }
    delete (globalThis as any).window;
    delete (globalThis as any).document;
    delete (globalThis as any).requestAnimationFrame;
    delete (globalThis as any).cancelAnimationFrame;
    delete (globalThis as any).ResizeObserver;
  });

  function createMockElement(tag: string = 'div', attributes: Record<string, string> = {}): any {
    const listeners: Record<string, Function[]> = {};
    const dataset: Record<string, string> = {};
    const style: Record<string, string> = {};
    const children: any[] = [];

    return {
      tagName: tag.toUpperCase(),
      style,
      dataset,
      clientWidth: 200,
      clientHeight: 400,
      children,
      querySelectorAll: (sel: string) => {
        if (sel === '[data-dock-item]') {
          return children.filter((c) => c.hasAttribute('data-dock-item'));
        }
        return [];
      },
      closest: function (sel: string) {
        if (sel === '[data-dock-item]' && this.hasAttribute('data-dock-item')) {
          return this;
        }
        return null;
      },
      parentElement: null,
      getBoundingClientRect: () => ({
        top: 100,
        left: 20,
        bottom: 500,
        right: 220,
        width: 200,
        height: 400,
      }),
      hasAttribute: (name: string) => Boolean(attributes[name]),
      getAttribute: (name: string) => attributes[name],
      classList: {
        contains: (cls: string) => false,
      },
      addEventListener: (type: string, fn: Function) => {
        listeners[type] = listeners[type] || [];
        listeners[type].push(fn);
      },
      removeEventListener: (type: string, fn: Function) => {
        if (!listeners[type]) return;
        listeners[type] = listeners[type].filter((f) => f !== fn);
      },
      dispatchEvent: (event: any) => {
        const fns = listeners[event.type] || [];
        fns.forEach((f) => f(event));
      },
      click: () => {},
      focus: function () {
        const focusin = listeners['focusin'] || [];
        focusin.forEach((f) => f({ target: this }));
      },
    };
  }

  describe('Configuration Defaults', () => {
    it('correctly supplies vertical options', () => {
      expect(LIQUID_GLASS_DEFAULTS.vertical.proximity).toBe(52);
      expect(LIQUID_GLASS_DEFAULTS.vertical.drop).toBe(4.0);
      expect(LIQUID_GLASS_DEFAULTS.vertical.heightGrowth).toBe(3);
      expect(LIQUID_GLASS_DEFAULTS.vertical.particles).toBe(16);
      expect(LIQUID_GLASS_DEFAULTS.vertical.thickness).toBe(0.115);
      expect(LIQUID_GLASS_DEFAULTS.vertical.dispersion).toBe(0.05);
      expect(LIQUID_GLASS_DEFAULTS.vertical.specular).toBe(0.85);
      expect(LIQUID_GLASS_DEFAULTS.vertical.rim).toBe(0.5);
    });

    it('correctly supplies horizontal options', () => {
      expect(LIQUID_GLASS_DEFAULTS.horizontal.proximity).toBe(64);
      expect(LIQUID_GLASS_DEFAULTS.horizontal.drop).toBe(-2.0);
      expect(LIQUID_GLASS_DEFAULTS.horizontal.widthGrowth).toBe(8);
      expect(LIQUID_GLASS_DEFAULTS.horizontal.particles).toBe(12);
      expect(LIQUID_GLASS_DEFAULTS.horizontal.thickness).toBe(0.115);
      expect(LIQUID_GLASS_DEFAULTS.horizontal.dispersion).toBe(0.05);
    });

    it('reports WebGL availability without crashing', () => {
      const available = isWebGLAvailable();
      expect(typeof available).toBe('boolean');
    });
  });

  describe('TopDock Controller Adapter', () => {
    it('binds controller to vertical dock and sets initial dock state', () => {
      const dock = createMockElement('div');
      const item1 = createMockElement('button', { 'data-dock-item': 'true' });
      const item2 = createMockElement('button', { 'data-dock-item': 'true' });
      dock.children.push(item1, item2);

      const unbind = bindLiquidGlassController(dock, () => ({
        orientation: 'vertical',
      }));

      expect(dock.dataset.dockState).toBeDefined();

      // Trigger focus on item 1 via bubbling focusin
      dock.dispatchEvent({ type: 'focusin', target: item1 });
      expect(dock.dataset.dockState).toBe('focus');

      unbind();
    });

    it('binds controller to horizontal dock and responds to pointer events', () => {
      const dock = createMockElement('div');
      const item1 = createMockElement('button', { 'data-dock-item': 'true' });
      const item2 = createMockElement('button', { 'data-dock-item': 'true' });
      dock.children.push(item1, item2);

      const unbind = bindLiquidGlassController(dock, () => ({
        orientation: 'horizontal',
        proximity: 60,
      }));

      // Simulate pointer movement over dock
      dock.dispatchEvent({
        type: 'pointermove',
        clientX: 120,
        clientY: 200,
      });

      expect(dock.dataset.dockState).toBe('active');

      // Simulate pointer leave
      dock.dispatchEvent({
        type: 'pointerleave',
      });

      unbind();
    });
  });
});
