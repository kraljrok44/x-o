import { DEFAULT_AUDIO, type AudioSettings } from './AudioSettings';
import { Rng } from '../shared/Rng';

export type SfxId =
  | 'jump'
  | 'land'
  | 'glimmer'
  | 'item'
  | 'dash'
  | 'shield'
  | 'seeker'
  | 'snare'
  | 'sap'
  | 'hit'
  | 'bonk'
  | 'block'
  | 'fall'
  | 'respawn'
  | 'beep'
  | 'go'
  | 'finish'
  | 'click'
  | 'buy'
  | 'coin'
  | 'error'
  | 'bounce'
  | 'boost'
  | 'whoosh'
  | 'unlock';

export interface MusicTheme {
  root: number;
  scale: number[];
  tempo: number;
  mood: 'bright' | 'warm' | 'dreamy';
}

const midi = (n: number) => 440 * Math.pow(2, (n - 69) / 12);

/**
 * All sound is synthesised at runtime with the Web Audio API (no audio
 * files), which keeps the download tiny and every sound original.
 * The context starts suspended until the first user gesture.
 */
export class AudioManager {
  private ctx: AudioContext | null = null;
  private master!: GainNode;
  private musicBus!: GainNode;
  private sfxBus!: GainNode;
  private noiseBuf: AudioBuffer | null = null;
  private settings: AudioSettings = { ...DEFAULT_AUDIO };
  private suspendedReasons = new Set<string>();
  private musicTimer: number | null = null;
  private musicTheme: MusicTheme | null = null;
  private musicIntensity = 1;
  private nextNoteTime = 0;
  private step = 0;
  private melody: number[] = [];
  private glimmerCombo = 0;
  private lastGlimmer = 0;

