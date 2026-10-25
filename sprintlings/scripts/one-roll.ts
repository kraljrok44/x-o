import { remixRecipe } from '../src/game/TrackManager';
import { buildTrack } from '../src/obstacles/ObstacleSpawner';
import { RaceSimulation } from '../src/game/RaceManager';
import { stepBody } from '../src/player/PlayerMovement';
import { copyBody, makeBody } from '../src/game/RaceState';
import { makeBodyInput } from '../src/physics/PhysicsWorld';
import { periodicState, type PeriodicHazard } from '../src/obstacles/ObstacleBase';
const [day, ch, at] = process.argv.slice(2);
const track = buildTrack(remixRecipe(day, 0));
const sim = new RaceSimulation({ track, seed: 1, racers: [{ id: 's', name: 'S', characterId: ch as 'moss', isPlayer: false, difficulty: 'perfect' }] });
while (sim.time < Number(at)) sim.step([]);
const sp = track.data.hazards.find(h => h.kind === 'spikes' && h.s > 172 && h.s < 174) as PeriodicHazard;
console.log(sp);
const b = copyBody(sim.racers[0].body, makeBody(0,0,0));
const w = { track, time: sim.time, emit: (t: string) => { if (t==='hit') console.log('HIT', w.time.toFixed(3)); }, inSap: () => false, touchSnare: () => -1 };
const inp = makeBodyInput();
for (let k = 0; k < 30; k++) { stepBody(b, inp, sim.racers[0].mods, w as any, 0, 1/60); console.log(k, w.time.toFixed(3), b.s.toFixed(2), periodicState(sp, w.time)); w.time += 1/60; }
