import { GameplayConfig } from '../config/GameplayConfig';
import { ABILITIES, AbilityTuning } from './AbilityDefinition';
import { applyHit } from './StatusEffectSystem';
import { maskHasLane } from '../obstacles/ObstacleBase';
import { laneOfLateral } from '../game/Track';
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
    const gap = b.s - me.s;
    if (gap > 0.5 && gap < tune.acquireRange && gap < bestGap) {
      bestGap = gap;
      best = r.index;
    }
  }
  return best;
}

/** Moves seekers, homes them in on their target and resolves hits. */
export function stepSeekers(sim: RaceSimulation, dt: number): void {
  const def = ABILITIES.seeker;
  for (const e of sim.entities) {
    if (e.kind !== 'seeker' || !e.alive) continue;
    stepSeeker(sim, e, dt, def.speed, def.duration);
  }
}

function stepSeeker(sim: RaceSimulation, e: SeekerEntity, dt: number, speed: number, lifetime: number): void {
  e.age += dt;
  if (e.age > lifetime || e.s > sim.track.length + 5) {
    e.alive = false;
    sim.emitAt('seekerExpire', e.owner, e.id, e.s, e.lateral, e.y);
    return;
  }
  const owner = sim.racers[e.owner];
  if (e.target >= 0) {
    const target = sim.racers[e.target];
    if (target.body.phase === 'finished' || target.body.s < e.s - 3) e.target = -1;
    else {
      const homing = tune.lateralHoming * owner.mods.outgoingSeekerHomingScale * target.mods.incomingSeekerHomingScale;
      e.lateral = approach(e.lateral, target.body.lateral, homing * dt);
    }
  }
  e.s += speed * dt;
  const g = sim.track.groundAt(e.s, e.lateral);
  if (g !== null) e.y = g + tune.height;

  // Walls stop seekers: they're cover.
  const hz = sim.track.data.hazards;
  const lane = laneOfLateral(e.lateral);
  for (let i = sim.track.firstHazardIndex(e.s - 1); i < hz.length && hz[i].s <= e.s + 1; i++) {
    const h = hz[i];
    if (h.kind === 'wall' && Math.abs(h.s - e.s) < h.halfDepth + tune.radius && maskHasLane(h.lanes, lane)) {
      e.alive = false;
      sim.emitAt('seekerExpire', e.owner, e.id, e.s, e.lateral, e.y);
      return;
    }
  }

  for (const r of sim.racers) {
    if (r.index === e.owner && e.age < 2) continue;
    const b = r.body;
    if (b.phase !== 'run') continue;
    if (Math.abs(b.s - e.s) > hb.halfDepth + tune.radius) continue;
    if (Math.abs(b.lateral - e.lateral) > hb.halfWidth + tune.radius) continue;
    if (b.y > e.y + tune.radius || b.y + hb.height < e.y - tune.radius) continue;
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
