/**
 * All tunable gameplay numbers live here so balancing never requires touching
 * simulation code. Units: world units (u, a monster is ~1.1 u tall), seconds (s).
 *
 * The race is viewed from the side: x runs forward (left -> right on screen),
 * y is up. There are no lanes; routes differ by height (ground path vs. one-way
 * platforms you can jump onto from below and drop through).
 */
export const GameplayConfig = {
  /** Fixed simulation step. The renderer interpolates between steps. */
  tickRate: 60,

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
    gravity: 26,
    velocity: 10.8,
    /** Releasing jump while rising multiplies vertical velocity by this. */
    releaseCut: 0.5,
    /** A jump is always held at least this long, so quick taps still clear low obstacles. */
    minHold: 0.12,
    coyoteTime: 0.1,
    bufferTime: 0.12,
    /** Ignore further jump presses for this long after a jump (anti double-trigger). */
    retriggerGuard: 0.08,
    terminalVelocity: -32,
    /** Ground this much above the feet is stepped onto (ramps, tiny ledges). */
    stepUp: 0.3,
    /** Walking off ground lower than this keeps the racer glued (downhill). */
    snapDown: 0.35,
    bouncePadVelocity: 16,
    /** Holding "down" in the air makes the racer fall faster. */
    fastFallScale: 1.9,
    /** After dropping through a one-way platform it is ignored this long. */
    dropThroughTime: 0.25,
    /** Running speed is multiplied by this while airborne: jumping costs a little time. */
    airSpeedFactor: 0.95,
  },

  hitbox: {
    halfWidth: 0.36,
    height: 1.1,
    /** Height while sliding: ducks under head-height projectiles. */
    slideHeight: 0.55,
  },

  stun: {
    log: 0.45,
    spikes: 0.55,
    saw: 0.65,
    crusher: 0.7,
    flame: 0.55,
    pendulum: 0.65,
    boulder: 0.55,
    projectile: 0.7,
    snare: 0.6,
    /** Speed multiplier applied at the moment of a stumble. */
    hitSpeedFactor: 0.25,
    /** Grace window where the same hazard can't hit the racer again. */
    rehitGuard: 1.1,
    /** Blinking grace after a stun ends, so a chain of hazards can't lock a racer in place. */
    recoveryInvuln: 0.9,
  },

  fall: {
    /** Below this height the racer has fallen off the course. */
    killY: -7,
    fallDuration: 0.5,
    respawnDelay: 0.7,
    respawnInvulnerability: 1.0,
    respawnOffset: 0.6,
  },

  slow: {
    mudFactor: 0.6,
    sapFactor: 0.55,
  },

  boostPad: { factor: 1.45, duration: 0.9 },

  race: {
    countdownSeconds: 3,
    maxDurationSeconds: 120,
    racers: 4,
    /** After the local player finishes, others get this long to cross the line. */
    finishGraceSeconds: 15,
  },

  itemBox: { respawnSeconds: 1.2, pickupRadius: 0.8 },
  glimmer: { pickupRadius: 0.7 },
} as const;

export const TICK_DT = 1 / GameplayConfig.tickRate;
