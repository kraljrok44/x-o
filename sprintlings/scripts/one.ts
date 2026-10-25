import { remixRecipe } from '../src/game/TrackManager';
import { buildTrack } from '../src/obstacles/ObstacleSpawner';
import { RaceSimulation } from '../src/game/RaceManager';
const [day, ch] = process.argv.slice(2);
const track = buildTrack(remixRecipe(day, 0));
const sim = new RaceSimulation({ track, seed: 1, racers: [{ id: 's', name: 'S', characterId: ch as 'moss', isPlayer: false, difficulty: 'perfect' }] });
while (sim.phase !== 'done') for (const e of sim.step([])) if (e.type === 'hit' || e.type === 'bonk' || e.type === 'fall') {
  const seg = track.data.segments.find(s => e.s >= s.s0 && e.s < s.s1);
  const h = track.data.hazards.find(x => x.id === e.value);
  console.log(e.type, e.s.toFixed(1), e.lateral.toFixed(2), h?.kind, seg?.templateId, (e.s - (seg?.s0 ?? 0)).toFixed(1), seg?.mirror, 'prev', track.data.segments[track.data.segments.indexOf(seg!) - 1]?.templateId);
}
