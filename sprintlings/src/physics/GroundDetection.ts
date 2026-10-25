import { GameplayConfig } from '../config/GameplayConfig';
import type { Track } from '../game/Track';

export const GroundKind = {
  None: 0,
  /** Solid ground the racer can stand on or step onto. */
  Ground: 1,
  /** Ground higher than a step: a ledge face the racer collides with. */
  Face: 2,
} as const;
export type GroundKind = (typeof GroundKind)[keyof typeof GroundKind];

/**
 * Classifies ground height `h` (null over a gap) relative to feet at `y`.
 * Allocation free so it can run inside planner rollouts.
 */
export function classifyGround(h: number | null, y: number): GroundKind {
  if (h === null) return GroundKind.None;
  return h > y + GameplayConfig.jump.stepUp ? GroundKind.Face : GroundKind.Ground;
}

/** True when the racer is close enough above ground to stick to it (walking downhill). */
export function canSnapDown(h: number, y: number): boolean {
  return y - h <= GameplayConfig.jump.snapDown;
}

export function hasFallenOut(track: Track, s: number, y: number): boolean {
  return y < track.baseline(s) - GameplayConfig.fall.killDepth;
}
