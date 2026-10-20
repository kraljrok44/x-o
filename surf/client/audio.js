// Procedural audio (WebAudio synthesis, no external assets -> no licensing issues).
// Separate volume buses for effects and UI (spec 10), plus a speed-driven wind loop.

export class Audio {
  constructor() {
    this.ctx = null;
    this.vol = { master: 0.8, sfx: 0.8, ui: 0.7 };
    this.muted = false;
  }

  ensure() {
    if (this.ctx) { if (this.ctx.state === 'suspended' && this.gesture) this.ctx.resume(); return true; }
    // browsers only allow audio after a user gesture; creating it earlier logs an autoplay warning
    if (!this.gesture) { this._waitGesture(); return false; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return false;
    const ctx = (this.ctx = new AC());
    this.master = ctx.createGain();
    this.master.connect(ctx.destination);
    this.sfx = ctx.createGain(); this.sfx.connect(this.master);
    this.ui = ctx.createGain(); this.ui.connect(this.master);
    // noise buffer
    const len = ctx.sampleRate * 2;
    this.noise = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = this.noise.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    // wind loop
    const src = ctx.createBufferSource();
    src.buffer = this.noise; src.loop = true;
    this.windFilter = ctx.createBiquadFilter();
    this.windFilter.type = 'bandpass'; this.windFilter.frequency.value = 400; this.windFilter.Q.value = 0.7;
    this.windGain = ctx.createGain(); this.windGain.gain.value = 0;
    src.connect(this.windFilter).connect(this.windGain).connect(this.sfx);
    src.start();
    // surf hiss loop
    const src2 = ctx.createBufferSource();
    src2.buffer = this.noise; src2.loop = true; src2.playbackRate.value = 0.7;
    this.hissFilter = ctx.createBiquadFilter();
    this.hissFilter.type = 'highpass'; this.hissFilter.frequency.value = 2500;
    this.hissGain = ctx.createGain(); this.hissGain.gain.value = 0;
    src2.connect(this.hissFilter).connect(this.hissGain).connect(this.sfx);
    src2.start();
    this.applyVolumes();
    return true;
  }

  _waitGesture() {
    if (this._waiting) return;
    this._waiting = true;
    const go = () => {
      this.gesture = true;
      for (const ev of ['pointerdown', 'keydown', 'touchstart']) window.removeEventListener(ev, go, true);
      this.ensure();
    };
    for (const ev of ['pointerdown', 'keydown', 'touchstart']) window.addEventListener(ev, go, true);
  }

  setVolumes(v) { Object.assign(this.vol, v); this.applyVolumes(); }

  applyVolumes() {
    if (!this.ctx) return;
    this.master.gain.value = this.muted || this.platformMuted || this.hiddenMuted ? 0 : this.vol.master;
    this.sfx.gain.value = this.vol.sfx;
    this.ui.gain.value = this.vol.ui;
  }

  mute(on) { this.muted = on; this.applyVolumes(); }
  // portal-level mute (CrazyGames settings), independent of the ad mute
  setPlatformMute(on) { this.platformMuted = !!on; this.applyVolumes(); }
  // silent while the tab is in the background
  setHidden(on) { this.hiddenMuted = !!on; this.applyVolumes(); }

  /** Continuous sounds follow the player's speed and surf contact. */
  setMotion(speed, surfing, active) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const k = active ? Math.min(1, speed / 2200) : 0;
    this.windGain.gain.setTargetAtTime(k * k * 0.5, t, 0.15);
    this.windFilter.frequency.setTargetAtTime(250 + k * 1400, t, 0.2);
    this.hissGain.gain.setTargetAtTime(active && surfing ? 0.06 + k * 0.1 : 0, t, 0.08);
  }

  _env(node, t, a, peak, d) {
    node.gain.setValueAtTime(0.0001, t);
    node.gain.exponentialRampToValueAtTime(peak, t + a);
    node.gain.exponentialRampToValueAtTime(0.0001, t + a + d);
  }

