// THE GLIDE VAULT: crate opening (crate spec 7, 8).
// Flow: rewarded video ad -> server commits the (non-duplicate) result -> the animation
// presents exactly that committed item. The animation is a pure function of time, so
// skipping just jumps to the end state and can never change the result.

import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { $, esc, html, show, randomHex } from './dom.js';
import { stage3d } from './stage3d.js';
import { t } from '../i18n.js';
import { sdk } from '../sdk.js';
import { audio } from '../audio.js';
import { settings } from '../settings.js';
import { buildCollectible, disposeObject } from '../render/skins.js';
import { CATALOG_TOTAL, getCollectible, getModel, getSkin, KNIFE_MODELS } from '../../shared/catalog.js';

const END = 6.8;
const ease = (x) => (x <= 0 ? 0 : x >= 1 ? 1 : x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2);
const seg = (tt, a, b) => Math.max(0, Math.min(1, (tt - a) / (b - a)));

function buildCrate() {
  const g = new THREE.Group();
  const gun = new THREE.MeshStandardMaterial({ color: 0x2b2f38, metalness: 0.85, roughness: 0.38 });
  const trim = new THREE.MeshStandardMaterial({ color: 0x8b93a1, metalness: 1, roughness: 0.25 });
  const dark = new THREE.MeshStandardMaterial({ color: 0x0e1014, metalness: 0.6, roughness: 0.6 });
  const body = new THREE.Mesh(new RoundedBoxGeometry(6, 3.2, 3.6, 4, 0.25), gun);
  body.position.y = 1.6;
  g.add(body);
  // reinforcement bands
  for (const x of [-2.4, 2.4]) {
    const band = new THREE.Mesh(new RoundedBoxGeometry(0.35, 3.3, 3.7, 2, 0.08), trim);
    band.position.set(x, 1.6, 0);
    g.add(band);
  }
  // inner cavity (dark) visible when open
  const cavity = new THREE.Mesh(new THREE.BoxGeometry(5.4, 0.1, 3.0), dark);
  cavity.position.y = 3.15;
  g.add(cavity);
  // front plate + lock
  const plate = new THREE.Mesh(new RoundedBoxGeometry(2.2, 1.5, 0.2, 3, 0.06), dark);
  plate.position.set(0, 2.0, 1.85);
  g.add(plate);
  const dial = new THREE.Group();
  dial.position.set(0, 2.0, 1.98);
  const dialMesh = new THREE.Mesh(new THREE.CylinderGeometry(0.48, 0.5, 0.18, 32), trim);
  dialMesh.rotation.x = Math.PI / 2;
  dial.add(dialMesh);
  for (let i = 0; i < 8; i++) {
    const tooth = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.16, 0.06), dark);
    const a = (i / 8) * Math.PI * 2;
    tooth.position.set(Math.cos(a) * 0.36, Math.sin(a) * 0.36, 0.1);
    tooth.rotation.z = a;
    dial.add(tooth);
  }
  g.add(dial);
  const indicatorMat = new THREE.MeshBasicMaterial({ color: 0x555b66, toneMapped: false });
  const indicator = new THREE.Mesh(new THREE.TorusGeometry(0.6, 0.04, 8, 48), indicatorMat);
  indicator.position.set(0, 2.0, 1.97);
  g.add(indicator);
  // light strip segments
  const segs = [];
  for (let i = 0; i < 10; i++) {
    const m = new THREE.MeshBasicMaterial({ color: 0x1b2230, toneMapped: false });
    const s = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.08, 0.05), m);
    s.position.set(-2.25 + i * 0.5, 0.55, 1.82);
    g.add(s);
    segs.push(m);
  }
  // side latches
  const latches = [];
  for (const sx of [-1, 1]) {
    const l = new THREE.Mesh(new RoundedBoxGeometry(0.3, 0.7, 0.9, 2, 0.06), trim);
    l.position.set(sx * 3.05, 2.8, 0);
    l.userData.base = l.position.clone();
    l.userData.dir = sx;
    g.add(l);
    latches.push(l);
  }
  // lid on a hinge at the back edge
  const hinge = new THREE.Group();
  hinge.position.set(0, 3.2, -1.8);
  g.add(hinge);
  const lid = new THREE.Mesh(new RoundedBoxGeometry(6.15, 0.55, 3.75, 4, 0.22), gun);
  lid.position.set(0, 0.27, 1.8);
  hinge.add(lid);
  // glass window with blade silhouettes
  const glass = new THREE.Mesh(new THREE.PlaneGeometry(3.6, 1.8), new THREE.MeshPhysicalMaterial({ color: 0x0a1626, metalness: 0, roughness: 0.05, transparent: true, opacity: 0.55, emissive: 0x0b3a5a, emissiveIntensity: 0.6 }));
  glass.rotation.x = -Math.PI / 2;
  glass.position.set(0, 0.56, 1.8);
  hinge.add(glass);
  const silMat = new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.85 });
  for (let i = 0; i < 4; i++) {
    const sil = new THREE.Mesh(new THREE.PlaneGeometry(1.4, 0.2), silMat);
    sil.rotation.x = -Math.PI / 2;
    sil.rotation.z = 0.5 - i * 0.33;
    sil.position.set(-1.2 + i * 0.8, 0.565, 1.8 + (i % 2 ? 0.3 : -0.3));
    hinge.add(sil);
  }
  const strip = new THREE.Mesh(new THREE.BoxGeometry(5.6, 0.06, 0.06), indicatorMat);
  strip.position.set(0, 0.3, 3.68);
  hinge.add(strip);
  return { g, dial, indicatorMat, segs, latches, hinge };
}

