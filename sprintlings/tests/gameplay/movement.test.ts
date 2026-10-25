import { describe, expect, it } from 'vitest';
import { RaceSimulation } from '../../src/game/RaceManager';
import { GameplayConfig } from '../../src/config/GameplayConfig';
import { human, input, run, skipCountdown, testTrack } from '../helpers';

const ALL = 7;

function solo(build?: Parameters<typeof testTrack>[1], length = 200) {
  const sim = new RaceSimulation({ track: testTrack(length, build), seed: 1, racers: [human()] });
  skipCountdown(sim);
  return sim;
}

describe('jumping', () => {
  it('reaches the designed apex and air time', () => {
    const sim = solo();
    run(sim, 30);
    const body = sim.racers[0].body;
    let apex = 0;
    let airTicks = 0;
    const events = run(sim, 120, (t) => {
      if (!body.grounded) airTicks++;
      apex = Math.max(apex, body.y);
      return input({ jumpHeld: t < 60 });
    });
    expect(events.filter((e) => e === 'jump')).toHaveLength(1);
    expect(events).toContain('land');
    expect(apex).toBeGreaterThan(2.1);
    expect(apex).toBeLessThan(2.5);
    const air = airTicks / 60;
    expect(air).toBeGreaterThan(0.8);
    expect(air).toBeLessThan(0.95);
  });

  it('does not double jump while airborne', () => {
    const sim = solo();
    run(sim, 10);
    const events = run(sim, 240, (t) => input({ jumpHeld: t % 6 < 3 }));
    // Mashing jump only ever produces one jump per landing.
    const seq = events.filter((e) => e === 'jump' || e === 'land');
    expect(seq.length).toBeGreaterThan(2);
    for (let i = 1; i < seq.length; i++) expect(seq[i]).not.toBe(seq[i - 1]);
  });

  it('releasing early makes a shorter hop', () => {
    const a = solo();
    const b = solo();
    let apexA = 0;
    let apexB = 0;
    run(a, 60, (t) => {
      apexA = Math.max(apexA, a.racers[0].body.y);
      return input({ jumpHeld: t < 40 });
    });
    run(b, 60, (t) => {
      apexB = Math.max(apexB, b.racers[0].body.y);
      return input({ jumpHeld: t < 5 });
    });
    expect(apexB).toBeLessThan(apexA * 0.75);
  });

  it('buffers a jump pressed shortly before landing', () => {
    const sim = solo();
    const body = sim.racers[0].body;
    run(sim, 2, input({ jumpHeld: true }));
    run(sim, 1, input({ jumpHeld: false }));
    // Wait until just before landing, then tap.
    let guard = 0;
    while (!(body.vy < 0 && body.y < 0.35) && guard++ < 200) run(sim, 1);
    const events = run(sim, 30, (t) => input({ jumpHeld: t < 2 }));
    expect(events).toContain('land');
    expect(events.filter((e) => e === 'jump')).toHaveLength(1);
  });

  it('allows a coyote-time jump just after running off a ledge', () => {
    // Gap starts at s = 20; press jump 3 ticks after the racer leaves the ground.
    const sim = solo((c) => c.gap(20, 24, ALL));
    const body = sim.racers[0].body;
    let guard = 0;
    while (body.grounded && guard++ < 400) run(sim, 1);
    run(sim, 3);
    const events = run(sim, 80, (t) => input({ jumpHeld: t < 30 }));
    expect(events).toContain('jump');
    expect(events).not.toContain('fall');
  });
});

describe('collisions', () => {
  it('stumbles on a hurdle when not jumping', () => {
    const sim = solo((c) => c.hurdle(15, ALL));
    const events = run(sim, 200);
    expect(events).toContain('hit');
    expect(sim.racers[0].stats.hitsTaken).toBe(1);
  });

  it('clears a hurdle with a well timed jump', () => {
    const sim = solo((c) => c.hurdle(15, ALL));
    const body = sim.racers[0].body;
    const events = run(sim, 200, () => input({ jumpHeld: body.s > 11 && body.s < 13 }));
    expect(events).not.toContain('hit');
    expect(events).toContain('hurdleCleared');
  });

  it('bonks on a wall and gets pushed back', () => {
    const sim = solo((c) => c.wall(20, 2));
    const body = sim.racers[0].body;
    const events = run(sim, 160);
    expect(events).toContain('bonk');
    expect(body.s).toBeLessThan(20);
    // Switching lanes gets past it.
    run(sim, 60, (t) => input({ right: t === 0 }));
    run(sim, 120);
    expect(body.s).toBeGreaterThan(22);
  });

  it('a shield absorbs one hit', () => {
    const sim = solo((c) => c.hurdle(15, ALL));
    sim.racers[0].item = 'shield';
    const events = run(sim, 200, (t) => input({ use: t === 1 }));
    expect(events).toContain('shieldBlock');
    expect(events).not.toContain('hit');
  });

  it('racers never collide with each other', () => {
    const sim = new RaceSimulation({ track: testTrack(100), seed: 3, racers: [human('a'), human('b')] });
    skipCountdown(sim);
    for (let t = 0; t < 600 && sim.phase !== 'done'; t++) sim.step([input({}), input({})]);
    expect(sim.racers.every((r) => r.stats.hitsTaken === 0)).toBe(true);
  });
});

describe('falling', () => {
  it('falls into a long gap, respawns after it and is briefly invulnerable', () => {
    const sim = solo((c) => c.gap(20, 30, ALL));
    const body = sim.racers[0].body;
    const events = run(sim, 200);
    expect(events).toContain('fall');
    let sawInvulnerable = false;
    run(sim, 150, () => {
      if (body.phase === 'run' && body.invuln > 0) {
        sawInvulnerable = true;
        expect(body.s).toBeGreaterThan(30);
      }
      return input({});
    });
    expect(sawInvulnerable).toBe(true);
    expect(sim.racers[0].stats.falls).toBe(1);
    expect(body.phase).toBe('run');
    expect(body.s).toBeGreaterThan(30);
  });

  it('resets physical state on respawn', () => {
    const sim = solo((c) => c.gap(20, 30, ALL));
    const body = sim.racers[0].body;
    run(sim, 300);
    expect(body.vy).toBe(0);
    expect(body.grounded).toBe(true);
    expect(body.dash).toBe(0);
    expect(Math.abs(body.y)).toBeLessThan(1e-6);
  });
});

describe('race flow', () => {
  it('finishes and records a time close to length / speed', () => {
    const sim = solo(undefined, 90);
    run(sim, 2000);
    const r = sim.racers[0];
    expect(r.finishTime).not.toBeNull();
    expect(r.finishTime!).toBeGreaterThan(90 / GameplayConfig.movement.baseSpeed - 0.5);
    expect(r.finishTime!).toBeLessThan(90 / GameplayConfig.movement.baseSpeed + 1.5);
    expect(sim.phase).toBe('done');
  });

  it('gives a start boost for pressing jump right at GO, not for mashing', () => {
    const track = testTrack(100);
    const good = new RaceSimulation({ track, seed: 1, racers: [human()] });
    const cd = good.countdownTicks;
    while (good.phase === 'countdown') good.step([input({ jumpHeld: good.tick >= cd - 6 })]);
    expect(good.racers[0].startBoostArmed).toBe(true);

    const masher = new RaceSimulation({ track, seed: 1, racers: [human()] });
    while (masher.phase === 'countdown') masher.step([input({ jumpHeld: masher.tick % 8 < 4 })]);
    expect(masher.racers[0].startBoostArmed).toBe(false);
  });
});
