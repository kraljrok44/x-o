import { CHARACTERS, CHARACTER_IDS, type CharacterId } from '../player/CharacterDefinition';

/**
 * Cosmetic items. Cosmetics never change speed, physics or hitboxes; they
 * are purely visual (enforced by the simulation never reading them).
 */
export type CosmeticSlot = 'hat' | 'eyes' | 'back' | 'trail' | 'emote' | 'variant';
export type Rarity = 'common' | 'rare' | 'epic' | 'legendary';
export type Currency = 'coins' | 'gems';

export interface CosmeticDefinition {
  id: string;
  slot: CosmeticSlot;
  name: string;
  description: string;
  rarity: Rarity;
  /** null = not sold directly (reward/bundle/chest only). */
  price: { currency: Currency; amount: number } | null;
  /** Free starter item every profile owns. */
  starter?: boolean;
  /** Only for variants: which character it recolours. */
  characterId?: CharacterId;
  /** Shop availability window (ISO dates), for seasonal items. */
  availableFrom?: string;
  availableUntil?: string;
  /** Only obtainable from a season tier. */
  seasonId?: string;
  /** Account level needed before it can be bought. */
  requiresLevel?: number;
  /** Visual tint used by the renderer (primary colour of the item). */
  color: string;
  /** Renderer model to use; defaults to the id (lets recolours share a model). */
  model?: string;
  /** Only obtainable from a real-money pack. */
  packOnly?: boolean;
}

const C = (amount: number) => ({ currency: 'coins' as const, amount });
const G = (amount: number) => ({ currency: 'gems' as const, amount });

