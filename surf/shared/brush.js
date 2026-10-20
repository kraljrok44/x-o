// Convex brushes: the collision primitives of every map (spec 3.3, 6.9).
// A brush is a convex polyhedron given by vertices + faces. From the faces we derive
// outward planes, then add axial and edge bevel planes so that a box trace against the
// expanded planes equals the exact Minkowski sum (no invisible ledges at seams = no "ramp bugs").

import { vsub, vcross, vdot, vnorm, vlen } from './vec.js';

const AXES = [
  { x: 1, y: 0, z: 0 },
  { x: 0, y: 1, z: 0 },
  { x: 0, y: 0, z: 1 },
];

function toVec(p) {
  return Array.isArray(p) ? { x: p[0], y: p[1], z: p[2] } : { x: p.x, y: p.y, z: p.z };
}

function planeDup(planes, n, d) {
  for (const p of planes) {
    if (Math.abs(p.x - n.x) < 1e-5 && Math.abs(p.y - n.y) < 1e-5 && Math.abs(p.z - n.z) < 1e-5 && Math.abs(p.d - d) < 0.01) {
      return true;
    }
  }
  return false;
}

/**
 * @param {Array} verts   vertex list ([x,y,z] or {x,y,z})
 * @param {number[][]} faces polygon vertex indices (winding is fixed automatically)
 * @param {string} mat    material tag (used by the renderer and by surface sounds)
 */
export function makeBrush(verts, faces, mat = 'platform', tag = null) {
  const V = verts.map(toVec);
  const centroid = { x: 0, y: 0, z: 0 };
  for (const v of V) { centroid.x += v.x; centroid.y += v.y; centroid.z += v.z; }
  centroid.x /= V.length; centroid.y /= V.length; centroid.z /= V.length;

  const planes = [];
  const outFaces = [];
  for (const f0 of faces) {
    let f = f0.slice();
    // find a non-degenerate triple for the normal
    let n = null;
    for (let i = 0; i < f.length && !n; i++) {
      const a = V[f[0]], b = V[f[(i + 1) % f.length]], c = V[f[(i + 2) % f.length]];
      const cr = vcross(vsub(b, a), vsub(c, a));
      if (vlen(cr) > 1e-6) n = vnorm(cr);
    }
    if (!n) continue; // degenerate face
    let d = vdot(n, V[f[0]]);
    if (vdot(n, centroid) - d > 0) { // pointing inwards -> flip
      n = { x: -n.x, y: -n.y, z: -n.z };
      d = -d;
      f = f.reverse();
    }
    outFaces.push({ idx: f, n });
    if (!planeDup(planes, n, d)) planes.push({ x: n.x, y: n.y, z: n.z, d, face: true });
  }

  const min = { x: Infinity, y: Infinity, z: Infinity };
  const max = { x: -Infinity, y: -Infinity, z: -Infinity };
  for (const v of V) {
    min.x = Math.min(min.x, v.x); min.y = Math.min(min.y, v.y); min.z = Math.min(min.z, v.z);
    max.x = Math.max(max.x, v.x); max.y = Math.max(max.y, v.y); max.z = Math.max(max.z, v.z);
  }

  // Axial bevels
  const axial = [
    [{ x: 1, y: 0, z: 0 }, max.x], [{ x: -1, y: 0, z: 0 }, -min.x],
    [{ x: 0, y: 1, z: 0 }, max.y], [{ x: 0, y: -1, z: 0 }, -min.y],
    [{ x: 0, y: 0, z: 1 }, max.z], [{ x: 0, y: 0, z: -1 }, -min.z],
  ];
  for (const [n, d] of axial) if (!planeDup(planes, n, d)) planes.push({ x: n.x, y: n.y, z: n.z, d, face: false });

  // Edge bevels: edge direction x axis, kept only if it is a supporting plane.
  const edgeSet = new Set();
  for (const f of outFaces) {
    for (let i = 0; i < f.idx.length; i++) {
      const a = f.idx[i], b = f.idx[(i + 1) % f.idx.length];
      const key = a < b ? a + ':' + b : b + ':' + a;
      if (edgeSet.has(key)) continue;
      edgeSet.add(key);
      const e = vnorm(vsub(V[b], V[a]));
      for (const ax of AXES) {
        for (const s of [1, -1]) {
          const c = vcross(e, { x: ax.x * s, y: ax.y * s, z: ax.z * s });
          if (vlen(c) < 0.1) continue;
          const n = vnorm(c);
          const d = vdot(n, V[a]);
          let ok = true;
          for (const v of V) if (vdot(n, v) - d > 0.01) { ok = false; break; }
          if (ok && !planeDup(planes, n, d)) planes.push({ x: n.x, y: n.y, z: n.z, d, face: false });
        }
      }
    }
  }

  return { verts: V, faces: outFaces, planes, min, max, mat, tag };
}

