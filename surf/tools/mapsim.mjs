// Sandbox for map elements: node tools/mapsim.mjs <name>  (specs below) [speedScale]
// Runs the validation bot through one stage and prints where it fails or how it finishes.
import { buildLinearMap } from '../shared/maps/builder.js';
import { CollisionWorld } from '../shared/collision.js';
import { createPlayerState, stepPlayer, formatTime, inTrigger } from '../shared/sim.js';
import { botCommand } from '../shared/bot.js';

const R = (len, o = {}) => ({ len, ...o });
const SPECS = {
  cornerL: [{ heading: 0, ramps: [R(2600, { sides: 'right' }), R(2600, { sides: 'right', corner: 90 }), R(3000, { w: 520, d: 760 }), R(2600, {})] }],
  cornerR: [{ heading: 0, ramps: [R(2600, {}), R(2600, { sides: 'left', corner: -90 }), R(3000, { w: 520, d: 760 }), R(2600, {})] }],
  corner2: [{ heading: 0, ramps: [R(2600, { sides: 'right' }), R(2600, { sides: 'right', corner: 90 }), R(2600, { w: 520, d: 760, corner: -90 }), R(3000, { w: 520, d: 760 }), R(2600, {})] }],
  speed: [{ heading: 0, ramps: [R(2600, {}), R(2600, { speedcheck: { min: 1100 } }), R(3000, {}), R(2600, {})] }],
  window: [{ heading: 0, ramps: [R(2600, { window: {} }), R(3000, {}), R(2600, {})] }],
  corridor: [{ heading: 0, ramps: [R(2600, {}), R(3000, { sides: 'left', w: 320, corridor: {} }), R(2600, {})] }],
  drop: [{ heading: 0, ramps: [R(2600, { drop: 1100, gap: 260 }), R(4200, { d: 700 }), R(2600, {})] }],
};

const name = process.argv[2] || 'cornerL';
const scale = Number(process.argv[3] || 1);
const meta = { id: 'sandbox', display_name: 'Sandbox', theme: {}, layout: 'linear' };
const map = buildLinearMap(meta, SPECS[name].map((s, k) => ({ ...s, origin: [0, k * 30000, 0] })), false);
const world = new CollisionWorld(map.brushes);
const ps = createPlayerState(map);
const ev = [];
let scaled = false, maxSp = 0, log = [];
for (let tick = 0; tick < 100 * 120; tick++) {
  ev.length = 0;
  stepPlayer(ps, botCommand(map, ps), { world, map }, ev);
  const sp = Math.hypot(ps.vel.x, ps.vel.y);
  maxSp = Math.max(maxSp, sp);
  // speed check experiments: scale the speed once when entering the check zone
  const sc = map.triggers.find((t) => t.type === 'speedcheck');
  if (sc && !scaled && inTrigger(ps, sc) && ps.mode === 1) { scaled = true; ps.vel.x *= scale; ps.vel.y *= scale; console.log('enter check at', Math.round(sp), '->', Math.round(sp * scale), 'min', sc.min); }
  if (tick % 25 === 0 && process.env.V) log.push(`${(tick / 100).toFixed(2)} ${ps.mode} sp ${sp.toFixed(0)} pos ${ps.pos.x.toFixed(0)},${ps.pos.y.toFixed(0)},${ps.pos.z.toFixed(0)}`);
  for (const e of ev) {
    if (e.type === 'fail') { console.log(name, 'FAIL at', (tick / 100).toFixed(2), JSON.stringify(ps.pos)); if (process.env.V) console.log(log.slice(-12).join('\n')); process.exit(1); }
    if (e.type === 'finish') { console.log(name, 'FINISH', formatTime(e.ticks), 'max', Math.round(maxSp)); if (process.env.V) console.log(log.join('\n')); process.exit(0); }
  }
}
console.log(name, 'TIMEOUT', JSON.stringify(ps.pos));
