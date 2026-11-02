// Main game orchestrator: sessions, fixed-step simulation, cameras, scoring, replays and platform hooks.
import * as THREE from './lib/three.module.min.js';
import { clamp, lerp, damp, makeNoise, fmtTime } from './util.js';
import { getMap } from './maps.js';
import { World } from './world.js';
import { Sky, Particles, Puffs, WEATHERS } from './sky.js';
import { Pilot, standingQuat, basisQuat } from './pilot.js';
import { FlightModel, STATE } from './flight.js';
import { CameraRig, VIEW_LABEL } from './camera.js';
import { AudioEngine } from './audio.js';
import { Input } from './input.js';
import { PostFX } from './postfx.js';
import { platform } from './platform.js';
import { save } from './save.js';
import {
  Gates, FlightStats, ReplayRecorder, ReplayPlayer, computeScore, rankFor, MISSIONS, MODES, defaultGates, landingTrial,
  CATALOG, RANK_ORDER, MAP_UNLOCK,
} from './gameplay.js';
import { UI } from './ui.js';

const STEP = 1 / 120;
const _v = new THREE.Vector3(), _v2 = new THREE.Vector3(), _q = new THREE.Quaternion();

export function resolveQuality(q) {
  const forced = new URLSearchParams(location.search).get('quality');
  if (forced) return forced;
  if (q && q !== 'auto') return q;
  const touch = matchMedia('(pointer: coarse)').matches;
  const cores = navigator.hardwareConcurrency || 4;
  const mem = navigator.deviceMemory || 4;
  if (touch || cores <= 4 || mem <= 4) return 'low';
  return 'medium';
}

export class Game {
  constructor(canvas) {
    this.canvas = canvas;
    const S = save.data.settings;
    this.settings = S;
    this.quality = resolveQuality(S.quality);
    const r = this.renderer = new THREE.WebGLRenderer({ canvas, antialias: this.quality === 'low', powerPreference: 'high-performance', stencil: false });
    r.outputColorSpace = THREE.SRGBColorSpace;
    r.toneMapping = THREE.ACESFilmicToneMapping;
    r.shadowMap.enabled = this.quality !== 'low' && S.shadows;
    r.shadowMap.type = THREE.PCFSoftShadowMap;
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(70, 16 / 9, 0.8, 26000);
    this.post = new PostFX(r);
    this.sky = new Sky(this.scene, r, this.quality);
    this.particles = new Particles(this.scene);
    this.puffs = new Puffs(this.scene);
    this.audio = new AudioEngine();
    this.input = new Input(canvas);
    this.pilot = new Pilot(this.scene, this.currentLook());
    this.flight = new FlightModel();
    this.rig = new CameraRig(this.camera);
    this.stats = new FlightStats();
    this.rec = new ReplayRecorder();
    this.noise = makeNoise(99);
    this.wind = new THREE.Vector3(); this.gust = new THREE.Vector3(); this.baseWind = new THREE.Vector3();
    this.prevPos = new THREE.Vector3(); this.prevQ = new THREE.Quaternion();
    this.renderPos = new THREE.Vector3(); this.renderQ = new THREE.Quaternion();
    this.mode = 'loading';
    this.world = null; this.def = null; this.gates = null;
    this.acc = 0; this.time = 0;
    this.clr = { agl: 999, clr: 999 }; this.clrT = 0;
    this.routeNear = { d: 0, s: 0 };
    this.ui = new UI(this);
    this.applySettings();
    window.addEventListener('resize', () => this.resize());
    document.addEventListener('visibilitychange', () => { if (document.hidden && this.mode === 'flight') this.pause(); });
    platform.onMute = (m) => this.audio.mute('sdk', m);
    platform.onPause = (p) => { if (p) { this.audio.mute('ad', true); if (this.mode === 'flight') this.pause(); } else this.audio.mute('ad', false); };
    this.resize();
  }

  currentLook() {
    const e = save.data.equip, C = CATALOG;
    const f = (list, id) => list.find((x) => x.id === id) || list[0];
    return { suit: f(C.suit, e.suit).suit, helmet: f(C.helmet, e.helmet).helmet, chute: f(C.chute, e.chute).chute, trail: f(C.trail, e.trail).trail };
  }

  applySettings() {
    const S = this.settings;
    this.audio.setVolumes({ master: S.master, music: S.music, sfx: S.sfx });
    this.input.bind = { ...S.keys }; this.input.pad = { ...S.pad };
    this.input.invert = S.invert; this.input.smoothing = S.smoothing;
    this.rig.settings.shake = S.shake; this.rig.settings.fov = S.fov;
    this.post.enabled = S.motionBlur && this.quality !== 'low';
    this.particles.enabled = true;
    this.renderer.shadowMap.enabled = this.quality !== 'low' && S.shadows;
    this.sky.sun.castShadow = this.renderer.shadowMap.enabled;
    this.rig.view = S.view || 'chase';
  }

  resize() {
    const w = window.innerWidth, h = window.innerHeight;
    const dpr = window.devicePixelRatio || 1;
    const pr = this.quality === 'high' ? Math.min(dpr, 2) : this.quality === 'medium' ? Math.min(dpr, 1.25) : Math.min(dpr, 1) * 0.85;
    this.renderer.setPixelRatio(pr);
    this.renderer.setSize(w, h, false);
    this.post.setSize(Math.floor(w * pr), Math.floor(h * pr));
    this.camera.aspect = w / h; this.camera.updateProjectionMatrix();
  }

  // ------------------------------------------------------------------ world loading
  async loadWorld(mapId, time, weather) {
    const same = this.world && this.def && this.def.id === mapId && this.world.quality === this.quality;
    if (!same) {
      this.ui.loading(true, `Building ${getMap(mapId).name}…`, 0);
      platform.loadingStart();
      await new Promise((r) => setTimeout(r, 30));
      if (this.world) { this.world.dispose(); this.world = null; }
      this.def = getMap(mapId);
      const w = new World(this.scene, this.def, this.quality);
      await w.build((p) => this.ui.loading(true, null, p));
      this.world = w;
      this.audio.setAmbient(this.def.ambient);
      platform.loadingStop();
      this.ui.loading(false);
    }
    const tk = time || this.def.defaultTime;
    let wk = weather || 'clear';
    if (wk === 'rain' && !this.def.rain) wk = 'clouds';
    this.sky.apply(tk, wk, this.def);
    this.world.setLighting(this.sky);
    this.particles.configure(this.def.particles, !!WEATHERS[wk].rain);
    const W = this.def.wind, mul = WEATHERS[wk].wind;
    this.baseWind.set(Math.sin(W.dir) * W.speed * mul, 0, Math.cos(W.dir) * W.speed * mul);
    this.gustMul = WEATHERS[wk].gust;
    this.timeKey = tk; this.weatherKey = wk;
  }

