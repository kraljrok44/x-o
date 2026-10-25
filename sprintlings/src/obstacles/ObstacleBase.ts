import { GameplayConfig } from '../config/GameplayConfig';

/**
 * Track coordinates used by the whole simulation:
 *   s       distance along the track (forward), 0 = start line
 *   lateral sideways offset; lane -1 is at -width, lane 1 at +width
 *   y       height in world units (absolute, includes the track's hills)
 *
 * Lanes are addressed with a bit mask: bit 0 = lane -1, bit 1 = lane 0, bit 2 = lane 1.
 */
export type LaneMask = number;
export const LANE_LEFT = 1;
export const LANE_MID = 2;
export const LANE_RIGHT = 4;
export const ALL_LANES: LaneMask = 7;

export const laneBit = (lane: number): LaneMask => 1 << (lane + 1);
export const maskHasLane = (mask: LaneMask, lane: number): boolean => (mask & laneBit(lane)) !== 0;
export const mirrorMask = (mask: LaneMask): LaneMask =>
  ((mask & LANE_LEFT) << 2) | (mask & LANE_MID) | ((mask & LANE_RIGHT) >> 2);
export function lanesOf(mask: LaneMask): number[] {
  const out: number[] = [];
  for (let l = -1; l <= 1; l++) if (maskHasLane(mask, l)) out.push(l);
  return out;
}

export type HazardKind =
  | 'hurdle'
  | 'wall'
  | 'spikes'
  | 'flame'
  | 'pendulum'
  | 'boulder'
  | 'mud'
  | 'ice'
  | 'boostPad'
  | 'bouncePad';

export interface HazardBase {
  id: number;
  kind: HazardKind;
  /** Centre of the hazard along the track. */
  s: number;
  lanes: LaneMask;
}

export interface HurdleHazard extends HazardBase {
  kind: 'hurdle';
  halfDepth: number;
  height: number;
}

export interface WallHazard extends HazardBase {
  kind: 'wall';
  halfDepth: number;
  height: number;
}

/** Periodic trap. Active while ((t + phase) mod period) < activeTime. */
export interface PeriodicHazard extends HazardBase {
  kind: 'spikes' | 'flame';
  halfDepth: number;
  height: number;
  period: number;
  activeTime: number;
  /** Seconds of visible warning before activating. */
  warnTime: number;
  phase: number;
}

/** Big swinging weight sweeping sideways across the lanes. */
export interface PendulumHazard extends HazardBase {
  kind: 'pendulum';
  halfDepth: number;
  halfWidth: number;
  /** Bottom of the bob above ground; racers can't jump over it. */
  height: number;
  amplitude: number;
  period: number;
  phase: number;
}

/** Boulders that roll toward the racers in one lane, repeating. */
export interface BoulderHazard extends HazardBase {
  kind: 'boulder';
  radius: number;
  /** Boulder spawns at s + travel and rolls back to s - travel/3. */
  travel: number;
  speed: number;
  period: number;
  phase: number;
}

export interface ZoneHazard extends HazardBase {
  kind: 'mud' | 'ice';
  halfDepth: number;
}

export interface PadHazard extends HazardBase {
  kind: 'boostPad' | 'bouncePad';
  halfDepth: number;
}

export type Hazard =
  | HurdleHazard
  | WallHazard
  | PeriodicHazard
  | PendulumHazard
  | BoulderHazard
  | ZoneHazard
  | PadHazard;

/** Axis aligned box in track space, re-used to avoid allocations. */
export interface TrackBox {
  s0: number;
  s1: number;
  l0: number;
  l1: number;
  y0: number;
  y1: number;
}

export function makeBox(): TrackBox {
  return { s0: 0, s1: 0, l0: 0, l1: 0, y0: 0, y1: 0 };
}

export function boxesOverlap(a: TrackBox, b: TrackBox): boolean {
  return a.s0 < b.s1 && a.s1 > b.s0 && a.l0 < b.l1 && a.l1 > b.l0 && a.y0 < b.y1 && a.y1 > b.y0;
}

export function periodicState(h: PeriodicHazard, t: number): 'idle' | 'warn' | 'active' {
  const local = (((t + h.phase) % h.period) + h.period) % h.period;
  if (local < h.activeTime) return 'active';
  if (local > h.period - h.warnTime) return 'warn';
  return 'idle';
}

export function pendulumLateral(h: PendulumHazard, t: number): number {
  return h.amplitude * Math.sin(((t + h.phase) / h.period) * Math.PI * 2);
}

/** Current s of a boulder, or null if no boulder is rolling at time t. */
export function boulderPosition(h: BoulderHazard, t: number): number | null {
  const local = (((t + h.phase) % h.period) + h.period) % h.period;
  const dist = local * h.speed;
  const total = h.travel * (4 / 3);
  if (dist > total) return null;
  return h.s + h.travel - dist;
}

/** Lateral extent [l0, l1] covered by a lane mask (contiguous assumed for walls/zones). */
export function maskLateralExtent(mask: LaneMask, out: { l0: number; l1: number }): void {
  const w = GameplayConfig.lanes.width;
  let lo = 2;
  let hi = -2;
  for (let l = -1; l <= 1; l++) {
    if (maskHasLane(mask, l)) {
      if (l < lo) lo = l;
      if (l > hi) hi = l;
    }
  }
  out.l0 = lo * w - w / 2;
  out.l1 = hi * w + w / 2;
}

/** Hazards that end the racer's momentum (used by the planner and validator). */
export function isDamaging(kind: HazardKind): boolean {
  return kind === 'hurdle' || kind === 'wall' || kind === 'spikes' || kind === 'flame' || kind === 'pendulum' || kind === 'boulder';
}
