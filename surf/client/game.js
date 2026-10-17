// Game runtime: rendering, client-side prediction + reconciliation, remote interpolation,
// spectator cameras and the animated menu background (demo bot surfing a map).

import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { PHYS, NET } from '../shared/config.js';
import { getMap, MAP_LIST } from '../shared/maps/index.js';
import { CollisionWorld } from '../shared/collision.js';
import { createPlayerState, stepPlayer, copyState, BTN, EV } from '../shared/sim.js';
import { MODE } from '../shared/movement.js';
import { botCommand } from '../shared/bot.js';
import { angleWrap } from '../shared/vec.js';
import { COLLECTIBLES } from '../shared/catalog.js';
import { buildWorld } from './render/world.js';
import { ViewModel } from './render/viewmodel.js';
import { Avatar } from './render/avatars.js';
import { Input } from './input.js';
import { audio } from './audio.js';
import { settings } from './settings.js';

const DT = 1 / PHYS.tickRate;
const RUN_STATES = ['idle', 'ready', 'running', 'finished'];
const lerp = (a, b, t) => a + (b - a) * t;
const lerpAngle = (a, b, t) => a + angleWrap(b - a) * t;

class Emitter {
  constructor() { this.h = {}; }
  on(e, f) { (this.h[e] ||= []).push(f); return () => { this.h[e] = this.h[e].filter((x) => x !== f); }; }
  emit(e, ...a) { for (const f of this.h[e] || []) f(...a); }
}

