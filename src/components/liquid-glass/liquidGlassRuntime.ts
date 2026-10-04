import {
  createTopDockController,
  type TopDockOptions,
  type TopDockAxis,
} from '../../shaders/animated-top-dock/topDockController';
import type { GlassParticleOptions } from '../../shaders/animated-top-dock/glassParticleField';

export interface LiquidGlassOptions {
  orientation?: 'vertical' | 'horizontal';
  proximity?: number;
  spring?: number;
  damping?: number;
  widthGrowth?: number;
  heightGrowth?: number;
  drop?: number;
  distribute?: boolean;
  lockTrack?: boolean;
  /* Glass Shader Field Options */
  withField?: boolean;
  particles?: number;
  thickness?: number;
  dispersion?: number;
  specular?: number;
  rim?: number;
  drift?: number;
}

export const LIQUID_GLASS_DEFAULTS = {
  vertical: {
    proximity: 52,
    spring: 0.18,
    damping: 0.72,
    widthGrowth: 0,
    heightGrowth: 3,
    drop: 4.0,
    particles: 16,
    thickness: 0.115,
    dispersion: 0.05,
    specular: 0.85,
    rim: 0.5,
    drift: 0.8,
  },
  horizontal: {
    proximity: 64,
    spring: 0.19,
    damping: 0.7,
    widthGrowth: 8,
    heightGrowth: 2,
    drop: -2.0,
    particles: 12,
    thickness: 0.115,
    dispersion: 0.05,
    specular: 0.85,
    rim: 0.5,
    drift: 0.8,
  },
} as const;

export function isWebGLAvailable(): boolean {
  if (typeof window === 'undefined' || typeof document === 'undefined') return false;
  try {
    const canvas = document.createElement('canvas');
    return Boolean(
      window.WebGLRenderingContext &&
        (canvas.getContext('webgl') || canvas.getContext('experimental-webgl'))
    );
  } catch {
    return false;
  }
}

export type LiquidGlassFieldHandle = {
  dispose: () => void;
};

/**
 * Connects the ThreeUI topDockController physics spring to a BOSS LiquidGlass container.
 */
export function bindLiquidGlassController(
  root: HTMLElement,
  getOptions: () => LiquidGlassOptions
): () => void {
  const toTopDockOptions = (): TopDockOptions => {
    const opts = getOptions();
    const orientation = opts.orientation ?? 'vertical';
    const defaults = orientation === 'vertical' ? LIQUID_GLASS_DEFAULTS.vertical : LIQUID_GLASS_DEFAULTS.horizontal;
    const axis: TopDockAxis = orientation === 'vertical' ? 'y' : 'x';

    return {
      axis,
      proximity: opts.proximity ?? defaults.proximity,
      spring: opts.spring ?? defaults.spring,
      damping: opts.damping ?? defaults.damping,
      widthGrowth: opts.widthGrowth ?? defaults.widthGrowth,
      heightGrowth: opts.heightGrowth ?? defaults.heightGrowth,
      drop: opts.drop ?? defaults.drop,
      distribute: opts.distribute ?? false,
      lockTrack: opts.lockTrack ?? (orientation === 'horizontal'),
    };
  };

  return createTopDockController(root, toTopDockOptions);
}

/**
 * Binds the ThreeUI glassParticleField WebGL canvas to the background of a LiquidGlass container.
 * Runs ONE shared animation frame and pauses automatically when offscreen or tab is hidden.
 */
export function bindLiquidGlassField(
  host: HTMLElement,
  canvas: HTMLCanvasElement,
  getOptions: () => LiquidGlassOptions
): LiquidGlassFieldHandle {
  if (!isWebGLAvailable()) {
    return { dispose: () => {} };
  }

  let disposed = false;
  let fieldInstance: {
    resize: (w: number, h: number) => void;
    render: (now: number) => void;
    setPointer?: (x: number, y: number) => void;
    dispose: () => void;
  } | null = null;

  let frameId = 0;
  let isVisible = true;

  const toGlassOptions = (): GlassParticleOptions => {
    const opts = getOptions();
    const orientation = opts.orientation ?? 'vertical';
    const defaults = orientation === 'vertical' ? LIQUID_GLASS_DEFAULTS.vertical : LIQUID_GLASS_DEFAULTS.horizontal;

    return {
      count: opts.particles ?? defaults.particles,
      thickness: opts.thickness ?? defaults.thickness,
      dispersion: opts.dispersion ?? defaults.dispersion,
      specular: opts.specular ?? defaults.specular,
      rim: opts.rim ?? defaults.rim,
      drift: opts.drift ?? defaults.drift,
    };
  };

  let bounds = host.getBoundingClientRect();

  const handleResize = () => {
    if (disposed || !fieldInstance) return;
    bounds = host.getBoundingClientRect();
    fieldInstance.resize(bounds.width, bounds.height);
  };

  const tick = (now: number) => {
    if (disposed || !fieldInstance) return;
    fieldInstance.resize(bounds.width, bounds.height);
    fieldInstance.render(now);
    if (isVisible && !document.hidden) {
      frameId = requestAnimationFrame(tick);
    } else {
      frameId = 0;
    }
  };

  const onPointerMove = (event: PointerEvent) => {
    if (disposed || !fieldInstance || !fieldInstance.setPointer) return;
    const nx = ((event.clientX - bounds.left) / Math.max(1, bounds.width)) * 2 - 1;
    const ny = -(((event.clientY - bounds.top) / Math.max(1, bounds.height)) * 2 - 1);
    fieldInstance.setPointer(nx, ny);
  };

  const resizeObserver = typeof ResizeObserver !== 'undefined'
    ? new ResizeObserver(handleResize)
    : null;

  const intersectionObserver = typeof IntersectionObserver !== 'undefined'
    ? new IntersectionObserver(([entry]) => {
        isVisible = entry?.isIntersecting ?? true;
        if (isVisible && !frameId) {
          frameId = requestAnimationFrame(tick);
        } else if (!isVisible && frameId) {
          cancelAnimationFrame(frameId);
          frameId = 0;
        }
      })
    : null;

  import('../../shaders/animated-top-dock/glassParticleField')
    .then(({ createGlassParticleField }) => {
      if (disposed) return;
      fieldInstance = createGlassParticleField(canvas, toGlassOptions);

      if (resizeObserver) resizeObserver.observe(host);
      if (intersectionObserver) intersectionObserver.observe(host);
      host.addEventListener('pointermove', onPointerMove, { passive: true });

      handleResize();
      frameId = requestAnimationFrame(tick);
    })
    .catch((err) => {
      console.warn('LiquidGlassField initialization skipped:', err);
    });

  return {
    dispose: () => {
      disposed = true;
      if (frameId) {
        cancelAnimationFrame(frameId);
        frameId = 0;
      }
      if (resizeObserver) resizeObserver.disconnect();
      if (intersectionObserver) intersectionObserver.disconnect();
      host.removeEventListener('pointermove', onPointerMove);
      if (fieldInstance) {
        fieldInstance.dispose();
        fieldInstance = null;
      }
    },
  };
}
