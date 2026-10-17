// Inventory & collection browser (crate spec 10): all / owned / missing, filters by model and
// skin, search, sorting, lazily rendered 3D thumbnails and a model viewer with lighting presets.

import * as THREE from 'three';
import { $, $$, esc, html, show } from './dom.js';
import { stage3d } from './stage3d.js';
import { t } from '../i18n.js';
import { audio } from '../audio.js';
import { buildCollectible, disposeObject } from '../render/skins.js';
import { COLLECTIBLES, CATALOG_TOTAL, KNIFE_MODELS, KNIFE_SKINS, getModel, getSkin, getCollectible, DEFAULT_KNIFE } from '../../shared/catalog.js';

const LIGHTS = {
  Studio: { key: 0xffffff, keyI: 2.2, rim: 0x88ccff, rimI: 1.2, amb: 0.35, bg: 0x101218 },
  Warm: { key: 0xffd7a8, keyI: 2.4, rim: 0xff7a3a, rimI: 1.0, amb: 0.3, bg: 0x17110c },
  Cold: { key: 0xd6ecff, keyI: 2.0, rim: 0x3ad7ff, rimI: 1.6, amb: 0.3, bg: 0x0b1118 },
  Dark: { key: 0xffffff, keyI: 1.0, rim: 0xffffff, rimI: 2.2, amb: 0.08, bg: 0x050506 },
};

export class Inventory {
  constructor(hooks) {
    this.hooks = hooks; // { getInventory, equip(id), refreshInventory }
    this.el = $('#inventory');
    this.filter = { tab: 'all', model: '', skin: '', q: '', sort: 'model' };
    this.queue = [];
    this.viewer = null;
  }

  open() {
    show(this.el, true);
    this.hooks.refreshInventory && this.hooks.refreshInventory();
    this.render();
  }

  close() {
    show(this.el, false);
    this.closeViewer();
    this.queue.length = 0;
  }

  list() {
    const inv = this.hooks.getInventory() || { owned: [] };
    const owned = new Set(inv.owned);
    const f = this.filter;
    const q = f.q.trim().toLowerCase();
    let items = COLLECTIBLES.filter((c) => {
      const have = owned.has(c.collectible_id);
      if (f.tab === 'owned' && !have) return false;
      if (f.tab === 'missing' && have) return false;
      if (f.model && c.model_id !== f.model) return false;
      if (f.skin && c.skin_id !== f.skin) return false;
      if (q && !c.display_name.toLowerCase().includes(q)) return false;
      return true;
    });
    if (f.sort === 'name') items = items.slice().sort((a, b) => a.display_name.localeCompare(b.display_name));
    return { items, owned, inv };
  }

