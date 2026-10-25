import { GameplayConfig } from '../config/GameplayConfig';
import {
  boulderPosition,
  maskHasLane,
  pendulumLateral,
  periodicState,
  type Hazard,
} from '../obstacles/ObstacleBase';
import { laneOfLateral, type Track } from '../game/Track';
import type { RacerBody } from '../game/RaceState';

/** Half width of a hazard inside one lane cell (cells are lane width wide). */
export const HAZARD_LANE_HALF_WIDTH = 1.05;

export interface ContactResult {
  /** Most severe blocking/damaging hazard touched this tick, or null. */
  hit: Hazard | null;
  /** True when `hit` was entered from the side rather than the front. */
  fromSide: boolean;
  /** Terrain zone the racer stands in: 0 none, 1 mud, 3 ice. */
  terrain: number;
  boostPad: Hazard | null;
  bouncePad: Hazard | null;
}

export function makeContactResult(): ContactResult {
  return { hit: null, fromSide: false, terrain: 0, boostPad: null, bouncePad: null };
}

const hb = GameplayConfig.hitbox;
const laneW = GameplayConfig.lanes.width;

function groundAtHazard(track: Track, h: Hazard, lane: number): number {
  const g = track.groundAtLane(h.s, lane);
  return g === null ? track.baseline(h.s) : g;
}

/** Lateral overlap between the racer and lane cell `lane`. */
function overlapsLane(lateral: number, lane: number): boolean {
  const c = lane * laneW;
  return lateral + hb.halfWidth > c - HAZARD_LANE_HALF_WIDTH && lateral - hb.halfWidth < c + HAZARD_LANE_HALF_WIDTH;
}

/**
 * Tests a racer against every static/timed hazard near it at time `t`.
 * `prevS`/`prevLateral` are last tick's values, used to tell front hits from
 * side hits. Writes into `out` to avoid allocations.
 */
export function resolveHazardContacts(
  track: Track,
  body: RacerBody,
  prevS: number,
  prevLateral: number,
  t: number,
  out: ContactResult,
): ContactResult {
  out.hit = null;
  out.fromSide = false;
  out.terrain = 0;
  out.boostPad = null;
  out.bouncePad = null;
  const s0 = body.s - hb.halfDepth;
  const s1 = body.s + hb.halfDepth;
  const y0 = body.y;
  const y1 = body.y + hb.height;
  const centreLane = laneOfLateral(body.lateral);

  const hazards = track.data.hazards;
  const end = s1 + 2 + track.maxHazardReach;
  for (let i = track.firstHazardIndex(s0 - 2); i < hazards.length && hazards[i].s <= end; i++) {
    testHazard(track, hazards[i], body, prevS, prevLateral, t, out, s0, s1, y0, y1, centreLane);
  }
  return out;
}

function testHazard(
  track: Track,
  h: Hazard,
  body: RacerBody,
  prevS: number,
  prevLateral: number,
  t: number,
  out: ContactResult,
  s0: number,
  s1: number,
  y0: number,
  y1: number,
  centreLane: number,
): void {
    switch (h.kind) {
      case 'mud':
      case 'ice': {
        if (!body.grounded || !maskHasLane(h.lanes, centreLane)) return;
        if (body.s < h.s - h.halfDepth || body.s > h.s + h.halfDepth) return;
        out.terrain = h.kind === 'mud' ? 1 : 3;
        return;
      }
      case 'boostPad':
      case 'bouncePad': {
        if (!body.grounded || !maskHasLane(h.lanes, centreLane)) return;
        if (s1 < h.s - h.halfDepth || s0 > h.s + h.halfDepth) return;
        if (h.kind === 'boostPad') out.boostPad = h;
        else out.bouncePad = h;
        return;
      }
      case 'hurdle':
      case 'wall':
      case 'spikes':
      case 'flame': {
        if (h.kind === 'spikes' || h.kind === 'flame') {
          if (periodicState(h, t) !== 'active') return;
        }
        if (s1 <= h.s - h.halfDepth || s0 >= h.s + h.halfDepth) return;
        for (let lane = -1; lane <= 1; lane++) {
          if (!maskHasLane(h.lanes, lane) || !overlapsLane(body.lateral, lane)) continue;
          const g = groundAtHazard(track, h, lane);
          if (y0 >= g + h.height || y1 <= g) continue;
          record(out, h, prevS, prevLateral, lane);
          return;
        }
        return;
      }
      case 'pendulum': {
        if (s1 <= h.s - h.halfDepth || s0 >= h.s + h.halfDepth) return;
        const p = pendulumLateral(h, t);
        if (body.lateral + hb.halfWidth <= p - h.halfWidth || body.lateral - hb.halfWidth >= p + h.halfWidth) return;
        const g = track.baseline(h.s);
        if (y0 >= g + h.height + 2.6 || y1 <= g + h.height) return;
        if (!out.hit) out.hit = h;
        return;
      }
      case 'boulder': {
        const bs = boulderPosition(h, t);
        if (bs === null) return;
        if (s1 <= bs - h.radius || s0 >= bs + h.radius) return;
        const lane = h.lanes === 1 ? -1 : h.lanes === 2 ? 0 : 1;
        const c = lane * laneW;
        if (body.lateral + hb.halfWidth <= c - h.radius || body.lateral - hb.halfWidth >= c + h.radius) return;
        const g = groundAtHazard(track, h, lane);
        if (y0 >= g + h.radius * 2 || y1 <= g) return;
        if (!out.hit) out.hit = h;
        return;
      }
    }
}

function record(out: ContactResult, h: Hazard, prevS: number, prevLateral: number, lane: number): void {
  // Walls take priority: they also block movement.
  if (out.hit && out.hit.kind === 'wall') return;
  out.hit = h;
  if (h.kind === 'wall' && 'halfDepth' in h) {
    const wasInFront = prevS + hb.halfDepth <= h.s - h.halfDepth + 1e-6;
    out.fromSide = !wasInFront && !overlapsLane(prevLateral, lane);
  }
}

/** Stun length for a hazard kind before passive modifiers. */
export function stunFor(kind: Hazard['kind']): number {
  const st = GameplayConfig.stun;
  switch (kind) {
    case 'hurdle':
      return st.hurdle;
    case 'wall':
      return st.wall;
    case 'spikes':
    case 'flame':
      return st.trap;
    case 'pendulum':
      return st.pendulum;
    case 'boulder':
      return st.hurdle + 0.1;
    default:
      return 0;
  }
}
