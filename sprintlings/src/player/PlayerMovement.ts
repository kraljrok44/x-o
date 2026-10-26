import { GameplayConfig } from '../config/GameplayConfig';
import { approach } from '../shared/math';
import { applyHit, terrainSpeedFactor, tickStatuses } from '../abilities/StatusEffectSystem';
import { makeContactResult, resolveHazardContacts, stunFor, type ContactResult } from '../physics/CollisionResolver';
import { groundUnder, hasFallenOut } from '../physics/GroundDetection';
import type { BodyInput, MovementWorld } from '../physics/PhysicsWorld';
import type { RacerBody } from '../game/RaceState';
import type { PassiveModifiers } from './CharacterAbilities';
import { enterFall, enterRespawn, finishRespawn } from './PlayerStateMachine';

const cfg = GameplayConfig;
const hb = cfg.hitbox;
/** How far below a ledge top an airborne racer can still be lifted onto it. */
const LEDGE = 0.55;

/** Scratch object reused by every step (the simulation is single threaded). */
const contact: ContactResult = makeContactResult();

/**
 * Advances one racer by one fixed tick. This is the single source of truth
 * for movement; the race, the AI planner and the server re-simulation all
 * call it.
 */
export function stepBody(body: RacerBody, input: BodyInput, mods: PassiveModifiers, world: MovementWorld, racer: number, dt: number): void {
  tickStatuses(body, dt);
  const track = world.track;
  body.blocked = false;

  switch (body.phase) {
    case 'grid':
      return;
    case 'finished': {
      body.speed = approach(body.speed, cfg.movement.baseSpeed * 0.4, cfg.movement.decel * 0.25 * dt);
      const nx = body.x + body.speed * dt;
      if (!track.solidAt(nx + hb.halfWidth, body.y)) body.x = nx;
      body.vy = Math.max(cfg.jump.terminalVelocity, body.vy - cfg.jump.gravity * dt);
      const prevY = body.y;
      body.y += body.vy * dt;
      const g = track.groundBelow(body.x, prevY + cfg.jump.stepUp, -1, true);
      if (!Number.isNaN(g) && body.y <= g) {
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
      body.x += body.speed * 0.3 * dt;
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

  // --- input -------------------------------------------------------------------
  if (input.jumpPressed && body.jumpGuard <= 0) body.jumpBuffer = cfg.jump.bufferTime;
  if (body.jumping) body.jumpAge += dt;
  if (input.jumpReleased && body.jumping && body.vy > 0) body.cutPending = true;
  if (body.cutPending && body.jumpAge >= cfg.jump.minHold) {
    if (body.jumping && body.vy > 0) body.vy *= cfg.jump.releaseCut;
    body.cutPending = false;
    body.jumping = false;
  }
  body.jumpHeld = input.jumpHeld;
  body.downHeld = input.downHeld;

  // Drop through the one-way platform underfoot.
  if (input.downPressed && body.grounded && body.pieceId >= 0 && track.isOneWay(body.pieceId)) {
    body.dropId = body.pieceId;
    body.dropTimer = cfg.jump.dropThroughTime;
    body.grounded = false;
    body.coyote = 0;
    body.vy = -1;
    body.pieceId = -1;
    world.emit('drop', racer, body.dropId, body);
  }

  // --- forward speed -----------------------------------------------------------
  let target: number;
  if (body.stun > 0) target = 0.8;
  else {
    target = cfg.movement.baseSpeed * terrainSpeedFactor(body.terrain, body, mods);
    let boost = body.grounded ? 1 : cfg.jump.airSpeedFactor;
    if (body.dash > 0) boost = Math.max(boost, 1.55);
    if (body.padBoost > 0) boost = Math.max(boost, cfg.boostPad.factor);
    target *= boost;
  }
  body.speed = approach(body.speed, target, (body.speed < target ? cfg.movement.accel : cfg.movement.decel) * dt);

  const prevX = body.x;
  const prevY = body.y;
  let ledgeTop = Number.NaN;
  const nx = body.x + body.speed * dt;
  // Terrain faces (steps, island sides) block forward motion until you jump
  // up. In the air a face whose top is within LEDGE of the feet is not a
  // wall: the racer is lifted onto the ledge below instead of bonking.
  const front = nx + hb.halfWidth;
  if (track.solidAt(front, body.y)) {
    const top = track.solidTop(front);
    if (!body.grounded && body.vy <= 4 && top - body.y <= LEDGE && !track.solidAt(front, top)) {
      body.x = nx;
      ledgeTop = top;
    } else {
      body.blocked = true;
      body.speed = Math.min(body.speed, 2.5);
    }
  } else body.x = nx;

  // --- vertical ----------------------------------------------------------------
  if (body.grounded) {
    const g = groundUnder(track, body, body.x, prevY);
    if (Number.isNaN(g) || body.y - g > cfg.jump.snapDown) {
      body.grounded = false;
      body.coyote = cfg.jump.coyoteTime;
      body.vy = 0;
      body.jumping = false;
      body.pieceId = -1;
    } else {
      body.y = g;
      body.pieceId = track.lastPiece;
    }
  }

  if (body.jumpBuffer > 0 && body.stun <= 0 && (body.grounded || body.coyote > 0)) {
    body.vy = cfg.jump.velocity;
    body.grounded = false;
    body.coyote = 0;
    body.jumpBuffer = 0;
    body.jumpGuard = cfg.jump.retriggerGuard;
    body.jumping = true;
    body.jumpAge = 0;
    body.cutPending = false;
    body.pieceId = -1;
    world.emit('jump', racer, 0, body);
  }

  if (!body.grounded) {
    let gravityScale = 1;
    if (body.vy < 0 && body.downHeld) gravityScale = cfg.jump.fastFallScale;
    else if (body.vy < 0 && body.jumpHeld) gravityScale = mods.fallGravityScaleWhileHolding;
    const vyBefore = body.vy;
    body.vy = Math.max(cfg.jump.terminalVelocity, body.vy - cfg.jump.gravity * gravityScale * dt);
    body.y += body.vy * dt;
    // Ledge assist: pop up onto a solid edge caught just below its top.
    if (!Number.isNaN(ledgeTop) && body.y < ledgeTop) {
      body.y = ledgeTop;
      body.vy = Math.min(body.vy, 0);
    }
    if (body.vy <= 0) {
      // Land on the highest surface crossed between last tick and now. Solid
      // ground just above the feet (a step corner) also counts, so a racer
      // can never end up inside terrain and drop through it.
      const ignore = body.dropTimer > 0 ? body.dropId : -1;
      let g = track.groundBelow(body.x, prevY + 0.02, ignore, true);
      const gSolid = track.groundBelow(body.x, Math.max(prevY, body.y) + LEDGE, -1, false);
      if (!Number.isNaN(gSolid) && (Number.isNaN(g) || gSolid > g)) g = gSolid;
      if (!Number.isNaN(g) && body.y <= g) {
        body.y = g;
        body.vy = 0;
        body.grounded = true;
        body.jumping = false;
        body.pieceId = track.lastPiece;
        world.emit('land', racer, Math.round(-vyBefore * 10), body);
      } else if (hasFallenOut(body)) {
        enterFall(body);
        world.emit('fall', racer, 0, body);
        return;
      }
    }
  }

  // Slide: hold down on solid ground (on a platform, down drops through instead).
  body.sliding = body.grounded && input.downHeld && body.stun <= 0 && !(body.pieceId >= 0 && track.isOneWay(body.pieceId));

  // --- hazards -------------------------------------------------------------------
  resolveHazardContacts(track, body, world.time, contact);
  let terrain = contact.terrain;
  if (body.grounded && world.inSap(racer, body.x, body.y)) terrain = 2;
  body.terrain = terrain;

  const pad = contact.boostPad ?? contact.spring;
  if (contact.boostPad) {
    body.padBoost = cfg.boostPad.duration;
    if (!body.onPad) world.emit('boostPad', racer, contact.boostPad.id, body);
  }
  if (contact.spring && body.grounded) {
    body.vy = cfg.jump.bouncePadVelocity;
    body.grounded = false;
    body.jumping = false;
    body.pieceId = -1;
    world.emit('bounce', racer, contact.spring.id, body);
  }
  body.onPad = pad !== null;

  if (contact.hit) {
    const outcome = applyHit(body, mods, contact.hit.id, stunFor(contact.hit.kind), true);
    if (outcome !== 'ignored') world.emit(outcome === 'blocked' ? 'shieldBlock' : 'hit', racer, contact.hit.id, body);
  }

  const snare = world.touchSnare(racer, body);
  if (snare >= 0) {
    const outcome = applyHit(body, mods, snare, cfg.stun.snare, false);
    if (outcome !== 'ignored') world.emit(outcome === 'blocked' ? 'shieldBlock' : 'hit', racer, snare, body);
  }

  // --- stats: obstacles cleared in the air ---------------------------------------
  if (!body.grounded) {
    const hz = track.data.hazards;
    for (let i = track.firstHazardIndex(prevX); i < hz.length && hz[i].x <= body.x; i++) {
      const h = hz[i];
      if ((h.kind === 'log' || h.kind === 'spikes' || h.kind === 'saw' || h.kind === 'boulder') && h.x > prevX && body.lastHitId !== h.id) {
        world.emit('hurdleCleared', racer, h.id, body);
      }
    }
  }
}
