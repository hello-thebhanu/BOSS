import * as THREE from 'three';

interface NeuralPillarConfig {
  x: number;
  z: number;
  height: number;
  color: number;
  radius: number;
}

const PILLAR_CONFIGS: NeuralPillarConfig[] = [
  { x: -0.44, z: -0.10, height: 0.40, color: 0x00f0ff, radius: 0.038 }, // Pillar 1: Cyan
  { x: -0.26, z: +0.08, height: 0.76, color: 0xb58eff, radius: 0.040 }, // Pillar 2: Lavender
  { x: -0.09, z: -0.05, height: 1.20, color: 0x00f0ff, radius: 0.042 }, // Pillar 3: Hero Cyan
  { x: +0.09, z: +0.06, height: 0.98, color: 0xc49eff, radius: 0.042 }, // Pillar 4: Hero Lavender
  { x: +0.26, z: -0.08, height: 0.68, color: 0x00f0ff, radius: 0.040 }, // Pillar 5: Cyan
  { x: +0.44, z: +0.06, height: 0.36, color: 0xb58eff, radius: 0.038 }, // Pillar 6: Lavender
];

export class BossCoreVisual3D {
  public readonly group: THREE.Group;

  // Central Hero Components
  private centralGroup: THREE.Group;

  // 1. Radiant Crystalline Nucleus & Dynamic Point Light
  private nucleusMesh: THREE.Mesh;
  private nucleusMaterial: THREE.MeshStandardMaterial;
  private internalPointLight: THREE.PointLight;

  // 2. Sculpted 3D Neural Pillars (Substantial volume with depth arc)
  private pillarsGroup: THREE.Group;
  private pillarCoreMeshes: THREE.Mesh[] = [];
  private pillarCoreMaterials: THREE.MeshStandardMaterial[] = [];
  private pillarSleeveMeshes: THREE.Mesh[] = [];
  private pillarSleeveMaterials: THREE.MeshPhysicalMaterial[] = [];

  // 3. Thick Optical Glass Sphere (The Hero Physical Shell)
  private glassSphereMesh: THREE.Mesh;
  private glassMaterial: THREE.MeshPhysicalMaterial;

  // 4. Delicate, Subdued 3D Orbital Rings (Close-wrapping, ultra-thin precision tracks)
  private orbitalGroup: THREE.Group;
  private orbit1Mesh: THREE.Mesh;
  private orbit1Material: THREE.MeshStandardMaterial;
  private orbit2Mesh: THREE.Mesh;
  private orbit2Material: THREE.MeshStandardMaterial;

  private node1Mesh: THREE.Mesh;
  private node1Material: THREE.MeshStandardMaterial;
  private node2Mesh: THREE.Mesh;
  private node2Material: THREE.MeshStandardMaterial;

  // Orbit parameters (closely hugging the 1.12 core)
  private orbit1Radius = 1.44;
  private orbit1Euler = new THREE.Euler(THREE.MathUtils.degToRad(58), 0, THREE.MathUtils.degToRad(-26));

  private orbit2Radius = 1.50;
  private orbit2Euler = new THREE.Euler(
    THREE.MathUtils.degToRad(-52),
    THREE.MathUtils.degToRad(20),
    THREE.MathUtils.degToRad(49)
  );

  private disposables: Array<{ dispose: () => void }> = [];

