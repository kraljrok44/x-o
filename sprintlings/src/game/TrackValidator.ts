import { GameplayConfig } from '../config/GameplayConfig';
import { RaceSimulation } from './RaceManager';
import { getTrack, remixRecipe, TRACK_RECIPES } from './TrackManager';
import { buildTrack } from '../obstacles/ObstacleSpawner';
import { SEGMENT_BY_ID } from '../obstacles/HazardPatterns';
import { ALL_LANES, isDamaging, maskHasLane } from '../obstacles/ObstacleBase';
import { Track } from './Track';
import type { CharacterId } from '../player/CharacterDefinition';

export interface ValidationReport {
  ok: boolean;
  problems: string[];
  /** Finish time of the perfect solver, if it finished. */
  solverTime: number | null;
  solverIncidents: number;
}

const MAX_FULL_GAP = 5.2;
/** Characters whose passives change movement physics or timing. */
const SOLVER_CHARACTERS: readonly CharacterId[] = ['moss', 'kip', 'pebble', 'ember'];

/**
 * Proves a track is passable at normal speed:
 *  1. static rules (wall coverage, gap widths, segment adjacency, lead-ins),
 *  2. a "perfect" planner bot must finish solo with zero hits and falls,
 *     for every character (passives change physics slightly).
 */
export function validateTrack(
  track: Track,
  opts: { solver?: boolean; characters?: readonly CharacterId[] } = {},
): ValidationReport {
  const problems: string[] = [];
  const d = track.data;

  for (const h of d.hazards) {
    if (h.kind === 'wall' && h.lanes === ALL_LANES) problems.push(`wall ${h.id} blocks every lane`);
  }

  // Gaps spanning every lane must be jumpable.
  let fullGapStart: number | null = null;
  for (let s = 0; s <= d.length; s += 0.25) {
    const any = [-1, 0, 1].some((l) => track.groundAtLane(s, l) !== null);
    if (!any && fullGapStart === null) fullGapStart = s;
    if (any && fullGapStart !== null) {
      if (s - fullGapStart > MAX_FULL_GAP) problems.push(`full-width gap ${fullGapStart.toFixed(1)}..${s.toFixed(1)} too long`);
      fullGapStart = null;
    }
  }

  // Segment adjacency and lead-in rules.
  for (let i = 0; i < d.segments.length; i++) {
    const seg = SEGMENT_BY_ID[d.segments[i].templateId];
    const prev = i > 0 ? SEGMENT_BY_ID[d.segments[i - 1].templateId] : null;
    if (prev && seg.allowedAfter.length && !seg.allowedAfter.some((t) => prev.tags.includes(t))) {
      problems.push(`segment ${seg.id} not allowed after ${prev.id}`);
    }
    if (prev && prev.allowedBefore.length && !prev.allowedBefore.some((t) => seg.tags.includes(t))) {
      problems.push(`segment ${prev.id} not allowed before ${seg.id}`);
    }
    const s0 = d.segments[i].s0;
    for (const h of d.hazards) {
      if (h.s >= s0 && h.s < s0 + seg.minSafeLeadIn && isDamaging(h.kind)) {
        problems.push(`hazard ${h.id} inside lead-in of ${seg.id}`);
      }
    }
  }

  // Two jump-requiring hazards in the same lane need landing room between them.
  const jumpers = d.hazards.filter((h) => h.kind === 'hurdle' || h.kind === 'spikes');
  for (let lane = -1; lane <= 1; lane++) {
    const inLane = jumpers.filter((h) => maskHasLane(h.lanes, lane));
    for (let i = 1; i < inLane.length; i++) {
      const gap = inLane[i].s - inLane[i - 1].s;
      if (gap < 9 && gap > 0.01) problems.push(`lane ${lane}: hazards ${inLane[i - 1].id} and ${inLane[i].id} only ${gap.toFixed(1)}u apart`);
    }
  }

  let solverTime: number | null = null;
  let solverIncidents = 0;
  if (opts.solver !== false) {
    for (const characterId of opts.characters ?? SOLVER_CHARACTERS) {
      const sim = new RaceSimulation({
        track,
        seed: 1,
        racers: [{ id: 'solver', name: 'Solver', characterId, isPlayer: false, difficulty: 'perfect' }],
      });
      let incidents = 0;
      while (sim.phase !== 'done') {
        for (const e of sim.step([])) if (e.type === 'hit' || e.type === 'bonk' || e.type === 'fall') incidents++;
      }
      const t = sim.racers[0].finishTime;
      if (t === null) problems.push(`solver (${characterId}) did not finish`);
      else if (t > (d.length / GameplayConfig.movement.baseSpeed) * 1.35) problems.push(`solver (${characterId}) too slow: ${t}s`);
      if (incidents > 0) problems.push(`solver (${characterId}) had ${incidents} incidents`);
      solverIncidents += incidents;
      if (solverTime === null) solverTime = t;
    }
  }

  return { ok: problems.length === 0, problems, solverTime, solverIncidents };
}

const remixCache = new Map<string, Track>();

/**
 * The Daily Remix for a UTC day key. Tries successive seeds until one passes
 * validation, falling back to a hand-made track (which is validated in tests).
 */
export function getValidatedRemix(day: string): Track {
  const hit = remixCache.get(day);
  if (hit) return hit;
  for (let attempt = 0; attempt < 6; attempt++) {
    const track = buildTrack(remixRecipe(day, attempt));
    // Runtime check uses the neutral-physics critter; the test suite covers all passives.
    if (validateTrack(track, { characters: ['moss'] }).ok) {
      remixCache.set(day, track);
      return track;
    }
  }
  const fallback = getTrack(Object.keys(TRACK_RECIPES)[0]);
  remixCache.set(day, fallback);
  return fallback;
}
