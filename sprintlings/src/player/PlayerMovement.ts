import { GameplayConfig, laneToLateral } from '../config/GameplayConfig';
import { approach, clamp } from '../shared/math';
import { applyHit, lateralGrip, terrainSpeedFactor, tickStatuses } from '../abilities/StatusEffectSystem';
import { makeContactResult, resolveHazardContacts, stunFor, type ContactResult } from '../physics/CollisionResolver';
import { hasFallenOut } from '../physics/GroundDetection';
import type { BodyInput, MovementWorld } from '../physics/PhysicsWorld';
import { laneOfLateral } from '../game/Track';
import { maskHasLane } from '../obstacles/ObstacleBase';
import type { RacerBody } from '../game/RaceState';
import type { PassiveModifiers } from './CharacterAbilities';
import { enterFall, enterRespawn, finishRespawn } from './PlayerStateMachine';

const cfg = GameplayConfig;
const hb = cfg.hitbox;

/** Scratch objects reused by every step (the simulation is single threaded). */
const contact: ContactResult = makeContactResult();

/**
 * Advances one racer by one fixed tick. This is the single source of truth
 * for movement; the race, the AI planner and the server re-simulation all
 * call it.
 */
export function stepBody(
  body: RacerBody,
  input: BodyInput,
  mods: PassiveModifiers,
  world: MovementWorld,
  racer: number,
  dt: number,
): void {
  tickStatuses(body, dt);
  const track = world.track;

  switch (body.phase) {
    case 'grid':
      return;
    case 'finished': {
      body.speed = approach(body.speed, cfg.movement.baseSpeed * 0.45, cfg.movement.decel * 0.25 * dt);
      body.s += body.speed * dt;
      body.vy -= cfg.jump.gravity * dt;
      body.y += body.vy * dt;
      const g = track.groundAt(body.s, body.lateral) ?? track.baseline(body.s);
      if (body.y <= g) {
        body.y = g;
        body.vy = 0;
        body.grounded = true;
      }
      return;
    }
    case 'fall':
      body.phaseTimer -= dt;
      body.vy = Math.max(cfg.jump.terminalVelocity, body.vy - cfg.jump.gravity * dt);
      body.y += body.vy * dt;
      body.s += body.speed * 0.4 * dt;
      if (body.phaseTimer <= 0) {
        enterRespawn(body, track);
        world.emit('respawn', racer, 0, body);
      }
      return;
    case 'respawn':
      body.phaseTimer -= dt;
      if (body.phaseTimer <= 0) finishRespawn(body);
      return;
    case 'run':
      break;
  }

  // --- input ---------------------------------------------------------------
  if (input.jumpPressed && body.jumpGuard <= 0) body.jumpBuffer = cfg.jump.bufferTime;
  if (input.jumpReleased && body.jumping && body.vy > 0) {
    body.vy *= cfg.jump.releaseCut;
    body.jumping = false;
  }
  body.jumpHeld = input.jumpHeld;
  // Lane input is accepted while stunned (at reduced lateral speed) so a
  // player can sidestep right after bonking a wall.
  if (input.left && body.targetLane > -1) {
    body.targetLane -= 1;
    world.emit('laneChange', racer, -1, body);
  }
  if (input.right && body.targetLane < 1) {
    body.targetLane += 1;
    world.emit('laneChange', racer, 1, body);
  }

  // --- forward speed -------------------------------------------------------
  let target: number;
  if (body.stun > 0) target = 0.8;
  else {
    target = cfg.movement.baseSpeed * terrainSpeedFactor(body.terrain, body, mods);
    let boost = 1;
    if (body.dash > 0) boost = Math.max(boost, 1.55);
    if (body.padBoost > 0) boost = Math.max(boost, cfg.boostPad.factor);
    target *= boost;
  }
  body.speed = approach(body.speed, target, (body.speed < target ? cfg.movement.accel : cfg.movement.decel) * dt);

  const prevS = body.s;
  const prevLat = body.lateral;
  const prevY = body.y;
  body.s += body.speed * dt;

  // --- lateral -------------------------------------------------------------
  const targetLat = laneToLateral(body.targetLane);
  const grip = lateralGrip(body.terrain, mods);
  const maxLat = body.stun > 0 ? cfg.lanes.switchSpeed * 0.5 : cfg.lanes.switchSpeed;
  const desired = clamp((targetLat - body.lateral) * 18, -maxLat, maxLat);
  body.latVel = approach(body.latVel, desired, cfg.lanes.lateralAccel * grip * dt);
  const newLat = body.lateral + body.latVel * dt;
  const gSide = track.groundAt(body.s, newLat);
  if (gSide !== null && gSide > body.y + cfg.jump.stepUp) {
    // Side of a raised ledge: can't move into it.
    body.latVel = 0;
    body.targetLane = laneOfLateral(body.lateral);
  } else body.lateral = newLat;

  // --- ledge faces in front ------------------------------------------------
  let g = track.groundAt(body.s, body.lateral);
  if (g !== null && g > body.y + cfg.jump.stepUp) {
    body.s = prevS - 0.6;
    body.speed = 0;
    body.vy = Math.min(body.vy, 0);
    const outcome = applyHit(body, mods, -2, cfg.stun.wall * 0.7, true);
    world.emit(outcome === 'blocked' ? 'shieldBlock' : 'bonk', racer, -2, body);
    g = track.groundAt(body.s, body.lateral);
  }

  // --- vertical ------------------------------------------------------------
  if (body.grounded) {
    if (g === null || body.y - g > cfg.jump.snapDown) {
      body.grounded = false;
      body.coyote = cfg.jump.coyoteTime;
      body.vy = 0;
      body.jumping = false;
    } else body.y = g;
  }

  if (body.jumpBuffer > 0 && body.stun <= 0 && (body.grounded || body.coyote > 0)) {
    body.vy = cfg.jump.velocity;
    body.grounded = false;
    body.coyote = 0;
    body.jumpBuffer = 0;
    body.jumpGuard = cfg.jump.retriggerGuard;
    body.jumping = true;
    world.emit('jump', racer, 0, body);
  }

  if (!body.grounded) {
    const gravityScale = body.vy < 0 && body.jumpHeld ? mods.fallGravityScaleWhileHolding : 1;
    body.vy = Math.max(cfg.jump.terminalVelocity, body.vy - cfg.jump.gravity * gravityScale * dt);
    body.y += body.vy * dt;
    const gNow = track.groundAt(body.s, body.lateral);
    if (gNow !== null && body.vy <= 0 && body.y <= gNow && prevY >= gNow - cfg.jump.stepUp) {
      body.y = gNow;
      body.vy = 0;
      body.grounded = true;
      body.jumping = false;
      world.emit('land', racer, 0, body);
    } else if (hasFallenOut(track, body.s, body.y)) {
      enterFall(body);
      world.emit('fall', racer, 0, body);
      return;
    }
  }

  // --- hazards ---------------------------------------------------------------
  resolveHazardContacts(track, body, prevS, prevLat, world.time, contact);
  let terrain = contact.terrain;
  if (body.grounded && world.inSap(racer, body.s, body.lateral)) terrain = 2;
  body.terrain = terrain;

  const pad = contact.boostPad ?? contact.bouncePad;
  if (contact.boostPad) {
    body.padBoost = cfg.boostPad.duration;
    if (!body.onPad) world.emit('boostPad', racer, contact.boostPad.id, body);
  }
  if (contact.bouncePad && body.grounded) {
    body.vy = cfg.jump.bouncePadVelocity;
    body.grounded = false;
    body.jumping = false;
    world.emit('bounce', racer, contact.bouncePad.id, body);
  }
  body.onPad = pad !== null;

  const hit = contact.hit;
  if (hit) {
    if (hit.kind === 'wall') {
      if (contact.fromSide) {
        body.lateral = prevLat;
        body.latVel = 0;
        body.targetLane = laneOfLateral(prevLat);
      } else {
        body.s = hit.s - hit.halfDepth - hb.halfDepth - cfg.stun.wallPushback;
        body.speed = 0;
        body.vy = Math.min(body.vy, 0);
        const outcome = applyHit(body, mods, hit.id, cfg.stun.wall, true);
        world.emit(outcome === 'blocked' ? 'shieldBlock' : 'bonk', racer, hit.id, body);
      }
    } else {
      const outcome = applyHit(body, mods, hit.id, stunFor(hit.kind), true);
      if (outcome !== 'ignored') world.emit(outcome === 'blocked' ? 'shieldBlock' : 'hit', racer, hit.id, body);
    }
  }

  const snare = world.touchSnare(racer, body);
  if (snare >= 0) {
    const outcome = applyHit(body, mods, snare, cfg.stun.snare, false);
    if (outcome !== 'ignored') world.emit(outcome === 'blocked' ? 'shieldBlock' : 'hit', racer, snare, body);
  }

  // --- stats: hurdles/spikes cleared in the air ------------------------------
  if (!body.grounded) {
    const hz = track.data.hazards;
    const lane = laneOfLateral(body.lateral);
    for (let i = track.firstHazardIndex(prevS); i < hz.length && hz[i].s <= body.s; i++) {
      const h = hz[i];
      if ((h.kind === 'hurdle' || h.kind === 'spikes') && h.s > prevS && maskHasLane(h.lanes, lane) && body.lastHitId !== h.id) {
        world.emit('hurdleCleared', racer, h.id, body);
      }
    }
  }
}
