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
  // Golden prairie under a big blue sky.
  forest: {
    id: 'forest',
    sky: ['#4fa9f0', '#9fd6f5', '#fbe7b8'],
    sun: '#fff1c2',
    far: '#9cb7cf',
    mid: '#c9a65a',
    near: '#a88a3e',
    decor: ['#ffd23f', '#ff8a3c', '#ffffff', '#e85a5a'],
    cloud: '#ffffff',
    grass: '#c9b24a',
    grassLight: '#ecd77a',
    soil: '#a8683a',
    soilDeep: '#764320',
    outline: '#3a1f10',
    speck: ['#86522c', '#c48a56', '#d9b27a'],
    plank: '#c98a4b',
    plankEdge: '#7a4a24',
    pit: '#3a2010',
    hazard: { metal: '#a8b0ba', wood: '#a8662f', stone: '#a09080', warn: '#ffb020', danger: '#ff3d2e' },
    particle: '#fff1b0',
    night: false,
    music: { root: 60, scale: [0, 2, 4, 7, 9], tempo: 132, mood: 'bright' },
  },
  // Red rock canyon at high noon.
  canyon: {
    id: 'canyon',
    sky: ['#ff9a5a', '#ffc98a', '#ffeccc'],
    sun: '#fff3c0',
    far: '#e3a07a',
    mid: '#c8734a',
    near: '#9a4e30',
    decor: ['#6fae4a', '#ffd166', '#ff7a4a', '#f2e2c4'],
    cloud: '#fff1df',
    grass: '#e9c27a',
    grassLight: '#f8dc9e',
    soil: '#c4603a',
    soilDeep: '#8a3a22',
    outline: '#3a170c',
    speck: ['#a24a2a', '#e08a5a', '#f0b27a'],
    plank: '#b8834f',
    plankEdge: '#6e4428',
    pit: '#4a1c10',
    hazard: { metal: '#c2b8a8', wood: '#9a5e30', stone: '#b07a5a', warn: '#ffcf33', danger: '#ff2e2e' },
    particle: '#ffe2a8',
    night: false,
    music: { root: 57, scale: [0, 3, 5, 7, 10], tempo: 138, mood: 'warm' },
  },
  // Moonlit desert with an old gold mine.
  crystal: {
    id: 'crystal',
    sky: ['#141a3a', '#2f3768', '#6a5a8a'],
    sun: '#f4f0dc',
    far: '#2a2c52',
    mid: '#343a66',
    near: '#262848',
    decor: ['#ffcf5a', '#ff8a5c', '#9fc4ff', '#f2e2c4'],
    cloud: '#8a90c0',
    grass: '#8a8f7a',
    grassLight: '#b8bda2',
    soil: '#5a4a5e',
    soilDeep: '#352a3c',
    outline: '#120c18',
    speck: ['#f2c14e', '#7a6a80', '#4a3c52'],
    plank: '#9a6a40',
    plankEdge: '#5a3a22',
    pit: '#08060f',
    hazard: { metal: '#c8ccd8', wood: '#8a5a32', stone: '#7f7890', warn: '#ffd23f', danger: '#ff3d3d' },
    particle: '#ffe9a8',
    night: true,
    music: { root: 62, scale: [0, 2, 3, 7, 9], tempo: 126, mood: 'dreamy' },
  },
};
