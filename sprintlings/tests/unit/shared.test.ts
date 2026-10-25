import { describe, expect, it } from 'vitest';
import { Rng, hashString } from '../../src/shared/Rng';
import { dayKey, formatRaceTime, msUntilNextUtcDay } from '../../src/shared/time';
import { encodeInput } from '../../src/game/RaceReplay';
import { levelForXp, totalXpForLevel } from '../../src/progression/LevelProgression';
import { sanitizeBindings, DEFAULT_BINDINGS } from '../../src/input/InputManager';
import { sanitizeAudio } from '../../src/audio/AudioSettings';
import { layersCollide, Layer } from '../../src/physics/CollisionLayers';

describe('shared utilities', () => {
  it('Rng is deterministic per seed', () => {
    const a = new Rng(5);
    const b = new Rng(5);
    expect([a.next(), a.next(), a.int(1, 6)]).toEqual([b.next(), b.next(), b.int(1, 6)]);
    expect(hashString('x')).toBe(hashString('x'));
    expect(hashString('x')).not.toBe(hashString('y'));
  });

  it('time helpers use UTC days', () => {
    const t = Date.parse('2026-10-25T23:30:00Z');
    expect(dayKey(t)).toBe('2026-10-25');
    expect(msUntilNextUtcDay(t)).toBe(30 * 60_000);
    expect(formatRaceTime(65.5)).toBe('1:05.50');
  });

  it('input bits encode all actions', () => {
    expect(encodeInput({ jumpHeld: true, left: true, right: true, use: true })).toBe(15);
    expect(encodeInput({ jumpHeld: false, left: false, right: false, use: false })).toBe(0);
  });

  it('level curve is consistent', () => {
    expect(levelForXp(0)).toBe(1);
    expect(levelForXp(totalXpForLevel(5))).toBe(5);
    expect(levelForXp(totalXpForLevel(5) - 1)).toBe(4);
  });

  it('settings sanitizers reject garbage', () => {
    expect(sanitizeBindings({ jump: [42 as unknown as string] })).toEqual(DEFAULT_BINDINGS);
    expect(sanitizeAudio({ master: 7 }).master).toBe(0.8);
  });

  it('racers never collide with each other (layers)', () => {
    expect(layersCollide(Layer.RACER, Layer.RACER)).toBe(false);
    expect(layersCollide(Layer.RACER, Layer.PROJECTILE)).toBe(true);
  });
});
