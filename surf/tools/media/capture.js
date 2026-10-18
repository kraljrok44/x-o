// Store media capture (covers + preview videos). Runs the real renderer and map geometry with
// surf bots, but advances time manually so every frame can be grabbed by tools/media/record.mjs.

import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { Game } from '../../client/game.js';
import { createPlayerState, stepPlayer, copyState, EV, formatTime } from '../../shared/sim.js';
import { botCommand } from '../../shared/bot.js';
import { PHYS } from '../../shared/config.js';
import { MODE } from '../../shared/movement.js';
import { angleWrap } from '../../shared/vec.js';
import { Avatar } from '../../client/render/avatars.js';
import { buildCollectible } from '../../client/render/skins.js';

const DT = 1 / PHYS.tickRate;
const lerp = (a, b, t) => a + (b - a) * t;

const game = new Game(document.getElementById('c'));
game.loop = () => {}; // the capture drives frames itself
game.input.takeMouseDelta = () => ({ x: 0, y: 0 });

let sc = null; // current scenario

function interp(b, alpha) {
  const a = b.prev, s = b.ps;
  return {
    x: lerp(a.pos.x, s.pos.x, alpha), y: lerp(a.pos.y, s.pos.y, alpha), z: lerp(a.pos.z, s.pos.z, alpha),
    vx: s.vel.x, vy: s.vel.y, vz: s.vel.z, yaw: a.yaw + angleWrap(s.yaw - a.yaw) * alpha, pitch: 0,
  };
}

function tickBot(b) {
  b.prev = copyState(b.ps);
  const ev = [];
  stepPlayer(b.ps, botCommand(game.map, b.ps), { world: game.collision, map: game.map }, ev);
  for (const e of ev) {
    if (e.type === EV.TELEPORT || e.type === EV.FAIL) b.cut = true;
    if (e.type === EV.FINISH) b.finished = true;
  }
}

/**
 * Prepare a scene.
 * @param o.map      map id
 * @param o.bots     [{ ticks, knife, color }] – bot 0 is the hero; ticks = head start (pre-simulated)
 * @param o.view     'fp' | 'chase'
 * @param o.orbit    chase: angle around the hero (radians, 0 = straight behind)
 * @param o.back/up  chase camera distance and height
 */
function setup(o) {
  game.clearAvatars();
  game.mapId = null;
  game.loadMap(o.map);
  game.mode = 'capture';
  const bots = o.bots.map((d, i) => {
    const b = { ps: createPlayerState(game.map), id: d.color ?? i };
    b.prev = copyState(b.ps);
    for (let t = 0; t < d.ticks; t++) tickBot(b);
    b.cut = false;
    if (!(o.view === 'fp' && i === 0 && !o.showHero)) {
      b.av = new Avatar(b.id, ' ');
      b.av.setKnife(d.knife);
      b.av.tag.visible = false;
      game.scene.add(b.av.root);
    }
    return b;
  });
  sc = { ...o, bots, acc: 0, t: 0, cam: null, yaw: null, pitch: -0.1, prevYaw: null };
  if (o.view === 'fp') game.viewmodel.setKnife(o.bots[0].knife);
  game.viewmodel.visible = o.view === 'fp' && o.vm !== false;
  game.viewmodel.state = { kind: 'idle', t: 0 };
  game.camera.fov = o.fov || 90;
  game.camera.updateProjectionMatrix();
  const hud = document.getElementById('hud');
  hud.style.display = o.hud ? '' : 'none';
  document.getElementById('dot').style.display = o.view === 'fp' && o.hud ? '' : 'none';
  frame(0);
}

