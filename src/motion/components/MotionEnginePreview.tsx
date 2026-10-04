import React, { useEffect, useRef, useState, useCallback } from 'react';
import { BossMotionEngine } from '../engine/bossMotionEngine';
import { Shot01CoreAwakening } from '../scenes/shot01CoreAwakening';
import { TimelineState } from '../engine/motionEngineTypes';
import './MotionEnginePreview.css';

interface MotionEnginePreviewProps {
  autoPlay?: boolean;
}

export function MotionEnginePreview({ autoPlay = false }: MotionEnginePreviewProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const engineRef = useRef<BossMotionEngine | null>(null);

  const [timelineState, setTimelineState] = useState<TimelineState | null>(null);
  const [reducedMotion, setReducedMotion] = useState<boolean>(() => {
    if (typeof window !== 'undefined' && window.matchMedia) {
      return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    }
    return false;
  });

  // Initialize engine
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const scene = new Shot01CoreAwakening();
    const engine = new BossMotionEngine({
      canvas,
      scene,
      reducedMotion,
      onStateChange: (state) => {
        setTimelineState(state);
      },
    });

    engineRef.current = engine;
    setTimelineState(engine.getState());

    if (autoPlay) {
      engine.play();
    }

    return () => {
      engine.destroy();
      engineRef.current = null;
    };
  }, [reducedMotion, autoPlay]);

  // Handlers
  const handlePlayPause = useCallback(() => {
    if (!engineRef.current || !timelineState) return;
    if (timelineState.isPlaying) {
      engineRef.current.pause();
    } else {
      engineRef.current.play();
    }
  }, [timelineState]);

  const handleReplay = useCallback(() => {
    if (!engineRef.current) return;
    engineRef.current.replay();
  }, []);

  const handleReset = useCallback(() => {
    if (!engineRef.current) return;
    engineRef.current.reset();
  }, []);

  const handleSeek = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    if (!engineRef.current || !timelineState) return;
    const val = parseFloat(e.target.value);
    engineRef.current.seek(val);
  }, [timelineState]);

  const handleToggleReducedMotion = useCallback(() => {
    setReducedMotion((prev) => !prev);
  }, []);

  const currentTime = timelineState?.currentTime ?? 0;
  const duration = timelineState?.duration ?? 9.0;
  const isPlaying = timelineState?.isPlaying ?? false;
  const currentPhase = timelineState?.currentPhase;

  return (
    <div className="motion-preview" data-testid="motion-engine-preview">
      <div className="motion-preview__canvas-wrapper">
        <canvas ref={canvasRef} className="motion-preview__canvas" />
        <div className="motion-preview__overlay-badge">
          BOSS MOTION ENGINE // SHOT 01
        </div>
      </div>

      <div className="motion-preview__controls">
        <div className="motion-preview__scrubber">
          <input
            type="range"
            className="motion-preview__slider"
            min="0"
            max={duration}
            step="0.05"
            value={currentTime}
            onChange={handleSeek}
            aria-label="Timeline Scrubber"
          />
          <span className="motion-preview__timecode">
            <b>{currentTime.toFixed(1)}s</b> / {duration.toFixed(1)}s
          </span>
        </div>

        <div className="motion-preview__actions">
          <button
            type="button"
            className={`motion-preview__btn ${isPlaying ? '' : 'motion-preview__btn--primary'}`}
            onClick={handlePlayPause}
            aria-label={isPlaying ? 'Pause' : 'Play'}
          >
            {isPlaying ? '⏸ Pause' : '▶ Play'}
          </button>
          <button
            type="button"
            className="motion-preview__btn"
            onClick={handleReplay}
            aria-label="Replay"
          >
            ↺ Replay
          </button>
          <button
            type="button"
            className="motion-preview__btn"
            onClick={handleReset}
            aria-label="Reset"
          >
            ⏹ Reset
          </button>
          <button
            type="button"
            className="motion-preview__btn"
            onClick={handleToggleReducedMotion}
            aria-label="Toggle Reduced Motion"
            title={reducedMotion ? 'Reduced motion enabled' : 'Normal motion'}
          >
            {reducedMotion ? '⚡ Motion: Reduced' : '⚡ Motion: Smooth'}
          </button>
        </div>

        <div className="motion-preview__phase-meta">
          <span className="motion-preview__phase-tag">
            {currentPhase?.name ?? 'Ready'}
          </span>
          <span>{currentPhase?.description}</span>
        </div>
      </div>
    </div>
  );
}
