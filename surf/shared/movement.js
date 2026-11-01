// Player movement physics (spec 6). Vector based, fixed time step, deterministic.
// Order per tick: view -> half gravity -> jump -> friction -> accelerate (ground/air)
// -> sweep & slide -> categorise contact -> second half gravity.

import { PHYS } from './config.js';

export const MODE = {
  WALKING: 0,
  AIRBORNE: 1,
  SURFING: 2,
  TELEPORTING: 3,
  DEAD: 4,
  SPECTATING: 5,
  FINISHED: 6,
};

export function viewVectors(yaw) {
  const c = Math.cos(yaw), s = Math.sin(yaw);
  // forward is +X at yaw 0, right is -Y (Z up, right handed)
  return { fx: c, fy: s, rx: s, ry: -c };
}

export function clipVelocity(inV, n, overbounce) {
  const backoff = (inV.x * n.x + inV.y * n.y + inV.z * n.z) * overbounce;
  const out = { x: inV.x - n.x * backoff, y: inV.y - n.y * backoff, z: inV.z - n.z * backoff };
  const adjust = out.x * n.x + out.y * n.y + out.z * n.z;
  if (adjust < 0) { out.x -= n.x * adjust; out.y -= n.y * adjust; out.z -= n.z * adjust; }
  return out;
}

function checkVelocity(ps) {
  const m = PHYS.maxVelocity;
  for (const k of ['x', 'y', 'z']) {
    if (!Number.isFinite(ps.vel[k])) ps.vel[k] = 0;
    if (ps.vel[k] > m) ps.vel[k] = m;
    else if (ps.vel[k] < -m) ps.vel[k] = -m;
  }
  for (const k of ['x', 'y', 'z']) if (!Number.isFinite(ps.pos[k])) ps.pos[k] = 0;
}

export function friction(ps, dt) {
  const v = ps.vel;
  const speed = Math.hypot(v.x, v.y);
  if (speed < 0.1) { v.x = 0; v.y = 0; return; }
  const control = speed < PHYS.stopSpeed ? PHYS.stopSpeed : speed;
  const drop = control * PHYS.friction * dt;
  let ns = speed - drop;
  if (ns < 0) ns = 0; // never flip sign because of friction
  ns /= speed;
  v.x *= ns; v.y *= ns;
}

export function accelerate(ps, wishdir, wishspeed, accel, dt) {
  const current = ps.vel.x * wishdir.x + ps.vel.y * wishdir.y + ps.vel.z * wishdir.z;
  const add = wishspeed - current;
  if (add <= 0) return;
  let as = accel * wishspeed * dt;
  if (as > add) as = add;
  ps.vel.x += as * wishdir.x; ps.vel.y += as * wishdir.y; ps.vel.z += as * wishdir.z;
}

export function airAccelerate(ps, wishdir, wishspeed, accel, dt) {
  const wishspd = Math.min(wishspeed, PHYS.airWishCap);
  const current = ps.vel.x * wishdir.x + ps.vel.y * wishdir.y + ps.vel.z * wishdir.z;
  const add = wishspd - current;
  if (add <= 0) return;
  let as = accel * wishspeed * dt;
  if (as > add) as = add;
  ps.vel.x += as * wishdir.x; ps.vel.y += as * wishdir.y; ps.vel.z += as * wishdir.z;
}

function wishMove(ps, cmd) {
  const { fx, fy, rx, ry } = viewVectors(ps.yaw);
  const fm = Math.max(-1, Math.min(1, cmd.fwd || 0)) * PHYS.forwardSpeed;
  const sm = Math.max(-1, Math.min(1, cmd.side || 0)) * PHYS.sideSpeed;
  let wx = fx * fm + rx * sm, wy = fy * fm + ry * sm;
  let ws = Math.hypot(wx, wy);
  const dir = ws > 1e-6 ? { x: wx / ws, y: wy / ws, z: 0 } : { x: 0, y: 0, z: 0 };
  if (ws > PHYS.maxSpeed) ws = PHYS.maxSpeed;
  return { dir, speed: ws };
}

