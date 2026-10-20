// Painted panoramic backgrounds. Each map gets a static equirectangular "matte painting"
// generated once from code (no external images): gradient sky, clouds / nebula / aurora,
// layered distant silhouettes and a sun, moon or planet that matches the map's light direction.

import * as THREE from 'three';
import { rng32, hashString } from '../../shared/vec.js';

const W = 2048, H = 1024;      // final panorama
const LW = 1024, LH = 512;     // per-pixel layer (clouds, nebula) is painted at half size and upscaled
const cache = new Map();

// ---------------------------------------------------------------- helpers
function hex(c) { const n = parseInt(c.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; }
function mix(a, b, t) { return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]; }
function css(c, a = 1) { return `rgba(${c[0] | 0},${c[1] | 0},${c[2] | 0},${a})`; }
const clamp01 = (x) => (x < 0 ? 0 : x > 1 ? 1 : x);
const smooth = (a, b, x) => { const t = clamp01((x - a) / (b - a)); return t * t * (3 - 2 * t); };

/** Value noise that wraps horizontally (seamless panorama). */
function periodicNoise(seed) {
  const rnd = rng32(seed);
  const vals = new Float32Array(256 * 256);
  for (let i = 0; i < vals.length; i++) vals[i] = rnd();
  const at = (i, j, p) => vals[((((i % p) + p) % p) & 255) + ((j & 255) << 8)];
  const n = (x, y, p) => {
    const xi = Math.floor(x), yi = Math.floor(y);
    const xf = x - xi, yf = y - yi;
    const u = xf * xf * (3 - 2 * xf), w = yf * yf * (3 - 2 * yf);
    const a = at(xi, yi, p), b = at(xi + 1, yi, p), c = at(xi, yi + 1, p), d = at(xi + 1, yi + 1, p);
    return a + (b - a) * u + (c - a) * w + (a - b - c + d) * u * w;
  };
  // u in [0,1) wraps; v is free
  const fbm = (u, v, base = 4, oct = 5) => {
    let s = 0, amp = 0.5, norm = 0, f = base;
    for (let o = 0; o < oct; o++) { s += amp * n(u * f, v * f, f); norm += amp; amp *= 0.5; f *= 2; }
    return s / norm;
  };
  return { n, fbm, rnd };
}

/** Periodic ridge profile in pixels above the horizon. */
function ridge(rnd, harmonics, sharp = false) {
  const h = [];
  for (let k = 1; k <= harmonics; k++) h.push({ k: k * (1 + Math.floor(rnd() * 2)), a: 1 / Math.pow(k, 1.1) * (0.5 + rnd()), p: rnd() * Math.PI * 2 });
  return (u) => {
    let s = 0;
    for (const x of h) {
      const v = Math.sin(u * Math.PI * 2 * x.k + x.p);
      s += x.a * (sharp ? 1 - Math.abs(v) * 2 : v);
    }
    return s;
  };
}

function dirToPx(d) {
  const l = Math.hypot(d[0], d[1], d[2]);
  const x = d[0] / l, y = d[1] / l, z = d[2] / l;
  const u = Math.atan2(y, x) / (Math.PI * 2) + 0.5;
  const v = 0.5 - Math.asin(z) / Math.PI;
  return [u * W, v * H];
}

const HZ = H / 2; // horizon row
const SIL = 0.42; // distant ranges stay low on the horizon (1 px ~ 0.18 deg)

function paintLayer(fn) {
  const cv = document.createElement('canvas');
  cv.width = LW; cv.height = LH;
  const g = cv.getContext('2d');
  const img = g.createImageData(LW, LH);
  const d = img.data;
  for (let y = 0; y < LH; y++) {
    const v = y / LH;
    for (let x = 0; x < LW; x++) {
      const c = fn(x / LW, v);
      const k = (y * LW + x) * 4;
      d[k] = c[0]; d[k + 1] = c[1]; d[k + 2] = c[2]; d[k + 3] = 255;
    }
  }
  g.putImageData(img, 0, 0);
  return cv;
}