  // ------------------------------------------------------------------ menu background
  async showMenu() {
    platform.gameplayStop();
    this.mode = 'loading';
    this.clearSession();
    if (!this.world) await this.loadWorld('skyfall', 'sunset', 'clear');
    this.mode = 'menu';
    this.menuS = this.def.route.L * 0.12;
    this.rig.cine.t = 99; this.rig.cine.shot = 0;
    this.pilot.canopyOpen = 0;
    this.ui.show('menu');
    this.audio.music.on = true;
  }

  async showGarage() {
    if (!this.world) await this.loadWorld('skyfall', 'sunset', 'clear');
    this.mode = 'garage';
    this.garageT = 0;
    this.ui.show('garage');
  }

  clearSession() {
    if (this.gates) { this.gates.dispose(); this.gates = null; }
    if (this.extraTarget) { this.world && this.world.group.remove(this.extraTarget); this.extraTarget = null; }
    if (this.routeDots) { this.scene.remove(this.routeDots); this.routeDots.geometry.dispose(); this.routeDots = null; }
    this.session = null;
    this.replay = null;
    this.ending = null;
    this.puffs.clear();
  }

  // ------------------------------------------------------------------ sessions
  async startSession(opts) {
    // opts: {map, mode, missionId, time, weather}
    const mission = opts.missionId ? MISSIONS.find((m) => m.id === opts.missionId) : null;
    const map = mission ? mission.map : opts.map;
    const modeKey = mission ? mission.mode : opts.mode;
    this.mode = 'loading';
    platform.gameplayStop();
    this.clearSession();
    await this.loadWorld(map, mission ? mission.time : opts.time, mission ? mission.weather : opts.weather);
    const def = this.def;
    const s = { map, mode: modeKey, mission, opts: { ...opts }, time: this.timeKey, weather: this.weatherKey };
    s.gatesCfg = modeKey === 'free' || modeKey === 'landing' ? null : (mission && mission.gates) || defaultGates(modeKey);
    s.limit = mission ? mission.limit : null;
    if (modeKey === 'landing') {
      const lt = landingTrial(def, this.world);
      s.start = lt.start; s.target = lt.target;
      s.directDist = Math.hypot(lt.start.x - lt.target.x, lt.start.z - lt.target.z);
      s.targetTime = 60;
    } else {
      const e = def.exit;
      // find the real cliff edge along the heading and start a short run-up behind it
      const hx = Math.sin(e.heading), hz = Math.cos(e.heading);
      let edge = 4;
      for (let f = -20; f < 90; f += 0.5) { if (this.world.ground(e.x + hx * f, e.z + hz * f).h < e.y - 1) { edge = f; break; } }
      const sx = e.x + hx * (edge - 9), sz = e.z + hz * (edge - 9);
      s.start = { x: sx, y: this.world.ground(sx, sz).h + 0.95, z: sz, heading: e.heading };
      s.target = { ...def.landing };
      s.targetTime = def.route.L / 38;
    }
    s.routeLen = def.route.L;
    this.session = s;
    this.gates = new Gates(this.scene, this.world, def, s.gatesCfg, modeKey);
    if (this.gates.list.length) {
      const fin = this.gates.list[this.gates.finishIndex];
      s.par = fin.s / 57;
    } else s.par = 60;
    this.tutorial = !!(mission && mission.tutorial && !save.data.tutorialDone);
    this.tutStep = 0;
    this.resetFlight();
    platform.setContext({ map: def.name, mode: MODES[modeKey].name, mission: mission ? mission.name : '' });
    this.ui.prep(s);
  }

  buildRouteDots() {
    const R = this.def.route;
    const pts = [];
    for (let s = 40; s < R.L * 0.92; s += 35) { const p = R.line.at(s); pts.push(p.x, R.routeY(s), p.z); }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
    if (!this.dotTex) {
      const c = document.createElement('canvas'); c.width = c.height = 32;
      const x = c.getContext('2d'); const gr = x.createRadialGradient(16, 16, 0, 16, 16, 16);
      gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.45, 'rgba(255,255,255,0.8)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
      x.fillStyle = gr; x.fillRect(0, 0, 32, 32); this.dotTex = new THREE.CanvasTexture(c);
    }
    this.routeDots = new THREE.Points(g, new THREE.PointsMaterial({ color: 0x9fe8ff, map: this.dotTex, size: 3, sizeAttenuation: true, transparent: true, opacity: 0.6, depthWrite: false }));
    this.routeDots.visible = this.settings.hudRoute && this.session.mode !== 'landing';
    this.scene.add(this.routeDots);
  }

  resetFlight() {
    const s = this.session;
    if (!this.routeDots) this.buildRouteDots();
    if (s.mode === 'landing' && !this.extraTarget) { const lt = landingTrial(this.def, this.world); if (lt.target.x !== this.def.landing.x || lt.target.z !== this.def.landing.z) this.extraTarget = this.world.addTarget(lt.target.x, lt.target.y, lt.target.z, lt.target.r); }
    this.flight.reset(s.start, s.mode === 'landing' ? 'canopy' : 'ready');
    this.flight.autoSpreadAt = this.settings.autoSpread || this.tutorial ? 1.8 : 99;
    this.stats.reset();
    this.rec.reset();
    this.gates.reset();
    this.ending = null;
    this.acc = 0;
    this.started = false;
    this.paused = false;
    this.prevPos.copy(this.flight.pos); this.prevQ.copy(this.flight.q);
    this.renderPos.copy(this.flight.pos); this.renderQ.copy(this.flight.q);
    this.pilot.canopyOpen = s.mode === 'landing' ? 1 : 0;
    this.rig.orbit.yaw = 0; this.rig.orbit.dist = s.mode === 'landing' ? 18 : 11; this.rig.orbit.pitch = 0.42;
    this.rig.lookYaw = 0; this.rig.lookPitch = 0;
    this.rig.target.copy(this.flight.pos);
    this.rig.pos.copy(this.flight.pos);
    this.puffs.clear();
    this.warnLevel = 0;
    this.mode = 'prep';
    this.preview = null;
    this.trailT = 0;
    this.lastGateEv = null;
    this.timeOver = false;
    this.deployWindowShown = false;
    platform.gameplayStart();
    this.ui.show('prep');
    this.ui.prep(this.session);
  }