/** Sweep-and-slide. Returns number of blocked planes; records surf contact. */
export function tryPlayerMove(ps, world, dt) {
  const planes = [];
  let origVel = { ...ps.vel };
  const primal = { ...ps.vel };
  let timeLeft = dt;
  let allFraction = 0;
  let blocked = 0;
  for (let bump = 0; bump < PHYS.bumps; bump++) {
    const v = ps.vel;
    if (v.x === 0 && v.y === 0 && v.z === 0) break;
    const end = { x: ps.pos.x + v.x * timeLeft, y: ps.pos.y + v.y * timeLeft, z: ps.pos.z + v.z * timeLeft };
    const tr = world.traceBox(ps.pos, end);
    allFraction += tr.fraction;
    if (tr.allSolid) { ps.vel = { x: 0, y: 0, z: 0 }; ps.stuck = true; return 4; }
    if (tr.fraction > 0) {
      ps.pos = tr.end;
      origVel = { ...ps.vel };
      planes.length = 0;
    }
    if (tr.fraction === 1) break;
    const n = tr.normal;
    if (n.z > 0 && n.z < PHYS.groundNormalZ) { ps.surfNormal = n; ps.surfContact = true; }
    if (n.z >= PHYS.groundNormalZ) blocked |= 1;
    if (n.z === 0) blocked |= 2;
    timeLeft -= timeLeft * tr.fraction;
    if (planes.length >= PHYS.maxClipPlanes) { ps.vel = { x: 0, y: 0, z: 0 }; break; }
    planes.push(n);
    if (planes.length === 1 && !ps.onGround) {
      ps.vel = clipVelocity(origVel, planes[0], 1);
      origVel = { ...ps.vel };
    } else {
      let i;
      for (i = 0; i < planes.length; i++) {
        ps.vel = clipVelocity(origVel, planes[i], 1);
        let j;
        for (j = 0; j < planes.length; j++) {
          if (j !== i) {
            const q = planes[j];
            if (ps.vel.x * q.x + ps.vel.y * q.y + ps.vel.z * q.z < 0) break;
          }
        }
        if (j === planes.length) break;
      }
      if (i === planes.length) {
        if (planes.length !== 2) { ps.vel = { x: 0, y: 0, z: 0 }; break; }
        const a = planes[0], b = planes[1];
        let dir = { x: a.y * b.z - a.z * b.y, y: a.z * b.x - a.x * b.z, z: a.x * b.y - a.y * b.x };
        const dl = Math.hypot(dir.x, dir.y, dir.z) || 1;
        dir = { x: dir.x / dl, y: dir.y / dl, z: dir.z / dl };
        const d = dir.x * ps.vel.x + dir.y * ps.vel.y + dir.z * ps.vel.z;
        ps.vel = { x: dir.x * d, y: dir.y * d, z: dir.z * d };
      }
      const dp = ps.vel.x * primal.x + ps.vel.y * primal.y + ps.vel.z * primal.z;
      if (dp <= 0) { ps.vel = { x: 0, y: 0, z: 0 }; break; }
    }
  }
  if (allFraction === 0) ps.vel = { x: 0, y: 0, z: 0 };
  return blocked;
}

function categorize(ps, world) {
  const wasGround = ps.onGround;
  if (ps.vel.z > PHYS.nonJumpVelocity) { ps.onGround = false; return wasGround; }
  const down = { x: ps.pos.x, y: ps.pos.y, z: ps.pos.z - 2 };
  const tr = world.traceBox(ps.pos, down);
  if (tr.fraction === 1 || !tr.normal || tr.normal.z < PHYS.groundNormalZ) {
    ps.onGround = false;
    if (tr.normal && tr.fraction < 1 && tr.normal.z > 0) { ps.surfContact = true; ps.surfNormal = tr.normal; }
  } else {
    ps.onGround = true;
    ps.groundMat = tr.brush ? tr.brush.mat : null;
    if (!tr.startSolid) ps.pos = tr.end;
  }
  return wasGround;
}

function stayOnGround(ps, world) {
  const start = { x: ps.pos.x, y: ps.pos.y, z: ps.pos.z + 2 };
  const up = world.traceBox(ps.pos, start);
  const s = up.end;
  const end = { x: ps.pos.x, y: ps.pos.y, z: ps.pos.z - PHYS.stepSize };
  const tr = world.traceBox(s, end);
  if (tr.fraction > 0 && tr.fraction < 1 && !tr.startSolid && tr.normal && tr.normal.z >= PHYS.groundNormalZ) {
    if (Math.abs(ps.pos.z - tr.end.z) > 0.5 * PHYS.distEpsilon) ps.pos = tr.end;
  }
}

