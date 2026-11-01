import * as THREE from 'three';
import { BLOCKS, HOTBAR, makeAtlas, blockIcon } from './blocks.js';
import { World, CS, CH } from './world.js';
import { buildAvatar, animateAvatar, disposeAvatar, cleanSkin, randomSkin, DEFAULT_SKIN, TONES, HAIR, EYES, CLOTHES, HAIR_STYLES, HATS, EYE_STYLES } from './avatar.js';

const $ = (s) => document.querySelector(s);
const store = {
  get(k, d) { try { const v = localStorage.getItem('bw.' + k); return v ? JSON.parse(v) : d; } catch (e) { return d; } },
  set(k, v) { try { localStorage.setItem('bw.' + k, JSON.stringify(v)); } catch (e) { /* storage blocked */ } },
};
const touchOnly = ('ontouchstart' in window) && !matchMedia('(pointer:fine)').matches;
const RADIUS = touchOnly ? 4 : 6;

// ------------------------------------------------------------------ renderer / scene
const canvas = $('#game');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: !touchOnly, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(devicePixelRatio || 1, touchOnly ? 1.5 : 2));
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(75, 1, 0.05, 400);
camera.rotation.order = 'YXZ';
scene.add(new THREE.AmbientLight(0xffffff, 0.9));
const sun = new THREE.DirectionalLight(0xffffff, 0.6); sun.position.set(0.5, 1, 0.3); scene.add(sun);

const atlas = makeAtlas();
const blockMat = new THREE.MeshBasicMaterial({ map: atlas.tex, vertexColors: true, alphaTest: 0.5, side: THREE.FrontSide });

let worldData = store.get('world', null);
if (!worldData || typeof worldData.seed !== 'number') worldData = { seed: Math.floor(Math.random() * 100000), edits: [], pos: null };
let world = newWorld(worldData);
function newWorld(d) {
  const w = new World(d.seed, blockMat);
  for (const [k, id] of d.edits || []) w.edits.set(k, id);
  return w;
}
scene.add(world.group);

const sel = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(1.004, 1.004, 1.004)), new THREE.LineBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.7 }));
sel.visible = false; scene.add(sel);

// ------------------------------------------------------------------ player
const P = { x: 8.5, y: 40, z: 8.5, vx: 0, vy: 0, vz: 0, yaw: 0, pitch: 0, ground: false, fly: false, w: 0.3, h: 1.8 };
let skin = cleanSkin(store.get('skin', DEFAULT_SKIN));
let avatar = buildAvatar(skin);
scene.add(avatar);
let view = 0; // 0 first person, 1 behind, 2 in front (see your skin)

function spawn(restore) {
  let x = 8.5, z = 8.5;
  if (restore && worldData.pos) { x = worldData.pos.x; z = worldData.pos.z; }
  for (let i = 0; i < 4; i++) world.update(x, z, 3, 60);
  P.x = x; P.z = z;
  P.y = restore && worldData.pos ? worldData.pos.y : world.surface(Math.floor(x), Math.floor(z)) + 0.05;
  P.yaw = restore && worldData.pos ? worldData.pos.yaw : 0; P.pitch = 0; P.vx = P.vy = P.vz = 0;
}

function collides(x, y, z) {
  const x0 = Math.floor(x - P.w), x1 = Math.floor(x + P.w), y0 = Math.floor(y), y1 = Math.floor(y + P.h - 0.001), z0 = Math.floor(z - P.w), z1 = Math.floor(z + P.w);
  for (let yy = y0; yy <= y1; yy++) for (let zz = z0; zz <= z1; zz++) for (let xx = x0; xx <= x1; xx++) if (world.isSolid(xx, yy, zz)) return true;
  return false;
}

const keys = new Set();
const touchKeys = new Set();
let jumpHeld = false;
const down = (k) => keys.has(k) || touchKeys.has(k);