function smokeSprites(n) {
  const cv = document.createElement('canvas');
  cv.width = cv.height = 64;
  const c = cv.getContext('2d');
  const grd = c.createRadialGradient(32, 32, 2, 32, 32, 30);
  grd.addColorStop(0, 'rgba(255,255,255,0.5)');
  grd.addColorStop(1, 'rgba(255,255,255,0)');
  c.fillStyle = grd;
  c.fillRect(0, 0, 64, 64);
  const tex = new THREE.CanvasTexture(cv);
  const list = [];
  for (let i = 0; i < n; i++) {
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false, opacity: 0, color: 0xbfd8ff }));
    s.userData = { a: Math.random() * Math.PI * 2, r: 1 + Math.random() * 2.5, sp: 0.6 + Math.random() * 0.8, d: Math.random() * 0.4 };
    list.push(s);
  }
  return list;
}

export class Vault {
  /**
   * @param account {send(msg), on(event, fn) -> off, online:boolean}
   * @param hooks {onEquip(id), onInventory(), getInventory() -> {owned, equipped}}
   */
  constructor(hooks) {
    this.hooks = hooks;
    this.el = $('#vault');
    this.state = 'idle';
    this.running = false;
  }

  _ensureScene() {
    if (this.scene) return;
    stage3d.init();
    const s = (this.scene = new THREE.Scene());
    s.environment = stage3d.env;
    s.fog = new THREE.Fog(0x07080c, 14, 40);
    this.camera = new THREE.PerspectiveCamera(38, 1, 0.1, 100);
    // studio
    const floor = new THREE.Mesh(new THREE.CircleGeometry(14, 64), new THREE.MeshStandardMaterial({ color: 0x0d0f15, roughness: 0.4, metalness: 0.5 }));
    floor.rotation.x = -Math.PI / 2;
    s.add(floor);
    const ring = new THREE.Mesh(new THREE.RingGeometry(4.6, 4.75, 96), new THREE.MeshBasicMaterial({ color: 0x00e5ff, toneMapped: false, transparent: true, opacity: 0.5 }));
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.01;
    s.add(ring);
    this.ringMat = ring.material;
    this.ambient = new THREE.AmbientLight(0x8899bb, 0.35);
    this.key = new THREE.SpotLight(0xffffff, 60, 30, 0.5, 0.6, 1.2);
    this.key.position.set(3, 10, 6);
    this.key.target.position.set(0, 2, 0);
    this.rim = new THREE.PointLight(0x59d7ff, 18, 20, 1.5);
    this.rim.position.set(-4, 5, -4);
    this.inner = new THREE.PointLight(0x9fe8ff, 0, 10, 1.6);
    this.inner.position.set(0, 3.6, 0);
    this.sweep = new THREE.SpotLight(0xffffff, 0, 12, 0.25, 0.4, 1);
    this.sweep.position.set(-3, 7, 4);
    s.add(this.ambient, this.key, this.key.target, this.rim, this.inner, this.sweep, this.sweep.target);
    this.crate = buildCrate();
    s.add(this.crate.g);
    this.smoke = smokeSprites(18);
    for (const sp of this.smoke) s.add(sp);
    this.knifePivot = new THREE.Group();
    s.add(this.knifePivot);
    // drag to rotate in inspect state
    this.drag = { on: false, x: 0, y: 0, rx: 0, ry: 0, zoom: 1 };
  }

