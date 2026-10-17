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
