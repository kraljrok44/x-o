/**
 * Collision layers. The simulation is a dedicated arcade model (not a rigid
 * body solver) so layers are only used to decide which pairs are tested:
 *
 *   RACER    vs STATIC_HAZARD, DYNAMIC_HAZARD, PICKUP, TERRAIN_ZONE
 *   PROJECTILE vs RACER, STATIC_HAZARD (walls destroy seekers)
 *   RACER    vs RACER  -> never: racers ghost through each other so lane
 *                         changes never cause unpredictable shoves. The
 *                         renderer nudges overlapping models apart instead.
 *
 * Cosmetic debris (render/DebrisPhysics.ts) lives in its own Rapier world on
 * the DEBRIS layer and never feeds back into the race.
 */
export const Layer = {
  RACER: 1 << 0,
  STATIC_HAZARD: 1 << 1,
  DYNAMIC_HAZARD: 1 << 2,
  PROJECTILE: 1 << 3,
  PICKUP: 1 << 4,
  TERRAIN_ZONE: 1 << 5,
  DEBRIS: 1 << 6,
} as const;

export const COLLIDES_WITH: Record<number, number> = {
  [Layer.RACER]: Layer.STATIC_HAZARD | Layer.DYNAMIC_HAZARD | Layer.PROJECTILE | Layer.PICKUP | Layer.TERRAIN_ZONE,
  [Layer.PROJECTILE]: Layer.RACER | Layer.STATIC_HAZARD,
  [Layer.DEBRIS]: Layer.DEBRIS,
};

export function layersCollide(a: number, b: number): boolean {
  return ((COLLIDES_WITH[a] ?? 0) & b) !== 0 || ((COLLIDES_WITH[b] ?? 0) & a) !== 0;
}
