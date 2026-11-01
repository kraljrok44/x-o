import { GameplayConfig } from '../config/GameplayConfig';
import type { Track } from '../game/Track';
import type { RacerBody } from '../game/RaceState';

export function groundUnder(track: Track, body: RacerBody, x: number, prevY: number): number {
  const reach = Math.max(body.y, prevY) + GameplayConfig.jump.stepUp;
  const oneWayOk = body.vy <= 0.01;
  const ignore = body.dropTimer > 0 ? body.dropId : -1;
  const g = track.groundBelow(x, reach, ignore, oneWayOk);
  return g;
}

export function hasFallenOut(body: RacerBody): boolean {
  return body.y < GameplayConfig.fall.killY;
}