function frame(dt, draw = true) {
  const s = sc;
  s.t += dt;
  s.acc += dt;
  while (s.acc >= DT) { for (const b of s.bots) tickBot(b); s.acc -= DT; }
  const alpha = s.acc / DT;
  game.time += dt;
  const hero = s.bots[0];
  const h = interp(hero, alpha);
  for (const b of s.bots) if (b.av) b.av.update(interp(b, alpha), Math.max(dt, 1e-3), false);
  const cam = game.camera;
  const hs = Math.hypot(h.vx, h.vy);
  const heading = hs > 80 ? Math.atan2(h.vy, h.vx) : hero.ps.yaw;
  const snap = hero.cut || s.yaw === null;
  hero.cut = false;

  if (s.view === 'fp') {
    // first person: look where we travel, smoothed like a player's mouse
    const k = snap ? 1 : 1 - Math.exp(-dt * 3.2);
    s.yaw = s.yaw === null || snap ? heading : s.yaw + angleWrap(heading - s.yaw) * k;
    const tp = Math.max(-0.32, Math.min(0.12, Math.atan2(h.vz, Math.max(hs, 1)) * 0.3)) - 0.09;
    s.pitch += (tp - s.pitch) * (snap ? 1 : 1 - Math.exp(-dt * 2));
    cam.position.set(h.x - Math.cos(s.yaw) * (s.pull ?? 0), h.y - Math.sin(s.yaw) * (s.pull ?? 0), h.z + PHYS.viewHeight + (s.rise ?? 0));
    // optional 360 spin while airborne: o.spin = [startSec, endSec] in run time
    let spin = 0;
    if (s.spin) { const u = Math.max(0, Math.min(1, (s.t - s.spin[0]) / (s.spin[1] - s.spin[0]))); spin = (u < 0.5 ? 2 * u * u : 1 - Math.pow(-2 * u + 2, 2) / 2) * Math.PI * 2; }
    game._setCamAngles(s.yaw + (s.yawAdd ?? 0) + spin, s.pitch + (s.pitchAdd ?? 0), hero.ps);
    const yawRate = s.prevYaw === null || dt === 0 ? 0 : (s.yaw + spin - s.prevYaw) / dt;
    s.prevYaw = s.yaw + spin;
    game.viewmodel.update(Math.max(dt, 1e-3), { speed: hs, onGround: hero.ps.onGround, mouseDX: -yawRate * 40, mouseDY: 0, bob: true, reduceMotion: false });
  } else {
    // rigidly attached to the hero; only the viewing direction is smoothed (no positional lag)
    const orbit = s.orbit + Math.sin(s.t * 0.35) * (s.sway ?? 0.15);
    const back = s.back ?? 300, up = s.up ?? 130;
    s.yaw = s.yaw === null || snap ? heading : s.yaw + angleWrap(heading - s.yaw) * (1 - Math.exp(-dt * 2.2));
    cam.position.set(h.x - Math.cos(s.yaw + orbit) * back, h.y - Math.sin(s.yaw + orbit) * back, h.z + up);
    cam.up.set(0, 0, 1);
    cam.lookAt(h.x + Math.cos(s.yaw) * (s.lead ?? 250), h.y + Math.sin(s.yaw) * (s.lead ?? 250), h.z + 20 + (s.lookUp ?? 0));
  }
  if (game.world && draw) game.world.update(game.time, cam.position);
  if (draw) game._render();

  if (s.hud) {
    document.getElementById('spd').textContent = String(Math.round(hs));
    const p = hero.ps;
    document.getElementById('tim').textContent = formatTime(Math.floor(p.runTicks || 0));
  }
  const pad = (game.map.pads || []).some((pd) => {
    if (pd.stage !== hero.ps.stage) return false;
    const dx = h.x - pd.c[0], dy = h.y - pd.c[1], c = Math.cos(-pd.yaw), sn = Math.sin(-pd.yaw);
    return Math.abs(c * dx - sn * dy) < pd.hl + 120 && Math.abs(sn * dx + c * dy) < pd.hw && h.z > pd.c[2] - 200 && h.z < pd.c[2] + 600;
  });
  return { speed: hs, mode: hero.ps.mode, stage: hero.ps.stage, z: h.z, finished: !!hero.finished, surfing: hero.ps.mode === MODE.SURFING, ground: hero.ps.onGround, pad, t: s.t };
}

// ---------------------------------------------------------------- cover key art: hero knife overlay
const kc = document.getElementById('k');
const kr = new THREE.WebGLRenderer({ canvas: kc, antialias: true, alpha: true, preserveDrawingBuffer: true });
kr.toneMapping = THREE.ACESFilmicToneMapping;
kr.outputColorSpace = THREE.SRGBColorSpace;
const kScene = new THREE.Scene();
{
  const pm = new THREE.PMREMGenerator(kr);
  kScene.environment = pm.fromScene(new RoomEnvironment(), 0.04).texture;
  pm.dispose();
  const key = new THREE.DirectionalLight(0xffffff, 2.2); key.position.set(-3, 5, 6);
  const rim = new THREE.DirectionalLight(0x66e0ff, 2.5); rim.position.set(5, -2, -4);
  kScene.add(key, rim, new THREE.AmbientLight(0xffffff, 0.35));
}
const kCam = new THREE.PerspectiveCamera(30, 1, 0.1, 1000);
let kObj = null;

/** Draw a large knife into the overlay canvas. box = {x,y,w,h} in CSS px, rot = [rx, ry, rz]. */
function knife(id, box, rot) {
  kc.style.left = box.x + 'px'; kc.style.top = box.y + 'px';
  kc.style.width = box.w + 'px'; kc.style.height = box.h + 'px';
  kc.style.display = 'block';
  kr.setPixelRatio(1);
  kr.setSize(box.w, box.h, false);
  if (kObj) kScene.remove(kObj);
  kObj = buildCollectible(id);
  kObj.rotation.set(...rot);
  kObj.updateMatrixWorld(true);
  const b = new THREE.Box3().setFromObject(kObj);
  kObj.position.sub(b.getCenter(new THREE.Vector3()));
  kScene.add(kObj);
  const size = b.getSize(new THREE.Vector3());
  kCam.aspect = box.w / box.h;
  const fit = Math.max(size.y, size.x / kCam.aspect) * 0.5 / Math.tan((kCam.fov * Math.PI) / 360);
  kCam.position.set(0, 0, fit * 1.08 + size.z);
  kCam.lookAt(0, 0, 0);
  kCam.updateProjectionMatrix();
  kr.render(kScene, kCam);
}
function hideKnife() { kc.style.display = 'none'; }

function skip(sec, fps = 30) { for (let i = 0, n = Math.round(sec * fps); i < n; i++) frame(1 / fps, i === n - 1); }

window.media = { setup, frame, skip, knife, hideKnife, ready: true };
