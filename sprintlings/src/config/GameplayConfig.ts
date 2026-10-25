/**
 * All tunable gameplay numbers live here so balancing never requires touching
 * simulation code. Units: world units (u), seconds (s).
 *
 * Starting values follow the design document (section 3 and 4) and were then
 * tuned to the character hitbox size used by the simulation.
 */
export const GameplayConfig = {
  /** Fixed simulation step. The renderer interpolates between steps. */
  tickRate: 60,

  lanes: {
    count: 3,
    width: 2.4,
    /** Lateral speed when switching lanes (u/s). One lane takes ~0.17 s. */
    switchSpeed: 14,
    /** Lateral acceleration on normal ground; ice divides this by `ice.gripDivisor`. */
    lateralAccel: 140,
  },

  movement: {
    baseSpeed: 9,
    /** Acceleration back to target speed after a stumble or slow-down. */
    accel: 14,
    /** Deceleration toward a lower target speed. */
    decel: 30,
    startBoostSpeed: 11.5,
    startBoostWindowTicks: 12,
    startBoostDuration: 0.8,
  },

  jump: {
    gravity: 24,
    velocity: 10.5,
    /** Releasing jump while rising multiplies vertical velocity by this. */
    releaseCut: 0.55,
    /** A jump is always held at least this long, so quick taps still clear low hurdles. */
    minHold: 0.14,
    coyoteTime: 0.1,
    bufferTime: 0.12,
    /** Ignore further jump presses for this long after a jump (anti double-trigger). */
    retriggerGuard: 0.08,
    terminalVelocity: -30,
    stepUp: 0.35,
    snapDown: 0.3,
    bouncePadVelocity: 15.5,
  },

  hitbox: {
    halfWidth: 0.38,
    halfDepth: 0.38,
    height: 1.3,
  },

  stun: {
    hurdle: 0.45,
    wall: 0.6,
    trap: 0.55,
    projectile: 0.7,
    snare: 0.6,
    pendulum: 0.65,
    /** Speed multiplier applied at the moment of a stumble. */
    hitSpeedFactor: 0.25,
    /** Distance pushed back after bonking a wall. */
    wallPushback: 1.1,
    /** Grace window where the same hazard can't hit the racer again. */
    rehitGuard: 1.1,
  },

  fall: {
    /** Below ground level by this much the racer counts as fallen off. */
    killDepth: 4,
    fallDuration: 0.55,
    respawnDelay: 0.75,
    respawnInvulnerability: 1.0,
    respawnOffset: 0.8,
  },

  slow: {
    mudFactor: 0.6,
    sapFactor: 0.55,
  },

  ice: {
    gripDivisor: 4.5,
    speedBonus: 1.06,
  },

  boostPad: { factor: 1.45, duration: 0.9 },

  race: {
    countdownSeconds: 3,
    maxDurationSeconds: 120,
    racers: 4,
    /** After the local player finishes, others get this long to cross the line. */
    finishGraceSeconds: 15,
  },

  itemBox: { respawnSeconds: 1.6, pickupRadius: 0.95 },
  glimmer: { pickupRadius: 0.8 },
} as const;

export const TICK_DT = 1 / GameplayConfig.tickRate;

export function laneToLateral(lane: number): number {
  return lane * GameplayConfig.lanes.width;
}

export function lateralToLane(lateral: number): number {
  const l = Math.round(lateral / GameplayConfig.lanes.width);
  return l < -1 ? -1 : l > 1 ? 1 : l;
}
