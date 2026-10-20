import test from 'node:test';
import assert from 'node:assert/strict';
import { Room } from '../shared/room.js';
import { GAME } from '../shared/config.js';

function memStore() {
  const m = new Map(), r = new Map();
  return {
    load: (k) => (m.has(k) ? structuredClone(m.get(k)) : null),
    save: (k, p) => m.set(k, structuredClone(p)),
    loadRecords: (id) => r.get(id) || [],
    saveRecords: (id, l) => r.set(id, l),
  };
}

function setup() {
  let now = 1_000_000;
  const room = new Room({ store: memStore(), auth: (h) => ({ key: 'k:' + h.token, name: h.name }), clock: () => now });
  const mk = (name, spectate = false) => {
    const inbox = [];
    const c = room.addClient({ send: (m) => inbox.push(m), close() {} });
    room.handleMessage(c, { t: 'hello', name, token: name, spectate });
    return { c, inbox, last: (t) => [...inbox].reverse().find((m) => m.t === t) };
  };
  return { room, mk, adv: (ms) => { now += ms; }, now: () => now };
}

const flush = () => new Promise((r) => setImmediate(r));

test('clients join, receive welcome and snapshots; spectators are not simulated', async () => {
  const { room, mk } = setup();
  const a = mk('Alice'), b = mk('Bob', true);
  await flush();
  assert.equal(a.last('welcome').map, room.map.id);
  assert.equal(a.last('welcome').mh, room.map.hash); // client refuses servers with other geometry
  assert.equal(b.last('welcome').spectator, true);
  room.handleMessage(a.c, { t: 'cmds', c: [[1, 1, 0, 0, 0, 0], [2, 1, 0, 0, 0, 0]] });
  for (let i = 0; i < 10; i++) room.tick();
  const snapA = a.last('s'), snapB = b.last('s');
  assert.equal(snapA.a, 2);
  assert.equal(snapA.p.length, 1); // only the surfer
  assert.equal(snapB.me, undefined);
});

test('rock the vote with 50% starts a vote, extend adds 5 minutes', async () => {
  const { room, mk, adv } = setup();
  const a = mk('A'), b = mk('B'), c = mk('C'), d = mk('D');
  await flush();
  room.handleMessage(a.c, { t: 'rtv' });
  assert.equal(room.vote.state, 'playing');
  room.handleMessage(b.c, { t: 'rtv' });
  assert.equal(room.vote.state, 'voting');
  assert.ok(c.last('vote_start'));
  const ext = room.vote.options.length - 1;
  for (const p of [a, b, c]) room.handleMessage(p.c, { t: 'vote', i: ext });
  room.handleMessage(d.c, { t: 'vote', i: 0 });
  const before = room.vote.mapEndsAt;
  adv(GAME.voteDurationSec * 1000);
  room.tick();
  assert.equal(room.vote.state, 'playing');
  assert.ok(room.vote.mapEndsAt >= before + GAME.extendSec * 1000);
  assert.ok(d.last('extend'));
});

test('crate request is answered with a committed result and is idempotent', async () => {
  const { room, mk } = setup();
  const a = mk('A');
  await flush();
  room.handleMessage(a.c, { t: 'crate', key: 'idem-key-0001' });
  const r1 = a.last('crate');
  assert.equal(r1.status, 'SUCCESS');
  room.handleMessage(a.c, { t: 'crate', key: 'idem-key-0001' });
  const r2 = a.last('crate');
  assert.equal(r2.collectible_id, r1.collectible_id);
  room.handleMessage(a.c, { t: 'equip', id: r1.collectible_id });
  assert.equal(a.last('inventory').equipped, r1.collectible_id);
});

test('map change after a vote reloads every player on the new map', async () => {
  const { room, mk, adv } = setup();
  const a = mk('A');
  await flush();
  room.handleMessage(a.c, { t: 'rtv' });
  room.handleMessage(a.c, { t: 'vote', i: 0 });
  const target = room.vote.options[0];
  adv(GAME.voteDurationSec * 1000); room.tick();
  adv(GAME.mapChangeDelaySec * 1000); room.tick();
  assert.equal(room.map.id, target);
  assert.equal(a.last('map').map, target);
});

