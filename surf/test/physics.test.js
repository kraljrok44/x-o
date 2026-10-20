import test from 'node:test';
import assert from 'node:assert/strict';
import { vnorm, projectOnPlane, vdot } from '../shared/vec.js';
import { boxBrush, surfRampBrushes } from '../shared/brush.js';
import { CollisionWorld } from '../shared/collision.js';
import { playerMove, friction, accelerate, clipVelocity, MODE } from '../shared/movement.js';
import { PHYS } from '../shared/config.js';

const dt = 1 / PHYS.tickRate;
const ps0 = (x, y, z) => ({ pos: { x, y, z }, vel: { x: 0, y: 0, z: 0 }, yaw: 0, pitch: 0, onGround: false, jumpHeld: false });
const idle = (yaw = 0) => ({ fwd: 0, side: 0, jump: false, yaw, pitch: 0 });

test('vector projection onto a plane removes the normal component', () => {
  const n = vnorm({ x: 0, y: 1, z: 1 });
  const p = projectOnPlane({ x: 3, y: 2, z: -5 }, n);
  assert.ok(Math.abs(vdot(p, n)) < 1e-9);
});

test('normalising a zero vector returns zero, not NaN', () => {
  assert.deepEqual(vnorm({ x: 0, y: 0, z: 0 }), { x: 0, y: 0, z: 0 });
});

test('friction never flips velocity sign near zero speed', () => {
  const ps = ps0(0, 0, 0);
  ps.vel = { x: 0.5, y: 0, z: 0 };
  friction(ps, dt);
  assert.ok(ps.vel.x >= 0);
  ps.vel = { x: 3, y: -2, z: 0 };
  for (let i = 0; i < 100; i++) friction(ps, dt);
  assert.equal(ps.vel.x, 0);
  assert.equal(ps.vel.y, 0);
});

test('acceleration does nothing when already faster than wish speed in that direction', () => {
  const ps = ps0(0, 0, 0);
  ps.vel = { x: 500, y: 0, z: 0 };
  accelerate(ps, { x: 1, y: 0, z: 0 }, 260, 10, dt);
  assert.equal(ps.vel.x, 500);
  ps.vel = { x: -100, y: 0, z: 0 }; // negative component gets accelerated
  accelerate(ps, { x: 1, y: 0, z: 0 }, 260, 10, dt);
  assert.ok(ps.vel.x > -100);
});

test('clipVelocity never leaves velocity pointing into the plane', () => {
  const n = vnorm({ x: 0.3, y: 0.8, z: 0.5 });
  const out = clipVelocity({ x: -100, y: -900, z: -700 }, n, 1);
  assert.ok(vdot(out, n) >= -1e-9);
});

test('player lands on flat ground, jumps and lands again', () => {
  const world = new CollisionWorld([boxBrush([-1000, -1000, -64], [1000, 1000, 0])]);
  const ps = ps0(0, 0, 40);
  for (let i = 0; i < 100; i++) playerMove(ps, idle(), world, dt);
  assert.ok(ps.onGround);
  assert.ok(Math.abs(ps.pos.z) < 0.1);
  const ev = playerMove(ps, { ...idle(), jump: true }, world, dt);
  assert.ok(ev & 1);
  assert.ok(!ps.onGround);
  assert.ok(ps.vel.z > 250);
  let landed = false;
  for (let i = 0; i < 200 && !landed; i++) landed = !!(playerMove(ps, idle(), world, dt) & 2);
  assert.ok(landed);
  assert.equal(ps.mode, MODE.WALKING);
});

test('walking reaches but does not exceed max ground speed', () => {
  const world = new CollisionWorld([boxBrush([-100000, -1000, -64], [100000, 1000, 0])]);
  const ps = ps0(0, 0, 0);
  ps.onGround = true;
  for (let i = 0; i < 300; i++) playerMove(ps, { ...idle(), fwd: 1 }, world, dt);
  const sp = Math.hypot(ps.vel.x, ps.vel.y);
  assert.ok(sp > PHYS.maxSpeed - 5 && sp <= PHYS.maxSpeed + 0.01, 'speed ' + sp);
});

