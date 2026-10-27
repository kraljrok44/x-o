import { GameplayConfig } from '../config/GameplayConfig';
import { RaceSimulation } from './RaceManager';
import { getTrack, remixRecipe, TRACK_RECIPES } from './TrackManager';
import { buildTrack } from '../obstacles/ObstacleSpawner';
import { SEGMENT_BY_ID } from '../obstacles/HazardPatterns';
import { isDamaging } from '../obstacles/ObstacleBase';
import { Track } from './Track';
import type { CharacterId } from '../player/CharacterDefinition';

export interface ValidationReport {
  ok: boolean;
  problems: string[];
  /** Finish time of the perfect solver, if it finished. */
  solverTime: number | null;
  solverIncidents: number;
}

/** Widest pit a normal running jump must clear (a full jump travels ~7.5 u). */
const MAX_PIT = 4.6;
const MAX_SPRUNG_PIT = 10;
const MIN_HURDLE_GAP = 6;
/** Characters whose passives change movement physics or timing. */
const SOLVER_CHARACTERS: readonly CharacterId[] = ['moss', 'kip', 'pebble', 'ember'];

/**
 * Proves a track is passable at normal speed:
 *  1. static rules (pit widths, segment adjacency, lead-ins, landing room),
 *  2. a "perfect" planner bot must finish solo with zero hits and falls,
 *     for every character (passives change physics slightly).
 */
export function validateTrack(
  track: Track,
  opts: { solver?: boolean; characters?: readonly CharacterId[] } = {},
): ValidationReport {
  const problems: string[] = [];
  const d = track.data;

  // Pits must be jumpable at running speed unless a spring launches you across.
  let pitStart: number | null = null;
  for (let x = -10; x <= d.length + 20; x += 0.25) {
    // Clouds and planks over a pit count as stepping stones.
    const solid = !Number.isNaN(track.groundBelow(x, 1e9, -1, true));
    if (!solid && pitStart === null) pitStart = x;
    if (solid && pitStart !== null) {
      const width = x - pitStart;
      const sprung = d.hazards.some((h) => h.kind === 'spring' && h.x <= pitStart! && h.x > pitStart! - 6);
      if (width > MAX_PIT && !sprung) problems.push(`pit ${pitStart.toFixed(1)}..${x.toFixed(1)} too wide without a spring`);
      if (width > MAX_SPRUNG_PIT) problems.push(`pit ${pitStart.toFixed(1)}..${x.toFixed(1)} too wide even with a spring`);
      pitStart = null;
    }
  }
  if (pitStart !== null) problems.push('track ends over a pit');
  if (Number.isNaN(track.solidTop(d.length)) || Number.isNaN(track.solidTop(d.length + 10))) problems.push('no ground after the finish line');

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
    const x0 = d.segments[i].x0;
    for (const h of d.hazards) {
      if (h.x >= x0 && h.x < x0 + seg.minSafeLeadIn && isDamaging(h.kind)) {
        problems.push(`hazard ${h.id} inside lead-in of ${seg.id}`);
      }
    }
  }

  // Two ground hurdles on the same level need landing room between them.
  const jumpers = d.hazards.filter((h) => h.kind === 'log' || h.kind === 'spikes');
  for (let i = 1; i < jumpers.length; i++) {
    const a = jumpers[i - 1];
    const b = jumpers[i];
    const gap = b.x - a.x;
    if (Math.abs(a.y - b.y) < 0.3 && gap < MIN_HURDLE_GAP && gap > 0.01) {
      problems.push(`hazards ${a.id} and ${b.id} only ${gap.toFixed(1)}u apart`);
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
    // Runtime check uses the neutral-physics monster; the test suite covers all passives.
    if (validateTrack(track, { characters: ['moss'] }).ok) {
      remixCache.set(day, track);
      return track;
    }
  }
  const fallback = getTrack(Object.keys(TRACK_RECIPES)[0]);
  remixCache.set(day, fallback);
  return fallback;
}
