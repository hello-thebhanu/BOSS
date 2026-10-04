import * as THREE from 'three';
import { MotionScene, PhaseInfo, SceneContext } from '../engine/motionEngineTypes';
import { smoothstep, easeInOutCubic } from '../timeline/motionTimeline';
import { BossCoreVisual3D } from '../core/bossCoreVisual3D';
import { AtmosphericParticles } from '../particles/atmosphericParticles';
import { createStudioEnvironmentTexture } from '../core/environmentMapGenerator';

export const SHOT_01_PHASES: readonly PhaseInfo[] = [
  {
    id: 'PHASE_A_DARKNESS',
    name: 'Phase A — Darkness',
    startTime: 0.0,
    endTime: 2.0,
    description: 'Deep obsidian atmosphere with subtle floating micro-particles.',
  },
  {
    id: 'PHASE_B_FIRST_ENERGY',
    name: 'Phase B — First Internal Energy',
    startTime: 2.0,
    endTime: 4.2,
    description: 'Central crystalline nucleus awakens, casting radiant internal light.',
  },
  {
    id: 'PHASE_C_CORE_REVEAL',
    name: 'Phase C — Glass Core Reveal',
    startTime: 4.2,
    endTime: 6.8,
    description: 'Optical glass sphere and 3D neural array ignite with physical presence.',
  },
  {
    id: 'PHASE_D_ORBITAL_ACTIVATION',
    name: 'Phase D — Orbital Activation',
    startTime: 6.8,
    endTime: 8.6,
    description: 'Delicate orbital tracks activate with subdued metallic reflection and orbital node travel.',
  },
  {
    id: 'PHASE_E_CAMERA_PUSH',
    name: 'Phase E — Cinematic Camera',
    startTime: 0.0,
    endTime: 8.8,
    description: 'Smooth cinematic dolly from low perspective with rich spatial parallax.',
  },
  {
    id: 'PHASE_F_FINAL_FRAME',
    name: 'Phase F — Final Hero Frame',
    startTime: 8.6,
    endTime: 10.0,
    description: 'Fully illuminated BOSS Core as the dominant hero centerpiece.',
  },
];

export class Shot01CoreAwakening implements MotionScene {
  public readonly id = 'SHOT_01_CORE_AWAKENING';
  public readonly name = 'Shot 01 — Core Awakening';
  public readonly duration = 10.0;
  public readonly phases = SHOT_01_PHASES;

  private context: SceneContext | null = null;
  private coreVisual: BossCoreVisual3D | null = null;
  private particles: AtmosphericParticles | null = null;
  private envTexture: THREE.Texture | null = null;

  // Cinematic studio lighting
  private ambientLight: THREE.AmbientLight | null = null;
  private keyLight: THREE.DirectionalLight | null = null;
  private rimLight: THREE.DirectionalLight | null = null;
  private fillLight: THREE.DirectionalLight | null = null;

  public init(context: SceneContext): void {
    this.context = context;
    const { scene, camera, renderer } = context;

    // 1. Deep obsidian space background
    const darkObsidian = new THREE.Color(0x020306);
    scene.background = darkObsidian;
    renderer.setClearColor(darkObsidian, 1.0);

    // 2. Procedural studio environment reflection map
    this.envTexture = createStudioEnvironmentTexture();
    if (this.envTexture) {
      scene.environment = this.envTexture;
    }

    // 3. Cinematic studio multi-light setup
    this.ambientLight = new THREE.AmbientLight(0x060f1c, 0.25);
    scene.add(this.ambientLight);

    // Key light: angled from front-left with high intensity for glass specular gloss
    this.keyLight = new THREE.DirectionalLight(0xe2f0ff, 2.8);
    this.keyLight.position.set(4.0, 5.0, 3.5);
    scene.add(this.keyLight);

    // Rim light: angled from rear-top-right (razor-sharp natural glass silhouette)
    this.rimLight = new THREE.DirectionalLight(0x00f0ff, 3.8);
    this.rimLight.position.set(-4.5, 3.5, -4.0);
    scene.add(this.rimLight);

    // Fill light: angled from low-left for chromatic shadow depth
    this.fillLight = new THREE.DirectionalLight(0x3d1d6e, 0.9);
    this.fillLight.position.set(-2.0, -3.0, 2.5);
    scene.add(this.fillLight);

    // 4. Subtle atmospheric micro-particles (restrained, deep background)
    this.particles = new AtmosphericParticles(120);
    scene.add(this.particles.group);

    // 5. Hero 3D BOSS Core assembly
    this.coreVisual = new BossCoreVisual3D(this.envTexture);
    scene.add(this.coreVisual.group);

    // 6. Camera setup (Initial distance for cinematic dolly)
    camera.fov = 36;
    camera.updateProjectionMatrix();
    camera.position.set(-0.35, -0.30, 14.5);
    camera.lookAt(0, 0, 0);

    this.update(0, 0);
  }

