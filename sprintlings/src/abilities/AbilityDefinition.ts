/**
 * The five race abilities. Racers obtain one charge at a time from loot crates
 * placed on the track and fire it with the ability key.
 *
 * Every field the design document asks for (activation, duration, range,
 * speed, targeting, counterplay, cooldown, feedback, network behaviour,
 * invalid-use rules) is spelled out per ability so balance discussions have
 * one source of truth.
 */
export type AbilityId = 'dash' | 'shield' | 'seeker' | 'snare' | 'sap' | 'lasso' | 'thunder' | 'bomb';

export interface AbilityDefinition {
  id: AbilityId;
  name: string;
  description: string;
  /** Seconds between pressing the key and the effect starting. */
  activationTime: number;
  /** Seconds the effect lasts (0 = instantaneous). */
  duration: number;
  /** Max distance the effect can reach along the track (u). */
  range: number;
  /** Speed of the effect, e.g. projectile speed (u/s). 0 when not applicable. */
  speed: number;
  targeting: 'self' | 'nearestAhead' | 'behind';
  counterplay: string;
  /** Lockout after using any ability before another can be fired. */
  cooldown: number;
  feedback: { sound: string; visual: string };
  /** How the ability is replicated online (see network/ServerMessages.ts). */
  network: 'input-event' | 'server-spawned-entity';
  /** What happens when the ability can't be used right now. */
  invalidUse: string;
  color: string;
  icon: string;
}

export const ABILITIES: Record<AbilityId, AbilityDefinition> = {
  dash: {
    id: 'dash',
    name: 'Spur Dash',
    description: 'Dig in your spurs for a short burst of speed. Walls still stop you.',
    activationTime: 0,
    duration: 1.5,
    range: 0,
    speed: 0,
    targeting: 'self',
    counterplay: 'Opponents can still hit you with seekers; obstacles still trip you.',
    cooldown: 0.5,
    feedback: { sound: 'dash', visual: 'speed lines + dust trail' },
    network: 'input-event',
    invalidUse: 'Ignored while stunned, falling or respawning; charge is kept.',
    color: '#4fb0ff',
    icon: '💨',
  },
  shield: {
    id: 'shield',
    name: 'Tin Star Shield',
    description: 'A lucky tin star blocks the next hit or slow-down for 5 seconds.',
    activationTime: 0,
    duration: 5,
    range: 0,
    speed: 0,
    targeting: 'self',
    counterplay: 'Bait it with dynamite before firing a rocket.',
    cooldown: 0.5,
    feedback: { sound: 'shield', visual: 'golden star shield' },
    network: 'input-event',
    invalidUse: 'Ignored while falling or respawning; charge is kept.',
    color: '#f2c14e',
    icon: '⭐',
  },
  seeker: {
    id: 'seeker',
    name: 'Homing Rocket',
    description: 'A toy rocket that homes in on the nearest racer ahead.',
    activationTime: 0.1,
    duration: 6,
    range: 90,
    speed: 17,
    targeting: 'nearestAhead',
    counterplay: 'Jump over it at the last moment, take another route, or shield it.',
    cooldown: 0.5,
    feedback: { sound: 'seeker', visual: 'red rocket with smoke trail; target gets a warning' },
    network: 'server-spawned-entity',
    invalidUse: 'Ignored while stunned, falling or respawning; charge is kept.',
    color: '#e8473b',
    icon: '🚀',
  },
  snare: {
    id: 'snare',
    name: 'Dynamite',
    description: 'Drops a ticking dynamite bundle behind you for 10 seconds.',
    activationTime: 0,
    duration: 10,
    range: 2,
    speed: 0,
    targeting: 'behind',
    counterplay: 'Jump over it or take the upper route.',
    cooldown: 0.5,
    feedback: { sound: 'snare', visual: 'dynamite with lit fuse, flashing timer and red danger ring' },
    network: 'server-spawned-entity',
    invalidUse: 'Ignored in the air over a gap (no ground to place on); charge is kept.',
    color: '#ff3d2e',
    icon: '🧨',
  },
  sap: {
    id: 'sap',
    name: 'Tar Spill',
    description: 'Tips a barrel of sticky tar behind you that slows racers for 6 seconds.',
    activationTime: 0,
    duration: 6,
    range: 6,
    speed: 0,
    targeting: 'behind',
    counterplay: 'Jump across it; shields ignore it.',
    cooldown: 0.5,
    feedback: { sound: 'sap', visual: 'black tar pool with hazard stripes and a tipped barrel' },
    network: 'server-spawned-entity',
    invalidUse: 'Ignored in the air over a gap; charge is kept.',
    color: '#6a4aa8',
    icon: '🛢',
  },
  lasso: {
    id: 'lasso',
    name: 'Lasso',
    description: 'Ropes the nearest rival just ahead. With nobody in reach it is laid on the trail as a rope trap that yanks the next rival up.',
    activationTime: 0,
    duration: 0,
    range: 7,
    speed: 0,
    targeting: 'nearestAhead',
    counterplay: 'Keep your distance from rivals behind, or carry a shield.',
    cooldown: 0.5,
    feedback: { sound: 'snare', visual: 'rope snaps from the thrower to the target' },
    network: 'input-event',
    invalidUse: 'Ignored when no rival is within reach ahead; charge is kept.',
    color: '#c98a4b',
    icon: '🪢',
  },
  thunder: {
    id: 'thunder',
    name: 'Thunder Cloud',
    description: 'A storm cloud chases the race leader and strikes after a warning.',
    activationTime: 1,
    duration: 1,
    range: 0,
    speed: 0,
    targeting: 'nearestAhead',
    counterplay: 'Raise a shield when the cloud and its red warning beam appear over you.',
    cooldown: 0.5,
    feedback: { sound: 'seeker', visual: 'dark cloud, red warning beam, lightning flash' },
    network: 'server-spawned-entity',
    invalidUse: 'Ignored when you or your team already lead; charge is kept.',
    color: '#7f8ba0',
    icon: '⛈',
  },
  bomb: {
    id: 'bomb',
    name: 'Cannonball Bomb',
    description: 'Lobs a fizzing bomb forward that blasts everyone near where it lands.',
    activationTime: 0,
    duration: 1.4,
    range: 8,
    speed: 9,
    targeting: 'self',
    counterplay: 'Watch the arc and stay clear of the landing spot.',
    cooldown: 0.5,
    feedback: { sound: 'seeker', visual: 'black bomb with lit fuse, explosion burst' },
    network: 'server-spawned-entity',
    invalidUse: 'Ignored while stunned, falling or respawning; charge is kept.',
    color: '#2a2a33',
    icon: '💣',
  },
};

