// Persistent progress, settings, cosmetics, records and replay archive.
import { platform } from './platform.js';
import { DEFAULT_KEYS, DEFAULT_PAD } from './input.js';

const KEY = 'wingborne_save_v1';

export const DEFAULT_SETTINGS = {
  quality: 'auto', shadows: true, speedFx: true, motionBlur: true, shake: 1, fov: 70, hudRoute: true,
  master: 0.8, music: 0.5, sfx: 0.8, invert: false, smoothing: 1, view: 'chase',
  warn: { subtle: 30, strong: 15, critical: 5 }, keys: { ...DEFAULT_KEYS }, pad: { ...DEFAULT_PAD }, autoSpread: true,
};

function fresh() {
  return {
    v: 1, coins: 0, flights: 0, tutorialDone: false,
    owned: { suit: ['ember'], helmet: ['white'], chute: ['sunset'], trail: ['none'] },
    equip: { suit: 'ember', helmet: 'white', chute: 'sunset', trail: 'none' },
    missions: {}, records: {}, archive: [], settings: JSON.parse(JSON.stringify(DEFAULT_SETTINGS)),
    stats: { flightTime: 0, maxSpeed: 0, landings: 0, crashes: 0, gates: 0 },
  };
}

export const save = {
  data: fresh(),
  load() {
    try {
      const raw = platform.getItem(KEY);
      if (raw) {
        const d = JSON.parse(raw);
        const f = fresh();
        this.data = { ...f, ...d, owned: { ...f.owned, ...(d.owned || {}) }, equip: { ...f.equip, ...(d.equip || {}) }, stats: { ...f.stats, ...(d.stats || {}) } };
        this.data.settings = { ...f.settings, ...(d.settings || {}), warn: { ...f.settings.warn, ...((d.settings || {}).warn || {}) }, keys: { ...f.settings.keys, ...((d.settings || {}).keys || {}) }, pad: { ...f.settings.pad, ...((d.settings || {}).pad || {}) } };
        this.isNew = false;
        return;
      }
    } catch (e) { /* corrupted -> fresh */ }
    this.data = fresh();
    this.isNew = true;
  },
  write() {
    try {
      let s = JSON.stringify(this.data);
      // keep well under storage quotas
      while (s.length > 600000 && this.data.archive.length) { this.data.archive.pop(); s = JSON.stringify(this.data); }
      platform.setItem(KEY, s);
    } catch (e) { /* ignore */ }
  },
  reset() { const st = this.data.settings; this.data = fresh(); this.data.settings = st; this.write(); },
};
