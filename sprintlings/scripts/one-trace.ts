import { remixRecipe } from '../src/game/TrackManager';
import { buildTrack } from '../src/obstacles/ObstacleSpawner';
import { RaceSimulation } from '../src/game/RaceManager';
import { periodicState, type PeriodicHazard } from '../src/obstacles/ObstacleBase';
const [day, ch, s0, s1] = process.argv.slice(2);
const track = buildTrack(remixRecipe(day, 0));
const sim = new RaceSimulation({ track, seed: 1, racers: [{ id: 's', name: 'S', characterId: ch as 'moss', isPlayer: false, difficulty: 'perfect' }] });
const sp = track.data.hazards.filter(h => h.kind === 'spikes') as PeriodicHazard[];
while (sim.phase !== 'done') {
  const ev = sim.step([]);
  const b = sim.racers[0].body;
  if (b.s > Number(s0) && b.s < Number(s1)) {
    const h = sp.find(h => Math.abs(h.s - b.s) < 8);
    console.log(sim.time.toFixed(2), b.s.toFixed(2), 'y', b.y.toFixed(2), 'vy', b.vy.toFixed(1), 'g', b.grounded, h ? `sp${h.s.toFixed(1)}:${periodicState(h, sim.time)}` : '', JSON.stringify((sim as any).ai[0].plan), ev.map(e => e.type).join(','));
  }
}
