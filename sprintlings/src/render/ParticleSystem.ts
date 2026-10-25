import * as THREE from 'three';
import { glowTexture } from './Materials';

/**
 * Pooled GPU point particles with per-particle colour, alpha and size.
 * Fixed capacity, no allocations after construction.
 */
export class ParticleSystem {
  readonly points: THREE.Points;
  private readonly pos: Float32Array;
  private readonly vel: Float32Array;
  private readonly col: Float32Array;
  private readonly alpha: Float32Array;
  private readonly size: Float32Array;
  private readonly life: Float32Array;
  private readonly maxLife: Float32Array;
  private readonly baseSize: Float32Array;
  private readonly gravity: Float32Array;
  private readonly drag: Float32Array;
  private cursor = 0;
  private readonly tmpColor = new THREE.Color();

  constructor(
    readonly capacity: number,
    additive: boolean,
  ) {
    this.pos = new Float32Array(capacity * 3);
    this.vel = new Float32Array(capacity * 3);
    this.col = new Float32Array(capacity * 3);
    this.alpha = new Float32Array(capacity);
    this.size = new Float32Array(capacity);
    this.life = new Float32Array(capacity);
    this.maxLife = new Float32Array(capacity);
    this.baseSize = new Float32Array(capacity);
    this.gravity = new Float32Array(capacity);
    this.drag = new Float32Array(capacity);
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('color', new THREE.BufferAttribute(this.col, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('alpha', new THREE.BufferAttribute(this.alpha, 1).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('size', new THREE.BufferAttribute(this.size, 1).setUsage(THREE.DynamicDrawUsage));
    const mat = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
      uniforms: { map: { value: glowTexture() }, scale: { value: 420 } },
      vertexShader: /* glsl */ `
        attribute float alpha; attribute float size; attribute vec3 color;
        varying float vAlpha; varying vec3 vColor; uniform float scale;
        void main() {
          vAlpha = alpha; vColor = color;
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          gl_PointSize = size * scale / max(0.1, -mv.z);
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: /* glsl */ `
        uniform sampler2D map; varying float vAlpha; varying vec3 vColor;
        void main() {
          vec4 t = texture2D(map, gl_PointCoord);
          if (t.a * vAlpha < 0.01) discard;
          gl_FragColor = vec4(vColor, t.a * vAlpha);
        }`,
    });
    this.points = new THREE.Points(g, mat);
    this.points.frustumCulled = false;
  }

  setPixelScale(heightPx: number): void {
    (this.points.material as THREE.ShaderMaterial).uniforms.scale.value = heightPx * 0.6;
  }

  emit(
    x: number,
    y: number,
    z: number,
    vx: number,
    vy: number,
    vz: number,
    color: THREE.ColorRepresentation,
    size: number,
    life: number,
    gravity = 0,
    drag = 1.5,
  ): void {
    const i = this.cursor;
    this.cursor = (this.cursor + 1) % this.capacity;
    const i3 = i * 3;
    this.pos[i3] = x;
    this.pos[i3 + 1] = y;
    this.pos[i3 + 2] = z;
    this.vel[i3] = vx;
    this.vel[i3 + 1] = vy;
    this.vel[i3 + 2] = vz;
    this.tmpColor.set(color);
    this.col[i3] = this.tmpColor.r;
    this.col[i3 + 1] = this.tmpColor.g;
    this.col[i3 + 2] = this.tmpColor.b;
    this.life[i] = life;
    this.maxLife[i] = life;
    this.baseSize[i] = size;
    this.gravity[i] = gravity;
    this.drag[i] = drag;
  }

  /** Burst of `n` particles with random directions. */
  burst(
    x: number,
    y: number,
    z: number,
    n: number,
    speed: number,
    color: THREE.ColorRepresentation,
    size: number,
    life: number,
    gravity = 0,
    upBias = 0.5,
  ): void {
    for (let k = 0; k < n; k++) {
      const a = Math.random() * Math.PI * 2;
      const e = Math.random() * Math.PI - Math.PI / 2;
      const sp = speed * (0.4 + Math.random() * 0.6);
      this.emit(
        x,
        y,
        z,
        Math.cos(a) * Math.cos(e) * sp,
        (Math.sin(e) * 0.5 + upBias) * sp,
        Math.sin(a) * Math.cos(e) * sp,
        color,
        size * (0.6 + Math.random() * 0.6),
        life * (0.6 + Math.random() * 0.5),
        gravity,
      );
    }
  }

  update(dt: number): void {
    const n = this.capacity;
    for (let i = 0; i < n; i++) {
      if (this.life[i] <= 0) {
        if (this.alpha[i] !== 0) {
          this.alpha[i] = 0;
          this.size[i] = 0;
        }
        continue;
      }
      this.life[i] -= dt;
      const i3 = i * 3;
      const d = Math.exp(-this.drag[i] * dt);
      this.vel[i3] *= d;
      this.vel[i3 + 1] = this.vel[i3 + 1] * d - this.gravity[i] * dt;
      this.vel[i3 + 2] *= d;
      this.pos[i3] += this.vel[i3] * dt;
      this.pos[i3 + 1] += this.vel[i3 + 1] * dt;
      this.pos[i3 + 2] += this.vel[i3 + 2] * dt;
      const k = Math.max(0, this.life[i] / this.maxLife[i]);
      this.alpha[i] = Math.min(1, k * 2.2);
      this.size[i] = this.baseSize[i] * (0.5 + 0.5 * k);
    }
    const g = this.points.geometry;
    g.getAttribute('position').needsUpdate = true;
    g.getAttribute('color').needsUpdate = true;
    g.getAttribute('alpha').needsUpdate = true;
    g.getAttribute('size').needsUpdate = true;
  }

  clear(): void {
    this.life.fill(0);
  }
}
