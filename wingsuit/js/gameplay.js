// Gates, missions, scoring, cosmetics catalog and replay recording.
import * as THREE from './lib/three.module.min.js';
import { clamp, lerp } from './util.js';

// ------------------------------------------------------------------ catalog
export const SUITS = [
  { id: 'ember', name: 'Ember', suit: ['#d23a2a', '#1d1f24', '#15161a'], price: 0 },
  { id: 'glacier', name: 'Glacier', suit: ['#e8f1f8', '#2a6fb0', '#1b2533'], price: 150 },
  { id: 'fox', name: 'Desert Fox', suit: ['#d98b3a', '#4a3020', '#2b1d14'], price: 250 },
  { id: 'neon', name: 'Neon Volt', suit: ['#c6ff2e', '#141414', '#141414'], price: 400 },
  { id: 'ocean', name: 'Deep Ocean', suit: ['#1f9fc0', '#0d2b45', '#0d1b25'], price: 600 },
  { id: 'stealth', name: 'Stealth', suit: ['#34373e', '#111214', '#0a0a0a'], price: 800 },
  { id: 'tiger', name: 'Tiger Stripe', suit: ['#ff8c1a', '#141414', '#141414'], req: { rank: 'gold', count: 3 } },
  { id: 'aurora', name: 'Aurora', suit: ['#7a3cff', '#1fe0c0', '#101018'], req: { rank: 'platinum', count: 3 } },
];
export const HELMETS = [
  { id: 'white', name: 'Classic White', helmet: ['#f2f2f2', '#222831', 0.2, 0.25], price: 0 },
  { id: 'carbon', name: 'Carbon', helmet: ['#2a2a2e', '#4a3a18', 0.5, 0.35], price: 120 },
  { id: 'flame', name: 'Flame Orange', helmet: ['#ff5a1a', '#30200a', 0.3, 0.2], price: 220 },
  { id: 'sky', name: 'Sky Blue', helmet: ['#5ab4ff', '#101a2a', 0.3, 0.2], price: 300 },
  { id: 'chrome', name: 'Chrome', helmet: ['#e6eaf0', '#1a1f2a', 1.0, 0.06], price: 500 },
  { id: 'gold', name: 'Gold Visor', helmet: ['#d4a437', '#7a5a10', 1.0, 0.12], req: { rank: 'perfect', count: 1 } },
];
export const CHUTES = [
  { id: 'sunset', name: 'Sunset', chute: ['#ff6a1a', '#ffd23f', '#ff6a1a', '#ffffff'], price: 0 },
  { id: 'ice', name: 'Ice', chute: ['#ffffff', '#5ab4ff', '#ffffff', '#1d4f8a'], price: 100 },
  { id: 'jungle', name: 'Jungle', chute: ['#2e8b3a', '#d9e05a', '#1d4a22'], price: 200 },
  { id: 'royal', name: 'Royal', chute: ['#5a2ea6', '#ffd23f', '#5a2ea6', '#ffffff'], price: 350 },
  { id: 'mono', name: 'Monochrome', chute: ['#111111', '#ffffff'], price: 450 },
  { id: 'rainbow', name: 'Rainbow', chute: ['#ff3b3b', '#ff9f1a', '#ffe23f', '#3bd65a', '#3b8bff', '#8a3bff'], req: { missions: 9 } },
];
export const TRAILS = [
  { id: 'none', name: 'No Trail', trail: null, price: 0 },
  { id: 'white', name: 'White Smoke', trail: [0.95, 0.95, 0.95, 0.55], price: 200 },
  { id: 'crimson', name: 'Crimson Smoke', trail: [0.9, 0.15, 0.15, 0.6], price: 300 },
  { id: 'azure', name: 'Azure Smoke', trail: [0.2, 0.55, 1.0, 0.6], price: 300 },
  { id: 'gold', name: 'Golden Sparks', trail: [1.0, 0.8, 0.3, 0.8], req: { rank: 'platinum', count: 1 } },
  { id: 'rainbow', name: 'Prism', trail: 'rainbow', req: { missions: 12 } },
];
export const CATALOG = { suit: SUITS, helmet: HELMETS, chute: CHUTES, trail: TRAILS };

