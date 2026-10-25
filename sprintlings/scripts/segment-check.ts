/**
 * Runs the perfect solver over each segment in isolation and prints every
 * incident. Timed hazards are re-tested with their phase shifted across a
 * whole cycle, so a pattern only passes if it is fair for any arrival time.
 */
import { buildTrack } from '../src/obstacles/ObstacleSpawner';
import { SEGMENTS } from '../src/obstacles/HazardPatterns';
import { RaceSimulation } from '../src/game/RaceManager';
import type { CharacterId } from '../src/player/CharacterDefinition';

const only = process.argv[2];
const chars: CharacterId[] = ['moss', 'kip', 'pebble', 'ember'];
const SHIFTS = [0, 0.2, 0.4, 0.6, 0.8, 1.0, 1.2, 1.4, 1.6, 1.8, 2.0, 2.2, 2.4, 2.6, 2.8, 3.0];
let failures = 0;
for (const seg of SEGMENTS) {
  if (seg.tags.includes('start') || seg.tags.includes('finish')) continue;
  if (only && seg.id !== only) continue;
  const notes: string[] = [];
  const timed = (() => {
    const t = buildTrack({ id: 'chk', name: 'chk', biome: 'forest', seed: 3, segments: [{ id: seg.id }] });
    return t.data.hazards.some((h) => 'phase' in h);
  })();
  for (const shift of timed ? SHIFTS : [0]) {
    const track = buildTrack({ id: 'chk', name: 'chk', biome: 'forest', seed: 3, segments: [{ id: 'start_meadow' }, { id: 'rest_glade' }, { id: seg.id }, { id: 'rest_glade' }, { id: 'finish_line' }] });
    for (const h of track.data.hazards) if ('phase' in h) h.phase += shift;
    for (const c of shift === 0 || process.env.ALLCHARS ? chars : chars.slice(0, 1)) {
      const sim = new RaceSimulation({ track, seed: 1, racers: [{ id: 's', name: 's', characterId: c, isPlayer: false, difficulty: 'perfect' }] });
      while (sim.phase !== 'done') {
        for (const e of sim.step([])) {
          if (e.type === 'hit' || e.type === 'fall') {
            const h = track.data.hazards.find((x) => x.id === e.value);
            notes.push(`${c}+${shift} ${e.type} x=${(e.x - 48).toFixed(1)} y=${e.y.toFixed(2)} ${h ? h.kind + '@' + (h.x - 48).toFixed(1) : ''}`);
          }
        }
      }
      if (sim.racers[0].finishTime === null) notes.push(`${c}+${shift} DNF`);
    }
  }
  if (notes.length) failures++;
  console.log(seg.id.padEnd(16), notes.length ? notes.slice(0, 6).join(' | ') + (notes.length > 6 ? ` (+${notes.length - 6})` : '') : 'ok');
}
console.log('segments with incidents:', failures);