test('leaderboard: all-time, weekly and points boards; CrazyGames forwarding only for CG accounts', async () => {
  const { submitTime, queryBoard, POINTS_BOARD, mapPoints } = await import('../shared/leaderboard.js');
  const { createCrazyLeaderboard } = await import('../server/cg-leaderboard.js');
  const store = memStore();
  const now = Date.UTC(2026, 9, 14, 12);
  submitTime(store, { key: 'g:a', name: 'A', mapId: 'surf_aurora_dawn', ticks: 4000, now });
  submitTime(store, { key: 'cg:42', name: 'B', mapId: 'surf_aurora_dawn', ticks: 3500, now });
  const r = submitTime(store, { key: 'g:a', name: 'A', mapId: 'surf_aurora_dawn', ticks: 4500, now }); // slower: no change
  assert.equal(r.allTime.improved, false);
  const all = queryBoard(store, 'surf_aurora_dawn', 'all', 'g:a', 50, now);
  assert.deepEqual(all.list.map((x) => x.name), ['B', 'A']);
  assert.equal(all.me.rank, 2);
  assert.equal(all.list[0].cg, true);
  // next week the weekly board is empty but all-time stays
  const nextWeek = now + 7 * 24 * 3600 * 1000;
  assert.equal(queryBoard(store, 'surf_aurora_dawn', 'week', 'g:a', 50, nextWeek).list.length, 0);
  assert.equal(queryBoard(store, 'surf_aurora_dawn', 'all', 'g:a', 50, nextWeek).list.length, 2);
  const pts = queryBoard(store, POINTS_BOARD, 'all', 'cg:42', 50, now);
  assert.equal(pts.list[0].value, mapPoints('surf_aurora_dawn', 3500));
  // forwarding
  const sent = [];
  const cg = createCrazyLeaderboard({ apiKey: 'k', log: () => {}, fetchImpl: async (url, o) => { sent.push(JSON.parse(o.body)); return { ok: true, json: async () => ({ successCount: 1 }) }; } });
  cg.submit('g:a', 1000);
  cg.submit('cg:42', 1234);
  await cg.flush();
  assert.equal(sent.length, 1);
  assert.deepEqual(sent[0].scores.map((s) => [s.userId, s.score]), [['42', 1234]]);
});

test('chat is filtered, rate limited, and knife unlocks are announced in chat', async () => {
  const { room, mk, adv } = setup();
  const a = mk('Alice'), b = mk('Bob');
  await flush();
  room.handleMessage(a.c, { t: 'chat', text: 'gg fuck this ramp www.spam.com' });
  const m = b.last('chat');
  assert.equal(m.name, 'Alice');
  assert.ok(!/fuck|spam\.com/.test(m.text), m.text);
  room.handleMessage(a.c, { t: 'chat', text: 'second message too fast' });
  assert.equal(b.last('chat').text, m.text); // rate limited
  adv(1500);
  room.handleMessage(a.c, { t: 'chat', text: 'nice' });
  assert.equal(b.last('chat').text, 'nice');
  adv(1500);
  room.handleMessage(b.c, { t: 'crate', key: 'idem-key-chat1' });
  const k = a.last('chat');
  assert.equal(k.kind, 'knife');
  assert.ok(k.text.startsWith('Bob opened the Surf Vault'));
});

test('malformed messages never throw or break the room', async () => {
  const logs = [];
  const room = new Room({ store: memStore(), auth: (h) => ({ key: 'k:' + h.token, name: String(h.name) }), log: (...a) => logs.push(a) });
  const inbox = [];
  const c = room.addClient({ send: (m) => inbox.push(m), close() {} });
  await room.handleMessage(c, { t: 'hello', name: { toString: 1 }, token: 'x' });
  await room.handleMessage(c, { t: 'hello', name: 'Alice', token: 'alice' });
  await flush();
  const bad = [null, 5, 'x', [], { t: 5 }, { t: 'chat', text: { toString: 1 } }, { t: 'equip', id: { toString: 1 } },
    { t: 'crate', key: { toString: 1 } }, { t: 'vote', i: { valueOf: 1 } }, { t: 'ping', rtt: { valueOf: 1 } }, { t: 'cmds', c: [{ x: 1 }, null, [{ valueOf: 1 }]] }];
  for (const m of bad) await assert.doesNotReject(room.handleMessage(c, m));
  for (let i = 0; i < 20; i++) room.tick();
  assert.ok(inbox.some((m) => m.t === 's'));
});

test('a time outside the kept top list is not a personal best on the board', async () => {
  const { submitTime } = await import('../shared/leaderboard.js');
  const store = memStore();
  for (let i = 0; i < 520; i++) submitTime(store, { key: 'k' + i, name: 'p' + i, mapId: 'surf_aurora_dawn', ticks: 5000 + i });
  const slow = submitTime(store, { key: 'slow', name: 'slow', mapId: 'surf_aurora_dawn', ticks: 9999 });
  assert.equal(slow.allTime.improved, false);
  assert.equal(slow.personalBest, true); // still the player's own first time (XP counts it as a PB)
  const slower = submitTime(store, { key: 'slow', name: 'slow', mapId: 'surf_aurora_dawn', ticks: 10500 });
  assert.equal(slower.personalBest, false);
});
