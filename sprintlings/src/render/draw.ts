/** Small Canvas2D helpers shared by every painter. Colours are '#rrggbb'. */

export type Ctx = CanvasRenderingContext2D;

function parse(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1, 7), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function toHex(r: number, g: number, b: number): string {
  const c = (v: number) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0');
  return `#${c(r)}${c(g)}${c(b)}`;
}

const mixCache = new Map<string, string>();

/** Linear blend of two colours (t = 0 -> a, 1 -> b). Cached: painters call this every frame. */
export function mix(a: string, b: string, t: number): string {
  const key = `${a}${b}${Math.round(t * 100)}`;
  const hit = mixCache.get(key);
  if (hit) return hit;
  const [r1, g1, b1] = parse(a);
  const [r2, g2, b2] = parse(b);
  const q = Math.round(t * 100) / 100;
  const out = toHex(r1 + (r2 - r1) * q, g1 + (g2 - g1) * q, b1 + (b2 - b1) * q);
  if (mixCache.size > 4000) mixCache.clear();
  mixCache.set(key, out);
  return out;
}

export const shade = (c: string, t: number): string => mix(c, '#000000', t);
export const tint = (c: string, t: number): string => mix(c, '#ffffff', t);

export function rgba(hex: string, a: number): string {
  const [r, g, b] = parse(hex);
  return `rgba(${r},${g},${b},${a})`;
}

/** Deterministic hash noise in [0, 1). */
export function hash(n: number): number {
  const s = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return s - Math.floor(s);
}

/** Smooth 1D value noise in [0, 1). */
export function noise1(x: number, seed = 0): number {
  const i = Math.floor(x);
  const f = x - i;
  const u = f * f * (3 - 2 * f);
  return hash(i + seed * 101.3) * (1 - u) + hash(i + 1 + seed * 101.3) * u;
}

export function roundRect(ctx: Ctx, x: number, y: number, w: number, h: number, r: number): void {
  const rr = Math.min(r, Math.abs(w) / 2, Math.abs(h) / 2);
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}

export function star(ctx: Ctx, cx: number, cy: number, r: number, inner = 0.45, points = 5, rot = -Math.PI / 2): void {
  for (let i = 0; i < points * 2; i++) {
    const a = rot + (i * Math.PI) / points;
    const rad = i % 2 === 0 ? r : r * inner;
    const x = cx + Math.cos(a) * rad;
    const y = cy + Math.sin(a) * rad;
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.closePath();
}

export function ellipse(ctx: Ctx, cx: number, cy: number, rx: number, ry: number, rot = 0): void {
  ctx.moveTo(cx + rx * Math.cos(rot), cy + rx * Math.sin(rot));
  ctx.ellipse(cx, cy, Math.abs(rx), Math.abs(ry), rot, 0, Math.PI * 2);
}

/** Closed smooth curve through points (Catmull-Rom converted to Béziers). */
export function smoothClosed(ctx: Ctx, pts: readonly number[]): void {
  const n = pts.length / 2;
  const px = (i: number) => pts[((i + n) % n) * 2];
  const py = (i: number) => pts[((i + n) % n) * 2 + 1];
  ctx.moveTo(px(0), py(0));
  for (let i = 0; i < n; i++) {
    const c1x = px(i) + (px(i + 1) - px(i - 1)) / 6;
    const c1y = py(i) + (py(i + 1) - py(i - 1)) / 6;
    const c2x = px(i + 1) - (px(i + 2) - px(i)) / 6;
    const c2y = py(i + 1) - (py(i + 2) - py(i)) / 6;
    ctx.bezierCurveTo(c1x, c1y, c2x, c2y, px(i + 1), py(i + 1));
  }
  ctx.closePath();
}

/** Critically damped spring toward a target (stable for any dt). */
export class Spring {
  value: number;
  velocity = 0;
  constructor(
    value = 0,
    public stiffness = 120,
    public damping = 12,
  ) {
    this.value = value;
  }
  update(target: number, dt: number): number {
    const steps = Math.max(1, Math.ceil(dt / (1 / 120)));
    const h = dt / steps;
    for (let i = 0; i < steps; i++) {
      const a = (target - this.value) * this.stiffness - this.velocity * this.damping;
      this.velocity += a * h;
      this.value += this.velocity * h;
    }
    return this.value;
  }
  kick(v: number): void {
    this.velocity += v;
  }
}

/** Exponential smoothing factor for a time constant (frame-rate independent). */
export function damp(rate: number, dt: number): number {
  return 1 - Math.exp(-rate * dt);
}
