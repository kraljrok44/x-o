import type { Rng } from '../shared/Rng';
import { GameplayConfig } from '../config/GameplayConfig';
import type { Hazard } from '../obstacles/ObstacleBase';
import type { Biome, GlimmerDef, GroundPiece, ItemBoxDef } from './Track';

export type SegmentTag = 'start' | 'rest' | 'easy' | 'medium' | 'hard' | 'finale' | 'finish';

export interface SegmentTemplate {
  id: string;
  length: number;
  difficulty: number;
  tags: SegmentTag[];
  allowedAfter: SegmentTag[];
  allowedBefore: SegmentTag[];
  minSafeLeadIn: number;
  pickupRule: string;
  build(ctx: SegmentContext): void;
}

export interface TrackDraft {
  pieces: GroundPiece[];
  hazards: Hazard[];
  itemBoxes: ItemBoxDef[];
  glimmers: GlimmerDef[];
  nextId: number;
  level: number;
}

export function emptyDraft(): TrackDraft {
  return { pieces: [], hazards: [], itemBoxes: [], glimmers: [], nextId: 1, level: 0 };
}

export class SegmentContext {
  cursor = 0;

  constructor(
    readonly draft: TrackDraft,
    readonly x0: number,
    readonly rng: Rng,
    readonly biome: Biome,
  ) {}

  get level(): number {
    return this.draft.level;
  }

  private id(): number {
    return this.draft.nextId++;
  }

  private piece(dx0: number, dx1: number, y0: number, y1: number, oneWay: boolean): void {
    this.draft.pieces.push({ id: this.id(), x0: this.x0 + dx0, x1: this.x0 + dx1, y0, y1, oneWay });
  }

  run(len: number): this {
    this.piece(this.cursor, this.cursor + len, this.level, this.level, false);
    this.cursor += len;
    return this;
  }

  ramp(len: number, rise: number): this {
    if (Math.abs(rise / len) > 0.55) throw new Error('ramp too steep');
    this.piece(this.cursor, this.cursor + len, this.level, this.level + rise, false);
    this.draft.level += rise;
    this.cursor += len;
    return this;
  }

  gap(len: number, rise = 0): this {
    this.cursor += len;
    this.draft.level += rise;
    return this;
  }

  step(rise: number): this {
    this.draft.level += rise;
    return this;
  }

  platform(dx: number, len: number, lift: number): this {
    this.piece(dx, dx + len, this.level + lift, this.level + lift, true);
    return this;
  }

  cloud(dx: number, len: number, lift: number): this {
    this.draft.pieces.push({ id: this.id(), x0: this.x0 + dx, x1: this.x0 + dx + len, y0: this.level + lift, y1: this.level + lift, oneWay: true, style: 'cloud' });
    return this;
  }

  beam(dx: number): this {
    this.draft.hazards.push({ id: this.id(), kind: 'beam', x: this.x0 + dx, y: 0, halfWidth: 0.45, clearance: 0.8, top: 3.2 });
    return this;
  }

  island(dx: number, len: number, lift: number): this {
    this.piece(dx, dx + len, this.level + lift, this.level + lift, false);
    return this;
  }

  log(dx: number, height = 0.7, halfWidth = 0.35): this {
    this.draft.hazards.push({ id: this.id(), kind: 'log', x: this.x0 + dx, y: 0, halfWidth, height });
    return this;
  }

  spikes(dx: number, halfWidth = 0.6, height = 0.55): this {
    this.draft.hazards.push({ id: this.id(), kind: 'spikes', x: this.x0 + dx, y: 0, halfWidth, height });
    return this;
  }

  saw(dx: number, opts: Partial<{ lift: number; radius: number; axis: 'none' | 'x' | 'y'; amplitude: number; period: number; phase: number }> = {}): this {
    this.draft.hazards.push({
      id: this.id(),
      kind: 'saw',
      x: this.x0 + dx,
      y: 0,
      lift: opts.lift ?? 0.1,
      radius: opts.radius ?? 0.6,
      axis: opts.axis ?? 'none',
      amplitude: opts.amplitude ?? 0,
      period: opts.period ?? 2.4,
      phase: opts.phase ?? 0,
    });
    return this;
  }

  crusher(dx: number, phase = 0, period = 2.6): this {
    this.draft.hazards.push({ id: this.id(), kind: 'crusher', x: this.x0 + dx, y: 0, halfWidth: 0.75, raisedLift: 3.5, period, downTime: 0.55, warnTime: 0.5, phase });
    return this;
  }

  flame(dx: number, phase = 0, period = 2.2, activeTime = 0.8): this {
    this.draft.hazards.push({ id: this.id(), kind: 'flame', x: this.x0 + dx, y: 0, halfWidth: 0.45, height: 1.5, period, activeTime, warnTime: 0.55, phase });
    return this;
  }

  pendulum(dx: number, phase = 0, period = 2.6): this {
    this.draft.hazards.push({ id: this.id(), kind: 'pendulum', x: this.x0 + dx, y: 0, pivotLift: 5.5, length: 4.3, amplitude: 1.0, radius: 0.55, period, phase });
    return this;
  }

  boulder(dx: number, phase = 0, period = 3.2, speed = 6): this {
    this.draft.hazards.push({ id: this.id(), kind: 'boulder', x: this.x0 + dx, y: 0, radius: 0.5, travel: 9, speed, period, phase });
    return this;
  }

  mud(dx0: number, dx1: number): this {
    this.draft.hazards.push({ id: this.id(), kind: 'mud', x: this.x0 + (dx0 + dx1) / 2, y: 0, halfWidth: (dx1 - dx0) / 2 });
    return this;
  }

  pad(kind: 'boostPad' | 'spring', dx: number, onLift?: number): this {
    this.draft.hazards.push({ id: this.id(), kind, x: this.x0 + dx, y: 0, halfWidth: kind === 'spring' ? 0.45 : 0.8, onTop: onLift === undefined ? undefined : this.level + onLift + 0.01 });
    return this;
  }

  box(dx: number, lift = 0.9, atLevel = this.level): this {
    this.draft.itemBoxes.push({ id: this.id(), x: this.x0 + dx, y: atLevel + lift });
    return this;
  }

  glimmerLine(dx0: number, dx1: number, lift = 0.6, spacing = 1.4, atLevel = this.level): this {
    for (let dx = dx0; dx <= dx1 + 1e-6; dx += spacing) this.draft.glimmers.push({ id: this.id(), x: this.x0 + dx, y: atLevel + lift });
    return this;
  }

  glimmerArc(takeoff: number, count = 5, velocity: number = GameplayConfig.jump.velocity, atLevel = this.level): this {
    const g = GameplayConfig.jump.gravity;
    const speed = GameplayConfig.movement.baseSpeed;
    const air = (2 * velocity) / g;
    for (let i = 1; i <= count; i++) {
      const t = (air * i) / (count + 1);
      const y = velocity * t - 0.5 * g * t * t;
      this.draft.glimmers.push({ id: this.id(), x: this.x0 + takeoff + speed * t, y: atLevel + 0.55 + y });
    }
    return this;
  }
}
