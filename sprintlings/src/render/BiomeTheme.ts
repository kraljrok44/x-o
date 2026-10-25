import type { Biome } from '../game/Track';

/** Side-view colour scripts per biome. All colours and motifs are original. */
export interface BiomeTheme {
  id: Biome;
  sky: [string, string, string];
  sun: string;
  /** Far, mid and near parallax silhouettes (back to front). */
  far: string;
  mid: string;
  near: string;
  /** Accent colours for decorations on the near layer (flowers, crystals...). */
  decor: string[];
  cloud: string;
  /** Terrain: grass cap, its highlight, soil, deep soil, outline. */
  grass: string;
  grassLight: string;
  soil: string;
  soilDeep: string;
  outline: string;
  /** Pebbles/roots/gems sprinkled in the soil. */
  speck: string[];
  /** One-way platform planks. */
  plank: string;
  plankEdge: string;
  /** Pit glow at the bottom of the screen. */
  pit: string;
  hazard: { metal: string; wood: string; stone: string; warn: string; danger: string };
  particle: string;
  night: boolean;
  music: { root: number; scale: number[]; tempo: number; mood: 'bright' | 'warm' | 'dreamy' };
}

export const BIOME_THEMES: Record<Biome, BiomeTheme> = {
  forest: {
    id: 'forest',
    sky: ['#53b6ff', '#a9e0ff', '#e8f9e0'],
    sun: '#fff4c9',
    far: '#9fd3c9',
    mid: '#6bbf7a',
    near: '#3f9a4f',
    decor: ['#ff8fb8', '#fff1a8', '#ffffff', '#ffb35c'],
    cloud: '#ffffff',
    grass: '#6fd04f',
    grassLight: '#a6ec6c',
    soil: '#9a6338',
    soilDeep: '#6e4224',
    outline: '#3b2a1e',
    speck: ['#7d4f2c', '#b98552', '#c9a27a'],
    plank: '#c98a4b',
    plankEdge: '#8a5a2e',
    pit: '#244a3d',
    hazard: { metal: '#a9b4c2', wood: '#a8703e', stone: '#9aa0a8', warn: '#ffb020', danger: '#ff4d4d' },
    particle: '#fff6a8',
    night: false,
    music: { root: 60, scale: [0, 2, 4, 7, 9], tempo: 132, mood: 'bright' },
  },
  canyon: {
    id: 'canyon',
    sky: ['#ff8a5c', '#ffc78a', '#ffe9c4'],
    sun: '#fff0b8',
    far: '#e7a07a',
    mid: '#d27a4f',
    near: '#a9553a',
    decor: ['#6fbf5a', '#ffd166', '#ff7a4a', '#f2e2c4'],
    cloud: '#fff1df',
    grass: '#e8b86a',
    grassLight: '#f7d98f',
    soil: '#c7663d',
    soilDeep: '#8e3f27',
    outline: '#4a2216',
    speck: ['#a84c2c', '#e08a5a', '#f0b27a'],
    plank: '#b8834f',
    plankEdge: '#7a5230',
    pit: '#5a2418',
    hazard: { metal: '#c2b8a8', wood: '#9a6a3a', stone: '#b07a5a', warn: '#ffcf33', danger: '#ff3d3d' },
    particle: '#ffe2a8',
    night: false,
    music: { root: 57, scale: [0, 3, 5, 7, 10], tempo: 138, mood: 'warm' },
  },
  crystal: {
    id: 'crystal',
    sky: ['#1d1650', '#4b2f8f', '#9b6bd6'],
    sun: '#e8f4ff',
    far: '#3d2f7a',
    mid: '#4f3c98',
    near: '#2f2466',
    decor: ['#7ef2ff', '#ff8fe0', '#b8a2ff', '#fff38a'],
    cloud: '#b8a8ff',
    grass: '#58d6c8',
    grassLight: '#9cf6ea',
    soil: '#5a4aa8',
    soilDeep: '#3a2f78',
    outline: '#160f36',
    speck: ['#7ef2ff', '#ff8fe0', '#4a3c90'],
    plank: '#8f7bd6',
    plankEdge: '#5a4aa8',
    pit: '#0d0a2a',
    hazard: { metal: '#c8d4ff', wood: '#7a5ab8', stone: '#7f78b8', warn: '#ffd23f', danger: '#ff4fa0' },
    particle: '#b8f6ff',
    night: true,
    music: { root: 62, scale: [0, 2, 3, 7, 9], tempo: 126, mood: 'dreamy' },
  },
};
