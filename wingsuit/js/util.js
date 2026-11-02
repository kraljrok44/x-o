// Shared math helpers, seeded RNG and 2D simplex noise.
export const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
export const lerp = (a, b, t) => a + (b - a) * t;
export const smoothstep = (e0, e1, x) => {
  const t = clamp((x - e0) / (e1 - e0), 0, 1);
  return t * t * (3 - 2 * t);
};
// Frame-rate independent exponential smoothing.
export const damp = (a, b, lambda, dt) => lerp(a, b, 1 - Math.exp(-lambda * dt));
export const TAU = Math.PI * 2;
export const wrapAngle = (a) => {
  while (a > Math.PI) a -= TAU;
  while (a < -Math.PI) a += TAU;
  return a;
};

export function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const F2 = 0.5 * (Math.sqrt(3) - 1);
const G2 = (3 - Math.sqrt(3)) / 6;
const GRAD = [[1, 1], [-1, 1], [1, -1], [-1, -1], [1, 0], [-1, 0], [0, 1], [0, -1]];

export function makeNoise(seed) {
  const rnd = mulberry32(seed);
  const p = new Uint8Array(256);
  for (let i = 0; i < 256; i++) p[i] = i;
  for (let i = 255; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    const t = p[i]; p[i] = p[j]; p[j] = t;
  }
  const perm = new Uint8Array(512);
  for (let i = 0; i < 512; i++) perm[i] = p[i & 255];

  function n2(xin, yin) {
    const s = (xin + yin) * F2;
    const i = Math.floor(xin + s), j = Math.floor(yin + s);
    const t = (i + j) * G2;
    const x0 = xin - (i - t), y0 = yin - (j - t);
    const i1 = x0 > y0 ? 1 : 0, j1 = x0 > y0 ? 0 : 1;
    const x1 = x0 - i1 + G2, y1 = y0 - j1 + G2;
    const x2 = x0 - 1 + 2 * G2, y2 = y0 - 1 + 2 * G2;
    const ii = i & 255, jj = j & 255;
    let n0 = 0, n1 = 0, nn2 = 0;
    let t0 = 0.5 - x0 * x0 - y0 * y0;
    if (t0 > 0) { const g = GRAD[perm[ii + perm[jj]] & 7]; t0 *= t0; n0 = t0 * t0 * (g[0] * x0 + g[1] * y0); }
    let t1 = 0.5 - x1 * x1 - y1 * y1;
    if (t1 > 0) { const g = GRAD[perm[ii + i1 + perm[jj + j1]] & 7]; t1 *= t1; n1 = t1 * t1 * (g[0] * x1 + g[1] * y1); }
    let t2 = 0.5 - x2 * x2 - y2 * y2;
    if (t2 > 0) { const g = GRAD[perm[ii + 1 + perm[jj + 1]] & 7]; t2 *= t2; nn2 = t2 * t2 * (g[0] * x2 + g[1] * y2); }
    return 70 * (n0 + n1 + nn2); // -1..1
  }
  function fbm(x, y, oct = 5, lac = 2, gain = 0.5) {
    let a = 1, f = 1, s = 0, n = 0;
    for (let o = 0; o < oct; o++) { s += a * n2(x * f, y * f); n += a; a *= gain; f *= lac; }
    return s / n;
  }
  function ridged(x, y, oct = 5, lac = 2.05, gain = 0.5) {
    let a = 1, f = 1, s = 0, n = 0, w = 1;
    for (let o = 0; o < oct; o++) {
      let v = 1 - Math.abs(n2(x * f, y * f));
      v *= v; v *= w; w = clamp(v * 1.6, 0, 1);
      s += a * v; n += a; a *= gain; f *= lac;
    }
    return s / n; // 0..1
  }
  return { n2, fbm, ridged };
}

