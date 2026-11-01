export const GameplayConfig = {
  tickRate: 60,

  movement: {
    baseSpeed: 9,
    accel: 14,
    decel: 30,
    startBoostSpeed: 11.5,
    startBoostWindowTicks: 12,
    startBoostDuration: 0.8,
  },

  jump: {
    gravity: 26,
    velocity: 10.8,
    releaseCut: 0.5,
    minHold: 0.12,
    coyoteTime: 0.1,
    bufferTime: 0.12,
    retriggerGuard: 0.08,
    terminalVelocity: -32,
    stepUp: 0.3,
    snapDown: 0.35,
    bouncePadVelocity: 16,
    fastFallScale: 1.9,
    dropThroughTime: 0.25,
    airSpeedFactor: 0.95,
  },

  hitbox: {
    halfWidth: 0.36,
    height: 1.1,
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
    hitSpeedFactor: 0.25,
    rehitGuard: 1.1,
    recoveryInvuln: 0.9,
  },

  fall: {
    killY: -7,
    fallDuration: 0.3,
    respawnDelay: 0.35,
    respawnInvulnerability: 1.0,
    respawnOffset: 0.6,
  },

  slow: {
    mudFactor: 0.6,
    sapFactor: 0.55,
  },

  boostPad: { factor: 1.45, duration: 0.9 },

  climb: { speed: 6.5, topSpeed: 6 },

  race: {
    countdownSeconds: 3,
    maxDurationSeconds: 120,
    racers: 4,
    finishGraceSeconds: 15,
  },

  itemBox: { respawnSeconds: 1.2, pickupRadius: 0.8 },
  glimmer: { pickupRadius: 0.7 },
} as const;

export const TICK_DT = 1 / GameplayConfig.tickRate;