export const RANKS = [
  { id: 'perfect', name: 'Perfect', min: 950, color: '#7af0ff' },
  { id: 'platinum', name: 'Platinum', min: 800, color: '#d9e4f0' },
  { id: 'gold', name: 'Gold', min: 600, color: '#ffc93c' },
  { id: 'silver', name: 'Silver', min: 400, color: '#c0c6cf' },
  { id: 'bronze', name: 'Bronze', min: 0, color: '#d08a4a' },
];
export const RANK_ORDER = ['bronze', 'silver', 'gold', 'platinum', 'perfect'];
export const rankFor = (score) => RANKS.find((r) => score >= r.min);

// ------------------------------------------------------------------ modes & missions
export const MODES = {
  free: { id: 'free', name: 'Free Flight', desc: 'Explore freely. No gates, no timer. Practice maneuvers and canopy landings.' },
  mission: { id: 'mission', name: 'Flight Missions', desc: 'Structured challenges with gates, time limits and score targets.' },
  speed: { id: 'speed', name: 'Speed Run', desc: 'Fly the route through every gate as fast as possible. Timer stops at the finish gate.' },
  precision: { id: 'precision', name: 'Precision Flight', desc: 'Thread small gates dead-center with smooth, stable flight.' },
  landing: { id: 'landing', name: 'Landing Trials', desc: 'Start under an open canopy and land inside the target zone.' },
};

export const MISSIONS = [
  { id: 'm1', name: 'First Exit', map: 'skyfall', mode: 'mission', time: 'midday', weather: 'clear', gates: { n: 4, r: 22, shapes: ['ring'] }, limit: 220, maxMiss: 2, tutorial: true, desc: 'Your first BASE jump. Spread the wings, fly through big gates and land in the clearing.' },
  { id: 'm2', name: 'Valley Run', map: 'skyfall', mode: 'speed', time: 'morning', weather: 'clear', gates: { n: 6, r: 18, shapes: ['ring', 'rect'] }, limit: 200, maxMiss: 1, par: 1, desc: 'Race down the valley. Dive to build speed but keep enough height to reach the finish.' },
  { id: 'm3', name: "Needle's Eye", map: 'skyfall', mode: 'precision', time: 'morning', weather: 'lightfog', gates: { n: 8, r: 10, shapes: ['ring', 'slot', 'ring'] }, limit: 240, maxMiss: 2, desc: 'Narrow gates through the mountain gaps in light fog.' },
  { id: 'm4', name: 'Canyon Gate', map: 'redstone', mode: 'mission', time: 'midday', weather: 'clear', gates: { n: 6, r: 16, shapes: ['ring', 'rect'] }, limit: 220, maxMiss: 1, desc: 'Drop off the butte and follow the winding red canyon.' },
  { id: 'm5', name: 'Arch Hunter', map: 'redstone', mode: 'precision', time: 'sunset', weather: 'clear', gates: { n: 7, r: 11, shapes: ['rect', 'ring'] }, limit: 220, maxMiss: 1, desc: 'Fly beneath both natural arches without touching stone.' },
  { id: 'm6', name: 'Red Line', map: 'redstone', mode: 'speed', time: 'sunset', weather: 'windy', gates: { n: 8, r: 17, shapes: ['ring'] }, limit: 200, maxMiss: 1, desc: 'Gusty speed run through the narrows.' },
  { id: 'm7', name: 'Sea Stacks', map: 'tidal', mode: 'mission', time: 'morning', weather: 'clear', gates: { n: 6, r: 15, shapes: ['ring', 'slot'] }, limit: 220, maxMiss: 1, desc: 'Weave between the sea stacks and land on the beach.' },
  { id: 'm8', name: 'Low Tide', map: 'tidal', mode: 'speed', time: 'midday', weather: 'clouds', gates: { n: 7, r: 16, shapes: ['ring', 'rect'] }, limit: 200, maxMiss: 1, desc: 'Skim the waves at full speed along the coastline.' },
  { id: 'm9', name: 'Beach Drop', map: 'tidal', mode: 'landing', time: 'sunset', weather: 'windy', limit: 180, desc: 'Gusty sea breeze. Put the canopy down on the beach target.' },
  { id: 'm10', name: 'Rooftop Exit', map: 'metro', mode: 'mission', time: 'midday', weather: 'clear', gates: { n: 6, r: 14, shapes: ['ring', 'rect'] }, limit: 220, maxMiss: 1, desc: 'Leap from the Spire and carve down the avenues to the park.' },
  { id: 'm11', name: 'Avenue Rush', map: 'metro', mode: 'speed', time: 'sunset', weather: 'clear', gates: { n: 8, r: 15, shapes: ['ring'] }, limit: 200, maxMiss: 1, desc: 'Sunset speed run between the glass towers.' },
  { id: 'm12', name: 'Skybridge', map: 'metro', mode: 'precision', time: 'overcast', weather: 'rain', gates: { n: 8, r: 10, shapes: ['rect', 'slot', 'ring'] }, limit: 240, maxMiss: 1, desc: 'Rain, wind and skybridges. Precision under pressure.' },
];

