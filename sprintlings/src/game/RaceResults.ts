import type { RaceSimulation } from './RaceManager';
import type { RacerStats } from './RaceState';
import type { CharacterId } from '../player/CharacterDefinition';

export interface RacerResult {
  index: number;
  id: string;
  name: string;
  characterId: CharacterId;
  isPlayer: boolean;
  /** 1-based final position. */
  place: number;
  finishTime: number | null;
  distance: number;
  stats: RacerStats;
}

export interface RaceResultSummary {
  trackId: string;
  seed: number;
  ticks: number;
  racers: RacerResult[];
}

/** Final classification: finishers by time, then the rest by distance covered. */
export function summarizeRace(sim: RaceSimulation): RaceResultSummary {
  const order = [...sim.standings];
  return {
    trackId: sim.track.data.id,
    seed: sim.setup.seed,
    ticks: sim.tick,
    racers: order.map((i, place) => {
      const r = sim.racers[i];
      return {
        index: i,
        id: r.id,
        name: r.name,
        characterId: r.characterId,
        isPlayer: r.isPlayer,
        place: place + 1,
        finishTime: r.finishTime,
        distance: Math.min(sim.track.length, Math.max(0, r.body.x)),
        stats: { ...r.stats },
      };
    }),
  };
}
