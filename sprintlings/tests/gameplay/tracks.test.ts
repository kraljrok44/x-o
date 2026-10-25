import { describe, expect, it } from 'vitest';
import { getTrack, remixRecipe, TRACK_IDS } from '../../src/game/TrackManager';
import { getValidatedRemix, validateTrack } from '../../src/game/TrackValidator';
import { buildTrack } from '../../src/obstacles/ObstacleSpawner';
import { SEGMENTS } from '../../src/obstacles/HazardPatterns';
import { GameplayConfig } from '../../src/config/GameplayConfig';

describe('tracks', () => {
  for (const id of TRACK_IDS) {
    it(`${id} is passable by the solver and within the target duration`, () => {
      const track = getTrack(id);
      const report = validateTrack(track);
      expect(report.problems).toEqual([]);
      expect(track.length).toBeGreaterThanOrEqual(300);
      expect(track.length).toBeLessThanOrEqual(450);
      expect(report.solverTime!).toBeGreaterThan(35);
      expect(report.solverTime!).toBeLessThan(55);
    });
  }

  it('every segment has metadata the assembler relies on', () => {
    for (const s of SEGMENTS) {
      expect(s.length).toBeGreaterThan(0);
      expect(s.difficulty).toBeGreaterThanOrEqual(0);
      expect(s.minSafeLeadIn).toBeGreaterThan(0);
      expect(Array.isArray(s.allowedAfter)).toBe(true);
    }
  });

  it('daily remixes are validated before use', { timeout: 120000 }, () => {
    for (let i = 0; i < 4; i++) {
      const day = new Date(Date.UTC(2026, 5, 1) + i * 86400000).toISOString().slice(0, 10);
      const track = getValidatedRemix(day);
      expect(validateTrack(track, { characters: ['kip'] }).ok).toBe(true);
      expect(track.length / GameplayConfig.movement.baseSpeed).toBeLessThan(55);
    }
  });

  it('remix ids rebuild the exact same track', () => {
    const a = buildTrack(remixRecipe('2026-03-03', 1));
    const b = getTrack('remix_2026-03-03_1');
    expect(b.data.hazards.length).toBe(a.data.hazards.length);
    expect(b.length).toBe(a.length);
  });
});
