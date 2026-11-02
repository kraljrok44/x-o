// Unified input: keyboard (physical key codes, AZERTY-safe), mouse look, gamepad and touch.
import { clamp, damp } from './util.js';

export const ACTIONS = [
  ['pitchDown', 'Pitch down / dive'], ['pitchUp', 'Pitch up'], ['left', 'Turn left'], ['right', 'Turn right'],
  ['rollL', 'Roll left'], ['rollR', 'Roll right'], ['stab', 'Stabilize / Jump'], ['tuck', 'Tuck posture (speed)'],
  ['spread', 'Spread posture (glide)'], ['chute', 'Deploy parachute'], ['camera', 'Change camera'], ['restart', 'Restart flight'], ['pause', 'Pause'],
];
export const DEFAULT_KEYS = {
  pitchDown: 'KeyW', pitchUp: 'KeyS', left: 'KeyA', right: 'KeyD', rollL: 'KeyQ', rollR: 'KeyE', stab: 'Space', tuck: 'ShiftLeft',
  spread: 'KeyX', chute: 'KeyF', camera: 'KeyC', restart: 'KeyR', pause: 'KeyP',
};
const ALT_KEYS = { pitchDown: ['ArrowUp'], pitchUp: ['ArrowDown'], left: ['ArrowLeft'], right: ['ArrowRight'], tuck: ['ShiftRight'], stab: ['Enter'] };
export const DEFAULT_PAD = { stab: 0, chute: 1, restart: 2, camera: 3, rollL: 4, rollR: 5, tuck: 6, spread: 7, pause: 9 };
export const PAD_NAMES = ['A / Cross', 'B / Circle', 'X / Square', 'Y / Triangle', 'LB / L1', 'RB / R1', 'LT / L2', 'RT / R2', 'Back', 'Start', 'L3', 'R3', 'D-Up', 'D-Down', 'D-Left', 'D-Right'];
// keys we never bind (browser/fullscreen conflicts)
export const RESERVED = new Set(['Escape', 'ControlLeft', 'ControlRight', 'MetaLeft', 'MetaRight', 'Tab', 'F5', 'F11', 'F12', 'AltLeft', 'AltRight']);

