// GLIDEZONE client entry: menus, connection management and glue between game, HUD,
// vault and inventory.

import { Game } from './game.js';
import { Hud } from './ui/hud.js';
import { Vault } from './ui/vault.js';
import { Inventory } from './ui/inventory.js';
import { Leaderboard } from './ui/leaderboard.js';
import { Chat } from './ui/chat.js';
import { $, $$, esc, html, show } from './ui/dom.js';
import { t, lang } from './i18n.js';
import { sdk } from './sdk.js';
import { levelFor, rankFor } from '../shared/xp.js';
import { audio } from './audio.js';
import { settings, saveSettings, guestToken, DEFAULTS } from './settings.js';
import { WsTransport, LocalTransport, defaultServerUrl, probeServer } from './net.js';
import { MAP_LIST } from '../shared/maps/index.js';
import { PRIVACY } from './privacy.js';
import { skyTexture } from './render/skybox.js';
import { CATALOG_TOTAL } from '../shared/catalog.js';
import { GAME } from '../shared/config.js';

const app = {
  state: 'menu', // 'menu' | 'game'
  serverUrl: defaultServerUrl(),
  online: false,
  health: null,
  playMode: null, // 'public' | 'practice'
  practiceMap: null,
  lastMidAd: 0,
};

const isTouchOnly = () => ('ontouchstart' in window) && !matchMedia('(pointer:fine)').matches;

// ------------------------------------------------------------------ account channel
// Inventory and crates always go to the backend that owns the profile: the game connection
// while playing, otherwise a lightweight private connection (or the offline local room).
class Account {
  constructor() {
    this.inventory = { owned: [], equipped: null, total: CATALOG_TOTAL };
    this.xp = 0;
    this.freeCrates = 0;
    this.conn = null;
    this.waiters = new Map();
    this.connecting = null;
  }

  _handle(m) {
    if (m.t === 'welcome') this._setInv(m.inventory);
    else if (m.t === 'inventory') this._setInv(m);
    else if (m.t === 'crate') {
      const w = this.waiters.get(m.key);
      if (w) { this.waiters.delete(m.key); w(m); }
      if (m.free_crates !== undefined) this.freeCrates = m.free_crates;
      if (m.status === 'SUCCESS') this.send({ t: 'inventory' });
    } else if (m.t === 'leaderboard') {
      const w = this.waiters.get('lb:' + m.req);
      if (w) { this.waiters.delete('lb:' + m.req); w(m); }
    }
  }

  async leaderboard(board, period) {
    if (!(await this.ensure())) return null;
    const req = Math.random().toString(36).slice(2);
    return new Promise((resolve) => {
      const to = setTimeout(() => { this.waiters.delete('lb:' + req); resolve(null); }, 6000);
      this.waiters.set('lb:' + req, (m) => { clearTimeout(to); resolve(m); });
      this.send({ t: 'leaderboard', board, period, req });
    });
  }

  _setInv(inv) {
    this.inventory = { owned: inv.owned || [], equipped: inv.equipped ?? null, total: inv.total || CATALOG_TOTAL };
    if (inv.xp !== undefined) { this.xp = inv.xp; this.freeCrates = inv.freeCrates || 0; hud.setXp(this.xp); }
    window.dispatchEvent(new CustomEvent('gz-inventory'));
  }

  async ensure() {
    if (app.state === 'game' && game.net) return true;
    if (this.conn) return true;
    if (this.connecting) return this.connecting;
    this.connecting = (async () => {
      try {
        const tr = app.online ? await new WsTransport(app.serverUrl).open() : await new LocalTransport({ voting: false }).open();
        tr.onmessage = (m) => this._handle(m);
        tr.onclose = () => { this.conn = null; };
        // a game started while this was connecting: the game connection serves the account now
        if (app.state === 'game' && game.net) { try { tr.close(); } catch (e) { /* */ } return true; }
        tr.send({ t: 'hello', ...(await helloBase()), spectate: true, mode: 'practice' });
        this.conn = tr;
        return true;
      } catch (e) {
        return false;
      } finally {
        this.connecting = null;
      }
    })();
    return this.connecting;
  }

  closeMenuConn() {
    if (this.conn) { try { this.conn.close(); } catch (e) { /* */ } }
    this.conn = null;
  }