  jump() {
    if (this.mode !== 'prep') return;
    this.preview = null;
    this.mode = 'flight';
    this.started = true;
    if (this.session.mode !== 'landing') this.flight.startRun();
    this.stats.startAlt = this.flight.pos.y;
    this.stats.exitPos = this.flight.pos.clone();
    this.ui.show('hud');
    this.audio.play('click');
    platform.gameplayStart();
  }

  restart() {
    if (!this.session) return;
    this.ui.hideModal();
    this.resetFlight();
  }

  pause() {
    if (this.mode !== 'flight' && this.mode !== 'prep') return;
    this.pausedFrom = this.mode;
    this.mode = 'paused';
    platform.gameplayStop();
    this.ui.showModal('pause');
  }
  resume() {
    if (this.mode !== 'paused') return;
    this.mode = this.pausedFrom || 'flight';
    this.ui.hideModal();
    platform.gameplayStart();
  }

  // ------------------------------------------------------------------ simulation
  physicsStep(h) {
    const F = this.flight;
    this.prevPos.copy(F.pos); this.prevQ.copy(F.q);
    const prevState = F.state;
    const inp = this.inp;
    F.gust.copy(this.gust);
    const res = F.step(h, inp, this.wind, this.world);
    if (F.state !== prevState) this.onStateChange(prevState, F.state);
    if (F.state !== STATE.READY) this.rec.sample(h, F, inp);
    const flying = F.state >= STATE.FREEFALL && F.state <= STATE.CANOPY;
    if (flying) {
      this.stats.totalTime += h;
      const kmh = F.vel.length() * 3.6;
      this.stats.sampleFlight(h, kmh, F.stability, this.clr.clr, this.prevPos.distanceTo(F.pos));
      if (this.gates.list.length && F.state <= STATE.WINGSUIT) {
        for (const ev of this.gates.check(this.prevPos, F.pos)) this.onGate(ev);
      }
      const s = this.session;
      if (s.limit && this.stats.totalTime > s.limit && !this.timeOver) { this.timeOver = true; this.ui.flash('TIME LIMIT EXCEEDED', '#ff4a3a'); }
      // leave the flight area
      const lim = this.def.size * 1.5;
      if (Math.abs(F.pos.x) > lim || Math.abs(F.pos.z) > lim) { F.setState(STATE.CRASHED); this.endFlight({ type: 'crash', what: 'bounds' }); return; }
    }
    if (res) {
      if (res === 'exit') { this.audio.play('jump'); this.stats.exitPos = F.pos.clone(); }
      else this.endFlight(res);
    }
  }

  onStateChange(from, to) {
    if (to === STATE.WINGSUIT) { this.audio.play('wings'); this.rig.kick(0.3); }
    if (to === STATE.DEPLOY) { this.audio.play('deploy'); }
    if (to === STATE.CANOPY) { this.rig.kick(0.8); if (this.flight.hardOpening) { this.stats.hardOpening = true; this.ui.flash('HARD OPENING', '#ffd23f'); } }
  }

  onGate(ev) {
    const g = this.gates.list[ev.index];
    if (ev.type === 'pass') {
      this.stats.gatesPassed++; this.stats.accSum += ev.acc;
      const perfect = ev.acc > 0.75;
      this.audio.play(perfect ? 'gatePerfect' : 'gate');
      this.ui.flash(perfect ? 'PERFECT GATE' : 'GATE', perfect ? '#7af0ff' : '#3dff8a');
      if (ev.finish && this.session.mode === 'speed') { this.stats.finishTime = this.stats.totalTime; this.ui.flash(`FINISH ${fmtTime(this.stats.finishTime)}`, '#ffd23f'); }
      this.puffs.burst(g.c, [1, 0.8, 0.4, 0.6], 14, 12, 3);
    } else {
      this.audio.play('miss');
      this.ui.flash('GATE MISSED', '#ff4a3a');
      if (ev.finish && this.session.mode === 'speed') this.stats.finishTime = this.stats.totalTime + 15;
    }
  }

  endFlight(res) {
    if (this.ending) return;
    const F = this.flight, st = this.stats, s = this.session;
    this.rec.sample(0, F, this.inp, true);
    // all remaining gates missed
    if (this.gates.list.length) for (let i = this.gates.next; i < this.gates.list.length; i++) if (this.gates.list[i].state === 'pending') this.gates.list[i].state = 'missed';
    st.gatesTotal = this.gates.list.length;
    st.landPos = F.pos.clone();
    const crashVel = F.vel.clone();
    if (res.type === 'land' && !res.crash && !res.water) {
      const d = Math.hypot(F.pos.x - s.target.x, F.pos.z - s.target.z);
      st.landDist = d;
      st.landQuality = res.hard ? 0.6 : 1;
      if (s.mode === 'landing' && res.roof !== (s.target.y > 5 && this.def.city)) st.landDist = d + 50;
      this.audio.play('land');
      this.puffs.burst(F.pos.clone().setY(F.pos.y - 0.9), this.dustColor(), 10, 4, 2);
      this.ending = { t: 0, ok: true, res };
    } else {
      st.crashed = true;
      st.crashWhat = res.water ? 'water' : res.what || (res.type === 'land' ? 'hard landing' : 'terrain');
      const water = res.water || res.what === 'water';
      this.audio.play(water ? 'splash' : 'crash');
      this.rig.kick(1.5);
      this.puffs.burst(F.pos, water ? [0.85, 0.95, 1, 0.9] : this.dustColor(), 40, 14, 5);
      this.ending = { t: 0, ok: false, res, vel: crashVel.multiplyScalar(water ? 0.05 : 0.18), spin: new THREE.Vector3(Math.random() * 8 - 4, Math.random() * 8 - 4, Math.random() * 8 - 4) };
    }
    platform.gameplayStop();
  }

