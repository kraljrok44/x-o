import { getTrack } from '../src/game/TrackManager';
import { RaceSimulation } from '../src/game/RaceManager';
import { pendulumLateral, type PendulumHazard } from '../src/obstacles/ObstacleBase';
const track = getTrack(process.argv[2]);
const t0 = Number(process.argv[3]), t1 = Number(process.argv[4]);
const sim = new RaceSimulation({ track, seed: 7, racers: [{ id: 'b', name: 'B', characterId: 'moss', isPlayer: false, difficulty: 'perfect' }] });
const pend = track.data.hazards.filter((h) => h.kind === 'pendulum') as PendulumHazard[];
while (sim.phase !== 'done') {
  const ev = sim.step([]);
  if (sim.time >= t0 && sim.time <= t1) {
    const b = sim.racers[0].body;
    const p = pend.find((h) => Math.abs(h.s - b.s) < 15);
    console.log(sim.time.toFixed(2), 's', b.s.toFixed(2), 'lat', b.lateral.toFixed(2), 'tl', b.targetLane, 'y', b.y.toFixed(2), 'spd', b.speed.toFixed(1), 'stun', b.stun.toFixed(2), p ? 'pend' + p.s.toFixed(0) + '@' + pendulumLateral(p, sim.time).toFixed(2) : '', (sim as any).ai[0].plan, ev.map((e) => e.type).join(','));
  }
}