function skyGradient(top, mid, hor, bot) {
  return (v) => {
    if (v < 0.5) return mix(top, mid, Math.pow(smooth(0, 0.5, v), 1.6)) .map((x, i) => x + (hor[i] - x) * Math.pow(smooth(0.3, 0.5, v), 2));
    return mix(hor, bot, Math.pow(smooth(0.5, 0.8, v), 0.7));
  };
}

function stars(g, rnd, count, maxV = 0.48, bright = 1) {
  for (let i = 0; i < count; i++) {
    const x = rnd() * W, y = Math.pow(rnd(), 1.3) * H * maxV;
    const r = rnd() < 0.04 ? 1.6 : rnd() * 0.9 + 0.3;
    g.fillStyle = `rgba(255,255,255,${(0.35 + rnd() * 0.65) * bright})`;
    g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill();
  }
}

function glow(g, x, y, r, color, alpha = 1) {
  const gr = g.createRadialGradient(x, y, 0, x, y, r);
  gr.addColorStop(0, css(color, alpha));
  gr.addColorStop(1, css(color, 0));
  g.fillStyle = gr;
  g.fillRect(x - r, y - r, r * 2, r * 2);
  // repeat across the seam
  if (x - r < 0) { g.save(); g.translate(W, 0); g.fillRect(x - r, y - r, r * 2, r * 2); g.restore(); }
  if (x + r > W) { g.save(); g.translate(-W, 0); g.fillRect(x - r, y - r, r * 2, r * 2); g.restore(); }
}

/** Fill a periodic silhouette layer: base row + height(u) pixels, with a vertical haze gradient. */
function silhouette(g, heightFn, baseY, colTop, colBot, opts = {}) {
  const pts = [];
  for (let x = 0; x <= W; x += 4) pts.push([x, baseY - heightFn(x / W) * SIL]);
  const minY = Math.min(...pts.map((p) => p[1]));
  const gr = g.createLinearGradient(0, minY, 0, baseY + (opts.depth || 60));
  gr.addColorStop(0, css(colTop));
  gr.addColorStop(1, css(colBot));
  g.fillStyle = gr;
  g.beginPath();
  g.moveTo(0, baseY + (opts.depth || 60));
  for (const p of pts) g.lineTo(p[0], p[1]);
  g.lineTo(W, baseY + (opts.depth || 60));
  g.closePath();
  g.fill();
  if (opts.rim) {
    g.strokeStyle = css(opts.rim, opts.rimAlpha ?? 0.8);
    g.lineWidth = opts.rimWidth || 2;
    g.beginPath();
    pts.forEach((p, i) => (i ? g.lineTo(p[0], p[1]) : g.moveTo(p[0], p[1])));
    g.stroke();
  }
  return pts;
}

function hazeBand(g, color, y, h, alpha) {
  const gr = g.createLinearGradient(0, y - h, 0, y + h);
  gr.addColorStop(0, css(color, 0));
  gr.addColorStop(0.5, css(color, alpha));
  gr.addColorStop(1, css(color, 0));
  g.fillStyle = gr;
  g.fillRect(0, y - h, W, h * 2);
}

