import { GameplayConfig } from '../config/GameplayConfig';
import { ABILITIES, AbilityTuning, ITEM_WEIGHTS_BY_POSITION, type AbilityId } from './AbilityDefinition';
import { findSeekerTarget } from './ProjectileSystem';
import type { RaceSimulation } from '../game/RaceManager';
import type { Racer } from '../game/RaceState';

export type UseResult = 'used' | 'noItem' | 'cooldown' | 'invalid';

/**
 * Fires the racer's held ability if the current situation allows it.
 * Invalid uses never consume the charge (design doc section 5).
 */
export function tryUseAbility(sim: RaceSimulation, racer: Racer): UseResult {
  const item = racer.item;
  if (!item) return 'noItem';
  if (racer.abilityCooldown > 0) return 'cooldown';
  const b = racer.body;
  if (b.phase !== 'run') return 'invalid';
  if ((item === 'dash' || item === 'seeker') && b.stun > 0) return 'invalid';

  switch (item) {
    case 'dash':
      b.dash = ABILITIES.dash.duration * racer.mods.dashDurationScale;
      break;
    case 'shield':
      b.shield = ABILITIES.shield.duration;
      break;
    case 'seeker':
      sim.entities.push({
        kind: 'seeker',
        id: sim.nextEntityId++,
        owner: racer.index,
        target: findSeekerTarget(sim, racer.index),
        x: b.x + AbilityTuning.seeker.spawnAhead,
        y: b.y + AbilityTuning.seeker.height,
        vy: 0,
        age: 0,
        alive: true,
      });
      break;
    case 'snare': {
      const x = b.x - AbilityTuning.snare.offsetBehind;
      const g = sim.track.groundBelow(x, b.y + 0.4, -1, true);
      if (Number.isNaN(g) || b.y - g > 1.5) return 'invalid';
      sim.entities.push({ kind: 'snare', id: sim.nextEntityId++, owner: racer.index, x, y: g, ttl: ABILITIES.snare.duration, alive: true });
      break;
    }
    case 'sap': {
      const x1 = b.x - AbilityTuning.sap.offsetBehind;
      const g = sim.track.groundBelow(x1, b.y + 0.4, -1, true);
      if (Number.isNaN(g) || b.y - g > 1.5) return 'invalid';
      sim.entities.push({ kind: 'sap', id: sim.nextEntityId++, owner: racer.index, x0: x1 - AbilityTuning.sap.length, x1, y: g, ttl: ABILITIES.sap.duration, alive: true });
      break;
    }
  }
  racer.item = null;
  racer.abilityCooldown = ABILITIES[item].cooldown;
  racer.stats.abilitiesUsed++;
  sim.emitAbility(racer.index, item);
  return 'used';
}

/** Rolls a Rune Box ability for the racer at standings position `place` (0 = leader). */
export function rollItem(sim: RaceSimulation, place: number): AbilityId {
  const table = ITEM_WEIGHTS_BY_POSITION[Math.min(place, ITEM_WEIGHTS_BY_POSITION.length - 1)];
  return sim.rng.weighted(table);
}

/** Handles Rune Box pickups for every racer this tick. */
export function collectItemBoxes(sim: RaceSimulation): void {
  const boxes = sim.track.data.itemBoxes;
  const r = GameplayConfig.itemBox.pickupRadius;
  for (const racer of sim.racers) {
    if (racer.item || racer.body.phase !== 'run') continue;
    const b = racer.body;
    for (let i = 0; i < boxes.length; i++) {
      const box = boxes[i];
      if (Math.abs(box.x - b.x) > r) continue;
      if (sim.itemBoxReadyAt[i] > sim.time) continue;
      if (box.y < b.y - 0.4 || box.y > b.y + GameplayConfig.hitbox.height + 0.4) continue;
      sim.itemBoxReadyAt[i] = sim.time + GameplayConfig.itemBox.respawnSeconds;
      racer.item = rollItem(sim, sim.placeOf(racer.index));
      racer.stats.itemBoxes++;
      sim.emit('itemPickup', racer.index, i, b);
      break;
    }
  }
}