  dustColor() {
    const id = this.def.id;
    if (id === 'skyfall') return this.flight.pos.y > 1300 ? [0.95, 0.97, 1, 0.8] : [0.6, 0.55, 0.45, 0.7];
    if (id === 'redstone') return [0.85, 0.55, 0.35, 0.8];
    if (id === 'tidal') return [0.85, 0.8, 0.65, 0.7];
    return [0.6, 0.6, 0.6, 0.7];
  }

  async finishFlight() {
    const s = this.session, st = this.stats, F = this.flight;
    const ok = this.ending.ok;
    const def = this.def;
    const ex = st.exitPos || F.pos;
    const horiz = Math.hypot((st.landPos || F.pos).x - ex.x, (st.landPos || F.pos).z - ex.z);
    const drop = Math.max(1, ex.y - (st.landPos || F.pos).y);
    const ctx = { par: s.par, targetTime: s.targetTime, landR: s.target.r, routeLen: s.routeLen * 0.95, directDist: s.directDist || 1, glideRatio: horiz / drop };
    const sc = computeScore(s.mode, st, ctx);
    // success criteria
    const reasons = [];
    if (!ok) reasons.push(st.crashWhat === 'bounds' ? 'Left the flight area' : st.crashWhat === 'water' ? 'Water landing' : st.crashWhat === 'hard landing' ? 'Landing too hard' : `Collision (${st.crashWhat})`);
    const maxMiss = s.mission ? s.mission.maxMiss ?? 1 : 99;
    const missed = st.gatesTotal - st.gatesPassed;
    if (ok && st.gatesTotal && missed > maxMiss && s.mode !== 'free') reasons.push(`Missed ${missed} gates (max ${maxMiss})`);
    if (ok && this.timeOver) reasons.push('Time limit exceeded');
    if (ok && s.mode === 'landing' && st.landDist > s.target.r) reasons.push('Landed outside the target');
    if (ok && s.mission && s.mode !== 'landing' && st.landDist > s.target.r * 3) reasons.push('Landed too far from the landing zone');
    const success = reasons.length === 0;
    const rank = success ? rankFor(sc.total) : null;
    // rewards & progress
    const D = save.data;
    let coins = success ? Math.floor(sc.total / 20) : Math.floor(sc.total / 60);
    let firstClear = false, newRecord = false;
    if (s.mission && success) {
      const prev = D.missions[s.mission.id];
      if (!prev) { firstClear = true; coins += 50; }
      if (!prev || sc.total > prev.best) D.missions[s.mission.id] = { best: sc.total, rank: rank.id };
    }
    const rk = `${s.map}_${s.mode}`;
    const rec = D.records[rk] || {};
    if (success && (!rec.score || sc.total > rec.score)) { rec.score = sc.total; rec.rank = rank.id; newRecord = !!D.records[rk]; }
    if (s.mode === 'speed' && success && st.finishTime != null && (!rec.time || st.finishTime < rec.time)) { rec.time = st.finishTime; newRecord = true; }
    if (!rec.maxSpeed || st.maxSpeed > rec.maxSpeed) rec.maxSpeed = st.maxSpeed;
    rec.flights = (rec.flights || 0) + 1;
    D.records[rk] = rec;
    D.coins += coins;
    D.flights++;
    D.stats.flightTime += st.totalTime; D.stats.maxSpeed = Math.max(D.stats.maxSpeed, st.maxSpeed);
    if (ok) D.stats.landings++; else D.stats.crashes++;
    D.stats.gates += st.gatesPassed;
    if (this.tutorial) D.tutorialDone = true;
    this.tutorial = false;
    save.write();
    if ((newRecord && success) || (rank && rank.id === 'perfect')) platform.happytime();
    platform.progress(Object.keys(D.missions).length / MISSIONS.length * 100);
    // keep last replay in memory
    this.lastReplay = {
      meta: { map: s.map, mode: s.mode, mission: s.mission ? s.mission.id : null, time: s.time, weather: s.weather, score: sc.total, rank: rank ? rank.id : null, ok: success, date: Date.now(), look: this.currentLook(), maxSpeed: Math.round(st.maxSpeed), duration: st.totalTime },
      frames: this.rec.frames.slice(),
    };
    this.lastResult = { sc, rank, success, reasons, coins, firstClear, newRecord, st, ctx, ok };
    // logical break -> midgame ad (only if ads enabled on this platform)
    this.mode = 'results';
    if (platform.adsEnabled) {
      this.ui.adLock(true);
      await platform.midgame({ started: () => this.audio.mute('ad', true) });
      this.audio.mute('ad', false);
      this.ui.adLock(false);
    }
    this.audio.play(success ? 'finish' : 'fail');
    this.ui.results(this.lastResult, s);
  }

  async doubleCoins() {
    const R = this.lastResult;
    if (!R || R.doubled || !platform.rewardedAvailable) return;
    this.ui.adLock(true);
    const ok = await platform.rewarded({ started: () => this.audio.mute('ad', true) });
    this.audio.mute('ad', false);
    this.ui.adLock(false);
    if (ok) {
      R.doubled = true;
      save.data.coins += R.coins; save.write();
      this.audio.play('coin');
      this.ui.toast(`Reward: +${R.coins} coins!`);
      this.ui.results(R, this.session);
    } else this.ui.toast('No ad available right now. Please try again later.');
  }

  saveReplay() {
    if (!this.lastReplay) return;
    const A = save.data.archive;
    if (A.some((r) => r.meta.date === this.lastReplay.meta.date)) { this.ui.toast('Already saved'); return; }
    A.unshift(this.lastReplay);
    while (A.length > 4) A.pop();
    save.write();
    this.ui.toast('Replay saved to the Flight Archive');
  }

