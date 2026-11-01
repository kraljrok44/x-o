// Procedural knife models (original designs). Every model is built from code:
// a ground blade (spine -> grind line -> sharp edge), handle, guard and model specific parts.
// Local frame: blade along +X from the guard (x = 0), edge facing -Y, spine +Y, thickness along Z.
// Units are centimetres; the viewmodel and avatars scale the result.

import * as THREE from 'three';


/**
 * Remove zero-area triangles (blade tips collapse to a point) and make sure no vertex normal
 * is zero/NaN. A NaN normal turns pixels NaN, which the bloom pass smears into black blocks.
 */
export function cleanGeometry(g) {
  if (!g.index) {
    const pos = g.attributes.position.array, uv = g.attributes.uv ? g.attributes.uv.array : null;
    const P = [], U = [];
    for (let i = 0; i < pos.length; i += 9) {
      const ax = pos[i + 3] - pos[i], ay = pos[i + 4] - pos[i + 1], az = pos[i + 5] - pos[i + 2];
      const bx = pos[i + 6] - pos[i], by = pos[i + 7] - pos[i + 1], bz = pos[i + 8] - pos[i + 2];
      const cx = ay * bz - az * by, cy = az * bx - ax * bz, cz = ax * by - ay * bx;
      if (cx * cx + cy * cy + cz * cz < 1e-10) continue;
      for (let k = 0; k < 9; k++) P.push(pos[i + k]);
      if (uv) { const j = (i / 3) * 2; for (let k = 0; k < 6; k++) U.push(uv[j + k]); }
    }
    g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
    if (uv) g.setAttribute('uv', new THREE.Float32BufferAttribute(U, 2));
  }
  g.computeVertexNormals();
  const n = g.attributes.normal;
  for (let i = 0; i < n.count; i++) {
    const x = n.getX(i), y = n.getY(i), z = n.getZ(i);
    const l = Math.hypot(x, y, z);
    if (!(l > 0.5)) n.setXYZ(i, 0, 0, 1);
  }
  n.needsUpdate = true;
  return g;
}

const clamp01 = (v) => Math.max(0, Math.min(1, v));
const smooth = (a, b, x) => { const t = clamp01((x - a) / (b - a)); return t * t * (3 - 2 * t); };

/**
 * Build a ground blade from spine and edge profiles.
 * @param {object} o
 *   L length, H heel height, spine(s)->y, edge(s)->y (s in 0..1), t thickness, grind 0..1,
 *   n samples, bend {R} optional arc bend (karambit style)
 */
export function bladeGeometry(o) {
  const n = o.n || 48;
  const t = o.t ?? 0.45;
  const grind = o.grind ?? 0.45;
  const S = [], E = [], Gd = [];
  for (let i = 0; i <= n; i++) {
    const s = i / n;
    const x = s * o.L;
    let ys = o.spine(s) * o.H;
    let ye = o.edge(s) * o.H;
    if (i === n) { const m = (ys + ye) / 2; ys = m; ye = m; }
    S.push([x, ys]); E.push([x, ye]);
    Gd.push([x, ye + (ys - ye) * grind]);
  }
  const bend = (p) => {
    if (!o.bend) return p;
    const { R } = o.bend; // positive R curves the tip downwards (edge on the inside)
    const a = p[0] / R;
    const r = R + p[1];
    return [r * Math.sin(a), r * Math.cos(a) - R];
  };

  const pos = [], uv = [];
  const W = o.L, Hh = o.H;
  const push = (p, z) => {
    const q = bend(p);
    pos.push(q[0], q[1], z);
    uv.push(p[0] / W, (p[1] + Hh * 0.2) / (Hh * 1.4));
  };
  const tri = (a, za, b, zb, c, zc) => { push(a, za); push(b, zb); push(c, zc); };
  const thick = (i) => t * (1 - 0.65 * Math.pow(i / n, 2)); // thinner towards the tip
  for (let i = 0; i < n; i++) {
    const j = i + 1;
    const ti = thick(i) / 2, tj = thick(j) / 2;
    const edgeZ = 0.02;
    for (const sg of [1, -1]) {
      // flat (spine -> grind)
      if (sg > 0) {
        tri(S[i], ti, Gd[i], ti, Gd[j], tj); tri(S[i], ti, Gd[j], tj, S[j], tj);
        tri(Gd[i], ti, E[i], edgeZ, E[j], edgeZ); tri(Gd[i], ti, E[j], edgeZ, Gd[j], tj);
      } else {
        tri(S[i], -ti, Gd[j], -tj, Gd[i], -ti); tri(S[i], -ti, S[j], -tj, Gd[j], -tj);
        tri(Gd[i], -ti, E[j], -edgeZ, E[i], -edgeZ); tri(Gd[i], -ti, Gd[j], -tj, E[j], -edgeZ);
      }
    }
    // spine strip
    tri(S[i], ti, S[j], tj, S[j], -tj); tri(S[i], ti, S[j], -tj, S[i], -ti);
  }
  // heel cap
  const h = thick(0) / 2;
  tri(S[0], h, S[0], -h, Gd[0], -h); tri(S[0], h, Gd[0], -h, Gd[0], h);
  tri(Gd[0], h, Gd[0], -h, E[0], 0);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  return cleanGeometry(g);
}

