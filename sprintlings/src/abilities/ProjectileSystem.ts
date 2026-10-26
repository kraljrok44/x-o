import { GameplayConfig } from '../config/GameplayConfig';
import { ABILITIES, AbilityTuning } from './AbilityDefinition';
import { applyHit } from './StatusEffectSystem';
import { approach } from '../shared/math';
import type { RaceSimulation } from '../game/RaceManager';
import { bodyHeight, type SeekerEntity } from '../game/RaceState';

const hb = GameplayConfig.hitbox;
const tune = AbilityTuning.seeker;

/** Nearest racer ahead of `owner` that is still racing and in range, or -1. */
export function findSeekerTarget(sim: RaceSimulation, owner: number): number {
  const me = sim.racers[owner].body;
  let best = -1;
  let bestGap = Infinity;
  for (const r of sim.racers) {
    if (sim.sameTeam(r.index, owner)) continue;
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
    if (sim.sameTeam(r.index, e.owner)) continue;
    const b = r.body;
    if (b.phase !== 'run') continue;
    if (Math.abs(b.x - e.x) > hb.halfWidth + tune.radius) continue;
    if (e.y < b.y - tune.radius || e.y > b.y + bodyHeight(b) + tune.radius) continue;
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

/** Storm clouds follow their target and strike when the warning runs out. */
export function stepThunder(sim: RaceSimulation, dt: number): void {
  for (const e of sim.entities) {
    if (e.kind !== 'thunder' || !e.alive) continue;
    const target = sim.racers[e.target];
    const tb = target.body;
    e.x = tb.x;
    e.y = tb.y;
    e.ttl -= dt;
    if (tb.phase === 'finished') {
      e.alive = false;
      continue;
    }
    if (e.ttl > 0) continue;
    e.alive = false;
    sim.emitAt('blast', e.target, 1, tb.x, tb.y);
    if (tb.phase !== 'run') continue;
    const outcome = applyHit(tb, target.mods, 300000 + e.id, AbilityTuning.thunder.stun, false);
    if (outcome === 'stunned') sim.emitAbilityHit(e.target, e.owner, 'thunder');
    else if (outcome === 'blocked') sim.emit('shieldBlock', e.target, e.id, tb);
  }
}

/** Lobbed bombs fly on a gravity arc and blast on landing or when the fuse burns out. */
export function stepBombs(sim: RaceSimulation, dt: number): void {
  const tune = AbilityTuning.bomb;
  for (const e of sim.entities) {
    if (e.kind !== 'bomb' || !e.alive) continue;
    const prevY = e.y;
    e.vy -= GameplayConfig.jump.gravity * dt;
    e.x += e.vx * dt;
    e.y += e.vy * dt;
    e.ttl -= dt;
    const g = sim.track.groundBelow(e.x, Math.max(prevY, e.y) + 0.05, -1, true);
    const landed = !Number.isNaN(g) && e.y <= g && e.vy < 0;
    if (landed) e.y = g;
    if (!landed && e.ttl > 0 && e.y > -6 && !sim.track.solidAt(e.x, e.y)) continue;
    e.alive = false;
    sim.emitAt('blast', e.owner, 0, e.x, e.y);
    for (const r of sim.racers) {
      if (sim.sameTeam(r.index, e.owner) || r.body.phase !== 'run') continue;
      const b = r.body;
      const dx = b.x - e.x;
      const dy = b.y + bodyHeight(b) / 2 - (e.y + 0.3);
      if (dx * dx + dy * dy > tune.radius * tune.radius) continue;
      const outcome = applyHit(b, r.mods, 310000 + e.id, tune.stun, false);
      if (outcome === 'stunned') sim.emitAbilityHit(r.index, e.owner, 'bomb');
      else if (outcome === 'blocked') sim.emit('shieldBlock', r.index, e.id, b);
    }
  }
}

/** Nearest rival ahead within `range` (roughly the same height band), or -1. */
export function nearestRivalAhead(sim: RaceSimulation, owner: number, range: number): number {
  const me = sim.racers[owner].body;
  let best = -1;
  let bestGap = Infinity;
  for (const r of sim.racers) {
    if (sim.sameTeam(r.index, owner) || r.body.phase !== 'run') continue;
    const gap = r.body.x - me.x;
    if (gap > 0.2 && gap < range && Math.abs(r.body.y - me.y) < 2.5 && gap < bestGap) {
      bestGap = gap;
      best = r.index;
    }
  }
  return best;
}