// Prism between two caps with equal vertex counts (caps are convex polygons).
export function prismBrush(capA, capB, mat, tag) {
  const n = capA.length;
  const verts = [...capA, ...capB];
  const faces = [];
  faces.push([...Array(n).keys()]);
  faces.push([...Array(n).keys()].map((i) => n + i));
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    faces.push([i, j, n + j, n + i]);
  }
  return makeBrush(verts, faces, mat, tag);
}

export function boxBrush(min, max, mat = 'platform', tag = null) {
  const [x0, y0, z0] = min, [x1, y1, z1] = max;
  const a = [[x0, y0, z0], [x1, y0, z0], [x1, y1, z0], [x0, y1, z0]];
  const b = [[x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1]];
  return prismBrush(a, b, mat, tag);
}

// Oriented box: centre (x,y), yaw (radians), half length along heading / half width, z range.
export function orientedBoxBrush(cx, cy, yaw, hl, hw, z0, z1, mat = 'platform', tag = null) {
  const c = Math.cos(yaw), s = Math.sin(yaw);
  const corner = (u, v) => [cx + c * u - s * v, cy + s * u + c * v];
  const pts = [corner(-hl, -hw), corner(hl, -hw), corner(hl, hw), corner(-hl, hw)];
  const a = pts.map((p) => [p[0], p[1], z0]);
  const b = pts.map((p) => [p[0], p[1], z1]);
  return prismBrush(a, b, mat, tag);
}

/**
 * Surf ramp along a ridge path, built so that every riding face is exactly planar and
 * neighbouring segments share their slope edges and caps (continuous surface, no ramp bugs).
 * Each segment i has its own slope plane through its ridge line; the base vertex at an
 * interior joint is the intersection of the two neighbouring slope planes with the
 * horizontal plane d units below the ridge point.
 * @param {number[][]} points ridge points [x,y,z]
 * @param {{w:number,d:number,sides:'both'|'left'|'right'}} opt
 */
export function surfRampBrushes(points, opt, mat = 'ramp', tag = null) {
  const { w, d } = opt;
  const sides = opt.sides || 'both';
  const P = points.map(toVec);
  const n = P.length;
  const segs = [];
  for (let i = 0; i < n - 1; i++) {
    const D = vnorm(vsub(P[i + 1], P[i]));
    const hl = Math.hypot(D.x, D.y);
    const L = { x: -D.y / hl, y: D.x / hl, z: 0 };
    const plane = (sgn) => {
      const S = { x: L.x * w * sgn, y: L.y * w * sgn, z: -d };
      let nn = vnorm(vcross(D, S));
      if (nn.z < 0) nn = { x: -nn.x, y: -nn.y, z: -nn.z };
      return nn;
    };
    segs.push({ D, L, nl: plane(1), nr: plane(-1) });
  }
  const baseAt = (j, sgn) => {
    const p = P[j];
    const own = j === 0 ? segs[0] : segs[j - 1];
    const fallback = { x: p.x + own.L.x * w * sgn, y: p.y + own.L.y * w * sgn, z: p.z - d };
    if (j === 0 || j === n - 1) return fallback;
    const a = sgn > 0 ? segs[j - 1].nl : segs[j - 1].nr;
    const b = sgn > 0 ? segs[j].nl : segs[j].nr;
    const dir = vcross(a, b);
    if (vlen(dir) < 1e-6 || Math.abs(dir.z) < 1e-6) return fallback;
    const t = -d / dir.z;
    return { x: p.x + dir.x * t, y: p.y + dir.y * t, z: p.z - d };
  };
  const sections = [];
  for (let j = 0; j < n; j++) {
    const p = P[j];
    const under = { x: p.x, y: p.y, z: p.z - d };
    if (sides === 'left') sections.push([p, baseAt(j, 1), under]);
    else if (sides === 'right') sections.push([p, under, baseAt(j, -1)]);
    else sections.push([p, baseAt(j, 1), baseAt(j, -1)]);
  }
  const brushes = [];
  for (let i = 0; i < n - 1; i++) {
    const A = sections[i], B = sections[i + 1];
    const verts = [A[0], A[1], A[2], B[0], B[1], B[2]];
    // faces: caps, two slope/wall quads through the ridge, bottom split along its convex diagonal
    const faces = [[0, 1, 2], [3, 4, 5], [0, 1, 4, 3], [0, 2, 5, 3]];
    const n1 = vcross(vsub(verts[2], verts[1]), vsub(verts[5], verts[1]));
    const side = vdot(n1, vsub(verts[4], verts[1]));
    // pick the diagonal whose triangles keep the 4th point inside (convex hull of the bottom)
    if (side * vdot(n1, vsub(verts[0], verts[1])) >= 0) faces.push([1, 2, 5], [1, 5, 4]);
    else faces.push([1, 2, 4], [2, 5, 4]);
    brushes.push(makeBrush(verts, faces, mat, tag));
  }
  return { brushes, sections };
}