function physics(dt) {
  // wait until the chunk under the player exists (no falling through unloaded ground)
  if (!world.chunks.has(Math.floor(P.x / CS) + ',' + Math.floor(P.z / CS))) return;
  const sin = Math.sin(P.yaw), cos = Math.cos(P.yaw);
  let fx = 0, fz = 0;
  const f = (down('KeyW') || down('ArrowUp') ? 1 : 0) - (down('KeyS') || down('ArrowDown') ? 1 : 0);
  const r = (down('KeyD') || down('ArrowRight') ? 1 : 0) - (down('KeyA') || down('ArrowLeft') ? 1 : 0);
  fx = -sin * f + cos * r; fz = -cos * f - sin * r;
  const l = Math.hypot(fx, fz) || 1;
  const sprint = down('ShiftLeft') || down('ControlLeft') || (touchOnly && f > 0);
  const sp = P.fly ? (sprint ? 14 : 8) : sprint ? 6.6 : 4.4;
  const tx = (f || r) ? (fx / l) * sp : 0, tz = (f || r) ? (fz / l) * sp : 0;
  const k = P.ground || P.fly ? Math.min(1, dt * 14) : Math.min(1, dt * 3);
  P.vx += (tx - P.vx) * k; P.vz += (tz - P.vz) * k;
  if (P.fly) {
    const up = (jumpHeld ? 1 : 0) - (down('ShiftLeft') || down('KeyC') ? 1 : 0);
    P.vy += (up * 8 - P.vy) * Math.min(1, dt * 10);
  } else {
    P.vy = Math.max(P.vy - 28 * dt, -45);
    if (jumpHeld && P.ground) { P.vy = 8.7; P.ground = false; }
  }
  const step = (dx, dy, dz) => {
    P.x += dx; if (collides(P.x, P.y, P.z)) { P.x -= dx; P.vx = 0; }
    P.z += dz; if (collides(P.x, P.y, P.z)) { P.z -= dz; P.vz = 0; }
    P.y += dy;
    if (collides(P.x, P.y, P.z)) {
      if (dy < 0) { P.y = Math.floor(P.y) + 1; P.ground = true; if (P.fly) P.fly = false; }
      else { P.y = Math.ceil(P.y + P.h) - P.h - 0.001; }
      P.vy = 0;
    } else if (dy < -1e-6) P.ground = false;
  };
  const n = Math.max(1, Math.ceil(Math.max(Math.abs(P.vx), Math.abs(P.vy), Math.abs(P.vz)) * dt / 0.3));
  for (let i = 0; i < n; i++) step(P.vx * dt / n, P.vy * dt / n, P.vz * dt / n);
  // standing on something?
  if (!P.fly && P.vy <= 0) P.ground = collides(P.x, P.y - 0.02, P.z);
  if (P.y < -20) { P.y = world.surface(Math.floor(P.x), Math.floor(P.z)) + 0.05; P.vy = 0; }
}

// ------------------------------------------------------------------ block interaction
let hit = null, breakT = 0, placeQueued = false, breakHeld = false;
const hotbar = $('#hotbar');
let slot = 0;
let nameTimer = 0;
function buildHotbar() {
  hotbar.innerHTML = '';
  HOTBAR.forEach((id, i) => {
    const d = document.createElement('div'); d.className = 'slot' + (i === slot ? ' on' : '');
    d.appendChild(blockIcon(atlas.canvas, id));
    const n = document.createElement('i'); n.textContent = i + 1; d.appendChild(n);
    d.onpointerdown = (e) => { e.stopPropagation(); selectSlot(i); };
    hotbar.appendChild(d);
  });
}
function selectSlot(i) {
  slot = (i + HOTBAR.length) % HOTBAR.length;
  [...hotbar.children].forEach((c, j) => c.classList.toggle('on', j === slot));
  const bn = $('#blockname'); bn.textContent = BLOCKS[HOTBAR[slot]].name; bn.classList.add('on');
  clearTimeout(nameTimer); nameTimer = setTimeout(() => bn.classList.remove('on'), 1400);
}

const dir = new THREE.Vector3();
function eye() { return new THREE.Vector3(P.x, P.y + 1.62, P.z); }
function lookDir() {
  const cp = Math.cos(P.pitch);
  return dir.set(-Math.sin(P.yaw) * cp, Math.sin(P.pitch), -Math.cos(P.yaw) * cp);
}

