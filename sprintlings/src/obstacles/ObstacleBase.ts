import { dcos, dsin } from '../shared/DetMath';

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
  | 'spring'
  | 'beam';

export interface HazardBase {
  id: number;
  kind: HazardKind;
  x: number;
  y: number;
  onTop?: number;
}

export interface BeamHazard extends HazardBase {
  kind: 'beam';
  halfWidth: number;
  clearance: number;
  top: number;
}

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

export interface SawHazard extends HazardBase {
  kind: 'saw';
  lift: number;
  radius: number;
  axis: 'none' | 'x' | 'y';
  amplitude: number;
  period: number;
  phase: number;
}

export interface CrusherHazard extends HazardBase {
  kind: 'crusher';
  halfWidth: number;
  raisedLift: number;
  period: number;
  downTime: number;
  warnTime: number;
  phase: number;
}

export interface FlameHazard extends HazardBase {
  kind: 'flame';
  halfWidth: number;
  height: number;
  period: number;
  activeTime: number;
  warnTime: number;
  phase: number;
}

export interface PendulumHazard extends HazardBase {
  kind: 'pendulum';
  pivotLift: number;
  length: number;
  amplitude: number;
  radius: number;
  period: number;
  phase: number;
}

export interface BoulderHazard extends HazardBase {
  kind: 'boulder';
  radius: number;
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
  | PadHazard
  | BeamHazard;

const mod = (a: number, p: number) => ((a % p) + p) % p;

export function flameState(h: FlameHazard, t: number): 'idle' | 'warn' | 'active' {
  const local = mod(t + h.phase, h.period);
  if (local < h.activeTime) return 'active';
  if (local > h.period - h.warnTime) return 'warn';
  return 'idle';
}

export const CRUSHER_BLOCK = 1.2;
const CRUSH_DROP = 0.12;
const CRUSH_RISE = 0.25;

export function crusherLift(h: CrusherHazard, t: number): number {
  const local = mod(t + h.phase, h.period);
  if (local < CRUSH_DROP) return h.raisedLift * (1 - local / CRUSH_DROP);
  if (local < CRUSH_DROP + h.downTime) return 0;
  if (local < CRUSH_DROP + h.downTime + CRUSH_RISE) return h.raisedLift * ((local - CRUSH_DROP - h.downTime) / CRUSH_RISE);
  return h.raisedLift;
}

export function crusherWarning(h: CrusherHazard, t: number): boolean {
  return mod(t + h.phase, h.period) > h.period - h.warnTime;
}

export interface Point {
  x: number;
  y: number;
}

export function sawCenter(h: SawHazard, t: number, out: Point): Point {
  const off = h.axis === 'none' ? 0 : h.amplitude * dsin(((t + h.phase) / h.period) * Math.PI * 2);
  out.x = h.axis === 'x' ? h.x + off : h.x;
  out.y = h.axis === 'y' ? h.y + h.lift + off : h.y + h.lift;
  return out;
}

export function pendulumAngle(h: PendulumHazard, t: number): number {
  return h.amplitude * dsin(((t + h.phase) / h.period) * Math.PI * 2);
}

export function pendulumBall(h: PendulumHazard, t: number, out: Point): Point {
  const angle = pendulumAngle(h, t);
  out.x = h.x + dsin(angle) * h.length;
  out.y = h.y + h.pivotLift - dcos(angle) * h.length;
  return out;
}

export const BARREL_TRIGGER = 11;

export interface BarrelState {
  rollId: number;
  rollStart: number;
}

export function boulderPosition(h: BoulderHazard, t: number, s: BarrelState): number | null {
  if (s.rollId !== h.id) return null;
  const dist = (t - s.rollStart) * h.speed;
  if (dist < 0 || dist > h.travel * (4 / 3) + BARREL_TRIGGER * 0.5) return null;
  return h.x + h.travel - dist;
}

export function isDamaging(kind: HazardKind): boolean {
  return kind !== 'mud' && kind !== 'boostPad' && kind !== 'spring';
}

export function hazardExtent(h: Hazard): [number, number] {
  switch (h.kind) {
    case 'boulder':
      return [h.x - Math.max(h.travel / 3 + h.radius + 1, BARREL_TRIGGER + 1), h.x + h.travel + h.radius + 1];
    case 'saw':
      return [h.x - h.radius - (h.axis === 'x' ? h.amplitude : 0), h.x + h.radius + (h.axis === 'x' ? h.amplitude : 0)];
    case 'pendulum':
      return [h.x - h.length - h.radius, h.x + h.length + h.radius];
    default:
      return [h.x - h.halfWidth, h.x + h.halfWidth];
  }
}