  /** Must be called from a user gesture handler at least once. */
  unlock(): void {
    if (!this.ctx) {
      const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!Ctor) return;
      this.ctx = new Ctor();
      this.master = this.ctx.createGain();
      const comp = this.ctx.createDynamicsCompressor();
      comp.threshold.value = -14;
      comp.ratio.value = 3;
      this.master.connect(comp).connect(this.ctx.destination);
      this.musicBus = this.ctx.createGain();
      this.sfxBus = this.ctx.createGain();
      this.musicBus.connect(this.master);
      this.sfxBus.connect(this.master);
      this.applySettings(this.settings);
      const len = this.ctx.sampleRate;
      this.noiseBuf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
      const d = this.noiseBuf.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    }
    if (this.ctx.state === 'suspended' && this.suspendedReasons.size === 0) void this.ctx.resume();
  }

  get unlocked(): boolean {
    return !!this.ctx;
  }

  applySettings(s: AudioSettings): void {
    this.settings = { ...s };
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.master.gain.setTargetAtTime(s.muted ? 0 : s.master, t, 0.03);
    this.musicBus.gain.setTargetAtTime(s.music * 0.5, t, 0.05);
    this.sfxBus.gain.setTargetAtTime(s.sfx, t, 0.03);
  }

  /** Suspends all audio for a reason (ad, pause, hidden tab); resumes when no reason remains. */
  suspend(reason: string): void {
    this.suspendedReasons.add(reason);
    if (this.ctx && this.ctx.state === 'running') void this.ctx.suspend();
  }

  resume(reason: string): void {
    this.suspendedReasons.delete(reason);
    if (this.ctx && this.suspendedReasons.size === 0 && this.ctx.state === 'suspended') void this.ctx.resume();
  }

  // --- SFX --------------------------------------------------------------------

  private tone(type: OscillatorType, f0: number, f1: number, dur: number, vol: number, when = 0, pan = 0): void {
    const ctx = this.ctx;
    if (!ctx) return;
    const t = ctx.currentTime + when;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(f0, t);
    o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    let node: AudioNode = o.connect(g);
    if (pan !== 0 && ctx.createStereoPanner) {
      const p = ctx.createStereoPanner();
      p.pan.value = pan;
      node = node.connect(p);
    }
    node.connect(this.sfxBus);
    o.start(t);
    o.stop(t + dur + 0.02);
  }

  private noise(dur: number, vol: number, filterFrom: number, filterTo: number, type: BiquadFilterType = 'lowpass', when = 0, bus?: GainNode): void {
    const ctx = this.ctx;
    if (!ctx || !this.noiseBuf) return;
    const t = ctx.currentTime + when;
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuf;
    src.playbackRate.value = 0.8 + Math.random() * 0.4;
    const f = ctx.createBiquadFilter();
    f.type = type;
    f.frequency.setValueAtTime(filterFrom, t);
    f.frequency.exponentialRampToValueAtTime(Math.max(30, filterTo), t + dur);
    f.Q.value = 1.2;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + 0.006);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f).connect(g).connect(bus ?? this.sfxBus);
    src.start(t, Math.random() * 0.5);
    src.stop(t + dur + 0.02);
  }

  /** Plays a sound effect. `local` = 1 for the player's own actions, lower for opponents. */
  play(id: SfxId, local = 1, pan = 0): void {
    if (!this.ctx || this.ctx.state !== 'running') return;
    const v = local;
    switch (id) {
      case 'jump':
        this.tone('triangle', 330, 720, 0.16, 0.22 * v, 0, pan);
        this.tone('sine', 660, 1100, 0.08, 0.06 * v, 0.02, pan);
        break;
      case 'land':
        this.noise(0.09, 0.18 * v, 900, 120);
        this.tone('sine', 140, 60, 0.1, 0.18 * v);
        break;
      case 'glimmer': {
        const now = this.ctx.currentTime;
        this.glimmerCombo = now - this.lastGlimmer < 0.5 ? Math.min(this.glimmerCombo + 1, 10) : 0;
        this.lastGlimmer = now;
        const scale = [0, 2, 4, 7, 9, 12, 14, 16, 19, 21, 24];
        const f = midi(84 + scale[this.glimmerCombo]);
        this.tone('sine', f, f, 0.18, 0.12 * v, 0, pan);
        this.tone('triangle', f * 2, f * 2, 0.08, 0.04 * v, 0.01, pan);
        break;
      }
      case 'item':
        [72, 76, 79, 84].forEach((n, i) => this.tone('square', midi(n), midi(n), 0.12, 0.06 * v, i * 0.045, pan));
        break;
      case 'dash':
        this.noise(0.45, 0.25 * v, 300, 4000, 'bandpass');
        this.tone('sawtooth', 200, 600, 0.3, 0.05 * v);
        break;
      case 'shield':
        [67, 71, 74, 79].forEach((n, i) => this.tone('sine', midi(n), midi(n + 12), 0.5, 0.07 * v, i * 0.03));
        break;
      case 'seeker':
        this.tone('sawtooth', 900, 180, 0.35, 0.09 * v, 0, pan);
        this.noise(0.2, 0.1 * v, 2000, 400, 'bandpass');
        break;
      case 'snare':
        this.noise(0.18, 0.2 * v, 3000, 600, 'highpass');
        this.tone('square', 260, 140, 0.14, 0.07 * v);
        break;
      case 'sap':
        this.tone('sine', 220, 70, 0.4, 0.2 * v);
        this.tone('sine', 330, 110, 0.3, 0.08 * v, 0.06);
        break;
      case 'hit':
        this.noise(0.22, 0.32 * v, 2200, 200);
        this.tone('square', 240, 70, 0.24, 0.1 * v, 0, pan);
        break;
      case 'bonk':
        this.tone('triangle', 180, 90, 0.18, 0.3 * v, 0, pan);
        this.noise(0.08, 0.25 * v, 1500, 300);
        break;
      case 'block':
        this.tone('sine', 1200, 1600, 0.25, 0.12 * v);
        this.tone('triangle', 800, 1200, 0.2, 0.08 * v, 0.03);
        break;
      case 'fall':
        this.tone('sine', 900, 120, 0.7, 0.16 * v);
        break;
      case 'respawn':
        [60, 64, 67, 72, 76].forEach((n, i) => this.tone('triangle', midi(n), midi(n), 0.12, 0.07 * v, i * 0.05));
        break;
      case 'beep':
        this.tone('square', 660, 660, 0.14, 0.12);
        break;
      case 'go':
        this.tone('square', 990, 990, 0.35, 0.12);
        this.tone('triangle', 1320, 1320, 0.35, 0.06);
        break;
      case 'finish':
        [72, 76, 79, 84, 88].forEach((n, i) => this.tone('square', midi(n), midi(n), 0.22, 0.08, i * 0.09));
        this.tone('triangle', midi(96), midi(96), 0.6, 0.06, 0.45);
        break;
      case 'click':
        this.tone('triangle', 900, 700, 0.05, 0.08);
        break;
      case 'buy':
        [79, 84, 88].forEach((n, i) => this.tone('square', midi(n), midi(n), 0.1, 0.06, i * 0.06));
        break;
      case 'coin':
        this.tone('square', midi(88), midi(88), 0.06, 0.05);
        this.tone('square', midi(93), midi(93), 0.12, 0.05, 0.05);
        break;
      case 'error':
        this.tone('square', 220, 180, 0.18, 0.08);
        this.tone('square', 180, 150, 0.2, 0.08, 0.12);
        break;
      case 'bounce':
        this.tone('sine', 200, 900, 0.3, 0.2 * v);
        break;
      case 'boost':
        this.noise(0.3, 0.15 * v, 500, 3000, 'bandpass');
        break;
      case 'whoosh':
        this.noise(0.35, 0.12, 400, 2500, 'bandpass');
        break;
      case 'unlock':
        [67, 72, 76, 79, 84, 91].forEach((n, i) => this.tone('triangle', midi(n), midi(n), 0.3, 0.07, i * 0.07));
        break;
    }
  }

  // --- Music ------------------------------------------------------------------

  /** Starts a procedural loop for the given theme. `seed` varies the melody per track. */
  playMusic(theme: MusicTheme, seed: number, intensity = 1): void {
    this.musicTheme = theme;
    this.musicIntensity = intensity;
    const rng = new Rng(seed);
    // A 16-step melody made of scale degrees with rests (-1).
    this.melody = Array.from({ length: 32 }, (_, i) => (i % 4 === 3 && rng.chance(0.5) ? -1 : rng.int(0, theme.scale.length * 2 - 1)));
    if (!this.ctx) return;
    this.step = 0;
    this.nextNoteTime = this.ctx.currentTime + 0.1;
    if (this.musicTimer === null) this.musicTimer = window.setInterval(() => this.schedule(), 25);
  }

  setMusicIntensity(v: number): void {
    this.musicIntensity = v;
  }

  stopMusic(): void {
    if (this.musicTimer !== null) window.clearInterval(this.musicTimer);
    this.musicTimer = null;
    this.musicTheme = null;
  }

  private schedule(): void {
    const ctx = this.ctx;
    const th = this.musicTheme;
    if (!ctx || !th || ctx.state !== 'running') {
      if (ctx) this.nextNoteTime = ctx.currentTime + 0.05;
      return;
    }
    const stepDur = 60 / th.tempo / 4;
    while (this.nextNoteTime < ctx.currentTime + 0.12) {
      this.musicStep(this.step, this.nextNoteTime, th);
      this.nextNoteTime += stepDur;
      this.step = (this.step + 1) % 64;
    }
  }

  private note(type: OscillatorType, freq: number, t: number, dur: number, vol: number, cutoff = 4000): void {
    const ctx = this.ctx!;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    const f = ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = cutoff;
    o.type = type;
    o.frequency.value = freq;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(f).connect(g).connect(this.musicBus);
    o.start(t);
    o.stop(t + dur + 0.05);
  }

  private musicStep(step: number, t: number, th: MusicTheme): void {
    const deg = (d: number) => th.root + th.scale[d % th.scale.length] + 12 * Math.floor(d / th.scale.length);
    const bar = Math.floor(step / 16) % 4;
    const progression = [0, 3, 4, 2];
    const chordRoot = progression[bar];
    const intense = this.musicIntensity;
    const s = step % 16;
    // Kick + hat.
    if (s % 4 === 0) {
      const o = this.ctx!.createOscillator();
      const g = this.ctx!.createGain();
      o.frequency.setValueAtTime(150, t);
      o.frequency.exponentialRampToValueAtTime(45, t + 0.12);
      g.gain.setValueAtTime(0.5 * intense, t);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.15);
      o.connect(g).connect(this.musicBus);
      o.start(t);
      o.stop(t + 0.16);
    }
    if (intense > 0.5 && s % 2 === 1) this.noiseMusic(t, 0.04, s % 4 === 3 ? 0.07 : 0.035);
    if (intense > 0.5 && (s === 4 || s === 12)) this.noiseMusic(t, 0.12, 0.09, 1800);
    // Bass.
    if (s % 4 === 0 || s === 10) this.note('triangle', midi(deg(chordRoot) - 24), t, 0.22, 0.32);
    // Pad chord on bar start.
    if (s === 0) {
      for (const k of [0, 2, 4]) this.note(th.mood === 'dreamy' ? 'sine' : 'triangle', midi(deg(chordRoot + k) - 12), t, 1.6, 0.05, 1600);
    }
    // Lead melody (every other step).
    if (s % 2 === 0) {
      const m = this.melody[(step / 2) % this.melody.length];
      if (m >= 0) this.note(th.mood === 'bright' ? 'square' : th.mood === 'warm' ? 'sawtooth' : 'sine', midi(deg(m + chordRoot) + 12), t, 0.16, 0.045 * (0.6 + intense * 0.4), th.mood === 'dreamy' ? 2600 : 2200);
    }
    // Sparkle arpeggio.
    if (th.mood === 'dreamy' && s % 3 === 0) this.note('sine', midi(deg(chordRoot + (s % 5)) + 24), t, 0.3, 0.025);
  }

  private noiseMusic(t: number, dur: number, vol: number, hp = 7000): void {
    const ctx = this.ctx!;
    if (!this.noiseBuf) return;
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuf;
    const f = ctx.createBiquadFilter();
    f.type = 'highpass';
    f.frequency.value = hp;
    const g = ctx.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f).connect(g).connect(this.musicBus);
    src.start(t, Math.random() * 0.5);
    src.stop(t + dur + 0.02);
  }
}
