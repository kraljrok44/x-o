// CrazyGames SDK v3 wrapper with a local fallback.
// Rewarded video ads open crates; a midgame ad can play at the natural break of a map change.
// When the SDK is missing (local development, self hosting) a short simulated ad is shown
// so the whole flow stays testable.

import { audio } from './audio.js';

// One build for both CrazyGames launch stages. During a Basic launch the SDK answers every ad
// request with the adError code 'adsDisabledBasicLaunch': the player is then entitled to the reward
// without an ad. In a Full launch only a finished video rewards; any other error (unfilled, adblock,
// closed early, SDK blocked) gives nothing.
const BASIC_LAUNCH_CODE = 'adsDisabledBasicLaunch';
const isBasicLaunchError = (err) => {
  if (!err) return false;
  if (err.code === BASIC_LAUNCH_CODE) return true;
  try { return JSON.stringify(err).includes(BASIC_LAUNCH_CODE) || String(err.message || err).includes(BASIC_LAUNCH_CODE); } catch (e) { return false; }
};
const LOCAL_DEV = typeof location !== 'undefined' && (location.protocol === 'file:' || /^(localhost|127\.0\.0\.1)$/.test(location.hostname));

class SDKWrapper {
  constructor() {
    this.cg = null;
    this.env = 'none';
    this.user = null;
    this.adPlaying = false;
    this.gameplay = false;
    this.adsDisabled = false; // set once the SDK reports a Basic launch
    this.chatDisabled = false; // CrazyGames setting: no chat for this player
    this.gm = false; // GameMonetize build: ads through its sdk.showBanner(), no accounts
    this.gmPause = null;
  }

  /** Accounts only exist on CrazyGames. */
  get canLogin() { return !!this.cg && !this.gm; }

  async init() {
    if (window.SDK_OPTIONS && !window.CrazyGames) { this._initGameMonetize(); return; }
    const SDK = window.CrazyGames && window.CrazyGames.SDK;
    if (!SDK) return;
    try {
      await SDK.init();
      this.cg = SDK;
      this.env = SDK.environment; // 'crazygames' | 'local' | 'disabled'
      if (this.env === 'disabled') { this.cg = null; return; }
      try { this.user = await SDK.user.getUser(); } catch (e) { this.user = null; }
      try {
        const st = SDK.game.settings || {};
        audio.setPlatformMute(st.muteAudio);
        this.chatDisabled = !!st.disableChat;
        SDK.game.addSettingsChangeListener((n) => {
          audio.setPlatformMute(n && n.muteAudio);
          // CrazyGames can switch chat off for a player (e.g. younger users): respect it at once
          const off = !!(n && n.disableChat);
          if (off !== this.chatDisabled) { this.chatDisabled = off; window.dispatchEvent(new Event('gz-chat-policy')); }
        });
      } catch (e) { /* older sdk */ }
      try { SDK.user.addAuthListener((u) => { this.user = u; window.dispatchEvent(new CustomEvent('gz-auth', { detail: u })); }); } catch (e) { /* older sdk */ }
    } catch (e) {
      console.warn('CrazyGames SDK init failed', e);
      this.cg = null;
    }
  }

  // GameMonetize: index.html defines SDK_OPTIONS.onEvent, which forwards here. A video ad pauses the
  // game (mute) and SDK_GAME_START says it is over.
  _initGameMonetize() {
    this.gm = true;
    window.__gmEvent = (a) => {
      const n = a && a.name;
      if (n === 'SDK_GAME_PAUSE') { audio.mute(true); this.gmPaused = true; if (this.gmOnPause) this.gmOnPause(); }
      else if (n === 'SDK_GAME_START') { audio.mute(false); this.gmPaused = false; if (this.gmOnDone) this.gmOnDone(); }
    };
  }

  get available() { return !!this.cg || this.gm; }

  loadingStart() { try { this.cg && this.cg.game.loadingStart(); } catch (e) { /* */ } }
  loadingStop() { try { this.cg && this.cg.game.loadingStop(); } catch (e) { /* */ } }
  gameplayStart() { if (this.gameplay) return; this.gameplay = true; try { this.cg && this.cg.game.gameplayStart(); } catch (e) { /* */ } }
  gameplayStop() { if (!this.gameplay) return; this.gameplay = false; try { this.cg && this.cg.game.gameplayStop(); } catch (e) { /* */ } }
  happytime() { try { this.cg && this.cg.game.happytime(); } catch (e) { /* */ } }

  // ---------------------------------------------------------------- multiplayer invites
  /** Room code this page was opened with (CrazyGames invite link, or ?room= when self hosted). */
  inviteRoom() {
    let code = null;
    try {
      const g = this.cg && this.cg.game;
      if (g) code = (g.inviteParams && g.inviteParams.roomId) || (g.getInviteParam && g.getInviteParam('roomId')) || null;
    } catch (e) { /* older sdk */ }
    if (!code) { try { code = new URLSearchParams(location.search).get('room'); } catch (e) { /* */ } }
    return code ? String(code).toLowerCase() : null;
  }

  /** CrazyGames asks the game to go straight into a joinable multiplayer room (party leader). */
  get instantMultiplayer() {
    try { const g = this.cg && this.cg.game; return !!(g && (g.isInstantMultiplayer || g.isInstantJoin)); } catch (e) { return false; }
  }

