import type { TickInput } from './RaceState';

/**
 * Compact log of one human racer's inputs, sufficient (together with the
 * race setup and seed) to re-simulate the race exactly. Each entry is
 * [tick, bits] and is written only when the bits differ from "held state
 * unchanged and nothing pressed".
 *
 * bit 0: jump held, bit 1: left pressed, bit 2: right pressed, bit 3: use pressed
 */
export type InputLog = [number, number][];

const JUMP = 1;
const LEFT = 2;
const RIGHT = 4;
const USE = 8;

export function encodeInput(i: TickInput): number {
  return (i.jumpHeld ? JUMP : 0) | (i.left ? LEFT : 0) | (i.right ? RIGHT : 0) | (i.use ? USE : 0);
}

export class InputRecorder {
  readonly log: InputLog = [];
  private lastHeld = false;

  record(tick: number, input: TickInput): void {
    const bits = encodeInput(input);
    const presses = bits & (LEFT | RIGHT | USE);
    if (presses || input.jumpHeld !== this.lastHeld) this.log.push([tick, bits]);
    this.lastHeld = input.jumpHeld;
  }
}

/** Replays an InputLog tick by tick. */
export class InputPlayer {
  private cursor = 0;
  private held = false;
  private readonly out: TickInput = { jumpHeld: false, left: false, right: false, use: false };

  constructor(private readonly log: InputLog) {}

  at(tick: number): TickInput {
    const o = this.out;
    o.left = o.right = o.use = false;
    while (this.cursor < this.log.length && this.log[this.cursor][0] < tick) this.cursor++;
    if (this.cursor < this.log.length && this.log[this.cursor][0] === tick) {
      const bits = this.log[this.cursor][1];
      this.held = (bits & JUMP) !== 0;
      o.left = (bits & LEFT) !== 0;
      o.right = (bits & RIGHT) !== 0;
      o.use = (bits & USE) !== 0;
      this.cursor++;
    }
    o.jumpHeld = this.held;
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
    if (!Number.isInteger(t) || !Number.isInteger(b) || t <= prev || t < 0 || t > maxTick || b < 0 || b > 15) return false;
    prev = t;
  }
  return true;
}
