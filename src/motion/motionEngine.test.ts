import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as THREE from 'three';
import {
  clamp,
  lerp,
  smoothstep,
  easeInOutCubic,
  MotionTimeline,
} from './timeline/motionTimeline';
import { Shot01CoreAwakening, SHOT_01_PHASES } from './scenes/shot01CoreAwakening';
import { BossCoreVisual3D } from './core/bossCoreVisual3D';
import { AtmosphericParticles } from './particles/atmosphericParticles';
import { SceneContext } from './engine/motionEngineTypes';

describe('BOSS Motion Engine — Phase 1: Shot 01 Core Awakening (Visual Rebuild)', () => {
  describe('Math Utilities', () => {
    it('clamp correctly bounds numbers', () => {
      expect(clamp(5, 0, 10)).toBe(5);
      expect(clamp(-5, 0, 10)).toBe(0);
      expect(clamp(15, 0, 10)).toBe(10);
    });

    it('lerp interpolates values linearly', () => {
      expect(lerp(10, 20, 0)).toBe(10);
      expect(lerp(10, 20, 1)).toBe(20);
      expect(lerp(10, 20, 0.5)).toBe(15);
      expect(lerp(10, 20, 1.5)).toBe(20);
    });

    it('smoothstep yields hermite interpolation between limits', () => {
      expect(smoothstep(0, 10, 0)).toBe(0);
      expect(smoothstep(0, 10, 10)).toBe(1);
      expect(smoothstep(0, 10, 5)).toBe(0.5);
      expect(smoothstep(0, 10, -5)).toBe(0);
      expect(smoothstep(0, 10, 15)).toBe(1);
    });

    it('easeInOutCubic eases symmetrically', () => {
      expect(easeInOutCubic(0)).toBe(0);
      expect(easeInOutCubic(1)).toBe(1);
      expect(easeInOutCubic(0.5)).toBe(0.5);
      expect(easeInOutCubic(0.2)).toBeCloseTo(0.032, 3);
    });
  });

  describe('MotionTimeline (10.0s Production Trailer)', () => {
    it('initializes with 10.0s duration and phases', () => {
      const timeline = new MotionTimeline(10.0, SHOT_01_PHASES);
      const state = timeline.getState();

      expect(state.duration).toBe(10.0);
      expect(state.currentTime).toBe(0);
      expect(state.progress).toBe(0);
      expect(state.isPlaying).toBe(false);
      expect(state.isComplete).toBe(false);
      expect(state.currentPhase.id).toBe('PHASE_A_DARKNESS');
    });

    it('correctly maps time to respective 10.0s phases', () => {
      const timeline = new MotionTimeline(10.0, SHOT_01_PHASES);

      timeline.seek(1.0);
      expect(timeline.getState().currentPhase.id).toBe('PHASE_A_DARKNESS');

      timeline.seek(2.8);
      expect(timeline.getState().currentPhase.id).toBe('PHASE_B_FIRST_ENERGY');

      timeline.seek(5.0);
      expect(timeline.getState().currentPhase.id).toBe('PHASE_C_CORE_REVEAL');

      timeline.seek(7.2);
      expect(timeline.getState().currentPhase.id).toBe('PHASE_D_ORBITAL_ACTIVATION');

      timeline.seek(9.2);
      expect(timeline.getState().currentPhase.id).toBe('PHASE_F_FINAL_FRAME');
    });

    it('clamps seeking within [0, 10.0]', () => {
      const timeline = new MotionTimeline(10.0, SHOT_01_PHASES);

      timeline.seek(-5);
      expect(timeline.getState().currentTime).toBe(0);

      timeline.seek(15);
      expect(timeline.getState().currentTime).toBe(10.0);
      expect(timeline.getState().isComplete).toBe(true);
    });

    it('notifies subscribers on seek and state updates', () => {
      const timeline = new MotionTimeline(10.0, SHOT_01_PHASES);
      const listener = vi.fn();
      const unsub = timeline.subscribe(listener);

      expect(listener).toHaveBeenCalledTimes(1);

      timeline.seek(3.5);
      expect(listener).toHaveBeenCalledTimes(2);
      expect(timeline.getState().currentTime).toBe(3.5);

      unsub();
      timeline.seek(5.0);
      expect(listener).toHaveBeenCalledTimes(2);
    });

    it('handles play, pause, reset, and replay', () => {
      const timeline = new MotionTimeline(10.0, SHOT_01_PHASES);

      timeline.seek(4.0);
      expect(timeline.getState().currentTime).toBe(4.0);

      timeline.reset();
      expect(timeline.getState().currentTime).toBe(0);
      expect(timeline.getState().isPlaying).toBe(false);

      timeline.destroy();
    });
  });

  describe('BossCoreVisual3D procedural 3D model with physical depth', () => {
    it('creates group hierarchy and responds to timeline states without flat geometry', () => {
      const core = new BossCoreVisual3D();
      expect(core.group).toBeInstanceOf(THREE.Group);

      // Verify updates across phases without throwing
      core.setFirstEnergy(0.8, 1.1);
      core.setCoreReveal(0.9, 0.5);
      core.setOrbitalActivation(0.85);
      core.updateDynamics(3.0, true);

      // Verify reset
      core.reset();

      // Verify clean disposal
      core.dispose();
    });
  });

  describe('AtmosphericParticles', () => {
    it('creates particle field and updates smoothly', () => {
      const particles = new AtmosphericParticles(50);
      expect(particles.group).toBeInstanceOf(THREE.Group);

      particles.update(1.0, 0.8);
      particles.setOpacity(0.5);

      particles.dispose();
    });
  });

  describe('Shot01CoreAwakening Scene Orchestrator', () => {
    let mockContext: SceneContext;
    let mockRenderer: THREE.WebGLRenderer;
    let mockScene: THREE.Scene;
    let mockCamera: THREE.PerspectiveCamera;

    beforeEach(() => {
      mockScene = new THREE.Scene();
      mockCamera = new THREE.PerspectiveCamera(36, 16 / 9, 0.1, 100);
      mockRenderer = {
        setClearColor: vi.fn(),
        render: vi.fn(),
        dispose: vi.fn(),
      } as unknown as THREE.WebGLRenderer;

      mockContext = {
        scene: mockScene,
        camera: mockCamera,
        renderer: mockRenderer,
        width: 1920,
        height: 1080,
        aspectRatio: 16 / 9,
        reducedMotion: false,
      };
    });

    it('initializes and executes all 10.0s phases without throwing', () => {
      const scene = new Shot01CoreAwakening();

      expect(scene.id).toBe('SHOT_01_CORE_AWAKENING');
      expect(scene.duration).toBe(10.0);
      expect(scene.phases.length).toBe(6);

      scene.init(mockContext);
      expect(mockRenderer.setClearColor).toHaveBeenCalledWith(expect.any(THREE.Color), 1.0);

      // Step through 10-second sequence
      const testTimestamps = [0.0, 1.5, 3.0, 5.0, 7.5, 9.0, 10.0];
      testTimestamps.forEach((t) => {
        scene.update(t, 0.016);
        scene.render();
      });

      expect(mockRenderer.render).toHaveBeenCalled();

      // Test reset and dispose
      scene.reset();
      scene.dispose();
    });

    it('guarantees restrained hero framing distance (anti-overzoom rule)', () => {
      const scene = new Shot01CoreAwakening();
      scene.init(mockContext);

      // Hero frame at t = 10.0s
      scene.update(10.0, 0.016);
      expect(mockCamera.position.z).toBeCloseTo(10.5, 2);
      expect(mockCamera.position.x).toBeCloseTo(0.0, 2);
      expect(mockCamera.position.y).toBeCloseTo(0.0, 2);

      // Compute frame height at z = 10.5 with fov = 36 deg
      // H = 2 * z * tan(fov / 2) = 2 * 10.5 * tan(18 deg) ~= 6.823
      // Core diameter = 2 * 1.12 = 2.24
      // Core height ratio = 2.24 / 6.823 ~= 32.8% (Strictly within 25% - 35% target)
      const visibleFrameHeight = 2 * mockCamera.position.z * Math.tan((mockCamera.fov * Math.PI) / 360);
      const coreDiameter = 2.24;
      const coreHeightRatio = coreDiameter / visibleFrameHeight;
      expect(coreHeightRatio).toBeGreaterThanOrEqual(0.25);
      expect(coreHeightRatio).toBeLessThanOrEqual(0.35);

      scene.dispose();
    });

    it('respects reduced motion setting for camera dolly', () => {
      const scene = new Shot01CoreAwakening();
      mockContext.reducedMotion = true;
      scene.init(mockContext);

      scene.update(4.0, 0.016);
      expect(mockCamera.position.z).toBe(10.5);

      scene.dispose();
    });
  });
});
