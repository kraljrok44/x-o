import { GameplayConfig } from '../config/GameplayConfig';
import {
  boulderPosition,
  CRUSHER_BLOCK,
  crusherLift,
  flameState,
  pendulumBall,
  sawCenter,
  type Hazard,
  type Point,
} from '../obstacles/ObstacleBase';
import type { Track } from '../game/Track';
import type { RacerBody } from '../game/RaceState';

export interface ContactResult {
  /** Damaging hazard touched this tick, or null. */
  hit: Hazard | null;
  /** Terrain the racer stands in: 0 none, 1 mud. */
  terrain: number;
  boostPad: Hazard | null;
  spring: Hazard | null;
}

export function makeContactResult(): ContactResult {
  return { hit: null, terrain: 0, boostPad: null, spring: null };
}

const hb = GameplayConfig.hitbox;
const tmp: Point = { x: 0, y: 0 };

/** Racer box vs circle overlap. */
function circleHit(body: RacerBody, cx: number, cy: number, r: number): boolean {
  const nx = Math.max(body.x - hb.halfWidth, Math.min(cx, body.x + hb.halfWidth));
  const ny = Math.max(body.y, Math.min(cy, body.y + hb.height));
  const dx = cx - nx;
  const dy = cy - ny;
  return dx * dx + dy * dy < r * r;
}

/** Racer box vs axis-aligned box. */
function boxHit(body: RacerBody, x0: number, x1: number, y0: number, y1: number): boolean {
  return body.x + hb.halfWidth > x0 && body.x - hb.halfWidth < x1 && body.y + hb.height > y0 && body.y < y1;
}

/**
 * Tests a racer against every hazard near it at time t. Writes into `out`
 * to avoid allocations.
 */
export function resolveHazardContacts(track: Track, body: RacerBody, t: number, out: ContactResult): ContactResult {
  out.hit = null;
  out.terrain = 0;
  out.boostPad = null;
  out.spring = null;
  const hazards = track.data.hazards;
  const x0 = body.x - hb.halfWidth - 1;
  const end = body.x + hb.halfWidth + 1 + track.maxHazardReach;
  for (let i = track.firstHazardIndex(x0); i < hazards.length && hazards[i].x <= end; i++) {
    const h = hazards[i];
    switch (h.kind) {
      case 'mud':
        if (body.grounded && Math.abs(body.x - h.x) < h.halfWidth && Math.abs(body.y - h.y) < 0.2) out.terrain = 1;
        break;
      case 'boostPad':
      case 'spring':
        if (body.grounded && Math.abs(body.x - h.x) < h.halfWidth + hb.halfWidth * 0.5 && Math.abs(body.y - h.y) < 0.2) {
          if (h.kind === 'boostPad') out.boostPad = h;
          else out.spring = h;
        }
        break;
      case 'log':
      case 'spikes':
        if (boxHit(body, h.x - h.halfWidth, h.x + h.halfWidth, h.y, h.y + h.height)) out.hit = h;
        break;
      case 'flame':
        if (flameState(h, t) === 'active' && boxHit(body, h.x - h.halfWidth, h.x + h.halfWidth, h.y, h.y + h.height)) out.hit = h;
        break;
      case 'crusher': {
        // Only a slammed block hurts: a raised one clears even a full jump, and
        // jumping over the slammed block always works, so every arrival time
        // has an answer.
        const lift = crusherLift(h, t);
        if (lift <= 0.3 && boxHit(body, h.x - h.halfWidth, h.x + h.halfWidth, h.y, h.y + lift + CRUSHER_BLOCK)) out.hit = h;
        break;
      }
      case 'saw': {
        const c = sawCenter(h, t, tmp);
        if (circleHit(body, c.x, c.y, h.radius)) out.hit = h;
        break;
      }
      case 'pendulum': {
        const c = pendulumBall(h, t, tmp);
        if (circleHit(body, c.x, c.y, h.radius)) out.hit = h;
        break;
      }
      case 'boulder': {
        const bx = boulderPosition(h, t);
        if (bx !== null) {
          const g = track.groundBelow(bx, 50, -1, false);
          if (!Number.isNaN(g) && circleHit(body, bx, g + h.radius, h.radius)) out.hit = h;
        }
        break;
      }
    }
  }
  return out;
}

/** Stun length for a hazard kind before passive modifiers. */
export function stunFor(kind: Hazard['kind']): number {
  const st = GameplayConfig.stun;
  switch (kind) {
    case 'log':
      return st.log;
    case 'spikes':
      return st.spikes;
    case 'saw':
      return st.saw;
    case 'crusher':
      return st.crusher;
    case 'flame':
      return st.flame;
    case 'pendulum':
      return st.pendulum;
    case 'boulder':
      return st.boulder;
    default:
      return 0;
  }
}
