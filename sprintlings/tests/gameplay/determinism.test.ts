import { describe, expect, it } from 'vitest';
import { RaceSimulation } from '../../src/game/RaceManager';
import { getTrack } from '../../src/game/TrackManager';
import { InputPlayer, InputRecorder, validateInputLog } from '../../src/game/RaceReplay';
import { summarizeRace } from '../../src/game/RaceResults';
import type { TickInput } from '../../src/game/RaceState';
import { Rng } from '../../src/shared/Rng';
import { bot, human } from '../helpers';

function racers() {
  return [human('me', 'moss'), bot('a', 'rookie', 'kip'), bot('b', 'racer', 'pebble'), bot('c', 'ace', 'lumi')];
}

/** A scripted "player": jumps periodically and changes lanes at random. */
function scripted(seed: number) {
  const rng = new Rng(seed);
  let hold = 0;
  return (): TickInput => {
    if (hold > 0) hold--;
    else if (rng.chance(0.03)) hold = 30;
    return { jumpHeld: hold > 0, left: rng.chance(0.01), right: rng.chance(0.01), use: rng.chance(0.01) };
  };
}

describe('determinism and replays', () => {
  it('identical setup and inputs give identical results', () => {
    const track = getTrack('mossy_hollow');
    const a = new RaceSimulation({ track, seed: 99, racers: racers() });
    const b = new RaceSimulation({ track, seed: 99, racers: racers() });
    const ia = scripted(4);
    const ib = scripted(4);
    a.runToEnd((_, i) => (i === 0 ? ia() : undefined));
    b.runToEnd((_, i) => (i === 0 ? ib() : undefined));
    expect(summarizeRace(a)).toEqual(summarizeRace(b));
  });

  it('a recorded input log replays to the same result (server verification)', () => {
    const track = getTrack('sunscar_canyon');
    const live = new RaceSimulation({ track, seed: 7, racers: racers() });
    const rec = new InputRecorder();
    const script = scripted(11);
    while (live.phase !== 'done') {
      const inp = script();
      rec.record(live.tick, inp);
      live.step([inp]);
    }
    expect(validateInputLog(rec.log, live.maxTicks)).toBe(true);
    const replay = new RaceSimulation({ track, seed: 7, racers: racers() });
    const player = new InputPlayer(rec.log);
    while (replay.phase !== 'done') replay.step([player.at(replay.tick)]);
    expect(summarizeRace(replay)).toEqual(summarizeRace(live));
  });

  it('rejects malformed input logs', () => {
    expect(validateInputLog([[5, 1], [3, 0]], 1000)).toBe(false);
    expect(validateInputLog([[5, 99]], 1000)).toBe(false);
    expect(validateInputLog('nope', 1000)).toBe(false);
    expect(validateInputLog([[2000, 1]], 1000)).toBe(false);
  });

  it('restarting a race starts from a clean state', () => {
    const track = getTrack('mossy_hollow');
    const first = new RaceSimulation({ track, seed: 3, racers: racers() });
    first.runToEnd();
    const second = new RaceSimulation({ track, seed: 3, racers: racers() });
    expect(second.tick).toBe(0);
    expect(second.entities).toHaveLength(0);
    expect(second.racers.every((r) => r.finishTime === null && r.stats.jumps === 0 && r.item === null)).toBe(true);
    second.runToEnd();
    expect(summarizeRace(second)).toEqual(summarizeRace(first));
  });
});