function stepMove(ps, world, dt) {
  const startPos = { ...ps.pos }, startVel = { ...ps.vel };
  tryPlayerMove(ps, world, dt);
  const downPos = { ...ps.pos }, downVel = { ...ps.vel };

  ps.pos = { ...startPos }; ps.vel = { ...startVel };
  const upTr = world.traceBox(ps.pos, { x: ps.pos.x, y: ps.pos.y, z: ps.pos.z + PHYS.stepSize });
  if (!upTr.startSolid && !upTr.allSolid) ps.pos = upTr.end;
  tryPlayerMove(ps, world, dt);
  const dn = world.traceBox(ps.pos, { x: ps.pos.x, y: ps.pos.y, z: ps.pos.z - PHYS.stepSize - (upTr.end.z - startPos.z) });
  if (!dn.startSolid && !dn.allSolid) ps.pos = dn.end;
  if (!dn.normal || dn.normal.z < PHYS.groundNormalZ || dn.fraction === 1) {
    ps.pos = downPos; ps.vel = downVel; return;
  }
  const upPos = { ...ps.pos };
  const dDown = (downPos.x - startPos.x) ** 2 + (downPos.y - startPos.y) ** 2;
  const dUp = (upPos.x - startPos.x) ** 2 + (upPos.y - startPos.y) ** 2;
  if (dDown > dUp) { ps.pos = downPos; ps.vel = downVel; }
  else ps.vel.z = downVel.z;
}

function walkMove(ps, cmd, world, dt) {
  const { dir, speed } = wishMove(ps, cmd);
  ps.vel.z = 0;
  accelerate(ps, dir, speed, PHYS.accelerate, dt);
  ps.vel.z = 0;
  const spd = Math.hypot(ps.vel.x, ps.vel.y);
  if (spd < 1) { ps.vel.x = 0; ps.vel.y = 0; return; }
  const dest = { x: ps.pos.x + ps.vel.x * dt, y: ps.pos.y + ps.vel.y * dt, z: ps.pos.z };
  const tr = world.traceBox(ps.pos, dest);
  if (tr.fraction === 1) { ps.pos = tr.end; stayOnGround(ps, world); return; }
  stepMove(ps, world, dt);
  stayOnGround(ps, world);
}

function airMove(ps, cmd, world, dt) {
  const { dir, speed } = wishMove(ps, cmd);
  airAccelerate(ps, dir, speed, PHYS.airAccelerate, dt);
  tryPlayerMove(ps, world, dt);
}

/**
 * Advance one physics tick. Returns an events bitmask: 1 = jumped, 2 = landed.
 * cmd: { fwd, side, jump, yaw, pitch }
 */
export function playerMove(ps, cmd, world, dt) {
  let events = 0;
  ps.yaw = cmd.yaw;
  ps.pitch = Math.max(-1.55, Math.min(1.55, cmd.pitch));
  ps.surfContact = false;
  ps.stuck = false;

  ps.vel.z -= PHYS.gravity * 0.5 * dt;
  checkVelocity(ps);

  if (cmd.jump) {
    if (ps.onGround && (PHYS.autoHop || !ps.jumpHeld)) {
      ps.vel.z = PHYS.jumpImpulse;
      ps.onGround = false;
      events |= 1;
    }
    ps.jumpHeld = true;
  } else ps.jumpHeld = false;

  if (ps.onGround) { ps.vel.z = 0; friction(ps, dt); }
  checkVelocity(ps);

  if (ps.onGround) walkMove(ps, cmd, world, dt);
  else airMove(ps, cmd, world, dt);

  const was = categorize(ps, world);
  if (!was && ps.onGround) events |= 2;
  checkVelocity(ps);

  if (!ps.onGround) ps.vel.z -= PHYS.gravity * 0.5 * dt;
  if (ps.onGround) ps.vel.z = 0;

  ps.mode = ps.onGround ? MODE.WALKING : ps.surfContact ? MODE.SURFING : MODE.AIRBORNE;
  return events;
}
