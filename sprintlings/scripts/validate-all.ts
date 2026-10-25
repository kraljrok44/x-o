import { getTrack, TRACK_IDS, remixRecipe } from '../src/game/TrackManager';
import { validateTrack } from '../src/game/TrackValidator';
import { buildTrack } from '../src/obstacles/ObstacleSpawner';
for (const id of TRACK_IDS) { const r = validateTrack(getTrack(id)); console.log(id, r.ok, r.solverTime, r.problems); }
let bad = 0; const n = Number(process.argv[2] ?? 20);
for (let i = 0; i < n; i++) {
  const day = new Date(Date.UTC(2026, 0, 1) + i * 86400000).toISOString().slice(0, 10);
  const t = buildTrack(remixRecipe(day, 0)); const r = validateTrack(t);
  if (!r.ok) { bad++; console.log(day, t.length.toFixed(0), r.problems.slice(0, 4)); }
}
console.log('remix bad', bad, '/', n);
