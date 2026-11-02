// DOM user interface: menus, HUD, settings, garage, results, replay controls, touch controls, gamepad menu navigation.
import * as THREE from './lib/three.module.min.js';
import { clamp, fmtTime } from './util.js';
import { MAP_LIST, getMap } from './maps.js';
import { TIMES, WEATHERS } from './sky.js';
import { STATE } from './flight.js';
import { ACTIONS, PAD_NAMES, RESERVED, DEFAULT_KEYS, DEFAULT_PAD, codeLabel } from './input.js';
import { VIEW_LABEL } from './camera.js';
import { platform } from './platform.js';
import { save, DEFAULT_SETTINGS } from './save.js';
import { MODES, MISSIONS, CATALOG, RANKS, CATEGORY_LABELS, MAP_UNLOCK, RANK_ORDER } from './gameplay.js';

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const rankInfo = (id) => RANKS.find((r) => r.id === id);
const PANELS = ['loading', 'menu', 'modes', 'worlds', 'missions', 'garage', 'records', 'archive', 'settings', 'prep'];
const _v = new THREE.Vector3();

export class UI {
  constructor(game) {
    this.g = game;
    this.cur = 'loading';
    this.sel = { mode: 'free', map: 'skyfall', time: 'midday', weather: 'clear' };
    this.garageTab = 'suit';
    this.setTab = 'graphics';
    this.hudT = 0;
    this.isTouch = matchMedia('(pointer: coarse)').matches || 'ontouchstart' in window;
    this.wire();
    this.initTouch();
    platform.onUser = () => this.updateTopbar();
  }

  // ------------------------------------------------------------------ plumbing
  wire() {
    document.querySelectorAll('#ui [data-act]').forEach((b) => b.addEventListener('click', (e) => { e.stopPropagation(); this.g.audio.play('click'); this.act(b.dataset.act); }));
    $('flyBtn').addEventListener('click', () => { this.g.audio.play('click'); this.g.startSession({ map: this.sel.map, mode: this.sel.mode, time: this.sel.time, weather: this.sel.weather }); });
    $('hintSkip').addEventListener('click', () => { this.g.tutorial = false; save.data.tutorialDone = true; save.write(); $('hint').classList.add('hidden'); });
    $('pauseBtn').addEventListener('click', () => this.g.pause());
    document.querySelectorAll('[data-rp]').forEach((b) => {
      const k = b.dataset.rp;
      if (k === 'rew') {
        const on = () => { if (this.g.replay) this.g.replay.rew = true; }, off = () => { if (this.g.replay) this.g.replay.rew = false; };
        b.addEventListener('pointerdown', on); b.addEventListener('pointerup', off); b.addEventListener('pointerleave', off); b.addEventListener('pointercancel', off);
      } else b.addEventListener('click', () => {
        if (k === 'play') this.replayToggle();
        if (k === 'speed') { const R = this.g.replay; const sp = [0.25, 0.5, 1, 2]; R.speed = sp[(sp.indexOf(R.speed) + 1) % sp.length]; $('rpSpeed').textContent = R.speed + '×'; }
        if (k === 'cam') this.replayCam();
        if (k === 'exit') this.g.exitReplay();
      });
    });
    $('rpSlider').addEventListener('input', (e) => { const R = this.g.replay; if (R) { R.t = (e.target.value / 1000) * R.player.duration; } });
  }

  act(a) {
    const g = this.g;
    switch (a) {
      case 'start': this.show('modes'); break;
      case 'worlds': this.sel.mode = this.cur === 'modes' ? this.sel.mode : 'free'; if (this.cur === 'results' || g.mode === 'results') { this.hideModal(); g.showMenu().then(() => this.show('worlds')); } else this.show('worlds'); break;
      case 'garage': g.showGarage(); break;
      case 'missions': this.show('missions'); break;
      case 'records': this.show('records'); break;
      case 'archive': this.show('archive'); break;
      case 'settings': this.settingsFrom = g.mode === 'paused' ? 'pause' : this.cur; if (g.mode === 'paused') this.hideModal(); this.show('settings'); break;
      case 'back': this.back(); break;
      case 'menu': this.hideModal(); g.showMenu(); break;
      case 'jump': g.jump(); break;
      case 'preview': g.preview = { t: 0 }; break;
      case 'cam': g.cycleCam(); break;
      case 'resume': g.resume(); break;
      case 'restart': g.restart(); break;
      case 'retry': this.hideModal(); g.restart(); break;
      case 'next': this.hideModal(); g.nextMission(); break;
      case 'watch': this.hideModal(); g.startReplay(g.lastReplay); break;
      case 'saveReplay': g.saveReplay(); break;
      case 'double': g.doubleCoins(); break;
    }
  }

  back() {
    const g = this.g;
    if (this.cur === 'settings' && this.settingsFrom === 'pause') { this.show(g.pausedFrom === 'prep' ? 'prep' : 'hud'); this.showModal('pause'); return; }
    if (this.cur === 'worlds' && this.worldsFrom === 'modes') { this.show('modes'); return; }
    if (this.cur === 'garage') { g.showMenu(); return; }
    this.show('menu');
  }

