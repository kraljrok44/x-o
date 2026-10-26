import { describe, expect, it } from 'vitest';
import { animalLevelForXp, animalXpForLevel, applyRank, leagueFor, trophyDelta } from '../../src/progression/LeagueService';
import { createProfile } from '../../src/economy/Profile';
import { emptyStats } from '../../src/game/RaceState';
import type { RaceOutcome } from '../../src/progression/QuestService';

const outcome = (o: Partial<RaceOutcome>): RaceOutcome => ({ raceId: 'r', trackId: 'mossy_hollow', mode: 'race', place: 1, racerCount: 4, finished: true, finishTime: 70, stats: emptyStats(), ...o });

describe('leagues and animal levels', () => {
  it('pays trophies by place and never for practice', () => {
    expect(trophyDelta(outcome({ place: 1 }))).toBe(30);
    expect(trophyDelta(outcome({ place: 4 }))).toBeLessThan(0);
    expect(trophyDelta(outcome({ mode: 'practice', racerCount: 1 }))).toBe(0);
    expect(trophyDelta(outcome({ finished: false }))).toBe(-12);
    expect(trophyDelta(outcome({ mode: 'duos', place: 3, teamWin: true }))).toBe(24);
  });

  it('trophies never go below zero and track the best', () => {
    const p = createProfile('x', 0);
    applyRank(p, 'moss', outcome({ place: 4 }), 10);
    expect(p.trophies).toBe(0);
    applyRank(p, 'moss', outcome({ place: 1 }), 10);
    applyRank(p, 'moss', outcome({ place: 4 }), 10);
    expect(p.bestTrophies).toBe(30);
    expect(p.trophies).toBe(20);
    expect(p.animalXp.moss).toBe(30);
  });

  it('maps trophies to leagues and xp to animal levels', () => {
    expect(leagueFor(0).id).toBe('tenderfoot');
    expect(leagueFor(700).id).toBe('deputy');
    expect(animalLevelForXp(0)).toBe(1);
    expect(animalLevelForXp(animalXpForLevel(5))).toBe(5);
    expect(animalLevelForXp(animalXpForLevel(5) - 1)).toBe(4);
    expect(animalLevelForXp(1e9)).toBe(20);
  });
});
