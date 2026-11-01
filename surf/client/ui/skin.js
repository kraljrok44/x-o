// Character skin editor: preview with the same blocky model other players see.
import * as THREE from 'three';
import { TONES, HAIR, EYES, CLOTHES, HAIR_STYLES, HATS, EYE_STYLES, DEFAULT_SKIN, cleanSkin, randomSkin } from '../../shared/skin.js';
import { buildBlockPlayer, animateBlockPlayer, disposeBlockPlayer } from '../render/mcavatar.js';
import { t } from '../i18n.js';

const KEY = 'gz.skin';
export function loadSkin() {
  try { const v = localStorage.getItem(KEY); if (v) return cleanSkin(JSON.parse(v)); } catch (e) { /* storage blocked */ }
  return null; // never chosen: players get one derived from their id
}
function storeSkin(s) { try { localStorage.setItem(KEY, JSON.stringify(s)); } catch (e) { /* */ } }

export class SkinEditor {
  /** @param el the panel element, @param onChange called with the cleaned skin after every edit */
  constructor(el, onChange) {
    this.el = el; this.onChange = onChange;
    this.skin = loadSkin() || cleanSkin(randomSkin());
    this.running = false;
  }

  open() {
    this.render();
    this._startPreview();
  }

  close() {
    this.running = false;
    if (this.renderer) { this.renderer.dispose(); this.renderer = null; }
    if (this.model) { disposeBlockPlayer(this.model); this.model = null; }
  }

  _set(s) { this.skin = cleanSkin(s); storeSkin(this.skin); this._rebuild(); this.onChange(this.skin); }

  render() {
    const sw = (key, colors) => colors.map((c, i) => `<button class="sw ${i === this.skin[key] ? 'on' : ''}" data-k="${key}" data-v="${i}" style="background:${c}" aria-label="${key} ${i}"></button>`).join('');
    const chips = (key, names) => names.map((n, i) => `<button class="chip ${i === this.skin[key] ? 'on' : ''}" data-k="${key}" data-v="${i}">${n}</button>`).join('');
    const row = (label, inner) => `<div class="row"><span>${label}</span>${inner}</div>`;
    const S = this.skin;
    this.el.innerHTML = `
      <div class="panel-head"><div class="panel-title">${t('skin')}</div><button class="btn ghost" id="skin-close">✕ ${t('close')}</button></div>
      <div class="skin-grid">
        <div class="skin-prev"><canvas id="skin-canvas" width="260" height="320"></canvas><div class="dim small">${t('skinHint')}</div></div>
        <div class="skin-opts">
          ${row(t('skinTone'), sw('tone', TONES))}
          ${row(t('hair'), chips('hairStyle', HAIR_STYLES))}
          ${row(t('hairColor'), sw('hairColor', HAIR))}
          ${row(t('eyes'), chips('eyeStyle', EYE_STYLES))}
          ${row(t('eyeColor'), sw('eyeColor', EYES))}
          ${row(t('shirt'), sw('shirt', CLOTHES))}
          ${row(t('pants'), sw('pants', CLOTHES))}
          ${row(t('shoes'), sw('shoes', CLOTHES))}
          ${row(t('hat'), chips('hat', HATS))}
          ${S.hat === 1 || S.hat === 2 || S.hat === 4 ? row(t('hatColor'), sw('hatColor', CLOTHES)) : ''}
          ${row(t('cape'), `<button class="chip ${S.cape ? '' : 'on'}" data-k="cape" data-v="0">${t('off')}</button><button class="chip ${S.cape ? 'on' : ''}" data-k="cape" data-v="1">${t('on')}</button>`)}
          ${S.cape ? row(t('capeColor'), sw('capeColor', CLOTHES)) : ''}
          <div class="row"><button class="chip" id="sk-rand">🎲 ${t('random')}</button><button class="chip" id="sk-reset">${t('resetSkin')}</button><button class="chip" id="sk-copy">${t('copyCode')}</button><input type="text" id="sk-code" placeholder="${t('pasteCode')}"><button class="chip" id="sk-paste">${t('load')}</button></div>
        </div>
      </div>`;
    this.el.querySelectorAll('[data-k]').forEach((b) => {
      b.onclick = () => { const k = b.dataset.k; this._set({ ...this.skin, [k]: k === 'cape' ? b.dataset.v === '1' : +b.dataset.v }); this.render(); this._attachCanvas(); };
    });
    this.el.querySelector('#sk-rand').onclick = () => { this._set(randomSkin()); this.render(); this._attachCanvas(); };
    this.el.querySelector('#sk-reset').onclick = () => { this._set(DEFAULT_SKIN); this.render(); this._attachCanvas(); };
    this.el.querySelector('#sk-copy').onclick = () => {
      const code = btoa(JSON.stringify(this.skin)); const i = this.el.querySelector('#sk-code'); i.value = code;
      try { navigator.clipboard.writeText(code); } catch (e) { /* select manually */ } i.select();
    };
    this.el.querySelector('#sk-paste').onclick = () => {
      const i = this.el.querySelector('#sk-code');
      try { this._set(JSON.parse(atob(i.value.trim()))); this.render(); this._attachCanvas(); } catch (e) { i.value = ''; i.placeholder = t('badCode'); }
    };
  }

  _startPreview() {
    this.running = true;
    this.rot = 0.5; this.drag = false;
    this.scene = new THREE.Scene();
    this.scene.add(new THREE.AmbientLight(0xffffff, 1.0));
    const d = new THREE.DirectionalLight(0xffffff, 0.8); d.position.set(1, 2, 3); this.scene.add(d);
    this.cam = new THREE.PerspectiveCamera(30, 260 / 320, 0.1, 50); this.cam.position.set(0, 1.05, 6.4); this.cam.lookAt(0, 1.0, 0);
    this._rebuild();
    this._attachCanvas();
    this.last = performance.now();
    const loop = (now) => {
      if (!this.running) return;
      requestAnimationFrame(loop);
      const dt = Math.min(0.05, (now - this.last) / 1000); this.last = now;
      if (this.model && this.renderer) {
        if (!this.drag) this.rot += dt * 0.6;
        this.model.rotation.y = this.rot;
        const s = animateBlockPlayer(this.model, 3, dt);
        this.model.userData.armR.rotation.x = s;
        this.renderer.render(this.scene, this.cam);
      }
    };
    requestAnimationFrame(loop);
  }

  _attachCanvas() {
    const cv = this.el.querySelector('#skin-canvas');
    if (!cv) return;
    if (this.renderer) this.renderer.dispose();
    this.renderer = new THREE.WebGLRenderer({ canvas: cv, antialias: true, alpha: true });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 2));
    this.renderer.setSize(260, 320, false);
    cv.onpointerdown = (e) => { this.drag = true; cv.setPointerCapture(e.pointerId); };
    cv.onpointermove = (e) => { if (this.drag) this.rot += e.movementX * 0.012; };
    cv.onpointerup = () => { this.drag = false; };
  }

  _rebuild() {
    if (!this.scene) return;
    if (this.model) { this.scene.remove(this.model); disposeBlockPlayer(this.model); }
    this.model = buildBlockPlayer(this.skin); this.scene.add(this.model);
  }
}