  show(name) {
    const prev = this.cur;
    this.cur = name;
    for (const p of PANELS) $(p).classList.toggle('show', p === name);
    $('hud').classList.toggle('hidden', name !== 'hud');
    $('replay').classList.toggle('hidden', name !== 'replay');
    $('topbar').classList.toggle('hidden', !['menu', 'modes', 'worlds', 'missions', 'garage', 'records', 'archive', 'settings'].includes(name));
    $('touch').classList.toggle('hidden', !(this.isTouch && name === 'hud'));
    if (name !== 'hud') { $('hint').classList.add('hidden'); this.warn('', ''); }
    if (name === 'worlds') this.worldsFrom = prev;
    const build = { menu: () => this.buildMenu(), modes: () => this.buildModes(), worlds: () => this.buildWorlds(), missions: () => this.buildMissions(), garage: () => this.buildGarage(), records: () => this.buildRecords(), archive: () => this.buildArchive(), settings: () => this.buildSettings() }[name];
    if (build) build();
    this.updateTopbar();
    if (this.g.input.lastDevice === 'pad') setTimeout(() => this.focusFirst(), 30);
  }
  showModal(id) { for (const m of ['pause', 'results']) $(m).classList.toggle('show', m === id); this.modal = id; if (id === 'pause') this.buildPauseKeys(); if (this.g.input.lastDevice === 'pad') setTimeout(() => this.focusFirst(), 30); }
  hideModal() { $('pause').classList.remove('show'); $('results').classList.remove('show'); this.modal = null; }
  adLock(on) { $('adlock').classList.toggle('hidden', !on); }

  loading(on, text, p) {
    if (on) { $('loading').classList.add('show'); if (text) $('loadText').textContent = text; if (p != null) $('loadBar').style.width = `${Math.round(p * 100)}%`; }
    else { $('loading').classList.remove('show'); }
  }
  toast(msg) { const t = $('toast'); t.textContent = msg; t.classList.add('show'); clearTimeout(this._tt); this._tt = setTimeout(() => t.classList.remove('show'), 2400); }
  flash(text, color) { const f = $('flash'); f.textContent = text; f.style.color = color; f.style.opacity = 1; clearTimeout(this._ft); this._ft = setTimeout(() => { f.style.opacity = 0; }, 1100); }
  camLabel(t) { const c = $('camLabel'); c.textContent = t; c.style.opacity = 1; clearTimeout(this._ct); this._ct = setTimeout(() => { c.style.opacity = 0; }, 1300); if (this.cur === 'prep') this.toast(t); }
  warn(text, cls) { const w = $('warn'); if (w.textContent !== text) w.textContent = text; if (w.className !== cls) w.className = cls; }

  keyName(a) {
    const inp = this.g.input;
    if (this.isTouch && inp.lastDevice !== 'pad' && inp.lastDevice !== 'kbreal') {
      const t = { stab: 'STAB', chute: 'CHUTE', pitchUp: 'stick ↓', pitchDown: 'stick ↑', left: 'stick ←', right: 'stick →', camera: 'CAM', tuck: 'TUCK', spread: 'SPREAD' };
      if (t[a] && !this.kbUsed) return t[a];
    }
    if (inp.lastDevice === 'pad') return PAD_NAMES[inp.pad[a]] || (a === 'pitchUp' ? 'L-stick ↓' : a === 'pitchDown' ? 'L-stick ↑' : a === 'left' || a === 'right' ? 'L-stick' : '?');
    return inp.keyLabel(a);
  }
  kbd(a) { return `<kbd>${esc(this.keyName(a))}</kbd>`; }

  updateTopbar() {
    $('coinVal').textContent = save.data.coins;
    const u = platform.user, box = $('userBox');
    if (u && u.username) box.innerHTML = `${u.profilePictureUrl ? `<img src="${esc(u.profilePictureUrl)}" alt="">` : ''}<span>${esc(u.username)}</span>`;
    else if (platform.userAvailable) { box.innerHTML = '<button id="loginBtn">Log in</button>'; $('loginBtn').onclick = () => platform.showAuthPrompt(); }
    else box.innerHTML = '';
  }

  // ------------------------------------------------------------------ menu screens
  buildMenu() {
    const d = save.data;
    $('menuFoot').textContent = `Flights: ${d.flights} · Missions: ${Object.keys(d.missions).length}/${MISSIONS.length} · Top speed: ${Math.round(d.stats.maxSpeed)} km/h`;
  }

  buildModes() {
    const L = $('modeList'); L.innerHTML = '';
    for (const k of ['mission', 'free', 'speed', 'precision', 'landing']) {
      const m = MODES[k];
      const b = document.createElement('button'); b.className = 'card';
      b.innerHTML = `<div class="stripe" style="background:${k === 'mission' ? 'var(--acc)' : 'var(--acc2)'}"></div><h3>${m.name}</h3><div class="muted small">${m.desc}</div>`;
      b.onclick = () => { this.g.audio.play('click'); if (k === 'mission') this.show('missions'); else { this.sel.mode = k; this.show('worlds'); this.worldsFrom = 'modes'; } };
      L.appendChild(b);
    }
  }

  buildWorlds() {
    const g = this.g;
    $('worldsTitle').textContent = `World Select · ${MODES[this.sel.mode].name}`;
    if (!g.mapUnlocked(this.sel.map)) this.sel.map = 'skyfall';
    const L = $('worldList'); L.innerHTML = '';
    for (const m of MAP_LIST) {
      const un = g.mapUnlocked(m.id);
      const rec = save.data.records[`${m.id}_${this.sel.mode}`];
      const b = document.createElement('button'); b.className = `card${this.sel.map === m.id ? ' sel' : ''}${un ? '' : ' locked'}`;
      b.innerHTML = `<div class="stripe" style="background:${m.color}"></div><h3>${m.name}</h3><div class="muted small">${m.subtitle}</div>
        ${un ? (rec && rec.score ? `<div class="small">Best: <b>${rec.score}</b> <span class="badge" style="color:${rankInfo(rec.rank).color}">${rankInfo(rec.rank).name}</span></div>` : '<div class="small muted">No record yet</div>') : `<div class="lock">🔒 Complete ${MAP_UNLOCK[m.id]} missions</div>`}`;
      b.onclick = () => { if (!un) { this.toast(`Complete ${MAP_UNLOCK[m.id]} missions to unlock ${m.name}`); return; } this.sel.map = m.id; const d = getMap(m.id); this.sel.time = d.defaultTime; if (!d.rain && this.sel.weather === 'rain') this.sel.weather = 'clear'; this.buildWorlds(); };
      L.appendChild(b);
    }
    const seg = (el, opts, key) => {
      el.innerHTML = '';
      for (const [k, v] of Object.entries(opts)) {
        if (key === 'weather' && k === 'rain' && !getMap(this.sel.map).rain) continue;
        const b = document.createElement('button'); b.textContent = v.label; if (this.sel[key] === k) b.className = 'sel';
        b.onclick = () => { this.sel[key] = k; seg(el, opts, key); };
        el.appendChild(b);
      }
    };
    seg($('timeSel'), TIMES, 'time'); seg($('weatherSel'), WEATHERS, 'weather');
  }