  tone(freq, dur, { type = 'sine', vol = 0.3, bus = 'sfx', slide = 0, delay = 0, attack = 0.005 } = {}) {
    if (!this.ensure()) return;
    const t = this.ctx.currentTime + delay;
    const o = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(20, freq * slide), t + dur);
    this._env(g, t, attack, vol, dur);
    o.connect(g).connect(bus === 'ui' ? this.ui : this.sfx);
    o.start(t);
    o.stop(t + attack + dur + 0.05);
  }

  burst(dur, { freq = 800, q = 1, type = 'lowpass', vol = 0.3, bus = 'sfx', delay = 0, sweep = 0 } = {}) {
    if (!this.ensure()) return;
    const t = this.ctx.currentTime + delay;
    const s = this.ctx.createBufferSource();
    s.buffer = this.noise;
    const f = this.ctx.createBiquadFilter();
    f.type = type; f.frequency.setValueAtTime(freq, t); f.Q.value = q;
    if (sweep) f.frequency.exponentialRampToValueAtTime(freq * sweep, t + dur);
    const g = this.ctx.createGain();
    this._env(g, t, 0.004, vol, dur);
    s.connect(f).connect(g).connect(bus === 'ui' ? this.ui : this.sfx);
    s.start(t, Math.random());
    s.stop(t + dur + 0.05);
  }

  play(name, arg) {
    switch (name) {
      case 'jump': this.tone(220, 0.08, { type: 'triangle', vol: 0.12, slide: 1.6 }); break;
      case 'land': this.burst(0.12, { freq: 300 + Math.min(600, (arg || 0) / 3), vol: 0.25 }); break;
      case 'checkpoint': this.tone(880, 0.12, { type: 'sine', vol: 0.22 }); this.tone(1320, 0.2, { type: 'sine', vol: 0.2, delay: 0.09 }); break;
      case 'start': this.tone(660, 0.1, { type: 'square', vol: 0.08 }); break;
      case 'teleport': this.burst(0.35, { freq: 400, type: 'bandpass', q: 2, vol: 0.3, sweep: 8 }); this.tone(300, 0.3, { type: 'sine', vol: 0.12, slide: 3 }); break;
      case 'boost': this.tone(500, 0.25, { type: 'sawtooth', vol: 0.08, slide: 3 }); this.burst(0.2, { freq: 2000, type: 'highpass', vol: 0.12 }); break;
      case 'fail': this.tone(400, 0.35, { type: 'triangle', vol: 0.18, slide: 0.4 }); break;
      case 'finish': [523, 659, 784, 1047].forEach((f, i) => this.tone(f, 0.25, { type: 'triangle', vol: 0.2, delay: i * 0.09 })); break;
      case 'pb': [784, 988, 1175, 1568].forEach((f, i) => this.tone(f, 0.3, { type: 'sine', vol: 0.2, delay: i * 0.08 })); break;
      case 'restart': this.tone(330, 0.08, { type: 'square', vol: 0.06, slide: 0.7 }); break;
      case 'slash': this.burst(0.12, { freq: 1800, type: 'bandpass', q: 1.5, vol: 0.18, sweep: 0.4 }); break;
      case 'click': this.tone(1400, 0.04, { type: 'square', vol: 0.05, bus: 'ui' }); break;
      case 'hover': this.tone(2200, 0.02, { type: 'sine', vol: 0.025, bus: 'ui' }); break;
      case 'vote': this.tone(740, 0.12, { type: 'sine', vol: 0.15, bus: 'ui' }); this.tone(988, 0.16, { type: 'sine', vol: 0.15, bus: 'ui', delay: 0.12 }); break;
      // crate sequence
      case 'lock_engage': this.tone(140, 0.12, { type: 'square', vol: 0.12, bus: 'ui' }); this.burst(0.06, { freq: 3000, type: 'highpass', vol: 0.15, bus: 'ui' }); break;
      case 'lock_tick': this.tone(1800, 0.03, { type: 'square', vol: 0.05, bus: 'ui' }); this.tone(90, 0.05, { type: 'sine', vol: 0.1, bus: 'ui' }); break;
      case 'latch_release': this.burst(0.18, { freq: 1200, type: 'bandpass', q: 3, vol: 0.25, bus: 'ui' }); this.tone(600, 0.08, { type: 'triangle', vol: 0.1, bus: 'ui' }); break;
      case 'lid_open': this.burst(0.9, { freq: 200, type: 'lowpass', vol: 0.3, bus: 'ui', sweep: 4 }); this.tone(70, 0.8, { type: 'sine', vol: 0.18, bus: 'ui', slide: 1.5 }); break;
      case 'reveal_riser': this.burst(1.4, { freq: 300, type: 'bandpass', q: 4, vol: 0.18, bus: 'ui', sweep: 12 }); this.tone(220, 1.4, { type: 'sine', vol: 0.08, bus: 'ui', slide: 4, attack: 0.6 }); break;
      case 'knife_reveal': [392, 587, 784, 1175].forEach((f, i) => this.tone(f, 1.2, { type: 'sine', vol: 0.12, bus: 'ui', delay: i * 0.03 })); this.burst(0.5, { freq: 6000, type: 'highpass', vol: 0.06, bus: 'ui' }); break;
      case 'inventory_confirm': this.tone(988, 0.1, { type: 'sine', vol: 0.12, bus: 'ui' }); this.tone(1480, 0.16, { type: 'sine', vol: 0.12, bus: 'ui', delay: 0.08 }); break;
      case 'collection_complete': [523, 659, 784, 1047, 1319, 1568].forEach((f, i) => this.tone(f, 0.5, { type: 'triangle', vol: 0.14, bus: 'ui', delay: i * 0.1 })); break;
      default: break;
    }
  }
}

export const audio = new Audio();
