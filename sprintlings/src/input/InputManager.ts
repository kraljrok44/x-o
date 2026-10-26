import type { TickInput } from '../game/RaceState';

export type InputAction = 'jump' | 'down' | 'ability' | 'special' | 'pause';

export type KeyBindings = Record<InputAction, string[]>;

export const DEFAULT_BINDINGS: KeyBindings = {
  jump: ['Space', 'KeyW', 'ArrowUp'],
  down: ['KeyS', 'ArrowDown'],
  ability: ['KeyE', 'ShiftLeft', 'KeyD', 'ArrowRight'],
  special: ['KeyQ', 'KeyF', 'ArrowLeft'],
  pause: ['Escape', 'KeyP'],
};

export const ACTION_LABELS: Record<InputAction, string> = {
  jump: 'Jump',
  down: 'Drop down',
  ability: 'Use powerup',
  special: 'Animal special',
  pause: 'Pause',
};

export function sanitizeBindings(b: Partial<KeyBindings> | undefined): KeyBindings {
  const out = { ...DEFAULT_BINDINGS };
  if (!b) return out;
  for (const k of Object.keys(DEFAULT_BINDINGS) as InputAction[]) {
    const v = b[k];
    if (Array.isArray(v) && v.every((x) => typeof x === 'string') && v.length > 0 && v.length <= 4) out[k] = [...v];
  }
  return out;
}

export function keyLabel(code: string): string {
  if (code === 'Space') return 'Space';
  if (code.startsWith('Key')) return code.slice(3);
  if (code.startsWith('Digit')) return code.slice(5);
  if (code.startsWith('Arrow')) return { ArrowUp: '↑', ArrowDown: '↓', ArrowLeft: '←', ArrowRight: '→' }[code] ?? code;
  if (code === 'Mouse0') return 'Left click';
  if (code === 'Mouse2') return 'Right click';
  return code.replace('Left', ' L').replace('Right', ' R');
}

/**
 * Collects keyboard, mouse, touch and gamepad input and turns it into one
 * TickInput per simulation tick. Presses are latched until the next tick so
 * a tap shorter than a tick is never lost; jump is level-triggered.
 */
export class InputManager {
  private bindings: KeyBindings = { ...DEFAULT_BINDINGS };
  private codeToAction = new Map<string, InputAction>();
  private jumpSources = new Set<string>();
  private downSources = new Set<string>();
  /** Ticks a swipe-down keeps "down" held (long enough to drop through a platform). */
  private downPulse = 0;
  private latched = { use: false, special: false, jumpTap: false, downTap: false };
  private readonly out: TickInput = { jumpHeld: false, down: false, use: false, special: false };
  enabled = false;
  onPause: (() => void) | null = null;
  /** Quick chat: keys 1-4 during a race. */
  onEmote: ((slot: number) => void) | null = null;
  /** Called on any input so the app can unlock audio etc. */
  onActivity: (() => void) | null = null;
  private capture: ((code: string) => void) | null = null;
  private touchStart = new Map<number, { x: number; y: number; t: number; handled: boolean }>();
  private padPrev: boolean[] = [];

  constructor(surface: HTMLElement) {
    this.rebuildMap();
    window.addEventListener('keydown', (e) => this.onKey(e, true), { passive: false });
    window.addEventListener('keyup', (e) => this.onKey(e, false));
    window.addEventListener('blur', () => this.releaseAll());
    surface.addEventListener('mousedown', (e) => this.onMouse(e, true));
    window.addEventListener('mouseup', (e) => this.onMouse(e, false));
    surface.addEventListener('contextmenu', (e) => e.preventDefault());
    surface.addEventListener('touchstart', (e) => this.onTouchStart(e), { passive: false });
    surface.addEventListener('touchmove', (e) => this.onTouchMove(e), { passive: false });
    surface.addEventListener('touchend', (e) => this.onTouchEnd(e));
    surface.addEventListener('touchcancel', (e) => this.onTouchEnd(e));
  }

  setBindings(b: KeyBindings): void {
    this.bindings = sanitizeBindings(b);
    this.rebuildMap();
  }

