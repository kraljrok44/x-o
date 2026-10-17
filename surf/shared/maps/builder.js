// Map construction helpers. Maps are pure data built from code so they can be validated
// automatically and loaded identically on server and client (spec 12.1, 13).

import { boxBrush, orientedBoxBrush, surfRampBrushes } from '../brush.js';

const DEG = Math.PI / 180;

export class MapBuilder {
  constructor(meta) {
    this.meta = meta;
    this.brushes = [];
    this.triggers = [];
    this.stages = [];
    this.rings = [];
    this.ramps = [];        // ridge paths, kept for the renderer, decor placement and the test bot
    this.zones = [];        // visual zone markers
    this.curStage = 0;
  }

  _add(list) {
    for (const b of list) { b.stage = this.curStage; this.brushes.push(b); }
  }

  box(min, max, mat = 'platform') { this._add([boxBrush(min, max, mat)]); }

  obox(cx, cy, yaw, hl, hw, z0, z1, mat = 'platform') {
    this._add([orientedBoxBrush(cx, cy, yaw, hl, hw, z0, z1, mat)]);
  }

  ramp(points, opt) {
    const { brushes, sections } = surfRampBrushes(points, opt, opt.mat || 'ramp');
    this._add(brushes);
    this.ramps.push({ points, sections, w: opt.w, d: opt.d, sides: opt.sides || 'both', stage: this.curStage });
  }

  trigger(type, c, h, yaw = 0, extra = {}) {
    const t = { type, c, h, yaw, ...extra, stage: this.curStage };
    this.triggers.push(t);
    return t;
  }

  build() {
    let minZ = Infinity;
    for (const b of this.brushes) minZ = Math.min(minZ, b.min.z);
    return {
      ...this.meta,
      brushes: this.brushes,
      triggers: this.triggers,
      stages: this.stages,
      rings: this.rings,
      ramps: this.ramps,
      zones: this.zones,
      killZ: minZ - 3000,
    };
  }
}

const dirOf = (h) => ({ x: Math.cos(h), y: Math.sin(h) });
const leftOf = (h) => ({ x: -Math.sin(h), y: Math.cos(h) });

/**
 * Builds one linear surf stage: start platform -> chain of surf ramps -> landing platform.
 * The landing teleports to the next stage, or finishes the map on the last stage.
 * spec: { origin:[x,y,z], heading:deg, ramps:[{len,turn,pitch,w,d,sides,gap,drop,shift,ring}], endDrop }
 */
