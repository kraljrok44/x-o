// Fully procedural audio (WebAudio): wind, fabric, ambience per map, adaptive music and SFX.
import { clamp, lerp } from './util.js';

export class AudioEngine {
  constructor() {
    this.ctx = null; this.ready = false;
    this.vol = { master: 0.8, music: 0.5, sfx: 0.8 };
    this.muteReasons = new Set();
    this.amb = null; this.mapKind = null;
    this.music = { intensity: 0, next: 0, step: 0, chord: 0, on: true };
    this.flight = { speed: 0, tension: 0, active: false, near: 0 };
    const resume = () => this.unlock();
    ['pointerdown', 'keydown', 'touchend', 'click'].forEach((e) => window.addEventListener(e, resume, { passive: true }));
  }

  unlock() {
    try {
      if (!this.ctx) this._init();
      if (this.ctx && this.ctx.state !== 'running') this.ctx.resume();
    } catch (e) { /* audio unavailable */ }
  }

  _init() {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    const ctx = this.ctx = new AC();
    this.master = ctx.createGain(); this.master.connect(ctx.destination);
    this.musicBus = ctx.createGain(); this.musicBus.connect(this.master);
    this.sfxBus = ctx.createGain(); this.sfxBus.connect(this.master);
    this.ambBus = ctx.createGain(); this.ambBus.connect(this.master);
    // noise buffers
    const len = ctx.sampleRate * 2;
    this.white = ctx.createBuffer(1, len, ctx.sampleRate);
    this.brown = ctx.createBuffer(1, len, ctx.sampleRate);
    const w = this.white.getChannelData(0), b = this.brown.getChannelData(0);
    let last = 0;
    for (let i = 0; i < len; i++) { w[i] = Math.random() * 2 - 1; last = (last + 0.02 * w[i]) / 1.02; b[i] = last * 3.5; }
    // wind layers
    this.wind = {
      body: this._noiseChain('white', 'bandpass', 400, 0.7),
      whistle: this._noiseChain('white', 'bandpass', 2200, 9),
      rumble: this._noiseChain('brown', 'lowpass', 160, 0.7),
      flutter: this._noiseChain('white', 'bandpass', 900, 1.5),
    };
    // flutter LFO (amplitude modulation)
    this.flutLfo = ctx.createOscillator(); this.flutLfoGain = ctx.createGain();
    this.flutLfo.frequency.value = 14; this.flutLfoGain.gain.value = 0;
    this.flutLfo.connect(this.flutLfoGain); this.flutLfoGain.connect(this.wind.flutter.gain.gain);
    this.flutLfo.start();
    for (const k in this.wind) this.wind[k].gain.connect(this.sfxBus);
    // music filter
    this.musicFilter = ctx.createBiquadFilter(); this.musicFilter.type = 'lowpass'; this.musicFilter.frequency.value = 900;
    this.musicFilter.connect(this.musicBus);
    this.delay = ctx.createDelay(1.0); this.delay.delayTime.value = 0.42;
    this.fb = ctx.createGain(); this.fb.gain.value = 0.35;
    this.delay.connect(this.fb); this.fb.connect(this.delay); this.delay.connect(this.musicBus);
    this.ready = true;
    this.applyVolumes();
    if (this.mapKind) this.setAmbient(this.mapKind);
  }

  _noiseChain(kind, type, freq, q) {
    const ctx = this.ctx;
    const src = ctx.createBufferSource(); src.buffer = kind === 'brown' ? this.brown : this.white; src.loop = true;
    src.playbackRate.value = 0.9 + Math.random() * 0.2;
    const f = ctx.createBiquadFilter(); f.type = type; f.frequency.value = freq; f.Q.value = q;
    const g = ctx.createGain(); g.gain.value = 0;
    src.connect(f); f.connect(g); src.start(0, Math.random() * 1.5);
    return { src, filter: f, gain: g };
  }

