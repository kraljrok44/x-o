import { GameplayConfig } from '../config/GameplayConfig';
import type { AbilityId } from '../abilities/AbilityDefinition';
import type { CharacterId, SpecialId } from '../player/CharacterDefinition';
import type { PassiveModifiers } from '../player/CharacterAbilities';

export type RacerPhase = 'grid' | 'run' | 'fall' | 'respawn' | 'finished';

/** Input for a single simulation tick. Presses are edges, `jumpHeld`/`down` are levels. */
export interface TickInput {
  jumpHeld: boolean;
  /** Held: drop through one-way platforms / fall faster. */
  down: boolean;
  use: boolean;
  /** Press: fire the animal's own special ability. */
  special?: boolean;
}

export const NO_INPUT: Readonly<TickInput> = Object.freeze({ jumpHeld: false, down: false, use: false });

export interface RacerStats {
  jumps: number;
  hurdlesCleared: number;
  abilitiesUsed: number;
  hitsTaken: number;
  hitsLanded: number;
  falls: number;
  glimmers: number;
  itemBoxes: number;
  shieldBlocks: number;
}

export function emptyStats(): RacerStats {
  return { jumps: 0, hurdlesCleared: 0, abilitiesUsed: 0, hitsTaken: 0, hitsLanded: 0, falls: 0, glimmers: 0, itemBoxes: 0, shieldBlocks: 0 };
}

/**
 * Complete physical state of one racer. Kept as a flat object of numbers and
 * booleans so the AI planner can clone it cheaply for look-ahead rollouts.
 */
export interface RacerBody {
  phase: RacerPhase;
  x: number;
  y: number;
  vy: number;
  speed: number;
  grounded: boolean;
  /** Ground piece the racer stands on (-1 in the air). */
  pieceId: number;
  coyote: number;
  jumpBuffer: number;
  jumpGuard: number;
  jumpHeld: boolean;
  downHeld: boolean;
  /** True while the current airtime started with a jump (release-cut allowed). */
  jumping: boolean;
  jumpAge: number;
  cutPending: boolean;
  /** One-way platform being dropped through, and for how long. */
  dropId: number;
  dropTimer: number;
  stun: number;
  invuln: number;
  phaseTimer: number;
  dash: number;
  padBoost: number;
  shield: number;
  /** Terrain under the racer this tick: 0 none, 1 mud, 2 sap. */
  terrain: number;
  lastHitId: number;
  lastHitTimer: number;
  fallFromX: number;
  onPad: boolean;
  /** Pressing against a wall this tick (for animation). */
  blocked: boolean;
  /** Holding down on solid ground: a low slide that ducks flying projectiles. */
  sliding: boolean;
  /** Slowed by a rival's howl (seconds left). */
  slow: number;
  /** Bull stampede: dash that knocks over rivals it touches (seconds left). */
  stampede: number;
  /** Rabbit double hop is still available in this airtime. */
  airHop: boolean;
  /** Scaling a tall wall (pressing against a face too high to jump). */
  climbing: boolean;
  /** This racer's own rolling barrel: hazard id (-1 none) and when it started. */
  rollId: number;
  rollStart: number;
  /** x of the last barrel hazard this racer has triggered. */
  rollPassX: number;
}

/** Current hitbox height (lower while sliding). */
export function bodyHeight(b: RacerBody): number {
  return b.sliding ? GameplayConfig.hitbox.slideHeight : GameplayConfig.hitbox.height;
}

export function makeBody(x: number, y: number): RacerBody {
  return {
    phase: 'grid',
    x,
    y,
    vy: 0,
    speed: 0,
    grounded: true,
    pieceId: -1,
    coyote: 0,
    jumpBuffer: 0,
    jumpGuard: 0,
    jumpHeld: false,
    downHeld: false,
    jumping: false,
    jumpAge: 0,
    cutPending: false,
    dropId: -1,
    dropTimer: 0,
    stun: 0,
    invuln: 0,
    phaseTimer: 0,
    dash: 0,
    padBoost: 0,
    shield: 0,
    terrain: 0,
    lastHitId: -1,
    lastHitTimer: 0,
    fallFromX: 0,
    onPad: false,
    blocked: false,
    sliding: false,
    slow: 0,
    stampede: 0,
    airHop: false,
    climbing: false,
    rollId: -1,
    rollStart: 0,
    rollPassX: -1e9,
  };
}