export class Game extends Emitter {
  constructor(canvas) {
    super();
    this.canvas = canvas;
    const r = (this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' }));
    r.toneMapping = THREE.ACESFilmicToneMapping;
    r.toneMappingExposure = 1.05;
    r.outputColorSpace = THREE.SRGBColorSpace;
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(settings.fov, 1, 4, 120000);
    this.camera.up.set(0, 0, 1);
    this.camera.rotation.order = 'ZYX';
    this.composer = new EffectComposer(r);
    this.composer.addPass(new RenderPass(this.scene, this.camera));
    // Guard: a single NaN/Inf pixel would be blown up by the bloom blur into large black blocks.
    this.composer.addPass(new ShaderPass({
      uniforms: { tDiffuse: { value: null } },
      vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
      fragmentShader: `uniform sampler2D tDiffuse; varying vec2 vUv;
        void main(){ vec4 c = texture2D(tDiffuse, vUv);
          if (any(isnan(c)) || any(isinf(c))) c = vec4(0.0, 0.0, 0.0, 1.0);
          gl_FragColor = clamp(c, 0.0, 32.0); }`,
    }));
    this.bloom = new UnrealBloomPass(new THREE.Vector2(256, 256), 0.5, 0.4, 0.85);
    this.composer.addPass(this.bloom);
    this.composer.addPass(new OutputPass());

    this.viewmodel = new ViewModel(r);
    this.input = new Input(canvas);
    this.avatars = new Map();
    this.mode = 'none'; // 'demo' | 'play'
    this.world = null;
    this.mapId = null;
    this.clock = new THREE.Clock();
    // automatic resolution scaling keeps the frame rate up on weaker GPUs
    this.dynScale = 1;
    this.frameMs = 16;
    this.perfCheckAt = performance.now() + 3000;
    this.autoBloomOff = false;
    this.acc = 0;
    this.time = 0;
    this.debug = false;
    this._buildDebug();
    this.resize();
    window.addEventListener('resize', () => this.resize());
    window.addEventListener('gz-settings', () => this.applySettings());
    this.applySettings();
    this.loop = this.loop.bind(this);
    requestAnimationFrame(this.loop);
  }

  applySettings() {
    this.camera.fov = settings.fov;
    this.camera.updateProjectionMatrix();
    this.autoBloomOff = false;
    this.dynScale = 1;
    audio.setVolumes({ master: settings.master, sfx: settings.sfx, ui: settings.ui });
    this.resize();
  }

  resize() {
    const w = window.innerWidth, h = window.innerHeight;
    const base = Math.min(window.devicePixelRatio || 1, settings.quality === 'low' ? 0.75 : 1.25);
    const pr = Math.max(0.5, base * this.dynScale);
    this.renderer.setPixelRatio(pr);
    this.renderer.setSize(w, h, false);
    this.composer.setPixelRatio(pr);
    this.composer.setSize(w, h);
    this.bloom.resolution.set(w * pr * 0.35, h * pr * 0.35);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.viewmodel.resize(w, h);
  }

  // ------------------------------------------------------------------ map
  loadMap(id) {
    if (this.mapId === id && this.world) return;
    if (this.world) {
      this.scene.remove(this.world.group, this.world.sky, this.world.lights);
      if (this.world.stars) this.scene.remove(this.world.stars);
      this.world.dispose();
    }
    this.mapId = id;
    this.map = getMap(id);
    this.collision = new CollisionWorld(this.map.brushes);
    this.world = buildWorld(this.map);
    this.scene.add(this.world.group, this.world.sky, this.world.lights);
    if (this.world.stars) this.scene.add(this.world.stars);
    this.scene.fog = this.world.fog;
    this.scene.background = new THREE.Color(this.map.theme.fog);
    this.emit('map', this.map);
  }

  // ------------------------------------------------------------------ demo (menu background)
  startDemo(mapId) {
    this.disconnect();
    this.mode = 'demo';
    this.loadMap(mapId || MAP_LIST[Math.floor(Math.random() * MAP_LIST.length)].id);
    this.demoPs = createPlayerState(this.map);
    this.demoPrev = copyState(this.demoPs);
    this.clearAvatars();
    const av = new Avatar(7, 'GLIDE BOT');
    av.setKnife(COLLECTIBLES[Math.floor(Math.random() * COLLECTIBLES.length)].collectible_id);
    av.tag.visible = false;
    this.avatars.set(-1, av);
    this.scene.add(av.root);
    this.demoCam = null;
    this.viewmodel.visible = false;
  }

  _demoTick() {
    const ps = this.demoPs;
    this.demoPrev = copyState(ps);
    const ev = [];
    stepPlayer(ps, botCommand(this.map, ps), { world: this.collision, map: this.map }, ev);
    for (const e of ev) {
      if (e.type === EV.FINISH || e.type === EV.FAIL) {
        // restart on a random map after a lap, keeps the menu lively
        this._demoRestart = (this._demoRestart || 0) + 1;
        if (e.type === EV.FINISH) setTimeout(() => this.mode === 'demo' && this.startDemo(), 1200);
      }
      if (e.type === EV.TELEPORT) this.demoCam = null;
    }
  }

  // ------------------------------------------------------------------ online / offline play
  /**
   * @param transport WsTransport | LocalTransport (opened)
   * @param hello {name, token, cgToken, spectate, mode, map}
   */
  connect(transport, hello) {
    this.disconnect();
    this.net = transport;
    this.mode = 'play';
    this.myId = null;
    this.ps = null;
    this.pending = [];
    this.outbox = [];
    this.seq = 0;
    this.snaps = [];
    this.roster = new Map();
    this.spectator = !!hello.spectate;
    this.spec = { target: null, mode: 'first' };
    this.freeCam = null;
    this.smooth = new THREE.Vector3();
    this.tickOffset = null;
    this.lastPing = 0;
    this.rtt = 0;
    this.records = [];
    this.timeLeft = 0;
    this.timeLeftAt = performance.now();
    this.vote = null;
    this.viewTp = -1;
    transport.onmessage = (m) => this._onMessage(m);
    transport.onclose = () => { if (this.mode === 'play') this.emit('disconnected'); };
    transport.send({ t: 'hello', ...hello });
  }

  disconnect() {
    if (this.net) { try { this.net.close(); } catch (e) { /* */ } }
    this.net = null;
    if (this.mode === 'play') this.clearAvatars();
    this.mode = 'none';
  }

  clearAvatars() {
    for (const a of this.avatars.values()) { this.scene.remove(a.root); a.dispose(); }
    this.avatars.clear();
  }

  send(m) { if (this.net) this.net.send(m); }

  _onMessage(m) {
    switch (m.t) {
      case 'welcome':
        this.myId = m.id;
        this.loadMap(m.map);
        this.ps = m.me;
        this.prevPs = copyState(m.me);
        this.viewTp = m.me.tpSeq;
        this.input.yaw = m.me.yaw;
        this.input.pitch = 0;
        this.spectator = m.spectator;
        this.roster.clear();
        for (const p of m.roster) this.roster.set(p.id, p);
        this.records = m.records;
        this.setTimeLeft(m.timeLeft);
        this.inventory = m.inventory;
        this.viewmodel.setKnife(m.inventory.equipped);
        this.viewmodel.visible = !this.spectator;
        this.vote = m.vote;
        this.room = m.room;
        this.voting = m.voting;
        this.emit('welcome', m);
        this.emit('roster', this.roster);
        this.emit('vote', this.vote);
        break;
      case 's':
        this._onSnapshot(m);
        break;
      case 'joined': case 'pinfo':
        this.roster.set(m.p.id, m.p);
        if (m.p.id === this.myId) {
          if (this.spectator !== m.p.spec) this.pending.length = 0; // switching surf <-> spectate
          this.spectator = m.p.spec;
          if (!this.spectator) this.viewmodel.setKnife(m.p.knife);
        }
        this.emit('roster', this.roster);
        break;
      case 'left':
        this.roster.delete(m.id);
        if (this.avatars.has(m.id)) { const a = this.avatars.get(m.id); this.scene.remove(a.root); a.dispose(); this.avatars.delete(m.id); }
        if (this.spec && this.spec.target === m.id) this.spec.target = null;
        this.emit('roster', this.roster);
        break;
      case 'roster':
        this.roster.clear();
        for (const p of m.roster) this.roster.set(p.id, p);
        this.emit('roster', this.roster);
        break;
      case 'map':
        this.loadMap(m.map);
        this.ps = m.me;
        this.prevPs = copyState(m.me);
        this.pending.length = 0;
        this.snaps.length = 0;
        this.records = m.records;
        this.setTimeLeft(m.timeLeft);
        this.vote = { state: 'playing', rtv: 0 };
        this.clearAvatars();
        this.emit('vote', this.vote);
        this.emit('records', this.records);
        break;
      case 'feed':
        this.emit('feed', m);
        if (m.kind === 'record' || m.kind === 'pb') { if (m.text.startsWith(this.myName() + ' ')) audio.play('pb'); }
        break;
      case 'records':
        this.records = m.list;
        this.emit('records', this.records);
        break;
      case 'vote_start':
        this.vote = { state: 'voting', options: m.options, counts: m.options.map(() => 0), endsAt: performance.now() + m.endsIn, reason: m.reason, mine: -1 };
        audio.play('vote');
        this.emit('vote', this.vote);
        break;
      case 'vote_update':
        if (this.vote && this.vote.state === 'voting') { this.vote.counts = m.counts; this.emit('vote', this.vote); }
        break;
      case 'vote_end':
        if (this.vote) { this.vote.state = 'ended'; this.vote.result = m.result; this.vote.counts = m.counts; this.emit('vote', this.vote); }
        break;
      case 'extend':
        this.setTimeLeft(m.timeLeft);
        this.vote = { state: 'playing', rtv: 0 };
        this.emit('vote', this.vote);
        break;
      case 'change':
        this.vote = { state: 'changing', map: m.map, at: performance.now() + m.in };
        this.emit('vote', this.vote);
        this.emit('mapchange', m);
        break;
      case 'rtv':
        if (this.vote && this.vote.state === 'playing') { this.vote.rtv = m.count; this.vote.needed = m.needed; this.emit('vote', this.vote); }
        break;
      case 'inventory':
        this.inventory = { owned: m.owned, equipped: m.equipped, total: m.total };
        if (!this.spectator) this.viewmodel.setKnife(m.equipped);
        this.emit('inventory', this.inventory);
        break;
      case 'crate':
        this.emit('crate', m);
        break;
      case 'leaderboard':
        this.emit('leaderboard', m);
        break;
      case 'chat':
        this.emit('chat', m);
        break;
      case 'pong':
        this.rtt = performance.now() - m.t0;
        break;
      case 'full': case 'kicked': case 'error':
        this.emit('servermsg', m);
        break;
      default:
        break;
    }
  }

  myName() { const me = this.roster && this.roster.get(this.myId); return me ? me.name : ''; }

  setTimeLeft(ms) { this.timeLeft = ms; this.timeLeftAt = performance.now(); }

  getTimeLeft() { return Math.max(0, this.timeLeft - (performance.now() - this.timeLeftAt)); }

  _onSnapshot(m) {
    const now = performance.now();
    const map = new Map();
    for (const a of m.p) map.set(a[0], a);
    this.snaps.push({ tick: m.k, players: map });
    if (this.snaps.length > 60) this.snaps.shift();
    const off = m.k - now / 10;
    this.tickOffset = this.tickOffset === null ? off : (off > this.tickOffset ? off : lerp(this.tickOffset, off, 0.05));
    if (m.tl) this.setTimeLeft(m.tl);

    if (m.me && !this.spectator && this.ps) {
      const ack = m.a;
      this.pending = this.pending.filter((c) => c.seq > ack);
      const s = m.me;
      const ctx = { world: this.collision, map: this.map };
      for (const c of this.pending) stepPlayer(s, c, ctx, null);
      const dx = this.ps.pos.x - s.pos.x, dy = this.ps.pos.y - s.pos.y, dz = this.ps.pos.z - s.pos.z;
      const err = Math.hypot(dx, dy, dz);
      if (err > 0.01) {
        if (err < 96) this.smooth.add(new THREE.Vector3(dx, dy, dz));
        else this.smooth.set(0, 0, 0);
        this.prevPs.pos.x -= dx; this.prevPs.pos.y -= dy; this.prevPs.pos.z -= dz;
      }
      const keepYaw = this.ps.yaw;
      this.ps = s;
      this.ps.yaw = keepYaw;
      if (s.tpSeq !== this.viewTp) { this.viewTp = s.tpSeq; this.input.yaw = s.yaw; this.input.pitch = 0; }
    }
  }

  _playTick() {
    if (!this.ps || this.spectator) return;
    const axes = this.input.moveAxes();
    let buttons = axes.jump ? BTN.JUMP : 0;
    if (this.restartQueued) { buttons |= BTN.RESTART; this.restartQueued = false; }
    const yaw = Math.round(this.input.yaw * 10000) / 10000;
    const pitch = Math.round(this.input.pitch * 10000) / 10000;
    const cmd = { seq: ++this.seq, fwd: axes.fwd, side: axes.side, buttons, yaw, pitch };
    this.pending.push(cmd);
    if (this.pending.length > 400) this.pending.shift();
    this.outbox.push([cmd.seq, cmd.fwd, cmd.side, cmd.buttons, yaw, pitch]);
    if (this.outbox.length >= NET.cmdsPerPacket) { this.send({ t: 'cmds', c: this.outbox }); this.outbox = []; }

    this.prevPs = copyState(this.ps);
    const ev = [];
    stepPlayer(this.ps, cmd, { world: this.collision, map: this.map }, ev);
    for (const e of ev) this._onLocalEvent(e);
    if (this.ps.tpSeq !== this.viewTp) {
      this.viewTp = this.ps.tpSeq;
      this.input.yaw = this.ps.yaw;
      this.input.pitch = 0;
      this.prevPs = copyState(this.ps);
      this.smooth.set(0, 0, 0);
    }
  }

  _onLocalEvent(e) {
    switch (e.type) {
      case EV.JUMP: audio.play('jump'); break;
      case EV.LAND: if (e.speed > 50) audio.play('land', e.speed); break;
      case EV.CHECKPOINT: audio.play('checkpoint'); this.emit('checkpoint', e); break;
      case EV.TELEPORT: audio.play('teleport'); break;
      case EV.BOOST: audio.play('boost'); this.emit('boost', e); break;
      case EV.FAIL: audio.play('fail'); break;
      case EV.FINISH: audio.play('finish'); this.emit('finish', e); break;
      case EV.START: audio.play('start'); break;
      case EV.RESTART: audio.play('restart'); break;
      default: break;
    }
  }

  // ------------------------------------------------------------------ controls (called by UI)
  restart() { this.restartQueued = true; }
  setSpectate(on) { this.send({ t: 'spectate', on }); }
  requestRtv() { this.send({ t: 'rtv' }); }
  castVote(i) {
    if (!this.vote || this.vote.state !== 'voting' || i < 0 || i >= this.vote.options.length) return;
    this.vote.mine = i;
    this.send({ t: 'vote', i });
    audio.play('click');
    this.emit('vote', this.vote);
  }

  // ------------------------------------------------------------------ interpolation
  _remoteStates() {
    const out = new Map();
    if (!this.snaps.length || this.tickOffset === null) return out;
    const rt = performance.now() / 10 + this.tickOffset - NET.interpDelayTicks;
    let a = null, b = null;
    for (let i = this.snaps.length - 1; i >= 0; i--) {
      if (this.snaps[i].tick <= rt) { a = this.snaps[i]; b = this.snaps[i + 1] || null; break; }
    }
    if (!a) { a = this.snaps[0]; b = null; }
    const t = b ? Math.max(0, Math.min(1, (rt - a.tick) / (b.tick - a.tick))) : 0;
    for (const [id, pa] of a.players) {
      const pb = b && b.players.get(id);
      const tele = !pb || pb[13] !== pa[13];
      const q = tele ? (pb && t > 0.5 ? pb : pa) : null;
      const L = (k) => (q ? q[k] : lerp(pa[k], pb[k], t));
      out.set(id, {
        id, x: L(1), y: L(2), z: L(3), vx: L(4), vy: L(5), vz: L(6),
        yaw: q ? q[7] : lerpAngle(pa[7], pb[7], t), pitch: L(8), mode: (q || pa)[9], stage: (q || pa)[10],
        runState: RUN_STATES[(q || pa)[11]] || 'idle', runTicks: q ? q[12] : lerp(pa[12], pb[12], t),
      });
    }
    return out;
  }

  // ------------------------------------------------------------------ main loop
  bloomActive() { return settings.bloom && settings.quality !== 'low' && !this.autoBloomOff; }

  _adaptQuality(rawDt) {
    if (document.hidden || rawDt > 0.25) return; // tab switches are not slow frames
    this.frameMs += (rawDt * 1000 - this.frameMs) * 0.05;
    const now = performance.now();
    if (now < this.perfCheckAt) return;
    this.perfCheckAt = now + 1500;
    if (this.frameMs > 21) {
      if (this.dynScale > 0.55) { this.dynScale = Math.max(0.5, this.dynScale - 0.12); this.resize(); }
      else if (!this.autoBloomOff && settings.bloom) this.autoBloomOff = true;
    } else if (this.frameMs < 13 && this.dynScale < 1) {
      this.dynScale = Math.min(1, this.dynScale + 0.06);
      this.resize();
    }
  }

  loop() {
    requestAnimationFrame(this.loop);
    const rawDt = this.clock.getDelta();
    this._adaptQuality(rawDt);
    const dt = Math.min(0.1, rawDt);
    this.time += dt;
    this.acc += dt;
    let steps = 0;
    while (this.acc >= DT && steps < 25) {
      if (this.mode === 'demo') this._demoTick();
      else if (this.mode === 'play') this._playTick();
      this.acc -= DT;
      steps++;
    }
    if (steps >= 25) this.acc = 0;
    const alpha = this.acc / DT;
    if (this.mode === 'play') this._handleKeys();
    if (this.mode === 'play' && this.net && performance.now() - this.lastPing > 2000) {
      this.lastPing = performance.now();
      this.send({ t: 'ping', t0: this.lastPing, rtt: Math.round(this.rtt) });
    }
    this._updateView(dt, alpha);
    this._render();
  }

  _handleKeys() {
    const I = this.input;
    if (!I.locked) { I.clearPressed(); return; }
    if (I.takePressed('KeyR') && !this.spectator) this.restart();
    if (I.takePressed('KeyF') && !this.spectator) this.viewmodel.play('inspect');
    if (I.takePressed('Mouse0')) {
      if (this.spectator) this._cycleTarget(1);
      else { this.viewmodel.play('slash'); audio.play('slash'); }
    }
    if (I.takePressed('Mouse2') && this.spectator) this._cycleTarget(-1);
    if (I.takePressed('Space') && this.spectator) {
      const order = ['first', 'chase', 'free'];
      this.spec.mode = order[(order.indexOf(this.spec.mode) + 1) % order.length];
      if (this.spec.mode === 'free') this.freeCam = null;
      this.emit('spec', this.spec);
    }
    if (I.takePressed('KeyJ')) this.setSpectate(!this.spectator);
    if (I.takePressed('KeyV')) this.requestRtv();
    if (I.takePressed('F3')) this.debug = !this.debug;
    for (let i = 1; i <= 5; i++) if (I.takePressed('Digit' + i)) this.castVote(i - 1);
    I.clearPressed();
  }

  _cycleTarget(dir) {
    const ids = [...this.roster.values()].filter((p) => !p.spec && p.id !== this.myId).map((p) => p.id);
    if (!ids.length) { this.spec.target = null; return; }
    const i = ids.indexOf(this.spec.target);
    this.spec.target = ids[(i + dir + ids.length) % ids.length];
    if (this.spec.mode === 'free') this.spec.mode = 'first';
    this.emit('spec', this.spec);
  }

  _updateView(dt, alpha) {
    const cam = this.camera;
    const md = this.input.takeMouseDelta();
    let hud = null;
    let showViewmodel = false;
    let vmSpeed = 0, vmGround = true;

    if (this.mode === 'demo' && this.demoPs) {
      const a = this.demoPrev, b = this.demoPs;
      const s = { x: lerp(a.pos.x, b.pos.x, alpha), y: lerp(a.pos.y, b.pos.y, alpha), z: lerp(a.pos.z, b.pos.z, alpha), vx: b.vel.x, vy: b.vel.y, vz: b.vel.z, yaw: lerpAngle(a.yaw, b.yaw, alpha), pitch: 0 };
      const av = this.avatars.get(-1);
      if (av) av.update(s, dt, false);
      const hs = Math.hypot(b.vel.x, b.vel.y);
      const heading = hs > 50 ? Math.atan2(b.vel.y, b.vel.x) : b.yaw;
      const orbit = 0.55 + Math.sin(this.time * 0.15) * 0.35; // three-quarter view from the side
      const back = b.onGround ? 260 : 420;
      const target = new THREE.Vector3(s.x - Math.cos(heading + orbit) * back, s.y - Math.sin(heading + orbit) * back, s.z + (b.onGround ? 260 : 190));
      if (!this.demoCam) this.demoCam = target.clone();
      this.demoCam.lerp(target, Math.min(1, dt * 2.5));
      cam.position.copy(this.demoCam);
      cam.lookAt(s.x + b.vel.x * 0.25, s.y + b.vel.y * 0.25, s.z + 40);
    } else if (this.mode === 'play' && this.map) {
      const remotes = this._remoteStates();
      // avatars
      for (const [id, st] of remotes) {
        if (id === this.myId) continue;
        let av = this.avatars.get(id);
        const info = this.roster.get(id);
        if (!av) {
          av = new Avatar(id, info ? info.name : 'player');
          this.avatars.set(id, av);
          this.scene.add(av.root);
        }
        av.setKnife(info ? info.knife : null);
        if (info && av.name !== info.name) av.setName(info.name);
        const hidden = this.spectator && this.spec.mode === 'first' && this.spec.target === id;
        av.root.visible = !hidden;
        av.update(st, dt, true);
      }
      for (const [id, av] of this.avatars) if (!remotes.has(id)) av.root.visible = false;

      if (!this.spectator && this.ps) {
        this.smooth.multiplyScalar(Math.exp(-dt * 12));
        const a = this.prevPs, b = this.ps;
        const x = lerp(a.pos.x, b.pos.x, alpha) + this.smooth.x;
        const y = lerp(a.pos.y, b.pos.y, alpha) + this.smooth.y;
        const z = lerp(a.pos.z, b.pos.z, alpha) + this.smooth.z;
        cam.position.set(x, y, z + PHYS.viewHeight);
        this._setCamAngles(this.input.yaw, this.input.pitch, b);
        vmSpeed = Math.hypot(b.vel.x, b.vel.y);
        vmGround = b.onGround;
        showViewmodel = true;
        hud = { self: true, speed: vmSpeed, vel: b.vel, mode: b.mode, runState: b.runState, runTicks: b.runTicks + (b.runState === 'running' ? alpha : 0), stage: b.stage, onGround: b.onGround, pos: b.pos, surfNormal: b.surfNormal, maxSpeed: b.maxSpeed, finishTicks: b.finishTicks };
        audio.setMotion(vmSpeed, b.mode === MODE.SURFING, true);
      } else {
        // spectator
        let target = this.spec.target !== null ? remotes.get(this.spec.target) : null;
        if (!target && this.spec.mode !== 'free') {
          const first = [...remotes.keys()].find((id) => id !== this.myId);
          if (first !== undefined) { this.spec.target = first; target = remotes.get(first); this.emit('spec', this.spec); }
        }
        if (this.spec.mode === 'free' || !target) {
          this._freeCam(dt);
        } else if (this.spec.mode === 'first') {
          cam.position.set(target.x, target.y, target.z + PHYS.viewHeight);
          this._setCamAngles(target.yaw, target.pitch, null);
          const info = this.roster.get(target.id);
          this.viewmodel.setKnife(info ? info.knife : null);
          showViewmodel = true;
          vmSpeed = Math.hypot(target.vx, target.vy);
          vmGround = target.mode === MODE.WALKING;
        } else {
          const h = this.input.yaw;
          const p = Math.max(-0.6, Math.min(1.2, -this.input.pitch + 0.25));
          const d = 260;
          cam.position.set(target.x - Math.cos(h) * Math.cos(p) * d, target.y - Math.sin(h) * Math.cos(p) * d, target.z + 50 + Math.sin(p) * d);
          cam.up.set(0, 0, 1);
          cam.lookAt(target.x, target.y, target.z + 50);
        }
        if (target) {
          const info = this.roster.get(target.id);
          hud = { self: false, name: info ? info.name : '?', speed: Math.hypot(target.vx, target.vy), vel: { x: target.vx, y: target.vy, z: target.vz }, mode: target.mode, runState: target.runState, runTicks: target.runTicks, stage: target.stage };
          audio.setMotion(hud.speed, target.mode === MODE.SURFING, this.spec.mode !== 'free');
        } else {
          audio.setMotion(0, false, false);
        }
        hud = hud || { self: false, name: null };
        hud.spec = { ...this.spec, hasTarget: !!target };
      }
    } else {
      audio.setMotion(0, false, false);
    }

    this.viewmodel.visible = showViewmodel;
    this.viewmodel.update(dt, { speed: vmSpeed, onGround: vmGround, mouseDX: md.x, mouseDY: md.y, bob: settings.viewBob, reduceMotion: settings.reduceMotion });
    if (this.world) this.world.update(this.time, cam.position);
    this._updateDebug(hud);
    if (hud) this.emit('hud', hud);
  }

  _setCamAngles(yaw, pitch, ps) {
    const cam = this.camera;
    cam.up.set(0, 0, 1);
    const cp = Math.cos(pitch);
    const dir = new THREE.Vector3(Math.cos(yaw) * cp, Math.sin(yaw) * cp, Math.sin(pitch));
    cam.lookAt(cam.position.x + dir.x, cam.position.y + dir.y, cam.position.z + dir.z);
    // optional gentle roll while surfing (off with reduced motion)
    if (ps && !settings.reduceMotion) {
      const c = Math.cos(-yaw), s = Math.sin(-yaw);
      const lat = c * ps.vel.y + s * ps.vel.x;
      const roll = Math.max(-0.035, Math.min(0.035, -lat / 40000));
      this._roll = lerp(this._roll || 0, ps.mode === MODE.SURFING ? roll : 0, 0.08);
      cam.rotateZ(this._roll);
    }
  }

  _freeCam(dt) {
    const cam = this.camera;
    if (!this.freeCam) this.freeCam = cam.position.clone();
    const I = this.input;
    const yaw = I.yaw, pitch = I.pitch;
    const f = new THREE.Vector3(Math.cos(yaw) * Math.cos(pitch), Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch));
    const r = new THREE.Vector3(Math.sin(yaw), -Math.cos(yaw), 0);
    const sp = (I.down('ShiftLeft') ? 3500 : 1200) * dt;
    const ax = I.moveAxes();
    this.freeCam.addScaledVector(f, ax.fwd * sp).addScaledVector(r, ax.side * sp);
    if (I.down('Space')) this.freeCam.z += sp;
    if (I.down('ControlLeft') || I.down('KeyC')) this.freeCam.z -= sp;
    cam.position.copy(this.freeCam);
    this._setCamAngles(yaw, pitch, null);
  }