export function buildStage(b, k, spec, isLast, nextSpawnRef) {
  b.curStage = k;
  const [ox, oy, oz] = spec.origin;
  let h = spec.heading * DEG;
  const D = dirOf(h), L = leftOf(h);
  const PL = 320, PW = 300;

  // start platform + rails
  b.obox(ox, oy, h, PL, PW, oz - 64, oz, 'platform');
  b.obox(ox - D.x * (PL + 16), oy - D.y * (PL + 16), h, 16, PW + 32, oz - 64, oz + 192, 'wall');
  for (const s of [1, -1]) {
    b.obox(ox + L.x * s * (PW + 16), oy + L.y * s * (PW + 16), h, PL, 16, oz - 64, oz + 96, 'wall');
  }
  const spawn = { pos: [ox - D.x * 200, oy - D.y * 200, oz + 1], yaw: h };
  b.stages[k] = { spawn, name: spec.name || `Stage ${k + 1}` };
  const zoneType = k === 0 ? 'start' : 'checkpoint';
  b.trigger(zoneType, [ox, oy, oz + 80], [PL, PW, 80], h, k === 0 ? {} : { stage: k });
  b.zones.push({ type: zoneType, c: [ox, oy, oz + 2], h: [PL, PW], yaw: h, stage: k });

  // ramp chain
  let p = { x: ox + D.x * (PL - 130), y: oy + D.y * (PL - 130), z: oz - 190 };
  let lastEnd = null;
  let minZ = oz - 64;
  let bounds = { minx: ox - 800, maxx: ox + 800, miny: oy - 800, maxy: oy + 800 };
  const grow = (x, y) => {
    bounds.minx = Math.min(bounds.minx, x); bounds.maxx = Math.max(bounds.maxx, x);
    bounds.miny = Math.min(bounds.miny, y); bounds.maxy = Math.max(bounds.maxy, y);
  };
  spec.ramps.forEach((r, ri) => {
    const turn = (r.turn || 0) * DEG;
    const segs = Math.max(1, Math.ceil(Math.abs(r.turn || 0) / 5));
    const sub = r.len / segs;
    const slope = Math.tan((r.pitch ?? 12) * DEG);
    const pts = [[p.x, p.y, p.z]];
    let q = { ...p };
    for (let j = 0; j < segs; j++) {
      const hj = h + turn * ((j + 0.5) / segs);
      q = { x: q.x + Math.cos(hj) * sub, y: q.y + Math.sin(hj) * sub, z: q.z - slope * sub };
      pts.push([q.x, q.y, q.z]);
    }
    h += turn;
    b.ramp(pts, { w: r.w ?? 420, d: r.d ?? 600, sides: r.sides || 'both', mat: r.mat || 'ramp' });
    for (const pt of pts) { grow(pt[0], pt[1]); minZ = Math.min(minZ, pt[2] - (r.d ?? 600)); }
    lastEnd = { ...q };
    const Dn = dirOf(h), Ln = leftOf(h);
    const gap = r.gap ?? 320;
    if (r.ring) {
      const ringIndex = b.rings.length;
      const c = [q.x + Dn.x * gap * 0.5, q.y + Dn.y * gap * 0.5, q.z - 230];
      b.rings.push({ c, yaw: h, r: 270, stage: k });
      b.trigger('boost', c, [70, 270, 270], h, { ring: ringIndex % 30 });
    }
    if (ri < spec.ramps.length - 1) {
      const shift = r.shift || 0;
      p = { x: q.x + Dn.x * gap + Ln.x * shift, y: q.y + Dn.y * gap + Ln.y * shift, z: q.z - (r.drop ?? Math.round(140 + 0.4 * gap)) };
    }
  });

  // landing platform
  const Dn = dirOf(h), Ln = leftOf(h);
  const endGap = spec.endGap ?? 250;
  const LL = 1500, LW = 1400;
  const topZ = lastEnd.z - (spec.endDrop ?? 750);
  const cx = lastEnd.x + Dn.x * (endGap + LL), cy = lastEnd.y + Dn.y * (endGap + LL);
  b.obox(cx, cy, h, LL, LW, topZ - 96, topZ, 'landing');
  b.obox(cx + Dn.x * (LL + 32), cy + Dn.y * (LL + 32), h, 32, LW + 64, topZ - 96, topZ + 1100, 'wall');
  for (const s of [1, -1]) {
    b.obox(cx + Ln.x * s * (LW + 32), cy + Ln.y * s * (LW + 32), h, LL, 32, topZ - 96, topZ + 260, 'wall');
  }
  grow(cx + 2000, cy + 2000); grow(cx - 2000, cy - 2000);
  minZ = Math.min(minZ, topZ - 96);
  const trig = isLast
    ? b.trigger('finish', [cx, cy, topZ + 50], [LL, LW, 50], h)
    : b.trigger('teleport', [cx, cy, topZ + 50], [LL, LW, 50], h, { dest: nextSpawnRef, toStage: k + 1 });
  b.zones.push({ type: isLast ? 'finish' : 'end', c: [cx, cy, topZ + 2], h: [LL, LW], yaw: h, stage: k });

  // per stage fail slab: falling off the ramps returns you to the stage start
  const fz = minZ - 900;
  b.trigger('fail', [(bounds.minx + bounds.maxx) / 2, (bounds.miny + bounds.maxy) / 2, fz],
    [(bounds.maxx - bounds.minx) / 2 + 4000, (bounds.maxy - bounds.miny) / 2 + 4000, 400], 0);
  b.stages[k].bounds = bounds;
  b.stages[k].minZ = minZ;
  return trig;
}

/** Build a whole linear map from stage specs. */
export function buildLinearMap(meta, stageSpecs) {
  const b = new MapBuilder(meta);
  const pending = [];
  stageSpecs.forEach((spec, k) => {
    const destRef = { pos: [0, 0, 0], yaw: 0 };
    buildStage(b, k, spec, k === stageSpecs.length - 1, destRef);
    pending.push(destRef);
  });
  // resolve teleport destinations to the next stage spawn
  pending.forEach((ref, k) => {
    if (k + 1 < b.stages.length) {
      ref.pos = b.stages[k + 1].spawn.pos.slice();
      ref.yaw = b.stages[k + 1].spawn.yaw;
    }
  });
  return b.build();
}
