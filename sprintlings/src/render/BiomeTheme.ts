import type { Biome } from '../game/Track';

/** Colour scripts and atmosphere per biome. All colours are original. */
export interface BiomeTheme {
  id: Biome;
  skyTop: string;
  skyHorizon: string;
  skyBottom: string;
  sunColor: string;
  sunIntensity: number;
  hemiSky: string;
  hemiGround: string;
  hemiIntensity: number;
  fogColor: string;
  fogNear: number;
  fogFar: number;
  groundTop: string;
  groundTopAlt: string;
  groundSide: string;
  groundEdge: string;
  abyssColor: string;
  abyssGlow: string;
  hazard: { primary: string; secondary: string; warn: string; danger: string };
  decorPalette: string[];
  particleColor: string;
  /** Night-ish biomes get stars and emissive decor. */
  night: boolean;
  music: { root: number; scale: number[]; tempo: number; mood: 'bright' | 'warm' | 'dreamy' };
}

export const BIOME_THEMES: Record<Biome, BiomeTheme> = {
  forest: {
    id: 'forest',
    skyTop: '#4aa8ff',
    skyHorizon: '#c9ecff',
    skyBottom: '#e9f7d8',
    sunColor: '#fff3d6',
    sunIntensity: 2.4,
    hemiSky: '#bfe3ff',
    hemiGround: '#5c7a3a',
    hemiIntensity: 1.25,
    fogColor: '#cfeadf',
    fogNear: 45,
    fogFar: 160,
    groundTop: '#7cc95a',
    groundTopAlt: '#6db84d',
    groundSide: '#8a5a36',
    groundEdge: '#5a9b3c',
    abyssColor: '#2c6b5a',
    abyssGlow: '#6fe0c0',
    hazard: { primary: '#9b6a3f', secondary: '#f2d16b', warn: '#ffb020', danger: '#ff4d4d' },
    decorPalette: ['#3f8f3a', '#56a843', '#2f7a3a', '#f28fb0', '#ffd166', '#8a5a36'],
    particleColor: '#fff6a8',
    night: false,
    music: { root: 60, scale: [0, 2, 4, 7, 9], tempo: 132, mood: 'bright' },
  },
  canyon: {
    id: 'canyon',
    skyTop: '#ff8a5c',
    skyHorizon: '#ffd39a',
    skyBottom: '#ffe8c4',
    sunColor: '#ffd9a8',
    sunIntensity: 2.7,
    hemiSky: '#ffd0a0',
    hemiGround: '#8a4a2a',
    hemiIntensity: 1.15,
    fogColor: '#f7c99a',
    fogNear: 50,
    fogFar: 170,
    groundTop: '#e3a35f',
    groundTopAlt: '#d69350',
    groundSide: '#a4512e',
    groundEdge: '#c97b42',
    abyssColor: '#6b2a1a',
    abyssGlow: '#ff7a2f',
    hazard: { primary: '#7a3f22', secondary: '#ffe08a', warn: '#ffb020', danger: '#ff3d2e' },
    decorPalette: ['#c0623a', '#d9804a', '#8f3f2a', '#6aa84f', '#f0c070', '#5d3a2a'],
    particleColor: '#ffe2b0',
    night: false,
    music: { root: 57, scale: [0, 3, 5, 7, 10], tempo: 138, mood: 'warm' },
  },
  crystal: {
    id: 'crystal',
    skyTop: '#140c3a',
    skyHorizon: '#5b3fa8',
    skyBottom: '#3a2a7a',
    sunColor: '#c9b8ff',
    sunIntensity: 1.7,
    hemiSky: '#8f7dff',
    hemiGround: '#2b1f5a',
    hemiIntensity: 1.35,
    fogColor: '#3c2d7c',
    fogNear: 40,
    fogFar: 150,
    groundTop: '#6e7de0',
    groundTopAlt: '#6271d1',
    groundSide: '#3b2f7a',
    groundEdge: '#8fb4ff',
    abyssColor: '#1a1046',
    abyssGlow: '#5cf2ff',
    hazard: { primary: '#5a4bb5', secondary: '#7ef2ff', warn: '#ffd24a', danger: '#ff4f9a' },
    decorPalette: ['#7ef2ff', '#b48cff', '#ff8ad8', '#5ab8ff', '#e9e2ff', '#3b2f7a'],
    particleColor: '#9ff7ff',
    night: true,
    music: { root: 62, scale: [0, 2, 3, 7, 9], tempo: 126, mood: 'dreamy' },
  },
};
