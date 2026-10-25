import { getTrack, TRACK_IDS } from '../src/game/TrackManager';
import { RaceSimulation } from '../src/game/RaceManager';
for (const id of TRACK_IDS) for (const seed of [1, 2, 3]) {
  const sim = new RaceSimulation({ track: getTrack(id), seed, racers: [
    { id: 'p', name: 'P', characterId: 'moss', isPlayer: true, difficulty: 'racer' },
    { id: 'a', name: 'Rookie', characterId: 'kip', isPlayer: false, difficulty: 'rookie' },
    { id: 'b', name: 'Racer', characterId: 'pebble', isPlayer: false, difficulty: 'racer' },
    { id: 'c', name: 'Ace', characterId: 'lumi', isPlayer: false, difficulty: 'ace' },
  ]});
  const t0 = performance.now(); let worst = 0;
  while (sim.phase !== 'done') { const a = performance.now(); sim.step([]); worst = Math.max(worst, performance.now() - a); }
  const ms = performance.now() - t0;
  console.log(id, seed, 'avg', (ms / sim.tick).toFixed(3), 'worst', worst.toFixed(2), sim.racers.map(r => `${r.name}:${r.finishTime} h${r.stats.hitsTaken} f${r.stats.falls} g${r.stats.glimmers} u${r.stats.abilitiesUsed}`).join('  '));
}
