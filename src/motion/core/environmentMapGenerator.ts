import * as THREE from 'three';

/**
 * Procedurally generates a lightweight studio reflection environment texture.
 * Enables MeshPhysicalMaterial to render authentic physical specular reflections
 * and curved glass highlights without requiring external HDR asset files.
 */
export function createStudioEnvironmentTexture(): THREE.Texture | null {
  if (typeof document === 'undefined') {
    return null;
  }

  const width = 512;
  const height = 256;
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;

  // 1. Deep obsidian ambient gradient
  const bgGrad = ctx.createLinearGradient(0, 0, 0, height);
  bgGrad.addColorStop(0.0, '#020409');
  bgGrad.addColorStop(0.4, '#060f1c');
  bgGrad.addColorStop(0.6, '#040b15');
  bgGrad.addColorStop(1.0, '#010204');
  ctx.fillStyle = bgGrad;
  ctx.fillRect(0, 0, width, height);

  // 2. Front-left key softbox (creates sharp curved specular highlight on glass)
  const keyGrad = ctx.createRadialGradient(140, 75, 10, 140, 75, 80);
  keyGrad.addColorStop(0.0, 'rgba(180, 225, 255, 0.95)');
  keyGrad.addColorStop(0.3, 'rgba(60, 160, 240, 0.5)');
  keyGrad.addColorStop(0.7, 'rgba(10, 60, 120, 0.15)');
  keyGrad.addColorStop(1.0, 'rgba(0, 0, 0, 0)');
  ctx.fillStyle = keyGrad;
  ctx.fillRect(40, 0, 200, 160);

  // 3. Top-right rim softbox (creates cyan specular rim reflection)
  const rimGrad = ctx.createRadialGradient(380, 60, 5, 380, 60, 70);
  rimGrad.addColorStop(0.0, 'rgba(0, 240, 255, 0.95)');
  rimGrad.addColorStop(0.3, 'rgba(0, 170, 220, 0.45)');
  rimGrad.addColorStop(0.7, 'rgba(0, 60, 110, 0.1)');
  rimGrad.addColorStop(1.0, 'rgba(0, 0, 0, 0)');
  ctx.fillStyle = rimGrad;
  ctx.fillRect(290, 0, 180, 140);

  // 4. Subtle bottom-left violet fill accent
  const fillGrad = ctx.createRadialGradient(100, 190, 10, 100, 190, 90);
  fillGrad.addColorStop(0.0, 'rgba(150, 110, 255, 0.4)');
  fillGrad.addColorStop(0.5, 'rgba(80, 40, 160, 0.15)');
  fillGrad.addColorStop(1.0, 'rgba(0, 0, 0, 0)');
  ctx.fillStyle = fillGrad;
  ctx.fillRect(10, 100, 180, 150);

  const texture = new THREE.CanvasTexture(canvas);
  texture.mapping = THREE.EquirectangularReflectionMapping;
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.needsUpdate = true;
  return texture;
}