export const ABILITY_IDS: readonly AbilityId[] = ['dash', 'shield', 'seeker', 'snare', 'sap', 'lasso', 'thunder', 'bomb'];

/**
 * Loot crate roll weights by race position (index 0 = leader). Trailing racers
 * get more offensive/catch-up tools, leaders more defensive ones.
 */
export const ITEM_WEIGHTS_BY_POSITION: readonly Record<AbilityId, number>[] = [
  { dash: 10, shield: 28, seeker: 8, snare: 26, sap: 18, lasso: 4, thunder: 0, bomb: 6 },
  { dash: 16, shield: 18, seeker: 18, snare: 14, sap: 10, lasso: 10, thunder: 6, bomb: 8 },
  { dash: 22, shield: 12, seeker: 20, snare: 10, sap: 6, lasso: 12, thunder: 10, bomb: 8 },
  { dash: 28, shield: 8, seeker: 22, snare: 6, sap: 4, lasso: 12, thunder: 14, bomb: 6 },
];

/** A held powerup expires after this many seconds, so it never sticks with you. */
export const ITEM_LIFETIME = 10;

export const AbilityTuning = {
  dash: { speedFactor: 1.55 },
  seeker: {
    spawnAhead: 1.2,
    /** Vertical homing speed toward the target (u/s). */
    homing: 3.2,
    radius: 0.36,
    /** Cruising height above the target's feet: head height, so a slide ducks under it. */
    height: 0.95,
    acquireRange: 70,
  },
  snare: { offsetBehind: 1.6, halfWidth: 0.45, height: 0.7 },
  sap: { offsetBehind: 1.5, length: 4.2 },
  lasso: { range: 7, stun: 0.5, trapBehind: 1.4, trapTime: 12 },
  thunder: { warn: 1.0, stun: 0.7 },
  bomb: { vx: 9, vy: 7, radius: 1.6, stun: 0.65, fuse: 1.4 },
} as const;
