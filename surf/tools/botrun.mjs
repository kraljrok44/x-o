import { getMap, MAP_LIST } from '../shared/maps/index.js';
import { CollisionWorld } from '../shared/collision.js';
import { createPlayerState, stepPlayer, formatTime } from '../shared/sim.js';
import { botCommand } from '../shared/bot.js';
const only = process.argv[2];
for (const m of MAP_LIST) {
  if (only && m.id !== only) continue;
  const map = getMap(m.id);
  const world = new CollisionWorld(map.brushes);
  const ps = createPlayerState(map);
  let fails = {}, ev = [], done = false, t0 = Date.now();
  for (let tick = 0; tick < 100 * 400 && !done; tick++) {
    ev.length = 0;
    const st = ps.stage;
    stepPlayer(ps, botCommand(map, ps), { world, map }, ev);
    for (const e of ev) {
      if (e.type === 'fail') { fails[st] = (fails[st] || 0) + 1; if (fails[st] > 3) done = true; if (process.env.V) console.log('  fail st', st, e.reason, 'tick', tick); }
      if (e.type === 'checkpoint' && process.env.V) console.log('  cp', e.stage, formatTime(e.ticks), 'spd', Math.round(ps.maxSpeed));
      if (e.type === 'finish') { console.log(m.id, 'FINISH', formatTime(e.ticks), 'max', Math.round(e.maxSpeed), 'fails', JSON.stringify(fails)); done = true; }
      if (ps.stuck && process.env.V) console.log('stuck');
    }
  }
  if (ps.runState !== 'finished') console.log(m.id, 'NOT FINISHED stage', ps.stage, 'fails', JSON.stringify(fails), 'pos', JSON.stringify(ps.pos));
  console.log('  brushes', map.brushes.length, 'ms', Date.now() - t0);
}