  buildMissions() {
    const L = $('missionList'); L.innerHTML = '';
    const done = Object.keys(save.data.missions).length;
    $('missionProg').textContent = `${done}/${MISSIONS.length} complete`;
    MISSIONS.forEach((m, i) => {
      const un = this.g.missionUnlocked(m);
      const r = save.data.missions[m.id];
      const map = MAP_LIST.find((x) => x.id === m.map);
      const b = document.createElement('button'); b.className = `mission${un ? '' : ' locked'}`;
      b.innerHTML = `<div class="num">${String(i + 1).padStart(2, '0')}</div><div class="info"><b>${esc(m.name)}</b><span>${map.name} · ${MODES[m.mode].name} · ${TIMES[m.time].label}${m.weather !== 'clear' ? ' · ' + WEATHERS[m.weather].label : ''}</span><span style="display:block">${esc(m.desc)}</span></div>
        ${r ? `<span class="badge" style="color:${rankInfo(r.rank).color}">${rankInfo(r.rank).name} ${r.best}</span>` : un ? '<span class="badge" style="color:var(--acc)">NEW</span>' : '<span>🔒</span>'}`;
      b.onclick = () => { if (!un) { this.toast('Complete the previous mission first'); return; } this.g.audio.play('click'); this.g.startSession({ missionId: m.id }); };
      L.appendChild(b);
    });
  }

  buildGarage() {
    const T = $('garageTabs'); T.innerHTML = '';
    const names = { suit: 'Wingsuit', helmet: 'Helmet', chute: 'Parachute', trail: 'Effects' };
    for (const k of Object.keys(CATALOG)) {
      const b = document.createElement('button'); b.textContent = names[k]; if (k === this.garageTab) b.className = 'sel';
      b.onclick = () => { this.garageTab = k; this.buildGarage(); };
      T.appendChild(b);
    }
    const L = $('garageList'); L.innerHTML = '';
    const D = save.data;
    for (const it of CATALOG[this.garageTab]) {
      const owned = D.owned[this.garageTab].includes(it.id);
      const eq = D.equip[this.garageTab] === it.id;
      const reqOk = this.reqMet(it.req);
      const cols = it.suit || (it.helmet && it.helmet.slice(0, 2)) || it.chute || (Array.isArray(it.trail) ? [`rgb(${it.trail.slice(0, 3).map((x) => Math.round(x * 255)).join(',')})`] : it.trail === 'rainbow' ? ['#f33', '#fa3', '#ff3', '#3d5', '#38f', '#93f'] : ['#333']);
      const b = document.createElement('button'); b.className = `item${eq ? ' sel' : ''}`;
      let status;
      if (eq) status = '<span style="color:var(--ok)">Equipped</span>';
      else if (owned) status = 'Owned · tap to equip';
      else if (it.req) status = reqOk ? 'Unlocked · tap to claim' : `🔒 ${this.reqText(it.req)}`;
      else status = `<span class="coin-ico"></span> ${it.price}`;
      b.innerHTML = `<div class="sw">${cols.map((c) => `<i style="background:${c}"></i>`).join('')}</div><b>${esc(it.name)}</b><span class="price">${status}</span>`;
      b.onclick = () => {
        if (eq) return;
        if (!owned) {
          if (it.req) { if (!reqOk) { this.toast(this.reqText(it.req)); return; } }
          else { if (D.coins < it.price) { this.toast('Not enough coins. Fly missions to earn more!'); return; } D.coins -= it.price; this.g.audio.play('coin'); }
          D.owned[this.garageTab].push(it.id);
        }
        D.equip[this.garageTab] = it.id;
        save.write();
        this.g.pilot.setLook(this.g.currentLook());
        this.buildGarage(); this.updateTopbar();
      };
      L.appendChild(b);
    }
    $('garageInfo').textContent = 'Cosmetic only — gear never changes flight physics.';
  }
  reqMet(r) {
    if (!r) return true;
    if (r.missions) return Object.keys(save.data.missions).length >= r.missions;
    if (r.rank) return this.g.rankCount(r.rank) >= r.count;
    return false;
  }
  reqText(r) {
    if (r.missions) return `Complete ${r.missions} missions`;
    return `Earn ${rankInfo(r.rank).name} or better on ${r.count} mission${r.count > 1 ? 's' : ''}`;
  }