export function copyBody(from: RacerBody, to: RacerBody): RacerBody {
  Object.assign(to, from);
  return to;
}

export interface Racer {
  index: number;
  /** Team id: racers on the same team never hurt each other (Duos). */
  team: number;
  id: string;
  name: string;
  characterId: CharacterId;
  isPlayer: boolean;
  /** Cosmetic loadout id list, only used by the renderer. */
  cosmetics: Record<string, string>;
  variantId: string | null;
  mods: PassiveModifiers;
  body: RacerBody;
  item: AbilityId | null;
  /** Seconds left before the held powerup fizzles out unused. */
  itemTime: number;
  abilityCooldown: number;
  /** Seconds until the animal special can be used again. */
  specialCooldown: number;
  finishTime: number | null;
  stats: RacerStats;
  /** Per-racer glimmer pickup flags (index = glimmer index in track data). */
  glimmerTaken: Uint8Array;
  /** Previous jumpHeld to detect press/release edges. */
  prevJumpHeld: boolean;
  prevDownHeld: boolean;
  /** Start boost earned by pressing jump right at "GO". */
  startBoostArmed: boolean;
}

export interface SeekerEntity {
  kind: 'seeker';
  id: number;
  owner: number;
  target: number;
  x: number;
  y: number;
  vy: number;
  age: number;
  alive: boolean;
}

export interface SnareEntity {
  kind: 'snare';
  id: number;
  owner: number;
  x: number;
  y: number;
  ttl: number;
  alive: boolean;
}

export interface SapEntity {
  kind: 'sap';
  id: number;
  owner: number;
  x0: number;
  x1: number;
  y: number;
  ttl: number;
  alive: boolean;
}

/** Storm cloud hovering over a target, striking when the timer runs out. */
export interface ThunderEntity {
  kind: 'thunder';
  id: number;
  owner: number;
  target: number;
  x: number;
  y: number;
  ttl: number;
  alive: boolean;
}

/** Lobbed bomb: flies on a gravity arc, blasts on landing or when the fuse ends. */
export interface BombEntity {
  kind: 'bomb';
  id: number;
  owner: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  ttl: number;
  alive: boolean;
}

export type Entity = SeekerEntity | SnareEntity | SapEntity | ThunderEntity | BombEntity;

export type RaceEventType =
  | 'countdown'
  | 'go'
  | 'startBoost'
  | 'jump'
  | 'land'
  | 'hurdleCleared'
  | 'hit'
  | 'bonk'
  | 'shieldBlock'
  | 'fall'
  | 'respawn'
  | 'itemPickup'
  | 'abilityUse'
  | 'seekerHit'
  /** A racer was hit by a rival's powerup (value = attacker, ability = which). */
  | 'abilityHit'
  /** A held powerup ran out of time unused. */
  | 'itemExpire'
  /** An explosion or lightning strike at (x, y): value 0 = bomb, 1 = thunder. */
  | 'blast'
  /** An animal special was used (value = character special index, see CharacterDefinition). */
  | 'special'
  | 'seekerExpire'
  | 'glimmer'
  | 'boostPad'
  | 'bounce'
  | 'drop'
  | 'finish';

export interface RaceEvent {
  type: RaceEventType;
  racer: number;
  /** Extra numeric payload (hazard id, glimmer index, countdown number...). */
  value: number;
  /** Optional ability involved. */
  ability: AbilityId | null;
  /** Optional animal special involved (stampede / pickpocket hits). */
  special?: SpecialId | null;
  /** Position of the event in track space. */
  x: number;
  y: number;
}
