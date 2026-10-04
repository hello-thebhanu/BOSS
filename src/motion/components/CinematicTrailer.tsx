import { useEffect, useRef, useState, useCallback } from 'react';
import { BossMotionEngine } from '../engine/bossMotionEngine';
import { Shot01CoreAwakening } from '../scenes/shot01CoreAwakening';
import { routes } from '../../app/router/routes';
import './CinematicTrailer.css';

interface CinematicTrailerProps {
  onComplete?: () => void;
  nextRoute?: string;
}

export function CinematicTrailer({
  onComplete,
  nextRoute = routes.auth,
}: CinematicTrailerProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const engineRef = useRef<BossMotionEngine | null>(null);
  const completedRef = useRef(false);

  const [showSkip, setShowSkip] = useState(false);

  const handleFinish = useCallback(() => {
    if (completedRef.current) return;
    completedRef.current = true;
    if (onComplete) {
      onComplete();
    } else {
      window.history.pushState({}, '', nextRoute);
      window.dispatchEvent(new PopStateEvent('popstate'));
    }
  }, [onComplete, nextRoute]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const reducedMotion =
      typeof window !== 'undefined' && window.matchMedia
        ? window.matchMedia('(prefers-reduced-motion: reduce)').matches
        : false;

    const scene = new Shot01CoreAwakening();
    const engine = new BossMotionEngine({
      canvas,
      scene,
      reducedMotion,
      onStateChange: (state) => {
        // Show skip intro button strictly at/after 10.0 seconds
        if (state.currentTime >= 10.0) {
          setShowSkip(true);
        }

        // Natural completion at end of shot
        if (state.currentTime >= 11.5 || state.isComplete) {
          handleFinish();
        }
      },
    });

    engineRef.current = engine;

    // Start cinematic auto-play immediately
    engine.play();

    return () => {
      engine.destroy();
      engineRef.current = null;
    };
  }, [handleFinish]);

  return (
    <div className="cinematic-trailer-viewport" data-testid="cinematic-trailer-viewport">
      <canvas ref={canvasRef} className="cinematic-trailer__canvas" />

      <button
        type="button"
        className={`cinematic-trailer__skip ${showSkip ? 'is-visible' : ''}`}
        onClick={handleFinish}
        aria-label="Skip Introduction"
      >
        SKIP INTRO →
      </button>
    </div>
  );
}