  nextMission() {
    const s = this.session;
    if (!s.mission) return;
    const i = MISSIONS.findIndex((m) => m.id === s.mission.id);
    const n = MISSIONS[i + 1];
    if (n && this.missionUnlocked(n)) this.startSession({ missionId: n.id });
  }
  missionUnlocked(m) {
    const i = MISSIONS.indexOf(m);
    if (i <= 0) return true;
    return !!save.data.missions[MISSIONS[i - 1].id] && this.mapUnlocked(m.map);
  }
  mapUnlocked(id) { return Object.keys(save.data.missions).length >= MAP_UNLOCK[id]; }
  rankCount(rankId) {
    const min = RANK_ORDER.indexOf(rankId);
    return Object.values(save.data.missions).filter((m) => RANK_ORDER.indexOf(m.rank) >= min).length;
  }

  // ------------------------------------------------------------------ replay
  async startReplay(rep) {
    if (!rep || !rep.frames.length) return;
    const m = rep.meta;
    this.mode = 'loading';
    const keep = this.session;
    this.clearSession();
    this.session = keep;
    await this.loadWorld(m.map, m.time, m.weather);
    const mission = m.mission ? MISSIONS.find((x) => x.id === m.mission) : null;
    const cfg = m.mode === 'free' || m.mode === 'landing' ? null : (mission && mission.gates) || defaultGates(m.mode);
    this.gates = new Gates(this.scene, this.world, this.def, cfg, m.mode);
    if (m.mode === 'landing') { const lt = landingTrial(this.def, this.world); if (lt.target.x !== this.def.landing.x || lt.target.z !== this.def.landing.z) this.extraTarget = this.world.addTarget(lt.target.x, lt.target.y, lt.target.z, lt.target.r); }
    this.pilot.setLook(m.look || this.currentLook());
    this.replay = { player: new ReplayPlayer(rep), t: 0, speed: 1, playing: true, rew: false, meta: m, sample: { pos: new THREE.Vector3(), q: new THREE.Quaternion() }, lastT: 0, prevPos: new THREE.Vector3() };
    this.mode = 'replay';
    platform.gameplayStop();
    this.rig.setView('chase');
    this.ui.show('replay');
    this.ui.replayInit(this.replay);
  }
  exitReplay() {
    this.pilot.setLook(this.currentLook());
    const back = this.session;
    this.replay = null;
    if (this.lastResult && back) { this.mode = 'results'; this.ui.results(this.lastResult, back); }
    else this.showMenu();
  }

  updateReplay(dt) {
    const R = this.replay;
    const dur = R.player.duration;
    if (R.playing) R.t += dt * R.speed * (R.rew ? -3 : 1);
    if (R.rew && !R.playing) R.t -= dt * 3;
    R.t = clamp(R.t, 0, dur);
    if (R.t >= dur) R.playing = false;
    const smp = R.player.sample(R.t, R.sample);
    if (!smp) return;
    // gate states: recompute when rewinding
    if (this.gates.list.length) {
      if (R.t < R.lastT) { this.gates.reset(); R.prevPos.copy(R.player.sample(0, { pos: new THREE.Vector3(), q: new THREE.Quaternion() }).pos); R.lastT = 0; }
      // step through frames from lastT to t
      const tmp = { pos: new THREE.Vector3(), q: new THREE.Quaternion() };
      for (let t = R.lastT; t <= R.t; t += 0.05) { R.player.sample(t, tmp); if (tmp.state <= STATE.WINGSUIT && tmp.state >= STATE.FREEFALL) this.gates.check(R.prevPos, tmp.pos); R.prevPos.copy(tmp.pos); }
    }
    R.lastT = R.t;
    this.renderPos.copy(smp.pos); this.renderQ.copy(smp.q);
    const vel = _v.set(0, 0, 0);
    const ahead = R.player.sample(Math.min(dur, R.t + 0.1), { pos: new THREE.Vector3(), q: new THREE.Quaternion() });
    if (ahead) vel.copy(ahead.pos).sub(smp.pos).multiplyScalar(10);
    if (vel.lengthSq() < 0.01) vel.set(0, 0, 0.1);
    this.replayVel = vel.clone();
    this.pilot.canopyOpen = smp.canopyOpen;
    const st = smp.state;
    const poseState = st === STATE.READY ? 'idle' : st === STATE.RUN ? 'run' : st === STATE.CANOPY ? 'canopy' : st === STATE.DEPLOY ? (smp.canopyOpen > 0.5 ? 'canopy' : 'flight') : st === STATE.LANDED ? 'landed' : st === STATE.CRASHED ? 'crash' : 'flight';
    this.pilot.animate(dt * Math.abs(R.speed), { state: poseState, wing: smp.wing, posture: smp.posture, pitchIn: smp.pitch, bankIn: smp.turn, airspeed: smp.speed, brakeL: smp.brakeL, brakeR: smp.brakeR, brake: Math.min(smp.brakeL, smp.brakeR), canopyBank: smp.cBank, runPhase: smp.runPhase, runSpeed: 1, crashT: R.t, celebrate: R.meta.ok });
    const canopy = st === STATE.CANOPY || (st === STATE.DEPLOY && smp.canopyOpen > 0.3);
    const fwd = _v2.set(0, 0, 1).applyQuaternion(smp.q);
    const focus = { pos: smp.pos, vel, q: smp.q, heading: Math.atan2(vel.x, vel.z), canopy, standing: st <= STATE.RUN || st >= STATE.LANDED, bank: 0, turbulence: 0 };
    this.rig.update(dt, focus, this.world, this.rig.view === 'orbit' || st >= STATE.LANDED || st <= STATE.RUN ? 'orbit' : 'flight');
    this.pilot.setHeadVisible(this.rig.view !== 'pilot');
    this.ui.replayUpdate(R, smp);
    this.lastFocus = focus;
  }