  send(m) {
    if (app.state === 'game' && game.net) game.send(m);
    else if (this.conn) this.conn.send(m);
  }

  async refresh() {
    if (await this.ensure()) this.send({ t: 'inventory' });
  }

  async requestCrate(key, free = false) {
    if (!(await this.ensure())) return null;
    return new Promise((resolve) => {
      const to = setTimeout(() => { this.waiters.delete(key); resolve(null); }, 8000);
      this.waiters.set(key, (m) => { clearTimeout(to); resolve(m); });
      this.send({ t: 'crate', key, free });
    });
  }

  async equip(id) {
    if (await this.ensure()) this.send({ t: 'equip', id });
  }
}

const canvas = $('#game-canvas');
const game = new Game(canvas);
const hud = new Hud(game);
const chat = new Chat(game);
const account = new Account();
game.on('inventory', (inv) => account._setInv(inv));
game.on('welcome', (m) => account._setInv(m.inventory));
game.on('crate', (m) => account._handle(m));
game.on('leaderboard', (m) => account._handle(m));

const vault = new Vault({
  getInventory: () => account.inventory,
  refreshInventory: () => account.refresh(),
  requestCrate: (key, free) => account.requestCrate(key, free),
  freeCrates: () => account.freeCrates,
  equip: (id) => account.equip(id),
  openInventory: () => { closePanels(); openPanel('inventory'); },
  onCommitted: () => account.refresh(),
});
const inventory = new Inventory({
  getInventory: () => account.inventory,
  refreshInventory: () => account.refresh(),
  equip: (id) => account.equip(id),
  close: () => closePanels(),
});
const leaderboard = new Leaderboard({
  query: (board, period) => account.leaderboard(board, period),
  close: () => closePanels(),
});

window.addEventListener('gz-inventory', () => {
  if (!$('#vault').classList.contains('hidden') && vault.state !== 'opening') vault._renderPanel();
  renderMenu();
});

async function helloBase() {
  const cgToken = await sdk.userToken();
  const name = (sdk.user && sdk.user.username) || settings.name || '';
  return { name, token: guestToken(), cgToken };
}

// ------------------------------------------------------------------ panels
function openPanel(which) {
  audio.ensure();
  show('#panels', true);
  if (which === 'vault') vault.open();
  if (which === 'inventory') inventory.open();
  if (which === 'settings') renderSettings();
  if (which === 'leaderboard') leaderboard.open(app.state === 'game' && game.map ? game.map.id : undefined);
  if (which === 'maps') renderMaps();
  if (which === 'privacy') renderPrivacy();
  app.panel = which;
  game.input.unlock();
  sdk.gameplayStop(); // a panel over the game is a break (resumed from the pause menu)
}

function closePanels() {
  vault.close();
  inventory.close();
  leaderboard.close();
  show('#settings', false);
  show('#maps', false);
  show('#privacy', false);
  show('#panels', false);
  app.panel = null;
  if (app.state === 'game') showPause(true);
}

function renderPrivacy() {
  show('#privacy', true);
  html('#privacy', `<div class="panel-head"><div class="panel-title">${t('privacy')}</div><button class="btn ghost" id="priv-close">✕ ${t('close')}</button></div>
    <div class="privacy-body">${PRIVACY[lang()] || PRIVACY.en}</div>`);
  $('#priv-close').onclick = () => { audio.play('click'); closePanels(); };
}

document.addEventListener('gz-close-panels', () => { audio.play('click'); closePanels(); });

// mouse / touch sensitivity right in the main and pause menus
function sensRow() {
  return `<label class="sens-row"><span>${t(isTouchOnly() ? 'sensTouch' : 'sens')}</span><input type="range" class="sens-input" min="0.2" max="6" step="0.05" value="${settings.sensitivity}"><b class="sens-val">${(+settings.sensitivity).toFixed(2)}</b></label>`;
}
function bindSens(root) {
  root.querySelectorAll('.sens-input').forEach((el) => {
    el.oninput = () => { saveSettings({ sensitivity: +el.value }); const v = el.parentElement.querySelector('.sens-val'); if (v) v.textContent = (+el.value).toFixed(2); };
  });
}

