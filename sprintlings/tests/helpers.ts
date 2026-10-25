import { Track } from '../src/game/Track';
import { SegmentContext, emptyDraft } from '../src/game/TrackSegment';
import { Rng } from '../src/shared/Rng';
import { RaceSimulation, type RacerSetup } from '../src/game/RaceManager';
import { NO_INPUT, type TickInput } from '../src/game/RaceState';

/**
 * Builds a test track of `length`. `build` lays ground with the segment
 * cursor (run/gap/step...) and places hazards; whatever it leaves is filled
 * with flat ground (plus a run-out past the finish).
 */
export function testTrack(length: number, build: (c: SegmentContext) => void = () => {}): Track {
  const draft = emptyDraft();
  draft.pieces.push({ id: draft.nextId++, x0: -20, x1: 0, y0: 0, y1: 0, oneWay: false });
  const ctx = new SegmentContext(draft, 0, new Rng(1), 'forest');
  build(ctx);
  ctx.run(Math.max(1, length + 40 - ctx.cursor));
  return new Track({
    id: 'test',
    name: 'Test',
    biome: 'forest',
    seed: 1,
    length,
    pieces: draft.pieces,
    hazards: draft.hazards,
    itemBoxes: draft.itemBoxes,
    glimmers: draft.glimmers,
    segments: [],
  });
}

export function human(id = 'p', characterId: RacerSetup['characterId'] = 'moss'): RacerSetup {
  return { id, name: id, characterId, isPlayer: true };
}

export function bot(id: string, difficulty: RacerSetup['difficulty'] = 'perfect', characterId: RacerSetup['characterId'] = 'kip'): RacerSetup {
  return { id, name: id, characterId, isPlayer: false, difficulty };
}

/** Steps through the countdown so racers are running. */
export function skipCountdown(sim: RaceSimulation): void {
  while (sim.phase === 'countdown') sim.step([]);
}

export function input(partial: Partial<TickInput>): TickInput {
  return { ...NO_INPUT, ...partial };
}

/** Steps `ticks` times with a fixed input for racer 0; collects event types. */
export function run(sim: RaceSimulation, ticks: number, inp: TickInput | ((t: number) => TickInput) = NO_INPUT): string[] {
  const types: string[] = [];
  for (let t = 0; t < ticks && sim.phase !== 'done'; t++) {
    const i = typeof inp === 'function' ? inp(t) : inp;
    for (const e of sim.step([i])) if (e.racer === 0) types.push(e.type);
  }
  return types;
}
