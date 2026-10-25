import { GameplayConfig } from '../config/GameplayConfig';
import { ABILITIES, AbilityTuning } from './AbilityDefinition';
import { applyHit } from './StatusEffectSystem';
import { approach } from '../shared/math';
import type { RaceSimulation } from '../game/RaceManager';
import type { SeekerEntity } from '../game/RaceState';

const hb = GameplayConfig.hitbox;
const tune = AbilityTuning.seeker;

/** Nearest racer ahead of `owner` that is still racing and in range, or -1. */
export function findSeekerTarget(sim: RaceSimulation, owner: number): number {
  const me = sim.racers[owner].body;
  let best = -1;
  let bestGap = Infinity;
  for (const r of sim.racers) {
    if (r.index === owner) continue;
    const b = r.body;
    if (b.phase === 'finished' || b.phase === 'grid') continue;
    const gap = b.x - me.x;
    if (gap > 0.5 && gap < tune.acquireRange && gap < bestGap) {
      bestGap = gap;
      best = r.index;
    }
  }
  return best;
}

/** Moves seekers, homes them toward their target's height and resolves hits. */
export function stepSeekers(sim: RaceSimulation, dt: number): void {
  for (const e of sim.entities) {
    if (e.kind !== 'seeker' || !e.alive) continue;
    stepSeeker(sim, e, dt);
  }
}

function stepSeeker(sim: RaceSimulation, e: SeekerEntity, dt: number): void {
  e.age += dt;
  if (e.age > ABILITIES.seeker.duration || e.x > sim.track.length + 5) {
    e.alive = false;
    sim.emitAt('seekerExpire', e.owner, e.id, e.x, e.y);
    return;
  }
  const owner = sim.racers[e.owner];
  if (e.target >= 0) {
    const target = sim.racers[e.target];
    if (target.body.phase === 'finished' || target.body.x < e.x - 3) e.target = -1;
    else {
      const homing = tune.homing * owner.mods.outgoingSeekerHomingScale * target.mods.incomingSeekerHomingScale;
      e.y = approach(e.y, target.body.y + tune.height, homing * dt);
    }
  }
  e.x += ABILITIES.seeker.speed * dt;
  // Terrain stops seekers: steps and islands are cover.
  if (sim.track.solidAt(e.x + tune.radius, e.y - 0.3)) {
    e.alive = false;
    sim.emitAt('seekerExpire', e.owner, e.id, e.x, e.y);
    return;
  }
  for (const r of sim.racers) {
    if (r.index === e.owner && e.age < 2) continue;
    const b = r.body;
    if (b.phase !== 'run') continue;
    if (Math.abs(b.x - e.x) > hb.halfWidth + tune.radius) continue;
    if (e.y < b.y - tune.radius || e.y > b.y + hb.height + tune.radius) continue;
    const outcome = applyHit(b, r.mods, 100000 + e.id, GameplayConfig.stun.projectile, false);
    if (outcome === 'ignored') continue;
    e.alive = false;
    if (outcome === 'stunned') {
      owner.stats.hitsLanded++;
      sim.emit('seekerHit', r.index, e.owner, b);
    } else sim.emit('shieldBlock', r.index, e.id, b);
    return;
  }
}

/** Seekers currently homing in on `racer` (for HUD warnings and AI). */
export function incomingSeekers(sim: RaceSimulation, racer: number, out: SeekerEntity[]): SeekerEntity[] {
  out.length = 0;
  for (const e of sim.entities) if (e.kind === 'seeker' && e.alive && e.target === racer) out.push(e);
  return out;
}
