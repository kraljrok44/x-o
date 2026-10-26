import { Rng, hashString } from '../shared/Rng';
import { SEGMENTS, SEGMENT_BY_ID } from '../obstacles/HazardPatterns';
import { buildTrack, type SegmentPlacement, type TrackRecipe } from '../obstacles/ObstacleSpawner';
import type { Biome, Track } from './Track';
import type { SegmentTemplate } from './TrackSegment';

export interface TrackInfo {
  id: string;
  name: string;
  biome: Biome;
  description: string;
  /** Account level needed before the track can be picked. */
  unlockLevel: number;
}

/** The three hand-made tracks (design document section 6). */
export const TRACK_RECIPES: Record<string, TrackRecipe & { description: string; unlockLevel: number }> = {
  mossy_hollow: {
    id: 'mossy_hollow',
    name: 'Dusty Gulch',
    biome: 'forest',
    seed: 1101,
    unlockLevel: 1,
    description: 'Golden prairie trails, barrels, cactus patches, a muddy creek and rooftop hops past the ranch.',
    segments: [
      { id: 'start_meadow' },
      { id: 'log_hop' },
      { id: 'mud_bog' },
      { id: 'item_row' },
      { id: 'gap_hop' },
      { id: 'high_road' },
      { id: 'step_up' },
      { id: 'rest_glade' },
      { id: 'pendulum_pass' },
      { id: 'boost_run' },
      { id: 'item_row' },
      { id: 'cactus_patch' },
      { id: 'rooftops' },
      { id: 'rest_glade' },
      { id: 'bridge_jump' },
      { id: 'spring_hop' },
      { id: 'item_row' },
      { id: 'geyser_bog' },
      { id: 'finale_gauntlet' },
      { id: 'finish_line' },
    ],
  },
  sunscar_canyon: {
    id: 'sunscar_canyon',
    name: 'Red Rock Run',
    biome: 'canyon',
    seed: 2202,
    unlockLevel: 2,
    description: 'Campfire vents, rolling barrels, red-rock stairs and springboards over the canyon.',
    segments: [
      { id: 'start_meadow' },
      { id: 'spike_strip' },
      { id: 'double_gap' },
      { id: 'boulder_roll' },
      { id: 'item_row' },
      { id: 'vent_row' },
      { id: 'spring_chasm' },
      { id: 'rest_glade' },
      { id: 'stairs' },
      { id: 'high_road' },
      { id: 'item_row' },
      { id: 'barrel_alley' },
      { id: 'rest_glade' },
      { id: 'saw_steps' },
      { id: 'item_row' },
      { id: 'cactus_patch' },
      { id: 'rooftops' },
      { id: 'boost_run' },
      { id: 'finale_gauntlet' },
      { id: 'finish_line' },
    ],
  },
  glimmerdeep_vale: {
    id: 'glimmerdeep_vale',
    name: 'Moonlit Mine',
    biome: 'crystal',
    seed: 3303,
    unlockLevel: 4,
    description: 'Stamp mills, sawmill blades and mesa hops by lantern light at the old gold mine.',
    segments: [
      { id: 'start_meadow' },
      { id: 'saw_dip' },
      { id: 'crusher_alley' },
      { id: 'item_row' },
      { id: 'floating_isles' },
      { id: 'spring_chasm' },
      { id: 'rest_glade' },
      { id: 'high_road' },
      { id: 'pendulum_pass' },
      { id: 'log_hop' },
      { id: 'item_row' },
      { id: 'rooftops' },
      { id: 'geyser_bog' },
      { id: 'rest_glade' },
      { id: 'barrel_alley' },
      { id: 'item_row' },
      { id: 'bridge_jump' },
      { id: 'spring_hop' },
      { id: 'finale_gauntlet' },
      { id: 'finish_line' },
    ],
  },
};

export const TRACK_IDS = Object.keys(TRACK_RECIPES);

export function trackInfo(id: string): TrackInfo {
  const r = TRACK_RECIPES[id];
  if (r) return { id: r.id, name: r.name, biome: r.biome, description: r.description, unlockLevel: r.unlockLevel };
  if (id.startsWith('remix_')) {
    const biome = remixBiome(parseRemixId(id).day);
    return { id, name: 'Daily Trail', biome, description: 'A fresh validated track every day.', unlockLevel: 3 };
  }
  throw new Error(`Unknown track ${id}`);
}

const cache = new Map<string, Track>();

export function getTrack(id: string): Track {
  let t = cache.get(id);
  if (t) return t;
  if (TRACK_RECIPES[id]) t = buildTrack(TRACK_RECIPES[id]);
  else if (id.startsWith('remix_')) {
    const { day, attempt } = parseRemixId(id);
    t = buildTrack(remixRecipe(day, attempt));
  }
  else throw new Error(`Unknown track ${id}`);
  cache.set(id, t);
  return t;
}

/** Remix ids look like "remix_2026-10-25_0" (day + validation attempt). */
export function parseRemixId(id: string): { day: string; attempt: number } {
  const m = /^remix_(\d{4}-\d{2}-\d{2})_(\d)$/.exec(id);
  if (!m) throw new Error(`Bad remix id ${id}`);
  return { day: m[1], attempt: Number(m[2]) };
}

function remixBiome(day: string): Biome {
  const biomes: Biome[] = ['forest', 'canyon', 'crystal'];
  return biomes[hashString(day) % 3];
}

function fits(prev: SegmentTemplate | undefined, next: SegmentTemplate): boolean {
  if (!prev) return true;
  if (prev.id === next.id) return false;
  if (next.allowedAfter.length && !next.allowedAfter.some((t) => prev.tags.includes(t))) return false;
  if (prev.allowedBefore.length && !prev.allowedBefore.some((t) => next.tags.includes(t))) return false;
  return true;
}

/**
 * Procedural "Daily Remix": a seeded sequence of hand-made segments chosen
 * under the adjacency rules and a difficulty budget. The validator (and the
 * unit tests over many seeds) prove every remix is passable.
 */
export function remixRecipe(day: string, attempt = 0): TrackRecipe {
  const seed = hashString(`remix:${day}:${attempt}`);
  const rng = new Rng(seed);
  const pool = SEGMENTS.filter((s) => !s.tags.includes('start') && !s.tags.includes('finish') && !s.tags.includes('finale'));
  const out: SegmentPlacement[] = [{ id: 'start_meadow' }];
  let length = SEGMENT_BY_ID.start_meadow.length;
  let prev: SegmentTemplate = SEGMENT_BY_ID.start_meadow;
  let sinceRest = 0;
  // ~600 u of course: a 60-90 s race at running speed.
  const target = 540;
  while (length < target) {
    const candidates = pool.filter((s) => {
      if (!fits(prev, s)) return false;
      if (sinceRest >= 3 && !s.tags.includes('rest')) return false;
      if (s.difficulty >= 4 && length < 90) return false;
      return true;
    });
    const next = rng.pick(candidates);
    out.push({ id: next.id });
    length += next.length;
    sinceRest = next.tags.includes('rest') ? 0 : sinceRest + 1;
    prev = next;
  }
  if (!fits(prev, SEGMENT_BY_ID.finale_gauntlet)) out.push({ id: 'item_row' });
  out.push({ id: 'finale_gauntlet' }, { id: 'finish_line' });
  return { id: `remix_${day}_${attempt}`, name: 'Daily Trail', biome: remixBiome(day), seed, segments: out };
}