  getBindings(): KeyBindings {
    return this.bindings;
  }

  /** Next key or mouse button pressed is passed to `cb` instead of the game (rebinding UI). */
  captureNext(cb: (code: string) => void): void {
    this.capture = cb;
  }

  private rebuildMap(): void {
    this.codeToAction.clear();
    for (const action of Object.keys(this.bindings) as InputAction[]) {
      for (const code of this.bindings[action]) this.codeToAction.set(code, action);
    }
    this.codeToAction.set('Mouse2', this.codeToAction.get('Mouse2') ?? 'ability');
  }

  private releaseAll(): void {
    this.jumpSources.clear();
    this.downSources.clear();
  }

  private handle(code: string, down: boolean): boolean {
    const action = this.codeToAction.get(code);
    if (!action) return false;
    if (action === 'pause') {
      if (down) this.onPause?.();
      return true;
    }
    if (!this.enabled) return true;
    if (action === 'jump') {
      if (down) {
        if (!this.jumpSources.has(code)) this.latched.jumpTap = true;
        this.jumpSources.add(code);
      } else this.jumpSources.delete(code);
      return true;
    }
    if (action === 'down') {
      if (down) {
        this.downSources.add(code);
        this.latched.downTap = true;
      } else this.downSources.delete(code);
      return true;
    }
    if (!down) return true;
    if (action === 'ability') this.latched.use = true;
    if (action === 'special') this.latched.special = true;
    return true;
  }