function interact(dt) {
  hit = world.raycast(eye(), lookDir(), 6);
  sel.visible = !!hit;
  if (hit) sel.position.set(hit.x + 0.5, hit.y + 0.5, hit.z + 0.5);
  breakT -= dt;
  if (breakHeld && hit && breakT <= 0) { world.set(hit.x, hit.y, hit.z, 0); breakT = 0.2; saveSoon(); }
  if (placeQueued) {
    placeQueued = false;
    if (hit && (hit.nx || hit.ny || hit.nz)) {
      const x = hit.x + hit.nx, y = hit.y + hit.ny, z = hit.z + hit.nz;
      const inside = x + 1 > P.x - P.w && x < P.x + P.w && z + 1 > P.z - P.w && z < P.z + P.w && y + 1 > P.y && y < P.y + P.h;
      if (!inside && y >= 0 && y < CH && !world.get(x, y, z)) { world.set(x, y, z, HOTBAR[slot]); saveSoon(); }
    }
  }
}

let saveT = 0;
function saveSoon() { clearTimeout(saveT); saveT = setTimeout(save, 800); }
function save() {
  worldData = { seed: world.seed, edits: [...world.edits], pos: { x: P.x, y: P.y, z: P.z, yaw: P.yaw } };
  store.set('world', worldData);
}
addEventListener('beforeunload', save);
setInterval(() => { if (playing) save(); }, 15000);

// ------------------------------------------------------------------ input
let playing = false;
const menu = $('#menu'), hud = $('#hud');
function setPlaying(on) {
  playing = on;
  menu.classList.toggle('hidden', on);
  hud.classList.toggle('hidden', !on);
  if (!on) { keys.clear(); touchKeys.clear(); breakHeld = false; jumpHeld = false; save(); }
}
function lock() { try { const p = canvas.requestPointerLock(); if (p && p.catch) p.catch(() => {}); } catch (e) { /* not available */ } }
document.addEventListener('pointerlockchange', () => { if (!document.pointerLockElement && playing && !touchOnly && !dragLook) setPlaying(false); });

addEventListener('keydown', (e) => {
  if (e.target && (e.target.tagName === 'INPUT')) return;
  if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Tab'].includes(e.code)) e.preventDefault();
  if (!playing) return;
  if (e.repeat) return;
  keys.add(e.code);
  if (e.code === 'Space') {
    jumpHeld = true;
    const now = performance.now();
    if (now - (keys.lastSpace || 0) < 280) P.fly = !P.fly;
    keys.lastSpace = now;
  }
  if (e.code.startsWith('Digit')) { const n = +e.code.slice(5); if (n >= 1 && n <= 9) selectSlot(n - 1); }
  if (e.code === 'KeyV') view = (view + 1) % 3;
  if (e.code === 'KeyE' || e.code === 'Escape') { if (document.pointerLockElement) document.exitPointerLock(); else setPlaying(false); }
});
addEventListener('keyup', (e) => { keys.delete(e.code); if (e.code === 'Space') jumpHeld = false; });
addEventListener('blur', () => { keys.clear(); jumpHeld = false; breakHeld = false; });
addEventListener('wheel', (e) => { if (playing) selectSlot(slot + (e.deltaY > 0 ? 1 : -1)); }, { passive: true });
addEventListener('contextmenu', (e) => e.preventDefault());

const SENS = 0.0022;
let dragLook = false;
function look(dx, dy, s) {
  P.yaw -= dx * s; P.pitch = Math.max(-1.55, Math.min(1.55, P.pitch - dy * s));
}
document.addEventListener('mousemove', (e) => {
  if (!playing) return;
  if (document.pointerLockElement) look(Math.max(-300, Math.min(300, e.movementX)), Math.max(-300, Math.min(300, e.movementY)), SENS);
  else if (dragLook) look(e.movementX, e.movementY, SENS);
});
canvas.addEventListener('mousedown', (e) => {
  if (!playing || touchOnly) return;
  if (!document.pointerLockElement) { dragLook = true; lock(); }
  if (e.button === 0) breakHeld = true;
  if (e.button === 2) placeQueued = true;
});
addEventListener('mouseup', (e) => { dragLook = false; if (e.button === 0) breakHeld = false; });

