import { GameplayConfig } from '../config/GameplayConfig';
import type { AbilityId } from '../abilities/AbilityDefinition';
import type { CharacterId, SpecialId } from '../player/CharacterDefinition';
import type { PassiveModifiers } from '../player/CharacterAbilities';

export type RacerPhase = 'grid' | 'run' | 'fall' | 'respawn' | 'finished';

export interface TickInput {
  jumpHeld: boolean;
  down: boolean;
  use: boolean;
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

export interface RacerBody {
  phase: RacerPhase;
  x: number;
  y: number;
  vy: number;
  speed: number;
  grounded: boolean;
  pieceId: number;
  coyote: number;
  jumpBuffer: number;
  jumpGuard: number;
  jumpHeld: boolean;
  downHeld: boolean;
  jumping: boolean;
  jumpAge: number;
  cutPending: boolean;
  dropId: number;
  dropTimer: number;
  stun: number;
  invuln: number;
  phaseTimer: number;
  dash: number;
  padBoost: number;
  shield: number;
  terrain: number;
  lastHitId: number;
  lastHitTimer: number;
  fallFromX: number;
  onPad: boolean;
  blocked: boolean;
  sliding: boolean;
  slow: number;
  stampede: number;
  airHop: boolean;
  climbing: boolean;
  rollId: number;
  rollStart: number;
  rollPassX: number;
}

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
  team: number;
  id: string;
  name: string;
  characterId: CharacterId;
  isPlayer: boolean;
  cosmetics: Record<string, string>;
  variantId: string | null;
  mods: PassiveModifiers;
  body: RacerBody;
  item: AbilityId | null;
  itemTime: number;
  abilityCooldown: number;
  specialCooldown: number;
  finishTime: number | null;
  stats: RacerStats;
  glimmerTaken: Uint8Array;
  prevJumpHeld: boolean;
  prevDownHeld: boolean;
  startBoostArmed: boolean;
  streak: number;
}

export const STREAK_EVERY = 3;
export const STREAK_BOOST = 0.75;

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

export interface NooseEntity {
  kind: 'noose';
  id: number;
  owner: number;
  x: number;
  y: number;
  ttl: number;
  alive: boolean;
  sprung: number;
}

export const SNARE_HIT = 200000;
export const NOOSE_HIT = 400000;

export function trapTouched(entities: readonly Entity[], racer: number, body: RacerBody, sameTeam: (a: number, b: number) => boolean): number {
  if (body.invuln > 0) return -1;
  for (const e of entities) {
    if ((e.kind !== 'snare' && e.kind !== 'noose') || !e.alive || sameTeam(e.owner, racer)) continue;
    if (e.kind === 'noose' && e.sprung >= 0) continue;
    const tune = TRAP_SIZE[e.kind];
    if (Math.abs(e.x - body.x) > tune.halfWidth + GameplayConfig.hitbox.halfWidth) continue;
    if (body.y > e.y + tune.height || body.y + GameplayConfig.hitbox.height < e.y) continue;
    return (e.kind === 'snare' ? SNARE_HIT : NOOSE_HIT) + e.id;
  }
  return -1;
}

const TRAP_SIZE = { snare: { halfWidth: 0.45, height: 0.7 }, noose: { halfWidth: 0.5, height: 0.45 } } as const;

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

export type Entity = SeekerEntity | SnareEntity | NooseEntity | SapEntity | ThunderEntity | BombEntity;

export type RaceEventType =
  | 'countdown'
  | 'go'
  | 'startBoost'
  | 'jump'
  | 'land'
  | 'hurdleCleared'
  | 'streak'
  | 'hit'
  | 'bonk'
  | 'shieldBlock'
  | 'fall'
  | 'respawn'
  | 'itemPickup'
  | 'abilityUse'
  | 'seekerHit'
  | 'abilityHit'
  | 'itemExpire'
  | 'blast'
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
  value: number;
  ability: AbilityId | null;
  special?: SpecialId | null;
  x: number;
  y: number;
}
