// Procedural skin textures. Every skin is a deterministic recipe (pattern + palette + seed),
// so the same collectible always looks identical (crate spec 4.5, 4.9).

import * as THREE from 'three';
import { getSkin, getCollectible } from '../../shared/catalog.js';
import { rng32 } from '../../shared/vec.js';
import { buildKnife, HANDLE_MATS, defaultHandle } from './knives.js';

const W = 512, H = 256;
const texCache = new Map();

function makeNoise(seed) {
  const rnd = rng32(seed * 7919 + 13);
  const perm = new Uint8Array(512);
  const vals = new Float32Array(256);
  for (let i = 0; i < 256; i++) { perm[i] = i; vals[i] = rnd(); }
  for (let i = 255; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [perm[i], perm[j]] = [perm[j], perm[i]]; }
  for (let i = 0; i < 256; i++) perm[256 + i] = perm[i];
  const lerp = (a, b, t) => a + (b - a) * t;
  const fade = (t) => t * t * (3 - 2 * t);
  const v = (x, y) => vals[perm[(perm[x & 255] + y) & 255]];
  const n2 = (x, y) => {
    const xi = Math.floor(x), yi = Math.floor(y);
    const xf = x - xi, yf = y - yi;
    const u = fade(xf), w = fade(yf);
    return lerp(lerp(v(xi, yi), v(xi + 1, yi), u), lerp(v(xi, yi + 1), v(xi + 1, yi + 1), u), w);
  };
  const fbm = (x, y, oct = 4) => {
    let a = 0, amp = 0.5, f = 1, norm = 0;
    for (let i = 0; i < oct; i++) { a += amp * n2(x * f, y * f); norm += amp; amp *= 0.5; f *= 2; }
    return a / norm;
  };
  return { n2, fbm, rnd };
}

