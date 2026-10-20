// Map construction helpers. Maps are pure data built from code so they can be validated
// automatically and loaded identically on server and client (spec 12.1, 13).

import { boxBrush, orientedBoxBrush, surfRampBrushes, prismBrush } from '../brush.js';

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
    this.pads = [];         // jump pads (used by the renderer and the validation bot)
    this.corners = [];      // 90 degree corners (bot targets, renderer hints)
    this.signs = [];        // speed check gates
    this.windows = [];      // window frames (renderer glow)
    this.hazards = [];      // speed check kill zones (renderer)
    this.caves = [];        // cave tunnels (renderer decor)
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
    for (const b of brushes) b.rampIndex = this.ramps.length;
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
      pads: this.pads,
      corners: this.corners,
      signs: this.signs,
      windows: this.windows,
      hazards: this.hazards,
      caves: this.caves,
      killZ: minZ - 3000,
    };
  }
}

const dirOf = (h) => ({ x: Math.cos(h), y: Math.sin(h) });

/**
 * Cave: a rock tunnel around a ramp (high ceiling, walls beyond the slopes). Gives a section a
 * closed-in feel without making it tighter to ride; the renderer adds stalactites and crystals.
 */
function buildCave(b, pts, w, d, sides, opt, stage) {
  const ch = opt.h ?? 950, th = 140, ext = 30, m = opt.margin ?? 320;
  const lo = sides === 'right' ? -(w + m) : sides === 'left' ? -260 : -(w + m);
  const hi = sides === 'left' ? w + m : sides === 'right' ? 260 : w + m;
  for (let i = 0; i < pts.length - 1; i++) {
    const A = pts[i], B = pts[i + 1];
    const dx = B[0] - A[0], dy = B[1] - A[1], l = Math.hypot(dx, dy);
    const ux = dx / l, uy = dy / l, lx = -uy, ly = ux;
    const a = [A[0] - ux * ext, A[1] - uy * ext, A[2] + (B[2] - A[2]) * (-ext / l)];
    const c = [B[0] + ux * ext, B[1] + uy * ext, B[2] + (B[2] - A[2]) * (ext / l)];
    const quad = (P, l0, l1, z0, z1) => [[P[0] + lx * l0, P[1] + ly * l0, P[2] + z0], [P[0] + lx * l1, P[1] + ly * l1, P[2] + z0], [P[0] + lx * l1, P[1] + ly * l1, P[2] + z1], [P[0] + lx * l0, P[1] + ly * l0, P[2] + z1]];
    b._add([
      prismBrush(quad(a, lo - th, hi + th, ch, ch + th), quad(c, lo - th, hi + th, ch, ch + th), 'rock'),
      prismBrush(quad(a, lo - th, lo, -d - 500, ch), quad(c, lo - th, lo, -d - 500, ch), 'rock'),
      prismBrush(quad(a, hi, hi + th, -d - 500, ch), quad(c, hi, hi + th, -d - 500, ch), 'rock'),
    ]);
  }
  b.caves.push({ stage, pts, lo, hi, ch, d });
}

/**
 * Tight corridor over a one-sided ramp: a glass ceiling close above the ridge line (no room to
 * fly high - a "headcheck") and a wall closing the outer edge of the slope.
 */
function buildCorridor(b, pts, w, d, sides, opt) {
  const ch = opt.h ?? 170, th = 40, ext = 24;
  const sgn = sides === 'right' ? -1 : 1;
  const open = opt.open ?? 500; // the entry stays open (riders may arrive high)
  let run = 0;
  for (let i = 0; i < pts.length - 1; i++) {
    const A = pts[i], B = pts[i + 1];
    const dx = B[0] - A[0], dy = B[1] - A[1], l = Math.hypot(dx, dy);
    const ux = dx / l, uy = dy / l, lx = -uy * sgn, ly = ux * sgn;
    // stretch each piece a little so neighbouring pieces overlap on curves
    const a = [A[0] - ux * ext, A[1] - uy * ext, A[2] + (B[2] - A[2]) * (-ext / l)];
    const c = [B[0] + ux * ext, B[1] + uy * ext, B[2] + (B[2] - A[2]) * (ext / l)];
    const quad = (P, l0, l1, z0, z1) => [[P[0] + lx * l0, P[1] + ly * l0, P[2] + z0], [P[0] + lx * l1, P[1] + ly * l1, P[2] + z0], [P[0] + lx * l1, P[1] + ly * l1, P[2] + z1], [P[0] + lx * l0, P[1] + ly * l0, P[2] + z1]];
    const wall = prismBrush(quad(a, w, w + th, -d - 60, ch), quad(c, w, w + th, -d - 60, ch), 'wall');
    b._add([wall]);
    run += l;
    if (run > open) b._add([prismBrush(quad(a, -90, w + th, ch, ch + th), quad(c, -90, w + th, ch, ch + th), 'glass')]);
  }
}

