import { getTrack, TRACK_IDS } from '../src/game/TrackManager';
import { RaceSimulation } from '../src/game/RaceManager';

const diff = (process.argv[2] ?? 'perfect') as 'perfect';
for (const id of TRACK_IDS) {
  const track = getTrack(id);
  const sim = new RaceSimulation({
    track,
    seed: 42,
    racers: ['moss', 'kip', 'pebble', 'lumi'].map((c, i) => ({ id: 'b' + i, name: 'B' + i, characterId: c as 'moss', isPlayer: false, difficulty: diff })),
  });
  const t0 = performance.now();
  sim.runToEnd();
  const ms = performance.now() - t0;
  console.log(id, 'len', track.length.toFixed(0), 'ticks', sim.tick, 'ms', ms.toFixed(0), 'per tick ms', (ms / sim.tick).toFixed(3));
  for (const r of sim.racers) console.log('  ', r.characterId, r.finishTime, JSON.stringify(r.stats), 's', r.body.x.toFixed(1));
}
