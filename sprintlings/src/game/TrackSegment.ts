import type { Rng } from '../shared/Rng';
import {
  ALL_LANES,
  laneBit,
  mirrorMask,
  type Hazard,
  type LaneMask,
} from '../obstacles/ObstacleBase';
import type { Biome, GlimmerDef, GroundSpan, ItemBoxDef } from './Track';
import { GameplayConfig } from '../config/GameplayConfig';

/** Tags used to restrict which segments may follow each other. */
export type SegmentTag = 'start' | 'rest' | 'easy' | 'medium' | 'hard' | 'finale' | 'finish';

/**
 * A hand-authored, reusable piece of track. Positions inside `build` are
 * relative to the segment start (0 .. length) and written for the un-mirrored
 * layout; the context mirrors lanes automatically.
 */
export interface SegmentTemplate {
  id: string;
  length: number;
  /** 0 (rest) .. 5 (finale). */
  difficulty: number;
  tags: SegmentTag[];
  /** Previous segment must carry at least one of these tags (empty = anything). */
  allowedAfter: SegmentTag[];
  /** Next segment must carry at least one of these tags (empty = anything). */
  allowedBefore: SegmentTag[];
  /** Hazard-free distance guaranteed at the start of the segment. */
  minSafeLeadIn: number;
  /** Whether the builder may add gentle hills over this segment. */
  hilly: boolean;
  biomes?: Biome[];
  /** Rules for pickups placed by this segment, documented for designers. */
  pickupRule: string;
  build(ctx: SegmentContext): void;
}

export interface TrackDraft {
  hazards: Hazard[];
  gaps: { s0: number; s1: number; lanes: LaneMask }[];
  ledges: { s0: number; s1: number; lanes: LaneMask; raise: number }[];
  itemBoxes: ItemBoxDef[];
  glimmers: GlimmerDef[];
  nextId: number;
}

export function emptyDraft(): TrackDraft {
  return { hazards: [], gaps: [], ledges: [], itemBoxes: [], glimmers: [], nextId: 1 };
}

const L = (lane: number, mirror: boolean): number => (mirror ? -lane : lane);

/** Helper API handed to SegmentTemplate.build. */
export class SegmentContext {
  constructor(
    readonly draft: TrackDraft,
    readonly s0: number,
    readonly mirror: boolean,
    readonly rng: Rng,
    readonly biome: Biome,
  ) {}

  private m(mask: LaneMask): LaneMask {
    return this.mirror ? mirrorMask(mask) : mask;
  }

  private id(): number {
    return this.draft.nextId++;
  }

  hurdle(ds: number, lanes: LaneMask, height = 0.85): void {
    this.draft.hazards.push({ id: this.id(), kind: 'hurdle', s: this.s0 + ds, lanes: this.m(lanes), halfDepth: 0.3, height });
  }

  wall(ds: number, lanes: LaneMask, halfDepth = 0.55): void {
    if (lanes === ALL_LANES) throw new Error('A wall may never block every lane.');
    this.draft.hazards.push({ id: this.id(), kind: 'wall', s: this.s0 + ds, lanes: this.m(lanes), halfDepth, height: 3.2 });
  }

  spikes(ds: number, lanes: LaneMask, phase = 0, period = 2.4, activeTime = 0.9): void {
    this.draft.hazards.push({
      id: this.id(),
      kind: 'spikes',
      s: this.s0 + ds,
      lanes: this.m(lanes),
      halfDepth: 0.6,
      height: 0.8,
      period,
      activeTime,
      warnTime: 0.6,
      phase,
    });
  }

  flame(ds: number, lanes: LaneMask, phase = 0, period = 2.2, activeTime = 0.8): void {
    this.draft.hazards.push({
      id: this.id(),
      kind: 'flame',
      s: this.s0 + ds,
      lanes: this.m(lanes),
      halfDepth: 0.5,
      height: 4,
      period,
      activeTime,
      warnTime: 0.55,
      phase,
    });
  }

  pendulum(ds: number, phase = 0, period = 2.8): void {
    this.draft.hazards.push({
      id: this.id(),
      kind: 'pendulum',
      s: this.s0 + ds,
      lanes: ALL_LANES,
      halfDepth: 0.45,
      halfWidth: 0.85,
      height: 0.25,
      amplitude: GameplayConfig.lanes.width,
      period,
      phase: this.mirror ? phase + period / 2 : phase,
    });
  }

