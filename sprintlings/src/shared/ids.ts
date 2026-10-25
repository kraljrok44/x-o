/** Random identifier for events/transactions. Uses crypto when available. */
export function newId(prefix: string): string {
  const c = (globalThis as { crypto?: Crypto }).crypto;
  if (c && typeof c.randomUUID === 'function') return `${prefix}_${c.randomUUID()}`;
  let s = '';
  for (let i = 0; i < 24; i++) s += Math.floor(Math.random() * 16).toString(16);
  return `${prefix}_${s}`;
}
