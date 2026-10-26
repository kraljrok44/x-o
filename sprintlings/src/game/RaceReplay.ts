import type { TickInput } from './RaceState';

/**
 * Compact log of one human racer's inputs, sufficient (together with the
 * race setup and seed) to re-simulate the race exactly. Each entry is
 * [tick, bits] and is written only when a held state changes or the ability
 * key is pressed.
 *
 * bit 0: jump held, bit 1: down held, bit 2: special pressed, bit 3: use pressed
 */
export type InputLog = [number, number][];

const JUMP = 1;
const DOWN = 2;
const SPECIAL = 4;
const USE = 8;
const VALID_BITS = JUMP | DOWN | SPECIAL | USE;

export function encodeInput(i: TickInput): number {
  return (i.jumpHeld ? JUMP : 0) | (i.down ? DOWN : 0) | (i.use ? USE : 0) | (i.special ? SPECIAL : 0);
}

export class InputRecorder {
  readonly log: InputLog = [];
  private lastHeld = 0;

  record(tick: number, input: TickInput): void {
    const bits = encodeInput(input);
    const held = bits & (JUMP | DOWN);
    if (bits & (USE | SPECIAL) || held !== this.lastHeld) this.log.push([tick, bits]);
    this.lastHeld = held;
  }
}

/** Replays an InputLog tick by tick. */
export class InputPlayer {
  private cursor = 0;
  private held = 0;
  private readonly out: TickInput = { jumpHeld: false, down: false, use: false, special: false };

  constructor(private readonly log: InputLog) {}

  at(tick: number): TickInput {
    const o = this.out;
    o.use = false;
    o.special = false;
    while (this.cursor < this.log.length && this.log[this.cursor][0] < tick) this.cursor++;
    if (this.cursor < this.log.length && this.log[this.cursor][0] === tick) {
      const bits = this.log[this.cursor][1];
      this.held = bits & (JUMP | DOWN);
      o.use = (bits & USE) !== 0;
      o.special = (bits & SPECIAL) !== 0;
      this.cursor++;
    }
    o.jumpHeld = (this.held & JUMP) !== 0;
    o.down = (this.held & DOWN) !== 0;
    return o;
  }
}

/** Rejects logs that are malformed or physically impossible to input. */
export function validateInputLog(log: unknown, maxTick: number): log is InputLog {
  if (!Array.isArray(log) || log.length > 20000) return false;
  let prev = -1;
  for (const e of log) {
    if (!Array.isArray(e) || e.length !== 2) return false;
    const [t, b] = e;
    if (!Number.isInteger(t) || !Number.isInteger(b) || t <= prev || t < 0 || t > maxTick || b < 0 || (b & ~VALID_BITS) !== 0) return false;
    prev = t;
  }
  return true;
}