  render() {
    const { items, owned, inv } = this.list();
    const f = this.filter;
    html(this.el, `
      <div class="panel-head">
        <div><div class="panel-title">${t('inventory')}</div><div class="dim">${t('collected')} <b>${owned.size} / ${CATALOG_TOTAL}</b></div></div>
        <button class="btn ghost" id="inv-close">✕ ${t('close')}</button>
      </div>
      <div class="inv-tools">
        <div class="tabs">${['all', 'owned', 'missing'].map((k) => `<button class="tab ${f.tab === k ? 'on' : ''}" data-tab="${k}">${t(k)}</button>`).join('')}</div>
        <select id="inv-model"><option value="">${t('allModels')}</option>${KNIFE_MODELS.map((m) => `<option value="${m.id}" ${f.model === m.id ? 'selected' : ''}>${esc(m.name)}</option>`).join('')}</select>
        <select id="inv-skin"><option value="">${t('allSkins')}</option>${KNIFE_SKINS.map((s) => `<option value="${s.id}" ${f.skin === s.id ? 'selected' : ''}>${esc(s.name)}</option>`).join('')}</select>
        <select id="inv-sort"><option value="model" ${f.sort === 'model' ? 'selected' : ''}>${t('sortModel')}</option><option value="name" ${f.sort === 'name' ? 'selected' : ''}>${t('sortName')}</option></select>
        <input id="inv-q" placeholder="${t('search')}" value="${esc(f.q)}">
      </div>
      <div class="inv-grid" id="inv-grid">
        ${items.map((c) => {
          const have = owned.has(c.collectible_id) || c.collectible_id === DEFAULT_KNIFE;
          const eq = (inv.equipped || DEFAULT_KNIFE) === c.collectible_id;
          return `<div class="card ${have ? 'have' : 'locked'} ${eq ? 'eq' : ''}" data-id="${c.collectible_id}">
            <div class="thumb"><img alt="" data-thumb="${c.collectible_id}">${have ? '' : '<span class="lock">🔒</span>'}${eq ? `<span class="eq-badge">${t('equipped')}</span>` : ''}</div>
            <div class="card-model">${esc(getModel(c.model_id).name)}</div>
            <div class="card-skin">${esc(getSkin(c.skin_id).name)}</div>
          </div>`;
        }).join('') || `<div class="dim">-</div>`}
      </div>`);
    $('#inv-close').onclick = () => { audio.play('click'); this.hooks.close(); };
    $$('.tab', this.el).forEach((b) => (b.onclick = () => { this.filter.tab = b.dataset.tab; audio.play('click'); this.render(); }));
    $('#inv-model').onchange = (e) => { this.filter.model = e.target.value; this.render(); };
    $('#inv-skin').onchange = (e) => { this.filter.skin = e.target.value; this.render(); };
    $('#inv-sort').onchange = (e) => { this.filter.sort = e.target.value; this.render(); };
    const q = $('#inv-q');
    q.oninput = () => { this.filter.q = q.value; clearTimeout(this._qt); this._qt = setTimeout(() => { this.render(); const n = $('#inv-q'); n.focus(); n.setSelectionRange(n.value.length, n.value.length); }, 250); };
    $$('.card', this.el).forEach((c) => (c.onclick = () => { audio.play('click'); this.openViewer(c.dataset.id); }));
    this._lazyThumbs();
  }

  _lazyThumbs() {
    if (this.io) this.io.disconnect();
    this.queue.length = 0;
    this.io = new IntersectionObserver((entries) => {
      for (const e of entries) {
        if (!e.isIntersecting) continue;
        this.io.unobserve(e.target);
        this.queue.push(e.target);
      }
      this._pump();
    }, { root: $('#inv-grid'), rootMargin: '200px' });
    $$('img[data-thumb]', this.el).forEach((img) => {
      const id = img.dataset.thumb;
      if (stage3d.thumbCache.has(id)) img.src = stage3d.thumbCache.get(id);
      else this.io.observe(img);
    });
  }

