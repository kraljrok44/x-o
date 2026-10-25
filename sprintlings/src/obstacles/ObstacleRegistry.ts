import type { HazardKind } from './ObstacleBase';

export type HazardResponse = 'jump' | 'switchLane' | 'timing' | 'jumpOrSwitch' | 'none';

export interface ObstacleInfo {
  kind: HazardKind;
  /** How a racer is expected to beat it; used by the validator and tutorial hints. */
  response: HazardResponse;
  /** Consequence when it hits. */
  effect: 'stumble' | 'bonk' | 'slow' | 'slide' | 'boost' | 'launch';
  /** Visual warning the renderer shows before the racer reaches it. */
  telegraph: string;
  /** Per-biome display name. */
  names: { forest: string; canyon: string; crystal: string };
}

export const OBSTACLES: Record<HazardKind, ObstacleInfo> = {
  hurdle: {
    kind: 'hurdle',
    response: 'jumpOrSwitch',
    effect: 'stumble',
    telegraph: 'Bright striped top edge',
    names: { forest: 'Fallen log', canyon: 'Rock ridge', crystal: 'Shard fence' },
  },
  wall: {
    kind: 'wall',
    response: 'switchLane',
    effect: 'bonk',
    telegraph: 'Tall block with red-white chevrons, visible from far',
    names: { forest: 'Root gate', canyon: 'Sandstone pillar', crystal: 'Crystal monolith' },
  },
  spikes: {
    kind: 'spikes',
    response: 'jumpOrSwitch',
    effect: 'stumble',
    telegraph: 'Ground glows and rumbles before spikes rise',
    names: { forest: 'Thorn patch', canyon: 'Cactus spikes', crystal: 'Shard bloom' },
  },
  flame: {
    kind: 'flame',
    response: 'timing',
    effect: 'stumble',
    telegraph: 'Vent sputters sparks before erupting',
    names: { forest: 'Spore geyser', canyon: 'Fire vent', crystal: 'Arc pylon' },
  },
  pendulum: {
    kind: 'pendulum',
    response: 'timing',
    effect: 'stumble',
    telegraph: 'Shadow sweeps across the lanes',
    names: { forest: 'Swinging acorn', canyon: 'Boulder swing', crystal: 'Prism pendulum' },
  },
  boulder: {
    kind: 'boulder',
    response: 'jumpOrSwitch',
    effect: 'stumble',
    telegraph: 'Dust trail and rumble ahead',
    names: { forest: 'Rolling seedpod', canyon: 'Tumbling boulder', crystal: 'Rolling geode' },
  },
  mud: {
    kind: 'mud',
    response: 'jumpOrSwitch',
    effect: 'slow',
    telegraph: 'Dark glossy patch with bubbles',
    names: { forest: 'Bog mud', canyon: 'Quicksand', crystal: 'Glow goo' },
  },
  ice: {
    kind: 'ice',
    response: 'none',
    effect: 'slide',
    telegraph: 'Shiny pale surface',
    names: { forest: 'Dew slick', canyon: 'Glass sand', crystal: 'Frost glaze' },
  },
  boostPad: {
    kind: 'boostPad',
    response: 'none',
    effect: 'boost',
    telegraph: 'Animated arrows',
    names: { forest: 'Wind leaf', canyon: 'Gust vent', crystal: 'Light rail' },
  },
  bouncePad: {
    kind: 'bouncePad',
    response: 'none',
    effect: 'launch',
    telegraph: 'Springy pad that pulses',
    names: { forest: 'Bounce shroom', canyon: 'Steam spout', crystal: 'Jelly crystal' },
  },
};
