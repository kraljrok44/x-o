import test from 'node:test';
import assert from 'node:assert/strict';
import { XP_TABLE, levelFor, xpMultiplier, awardXp, rankFor } from '../shared/xp.js';
import { Room } from '../shared/room.js';
import { openCrate } from '../shared/crate.js';

test('xp table follows the classic 99 level curve', () => {
  const want = { 2: 83, 3: 174, 10: 1154, 14: 2107, 30: 13363, 50: 101333, 70: 737627, 98: 11805606, 99: 13034431 };
  for (const [lv, xp] of Object.entries(want)) assert.equal(XP_TABLE[lv], xp, `level ${lv}`);
  assert.equal(levelFor(0), 1);
  assert.equal(levelFor(82), 1);
  assert.equal(levelFor(83), 2);
  assert.equal(levelFor(99e6), 99);
});

test('reward doubles every 14 levels, free crate every 10th level, rank every 10 levels', () => {
  assert.equal(xpMultiplier(1), 1);
  assert.equal(xpMultiplier(14), 1);
  assert.equal(xpMultiplier(15), 2);
  assert.equal(xpMultiplier(29), 4);
  const a = awardXp({ xp: XP_TABLE[10] - 10 }, 'pb');
  assert.equal(a.gained, 160);
  assert.equal(a.level, 10);
  assert.equal(a.freeCrates, 1);
  assert.equal(a.profile.freeCrates, 1);
  assert.equal(awardXp({ xp: XP_TABLE[15] }, 'record').gained, 1000);
  assert.equal(rankFor(9).short, 'REC');
  assert.equal(rankFor(10).short, 'PVT');
  assert.equal(rankFor(99).short, 'GEN');
});

test('completion xp: first 40, plain 80, personal best 160, record 500', async () => {
  const m = new Map(), r = new Map();
  const store = { load: (k) => (m.has(k) ? structuredClone(m.get(k)) : null), save: (k, p) => m.set(k, structuredClone(p)), loadRecords: (id) => r.get(id) || [], saveRecords: (id, l) => r.set(id, l) };
  const room = new Room({ store, auth: (h) => ({ key: 'k:' + h.token, name: h.name }), clock: () => 1e6 });
  const join = async (name) => {
    const inbox = [];
    const c = room.addClient({ send: (x) => inbox.push(x), close() {} });
    room.handleMessage(c, { t: 'hello', name, token: name });
    await new Promise((res) => setImmediate(res));
    return { c, xp: () => inbox.filter((x) => x.t === 'xp').map((x) => [x.kind, x.gained]) };
  };
  const a = await join('Alice');
  const b = await join('Bob');
  room._onFinish(a.c, { ticks: 9000 }); // empty board: map record
  room._onFinish(b.c, { ticks: 9500 }); // first completion (not a record)
  room._onFinish(b.c, { ticks: 9900 }); // plain completion
  room._onFinish(b.c, { ticks: 9200 }); // personal best
  assert.deepEqual(a.xp(), [['record', 500]]);
  assert.deepEqual(b.xp(), [['first', 40], ['normal', 80], ['pb', 160]]);
  assert.equal(store.load('k:Bob').xp, 280);
});

test('free crates open without cooldown and are used up', () => {
  const m = new Map([['p', { owned: [], equipped: null, idem: {}, lastOpenAt: 1e6, opens: 0, freeCrates: 1 }]]);
  const store = { load: (k) => structuredClone(m.get(k)), save: (k, p) => m.set(k, structuredClone(p)) };
  assert.equal(openCrate(store, 'p', 'a'.repeat(12), { now: 1e6 + 1000, free: true }).status, 'SUCCESS');
  assert.equal(m.get('p').freeCrates, 0);
  assert.equal(openCrate(store, 'p', 'b'.repeat(12), { now: 1e6 + 2000, free: true }).status, 'BAD_REQUEST');
});

test('a map record saves and broadcasts the record ghost', async () => {
  const m = new Map(), r = new Map(), g = new Map();
  const store = { load: (k) => (m.has(k) ? structuredClone(m.get(k)) : null), save: (k, p) => m.set(k, structuredClone(p)), loadRecords: (id) => r.get(id) || [], saveRecords: (id, l) => r.set(id, l), loadGhost: (k) => g.get(k) || null, saveGhost: (k, v) => g.set(k, v) };
  const room = new Room({ store, auth: (h) => ({ key: 'k:' + h.token, name: h.name }), clock: () => 1e6 });
  const inbox = [];
  const c = room.addClient({ send: (x) => inbox.push(x), close() {} });
  room.handleMessage(c, { t: 'hello', name: 'Zed', token: 'Zed' });
  await new Promise((res) => setImmediate(res));
  c.path = Array.from({ length: 40 }, (_, i) => [i * 10, 0, 0, 0]);
  room._onFinish(c, { ticks: 8000 });
  const ghost = inbox.find((x) => x.t === 'ghost');
  assert.ok(ghost && ghost.frames.length === 40 && ghost.name === 'Zed');
  assert.equal(g.size, 1);
  // a later joiner gets it right after the welcome
  const inbox2 = [];
  const c2 = room.addClient({ send: (x) => inbox2.push(x), close() {} });
  room.handleMessage(c2, { t: 'hello', name: 'Amy', token: 'Amy' });
  await new Promise((res) => setImmediate(res));
  assert.ok(inbox2.some((x) => x.t === 'ghost' && x.frames.length === 40));
});
