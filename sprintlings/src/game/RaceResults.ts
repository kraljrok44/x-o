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
  team: number;
  finishTime: number | null;
  distance: number;
  stats: RacerStats;
}

export interface RaceResultSummary {
  trackId: string;
  seed: number;
  ticks: number;
  racers: RacerResult[];
  /** Duos: the winning team id (more placing points; ties go to the first finisher's team). */
  winningTeam: number | null;
}

/** Placing points for team races: 1st 4, 2nd 3, 3rd 2, 4th 1. */
export function teamWinner(results: readonly { team: number; place: number }[]): number | null {
  const teams = new Set(results.map((r) => r.team));
  if (teams.size === results.length) return null;
  const pts = new Map<number, number>();
  for (const r of results) pts.set(r.team, (pts.get(r.team) ?? 0) + (results.length + 1 - r.place));
  let best: number | null = null;
  let bestPts = -1;
  for (const r of [...results].sort((a, b) => a.place - b.place)) {
    const p = pts.get(r.team)!;
    if (p > bestPts) {
      best = r.team;
      bestPts = p;
    }
  }
  return best;
}

/** Final classification: finishers by time, then the rest by distance covered. */
export function summarizeRace(sim: RaceSimulation): RaceResultSummary {
  const order = [...sim.standings];
  const summary: RaceResultSummary = {
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
        team: r.team,
        finishTime: r.finishTime,
        distance: Math.min(sim.track.length, Math.max(0, r.body.x)),
        stats: { ...r.stats },
      };
    }),
    winningTeam: null,
  };
  summary.winningTeam = teamWinner(summary.racers);
  return summary;
}
