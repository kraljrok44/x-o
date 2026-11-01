// GLIDEZONE dedicated server: serves the built client (dist/) and hosts the multiplayer room
// over WebSocket at /ws. Usage: PORT=8081 HOST=127.0.0.1 DATA_DIR=./data node server/index.js
// Behind a reverse proxy (Caddy) keep HOST=127.0.0.1 so the port is never exposed directly.

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
import { createCrazyLeaderboard } from './cg-leaderboard.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const DIST = path.join(ROOT, 'dist');
const PORT = Number(process.env.PORT || NET.defaultPort);
const HOST = process.env.HOST || '127.0.0.1';
const DATA = process.env.DATA_DIR || path.join(ROOT, 'data');
const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS || '').split(',').map((s) => s.trim()).filter(Boolean);

const store = new FileStore(DATA);
const log = (...a) => console.log(new Date().toISOString(), ...a);
const crazyBoard = createCrazyLeaderboard({ log });
const onPoints = (key, points) => crazyBoard.submit(key, points);
// a knife unlock is announced in the chat of every online room (wherever the crate was opened)
const onAnnounce = (text, kind) => { for (const r of [...publicRooms, ...partyRooms.values()]) r.chatSystem(text, kind); };

// Public rooms (map voting, up to NET.maxPlayersPerRoom each; a new one opens when all are full),
// party rooms (friends joining through an invite link, same rules as public rooms) and private
// practice rooms (one player, free map choice, no voting). Every online room has an invite code.
const publicRooms = [];
const partyRooms = new Map(); // code -> Room, closed when the last player leaves
const practiceRooms = new Set();
const CODE_RE = /^[a-z0-9]{2,12}$/;
function newPublicRoom() {
  const n = publicRooms.length + 1;
  const r = new Room({
    store, auth: authenticate, log, onPoints, onAnnounce, code: `p${n}`,
    name: `${process.env.ROOM_NAME || 'FPS Surf'} #${n}`,
    startMap: process.env.START_MAP || MAP_LIST[0].id,
  });
  publicRooms.push(r);
  return r;
}
newPublicRoom();
function publicRoomWithSpace() {
  return publicRooms.find((r) => r.playerCount() < r.maxPlayers) || newPublicRoom();
}
function newPartyRoom(code) {
  while (!code || partyRooms.has(code) || code.startsWith('p')) code = 'f' + Math.random().toString(36).slice(2, 8);
  const r = new Room({ store, auth: authenticate, log, onPoints, onAnnounce, code, name: `Party ${code.toUpperCase()}`, startMap: MAP_LIST[0].id });
  partyRooms.set(code, r);
  return r;
}
/** Room for an invite code: the room itself while it has space, a fresh party room for an expired party code. */
function roomForCode(code) {
  code = typeof code === 'string' ? code.toLowerCase() : '';
  if (!CODE_RE.test(code)) return publicRoomWithSpace();
  const r = publicRooms.find((x) => x.code === code) || partyRooms.get(code);
  if (r) return r.playerCount() < r.maxPlayers ? r : publicRoomWithSpace();
  return code.startsWith('p') ? publicRoomWithSpace() : newPartyRoom(code);
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
      ok: true, players: publicRooms.reduce((n, r) => n + r.playerCount(), 0), map: room.map.id, mh: room.map.hash,
      rooms: publicRooms.map((r) => ({ name: r.name, players: r.playerCount(), map: r.map.id })), parties: partyRooms.size, practice: practiceRooms.size,
    }));
    return;
  }
  let p;
  try { p = decodeURIComponent(url.pathname); } catch (e) { res.writeHead(400); res.end(); return; }
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
  verifyClient: (info) => {
    if (!ALLOWED_ORIGINS.length) return true;
    let host = '';
    try { host = new URL(info.origin || '').hostname; } catch (e) { return false; }
    return ALLOWED_ORIGINS.some((o) => host === o || host.endsWith('.' + o));
  },
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
    if (target.code && partyRooms.get(target.code) === target && target.clients.size === 0) partyRooms.delete(target.code);
    target = null;
  };
  ws.on('message', (data) => {
    let msg;
    try { msg = JSON.parse(data.toString()); } catch (e) { return; }
    if (!msg || typeof msg !== 'object' || Array.isArray(msg)) return;
    if (!target) {
      if (msg.t !== 'hello') return;
      if (msg.mode === 'practice') {
        target = new Room({ store, auth: authenticate, log, onPoints, onAnnounce, voting: false, maxPlayers: 1, name: 'Practice', startMap: isMapId(msg.map) ? msg.map : MAP_LIST[0].id });
        practiceRooms.add(target);
      } else if (msg.mode === 'party') {
        target = newPartyRoom();
      } else if (msg.room) {
        target = roomForCode(msg.room);
      } else {
        target = publicRoomWithSpace();
      }
      client = target.addClient(conn);
    }
    if (msg.t === 'practice_map') {
      try { if (practiceRooms.has(target) && isMapId(msg.id)) target.forceMap(msg.id); } catch (e) { log('practice_map error', e.message); }
      return;
    }
    Promise.resolve(target.handleMessage(client, msg)).catch((e) => log('message error', e && e.message));
  });
  ws.on('close', leave);
  ws.on('error', leave);
});

// Fixed-step loop: run every 4 ms and let every room catch up in 10 ms ticks.
// One failing room (e.g. a disk error while saving) never stops the others.
const advance = (r, now) => { try { r.advance(now); } catch (e) { log('room tick error', r.name, e && e.stack); } };
setInterval(() => {
  const now = performance.now();
  for (const r of publicRooms) advance(r, now);
  for (const r of partyRooms.values()) advance(r, now);
  for (const r of practiceRooms) advance(r, now);
}, 4);

// last line of defence: log and keep serving instead of dropping every player
process.on('uncaughtException', (e) => log('uncaught exception', e && e.stack));
process.on('unhandledRejection', (e) => log('unhandled rejection', e && (e.stack || e)));

server.listen(PORT, HOST, () => {
  console.log(`GLIDEZONE server on http://${HOST}:${PORT}  (ws path /ws, data ${DATA})`);
  console.log(`CrazyGames leaderboard forwarding: ${crazyBoard.enabled ? 'on' : 'off (set CG_LEADERBOARD_API_KEY)'}`);
});