const BASE: CosmeticDefinition[] = [
  // Hats
  { id: 'hat_leaf', slot: 'hat', name: 'Trail Hat', description: 'Every rider needs one.', rarity: 'common', price: null, starter: true, color: '#9a5b2e', model: 'hat_cowboy' },
  { id: 'hat_acorn', slot: 'hat', name: 'Prospector Helmet', description: 'Lamp on, nuggets ahead.', rarity: 'common', price: C(150), color: '#8f97a3', model: 'hat_miner' },
  { id: 'hat_party', slot: 'hat', name: 'Party Cone', description: 'Every race is a celebration.', rarity: 'common', price: C(180), color: '#ff6fa8' },
  { id: 'hat_flower', slot: 'hat', name: 'Daisy Crown', description: 'Fresh from the meadow.', rarity: 'common', price: C(250), color: '#fff1a8' },
  { id: 'hat_mushroom', slot: 'hat', name: 'Sombrero', description: 'Shade for the whole posse.', rarity: 'rare', price: C(380), color: '#e8b84a', model: 'hat_sombrero' },
  { id: 'hat_propeller', slot: 'hat', name: 'Propeller Beanie', description: 'Spins faster when you do.', rarity: 'rare', price: C(450), color: '#3fa7ff' },
  { id: 'hat_wizard', slot: 'hat', name: 'Ten-Gallon Hat', description: 'So tall it has its own weather.', rarity: 'rare', price: C(600), color: '#f6ead2', model: 'hat_tengallon' },
  { id: 'hat_tophat', slot: 'hat', name: 'Dapper Top Hat', description: 'For the most refined sprinter.', rarity: 'epic', price: C(900), color: '#2a2438' },
  { id: 'hat_horns', slot: 'hat', name: 'Rambler Horns', description: 'Curly horns of a mountain rambler.', rarity: 'epic', price: C(1100), requiresLevel: 6, color: '#e9dcc0' },
  { id: 'hat_crown', slot: 'hat', name: 'Sunburst Crown', description: 'A crown that catches every light.', rarity: 'legendary', price: G(220), color: '#ffc93c' },
  { id: 'hat_halo', slot: 'hat', name: 'Glow Halo', description: 'Floats. Glows. Judges a little.', rarity: 'epic', price: G(140), color: '#fff6b0' },
  { id: 'hat_pumpkin', slot: 'hat', name: 'Pumpkin Hood', description: 'Season reward: Harvest Hoopla.', rarity: 'epic', price: null, seasonId: 'season_1', color: '#ff8a2a' },
  { id: 'hat_goldleaf', slot: 'hat', name: 'Golden Stetson', description: 'Starter Pack exclusive.', rarity: 'epic', price: null, packOnly: true, model: 'hat_cowboy', color: '#ffcf4a' },

  // Eyewear
  { id: 'eyes_round', slot: 'eyes', name: 'Spectacles', description: 'For reading wanted posters.', rarity: 'common', price: C(150), color: '#2a2438' },
  { id: 'eyes_patch', slot: 'eyes', name: 'Adventurer Patch', description: 'Only one eye needed to win.', rarity: 'common', price: C(220), color: '#2a2438' },
  { id: 'eyes_heart', slot: 'eyes', name: 'Heart Shades', description: 'Loves every lap.', rarity: 'rare', price: C(380), color: '#ff4f8a' },
  { id: 'eyes_star', slot: 'eyes', name: 'Star Shades', description: 'Stardom, but make it eyewear.', rarity: 'rare', price: C(450), color: '#ffcc33' },
  { id: 'eyes_monocle', slot: 'eyes', name: 'Gilded Monocle', description: 'Indeed.', rarity: 'epic', price: C(800), color: '#ffcf4a' },
  { id: 'eyes_harvest', slot: 'eyes', name: 'Maple Shades', description: 'Season reward: Harvest Hoopla.', rarity: 'rare', price: null, seasonId: 'season_1', model: 'eyes_star', color: '#ff7a2a' },
  { id: 'eyes_visor', slot: 'eyes', name: 'Aviator Shades', description: 'Squint-free at high noon.', rarity: 'epic', price: G(120), color: '#4cf2ff' },

  // Back
  { id: 'back_scarf', slot: 'back', name: 'Trail Scarf', description: 'Flaps heroically in the wind.', rarity: 'common', price: C(200), color: '#ff5a4f' },
  { id: 'back_pack', slot: 'back', name: 'Saddlebag', description: 'Snacks for the trail.', rarity: 'common', price: C(280), color: '#c08a4a' },
  { id: 'back_balloon', slot: 'back', name: 'Lucky Balloon', description: 'Bobbing along behind you.', rarity: 'rare', price: C(420), color: '#ff7ab8' },
  { id: 'back_cape', slot: 'back', name: 'Poncho Cape', description: 'Every rider is a hero.', rarity: 'rare', price: C(700), color: '#4a63ff' },
  { id: 'back_leafwings', slot: 'back', name: 'Eagle Wings', description: 'Feathers from a friendly eagle.', rarity: 'epic', price: C(1200), requiresLevel: 8, color: '#a8743f' },
  { id: 'back_harvest', slot: 'back', name: 'Harvest Scarf', description: 'Season reward: Harvest Hoopla.', rarity: 'rare', price: null, seasonId: 'season_1', model: 'back_scarf', color: '#ff8a2a' },
  { id: 'back_rocket', slot: 'back', name: 'Toy Rocket', description: 'Purely decorative. Probably.', rarity: 'legendary', price: G(250), color: '#e8e8f0' },

  // Trails
  { id: 'trail_dust', slot: 'trail', name: 'Dust Puffs', description: 'Classic.', rarity: 'common', price: null, starter: true, color: '#e8dcc8' },
  { id: 'trail_sparkle', slot: 'trail', name: 'Sparkle Trail', description: 'Leave a little shine behind.', rarity: 'common', price: C(300), color: '#fff3a0' },
  { id: 'trail_leaves', slot: 'trail', name: 'Tumbleweed Swirl', description: 'A gust of prairie brush.', rarity: 'rare', price: C(450), color: '#c9a65a' },
  { id: 'trail_bubbles', slot: 'trail', name: 'Bubble Wake', description: 'Pop pop pop.', rarity: 'rare', price: C(500), color: '#a8e8ff' },
  { id: 'trail_notes', slot: 'trail', name: 'Melody Trail', description: 'Your run has a soundtrack.', rarity: 'epic', price: C(850), color: '#c49bff' },
  { id: 'trail_flame', slot: 'trail', name: 'Comet Flames', description: 'Too fast to cool down.', rarity: 'epic', price: C(1000), requiresLevel: 7, color: '#ff8a2a' },
  { id: 'trail_harvest', slot: 'trail', name: 'Harvest Swirl', description: 'Season reward: Harvest Hoopla.', rarity: 'epic', price: null, seasonId: 'season_1', model: 'trail_leaves', color: '#ff9a3c' },
  { id: 'trail_frostbite', slot: 'trail', name: 'Frostbite Sparks', description: 'Starter Pack exclusive.', rarity: 'epic', price: null, packOnly: true, model: 'trail_sparkle', color: '#7ef2ff' },
  { id: 'trail_rainbow', slot: 'trail', name: 'Prism Ribbon', description: 'Every colour, all at once.', rarity: 'legendary', price: G(180), color: '#ff6fd8' },

  // Victory emotes
  { id: 'emote_wave', slot: 'emote', name: 'Friendly Wave', description: 'Good race, everyone!', rarity: 'common', price: null, starter: true, color: '#ffffff' },
  { id: 'emote_spin', slot: 'emote', name: 'Twirl', description: 'A dizzy victory spin.', rarity: 'common', price: C(200), color: '#ffffff' },
  { id: 'emote_cheer', slot: 'emote', name: 'Big Cheer', description: 'Arms up, heart full.', rarity: 'common', price: C(300), color: '#ffffff' },
  { id: 'emote_dance', slot: 'emote', name: 'Hop Shuffle', description: 'An original hop-and-shuffle.', rarity: 'rare', price: C(450), color: '#ffffff' },
  { id: 'emote_backflip', slot: 'emote', name: 'Backflip', description: 'Show-off.', rarity: 'epic', price: C(800), color: '#ffffff' },
  { id: 'emote_harvest', slot: 'emote', name: 'Harvest Jig', description: 'Season reward: Harvest Hoopla.', rarity: 'epic', price: null, seasonId: 'season_1', model: 'emote_dance', color: '#ffffff' },
  { id: 'emote_flex', slot: 'emote', name: 'Tiny Flex', description: 'Mighty, in miniature.', rarity: 'epic', price: G(100), color: '#ffffff' },
];

