export interface AudioSettings {
  master: number;
  music: number;
  sfx: number;
  muted: boolean;
}

export const DEFAULT_AUDIO: AudioSettings = { master: 0.8, music: 0.55, sfx: 0.85, muted: false };

export function sanitizeAudio(a: Partial<AudioSettings> | undefined): AudioSettings {
  const clamp = (v: unknown, d: number) => (typeof v === 'number' && v >= 0 && v <= 1 ? v : d);
  return {
    master: clamp(a?.master, DEFAULT_AUDIO.master),
    music: clamp(a?.music, DEFAULT_AUDIO.music),
    sfx: clamp(a?.sfx, DEFAULT_AUDIO.sfx),
    muted: typeof a?.muted === 'boolean' ? a.muted : DEFAULT_AUDIO.muted,
  };
}