test('swept collision stops a very fast player at a thin wall (no tunnelling)', () => {
  const world = new CollisionWorld([boxBrush([500, -500, -500], [502, 500, 500])]);
  const ps = ps0(0, 0, 0);
  ps.vel = { x: 3500, y: 0, z: 0 };
  for (let i = 0; i < 50; i++) playerMove(ps, idle(), world, dt);
  assert.ok(ps.pos.x < 500 - 16 + 0.1, 'x ' + ps.pos.x);
});

test('stable at extreme speed: velocity is clamped and stays finite', () => {
  const world = new CollisionWorld([boxBrush([-10, -10, -100000], [10, 10, -99990])]);
  const ps = ps0(0, 0, 0);
  ps.vel = { x: 1e9, y: -1e9, z: NaN };
  playerMove(ps, idle(), world, dt);
  for (const k of ['x', 'y', 'z']) {
    assert.ok(Number.isFinite(ps.vel[k]));
    assert.ok(Math.abs(ps.vel[k]) <= PHYS.maxVelocity);
  }
});

function rampWorld(points, sides = 'both') {
  const { brushes } = surfRampBrushes(points, { w: 420, d: 600, sides });
  return new CollisionWorld(brushes);
}

test('player on a surf ramp is not grounded, slides and gains speed going downhill', () => {
  const world = rampWorld([[0, 0, 0], [4000, 0, -800]]);
  const ps = ps0(300, 150, 50);
  ps.vel = { x: 400, y: 0, z: 0 };
  let surfTicks = 0;
  for (let i = 0; i < 300; i++) {
    playerMove(ps, { ...idle(), side: 1 }, world, dt); // strafe right, into the ramp
    if (ps.mode === MODE.SURFING) surfTicks++;
    assert.ok(!ps.onGround);
  }
  assert.ok(surfTicks > 200, 'surf ticks ' + surfTicks);
  assert.ok(ps.vel.x > 600, 'gained speed ' + ps.vel.x);
});

test('curved ramp segments transition without speed loss (no ramp bug)', () => {
  // ridge turning 40 degrees over 8 segments while descending
  const pts = [];
  let x = 0, y = 0, z = 0, h = 0;
  pts.push([x, y, z]);
  for (let i = 0; i < 8; i++) {
    h += (40 / 8) * Math.PI / 180;
    x += Math.cos(h) * 400; y += Math.sin(h) * 400; z -= 400 * 0.2;
    pts.push([x, y, z]);
  }
  const world = rampWorld(pts);
  const ps = ps0(100, 160, 30);
  ps.vel = { x: 900, y: 0, z: 0 };
  let prev = 0;
  for (let i = 0; i < 260; i++) {
    // look along the ridge tangent like a player would
    const yaw = Math.atan2(ps.vel.y, ps.vel.x); // look where you are going
    playerMove(ps, { ...idle(yaw), side: 1 }, world, dt);
    const sp = Math.hypot(ps.vel.x, ps.vel.y, ps.vel.z);
    if (i > 5 && ps.mode === MODE.SURFING) assert.ok(sp > prev * 0.97, `speed drop ${prev} -> ${sp} at tick ${i}`);
    prev = sp;
    if (ps.pos.x > 3000) break;
  }
});

test('same inputs give identical results (determinism)', () => {
  const world = rampWorld([[0, 0, 0], [4000, 0, -800]]);
  const run = () => {
    const ps = ps0(300, 150, 50);
    ps.vel = { x: 400, y: 0, z: 0 };
    for (let i = 0; i < 500; i++) playerMove(ps, { ...idle(Math.sin(i / 30) * 0.3), side: i % 50 < 25 ? 1 : 0, jump: i === 400 }, world, dt);
    return JSON.stringify(ps);
  };
  assert.equal(run(), run());
});