/** Colour variants for every character (shop category "colours"). */
const VARIANTS: CosmeticDefinition[] = CHARACTER_IDS.flatMap((cid) =>
  CHARACTERS[cid].variants.map((v, i): CosmeticDefinition => ({
    id: v.id,
    slot: 'variant',
    name: v.name,
    description: `A fresh look for ${CHARACTERS[cid].name}.`,
    rarity: i === 0 ? 'rare' : 'epic',
    price: i === 0 ? C(400) : cid === 'lumi' ? G(150) : C(700),
    characterId: cid,
    color: v.palette.body,
  })),
);

export const COSMETICS: CosmeticDefinition[] = [...BASE, ...VARIANTS];
export const COSMETIC_BY_ID: Record<string, CosmeticDefinition> = Object.fromEntries(COSMETICS.map((c) => [c.id, c]));

export const STARTER_COSMETICS = COSMETICS.filter((c) => c.starter).map((c) => c.id);

export const RARITY_COLORS: Record<Rarity, string> = {
  common: '#9aa7b8',
  rare: '#3fa7ff',
  epic: '#b46bff',
  legendary: '#ffb627',
};

export function isAvailableNow(c: CosmeticDefinition, nowMs: number): boolean {
  if (c.availableFrom && nowMs < Date.parse(c.availableFrom)) return false;
  if (c.availableUntil && nowMs > Date.parse(c.availableUntil)) return false;
  return true;
}
