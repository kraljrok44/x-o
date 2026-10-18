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
    // phones: strafe buttons A / D bottom left; joystick bottom right: up/down = forward/back,
    // left/right = turn the view; dragging anywhere else also looks around. Jumping is automatic
    // (autoHop, decided by the game: only while the run is on)
    this.touch = { stick: null, sx: 0, sy: 0, fwd: 0, turn: 0, A: new Set(), D: new Set(), look: null, x: 0, y: 0, used: false };
    this.autoHop = () => false;
    this.onGround = () => true;
    this._touchEvents();

    window.addEventListener('keydown', (e) => {
      if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT')) return;
      if (!this.keys.has(e.code)) this.pressed.add(e.code);
      this.keys.add(e.code);
      if ((this.enabled || this.active) && ['Space', 'Tab', 'F3', 'KeyF', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) e.preventDefault();
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

  _touchEvents() {
    const blocked = (el) => el && el.closest && el.closest('button, input, select, .panel, .panels, .pause-box, .viewer, .free-crate, #chat-row, .touch-ui-btn, .touch-stick');
    const start = (e) => {
      if (!this.active || blocked(e.target)) return;
      this.touch.used = true;
      for (const t of e.changedTouches) {
        if (this.touch.look === null) { this.touch.look = t.identifier; this.touch.x = t.clientX; this.touch.y = t.clientY; }
      }
      e.preventDefault();
    };
    const move = (e) => {
      for (const t of e.changedTouches) {
        if (t.identifier === this.touch.stick) { this._setStick(t.clientX, t.clientY); e.preventDefault(); continue; }
        if (t.identifier !== this.touch.look) continue;
        const dx = t.clientX - this.touch.x, dy = t.clientY - this.touch.y;
        this.touch.x = t.clientX; this.touch.y = t.clientY;
        const k = settings.sensitivity * 0.0016;
        this.yaw -= dx * k;
        this.pitch = Math.max(-1.55, Math.min(1.55, this.pitch - dy * k * (settings.invertY ? -1 : 1)));
        this.mouseDX += dx * 2; this.mouseDY += dy * 2;
      }
      if (this.touch.look !== null) e.preventDefault();
    };
    const end = (e) => {
      for (const t of e.changedTouches) {
        if (t.identifier === this.touch.stick) this._releaseStick();
        this.touch.A.delete(t.identifier);
        this.touch.D.delete(t.identifier);
        if (t.identifier === this.touch.look) this.touch.look = null;
      }
    };
    // joystick: 8 directions (commands carry -1/0/1), knob follows the finger inside the ring
    const stick = document.getElementById('touch-stick');
    const knob = stick && stick.querySelector('.stick-knob');
    const R = 48;
    const setStick = (cx, cy) => {
      const T = this.touch;
      let dx = cx - T.sx, dy = cy - T.sy;
      const l = Math.hypot(dx, dy);
      if (l > R) { dx *= R / l; dy *= R / l; }
      if (knob) knob.style.transform = `translate(${dx}px, ${dy}px)`;
      const nx = dx / R, ny = dy / R;
      T.turn = Math.abs(nx) < 0.15 ? 0 : (nx - Math.sign(nx) * 0.15) / 0.85; // analog turn rate
      T.fwd = ny < -0.35 ? 1 : ny > 0.35 ? -1 : 0;
    };
    const releaseStick = () => {
      const T = this.touch;
      T.stick = null; T.fwd = 0; T.turn = 0;
      if (knob) knob.style.transform = '';
      if (stick) stick.classList.remove('on');
    };
    if (stick) {
      stick.addEventListener('touchstart', (e) => {
        e.preventDefault();
        const T = this.touch, t = e.changedTouches[0];
        if (T.stick !== null || !t) return;
        T.used = true;
        const r = stick.getBoundingClientRect();
        T.stick = t.identifier; T.sx = r.left + r.width / 2; T.sy = r.top + r.height / 2;
        stick.classList.add('on');
        setStick(t.clientX, t.clientY);
      }, { passive: false });
    }
    // strafe buttons: each finger counts until it is lifted (wherever it ends)
    const hold = (id, set) => {
      const el = document.getElementById(id);
      if (!el) return;
      const sync = () => el.classList.toggle('on', set.size > 0);
      el.addEventListener('touchstart', (e) => { e.preventDefault(); this.touch.used = true; for (const t of e.changedTouches) set.add(t.identifier); sync(); }, { passive: false });
      const up = (e) => { for (const t of e.changedTouches) set.delete(t.identifier); sync(); };
      el.addEventListener('touchend', up);
      el.addEventListener('touchcancel', up);
      el.addEventListener('contextmenu', (e) => e.preventDefault());
    };
    hold('touch-a', this.touch.A);
    hold('touch-d', this.touch.D);
    this._setStick = setStick;
    this._releaseStick = releaseStick;
    document.addEventListener('touchstart', start, { passive: false });
    document.addEventListener('touchmove', move, { passive: false });
    document.addEventListener('touchend', end);
    document.addEventListener('touchcancel', end);
  }

  /** Keyboard play works right away; the mouse needs one click (browsers only lock it on a click). */
  get active() { return this.locked || !!(this.canPlay && this.canPlay()); }

  /** Q / E turn while the mouse is not captured yet. */
  keyTurn(dt) {
    if (this.locked || !this.active) return;
    this.yaw += ((this.down('KeyQ') ? 1 : 0) - (this.down('KeyE') ? 1 : 0)) * 2.4 * dt;
    // joystick left/right turns the view (scaled with the sensitivity setting)
    if (this.touch.turn) this.yaw -= this.touch.turn * 2.2 * Math.sqrt(settings.sensitivity) * dt;
  }

  /** Movement intent for this tick. */
  moveAxes() {
    if (!this.active) return { fwd: 0, side: 0, jump: false };
    const T = this.touch;
    const fwd = Math.max(-1, Math.min(1, (this.down('KeyW') || this.down('ArrowUp') ? 1 : 0) - (this.down('KeyS') || this.down('ArrowDown') ? 1 : 0) + T.fwd));
    const side = Math.max(-1, Math.min(1, (this.down('KeyD') || this.down('ArrowRight') ? 1 : 0) - (this.down('KeyA') || this.down('ArrowLeft') ? 1 : 0) + (T.D.size ? 1 : 0) - (T.A.size ? 1 : 0)));
    return { fwd, side, jump: this.down('Space') || (T.used && this.autoHop()) };
  }

  takeMouseDelta() {
    const d = { x: this.mouseDX, y: this.mouseDY };
    this.mouseDX = 0;
    this.mouseDY = 0;
    return d;
  }
}
