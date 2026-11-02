// Platform layer: CrazyGames SDK v3, GameMonetize SDK, or standalone. The game works without any SDK.
// window.__PLATFORM__ ('crazygames' | 'gamemonetize' | 'none') and window.__ADS__ are injected by build.mjs.

const P = {
  name: (typeof window !== 'undefined' && window.__PLATFORM__) || 'none',
  adsAllowed: typeof window !== 'undefined' && window.__ADS__ === true,
  cg: null, env: 'disabled', inGameplay: false, adblock: false,
  muteFromSdk: false, onMute: null, onPause: null, user: null, onUser: null,
  locale: (typeof navigator !== 'undefined' && navigator.language) || 'en',
};
const safe = (fn, d) => { try { return fn(); } catch (e) { return d; } };

export const platform = {
  get name() { return P.name; },
  get adsEnabled() { return P.adsAllowed && !P.adblock && (P.name === 'gamemonetize' || (P.name === 'crazygames' && P.env !== 'disabled')); },
  get rewardedAvailable() { return P.name === 'crazygames' && this.adsEnabled; },
  get user() { return P.user; },
  get userAvailable() { return P.name === 'crazygames' && P.env !== 'disabled' && safe(() => P.cg.user.isUserAccountAvailable, false); },
  get locale() { return P.locale; },
  set onMute(f) { P.onMute = f; if (f) f(P.muteFromSdk); },
  set onUser(f) { P.onUser = f; },
  set onPause(f) { P.onPause = f; },

  async init() {
    if (P.name === 'crazygames' && window.CrazyGames && window.CrazyGames.SDK) {
      try {
        P.cg = window.CrazyGames.SDK;
        await P.cg.init();
        P.env = P.cg.environment;
        if (P.env === 'disabled') return;
        const st = P.cg.game.settings || {};
        P.muteFromSdk = !!st.muteAudio;
        P.cg.game.addSettingsChangeListener((s) => { P.muteFromSdk = !!s.muteAudio; if (P.onMute) P.onMute(P.muteFromSdk); });
        P.locale = safe(() => P.cg.user.systemInfo.locale, P.locale) || P.locale;
        if (P.adsAllowed) { try { P.adblock = await P.cg.ad.hasAdblock(); } catch (e) { P.adblock = false; } }
        try {
          if (P.cg.user.isUserAccountAvailable) {
            P.user = await P.cg.user.getUser();
            P.cg.user.addAuthListener((u) => { P.user = u; if (P.onUser) P.onUser(u); });
          }
        } catch (e) { P.user = null; }
      } catch (e) { P.env = 'disabled'; }
    } else if (P.name === 'gamemonetize') {
      P.env = 'gamemonetize';
      // events come from window.SDK_OPTIONS.onEvent (see index.html)
      window.__gmEvent = (name) => {
        if (name === 'SDK_GAME_PAUSE') { P._gmPaused = true; if (P.onPause) P.onPause(true); }
        if (name === 'SDK_GAME_START') { P._gmPaused = false; if (P.onPause) P.onPause(false); if (P._gmResolve) { const r = P._gmResolve; P._gmResolve = null; r(); } }
      };
    }
  },

  loadingStart() { if (P.name === 'crazygames' && P.env !== 'disabled') safe(() => P.cg.game.loadingStart()); },
  loadingStop() { if (P.name === 'crazygames' && P.env !== 'disabled') safe(() => P.cg.game.loadingStop()); },
  gameplayStart() {
    if (P.inGameplay) return; P.inGameplay = true;
    if (P.name === 'crazygames' && P.env !== 'disabled') safe(() => P.cg.game.gameplayStart());
  },
  gameplayStop() {
    if (!P.inGameplay) return; P.inGameplay = false;
    if (P.name === 'crazygames' && P.env !== 'disabled') safe(() => P.cg.game.gameplayStop());
  },
  happytime() { if (P.name === 'crazygames' && P.env !== 'disabled') safe(() => P.cg.game.happytime()); },
  progress(pct) { if (P.name === 'crazygames' && P.env !== 'disabled') safe(() => P.cg.game.reportGameCompletedPercentage && P.cg.game.reportGameCompletedPercentage(Math.round(pct))); },
  setContext(ctx) { if (P.name === 'crazygames' && P.env !== 'disabled') safe(() => P.cg.game.setGameContext && P.cg.game.setGameContext(ctx)); },
  showAuthPrompt() { if (this.userAvailable) safe(() => P.cg.user.showAuthPrompt().then((u) => { P.user = u; if (P.onUser) P.onUser(u); }).catch(() => {})); },

  // Midgame ad at a logical break. Resolves when finished or failed. hooks: {started()}
  midgame(hooks = {}) {
    return new Promise((resolve) => {
      if (!this.adsEnabled) return resolve(false);
      if (P.name === 'crazygames') {
        try {
          P.cg.ad.requestAd('midgame', {
            adStarted: () => hooks.started && hooks.started(),
            adFinished: () => resolve(true),
            adError: () => resolve(false),
          });
        } catch (e) { resolve(false); }
      } else if (P.name === 'gamemonetize') {
        if (typeof window.sdk === 'undefined' || !window.sdk.showBanner) return resolve(false);
        P._gmResolve = () => resolve(true);
        let started = false;
        const prevPause = P.onPause;
        P.onPause = (p) => { if (p && !started) { started = true; hooks.started && hooks.started(); } if (prevPause) prevPause(p); };
        safe(() => window.sdk.showBanner());
        // if no ad shows up quickly, continue
        setTimeout(() => { if (!started && P._gmResolve) { P._gmResolve = null; P.onPause = prevPause; resolve(false); } }, 1800);
        setTimeout(() => { if (P._gmResolve) { P._gmResolve = null; resolve(false); } P.onPause = prevPause; }, 45000);
      } else resolve(false);
    });
  },
  rewarded(hooks = {}) {
    return new Promise((resolve) => {
      if (!this.rewardedAvailable) return resolve(false);
      try {
        P.cg.ad.requestAd('rewarded', {
          adStarted: () => hooks.started && hooks.started(),
          adFinished: () => resolve(true),
          adError: () => resolve(false),
        });
      } catch (e) { resolve(false); }
    });
  },

  // Storage: CrazyGames Data module when available, else localStorage.
  getItem(k) {
    if (P.name === 'crazygames' && P.env !== 'disabled') { const v = safe(() => P.cg.data.getItem(k), null); if (v != null) return v; }
    return safe(() => window.localStorage.getItem(k), null);
  },
  setItem(k, v) {
    if (P.name === 'crazygames' && P.env !== 'disabled') { if (safe(() => { P.cg.data.setItem(k, v); return true; }, false)) return; }
    safe(() => window.localStorage.setItem(k, v));
  },
};
