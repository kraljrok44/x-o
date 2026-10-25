/**
 * Playable critters. All share identical base movement stats; each has one
 * small, situational passive so no critter is the best choice everywhere and
 * nothing that can be bought guarantees an advantage. Characters unlock with
 * Coins or account level only (never premium currency).
 */
export type CharacterId = 'moss' | 'kip' | 'pebble' | 'lumi' | 'ember' | 'hoot';

export type PassiveId =
  | 'toughQuills'
  | 'floaty'
  | 'steadyFeet'
  | 'sparkSense'
  | 'hotStart'
  | 'keenEyes';

export interface PassiveDefinition {
  id: PassiveId;
  name: string;
  description: string;
}

export interface CharacterPalette {
  body: string;
  belly: string;
  accent: string;
  eye: string;
}

export interface CharacterDefinition {
  id: CharacterId;
  name: string;
  species: string;
  tagline: string;
  /** Which procedural body plan the renderer builds (render/CharacterFactory.ts). */
  bodyPlan: 'hedgehog' | 'hare' | 'golem' | 'axolotl' | 'salamander' | 'owlet';
  palette: CharacterPalette;
  /** Alternate palettes unlockable as colour variants (shop category "colours"). */
  variants: { id: string; name: string; palette: CharacterPalette }[];
  passive: PassiveId;
  /** Cosmetic slots the body plan supports. */
  cosmeticSlots: ('hat' | 'eyes' | 'back' | 'trail' | 'emote')[];
  unlock: { coins: number; level: number } | 'starter';
  /** Ability the AI prefers to hoard/fire first when holding a choice (flavour only). */
  homeBiome: 'forest' | 'canyon' | 'crystal';
}

export const PASSIVES: Record<PassiveId, PassiveDefinition> = {
  toughQuills: { id: 'toughQuills', name: 'Tough Quills', description: 'Stumbles from obstacles are 15% shorter.' },
  floaty: { id: 'floaty', name: 'Floaty Ears', description: 'Hold jump while falling to drift down 15% slower.' },
  steadyFeet: { id: 'steadyFeet', name: 'Steady Feet', description: 'Mud, sap and ice affect you 35% less.' },
  sparkSense: { id: 'sparkSense', name: 'Spark Sense', description: 'Seekers chasing you home in 40% weaker.' },
  hotStart: { id: 'hotStart', name: 'Hot Start', description: 'Your Zephyr Dash lasts 20% longer.' },
  keenEyes: { id: 'keenEyes', name: 'Keen Eyes', description: 'Your Thistle Seekers home in 30% harder.' },
};

const ALL_SLOTS: CharacterDefinition['cosmeticSlots'] = ['hat', 'eyes', 'back', 'trail', 'emote'];

