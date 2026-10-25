import { getTrack } from '../src/game/TrackManager';
import { validateTrack } from '../src/game/TrackValidator';
const t0 = performance.now();
validateTrack(getTrack('mossy_hollow'), { characters: ['moss'] });
console.log('solver ms', (performance.now() - t0).toFixed(0));