// ---------------------------------------------------------------- theme painters
const PAINTERS = {
  surf_aurora_dawn(g, th, N) {
    const sky = skyGradient(hex('#20225a'), hex('#c0607a'), hex('#ffd2a0'), hex(th.fog));
    g.drawImage(paintLayer((u, v) => {
      let c = sky(v);
      // soft lit cloud bands
      const cl = N.fbm(u, v * 3.2, 5, 5);
      const k = smooth(0.52, 0.72, cl) * smooth(0.12, 0.3, v) * (1 - smooth(0.46, 0.52, v));
      const lit = mix(hex('#ffb3a0'), hex('#fff0d8'), smooth(0.25, 0.45, v));
      c = mix(c, lit, k * 0.75);
      return c;
    }), 0, 0, W, H);
    const [sx, sy] = dirToPx(th.sun);
    glow(g, sx, sy, 260, hex('#ffb070'), 0.5);
    glow(g, sx, sy, 70, hex('#fff2d0'), 0.95);
    g.fillStyle = '#fffaf0'; g.beginPath(); g.arc(sx, sy, 16, 0, Math.PI * 2); g.fill();
    const r1 = ridge(N.rnd, 7), r2 = ridge(N.rnd, 9), r3 = ridge(N.rnd, 11);
    silhouette(g, (u) => 70 + r1(u) * 45, HZ + 10, hex('#b68aa8'), hex('#e7a99a'));
    silhouette(g, (u) => 45 + r2(u) * 35, HZ + 20, hex('#7e5b8c'), hex('#c58a95'));
    silhouette(g, (u) => 25 + r3(u) * 22, HZ + 30, hex('#4d3767'), hex('#8f6585'));
    hazeBand(g, hex(th.fog), HZ + 40, 60, 0.7);
  },

  surf_frostbyte(g, th, N) {
    const sky = skyGradient(hex('#030b1f'), hex('#0d3158'), hex('#6fb6d8'), hex(th.fog));
    g.drawImage(paintLayer((u, v) => {
      let c = sky(v);
      // aurora curtains: bright band along a wavy line, streaked vertically
      const line = 0.16 + N.fbm(u, 0.3, 3, 3) * 0.12;
      const d = v - line;
      const curtain = Math.exp(-Math.max(0, d) * 30) * (d > -0.015 ? 1 : Math.exp(d * 120));
      const streak = 0.55 + 0.45 * N.n(u * 260, 0.5, 260);
      const a = curtain * streak * smooth(0.0, 0.08, v) * (0.6 + 0.4 * N.fbm(u, 1.7, 2, 3));
      const ac = mix(hex('#38f9a0'), hex('#4cc9f0'), smooth(0, 0.12, d + 0.05));
      c = mix(c, ac, clamp01(a) * 0.8);
      return c;
    }), 0, 0, W, H);
    stars(g, N.rnd, 900, 0.42, 0.9);
    const [sx, sy] = dirToPx(th.sun);
    glow(g, sx, sy, 160, hex('#cfefff'), 0.35);
    g.fillStyle = '#eef8ff'; g.beginPath(); g.arc(sx, sy, 14, 0, Math.PI * 2); g.fill();
    g.fillStyle = 'rgba(160,190,215,0.5)'; g.beginPath(); g.arc(sx - 4, sy - 2, 4, 0, Math.PI * 2); g.fill();
    const r1 = ridge(N.rnd, 9, true), r2 = ridge(N.rnd, 13, true), r3 = ridge(N.rnd, 17, true);
    silhouette(g, (u) => 110 + r1(u) * 55, HZ + 12, hex('#d9f1ff'), hex('#7fb7d6'), { rim: hex('#ffffff'), rimAlpha: 0.6 });
    silhouette(g, (u) => 70 + r2(u) * 40, HZ + 22, hex('#9ccbe6'), hex('#4f84a8'));
    silhouette(g, (u) => 40 + r3(u) * 25, HZ + 32, hex('#3d6b8f'), hex('#2a4d6b'));
    hazeBand(g, hex(th.fog), HZ + 45, 55, 0.65);
  },

  surf_jade_sanctum(g, th, N) {
    const sky = skyGradient(hex('#2f6b5a'), hex('#9cc9a0'), hex('#f3efc8'), hex(th.fog));
    g.drawImage(paintLayer((u, v) => {
      let c = sky(v);
      const mist = N.fbm(u, v * 4, 4, 5);
      c = mix(c, hex('#f7f4dc'), smooth(0.55, 0.75, mist) * smooth(0.2, 0.45, v) * 0.6);
      return c;
    }), 0, 0, W, H);
    const [sx, sy] = dirToPx(th.sun);
    glow(g, sx, sy, 240, hex('#fff1b0'), 0.5);
    g.fillStyle = '#fffbe6'; g.beginPath(); g.arc(sx, sy, 15, 0, Math.PI * 2); g.fill();
    // floating islands high in the sky
    for (let i = 0; i < 9; i++) {
      const x = N.rnd() * W, y = HZ - 70 - N.rnd() * 150, w = 22 + N.rnd() * 45;
      g.fillStyle = css(mix(hex('#5e8a6a'), hex('#c9dcc0'), 0.4 + (y < HZ - 250 ? 0.3 : 0)), 0.85);
      g.beginPath(); g.moveTo(x - w, y); g.quadraticCurveTo(x, y - w * 0.25, x + w, y); g.lineTo(x + w * 0.2, y + w * 0.7); g.closePath(); g.fill();
      g.fillStyle = 'rgba(70,120,80,0.8)'; g.beginPath(); g.ellipse(x, y - 4, w * 0.7, w * 0.16, 0, 0, Math.PI * 2); g.fill();
    }
    // karst pillar ranges with temples
    const layers = [[hex('#b9d3b0'), hex('#dfe8c8'), 0.25, 150], [hex('#6f9a78'), hex('#a9c4a0'), 0.45, 110], [hex('#2f5a44'), hex('#5f8a6a'), 0.75, 75]];
    layers.forEach(([top, bot, dens, hgt], li) => {
      const base = HZ + 15 + li * 12;
      for (let x = -40; x < W + 40; x += 18 + N.rnd() * 30) {
        if (N.rnd() > dens + 0.3) continue;
        const w = 12 + N.rnd() * 20, h = hgt * SIL * (0.4 + N.rnd());
        const gr = g.createLinearGradient(0, base - h, 0, base + 40);
        gr.addColorStop(0, css(top)); gr.addColorStop(1, css(bot));
        g.fillStyle = gr;
        g.beginPath(); g.moveTo(x - w, base + 40); g.bezierCurveTo(x - w, base - h * 0.6, x - w * 0.5, base - h, x, base - h);
        g.bezierCurveTo(x + w * 0.5, base - h, x + w, base - h * 0.6, x + w, base + 40); g.fill();
        if (li === 2 && N.rnd() < 0.25) { // pagoda
          g.fillStyle = css(mix(top, hex('#1a2a1a'), 0.4));
          for (let k = 0; k < 3; k++) { const ty = base - h - k * 6, tw = 11 - k * 3; g.fillRect(x - tw * 0.5, ty - 10, tw, 10); g.beginPath(); g.moveTo(x - tw, ty - 9); g.lineTo(x + tw, ty - 9); g.lineTo(x, ty - 16); g.fill(); }
          glow(g, x, base - h - 6, 8, hex('#ffd27a'), 0.7);
        }
      }
    });
    hazeBand(g, hex(th.fog), HZ + 50, 55, 0.7);
  },

  surf_neon_drift(g, th, N) {
    const sky = skyGradient(hex('#0b0220'), hex('#3d0d6b'), hex('#ff4f9a'), hex(th.fog));
    g.drawImage(paintLayer((u, v) => sky(v)), 0, 0, W, H);
    stars(g, N.rnd, 700, 0.38, 0.9);
    // striped synthwave sun sitting on the horizon (opposite the camera spawn direction)
    const sx = W * 0.5, sy = HZ - 28, R = 64;
    glow(g, sx, sy, 200, hex('#ff3d9a'), 0.45);
    const gr = g.createLinearGradient(0, sy - R, 0, sy + R);
    gr.addColorStop(0, '#ffe66d'); gr.addColorStop(0.55, '#ff7a59'); gr.addColorStop(1, '#ff2a8a');
    g.save();
    g.beginPath(); g.arc(sx, sy, R, 0, Math.PI * 2); g.clip();
    g.fillStyle = gr; g.fillRect(sx - R, sy - R, R * 2, R * 2);
    g.globalCompositeOperation = 'destination-out';
    for (let i = 0; i < 8; i++) { const y = sy + i * 7 - 2; g.fillRect(sx - R, y, R * 2, 1 + i * 0.6); }
    g.restore();
    // neon outlined mountains
    const r1 = ridge(N.rnd, 8, true), r2 = ridge(N.rnd, 12, true);
    silhouette(g, (u) => 100 + r1(u) * 60, HZ + 8, hex('#1a0638'), hex('#2a0b4f'), { rim: hex('#00f5ff'), rimWidth: 2.5 });
    silhouette(g, (u) => 50 + r2(u) * 35, HZ + 20, hex('#12032a'), hex('#1e0840'), { rim: hex('#ff2a8a'), rimWidth: 2 });
    // perspective grid below the horizon
    g.strokeStyle = 'rgba(0,245,255,0.25)'; g.lineWidth = 1;
    for (let i = 1; i < 14; i++) { const y = HZ + 22 + Math.pow(i / 14, 2) * (H * 0.5); g.beginPath(); g.moveTo(0, y); g.lineTo(W, y); g.stroke(); }
    for (let x = 0; x <= W; x += 64) { g.beginPath(); g.moveTo(x, HZ + 22); g.lineTo(x + (x - W / 2) * 0.6, H); g.stroke(); }
    hazeBand(g, hex('#ff4f9a'), HZ + 14, 26, 0.45);
  },

  surf_ember_core(g, th, N) {
    const sky = skyGradient(hex('#120302'), hex('#4a0a07'), hex('#d4520f'), hex(th.fog));
    g.drawImage(paintLayer((u, v) => {
      let c = sky(v);
      const sm = N.fbm(u, v * 2.5, 4, 6);
      const k = smooth(0.42, 0.7, sm) * (1 - smooth(0.42, 0.52, v));
      const under = mix(hex('#2a0805'), hex('#ff6a1a'), smooth(0.25, 0.48, v) * smooth(0.5, 0.75, sm));
      c = mix(c, under, k * 0.85);
      return c;
    }), 0, 0, W, H);
    const [sx, sy] = dirToPx(th.sun);
    glow(g, sx, sy, 180, hex('#ff8c1a'), 0.45);
    g.fillStyle = 'rgba(255,200,120,0.9)'; g.beginPath(); g.arc(sx, sy, 12, 0, Math.PI * 2); g.fill();
    // volcanoes with lava streams and plumes
    const r2 = ridge(N.rnd, 10);
    for (let i = 0; i < 7; i++) {
      const x = (i + N.rnd() * 0.6) * (W / 7), h = 45 + N.rnd() * 45, w = 80 + N.rnd() * 70, base = HZ + 20;
      g.fillStyle = '#1c0705';
      g.beginPath(); g.moveTo(x - w, base + 40); g.lineTo(x - w * 0.12, base - h); g.lineTo(x + w * 0.12, base - h); g.lineTo(x + w, base + 40); g.fill();
      g.strokeStyle = 'rgba(255,110,20,0.85)'; g.lineWidth = 2.2;
      for (let k = 0; k < 3; k++) { g.beginPath(); let px = x + (N.rnd() - 0.5) * w * 0.2, py = base - h + 4; g.moveTo(px, py); for (let s = 0; s < 6; s++) { px += (N.rnd() - 0.5) * 30; py += h / 6; g.lineTo(px, py); } g.stroke(); }
      glow(g, x, base - h, 35, hex('#ff7a1a'), 0.7);
      for (let p = 0; p < 6; p++) { g.fillStyle = `rgba(40,12,8,${0.35 - p * 0.04})`; g.beginPath(); g.arc(x + p * 8 + N.rnd() * 5, base - h - 12 - p * 16, 10 + p * 6, 0, Math.PI * 2); g.fill(); }
    }
    silhouette(g, (u) => 30 + r2(u) * 20, HZ + 34, hex('#120403'), hex('#2a0a05'));
    for (let i = 0; i < 260; i++) { g.fillStyle = `rgba(255,${120 + N.rnd() * 100},40,${0.3 + N.rnd() * 0.6})`; g.fillRect(N.rnd() * W, HZ - N.rnd() * 200, 1.5, 1.5); }
    hazeBand(g, hex('#ff5a00'), HZ + 46, 40, 0.35);
  },

  surf_void_garden(g, th, N) {
    g.drawImage(paintLayer((u, v) => {
      let c = mix(hex('#020008'), hex('#0e0322'), smooth(0, 1, v));
      const neb = N.fbm(u, v * 2, 3, 6);
      const neb2 = N.fbm(u + 0.37, v * 2 + 5, 5, 5);
      c = mix(c, hex('#5a189a'), smooth(0.45, 0.8, neb) * 0.75);
      c = mix(c, hex('#1fb6c9'), smooth(0.6, 0.85, neb2) * 0.45);
      c = mix(c, hex('#ff7ad9'), smooth(0.72, 0.9, neb * neb2 * 1.6) * 0.5);
      // milky band
      const band = Math.exp(-Math.pow((v - 0.35 - Math.sin(u * Math.PI * 2) * 0.12) * 7, 2));
      c = mix(c, hex('#cbb8ff'), band * 0.25 * N.fbm(u, v * 6, 8, 3));
      return c;
    }), 0, 0, W, H);
    stars(g, N.rnd, 2200, 1.0, 1);
    // big ringed planet
    const px = W * 0.72, py = HZ - 120, pr = 70;
    g.save();
    g.translate(px, py); g.rotate(-0.35);
    g.strokeStyle = 'rgba(224,170,255,0.5)'; g.lineWidth = 5; g.beginPath(); g.ellipse(0, 0, pr * 2, pr * 0.45, 0, Math.PI, Math.PI * 2); g.stroke();
    const pg = g.createRadialGradient(-pr * 0.4, -pr * 0.4, pr * 0.1, 0, 0, pr);
    pg.addColorStop(0, '#d6a2ff'); pg.addColorStop(0.6, '#6a2bb3'); pg.addColorStop(1, '#1a0636');
    g.fillStyle = pg; g.beginPath(); g.arc(0, 0, pr, 0, Math.PI * 2); g.fill();
    g.globalAlpha = 0.25; g.fillStyle = '#2a0a50';
    for (let i = -3; i <= 3; i++) g.fillRect(-pr, i * 14, pr * 2, 4);
    g.globalAlpha = 1;
    g.strokeStyle = 'rgba(224,170,255,0.6)'; g.lineWidth = 5; g.beginPath(); g.ellipse(0, 0, pr * 2, pr * 0.45, 0, 0, Math.PI); g.stroke();
    g.restore();
    glow(g, px, py, 150, hex('#c77dff'), 0.18);
    // small moon
    g.fillStyle = '#9fd8ff'; g.beginPath(); g.arc(W * 0.22, HZ - 200, 12, 0, Math.PI * 2); g.fill();
    glow(g, W * 0.22, HZ - 200, 50, hex('#7fd1ff'), 0.3);
  },
};

