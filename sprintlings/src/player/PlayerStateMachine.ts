import { GameplayConfig, laneToLateral } from '../config/GameplayConfig';
import { laneOfLateral, type Track } from '../game/Track';
import type { RacerBody, RacerPhase } from '../game/RaceState';

/**
 * Racer phase transitions:
 *
 *   grid --GO--> run --fell off--> fall --timer--> respawn --timer--> run
 *    run --crossed line--> finished
 *
 * Stun, shield, dash etc. are timed statuses layered on top of `run`
 * (abilities/StatusEffectSystem.ts) rather than separate phases, so a racer
 * can e.g. be stunned in mid-air and still land correctly.
 */
const ALLOWED: Record<RacerPhase, RacerPhase[]> = {
  grid: ['run'],
  run: ['fall', 'finished'],
  fall: ['respawn'],
  respawn: ['run', 'finished'],
  finished: [],
};

export function canTransition(from: RacerPhase, to: RacerPhase): boolean {
  return ALLOWED[from].includes(to);
}

function transition(body: RacerBody, to: RacerPhase): void {
  if (!canTransition(body.phase, to)) throw new Error(`Illegal racer transition ${body.phase} -> ${to}`);
  body.phase = to;
}

export function startRunning(body: RacerBody): void {
  transition(body, 'run');
}

export function enterFall(body: RacerBody): void {
  transition(body, 'fall');
  body.phaseTimer = GameplayConfig.fall.fallDuration;
  body.fallFromS = body.s;
  body.fallLane = laneOfLateral(body.lateral);
  body.dash = 0;
  body.padBoost = 0;
  body.stun = 0;
  body.jumpBuffer = 0;
}

export function enterRespawn(body: RacerBody, track: Track): void {
  transition(body, 'respawn');
  const spot = track.findRespawn(body.fallFromS, body.fallLane);
  body.s = spot.s;
  body.targetLane = spot.lane;
  body.lateral = laneToLateral(spot.lane);
  body.latVel = 0;
  body.y = track.groundAtLane(spot.s, spot.lane) ?? track.baseline(spot.s);
  body.vy = 0;
  body.speed = 0;
  body.grounded = true;
  body.jumping = false;
  body.phaseTimer = GameplayConfig.fall.respawnDelay;
  body.terrain = 0;
}

export function finishRespawn(body: RacerBody): void {
  transition(body, 'run');
  body.invuln = GameplayConfig.fall.respawnInvulnerability;
}

export function enterFinished(body: RacerBody): void {
  transition(body, 'finished');
  body.stun = 0;
}
