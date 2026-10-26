/**
 * Playable western critters: anthropomorphic animals in frontier outfits. All share identical base movement stats; each has one
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

export type BodyPlan = 'fox' | 'rabbit' | 'bear' | 'raccoon' | 'bull' | 'wolf';

export interface CharacterPalette {
  /** Fur. */
  body: string;
  /** Light fur: muzzle, chest, inner ears. */
  belly: string;
  /** Nose, horns, markings. */
  accent: string;
  eye: string;
  /** Outfit. */
  shirt: string;
  vest: string;
  pants: string;
  boots: string;
  scarf: string;
}

export interface CharacterDefinition {
  id: CharacterId;
  name: string;
  species: string;
  tagline: string;
  /** Which species the renderer draws (render/CharacterRig.ts). */
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
  toughQuills: { id: 'toughQuills', name: 'Thick Hide', description: 'Stumbles from obstacles are 15% shorter.' },
  floaty: { id: 'floaty', name: 'Big Ears', description: 'Hold jump while falling to drift down 15% slower.' },
  steadyFeet: { id: 'steadyFeet', name: 'Steady Paws', description: 'Mud and tar slow you 35% less.' },
  sparkSense: { id: 'sparkSense', name: 'Sly Sense', description: 'Rockets chasing you home in 40% weaker.' },
  hotStart: { id: 'hotStart', name: 'Hot Start', description: 'Your Spur Dash lasts 20% longer.' },
  keenEyes: { id: 'keenEyes', name: 'Keen Eyes', description: 'Your Homing Rockets home in 30% harder.' },
};

const ALL_SLOTS: CharacterDefinition['cosmeticSlots'] = ['hat', 'eyes', 'back', 'trail', 'emote'];

/*
 * Ids are kept from the first release so existing saves keep their unlocks;
 * names and looks are the western critter cast. Every design is original.
 */