  setVolumes(v) { Object.assign(this.vol, v); this.applyVolumes(); }
  mute(reason, on) { if (on) this.muteReasons.add(reason); else this.muteReasons.delete(reason); this.applyVolumes(); }
  applyVolumes() {
    if (!this.ready) return;
    const t = this.ctx.currentTime;
    const m = this.muteReasons.size ? 0 : this.vol.master;
    this.master.gain.setTargetAtTime(m, t, 0.05);
    this.musicBus.gain.setTargetAtTime(this.vol.music * 0.5, t, 0.1);
    this.sfxBus.gain.setTargetAtTime(this.vol.sfx, t, 0.1);
    this.ambBus.gain.setTargetAtTime(this.vol.sfx * 0.7, t, 0.1);
  }

  // ----------------------------------------------------------- ambience
  setAmbient(kind) {
    this.mapKind = kind;
    if (!this.ready) return;
    if (this.amb) { for (const n of this.amb.nodes) { try { n.gain.gain.setTargetAtTime(0, this.ctx.currentTime, 0.3); setTimeout(() => n.src.stop(), 1500); } catch (e) { /* noop */ } } }
    const nodes = [];
    const add = (k, type, f, q, g) => { const n = this._noiseChain(k, type, f, q); n.gain.connect(this.ambBus); n.gain.gain.setTargetAtTime(g, this.ctx.currentTime, 1); n.base = g; nodes.push(n); return n; };
    if (kind === 'mountain') { add('brown', 'lowpass', 380, 0.5, 0.25); add('white', 'bandpass', 5200, 0.6, 0.012); }
    if (kind === 'desert') { add('brown', 'lowpass', 300, 0.6, 0.2); add('white', 'bandpass', 700, 0.4, 0.02); }
    if (kind === 'coast') {
      const w = add('brown', 'lowpass', 700, 0.5, 0.25);
      const lfo = this.ctx.createOscillator(), lg = this.ctx.createGain(); lfo.frequency.value = 0.11; lg.gain.value = 0.18; lfo.connect(lg); lg.connect(w.gain.gain); lfo.start();
      add('white', 'highpass', 3000, 0.5, 0.01);
    }
    if (kind === 'city') {
      add('brown', 'lowpass', 190, 0.7, 0.35); add('white', 'bandpass', 1100, 0.6, 0.012);
      const hum = this.ctx.createOscillator(); hum.type = 'sawtooth'; hum.frequency.value = 58;
      const hf = this.ctx.createBiquadFilter(); hf.type = 'lowpass'; hf.frequency.value = 140; const hg = this.ctx.createGain(); hg.gain.value = 0.02;
      hum.connect(hf); hf.connect(hg); hg.connect(this.ambBus); hum.start();
      nodes.push({ src: hum, gain: hg, base: 0.02 });
    }
    this.amb = { kind, nodes, nextEvent: this.ctx.currentTime + 3 };
  }

