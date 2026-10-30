import { describe, expect, it } from 'vitest';
import { RaceSimulation } from '../../src/game/RaceManager';
import type { CharacterId } from '../../src/player/CharacterDefinition';
import { human, input, skipCountdown, testTrack } from '../helpers';

function duo(a: CharacterId = 'moss', b: CharacterId = 'moss') {
  const sim = new RaceSimulation({ track: testTrack(300), seed: 5, racers: [{ ...human('a'), characterId: a }, { ...human('b'), characterId: b }] });
  skipCountdown(sim);
  for (let i = 0; i < 60; i++) sim.step(idle);
  return sim;
}

const idle = [input({}), input({})];
const run = (sim: RaceSimulation, n: number) => {
  const out = [];
  for (let i = 0; i < n; i++) out.push(...sim.step(idle).map((e) => ({ ...e })));
  return out;
};

describe('new powerups', () => {
  it('Lasso stuns the nearest rival ahead', () => {
    const sim = duo();
    sim.racers[1].body.x = sim.racers[0].body.x + 4;
    sim.racers[0].item = 'lasso';
    const ev = sim.step([input({ use: true }), input({})]).map((e) => ({ ...e }));
    expect(ev.some((e) => e.type === 'abilityHit' && e.racer === 1 && e.ability === 'lasso')).toBe(true);
    expect(sim.racers[1].body.stun).toBeGreaterThan(0);
  });

  it('Lasso is never stuck: with nobody in range it is laid as a trap', () => {
    const sim = duo();
    sim.racers[1].body.x = sim.racers[0].body.x + 30;
    sim.racers[0].item = 'lasso';
    sim.step([input({ use: true }), input({})]);
    expect(sim.racers[0].item).toBeNull();
    expect(sim.entities.some((e) => e.kind === 'noose' && e.alive)).toBe(true);
  });

  it('Thunder strikes the leader after a warning', () => {
    const sim = duo();
    sim.racers[1].body.x = sim.racers[0].body.x + 20;
    run(sim, 2);
    sim.racers[0].item = 'thunder';
    sim.step([input({ use: true }), input({})]);
    expect(sim.entities.some((e) => e.kind === 'thunder' && e.alive && e.target === 1)).toBe(true);
    expect(sim.racers[1].body.stun).toBe(0);
    const ev = run(sim, 70);
    expect(ev.some((e) => e.type === 'blast' && e.value === 1)).toBe(true);
    expect(ev.some((e) => e.type === 'abilityHit' && e.racer === 1 && e.ability === 'thunder')).toBe(true);
  });

  it('Thunder cannot be called while leading', () => {
    const sim = duo();
    sim.racers[0].body.x = sim.racers[1].body.x + 20;
    run(sim, 2);
    sim.racers[0].item = 'thunder';
    sim.step([input({ use: true }), input({})]);
    expect(sim.racers[0].item).toBe('thunder');
  });

  it('Bomb lands ahead and blasts a rival standing there', () => {
    const sim = duo();
    sim.racers[1].body.x = sim.racers[0].body.x + 6;
    sim.racers[0].item = 'bomb';
    sim.step([input({ use: true }), input({})]);
    let blast = false;
    let hit = false;
    for (let i = 0; i < 120; i++) {
      // Keep the target parked where the bomb comes down.
      sim.racers[1].body.speed = 0;
      sim.racers[1].body.x = Math.max(sim.racers[1].body.x, sim.racers[0].body.x + 2);
      for (const e of sim.step(idle)) {
        if (e.type === 'blast' && e.value === 0) blast = true;
        if (e.type === 'abilityHit' && e.ability === 'bomb') hit = true;
      }
    }
    expect(blast).toBe(true);
    expect(sim.entities.some((e) => e.kind === 'bomb' && e.alive)).toBe(false);
    expect(hit).toBe(true);
  });
});

describe('powerup lifetime', () => {
  it('an unused powerup fizzles out after its lifetime', () => {
    const sim = duo();
    sim.racers[0].item = 'lasso';
    const ev = run(sim, 60 * 9);
    expect(sim.racers[0].item).toBe('lasso');
    ev.push(...run(sim, 60 * 2));
    expect(sim.racers[0].item).toBeNull();
    expect(ev.some((e) => e.type === 'itemExpire' && e.racer === 0)).toBe(true);
  });
});