// ------------------------------------------------------------------ main menu
function renderMenu() {
  const h = app.health;
  const status = app.online
    ? `<span class="dot on"></span>${t('server')} ${t('online')} · ${h ? h.players : 0} ${t('players')} · ${esc((MAP_LIST.find((m) => m.id === (h && h.map)) || {}).display_name || '')}`
    : `<span class="dot"></span>${app.serverUrl ? t('offlineMode') : t('offlineMode')}`;
  const cgName = sdk.user && sdk.user.username;
  html('#menu', `
    <div class="menu-inner">
      <div class="logo"><span>FPS</span> SURF</div>
      <div class="tagline">${t('tagline')}</div>
      <div class="menu-grid">
        <div class="menu-col">
          <button class="btn primary big" id="m-play">${t('play')}</button>
          ${app.online ? `<button class="btn big" id="m-friends">👥 ${t('friends')}</button>` : ''}
          <button class="btn big" id="m-practice">${t('practice')}</button>
          <button class="btn big" id="m-spec">${t('spectate')}</button>
          <div class="row">
            <button class="btn" id="m-vault">🔓 ${t('vault')}</button>
            <button class="btn" id="m-inv">${t('inventory')} <span class="dim">${account.inventory.owned.length}/${CATALOG_TOTAL}</span></button>
          </div>
          <div class="row">
            <button class="btn" id="m-lb">🏆 ${t('leaderboard')}</button>
            <button class="btn ghost" id="m-settings">⚙ ${t('settings')}</button>
          </div>
        </div>
        <div class="menu-col info">
          <label class="field">${t('name')}
            <input id="m-name" maxlength="${GAME.maxNameLength}" value="${esc(cgName || settings.name)}" ${cgName ? 'disabled' : ''} placeholder="Surfer">
          </label>
          ${sdk.available && !cgName ? `<button class="btn ghost small" id="m-login">${t('login')}</button>` : ''}
          ${sensRow()}
          <div class="status">${status}</div>
          <div class="status"><span class="chat-rank">${rankFor(levelFor(account.xp)).short}</span> ${t('level')} ${levelFor(account.xp)} · ${account.xp.toLocaleString()} XP</div>
          <p class="howto">${t('howTo')}</p>
          <p class="howto">${t('jumpHint')}</p>
          <p class="keys-line">${t('controls')}</p>
          <button class="link-btn" id="m-privacy">${t('privacy')}</button>
        </div>
      </div>
    </div>`);
  const bind = (id, f) => { const b = $('#' + id); if (b) { b.onclick = () => { audio.ensure(); audio.play('click'); f(); }; b.onmouseenter = () => audio.play('hover'); } };
  bind('m-play', () => startGame('public', false));
  bind('m-spec', () => startGame('public', true));
  bind('m-friends', () => startGame('party', false));
  bind('m-privacy', () => openPanel('privacy'));
  bind('m-practice', () => openPanel('maps'));
  bind('m-vault', () => openPanel('vault'));
  bind('m-inv', () => openPanel('inventory'));
  bind('m-settings', () => openPanel('settings'));
  bind('m-lb', () => openPanel('leaderboard'));
  bind('m-login', async () => { await sdk.showAuthPrompt(); account.closeMenuConn(); account.refresh(); renderMenu(); });
  bindSens($('#menu'));
  const nameEl = $('#m-name');
  if (nameEl) nameEl.onchange = () => { saveSettings({ name: nameEl.value.trim().slice(0, GAME.maxNameLength) }); account.closeMenuConn(); }; // reconnect with the new name
}