// Double edged (dagger) blade: symmetric bevels from a centre ridge.
export function daggerGeometry(o) {
  const n = o.n || 40;
  const t = o.t ?? 0.5;
  const pos = [], uv = [];
  const P = [];
  for (let i = 0; i <= n; i++) {
    const s = i / n;
    const half = o.width(s) * o.H / 2;
    P.push({ x: s * o.L, top: i === n ? 0 : half, bot: i === n ? 0 : -half, z: t * (1 - 0.7 * s) / 2 });
  }
  const push = (x, y, z) => { pos.push(x, y, z); uv.push(x / o.L, (y + o.H / 2) / o.H); };
  for (let i = 0; i < n; i++) {
    const a = P[i], b = P[i + 1];
    for (const sz of [1, -1]) {
      for (const edge of ['top', 'bot']) {
        const flip = (edge === 'top') === (sz > 0);
        const v = [[a.x, 0, a.z * sz], [a.x, a[edge], 0], [b.x, b[edge], 0], [b.x, 0, b.z * sz]];
        const f = flip ? [0, 1, 2, 0, 2, 3] : [0, 2, 1, 0, 3, 2];
        for (const k of f) push(...v[k]);
      }
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  return cleanGeometry(g);
}

/** Handle from a side outline (points in XY), extruded along Z with rounded edges. */
export function profileGeometry(points, depth, bevel = 0.35, holes = []) {
  const shape = new THREE.Shape(points.map((p) => new THREE.Vector2(p[0], p[1])));
  for (const h of holes) shape.holes.push(new THREE.Path(h.map((p) => new THREE.Vector2(p[0], p[1]))));
  const g = new THREE.ExtrudeGeometry(shape, {
    depth: Math.max(0.01, depth - bevel * 2), bevelEnabled: true, bevelThickness: bevel, bevelSize: bevel * 0.8,
    bevelSegments: 3, curveSegments: 10,
  });
  g.translate(0, 0, -(depth - bevel * 2) / 2);
  // planar UVs from XY
  g.computeBoundingBox();
  const bb = g.boundingBox, uvA = g.attributes.uv, pA = g.attributes.position;
  for (let i = 0; i < uvA.count; i++) {
    uvA.setXY(i, (pA.getX(i) - bb.min.x) / (bb.max.x - bb.min.x || 1), (pA.getY(i) - bb.min.y) / (bb.max.y - bb.min.y || 1));
  }
  return cleanGeometry(g);
}

function gripOutline(len, h0, h1, grooves = 0, butt = 0.6, startX = -0.2) {
  // top edge from guard to butt, bottom edge back with finger grooves
  const top = [], bot = [];
  const n = 24;
  for (let i = 0; i <= n; i++) {
    const s = i / n;
    const x = startX - s * len;
    const h = h0 + (h1 - h0) * s;
    top.push([x, h / 2 + Math.sin(s * Math.PI) * 0.15]);
    let yb = -h / 2 - Math.sin(s * Math.PI) * 0.25;
    if (grooves) yb += Math.max(0, Math.sin(s * Math.PI * grooves * 2 + Math.PI / 2)) * 0.28 * (s > 0.08 && s < 0.85 ? 1 : 0);
    bot.push([x, yb]);
  }
  const endX = startX - len;
  const cap = [];
  for (let i = 1; i < 6; i++) {
    const a = Math.PI / 2 + (i / 6) * Math.PI;
    cap.push([endX - Math.cos(a - Math.PI) * butt * 0 + Math.cos(a) * butt, (h1 / 2) * Math.sin(a) * 1.0]);
  }
  return [...top, ...cap, ...bot.reverse()];
}

function circlePts(cx, cy, r, n = 20) {
  const out = [];
  for (let i = 0; i < n; i++) { const a = (i / n) * Math.PI * 2; out.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r]); }
  return out;
}

