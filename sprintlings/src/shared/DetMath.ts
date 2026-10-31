/**
 * Deterministic trigonometry for the simulation. Math.sin/cos are not
 * guaranteed to round identically across JavaScript engines, and the race
 * must play out bit-for-bit the same in every browser and on the server
 * (re-simulation, online lockstep). These use only + and *, which IEEE 754
 * rounds the same everywhere.
 */
const TWO_PI = Math.PI * 2;
const HALF_PI = Math.PI / 2;

export function dsin(x: number): number {
  // Reduce to [-pi, pi], then to [-pi/2, pi/2] using sin(pi - x) = sin(x).
  let r = x - Math.round(x / TWO_PI) * TWO_PI;
  if (r > HALF_PI) r = Math.PI - r;
  else if (r < -HALF_PI) r = -Math.PI - r;
  const r2 = r * r;
  // Taylor series to x^15: error below 1e-12 on [-pi/2, pi/2].
  return (
    r *
    (1 +
      r2 *
        (-1 / 6 +
          r2 * (1 / 120 + r2 * (-1 / 5040 + r2 * (1 / 362880 + r2 * (-1 / 39916800 + r2 * (1 / 6227020800 + r2 * (-1 / 1307674368000))))))))
  );
}

export function dcos(x: number): number {
  return dsin(x + HALF_PI);
}

/** Euclidean length; Math.hypot's rounding is engine specific, sqrt is exact. */
export function dhypot(x: number, y: number): number {
  return Math.sqrt(x * x + y * y);
}
