import test from 'node:test';
import assert from 'node:assert/strict';
import { MAP_LIST, getMap } from '../shared/maps/index.js';
import { CollisionWorld } from '../shared/collision.js';
import { createPlayerState, stepPlayer, inTrigger, EV, respawn, BTN } from '../shared/sim.js';
import { botCommand } from '../shared/bot.js';
import { MODE } from '../shared/movement.js';

test('at least 5 maps across several difficulty levels', () => {
  assert.ok(MAP_LIST.length >= 5);
  assert.ok(new Set(MAP_LIST.map((m) => m.difficulty)).size >= 3);
});

for (const meta of MAP_LIST) {
  test(`${meta.id}: brushes are convex and metadata complete`, () => {
    const map = getMap(meta.id);
    for (const k of ['unique_id', 'display_name', 'author', 'version', 'physics_profile', 'difficulty', 'category', 'licensing_notes']) {
      assert.ok(map[k] !== undefined, 'missing ' + k);
    }
    for (const b of map.brushes) {
      for (const p of b.planes) for (const v of b.verts) assert.ok(p.x * v.x + p.y * v.y + p.z * v.z - p.d < 0.05, 'non convex brush');
    }
  });

  test(`${meta.id}: spawns are free, teleports valid, stages isolated`, () => {
    const map = getMap(meta.id);
    const world = new CollisionWorld(map.brushes);
    map.stages.forEach((s) => {
      const pos = { x: s.spawn.pos[0], y: s.spawn.pos[1], z: s.spawn.pos[2] };
      assert.ok(!world.boxSolid(pos), 'spawn inside geometry');
      // spawn is not inside any fail/teleport/finish trigger
      const ps = { pos };
      for (const t of map.triggers) if (['fail', 'teleport', 'finish'].includes(t.type)) assert.ok(!inTrigger(ps, t), `spawn in ${t.type}`);
    });
    const tele = map.triggers.filter((t) => t.type === 'teleport');
    assert.equal(tele.length, map.stages.length - 1);
    for (const t of tele) assert.ok(!world.boxSolid({ x: t.dest.pos[0], y: t.dest.pos[1], z: t.dest.pos[2] }));
    assert.equal(map.triggers.filter((t) => t.type === 'finish').length, 1);
    assert.equal(map.triggers.filter((t) => t.type === 'start').length, 1);
  });

  test(`${meta.id}: the surf bot finishes the map with no ramp-bug speed losses`, () => {
    const map = getMap(meta.id);
    const world = new CollisionWorld(map.brushes);
    const ps = createPlayerState(map);
    const ev = [];
    let finished = false, fails = 0, prev = 0, surfRun = 0;
    for (let tick = 0; tick < 100 * 300 && !finished; tick++) {
      ev.length = 0;
      stepPlayer(ps, botCommand(map, ps), { world, map }, ev);
      // horizontal speed while continuously surfing must never drop suddenly (landing impacts excluded)
      const sp = Math.hypot(ps.vel.x, ps.vel.y);
      surfRun = ps.mode === MODE.SURFING ? surfRun + 1 : 0;
      if (surfRun > 30 && prev > 500 && !ev.length) {
        assert.ok(sp > prev * 0.95, `${meta.id} sudden speed loss ${prev.toFixed(0)} -> ${sp.toFixed(0)} at ${JSON.stringify(ps.pos)}`);
      }
      prev = sp;
      for (const e of ev) {
        if (e.type === EV.FAIL) fails++;
        if (e.type === EV.FINISH) finished = true;
      }
    }
    assert.ok(finished, `bot did not finish (stage ${ps.stage})`);
    assert.equal(fails, 0);
  });
}

test('jump sections cannot be passed without jumping', () => {
  for (const meta of MAP_LIST) {
    const map = getMap(meta.id);
    const world = new CollisionWorld(map.brushes);
    const stages = [...new Set(map.pads.map((p) => p.stage))];
    assert.ok(stages.length >= 1, `${meta.id} has no jump section`);
    for (const st of stages) {
      const ps = createPlayerState(map);
      ps.stage = st;
      respawn(ps, map, st);
      let passed = false;
      for (let t = 0; t < 6000 && !passed; t++) {
        const c = botCommand(map, ps);
        c.buttons &= ~BTN.JUMP;
        const ev = [];
        stepPlayer(ps, c, { world, map }, ev);
        if (ps.stage > st || ev.some((e) => e.type === EV.FINISH)) passed = true;
      }
      assert.equal(passed, false, `${meta.id} stage ${st + 1} passable without jumping`);
    }
  }
});
