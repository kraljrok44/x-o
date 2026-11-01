// Collision world: swept box traces against convex brushes (spec 6.9 sweep-and-slide).
// Algorithm: expand each brush plane by the box support distance and clip the moving
// box centre segment against the resulting convex volume (Quake/Source style).

import { PHYS } from './config.js';

const EPS = PHYS.distEpsilon;
const CELL = 1024;

export class CollisionWorld {
  constructor(brushes) {
    this.brushes = brushes;
    this.grid = new Map();
    this.stamp = 0;
    this.traceCount = 0;
    brushes.forEach((b, i) => {
      b._stamp = 0;
      b._id = i;
      const x0 = Math.floor(b.min.x / CELL), x1 = Math.floor(b.max.x / CELL);
      const y0 = Math.floor(b.min.y / CELL), y1 = Math.floor(b.max.y / CELL);
      for (let x = x0; x <= x1; x++) {
        for (let y = y0; y <= y1; y++) {
          const k = x * 73856093 ^ y * 19349663;
          let list = this.grid.get(k);
          if (!list) this.grid.set(k, (list = []));
          list.push(b);
        }
      }
    });
  }

  _gather(minx, miny, maxx, maxy, out) {
    this.stamp++;
    out.length = 0;
    const x0 = Math.floor(minx / CELL), x1 = Math.floor(maxx / CELL);
    const y0 = Math.floor(miny / CELL), y1 = Math.floor(maxy / CELL);
    if ((x1 - x0 + 1) * (y1 - y0 + 1) > 400) { // giant sweep (teleport-sized): just test everything
      for (const b of this.brushes) out.push(b);
      return out;
    }
    for (let x = x0; x <= x1; x++) {
      for (let y = y0; y <= y1; y++) {
        const list = this.grid.get(x * 73856093 ^ y * 19349663);
        if (!list) continue;
        for (const b of list) {
          if (b._stamp === this.stamp) continue;
          b._stamp = this.stamp;
          out.push(b);
        }
      }
    }
    return out;
  }

  /**
   * Trace an axis aligned box from start to end (both are player origins = feet).
   * @returns {{fraction:number,end:{x,y,z},normal:{x,y,z}|null,startSolid:boolean,allSolid:boolean,brush:object|null}}
   */
  traceBox(start, end, half = PHYS.hullHalf, zOff = PHYS.hullZOffset) {
    this.traceCount++;
    const hx = half[0], hy = half[1], hz = half[2];
    const sx = start.x, sy = start.y, sz = start.z + zOff;
    const ex = end.x, ey = end.y, ez = end.z + zOff;
    const res = { fraction: 1, end: null, normal: null, startSolid: false, allSolid: false, brush: null };
    const minx = Math.min(sx, ex) - hx - 1, maxx = Math.max(sx, ex) + hx + 1;
    const miny = Math.min(sy, ey) - hy - 1, maxy = Math.max(sy, ey) + hy + 1;
    const minz = Math.min(sz, ez) - hz - 1, maxz = Math.max(sz, ez) + hz + 1;
    const cands = this._gather(minx, miny, maxx, maxy, (this._tmp ||= []));
    const moveLen = Math.hypot(ex - sx, ey - sy, ez - sz);
    for (const b of cands) {
      if (b.max.x < minx || b.min.x > maxx || b.max.y < miny || b.min.y > maxy || b.max.z < minz || b.min.z > maxz) continue;
      let enterFrac = -1, leaveFrac = 1, clip = null, faceEnter = -1, faceClip = null;
      let startOut = false, getOut = false, skip = false;
      for (const p of b.planes) {
        const dist = p.d + Math.abs(p.x) * hx + Math.abs(p.y) * hy + Math.abs(p.z) * hz;
        const d1 = p.x * sx + p.y * sy + p.z * sz - dist;
        const d2 = p.x * ex + p.y * ey + p.z * ez - dist;
        if (d2 > 0) getOut = true;
        if (d1 > 0) startOut = true;
        // the 1e-6 tolerance treats moves parallel to a touched plane as non-hits (float noise)
        if (d1 > 0 && (d2 >= EPS || d2 >= d1 - 1e-6)) { skip = true; break; }
        if (d1 <= 0 && d2 <= 0) continue;
        if (d1 > d2) {
          const f = (d1 - EPS) / (d1 - d2);
          if (f > enterFrac) { enterFrac = f; clip = p; }
          if (p.face && f > faceEnter) { faceEnter = f; faceClip = p; }
        } else {
          const f = (d1 + EPS) / (d1 - d2);
          if (f < leaveFrac) leaveFrac = f;
        }
      }
      if (skip) continue;
      if (!startOut) {
        res.startSolid = true;
        if (!getOut) { res.allSolid = true; res.fraction = 0; res.brush = b; }
        continue;
      }
      if (enterFrac < leaveFrac && enterFrac > -1 && enterFrac < res.fraction) {
        // Degenerate corner/edge contacts (e.g. box corner sliding over a shallow concave ramp
        // joint) can make a bevel plane win by a hair; the real face is the correct contact.
        if (!clip.face && faceClip && (enterFrac - faceEnter) * moveLen < 0.5) clip = faceClip;
        res.fraction = Math.max(0, enterFrac);
        res.normal = { x: clip.x, y: clip.y, z: clip.z };
        res.brush = b;
      }
    }
    const f = res.fraction;
    res.end = { x: start.x + (end.x - start.x) * f, y: start.y + (end.y - start.y) * f, z: start.z + (end.z - start.z) * f };
    return res;
  }

  // True when a box at this origin overlaps solid geometry.
  boxSolid(pos) {
    return this.traceBox(pos, pos).startSolid;
  }
}