describe('animal specials', () => {
  it('fox Quick Getaway speeds up and goes on cooldown', () => {
    const sim = duo('moss');
    sim.step([input({ special: true }), input({})]);
    run(sim, 30);
    expect(sim.racers[0].body.speed).toBeGreaterThan(sim.racers[1].body.speed * 1.3);
    expect(sim.racers[0].specialCooldown).toBeGreaterThan(0);
    const before = sim.racers[0].specialCooldown;
    sim.step([input({ special: true }), input({})]);
    expect(sim.racers[0].specialCooldown).toBeLessThan(before);
  });

  it('rabbit Double Hop only works in the air', () => {
    const sim = duo('kip');
    sim.step([input({ special: true }), input({})]);
    expect(sim.racers[0].specialCooldown).toBe(0);
    sim.step([input({ jumpHeld: true }), input({})]);
    run(sim, 20);
    const vyBefore = sim.racers[0].body.vy;
    sim.step([input({ special: true }), input({})]);
    expect(sim.racers[0].body.vy).toBeGreaterThan(vyBefore);
    expect(sim.racers[0].specialCooldown).toBeGreaterThan(0);
  });

  it('bear Iron Hide blocks the next hit', () => {
    const sim = duo('moss', 'pebble');
    sim.step([input({}), input({ special: true })]);
    expect(sim.racers[1].body.shield).toBeGreaterThan(0);
    sim.racers[1].body.x = sim.racers[0].body.x + 4;
    sim.racers[0].item = 'lasso';
    const ev = sim.step([input({ use: true }), input({})]).map((e) => ({ ...e }));
    expect(ev.some((e) => e.type === 'shieldBlock' && e.racer === 1)).toBe(true);
    expect(sim.racers[1].body.stun).toBe(0);
  });

  it('raccoon Pickpocket steals a nearby rival powerup', () => {
    const sim = duo('lumi');
    sim.racers[1].body.x = sim.racers[0].body.x + 5;
    sim.racers[1].item = 'seeker';
    sim.step([input({ special: true }), input({})]);
    expect(sim.racers[0].item).toBe('seeker');
    expect(sim.racers[1].item).toBeNull();
  });

  it('bull Stampede knocks over rivals it runs into', () => {
    const sim = duo('ember');
    sim.racers[1].body.x = sim.racers[0].body.x + 1.5;
    sim.step([input({ special: true }), input({})]);
    let hit = false;
    for (let i = 0; i < 60 && !hit; i++) {
      sim.racers[1].body.speed = Math.min(sim.racers[1].body.speed, 5);
      for (const e of sim.step(idle)) if (e.type === 'abilityHit' && e.special === 'stampede') hit = true;
    }
    expect(hit).toBe(true);
  });

  it('wolf Howl slows nearby rivals', () => {
    const sim = duo('hoot');
    sim.racers[1].body.x = sim.racers[0].body.x + 5;
    sim.step([input({ special: true }), input({})]);
    expect(sim.racers[1].body.slow).toBeGreaterThan(0);
    run(sim, 40);
    expect(sim.racers[1].body.speed).toBeLessThan(sim.racers[0].body.speed);
  });

  it('teammates are never hurt by specials or powerups', () => {
    const sim = new RaceSimulation({ track: testTrack(300), seed: 5, racers: [{ ...human('a'), characterId: 'hoot', team: 0 }, { ...human('b'), team: 0 }] });
    skipCountdown(sim);
    for (let i = 0; i < 30; i++) sim.step(idle);
    sim.racers[1].body.x = sim.racers[0].body.x + 4;
    sim.step([input({ special: true }), input({})]);
    expect(sim.racers[1].body.slow).toBe(0);
    sim.racers[0].item = 'lasso';
    sim.step([input({ use: true }), input({})]);
    expect(sim.racers[1].body.stun).toBe(0);
  });
});

describe('lasso rope trap', () => {
  it('with nobody ahead the lasso becomes a rope trap that yanks a rival up', () => {
    const sim = duo();
    // Rival well behind: nobody in lasso range ahead.
    sim.racers[1].body.x = sim.racers[0].body.x - 8;
    sim.racers[0].item = 'lasso';
    sim.step([input({ use: true }), input({})]);
    expect(sim.racers[0].item).toBeNull();
    const trap = sim.entities.find((e) => e.kind === 'noose');
    expect(trap).toBeDefined();
    let caught = false;
    let maxLift = 0;
    for (let i = 0; i < 120; i++) {
      for (const e of sim.step(idle)) if (e.type === 'hit' && e.racer === 1 && e.value >= 400000) caught = true;
      if (caught) maxLift = Math.max(maxLift, sim.racers[1].body.y - trap!.y);
    }
    expect(caught).toBe(true);
    expect(maxLift).toBeGreaterThan(0.5);
    expect(sim.racers[0].body.stun).toBe(0);
  });
});
