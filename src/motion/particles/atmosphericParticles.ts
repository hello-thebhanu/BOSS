import * as THREE from 'three';

export class AtmosphericParticles {
  public readonly group: THREE.Group;
  private points: THREE.Points;
  private geometry: THREE.BufferGeometry;
  private material: THREE.PointsMaterial;
  private initialPositions: Float32Array;
  private particleCount: number;

  constructor(count = 150) {
    this.particleCount = count;
    this.group = new THREE.Group();

    const positions = new Float32Array(count * 3);
    this.initialPositions = new Float32Array(count * 3);

    for (let i = 0; i < count; i++) {
      const idx = i * 3;
      // Spread across a wide volume
      const x = (Math.random() - 0.5) * 14;
      const y = (Math.random() - 0.5) * 10;
      const z = (Math.random() - 0.5) * 10;

      positions[idx] = x;
      positions[idx + 1] = y;
      positions[idx + 2] = z;

      this.initialPositions[idx] = x;
      this.initialPositions[idx + 1] = y;
      this.initialPositions[idx + 2] = z;
    }

    this.geometry = new THREE.BufferGeometry();
    this.geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));

    // Create a subtle circular soft alpha texture programmatically if document is available
    let texture: THREE.Texture | undefined = undefined;
    if (typeof document !== 'undefined') {
      const canvas = document.createElement('canvas');
      canvas.width = 64;
      canvas.height = 64;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        const gradient = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
        gradient.addColorStop(0, 'rgba(180, 220, 255, 1.0)');
        gradient.addColorStop(0.3, 'rgba(120, 180, 240, 0.6)');
        gradient.addColorStop(0.7, 'rgba(80, 120, 200, 0.15)');
        gradient.addColorStop(1, 'rgba(0, 0, 0, 0)');
        ctx.fillStyle = gradient;
        ctx.fillRect(0, 0, 64, 64);
      }
      texture = new THREE.CanvasTexture(canvas);
    }

    const matParams: THREE.PointsMaterialParameters = {
      size: 0.09,
      transparent: true,
      opacity: 0.25,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      color: 0x8ec7f5,
    };
    if (texture) {
      matParams.map = texture;
    }

    this.material = new THREE.PointsMaterial(matParams);

    this.points = new THREE.Points(this.geometry, this.material);
    this.group.add(this.points);
  }

  public update(time: number, masterAlpha: number): void {
    const posAttr = this.geometry.attributes.position as THREE.BufferAttribute;
    const array = posAttr.array as Float32Array;

    for (let i = 0; i < this.particleCount; i++) {
      const idx = i * 3;
      const initX = this.initialPositions[idx];
      const initY = this.initialPositions[idx + 1];
      const initZ = this.initialPositions[idx + 2];

      // Very subtle organic floating
      array[idx] = initX + Math.sin(time * 0.15 + i) * 0.25;
      array[idx + 1] = initY + Math.cos(time * 0.12 + i * 0.5) * 0.3;
      array[idx + 2] = initZ + Math.sin(time * 0.08 + i * 0.2) * 0.2;
    }

    posAttr.needsUpdate = true;
    this.material.opacity = Math.max(0, Math.min(0.4, 0.15 * masterAlpha + Math.sin(time * 0.5) * 0.04));
  }

  public setOpacity(opacity: number): void {
    this.material.opacity = Math.max(0, Math.min(1, opacity));
  }

  public dispose(): void {
    if (this.material.map) {
      this.material.map.dispose();
    }
    this.material.dispose();
    this.geometry.dispose();
  }
}
