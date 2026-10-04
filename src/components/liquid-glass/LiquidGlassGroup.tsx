import React, { useEffect, useRef } from 'react';
import {
  bindLiquidGlassController,
  bindLiquidGlassField,
  type LiquidGlassOptions,
} from './liquidGlassRuntime';
import './liquidGlass.css';

export interface LiquidGlassGroupProps extends LiquidGlassOptions {
  children: React.ReactNode;
  className?: string;
  style?: React.CSSProperties;
  role?: string;
  'aria-label'?: string;
}

export const LiquidGlassGroup: React.FC<LiquidGlassGroupProps> = ({
  orientation = 'vertical',
  withField = false,
  proximity,
  spring,
  damping,
  widthGrowth,
  heightGrowth,
  drop,
  distribute,
  lockTrack,
  particles,
  thickness,
  dispersion,
  specular,
  rim,
  drift,
  children,
  className = '',
  style,
  role,
  'aria-label': ariaLabel,
}) => {
  const hostRef = useRef<HTMLDivElement>(null);
  const dockRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const optionsRef = useRef<LiquidGlassOptions>({
    orientation,
    withField,
    proximity,
    spring,
    damping,
    widthGrowth,
    heightGrowth,
    drop,
    distribute,
    lockTrack,
    particles,
    thickness,
    dispersion,
    specular,
    rim,
    drift,
  });

  optionsRef.current = {
    orientation,
    withField,
    proximity,
    spring,
    damping,
    widthGrowth,
    heightGrowth,
    drop,
    distribute,
    lockTrack,
    particles,
    thickness,
    dispersion,
    specular,
    rim,
    drift,
  };

  useEffect(() => {
    const dockEl = dockRef.current;
    if (!dockEl) return;

    const unbindController = bindLiquidGlassController(dockEl, () => optionsRef.current);
    return () => {
      unbindController();
    };
  }, [orientation]);

  useEffect(() => {
    const hostEl = hostRef.current;
    const canvasEl = canvasRef.current;
    if (!withField || !hostEl || !canvasEl) return;

    const fieldHandle = bindLiquidGlassField(hostEl, canvasEl, () => optionsRef.current);
    return () => {
      fieldHandle.dispose();
    };
  }, [withField, orientation]);

  return (
    <div
      ref={hostRef}
      className={`liquid-glass-group liquid-glass-group--${orientation}${withField ? ' with-field' : ''}${className ? ` ${className}` : ''}`}
      data-dock-frame
      data-dock-orientation={orientation}
      style={style}
    >
      {withField && (
        <div className="liquid-glass-field-wrap" aria-hidden="true">
          <canvas ref={canvasRef} className="liquid-glass-canvas" />
        </div>
      )}
      <div
        ref={dockRef}
        className={`liquid-glass-dock liquid-glass-dock--${orientation}`}
        data-dock-state="idle"
        data-dock-max="0.00"
        role={role}
        aria-label={ariaLabel}
      >
        {children}
      </div>
    </div>
  );
};