// Map unlock progression
export const MAP_UNLOCK = { skyfall: 0, redstone: 2, tidal: 5, metro: 8 };

export function defaultGates(mode) {
  if (mode === 'speed') return { n: 7, r: 17, shapes: ['ring'] };
  if (mode === 'precision') return { n: 8, r: 10, shapes: ['ring', 'slot', 'rect'] };
  return { n: 6, r: 16, shapes: ['ring', 'rect'] };
}

// Landing-trial starts per map: begin upwind of the target with clear terrain on the way in.
export function landingTrial(def, world) {
  const tgt = def.helipad ? { x: def.helipad.x, y: def.helipad.h, z: def.helipad.z, r: 22 } : { x: def.landing.x, y: def.landing.y, z: def.landing.z, r: def.landing.r * 0.6 };
  const alt = tgt.y + (def.helipad ? 330 : 380);
  const dist = def.helipad ? 480 : 520;
  const upwind = def.wind.dir + Math.PI; // wind blows toward def.wind.dir
  let best = null;
  for (let k = 0; k < 16; k++) {
    const a = upwind + (k % 2 ? 1 : -1) * Math.ceil(k / 2) * (Math.PI / 8);
    const sx = tgt.x + Math.sin(a) * dist, sz = tgt.z + Math.cos(a) * dist;
    let ok = true;
    if (world) for (let t = 0.15; t <= 1.0; t += 0.05) {
      const px = tgt.x + (sx - tgt.x) * t, pz = tgt.z + (sz - tgt.z) * t;
      const need = tgt.y + (alt - tgt.y) * t * 0.55;
      if (world.ground(px, pz).h > need - 25) { ok = false; break; }
    }
    if (ok) { best = { sx, sz }; break; }
  }
  if (!best) best = { sx: tgt.x + Math.sin(upwind) * dist, sz: tgt.z + Math.cos(upwind) * dist };
  return { start: { x: best.sx, y: alt, z: best.sz, heading: Math.atan2(tgt.x - best.sx, tgt.z - best.sz) }, target: tgt };
}

// ------------------------------------------------------------------ gates
export class Gates {
  constructor(scene, world, def, cfg, mode) {
    this.scene = scene; this.group = new THREE.Group(); scene.add(this.group);
    this.list = [];
    this.next = 0;
    this.mode = mode;
    if (!cfg) return;
    const R = def.route;
    const n = cfg.n;
    const s0 = 0.11, s1 = mode === 'speed' ? 0.74 : 0.7;
    const anchors = [];
    if (def.arches) for (const a of def.arches) anchors.push(a.s);
    if (def.bridgeSpecs) for (const b of def.bridgeSpecs) anchors.push(b.s);
    for (let i = 0; i < n; i++) {
      let u = lerp(s0, s1, n === 1 ? 0.5 : i / (n - 1));
      for (const a of anchors) if (Math.abs(a - u) < 0.5 / n) u = a; // snap to arches/bridges
      const s = u * R.L;
      const p = R.line.at(s);
      let y = R.routeY(s);
      const dy = (R.routeY(s + 20) - R.routeY(s - 20)) / 40;
      const dir = new THREE.Vector3(p.dx, dy, p.dz).normalize();
      const right = new THREE.Vector3().crossVectors(dir, new THREE.Vector3(0, 1, 0)).normalize();
      let lat = 0;
      if (mode === 'precision' && !anchors.some((a) => Math.abs(a - u) < 0.01)) lat = (i % 2 ? 1 : -1) * 9;
      const shape = cfg.shapes[i % cfg.shapes.length];
      const size = shape === 'slot' ? { w: cfg.r * 0.7, h: cfg.r * 2.4 } : shape === 'rect' ? { w: cfg.r * 2.2, h: cfg.r * 1.3 } : { r: cfg.r };
      const c = new THREE.Vector3(p.x, y, p.z).addScaledVector(right, lat);
      const halfH = size.r || size.h / 2;
      const gh = world.ground(c.x, c.z).h;
      if (c.y - halfH < gh + 6) c.y = gh + halfH + 6;
      const up = new THREE.Vector3().crossVectors(right, dir).normalize();
      const g = { c, dir, right, up, shape, size, s, state: 'pending', acc: 0 };
      g.mesh = this._mesh(g);
      this.group.add(g.mesh);
      this.list.push(g);
    }
    this.finishIndex = this.list.length - 1;
    this.prev = new THREE.Vector3();
    this.t = 0;
  }

