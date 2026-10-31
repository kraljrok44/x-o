import type { RaceSimulation } from '../game/RaceManager';

/**
 * Compact fingerprint of the race state. The server and every client run
 * the same deterministic simulation; comparing fingerprints now and then
 * catches a client that has drifted (desync).
 */
export function simHash(sim: RaceSimulation): number {
  let h = 0x811c9dc5;
  const mix = (v: number) => {
    h ^= v | 0;
    h = Math.imul(h, 0x01000193);
  };
  mix(sim.tick);
  for (const r of sim.racers) {
    const b = r.body;
    mix(Math.round(b.x * 1e4));
    mix(Math.round(b.y * 1e4));
    mix(Math.round(b.speed * 1e4));
    mix(b.phase.length);
    mix(r.item ? r.item.length : 0);
    mix(r.finishTime === null ? -1 : Math.round(r.finishTime * 1e3));
  }
  mix(sim.entities.length);
  return h >>> 0;
}