  buildRecords() {
    const D = save.data;
    let h = '';
    for (const m of MAP_LIST) {
      h += `<h3 style="margin:0.8em 0 0.3em">${m.name}</h3><table class="rec"><tr><th>Mode</th><th>Best score</th><th>Rank</th><th>Best time</th><th>Top speed</th><th>Flights</th></tr>`;
      for (const k of ['mission', 'speed', 'precision', 'landing', 'free']) {
        const r = D.records[`${m.id}_${k}`];
        h += `<tr><td>${MODES[k].name}</td><td>${r && r.score ? r.score : '—'}</td><td>${r && r.rank ? `<span style="color:${rankInfo(r.rank).color}">${rankInfo(r.rank).name}</span>` : '—'}</td><td>${r && r.time ? fmtTime(r.time) : '—'}</td><td>${r && r.maxSpeed ? Math.round(r.maxSpeed) + ' km/h' : '—'}</td><td>${r ? r.flights || 0 : 0}</td></tr>`;
      }
      h += '</table>';
    }
    const s = D.stats;
    h += `<h3 style="margin:0.8em 0 0.3em">Career</h3><table class="rec"><tr><th>Flights</th><th>Air time</th><th>Landings</th><th>Crashes</th><th>Gates</th><th>Top speed</th></tr><tr><td>${D.flights}</td><td>${fmtTime(s.flightTime)}</td><td>${s.landings}</td><td>${s.crashes}</td><td>${s.gates}</td><td>${Math.round(s.maxSpeed)} km/h</td></tr></table>`;
    $('recordList').innerHTML = h;
  }

  buildArchive() {
    const L = $('archiveList'); L.innerHTML = '';
    const rows = [];
    if (this.g.lastReplay) rows.push({ r: this.g.lastReplay, last: true });
    save.data.archive.forEach((r, i) => rows.push({ r, i }));
    if (!rows.length) { L.innerHTML = '<div class="muted">No flights recorded yet. Complete a flight and press "Save Replay" on the results screen.</div>'; return; }
    for (const row of rows) {
      const m = row.r.meta;
      const map = MAP_LIST.find((x) => x.id === m.map);
      const div = document.createElement('div'); div.className = 'mission';
      const rk = m.rank ? rankInfo(m.rank) : null;
      div.innerHTML = `<div class="info"><b>${row.last ? 'Last flight · ' : ''}${map.name} — ${MODES[m.mode].name}</b><span>${new Date(m.date).toLocaleString()} · ${fmtTime(m.duration || 0)} · ${m.maxSpeed || 0} km/h · Score ${m.score}${rk ? ` · <span style="color:${rk.color}">${rk.name}</span>` : ' · Failed'}</span></div>`;
      const w = document.createElement('button'); w.className = 'mbtn'; w.textContent = 'Watch'; w.onclick = () => { this.g.session = null; this.g.lastResult = null; this.g.startReplay(row.r); };
      div.appendChild(w);
      if (!row.last) { const d = document.createElement('button'); d.className = 'mbtn'; d.textContent = 'Delete'; d.onclick = () => { save.data.archive.splice(row.i, 1); save.write(); this.buildArchive(); }; div.appendChild(d); }
      L.appendChild(div);
    }
  }

