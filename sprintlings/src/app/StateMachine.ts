/** Small explicit state machine with allowed transitions and enter hooks. */
export class StateMachine<S extends string> {
  private current: S;
  private readonly listeners: ((to: S, from: S) => void)[] = [];

  constructor(
    initial: S,
    private readonly allowed: Record<S, readonly S[]>,
  ) {
    this.current = initial;
  }

  get state(): S {
    return this.current;
  }

  can(to: S): boolean {
    return this.allowed[this.current].includes(to);
  }

  go(to: S): void {
    if (to === this.current) return;
    if (!this.can(to)) throw new Error(`Illegal app transition ${this.current} -> ${to}`);
    const from = this.current;
    this.current = to;
    for (const l of this.listeners) l(to, from);
  }

  onChange(cb: (to: S, from: S) => void): void {
    this.listeners.push(cb);
  }
}

export type AppState = 'boot' | 'menu' | 'lobby' | 'race' | 'results';

export const APP_TRANSITIONS: Record<AppState, readonly AppState[]> = {
  boot: ['menu'],
  menu: ['lobby'],
  lobby: ['race', 'menu'],
  race: ['results', 'menu', 'lobby'],
  results: ['menu', 'lobby'],
};