  // ------------------------------------------------------------------ debug overlay (spec 16)
  _buildDebug() {
    this.dbgGroup = new THREE.Group();
    this.dbgVel = new THREE.ArrowHelper(new THREE.Vector3(1, 0, 0), new THREE.Vector3(), 100, 0x00ff88, 20, 10);
    this.dbgNormal = new THREE.ArrowHelper(new THREE.Vector3(0, 0, 1), new THREE.Vector3(), 80, 0xff3366, 16, 8);
    this.dbgWish = new THREE.ArrowHelper(new THREE.Vector3(1, 0, 0), new THREE.Vector3(), 60, 0x33aaff, 14, 7);
    const box = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(32, 32, 72)), new THREE.LineBasicMaterial({ color: 0xffff00 }));
    this.dbgBox = box;
    for (const o of [this.dbgVel, this.dbgNormal, this.dbgWish, box]) { o.traverse((c) => { if (c.material) { c.material.depthTest = false; c.material.toneMapped = false; } c.renderOrder = 20; }); this.dbgGroup.add(o); }
    this.dbgGroup.visible = false;
    this.scene.add(this.dbgGroup);
  }

  _updateDebug(hud) {
    const on = this.debug && this.mode === 'play' && this.ps && !this.spectator;
    this.dbgGroup.visible = !!on;
    if (!on) { if (hud) hud.debug = null; return; }
    const ps = this.ps;
    const base = new THREE.Vector3(ps.pos.x, ps.pos.y, ps.pos.z + 36);
    // place helpers in front of the camera so they are visible in first person
    const ahead = new THREE.Vector3(Math.cos(this.input.yaw) * 120, Math.sin(this.input.yaw) * 120, -30);
    const o = base.clone().add(ahead);
    const v = new THREE.Vector3(ps.vel.x, ps.vel.y, ps.vel.z);
    const sp = v.length();
    this.dbgVel.position.copy(o);
    if (sp > 1) this.dbgVel.setDirection(v.clone().normalize());
    this.dbgVel.setLength(Math.min(160, 20 + sp / 15), 20, 10);
    this.dbgNormal.visible = !!ps.surfNormal && ps.mode === MODE.SURFING;
    if (ps.surfNormal) { this.dbgNormal.position.copy(o); this.dbgNormal.setDirection(new THREE.Vector3(ps.surfNormal.x, ps.surfNormal.y, ps.surfNormal.z)); }
    const ax = this.input.moveAxes();
    const y = this.input.yaw;
    const w = new THREE.Vector3(Math.cos(y) * ax.fwd + Math.sin(y) * ax.side, Math.sin(y) * ax.fwd - Math.cos(y) * ax.side, 0);
    this.dbgWish.visible = w.lengthSq() > 0;
    if (this.dbgWish.visible) { this.dbgWish.position.copy(o); this.dbgWish.setDirection(w.normalize()); }
    this.dbgBox.position.set(ps.pos.x, ps.pos.y, ps.pos.z + 36);
    if (hud) {
      hud.debug = {
        mode: Object.keys(MODE).find((k) => MODE[k] === ps.mode), onGround: ps.onGround, pos: ps.pos, vel: ps.vel,
        normal: ps.surfNormal, traces: this.collision.traceCount, pending: this.pending.length, rtt: this.rtt, tick: this.seq,
      };
      this.collision.traceCount = 0;
    }
  }

  _render() {
    const r = this.renderer;
    r.autoClear = true;
    if (this.bloomActive()) this.composer.render();
    else r.render(this.scene, this.camera);
    if (this.viewmodel.visible) this.viewmodel.render(r);
  }
}