// touch: left arrows + buttons, drag anywhere else to look
const holds = { 't-up': 'KeyW', 't-down': 'KeyS', 't-left': 'KeyA', 't-right': 'KeyD' };
for (const [id, code] of Object.entries(holds)) {
  const el = $('#' + id);
  const on = (e) => { e.preventDefault(); touchKeys.add(code); el.classList.add('on'); };
  const off = (e) => { e.preventDefault(); touchKeys.delete(code); el.classList.remove('on'); };
  el.addEventListener('touchstart', on, { passive: false }); el.addEventListener('touchend', off); el.addEventListener('touchcancel', off);
}
const hold = (id, onDown, onUp) => {
  const el = $('#' + id);
  el.addEventListener('touchstart', (e) => { e.preventDefault(); el.classList.add('on'); onDown(); }, { passive: false });
  const up = () => { el.classList.remove('on'); onUp && onUp(); };
  el.addEventListener('touchend', up); el.addEventListener('touchcancel', up);
};
hold('t-jump', () => { jumpHeld = true; }, () => { jumpHeld = false; });
hold('t-break', () => { breakHeld = true; }, () => { breakHeld = false; });
hold('t-place', () => { placeQueued = true; });
hold('t-view', () => { view = (view + 1) % 3; });
$('#menu-btn').addEventListener('click', () => { if (document.pointerLockElement) document.exitPointerLock(); else setPlaying(false); });
$('#menu-btn').addEventListener('touchstart', (e) => { e.preventDefault(); setPlaying(false); }, { passive: false });
const looks = new Map();
addEventListener('touchstart', (e) => {
  if (!playing) return;
  for (const t of e.changedTouches) if (!e.target.closest('.tbtn, .slot')) looks.set(t.identifier, { x: t.clientX, y: t.clientY, t0: performance.now(), moved: 0 });
}, { passive: true });
addEventListener('touchmove', (e) => {
  if (!playing) return;
  for (const t of e.changedTouches) {
    const l = looks.get(t.identifier); if (!l) continue;
    const dx = t.clientX - l.x, dy = t.clientY - l.y; l.x = t.clientX; l.y = t.clientY; l.moved += Math.abs(dx) + Math.abs(dy);
    look(dx, dy, 0.005);
  }
  e.preventDefault();
}, { passive: false });
addEventListener('touchend', (e) => {
  for (const t of e.changedTouches) {
    const l = looks.get(t.identifier);
    if (l && l.moved < 8 && performance.now() - l.t0 < 250) placeQueued = true; // short tap = place a block
    looks.delete(t.identifier);
  }
});
if (touchOnly) $('#touch').classList.remove('hidden');

// ------------------------------------------------------------------ menu + skin editor
const help = $('#help');
help.innerHTML = touchOnly
  ? '<b>◀▲▼▶</b>move<br><b>⤒</b>jump<br><b>⛏</b>hold to break<br><b>▣</b>or tap to place<br><b>Drag</b>look around<br><b>👁</b>see your skin'
  : '<b>WASD</b>move &nbsp; <b>Space</b>jump (double tap: fly)<br><b>Shift</b>sprint &nbsp; <b>Left click</b>break<br><b>Right click</b>place &nbsp; <b>1-9</b>/wheel block<br><b>V</b>view: first / behind / front<br><b>Esc</b>menu';

