// Keyboard + mouse input. Mouse look is applied directly (no smoothing, FPS independent, spec 8.1).

import { settings } from './settings.js';

export class Input {
  constructor(canvas) {
    this.canvas = canvas;
    this.keys = new Set();
    this.yaw = 0;
    this.pitch = 0;
    this.mouseDX = 0;
    this.mouseDY = 0;
    this.pressed = new Set(); // edge-triggered keys since last poll
    this.mouseButtons = new Set();
    this.locked = false;
    this.enabled = false;
    this.onLockChange = () => {};

    window.addEventListener('keydown', (e) => {
      if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT')) return;
      if (!this.keys.has(e.code)) this.pressed.add(e.code);
      this.keys.add(e.code);
      if (this.enabled && ['Space', 'Tab', 'F3', 'KeyF'].includes(e.code)) e.preventDefault();
      if (e.code === 'Space' && document.activeElement && document.activeElement.tagName === 'BUTTON') document.activeElement.blur();
    });
    window.addEventListener('keyup', (e) => { this.keys.delete(e.code); });
    window.addEventListener('blur', () => { this.keys.clear(); });
    document.addEventListener('mousemove', (e) => {
      if (!this.locked) return;
      // clamp absurd deltas some browsers send right after locking
      const dx = Math.max(-400, Math.min(400, e.movementX || 0));
      const dy = Math.max(-400, Math.min(400, e.movementY || 0));
      const k = settings.sensitivity * 0.00035;
      this.yaw -= dx * k;
      this.pitch -= dy * k * (settings.invertY ? -1 : 1);
      this.pitch = Math.max(-1.55, Math.min(1.55, this.pitch));
      this.mouseDX += dx;
      this.mouseDY += dy;
    });
    document.addEventListener('mousedown', (e) => {
      if (!this.locked) return;
      this.mouseButtons.add(e.button);
      this.pressed.add('Mouse' + e.button);
    });
    document.addEventListener('mouseup', (e) => this.mouseButtons.delete(e.button));
    document.addEventListener('contextmenu', (e) => { if (this.locked) e.preventDefault(); });
    document.addEventListener('pointerlockchange', () => {
      this.locked = document.pointerLockElement === this.canvas;
      if (!this.locked) { this.keys.clear(); this.mouseButtons.clear(); }
      this.onLockChange(this.locked);
    });
  }

  lock() {
    try {
      const p = this.canvas.requestPointerLock({ unadjustedMovement: true });
      if (p && p.catch) p.catch(() => { try { this.canvas.requestPointerLock(); } catch (e) { /* */ } });
    } catch (e) {
      try { this.canvas.requestPointerLock(); } catch (e2) { /* */ }
    }
  }

  unlock() {
    if (document.pointerLockElement) document.exitPointerLock();
  }

  down(code) { return this.keys.has(code); }

  takePressed(code) {
    if (this.pressed.has(code)) { this.pressed.delete(code); return true; }
    return false;
  }

  clearPressed() { this.pressed.clear(); }

  /** Movement intent for this tick. */
  moveAxes() {
    if (!this.locked) return { fwd: 0, side: 0, jump: false };
    const fwd = (this.down('KeyW') || this.down('ArrowUp') ? 1 : 0) - (this.down('KeyS') || this.down('ArrowDown') ? 1 : 0);
    const side = (this.down('KeyD') || this.down('ArrowRight') ? 1 : 0) - (this.down('KeyA') || this.down('ArrowLeft') ? 1 : 0);
    return { fwd, side, jump: this.down('Space') };
  }

  takeMouseDelta() {
    const d = { x: this.mouseDX, y: this.mouseDY };
    this.mouseDX = 0;
    this.mouseDY = 0;
    return d;
  }
}