  _bindDrag(canvas) {
    canvas.onpointerdown = (e) => { this.drag.on = true; this.drag.x = e.clientX; this.drag.y = e.clientY; canvas.setPointerCapture(e.pointerId); };
    canvas.onpointermove = (e) => {
      if (!this.drag.on) return;
      this.drag.ry += (e.clientX - this.drag.x) * 0.01;
      this.drag.rx += (e.clientY - this.drag.y) * 0.01;
      this.drag.rx = Math.max(-1.2, Math.min(1.2, this.drag.rx));
      this.drag.x = e.clientX; this.drag.y = e.clientY;
    };
    canvas.onpointerup = () => { this.drag.on = false; };
    canvas.onwheel = (e) => { this.drag.zoom = Math.max(0.6, Math.min(1.8, this.drag.zoom * (e.deltaY > 0 ? 1.08 : 0.92))); e.preventDefault(); };
  }

  open() {
    this._ensureScene();
    show(this.el, true);
    // reopened while an ad / crate request is still running: keep that flow, it finishes here
    if (this.state !== 'ad' && this.state !== 'request') {
      this.state = 'idle';
      this.result = null;
      this._setKnife(null);
      this.anim = { t: 0, playing: false, fired: new Set() };
    }
    this._renderPanel();
    stage3d.attach($('#vault-stage'));
    this._bindDrag(stage3d.canvas);
    this.hooks.refreshInventory && this.hooks.refreshInventory();
    if (!this.running) { this.running = true; this.last = performance.now(); requestAnimationFrame(() => this._frame()); }
  }

  close() {
    // closing mid-animation still completes the unlock (inventory refresh, collection count)
    if (this.state === 'opening') this.skip();
    show(this.el, false);
    this.running = false;
  }

  _setKnife(id) {
    if (this.knife) { this.knifePivot.remove(this.knife); disposeObject(this.knife); this.knife = null; }
    if (!id) return;
    const k = buildCollectible(id);
    k.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(k);
    const c = box.getCenter(new THREE.Vector3());
    const len = box.max.x - box.min.x;
    const holder = new THREE.Group();
    k.position.sub(c);
    holder.add(k);
    holder.scale.setScalar(4.2 / len);
    this.knife = holder;
    this.knifeMats = [];
    holder.traverse((o) => {
      if (o.isMesh) { this.knifeMats.push({ mesh: o, real: o.material }); }
    });
    this.silMat = new THREE.MeshBasicMaterial({ color: 0x020305 });
    this.knifePivot.add(holder);
  }

  _setSilhouette(on) {
    if (!this.knifeMats) return;
    for (const m of this.knifeMats) m.mesh.material = on ? this.silMat : m.real;
  }

