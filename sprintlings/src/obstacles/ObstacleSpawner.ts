import { Rng } from '../shared/Rng';
import { Track, type Biome, type PlacedSegment, type TrackData } from '../game/Track';
import { SegmentContext, emptyDraft } from '../game/TrackSegment';
import { SEGMENT_BY_ID } from './HazardPatterns';

export interface SegmentPlacement {
  id: string;
}

export interface TrackRecipe {
  id: string;
  name: string;
  biome: Biome;
  seed: number;
  segments: SegmentPlacement[];
}

/**
 * Builds a playable Track from a recipe: lays segments end to end and lets
 * each place its ground, hazards and pickups. A run-out of flat ground
 * follows the finish line.
 */
export function buildTrack(recipe: TrackRecipe): Track {
  const draft = emptyDraft();
  const rng = new Rng(recipe.seed);
  const placed: PlacedSegment[] = [];
  // Lead-in behind the start line.
  draft.pieces.push({ id: draft.nextId++, x0: -20, x1: 0, y0: 0, y1: 0, oneWay: false });
  let x = 0;
  for (const placement of recipe.segments) {
    const template = SEGMENT_BY_ID[placement.id];
    if (!template) throw new Error(`Unknown segment ${placement.id}`);
    const ctx = new SegmentContext(draft, x, new Rng(rng.int(1, 2 ** 31)), recipe.biome);
    template.build(ctx);
    if (Math.abs(ctx.cursor - template.length) > 1e-6) throw new Error(`Segment ${template.id} builds ${ctx.cursor} u but declares ${template.length}`);
    placed.push({ templateId: template.id, x0: x, x1: x + template.length, difficulty: template.difficulty });
    x += template.length;
  }
  draft.pieces.push({ id: draft.nextId++, x0: x, x1: x + 60, y0: draft.level, y1: draft.level, oneWay: false });
  const data: TrackData = {
    id: recipe.id,
    name: recipe.name,
    biome: recipe.biome,
    seed: recipe.seed,
    length: x,
    pieces: draft.pieces,
    hazards: draft.hazards,
    itemBoxes: draft.itemBoxes,
    glimmers: draft.glimmers,
    segments: placed,
  };
  const track = new Track(data);
  fillCrateGaps(track, () => draft.nextId++);
  return track;
}

/** Longest stretch without loot crates; races stay busy when items keep coming. */
const MAX_CRATE_GAP = 42;

/**
 * Adds a row of three crates wherever a course would otherwise go too long
 * without any, on flat solid ground clear of hazards and low platforms.
 */
function fillCrateGaps(track: Track, nextId: () => number): void {
  const boxes = track.data.itemBoxes;
  const end = track.length - 20;
  let last = 0;
  for (const x of [...boxes.map((b) => b.x), end + MAX_CRATE_GAP].sort((a, b) => a - b)) {
    while (x - last > MAX_CRATE_GAP + 8) {
      const at = crateSpot(track, last + MAX_CRATE_GAP * 0.75, Math.min(x - 10, last + MAX_CRATE_GAP + 6));
      if (at === null) break;
      for (const dx of [0, 1.4, 2.8]) boxes.push({ id: nextId(), x: at.x + dx, y: at.y + 0.9 });
      last = at.x;
    }
    last = Math.max(last, x);
  }
  boxes.sort((a, b) => a.x - b.x);
}

function crateSpot(track: Track, from: number, to: number): { x: number; y: number } | null {
  for (let x = from; x <= to; x += 0.5) {
    const y = track.solidTop(x);
    if (Number.isNaN(y)) continue;
    let ok = true;
    for (let d = -1; d <= 4 && ok; d += 0.5) {
      const g = track.solidTop(x + d);
      // Flat, and nothing (platform or ledge) hanging low over the row.
      if (Number.isNaN(g) || Math.abs(g - y) > 0.05 || track.groundBelow(x + d, y + 3.2, -1) !== g) ok = false;
    }
    if (!ok) continue;
    track.forHazardsNear(x - 3, x + 6, () => {
      ok = false;
    });
    if (ok) return { x, y };
  }
  return null;
}