function renderMaps() {
  show('#maps', true);
  html('#maps', `
    <div class="panel-head"><div class="panel-title">${t('choose')}</div><button class="btn ghost" id="maps-close">✕ ${t('close')}</button></div>
    <div class="map-grid">${MAP_LIST.map((m) => `
      <button class="map-card" data-id="${m.id}" style="--a:${m.theme.sky[0]};--b:${m.theme.sky[1]};--c:${m.theme.sky[2]};--e:${m.theme.edge}">
        <div class="map-art"><canvas class="map-sky"></canvas><div class="map-ramp"></div><div class="map-ramp r2"></div></div>
        <div class="map-name">${esc(m.display_name)}</div>
        <div class="map-meta"><span class="diff d${m.difficulty}">${t('difficulty')[m.difficulty]}</span> · ${t(m.layout)} · ${m.stages} ${m.layout === 'linear' ? t('checkpoints') : t('stages')} · ~${Math.floor(m.par / 60)}:${String(Math.round(m.par % 60)).padStart(2, '0')}</div>
        <div class="map-desc">${esc(m.description)}</div>
      </button>`).join('')}</div>`);
  $('#maps-close').onclick = () => { audio.play('click'); closePanels(); };
  paintMapArt();
  $$('.map-card').forEach((b) => (b.onclick = () => {
    audio.play('click');
    const id = b.dataset.id;
    if (app.state === 'game' && app.playMode === 'practice') {
      game.send({ t: 'practice_map', id });
      closePanels();
    } else {
      closePanels();
      startGame('practice', false, id);
    }
  }));
}

// map cards show a crop of each map's own painted sky (painted once, one card per frame)
function paintMapArt() {
  const cards = $$('.map-card');
  let i = 0;
  const next = () => {
    const card = cards[i++];
    if (!card || !card.isConnected) return;
    const m = MAP_LIST.find((x) => x.id === card.dataset.id);
    const cv = card.querySelector('.map-sky');
    try {
      const img = skyTexture(m).image;
      const r = cv.getBoundingClientRect();
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      cv.width = Math.max(1, Math.round(r.width * dpr)); cv.height = Math.max(1, Math.round(r.height * dpr));
      const sw = img.width * 0.42, sh = sw * cv.height / cv.width;
      const sx = img.width * 0.5, sy = img.height / 2 - sh * 0.78;
      cv.getContext('2d').drawImage(img, sx, sy, sw, sh, 0, 0, cv.width, cv.height);
      card.classList.add('art-ready');
    } catch (e) { /* keep the gradient */ }
    requestAnimationFrame(next);
  };
  requestAnimationFrame(next);
}

function renderSettings() {
  show('#settings', true);
  const s = settings;
  const slider = (key, label, min, max, step) => `<label class="set-row"><span>${label}</span><input type="range" data-k="${key}" min="${min}" max="${max}" step="${step}" value="${s[key]}"><b data-v="${key}">${s[key]}</b></label>`;
  const toggle = (key, label) => `<label class="set-row"><span>${label}</span><input type="checkbox" data-k="${key}" ${s[key] ? 'checked' : ''}></label>`;
  html('#settings', `
    <div class="panel-head"><div class="panel-title">${t('settings')}</div><div class="row"><button class="btn ghost" id="set-privacy">${t('privacy')}</button><button class="btn ghost" id="set-close">✕ ${t('close')}</button></div></div>
    <div class="set-grid">
      <div>
        ${slider('sensitivity', t(isTouchOnly() ? 'sensTouch' : 'sens'), 0.2, 6, 0.05)}
        ${toggle('invertY', t('invertY'))}
        ${slider('fov', t('fov'), 80, 120, 1)}
        ${slider('hudScale', t('hudScale'), 0.7, 1.4, 0.05)}
        ${toggle('showKeys', t('showKeys'))}
        ${toggle('chat', t('chatSetting'))}
      </div>
      <div>
        ${slider('master', t('master'), 0, 1, 0.05)}
        ${slider('sfx', t('sfx'), 0, 1, 0.05)}
        ${slider('ui', t('uiVol'), 0, 1, 0.05)}
        ${toggle('viewBob', t('viewBob'))}
        ${toggle('reduceMotion', t('reduceMotion'))}
        <label class="set-row"><span>${t('quality')}</span><select data-k="quality"><option value="ultra" ${s.quality === 'ultra' ? 'selected' : ''}>Ultra</option><option value="high" ${s.quality === 'high' ? 'selected' : ''}>High</option><option value="low" ${s.quality === 'low' ? 'selected' : ''}>Low</option></select></label>
        <label class="set-row"><span>${t('language')}</span><select data-k="lang"><option value="">English (default)</option><option value="sl" ${s.lang === 'sl' ? 'selected' : ''}>Slovenščina</option></select></label>
      </div>
    </div>
    <div class="row"><button class="btn ghost" id="set-reset">Reset</button></div>`);
  $$('#settings [data-k]').forEach((el) => {
    el.oninput = el.onchange = () => {
      const k = el.dataset.k;
      const v = el.type === 'checkbox' ? el.checked : el.type === 'range' ? Number(el.value) : el.value;
      saveSettings({ [k]: v });
      const lab = $(`#settings [data-v="${k}"]`);
      if (lab) lab.textContent = v;
      if (k === 'lang') { renderSettings(); renderMenu(); }
    };
  });
  $('#set-close').onclick = () => { audio.play('click'); closePanels(); };
  $('#set-privacy').onclick = () => { audio.play('click'); show('#settings', false); renderPrivacy(); app.panel = 'privacy'; };
  $('#set-reset').onclick = () => { saveSettings({ ...DEFAULTS, name: settings.name }); renderSettings(); };
}