  _renderPanel() {
    const inv = this.hooks.getInventory() || { owned: [], equipped: null };
    const count = inv.owned.length;
    const done = count >= CATALOG_TOTAL;
    const pct = (count / CATALOG_TOTAL) * 100;
    const r = this.result;
    let body;
    if (this.state === 'result' && r) {
      const col = getCollectible(r.collectible_id);
      const model = getModel(col.model_id), skin = getSkin(col.skin_id);
      const equipped = inv.equipped === col.collectible_id;
      body = `<div class="reveal-card">
        <div class="tag-new">${t('newTag')}</div>
        <div class="reveal-model">${esc(model.name)}</div>
        <div class="reveal-skin">${esc(skin.name)}</div>
        <div class="dim small">ID ${esc(col.collectible_id)}</div>
        <div class="reveal-added">✔ ${t('added')} · ${r.collection_count} / ${r.collection_total}</div>
        <div class="btn-row">
          <button class="btn primary" id="v-equip" ${equipped ? 'disabled' : ''}>${equipped ? t('equipped') : t('equip')}</button>
          <button class="btn" id="v-inspect">${t('inspect')}</button>
          <button class="btn" id="v-inv">${t('toInventory')}</button>
        </div>
        <button class="btn ghost wide" id="v-again" ${done ? 'disabled' : ''}>${t('openAnother')}</button>
      </div>`;
    } else if (done) {
      body = `<div class="complete"><div class="complete-title">${t('complete')}</div><div class="dim">${t('completeSub')}</div></div>
        <button class="btn" id="v-inv">${t('toInventory')}</button>`;
    } else {
      const busy = this.state === 'ad' || this.state === 'request' || this.state === 'opening';
      const free = (this.hooks.freeCrates && this.hooks.freeCrates()) || 0;
      body = `${free ? `<button class="btn primary big" id="v-free" ${busy ? 'disabled' : ''}>🎁 ${t('openFreeCrate')} (${free})</button>` : ''}
        <button class="btn ${free ? '' : 'primary'} big" id="v-open" ${busy ? 'disabled' : ''}>${sdk.adsDisabled ? '' : '<span class="ad-badge">▶ AD</span> '}${busy ? '…' : t(sdk.adsDisabled ? 'openFree' : 'openCrate')}</button>
        <div class="msg" id="v-msg">${this.msg ? esc(this.msg) : ''}</div>
        <button class="btn ghost" id="v-inv">${t('toInventory')}</button>`;
    }
    html('#vault-panel', `
      <div class="vault-title">${t('vaultTitle')}</div>
      <div class="vault-count"><b>${t('collected')} ${count} / ${CATALOG_TOTAL}</b> <span class="dim">· ${CATALOG_TOTAL - count} ${t('remaining')}</span></div>
      <div class="progress"><div style="width:${pct}%"></div></div>
      <div class="vault-models">${KNIFE_MODELS.map((m) => {
        const have = inv.owned.filter((id) => id.startsWith(m.id + '__')).length;
        return `<span class="chip ${have ? 'on' : ''}" title="${esc(m.desc)}">${esc(m.name)} <b>${have}</b></span>`;
      }).join('')}</div>
      <p class="rule">${t('vaultRule')}</p>
      ${body}
      ${this.state === 'opening' ? `<button class="btn ghost skip" id="v-skip">${t('skip')} ⏭</button>` : ''}
    `);
    const on = (id, f) => { const b = $('#' + id); if (b) b.onclick = () => { audio.play('click'); f(); }; };
    on('v-open', () => this.startOpen());
    on('v-free', () => this.startOpen(true));
    on('v-again', () => { this.state = 'idle'; this.result = null; this._setKnife(null); this.anim = { t: 0, playing: false, fired: new Set() }; this.startOpen(); });
    on('v-inv', () => this.hooks.openInventory());
    on('v-equip', () => this.hooks.equip(this.result.collectible_id));
    on('v-inspect', () => { this.drag.rx = 0; this.drag.ry = 0; this.drag.zoom = 1.25; });
    on('v-skip', () => this.skip());
  }

