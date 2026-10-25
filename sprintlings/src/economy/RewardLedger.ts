import { EconomyError } from './EconomyError';
import type { LedgerEntry, PlayerProfile } from './Profile';

const MAX_PROCESSED = 400;
const MAX_LEDGER = 250;

export function isProcessed(profile: PlayerProfile, eventId: string): boolean {
  return profile.processedEvents.includes(eventId);
}

/** Throws if the event was already applied: the core of reward idempotency. */
export function assertNew(profile: PlayerProfile, eventId: string): void {
  if (!eventId || typeof eventId !== 'string' || eventId.length > 120) throw new EconomyError('invalid', 'Missing event id.');
  if (isProcessed(profile, eventId)) throw new EconomyError('duplicate_event', 'This reward was already granted.');
}

/** Records an economic event in the audit log and marks its id as processed. */
export function record(profile: PlayerProfile, entry: LedgerEntry): void {
  profile.processedEvents.push(entry.id);
  if (profile.processedEvents.length > MAX_PROCESSED) profile.processedEvents.splice(0, profile.processedEvents.length - MAX_PROCESSED);
  profile.ledger.push(entry);
  if (profile.ledger.length > MAX_LEDGER) profile.ledger.splice(0, profile.ledger.length - MAX_LEDGER);
  profile.updatedAt = Math.max(profile.updatedAt, entry.at);
}

export function entry(
  partial: Pick<LedgerEntry, 'id' | 'type' | 'at' | 'reason' | 'ref'> & Partial<Pick<LedgerEntry, 'coins' | 'gems' | 'xp' | 'items'>>,
): LedgerEntry {
  return { coins: 0, gems: 0, xp: 0, items: [], ...partial };
}
