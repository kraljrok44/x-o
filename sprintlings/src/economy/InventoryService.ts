import { CHARACTERS, isCharacterId, type CharacterId } from '../player/CharacterDefinition';
import { COSMETIC_BY_ID } from '../shop/CosmeticCatalog';
import { EconomyError } from './EconomyError';
import { LOADOUT_SLOTS, type LoadoutSlot, type PlayerProfile } from './Profile';

export function ownsCosmetic(profile: PlayerProfile, id: string): boolean {
  return profile.inventory.includes(id);
}

export function ownsCharacter(profile: PlayerProfile, id: CharacterId): boolean {
  return profile.characters.includes(id);
}

/** Adds a cosmetic; returns false if it was already owned. */
export function addCosmetic(profile: PlayerProfile, id: string): boolean {
  if (!COSMETIC_BY_ID[id]) throw new EconomyError('not_found', 'Unknown item.');
  if (ownsCosmetic(profile, id)) return false;
  profile.inventory.push(id);
  profile.stats.itemsUnlocked++;
  return true;
}

export function removeCosmetic(profile: PlayerProfile, id: string): boolean {
  const i = profile.inventory.indexOf(id);
  if (i < 0) return false;
  profile.inventory.splice(i, 1);
  for (const slot of LOADOUT_SLOTS) {
    if (profile.loadout[slot] === id) profile.loadout[slot] = slot === 'trail' ? 'trail_dust' : slot === 'emote' ? 'emote_wave' : null;
  }
  for (const c of Object.keys(profile.loadout.variants) as CharacterId[]) if (profile.loadout.variants[c] === id) profile.loadout.variants[c] = null;
  return true;
}

/** Equips an owned cosmetic (or clears a slot with null). Purely visual. */
export function equip(profile: PlayerProfile, slot: LoadoutSlot | 'variant' | 'character', id: string | null): void {
  if (slot === 'character') {
    if (!id || !isCharacterId(id) || !ownsCharacter(profile, id)) throw new EconomyError('locked', 'Character not unlocked.');
    profile.loadout.characterId = id;
    return;
  }
  if (slot !== 'variant' && !(LOADOUT_SLOTS as readonly string[]).includes(slot)) throw new EconomyError('invalid', 'Unknown slot.');
  if (id !== null) {
    const def = COSMETIC_BY_ID[id];
    if (!def) throw new EconomyError('not_found', 'Unknown item.');
    if (!ownsCosmetic(profile, id)) throw new EconomyError('locked', 'You do not own this item yet.');
    if (def.slot !== slot) throw new EconomyError('invalid', 'Item does not fit this slot.');
  }
  if (slot === 'variant') {
    const target = id ? (COSMETIC_BY_ID[id].characterId as CharacterId) : profile.loadout.characterId;
    if (!CHARACTERS[target]) throw new EconomyError('invalid', 'Invalid colour.');
    profile.loadout.variants[target] = id;
    return;
  }
  if (id === null && (slot === 'trail' || slot === 'emote')) {
    profile.loadout[slot] = slot === 'trail' ? 'trail_dust' : 'emote_wave';
    return;
  }
  profile.loadout[slot] = id;
}

/** Cosmetic ids the renderer should show for the current loadout. */
export function visibleLoadout(profile: PlayerProfile): Record<string, string> {
  const l = profile.loadout;
  const out: Record<string, string> = {};
  for (const slot of LOADOUT_SLOTS) {
    const v = l[slot];
    if (v) out[slot] = v;
  }
  return out;
}
