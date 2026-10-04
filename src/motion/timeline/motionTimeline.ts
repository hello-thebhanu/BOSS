import { PhaseInfo, TimelineController, TimelineState } from '../engine/motionEngineTypes';

export function clamp(val: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, val));
}

export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * clamp(t, 0, 1);
}

export function smoothstep(min: number, max: number, value: number): number {
  const x = clamp((value - min) / (max - min), 0, 1);
  return x * x * (3 - 2 * x);
}

export function easeInOutCubic(x: number): number {
  const t = clamp(x, 0, 1);
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

export class MotionTimeline implements TimelineController {
  private duration: number;
  private phases: readonly PhaseInfo[];
  private currentTime: number = 0;
  private isPlaying: boolean = false;
  private subscribers: Set<(state: TimelineState) => void> = new Set();
  private rafId: number | null = null;
  private lastTimestamp: number | null = null;
  private onTickCallback?: (time: number, delta: number) => void;

  constructor(
    duration: number,
    phases: readonly PhaseInfo[],
    onTick?: (time: number, delta: number) => void
  ) {
    this.duration = Math.max(0.1, duration);
    this.phases = phases;
    this.onTickCallback = onTick;
  }

  public setTickCallback(onTick: (time: number, delta: number) => void): void {
    this.onTickCallback = onTick;
  }

  public getCurrentPhase(): PhaseInfo {
    const t = this.currentTime;
    let bestMatch: PhaseInfo | null = null;
    let minDuration = Infinity;

    for (const phase of this.phases) {
      if (t >= phase.startTime && t <= phase.endTime) {
        const dur = phase.endTime - phase.startTime;
        if (dur < minDuration) {
          minDuration = dur;
          bestMatch = phase;
        }
      }
    }

    if (bestMatch) {
      return bestMatch;
    }

    // Fallback to last phase if at or past end, or first if before start
    if (t >= this.duration && this.phases.length > 0) {
      return this.phases[this.phases.length - 1];
    }
    return this.phases[0] ?? {
      id: 'PHASE_A_DARKNESS',
      name: 'Darkness',
      startTime: 0,
      endTime: 1.5,
      description: 'Atmospheric darkness'
    };
  }

  public getState(): TimelineState {
    return {
      currentTime: this.currentTime,
      duration: this.duration,
      progress: clamp(this.currentTime / this.duration, 0, 1),
      isPlaying: this.isPlaying,
      isComplete: this.currentTime >= this.duration,
      currentPhase: this.getCurrentPhase(),
    };
  }

  public play(): void {
    if (this.isPlaying) return;
    if (this.currentTime >= this.duration) {
      this.currentTime = 0;
    }
    this.isPlaying = true;
    this.lastTimestamp = null;
    this.startLoop();
    this.notify();
  }

  public pause(): void {
    if (!this.isPlaying) return;
    this.isPlaying = false;
    this.stopLoop();
    this.notify();
  }

  public seek(timeInSeconds: number): void {
    const prev = this.currentTime;
    this.currentTime = clamp(timeInSeconds, 0, this.duration);
    const delta = this.currentTime - prev;
    if (this.onTickCallback) {
      this.onTickCallback(this.currentTime, delta);
    }
    this.notify();
  }

  public reset(): void {
    this.pause();
    this.seek(0);
  }

  public replay(): void {
    this.pause();
    this.currentTime = 0;
    if (this.onTickCallback) {
      this.onTickCallback(0, 0);
    }
    this.play();
  }

  public subscribe(callback: (state: TimelineState) => void): () => void {
    this.subscribers.add(callback);
    callback(this.getState());
    return () => {
      this.subscribers.delete(callback);
    };
  }

  public destroy(): void {
    this.stopLoop();
    this.subscribers.clear();
    this.onTickCallback = undefined;
  }

  private startLoop(): void {
    if (this.rafId !== null) return;
    const loop = (timestamp: number) => {
      if (!this.isPlaying) {
        this.rafId = null;
        return;
      }
      if (this.lastTimestamp === null) {
        this.lastTimestamp = timestamp;
      }
      // Limit delta to avoid huge jumps if tab was backgrounded (max 100ms)
      const rawDelta = (timestamp - this.lastTimestamp) / 1000;
      const delta = Math.min(rawDelta, 0.1);
      this.lastTimestamp = timestamp;

      this.currentTime += delta;
      if (this.currentTime >= this.duration) {
        this.currentTime = this.duration;
        this.isPlaying = false;
        if (this.onTickCallback) {
          this.onTickCallback(this.currentTime, delta);
        }
        this.notify();
        this.rafId = null;
        return;
      }

      if (this.onTickCallback) {
        this.onTickCallback(this.currentTime, delta);
      }
      this.notify();

      this.rafId = requestAnimationFrame(loop);
    };

    this.rafId = requestAnimationFrame(loop);
  }

  private stopLoop(): void {
    if (this.rafId !== null) {
      cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }
    this.lastTimestamp = null;
  }

  private notify(): void {
    const state = this.getState();
    this.subscribers.forEach((cb) => {
      try {
        cb(state);
      } catch (err) {
        console.error('Error in timeline subscriber callback:', err);
      }
    });
  }
}
