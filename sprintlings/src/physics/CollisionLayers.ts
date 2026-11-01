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