  private onKey(e: KeyboardEvent, down: boolean): void {
    this.onActivity?.();
    if (this.capture && down) {
      e.preventDefault();
      const cb = this.capture;
      this.capture = null;
      cb(e.code);
      return;
    }
    const target = e.target as HTMLElement | null;
    if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA')) return;
    if (down && e.repeat && this.codeToAction.get(e.code) !== 'pause') {
      if (this.codeToAction.has(e.code)) e.preventDefault();
      return;
    }
    if (down && this.enabled && /^Digit[1-4]$/.test(e.code) && !this.codeToAction.has(e.code)) {
      this.onEmote?.(Number(e.code.slice(5)) - 1);
      e.preventDefault();
      return;
    }
    const used = this.handle(e.code, down);
    // Stop space/arrows from scrolling the page inside portal iframes.
    if (used || ['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) e.preventDefault();
  }

  private onMouse(e: MouseEvent, down: boolean): void {
    this.onActivity?.();
    const code = `Mouse${e.button}`;
    if (this.capture && down) {
      const cb = this.capture;
      this.capture = null;
      cb(code);
      return;
    }
    if (!this.enabled) return;
    if (e.button === 0) {
      if (down) {
        if (!this.jumpSources.has('Mouse0')) this.latched.jumpTap = true;
        this.jumpSources.add('Mouse0');
      } else this.jumpSources.delete('Mouse0');
      return;
    }
    if (down) this.handle(code, true);
  }

  // --- touch: on-screen buttons are wired via bindTouchButton; free swipes here ---

  private onTouchStart(e: TouchEvent): void {
    this.onActivity?.();
    if (!this.enabled) return;
    for (const t of Array.from(e.changedTouches)) {
      this.touchStart.set(t.identifier, { x: t.clientX, y: t.clientY, t: performance.now(), handled: false });
    }
    e.preventDefault();
  }

  private onTouchMove(e: TouchEvent): void {
    if (!this.enabled) return;
    for (const t of Array.from(e.changedTouches)) {
      const st = this.touchStart.get(t.identifier);
      if (!st || st.handled) continue;
      const dx = t.clientX - st.x;
      const dy = t.clientY - st.y;
      const min = Math.max(24, Math.min(window.innerWidth, window.innerHeight) * 0.05);
      if (dy > min && Math.abs(dy) > Math.abs(dx)) {
        this.latched.downTap = true;
        this.downPulse = 8;
        st.handled = true;
      } else if (dx > min * 1.5 && Math.abs(dx) > Math.abs(dy)) {
        // Swipe forward fires the ability.
        this.latched.use = true;
        st.handled = true;
      } else if (dy < -min && Math.abs(dy) > Math.abs(dx)) {
        this.latched.jumpTap = true;
        this.jumpSources.add(`touch${t.identifier}`);
        st.handled = true;
      }
    }
    e.preventDefault();
  }

  private onTouchEnd(e: TouchEvent): void {
    for (const t of Array.from(e.changedTouches)) {
      const st = this.touchStart.get(t.identifier);
      this.touchStart.delete(t.identifier);
      this.jumpSources.delete(`touch${t.identifier}`);
      // A quick tap with no swipe is a jump.
      if (this.enabled && st && !st.handled && performance.now() - st.t < 220) {
        this.latched.jumpTap = true;
      }
    }
  }

  /** Wires an on-screen touch button (instant response on touchstart). */
  bindTouchButton(el: HTMLElement, action: 'jump' | 'down' | 'ability' | 'special'): void {
    const id = `btn_${action}_${Math.random().toString(36).slice(2, 6)}`;
    const down = (e: Event) => {
      e.preventDefault();
      e.stopPropagation();
      this.onActivity?.();
      if (!this.enabled) return;
      el.classList.add('pressed');
      if (action === 'jump') {
        this.latched.jumpTap = true;
        this.jumpSources.add(id);
      } else if (action === 'down') {
        this.latched.downTap = true;
        this.downSources.add(id);
      } else if (action === 'special') this.latched.special = true;
      else this.latched.use = true;
    };
    const up = (e: Event) => {
      e.preventDefault();
      e.stopPropagation();
      el.classList.remove('pressed');
      this.jumpSources.delete(id);
      this.downSources.delete(id);
    };
    el.addEventListener('touchstart', down, { passive: false });
    el.addEventListener('touchend', up, { passive: false });
    el.addEventListener('touchcancel', up, { passive: false });
    el.addEventListener('mousedown', down);
    el.addEventListener('mouseup', up);
    el.addEventListener('mouseleave', up);
  }

  private pollGamepad(): void {
    const pads = typeof navigator.getGamepads === 'function' ? navigator.getGamepads() : [];
    const pad = pads && Array.from(pads).find((p) => p && p.connected);
    if (!pad) return;
    const b = (i: number) => !!pad.buttons[i]?.pressed;
    const now = [b(0), b(13) || pad.axes[1] > 0.6, b(2) || b(5) || b(1), b(9), b(3) || b(4)];
    const edge = (i: number) => now[i] && !this.padPrev[i];
    if (now[0]) {
      if (!this.jumpSources.has('pad')) this.latched.jumpTap = true;
      this.jumpSources.add('pad');
    } else this.jumpSources.delete('pad');
    if (now[1]) {
      if (!this.downSources.has('pad')) this.latched.downTap = true;
      this.downSources.add('pad');
    } else this.downSources.delete('pad');
    if (edge(2)) this.latched.use = true;
    if (edge(3)) this.onPause?.();
    if (edge(4)) this.latched.special = true;
    this.padPrev = now;
  }

  /** Consumes latched presses and returns the input for the next tick. */
  sample(): TickInput {
    this.pollGamepad();
    const o = this.out;
    if (!this.enabled) {
      o.jumpHeld = o.down = o.use = o.special = false;
      this.latched.use = this.latched.special = this.latched.jumpTap = this.latched.downTap = false;
      this.downPulse = 0;
      return o;
    }
    // A tap released before the tick still counts as one tick of holding.
    o.jumpHeld = this.jumpSources.size > 0 || this.latched.jumpTap;
    o.down = this.downSources.size > 0 || this.latched.downTap || this.downPulse > 0;
    if (this.downPulse > 0) this.downPulse--;
    o.use = this.latched.use;
    o.special = this.latched.special;
    this.latched.use = this.latched.special = this.latched.jumpTap = this.latched.downTap = false;
    return o;
  }

  /** Clears held state, e.g. when a race starts or resumes. */
  reset(): void {
    this.jumpSources.clear();
    this.downSources.clear();
    this.downPulse = 0;
    this.latched = { use: false, special: false, jumpTap: false, downTap: false };
  }
}