function hexRgb(h) {
  const n = parseInt(h.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function palette(colors, t) {
  const c = colors.map(hexRgb);
  t = Math.max(0, Math.min(0.9999, t)) * (c.length - 1);
  const i = Math.floor(t), f = t - i;
  const a = c[i], b = c[Math.min(c.length - 1, i + 1)];
  return [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f, a[2] + (b[2] - a[2]) * f];
}

function pixelPattern(ctx, fn) {
  const img = ctx.createImageData(W, H);
  const d = img.data;
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const c = fn(x / W, y / H, x, y);
      const k = (y * W + x) * 4;
      d[k] = c[0]; d[k + 1] = c[1]; d[k + 2] = c[2]; d[k + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
}

function drawSkin(ctx, skin) {
  const N = makeNoise(skin.seed);
  const C = skin.colors;
  const rnd = N.rnd;
  switch (skin.pattern) {
    case 'brushed':
      pixelPattern(ctx, (u, v) => {
        const s = N.n2(u * 3, v * 140) * 0.5 + N.n2(u * 9, v * 300) * 0.5;
        return palette(C, 0.25 + s * 0.6 - v * 0.2);
      });
      break;
    case 'flow':
      pixelPattern(ctx, (u, v) => {
        const wx = N.fbm(u * 3, v * 2) * 2.2, wy = N.fbm(u * 3 + 7, v * 2 + 3) * 2.2;
        const f = N.fbm(u * 2.4 + wx, v * 2.4 + wy, 5);
        const t = Math.pow(Math.max(0, Math.min(1, (f - 0.25) * 1.9)), 1.2);
        const c = palette(C, t);
        const glint = Math.pow(N.n2(u * 80, v * 40), 18) * 255;
        return [Math.min(255, c[0] + glint), Math.min(255, c[1] + glint), Math.min(255, c[2] + glint)];
      });
      break;
    case 'gradient':
      pixelPattern(ctx, (u, v) => palette(C, u * 0.85 + v * 0.25 + (N.fbm(u * 4, v * 4) - 0.5) * 0.12));
      break;
    case 'marble':
      pixelPattern(ctx, (u, v) => {
        const w = N.fbm(u * 3, v * 3, 5);
        const t = (Math.sin((u * 3 + w * 4) * Math.PI) * 0.5 + 0.5) * 0.7 + w * 0.3;
        return palette(C, t);
      });
      break;
    case 'stripes': {
      pixelPattern(ctx, (u, v) => palette([C[0], C[1]], 0.3 + v * 0.5 + N.fbm(u * 6, v * 6) * 0.2));
      ctx.fillStyle = C[2];
      for (let i = 0; i < 16; i++) {
        const x0 = rnd() * W * 1.2 - 40;
        ctx.beginPath();
        ctx.moveTo(x0, -10);
        const wdt = 6 + rnd() * 16;
        ctx.bezierCurveTo(x0 + 30 + rnd() * 30, H * 0.3, x0 - 20 + rnd() * 40, H * 0.7, x0 + 50 + rnd() * 30, H + 10);
        ctx.lineTo(x0 + 50 + wdt, H + 10);
        ctx.bezierCurveTo(x0 + wdt + rnd() * 30, H * 0.7, x0 + wdt + 30, H * 0.3, x0 + wdt * 0.4, -10);
        ctx.fill();
      }
      break;
    }
    case 'lace':
      pixelPattern(ctx, (u, v) => {
        const f = N.fbm(u * 5, v * 3, 5);
        const g = N.fbm(u * 11 + 3, v * 7, 3);
        if (f > 0.56 && g > 0.42) return hexRgb(C[2]);
        return palette([C[0], C[1]], f);
      });
      break;
    case 'temper':
      pixelPattern(ctx, (u, v) => {
        const f = N.fbm(u * 3.5, v * 3.5, 5);
        const g = N.fbm(u * 7 + 11, v * 7, 3);
        return palette(C, f * 0.75 + g * 0.25);
      });
      break;
    case 'blued':
      pixelPattern(ctx, (u, v) => palette(C, N.fbm(u * 2, v * 2) * 0.8 + v * 0.2));
      break;
    case 'stain':
      pixelPattern(ctx, (u, v) => {
        const base = hexRgb(C[3]);
        const f = N.fbm(u * 3, v * 3, 5);
        const tint = palette(C.slice(0, 3), N.fbm(u * 2 + 5, v * 2));
        const k = Math.max(0, Math.min(1, (f - 0.42) * 3));
        return base.map((b, i) => b * (1 - k) + tint[i] * k);
      });
      break;
    case 'night':
      pixelPattern(ctx, (u, v) => palette(C, N.fbm(u * 4, v * 4) * 0.7));
      break;
    case 'violet':
      pixelPattern(ctx, (u, v) => {
        const f = N.fbm(u * 2.5, v * 5);
        const streak = Math.pow(Math.abs(Math.sin((v * 6 + f * 3) * Math.PI)), 30);
        return palette(C, Math.min(1, f * 0.7 + streak * 0.6));
      });
      break;
    case 'camo':
      pixelPattern(ctx, (u, v) => {
        const a = N.fbm(u * 4, v * 2.5, 4), b = N.fbm(u * 4 + 9, v * 2.5 + 4, 4);
        if (a > 0.58) return hexRgb(C[2]);
        if (b > 0.55) return hexRgb(C[1]);
        if (a < 0.38) return hexRgb(C[3]);
        return hexRgb(C[0]);
      });
      break;
    case 'digital':
      pixelPattern(ctx, (u, v, x, y) => {
        const cx = Math.floor(x / 10), cy = Math.floor(y / 10);
        const a = N.fbm(cx * 0.12, cy * 0.12, 3), b = N.fbm(cx * 0.12 + 5, cy * 0.12 + 5, 3);
        if (a > 0.58) return hexRgb(C[2]);
        if (b > 0.56) return hexRgb(C[1]);
        if (a < 0.4) return hexRgb(C[3]);
        return hexRgb(C[0]);
      });
      break;
    case 'char':
      pixelPattern(ctx, (u, v) => {
        const f = N.fbm(u * 4, v * 4, 5);
        const sp = N.n2(u * 160, v * 80) > 0.92 ? 0.4 : 0;
        return palette(C, Math.min(1, f * 0.9 + sp));
      });
      break;
    case 'mesh':
      pixelPattern(ctx, (u, v, x, y) => {
        const base = palette([C[0], C[1]], N.fbm(u * 3, v * 3));
        const l = (Math.abs(((x + y) % 18) - 9) < 1.2) || (Math.abs(((x - y + 999) % 18) - 9) < 1.2);
        return l ? hexRgb(C[2]) : base;
      });
      break;
    case 'web': {
      pixelPattern(ctx, (u, v) => palette([C[0], C[1]], N.fbm(u * 3, v * 3)));
      ctx.strokeStyle = C[2];
      ctx.lineWidth = 2;
      const cx = W * (0.4 + rnd() * 0.2), cy = H * (0.4 + rnd() * 0.2);
      const spokes = 14;
      const ang = [];
      for (let i = 0; i < spokes; i++) ang.push((i / spokes) * Math.PI * 2 + rnd() * 0.2);
      for (const a of ang) { ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(cx + Math.cos(a) * 600, cy + Math.sin(a) * 600); ctx.stroke(); }
      for (let r = 18; r < 600; r *= 1.35) {
        ctx.beginPath();
        ang.forEach((a, i) => { const rr = r * (0.9 + rnd() * 0.2); const x = cx + Math.cos(a) * rr, y = cy + Math.sin(a) * rr; if (i) ctx.lineTo(x, y); else ctx.moveTo(x, y); });
        ctx.closePath();
        ctx.stroke();
      }
      break;
    }
    case 'rust':
      pixelPattern(ctx, (u, v) => {
        const f = N.fbm(u * 6, v * 6, 5), g = N.fbm(u * 2, v * 2, 3);
        if (g > 0.62) return palette([C[3], '#b0b0b0'], N.n2(u * 50, v * 20));
        return palette(C.slice(0, 3), f);
      });
      break;
    case 'scratched': {
      pixelPattern(ctx, (u, v) => palette([C[0], '#3a3f46'], N.fbm(u * 3, v * 3)));
      ctx.strokeStyle = C[1];
      for (let i = 0; i < 220; i++) {
        ctx.globalAlpha = 0.2 + rnd() * 0.6;
        ctx.lineWidth = 0.6 + rnd() * 1.2;
        const x = rnd() * W, y = rnd() * H, a = (rnd() - 0.5) * 1.2, l = 10 + rnd() * 80;
        ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + Math.cos(a) * l, y + Math.sin(a) * l); ctx.stroke();
      }
      ctx.globalAlpha = 1;
      break;
    }
    case 'gear': {
      pixelPattern(ctx, (u, v) => palette([C[0], C[1]], N.fbm(u * 3, v * 3)));
      ctx.fillStyle = C[2];
      ctx.strokeStyle = C[3];
      ctx.lineWidth = 3;
      for (let i = 0; i < 9; i++) {
        const x = rnd() * W, y = rnd() * H, w = 30 + rnd() * 90, h = 8 + rnd() * 20;
        ctx.fillRect(x, y, w, h); ctx.strokeRect(x, y, w, h);
      }
      for (let i = 0; i < 5; i++) {
        const x = rnd() * W, y = rnd() * H, r = 10 + rnd() * 22;
        ctx.beginPath();
        for (let k = 0; k <= 24; k++) { const a = (k / 24) * Math.PI * 2; const rr = r * (k % 2 ? 1 : 1.25); ctx.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr); }
        ctx.fill(); ctx.stroke();
        ctx.beginPath(); ctx.arc(x, y, r * 0.35, 0, Math.PI * 2); ctx.fillStyle = C[3]; ctx.fill(); ctx.fillStyle = C[2];
      }
      break;
    }
    case 'laminate':
      pixelPattern(ctx, (u, v) => {
        const band = Math.sin((v * 40 + N.fbm(u * 2, v * 2) * 6) * Math.PI);
        return palette(C, band * 0.5 + 0.5);
      });
      break;
    case 'relic': {
      pixelPattern(ctx, (u, v) => palette([C[0], C[3]], N.fbm(u * 3, v * 3)));
      ctx.strokeStyle = C[1];
      ctx.lineCap = 'round';
      for (let i = 0; i < 26; i++) {
        const x = rnd() * W, y = rnd() * H, r = 8 + rnd() * 26;
        ctx.lineWidth = 2 + rnd() * 2.5;
        ctx.beginPath();
        for (let a = 0; a < Math.PI * 4; a += 0.2) { const rr = r * (1 - a / (Math.PI * 4.4)); ctx.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr); }
        ctx.stroke();
      }
      ctx.strokeStyle = C[2];
      ctx.lineWidth = 3;
      ctx.beginPath(); ctx.moveTo(0, H * 0.5); for (let x = 0; x <= W; x += 8) ctx.lineTo(x, H * 0.5 + Math.sin(x / 18) * 12); ctx.stroke();
      break;
    }
    case 'sketch': {
      pixelPattern(ctx, (u, v) => palette([C[0], '#d9d4c7'], N.fbm(u * 5, v * 5) * 0.6));
      for (let i = 0; i < 90; i++) {
        ctx.strokeStyle = C[1 + Math.floor(rnd() * 3)];
        ctx.globalAlpha = 0.5 + rnd() * 0.5;
        ctx.lineWidth = 1 + rnd() * 3;
        ctx.beginPath();
        let x = rnd() * W, y = rnd() * H;
        ctx.moveTo(x, y);
        for (let k = 0; k < 4; k++) { x += (rnd() - 0.5) * 80; y += (rnd() - 0.5) * 50; ctx.quadraticCurveTo(x + (rnd() - 0.5) * 40, y + (rnd() - 0.5) * 40, x, y); }
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
      break;
    }
    case 'damascus':
      pixelPattern(ctx, (u, v) => {
        const f = N.fbm(u * 3, v * 3, 5);
        const t = Math.sin((v * 22 + u * 4 + f * 9) * Math.PI) * 0.5 + 0.5;
        return palette(C, t);
      });
      break;
    default:
      pixelPattern(ctx, () => hexRgb(C[0]));
  }
}

export function skinTexture(skinId) {
  if (texCache.has(skinId)) return texCache.get(skinId);
  const skin = getSkin(skinId) || getSkin('factory');
  const cv = document.createElement('canvas');
  cv.width = W; cv.height = H;
  const ctx = cv.getContext('2d');
  drawSkin(ctx, skin);
  // subtle wear / edge darkening shared by all skins
  const g = ctx.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, 'rgba(255,255,255,0.06)');
  g.addColorStop(0.5, 'rgba(0,0,0,0)');
  g.addColorStop(1, 'rgba(0,0,0,0.1)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  texCache.set(skinId, tex);
  return tex;
}

export function skinMaterial(skinId) {
  const skin = getSkin(skinId) || getSkin('factory');
  return new THREE.MeshPhysicalMaterial({
    map: skinTexture(skin.id),
    metalness: skin.metal,
    roughness: skin.rough,
    clearcoat: skin.clearcoat || 0,
    clearcoatRoughness: 0.08,
    envMapIntensity: 1.25,
    side: THREE.DoubleSide,
  });
}

/** Build the full 3D model of a collectible (model + skin). */
export function buildCollectible(collectibleId) {
  const col = getCollectible(collectibleId) || getCollectible('ranger__factory');
  const blade = skinMaterial(col.skin_id);
  const skin = getSkin(col.skin_id);
  // camo/special skins also cover the handle for a coherent look
  const handle = ['camo', 'special'].includes(skin.group)
    ? new THREE.MeshStandardMaterial({ map: skinTexture(skin.id), roughness: 0.7, metalness: 0.1 })
    : HANDLE_MATS[defaultHandle(col.model_id)]();
  const knife = buildKnife(col.model_id, { blade, handle });
  knife.userData.collectible = col;
  return knife;
}

export function disposeObject(obj) {
  obj.traverse((o) => {
    if (o.geometry) o.geometry.dispose();
    if (o.material) {
      const ms = Array.isArray(o.material) ? o.material : [o.material];
      for (const m of ms) m.dispose(); // textures are cached and shared, keep them
    }
  });
}