// ------------------------------------------------------------------ blade profiles
const P = {
  drop: { spine: (s) => 1 - 0.62 * Math.pow(smooth(0.6, 1, s), 1.3), edge: (s) => 0.38 * Math.pow(smooth(0.45, 1, s), 1.8) },
  clip: { spine: (s) => (s < 0.58 ? 1 : 1 - 0.5 * ((s - 0.58) / 0.42)) - 0.06 * Math.sin(clamp01((s - 0.58) / 0.42) * Math.PI), edge: (s) => 0.5 * Math.pow(smooth(0.5, 1, s), 2) },
  spear: { spine: (s) => 1 - 0.5 * Math.pow(smooth(0.55, 1, s), 1.2), edge: (s) => 0.5 * Math.pow(smooth(0.55, 1, s), 1.2) },
  tanto: { spine: (s) => (s < 0.78 ? 1 : 1 - 0.62 * (s - 0.78) / 0.22), edge: (s) => (s < 0.8 ? 0.02 * s : 0.016 + 0.37 * Math.pow((s - 0.8) / 0.2, 0.7)) },
  slim: { spine: (s) => 1 - 0.55 * Math.pow(s, 2.2), edge: (s) => 0.45 * Math.pow(s, 3) },
  belly: { spine: (s) => 1 - 0.3 * Math.pow(smooth(0.65, 1, s), 1.4) + 0.05 * Math.sin(s * Math.PI), edge: (s) => -0.12 * Math.sin(s * Math.PI * 0.95) + 0.7 * Math.pow(smooth(0.7, 1, s), 2) },
  claw: { spine: (s) => 1 - 0.8 * Math.pow(s, 1.5), edge: (s) => 0.2 * Math.pow(s, 2) },
};

function serrate(fn, a, b, depth, count) {
  return (s) => {
    let y = fn(s);
    if (s > a && s < b) {
      const u = (s - a) / (b - a) * count;
      y -= depth * (1 - Math.abs((u % 1) * 2 - 1));
    }
    return y;
  };
}

function gutNotch(fn, a, b, depth) {
  return (s) => {
    let y = fn(s);
    if (s > a && s < b) y -= depth * Math.sin(((s - a) / (b - a)) * Math.PI) ** 0.6;
    return y;
  };
}

// ------------------------------------------------------------------ materials
export const HANDLE_MATS = {
  polymer: () => new THREE.MeshStandardMaterial({ color: 0x1b1d22, roughness: 0.75, metalness: 0.05 }),
  rubber: () => new THREE.MeshStandardMaterial({ color: 0x23262b, roughness: 0.9, metalness: 0.0 }),
  wood: () => new THREE.MeshStandardMaterial({ color: 0x5a3a22, roughness: 0.55, metalness: 0.0 }),
  steel: () => new THREE.MeshStandardMaterial({ color: 0x9aa1aa, roughness: 0.3, metalness: 1.0 }),
  dark: () => new THREE.MeshStandardMaterial({ color: 0x2c2f36, roughness: 0.4, metalness: 0.8 }),
  bone: () => new THREE.MeshStandardMaterial({ color: 0xd8cfbf, roughness: 0.6, metalness: 0.0 }),
};

