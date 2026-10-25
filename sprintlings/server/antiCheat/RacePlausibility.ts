import { GameplayConfig } from '../../src/config/GameplayConfig';
import type { RaceOutcome } from '../../src/progression/QuestService';
import type { RaceTicket } from '../../src/game/RaceVerifier';

export const TICKET_MAX_AGE_MS = 20 * 60_000;

/**
 * Wall-clock sanity checks on top of re-simulation: a race can't be
 * submitted faster than it could have been played, nor long after.
 */
export function checkTiming(ticket: RaceTicket, outcome: RaceOutcome, receivedAt: number): string | null {
  const elapsed = receivedAt - ticket.issuedAt;
  if (elapsed > TICKET_MAX_AGE_MS) return 'ticket_expired';
  const played = GameplayConfig.race.countdownSeconds + (outcome.finishTime ?? GameplayConfig.race.maxDurationSeconds);
  if (elapsed < played * 1000 * 0.85) return 'too_fast';
  return null;
}
