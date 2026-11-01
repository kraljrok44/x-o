import test from 'node:test';
import assert from 'node:assert/strict';
import { MapVote, EXTEND } from '../shared/vote.js';
import { GAME } from '../shared/config.js';

const MAPS = ['a', 'b', 'c', 'd', 'e', 'f'];
const MIN = 60000;

test('vote starts after 10 minutes, not before', () => {
  const v = new MapVote({ mapIds: MAPS, currentMap: 'a', now: 0 });
  assert.equal(v.update(10 * MIN - 1, 3).length, 0);
  const a = v.update(10 * MIN, 3);
  assert.equal(a[0].type, 'vote_start');
  assert.equal(a[0].options.length, GAME.voteMapOptions + 1);
  assert.ok(a[0].options.includes(EXTEND));
  assert.ok(!a[0].options.includes('a'));
});

test('extend wins -> 5 more minutes, then a new vote', () => {
  const v = new MapVote({ mapIds: MAPS, currentMap: 'a', now: 0 });
  v.update(10 * MIN, 2);
  const ext = v.options.indexOf(EXTEND);
  v.castVote(1, ext); v.castVote(2, ext);
  const tEnd = 10 * MIN + GAME.voteDurationSec * 1000;
  const out = v.update(tEnd, 2);
  assert.ok(out.some((x) => x.type === 'extend'));
  assert.equal(v.state, 'playing');
  assert.equal(v.mapEndsAt, tEnd + 5 * MIN); // 5 more minutes of play after the vote
  assert.equal(v.update(tEnd + 5 * MIN - 1, 2).length, 0);
  assert.equal(v.update(tEnd + 5 * MIN, 2)[0].type, 'vote_start');
});

test('map wins -> change -> load', () => {
  const v = new MapVote({ mapIds: MAPS, currentMap: 'a', now: 0 });
  v.update(10 * MIN, 3);
  v.castVote(1, 0); v.castVote(2, 0); v.castVote(3, 1);
  const target = v.options[0];
  const t1 = 10 * MIN + GAME.voteDurationSec * 1000;
  const out = v.update(t1, 3);
  assert.ok(out.some((x) => x.type === 'change' && x.mapId === target));
  const load = v.update(t1 + GAME.mapChangeDelaySec * 1000, 3);
  assert.equal(load[0].type, 'load');
  assert.equal(v.current, target);
});

test('rock the vote needs at least 50% of players', () => {
  const v = new MapVote({ mapIds: MAPS, currentMap: 'a', now: 0 });
  let r = v.requestRtv(1, 1000, 4);
  assert.equal(r.started, false);
  assert.equal(r.needed, 2);
  r = v.requestRtv(1, 1000, 4); // same player twice does not count twice
  assert.equal(r.count, 1);
  const out = [];
  r = v.requestRtv(2, 1000, 4, out);
  assert.equal(r.started, true);
  assert.equal(out[0].reason, 'rtv');
});

test('rtv: odd player counts round up, a leaving player can trigger the vote', () => {
  const v = new MapVote({ mapIds: MAPS, currentMap: 'a', now: 0 });
  assert.equal(v.rtvNeeded(5), 3);
  assert.equal(v.rtvNeeded(1), 1);
  v.requestRtv(1, 0, 5); v.requestRtv(2, 0, 5);
  const out = [];
  v.removePlayer(3, 0, 4, out); // 2 of 4 = 50%
  assert.equal(out[0]?.type, 'vote_start');
});

test('empty server rotates without a vote', () => {
  const v = new MapVote({ mapIds: MAPS, currentMap: 'a', now: 0 });
  const out = v.update(10 * MIN, 0);
  assert.equal(out[0].type, 'change');
  assert.equal(out[0].mapId, 'b');
});
