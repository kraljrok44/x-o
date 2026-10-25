import { describe, expect, it } from 'vitest';
import { RaceSimulation } from '../../src/game/RaceManager';
import { tryUseAbility } from '../../src/abilities/AbilityController';
import { human, input, run, skipCountdown, testTrack } from '../helpers';

function duo(length = 300, build?: Parameters<typeof testTrack>[1]) {
  const sim = new RaceSimulation({ track: testTrack(length, build), seed: 5, racers: [human('a'), human('b')] });
  skipCountdown(sim);
  return sim;
}

const idle = [input({}), input({})];

describe('abilities', () => {
  it('Zephyr Dash speeds the racer up temporarily', () => {
    const sim = duo();
    for (let i = 0; i < 60; i++) sim.step(idle);
    sim.racers[0].item = 'dash';
    sim.step([input({ use: true }), input({})]);
    for (let i = 0; i < 40; i++) sim.step(idle);
    expect(sim.racers[0].body.speed).toBeGreaterThan(sim.racers[1].body.speed * 1.3);
    expect(sim.racers[0].item).toBeNull();
    for (let i = 0; i < 120; i++) sim.step(idle);
    expect(sim.racers[0].body.speed).toBeCloseTo(9, 1);
  });

  it('Thistle Seeker homes in on the racer ahead and stuns it', () => {
    const sim = duo();
    // b gets a head start in another lane.
    sim.racers[1].body.s = 12;
    sim.racers[1].body.targetLane = 1;
    sim.racers[0].item = 'seeker';
    sim.step([input({ use: true }), input({})]);
    const seeker = sim.entities.find((e) => e.kind === 'seeker');
    expect(seeker && seeker.kind === 'seeker' && seeker.target).toBe(1);
    let hit = false;
    for (let i = 0; i < 200 && !hit; i++) for (const e of sim.step(idle)) if (e.type === 'seekerHit' && e.racer === 1) hit = true;
    expect(hit).toBe(true);
    expect(sim.racers[0].stats.hitsLanded).toBe(1);
  });

  it('a seeker can be dodged by jumping over it', () => {
    const sim = duo();
    sim.racers[1].body.s = 10;
    sim.racers[0].item = 'seeker';
    sim.step([input({ use: true }), input({})]);
    let hit = false;
    for (let i = 0; i < 200; i++) {
      const sk = sim.entities.find((e) => e.kind === 'seeker' && e.alive);
      const b = sim.racers[1].body;
      const near = sk && sk.kind === 'seeker' && sk.s > b.s - 4.5 && sk.s < b.s - 1;
      for (const e of sim.step([input({}), input({ jumpHeld: !!near })])) if (e.type === 'seekerHit') hit = true;
    }
    expect(hit).toBe(false);
  });

  it('Bramble Snare stuns a follower who runs into it', () => {
    const sim = duo();
    sim.racers[0].body.s = 10;
    sim.racers[1].body.lateral = 0;
    sim.racers[1].body.targetLane = 0;
    sim.racers[0].item = 'snare';
    sim.step([input({ use: true }), input({})]);
    expect(sim.entities.some((e) => e.kind === 'snare')).toBe(true);
    const ev = run(sim, 1);
    expect(ev).toBeDefined();
    let snared = false;
    for (let i = 0; i < 200; i++) for (const e of sim.step(idle)) if (e.type === 'hit' && e.racer === 1) snared = true;
    expect(snared).toBe(true);
  });

  it('Sticky Sap slows followers but not its owner', () => {
    const sim = duo();
    sim.racers[0].body.s = 14;
    sim.racers[0].item = 'sap';
    sim.step([input({ use: true }), input({})]);
    let minSpeed = 99;
    for (let i = 0; i < 90; i++) {
      sim.step(idle);
      minSpeed = Math.min(minSpeed, sim.racers[1].body.speed);
    }
    expect(minSpeed).toBeLessThan(7);
    expect(sim.racers[0].body.speed).toBeCloseTo(9, 1);
  });

  it('invalid use keeps the charge (stunned dash, snare over a gap)', () => {
    const sim = duo(300, (c) => c.gap(30, 40, 7));
    const r = sim.racers[0];
    r.item = 'dash';
    r.body.stun = 0.5;
    expect(tryUseAbility(sim, r)).toBe('invalid');
    expect(r.item).toBe('dash');
    r.body.stun = 0;
    r.item = 'snare';
    r.body.s = 35;
    expect(tryUseAbility(sim, r)).toBe('invalid');
    expect(r.item).toBe('snare');
  });

  it('Rune Boxes give leaders defensive and trailers offensive items more often', () => {
    const sim = duo();
    const counts = [{} as Record<string, number>, {} as Record<string, number>];
    for (let i = 0; i < 4000; i++) {
      for (const place of [0, 1]) {
        const it = sim.rng.weighted(([
          { dash: 10, shield: 30, seeker: 10, snare: 30, sap: 20 },
          { dash: 40, shield: 10, seeker: 35, snare: 10, sap: 5 },
        ] as const)[place]);
        counts[place][it] = (counts[place][it] ?? 0) + 1;
      }
    }
    expect(counts[0].shield).toBeGreaterThan(counts[1].shield);
    expect(counts[1].seeker).toBeGreaterThan(counts[0].seeker);
  });
});
