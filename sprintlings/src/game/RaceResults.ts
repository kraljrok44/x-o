import type { RaceSimulation } from './RaceManager';
import type { RacerStats } from './RaceState';
import type { CharacterId } from '../player/CharacterDefinition';

export interface RacerResult {
  index: number;
  id: string;
  name: string;
  characterId: CharacterId;
  isPlayer: boolean;
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
  winningTeam: number | null;
}

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