  /** @param free open one of the free crates earned by levelling up (no ad) */
  async startOpen(free = false) {
    if (this.state !== 'idle' && this.state !== 'result') return;
    if (free && !((this.hooks.freeCrates && this.hooks.freeCrates()) > 0)) free = false;
    this.msg = '';
    if (this.state === 'result') { this.result = null; this._setKnife(null); this.anim = { t: 0, playing: false, fired: new Set() }; }
    this.state = 'ad';
    this._renderPanel();
    const ad = free ? 'free' : await sdk.requestAd('rewarded');
    if (ad !== 'ok' && ad !== 'free') { this.state = 'idle'; this.msg = t('adFailed'); this._renderPanel(); return; }
    this.state = 'request';
    this._renderPanel();
    const key = randomHex(12);
    let res = await this.hooks.requestCrate(key, free);
    if (!res) res = await this.hooks.requestCrate(key, free); // safe retry: same idempotency key
    if (!res) { this.state = 'idle'; this.msg = t('retry'); this._renderPanel(); return; }
    if (res.status === 'COLLECTION_COMPLETE') { this.state = 'idle'; audio.play('collection_complete'); this._renderPanel(); return; }
    if (res.status === 'COOLDOWN') { this.state = 'idle'; this.msg = `${t('cooldown')} (${Math.ceil(res.retryInMs / 1000)} s)`; this._renderPanel(); return; }
    if (res.status !== 'SUCCESS') { this.state = 'idle'; this.msg = t('retry'); this._renderPanel(); return; }
    // the item is already stored server side - now present it
    this.result = res;
    this._setKnife(res.collectible_id);
    this.state = 'opening';
    this.anim = { t: 0, playing: true, fired: new Set() };
    this.drag.rx = 0; this.drag.ry = 0; this.drag.zoom = 1;
    sdk.happytime();
    this._renderPanel();
  }

  skip() {
    if (this.state !== 'opening') return;
    this.anim.t = END;
    for (const k of ['lock_engage', 'latch_release', 'lid_open', 'reveal_riser']) this.anim.fired.add(k);
    this._finish();
  }

  _finish() {
    this.state = 'result';
    this.anim.playing = false;
    audio.play('inventory_confirm');
    this.hooks.onCommitted && this.hooks.onCommitted(this.result);
    this._renderPanel();
  }

  _fire(name, at) {
    if (this.anim.t >= at && !this.anim.fired.has(name)) { this.anim.fired.add(name); audio.play(name); }
  }

  _frame() {
    if (!this.running) return;
    requestAnimationFrame(() => this._frame());
    const now = performance.now();
    const dt = Math.min(0.05, (now - this.last) / 1000);
    this.last = now;
    const { w, h } = stage3d.fit();
    this.camera.aspect = w / h;
    // narrow (portrait) stages keep the crate's full width in view by widening the vertical FOV
    const ref = 1.3, a = w / h;
    this.camera.fov = a >= ref ? 38 : (2 * Math.atan(Math.tan((38 * Math.PI) / 360) * (ref / a)) * 180) / Math.PI;
    this.camera.updateProjectionMatrix();
    if (this.anim.playing) {
      this.anim.t += dt;
      const tt = this.anim.t;
      this._fire('lock_engage', 0.05);
      const segIdx = Math.floor(seg(tt, 0.4, 1.8) * 10);
      if (segIdx > (this.anim.lastSeg ?? -1) && tt < 1.85) { this.anim.lastSeg = segIdx; audio.play('lock_tick'); }
      this._fire('latch_release', 1.85);
      this._fire('lid_open', 2.3);
      this._fire('reveal_riser', 3.2);
      this._fire('knife_reveal', 4.6);
      if (tt >= END) this._finish();
    }
    this._pose(this.state === 'opening' || this.state === 'result' ? this.anim.t : 0, now / 1000);
    stage3d.renderer.setClearColor(0x07080c, 1);
    stage3d.renderer.render(this.scene, this.camera);
  }

