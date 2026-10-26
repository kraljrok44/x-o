import { DEFAULT_AUDIO, sanitizeAudio, type AudioSettings } from '../audio/AudioSettings';
import { DEFAULT_BINDINGS, sanitizeBindings, type KeyBindings } from '../input/InputManager';
import type { DifficultyChoice } from '../game/RaceVerifier';
import type { KeyValueStore } from './KeyValueStore';

/** Non-sensitive, device-local preferences (design doc section 18). */
export interface Settings {
  graphics: 'low' | 'medium' | 'high';
  audio: AudioSettings;
  bindings: KeyBindings;
  touchControls: 'auto' | 'on' | 'off';
  cameraShake: boolean;
  reducedMotion: boolean;
  showFps: boolean;
  difficulty: DifficultyChoice;
  lastTrack: string;
  analyticsConsent: 'unknown' | 'granted' | 'denied';
}

export function defaultSettings(graphics: Settings['graphics']): Settings {
  return {
    graphics,
    audio: { ...DEFAULT_AUDIO },
    bindings: { ...DEFAULT_BINDINGS },
    touchControls: 'auto',
    cameraShake: true,
    reducedMotion: false,
    showFps: false,
    difficulty: 'auto',
    lastTrack: 'mossy_hollow',
    analyticsConsent: 'unknown',
  };
}

const KEY = 'settings';

export class LocalSettings {
  value: Settings;
  private listeners: ((s: Settings) => void)[] = [];

  constructor(
    private readonly store: KeyValueStore,
    defaults: Settings,
  ) {
    this.value = defaults;
  }

  async load(): Promise<Settings> {
    try {
      const raw = await this.store.get(KEY);
      if (raw) {
        const s = JSON.parse(raw) as Partial<Settings>;
        const d = this.value;
        this.value = {
          ...d,
          ...pick(s, d),
          audio: sanitizeAudio(s.audio),
          bindings: sanitizeBindings(s.bindings),
        };
      }
    } catch {
      /* keep defaults */
    }
    return this.value;
  }

  update(patch: Partial<Settings>): void {
    this.value = { ...this.value, ...patch };
    void this.store.set(KEY, JSON.stringify(this.value));
    for (const l of this.listeners) l(this.value);
  }

  onChange(cb: (s: Settings) => void): void {
    this.listeners.push(cb);
  }
}

/** Copies only known keys whose type matches the default. */
function pick(s: Partial<Settings>, d: Settings): Partial<Settings> {
  const out: Record<string, unknown> = {};
  for (const k of Object.keys(d) as (keyof Settings)[]) {
    if (k === 'audio' || k === 'bindings') continue;
    if (s[k] !== undefined && typeof s[k] === typeof d[k]) out[k] = s[k];
  }
  return out as Partial<Settings>;
}