// ------------------------------------------------------------------ game flow
async function startGame(mode, spectate, mapId, booting = false, room = null) {
  clearTimeout(app.leaveTimer);
  audio.ensure();
  show('#loading', true);
  html('#loading', `<div class="spinner"></div><div>${t('connecting')}</div>`);
  if (!booting) sdk.loadingStart();
  account.closeMenuConn();
  let tr;
  try {
    if (app.online) tr = await new WsTransport(app.serverUrl).open();
    else tr = await new LocalTransport({ voting: mode !== 'practice', map: mapId }).open();
  } catch (e) {
    app.online = false;
    app.fellBack = true;
    tr = await new LocalTransport({ voting: mode !== 'practice', map: mapId }).open();
  }
  app.playMode = mode;
  app.state = 'game';
  const hello = { ...(await helloBase()), spectate, mode, map: mapId, room: room || undefined };
  const join = (transport, h = hello) => {
    let timer;
    const done = new Promise((res) => {
      const offs = [
        game.on('welcome', () => fin('ok')), game.on('mismatch', () => fin('mismatch')), game.on('disconnected', () => fin('closed')),
        game.on('servermsg', (m) => { if (m.t === 'full' || m.t === 'error') fin(m.t); }),
      ];
      function fin(r) { clearTimeout(timer); offs.forEach((o) => o()); res(r); }
      timer = setTimeout(() => fin('timeout'), 6000);
    });
    game.connect(transport, h);
    return done;
  };
  const offline = async () => join(await new LocalTransport({ voting: mode !== 'practice', map: mapId }).open());
  app.starting = true;
  let res = await join(tr);
  if (res === 'full' && app.online) {
    // the invited room filled up in the meantime: join the public server instead
    try { res = await join(await new WsTransport(app.serverUrl).open(), { ...hello, mode: 'public', room: undefined }); } catch (e) { res = 'closed'; }
  }
  if (res === 'mismatch') {
    // the server still runs other map geometry (not updated yet): play the correct maps offline
    app.online = false;
    app.outdated = true;
    await offline();
  } else if (res !== 'ok' && app.state === 'game') {
    // server unreachable, closed during the join or refused us: never leave a half-joined game
    if (app.online) app.fellBack = true;
    app.online = false;
    await offline();
  }
  app.starting = false;
  if (app.state !== 'game') return; // left to the menu while connecting
  if (app.outdated) hud.feed(t('serverOutdated'), 'record');
  else if (app.fellBack) hud.feed(t('serverDown'), 'record');
  app.fellBack = false;
  // every online room can be joined through an invite link (CrazyGames invite button + pause menu)
  app.roomCode = app.online && game.net && game.roomCode && mode !== 'practice' ? game.roomCode : null;
  if (app.roomCode) sdk.showInviteButton(app.roomCode);
  else sdk.hideInviteButton();
  sdk.updateRoom(app.roomCode);
  if (app.roomCode && mode === 'party') hud.feed(`👥 ${t('partyOpen')} (${isTouchOnly() ? '☰' : 'ESC'})`, 'pb');
  sdk.loadingStop();
  show('#loading', false);
  show('#menu', false);
  hud.setVisible(true);
  chat.setVisible(true);
  hud.renderScoreboard();
  showPause(false);
  // play starts at once: the keyboard works immediately, the mouse after one click on the game
  show('#click-to-play', false);
  try { window.focus(); } catch (e) { /* */ }
  const touch = isTouchOnly();
  show('#mouse-hint', !touch && !game.input.locked && !spectate);
  show('#touch-ui', touch && !spectate);
  show('#touch-menu', touch); // spectators need the menu button too
  html('#mouse-hint', t('mouseHint'));
  let firstTime = false;
  try { firstTime = !localStorage.getItem('gz.tutorial.v1'); } catch (e) { /* storage blocked */ }
  if (firstTime && !spectate) {
    // first visit: the basic controls in a side card that never blocks play, gone after a while
    html('#tutorial', `<button class="tut-x" id="tut-x" aria-label="Close">✕</button><div class="ctp-title">${t('tutTitle')}</div>
      <div class="tut-list">${t(touch ? 'tutTouch' : 'tut').map(([k, d]) => `<span class="k">${esc(k)}</span><span class="d">${esc(d)}</span>`).join('')}</div>`);
    const el = $('#tutorial');
    el.classList.remove('fade');
    show(el, true);
    $('#tut-x').onclick = (e) => { e.stopPropagation(); show(el, false); };
    setTimeout(() => el.classList.add('fade'), 18000);
    setTimeout(() => show(el, false), 18700);
    try { localStorage.setItem('gz.tutorial.v1', '1'); } catch (e) { /* */ }
  }
  if (!spectate) sdk.gameplayStart();
}