const leftOf = (h) => ({ x: -Math.sin(h), y: Math.cos(h) });

/**
 * Builds one linear surf stage: start platform -> chain of surf ramps -> landing platform.
 * The landing teleports to the next stage, or finishes the map on the last stage.
 * spec: { origin:[x,y,z], heading:deg, ramps:[{len,turn,pitch,w,d,sides,gap,drop,shift,ring}], endDrop }
 */
export function buildStage(b, k, spec, isLast, nextSpawnRef, continuous = false) {
  b.curStage = k;
  const [ox, oy, oz] = spec.origin;
  let h = spec.heading * DEG;
  const D = dirOf(h), L = leftOf(h);
  // In a linear (continuous) map every section after the first starts on a big platform that
  // also catches riders flying in from the previous section - no teleports.
  const flowIn = continuous && k > 0;
  const PL = flowIn ? 1300 : 320, PW = flowIn ? 1100 : 300;

  // start platform + rails
  b.obox(ox, oy, h, PL, PW, oz - 64, oz, flowIn ? 'landing' : 'platform');
  if (!flowIn) b.obox(ox - D.x * (PL + 16), oy - D.y * (PL + 16), h, 16, PW + 32, oz - 64, oz + 192, 'wall');
  for (const s of [1, -1]) {
    b.obox(ox + L.x * s * (PW + 16), oy + L.y * s * (PW + 16), h, PL, 16, oz - 64, oz + (flowIn ? 220 : 96), 'wall');
  }
  const spawn = { pos: flowIn ? [ox + D.x * (PL - 520), oy + D.y * (PL - 520), oz + 1] : [ox - D.x * 200, oy - D.y * 200, oz + 1], yaw: h };
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
  let forcedSides = null; // a 90 degree corner decides which side the next ramp is ridden on
  spec.ramps.forEach((r, ri) => {
    const sides = forcedSides || r.sides || 'both';
    forcedSides = null;
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
    const wA = r.w ?? 420, dA = r.d ?? 600;
    b.ramp(pts, { w: wA, d: dA, sides, mat: r.mat || 'ramp' });
    for (const pt of pts) { grow(pt[0], pt[1]); minZ = Math.min(minZ, pt[2] - dA); }
    if (r.corridor) buildCorridor(b, pts, wA, dA, sides, r.corridor);
    if (r.cave || spec.cave) buildCave(b, pts, wA, dA, sides, typeof r.cave === 'object' ? r.cave : {}, k);
    lastEnd = { ...q };
    const Dn = dirOf(h), Ln = leftOf(h);
    const nx = spec.ramps[ri + 1];
    // riders surf about 40% down the slope: lateral offset of their line from the ridge
    const riderOff = (sides === 'right' ? -1 : 1) * wA * 0.4;
    const gap = r.window ? (r.window.gap ?? 760) : (r.gap ?? 320);
    if (r.ring) {
      const ringIndex = b.rings.length;
      const c = [q.x + Dn.x * gap * 0.5, q.y + Dn.y * gap * 0.5, q.z - 230];
      b.rings.push({ c, yaw: h, r: 270, stage: k });
      b.trigger('boost', c, [70, 270, 270], h, { ring: ringIndex % 30 });
    }
    if (!nx) return;
    const nw = nx.w ?? 420, nd = nx.d ?? 600;
    if (r.jump) {
      // Jump section: a long flat runway, then a wide gap to the next ramp. Friction drains your
      // speed on the runway unless you bunny-hop (hold SPACE: a jump on the landing tick skips
      // friction), and only with that speed can you clear the gap. Where you land on the
      // runway does not matter, so the section is fair at any speed.
      const J = r.jump;
      const padLen = J.len ?? (J.pads ?? 2) * 850, hw = J.w ?? 600;
      const d0 = J.first ?? 260;
      const top = q.z - (J.drop ?? 380);
      const lx = q.x + Ln.x * riderOff, ly = q.y + Ln.y * riderOff;
      const cx = lx + Dn.x * (d0 + padLen / 2), cy = ly + Dn.y * (d0 + padLen / 2);
      b.obox(cx, cy, h, padLen / 2, hw, top - 64, top, 'pad');
      b.pads.push({ stage: k, c: [cx, cy, top], yaw: h, hl: padLen / 2, hw });
      grow(cx + 1500, cy + 1500); grow(cx - 1500, cy - 1500);
      minZ = Math.min(minZ, top - 64);
      // next ridge beside the rider's line so they land on a slope, not on the apex
      const off = (nx.sides === 'right' ? 1 : -1) * nw * 0.4;
      const exit = J.exit ?? 600;
      const dist = d0 + padLen + exit;
      p = { x: lx + Dn.x * dist + Ln.x * off, y: ly + Dn.y * dist + Ln.y * off, z: top - 150 }; // whole slope below the flight path
      return;
    }
    if (r.corner) {
      // 90 degree corner with a forced side switch: the next ramp runs across your path and only
      // its slope facing you exists. Air-strafe through the turn (hold the turn key, sweep the
      // mouse) and land on the new slope - the other strafe key now holds you on the ramp.
      const C = typeof r.corner === 'object' ? r.corner : { turn: r.corner };
      const sg = Math.sign(C.turn);
      const reach = C.reach ?? 950, back = C.back ?? 800;
      const rx = q.x + Ln.x * riderOff, ry = q.y + Ln.y * riderOff;
      const Lt = { x: Ln.x * sg, y: Ln.y * sg };
      p = { x: rx + Dn.x * reach - Lt.x * back, y: ry + Dn.y * reach - Lt.y * back, z: q.z - dA * 0.4 - (C.drop ?? 150) };
      h += sg * Math.PI / 2;
      forcedSides = sg > 0 ? 'left' : 'right';
      b.corners.push({ stage: k, from: [rx, ry, q.z - dA * 0.4], at: [p.x, p.y, p.z], yaw: h, turn: sg });
      return;
    }
    let shift = r.shift || 0;
    // switching between a left-only and a right-only ramp: move the next ridge so the rider
    // (surfing 40% down this slope) arrives 40% down the opposite slope
    const bS = nx.sides || 'both';
    if (sides !== bS && sides !== 'both' && bS !== 'both') shift = (sides === 'left' ? 1 : -1) * 0.4 * (wA + nw);
    if (r.speedcheck) {
      // Speed check: a long gap with nothing below. Leaving the ramp at speed v you fall
      // tan(pitch)*x + g/2*(x/v)^2 over a distance x; the gap is sized so that below the
      // required speed you drop under the next ramp before reaching it.
      const S = r.speedcheck;
      const v = S.min, dz = S.drop ?? 450;
      // a rider must still be above the next slope where it begins (40% down, like here)
      const budget = dz - dA * 0.4 + nd * 0.25; // riders close to the ridge have the least room
      const A = 400 / (v * v), Bq = slope; // riders leave a ramp at about its pitch
      const G = Math.round((-Bq + Math.sqrt(Bq * Bq + 4 * A * budget)) / (2 * A));
      p = { x: q.x + Dn.x * G + Ln.x * shift, y: q.y + Dn.y * G + Ln.y * shift, z: q.z - dz };
      // below the catch line the gap is a kill zone, so the check is the same wherever you ride
      const killTop = p.z - nd * 0.7;
      const kc = [q.x + Dn.x * (G - 40) * 0.5 + Ln.x * shift * 0.5, q.y + Dn.y * (G - 40) * 0.5 + Ln.y * shift * 0.5, killTop - 1500];
      b.trigger('fail', kc, [(G - 40) * 0.5, 1600, 1500], h);
      b.hazards.push({ stage: k, c: [kc[0], kc[1], killTop], yaw: h, hl: (G - 40) * 0.5, hw: 1600 });
      // HUD hint zone over the end of this ramp + a gate marker over the gap
      const zl = Math.min(r.len * 0.45, 1400);
      const zm = (G - zl) / 2;
      const zc = [q.x + Dn.x * zm + Ln.x * riderOff * 0.5, q.y + Dn.y * zm + Ln.y * riderOff * 0.5, q.z - dA * 0.4];
      b.trigger('speedcheck', zc, [(zl + G) / 2, wA + 300, 900], h, { min: v });
      b.signs.push({ stage: k, kind: 'speed', text: `${v}`, c: [q.x + Dn.x * G * 0.5 + Ln.x * riderOff, q.y + Dn.y * G * 0.5 + Ln.y * riderOff, q.z - dA * 0.4 + 260], yaw: h, min: v });
      grow(p.x, p.y);
      return;
    }
    // windows use a long gap: drop enough that slower riders still clear it
    const drop = r.drop ?? (r.window ? Math.round(0.75 * gap) : Math.round(140 + 0.4 * gap));
    p = { x: q.x + Dn.x * gap + Ln.x * shift, y: q.y + Dn.y * gap + Ln.y * shift, z: q.z - drop };
    if (r.window) {
      // Window: a wall across the gap with one opening on the natural line - aim through it.
      const W = r.window;
      // on a two-sided ramp riders may come from either slope: the opening spans both lines
      const both = sides === 'both';
      const lat = both ? shift * 0.5 : riderOff + shift * 0.5;
      const cx = q.x + Dn.x * gap * 0.5 + Ln.x * lat;
      const cy = q.y + Dn.y * gap * 0.5 + Ln.y * lat;
      const cz = q.z - dA * 0.4 - (W.lower ?? 120);
      const ow = (W.w ?? 300) + (both ? wA * 0.4 : 0), oh = W.h ?? 230, th = 30, span = W.span ?? 1700;
      const wy = Math.atan2(Dn.y, Dn.x);
      const ob = (lat, z0, z1, hw) => b.obox(cx + Ln.x * lat, cy + Ln.y * lat, wy, th, hw, z0, z1, 'window');
      ob(0, cz + oh, cz + oh + 700, ow);                 // lintel
      ob(0, cz - oh - 900, cz - oh, ow);                 // sill
      ob(ow + (span - ow) / 2, cz - oh - 900, cz + oh + 700, (span - ow) / 2);   // left jamb
      ob(-ow - (span - ow) / 2, cz - oh - 900, cz + oh + 700, (span - ow) / 2);  // right jamb
      b.windows.push({ stage: k, c: [cx, cy, cz], yaw: wy, w: ow, h: oh });
    }
  });

  const Dn = dirOf(h), Ln = leftOf(h);
  const endGap = spec.endGap ?? 250;
  if (continuous && !isLast) {
    // the next section's platform sits right where this chain ends
    const NPL = 1300;
    const fz = minZ - 900;
    b.trigger('fail', [(bounds.minx + bounds.maxx) / 2, (bounds.miny + bounds.maxy) / 2, fz],
      [(bounds.maxx - bounds.minx) / 2 + 4000, (bounds.maxy - bounds.miny) / 2 + 4000, 400], 0);
    b.stages[k].bounds = bounds;
    b.stages[k].minZ = minZ;
    return {
      origin: [lastEnd.x + Dn.x * (endGap + NPL), lastEnd.y + Dn.y * (endGap + NPL), lastEnd.z - (spec.endDrop ?? 750)],
      heading: h / DEG,
    };
  }
  // landing platform
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

/**
 * Build a whole map from stage specs. With continuous=true the map is one linear route:
 * each section flows into the next (sections act as checkpoints), otherwise sections are
 * separate areas joined by teleports.
 */
export function buildLinearMap(meta, stageSpecs, continuous = false) {
  const b = new MapBuilder(meta);
  const pending = [];
  let next = null;
  stageSpecs.forEach((spec, k) => {
    const destRef = { pos: [0, 0, 0], yaw: 0 };
    const sp = continuous && next ? { ...spec, origin: next.origin, heading: next.heading } : spec;
    next = buildStage(b, k, sp, k === stageSpecs.length - 1, destRef, continuous);
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
