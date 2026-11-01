const TWO_PI = Math.PI * 2;
const HALF_PI = Math.PI / 2;

export function dsin(x: number): number {
  let r = x - Math.round(x / TWO_PI) * TWO_PI;
  if (r > HALF_PI) r = Math.PI - r;
  else if (r < -HALF_PI) r = -Math.PI - r;
  const r2 = r * r;
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

export function dhypot(x: number, y: number): number {
  return Math.sqrt(x * x + y * y);
}
