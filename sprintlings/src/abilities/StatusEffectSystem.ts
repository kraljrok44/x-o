import { GameplayConfig } from '../config/GameplayConfig';
import type { RacerBody } from '../game/RaceState';
import type { PassiveModifiers } from '../player/CharacterAbilities';

export type HitOutcome = 'ignored' | 'blocked' | 'stunned';

/**
 * Applies a stun-causing hit. Order of precedence:
 *   respawn invulnerability -> same-hazard re-hit guard -> shield -> stun.
 * `fromObstacle` hits are scaled by the Tough Quills passive.
 */
export function applyHit(
  body: RacerBody,
  mods: PassiveModifiers,
  sourceId: number,
  baseStun: number,
  fromObstacle: boolean,
): HitOutcome {
  if (body.phase !== 'run') return 'ignored';
  if (body.invuln > 0) return 'ignored';
  if (body.lastHitId === sourceId && body.lastHitTimer > 0) return 'ignored';
  body.lastHitId = sourceId;
  body.lastHitTimer = GameplayConfig.stun.rehitGuard;
  if (body.shield > 0) {
    body.shield = 0;
    body.invuln = 0.35;
    return 'blocked';
  }
  const scale = fromObstacle ? mods.obstacleStunScale : 1;
  body.stun = Math.max(body.stun, baseStun * scale);
  body.invuln = Math.max(body.invuln, body.stun + GameplayConfig.stun.recoveryInvuln);
  body.speed *= GameplayConfig.stun.hitSpeedFactor;
  body.dash = 0;
  body.stampede = 0;
  body.padBoost = 0;
  body.jumpBuffer = 0;
  body.vy = Math.min(body.vy, 2);
  return 'stunned';
}

/** Speed multiplier from terrain / sap, after the Steady Feet passive and shields. */
export function terrainSpeedFactor(terrain: number, body: RacerBody, mods: PassiveModifiers): number {
  if (terrain === 0) return 1;
  if (body.shield > 0) return 1;
  const base = terrain === 1 ? GameplayConfig.slow.mudFactor : GameplayConfig.slow.sapFactor;
  return 1 - (1 - base) * mods.terrainEffectScale;
}

/** Ticks down every timed status on a body. */
export function tickStatuses(body: RacerBody, dt: number): void {
  if (body.stun > 0) body.stun = Math.max(0, body.stun - dt);
  if (body.invuln > 0) body.invuln = Math.max(0, body.invuln - dt);
  if (body.dash > 0) body.dash = Math.max(0, body.dash - dt);
  if (body.slow > 0) body.slow = Math.max(0, body.slow - dt);
  if (body.stampede > 0) body.stampede = Math.max(0, body.stampede - dt);
  if (body.padBoost > 0) body.padBoost = Math.max(0, body.padBoost - dt);
  if (body.shield > 0) body.shield = Math.max(0, body.shield - dt);
  if (body.lastHitTimer > 0) body.lastHitTimer = Math.max(0, body.lastHitTimer - dt);
  if (body.coyote > 0) body.coyote = Math.max(0, body.coyote - dt);
  if (body.jumpBuffer > 0) body.jumpBuffer = Math.max(0, body.jumpBuffer - dt);
  if (body.jumpGuard > 0) body.jumpGuard = Math.max(0, body.jumpGuard - dt);
  if (body.dropTimer > 0) body.dropTimer = Math.max(0, body.dropTimer - dt);
}
