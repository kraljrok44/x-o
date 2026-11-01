// THE GLIDE VAULT - knife catalogue. Original model families and original skin names.
// A collectible is one explicit (model, skin) pair from the compatibility matrix; the total N
// is computed from the data, never written by hand (crate spec 2, 5, 11).

import { CATALOG_VERSION } from './config.js';

export const KNIFE_MODELS = [
  { id: 'ranger', name: 'Ranger', desc: 'Restrained combat knife with a straight spine and grooved grip.' },
  { id: 'lancer', name: 'Lancer', desc: 'Long, even-width military blade with a cross guard.' },
  { id: 'warden', name: 'Warden', desc: 'Heavy tactical blade with a serrated spine and bulky grip.' },
  { id: 'crescent', name: 'Crescent', desc: 'Short hooked claw blade with a finger ring.' },
  { id: 'moth', name: 'Moth', desc: 'Twin slotted handles that swing around the blade.' },
  { id: 'flicker', name: 'Flicker', desc: 'Slim folding blade with a visible pivot.' },
  { id: 'hook', name: 'Hook', desc: 'Wide blade with a gutting notch near the tip.' },
  { id: 'tracker', name: 'Tracker', desc: 'Large clip point outdoor blade with a heavy grip.' },
  { id: 'scimitar', name: 'Scimitar', desc: 'Curved, broad single edge with a compact pommel.' },
  { id: 'cleaver', name: 'Cleaver', desc: 'Massive wide blade, the heaviest of the vault.' },
  { id: 'twin', name: 'Twin Fangs', desc: 'A pair of short push daggers carried together.' },
  { id: 'switch', name: 'Switch', desc: 'Small lightweight folder with a thin blade.' },
  { id: 'needle', name: 'Needle', desc: 'Long, narrow and elegant with a sharp centre line.' },
  { id: 'raptor', name: 'Raptor', desc: 'Curved ringed blade, longer and flatter than the Crescent.' },
  { id: 'grizzly', name: 'Grizzly', desc: 'Compact tactical blade with clean faceted planes.' },
];

