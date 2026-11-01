// Transports. Both expose: send(obj), onmessage(obj), onclose(), close().
// - WsTransport talks to the dedicated server.
// - LocalTransport runs the very same authoritative Room inside the browser (offline play).

import { Room } from '../shared/room.js';
import { LocalStore } from './store-local.js';

export function defaultServerUrl() {
  const q = new URLSearchParams(location.search).get('server');
  if (q) return q;
  if (window.GLIDEZONE_SERVER) return window.GLIDEZONE_SERVER;
  if (location.protocol === 'file:') return null;
  return (location.protocol === 'https:' ? 'wss://' : 'ws://') + location.host + '/ws';
}

export function httpFromWs(url) {
  return url.replace(/^ws/, 'http').replace(/\/ws$/, '');
}

export async function probeServer(url, timeoutMs = 2500) {
  if (!url) return null;
  try {
    const ctl = new AbortController();
    const to = setTimeout(() => ctl.abort(), timeoutMs);
    const r = await fetch(httpFromWs(url) + '/health', { signal: ctl.signal });
    clearTimeout(to);
    if (!r.ok) return null;
    return await r.json();
  } catch (e) {
    return null;
  }
}

export class WsTransport {
  constructor(url) {
    this.url = url;
    this.onmessage = () => {};
    this.onclose = () => {};
    this.bytesIn = 0;
  }

  open() {
    return new Promise((resolve, reject) => {
      const ws = (this.ws = new WebSocket(this.url));
      const to = setTimeout(() => { reject(new Error('timeout')); try { ws.close(); } catch (e) { /* */ } }, 5000);
      ws.onopen = () => { clearTimeout(to); resolve(this); };
      ws.onerror = () => { clearTimeout(to); reject(new Error('ws error')); };
      ws.onmessage = (ev) => {
        this.bytesIn += ev.data.length || 0;
        let m;
        try { m = JSON.parse(ev.data); } catch (e) { return; }
        this.onmessage(m);
      };
      ws.onclose = () => this.onclose();
    });
  }

  send(obj) {
    if (this.ws && this.ws.readyState === 1) this.ws.send(JSON.stringify(obj));
  }

  close() {
    this.onclose = () => {};
    try { this.ws.close(); } catch (e) { /* */ }
  }
}

let localRoom = null;
let localTimer = null;
const localStore = new LocalStore();

export class LocalTransport {
  constructor(opts = {}) {
    this.opts = opts;
    this.onmessage = () => {};
    this.onclose = () => {};
    this.bytesIn = 0;
  }

  async open() {
    if (!localRoom) {
      localRoom = new Room({ store: localStore, auth: (h) => ({ key: 'local', name: h.name }), voting: this.opts.voting !== false, startMap: this.opts.map, name: 'Offline' });
      localTimer = setInterval(() => localRoom.advance(performance.now()), 4);
    }
    localRoom.voting = this.opts.voting !== false;
    if (this.opts.map && localRoom.map.id !== this.opts.map) localRoom.forceMap(this.opts.map);
    const conn = {
      send: (m) => {
        const copy = JSON.parse(JSON.stringify(m));
        queueMicrotask(() => this.onmessage(copy));
      },
      close: () => this.onclose(),
    };
    this.client = localRoom.addClient(conn);
    this.room = localRoom;
    return this;
  }

  send(obj) {
    if (obj.t === 'practice_map') { localRoom.forceMap(obj.id); return; }
    const copy = JSON.parse(JSON.stringify(obj));
    queueMicrotask(() => localRoom && this.client && localRoom.handleMessage(this.client, copy));
  }

  close() {
    if (localRoom && this.client) localRoom.removeClient(this.client);
    this.client = null;
    if (localRoom && localRoom.playerCount() === 0) {
      clearInterval(localTimer);
      localRoom = null;
    }
  }
}

export { localStore };