  _mesh(g) {
    const mat = new THREE.MeshStandardMaterial({ color: 0xff8a1a, emissive: 0xff6a00, emissiveIntensity: 1.2, roughness: 0.4, transparent: true, opacity: 0.95 });
    let mesh;
    if (g.shape === 'ring') mesh = new THREE.Mesh(new THREE.TorusGeometry(g.size.r, Math.max(0.45, g.size.r * 0.045), 10, 48), mat);
    else {
      const w = g.size.w, h = g.size.h, t = Math.max(0.5, Math.min(w, h) * 0.05);
      mesh = new THREE.Group();
      const geoH = new THREE.BoxGeometry(w + t * 2, t, t), geoV = new THREE.BoxGeometry(t, h, t);
      const top = new THREE.Mesh(geoH, mat); top.position.y = h / 2 + t / 2;
      const bot = new THREE.Mesh(geoH, mat); bot.position.y = -h / 2 - t / 2;
      const l = new THREE.Mesh(geoV, mat); l.position.x = -w / 2 - t / 2;
      const r = new THREE.Mesh(geoV, mat); r.position.x = w / 2 + t / 2;
      mesh.add(top, bot, l, r);
    }
    // orient: local Z -> dir, local X -> -right? (we want local X = right, Y = up)
    const m = new THREE.Matrix4().makeBasis(g.right.clone().negate(), g.up, g.dir);
    mesh.quaternion.setFromRotationMatrix(m);
    mesh.position.copy(g.c);
    mesh.userData.mat = mat;
    // inner glow disc
    const disc = new THREE.Mesh(g.shape === 'ring' ? new THREE.CircleGeometry(g.size.r, 32) : new THREE.PlaneGeometry(g.size.w, g.size.h),
      new THREE.MeshBasicMaterial({ color: 0xffb040, transparent: true, opacity: 0.08, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending }));
    mesh.add(disc);
    mesh.userData.disc = disc;
    return mesh;
  }

  get total() { return this.list.length; }
  get passed() { return this.list.filter((g) => g.state === 'passed').length; }
  get missed() { return this.list.filter((g) => g.state === 'missed').length; }

  reset() { for (const g of this.list) { g.state = 'pending'; g.acc = 0; } this.next = 0; }

  // Check segment prev->cur against upcoming gates. Returns array of events.
  check(prev, cur) {
    const ev = [];
    for (let i = this.next; i < Math.min(this.list.length, this.next + 3); i++) {
      const g = this.list[i];
      const d0 = _tmp.copy(prev).sub(g.c).dot(g.dir), d1 = _tmp.copy(cur).sub(g.c).dot(g.dir);
      if (d0 < 0 && d1 >= 0) {
        const t = d0 / (d0 - d1);
        const hit = _tmp2.copy(prev).lerp(cur, t).sub(g.c);
        const x = hit.dot(g.right), y = hit.dot(g.up);
        let inside, acc;
        if (g.shape === 'ring') { const d = Math.hypot(x, y); inside = d < g.size.r; acc = 1 - d / g.size.r; }
        else { const ax = Math.abs(x) / (g.size.w / 2), ay = Math.abs(y) / (g.size.h / 2); inside = ax < 1 && ay < 1; acc = 1 - Math.max(ax, ay); }
        const lim = (g.size.r || Math.max(g.size.w, g.size.h)) * 5;
        if (Math.hypot(x, y) > lim) continue; // crossed the plane far away (not this gate)
        for (let k = this.next; k < i; k++) if (this.list[k].state === 'pending') { this.list[k].state = 'missed'; ev.push({ type: 'miss', index: k }); }
        g.state = inside ? 'passed' : 'missed'; g.acc = inside ? clamp(acc, 0, 1) : 0;
        ev.push({ type: inside ? 'pass' : 'miss', index: i, acc: g.acc, finish: i === this.finishIndex });
        this.next = i + 1;
        break;
      }
    }
    return ev;
  }
  // gate passed far behind (player is way past it along the route)
  checkBehind(routeS) {
    const ev = [];
    while (this.next < this.list.length && routeS > this.list[this.next].s + 160) {
      this.list[this.next].state = 'missed'; ev.push({ type: 'miss', index: this.next }); this.next++;
    }
    return ev;
  }
  nextGate() { return this.list[this.next] || null; }

