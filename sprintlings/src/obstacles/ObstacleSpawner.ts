import { Rng } from '../shared/Rng';
import { Track, type Biome, type GroundPiece, type PlacedSegment, type TrackData } from '../game/Track';
import { SegmentContext, emptyDraft, type TrackDraft } from '../game/TrackSegment';
import { SEGMENT_BY_ID } from './HazardPatterns';
import { hazardExtent } from './ObstacleBase';
import { dsin } from '../shared/DetMath';

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
  addHills(draft, new Rng(recipe.seed ^ 0x51ab), x);
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

/** Hills: length range (u), height range (u) and the clear margin kept around hazards. */
const HILL = { minLen: 9, maxLen: 13, minRise: 0.8, maxRise: 1.5, dipChance: 0.35, margin: 1.5, sub: 12 } as const;

/**
 * Rolls long flat stretches into smooth hills and dips so the run goes up and
 * down on its own, not only by jumping and climbing. Only hazard-free ground
 * with nothing hanging low above it is reshaped; pickups there ride the new
 * surface. The level at either end is unchanged, so the course stays valid.
 */
function addHills(draft: TrackDraft, rng: Rng, length: number): void {
  const busy: [number, number][] = draft.hazards.map((h) => hazardExtent(h));
  const flats = draft.pieces.filter((p) => !p.oneWay && p.y0 === p.y1 && p.x1 - p.x0 >= HILL.minLen + 2 && p.x0 >= 12 && p.x1 <= length - 6);
  for (const p of flats) {
    const out: GroundPiece[] = [];
    let at = p.x0;
    let x = p.x0 + 1 + rng.range(0, 2);
    while (x + HILL.minLen < p.x1 - 1) {
      const len = Math.min(rng.range(HILL.minLen, HILL.maxLen), p.x1 - 1 - x);
      const blocked =
        busy.some(([lo, hi]) => hi > x - HILL.margin && lo < x + len + HILL.margin) ||
        draft.pieces.some((q) => q !== p && q.x1 > x - 1 && q.x0 < x + len + 1 && Math.max(q.y0, q.y1) > p.y0 - 0.5 && Math.min(q.y0, q.y1) < p.y0 + 5);
      if (blocked) {
        x += 1;
        continue;
      }
      const rise = rng.range(HILL.minRise, HILL.maxRise) * (rng.next() < HILL.dipChance ? -0.7 : 1);
      const bump = (bx: number) => {
        const t = (bx - x) / len;
        if (t <= 0 || t >= 1) return 0;
        const sn = dsin(Math.PI * t);
        return rise * sn * sn;
      };
      if (x > at) out.push({ id: draft.nextId++, x0: at, x1: x, y0: p.y0, y1: p.y0, oneWay: false });
      for (let k = 0; k < HILL.sub; k++) {
        const a = x + (len * k) / HILL.sub;
        const b = x + (len * (k + 1)) / HILL.sub;
        out.push({ id: draft.nextId++, x0: a, x1: b, y0: p.y0 + bump(a), y1: p.y0 + bump(b), oneWay: false });
      }
      for (const g of draft.glimmers) if (g.x > x && g.x < x + len) g.y += bump(g.x);
      for (const b of draft.itemBoxes) if (b.x > x && b.x < x + len) b.y += bump(b.x);
      at = x + len;
      x = at + 2 + rng.range(0, 4);
    }
    if (out.length === 0) continue;
    if (at < p.x1) out.push({ id: draft.nextId++, x0: at, x1: p.x1, y0: p.y0, y1: p.y0, oneWay: false });
    draft.pieces.splice(draft.pieces.indexOf(p), 1, ...out);
  }
}