function leaveGame() {
  clearTimeout(app.leaveTimer);
  show('#touch-menu', false);
  show('#free-crate', false);
  game.disconnect();
  app.roomCode = null;
  sdk.hideInviteButton();
  sdk.updateRoom(null);
  app.state = 'menu';
  sdk.gameplayStop();
  hud.setVisible(false);
  chat.setVisible(false);
  showPause(false);
  show('#click-to-play', false);
  show('#scoreboard', false);
  show('#menu', true);
  game.startDemo();
  renderMenu();
  account.refresh();
}

function showPause(on) {
  if (!on || app.state !== 'game') { show('#pause', false); return; }
  if (app.panel) return;
  show('#click-to-play', false);
  show('#pause', true);
  const v = game.vote;
  const practice = app.playMode === 'practice';
  html('#pause', `<div class="pause-box">
    <div class="logo small"><span>FPS</span> SURF</div>
    <div class="dim">${esc(game.map ? game.map.display_name : '')} · ${esc(game.room || '')}</div>
    <button class="btn primary big" id="p-resume">${t('resume')}</button>
    ${practice ? `<button class="btn" id="p-maps">${t('choose')}</button>` : `
      <button class="btn" id="p-spec">${game.spectator ? t('joinSurf') : t('spectateMode')}</button>
      ${game.voting !== false ? `<button class="btn" id="p-rtv" ${v && v.state !== 'playing' ? 'disabled' : ''}>${t('rtv')} ${v && v.rtv ? `(${v.rtv}/${v.needed})` : ''}</button>` : ''}`}
    ${app.roomCode ? `<div class="invite-row"><div class="dim small">👥 ${t('inviteHint')}</div>
      <div class="row"><input id="p-link" readonly value="${esc(sdk.inviteLink(app.roomCode))}"><button class="btn" id="p-copy">${t('copy')}</button></div></div>` : ''}
    <div class="row"><button class="btn" id="p-vault">🔓 ${t('vault')}</button><button class="btn" id="p-inv">${t('inventory')}</button></div>
    <div class="row"><button class="btn" id="p-lb">🏆 ${t('leaderboard')}</button><button class="btn ghost" id="p-settings">⚙ ${t('settings')}</button></div>
    ${sensRow()}
    <button class="btn ghost" id="p-leave">${t('leave')}</button>
    <button class="link-btn" id="p-privacy">${t('privacy')}</button>
  </div>`);
  bindSens($('#pause'));
  const bind = (id, f) => { const b = $('#' + id); if (b) b.onclick = () => { audio.play('click'); f(); }; };
  bind('p-resume', () => { show('#pause', false); game.input.lock(); sdk.gameplayStart(); });
  bind('p-spec', () => { game.setSpectate(!game.spectator); show('#pause', false); game.input.lock(); });
  bind('p-rtv', () => { game.requestRtv(); show('#pause', false); game.input.lock(); });
  bind('p-maps', () => openPanel('maps'));
  bind('p-vault', () => openPanel('vault'));
  bind('p-inv', () => openPanel('inventory'));
  bind('p-settings', () => openPanel('settings'));
  bind('p-lb', () => openPanel('leaderboard'));
  bind('p-leave', () => leaveGame());
  bind('p-copy', () => copyInvite());
  bind('p-privacy', () => openPanel('privacy'));
}