  update(dt) {
    this.t += dt;
    this.list.forEach((g, i) => {
      const mat = g.mesh.userData.mat;
      if (g.state !== 'pending' || i !== this.next) g.mesh.userData.disc.visible = i === this.next;
      if (g.state === 'passed') { mat.color.setHex(0x3dff8a); mat.emissive.setHex(0x10c050); mat.opacity = Math.max(0.15, mat.opacity - dt * 0.5); }
      else if (g.state === 'missed') { mat.color.setHex(0xff3030); mat.emissive.setHex(0xa00000); mat.opacity = Math.max(0.2, mat.opacity - dt * 0.5); }
      else if (i === this.next) { const k = 1 + Math.sin(this.t * 6) * 0.4; mat.emissiveIntensity = 1.4 * k; mat.color.setHex(0xffa020); mat.emissive.setHex(0xff7a00); g.mesh.userData.disc.material.opacity = 0.12; }
      else { mat.emissiveIntensity = 0.6; mat.color.setHex(0x3ac8ff); mat.emissive.setHex(0x0a6aa0); g.mesh.userData.disc.material.opacity = 0; }
    });
  }
  dispose() {
    this.scene.remove(this.group);
    this.group.traverse((o) => { if (o.geometry) o.geometry.dispose(); if (o.material) o.material.dispose(); });
  }
}
const _tmp = new THREE.Vector3(), _tmp2 = new THREE.Vector3();

// ------------------------------------------------------------------ scoring
const WEIGHTS = {
  mission: { velocity: 120, precision: 220, proximity: 120, stability: 140, duration: 80, landing: 200, efficiency: 120 },
  speed: { velocity: 280, precision: 130, proximity: 80, stability: 60, duration: 200, landing: 120, efficiency: 130 },
  precision: { velocity: 60, precision: 400, proximity: 60, stability: 200, duration: 40, landing: 140, efficiency: 100 },
  landing: { velocity: 0, precision: 0, proximity: 0, stability: 200, duration: 100, landing: 600, efficiency: 100 },
  free: { velocity: 200, precision: 0, proximity: 260, stability: 140, duration: 150, landing: 150, efficiency: 100 },
};
export const CATEGORY_LABELS = { velocity: 'Velocity', precision: 'Precision', proximity: 'Proximity', stability: 'Stability', duration: 'Duration', landing: 'Landing', efficiency: 'Efficiency' };

export class FlightStats {
  constructor() { this.reset(); }
  reset() {
    Object.assign(this, { flightTime: 0, totalTime: 0, maxSpeed: 0, speedSum: 0, speedT: 0, stabSum: 0, stabT: 0, prox: 0, path: 0, startAlt: 0, minClr: 1e9, landDist: null, landQuality: 0, gatesPassed: 0, gatesTotal: 0, accSum: 0, finishTime: null, crashed: false, crashWhat: '', water: false, hardOpening: false, exitPos: null, landPos: null });
  }
  sampleFlight(dt, speedKmh, stability, clr, moveDist) {
    this.flightTime += dt;
    if (speedKmh > this.maxSpeed) this.maxSpeed = speedKmh;
    this.speedSum += speedKmh * dt; this.speedT += dt;
    this.stabSum += stability * dt; this.stabT += dt;
    if (clr < 30 && speedKmh > 100) this.prox += (1 - clr / 30) * dt * (speedKmh / 180);
    if (clr < this.minClr) this.minClr = clr;
    this.path += moveDist;
  }
  get avgSpeed() { return this.speedT > 0 ? this.speedSum / this.speedT : 0; }
  get avgStab() { return this.stabT > 0 ? this.stabSum / this.stabT : 100; }
}