  inviteLink(code) {
    try { if (this.cg) { const l = this.cg.game.inviteLink({ roomId: code }); if (l) return l; } } catch (e) { /* */ }
    const u = new URL(location.href);
    u.searchParams.set('room', code);
    return u.toString();
  }

  /** CrazyGames' own invite button next to the game while the player is in an online room. */
  showInviteButton(code) {
    try { if (this.cg && this.cg.game.showInviteButton) this.cg.game.showInviteButton({ roomId: code }); } catch (e) { /* */ }
  }

  /** Tells CrazyGames which room the player is in and that friends can join it (or not). */
  updateRoom(code) {
    try {
      if (!this.cg || !this.cg.game.updateRoom) return;
      if (code) this.cg.game.updateRoom({ roomId: code, isJoinable: true, inviteParams: { roomId: code } });
      else this.cg.game.updateRoom({ isJoinable: false });
    } catch (e) { /* older sdk */ }
  }

  /** Share of the maps this player has finished at least once (0-100). */
  reportCompletion(pct) {
    try { if (this.cg && this.cg.game.reportGameCompletedPercentage) this.cg.game.reportGameCompletedPercentage(Math.max(0, Math.min(100, Math.round(pct)))); } catch (e) { /* */ }
  }

  hideInviteButton() {
    try { if (this.cg && this.cg.game.hideInviteButton) this.cg.game.hideInviteButton(); } catch (e) { /* */ }
  }

  /** Invite accepted while the game is already open. */
  onJoinRoom(cb) {
    try {
      if (this.cg && this.cg.game.addJoinRoomListener) {
        this.cg.game.addJoinRoomListener((p) => { const code = p && (p.roomId || (p.inviteParams && p.inviteParams.roomId)); if (code) cb(String(code).toLowerCase()); });
      }
    } catch (e) { /* older sdk */ }
  }

  async userToken() {
    if (!this.cg || !this.user) return null;
    try { return await this.cg.user.getUserToken(); } catch (e) { return null; }
  }

  async showAuthPrompt() {
    if (!this.cg) return null;
    try { this.user = await this.cg.user.showAuthPrompt(); } catch (e) { /* user closed it */ }
    return this.user;
  }

  /**
   * Resolves 'ok' when the video was watched, 'free' when ads are disabled for a Basic launch
   * (reward without an ad), 'error' otherwise (no reward).
   */
  requestAd(type) {
    if (this.adPlaying) return Promise.resolve('error');
    this.adPlaying = true;
    const done = (r) => { this.adPlaying = false; audio.mute(false); return r; };
    if (this.gm) return this._gmAd(done);
    if (!this.cg) {
      // the simulated ad exists only for local development; a blocked SDK on a portal = no reward
      if (LOCAL_DEV) return simulatedAd(type).then(done);
      return Promise.resolve(done('error'));
    }
    return new Promise((resolve) => {
      try {
        this.cg.ad.requestAd(type, {
          adStarted: () => audio.mute(true),
          adFinished: () => resolve(done('ok')),
          adError: (err) => {
            if (isBasicLaunchError(err)) {
              this.adsDisabled = true;
              window.dispatchEvent(new Event('gz-ads-disabled'));
              resolve(done('free'));
              return;
            }
            console.warn('ad error', err);
            resolve(done('error'));
          },
        });
      } catch (e) {
        resolve(done('error'));
      }
    });
  }
}

// GameMonetize has one ad type (showBanner). If an ad starts (SDK_GAME_PAUSE) the reward comes when it
// ends; if none is available within 4 s the player still gets the reward (nothing was blocked).
SDKWrapper.prototype._gmAd = function (done) {
  return new Promise((resolve) => {
    let started = false, timer = null;
    const finish = (r) => { clearTimeout(timer); this.gmOnPause = this.gmOnDone = null; audio.mute(false); resolve(done(r)); };
    this.gmOnPause = () => { started = true; clearTimeout(timer); timer = setTimeout(() => finish('ok'), 180000); };
    this.gmOnDone = () => finish('ok');
    timer = setTimeout(() => { if (!started) finish('free'); }, 4000);
    try {
      const g = window.sdk;
      if (g && typeof g.showBanner === 'function') g.showBanner(); else finish('free');
    } catch (e) { finish('free'); }
  });
};

function simulatedAd(type) {
  return new Promise((resolve) => {
    audio.mute(true);
    const el = document.createElement('div');
    el.className = 'sim-ad';
    const secs = type === 'rewarded' ? 5 : 3;
    el.innerHTML = `<div class="sim-ad-box"><div class="sim-ad-tag">AD</div><div class="sim-ad-title">Video ad (local simulation)</div>
      <div class="sim-ad-sub">On CrazyGames a real ${type} video plays here.</div><div class="sim-ad-count">${secs}</div>
      <button class="btn ghost sim-ad-skip">Cancel</button></div>`;
    document.body.appendChild(el);
    let left = secs;
    const iv = setInterval(() => {
      left--;
      el.querySelector('.sim-ad-count').textContent = String(Math.max(0, left));
      if (left <= 0) { clearInterval(iv); el.remove(); resolve('ok'); }
    }, 1000);
    el.querySelector('.sim-ad-skip').onclick = () => { clearInterval(iv); el.remove(); resolve('error'); };
  });
}

export const sdk = new SDKWrapper();
