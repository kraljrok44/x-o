// GLIDEZONE dedicated server: serves the built client (dist/) and hosts the multiplayer room
// over WebSocket at /ws. Usage: PORT=8080 DATA_DIR=./data node server/index.js

import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { WebSocketServer } from 'ws';
import { Room } from '../shared/room.js';
import { NET } from '../shared/config.js';
import { MAP_LIST, isMapId } from '../shared/maps/index.js';
import { FileStore } from './store-file.js';
import { authenticate } from './auth.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const DIST = path.join(ROOT, 'dist');
const PORT = Number(process.env.PORT || NET.defaultPort);
const DATA = process.env.DATA_DIR || path.join(ROOT, 'data');
const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS || '').split(',').map((s) => s.trim()).filter(Boolean);

const store = new FileStore(DATA);
const log = (...a) => console.log(new Date().toISOString(), ...a);

// Public rooms (map voting, up to NET.maxPlayersPerRoom each; a new one opens when all are full)
// and private practice rooms (one player, free map choice, no voting).
const publicRooms = [];
const practiceRooms = new Set();
function newPublicRoom() {
  const r = new Room({
    store, auth: authenticate, log,
    name: `${process.env.ROOM_NAME || 'GLIDEZONE'} #${publicRooms.length + 1}`,
    startMap: process.env.START_MAP || MAP_LIST[0].id,
  });
  publicRooms.push(r);
  return r;
}
newPublicRoom();
function publicRoomWithSpace() {
  return publicRooms.find((r) => r.playerCount() < r.maxPlayers) || newPublicRoom();
}
const room = publicRooms[0];

const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml', '.json': 'application/json', '.ico': 'image/x-icon',
};

const server = http.createServer((req, res) => {
  const url = new URL(req.url, 'http://x');
  if (url.pathname === '/health') {
    res.writeHead(200, { 'content-type': 'application/json', 'access-control-allow-origin': '*' });
    res.end(JSON.stringify({
      ok: true, players: publicRooms.reduce((n, r) => n + r.playerCount(), 0), map: room.map.id,
      rooms: publicRooms.map((r) => ({ name: r.name, players: r.playerCount(), map: r.map.id })), practice: practiceRooms.size,
    }));
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
  let target = null, client = null;
  const leave = () => {
    if (!target) return;
    target.removeClient(client);
    if (practiceRooms.has(target)) practiceRooms.delete(target);
    target = null;
  };
  ws.on('message', (data) => {
    let msg;
    try { msg = JSON.parse(data.toString()); } catch (e) { return; }
    if (!target) {
      if (!msg || msg.t !== 'hello') return;
      if (msg.mode === 'practice') {
        target = new Room({ store, auth: authenticate, log, voting: false, maxPlayers: 1, name: 'Practice', startMap: isMapId(msg.map) ? msg.map : MAP_LIST[0].id });
        practiceRooms.add(target);
      } else {
        target = publicRoomWithSpace();
      }
      client = target.addClient(conn);
    }
    if (msg.t === 'practice_map') {
      if (practiceRooms.has(target) && isMapId(msg.id)) target.forceMap(msg.id);
      return;
    }
    target.handleMessage(client, msg);
  });
  ws.on('close', leave);
  ws.on('error', leave);
});

// Fixed-step loop: run every 4 ms and let every room catch up in 10 ms ticks.
setInterval(() => {
  const now = performance.now();
  for (const r of publicRooms) r.advance(now);
  for (const r of practiceRooms) r.advance(now);
}, 4);

server.listen(PORT, () => {
  console.log(`GLIDEZONE server on http://localhost:${PORT}  (ws path /ws, data ${DATA})`);
});
