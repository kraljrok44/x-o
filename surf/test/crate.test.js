import test from 'node:test';
import assert from 'node:assert/strict';
import { openCrate, equipKnife, CRATE_STATUS } from '../shared/crate.js';
import { COLLECTIBLES, CATALOG_TOTAL, KNIFE_MODELS, KNIFE_SKINS } from '../shared/catalog.js';
import { rng32 } from '../shared/vec.js';

function memStore() {
  const m = new Map();
  return {
    load: (k) => (m.has(k) ? structuredClone(m.get(k)) : null),
    save: (k, p) => m.set(k, structuredClone(p)),
    raw: m,
  };
}

test('catalogue ids are unique and the total is derived from the matrix', () => {
  assert.equal(new Set(KNIFE_MODELS.map((m) => m.id)).size, KNIFE_MODELS.length);
  assert.equal(new Set(KNIFE_SKINS.map((s) => s.id)).size, KNIFE_SKINS.length);
  assert.equal(new Set(COLLECTIBLES.map((c) => c.collectible_id)).size, COLLECTIBLES.length);
  assert.equal(CATALOG_TOTAL, COLLECTIBLES.length);
  assert.ok(CATALOG_TOTAL > 300);
  assert.ok(KNIFE_MODELS.length >= 15);
});

test('opening never grants a duplicate and ends with COLLECTION_COMPLETE', () => {
  const store = memStore();
  const rng = rng32(7);
  const got = new Set();
  let now = 0;
  for (let i = 0; i < CATALOG_TOTAL; i++) {
    now += 60000;
    const r = openCrate(store, 'p1', 'key-' + i.toString().padStart(6, '0'), { now, rng });
    assert.equal(r.status, CRATE_STATUS.SUCCESS);
    assert.ok(!got.has(r.collectible_id), 'duplicate ' + r.collectible_id);
    got.add(r.collectible_id);
    assert.equal(r.collection_count, got.size);
  }
  now += 60000;
  const done = openCrate(store, 'p1', 'key-final-xx', { now, rng });
  assert.equal(done.status, CRATE_STATUS.COLLECTION_COMPLETE);
  assert.equal(done.collection_count, CATALOG_TOTAL);
  assert.equal(store.load('p1').owned.length, CATALOG_TOTAL);
});

test('retrying the same request is idempotent', () => {
  const store = memStore();
  const a = openCrate(store, 'p', 'same-key-123', { now: 100000 });
  const b = openCrate(store, 'p', 'same-key-123', { now: 100500 });
  assert.equal(a.collectible_id, b.collectible_id);
  assert.equal(store.load('p').owned.length, 1);
});

test('server cooldown blocks rapid repeated opening', () => {
  const store = memStore();
  assert.equal(openCrate(store, 'p', 'aaaaaaaa1', { now: 100000 }).status, CRATE_STATUS.SUCCESS);
  assert.equal(openCrate(store, 'p', 'aaaaaaaa2', { now: 101000 }).status, CRATE_STATUS.COOLDOWN);
  assert.equal(store.load('p').owned.length, 1);
});

test('a failed write does not report success and grants nothing', () => {
  const store = memStore();
  store.save = () => { throw new Error('disk full'); };
  const r = openCrate(store, 'p', 'bbbbbbbb1', { now: 100000 });
  assert.equal(r.status, CRATE_STATUS.RETRY_SAFE);
  assert.equal(store.load('p'), null);
});

test('only owned knives can be equipped', () => {
  const store = memStore();
  const r = openCrate(store, 'p', 'cccccccc1', { now: 100000 });
  assert.equal(equipKnife(store, 'p', 'crescent__abyss_p1') && r.collectible_id !== 'crescent__abyss_p1', false);
  assert.ok(equipKnife(store, 'p', r.collectible_id));
  assert.equal(store.load('p').equipped, r.collectible_id);
});