export class Input {
  constructor(canvas) {
    this.keys = new Set();
    this.bind = { ...DEFAULT_KEYS };
    this.pad = { ...DEFAULT_PAD };
    this.queue = [];
    this.lookDX = 0; this.lookDY = 0;
    this.ax = { pitch: 0, turn: 0, roll: 0 };
    this.invert = false; this.smoothing = 1;
    this.touch = { x: 0, y: 0, active: false, btn: {} };
    this.padPrev = [];
    this.padActive = false;
    this.layout = null;
    this.onAnyKey = null; // rebinding hook
    this.lastDevice = 'kb';
    window.addEventListener('keydown', (e) => {
      if (this.onAnyKey) { e.preventDefault(); this.onAnyKey(e.code); return; }
      if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) e.preventDefault();
      this.lastDevice = 'kb';
      if (!e.repeat) { for (const a of this._actionsFor(e.code)) this.queue.push(a); }
      this.keys.add(e.code);
    });
    window.addEventListener('keyup', (e) => this.keys.delete(e.code));
    window.addEventListener('blur', () => this.keys.clear());
    // mouse drag look
    let dragging = false, lx = 0, ly = 0, pid = null;
    canvas.addEventListener('pointerdown', (e) => {
      if (e.pointerType === 'touch') return; // touch handled by UI
      dragging = true; lx = e.clientX; ly = e.clientY; pid = e.pointerId; this.lastDevice = 'kb';
      try { canvas.setPointerCapture(pid); } catch (_) { /* noop */ }
    });
    canvas.addEventListener('pointermove', (e) => {
      if (!dragging || e.pointerId !== pid) return;
      this.lookDX += (e.clientX - lx) * 0.006; this.lookDY += (e.clientY - ly) * 0.006; lx = e.clientX; ly = e.clientY;
    });
    const up = () => { dragging = false; };
    canvas.addEventListener('pointerup', up); canvas.addEventListener('pointercancel', up);
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());
    if (navigator.keyboard && navigator.keyboard.getLayoutMap) navigator.keyboard.getLayoutMap().then((m) => { this.layout = m; }).catch(() => {});
  }

  _actionsFor(code) {
    const out = [];
    for (const a in this.bind) if (this.bind[a] === code || (ALT_KEYS[a] && ALT_KEYS[a].includes(code))) out.push(a);
    return out;
  }
  down(a) {
    if (this.keys.has(this.bind[a])) return true;
    if (ALT_KEYS[a]) for (const k of ALT_KEYS[a]) if (this.keys.has(k)) return true;
    if (this.touch.btn[a]) return true;
    if (this._padBtn(this.pad[a])) return true;
    return false;
  }
  keyLabel(a) {
    const code = this.bind[a];
    if (!code) return '—';
    if (this.layout && this.layout.get(code)) return this.layout.get(code).toUpperCase();
    return codeLabel(code);
  }

  _pads() { return navigator.getGamepads ? Array.from(navigator.getGamepads()).filter(Boolean) : []; }
  _padBtn(i) {
    if (i == null) return false;
    for (const p of this._pads()) { const b = p.buttons[i]; if (b && (b.pressed || b.value > 0.5)) return true; }
    return false;
  }

  // Poll once per frame: gamepad edges, analog axes with smoothing.
  poll(dt) {
    const pads = this._pads();
    let lx = 0, ly = 0, rx = 0, ry = 0;
    for (const p of pads) {
      const dz = (v) => (Math.abs(v) < 0.15 ? 0 : (v - Math.sign(v) * 0.15) / 0.85);
      lx += dz(p.axes[0] || 0); ly += dz(p.axes[1] || 0); rx += dz(p.axes[2] || 0); ry += dz(p.axes[3] || 0);
      p.buttons.forEach((b, i) => {
        const pressed = b.pressed || b.value > 0.5;
        const key = p.index + ':' + i;
        if (pressed && !this.padPrev[key]) {
          this.padActive = true; this.lastDevice = 'pad';
          for (const a in this.pad) if (this.pad[a] === i) this.queue.push(a);
          this.queue.push('pad:' + i);
        }
        this.padPrev[key] = pressed;
      });
      if (Math.abs(lx) + Math.abs(ly) > 0.3) this.lastDevice = 'pad';
    }
    if (Math.abs(rx) + Math.abs(ry) > 0) { this.lookDX += rx * dt * 2.5; this.lookDY += ry * dt * 2.0; }
    // keyboard digital -> smoothed analog
    const kb = (pos, neg) => (this.down(pos) ? 1 : 0) - (this.down(neg) ? 1 : 0);
    let tp = kb('pitchDown', 'pitchUp'), tt = kb('right', 'left'), tr = kb('rollR', 'rollL');
    if (this.touch.active) { tp += -this.touch.y; tt += this.touch.x; }
    tp += -ly; tt += lx;
    if (this.invert) tp = -tp;
    const rate = 7 / Math.max(0.3, this.smoothing);
    this.ax.pitch = damp(this.ax.pitch, clamp(tp, -1, 1), rate, dt);
    this.ax.turn = damp(this.ax.turn, clamp(tt, -1, 1), rate, dt);
    this.ax.roll = damp(this.ax.roll, clamp(tr, -1, 1), rate * 1.3, dt);
  }
  state() {
    return { pitch: this.ax.pitch, turn: this.ax.turn, roll: this.ax.roll, stab: this.down('stab'), tuck: this.down('tuck'), spread: this.down('spread') };
  }
  takeLook() { const r = [this.lookDX, this.lookDY]; this.lookDX = this.lookDY = 0; return r; }
  consume() { const q = this.queue; this.queue = []; return q; }
}

export function codeLabel(code) {
  if (!code) return '—';
  if (code.startsWith('Key')) return code.slice(3);
  if (code.startsWith('Digit')) return code.slice(5);
  const map = { Space: 'SPACE', ShiftLeft: 'L-SHIFT', ShiftRight: 'R-SHIFT', Enter: 'ENTER', ArrowUp: '↑', ArrowDown: '↓', ArrowLeft: '←', ArrowRight: '→', Backspace: 'BKSP' };
  return map[code] || code.replace('Numpad', 'NUM ');
}
