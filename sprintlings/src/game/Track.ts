import { GameplayConfig } from '../config/GameplayConfig';
import { smoothstep } from '../shared/math';
import type { Hazard } from '../obstacles/ObstacleBase';

export type Biome = 'forest' | 'canyon' | 'crystal';

/** Solid ground in one lane between s0 and s1, raised `raise` above the baseline. */
export interface GroundSpan {
  s0: number;
  s1: number;
  raise: number;
}

export interface ItemBoxDef {
  id: number;
  s: number;
  lane: number;
  /** Height above local ground. */
  lift: number;
}

export interface GlimmerDef {
  id: number;
  s: number;
  lane: number;
  lift: number;
}

export interface HeightKey {
  s: number;
  h: number;
}

/** Visual-only heading change rate (radians per unit) starting at s. */
export interface CurveKey {
  s: number;
  k: number;
}

export interface PlacedSegment {
  templateId: string;
  s0: number;
  s1: number;
  mirror: boolean;
  difficulty: number;
}

export interface TrackData {
  id: string;
  name: string;
  biome: Biome;
  seed: number;
  length: number;
  laneGround: [GroundSpan[], GroundSpan[], GroundSpan[]];
  hazards: Hazard[];
  itemBoxes: ItemBoxDef[];
  glimmers: GlimmerDef[];
  heightKeys: HeightKey[];
  curveKeys: CurveKey[];
  segments: PlacedSegment[];
}

/**
 * Immutable, query-optimised view of a track used by the simulation, the AI
 * planner, the validator and the renderer.
 */
export class Track {
  readonly data: TrackData;
  readonly length: number;
  /** Largest distance any hazard reaches from its centre `s`. */
  readonly maxHazardReach: number;

  constructor(data: TrackData) {
    this.data = data;
    this.length = data.length;
    data.hazards.sort((a, b) => a.s - b.s);
    for (const lane of data.laneGround) lane.sort((a, b) => a.s0 - b.s0);
    data.heightKeys.sort((a, b) => a.s - b.s);
    let reach = 0;
    for (const h of data.hazards) {
      const [lo, hi] = hazardExtent(h);
      reach = Math.max(reach, h.s - lo, hi - h.s);
    }
    this.maxHazardReach = reach;
  }

  get biome(): Biome {
    return this.data.biome;
  }

  /** Smooth baseline height of the track (hills). */
  baseline(s: number): number {
    const keys = this.data.heightKeys;
    if (keys.length === 0) return 0;
    if (s <= keys[0].s) return keys[0].h;
    for (let i = 0; i < keys.length - 1; i++) {
      const a = keys[i];
      const b = keys[i + 1];
      if (s <= b.s) return a.h + (b.h - a.h) * smoothstep(a.s, b.s, s);
    }
    return keys[keys.length - 1].h;
  }

  /** Ground height in a lane, or null over a gap. */
  groundAtLane(s: number, lane: number): number | null {
    const spans = this.data.laneGround[lane + 1];
    // Binary search for the last span starting at or before s.
    let lo = 0;
    let hi = spans.length - 1;
    let found = -1;
    while (lo <= hi) {
      const mid = (lo + hi) >> 1;
      if (spans[mid].s0 <= s) {
        found = mid;
        lo = mid + 1;
      } else hi = mid - 1;
    }
    if (found < 0) return null;
    const span = spans[found];
    if (s > span.s1) return null;
    return this.baseline(s) + span.raise;
  }

  groundAt(s: number, lateral: number): number | null {
    return this.groundAtLane(s, laneOfLateral(lateral));
  }

  /**
   * Index of the first hazard that may overlap s >= `s0`. Iterate from here
   * while `hazards[i].s <= s1 + maxHazardReach` (allocation free, hazards are
   * sorted by s).
   */
  firstHazardIndex(s0: number): number {
    const hz = this.data.hazards;
    const target = s0 - this.maxHazardReach;
    let lo = 0;
    let hi = hz.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (hz[mid].s < target) lo = mid + 1;
      else hi = mid;
    }
    return lo;
  }

  /** Convenience iterator for non-hot paths. */
  forHazardsNear(s0: number, s1: number, visit: (h: Hazard) => void): void {
    const hz = this.data.hazards;
    const end = s1 + this.maxHazardReach;
    for (let i = this.firstHazardIndex(s0); i < hz.length && hz[i].s <= end; i++) {
      const [lo, hi] = hazardExtent(hz[i]);
      if (hi >= s0 && lo <= s1) visit(hz[i]);
    }
  }

  /**
   * Where a racer reappears after falling: the first solid ground at or after
   * `fromS` with a clear stretch, preferring the racer's lane.
   */
  findRespawn(fromS: number, preferredLane: number): { s: number; lane: number } {
    const lanesByPreference = [preferredLane, 0, -1, 1].filter((l, i, arr) => arr.indexOf(l) === i);
    for (let s = fromS; s < this.length; s += 0.5) {
      for (const lane of lanesByPreference) {
        if (this.isClearGround(s, lane, 2.5)) return { s: s + GameplayConfig.fall.respawnOffset, lane };
      }
    }
    return { s: Math.min(fromS, this.length - 1), lane: 0 };
  }

  private isClearGround(s: number, lane: number, len: number): boolean {
    const h0 = this.groundAtLane(s, lane);
    if (h0 === null) return false;
    for (let d = 0.5; d <= len; d += 0.5) {
      const h = this.groundAtLane(s + d, lane);
      if (h === null || Math.abs(h - h0) > 0.3) return false;
    }
    let blocked = false;
    this.forHazardsNear(s - 1, s + len + 1, (hz) => {
      if (hz.kind === 'mud' || hz.kind === 'ice' || hz.kind === 'boostPad') return;
      const [lo, hi] = hazardExtent(hz);
      if (hi > s - 1 && lo < s + len && (hz.lanes & (1 << (lane + 1))) !== 0) blocked = true;
    });
    return !blocked;
  }
}

export function laneOfLateral(lateral: number): number {
  const half = GameplayConfig.lanes.width / 2;
  if (lateral < -half) return -1;
  if (lateral > half) return 1;
  return 0;
}

/** Track-space s-range a hazard can ever occupy. */
export function hazardExtent(h: Hazard): [number, number] {
  switch (h.kind) {
    case 'boulder':
      return [h.s - h.travel / 3 - h.radius - 1, h.s + h.travel + h.radius + 1];
    case 'hurdle':
    case 'wall':
    case 'spikes':
    case 'flame':
    case 'pendulum':
    case 'mud':
    case 'ice':
    case 'boostPad':
    case 'bouncePad':
      return [h.s - h.halfDepth, h.s + h.halfDepth];
  }
}
