import type { Track } from '../game/Track';
import type { RaceEventType, RacerBody } from '../game/RaceState';

/**
 * What the racer movement step needs from its surroundings. The real race
 * (game/RaceManager.ts) implements it with live entities and event output;
 * the AI planner implements it with a side-effect-free prediction so it can
 * run "what if" rollouts with the exact same movement code.
 */
export interface MovementWorld {
  readonly track: Track;
  /** Race clock in seconds (0 at "GO"). Timed hazards depend on it. */
  readonly time: number;
  emit(type: RaceEventType, racer: number, value: number, body: RacerBody): void;
  /** True when x lies in an active sap puddle (at ground height y) not owned by `racer`. */
  inSap(racer: number, x: number, y: number): boolean;
  /** Id of a snare overlapping the racer (consumed by the real world), or -1. */
  touchSnare(racer: number, body: RacerBody): number;
}

/** Input edges for one movement step. */
export interface BodyInput {
  jumpPressed: boolean;
  jumpReleased: boolean;
  jumpHeld: boolean;
  /** Down was pressed this tick (drop through a platform). */
  downPressed: boolean;
  downHeld: boolean;
}

export function makeBodyInput(): BodyInput {
  return { jumpPressed: false, jumpReleased: false, jumpHeld: false, downPressed: false, downHeld: false };
}