  // ------------------------------------------------------------------ settings
  buildSettings() {
    const T = $('setTabs'); T.innerHTML = '';
    const tabs = { graphics: 'Graphics', camera: 'Camera', audio: 'Audio', controls: 'Controls', gameplay: 'Gameplay' };
    for (const [k, v] of Object.entries(tabs)) { const b = document.createElement('button'); b.textContent = v; if (k === this.setTab) b.className = 'sel'; b.onclick = () => { this.setTab = k; this.buildSettings(); }; T.appendChild(b); }
    const B = $('setBody'); B.innerHTML = '';
    const S = this.g.settings;
    const commit = () => { save.write(); this.g.applySettings(); };
    const row = (label, el) => { const r = document.createElement('div'); r.className = 'set-row'; const l = document.createElement('span'); l.innerHTML = label; r.append(l, el); B.appendChild(r); return r; };
    const toggle = (label, get, set) => { const b = document.createElement('button'); b.className = 'kb'; const upd = () => { b.textContent = get() ? 'ON' : 'OFF'; }; upd(); b.onclick = () => { set(!get()); upd(); commit(); }; row(label, b); };
    const slider = (label, min, max, step, get, set, fmt = (v) => v) => {
      const w = document.createElement('span'); const i = document.createElement('input'); i.type = 'range'; i.min = min; i.max = max; i.step = step; i.value = get();
      const o = document.createElement('span'); o.style.minWidth = '3.5em'; o.style.display = 'inline-block'; o.style.textAlign = 'right'; o.textContent = fmt(get());
      i.oninput = () => { set(parseFloat(i.value)); o.textContent = fmt(parseFloat(i.value)); commit(); };
      w.append(i, o); row(label, w);
    };
    const choice = (label, opts, get, set) => { const s = document.createElement('div'); s.className = 'seg'; for (const [k, v] of Object.entries(opts)) { const b = document.createElement('button'); b.textContent = v; if (get() === k) b.className = 'sel'; b.onclick = () => { set(k); commit(); this.buildSettings(); }; s.appendChild(b); } row(label, s); };
    if (this.setTab === 'graphics') {
      choice('Quality <span class="muted small">(applies to next world load)</span>', { auto: 'Auto', low: 'Low', medium: 'Medium', high: 'High' }, () => S.quality, (v) => { S.quality = v; this.g.pendingQuality = true; this.g.quality = v === 'auto' ? this.g.quality : v; this.g.resize(); });
      toggle('Shadows', () => S.shadows, (v) => { S.shadows = v; });
      toggle('Motion blur & lens effects', () => S.motionBlur, (v) => { S.motionBlur = v; });
      toggle('Speed effects (streaks, blur strength)', () => S.speedFx, (v) => { S.speedFx = v; });
      toggle('Show flight route', () => S.hudRoute, (v) => { S.hudRoute = v; if (this.g.routeDots) this.g.routeDots.visible = v; });
    } else if (this.setTab === 'camera') {
      choice('Default view', { chase: 'Chase', pilot: 'Pilot', cinema: 'Cinema' }, () => S.view, (v) => { S.view = v; });
      slider('Field of view', 55, 95, 1, () => S.fov, (v) => { S.fov = v; }, (v) => `${v}°`);
      slider('Camera shake & turbulence', 0, 1.5, 0.1, () => S.shake, (v) => { S.shake = v; }, (v) => `${Math.round(v * 100)}%`);
    } else if (this.setTab === 'audio') {
      slider('Master volume', 0, 1, 0.05, () => S.master, (v) => { S.master = v; }, (v) => `${Math.round(v * 100)}%`);
      slider('Music', 0, 1, 0.05, () => S.music, (v) => { S.music = v; }, (v) => `${Math.round(v * 100)}%`);
      slider('Effects & wind', 0, 1, 0.05, () => S.sfx, (v) => { S.sfx = v; }, (v) => `${Math.round(v * 100)}%`);
    } else if (this.setTab === 'controls') {
      const hdr = document.createElement('div'); hdr.className = 'muted small'; hdr.textContent = 'Click a key box, then press the new key. Gamepad: click to cycle buttons. Arrow keys always work for pitch/turn.'; B.appendChild(hdr);
      for (const [a, label] of ACTIONS) {
        const w = document.createElement('span'); w.style.display = 'flex'; w.style.gap = '6px';
        const k = document.createElement('button'); k.className = 'kb'; k.textContent = codeLabel(S.keys[a]);
        k.onclick = () => {
          k.classList.add('wait'); k.textContent = 'press key…';
          this.g.input.onAnyKey = (code) => {
            this.g.input.onAnyKey = null;
            if (!RESERVED.has(code)) { for (const o in S.keys) if (S.keys[o] === code) S.keys[o] = S.keys[a]; S.keys[a] = code; commit(); }
            else this.toast('That key is reserved by the browser');
            this.buildSettings();
          };
        };
        const p = document.createElement('button'); p.className = 'kb'; p.textContent = PAD_NAMES[S.pad[a]] || '—';
        p.onclick = () => { S.pad[a] = S.pad[a] == null ? 0 : (S.pad[a] + 1) % 12; commit(); p.textContent = PAD_NAMES[S.pad[a]]; };
        w.append(k, p);
        row(label, w);
      }
      toggle('Invert pitch', () => S.invert, (v) => { S.invert = v; });
      slider('Input smoothing', 0.3, 2, 0.1, () => S.smoothing, (v) => { S.smoothing = v; }, (v) => v.toFixed(1));
      const rb = document.createElement('button'); rb.className = 'kb'; rb.textContent = 'Reset'; rb.onclick = () => { S.keys = { ...DEFAULT_KEYS }; S.pad = { ...DEFAULT_PAD }; commit(); this.buildSettings(); };
      row('Restore default controls', rb);
    } else if (this.setTab === 'gameplay') {
      toggle('Auto-spread wings after exit', () => S.autoSpread, (v) => { S.autoSpread = v; });
      slider('Proximity warning (subtle)', 15, 60, 1, () => S.warn.subtle, (v) => { S.warn.subtle = v; }, (v) => `${v} m`);
      slider('Proximity warning (strong)', 5, 30, 1, () => S.warn.strong, (v) => { S.warn.strong = v; }, (v) => `${v} m`);
      slider('Proximity warning (critical)', 1, 15, 1, () => S.warn.critical, (v) => { S.warn.critical = v; }, (v) => `${v} m`);
      const rb = document.createElement('button'); rb.className = 'kb'; rb.textContent = 'Reset progress';
      rb.onclick = () => { if (rb.dataset.c) { save.reset(); this.g.pilot.setLook(this.g.currentLook()); this.toast('Progress reset'); this.buildSettings(); } else { rb.dataset.c = 1; rb.textContent = 'Click again to confirm'; } };
      row('Reset all progress (keeps settings)', rb);
      const rs = document.createElement('button'); rs.className = 'kb'; rs.textContent = 'Defaults';
      rs.onclick = () => { const keep = { keys: S.keys, pad: S.pad }; Object.assign(S, JSON.parse(JSON.stringify(DEFAULT_SETTINGS)), keep); commit(); this.buildSettings(); };
      row('Restore default settings', rs);
    }
  }

  buildPauseKeys() {
    const items = [['pitchDown', 'Dive'], ['pitchUp', 'Pull up'], ['left', 'Turn L'], ['right', 'Turn R'], ['rollL', 'Roll L'], ['rollR', 'Roll R'], ['stab', 'Stabilize'], ['tuck', 'Tuck'], ['spread', 'Spread'], ['chute', 'Parachute'], ['camera', 'Camera'], ['restart', 'Restart']];
    $('pauseKeys').innerHTML = items.map(([a, l]) => `<span>${l}</span><span><b>${esc(this.keyName(a))}</b></span>`).join('') + '<span>Look around</span><span><b>Drag mouse / right stick</b></span>';
  }

  // ------------------------------------------------------------------ launch prep
  prep(s) {
    const def = getMap(s.map);
    $('prepMap').textContent = s.mission ? `${s.mission.name}` : def.name;
    let obj = '';
    if (s.mission) obj += `<b>${def.name} · ${MODES[s.mode].name}</b><br>${esc(s.mission.desc)}<br>`;
    else obj += `<b>${MODES[s.mode].name}</b> · ${def.subtitle}<br>`;
    if (s.gatesCfg) obj += `Gates: <b>${s.gatesCfg.n}</b>${s.mission ? ` (max ${s.mission.maxMiss} missed)` : ''} · `;
    if (s.limit) obj += `Time limit: <b>${fmtTime(s.limit)}</b> · `;
    obj += `Landing zone: <b>${Math.round(Math.hypot(s.start.x - s.target.x, s.start.z - s.target.z))} m</b> away, ${Math.round(s.start.y - s.target.y)} m below`;
    obj += `<br><span class="muted small">${TIMES[s.time].label} · ${WEATHERS[s.weather].label}</span>`;
    obj += `<br><span class="small">${this.kbd('stab')} jump · ${this.kbd('pitchDown')}${this.kbd('pitchUp')} pitch · ${this.kbd('left')}${this.kbd('right')} turn · ${this.kbd('chute')} parachute · ${this.kbd('camera')} camera</span>`;
    $('prepObj').innerHTML = obj;
    $('jumpBtn').textContent = s.mode === 'landing' ? 'Start' : 'Jump';
    $('prepHint').textContent = this.isTouch ? 'Drag to look around' : 'Drag the mouse to look around';
  }

