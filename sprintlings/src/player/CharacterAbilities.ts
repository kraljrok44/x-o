import { CHARACTERS, type CharacterId } from './CharacterDefinition';

/** Numeric modifiers a passive applies inside the simulation. 1 = no change. */
export interface PassiveModifiers {
  obstacleStunScale: number;
  fallGravityScaleWhileHolding: number;
  terrainEffectScale: number;
  incomingSeekerHomingScale: number;
  dashDurationScale: number;
  outgoingSeekerHomingScale: number;
}

const NEUTRAL: PassiveModifiers = {
  obstacleStunScale: 1,
  fallGravityScaleWhileHolding: 1,
  terrainEffectScale: 1,
  incomingSeekerHomingScale: 1,
  dashDurationScale: 1,
  outgoingSeekerHomingScale: 1,
};

export function passiveModifiers(characterId: CharacterId): PassiveModifiers {
  const m = { ...NEUTRAL };
  switch (CHARACTERS[characterId].passive) {
    case 'toughQuills':
      m.obstacleStunScale = 0.85;
      break;
    case 'floaty':
      m.fallGravityScaleWhileHolding = 0.85;
      break;
    case 'steadyFeet':
      m.terrainEffectScale = 0.65;
      break;
    case 'sparkSense':
      m.incomingSeekerHomingScale = 0.6;
      break;
    case 'hotStart':
      m.dashDurationScale = 1.2;
      break;
    case 'keenEyes':
      m.outgoingSeekerHomingScale = 1.3;
      break;
  }
  return m;
}