export function computeScore(mode, st, ctx) {
  const W = WEIGHTS[mode] || WEIGHTS.mission;
  const c = {};
  c.velocity = clamp(0.5 * (st.maxSpeed - 140) / 150 + 0.5 * (st.avgSpeed - 90) / 110, 0, 1);
  c.precision = st.gatesTotal ? clamp((st.gatesPassed / st.gatesTotal) * (0.45 + 0.55 * (st.gatesPassed ? st.accSum / st.gatesPassed : 0)), 0, 1) : 0;
  c.proximity = clamp(st.prox / Math.max(8, st.flightTime * 0.22), 0, 1);
  c.stability = clamp(Math.pow(st.avgStab / 100, 1.5), 0, 1);
  if (mode === 'speed' && st.finishTime != null) c.duration = clamp(1 - (st.finishTime - ctx.par) / (ctx.par * 0.8), 0, 1);
  else if (mode === 'speed') c.duration = 0;
  else c.duration = clamp(st.totalTime / ctx.targetTime, 0, 1);
  if (st.crashed || st.landDist == null) c.landing = 0;
  else c.landing = clamp(1 - st.landDist / (ctx.landR * 2.2), 0, 1) * st.landQuality;
  if (mode === 'landing') c.efficiency = clamp(ctx.directDist / Math.max(1, st.path), 0, 1);
  else if (mode === 'free') c.efficiency = clamp(ctx.glideRatio / 2.6, 0, 1);
  else c.efficiency = clamp(Math.pow(ctx.routeLen / Math.max(ctx.routeLen, st.path), 2), 0, 1);
  const parts = {};
  let total = 0;
  for (const k in W) { parts[k] = Math.round(c[k] * W[k]); total += parts[k]; }
  let max = 0; for (const k in W) max += W[k];
  total = Math.round(total * 1000 / max);
  if (st.crashed) total = Math.round(total * 0.35);
  return { total: clamp(total, 0, 1000), parts, weights: W, norm: c };
}

// ------------------------------------------------------------------ replay
export class ReplayRecorder {
  constructor() { this.frames = []; this.acc = 0; this.rate = 1 / 12; }
  reset() { this.frames = []; this.acc = 0; this.t = 0; }
  sample(dt, F, inp, force = false) {
    this.t = (this.t || 0) + dt;
    this.acc += dt;
    if (this.acc < this.rate && !force) return;
    this.acc = 0;
    const q = F.q;
    this.frames.push([
      Math.round(this.t * 100), Math.round(F.pos.x * 10), Math.round(F.pos.y * 10), Math.round(F.pos.z * 10),
      Math.round(q.x * 1000), Math.round(q.y * 1000), Math.round(q.z * 1000), Math.round(q.w * 1000),
      F.state, Math.round(F.wing * 100), Math.round(F.posture * 100), Math.round(inp.pitch * 100), Math.round(inp.turn * 100),
      Math.round(F.canopyOpen * 100), Math.round(F.brakeL * 100), Math.round(F.brakeR * 100), Math.round(F.vel.length() * 10),
      Math.round((F.runPhase % 6.283) * 100), Math.round(F.cBank * 100), Math.round(F.stability),
    ]);
  }
}

// Reads a recorded frame list with interpolation.
export class ReplayPlayer {
  constructor(data) {
    this.data = data; this.f = data.frames; this.duration = this.f.length ? this.f[this.f.length - 1][0] / 100 : 0;
  }
  sample(t, out) {
    const f = this.f; if (!f.length) return null;
    const tt = t * 100;
    let lo = 0, hi = f.length - 1;
    while (hi - lo > 1) { const m = (lo + hi) >> 1; if (f[m][0] <= tt) lo = m; else hi = m; }
    const a = f[lo], b = f[hi];
    const k = b[0] === a[0] ? 0 : clamp((tt - a[0]) / (b[0] - a[0]), 0, 1);
    const L = (i, s) => lerp(a[i], b[i], k) / s;
    out.pos.set(L(1, 10), L(2, 10), L(3, 10));
    out.q.set(a[4] / 1000, a[5] / 1000, a[6] / 1000, a[7] / 1000).normalize();
    const qb = _q2.set(b[4] / 1000, b[5] / 1000, b[6] / 1000, b[7] / 1000).normalize();
    out.q.slerp(qb, k);
    out.state = k < 0.5 ? a[8] : b[8];
    out.wing = L(9, 100); out.posture = L(10, 100); out.pitch = L(11, 100); out.turn = L(12, 100);
    out.canopyOpen = L(13, 100); out.brakeL = L(14, 100); out.brakeR = L(15, 100); out.speed = L(16, 10);
    out.runPhase = a[17] / 100 + k * 0.3; out.cBank = L(18, 100); out.stability = L(19, 1);
    return out;
  }
}
const _q2 = new THREE.Quaternion();