function persistSkin() { skin = cleanSkin(skin); store.set('skin', skin); rebuildAvatars(); }
const ui = $('#skinui');
function row(label, inner) { return `<div class="row"><span>${label}</span>${inner}</div>`; }
function sw(key, colors, cur) { return colors.map((c, i) => `<button class="sw ${i === cur ? 'on' : ''}" data-k="${key}" data-v="${i}" style="background:${c}" aria-label="${key} ${i}"></button>`).join(''); }
function chips(key, names, cur) { return names.map((n, i) => `<button class="chip ${i === cur ? 'on' : ''}" data-k="${key}" data-v="${i}">${n}</button>`).join(''); }
function renderSkin() {
  ui.innerHTML =
    row('Name', `<input type="text" id="sk-name" maxlength="14" value="${skin.name}">`) +
    row('Skin', sw('tone', TONES, skin.tone)) +
    row('Hair', chips('hairStyle', HAIR_STYLES, skin.hairStyle)) +
    row('Hair colour', sw('hairColor', HAIR, skin.hairColor)) +
    row('Eyes', chips('eyeStyle', EYE_STYLES, skin.eyeStyle)) +
    row('Eye colour', sw('eyeColor', EYES, skin.eyeColor)) +
    row('Shirt', sw('shirt', CLOTHES, skin.shirt)) +
    row('Pants', sw('pants', CLOTHES, skin.pants)) +
    row('Shoes', sw('shoes', CLOTHES, skin.shoes)) +
    row('Hat', chips('hat', HATS, skin.hat)) +
    (skin.hat === 1 || skin.hat === 2 || skin.hat === 4 ? row('Hat colour', sw('hatColor', CLOTHES, skin.hatColor)) : '') +
    row('Cape', `<button class="chip ${skin.cape ? '' : 'on'}" data-k="cape" data-v="0">Off</button><button class="chip ${skin.cape ? 'on' : ''}" data-k="cape" data-v="1">On</button>`) +
    (skin.cape ? row('Cape colour', sw('capeColor', CLOTHES, skin.capeColor)) : '') +
    `<div class="row"><button class="chip" id="sk-rand">🎲 Random</button><button class="chip" id="sk-reset">Reset</button><button class="chip" id="sk-copy">Copy code</button><input type="text" id="sk-code" placeholder="Paste skin code"><button class="chip" id="sk-paste">Load</button></div>`;
  ui.querySelectorAll('[data-k]').forEach((b) => { b.onclick = () => { skin[b.dataset.k] = b.dataset.k === 'cape' ? b.dataset.v === '1' : +b.dataset.v; persistSkin(); renderSkin(); }; });
  $('#sk-name').oninput = (e) => { skin.name = e.target.value; store.set('skin', cleanSkin(skin)); };
  $('#sk-rand').onclick = () => { skin = { ...randomSkin(), name: skin.name }; persistSkin(); renderSkin(); };
  $('#sk-reset').onclick = () => { skin = { ...DEFAULT_SKIN, name: skin.name }; persistSkin(); renderSkin(); };
  $('#sk-copy').onclick = () => { const code = btoa(JSON.stringify(cleanSkin(skin))); $('#sk-code').value = code; try { navigator.clipboard.writeText(code); } catch (e) { /* select manually */ } $('#sk-code').select(); };
  $('#sk-paste').onclick = () => { try { skin = cleanSkin(JSON.parse(atob($('#sk-code').value.trim()))); persistSkin(); renderSkin(); } catch (e) { $('#sk-code').value = ''; $('#sk-code').placeholder = 'Invalid code'; } };
}

// preview renderer
const pcv = $('#preview');
const prender = new THREE.WebGLRenderer({ canvas: pcv, antialias: true, alpha: true });
prender.setPixelRatio(Math.min(devicePixelRatio || 1, 2));
prender.setSize(pcv.width, pcv.height, false);
const pscene = new THREE.Scene();
pscene.add(new THREE.AmbientLight(0xffffff, 1.0)); const pl = new THREE.DirectionalLight(0xffffff, 0.8); pl.position.set(1, 2, 3); pscene.add(pl);
const pcam = new THREE.PerspectiveCamera(30, pcv.width / pcv.height, 0.1, 50); pcam.position.set(0, 1.0, 5.2); pcam.lookAt(0, 0.9, 0);
let pav = null, prot = 0.5, pdrag = false, pwalk = true;
const ground = new THREE.Mesh(new THREE.CircleGeometry(0.9, 24), new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.35 })); ground.rotation.x = -Math.PI / 2; ground.position.y = 0.01; pscene.add(ground);
pcv.addEventListener('pointerdown', (e) => { pdrag = true; pcv.setPointerCapture(e.pointerId); });
pcv.addEventListener('pointermove', (e) => { if (pdrag) prot += e.movementX * 0.012; });
pcv.addEventListener('pointerup', () => { pdrag = false; });

function rebuildAvatars() {
  if (pav) { pscene.remove(pav); disposeAvatar(pav); }
  pav = buildAvatar(skin); pscene.add(pav);
  scene.remove(avatar); disposeAvatar(avatar);
  avatar = buildAvatar(skin); scene.add(avatar);
}

