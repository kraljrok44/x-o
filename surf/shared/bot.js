// Simple surf bot used by automated map validation (spec 15.4 "finish is reachable")
// and as a demo ghost. It looks along the nearest ramp ridge and strafes into the ramp.

import { BTN } from './sim.js';
import { MODE } from './movement.js';

export function nearestRampInfo(map, ps) {
  let best = null;
  for (const r of map.ramps) {
    if (r.stage !== ps.stage) continue;
    const P = r.points;
    for (let i = 0; i < P.length - 1; i++) {
      const ax = P[i][0], ay = P[i][1], bx = P[i + 1][0], by = P[i + 1][1];
      const dx = bx - ax, dy = by - ay;
      const l2 = dx * dx + dy * dy;
      let t = ((ps.pos.x - ax) * dx + (ps.pos.y - ay) * dy) / l2;
      const tc = Math.max(0, Math.min(1, t));
      const px = ax + dx * tc, py = ay + dy * tc;
      const dist = Math.hypot(ps.pos.x - px, ps.pos.y - py) + (t > 1 ? (t - 1) * Math.sqrt(l2) * 0.5 : 0) + (t < 0 ? -t * Math.sqrt(l2) * 2 : 0);
      if (!best || dist < best.dist) {
        const l = Math.sqrt(l2);
        const hx = dx / l, hy = dy / l;
        const u = (ps.pos.x - px) * -hy + (ps.pos.y - py) * hx;
        best = { dist, yaw: Math.atan2(hy, hx), u, ramp: r, seg: i, t, last: i === P.length - 2 };
      }
    }
  }
  return best;
}

function padUnder(map, ps) {
  for (const pd of map.pads || []) {
    if (pd.stage !== ps.stage) continue;
    const dx = ps.pos.x - pd.c[0], dy = ps.pos.y - pd.c[1];
    const c = Math.cos(-pd.yaw), s = Math.sin(-pd.yaw);
    const lx = c * dx - s * dy, ly = s * dx + c * dy;
    // the section includes the gaps around the pads
    if (Math.abs(lx) < pd.hl + 120 && Math.abs(ly) < pd.hw && ps.pos.z > pd.c[2] - 200 && ps.pos.z < pd.c[2] + 600) return pd;
  }
  return null;
}

export function botCommand(map, ps) {
  const info = nearestRampInfo(map, ps);
  const spawn = map.stages[ps.stage].spawn;
  const pad = padUnder(map, ps);
  if (pad) return { fwd: 0, side: 0, buttons: BTN.JUMP, yaw: pad.yaw, pitch: 0 }; // bunny hop over the jump section
  if (ps.onGround) {
    // walk towards a point a little down the preferred slope at the start of this section's first ramp
    const first = map.ramps.find((r) => r.stage === ps.stage);
    if (!first) return { fwd: 1, side: 0, buttons: 0, yaw: spawn.yaw, pitch: 0 };
    const [a, b] = first.points;
    const hx = b[0] - a[0], hy = b[1] - a[1], hl = Math.hypot(hx, hy);
    const sideSign = first.sides === 'right' ? -1 : 1;
    const off = first.w * 0.3 * sideSign;
    const tx = a[0] + (-hy / hl) * off + (hx / hl) * 250, ty = a[1] + (hx / hl) * off + (hy / hl) * 250;
    return { fwd: 1, side: 0, buttons: 0, yaw: Math.atan2(ty - ps.pos.y, tx - ps.pos.x), pitch: 0 };
  }
  if (!info) return { fwd: 0, side: 0, buttons: 0, yaw: ps.yaw, pitch: 0 };
  if (ps.mode === MODE.AIRBORNE && info.last && info.t > 1) {
    // Past the end of a ramp with the next one at a sharp angle (90° corner): glide on, then
    // air-strafe through the turn (look along the velocity, hold the strafe key towards the turn)
    // starting just early enough to come out of it on the next ramp's riding line.
    const nextRamp = map.ramps[map.ramps.indexOf(info.ramp) + 1];
    if (nextRamp && nextRamp.stage === ps.stage) {
      const [a, b2] = nextRamp.points;
      const want = Math.atan2(b2[1] - a[1], b2[0] - a[0]);
      const vh = Math.atan2(ps.vel.y, ps.vel.x);
      let err = want - vh;
      while (err > Math.PI) err -= 2 * Math.PI;
      while (err < -Math.PI) err += 2 * Math.PI;
      if (Math.abs(info.yaw - want) > 0.6) {
        if (Math.abs(err) < 0.2) return { fwd: 0, side: 0, buttons: 0, yaw: vh, pitch: 0 };
        // distance to the riding line (40% down the slope that faces us)
        const dx = b2[0] - a[0], dy = b2[1] - a[1], l = Math.hypot(dx, dy);
        let nx = -dy / l, ny = dx / l;
        if ((ps.pos.x - a[0]) * nx + (ps.pos.y - a[1]) * ny < 0) { nx = -nx; ny = -ny; }
        const dist = (ps.pos.x - a[0]) * nx + (ps.pos.y - a[1]) * ny - nextRamp.w * 0.4;
        const v = Math.hypot(ps.vel.x, ps.vel.y);
        const turnDepth = 1.3 * (v * v / 3000) * (1 - Math.cos(err)) + 80;
        if (dist > turnDepth) return { fwd: 0, side: 0, buttons: 0, yaw: vh, pitch: 0 };
        return { fwd: 0, side: err > 0 ? -1 : 1, buttons: 0, yaw: vh, pitch: 0 };
      }
    }
  }
  // u > 0 means we are on the left slope, the ridge is to our right.
  let sgn = info.u > 0 ? 1 : -1;
  if (info.ramp.sides === 'left') sgn = 1;
  if (info.ramp.sides === 'right') sgn = -1;
  // keep a line roughly 40% down the slope: strafe into the ramp when too low, ease off when too high
  const target = info.ramp.w * 0.4;
  const off = Math.abs(info.u);
  const side = off > target ? sgn : (off < target * 0.5 ? -sgn * 0.5 : 0);
  return { fwd: 0, side, buttons: 0, yaw: info.yaw, pitch: 0 };
}

export { BTN };
