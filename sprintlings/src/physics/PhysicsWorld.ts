import type { Track } from '../game/Track';
import type { RaceEventType, RacerBody } from '../game/RaceState';

export interface MovementWorld {
  readonly track: Track;
  readonly time: number;
  emit(type: RaceEventType, racer: number, value: number, body: RacerBody): void;
  inSap(racer: number, x: number, y: number): boolean;
  touchSnare(racer: number, body: RacerBody): number;
}

export interface BodyInput {
  jumpPressed: boolean;
  jumpReleased: boolean;
  jumpHeld: boolean;
  downPressed: boolean;
  downHeld: boolean;
}

export function makeBodyInput(): BodyInput {
  return { jumpPressed: false, jumpReleased: false, jumpHeld: false, downPressed: false, downHeld: false };
}