async function copyInvite() {
  const input = $('#p-link');
  const link = sdk.inviteLink(app.roomCode);
  let ok = false;
  try { await navigator.clipboard.writeText(link); ok = true; } catch (e) { /* clipboard blocked in the iframe */ }
  if (!ok && input) { try { input.select(); ok = document.execCommand('copy'); } catch (e) { /* */ } }
  if (input) input.select();
  hud.feed(ok ? t('inviteCopied') : link, 'pb');
}

game.input.onLockChange = (locked) => {
  if (app.state !== 'game' || app.adBreak) return;
  if (locked) { show('#pause', false); show('#click-to-play', false); show('#mouse-hint', false); sdk.gameplayStart(); }
  else { sdk.gameplayStop(); show('#scoreboard', false); showPause(true); }
};

$('#click-to-play').onclick = () => { audio.ensure(); show('#click-to-play', false); game.input.lock(); };
canvas.addEventListener('click', () => { if (app.state === 'game' && !game.input.locked && !app.panel && $('#pause').classList.contains('hidden')) game.input.lock(); });

window.addEventListener('keydown', (e) => {
  if (app.state !== 'game') return;
  if (e.code === 'Tab') { e.preventDefault(); show('#scoreboard', true); }
  // ESC opens the menu also while only the keyboard is in use (no captured mouse yet)
  if (e.code === 'Escape' && !game.input.locked && !app.panel && !chat.open) {
    const open = $('#pause').classList.contains('hidden');
    if (open) { sdk.gameplayStop(); showPause(true); } else { show('#pause', false); sdk.gameplayStart(); }
  }
});
window.addEventListener('keyup', (e) => { if (e.code === 'Tab') show('#scoreboard', false); });

// one guarded timer for every "back to the menu" case (cleared when a new game starts)
function leaveSoon(ms) {
  clearTimeout(app.leaveTimer);
  app.leaveTimer = setTimeout(() => { if (app.state === 'game' && !app.starting) leaveGame(); }, ms);
}
game.on('disconnected', () => {
  if (app.state !== 'game' || app.starting) return; // startGame handles failures while joining
  hud.feed(t('connLost'), 'record');
  leaveSoon(1200);
});
game.on('mismatch', () => {
  // map changed mid-session to geometry this client does not have: continue offline
  if (app.state !== 'game' || app.starting) return;
  app.online = false;
  app.outdated = true;
  startGame(app.playMode || 'public', false);
});
game.on('servermsg', (m) => {
  if (m.t === 'full') hud.feed('Server is full', 'record');
  if (m.t === 'kicked') { hud.feed(m.text || 'Disconnected', 'record'); leaveSoon(1500); }
});
// touch controls follow surf <-> spectate switches made from the pause menu
game.on('roster', () => { if (app.state === 'game' && isTouchOnly()) show('#touch-ui', !game.spectator); });
game.on('vote', () => { if (!$('#pause').classList.contains('hidden')) showPause(true); });
// XP for every completion; every 10th level brings a free crate (no ad)
game.on('xp', (m) => {
  account.xp = m.xp;
  account.freeCrates = m.freeCrates;
  hud.xpGain(m);
  if (m.newCrates > 0) showFreeCrate();
});
function showFreeCrate() {
  show('#free-crate', true);
  html('#free-crate', `<div><b>🎁 ${t('freeCrateTitle')}</b></div><div class="dim small">${t('freeCrateText')}</div>
    <button class="btn primary" id="fc-open">${t('openFreeNow')}</button><button class="btn ghost small" id="fc-later">${t('later')}</button>`);
  $('#fc-open').onclick = () => { show('#free-crate', false); openPanel('vault'); vault.startOpen(true); };
  $('#fc-later').onclick = () => show('#free-crate', false);
  setTimeout(() => show('#free-crate', false), 15000);
}
// CrazyGames: a completed map is a moment of celebration
game.on('finish', () => {
  sdk.happytime();
  // game completion for CrazyGames: share of the maps finished at least once on this device
  try {
    const done = new Set(JSON.parse(localStorage.getItem('gz.completed') || '[]'));
    if (game.mapId) done.add(game.mapId);
    localStorage.setItem('gz.completed', JSON.stringify([...done]));
    sdk.reportCompletion((MAP_LIST.filter((m) => done.has(m.id)).length / MAP_LIST.length) * 100);
  } catch (e) { /* storage blocked */ }
});
game.on('mapchange', async () => {
  // natural break between maps: the only place a midgame ad is requested (capped to 1 per 3 min)
  if (sdk.adsDisabled || performance.now() - app.lastMidAd < 180000 || !sdk.available) return;
  if (app.state !== 'game' || app.panel || !$('#pause').classList.contains('hidden')) return; // not over a menu
  app.lastMidAd = performance.now();
  app.adBreak = true; // the mouse is released for the ad without opening the pause menu
  sdk.gameplayStop();
  game.input.unlock();
  await sdk.requestAd('midgame');
  app.adBreak = false;
  if (app.state !== 'game') return;
  sdk.gameplayStart();
  // keyboard play continues at once; the mouse is captured again with one click
  if (!isTouchOnly()) { html('#mouse-hint', t('mouseHint')); show('#mouse-hint', true); }
});

