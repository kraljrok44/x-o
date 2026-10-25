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
  return new Track(data);
}