export const CHARACTERS: Record<CharacterId, CharacterDefinition> = {
  moss: {
    id: 'moss',
    name: 'Rusty',
    species: 'Fox wrangler',
    tagline: 'Quickest tail in the territory.',
    bodyPlan: 'fox',
    palette: { body: '#f08a3c', belly: '#fff4e2', accent: '#2a1d2e', eye: '#2a1d2e', shirt: '#f3e1b6', vest: '#8a4f2a', pants: '#3f6fb0', boots: '#6b3d22', scarf: '#d8343a' },
    variants: [
      { id: 'moss_autumn', name: 'Silver Rusty', palette: { body: '#b9c2cf', belly: '#ffffff', accent: '#2a1d2e', eye: '#2a1d2e', shirt: '#5a7fc4', vest: '#3a3448', pants: '#2f3450', boots: '#1f1a26', scarf: '#ffcf33' } },
      { id: 'moss_frost', name: 'Desert Rusty', palette: { body: '#e8c27a', belly: '#fff8e8', accent: '#3b2a1e', eye: '#2a1d2e', shirt: '#ffffff', vest: '#c2683a', pants: '#8a6a4a', boots: '#5a3a22', scarf: '#3fa7a0' } },
    ],
    passive: 'toughQuills',
    cosmeticSlots: ALL_SLOTS,
    unlock: 'starter',
    homeBiome: 'forest',
  },
  kip: {
    id: 'kip',
    name: 'Jackie',
    species: 'Jackrabbit rodeo star',
    tagline: 'Never quite touches the ground.',
    bodyPlan: 'rabbit',
    palette: { body: '#c9b59a', belly: '#fff4ea', accent: '#ff8fae', eye: '#2b2140', shirt: '#e8473b', vest: '#f6e2c0', pants: '#7a5a3a', boots: '#a8743f', scarf: '#ffe066' },
    variants: [
      { id: 'kip_dusk', name: 'Midnight Jackie', palette: { body: '#5f5a72', belly: '#d9d2ea', accent: '#ff9ec8', eye: '#1b1430', shirt: '#7d63c9', vest: '#2a2438', pants: '#3a3448', boots: '#1f1a26', scarf: '#ffb86b' } },
      { id: 'kip_cocoa', name: 'Snowy Jackie', palette: { body: '#f4f1ec', belly: '#ffffff', accent: '#ff8fae', eye: '#1b1430', shirt: '#5fb0a0', vest: '#8a5a3c', pants: '#4a5a7a', boots: '#6b3d22', scarf: '#ff6f8a' } },
    ],
    passive: 'floaty',
    cosmeticSlots: ALL_SLOTS,
    unlock: 'starter',
    homeBiome: 'forest',
  },
  pebble: {
    id: 'pebble',
    name: 'Bruno',
    species: 'Grizzly blacksmith',
    tagline: 'Big paws, bigger heart.',
    bodyPlan: 'bear',
    palette: { body: '#9a6338', belly: '#e8c99a', accent: '#2a1d2e', eye: '#20160f', shirt: '#4f9e5a', vest: '#5a3a22', pants: '#6a5038', boots: '#3b2a1e', scarf: '#f2b233' },
    variants: [
      { id: 'pebble_basalt', name: 'Midnight Bruno', palette: { body: '#3f3a48', belly: '#a8a0b8', accent: '#1a1424', eye: '#0f0f14', shirt: '#c4473b', vest: '#2a2438', pants: '#3a3448', boots: '#1a1424', scarf: '#ffe066' } },
      { id: 'pebble_jade', name: 'Honey Bruno', palette: { body: '#d9a24a', belly: '#fff0c8', accent: '#3b2a1e', eye: '#20160f', shirt: '#3f6fb0', vest: '#8a4f2a', pants: '#5a4a3a', boots: '#4a2e1a', scarf: '#e8473b' } },
    ],
    passive: 'steadyFeet',
    cosmeticSlots: ALL_SLOTS,
    unlock: { coins: 600, level: 3 },
    homeBiome: 'canyon',
  },
  lumi: {
    id: 'lumi',
    name: 'Bandit',
    species: 'Raccoon card shark',
    tagline: 'Always one step ahead of trouble.',
    bodyPlan: 'raccoon',
    palette: { body: '#9aa0ac', belly: '#f1f1f4', accent: '#2a2a33', eye: '#1a1424', shirt: '#8e5ad6', vest: '#2a2438', pants: '#4a4a5a', boots: '#2a1d2e', scarf: '#e8473b' },
    variants: [
      { id: 'lumi_abyss', name: 'Dusky Bandit', palette: { body: '#6c6a80', belly: '#d8d6e8', accent: '#1a1424', eye: '#0b0b24', shirt: '#2f8f8a', vest: '#5a2a3a', pants: '#2f3450', boots: '#1a1424', scarf: '#ffcf33' } },
      { id: 'lumi_gold', name: 'Golden Bandit', palette: { body: '#c8a878', belly: '#fff2d8', accent: '#3b2a1e', eye: '#2a1a05', shirt: '#ffffff', vest: '#b8862a', pants: '#5a3a22', boots: '#3b2a1e', scarf: '#3f6fb0' } },
    ],
    passive: 'sparkSense',
    cosmeticSlots: ALL_SLOTS,
    unlock: { coins: 900, level: 5 },
    homeBiome: 'crystal',
  },
  ember: {
    id: 'ember',
    name: 'Buck',
    species: 'Bull bronco buster',
    tagline: 'Starts hot, stays hot.',
    bodyPlan: 'bull',
    palette: { body: '#a8522f', belly: '#f2c9a8', accent: '#f6ead2', eye: '#1a0d08', shirt: '#f2d16b', vest: '#3f6fb0', pants: '#6a4a32', boots: '#3b2a1e', scarf: '#ffffff' },
    variants: [
      { id: 'ember_teal', name: 'Ink Buck', palette: { body: '#3a3440', belly: '#b8aec8', accent: '#f6ead2', eye: '#06061e', shirt: '#e8473b', vest: '#1f1a26', pants: '#3a3448', boots: '#1a1424', scarf: '#ffcf33' } },
      { id: 'ember_violet', name: 'Palomino Buck', palette: { body: '#e8c08a', belly: '#fff4e0', accent: '#fffaf0', eye: '#1a0d08', shirt: '#5fb0a0', vest: '#8a4f2a', pants: '#3f6fb0', boots: '#5a3a22', scarf: '#d8343a' } },
    ],
    passive: 'hotStart',
    cosmeticSlots: ALL_SLOTS,
    unlock: { coins: 1500, level: 8 },
    homeBiome: 'canyon',
  },
  hoot: {
    id: 'hoot',
    name: 'Lobo',
    species: 'Wolf sheriff',
    tagline: 'Sees every shortcut twice.',
    bodyPlan: 'wolf',
    palette: { body: '#7f8ba0', belly: '#e9eef5', accent: '#2a2a33', eye: '#1a1424', shirt: '#dfe7f2', vest: '#c9a46a', pants: '#3a4258', boots: '#4a2e1a', scarf: '#3f6fb0' },
    variants: [
      { id: 'hoot_snow', name: 'Arctic Lobo', palette: { body: '#e9eef5', belly: '#ffffff', accent: '#3a4258', eye: '#141a24', shirt: '#3f6fb0', vest: '#f6ead2', pants: '#2f3450', boots: '#3b2a1e', scarf: '#e8473b' } },
      { id: 'hoot_moss', name: 'Timber Lobo', palette: { body: '#8a6a4a', belly: '#e8d8b8', accent: '#2a1d1e', eye: '#141a10', shirt: '#4f9e5a', vest: '#5a3a22', pants: '#4a3a2a', boots: '#2a1d1e', scarf: '#ffcf33' } },
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