// Polyline helper used by maps (route) – horizontal distance + parameter.
export class Polyline {
  constructor(points) {
    this.p = points; // [{x,z}]
    this.len = [0];
    for (let i = 1; i < points.length; i++) {
      const dx = points[i].x - points[i - 1].x, dz = points[i].z - points[i - 1].z;
      this.len.push(this.len[i - 1] + Math.hypot(dx, dz));
    }
    this.total = this.len[this.len.length - 1];
    // coarse grid acceleration for nearest queries
    this.cell = 120;
    this.grid = new Map();
    for (let i = 0; i < points.length - 1; i++) {
      const a = points[i], b = points[i + 1];
      const minx = Math.floor((Math.min(a.x, b.x) - 400) / this.cell), maxx = Math.floor((Math.max(a.x, b.x) + 400) / this.cell);
      const minz = Math.floor((Math.min(a.z, b.z) - 400) / this.cell), maxz = Math.floor((Math.max(a.z, b.z) + 400) / this.cell);
      for (let cx = minx; cx <= maxx; cx++) for (let cz = minz; cz <= maxz; cz++) {
        const k = cx * 73856093 ^ cz * 19349663;
        let arr = this.grid.get(k); if (!arr) { arr = []; this.grid.set(k, arr); }
        arr.push(i);
      }
    }
  }
  // returns {d, s} nearest horizontal distance and arc length parameter
  nearest(x, z, out = { d: 0, s: 0 }) {
    const k = Math.floor(x / this.cell) * 73856093 ^ Math.floor(z / this.cell) * 19349663;
    const segs = this.grid.get(k);
    let best = 1e9, bs = 0;
    const p = this.p;
    const test = (i) => {
      const a = p[i], b = p[i + 1];
      const abx = b.x - a.x, abz = b.z - a.z;
      const l2 = abx * abx + abz * abz || 1;
      let t = ((x - a.x) * abx + (z - a.z) * abz) / l2;
      t = t < 0 ? 0 : t > 1 ? 1 : t;
      const px = a.x + abx * t - x, pz = a.z + abz * t - z;
      const d = px * px + pz * pz;
      if (d < best) { best = d; bs = this.len[i] + t * (this.len[i + 1] - this.len[i]); }
    };
    if (segs) for (const i of segs) test(i);
    else { out.d = 1e4; out.s = 0; return out; }
    out.d = Math.sqrt(best); out.s = bs;
    return out;
  }
  at(s, out = { x: 0, z: 0, dx: 0, dz: 1 }) {
    s = clamp(s, 0, this.total);
    let i = 1;
    while (i < this.len.length - 1 && this.len[i] < s) i++;
    const a = this.p[i - 1], b = this.p[i];
    const seg = this.len[i] - this.len[i - 1] || 1;
    const t = (s - this.len[i - 1]) / seg;
    out.x = lerp(a.x, b.x, t); out.z = lerp(a.z, b.z, t);
    out.dx = (b.x - a.x) / seg; out.dz = (b.z - a.z) / seg;
    return out;
  }
}

// Catmull-Rom smoothing of control points into a dense polyline.
export function smoothPath(ctrl, step = 20) {
  const out = [];
  const P = (i) => ctrl[clamp(i, 0, ctrl.length - 1)];
  for (let i = 0; i < ctrl.length - 1; i++) {
    const p0 = P(i - 1), p1 = P(i), p2 = P(i + 1), p3 = P(i + 2);
    const d = Math.hypot(p2[0] - p1[0], p2[1] - p1[1]);
    const n = Math.max(2, Math.ceil(d / step));
    for (let k = 0; k < n; k++) {
      const t = k / n, t2 = t * t, t3 = t2 * t;
      const f = (a, b, c, e) => 0.5 * (2 * b + (-a + c) * t + (2 * a - 5 * b + 4 * c - e) * t2 + (-a + 3 * b - 3 * c + e) * t3);
      out.push({ x: f(p0[0], p1[0], p2[0], p3[0]), z: f(p0[1], p1[1], p2[1], p3[1]) });
    }
  }
  const l = ctrl[ctrl.length - 1];
  out.push({ x: l[0], z: l[1] });
  return out;
}

export function fmtTime(t) {
  const m = Math.floor(t / 60), s = t - m * 60;
  return `${m}:${s < 10 ? '0' : ''}${s.toFixed(1)}`;
}