// background tab: no sound; WebGL context loss (GPU reset, low memory on phones): reload cleanly
document.addEventListener('visibilitychange', () => audio.setHidden(document.hidden));
canvas.addEventListener('webglcontextlost', (e) => { e.preventDefault(); show('#loading', true); html('#loading', `<div class="spinner"></div><div>${t('connecting')}</div>`); });
canvas.addEventListener('webglcontextrestored', () => location.reload());

// phones and tablets: touch zones, a menu button and a landscape hint
if (isTouchOnly()) {
  document.body.classList.add('touch');
  $('.tz-look').textContent = t('lookZone');
  $('#touch-menu').onclick = () => { audio.ensure(); sdk.gameplayStop(); showPause(true); };
  const rotate = () => { show('#rotate-hint', innerHeight > innerWidth * 1.1); html('#rotate-hint', `📱↻<br>${t('rotate')}`); };
  window.addEventListener('resize', rotate);
  rotate();
}

// keyboard play is live whenever nothing else (menu, panel, chat input) has the keys
game.input.canPlay = () => app.state === 'game' && !app.panel && $('#pause').classList.contains('hidden') && !chat.open;

// ------------------------------------------------------------------ boot
async function boot() {
  await sdk.init(); // the SDK must be initialised before any other SDK call
  sdk.loadingStart();
  const health = await probeServer(app.serverUrl);
  app.online = !!health;
  app.health = health;
  account.refresh();
  renderMenu();
  // CrazyGames: the game starts right away - straight into the public server (ESC opens the menu).
  // Opened from an invite link: straight into the friend's room. Instant multiplayer (party leader
  // from the CrazyGames UI): straight into a new joinable party room with the invite button shown.
  const invite = sdk.inviteRoom();
  if (app.online && invite) await startGame('public', false, undefined, true, invite);
  else if (app.online && sdk.instantMultiplayer) await startGame('party', false, undefined, true);
  else await startGame('public', false, undefined, true);
  // invite accepted while the game is already running
  sdk.onJoinRoom((code) => { if (app.online && code !== app.roomCode) startGame('public', false, undefined, false, code); });
  setInterval(async () => {
    if (app.state !== 'menu' || !app.serverUrl) return;
    const h = await probeServer(app.serverUrl);
    const up = !!h && !app.outdated; // an outdated server stays unused for this session
    const changed = up !== app.online || (h && app.health && h.players !== app.health.players);
    app.online = up; app.health = h;
    if (changed && app.state === 'menu' && !app.panel) renderMenu();
  }, 15000);
  window.addEventListener('gz-auth', () => { account.closeMenuConn(); account.refresh(); renderMenu(); });
  window.gz = { game, app, account, openPanel, showPause }; // handy for debugging / automated tests
  window.gzVault = vault;
}

boot();