  tutorial(phase) {
    const h = $('hint');
    if (!phase) { h.classList.add('hidden'); return; }
    if (phase === 'prep') { $('prepHint').innerHTML = `Press ${this.kbd('stab')} or tap <b>JUMP</b> to run off the edge`; return; }
    const txt = {
      spread: `Press ${this.kbd('stab')} to spread your wings!`,
      pitch: `${this.kbd('pitchDown')} dive for speed · ${this.kbd('pitchUp')} pull up to flatten your glide`,
      turn: `${this.kbd('left')} / ${this.kbd('right')} turn · ${this.kbd('rollL')} / ${this.kbd('rollR')} roll harder`,
      gates: 'Fly through the glowing orange gate — follow the arrow and keep the green flight-path ring on it',
      deploy: `Time to land! Press ${this.kbd('chute')} to deploy your parachute`,
      canopy: `Steer with ${this.kbd('left')} / ${this.kbd('right')} toward the orange beacon`,
      flare: `Hold ${this.kbd('pitchUp')} now to flare and land softly!`,
    }[phase];
    if (this._tutPhase !== phase) { $('hintTxt').innerHTML = txt; this._tutPhase = phase; }
    h.classList.remove('hidden');
  }

  // ------------------------------------------------------------------ HUD
  hud(dt) {
    const g = this.g, F = g.flight, s = g.session, cam = g.camera;
    const W = window.innerWidth, H = window.innerHeight;
    // markers every frame
    const fl = F.state === STATE.WINGSUIT || F.state === STATE.FREEFALL;
    const fpv = $('fpv');
    if (fl && g.rig.view !== 'cinema' && F.vel.lengthSq() > 25) {
      _v.copy(g.renderPos).addScaledVector(F.vel, 2.0).project(cam);
      if (_v.z < 1 && Math.abs(_v.x) < 1.1 && Math.abs(_v.y) < 1.1) { fpv.style.display = 'block'; fpv.style.left = `${(_v.x + 1) / 2 * W}px`; fpv.style.top = `${(1 - _v.y) / 2 * H}px`; }
      else fpv.style.display = 'none';
    } else fpv.style.display = 'none';
    // next gate / landing indicator
    const gate = g.gates && g.gates.nextGate();
    const tgt = gate && F.state <= STATE.WINGSUIT ? gate.c : _v.set(s.target.x, s.target.y + 2, s.target.z).clone();
    const dist = g.renderPos.distanceTo(tgt);
    const p = tgt.clone().project(cam);
    const mark = $('gateMark'), arr = $('edgeArrow');
    const onScreen = p.z < 1 && Math.abs(p.x) < 0.92 && Math.abs(p.y) < 0.9;
    if (F.state === STATE.LANDED || F.state === STATE.CRASHED) { mark.style.display = arr.style.display = 'none'; }
    else if (onScreen) {
      mark.style.display = 'block'; arr.style.display = 'none';
      mark.style.left = `${(p.x + 1) / 2 * W}px`; mark.style.top = `${(1 - p.y) / 2 * H}px`;
      mark.dataset.d = `${gate && F.state <= STATE.WINGSUIT ? 'GATE ' : 'LZ '}${Math.round(dist)} m`;
      mark.style.borderColor = gate && F.state <= STATE.WINGSUIT ? 'var(--acc)' : 'var(--ok)';
    } else {
      mark.style.display = 'none'; arr.style.display = 'block';
      let x = p.x, y = p.y; if (p.z > 1) { x = -x; y = -y; }
      const a = Math.atan2(-y, x);
      const r = Math.min(W, H) * 0.42;
      arr.style.left = `${W / 2 + Math.cos(a) * r}px`; arr.style.top = `${H / 2 + Math.sin(a) * r}px`;
      arr.style.transform = `rotate(${a}rad)`;
    }
    this.hudT -= dt;
    if (this.hudT > 0) return;
    this.hudT = 1 / 15;
    const kmh = F.vel.length() * 3.6;
    $('hSpeed').textContent = Math.round(kmh);
    $('hMax').textContent = Math.round(g.stats.maxSpeed);
    $('hTime').textContent = fmtTime(g.stats.totalTime);
    const agl = Math.max(0, Math.round(g.clr.agl));
    const altEl = $('hAlt'); altEl.textContent = agl;
    altEl.parentElement.style.color = agl < 30 && fl ? '#ff4a3a' : agl < 120 && fl ? '#ffd23f' : '';
    $('hAsl').textContent = Math.round(F.pos.y);
    const dl = Math.hypot(F.pos.x - s.target.x, F.pos.z - s.target.z);
    $('hDist').textContent = Math.round(dl);
    $('hLandDist').textContent = Math.round(dl);
    // objective
    let obj = '';
    if (g.gates.list.length && F.state <= STATE.WINGSUIT) obj = `Gate ${Math.min(g.gates.next + 1, g.gates.total)}/${g.gates.total} · ✓ ${g.stats.gatesPassed}`;
    else if (s.mode === 'landing' || F.state >= STATE.DEPLOY) obj = 'Land on the target';
    else if (s.mode === 'free') obj = 'Free flight';
    else obj = 'Deploy & land in the zone';
    if (s.limit) obj += ` · ${fmtTime(Math.max(0, s.limit - g.stats.totalTime))} left`;
    if (s.mode === 'speed' && g.stats.finishTime != null) obj = `Finish ${fmtTime(g.stats.finishTime)} · Land now`;
    $('hObj').textContent = obj;
    // stability
    const st = F.stability;
    const sb = $('hStab'); sb.style.width = `${st}%`; sb.style.background = st > 65 ? 'var(--ok)' : st > 35 ? '#ffd23f' : 'var(--bad)';
    // wind relative to camera heading
    cam.getWorldDirection(_v);
    const camYaw = Math.atan2(_v.x, _v.z);
    const wy = Math.atan2(g.wind.x, g.wind.z);
    const rel = camYaw - wy;
    $('hWindArrow').style.transform = `rotate(${(-Math.PI / 2 + rel)}rad)`;
    $('hWind').textContent = `${Math.round(Math.hypot(g.wind.x, g.wind.z) * 3.6)} km/h wind`;
    // landing arrow
    const ly = Math.atan2(s.target.x - F.pos.x, s.target.z - F.pos.z);
    $('hLandArrow').style.transform = `rotate(${camYaw - ly}rad)`;
    // parachute status
    const ch = $('hChute');
    let cls = 'chute', txt;
    if (F.state === STATE.DEPLOY) { cls += ' open'; txt = 'DEPLOYING…'; }
    else if (F.state === STATE.CANOPY) { cls += ' open'; txt = 'CANOPY OPEN'; }
    else if (F.state === STATE.LANDED) { cls += ' open'; txt = 'LANDED'; }
    else if (F.state === STATE.CRASHED) txt = 'IMPACT';
    else { cls += ' ready'; txt = 'PARACHUTE READY'; if (g.deployWindowShown && F.state === STATE.WINGSUIT) cls += ' window'; }
    ch.className = cls; $('hChuteTxt').textContent = txt;
    $('hChuteKey').innerHTML = F.state <= STATE.WINGSUIT && F.state >= STATE.FREEFALL ? `Deploy: ${this.kbd('chute')}` : F.state === STATE.CANOPY ? `Flare: ${this.kbd('pitchUp')}` : '';
  }

