import * as THREE from 'three';
import {
  MotionEngineOptions,
  MotionScene,
  SceneContext,
  TimelineController,
  TimelineState,
} from './motionEngineTypes';
import { MotionTimeline } from '../timeline/motionTimeline';

export class BossMotionEngine implements TimelineController {
  private canvas: HTMLCanvasElement;
  private scene: MotionScene;
  private reducedMotion: boolean;
  private onStateChange?: (state: TimelineState) => void;

  private threeScene: THREE.Scene;
  private camera: THREE.PerspectiveCamera;
  private renderer: THREE.WebGLRenderer;
  private timeline: MotionTimeline;
  private resizeObserver: ResizeObserver | null = null;
  private isDestroyed = false;

  constructor(options: MotionEngineOptions) {
    this.canvas = options.canvas;
    this.scene = options.scene;
    this.reducedMotion = Boolean(options.reducedMotion);
    this.onStateChange = options.onStateChange;

    // 1. Three.js Scene & Camera
    this.threeScene = new THREE.Scene();
    const aspect = this.canvas.clientWidth > 0 && this.canvas.clientHeight > 0
      ? this.canvas.clientWidth / this.canvas.clientHeight
      : 16 / 9;
    this.camera = new THREE.PerspectiveCamera(36, aspect, 0.1, 100);

    // 2. WebGL Renderer
    this.renderer = new THREE.WebGLRenderer({
      canvas: this.canvas,
      antialias: true,
      alpha: false,
      powerPreference: 'high-performance',
    });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.1;

    // Initial size
    this.updateDimensions();

    // 3. Initialize scene with context
    const context: SceneContext = {
      scene: this.threeScene,
      camera: this.camera,
      renderer: this.renderer,
      width: this.canvas.clientWidth,
      height: this.canvas.clientHeight,
      aspectRatio: aspect,
      reducedMotion: this.reducedMotion,
    };
    this.scene.init(context);

    // 4. Timeline
    this.timeline = new MotionTimeline(
      this.scene.duration,
      this.scene.phases,
      (time, delta) => {
        if (this.isDestroyed) return;
        this.scene.update(time, delta);
        this.scene.render();
      }
    );

    if (this.onStateChange) {
      this.timeline.subscribe(this.onStateChange);
    }

    // 5. Setup resize listener
    this.setupResizeObserver();

    // Initial render
    this.scene.update(0, 0);
    this.scene.render();
  }

  public updateDimensions(): void {
    if (this.isDestroyed) return;
    const width = this.canvas.clientWidth || 800;
    const height = this.canvas.clientHeight || 450;

    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();

    this.renderer.setSize(width, height, false);
  }

  private setupResizeObserver(): void {
    if (typeof ResizeObserver !== 'undefined' && this.canvas.parentElement) {
      this.resizeObserver = new ResizeObserver(() => {
        this.updateDimensions();
        this.scene.render();
      });
      this.resizeObserver.observe(this.canvas.parentElement);
    }
  }

  public getState(): TimelineState {
    return this.timeline.getState();
  }

  public play(): void {
    if (this.isDestroyed) return;
    this.timeline.play();
  }

  public pause(): void {
    if (this.isDestroyed) return;
    this.timeline.pause();
  }

  public seek(timeInSeconds: number): void {
    if (this.isDestroyed) return;
    this.timeline.seek(timeInSeconds);
    this.scene.render();
  }

  public reset(): void {
    if (this.isDestroyed) return;
    this.timeline.reset();
    this.scene.reset();
    this.scene.render();
  }

  public replay(): void {
    if (this.isDestroyed) return;
    this.scene.reset();
    this.timeline.replay();
  }

  public subscribe(callback: (state: TimelineState) => void): () => void {
    return this.timeline.subscribe(callback);
  }

  public setReducedMotion(reduced: boolean): void {
    this.reducedMotion = reduced;
  }

  public destroy(): void {
    if (this.isDestroyed) return;
    this.isDestroyed = true;

    if (this.resizeObserver) {
      this.resizeObserver.disconnect();
      this.resizeObserver = null;
    }

    this.timeline.destroy();
    this.scene.dispose();

    this.renderer.dispose();
    this.renderer.forceContextLoss();
  }
}