$('#play').onclick = () => { setPlaying(true); if (!touchOnly) lock(); };
let sure = false;
$('#newworld').onclick = (e) => {
  if (!sure) { sure = true; e.target.textContent = 'Really delete this world?'; setTimeout(() => { sure = false; e.target.textContent = 'New world'; }, 3000); return; }
  sure = false; e.target.textContent = 'New world';
  scene.remove(world.group);
  for (const c of world.chunks.values()) if (c.mesh) c.mesh.geometry.dispose();
  worldData = { seed: Math.floor(Math.random() * 100000), edits: [], pos: null };
  world = newWorld(worldData); scene.add(world.group);
  spawn(false); save();
};

// ------------------------------------------------------------------ main loop
function resize() {
  const w = innerWidth, h = innerHeight;
  renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix();
}
addEventListener('resize', resize);

let last = performance.now(), tAcc = 0, fps = 60, fpsT = 0;
const sky = new THREE.Color(), dayC = new THREE.Color('#8fc7ff'), nightC = new THREE.Color('#070b22'), duskC = new THREE.Color('#ff9a5a');
function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min(0.05, (now - last) / 1000); last = now;
  fps += (1 / Math.max(dt, 1e-3) - fps) * 0.05;
  if (!playing) {
    // menu: spin the preview, keep the world slowly orbiting behind it
    if (pav) { if (!pdrag) prot += dt * 0.6; pav.rotation.y = prot; animateAvatar(pav, pwalk ? 3 : 0, dt); }
    prender.render(pscene, pcam);
    return;
  }
  tAcc += dt;
  physics(dt);
  interact(dt);
  world.update(P.x, P.z, RADIUS, touchOnly ? 1 : 2);
  // day / night
  const ang = (tAcc / 300 + 0.1) * Math.PI * 2, s = Math.sin(ang);
  const day = Math.max(0, Math.min(1, s * 1.6 + 0.35));
  sky.copy(nightC).lerp(dayC, day);
  const dusk = Math.max(0, 1 - Math.abs(s) * 3.2) * 0.5; sky.lerp(duskC, dusk);
  renderer.setClearColor(sky); scene.fog = scene.fog || new THREE.Fog(sky, 10, 100);
  scene.fog.color.copy(sky); scene.fog.near = RADIUS * CS * 0.4; scene.fog.far = RADIUS * CS * 0.95;
  blockMat.color.setScalar(0.38 + 0.62 * day);
  sun.intensity = 0.15 + 0.5 * day;
  // avatar + camera
  const speed = Math.hypot(P.vx, P.vz);
  avatar.position.set(P.x, P.y, P.z); avatar.rotation.y = P.yaw + Math.PI;
  avatar.userData.head.rotation.x = -P.pitch * 0.8;
  animateAvatar(avatar, P.ground ? speed : speed * 0.4, dt);
  avatar.visible = view !== 0;
  const e = eye(), ld = lookDir().clone();
  if (view === 0) { camera.position.copy(e); camera.rotation.set(P.pitch, P.yaw, 0); }
  else {
    const back = view === 1 ? -1 : 1; // -1: camera behind you, 1: in front of you
    // keep the camera out of walls: shorten the boom until the point is free
    let d = 3.6; const o = new THREE.Vector3(P.x, P.y + 1.5, P.z);
    const bd = ld.clone().multiplyScalar(back);
    while (d > 0.4 && world.isSolid(Math.floor(o.x + bd.x * d), Math.floor(o.y + bd.y * d), Math.floor(o.z + bd.z * d))) d -= 0.25;
    camera.position.set(o.x + bd.x * d, o.y + bd.y * d, o.z + bd.z * d);
    camera.lookAt(o.x, o.y, o.z);
  }
  renderer.render(scene, camera);
  fpsT -= dt;
  if (fpsT <= 0) { fpsT = 0.5; $('#info').textContent = `${Math.round(fps)} fps   ${P.x.toFixed(0)}, ${P.y.toFixed(0)}, ${P.z.toFixed(0)}`; }
}

// ------------------------------------------------------------------ start
buildHotbar(); renderSkin(); resize();
pav = buildAvatar(skin); pscene.add(pav);
spawn(true);
world.update(P.x, P.z, RADIUS, 200);
requestAnimationFrame(frame);
window.bw = { get playing() { return playing; }, P, get world() { return world; }, setPlaying, get skin() { return skin; } };
