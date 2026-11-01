// Central configuration. All gameplay numbers live here (spec 7: "one central config source").
// Units: game units (1 unit ~ 1.9 cm), seconds. World axis Z is up, gravity acts along -Z.

export const PHYSICS_VERSION = 'gz-phys-1.0';
export const CATALOG_VERSION = 'vault-1.0';

export const PHYS = {
  tickRate: 100,            // fixed simulation step (Hz)
  gravity: 800,
  friction: 4.0,
  stopSpeed: 75,
  accelerate: 6.5,          // ground acceleration
  airAccelerate: 150,       // surf-style air acceleration
  airWishCap: 30,           // max wish speed added per air tick (what makes strafing work)
  maxSpeed: 260,            // max wish speed on foot
  forwardSpeed: 450,
  sideSpeed: 450,
  jumpImpulse: 301.993,     // sqrt(2 * 800 * 57)
  maxVelocity: 3500,        // per-axis safety clamp
  stepSize: 18,
  groundNormalZ: 0.7,       // surfaces flatter than this are "ground", steeper ones are surfable
  nonJumpVelocity: 140,
  hullHalf: [16, 16, 36],   // player box half extents (width 32, height 72)
  hullZOffset: 36,          // origin is at the feet, box centre is 36 units up
  viewHeight: 64,
  distEpsilon: 0.03125,
  maxClipPlanes: 5,
  bumps: 4,
  startZoneSpeedCap: 290,   // anti pre-speed inside start zone
  boostAmount: 160,         // GLIDEZONE twist: flow rings add speed along the velocity
  autoHop: true,
};

export const NET = {
  defaultPort: 8081,
  snapshotEveryTicks: 5,    // 20 Hz snapshots
  interpDelayTicks: 12,     // remote players are rendered 120 ms in the past
  maxCmdBudget: 25,         // anti speed-hack: commands are processed at most at tick rate
  maxPlayersPerRoom: 24,
  cmdsPerPacket: 2,
};

export const GAME = {
  mapTimeSec: 600,          // vote starts after 10 minutes on a map
  extendSec: 300,           // "extend" adds 5 minutes
  voteDurationSec: 20,
  rtvRatio: 0.5,            // >= 50% of current players request a vote -> early vote
  voteMapOptions: 4,
  mapChangeDelaySec: 6,
  crateCooldownSec: 20,     // server-side minimum time between two crate openings
  maxNameLength: 16,
};
