import { getTrack, TRACK_IDS } from '../src/game/TrackManager';
import { RaceSimulation } from '../src/game/RaceManager';

const ids = process.argv[2] ? [process.argv[2]] : TRACK_IDS;
for (const id of ids) {
  const track = getTrack(id);
  for (const c of ['moss', 'kip', 'pebble', 'lumi', 'ember', 'hoot'] as const) {
    const sim = new RaceSimulation({ track, seed: 7, racers: [{ id: 'b', name: 'B', characterId: c, isPlayer: false, difficulty: 'perfect' }] });
    const incidents: string[] = [];
    while (sim.phase !== 'done') {
      const ev = sim.step([]);
      for (const e of ev) {
        if (e.type === 'hit' || e.type === 'bonk' || e.type === 'fall') {
          const h = track.data.hazards.find((x) => x.id === e.value);
          incidents.push(`${e.type}@${e.x.toFixed(1)} y${e.y.toFixed(2)} ${h?.kind ?? e.value} hx=${h?.x.toFixed(1)} t=${sim.time.toFixed(2)}`);
        }
      }
    }
    console.log(id, c, 'finish', sim.racers[0].finishTime, 'incidents', incidents.length, incidents.join(' | '));
  }
}
