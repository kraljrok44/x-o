import * as THREE from 'three';

/**
 * Shared materials. Everything uses a small set of cached toon materials so
 * the scene stays within a few dozen material/shader variants.
 */
let gradient: THREE.DataTexture | null = null;

export function toonGradient(): THREE.DataTexture {
  if (gradient) return gradient;
  const tones = new Uint8Array([90, 90, 90, 255, 165, 165, 165, 255, 225, 225, 225, 255, 255, 255, 255, 255]);
  gradient = new THREE.DataTexture(tones, 4, 1, THREE.RGBAFormat);
  gradient.minFilter = THREE.NearestFilter;
  gradient.magFilter = THREE.NearestFilter;
  gradient.generateMipmaps = false;
  gradient.needsUpdate = true;
  return gradient;
}

const toonCache = new Map<string, THREE.MeshToonMaterial>();

export function toon(color: string | number, opts: { emissive?: string; emissiveIntensity?: number; transparent?: boolean; opacity?: number } = {}): THREE.MeshToonMaterial {
  const key = `${color}|${opts.emissive ?? ''}|${opts.emissiveIntensity ?? 0}|${opts.opacity ?? 1}`;
  let m = toonCache.get(key);
  if (!m) {
    m = new THREE.MeshToonMaterial({
      color: new THREE.Color(color),
      gradientMap: toonGradient(),
      emissive: opts.emissive ? new THREE.Color(opts.emissive) : new THREE.Color(0x000000),
      emissiveIntensity: opts.emissiveIntensity ?? 0,
      transparent: opts.transparent ?? (opts.opacity !== undefined && opts.opacity < 1),
      opacity: opts.opacity ?? 1,
    });
    toonCache.set(key, m);
  }
  return m;
}

const basicCache = new Map<string, THREE.MeshBasicMaterial>();

export function flat(color: string | number, opacity = 1, additive = false): THREE.MeshBasicMaterial {
  const key = `${color}|${opacity}|${additive}`;
  let m = basicCache.get(key);
  if (!m) {
    m = new THREE.MeshBasicMaterial({
      color: new THREE.Color(color),
      transparent: opacity < 1 || additive,
      opacity,
      depthWrite: !(opacity < 1 || additive),
      blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
    });
    basicCache.set(key, m);
  }
  return m;
}

/** Back-face "inverted hull" outline for chunky cartoon silhouettes. */
export const OUTLINE_MATERIAL = new THREE.MeshBasicMaterial({ color: 0x1b1530, side: THREE.BackSide });

/** Adds an outline shell to every mesh under `root` (characters only: cost doubles draw calls). */
export function addOutlines(root: THREE.Object3D, thickness = 0.04): void {
  const meshes: THREE.Mesh[] = [];
  root.traverse((o) => {
    if ((o as THREE.Mesh).isMesh && !o.userData.noOutline) meshes.push(o as THREE.Mesh);
  });
  for (const mesh of meshes) {
    const shell = new THREE.Mesh(mesh.geometry, OUTLINE_MATERIAL);
    shell.userData.noOutline = true;
    shell.userData.isOutline = true;
    mesh.geometry.computeBoundingSphere();
    const r = mesh.geometry.boundingSphere?.radius ?? 0.5;
    const avg = (mesh.scale.x + mesh.scale.y + mesh.scale.z) / 3;
    const s = Math.min(1.22, 1 + thickness / Math.max(0.02, r * avg));
    shell.scale.setScalar(s);
    shell.castShadow = false;
    shell.receiveShadow = false;
    mesh.add(shell);
  }
}

/** Canvas generated tiling texture for track tops: soft checker + speckles. */
export function makeGroundTexture(a: string, b: string, speck: string, seed = 1): THREE.CanvasTexture {
  const size = 128;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = a;
  ctx.fillRect(0, 0, size, size);
  ctx.fillStyle = b;
  ctx.fillRect(0, 0, size / 2, size / 2);
  ctx.fillRect(size / 2, size / 2, size / 2, size / 2);
  let r = seed;
  const rand = () => ((r = (r * 16807) % 2147483647) / 2147483647);
  ctx.globalAlpha = 0.35;
  ctx.fillStyle = speck;
  for (let i = 0; i < 90; i++) {
    const x = rand() * size;
    const y = rand() * size;
    ctx.beginPath();
    ctx.ellipse(x, y, 1 + rand() * 2.5, 1 + rand() * 1.5, rand() * 3, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

/** Small radial sprite texture for particles and glows. */
let glowTex: THREE.CanvasTexture | null = null;
export function glowTexture(): THREE.CanvasTexture {
  if (glowTex) return glowTex;
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d')!;
  const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grad.addColorStop(0, 'rgba(255,255,255,1)');
  grad.addColorStop(0.35, 'rgba(255,255,255,0.7)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 64, 64);
  glowTex = new THREE.CanvasTexture(c);
  glowTex.colorSpace = THREE.SRGBColorSpace;
  return glowTex;
}

/** Chevron warning stripes texture used on walls and hazard edges. */
export function stripeTexture(a: string, b: string): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d')!;
  g.fillStyle = a;
  g.fillRect(0, 0, 64, 64);
  g.fillStyle = b;
  for (let i = -64; i < 128; i += 32) {
    g.beginPath();
    g.moveTo(i, 0);
    g.lineTo(i + 16, 0);
    g.lineTo(i + 16 + 64, 64);
    g.lineTo(i + 64, 64);
    g.closePath();
    g.fill();
  }
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}