/** Equirectangular painted panorama for a map (cached). */
export function skyTexture(map) {
  if (cache.has(map.id)) return cache.get(map.id);
  const cv = document.createElement('canvas');
  cv.width = W; cv.height = H;
  const g = cv.getContext('2d');
  const th = map.theme;
  const N = periodicNoise(hashString(map.id));
  const painter = PAINTERS[map.id];
  if (painter) painter(g, th, N);
  else {
    const sky = skyGradient(hex(th.sky[0]), hex(th.sky[1]), hex(th.sky[2]), hex(th.fog));
    g.drawImage(paintLayer((u, v) => sky(v)), 0, 0, W, H);
  }
  // below the horizon fade into the map fog so geometry blends into the backdrop
  const fg = g.createLinearGradient(0, HZ + 30, 0, H);
  fg.addColorStop(0, css(hex(th.fog), 0));
  fg.addColorStop(0.35, css(hex(th.fog), 0.85));
  fg.addColorStop(1, css(hex(th.fog), 1));
  g.fillStyle = fg;
  g.fillRect(0, HZ + 30, W, H);
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.generateMipmaps = false;          // no mip seam where the panorama wraps
  tex.minFilter = THREE.LinearFilter;
  tex.magFilter = THREE.LinearFilter;
  cache.set(map.id, tex);
  return tex;
}

export function skyDome(map) {
  const mat = new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, depthTest: false, fog: false,
    uniforms: { map: { value: skyTexture(map) } },
    vertexShader: `varying vec3 vDir; void main(){ vDir = position; vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0); gl_Position = p.xyww; }`,
    fragmentShader: `uniform sampler2D map; varying vec3 vDir;
      void main(){
        vec3 d = normalize(vDir);
        float u = atan(d.y, d.x) * 0.15915494 + 0.5;
        float v = asin(clamp(d.z, -1.0, 1.0)) * 0.31830989 + 0.5;
        gl_FragColor = vec4(texture2D(map, vec2(u, v)).rgb, 1.0);
        #include <colorspace_fragment>
      }`,
  });
  const m = new THREE.Mesh(new THREE.SphereGeometry(1000, 48, 24), mat);
  m.frustumCulled = false;
  m.renderOrder = -10;
  return m;
}
