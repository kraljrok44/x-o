// GLIDEZONE map catalogue. All maps are original layouts built from data (no third party geometry).
// Each entry: metadata (spec 12.1) + visual theme + stage specs. Maps are built lazily and cached.

import { buildLinearMap } from './builder.js';
import { PHYSICS_VERSION } from '../config.js';

const R = (len, o = {}) => ({ len, ...o });
const ST = 30000; // distance between stage areas of staged maps
// ramp profiles per map (w = slope width, d = depth); *C variants catch riders after a 90° corner
const AW = { w: 500, d: 680 }, AC = { w: 580, d: 800 };
const FW = { w: 460, d: 640 }, FC = { w: 540, d: 760 };
const JW = { w: 450, d: 630 }, JC = { w: 540, d: 760 };
const NW = { w: 410, d: 600 }, NC = { w: 520, d: 760 };
const EW = { w: 440, d: 620 }, EC = { w: 540, d: 780 };
const VW = { w: 345, d: 550, pitch: 11 }, VC = { w: 480, d: 720, pitch: 11 }, VN = { w: 300, d: 540, pitch: 11 };
const K = { w: 330, d: 540 }, KC = { w: 480, d: 720 }, KN = { w: 290, d: 520 };

const DEFS = [
  {
    id: 'surf_aurora_dawn',
    layout: 'staged',
    par: 67, // par time in seconds (1000 points)
    display_name: 'Aurora Dawn (T1)',
    difficulty: 1, category: 'Tier 1',
    description: 'Wide, forgiving ramps under a pastel sunrise: your first 90° corner, a big window and a gentle speed check.',
    theme: {
      sky: ['#1b1e4b', '#f08a7e', '#ffd6a5'], sun: [0.4, -0.6, 0.35], sunColor: '#ffe2c0',
      fog: '#f4a99a', fogDensity: 0.000032, ramp: ['#ff8fab', '#ffb38a', '#a0c4ff'], edge: '#fff1d6',
      platform: '#3d3466', wall: '#2a2350', landing: '#4f3f86', decor: 'pillars', stars: false, accent: '#ffd166',
    },
    stages: [
      { heading: 0, ramps: [R(2600, { ...AW, sides: 'right', turn: 20 }), R(2600, { ...AW, sides: 'right', turn: -25 }), R(2600, { ...AW, sides: 'right', corner: 90 }), R(2800, { ...AC, sides: 'left', turn: 15 }), R(2600, { ...AW, sides: 'left', turn: -20 })] },
      { heading: 0, ramps: [R(2600, { ...AW, turn: -25 }), R(2600, { ...AW, turn: 15 }), R(2600, { ...AW, turn: -20, jump: { pads: 2 } }), R(2600, { ...AW, turn: 20, window: { w: 380, h: 280 } }), R(2600, { ...AW, turn: -30 })] },
      { heading: 0, ramps: [R(2600, { ...AW, sides: 'left', turn: 25 }), R(2600, { ...AW, sides: 'left', turn: -15, ring: true }), R(2600, { ...AW, sides: 'left', corner: -90 }), R(2800, { ...AC, sides: 'right', turn: -15 }), R(2600, { ...AW, sides: 'right', turn: 20 })] },
      { heading: 0, ramps: [R(2600, { ...AW, turn: -20 }), R(2600, { ...AW, turn: 20, jump: { pads: 2 } }), R(2600, { ...AW, turn: -30, speedcheck: { min: 900 } }), R(2600, { ...AW, turn: 25 }), R(2600, { ...AW, turn: -15 })] },
      { heading: 0, ramps: [R(2600, { ...AW, turn: 30 }), R(2600, { ...AW, turn: -25, window: { w: 380, h: 280 } }), R(2600, { ...AW, turn: 15, cave: true }), R(2600, { ...AW, turn: -20, ring: true, cave: true }), R(2600, { ...AW, turn: 20, cave: true })] },
    ],
  },
  {
    id: 'surf_frostbyte',
    layout: 'linear',
    par: 84, // par time in seconds (1000 points)
    display_name: 'Frostbyte (T1)',
    difficulty: 1, category: 'Tier 1',
    description: 'Ice-cut curves over a frozen abyss: one-sided walls, 90° corners and a window to thread.',
    theme: {
      sky: ['#06142e', '#2a6f97', '#a9def9'], sun: [-0.3, -0.5, 0.5], sunColor: '#e0fbfc',
      fog: '#9fd3e8', fogDensity: 0.00003, ramp: ['#bde0fe', '#90e0ef', '#caf0f8'], edge: '#ffffff',
      platform: '#1d3557', wall: '#14213d', landing: '#274c77', decor: 'crystals', stars: true, accent: '#48cae4',
    },
    stages: [
      { heading: 0, ramps: [R(2800, { ...FW, sides: 'right', turn: 40 }), R(2600, { ...FW, sides: 'right', turn: -30, corner: 90 }), R(3000, { ...FC, sides: 'left', turn: 25 }), R(2600, { ...FW, sides: 'left', turn: -35 })] },
      { heading: 0, ramps: [R(2800, { ...FW, turn: 45, cave: true }), R(2600, { ...FW, turn: -40, jump: { pads: 2 }, cave: true }), R(3000, { ...FW, turn: 25, window: { w: 360, h: 260 } }), R(2600, { ...FW, turn: -30, cave: true })] },
      { heading: 0, ramps: [R(2800, { ...FW, sides: 'left', turn: 40 }), R(2600, { ...FW, sides: 'left', turn: -20, corner: -90 }), R(3000, { ...FC, sides: 'right', turn: -30 }), R(2600, { ...FW, sides: 'right', turn: 35, ring: true })] },
      { heading: 0, ramps: [R(2800, { ...FW, turn: 45 }), R(2600, { ...FW, turn: -40, speedcheck: { min: 950 } }), R(3000, { ...FW, turn: 25, jump: { pads: 2 } }), R(2600, { ...FW, turn: -30 })] },
      { heading: 0, ramps: [R(2800, { ...FW, sides: 'right', turn: 40 }), R(2600, { ...FW, sides: 'right', turn: -30, corner: 90 }), R(3000, { ...FC, sides: 'left', turn: 30, corner: -90 }), R(2600, { ...FC, sides: 'right', turn: -25 })] },
    ],
  },
  {
    id: 'surf_jade_sanctum',
    layout: 'linear',
    par: 81, // par time in seconds (1000 points)
    display_name: 'Jade Sanctum (T2)',
    difficulty: 2, category: 'Tier 2',
    description: 'Long arcs through a floating temple: a glass corridor, a deep drop, speed checks and corners.',
    theme: {
      sky: ['#0b2e1f', '#3a7d44', '#e9f5db'], sun: [0.5, 0.3, 0.45], sunColor: '#fff3b0',
      fog: '#b5d6a7', fogDensity: 0.000028, ramp: ['#52b788', '#d4a373', '#95d5b2'], edge: '#ffe8a3',
      platform: '#2d3a1f', wall: '#1f2a14', landing: '#40531f', decor: 'lanterns', stars: false, accent: '#e9c46a',
    },
    stages: [
      { heading: 0, ramps: [R(3400, { ...JW, sides: 'left', turn: 60 }), R(3000, { ...JW, sides: 'left', turn: -30, corner: -90 }), R(2800, { ...JC, sides: 'right', turn: -20, jump: { pads: 2 } }), R(3200, { ...JW, sides: 'right', turn: -50 }), R(2600, { ...JW, sides: 'right', turn: 70 })] },
      { heading: 0, ramps: [R(3400, { ...JW, turn: -55, cave: true }), R(3000, { ...JW, turn: 60, ring: true, cave: true }), R(2800, { ...JW, sides: 'left', turn: -45, cave: true }), R(3200, { w: 340, d: 600, sides: 'left', turn: 40, corridor: { h: 200 } }), R(2600, { ...JW, sides: 'left', turn: -50 })] },
      { heading: 0, ramps: [R(3400, { ...JW, turn: 50, drop: 900, gap: 260 }), R(4000, { w: 480, d: 760, turn: -30 }), R(2800, { ...JW, turn: 45, speedcheck: { min: 1050 } }), R(3200, { ...JW, turn: -50, window: { w: 330, h: 240 } }), R(2600, { ...JW, turn: 45 })] },
      { heading: 0, ramps: [R(3400, { ...JW, sides: 'right', turn: -50 }), R(3000, { ...JW, sides: 'right', turn: 20, corner: 90 }), R(2800, { ...JC, sides: 'left', turn: -30, ring: true }), R(3200, { ...JW, sides: 'left', turn: 60 }), R(2600, { ...JW, sides: 'left', turn: -45 })] },
      { heading: 0, ramps: [R(3400, { ...JW, turn: 45 }), R(3000, { ...JW, turn: -50, window: { w: 330, h: 240 } }), R(2800, { ...JW, turn: 70 }), R(3200, { ...JW, turn: -55, jump: { pads: 2 } }), R(2600, { ...JW, turn: 60, speedcheck: { min: 1100 } }), R(2600, { ...JW, turn: -40 })] },
    ],
  },
  {
    id: 'surf_neon_drift',
    layout: 'staged',
    par: 72, // par time in seconds (1000 points)
    display_name: 'Neon Drift (T2)',
    difficulty: 2, category: 'Tier 2',
    description: 'Synthwave grid highway: windows, a double corner, a drop and speed checks between flow rings.',
    theme: {
      sky: ['#0d0221', '#541388', '#ff4f9a'], sun: [0, -0.8, 0.25], sunColor: '#ff9ecd',
      fog: '#3c0f5c', fogDensity: 0.000035, ramp: ['#2b2d6e', '#3a0ca3', '#240046'], edge: '#00f5ff',
      platform: '#14072b', wall: '#1d0b3d', landing: '#26104f', decor: 'grid', stars: true, accent: '#ff2a6d', neon: true,
    },
    stages: [
      { heading: 0, ramps: [R(2800, { ...NW, turn: 30, ring: true }), R(2600, { ...NW, turn: -40, jump: { pads: 2 } }), R(2800, { ...NW, turn: 35, window: { w: 320, h: 240 } }), R(2700, { ...NW, turn: -25 })] },
      { heading: 0, ramps: [R(2800, { ...NW, sides: 'right', turn: 45 }), R(2600, { ...NW, sides: 'right', turn: -35, corner: 90 }), R(2800, { ...NC, sides: 'left', turn: 30, corner: -90 }), R(2700, { ...NC, sides: 'right', turn: -30 })] },
      { heading: 0, ramps: [R(2800, { ...NW, turn: 35, drop: 850, gap: 240 }), R(3800, { w: 460, d: 740, turn: -25 }), R(2800, { ...NW, turn: 45, speedcheck: { min: 1100 } }), R(2700, { ...NW, turn: -35 })] },
      { heading: 0, ramps: [R(2800, { ...NW, turn: 30 }), R(2600, { ...NW, turn: -40, window: { w: 320, h: 240 } }), R(2800, { ...NW, turn: 35, jump: { pads: 2 } }), R(2700, { ...NW, turn: -25 })] },
      { heading: 0, ramps: [R(2800, { ...NW, sides: 'left', turn: 45 }), R(2600, { ...NW, sides: 'left', turn: -35, corner: -90 }), R(2800, { ...NC, sides: 'right', turn: -30 }), R(2700, { ...NW, sides: 'right', turn: 35, speedcheck: { min: 1050 } }), R(2700, { ...NW, sides: 'right', turn: -40 })] },
      { heading: 0, ramps: [R(2800, { ...NW, turn: 35, ring: true }), R(2600, { ...NW, turn: -25, window: { w: 320, h: 240 } }), R(2800, { ...NW, turn: 45, jump: { pads: 2 } }), R(2700, { ...NW, turn: -35 })] },
    ],
  },
  {
    id: 'surf_ember_core',
    layout: 'linear',
    par: 85, // par time in seconds (1000 points)
    display_name: 'Ember Core (T2)',
    difficulty: 2, category: 'Tier 2',
    description: 'One-sided basalt walls above lava: forced side switches, a drop, a tight corridor and a speed check.',
    theme: {
      sky: ['#1a0500', '#6a040f', '#f48c06'], sun: [0.2, 0.7, 0.3], sunColor: '#ffba08',
      fog: '#7a1c04', fogDensity: 0.00004, ramp: ['#8a3a22', '#a8442a', '#c0532b'], edge: '#ffba08',
      platform: '#3a2419', wall: '#2a1a12', landing: '#4a2c1c', decor: 'rocks', stars: false, accent: '#ff5400', lava: true,
    },
    stages: [
      { heading: 0, ramps: [R(2900, { ...EW, sides: 'left', turn: 25 }), R(2800, { ...EW, sides: 'left', turn: -35, jump: { pads: 2 } }), R(3000, { ...EW, sides: 'left', turn: 30, corner: -90 }), R(2800, { ...EC, sides: 'right', turn: -40 })] },
      { heading: 0, ramps: [R(2900, { ...EW, sides: 'left', turn: 30 }), R(2800, { ...EW, sides: 'right', turn: -40 }), R(3000, { ...EW, sides: 'right', turn: 20, corner: 90 }), R(2800, { ...EC, sides: 'left', turn: -30 })] },
      { heading: 0, ramps: [R(2900, { ...EW, sides: 'right', turn: 25, ring: true }), R(2800, { ...EW, sides: 'right', turn: -35, speedcheck: { min: 1150 } }), R(3000, { w: 340, d: 600, sides: 'right', turn: 30, corridor: { h: 190 } }), R(2800, { ...EW, sides: 'right', turn: -40 })] },
      { heading: 0, ramps: [R(2900, { ...EW, sides: 'left', turn: 20, cave: true }), R(2800, { ...EW, sides: 'left', turn: -30, jump: { pads: 2 }, cave: true }), R(3000, { ...EW, sides: 'left', turn: 25, window: { w: 320, h: 230 } }), R(2800, { ...EW, sides: 'left', turn: -35, cave: true })] },
      { heading: 0, ramps: [R(2900, { ...EW, sides: 'right', turn: 30 }), R(2800, { ...EW, sides: 'right', turn: -20, corner: 90 }), R(3000, { ...EC, sides: 'left', turn: 20, corner: -90 }), R(2800, { ...EC, sides: 'right', turn: -30 })] },
    ],
  },
  {
    id: 'surf_void_garden',
    layout: 'staged',
    par: 88, // par time in seconds (1000 points)
    display_name: 'Void Garden (T3)',
    difficulty: 3, category: 'Tier 3',
    description: 'Narrow ramps through deep space: glass corridors, corners, small windows and strict speed checks.',
    theme: {
      sky: ['#000005', '#10002b', '#5a189a'], sun: [-0.5, 0.4, 0.4], sunColor: '#e0aaff',
      fog: '#10002b', fogDensity: 0.000022, ramp: ['#7b2cbf', '#3c096c', '#c77dff'], edge: '#e0aaff',
      platform: '#10002b', wall: '#0a0018', landing: '#240046', decor: 'asteroids', stars: true, accent: '#c77dff', neon: true,
    },
    stages: [
      { heading: 0, ramps: [R(2600, { ...VW, turn: 40 }), R(2600, { ...VW, turn: -50, jump: { pads: 2 } }), R(2600, { ...VW, turn: 35, speedcheck: { min: 1100 } }), R(2600, { ...VW, turn: -45 })] },
      { heading: 0, ramps: [R(2600, { ...VW, sides: 'right', turn: 55 }), R(2600, { ...VW, sides: 'right', turn: -20, corner: 90 }), R(2600, { ...VC, sides: 'left', turn: 40 }), R(2600, { ...VN, sides: 'left', turn: -50, corridor: { h: 160 } })] },
      { heading: 0, ramps: [R(2600, { ...VW, turn: 35, jump: { pads: 2 } }), R(2600, { ...VW, turn: -45, window: { w: 280, h: 210 } }), R(2600, { ...VW, turn: 55 }), R(2600, { ...VW, turn: -40, speedcheck: { min: 1150 } }), R(2600, { ...VW, turn: 30 })] },
      { heading: 0, ramps: [R(2600, { ...VW, sides: 'left', turn: 40 }), R(2600, { ...VW, sides: 'left', turn: -30, corner: -90 }), R(2600, { ...VC, sides: 'right', turn: -35, corner: 90 }), R(2600, { ...VC, sides: 'left', turn: -45 })] },
      { heading: 0, ramps: [R(2600, { ...VW, turn: 55, drop: 850, gap: 240 }), R(3800, { w: 440, d: 720, pitch: 11, turn: -40 }), R(2600, { ...VW, turn: 40, jump: { pads: 2 } }), R(2600, { ...VW, turn: -50 })] },
      { heading: 0, ramps: [R(2600, { ...VW, sides: 'right', turn: 35, ring: true }), R(2600, { ...VN, sides: 'right', turn: -45, corridor: { h: 160 } }), R(2600, { ...VW, sides: 'right', turn: 55, speedcheck: { min: 1150 } }), R(2600, { ...VW, sides: 'right', turn: -40 })] },
    ],
  },
  {
    id: 'surf_skyforge',
    layout: 'linear',
    par: 170, // par time in seconds (1000 points)
    display_name: 'Skyforge Gauntlet (T3)',
    difficulty: 3, category: 'Tier 3',
    description: 'One long run through a sky foundry with every obstacle: corners, side switches, corridors, drops, windows and speed checks.',
    theme: {
      sky: ['#0c1424', '#3a4a6b', '#e8b86a'], sun: [-0.6, -0.3, 0.3], sunColor: '#ffd08a',
      fog: '#5b5f78', fogDensity: 0.00003, ramp: ['#c27b3a', '#8f9bb3', '#d9a441'], edge: '#ffcf70',
      platform: '#2b3245', wall: '#1d2333', landing: '#39425c', decor: 'pillars', stars: false, accent: '#ff9d2e',
    },
    stages: [
      { heading: 0, ramps: [R(2600, { ...K, sides: 'left', turn: 50 }), R(2600, { ...K, sides: 'left', turn: -70, jump: { pads: 2 } }), R(2600, { ...K, sides: 'right', turn: 45 }), R(2600, { ...K, sides: 'right', turn: -20, corner: 90 }), R(2600, { ...KC, sides: 'left', turn: 30 })] },
      { heading: 0, ramps: [R(2600, { ...K, turn: 75, ring: true, cave: true }), R(2600, { ...K, sides: 'left', turn: -55, cave: true }), R(2600, { ...K, sides: 'right', turn: 40, speedcheck: { min: 1150 } }), R(2600, { ...K, sides: 'right', turn: -65 })] },
      { heading: 0, ramps: [R(2600, { ...K, sides: 'left', turn: 50 }), R(2600, { ...KN, sides: 'left', turn: -40, corridor: { h: 170 } }), R(2600, { ...K, sides: 'left', turn: -30, jump: { pads: 2 } }), R(2600, { ...K, sides: 'left', turn: 20, corner: -90 }), R(2600, { ...KC, sides: 'right', turn: -30 })] },
      { heading: 0, ramps: [R(2600, { ...K, turn: 75, drop: 900, gap: 240 }), R(3800, { w: 420, d: 700, turn: -55 }), R(2600, { ...K, turn: 40, window: { w: 280, h: 220 } }), R(2600, { ...K, turn: -65 })] },
      { heading: 0, ramps: [R(2600, { ...K, sides: 'right', turn: 50 }), R(2600, { ...K, sides: 'right', turn: -30, corner: 90 }), R(2600, { ...KC, sides: 'left', turn: 25, corner: -90 }), R(2600, { ...KC, sides: 'right', turn: -30 })] },
      { heading: 0, ramps: [R(2600, { ...K, turn: 75, cave: true }), R(2600, { ...K, sides: 'left', turn: -55, ring: true, cave: true }), R(2600, { ...K, sides: 'right', turn: 40, jump: { pads: 2 } }), R(2600, { ...K, sides: 'right', turn: -65, speedcheck: { min: 1150 } }), R(2600, { ...K, sides: 'right', turn: 30 })] },
      { heading: 0, ramps: [R(2600, { ...K, turn: 75 }), R(2600, { ...K, turn: -55, jump: { pads: 2 } }), R(2600, { ...K, turn: 40, speedcheck: { min: 1150 } }), R(2600, { ...K, turn: -65, cave: true })] },
      { heading: 0, ramps: [R(2600, { ...K, sides: 'left', turn: 50 }), R(2600, { ...KN, sides: 'left', turn: -70, corridor: { h: 170 } }), R(2600, { ...K, sides: 'right', turn: 45, window: { w: 280, h: 220 } }), R(2600, { ...K, sides: 'right', turn: -60 })] },
      { heading: 0, ramps: [R(2600, { ...K, sides: 'left', turn: 50, ring: true }), R(2600, { ...K, sides: 'left', turn: -30, corner: -90 }), R(2600, { ...KC, sides: 'right', turn: 45 }), R(2600, { ...K, sides: 'right', turn: -60, drop: 850, gap: 240 }), R(3800, { w: 420, d: 700, sides: 'right', turn: 30, cave: true })] },
      { heading: 0, ramps: [R(2600, { ...K, turn: 75, cave: true }), R(2600, { ...K, sides: 'left', turn: -55, window: { w: 280, h: 220 } }), R(2600, { ...K, sides: 'right', turn: 40 }), R(2600, { ...K, sides: 'right', turn: -65, jump: { pads: 2 } }), R(2600, { ...K, sides: 'right', turn: 20 })] },
      { heading: 0, ramps: [R(2600, { ...K, sides: 'right', turn: 50 }), R(2600, { ...K, sides: 'right', turn: -20, corner: 90 }), R(2600, { ...KC, sides: 'left', turn: 45 }), R(2600, { ...K, sides: 'left', turn: -40 }), R(2600, { ...K, sides: 'left', turn: 30, speedcheck: { min: 1100 } }), R(2600, { ...K, sides: 'left', turn: -30 })] },
    ],
  },
];

const cache = new Map();

export const MAP_LIST = DEFS.map((d) => ({
  id: d.id,
  display_name: d.display_name,
  difficulty: d.difficulty,
  category: d.category,
  description: d.description,
  stages: d.stages.length,
  layout: d.layout || 'staged',
  par: d.par,
  theme: d.theme,
}));

export function getMap(id) {
  if (cache.has(id)) return cache.get(id);
  const def = DEFS.find((d) => d.id === id);
  if (!def) throw new Error('Unknown map ' + id);
  const meta = {
    unique_id: def.id,
    id: def.id,
    display_name: def.display_name,
    author: 'GLIDEZONE team (original layout)',
    version: '2.0',
    physics_profile: PHYSICS_VERSION,
    difficulty: def.difficulty,
    category: def.category,
    description: def.description,
    recommended_fov: 100,
    licensing_notes: 'Original procedural geometry, no third party assets.',
    theme: def.theme,
    layout: def.layout || 'staged',
  };
  const specs = def.stages.map((s, k) => ({ ...s, origin: [0, k * ST, 0] }));
  const map = buildLinearMap(meta, specs, def.layout === 'linear');
  cache.set(id, map);
  return map;
}

export function isMapId(id) {
  return DEFS.some((d) => d.id === id);
}