  // ------------------------------------------------------------------ per-frame
  frame(dt) {
    this.time += dt;
    this.input.poll(dt);
    const actions = this.input.consume();
    this.handleActions(actions);
    const [ldx, ldy] = this.input.takeLook();
    if (ldx || ldy) this.rig.look(ldx, ldy);
    this.inp = this.input.state();
    // wind + gusts
    const t = this.time;
    const gm = this.gustMul || 0.5;
    this.gust.set(this.noise.n2(t * 0.25, 1.3) * 3.5 * gm, this.noise.n2(t * 0.4, 7.7) * 1.5 * gm, this.noise.n2(t * 0.25, 4.1) * 3.5 * gm);
    this.wind.copy(this.baseWind).add(this.gust);

    if (this.mode === 'menu' || this.mode === 'garage') this.updateMenuScene(dt);
    else if (this.mode === 'prep') this.updatePrep(dt);
    else if (this.mode === 'flight') this.updateFlight(dt);
    else if (this.mode === 'replay') this.updateReplay(dt);
    else if (this.mode === 'results' || this.mode === 'paused') this.updateIdleScene(dt);

    if (this.world) {
      this.world.update(dt, this.baseWind);
      const focus = this.renderPos;
      this.sky.update(dt, this.camera, focus);
      const pv = this.mode === 'flight' ? this.flight.vel : this.mode === 'replay' && this.replayVel ? this.replayVel : _v.set(0, 0, 0);
      this.particles.update(dt, this.camera.position, pv, this.wind, this.settings.speedFx && (this.mode === 'flight' || this.mode === 'replay'));
      if (this.gates) this.gates.update(dt);
    }
    this.puffs.update(dt);
    // post fx
    const spd = this.mode === 'flight' ? this.flight.vel.length() : this.mode === 'replay' && this.replayVel ? this.replayVel.length() : 0;
    this.post.uniforms.uBlur.value = this.settings.speedFx ? clamp((spd - 40) / 50, 0, 1.4) : 0;
    this.post.uniforms.uDanger.value = damp(this.post.uniforms.uDanger.value, this.mode === 'flight' ? (this.warnLevel >= 3 ? 1 : this.warnLevel === 2 ? 0.45 : 0) : 0, 6, dt);
    this.post.uniforms.uFade.value = damp(this.post.uniforms.uFade.value, this.ending && !this.ending.ok && this.ending.t > 0.8 ? 0.55 : 0, 3, dt);
    // audio
    const flying = (this.mode === 'flight' && this.flight.state >= STATE.FREEFALL && this.flight.state <= STATE.CANOPY) || (this.mode === 'replay' && this.replay && this.replay.playing);
    const intensity = this.mode === 'flight' ? clamp((spd - 30) / 50, 0, 1) * 0.6 + (this.clr.clr < 40 ? 0.4 : 0) : this.mode === 'menu' ? 0.15 : 0.05;
    this.audio.update(dt, { flying, speed: spd, tension: this.pilot.tension, agl: this.clr.agl, turb: this.gust.length() * 0.2, intensity });
    this.post.render(this.scene, this.camera);
  }

  handleActions(actions) {
    for (const a of actions) {
      if (a.startsWith('pad:')) { this.ui.padNav(a); continue; }
      switch (this.mode) {
        case 'prep':
          if (a === 'stab') { if (this.preview) this.preview = null; else this.jump(); }
          else if (a === 'camera') this.cycleCam();
          else if (a === 'pause') this.pause();
          break;
        case 'flight':
          if (a === 'stab' && this.flight.state === STATE.FREEFALL) this.flight.spreadWings();
          else if (a === 'chute') { if (this.flight.deploy()) this.stats.deployAlt = this.clr.agl; }
          else if (a === 'camera') this.cycleCam();
          else if (a === 'restart') this.restart();
          else if (a === 'pause') this.pause();
          break;
        case 'paused':
          if (a === 'pause') this.resume();
          else if (a === 'restart') this.restart();
          break;
        case 'results':
          if (a === 'restart') { this.ui.hideModal(); this.restart(); }
          break;
        case 'replay':
          if (a === 'pause' || a === 'stab') this.ui.replayToggle();
          else if (a === 'camera') this.ui.replayCam();
          else if (a === 'restart') { this.replay.t = 0; this.replay.playing = true; }
          break;
      }
    }
  }

  cycleCam() {
    const v = this.rig.cycle();
    this.settings.view = v; save.write();
    this.ui.camLabel(VIEW_LABEL[v]);
  }

  updatePrep(dt) {
    const F = this.flight;
    this.renderPos.copy(F.pos); this.renderQ.copy(F.q);
    const landingStart = this.session.mode === 'landing';
    this.pilot.animate(dt, { state: landingStart ? 'canopy' : 'idle', wing: 0, airspeed: 0 });
    this.pilot.root.position.copy(F.pos); this.pilot.root.quaternion.copy(F.q);
    this.pilot.setHeadVisible(true);
    const focus = { pos: F.pos, vel: _v.set(Math.sin(F.heading) * 0.01, 0, Math.cos(F.heading) * 0.01), q: F.q, heading: F.heading, canopy: landingStart, standing: true };
    if (this.preview) {
      this.preview.t += dt;
      const u = this.preview.t / 9;
      if (u >= 1) this.preview = null; else this.rig.flyover(u, this.def, this.world);
    } else this.rig.update(dt, focus, this.world, 'orbit');
    this.clr.agl = 0;
    if (this.tutorial) this.ui.tutorial('prep');
  }