  // ------------------------------------------------------------------ results
  results(R, s) {
    const g = this.g;
    for (const p of PANELS) $(p).classList.remove('show');
    for (const id of ['hud', 'replay', 'touch', 'topbar']) $(id).classList.add('hidden');
    this.cur = 'results';
    const title = R.success ? (s.mission ? 'Mission Complete' : 'Landed Safely') : (R.ok ? 'Challenge Failed' : 'Flight Failed');
    $('resTitle').textContent = title;
    $('resTitle').style.color = R.success ? 'var(--ok)' : 'var(--bad)';
    $('resSub').textContent = `${getMap(s.map).name} · ${s.mission ? s.mission.name : MODES[s.mode].name}${R.reasons.length ? ' — ' + R.reasons.join(' · ') : ''}`;
    $('resScore').textContent = R.sc.total;
    const rk = $('resRank');
    if (R.rank) { rk.textContent = R.rank.name; rk.style.color = R.rank.color; } else { rk.textContent = 'No rank'; rk.style.color = 'var(--mut)'; }
    $('resRec').textContent = R.newRecord ? 'New personal record!' : R.firstClear ? 'First clear bonus +50' : '';
    const bars = $('resBars'); bars.innerHTML = '';
    for (const k in R.sc.weights) {
      if (!R.sc.weights[k]) continue;
      const d = document.createElement('div'); d.className = 'rb';
      d.innerHTML = `<span>${CATEGORY_LABELS[k]}</span><span class="t"><i></i></span><span class="v">${R.sc.parts[k]}/${R.sc.weights[k]}</span>`;
      bars.appendChild(d);
      setTimeout(() => { d.querySelector('i').style.width = `${Math.round(R.sc.norm[k] * 100)}%`; }, 50);
    }
    const st = R.st;
    const stats = [
      ['Max speed', `${Math.round(st.maxSpeed)} km/h`], ['Avg speed', `${Math.round(st.avgSpeed)} km/h`], ['Flight time', fmtTime(st.totalTime)],
      ['Distance', `${(st.path / 1000).toFixed(2)} km`], ['Stability', `${Math.round(st.avgStab)}%`], ['Closest pass', st.minClr < 1e8 ? `${st.minClr.toFixed(1)} m` : '—'],
    ];
    if (st.gatesTotal) stats.push(['Gates', `${st.gatesPassed}/${st.gatesTotal}`]);
    if (st.finishTime != null) stats.push(['Route time', fmtTime(st.finishTime)]);
    stats.push(['Landing', st.landDist != null ? `${st.landDist.toFixed(1)} m from center${st.landQuality < 1 ? ' (hard)' : ''}` : '—']);
    stats.push(['Glide ratio', `${R.ctx.glideRatio.toFixed(2)} : 1`]);
    $('resStats').innerHTML = stats.map(([a, b]) => `<div><span class="muted">${a}</span><b>${b}</b></div>`).join('');
    $('resCoins').textContent = R.coins * (R.doubled ? 2 : 1);
    $('resReward').textContent = R.doubled ? '(doubled!)' : '';
    $('coinVal').textContent = save.data.coins;
    const i = s.mission ? MISSIONS.findIndex((m) => m.id === s.mission.id) : -1;
    const next = i >= 0 ? MISSIONS[i + 1] : null;
    $('resNext').style.display = next && g.missionUnlocked(next) ? '' : 'none';
    $('resAd').style.display = platform.rewardedAvailable && !R.doubled && R.coins > 0 ? '' : 'none';
    this.showModal('results');
  }

