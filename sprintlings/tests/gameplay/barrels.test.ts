import { describe, expect, it } from 'vitest';
import { RaceSimulation } from '../../src/game/RaceManager';
import { human, input, skipCountdown, testTrack } from '../helpers';

describe('rolling barrels', () => {
  it('each racer gets its own single barrel and only that one hits it', () => {
    const track = testTrack(200, (c) => c.run(40).boulder(26));
    const sim = new RaceSimulation({ track, seed: 1, racers: [human('a'), human('b')] });
    skipCountdown(sim);
    // b runs well behind a.
    sim.racers[1].body.x -= 12;
    const hits = [0, 0];
    const rolls = new Set<string>();
    for (let i = 0; i < 60 * 8; i++) {
      for (const e of sim.step([input({}), input({})])) if (e.type === 'hit') hits[e.racer]++;
      for (const r of sim.racers) if (r.body.rollId >= 0) rolls.add(`${r.index}:${r.body.rollStart}`);
    }
    // One barrel per racer, started at different times.
    expect(rolls.size).toBe(2);
    expect(hits[0]).toBe(1);
    expect(hits[1]).toBe(1);
  });

  it('a jump clears your barrel', () => {
    const track = testTrack(200, (c) => c.run(40).boulder(26));
    const sim = new RaceSimulation({ track, seed: 1, racers: [human('a')] });
    skipCountdown(sim);
    let hit = false;
    for (let i = 0; i < 60 * 8; i++) {
      const b = sim.racers[0].body;
      const h = track.data.hazards[0];
      const bx = b.rollId === h.id ? h.x + 9 - (sim.time - b.rollStart) * 6 : 1e9;
      const jump = bx - b.x < 3.2 && bx - b.x > 0;
      for (const e of sim.step([input({ jumpHeld: jump })])) if (e.type === 'hit') hit = true;
    }
    expect(hit).toBe(false);
  });
});
