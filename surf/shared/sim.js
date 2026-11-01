// Gameplay simulation step shared by server (authoritative) and client (prediction):
// movement + triggers (start, checkpoints, teleports, flow rings, finish, fail) + run timer.

import { PHYS } from './config.js';
import { playerMove, MODE } from './movement.js';

export const BTN = { JUMP: 1, RESTART: 2 };

export const EV = {
  JUMP: 'jump', LAND: 'land', START: 'start', CHECKPOINT: 'checkpoint', TELEPORT: 'teleport',
  FINISH: 'finish', FAIL: 'fail', BOOST: 'boost', RESTART: 'restart',
};

export function createPlayerState(map) {
  const ps = {
    pos: { x: 0, y: 0, z: 0 }, vel: { x: 0, y: 0, z: 0 },
    yaw: 0, pitch: 0, onGround: false, jumpHeld: false, mode: MODE.AIRBORNE,
    surfContact: false, surfNormal: null, groundMat: null, stuck: false,
    stage: 0, runState: 'idle', runTicks: 0, finishTicks: 0, maxSpeed: 0,
    inStart: false, tpSeq: 0, ringsUsed: 0, cpTicks: [],
  };
  respawn(ps, map, 0);
  return ps;
}

export function respawn(ps, map, stage) {
  const s = (map.stages[stage] || map.stages[0]).spawn;
  ps.pos = { x: s.pos[0], y: s.pos[1], z: s.pos[2] };
  ps.vel = { x: 0, y: 0, z: 0 };
  ps.yaw = s.yaw;
  ps.pitch = 0;
  ps.onGround = false;
  ps.tpSeq = (ps.tpSeq + 1) | 0;
}

export function restartRun(ps, map) {
  ps.stage = 0;
  ps.runState = 'idle';
  ps.runTicks = 0;
  ps.finishTicks = 0;
  ps.maxSpeed = 0;
  ps.ringsUsed = 0;
  ps.cpTicks = [];
  respawn(ps, map, 0);
}

// Oriented trigger volume test against the player box (approximated by its centre + radius).
export function inTrigger(ps, t) {
  const cx = ps.pos.x - t.c[0], cy = ps.pos.y - t.c[1];
  const cz = ps.pos.z + PHYS.hullZOffset - t.c[2];
  const c = Math.cos(-t.yaw), s = Math.sin(-t.yaw);
  const lx = c * cx - s * cy, ly = s * cx + c * cy;
  return Math.abs(lx) <= t.h[0] + PHYS.hullHalf[0] && Math.abs(ly) <= t.h[1] + PHYS.hullHalf[1] && Math.abs(cz) <= t.h[2] + PHYS.hullHalf[2];
}

export function copyState(ps) {
  return {
    ...ps,
    pos: { ...ps.pos }, vel: { ...ps.vel },
    surfNormal: ps.surfNormal ? { ...ps.surfNormal } : null,
    cpTicks: ps.cpTicks.slice(),
  };
}

/**
 * One simulation tick for one player.
 * @param ps player state (mutated)
 * @param cmd {fwd, side, buttons, yaw, pitch}
 * @param ctx {world, map}
 * @param events optional array receiving {type, ...} gameplay events
 */
export function stepPlayer(ps, cmd, ctx, events) {
  const { world, map } = ctx;
  const dt = 1 / PHYS.tickRate;
  const emit = (e) => { if (events) events.push(e); };

  if (cmd.buttons & BTN.RESTART) {
    restartRun(ps, map);
    emit({ type: EV.RESTART });
    return;
  }

  const mv = playerMove(ps, { fwd: cmd.fwd, side: cmd.side, jump: !!(cmd.buttons & BTN.JUMP), yaw: cmd.yaw, pitch: cmd.pitch }, world, dt);
  if (mv & 1) emit({ type: EV.JUMP });
  if (mv & 2) emit({ type: EV.LAND, speed: Math.hypot(ps.vel.x, ps.vel.y) });

  let inStart = false;
  for (const t of map.triggers) {
    if (!inTrigger(ps, t)) continue;
    switch (t.type) {
      case 'start': {
        inStart = true;
        if (ps.runState !== 'ready') { ps.runState = 'ready'; ps.stage = 0; ps.ringsUsed = 0; ps.cpTicks = []; ps.maxSpeed = 0; }
        ps.runTicks = 0;
        const hs = Math.hypot(ps.vel.x, ps.vel.y);
        if (ps.onGround && hs > PHYS.startZoneSpeedCap) {
          const k = PHYS.startZoneSpeedCap / hs;
          ps.vel.x *= k; ps.vel.y *= k;
        }
        break;
      }
      case 'checkpoint':
        if (t.stage > ps.stage) {
          ps.stage = t.stage;
          if (ps.runState === 'running') ps.cpTicks[t.stage] = ps.runTicks;
          emit({ type: EV.CHECKPOINT, stage: t.stage, ticks: ps.runTicks });
        }
        break;
      case 'teleport': {
        const d = t.dest;
        ps.pos = { x: d.pos[0], y: d.pos[1], z: d.pos[2] };
        if (!t.keepVelocity) ps.vel = { x: 0, y: 0, z: 0 };
        ps.yaw = d.yaw;
        ps.pitch = 0;
        ps.onGround = false;
        ps.tpSeq = (ps.tpSeq + 1) | 0;
        if (t.toStage !== undefined && t.toStage > ps.stage) {
          ps.stage = t.toStage;
          if (ps.runState === 'running') ps.cpTicks[t.toStage] = ps.runTicks;
          emit({ type: EV.CHECKPOINT, stage: t.toStage, ticks: ps.runTicks });
        }
        emit({ type: EV.TELEPORT });
        break;
      }
      case 'boost': {
        const bit = 1 << t.ring;
        if (!(ps.ringsUsed & bit)) {
          ps.ringsUsed |= bit;
          const sp = Math.hypot(ps.vel.x, ps.vel.y, ps.vel.z);
          if (sp > 1) {
            const k = (sp + PHYS.boostAmount) / sp;
            ps.vel.x *= k; ps.vel.y *= k; ps.vel.z *= k;
          }
          emit({ type: EV.BOOST, ring: t.ring });
        }
        break;
      }
      case 'finish':
        if (ps.runState === 'running') {
          ps.runState = 'finished';
          ps.finishTicks = ps.runTicks;
          emit({ type: EV.FINISH, ticks: ps.runTicks, maxSpeed: ps.maxSpeed });
        }
        break;
      case 'fail':
        if (t.stage !== ps.stage) break; // only the slab under your current stage applies
        respawn(ps, map, ps.stage);
        emit({ type: EV.FAIL, reason: 'trigger' });
        break;
      default:
        break;
    }
  }

  if (ps.inStart && !inStart && ps.runState === 'ready') {
    ps.runState = 'running';
    ps.runTicks = 0;
    emit({ type: EV.START });
  }
  ps.inStart = inStart;

  if (ps.pos.z < map.killZ) {
    respawn(ps, map, ps.stage);
    emit({ type: EV.FAIL, reason: 'fall' });
  }

  if (ps.runState === 'running') {
    ps.runTicks++;
    const sp = Math.hypot(ps.vel.x, ps.vel.y);
    if (sp > ps.maxSpeed) ps.maxSpeed = sp;
  }
}

export function formatTime(ticks) {
  const t = ticks / PHYS.tickRate;
  const m = Math.floor(t / 60);
  const s = t - m * 60;
  return `${m}:${s.toFixed(2).padStart(5, '0')}`;
}
