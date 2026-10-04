import * as THREE from 'three';

export type ShotPhase =
  | 'PHASE_A_DARKNESS'
  | 'PHASE_B_FIRST_ENERGY'
  | 'PHASE_C_CORE_REVEAL'
  | 'PHASE_D_ORBITAL_ACTIVATION'
  | 'PHASE_E_CAMERA_PUSH'
  | 'PHASE_F_FINAL_FRAME'
  | 'SCENE_COMPLETE';

export interface PhaseInfo {
  id: ShotPhase;
  name: string;
  startTime: number;
  endTime: number;
  description: string;
}

export interface TimelineState {
  currentTime: number;
  duration: number;
  progress: number; // 0.0 to 1.0
  isPlaying: boolean;
  isComplete: boolean;
  currentPhase: PhaseInfo;
}

export interface SceneContext {
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  renderer: THREE.WebGLRenderer;
  width: number;
  height: number;
  aspectRatio: number;
  reducedMotion: boolean;
}

export interface MotionScene {
  readonly id: string;
  readonly name: string;
  readonly duration: number;
  readonly phases: readonly PhaseInfo[];

  init(context: SceneContext): void;
  update(time: number, delta: number): void;
  render(): void;
  reset(): void;
  dispose(): void;
}

export interface TimelineController {
  getState(): TimelineState;
  play(): void;
  pause(): void;
  seek(timeInSeconds: number): void;
  reset(): void;
  replay(): void;
  subscribe(callback: (state: TimelineState) => void): () => void;
  destroy(): void;
}

export interface MotionEngineOptions {
  canvas: HTMLCanvasElement;
  scene: MotionScene;
  reducedMotion?: boolean;
  onStateChange?: (state: TimelineState) => void;
}
