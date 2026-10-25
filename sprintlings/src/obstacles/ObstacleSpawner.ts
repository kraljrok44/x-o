import { Rng } from '../shared/Rng';
import { Track, type Biome, type CurveKey, type HeightKey, type PlacedSegment, type TrackData } from '../game/Track';
import { SegmentContext, buildLaneGround, emptyDraft } from '../game/TrackSegment';
import { SEGMENT_BY_ID } from './HazardPatterns';

export interface SegmentPlacement {
  id: string;
  mirror?: boolean;
}

export interface TrackRecipe {
  id: string;
  name: string;
  biome: Biome;
  seed: number;
  segments: SegmentPlacement[];
}

/**
 * Builds a playable Track from a recipe: lays segments end to end, lets each
 * place its hazards and pickups, then derives lane ground, hills and the
 * (visual-only) curvature.
 */
export function buildTrack(recipe: TrackRecipe): Track {
  const draft = emptyDraft();
  const rng = new Rng(recipe.seed);
  const placed: PlacedSegment[] = [];
  const heightKeys: HeightKey[] = [{ s: -10, h: 0 }];
  const curveKeys: CurveKey[] = [{ s: -10, k: 0 }];
  let s = 0;
  let h = 0;
  for (const placement of recipe.segments) {
    const template = SEGMENT_BY_ID[placement.id];
    if (!template) throw new Error(`Unknown segment ${placement.id}`);
    const mirror = placement.mirror ?? false;
    const ctx = new SegmentContext(draft, s, mirror, new Rng(rng.int(1, 2 ** 31)), recipe.biome);
    template.build(ctx);
    placed.push({ templateId: template.id, s0: s, s1: s + template.length, mirror, difficulty: template.difficulty });

    heightKeys.push({ s, h });
    if (template.hilly) {
      let delta = rng.range(-1.4, 1.4);
      if (h + delta > 3.5 || h + delta < -2.5) delta = -delta;
      h += delta;
    }
    // Visual curvature: gentle bends, straighter on hard segments.
    const maxK = template.difficulty >= 4 ? 0.004 : 0.011;
    curveKeys.push({ s, k: rng.range(-maxK, maxK) });
    s += template.length;
  }
  heightKeys.push({ s, h });
  heightKeys.push({ s: s + 40, h });
  curveKeys.push({ s, k: 0 });

  const data: TrackData = {
    id: recipe.id,
    name: recipe.name,
    biome: recipe.biome,
    seed: recipe.seed,
    length: s,
    laneGround: buildLaneGround(draft, s),
    hazards: draft.hazards,
    itemBoxes: draft.itemBoxes,
    glimmers: draft.glimmers,
    heightKeys: dedupeKeys(heightKeys),
    curveKeys,
    segments: placed,
  };
  return new Track(data);
}

function dedupeKeys(keys: HeightKey[]): HeightKey[] {
  const out: HeightKey[] = [];
  for (const k of keys) {
    const prev = out[out.length - 1];
    if (prev && Math.abs(prev.s - k.s) < 1e-6) prev.h = k.h;
    else out.push({ ...k });
  }
  return out;
}