  public update(time: number, _delta: number): void {
    if (!this.context || !this.coreVisual || !this.particles) return;

    const { camera, reducedMotion } = this.context;

    // ----------------------------------------------------
    // PHASE A: Atmospheric micro-particles drift in 3D
    // ----------------------------------------------------
    const particleAlpha = smoothstep(0.0, 1.8, time);
    this.particles.update(time, particleAlpha * 0.4); // Subtle, restrained

    // ----------------------------------------------------
    // PHASE B (2.0s – 4.2s): First Internal Energy Awakening
    // ----------------------------------------------------
    let pulseIntensity = 0;
    let pulseScale = 1.0;
    if (time >= 1.8 && time < 4.4) {
      if (time < 3.2) {
        const t = smoothstep(1.8, 3.2, time);
        pulseIntensity = t;
        pulseScale = 0.9 + t * 0.2;
      } else {
        const t = smoothstep(3.2, 4.4, time);
        pulseIntensity = 1.0 - t * 0.3;
        pulseScale = 1.1 - t * 0.1;
      }
    } else if (time >= 4.4) {
      pulseIntensity = 0.7;
      pulseScale = 1.0;
    }
    this.coreVisual.setFirstEnergy(pulseIntensity, pulseScale);

    // ----------------------------------------------------
    // PHASE C (4.2s – 6.8s): Physical Glass & 3D Neural Reveal
    // ----------------------------------------------------
    const coreReveal = smoothstep(4.0, 6.6, time);
    const breathing = Math.sin(time * 2.2) * 0.5 + 0.5;
    this.coreVisual.setCoreReveal(coreReveal, breathing);

    // ----------------------------------------------------
    // PHASE D (6.8s – 8.6s): Delicate 3D Orbital Activation
    // ----------------------------------------------------
    const orbitalActivation = smoothstep(6.6, 8.4, time);
    this.coreVisual.setOrbitalActivation(orbitalActivation);

    // Dynamic rotation, pillar breathing, and node orbits
    const isOrbitalActive = time >= 6.4;
    this.coreVisual.updateDynamics(time, isOrbitalActive);

    // ----------------------------------------------------
    // PHASE E (0.0s – 8.8s): Cinematic Camera Dolly (Hero Framing: Core 32.8% Frame Height)
    // ----------------------------------------------------
    if (!reducedMotion) {
      const progress = easeInOutCubic(Math.min(1.0, time / 8.8));
      const camZ = 14.5 - progress * 4.0; // 14.5 down to 10.5 (restrained cinema dolly)
      const camY = -0.30 + progress * 0.30; // -0.30 up to 0.0
      const camX = -0.35 * (1.0 - progress); // -0.35 to 0.0

      camera.position.set(camX, camY, camZ);
      camera.lookAt(0, 0, 0);
    } else {
      camera.position.set(0, 0, 10.5);
      camera.lookAt(0, 0, 0);
    }

    // ----------------------------------------------------
    // Dynamic Studio Lighting Growth
    // ----------------------------------------------------
    if (this.ambientLight && this.keyLight && this.rimLight && this.fillLight) {
      const lightGrowth = smoothstep(2.5, 7.5, time);
      this.ambientLight.intensity = 0.2 + lightGrowth * 0.3;
      this.keyLight.intensity = 1.0 + lightGrowth * 1.8;
      this.rimLight.intensity = 1.5 + lightGrowth * 2.3;
      this.fillLight.intensity = 0.3 + lightGrowth * 0.6;
    }
  }

  public render(): void {
    if (!this.context) return;
    const { scene, camera, renderer } = contextOrContext(this.context);
    renderer.render(scene, camera);
  }

  public reset(): void {
    if (this.coreVisual) {
      this.coreVisual.reset();
    }
    if (this.particles) {
      this.particles.setOpacity(0);
    }
    this.update(0, 0);
  }

  public dispose(): void {
    if (this.coreVisual) {
      this.coreVisual.dispose();
      if (this.context) {
        this.context.scene.remove(this.coreVisual.group);
      }
      this.coreVisual = null;
    }

    if (this.particles) {
      this.particles.dispose();
      if (this.context) {
        this.context.scene.remove(this.particles.group);
      }
      this.particles = null;
    }

    if (this.envTexture) {
      this.envTexture.dispose();
      if (this.context) {
        this.context.scene.environment = null;
      }
      this.envTexture = null;
    }

    if (this.ambientLight && this.context) {
      this.context.scene.remove(this.ambientLight);
      this.ambientLight.dispose();
      this.ambientLight = null;
    }

    if (this.keyLight && this.context) {
      this.context.scene.remove(this.keyLight);
      this.keyLight.dispose();
      this.keyLight = null;
    }

    if (this.rimLight && this.context) {
      this.context.scene.remove(this.rimLight);
      this.rimLight.dispose();
      this.rimLight = null;
    }

    if (this.fillLight && this.context) {
      this.context.scene.remove(this.fillLight);
      this.fillLight.dispose();
      this.fillLight = null;
    }

    this.context = null;
  }
}

function contextOrContext(c: SceneContext): SceneContext {
  return c;
}
