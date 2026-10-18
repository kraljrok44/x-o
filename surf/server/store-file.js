// Durable JSON file store. Writes are synchronous (temp file + rename) so a crate result
// is on disk before the client is told about it (crate spec 6.2 / 6.4).

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

export class FileStore {
  constructor(dir) {
    this.dir = dir;
    fs.mkdirSync(path.join(dir, 'players'), { recursive: true });
    fs.mkdirSync(path.join(dir, 'records'), { recursive: true });
    fs.mkdirSync(path.join(dir, 'ghosts'), { recursive: true });
    this.cache = new Map();
  }

  _file(key) {
    const h = crypto.createHash('sha256').update(key).digest('hex').slice(0, 40);
    return path.join(this.dir, 'players', h + '.json');
  }

  _write(file, data) {
    const tmp = file + '.' + process.pid + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(data));
    fs.renameSync(tmp, file);
  }

  load(key) {
    if (this.cache.has(key)) return structuredClone(this.cache.get(key));
    try {
      const data = JSON.parse(fs.readFileSync(this._file(key), 'utf8'));
      this.cache.set(key, data);
      return structuredClone(data);
    } catch (e) {
      return null;
    }
  }

  save(key, profile) {
    this._write(this._file(key), profile);
    this.cache.set(key, structuredClone(profile));
    if (this.cache.size > 5000) this.cache.delete(this.cache.keys().next().value);
  }

  loadRecords(mapId) {
    try {
      return JSON.parse(fs.readFileSync(path.join(this.dir, 'records', mapId.replace(/[^a-z0-9_]/g, '') + '.json'), 'utf8'));
    } catch (e) {
      return [];
    }
  }

  loadGhost(key) {
    try { return JSON.parse(fs.readFileSync(path.join(this.dir, 'ghosts', key.replace(/[^a-z0-9_]/g, '') + '.json'), 'utf8')); } catch (e) { return null; }
  }

  saveGhost(key, ghost) {
    this._write(path.join(this.dir, 'ghosts', key.replace(/[^a-z0-9_]/g, '') + '.json'), ghost);
  }

  saveRecords(mapId, list) {
    this._write(path.join(this.dir, 'records', mapId.replace(/[^a-z0-9_]/g, '') + '.json'), list);
  }
}
