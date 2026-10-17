// GLIDEZONE map catalogue. All maps are original layouts built from data (no third party geometry).
// Each entry: metadata (spec 12.1) + visual theme + stage specs. Maps are built lazily and cached.

import { buildLinearMap } from './builder.js';
import { PHYSICS_VERSION } from '../config.js';

const R = (len, o = {}) => ({ len, ...o });
const ST = 18000; // distance between stage areas

const DEFS = [
  {
    id: 'surf_aurora_dawn',
    par: 32, // par time in seconds (1000 points)
    display_name: 'Aurora Dawn',
    difficulty: 1, category: 'Beginner',
    description: 'Wide, forgiving ramps under a pastel sunrise. Learn to hold the ramp.',
    theme: {
      sky: ['#1b1e4b', '#f08a7e', '#ffd6a5'], sun: [0.4, -0.6, 0.35], sunColor: '#ffe2c0',
      fog: '#f4a99a', fogDensity: 0.000032, ramp: ['#ff8fab', '#ffb38a', '#a0c4ff'], edge: '#fff1d6',
      platform: '#3d3466', wall: '#2a2350', landing: '#4f3f86', decor: 'pillars', stars: false, accent: '#ffd166',
    },
    stages: [
      { heading: 0, ramps: [R(2600, { w: 500, d: 680, turn: 15 }), R(2600, { w: 500, d: 680, turn: -25 }), R(2800, { w: 500, d: 680, turn: 10 })] },
      { heading: 0, ramps: [R(2600, { w: 500, d: 680, turn: 30, jump: { pads: 2 } }), R(2600, { w: 500, d: 680, turn: -35 }), R(2600, { w: 500, d: 680, turn: 15 })] },
      { heading: 0, ramps: [R(3000, { w: 480, d: 660, turn: -20 }), R(2600, { w: 480, d: 660, turn: 30, ring: true }), R(2800, { w: 480, d: 660, turn: -15, ring: true })] },
    ],
  },
  {
    id: 'surf_frostbyte',
    par: 35, // par time in seconds (1000 points)
    display_name: 'Frostbyte',
    difficulty: 2, category: 'Easy',
    description: 'Ice-cut curves over a frozen abyss. Follow the bend, keep your line.',
    theme: {
      sky: ['#06142e', '#2a6f97', '#a9def9'], sun: [-0.3, -0.5, 0.5], sunColor: '#e0fbfc',
      fog: '#9fd3e8', fogDensity: 0.00003, ramp: ['#bde0fe', '#90e0ef', '#caf0f8'], edge: '#ffffff',
      platform: '#1d3557', wall: '#14213d', landing: '#274c77', decor: 'crystals', stars: true, accent: '#48cae4',
    },
    stages: [
      { heading: 0, ramps: [R(2800, { w: 460, d: 640, turn: 45 }), R(2800, { w: 460, d: 640, turn: -55, jump: { pads: 2 } }), R(2600, { w: 460, d: 640, turn: 20 })] },
      { heading: 0, ramps: [R(3000, { w: 450, d: 640, turn: -55 }), R(2400, { w: 450, d: 640, turn: 25 }), R(3000, { w: 450, d: 640, turn: 50 })] },
      { heading: 0, ramps: [R(2600, { w: 440, d: 620, turn: 35, ring: true }), R(2600, { w: 440, d: 620, turn: 35, jump: { pads: 3 } }), R(2600, { w: 440, d: 620, turn: -70 }), R(2400, { w: 440, d: 620, turn: 20 })] },
    ],
  },
  {
    id: 'surf_jade_sanctum',
    par: 33, // par time in seconds (1000 points)
    display_name: 'Jade Sanctum',
    difficulty: 2, category: 'Easy',
    description: 'Long sweeping arcs through a floating temple garden.',
    theme: {
      sky: ['#0b2e1f', '#3a7d44', '#e9f5db'], sun: [0.5, 0.3, 0.45], sunColor: '#fff3b0',
      fog: '#b5d6a7', fogDensity: 0.000028, ramp: ['#52b788', '#d4a373', '#95d5b2'], edge: '#ffe8a3',
      platform: '#2d3a1f', wall: '#1f2a14', landing: '#40531f', decor: 'lanterns', stars: false, accent: '#e9c46a',
    },
    stages: [
      { heading: 0, ramps: [R(3600, { w: 460, d: 640, turn: 70 }), R(3600, { w: 460, d: 640, turn: -80 })] },
      { heading: 0, ramps: [R(3200, { w: 450, d: 630, turn: -60, ring: true, jump: { pads: 2 } }), R(3200, { w: 450, d: 630, turn: 65 }), R(2400, { w: 450, d: 630, turn: -20 })] },
      { heading: 0, ramps: [R(4000, { w: 440, d: 620, turn: 90 }), R(2600, { w: 440, d: 620, turn: -45, ring: true }), R(2600, { w: 440, d: 620, turn: -45 })] },
    ],
  },
  {
    id: 'surf_neon_drift',
    par: 45, // par time in seconds (1000 points)
    display_name: 'Neon Drift',
    difficulty: 3, category: 'Medium',
    description: 'Synthwave grid highway with flow rings and offset transitions.',
    theme: {
      sky: ['#0d0221', '#541388', '#ff4f9a'], sun: [0, -0.8, 0.25], sunColor: '#ff9ecd',
      fog: '#3c0f5c', fogDensity: 0.000035, ramp: ['#2b2d6e', '#3a0ca3', '#240046'], edge: '#00f5ff',
      platform: '#14072b', wall: '#1d0b3d', landing: '#26104f', decor: 'grid', stars: true, accent: '#ff2a6d', neon: true,
    },
    stages: [
      { heading: 0, ramps: [R(2600, { w: 420, d: 600, turn: 25, ring: true }), R(2600, { w: 420, d: 600, turn: -35, gap: 380, ring: true, jump: { pads: 3 } }), R(2600, { w: 420, d: 600, turn: 15 })] },
      { heading: 0, ramps: [R(2600, { w: 410, d: 600, turn: 40, shift: 60 }), R(2600, { w: 410, d: 600, turn: -45, shift: -60, ring: true }), R(2800, { w: 410, d: 600, turn: 20 })] },
      { heading: 0, ramps: [R(2400, { w: 400, d: 590, gap: 420, turn: -25 }), R(2400, { w: 400, d: 590, gap: 420, ring: true, turn: 35, jump: { pads: 2 } }), R(2400, { w: 400, d: 590, gap: 420, turn: -30 }), R(2400, { w: 400, d: 590, turn: 15 })] },
      { heading: 0, ramps: [R(3000, { w: 400, d: 590, turn: -55, ring: true }), R(3000, { w: 400, d: 590, turn: 60, ring: true }), R(2600, { w: 400, d: 590, turn: -15 })] },
    ],
  },
  {
    id: 'surf_ember_core',
    par: 47, // par time in seconds (1000 points)
    display_name: 'Ember Core',
    difficulty: 3, category: 'Medium',
    description: 'One-sided basalt walls above a molten core. Pick your side and commit.',
    theme: {
      sky: ['#1a0500', '#6a040f', '#f48c06'], sun: [0.2, 0.7, 0.3], sunColor: '#ffba08',
      fog: '#7a1c04', fogDensity: 0.00004, ramp: ['#8a3a22', '#a8442a', '#c0532b'], edge: '#ffba08',
      platform: '#3a2419', wall: '#2a1a12', landing: '#4a2c1c', decor: 'rocks', stars: false, accent: '#ff5400', lava: true,
    },
    stages: [
      { heading: 0, ramps: [R(2800, { w: 460, d: 640, sides: 'left', turn: 20 }), R(2800, { w: 460, d: 640, sides: 'left', turn: -30, jump: { pads: 2 } }), R(2800, { w: 460, d: 640, sides: 'left', turn: 15 })] },
      { heading: 0, ramps: [R(2800, { w: 450, d: 630, sides: 'right', turn: -40 }), R(2800, { w: 450, d: 630, sides: 'right', turn: 40, ring: true }), R(2600, { w: 450, d: 630, sides: 'right', turn: -20 })] },
      { heading: 0, ramps: [R(2600, { w: 430, d: 620, turn: 25 }), R(2600, { w: 430, d: 620, gap: 400, turn: -35, jump: { pads: 3 } }), R(2600, { w: 430, d: 620, gap: 400, ring: true, turn: 30 }), R(2600, { w: 430, d: 620, turn: -15 })] },
      { heading: 0, ramps: [R(3000, { w: 420, d: 610, sides: 'left', turn: 50 }), R(3000, { w: 420, d: 610, sides: 'left', turn: -50 }), R(2800, { w: 420, d: 610, sides: 'left', ring: true, turn: 20 })] },
    ],
  },
  {
    id: 'surf_void_garden',
    par: 62, // par time in seconds (1000 points)
    display_name: 'Void Garden',
    difficulty: 4, category: 'Hard',
    description: 'Narrow ramps drifting through deep space. Shallow descents, long gaps, no mercy.',
    theme: {
      sky: ['#000005', '#10002b', '#5a189a'], sun: [-0.5, 0.4, 0.4], sunColor: '#e0aaff',
      fog: '#10002b', fogDensity: 0.000022, ramp: ['#7b2cbf', '#3c096c', '#c77dff'], edge: '#e0aaff',
      platform: '#10002b', wall: '#0a0018', landing: '#240046', decor: 'asteroids', stars: true, accent: '#c77dff', neon: true,
    },
    stages: [
      { heading: 0, ramps: [R(2600, { w: 360, d: 560, pitch: 11, gap: 420, turn: 30 }), R(2600, { w: 360, d: 560, pitch: 11, gap: 440, turn: -40, jump: { pads: 3 } }), R(2600, { w: 360, d: 560, pitch: 11, turn: 20 })] },
      { heading: 0, ramps: [R(2800, { w: 350, d: 550, pitch: 11, turn: 60 }), R(2800, { w: 350, d: 550, pitch: 11, turn: -65, gap: 420 }), R(2600, { w: 350, d: 550, pitch: 11, turn: 25 })] },
      { heading: 0, ramps: [R(2400, { w: 340, d: 540, pitch: 12, sides: 'left', turn: -30, jump: { pads: 2 } }), R(2400, { w: 340, d: 540, pitch: 12, sides: 'left', gap: 420, ring: true, turn: 35 }), R(2400, { w: 340, d: 540, pitch: 12, sides: 'left', turn: -20 })] },
      { heading: 0, ramps: [R(2600, { w: 340, d: 540, pitch: 11, turn: -70, shift: 80 }), R(2600, { w: 340, d: 540, pitch: 11, turn: 70, shift: -80, gap: 400 }), R(2600, { w: 340, d: 540, pitch: 11, turn: -20 })] },
      { heading: 0, ramps: [R(2400, { w: 330, d: 530, pitch: 12, gap: 450, turn: 25 }), R(2400, { w: 330, d: 530, pitch: 12, gap: 450, ring: true, turn: -35, jump: { pads: 3 } }), R(2400, { w: 330, d: 530, pitch: 12, gap: 450, ring: true, turn: 30 }), R(2400, { w: 330, d: 530, pitch: 12, turn: -15 })] },
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
    version: '1.0',
    physics_profile: PHYSICS_VERSION,
    difficulty: def.difficulty,
    category: def.category,
    description: def.description,
    recommended_fov: 100,
    licensing_notes: 'Original procedural geometry, no third party assets.',
    theme: def.theme,
  };
  const specs = def.stages.map((s, k) => ({ ...s, origin: [0, k * ST, 0] }));
  const map = buildLinearMap(meta, specs);
  cache.set(id, map);
  return map;
}

export function isMapId(id) {
  return DEFS.some((d) => d.id === id);
}