export const CHARACTERS: Record<CharacterId, CharacterDefinition> = {
  moss: {
    id: 'moss',
    name: 'Moss',
    species: 'Thornback hedgehog',
    tagline: 'Rolls with the punches.',
    bodyPlan: 'hedgehog',
    palette: { body: '#5f8f3e', belly: '#f3d9a4', accent: '#3d6b2a', eye: '#1d1a2b' },
    variants: [
      { id: 'moss_autumn', name: 'Autumn Moss', palette: { body: '#c4622d', belly: '#f6e2b8', accent: '#8a3c1b', eye: '#1d1a2b' } },
      { id: 'moss_frost', name: 'Frost Moss', palette: { body: '#7fb7d9', belly: '#eef6ff', accent: '#4a7fa6', eye: '#1d1a2b' } },
    ],
    passive: 'toughQuills',
    cosmeticSlots: ALL_SLOTS,
    unlock: 'starter',
    homeBiome: 'forest',
  },
  kip: {
    id: 'kip',
    name: 'Kip',
    species: 'Cloud hare',
    tagline: 'Never quite touches the ground.',
    bodyPlan: 'hare',
    palette: { body: '#f2eee8', belly: '#ffd6e0', accent: '#a7b8ff', eye: '#2b2140' },
    variants: [
      { id: 'kip_dusk', name: 'Dusk Kip', palette: { body: '#6c5a9e', belly: '#f7c8e8', accent: '#ffb86b', eye: '#1b1430' } },
      { id: 'kip_cocoa', name: 'Cocoa Kip', palette: { body: '#8a5a3c', belly: '#f2d2b0', accent: '#f7efe2', eye: '#1b1430' } },
    ],
    passive: 'floaty',
    cosmeticSlots: ALL_SLOTS,
    unlock: 'starter',
    homeBiome: 'forest',
  },
  pebble: {
    id: 'pebble',
    name: 'Pebble',
    species: 'Canyon golem pup',
    tagline: 'Small, round, unstoppable.',
    bodyPlan: 'golem',
    palette: { body: '#b48a63', belly: '#e9c79c', accent: '#ff9a3c', eye: '#20160f' },
    variants: [
      { id: 'pebble_basalt', name: 'Basalt Pebble', palette: { body: '#4b4a55', belly: '#77768a', accent: '#ff5a3c', eye: '#0f0f14' } },
      { id: 'pebble_jade', name: 'Jade Pebble', palette: { body: '#4f9e86', belly: '#a9e0c9', accent: '#ffe066', eye: '#10201b' } },
    ],
    passive: 'steadyFeet',
    cosmeticSlots: ALL_SLOTS,
    unlock: { coins: 600, level: 3 },
    homeBiome: 'canyon',
  },
  lumi: {
    id: 'lumi',
    name: 'Lumi',
    species: 'Crystal axolotl',
    tagline: 'Glows brighter under pressure.',
    bodyPlan: 'axolotl',
    palette: { body: '#ff9ec8', belly: '#ffe0ef', accent: '#7ef2ff', eye: '#2a1030' },
    variants: [
      { id: 'lumi_abyss', name: 'Abyss Lumi', palette: { body: '#3a3f8f', belly: '#8e9bff', accent: '#63ffd8', eye: '#0b0b24' } },
      { id: 'lumi_gold', name: 'Gilded Lumi', palette: { body: '#f2c14e', belly: '#fff2c4', accent: '#ff7eb6', eye: '#2a1a05' } },
    ],
    passive: 'sparkSense',
    cosmeticSlots: ALL_SLOTS,
    unlock: { coins: 900, level: 5 },
    homeBiome: 'crystal',
  },
  ember: {
    id: 'ember',
    name: 'Ember',
    species: 'Cinder salamander',
    tagline: 'Starts hot, stays hot.',
    bodyPlan: 'salamander',
    palette: { body: '#e8513a', belly: '#ffd27a', accent: '#2b2d42', eye: '#1a0d08' },
    variants: [
      { id: 'ember_teal', name: 'Lagoon Ember', palette: { body: '#22a6a0', belly: '#c8fff1', accent: '#ffcc33', eye: '#06201e' } },
      { id: 'ember_violet', name: 'Violet Ember', palette: { body: '#9c4dd8', belly: '#ffc7f2', accent: '#29203a', eye: '#170a24' } },
    ],
    passive: 'hotStart',
    cosmeticSlots: ALL_SLOTS,
    unlock: { coins: 1500, level: 8 },
    homeBiome: 'canyon',
  },
  hoot: {
    id: 'hoot',
    name: 'Hoot',
    species: 'Lantern owlet',
    tagline: 'Sees every shortcut twice.',
    bodyPlan: 'owlet',
    palette: { body: '#7a6a8f', belly: '#efe3c8', accent: '#ffcf4a', eye: '#1a1424' },
    variants: [
      { id: 'hoot_snow', name: 'Snowy Hoot', palette: { body: '#e9eef5', belly: '#ffffff', accent: '#7ec8ff', eye: '#141a24' } },
      { id: 'hoot_moss', name: 'Mossy Hoot', palette: { body: '#5a7a4a', belly: '#e5e0b5', accent: '#ff8a5c', eye: '#141a10' } },
    ],
    passive: 'keenEyes',
    cosmeticSlots: ALL_SLOTS,
    unlock: { coins: 2200, level: 11 },
    homeBiome: 'crystal',
  },
};

export const CHARACTER_IDS: readonly CharacterId[] = ['moss', 'kip', 'pebble', 'lumi', 'ember', 'hoot'];

export function isCharacterId(value: string): value is CharacterId {
  return (CHARACTER_IDS as readonly string[]).includes(value);
}
