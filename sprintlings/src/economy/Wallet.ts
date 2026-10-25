import type { Currency } from '../shop/CosmeticCatalog';
import { EconomyError } from './EconomyError';
import type { PlayerProfile } from './Profile';

export function balance(profile: PlayerProfile, currency: Currency): number {
  return profile.wallet[currency];
}

export function canAfford(profile: PlayerProfile, currency: Currency, amount: number): boolean {
  return profile.wallet[currency] >= amount;
}

export function credit(profile: PlayerProfile, currency: Currency, amount: number): void {
  if (!Number.isInteger(amount) || amount < 0) throw new EconomyError('invalid', 'Invalid amount.');
  profile.wallet[currency] += amount;
}

export function debit(profile: PlayerProfile, currency: Currency, amount: number): void {
  if (!Number.isInteger(amount) || amount < 0) throw new EconomyError('invalid', 'Invalid amount.');
  if (profile.wallet[currency] < amount) {
    throw new EconomyError('insufficient_funds', currency === 'gems' ? 'Not enough Gems.' : 'Not enough Coins.');
  }
  profile.wallet[currency] -= amount;
}
