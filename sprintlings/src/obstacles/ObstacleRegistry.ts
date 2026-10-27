import type { HazardKind } from './ObstacleBase';

export type HazardResponse = 'jump' | 'slide' | 'timing' | 'route' | 'none';

export interface ObstacleInfo {
  kind: HazardKind;
  /** How a racer is expected to beat it; used by the validator and tutorial hints. */
  response: HazardResponse;
  /** Consequence when it hits. */
  effect: 'stumble' | 'slow' | 'boost' | 'launch';
  /** Visual warning the renderer shows before the racer reaches it. */
  telegraph: string;
  names: { forest: string; canyon: string; crystal: string };
}

export const OBSTACLES: Record<HazardKind, ObstacleInfo> = {
  log: { kind: 'log', response: 'jump', effect: 'stumble', telegraph: 'Bright top edge', names: { forest: 'Mossy log', canyon: 'Cactus stump', crystal: 'Crystal shard' } },
  spikes: { kind: 'spikes', response: 'jump', effect: 'stumble', telegraph: 'Red-tipped spikes', names: { forest: 'Thorn bush', canyon: 'Bone spikes', crystal: 'Shard spikes' } },
  saw: { kind: 'saw', response: 'jump', effect: 'stumble', telegraph: 'Spinning blade with motion blur', names: { forest: 'Buzz wheel', canyon: 'Rust saw', crystal: 'Prism disc' } },
  crusher: { kind: 'crusher', response: 'timing', effect: 'stumble', telegraph: 'Shakes and drops dust before slamming', names: { forest: 'Stomp log', canyon: 'Stone smasher', crystal: 'Crystal press' } },
  flame: { kind: 'flame', response: 'timing', effect: 'stumble', telegraph: 'Vent sputters sparks before erupting', names: { forest: 'Spore geyser', canyon: 'Fire vent', crystal: 'Arc pylon' } },
  pendulum: { kind: 'pendulum', response: 'timing', effect: 'stumble', telegraph: 'Chain swings from above', names: { forest: 'Spiky seedpod', canyon: 'Boulder swing', crystal: 'Prism mace' } },
  boulder: { kind: 'boulder', response: 'jump', effect: 'stumble', telegraph: 'Rumble and dust trail', names: { forest: 'Rolling coconut', canyon: 'Tumbling boulder', crystal: 'Rolling geode' } },
  mud: { kind: 'mud', response: 'route', effect: 'slow', telegraph: 'Dark glossy patch with bubbles', names: { forest: 'Bog mud', canyon: 'Quicksand', crystal: 'Glow goo' } },
  boostPad: { kind: 'boostPad', response: 'none', effect: 'boost', telegraph: 'Animated arrows', names: { forest: 'Wind leaf', canyon: 'Gust vent', crystal: 'Light rail' } },
  beam: { kind: 'beam', response: 'slide', effect: 'stumble', telegraph: 'Low hanging sign with a down arrow', names: { forest: 'Low sign', canyon: 'Mine beam', crystal: 'Low beam' } },
  spring: { kind: 'spring', response: 'none', effect: 'launch', telegraph: 'Bouncy pad that pulses', names: { forest: 'Bounce shroom', canyon: 'Steam spring', crystal: 'Jelly crystal' } },
};