  updateFlight(dt) {
    const F = this.flight;
    if (!this.ending) {
      this.acc += dt;
      let n = 0;
      while (this.acc >= STEP && n < 10) { this.physicsStep(STEP); this.acc -= STEP; n++; if (this.ending) break; }
      if (n >= 10) this.acc = 0;
      const a = this.ending ? 1 : this.acc / STEP;
      this.renderPos.copy(this.prevPos).lerp(F.pos, a);
      this.renderQ.copy(this.prevQ).slerp(F.q, a);
    } else {
      this.updateEnding(dt);
    }
    // clearance probes at ~15Hz
    this.clrT -= dt;
    if (this.clrT <= 0 && !this.ending) {
      this.clrT = 1 / 15;
      this.clr = this.world.clearance(F.pos, F.vel.lengthSq() > 1 ? F.vel : _v.set(0, -1, 0));
      if (this.gates.list.length && F.state <= STATE.WINGSUIT) {
        this.def.route.line.nearest(F.pos.x, F.pos.z, this.routeNear);
        if (this.routeNear.d < 600) for (const ev of this.gates.checkBehind(this.routeNear.s)) this.onGate(ev);
      }
    }
    // pilot visuals
    const st = F.state;
    const poseState = st === STATE.READY ? 'idle' : st === STATE.RUN ? 'run' : st === STATE.FREEFALL && F.stateTime < 0.5 ? 'jump'
      : st === STATE.DEPLOY ? (F.canopyOpen > 0.5 ? 'canopy' : 'flight') : st === STATE.CANOPY ? (F.brake > 0.7 && this.clr.agl < 8 ? 'flare' : 'canopy')
        : st === STATE.LANDED ? 'landed' : st === STATE.CRASHED ? 'crash' : 'flight';
    this.pilot.canopyOpen = this.ending && this.ending.ok ? Math.max(0, this.pilot.canopyOpen - dt * 0.8) : F.canopyOpen;
    this.pilot.animate(dt, {
      state: poseState, wing: st === STATE.DEPLOY ? Math.max(0, F.wing - F.deployT) : F.wing, posture: F.posture, pitchIn: this.inp.pitch, bankIn: this.inp.turn + this.inp.roll,
      airspeed: F.airspeed, brakeL: F.brakeL, brakeR: F.brakeR, brake: F.brake, canopyBank: F.cBank, runPhase: F.runPhase, runSpeed: 1,
      crashT: this.ending ? this.ending.t : 0, celebrate: this.ending && this.ending.ok && this.ending.t > 0.6,
    });
    this.pilot.root.position.copy(this.renderPos); this.pilot.root.quaternion.copy(this.renderQ);
    this.pilot.setHeadVisible(this.rig.view !== 'pilot' || !!this.ending);
    // trail
    const look = this.pilot.trailColor;
    if (look && st === STATE.WINGSUIT) {
      this.trailT -= dt;
      if (this.trailT <= 0) {
        this.trailT = 0.025;
        const col = look === 'rainbow' ? hsl((this.time * 0.3) % 1) : look;
        const p = _v2.set(0, 0, -0.9).applyQuaternion(F.q).add(F.pos);
        this.puffs.emit(p, _v.copy(F.vel).multiplyScalar(0.05), col, 1.2, 2.2, 3);
      }
    }
    // camera
    const canopy = st === STATE.CANOPY || (st === STATE.DEPLOY && F.canopyOpen > 0.3);
    const focus = { pos: this.renderPos, vel: F.vel, q: this.renderQ, heading: st === STATE.CANOPY ? F.cHeading : F.heading, canopy, standing: st <= STATE.RUN, bank: F.bank * (st === STATE.WINGSUIT ? 1 : 0), turbulence: (1 - F.stability / 100) + this.gust.length() * 0.05 };
    const camMode = this.ending ? 'orbit' : st <= STATE.RUN && this.rig.view !== 'pilot' ? 'orbit' : 'flight';
    if (this.ending && !this.ending.camSet) { this.ending.camSet = true; this.rig.orbit.dist = 10; this.rig.orbit.pitch = 0.35; this.rig.orbit.yaw = 0.6; this.rig.target.copy(this.renderPos); }
    this.rig.update(dt, focus, this.world, camMode);
    this.lastFocus = focus;
    // warnings & HUD
    this.computeWarnings(dt);
    this.ui.hud(dt);
    if (this.tutorial) this.ui.tutorial(this.tutorialPhase());
  }

  updateEnding(dt) {
    const E = this.ending, F = this.flight;
    E.t += dt;
    if (!E.ok && E.vel) {
      F.pos.addScaledVector(E.vel, dt);
      E.vel.multiplyScalar(Math.exp(-2.5 * dt));
      E.vel.y -= 9.8 * dt;
      const g = this.world.ground(F.pos.x, F.pos.z);
      if (F.pos.y < g.h + 0.4) { F.pos.y = g.h + (g.water ? -0.3 : 0.4); E.vel.y = Math.abs(E.vel.y) * 0.25; E.vel.x *= 0.6; E.vel.z *= 0.6; E.spin.multiplyScalar(0.7); }
      _q.setFromEuler(new THREE.Euler(E.spin.x * dt, E.spin.y * dt, E.spin.z * dt));
      F.q.multiply(_q);
      E.spin.multiplyScalar(Math.exp(-1.5 * dt));
    } else if (E.ok) {
      standingQuat(F.cHeading, 0, _q);
      F.q.slerp(_q, 1 - Math.exp(-6 * dt));
    }
    this.renderPos.copy(F.pos); this.renderQ.copy(F.q);
    if (E.t > (E.ok ? 2.4 : 2.0) && !E.done) { E.done = true; this.finishFlight(); }
  }

  tutorialPhase() {
    const F = this.flight;
    if (F.state === STATE.RUN) return null;
    if (F.state === STATE.FREEFALL) return 'spread';
    if (F.state === STATE.WINGSUIT) {
      if (F.stateTime < 5) return 'pitch';
      if (this.deployWindowShown) return 'deploy';
      if (F.stateTime < 11) return 'turn';
      return 'gates';
    }
    if (F.state === STATE.CANOPY) return this.clr.agl < 25 ? 'flare' : 'canopy';
    return null;
  }

  computeWarnings(dt = 1 / 60) {
    const F = this.flight, W = this.settings.warn, s = this.session;
    let level = 0, text = '', cls = '';
    if (this.ending) { this.warnLevel = 0; this.ui.warn('', ''); return; }
    const flying = F.state === STATE.WINGSUIT || F.state === STATE.FREEFALL;
    const clr = this.clr.clr, agl = this.clr.agl;
    if (flying) {
      if (clr < W.critical) { level = 3; text = agl <= clr + 1 ? 'PULL UP' : 'OBSTACLE'; }
      else if (clr < W.strong) { level = 2; text = agl <= clr + 1 ? 'TERRAIN' : 'OBSTACLE'; }
      else if (clr < W.subtle) { level = 1; text = 'TERRAIN PROXIMITY'; }
      const dl = Math.hypot(F.pos.x - s.target.x, F.pos.z - s.target.z);
      const dh = F.pos.y - s.target.y;
      if (!level && F.state === STATE.WINGSUIT) {
        if (agl < 160 && dh < 260) { level = 2; text = 'DEPLOY NOW'; }
        else if ((dl < 900 && dh < 480) || (agl < 260 && dh < 420)) { text = 'DEPLOYMENT WINDOW'; cls = 'info'; this.deployWindowShown = true; }
      }
      if (!level && F.stability < 35) { level = 1; text = 'UNSTABLE — HOLD ' + this.ui.keyName('stab'); }
    } else if (F.state === STATE.CANOPY) {
      if (agl < 12 && agl > 1.5 && -F.vel.y > 3) { text = 'FLARE — ' + this.ui.keyName('pitchUp'); cls = 'info'; }
    }
    if (level && level !== this.warnLevel) this.audio.play(level >= 2 ? 'warnHigh' : 'warn');
    if (level >= 2) { this.warnBeep = (this.warnBeep || 0) - dt; if (this.warnBeep <= 0) { this.warnBeep = level === 3 ? 0.25 : 0.6; this.audio.play('warn'); } }
    this.warnLevel = level;
    this.ui.warn(text, cls || (level ? 'l' + level : ''));
  }