  boulder(ds: number, lane: number, phase = 0, period = 3.2, speed = 6): void {
    this.draft.hazards.push({
      id: this.id(),
      kind: 'boulder',
      s: this.s0 + ds,
      lanes: laneBit(L(lane, this.mirror)),
      radius: 0.55,
      travel: 9,
      speed,
      period,
      phase,
    });
  }

  zone(kind: 'mud' | 'ice', ds0: number, ds1: number, lanes: LaneMask): void {
    this.draft.hazards.push({
      id: this.id(),
      kind,
      s: this.s0 + (ds0 + ds1) / 2,
      lanes: this.m(lanes),
      halfDepth: (ds1 - ds0) / 2,
    });
  }

  pad(kind: 'boostPad' | 'bouncePad', ds: number, lanes: LaneMask): void {
    this.draft.hazards.push({ id: this.id(), kind, s: this.s0 + ds, lanes: this.m(lanes), halfDepth: 0.7 });
  }

  gap(ds0: number, ds1: number, lanes: LaneMask): void {
    this.draft.gaps.push({ s0: this.s0 + ds0, s1: this.s0 + ds1, lanes: this.m(lanes) });
  }

  ledge(ds0: number, ds1: number, lanes: LaneMask, raise = 1.2): void {
    this.draft.ledges.push({ s0: this.s0 + ds0, s1: this.s0 + ds1, lanes: this.m(lanes), raise });
  }

  itemBoxes(ds: number, lanes: LaneMask, lift = 0.9): void {
    for (let lane = -1; lane <= 1; lane++) {
      if ((lanes & laneBit(lane)) === 0) continue;
      this.draft.itemBoxes.push({ id: this.id(), s: this.s0 + ds, lane: L(lane, this.mirror), lift });
    }
  }

  glimmerLine(ds0: number, ds1: number, lane: number, spacing = 1.6, lift = 0.7): void {
    for (let ds = ds0; ds <= ds1 + 1e-6; ds += spacing) {
      this.draft.glimmers.push({ id: this.id(), s: this.s0 + ds, lane: L(lane, this.mirror), lift });
    }
  }

  /** Glimmers along the arc of a full jump taken at `takeoff`. */
  glimmerArc(takeoff: number, lane: number, count = 5, baseLift = 0.7, velocity: number = GameplayConfig.jump.velocity): void {
    const g = GameplayConfig.jump.gravity;
    const speed = GameplayConfig.movement.baseSpeed;
    const air = (2 * velocity) / g;
    for (let i = 1; i <= count; i++) {
      const t = (air * i) / (count + 1);
      const y = velocity * t - 0.5 * g * t * t;
      this.draft.glimmers.push({ id: this.id(), s: this.s0 + takeoff + speed * t, lane: L(lane, this.mirror), lift: baseLift + y });
    }
  }
}

/** Turns the draft's gap/ledge lists into per-lane ground spans covering [0, length]. */
export function buildLaneGround(draft: TrackDraft, length: number): [GroundSpan[], GroundSpan[], GroundSpan[]] {
  const result: [GroundSpan[], GroundSpan[], GroundSpan[]] = [[], [], []];
  const end = length + 30; // run-out after the finish line
  for (let lane = -1; lane <= 1; lane++) {
    const bit = laneBit(lane);
    // Collect boundaries.
    const cuts = new Set<number>([-10, end]);
    for (const g of draft.gaps) if (g.lanes & bit) (cuts.add(g.s0), cuts.add(g.s1));
    for (const l of draft.ledges) if (l.lanes & bit) (cuts.add(l.s0), cuts.add(l.s1));
    const points = [...cuts].sort((a, b) => a - b);
    const spans: GroundSpan[] = [];
    for (let i = 0; i < points.length - 1; i++) {
      const a = points[i];
      const b = points[i + 1];
      const mid = (a + b) / 2;
      const inGap = draft.gaps.some((g) => g.lanes & bit && mid > g.s0 && mid < g.s1);
      if (inGap) continue;
      let raise = 0;
      for (const l of draft.ledges) if (l.lanes & bit && mid > l.s0 && mid < l.s1) raise = Math.max(raise, l.raise);
      const prev = spans[spans.length - 1];
      if (prev && Math.abs(prev.s1 - a) < 1e-6 && prev.raise === raise) prev.s1 = b;
      else spans.push({ s0: a, s1: b, raise });
    }
    result[lane + 1] = spans;
  }
  return result;
}