  _ambEvent() {
    const c = this.ctx, t = c.currentTime, k = this.amb.kind;
    const chirp = (f0, f1, dur, vol, type = 'sine', vib = 0) => {
      const o = c.createOscillator(), g = c.createGain(); o.type = type;
      o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(f1, t + dur);
      if (vib) { const l = c.createOscillator(), lg = c.createGain(); l.frequency.value = vib; lg.gain.value = f0 * 0.04; l.connect(lg); lg.connect(o.frequency); l.start(t); l.stop(t + dur); }
      g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(vol, t + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      const p = c.createStereoPanner ? c.createStereoPanner() : null;
      if (p) { p.pan.value = Math.random() * 1.6 - 0.8; o.connect(g); g.connect(p); p.connect(this.ambBus); } else { o.connect(g); g.connect(this.ambBus); }
      o.start(t); o.stop(t + dur + 0.05);
    };
    if (k === 'mountain') { for (let i = 0; i < 3; i++) setTimeout(() => this.ready && chirp(2600 + Math.random() * 900, 3400, 0.09, 0.03), i * 140); }
    if (k === 'desert') chirp(2000, 1300, 1.1, 0.025, 'sine', 18);
    if (k === 'coast') chirp(1500, 1050, 0.45, 0.03, 'triangle', 9);
    if (k === 'city') {
      if (Math.random() < 0.4) { [392, 494].forEach((f) => { const o = c.createOscillator(), g = c.createGain(); o.type = 'square'; o.frequency.value = f; g.gain.setValueAtTime(0.008, t); g.gain.setTargetAtTime(0, t + 0.35, 0.05); o.connect(g); g.connect(this.ambBus); o.start(t); o.stop(t + 0.6); }); }
      else this.noiseHit(0.9, 400, 1400, 0.03, this.ambBus);
    }
  }

  // ----------------------------------------------------------- per frame
  update(dt, st) {
    if (!this.ready) return;
    const t = this.ctx.currentTime;
    const sp = st.flying ? st.speed : 0; // m/s
    const n = clamp(sp / 85, 0, 1.3);
    const W = this.wind;
    W.body.gain.gain.setTargetAtTime(st.flying ? 0.04 + n * n * 0.55 : 0.02, t, 0.08);
    W.body.filter.frequency.setTargetAtTime(250 + n * 1300, t, 0.1);
    W.whistle.gain.gain.setTargetAtTime(st.flying ? Math.max(0, n - 0.35) * 0.12 : 0, t, 0.1);
    W.whistle.filter.frequency.setTargetAtTime(1600 + n * 2400 + (st.turb || 0) * 300, t, 0.1);
    W.rumble.gain.gain.setTargetAtTime(st.flying ? n * 0.5 : 0, t, 0.1);
    const fl = st.flying ? (st.tension || 0) * 0.08 : 0;
    W.flutter.gain.gain.setTargetAtTime(fl * 0.4, t, 0.1);
    this.flutLfoGain.gain.setTargetAtTime(fl * 0.5, t, 0.1);
    this.flutLfo.frequency.setTargetAtTime(9 + n * 26, t, 0.2);
    // ambient louder near the ground
    if (this.amb) {
      const near = clamp(1 - (st.agl || 0) / 400, 0.15, 1);
      for (const nd of this.amb.nodes) nd.gain.gain.setTargetAtTime(nd.base * near * (st.flying && n > 0.5 ? 0.6 : 1), t, 0.5);
      if (t > this.amb.nextEvent) { this.amb.nextEvent = t + 4 + Math.random() * 9; if (near > 0.3) this._ambEvent(); }
    }
    this._music(st.intensity || 0);
  }

  // ----------------------------------------------------------- music
  _music(intensity) {
    const M = this.music, c = this.ctx;
    M.intensity = lerp(M.intensity, intensity, 0.02);
    this.musicFilter.frequency.setTargetAtTime(500 + M.intensity * 2600, c.currentTime, 0.5);
    if (!M.on) return;
    const prog = [[57, 60, 64, 69], [53, 57, 60, 65], [48, 55, 60, 64], [55, 59, 62, 67]]; // Am F C G
    const now = c.currentTime;
    if (now + 0.15 < M.next) return;
    const start = Math.max(now + 0.05, M.next);
    const bar = 4.8;
    const chord = prog[M.chord % prog.length];
    M.chord++;
    M.next = start + bar;
    const mtof = (m) => 440 * Math.pow(2, (m - 69) / 12);
    for (const note of chord) {
      for (const det of [-6, 6]) {
        const o = c.createOscillator(), g = c.createGain(); o.type = 'sawtooth'; o.frequency.value = mtof(note - 12); o.detune.value = det;
        g.gain.setValueAtTime(0, start); g.gain.linearRampToValueAtTime(0.018, start + 1.6); g.gain.linearRampToValueAtTime(0.014, start + bar - 0.6); g.gain.linearRampToValueAtTime(0, start + bar + 0.4);
        o.connect(g); g.connect(this.musicFilter); o.start(start); o.stop(start + bar + 0.5);
      }
    }
    // bass
    const bo = c.createOscillator(), bg = c.createGain(); bo.type = 'triangle'; bo.frequency.value = mtof(chord[0] - 24);
    bg.gain.setValueAtTime(0, start); bg.gain.linearRampToValueAtTime(0.05 + M.intensity * 0.04, start + 0.3); bg.gain.linearRampToValueAtTime(0, start + bar);
    bo.connect(bg); bg.connect(this.musicFilter); bo.start(start); bo.stop(start + bar + 0.1);
    // arpeggio layer for intense moments
    if (M.intensity > 0.35) {
      const steps = 16, dur = bar / steps;
      for (let i = 0; i < steps; i++) {
        const nt = chord[(i * 3) % chord.length] + (i % 8 >= 4 ? 12 : 0);
        const o = c.createOscillator(), g = c.createGain(); o.type = 'square'; o.frequency.value = mtof(nt);
        const st = start + i * dur;
        g.gain.setValueAtTime(0, st); g.gain.linearRampToValueAtTime(0.012 * M.intensity, st + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, st + dur * 0.9);
        o.connect(g); g.connect(this.musicFilter); g.connect(this.delay); o.start(st); o.stop(st + dur);
      }
    }
    // pulse drum
    if (M.intensity > 0.6) {
      for (let i = 0; i < 8; i++) {
        const st = start + i * bar / 8;
        const o = c.createOscillator(), g = c.createGain(); o.frequency.setValueAtTime(110, st); o.frequency.exponentialRampToValueAtTime(40, st + 0.15);
        g.gain.setValueAtTime(0.09 * M.intensity, st); g.gain.exponentialRampToValueAtTime(0.0001, st + 0.2);
        o.connect(g); g.connect(this.musicBus); o.start(st); o.stop(st + 0.25);
      }
    }
  }

  // ----------------------------------------------------------- sfx
  tone(freq, dur, vol = 0.2, type = 'sine', when = 0, slideTo = null) {
    if (!this.ready) return;
    const c = this.ctx, t = c.currentTime + when;
    const o = c.createOscillator(), g = c.createGain(); o.type = type; o.frequency.setValueAtTime(freq, t);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(vol, t + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(this.sfxBus); o.start(t); o.stop(t + dur + 0.05);
  }
  noiseHit(dur, f0, f1, vol, bus) {
    if (!this.ready) return;
    const c = this.ctx, t = c.currentTime;
    const s = c.createBufferSource(); s.buffer = this.white;
    const f = c.createBiquadFilter(); f.type = 'bandpass'; f.Q.value = 1.2; f.frequency.setValueAtTime(f0, t); f.frequency.exponentialRampToValueAtTime(f1, t + dur);
    const g = c.createGain(); g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(f); f.connect(g); g.connect(bus || this.sfxBus); s.start(t, Math.random()); s.stop(t + dur + 0.05);
  }
  play(name) {
    switch (name) {
      case 'click': this.tone(1200, 0.05, 0.06, 'triangle'); break;
      case 'gate': this.tone(880, 0.18, 0.15, 'triangle'); this.tone(1320, 0.3, 0.13, 'triangle', 0.08); break;
      case 'gatePerfect': this.tone(880, 0.15, 0.15, 'triangle'); this.tone(1320, 0.15, 0.13, 'triangle', 0.07); this.tone(1760, 0.4, 0.12, 'triangle', 0.14); break;
      case 'miss': this.tone(220, 0.35, 0.15, 'sawtooth', 0, 140); break;
      case 'warn': this.tone(880, 0.08, 0.07, 'square'); break;
      case 'warnHigh': this.tone(1200, 0.06, 0.09, 'square'); this.tone(1200, 0.06, 0.09, 'square', 0.1); break;
      case 'wings': this.noiseHit(0.5, 300, 2500, 0.25); break;
      case 'jump': this.noiseHit(0.25, 600, 200, 0.15); break;
      case 'deploy': this.noiseHit(0.4, 3000, 500, 0.3); setTimeout(() => { this.noiseHit(0.6, 200, 80, 0.6); this.tone(90, 0.3, 0.3, 'sine', 0, 45); }, 900); break;
      case 'land': this.tone(110, 0.3, 0.35, 'sine', 0, 45); this.noiseHit(0.3, 500, 150, 0.2); break;
      case 'crash': this.noiseHit(1.2, 1200, 60, 0.7); this.tone(70, 0.8, 0.5, 'sine', 0, 30); break;
      case 'splash': this.noiseHit(1.4, 2500, 300, 0.6); break;
      case 'finish': [523, 659, 784, 1046].forEach((f, i) => this.tone(f, 0.5, 0.12, 'triangle', i * 0.12)); break;
      case 'fail': [392, 330, 262].forEach((f, i) => this.tone(f, 0.45, 0.12, 'triangle', i * 0.16)); break;
      case 'coin': this.tone(1320, 0.08, 0.1, 'square'); this.tone(1760, 0.2, 0.1, 'square', 0.07); break;
    }
  }
}
