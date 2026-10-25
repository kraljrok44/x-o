/**
 * Side-view track coordinates used by the whole simulation:
 *   x  distance along the course (forward, left -> right on screen), 0 = start line
 *   y  height (up)
 *
 * Every hazard is placed on the course at build time; `y` is the ground
 * height under it (or its own anchor height for floating hazards).
 */
export type HazardKind =
  | 'log'
  | 'spikes'
  | 'saw'
  | 'crusher'
  | 'flame'
  | 'pendulum'
  | 'boulder'
  | 'mud'
  | 'boostPad'
  | 'spring';

export interface HazardBase {
  id: number;
  kind: HazardKind;
  /** Centre x. */
  x: number;
  /** Ground height under the hazard (filled in by the Track). */
  y: number;
}

/** Low obstacle (log/crate/rock): jump over it or stumble. */
export interface LogHazard extends HazardBase {
  kind: 'log';
  halfWidth: number;
  height: number;
}

export interface SpikesHazard extends HazardBase {
  kind: 'spikes';
  halfWidth: number;
  height: number;
}

/** Spinning blade; optionally moving up/down (axis 'y') or back and forth ('x'). */
export interface SawHazard extends HazardBase {
  kind: 'saw';
  /** Centre height above ground at rest. */
  lift: number;
  radius: number;
  axis: 'none' | 'x' | 'y';
  amplitude: number;
  period: number;
  phase: number;
}

/** Heavy block that periodically slams down onto the path. */
export interface CrusherHazard extends HazardBase {
  kind: 'crusher';
  halfWidth: number;
  /** Bottom of the block when raised, above ground. */
  raisedLift: number;
  period: number;
  /** Seconds the block stays down (dangerous). */
  downTime: number;
  /** Seconds of warning shake before it falls. */
  warnTime: number;
  phase: number;
}

/** Vertical fire/steam jet from a vent. */
export interface FlameHazard extends HazardBase {
  kind: 'flame';
  halfWidth: number;
  height: number;
  period: number;
  activeTime: number;
  warnTime: number;
  phase: number;
}

/** Spiked ball swinging from a pivot above the path. */
export interface PendulumHazard extends HazardBase {
  kind: 'pendulum';
  pivotLift: number;
  length: number;
  /** Max swing angle (radians). */
  amplitude: number;
  radius: number;
  period: number;
  phase: number;
}

/** Boulders rolling toward the racers on flat ground, repeating. */
export interface BoulderHazard extends HazardBase {
  kind: 'boulder';
  radius: number;
  /** Boulder appears at x + travel and rolls to x - travel / 3. */
  travel: number;
  speed: number;
  period: number;
  phase: number;
}

export interface MudHazard extends HazardBase {
  kind: 'mud';
  halfWidth: number;
}

export interface PadHazard extends HazardBase {
  kind: 'boostPad' | 'spring';
  halfWidth: number;
}

export type Hazard =
  | LogHazard
  | SpikesHazard
  | SawHazard
  | CrusherHazard
  | FlameHazard
  | PendulumHazard
  | BoulderHazard
  | MudHazard
  | PadHazard;

const mod = (a: number, p: number) => ((a % p) + p) % p;

export function flameState(h: FlameHazard, t: number): 'idle' | 'warn' | 'active' {
  const local = mod(t + h.phase, h.period);
  if (local < h.activeTime) return 'active';
  if (local > h.period - h.warnTime) return 'warn';
  return 'idle';
}

/**
 * Crusher block bottom height above ground at time t and its state.
 * Cycle: raised -> warn (shake) -> fast drop -> down -> rise.
 */
/** Height of the crusher block. Raised crushers clear a full jump; slammed ones can be jumped over. */
export const CRUSHER_BLOCK = 1.2;
const CRUSH_DROP = 0.12;
const CRUSH_RISE = 0.25;

/** Bottom of the crusher block above ground at time t. */
export function crusherLift(h: CrusherHazard, t: number): number {
  const local = mod(t + h.phase, h.period);
  if (local < CRUSH_DROP) return h.raisedLift * (1 - local / CRUSH_DROP);
  if (local < CRUSH_DROP + h.downTime) return 0;
  if (local < CRUSH_DROP + h.downTime + CRUSH_RISE) return h.raisedLift * ((local - CRUSH_DROP - h.downTime) / CRUSH_RISE);
  return h.raisedLift;
}

/** Crusher cycle: shaking warning right before it drops. */
export function crusherWarning(h: CrusherHazard, t: number): boolean {
  return mod(t + h.phase, h.period) > h.period - h.warnTime;
}

export interface Point {
  x: number;
  y: number;
}

/** Saw centre at time t (writes into `out`, allocation free). */
export function sawCenter(h: SawHazard, t: number, out: Point): Point {
  const off = h.axis === 'none' ? 0 : h.amplitude * Math.sin(((t + h.phase) / h.period) * Math.PI * 2);
  out.x = h.axis === 'x' ? h.x + off : h.x;
  out.y = h.axis === 'y' ? h.y + h.lift + off : h.y + h.lift;
  return out;
}

export function pendulumAngle(h: PendulumHazard, t: number): number {
  return h.amplitude * Math.sin(((t + h.phase) / h.period) * Math.PI * 2);
}

/** Pendulum ball centre at time t (writes into `out`). */
export function pendulumBall(h: PendulumHazard, t: number, out: Point): Point {
  const angle = pendulumAngle(h, t);
  out.x = h.x + Math.sin(angle) * h.length;
  out.y = h.y + h.pivotLift - Math.cos(angle) * h.length;
  return out;
}

/** Current x of a boulder, or null if none is rolling at time t. */
export function boulderPosition(h: BoulderHazard, t: number): number | null {
  const dist = mod(t + h.phase, h.period) * h.speed;
  const total = h.travel * (4 / 3);
  if (dist > total) return null;
  return h.x + h.travel - dist;
}

/** Hazards that stop momentum (used by the planner and validator). */
export function isDamaging(kind: HazardKind): boolean {
  return kind !== 'mud' && kind !== 'boostPad' && kind !== 'spring';
}

/** Track-space x range a hazard can ever occupy. */
export function hazardExtent(h: Hazard): [number, number] {
  switch (h.kind) {
    case 'boulder':
      return [h.x - h.travel / 3 - h.radius - 1, h.x + h.travel + h.radius + 1];
    case 'saw':
      return [h.x - h.radius - (h.axis === 'x' ? h.amplitude : 0), h.x + h.radius + (h.axis === 'x' ? h.amplitude : 0)];
    case 'pendulum':
      return [h.x - h.length - h.radius, h.x + h.length + h.radius];
    default:
      return [h.x - h.halfWidth, h.x + h.halfWidth];
  }
}
