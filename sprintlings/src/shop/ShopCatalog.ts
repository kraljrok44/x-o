import { CHARACTERS, CHARACTER_IDS, type CharacterId } from '../player/CharacterDefinition';
import { COSMETICS, COSMETIC_BY_ID, isAvailableNow, type CosmeticDefinition, type Currency } from './CosmeticCatalog';
import { EconomyConfig, type ChestId } from '../config/EconomyConfig';

export type ShopCategory = 'characters' | 'hats' | 'eyes' | 'back' | 'colours' | 'emotes' | 'trails' | 'chests' | 'bundles' | 'premium' | 'seasonal';

export interface ShopOffer {
  id: string;
  kind: 'cosmetic' | 'character' | 'chest' | 'bundle';
  category: ShopCategory;
  name: string;
  description: string;
  price: { currency: Currency; amount: number };
  rarity?: CosmeticDefinition['rarity'];
  items?: string[];
  requiresLevel?: number;
  availableUntil?: string;
  characterId?: CharacterId;
}

/** Bundles sold for Gems: discounted sets of existing cosmetics. */
export const BUNDLES = [
  { id: 'bundle_explorer', name: 'Prospector Set', description: 'Prospector Helmet, Saddlebag and Tumbleweed Swirl.', items: ['hat_acorn', 'back_pack', 'trail_leaves'], price: { currency: 'gems' as const, amount: 90 } },
  { id: 'bundle_royal', name: 'Royal Set', description: 'Sunburst Crown, Gilded Monocle and Prism Ribbon.', items: ['hat_crown', 'eyes_monocle', 'trail_rainbow'], price: { currency: 'gems' as const, amount: 420 } },
];

const SLOT_CATEGORY: Record<string, ShopCategory> = { hat: 'hats', eyes: 'eyes', back: 'back', trail: 'trails', emote: 'emotes', variant: 'colours' };

export function categoryOf(c: CosmeticDefinition): ShopCategory {
  if (c.availableUntil) return 'seasonal';
  if (c.price?.currency === 'gems' && c.slot !== 'variant') return 'premium';
  return SLOT_CATEGORY[c.slot];
}

/** All offers currently on sale. */
export function shopOffers(now: number): ShopOffer[] {
  const offers: ShopOffer[] = [];
  for (const id of CHARACTER_IDS) {
    const c = CHARACTERS[id];
    if (c.unlock === 'starter') continue;
    offers.push({
      id: `char_${id}`,
      kind: 'character',
      category: 'characters',
      name: c.name,
      description: `${c.species}. Unlocks for free at level ${c.unlock.level}.`,
      price: { currency: 'coins', amount: c.unlock.coins },
      characterId: id,
    });
  }
  for (const c of COSMETICS) {
    if (!c.price || !isAvailableNow(c, now)) continue;
    offers.push({
      id: c.id,
      kind: 'cosmetic',
      category: categoryOf(c),
      name: c.name,
      description: c.description,
      price: c.price,
      rarity: c.rarity,
      requiresLevel: c.requiresLevel,
      availableUntil: c.availableUntil,
      characterId: c.characterId,
    });
  }
  for (const chest of Object.values(EconomyConfig.chests)) {
    offers.push({ id: chest.id, kind: 'chest', category: 'chests', name: chest.name, description: chest.contents, price: chest.price });
  }
  for (const b of BUNDLES) {
    offers.push({ id: b.id, kind: 'bundle', category: 'bundles', name: b.name, description: b.description, price: b.price, items: b.items });
  }
  return offers;
}

export function findOffer(id: string, now: number): ShopOffer | undefined {
  return shopOffers(now).find((o) => o.id === id);
}

export function chestPool(chestId: ChestId): CosmeticDefinition[] {
  void chestId;
  return COSMETICS.filter((c) => c.price?.currency === 'coins' && !c.seasonId && !c.packOnly);
}

export function cosmeticCoinValue(id: string): number {
  const c = COSMETIC_BY_ID[id];
  return c?.price?.currency === 'coins' ? c.price.amount : 300;
}