  updateMenuScene(dt) {
    const def = this.def, R = def.route;
    if (this.mode === 'garage') {
      // pilot hovering near the landing zone for inspection
      this.garageT += dt;
      const gp = R.line.at(R.L * 0.3);
      const pos = _v.set(gp.x, R.routeY(R.L * 0.3) + 40, gp.z);
      const chute = this.ui.garageTab === 'chute';
      this.pilot.canopyOpen = damp(this.pilot.canopyOpen, chute ? 1 : 0, 4, dt);
      const q = new THREE.Quaternion();
      if (chute) standingQuat(this.garageT * 0.3, 0, q);
      else basisQuat(new THREE.Vector3(Math.cos(this.garageT * 0.3), 0, -Math.sin(this.garageT * 0.3)), new THREE.Vector3(0, 1, 0), new THREE.Vector3(Math.sin(this.garageT * 0.3), 0, Math.cos(this.garageT * 0.3)), q);
      this.pilot.animate(dt, { state: chute ? 'canopy' : 'flight', wing: 1, posture: 0, pitchIn: 0, bankIn: Math.sin(this.garageT) * 0.3, airspeed: 45 });
      this.pilot.root.position.copy(pos); this.pilot.root.quaternion.copy(q);
      this.pilot.setHeadVisible(true);
      this.renderPos.copy(pos);
      const ang = -0.6;
      const dist = chute ? 16 : 4.2;
      this.camera.position.set(pos.x + Math.sin(ang) * dist, pos.y + (chute ? 4 : 1.4), pos.z + Math.cos(ang) * dist);
      this.camera.up.set(0, 1, 0);
      this.camera.lookAt(pos.x + (chute ? 0 : 0), pos.y + (chute ? 3 : 0), pos.z);
      if (this.camera.fov !== 50) { this.camera.fov = 50; this.camera.near = 0.3; this.camera.updateProjectionMatrix(); }
      return;
    }
    // AI pilot gliding along the route
    this.menuS += dt * 48;
    if (this.menuS > R.L * 0.78) this.menuS = R.L * 0.1;
    const s = this.menuS;
    const p = R.line.at(s), p2 = R.line.at(s + 30);
    const y = R.routeY(s) + 25, y2 = R.routeY(s + 30) + 25;
    const pos = _v.set(p.x, y, p.z);
    const vel = _v2.set(p2.x - p.x, y2 - y, p2.z - p.z).normalize().multiplyScalar(48);
    const p0 = R.line.at(s - 30);
    const curv = (Math.atan2(p2.x - p.x, p2.z - p.z) - Math.atan2(p.x - p0.x, p.z - p0.z));
    const bank = clamp(-curv * 6, -0.8, 0.8);
    this.menuBank = damp(this.menuBank || 0, bank, 2, dt);
    const vd = vel.clone().normalize();
    const r = new THREE.Vector3().crossVectors(vd, new THREE.Vector3(0, 1, 0)).normalize();
    const u = new THREE.Vector3().crossVectors(r, vd).normalize();
    const cb = Math.cos(this.menuBank), sb = Math.sin(this.menuBank);
    const uu = u.clone().multiplyScalar(cb).addScaledVector(r, sb);
    const a = 0.2;
    const f = vd.clone().multiplyScalar(Math.cos(a)).addScaledVector(uu, Math.sin(a));
    const up = uu.clone().multiplyScalar(Math.cos(a)).addScaledVector(vd, -Math.sin(a));
    const left = new THREE.Vector3().crossVectors(up, f).normalize();
    const q = basisQuat(left, up, f, new THREE.Quaternion());
    this.pilot.canopyOpen = 0;
    this.pilot.animate(dt, { state: 'flight', wing: 1, posture: 0, pitchIn: 0, bankIn: this.menuBank, airspeed: 48 });
    this.pilot.root.position.copy(pos); this.pilot.root.quaternion.copy(q);
    this.pilot.setHeadVisible(true);
    this.renderPos.copy(pos);
    const prevView = this.rig.view;
    this.rig.view = 'cinema';
    this.rig.update(dt, { pos, vel, q, heading: Math.atan2(vel.x, vel.z), bank: this.menuBank }, this.world, 'flight');
    this.rig.view = prevView;
  }

  updateIdleScene(dt) {
    // keep the pilot animating behind modals
    const F = this.flight;
    if (this.ending && this.mode !== 'paused') this.updateEnding(dt);
    const st = F.state;
    const ps = st === STATE.LANDED ? 'landed' : st === STATE.CRASHED ? 'crash' : st === STATE.CANOPY ? 'canopy' : st === STATE.READY ? 'idle' : 'flight';
    this.pilot.animate(this.mode === 'paused' ? 0 : dt, { state: ps, wing: F.wing, airspeed: this.mode === 'paused' ? 0 : F.airspeed, celebrate: this.ending && this.ending.ok, crashT: this.ending ? this.ending.t : 0, brakeL: F.brakeL, brakeR: F.brakeR });
    this.pilot.root.position.copy(this.renderPos); this.pilot.root.quaternion.copy(this.renderQ);
    if (this.mode === 'results' && this.lastFocus) {
      this.rig.update(dt, { ...this.lastFocus, pos: this.renderPos }, this.world, 'orbit');
    }
  }
}

function hsl(h) { const c = new THREE.Color().setHSL(h, 0.9, 0.6); return [c.r, c.g, c.b, 0.7]; }
