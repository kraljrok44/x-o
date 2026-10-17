// Player settings, persisted per browser (a convenience, never authoritative data).

const KEY = 'gz.settings.v1';

export const DEFAULTS = {
  sensitivity: 1.6,     // degrees per 100 px (scaled internally)
  invertY: false,
  fov: 100,
  master: 0.8,
  sfx: 0.8,
  ui: 0.7,
  bloom: true,
  viewBob: true,
  reduceMotion: false,  // disables camera tilt, crate shake, flashes
  hudScale: 1,
  showKeys: true,
  showSpeedVector: false,
  quality: 'high',      // 'low' | 'high'
  lang: '',
  name: '',
};

function read() {
  try { return JSON.parse(localStorage.getItem(KEY) || '{}'); } catch (e) { return {}; }
}

export const settings = { ...DEFAULTS, ...read() };

export function saveSettings(patch) {
  Object.assign(settings, patch);
  try { localStorage.setItem(KEY, JSON.stringify(settings)); } catch (e) { /* storage blocked */ }
  window.dispatchEvent(new CustomEvent('gz-settings', { detail: settings }));
}

/** Stable random guest token (identity for the server-side inventory). */
export function guestToken() {
  const k = 'gz.token.v1';
  let t = null;
  try { t = localStorage.getItem(k); } catch (e) { /* */ }
  if (!t || !/^[a-f0-9]{32,64}$/.test(t)) {
    const b = new Uint8Array(16);
    crypto.getRandomValues(b);
    t = [...b].map((x) => x.toString(16).padStart(2, '0')).join('');
    try { localStorage.setItem(k, t); } catch (e) { /* */ }
  }
  return t;
}