  _pump() {
    if (this._pumping) return;
    this._pumping = true;
    const step = () => {
      if (!this.queue.length || this.viewer || this.el.classList.contains('hidden')) { this._pumping = false; return; }
      const t0 = performance.now();
      while (this.queue.length && performance.now() - t0 < 12) {
        const img = this.queue.shift();
        if (!img.isConnected) continue;
        img.src = stage3d.thumbnail(img.dataset.thumb);
      }
      requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }

  // ----------------------------------------------------------------- viewer
  openViewer(id) {
    const col = getCollectible(id);
    if (!col) return;
    const inv = this.hooks.getInventory() || { owned: [] };
    const have = inv.owned.includes(id) || id === DEFAULT_KNIFE;
    const eq = (inv.equipped || DEFAULT_KNIFE) === id;
    const model = getModel(col.model_id), skin = getSkin(col.skin_id);
    const modal = $('#viewer');
    show(modal, true);
    html(modal, `<div class="viewer-box">
      <div class="viewer-stage" id="viewer-stage"></div>
      <div class="viewer-side">
        <div class="reveal-model">${esc(model.name)}</div>
        <div class="reveal-skin">${esc(skin.name)}</div>
        <div class="dim small">ID ${esc(col.collectible_id)}</div>
        <p class="dim">${esc(model.desc)}</p>
        <div class="${have ? 'ok' : 'warn'}">${have ? '✔ ' + t('owned') : '🔒 ' + t('locked')}</div>
        <div class="sub">${t('light')}</div>
        <div class="tabs" id="viewer-lights">${Object.keys(LIGHTS).map((k, i) => `<button class="tab ${i === 0 ? 'on' : ''}" data-l="${k}">${k}</button>`).join('')}</div>
        <div class="btn-row">
          ${have ? `<button class="btn primary" id="viewer-equip" ${eq ? 'disabled' : ''}>${eq ? t('equipped') : t('equip')}</button>` : ''}
          <button class="btn" id="viewer-reset">${t('reset')}</button>
          <button class="btn ghost" id="viewer-close">✕ ${t('close')}</button>
        </div>
      </div></div>`);
    const v = (this.viewer = { id, rx: 0.2, ry: -0.5, zoom: 1, light: 'Studio', run: true });
    stage3d.attach($('#viewer-stage'));
    const scene = new THREE.Scene();
    scene.environment = stage3d.env;
    const cam = new THREE.PerspectiveCamera(35, 1, 0.1, 100);
    const key = new THREE.DirectionalLight(0xffffff, 2);
    key.position.set(3, 5, 6);
    const rim = new THREE.DirectionalLight(0x88ccff, 1);
    rim.position.set(-5, 2, -4);
    const amb = new THREE.AmbientLight(0xffffff, 0.3);
    scene.add(key, rim, amb);
    const k = buildCollectible(id);
    k.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(k);
    k.position.sub(box.getCenter(new THREE.Vector3()));
    const holder = new THREE.Group();
    holder.add(k);
    holder.scale.setScalar(4 / (box.max.x - box.min.x));
    scene.add(holder);
    const applyLight = () => {
      const L = LIGHTS[v.light];
      key.color.set(L.key); key.intensity = L.keyI; rim.color.set(L.rim); rim.intensity = L.rimI; amb.intensity = L.amb;
      stage3d.renderer.setClearColor(L.bg, 1);
    };
    applyLight();
    const cv = stage3d.canvas;
    let drag = null;
    cv.onpointerdown = (e) => { drag = { x: e.clientX, y: e.clientY }; cv.setPointerCapture(e.pointerId); };
    cv.onpointermove = (e) => { if (!drag) return; v.ry += (e.clientX - drag.x) * 0.01; v.rx = Math.max(-1.4, Math.min(1.4, v.rx + (e.clientY - drag.y) * 0.01)); drag = { x: e.clientX, y: e.clientY }; };
    cv.onpointerup = () => { drag = null; };
    cv.onwheel = (e) => { v.zoom = Math.max(0.55, Math.min(2.6, v.zoom * (e.deltaY > 0 ? 0.92 : 1.08))); e.preventDefault(); };
    $$('#viewer-lights .tab').forEach((b) => (b.onclick = () => { v.light = b.dataset.l; $$('#viewer-lights .tab').forEach((x) => x.classList.toggle('on', x === b)); applyLight(); }));
    $('#viewer-reset').onclick = () => { v.rx = 0.2; v.ry = -0.5; v.zoom = 1; };
    $('#viewer-close').onclick = () => { audio.play('click'); this.closeViewer(); };
    const eqb = $('#viewer-equip');
    if (eqb) eqb.onclick = () => { audio.play('inventory_confirm'); this.hooks.equip(id === DEFAULT_KNIFE ? null : id); eqb.disabled = true; eqb.textContent = t('equipped'); };
    const frame = () => {
      if (!v.run) { scene.remove(holder); disposeObject(holder); return; }
      requestAnimationFrame(frame);
      const { w, h } = stage3d.fit();
      cam.aspect = w / h;
      cam.updateProjectionMatrix();
      cam.position.set(0, 0, 7 / v.zoom);
      cam.lookAt(0, 0, 0);
      if (!drag) v.ry += 0.003;
      holder.rotation.set(v.rx, v.ry, 0);
      stage3d.renderer.render(scene, cam);
    };
    frame();
  }

  closeViewer() {
    if (!this.viewer) return;
    this.viewer.run = false;
    this.viewer = null;
    show('#viewer', false);
    if (!this.el.classList.contains('hidden')) this.render();
  }
}