  // ------------------------------------------------------------------ replay
  replayInit(R) {
    const m = R.meta;
    $('rpTitle').textContent = `Replay · ${getMap(m.map).name} · ${MODES[m.mode].name} · Score ${m.score}`;
    $('rpSpeed').textContent = '1×'; $('rpCam').textContent = 'Chase'; $('rpPlay').textContent = '❚❚';
  }
  replayUpdate(R, smp) {
    $('rpSlider').value = Math.round((R.t / Math.max(0.01, R.player.duration)) * 1000);
    $('rpTime').textContent = fmtTime(R.t);
    $('rpStats').textContent = `${Math.round(smp.speed * 3.6)} km/h · ${Math.round(smp.pos.y)} m ASL · stability ${Math.round(smp.stability)}%`;
    $('rpPlay').textContent = R.playing ? '❚❚' : '▶';
  }
  replayToggle() { const R = this.g.replay; if (!R) return; if (R.t >= R.player.duration - 0.01) R.t = 0; R.playing = !R.playing; }
  replayCam() {
    const rig = this.g.rig;
    const order = ['chase', 'cinema', 'pilot', 'orbit'];
    const v = order[(order.indexOf(rig.view) + 1) % order.length];
    rig.view = v; rig.cine.t = 99;
    $('rpCam').textContent = v === 'orbit' ? 'Orbit' : VIEW_LABEL[v].replace(' View', '');
  }

  // ------------------------------------------------------------------ touch
  initTouch() {
    const zone = $('stickZone'), base = $('stickBase'), knob = $('stickKnob');
    const T = this.g.input.touch;
    let id = null, cx = 0, cy = 0;
    const R = 55;
    zone.addEventListener('pointerdown', (e) => {
      id = e.pointerId; const r = base.getBoundingClientRect(); cx = r.left + r.width / 2; cy = r.top + r.height / 2;
      zone.setPointerCapture(id); move(e); T.active = true;
    });
    const move = (e) => {
      if (e.pointerId !== id) return;
      let dx = e.clientX - cx, dy = e.clientY - cy; const l = Math.hypot(dx, dy); if (l > R) { dx *= R / l; dy *= R / l; }
      knob.style.transform = `translate(${dx}px, ${dy}px)`;
      T.x = dx / R; T.y = dy / R;
    };
    const end = (e) => { if (e.pointerId !== id) return; id = null; T.active = false; T.x = T.y = 0; knob.style.transform = ''; };
    zone.addEventListener('pointermove', move); zone.addEventListener('pointerup', end); zone.addEventListener('pointercancel', end);
    // right side drag = camera look
    const canvas = this.g.canvas;
    let lid = null, lx = 0, ly = 0;
    canvas.addEventListener('pointerdown', (e) => { if (e.pointerType !== 'touch') return; lid = e.pointerId; lx = e.clientX; ly = e.clientY; });
    canvas.addEventListener('pointermove', (e) => { if (e.pointerId !== lid) return; this.g.input.lookDX += (e.clientX - lx) * 0.008; this.g.input.lookDY += (e.clientY - ly) * 0.008; lx = e.clientX; ly = e.clientY; });
    const lend = (e) => { if (e.pointerId === lid) lid = null; };
    canvas.addEventListener('pointerup', lend); canvas.addEventListener('pointercancel', lend);
    document.querySelectorAll('#tbtns .tb').forEach((b) => {
      const a = b.dataset.t;
      const hold = ['stab', 'tuck', 'spread', 'rollL', 'rollR'].includes(a);
      b.addEventListener('pointerdown', (e) => {
        e.preventDefault(); this.g.input.lastDevice = 'touch';
        if (hold) { T.btn[a] = true; b.classList.add('on'); }
        this.g.input.queue.push(a);
      });
      const up = () => { if (hold) { T.btn[a] = false; b.classList.remove('on'); } };
      b.addEventListener('pointerup', up); b.addEventListener('pointercancel', up); b.addEventListener('pointerleave', up);
    });
    window.addEventListener('keydown', () => { this.kbUsed = true; }, { once: true });
  }

  // ------------------------------------------------------------------ gamepad menu navigation
  focusables() {
    const root = this.modal ? $(this.modal) : (['hud', 'replay'].includes(this.cur) ? $(this.cur) : $(this.cur));
    if (!root) return [];
    return Array.from(root.querySelectorAll('button, input[type=range]')).filter((b) => b.offsetParent !== null && !b.disabled);
  }
  focusFirst() { const f = this.focusables(); if (f.length && !f.includes(document.activeElement)) f[0].focus(); }
  padNav(a) {
    const g = this.g;
    if (g.mode === 'flight' || (g.mode === 'prep' && !this.modal)) return;
    const btn = parseInt(a.slice(4), 10);
    const list = this.focusables();
    if (!list.length) return;
    let cur = document.activeElement;
    if (!list.includes(cur)) { list[0].focus(); return; }
    if (btn === 0) { cur.click(); return; }
    if (btn === 1) { if (this.modal === 'pause') g.resume(); else if (!this.modal && this.cur !== 'menu') this.back(); return; }
    const dir = { 12: [0, -1], 13: [0, 1], 14: [-1, 0], 15: [1, 0] }[btn];
    if (!dir) return;
    const r0 = cur.getBoundingClientRect(), c0 = [r0.left + r0.width / 2, r0.top + r0.height / 2];
    let best = null, bd = 1e9;
    for (const el of list) {
      if (el === cur) continue;
      const r = el.getBoundingClientRect(), c = [r.left + r.width / 2, r.top + r.height / 2];
      const dx = c[0] - c0[0], dy = c[1] - c0[1];
      const along = dx * dir[0] + dy * dir[1];
      if (along <= 4) continue;
      const perp = Math.abs(dx * dir[1] - dy * dir[0]);
      const d = along + perp * 2.5;
      if (d < bd) { bd = d; best = el; }
    }
    if (best) { best.focus(); best.scrollIntoView({ block: 'nearest' }); }
  }
}