function mesh(g, mat, role) {
  const m = new THREE.Mesh(g, mat);
  m.userData.role = role;
  m.castShadow = false;
  return m;
}

/**
 * Build a knife model group.
 * @param {string} modelId
 * @param {{blade:THREE.Material, handle?:THREE.Material, metal?:THREE.Material}} mats
 */
export function buildKnife(modelId, mats) {
  const grp = new THREE.Group();
  const blade = mats.blade;
  const handle = mats.handle || HANDLE_MATS.polymer();
  const metal = mats.metal || HANDLE_MATS.steel();
  const add = (g, m, role, fn) => { const o = mesh(g, m, role); if (fn) fn(o); grp.add(o); return o; };
  const bladeDef = (o) => add(bladeGeometry(o), blade, 'blade');

  switch (modelId) {
    case 'ranger': {
      bladeDef({ L: 15, H: 3.1, ...P.drop, t: 0.5, grind: 0.42 });
      add(profileGeometry([[0.2, 2.4], [-0.6, 2.6], [-0.6, -1.4], [0.2, -1.2]], 2.2, 0.25), metal, 'guard');
      add(profileGeometry(gripOutline(11, 2.6, 2.4, 3), 2.0, 0.4), handle, 'handle', (o) => o.position.set(-0.4, 0.6, 0));
      break;
    }
    case 'lancer': {
      bladeDef({ L: 17.5, H: 2.6, ...P.spear, t: 0.55, grind: 0.5, n: 56 });
      add(profileGeometry([[0.3, 3.2], [-0.4, 3.2], [-0.4, -2.2], [0.3, -2.2]], 1.6, 0.2), metal, 'guard');
      add(profileGeometry(gripOutline(11.5, 2.4, 2.4, 0, 0.4), 2.2, 0.45), handle, 'handle', (o) => o.position.set(-0.4, 0.5, 0));
      add(new THREE.TorusGeometry(1.0, 0.28, 10, 24), metal, 'ring', (o) => { o.position.set(-12.9, 1.6, 0); });
      // fuller groove suggestion: a thin dark inlay on both flats
      break;
    }
    case 'warden': {
      bladeDef({ L: 16.5, H: 3.5, spine: serrate(P.clip.spine, 0.12, 0.48, 0.08, 9), edge: P.clip.edge, t: 0.6, grind: 0.4, n: 80 });
      add(profileGeometry([[0.4, 4.1], [-0.6, 4.1], [-0.6, -2.0], [0.4, -2.0]], 2.4, 0.25), metal, 'guard');
      add(profileGeometry(gripOutline(12, 3.1, 3.3, 4, 0.8), 2.8, 0.55), handle, 'handle', (o) => o.position.set(-0.6, 0.9, 0));
      add(new THREE.CylinderGeometry(1.2, 1.4, 1.2, 16), metal, 'pommel', (o) => { o.rotation.z = Math.PI / 2; o.position.set(-13.4, 0.9, 0); });
      break;
    }
    case 'crescent': {
      bladeDef({ L: 9, H: 2.4, ...P.claw, t: 0.5, grind: 0.5, bend: { R: 6.5 } });
      add(profileGeometry(gripOutline(8.5, 2.6, 2.8, 2, 0.3), 2.0, 0.4), handle, 'handle', (o) => { o.position.set(-0.2, 0.9, 0); o.rotation.z = 0.25; });
      add(new THREE.TorusGeometry(1.7, 0.45, 12, 28), metal, 'ring', (o) => { o.position.set(-9.8, 3.6, 0); });
      break;
    }
    case 'moth': {
      bladeDef({ L: 11.5, H: 2.1, ...P.slim, t: 0.4, grind: 0.5 });
      const outline = [[0, 0.9], [-12, 0.9], [-12.6, 0.4], [-12.6, -0.4], [-12, -0.9], [0, -0.9], [0.4, 0]];
      const holes = [];
      for (let i = 0; i < 5; i++) holes.push(circlePts(-2 - i * 2.1, 0, 0.42, 12));
      for (const zz of [0.62, -0.62]) {
        add(profileGeometry(outline, 0.55, 0.12, holes), metal, 'handle', (o) => { o.position.set(-0.3, 1.0, zz); });
      }
      add(new THREE.CylinderGeometry(0.35, 0.35, 1.9, 12), metal, 'pin', (o) => { o.rotation.x = Math.PI / 2; o.position.set(0, 1.0, 0); });
      break;
    }
    case 'flicker': {
      bladeDef({ L: 10.5, H: 2.7, ...P.drop, t: 0.42, grind: 0.55 });
      add(new THREE.CylinderGeometry(0.9, 0.9, 1.6, 20), metal, 'pivot', (o) => { o.rotation.x = Math.PI / 2; o.position.set(-0.3, 1.5, 0); });
      add(profileGeometry(gripOutline(10.5, 2.6, 2.2, 0, 0.5), 1.4, 0.3), handle, 'handle', (o) => o.position.set(-0.4, 1.3, 0));
      break;
    }
    case 'hook': {
      bladeDef({ L: 12, H: 3.8, spine: gutNotch(P.drop.spine, 0.58, 0.8, 0.28), edge: P.belly.edge, t: 0.55, grind: 0.45, n: 72 });
      add(profileGeometry(gripOutline(10.5, 2.9, 2.7, 3, 0.6), 2.2, 0.45), handle, 'handle', (o) => o.position.set(-0.3, 1.2, 0));
      add(profileGeometry([[0.25, 3.6], [-0.4, 3.6], [-0.4, -0.6], [0.25, -0.6]], 2.4, 0.2), metal, 'guard');
      break;
    }
    case 'tracker': {
      bladeDef({ L: 16, H: 3.9, spine: serrate(P.clip.spine, 0.05, 0.3, 0.05, 7), edge: P.clip.edge, t: 0.6, grind: 0.38, n: 70 });
      add(profileGeometry([[0.3, 4.4], [-0.6, 4.4], [-0.6, -1.8], [0.3, -2.4]], 2.6, 0.3), metal, 'guard');
      add(profileGeometry(gripOutline(12, 3.0, 3.3, 3, 0.8), 2.6, 0.5), handle, 'handle', (o) => o.position.set(-0.6, 1.2, 0));
      break;
    }
    case 'scimitar': {
      bladeDef({ L: 14, H: 3.6, spine: (s) => 1 - 0.55 * Math.pow(smooth(0.5, 1, s), 1.3), edge: (s) => 0.45 * Math.pow(smooth(0.2, 1, s), 2.5), t: 0.5, grind: 0.45, bend: { R: -38 } });
      add(profileGeometry(gripOutline(10, 2.6, 2.9, 0, 0.9), 2.0, 0.45), handle, 'handle', (o) => { o.position.set(-0.3, 1.2, 0); o.rotation.z = -0.08; });
      add(new THREE.SphereGeometry(1.1, 16, 12), metal, 'pommel', (o) => o.position.set(-10.9, 0.6, 0));
      break;
    }
    case 'cleaver': {
      bladeDef({ L: 19.5, H: 4.6, ...P.clip, t: 0.7, grind: 0.38, n: 70 });
      add(profileGeometry([[0.5, 5.6], [-0.7, 5.6], [-0.7, -2.2], [0.5, -2.6]], 3.0, 0.3), metal, 'guard');
      add(profileGeometry(gripOutline(13, 3.2, 3.6, 0, 1.0), 3.0, 0.6), handle, 'handle', (o) => o.position.set(-0.7, 1.6, 0));
      add(new THREE.CylinderGeometry(1.4, 1.6, 1.0, 16), metal, 'pommel', (o) => { o.rotation.z = Math.PI / 2; o.position.set(-14.4, 1.6, 0); });
      break;
    }
    case 'twin': {
      // two push daggers side by side, T-bar grips perpendicular to the blade
      for (const zz of [-2.2, 2.2]) {
        const g = new THREE.Group();
        const b = mesh(daggerGeometry({ L: 8.5, H: 3.2, width: (s) => 1 - 0.95 * Math.pow(s, 1.3), t: 0.55 }), blade, 'blade');
        g.add(b);
        const tbar = mesh(profileGeometry([[0, 1.6], [-1.2, 1.6], [-1.6, 4.5], [-2.8, 4.5], [-2.8, -4.5], [-1.6, -4.5], [-1.2, -1.6], [0, -1.6]], 1.6, 0.35), handle, 'handle');
        g.add(tbar);
        g.position.set(0, 0, zz);
        g.rotation.y = zz > 0 ? 0.12 : -0.12;
        grp.add(g);
      }
      break;
    }
    case 'switch': {
      bladeDef({ L: 9, H: 1.7, ...P.slim, t: 0.32, grind: 0.55 });
      add(new THREE.CylinderGeometry(0.7, 0.7, 1.2, 18), metal, 'bolster', (o) => { o.rotation.x = Math.PI / 2; o.position.set(-0.4, 0.8, 0); });
      add(profileGeometry(gripOutline(9.5, 1.9, 1.6, 0, 0.4), 1.2, 0.28), mats.handle || HANDLE_MATS.wood(), 'handle', (o) => o.position.set(-0.6, 0.85, 0));
      break;
    }
    case 'needle': {
      add(daggerGeometry({ L: 17, H: 1.9, width: (s) => 1 - 0.6 * s - 0.4 * Math.pow(s, 4), t: 0.5, n: 60 }), blade, 'blade', (o) => o.position.set(0, 0.9, 0));
      add(profileGeometry([[0.25, 2.8], [-0.35, 2.8], [-0.35, -1.0], [0.25, -1.0]], 1.2, 0.18), metal, 'guard');
      add(profileGeometry(gripOutline(10.5, 1.9, 1.7, 0, 0.5), 1.6, 0.4), handle, 'handle', (o) => o.position.set(-0.35, 0.9, 0));
      add(new THREE.SphereGeometry(0.8, 14, 10), metal, 'pommel', (o) => o.position.set(-11.2, 0.9, 0));
      break;
    }
    case 'raptor': {
      bladeDef({ L: 11.5, H: 2.6, spine: (s) => 1 - 0.75 * Math.pow(s, 1.7), edge: (s) => 0.25 * Math.pow(s, 2.2), t: 0.5, grind: 0.5, bend: { R: 13 } });
      add(profileGeometry(gripOutline(10, 2.6, 2.6, 0, 0.3), 1.8, 0.4), handle, 'handle', (o) => { o.position.set(-0.2, 1.0, 0); o.rotation.z = 0.12; });
      add(new THREE.TorusGeometry(1.5, 0.38, 12, 28), metal, 'ring', (o) => { o.position.set(-11.2, 2.8, 0); });
      break;
    }
    case 'grizzly': {
      bladeDef({ L: 11, H: 3.3, ...P.tanto, t: 0.6, grind: 0.35 });
      add(profileGeometry([[0.25, 3.8], [-0.5, 3.8], [-0.5, -0.9], [0.25, -0.9]], 2.4, 0.2), metal, 'guard');
      add(profileGeometry(gripOutline(10.5, 2.8, 2.8, 2, 0.4), 2.4, 0.35), handle, 'handle', (o) => o.position.set(-0.5, 1.4, 0));
      break;
    }
    default: {
      bladeDef({ L: 14, H: 3, ...P.drop });
      add(profileGeometry(gripOutline(11, 2.6, 2.4, 3), 2.0, 0.4), handle, 'handle', (o) => o.position.set(-0.4, 0.6, 0));
    }
  }

  // centre the model around its grip point for nicer rotations
  const box = new THREE.Box3().setFromObject(grp);
  grp.userData.bounds = box;
  grp.userData.length = box.max.x - box.min.x;
  return grp;
}

/** Which handle material a model uses by default. */
export function defaultHandle(modelId) {
  switch (modelId) {
    case 'moth': case 'needle': return 'steel';
    case 'switch': case 'scimitar': return 'wood';
    case 'lancer': case 'tracker': case 'cleaver': return 'rubber';
    case 'twin': return 'dark';
    default: return 'polymer';
  }
}