// pattern: renderer recipe; colors: palette; seed: deterministic pattern seed
export const KNIFE_SKINS = [
  { id: 'factory', name: 'Factory', group: 'base', pattern: 'brushed', colors: ['#c9ced6', '#8d949e'], seed: 1, metal: 1, rough: 0.32 },

  { id: 'abyss_p1', name: 'Abyss Flow · Phase I', group: 'polish', pattern: 'flow', colors: ['#0b0b2b', '#4a148c', '#d81b60', '#000000'], seed: 11, metal: 1, rough: 0.12, clearcoat: 1 },
  { id: 'abyss_p2', name: 'Abyss Flow · Phase II', group: 'polish', pattern: 'flow', colors: ['#12002a', '#c2185b', '#ff4081', '#1a0033'], seed: 12, metal: 1, rough: 0.12, clearcoat: 1 },
  { id: 'abyss_p3', name: 'Abyss Flow · Phase III', group: 'polish', pattern: 'flow', colors: ['#001a33', '#0277bd', '#26c6da', '#000814'], seed: 13, metal: 1, rough: 0.12, clearcoat: 1 },
  { id: 'abyss_p4', name: 'Abyss Flow · Phase IV', group: 'polish', pattern: 'flow', colors: ['#0a0f3c', '#3949ab', '#7e57c2', '#00b0ff'], seed: 14, metal: 1, rough: 0.12, clearcoat: 1 },
  { id: 'bloodstone', name: 'Bloodstone', group: 'polish', pattern: 'flow', colors: ['#3a0000', '#9b0000', '#ff1744', '#120000'], seed: 15, metal: 1, rough: 0.1, clearcoat: 1 },
  { id: 'deep_cobalt', name: 'Deep Cobalt', group: 'polish', pattern: 'flow', colors: ['#000c3d', '#0039cb', '#448aff', '#00052a'], seed: 16, metal: 1, rough: 0.1, clearcoat: 1 },
  { id: 'obsidian_pearl', name: 'Obsidian Pearl', group: 'polish', pattern: 'flow', colors: ['#050507', '#1b1029', '#3d2b5c', '#5c2a3a'], seed: 17, metal: 1, rough: 0.14, clearcoat: 1 },
  { id: 'jade_flow', name: 'Jade Flow', group: 'polish', pattern: 'flow', colors: ['#001f14', '#00796b', '#00e676', '#c6ff00'], seed: 18, metal: 1, rough: 0.12, clearcoat: 1 },
  { id: 'verdant_core', name: 'Verdant Core', group: 'polish', pattern: 'flow', colors: ['#002611', '#00a152', '#1de9b6', '#003d1f'], seed: 19, metal: 1, rough: 0.1, clearcoat: 1 },
  { id: 'sunset_melt', name: 'Sunset Melt', group: 'polish', pattern: 'gradient', colors: ['#ffe259', '#ffa751', '#f2416a', '#7b2ff7', '#2f80ed'], seed: 20, metal: 0.9, rough: 0.18, clearcoat: 0.8 },
  { id: 'candy_marble', name: 'Candy Marble', group: 'polish', pattern: 'marble', colors: ['#ff1744', '#ff9100', '#ffea00', '#2979ff', '#d500f9'], seed: 21, metal: 0.9, rough: 0.16, clearcoat: 0.8 },
  { id: 'amber_stripe', name: 'Amber Stripe', group: 'polish', pattern: 'stripes', colors: ['#ffb300', '#ff8f00', '#1a1200'], seed: 22, metal: 0.95, rough: 0.2 },

  { id: 'coral_lace', name: 'Coral Lace', group: 'pattern', pattern: 'lace', colors: ['#b71c1c', '#ef5350', '#ffebee'], seed: 31, metal: 0.7, rough: 0.3 },
  { id: 'heat_temper', name: 'Heat Temper', group: 'pattern', pattern: 'temper', colors: ['#1e3a8a', '#7c3aed', '#d4a017', '#8d6e63', '#9ca3af'], seed: 32, metal: 1, rough: 0.22 },
  { id: 'cold_blue', name: 'Cold Blue Steel', group: 'pattern', pattern: 'blued', colors: ['#2b3a55', '#46597a', '#5d4e7a'], seed: 33, metal: 1, rough: 0.28 },
  { id: 'oxide_stain', name: 'Oxide Stain', group: 'pattern', pattern: 'stain', colors: ['#3f51b5', '#7b1fa2', '#795548', '#9e9e9e'], seed: 34, metal: 0.9, rough: 0.35 },
  { id: 'midnight', name: 'Midnight', group: 'pattern', pattern: 'night', colors: ['#0d0f14', '#1c2230', '#2e3648'], seed: 35, metal: 0.8, rough: 0.45 },
  { id: 'damascus', name: 'Folded Damascus', group: 'pattern', pattern: 'damascus', colors: ['#3a3f47', '#9aa3ad', '#d7dde3'], seed: 36, metal: 1, rough: 0.25 },
  { id: 'violet_haze', name: 'Violet Haze', group: 'pattern', pattern: 'violet', colors: ['#120018', '#5b1a8b', '#b04cff'], seed: 37, metal: 0.6, rough: 0.4 },
  { id: 'red_widow', name: 'Red Widow', group: 'pattern', pattern: 'web', colors: ['#7f0000', '#b71c1c', '#0a0000'], seed: 38, metal: 0.6, rough: 0.35 },

  { id: 'pine_camo', name: 'Pine Camo', group: 'camo', pattern: 'camo', colors: ['#3b4a2a', '#6b5b3a', '#1e2416', '#7d8a4e'], seed: 41, metal: 0.3, rough: 0.7 },
  { id: 'pixel_woods', name: 'Pixel Woods', group: 'camo', pattern: 'digital', colors: ['#2f3d24', '#556b2f', '#1b1f14', '#6d5a3b'], seed: 42, metal: 0.3, rough: 0.7 },
  { id: 'concrete_pixel', name: 'Concrete Pixel', group: 'camo', pattern: 'digital', colors: ['#5f6368', '#9aa0a6', '#2b2d30', '#c4c7cc'], seed: 43, metal: 0.3, rough: 0.7 },
  { id: 'char', name: 'Charred', group: 'camo', pattern: 'char', colors: ['#2a2622', '#5a4f45', '#0e0c0a', '#8a7f74'], seed: 44, metal: 0.5, rough: 0.6 },
  { id: 'dune_mesh', name: 'Dune Mesh', group: 'camo', pattern: 'mesh', colors: ['#b8a47e', '#7d7458', '#4b4632'], seed: 45, metal: 0.3, rough: 0.75 },
  { id: 'frost_camo', name: 'Frost Camo', group: 'camo', pattern: 'camo', colors: ['#e8eef3', '#a9bccb', '#5d7486', '#cfdbe5'], seed: 46, metal: 0.3, rough: 0.6 },
  { id: 'rust_bucket', name: 'Rust Bucket', group: 'camo', pattern: 'rust', colors: ['#7a3b16', '#b5541c', '#4a1f0b', '#8d8d8d'], seed: 47, metal: 0.4, rough: 0.85 },
  { id: 'scratched', name: 'Scratched', group: 'camo', pattern: 'scratched', colors: ['#24272c', '#9aa1a9'], seed: 48, metal: 0.8, rough: 0.5 },

  { id: 'gearwork', name: 'Gearwork', group: 'special', pattern: 'gear', colors: ['#8b0000', '#d32f2f', '#c0c0c0', '#1a1a1a'], seed: 51, metal: 0.9, rough: 0.3 },
  { id: 'carbon_laminate', name: 'Carbon Laminate', group: 'special', pattern: 'laminate', colors: ['#0b0b0c', '#26272b', '#3d3f45'], seed: 52, metal: 0.4, rough: 0.35, clearcoat: 1 },
  { id: 'gilded_relic', name: 'Gilded Relic', group: 'special', pattern: 'relic', colors: ['#1d2b1a', '#c9a227', '#f5d76e', '#0e160c'], seed: 53, metal: 1, rough: 0.25 },
  { id: 'sketchbook', name: 'Sketchbook', group: 'special', pattern: 'sketch', colors: ['#f4f1ea', '#1b1b1b', '#e63946', '#457b9d'], seed: 54, metal: 0.2, rough: 0.6 },
];

