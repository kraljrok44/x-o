/**
 * Playable monsters. All share identical base movement stats; each has one
 * small, situational passive so no monster is the best choice everywhere and
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

export type BodyPlan = 'fluff' | 'antenna' | 'shaggy' | 'cyclops' | 'chomper' | 'yeti';

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
  /** Which vector body plan the renderer draws (render/MonsterRig.ts). */
  bodyPlan: BodyPlan;
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
  toughQuills: { id: 'toughQuills', name: 'Thick Fluff', description: 'Stumbles from obstacles are 15% shorter.' },
  floaty: { id: 'floaty', name: 'Floaty Antennae', description: 'Hold jump while falling to drift down 15% slower.' },
  steadyFeet: { id: 'steadyFeet', name: 'Steady Feet', description: 'Mud and sap affect you 35% less.' },
  sparkSense: { id: 'sparkSense', name: 'Third Sense', description: 'Seekers chasing you home in 40% weaker.' },
  hotStart: { id: 'hotStart', name: 'Hot Start', description: 'Your Zephyr Dash lasts 20% longer.' },
  keenEyes: { id: 'keenEyes', name: 'Keen Eyes', description: 'Your Thistle Seekers home in 30% harder.' },
};

const ALL_SLOTS: CharacterDefinition['cosmeticSlots'] = ['hat', 'eyes', 'back', 'trail', 'emote'];

/*
 * Ids are kept from the first release so existing saves keep their unlocks;
 * names and looks are the cartoon monster cast.
 */
export const CHARACTERS: Record<CharacterId, CharacterDefinition> = {
  moss: {
    id: 'moss',
    name: 'Bloop',
    species: 'Puffball monster',
    tagline: 'All fluff, no fear.',
    bodyPlan: 'fluff',
    palette: { body: '#2fc4b2', belly: '#bff5e9', accent: '#f6e7c1', eye: '#1d1a2b' },
    variants: [
      { id: 'moss_autumn', name: 'Ember Bloop', palette: { body: '#f08a3c', belly: '#ffe2bf', accent: '#fff3d6', eye: '#1d1a2b' } },
      { id: 'moss_frost', name: 'Frost Bloop', palette: { body: '#8ec9ff', belly: '#eef6ff', accent: '#ffffff', eye: '#1d1a2b' } },
    ],
    passive: 'toughQuills',
    cosmeticSlots: ALL_SLOTS,
    unlock: 'starter',
    homeBiome: 'forest',
  },
  kip: {
    id: 'kip',
    name: 'Mimi',
    species: 'Antenna sprite',
    tagline: 'Never quite touches the ground.',
    bodyPlan: 'antenna',
    palette: { body: '#ff7fb4', belly: '#ffd6e7', accent: '#ffe066', eye: '#2b2140' },
    variants: [
      { id: 'kip_dusk', name: 'Dusk Mimi', palette: { body: '#7d63c9', belly: '#e3d7ff', accent: '#ffb86b', eye: '#1b1430' } },
      { id: 'kip_cocoa', name: 'Mint Mimi', palette: { body: '#5fd6a0', belly: '#d8fbe9', accent: '#ff8fb8', eye: '#1b1430' } },
    ],
    passive: 'floaty',
    cosmeticSlots: ALL_SLOTS,
    unlock: 'starter',
    homeBiome: 'forest',
  },
  pebble: {
    id: 'pebble',
    name: 'Grumbo',
    species: 'Shaggy canyon beast',
    tagline: 'Big hair, bigger heart.',
    bodyPlan: 'shaggy',
    palette: { body: '#ff9a3c', belly: '#ffd9a8', accent: '#fff4dc', eye: '#20160f' },
    variants: [
      { id: 'pebble_basalt', name: 'Storm Grumbo', palette: { body: '#5a6b8c', belly: '#b9c6e0', accent: '#ffe066', eye: '#0f0f14' } },
      { id: 'pebble_jade', name: 'Jade Grumbo', palette: { body: '#4fb38a', belly: '#c4f0d9', accent: '#fff4dc', eye: '#10201b' } },
    ],
    passive: 'steadyFeet',
    cosmeticSlots: ALL_SLOTS,
    unlock: { coins: 600, level: 3 },
    homeBiome: 'canyon',
  },
  lumi: {
    id: 'lumi',
    name: 'Zib',
    species: 'One-eyed glimmer imp',
    tagline: 'Sees trouble coming.',
    bodyPlan: 'cyclops',
    palette: { body: '#9b6bff', belly: '#dcccff', accent: '#ffd23f', eye: '#2a1030' },
    variants: [
      { id: 'lumi_abyss', name: 'Abyss Zib', palette: { body: '#3a4fbf', belly: '#a9b6ff', accent: '#63ffd8', eye: '#0b0b24' } },
      { id: 'lumi_gold', name: 'Sunny Zib', palette: { body: '#f2c14e', belly: '#fff2c4', accent: '#ff7eb6', eye: '#2a1a05' } },
    ],
    passive: 'sparkSense',
    cosmeticSlots: ALL_SLOTS,
    unlock: { coins: 900, level: 5 },
    homeBiome: 'crystal',
  },
  ember: {
    id: 'ember',
    name: 'Chompy',
    species: 'Grinning sprout monster',
    tagline: 'Starts hot, stays hot.',
    bodyPlan: 'chomper',
    palette: { body: '#9bd63a', belly: '#e4f7b8', accent: '#3f9a3a', eye: '#1a0d08' },
    variants: [
      { id: 'ember_teal', name: 'Lagoon Chompy', palette: { body: '#22b8c8', belly: '#c8fff7', accent: '#ffcc33', eye: '#06201e' } },
      { id: 'ember_violet', name: 'Berry Chompy', palette: { body: '#e0559a', belly: '#ffd0e6', accent: '#7b2d8e', eye: '#170a24' } },
    ],
    passive: 'hotStart',
    cosmeticSlots: ALL_SLOTS,
    unlock: { coins: 1500, level: 8 },
    homeBiome: 'canyon',
  },
  hoot: {
    id: 'hoot',
    name: 'Yobo',
    species: 'Snowpeak yeti cub',
    tagline: 'Sees every shortcut twice.',
    bodyPlan: 'yeti',
    palette: { body: '#5fb0ff', belly: '#e6f3ff', accent: '#ffffff', eye: '#1a1424' },
    variants: [
      { id: 'hoot_snow', name: 'Snowy Yobo', palette: { body: '#eef2f8', belly: '#ffffff', accent: '#9fd2ff', eye: '#141a24' } },
      { id: 'hoot_moss', name: 'Mossy Yobo', palette: { body: '#6c9a4a', belly: '#e5e0b5', accent: '#fff3c4', eye: '#141a10' } },
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
