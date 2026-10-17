// Simple surf bot used by automated map validation (spec 15.4 "finish is reachable")
// and as a demo ghost. It looks along the nearest ramp ridge and strafes into the ramp.

import { BTN } from './sim.js';

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
        best = { dist, yaw: Math.atan2(hy, hx), u, ramp: r, seg: i, t };
      }
    }
  }
  return best;
}

export function botCommand(map, ps) {
  const info = nearestRampInfo(map, ps);
  const spawn = map.stages[ps.stage].spawn;
  if (ps.onGround) {
    const first = map.ramps.find((r) => r.stage === ps.stage);
    const sideSign = first && first.sides === 'right' ? -1 : 1;
    return { fwd: 1, side: 0, buttons: 0, yaw: spawn.yaw + sideSign * 0.35, pitch: 0 };
  }
  if (!info) return { fwd: 0, side: 0, buttons: 0, yaw: ps.yaw, pitch: 0 };
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
