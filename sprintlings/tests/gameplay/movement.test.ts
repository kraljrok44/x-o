import { describe, expect, it } from 'vitest';
import { RaceSimulation } from '../../src/game/RaceManager';
import { GameplayConfig } from '../../src/config/GameplayConfig';
import { human, input, run, skipCountdown, testTrack } from '../helpers';

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
    expect(air).toBeGreaterThan(0.78);
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
    // Pit starts at x = 20; press jump 3 ticks after the racer leaves the ground.
    const sim = solo((c) => c.run(20).gap(4));
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
  it('stumbles on a log when not jumping', () => {
    const sim = solo((c) => c.log(15));
    const events = run(sim, 200);
    expect(events).toContain('hit');
    expect(sim.racers[0].stats.hitsTaken).toBe(1);
  });

  it('clears a log with a well timed jump', () => {
    const sim = solo((c) => c.log(15));
    const body = sim.racers[0].body;
    const events = run(sim, 200, () => input({ jumpHeld: body.x > 11 && body.x < 13 }));
    expect(events).not.toContain('hit');
    expect(events).toContain('hurdleCleared');
  });

  it('is stopped by a step face until it jumps up', () => {
    const sim = solo((c) => c.run(20).step(1.2));
    const body = sim.racers[0].body;
    run(sim, 160);
    expect(body.blocked).toBe(true);
    expect(body.x).toBeLessThan(20);
    run(sim, 40, (t) => input({ jumpHeld: t < 30 }));
    run(sim, 60);
    expect(body.x).toBeGreaterThan(22);
    expect(body.y).toBeCloseTo(1.2, 5);
  });

  it('a jump that catches a step just below its top climbs onto it instead of falling through', () => {
    // Jump timings that clip the corner of a 1.2 u step must never drop the racer through the ground.
    for (let start = 1; start < 8; start += 0.25) {
      const sim = solo((c) => c.run(20).step(1.2));
      const body = sim.racers[0].body;
      let pressed = -1;
      const events = run(sim, 260, (t) => {
        if (pressed < 0 && body.x >= start + 10) pressed = t;
        return input({ jumpHeld: pressed >= 0 && t - pressed < 40 });
      });
      expect(events).not.toContain('fall');
      // Either on top of the step, or stopped at its foot: never inside it.
      expect(body.y > 1.19 || (body.y > -1e-6 && body.x < 20)).toBe(true);
    }
  });

  it('walks up small steps without jumping', () => {
    const sim = solo((c) => c.run(20).step(0.25).run(5).ramp(6, 1.5));
    const body = sim.racers[0].body;
    run(sim, 300);
    expect(body.x).toBeGreaterThan(35);
    expect(body.y).toBeCloseTo(1.75, 5);
  });

  it('lands on a one-way platform from below and drops through with down', () => {
    const sim = solo((c) => c.run(60).platform(10, 30, 1.8));
    const body = sim.racers[0].body;
    run(sim, 70);
    run(sim, 45, (t) => input({ jumpHeld: t < 40 }));
    run(sim, 30);
    expect(body.grounded).toBe(true);
    expect(body.y).toBeCloseTo(1.8, 5);
    const events = run(sim, 30, (t) => input({ down: t < 4 }));
    expect(events).toContain('drop');
    expect(events).toContain('land');
    expect(body.y).toBeCloseTo(0, 5);
  });

  it('after a stun the racer gets a short grace period, so repeated hazards cannot chain-stun', () => {
    const sim = solo((c) => c.run(60).boulder(30, 0, 1.2, 8));
    const events = run(sim, 600);
    const hits = events.filter((e) => e === 'hit').length;
    expect(hits).toBeGreaterThan(0);
    expect(hits).toBeLessThanOrEqual(2);
    expect(sim.racers[0].body.x).toBeGreaterThan(45);
  });

  it('holding down on solid ground slides with a low hitbox; jumping costs a little speed', () => {
    const sim = solo();
    const body = sim.racers[0].body;
    run(sim, 60);
    run(sim, 20, input({ down: true }));
    expect(body.sliding).toBe(true);
    expect(body.speed).toBeCloseTo(9, 1);
    run(sim, 5);
    expect(body.sliding).toBe(false);
    run(sim, 10, input({ jumpHeld: true }));
    expect(body.grounded).toBe(false);
    expect(body.speed).toBeLessThan(9 * 0.96);
  });

  it('a shield absorbs one hit', () => {
    const sim = solo((c) => c.log(15));
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
  it('falls into a wide pit, respawns after it and is briefly invulnerable', () => {
    const sim = solo((c) => c.run(20).gap(10));
    const body = sim.racers[0].body;
    const events = run(sim, 200);
    expect(events).toContain('fall');
    let sawInvulnerable = false;
    run(sim, 150, () => {
      if (body.phase === 'run' && body.invuln > 0) {
        sawInvulnerable = true;
        expect(body.x).toBeGreaterThan(30);
      }
      return input({});
    });
    expect(sawInvulnerable).toBe(true);
    expect(sim.racers[0].stats.falls).toBe(1);
    expect(body.phase).toBe('run');
    expect(body.x).toBeGreaterThan(30);
  });

  it('resets physical state on respawn', () => {
    const sim = solo((c) => c.run(20).gap(10));
    const body = sim.racers[0].body;
    run(sim, 300);
    expect(body.vy).toBe(0);
    expect(body.grounded).toBe(true);
    expect(body.dash).toBe(0);
    expect(Math.abs(body.y)).toBeLessThan(1e-6);
  });

  it('a spring launches across a pit too wide to jump', () => {
    const sim = solo((c) => c.run(20).pad('spring', 19).gap(9));
    const events = run(sim, 300);
    expect(events).toContain('bounce');
    expect(events).not.toContain('fall');
    expect(sim.racers[0].body.x).toBeGreaterThan(40);
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