  constructor(envTexture: THREE.Texture | null = null) {
    this.group = new THREE.Group();
    this.centralGroup = new THREE.Group();
    this.group.add(this.centralGroup);

    // ========================================================================
    // 1. RADIANT 3D NUCLEUS & INTERNAL POINT LIGHT
    // ========================================================================
    const nucleusGeo = new THREE.IcosahedronGeometry(0.18, 1);
    this.disposables.push(nucleusGeo);
    this.nucleusMaterial = new THREE.MeshStandardMaterial({
      color: 0x00ffff,
      emissive: new THREE.Color(0x00f0ff),
      emissiveIntensity: 0.0,
      metalness: 0.3,
      roughness: 0.1,
      envMap: envTexture,
    });
    this.disposables.push(this.nucleusMaterial);
    this.nucleusMesh = new THREE.Mesh(nucleusGeo, this.nucleusMaterial);
    this.centralGroup.add(this.nucleusMesh);

    // Internal light source illuminating neural columns and glass from within
    this.internalPointLight = new THREE.PointLight(0x00f0ff, 0.0, 7.0, 2.0);
    this.internalPointLight.position.set(0, 0, 0);
    this.centralGroup.add(this.internalPointLight);

    // ========================================================================
    // 2. SCULPTED 3D NEURAL PILLARS (Substantial volume, rounded capsules)
    // ========================================================================
    this.pillarsGroup = new THREE.Group();
    this.centralGroup.add(this.pillarsGroup);

    PILLAR_CONFIGS.forEach((cfg) => {
      // Solid emissive core capsule
      const coreGeo = new THREE.CapsuleGeometry(cfg.radius, cfg.height, 16, 24);
      this.disposables.push(coreGeo);
      const coreMat = new THREE.MeshStandardMaterial({
        color: cfg.color,
        emissive: new THREE.Color(cfg.color),
        emissiveIntensity: 0.0,
        metalness: 0.3,
        roughness: 0.12,
        transparent: true,
        opacity: 0.0,
        envMap: envTexture,
      });
      this.disposables.push(coreMat);
      const coreMesh = new THREE.Mesh(coreGeo, coreMat);
      coreMesh.position.set(cfg.x, 0, cfg.z);

      this.pillarCoreMeshes.push(coreMesh);
      this.pillarCoreMaterials.push(coreMat);
      this.pillarsGroup.add(coreMesh);

      // Outer optical crystal sleeve
      const sleeveGeo = new THREE.CapsuleGeometry(
        cfg.radius * 1.35,
        cfg.height * 1.02,
        16,
        24
      );
      this.disposables.push(sleeveGeo);
      const sleeveMat = new THREE.MeshPhysicalMaterial({
        color: new THREE.Color(0x081c30),
        transmission: 0.9,
        thickness: 0.8,
        roughness: 0.05,
        ior: 1.48,
        transparent: true,
        opacity: 0.0,
        envMap: envTexture,
      });
      this.disposables.push(sleeveMat);
      const sleeveMesh = new THREE.Mesh(sleeveGeo, sleeveMat);
      sleeveMesh.position.set(cfg.x, 0, cfg.z);

      this.pillarSleeveMeshes.push(sleeveMesh);
      this.pillarSleeveMaterials.push(sleeveMat);
      this.pillarsGroup.add(sleeveMesh);
    });

    // ========================================================================
    // 3. THICK OPTICAL GLASS SPHERE (Hero Physical Presence)
    // ========================================================================
    const glassGeo = new THREE.SphereGeometry(1.12, 64, 64);
    this.disposables.push(glassGeo);
    this.glassMaterial = new THREE.MeshPhysicalMaterial({
      color: new THREE.Color(0x06182c),
      emissive: new THREE.Color(0x010812),
      roughness: 0.03,
      metalness: 0.05,
      transmission: 0.94,
      thickness: 2.2,
      ior: 1.54,
      clearcoat: 1.0,
      clearcoatRoughness: 0.02,
      specularIntensity: 1.0,
      specularColor: new THREE.Color(0xffffff),
      reflectivity: 0.9,
      attenuationColor: new THREE.Color(0x00d9ff),
      attenuationDistance: 1.8,
      transparent: true,
      opacity: 0.0,
      depthWrite: false,
      envMap: envTexture,
    });
    this.disposables.push(this.glassMaterial);
    this.glassSphereMesh = new THREE.Mesh(glassGeo, this.glassMaterial);
    this.centralGroup.add(this.glassSphereMesh);

    // ========================================================================
    // 4. RESTRAINED, DELICATE 3D ORBITAL SYSTEM (Whisper-thin laser tracks)
    // ========================================================================
    this.orbitalGroup = new THREE.Group();
    this.group.add(this.orbitalGroup);

    // Orbit 1: Delicate foreground plane track
    const orbit1Geo = new THREE.TorusGeometry(this.orbit1Radius, 0.0035, 12, 128);
    this.disposables.push(orbit1Geo);
    this.orbit1Material = new THREE.MeshStandardMaterial({
      color: 0x00e5ff,
      emissive: new THREE.Color(0x00e5ff),
      emissiveIntensity: 0.5,
      metalness: 0.9,
      roughness: 0.2,
      transparent: true,
      opacity: 0.0,
      envMap: envTexture,
    });
    this.disposables.push(this.orbit1Material);
    this.orbit1Mesh = new THREE.Mesh(orbit1Geo, this.orbit1Material);
    this.orbit1Mesh.rotation.copy(this.orbit1Euler);
    this.orbitalGroup.add(this.orbit1Mesh);

    // Orbit 2: Delicate transverse plane track
    const orbit2Geo = new THREE.TorusGeometry(this.orbit2Radius, 0.0035, 12, 128);
    this.disposables.push(orbit2Geo);
    this.orbit2Material = new THREE.MeshStandardMaterial({
      color: 0x9d71ff,
      emissive: new THREE.Color(0x9d71ff),
      emissiveIntensity: 0.5,
      metalness: 0.9,
      roughness: 0.2,
      transparent: true,
      opacity: 0.0,
      envMap: envTexture,
    });
    this.disposables.push(this.orbit2Material);
    this.orbit2Mesh = new THREE.Mesh(orbit2Geo, this.orbit2Material);
    this.orbit2Mesh.rotation.copy(this.orbit2Euler);
    this.orbitalGroup.add(this.orbit2Mesh);

    // Luminous Micro-Nodes (Satellite energy beads)
    const nodeGeo = new THREE.SphereGeometry(0.026, 16, 16);
    this.disposables.push(nodeGeo);

    // Node 1 (Cyan)
    this.node1Material = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      emissive: new THREE.Color(0x00ffff),
      emissiveIntensity: 0.0,
      metalness: 0.5,
      roughness: 0.1,
      transparent: true,
      opacity: 0.0,
    });
    this.disposables.push(this.node1Material);
    this.node1Mesh = new THREE.Mesh(nodeGeo, this.node1Material);
    this.orbitalGroup.add(this.node1Mesh);

    // Node 2 (Violet)
    this.node2Material = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      emissive: new THREE.Color(0xcfa4ff),
      emissiveIntensity: 0.0,
      metalness: 0.5,
      roughness: 0.1,
      transparent: true,
      opacity: 0.0,
    });
    this.disposables.push(this.node2Material);
    this.node2Mesh = new THREE.Mesh(nodeGeo, this.node2Material);
    this.orbitalGroup.add(this.node2Mesh);
  }

  /**
   * Phase B: First Internal Energy awakening.
   * Central nucleus ignites and PointLight radiates from the interior outward.
   */
  public setFirstEnergy(intensity: number, breathScale: number): void {
    this.nucleusMaterial.emissiveIntensity = intensity * 3.5;
    this.nucleusMesh.scale.setScalar(breathScale);

    // Dynamic internal light floods through the interior
    this.internalPointLight.intensity = intensity * 4.2;

    // Curved glass catches soft internal specular light
    this.glassMaterial.opacity = intensity * 0.35;
  }

  /**
   * Phase C: Glass Core & 3D Neural Pillars reveal.
   */
  public setCoreReveal(revealFactor: number, breathingIntensity: number): void {
    // Optical glass reaches full transmission and gloss
    this.glassMaterial.opacity = Math.max(this.glassMaterial.opacity, revealFactor * 0.98);

    // 3D Neural Pillars ignite with power and brilliance
    this.pillarCoreMaterials.forEach((mat, idx) => {
      const stagger = (idx / this.pillarCoreMaterials.length) * 0.22;
      const f = Math.max(0, Math.min(1, (revealFactor - stagger) / 0.78));
      mat.opacity = f;
      mat.emissiveIntensity = f * (2.0 + breathingIntensity * 1.2);
    });

    this.pillarSleeveMaterials.forEach((mat, idx) => {
      const stagger = (idx / this.pillarSleeveMaterials.length) * 0.22;
      const f = Math.max(0, Math.min(1, (revealFactor - stagger) / 0.78));
      mat.opacity = f * 0.85;
    });

    // Expand internal light to full radiance
    if (revealFactor > 0.05) {
      this.internalPointLight.intensity = 3.5 + revealFactor * 2.0;
    }
  }

  /**
   * Phase D: Delicate 3D Orbital system activation.
   */
  public setOrbitalActivation(activationFactor: number): void {
    // Subdued, elegant opacity (never overpowering the Core)
    this.orbit1Material.opacity = activationFactor * 0.45;
    this.orbit1Material.emissiveIntensity = activationFactor * 0.8;

    this.orbit2Material.opacity = activationFactor * 0.45;
    this.orbit2Material.emissiveIntensity = activationFactor * 0.8;

    this.node1Material.opacity = activationFactor * 0.95;
    this.node1Material.emissiveIntensity = activationFactor * 2.5;

    this.node2Material.opacity = activationFactor * 0.95;
    this.node2Material.emissiveIntensity = activationFactor * 2.5;
  }

  /**
   * Updates dynamic 3D rotations, neural pillar micro-breathing, and orbital node precession.
   */
  public updateDynamics(time: number, isOrbitalActive: boolean): void {
    // Subtle organic breathing on neural pillars
    for (let i = 0; i < this.pillarCoreMeshes.length; i++) {
      const freq = 1.4 + i * 0.25;
      const scaleY = 1.0 + Math.sin(time * freq) * 0.04;
      this.pillarCoreMeshes[i].scale.set(1.0, scaleY, 1.0);
      this.pillarSleeveMeshes[i].scale.set(1.0, scaleY, 1.0);
    }

    // Slow organic precession of central assembly
    this.centralGroup.rotation.y = Math.sin(time * 0.15) * 0.05;
    this.centralGroup.rotation.x = Math.cos(time * 0.12) * 0.03;

    if (isOrbitalActive) {
      // Smooth differential orbital plane rotations
      this.orbit1Mesh.rotation.z = THREE.MathUtils.degToRad(-26) + time * 0.12;
      this.orbit2Mesh.rotation.z = THREE.MathUtils.degToRad(49) - time * 0.09;

      // Position Node 1 along Orbit 1 in true 3D
      const angle1 = time * 0.48;
      const pos1 = new THREE.Vector3(
        this.orbit1Radius * Math.cos(angle1),
        this.orbit1Radius * Math.sin(angle1),
        0
      ).applyEuler(this.orbit1Mesh.rotation);
      this.node1Mesh.position.copy(pos1);

      // Position Node 2 along Orbit 2 in true 3D
      const angle2 = -time * 0.40 + Math.PI;
      const pos2 = new THREE.Vector3(
        this.orbit2Radius * Math.cos(angle2),
        this.orbit2Radius * Math.sin(angle2),
        0
      ).applyEuler(this.orbit2Mesh.rotation);
      this.node2Mesh.position.copy(pos2);
    }
  }

  public reset(): void {
    this.nucleusMaterial.emissiveIntensity = 0;
    this.nucleusMesh.scale.setScalar(1);
    this.internalPointLight.intensity = 0;

    this.glassMaterial.opacity = 0;

    this.pillarCoreMaterials.forEach((m) => {
      m.opacity = 0;
      m.emissiveIntensity = 0;
    });
    this.pillarSleeveMaterials.forEach((m) => (m.opacity = 0));

    this.orbit1Material.opacity = 0;
    this.orbit2Material.opacity = 0;
    this.node1Material.opacity = 0;
    this.node2Material.opacity = 0;

    this.centralGroup.rotation.set(0, 0, 0);
    this.orbit1Mesh.rotation.copy(this.orbit1Euler);
    this.orbit2Mesh.rotation.copy(this.orbit2Euler);
  }

  public dispose(): void {
    this.disposables.forEach((item) => {
      try {
        item.dispose();
      } catch (err) {
        console.error('Error disposing Three.js resource:', err);
      }
    });
    this.pillarCoreMeshes = [];
    this.pillarCoreMaterials = [];
    this.pillarSleeveMeshes = [];
    this.pillarSleeveMaterials = [];
    this.disposables = [];
  }
}
