import { describe, expect, it } from 'vitest';
import { RaceSimulation } from '../../src/game/RaceManager';
import { createTicket, verifyRace } from '../../src/game/RaceVerifier';
import { teamWinner } from '../../src/game/RaceResults';
import { findSeekerTarget } from '../../src/abilities/ProjectileSystem';
import { calculateRaceReward } from '../../src/economy/RewardCalculator';
import { human, input, skipCountdown, testTrack } from '../helpers';

describe('duos', () => {
  it('tickets pair the player with one bot against two', () => {
    const t = createTicket('r1', 'mossy_hollow', 'duos', human('me'), 'normal', 4, 77, 0);
    expect(t.racers.map((r) => r.team)).toEqual([0, 0, 1, 1]);
  });

  it('powerups never target or hurt a teammate', () => {
    const sim = new RaceSimulation({
      track: testTrack(200),
      seed: 2,
      racers: [
        { ...human('a'), team: 0 },
        { ...human('b'), team: 0 },
        { ...human('c'), team: 1 },
      ],
    });
    skipCountdown(sim);
    sim.racers[1].body.x = 6;
    sim.racers[2].body.x = 14;
    expect(findSeekerTarget(sim, 0)).toBe(2);
    // A dynamite bundle from the teammate is harmless to us.
    sim.entities.push({ kind: 'snare', id: 77, owner: 1, x: sim.racers[0].body.x + 3, y: 0, ttl: 9, alive: true });
    let hit = false;
    for (let i = 0; i < 90; i++) for (const e of sim.step([input({}), input({}), input({})])) if (e.type === 'hit' && e.racer === 0) hit = true;
    expect(hit).toBe(false);
  });

  it('the team with more placing points wins; ties go to the first finisher', () => {
    expect(teamWinner([{ team: 0, place: 1 }, { team: 0, place: 4 }, { team: 1, place: 2 }, { team: 1, place: 3 }])).toBe(0);
    expect(teamWinner([{ team: 0, place: 2 }, { team: 0, place: 4 }, { team: 1, place: 1 }, { team: 1, place: 3 }])).toBe(1);
    expect(teamWinner([{ team: 0, place: 1 }, { team: 1, place: 2 }])).toBeNull();
  });

  it('a verified duos race reports the team result and pays the team bonus', () => {
    const t = createTicket('r2', 'mossy_hollow', 'duos', human('me'), 'easy', 1, 5, 0);
    const v = verifyRace(t, []);
    expect(v.ok).toBe(true);
    if (!v.ok) return;
    expect(typeof v.outcome.teamWin).toBe('boolean');
    const r = calculateRaceReward({ ...v.outcome, finished: true, teamWin: true });
    expect(r.lines.some((l) => l.label === 'Team victory')).toBe(true);
  });
});