const G = (g) => KNIFE_SKINS.filter((s) => s.group === g).map((s) => s.id);
const ALL_POLISH = G('polish');
const LIGHT_POLISH = ['sunset_melt', 'candy_marble', 'amber_stripe', 'jade_flow'];

// Explicit compatibility matrix (crate spec 5): not every skin exists on every model.
export const COMPATIBILITY = {
  ranger: ['factory', ...LIGHT_POLISH, ...G('pattern'), ...G('camo'), 'gearwork', 'carbon_laminate', 'sketchbook'],
  lancer: ['factory', ...ALL_POLISH, ...G('pattern'), ...G('camo')],
  warden: ['factory', ...ALL_POLISH, ...G('pattern'), ...G('camo'), 'gearwork'],
  crescent: ['factory', ...ALL_POLISH, ...G('pattern'), ...G('camo'), ...G('special')],
  moth: ['factory', ...ALL_POLISH, ...G('pattern'), ...G('camo'), 'gilded_relic', 'sketchbook'],
  flicker: ['factory', ...ALL_POLISH, ...G('pattern'), ...G('camo'), 'gilded_relic', 'gearwork', 'carbon_laminate'],
  hook: ['factory', ...ALL_POLISH, ...G('pattern'), ...G('camo'), 'gearwork'],
  tracker: ['factory', ...ALL_POLISH, ...G('pattern'), ...G('camo')],
  scimitar: ['factory', ...ALL_POLISH, ...G('pattern'), ...G('camo')],
  cleaver: ['factory', ...ALL_POLISH, ...G('pattern'), ...G('camo')],
  twin: ['factory', ...ALL_POLISH, ...G('pattern'), ...G('camo')],
  switch: ['factory', ...LIGHT_POLISH, ...G('pattern'), ...G('camo')],
  needle: ['factory', ...ALL_POLISH, ...G('pattern'), ...G('camo'), 'carbon_laminate'],
  raptor: ['factory', ...ALL_POLISH, ...G('pattern'), ...G('camo'), 'gilded_relic'],
  grizzly: ['factory', ...LIGHT_POLISH, ...G('pattern'), ...G('camo'), 'gearwork'],
};

export const COLLECTIBLES = [];
for (const m of KNIFE_MODELS) {
  const seen = new Set();
  for (const sid of COMPATIBILITY[m.id]) {
    if (seen.has(sid)) continue;
    seen.add(sid);
    const skin = KNIFE_SKINS.find((s) => s.id === sid);
    if (!skin) throw new Error('Unknown skin in matrix: ' + sid);
    COLLECTIBLES.push({
      collectible_id: `${m.id}__${sid}`,
      model_id: m.id,
      skin_id: sid,
      display_name: `${m.name} | ${skin.name}`,
      enabled: true,
      compatibility_version: CATALOG_VERSION,
    });
  }
}

export const COLLECTIBLE_INDEX = new Map(COLLECTIBLES.map((c, i) => [c.collectible_id, i]));
export const CATALOG_TOTAL = COLLECTIBLES.filter((c) => c.enabled).length;
export const DEFAULT_KNIFE = 'ranger__factory'; // everyone starts with this one (not counted as owned)

export function getCollectible(id) {
  const i = COLLECTIBLE_INDEX.get(id);
  return i === undefined ? null : COLLECTIBLES[i];
}
export function getModel(id) { return KNIFE_MODELS.find((m) => m.id === id) || null; }
export function getSkin(id) { return KNIFE_SKINS.find((s) => s.id === id) || null; }