  /** Deterministic pose for time tt (0 = closed crate idle). */
  _pose(tt, clock) {
    const C = this.crate;
    const reduce = settings.reduceMotion;
    const idle = this.state === 'idle' || this.state === 'ad' || this.state === 'request';
    // camera path: dolly in, lower, then slow arc around the revealed knife
    const dolly = ease(seg(tt, 0, 2.2));
    const lower = ease(seg(tt, 2.3, 3.5));
    const arc = ease(seg(tt, 4.6, END)) * 0.55 + (this.state === 'result' ? Math.sin(clock * 0.3) * 0.12 : 0);
    const dist = (14 - dolly * 3.2 + lower * 0.6) / (this.state === 'result' ? this.drag.zoom : 1);
    const ang = 0.35 - arc + (idle ? Math.sin(clock * 0.25) * 0.15 : 0);
    const follow = this.knife ? ease(seg(tt, 3.2, 4.8)) : 0; // frame the rising knife
    const camY = 6.5 - dolly * 1.2 - lower * 0.8 + follow * 1.6;
    this.camera.position.set(Math.sin(ang) * dist, camY, Math.cos(ang) * dist);
    this.camera.lookAt(0, 2.6 + lower * 1.6 + follow * 1.9, 0);

    // lock + light strip
    const engage = seg(tt, 0, 0.4);
    C.indicatorMat.color.setRGB(0.33 + engage * -0.33, 0.36 + engage * 0.54, 0.4 + engage * 0.6);
    C.dial.rotation.z = -ease(seg(tt, 0.4, 1.8)) * Math.PI * 3;
    const lit = seg(tt, 0.4, 1.8) * 10;
    C.segs.forEach((m, i) => m.color.set(i < lit ? 0x00e5ff : 0x1b2230));
    const shake = !reduce && tt > 0.4 && tt < 1.9 ? Math.sin(tt * 70) * 0.012 * Math.sin(seg(tt, 0.4, 1.9) * Math.PI) : 0;
    C.g.position.x = shake;
    // latches, lid crack, lid open
    const latch = ease(seg(tt, 1.8, 2.05));
    for (const l of C.latches) l.position.x = l.userData.base.x + l.userData.dir * latch * 0.25;
    const crack = ease(seg(tt, 1.85, 2.25)) * 0.06;
    const openA = ease(seg(tt, 2.3, 3.3)) * 1.95;
    C.hinge.rotation.x = -(crack + openA);
    this.inner.intensity = (crack > 0 ? 25 : 0) + seg(tt, 2.3, 3.3) * 20 - seg(tt, 4.6, 5.2) * 30;
    if (this.inner.intensity < 0) this.inner.intensity = 0;
    // smoke
    for (const s of this.smoke) {
      const u = s.userData;
      const k = seg(tt, 1.95 + u.d, 4.2 + u.d);
      s.material.opacity = Math.sin(k * Math.PI) * (reduce ? 0.12 : 0.28);
      const r = 1 + k * u.r;
      s.position.set(Math.cos(u.a) * r, 3.2 + k * 2.2 * u.sp, Math.sin(u.a) * r * 0.6);
      s.scale.setScalar(1.2 + k * 2.5);
    }
    // knife rise + reveal
    if (this.knife) {
      const rise = ease(seg(tt, 3.2, 4.6));
      this.knife.visible = tt > 3.0;
      this.knifePivot.position.set(0, 2.3 + rise * 3.6, 0);
      const spin = (1 - rise) * 2.2;
      this.knifePivot.rotation.set(0.15 + (this.state === 'result' ? this.drag.rx : 0), -0.55 + spin + (this.state === 'result' ? this.drag.ry + Math.sin(clock * 0.5) * 0.15 : 0), 0.55 * rise);
      this._setSilhouette(tt < 4.6);
      const reveal = seg(tt, 4.6, 5.3);
      this.key.intensity = 10 + reveal * 70;
      this.ambient.intensity = tt < 4.6 ? 0.35 - seg(tt, 4.3, 4.6) * 0.25 : 0.1 + reveal * 0.35;
      this.rim.intensity = 18 + seg(tt, 3.2, 4.6) * 30;
      this.sweep.intensity = Math.sin(seg(tt, 4.6, 5.6) * Math.PI) * (reduce ? 40 : 120);
      this.sweep.target.position.set(-2 + seg(tt, 4.6, 5.6) * 4, 5.9, 0);
    } else {
      this.key.intensity = 60;
      this.ambient.intensity = 0.35;
      this.rim.intensity = 18;
      this.sweep.intensity = 0;
    }
    this.ringMat.opacity = 0.35 + Math.sin(clock * 2) * 0.1 + seg(tt, 4.6, 5.0) * (reduce ? 0.1 : 0.5) * (1 - seg(tt, 5.0, 6.0));
  }
}
