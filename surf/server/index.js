// GLIDEZONE dedicated server: serves the built client (dist/) and hosts the multiplayer room
// over WebSocket at /ws. Usage: PORT=8080 DATA_DIR=./data node server/index.js

import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { WebSocketServer } from 'ws';
import { Room } from '../shared/room.js';
import { NET } from '../shared/config.js';
import { MAP_LIST } from '../shared/maps/index.js';
import { FileStore } from './store-file.js';
import { authenticate } from './auth.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const DIST = path.join(ROOT, 'dist');
const PORT = Number(process.env.PORT || NET.defaultPort);
const DATA = process.env.DATA_DIR || path.join(ROOT, 'data');
const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS || '').split(',').map((s) => s.trim()).filter(Boolean);

const store = new FileStore(DATA);
const room = new Room({
  store,
  auth: authenticate,
  name: process.env.ROOM_NAME || 'GLIDEZONE #1',
  startMap: process.env.START_MAP || MAP_LIST[0].id,
  log: (...a) => console.log(new Date().toISOString(), ...a),
});

const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml', '.json': 'application/json', '.ico': 'image/x-icon',
};

const server = http.createServer((req, res) => {
  const url = new URL(req.url, 'http://x');
  if (url.pathname === '/health') {
    res.writeHead(200, { 'content-type': 'application/json', 'access-control-allow-origin': '*' });
    res.end(JSON.stringify({ ok: true, players: room.playerCount(), map: room.map.id }));
    return;
  }
  let p = decodeURIComponent(url.pathname);
  if (p === '/') p = '/index.html';
  const file = path.join(DIST, path.normalize(p));
  if (!file.startsWith(DIST)) { res.writeHead(403); res.end(); return; }
  fs.readFile(file, (err, data) => {
    if (err) { res.writeHead(404); res.end('Not found (did you run "npm run build"?)'); return; }
    res.writeHead(200, { 'content-type': MIME[path.extname(file)] || 'application/octet-stream' });
    res.end(data);
  });
});

const wss = new WebSocketServer({
  server,
  path: '/ws',
  maxPayload: 16 * 1024,
  verifyClient: (info) => !ALLOWED_ORIGINS.length || ALLOWED_ORIGINS.some((o) => (info.origin || '').endsWith(o)),
});

wss.on('connection', (ws) => {
  const conn = {
    send: (m) => { if (ws.readyState === 1) ws.send(JSON.stringify(m)); },
    close: () => ws.close(),
  };
  const client = room.addClient(conn);
  ws.on('message', (data) => {
    let msg;
    try { msg = JSON.parse(data.toString()); } catch (e) { return; }
    room.handleMessage(client, msg);
  });
  ws.on('close', () => room.removeClient(client));
  ws.on('error', () => room.removeClient(client));
});

// Fixed-step loop: run every 4 ms and let the room catch up in 10 ms ticks.
setInterval(() => room.advance(performance.now()), 4);

server.listen(PORT, () => {
  console.log(`GLIDEZONE server on http://localhost:${PORT}  (ws path /ws, data ${DATA})`);
});
