import { Rng } from '../shared/Rng';
import type { DifficultyId } from '../ai/DifficultyProfile';
import { CHARACTER_IDS, type CharacterId } from '../player/CharacterDefinition';
import { COSMETICS } from '../shop/CosmeticCatalog';
import { RaceSimulation, type RacerSetup } from './RaceManager';
import { InputPlayer, validateInputLog, type InputLog } from './RaceReplay';
import { summarizeRace } from './RaceResults';
import { getTrack } from './TrackManager';
import type { RaceOutcome } from '../progression/QuestService';

export type RaceMode = 'race' | 'practice' | 'remix';
export type DifficultyChoice = 'auto' | 'easy' | 'normal' | 'hard';

/** Issued by the authority before a race; the only valid basis for rewards. */
export interface RaceTicket {
  raceId: string;
  trackId: string;
  seed: number;
  mode: RaceMode;
  racers: RacerSetup[];
  issuedAt: number;
}

const BOT_NAMES = ['Pip', 'Bramble', 'Nibs', 'Tumble', 'Skip', 'Wren', 'Clover', 'Juniper', 'Mochi', 'Pepper', 'Sprout', 'Biscuit', 'Fennel', 'Dot', 'Ziggy', 'Marlo', 'Quill', 'Tansy', 'Sorrel', 'Pebbles', 'Fig', 'Basil'];

export function botDifficulties(choice: DifficultyChoice, level: number): DifficultyId[] {
  switch (choice) {
    case 'easy':
      return ['rookie', 'rookie', 'rookie'];
    case 'normal':
      return ['rookie', 'racer', 'racer'];
    case 'hard':
      return ['racer', 'ace', 'ace'];
    case 'auto':
      if (level <= 2) return ['rookie', 'rookie', 'racer'];
      if (level <= 6) return ['rookie', 'racer', 'racer'];
      if (level <= 12) return ['racer', 'racer', 'ace'];
      return ['racer', 'ace', 'ace'];
  }
}

/** Builds a race ticket with a seeded bot lineup. */
export function createTicket(
  raceId: string,
  trackId: string,
  mode: RaceMode,
  player: RacerSetup,
  difficulty: DifficultyChoice,
  level: number,
  seed: number,
  now: number,
): RaceTicket {
  const rng = new Rng(seed ^ 0x5bd1e995);
  const racers: RacerSetup[] = [{ ...player, isPlayer: true, difficulty: undefined }];
  if (mode !== 'practice') {
    const names = rng.shuffle([...BOT_NAMES]);
    const chars = rng.shuffle(CHARACTER_IDS.filter((c) => c !== player.characterId)) as CharacterId[];
    const diffs = rng.shuffle(botDifficulties(difficulty, level));
    for (let i = 0; i < 3; i++) {
      const cosmetics: Record<string, string> = {};
      for (const slot of ['hat', 'eyes', 'back', 'trail'] as const) {
        if (rng.chance(slot === 'trail' ? 0.6 : 0.45)) {
          const pool = COSMETICS.filter((c) => c.slot === slot && !c.seasonId && !c.packOnly);
          cosmetics[slot] = rng.pick(pool).id;
        }
      }
      cosmetics.emote = rng.pick(COSMETICS.filter((c) => c.slot === 'emote' && !c.seasonId)).id;
      racers.push({ id: `bot_${i}`, name: names[i], characterId: chars[i], isPlayer: false, difficulty: diffs[i], cosmetics, variantId: null });
    }
  }
  return { raceId, trackId, seed, mode, racers, issuedAt: now };
}

export type VerifyResult = { ok: true; outcome: RaceOutcome; ticks: number } | { ok: false; reason: string };

/**
 * Re-simulates a race from its ticket and the player's input log. The
 * result of this re-simulation, never a client-reported placing, is what
 * rewards are based on.
 */
export function verifyRace(ticket: RaceTicket, log: unknown): VerifyResult {
  let track;
  try {
    track = getTrack(ticket.trackId);
  } catch {
    return { ok: false, reason: 'unknown_track' };
  }
  const sim = new RaceSimulation({ track, seed: ticket.seed, racers: ticket.racers });
  if (!validateInputLog(log, sim.maxTicks)) return { ok: false, reason: 'bad_input_log' };
  const player = new InputPlayer(log as InputLog);
  const inputs: ReturnType<InputPlayer['at']>[] = [];
  while (sim.phase !== 'done') {
    inputs[0] = player.at(sim.tick);
    sim.step(inputs);
  }
  const summary = summarizeRace(sim);
  const me = summary.racers.find((r) => r.index === 0)!;
  return {
    ok: true,
    ticks: summary.ticks,
    outcome: {
      raceId: ticket.raceId,
      trackId: ticket.trackId,
      mode: ticket.mode,
      place: me.place,
      racerCount: ticket.racers.length,
      finished: me.finishTime !== null,
      finishTime: me.finishTime,
      stats: me.stats,
    },
  };
}
