// localStorage implementation of the room store, used only for offline play.

export class LocalStore {
  constructor(prefix = 'gz.local.') {
    this.prefix = prefix;
    this.mem = new Map(); // fallback when storage is blocked
  }

  _get(k) {
    try {
      const v = localStorage.getItem(this.prefix + k);
      return v ? JSON.parse(v) : this.mem.get(k) ?? null;
    } catch (e) {
      return this.mem.get(k) ?? null;
    }
  }

  _set(k, v) {
    this.mem.set(k, v);
    try { localStorage.setItem(this.prefix + k, JSON.stringify(v)); } catch (e) { /* in-memory only */ }
  }

  load(key) { return this._get('p.' + key); }
  save(key, profile) { this._set('p.' + key, profile); }
  loadRecords(mapId) { return this._get('r.' + mapId) || []; }
  saveRecords(mapId, list) { this._set('r.' + mapId, list.slice(0, 50)); }
  loadGhost(key) { return this._get('g.' + key); }
  saveGhost(key, ghost) { this._set('g.' + key, ghost); }
}
