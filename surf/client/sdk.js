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
  }

  async init() {
    const SDK = window.CrazyGames && window.CrazyGames.SDK;
    if (!SDK) return;
    try {
      await SDK.init();
      this.cg = SDK;
      this.env = SDK.environment; // 'crazygames' | 'local' | 'disabled'
      if (this.env === 'disabled') { this.cg = null; return; }
      try { this.user = await SDK.user.getUser(); } catch (e) { this.user = null; }
      try {
        audio.setPlatformMute(SDK.game.settings && SDK.game.settings.muteAudio);
        SDK.game.addSettingsChangeListener((st) => audio.setPlatformMute(st && st.muteAudio));
      } catch (e) { /* older sdk */ }
      try { SDK.user.addAuthListener((u) => { this.user = u; window.dispatchEvent(new CustomEvent('gz-auth', { detail: u })); }); } catch (e) { /* older sdk */ }
    } catch (e) {
      console.warn('CrazyGames SDK init failed', e);
      this.cg = null;
    }
  }

  get available() { return !!this.cg; }

  loadingStart() { try { this.cg && this.cg.game.loadingStart(); } catch (e) { /* */ } }
  loadingStop() { try { this.cg && this.cg.game.loadingStop(); } catch (e) { /* */ } }
  gameplayStart() { if (this.gameplay) return; this.gameplay = true; try { this.cg && this.cg.game.gameplayStart(); } catch (e) { /* */ } }
  gameplayStop() { if (!this.gameplay) return; this.gameplay = false; try { this.cg && this.cg.game.gameplayStop(); } catch (e) { /* */ } }
  happytime() { try { this.cg && this.cg.game.happytime(); } catch (e) { /* */ } }

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
