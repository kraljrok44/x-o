import { randomInt, randomUUID } from 'node:crypto';
import { settleRace, type RaceSettlement } from '../../src/economy/EconomyService';
import { visibleLoadout } from '../../src/economy/InventoryService';
import { createTicket, type DifficultyChoice, type RaceMode, type RaceTicket } from '../../src/game/RaceVerifier';
import { TRACK_IDS, parseRemixId, trackInfo } from '../../src/game/TrackManager';
import { getValidatedRemix } from '../../src/game/TrackValidator';
import { dayKey, DAY_MS } from '../../src/shared/time';
import { HttpError } from '../api/http';
import type { AccountService } from '../economy/AccountService';
import type { Repository } from '../persistence/Repository';
import type { VerifierPool } from '../antiCheat/VerifierPool';
import { checkTiming } from '../antiCheat/RacePlausibility';

const MODES: RaceMode[] = ['race', 'practice', 'remix'];
const DIFFS: DifficultyChoice[] = ['auto', 'easy', 'normal', 'hard'];

/**
 * Issues race tickets and settles finished races. Rewards are computed from
 * the server's own re-simulation of the submitted inputs, never from a
 * client-reported result.
 */
export class RaceService {
  constructor(
    private readonly repo: Repository,
    private readonly accounts: AccountService,
    private readonly verifier: VerifierPool,
  ) {}

  private resolveTrack(trackId: string, level: number, now: number): string {
    if (TRACK_IDS.includes(trackId)) {
      if (trackInfo(trackId).unlockLevel > level) throw new HttpError(403, 'locked', 'Track locked');
      return trackId;
    }
    if (trackId.startsWith('remix')) {
      if (level < 3) throw new HttpError(403, 'locked', 'Track locked');
      const { day } = parseRemixId(trackId);
      if (day !== dayKey(now) && day !== dayKey(now - DAY_MS)) throw new HttpError(400, 'invalid', 'Remix expired');
      const valid = getValidatedRemix(day).data.id;
      if (valid !== trackId) throw new HttpError(400, 'invalid', 'Unknown remix');
      return trackId;
    }
    throw new HttpError(400, 'invalid', 'Unknown track');
  }

  async start(accountId: string, trackId: string, mode: RaceMode, difficulty: DifficultyChoice): Promise<RaceTicket> {
    if (!MODES.includes(mode) || !DIFFS.includes(difficulty)) throw new HttpError(400, 'invalid', 'Bad mode');
    const profile = await this.accounts.read(accountId);
    const now = this.accounts.now();
    const track = this.resolveTrack(trackId, profile.level, now);
    const ticket = createTicket(
      `race_${randomUUID()}`,
      track,
      mode,
      {
        id: profile.id,
        name: profile.name,
        characterId: profile.loadout.characterId,
        isPlayer: true,
        cosmetics: visibleLoadout(profile),
        variantId: profile.loadout.variants[profile.loadout.characterId] ?? null,
      },
      difficulty,
      profile.level,
      randomInt(1, 2 ** 31),
      now,
    );
    await this.repo.putTicket(accountId, ticket);
    return ticket;
  }

  async finish(accountId: string, raceId: string, log: unknown): Promise<RaceSettlement> {
    const ticket = await this.repo.takeTicket(accountId, raceId);
    if (!ticket) throw new HttpError(404, 'not_found', 'Unknown or already submitted race');
    const result = await this.verifier.verify(ticket, log);
    if (!result.ok) throw new HttpError(422, 'unverifiable', `Race rejected: ${result.reason}`);
    const timing = checkTiming(ticket, result.outcome, this.accounts.now());
    if (timing) throw new HttpError(422, 'implausible', `Race rejected: ${timing}`);
    const { result: settlement } = await this.accounts.mutate(accountId, (p, now) => settleRace(p, ticket, result.outcome, now));
    return settlement;
  }
}
