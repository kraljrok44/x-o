import { GameplayConfig, laneToLateral } from '../config/GameplayConfig';
import { ABILITIES, AbilityTuning, ITEM_WEIGHTS_BY_POSITION, type AbilityId } from './AbilityDefinition';
import { findSeekerTarget } from './ProjectileSystem';
import { laneBit } from '../obstacles/ObstacleBase';
import { laneOfLateral } from '../game/Track';
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
    case 'seeker': {
      const s = b.s + AbilityTuning.seeker.spawnAhead;
      const g = sim.track.groundAt(s, b.lateral) ?? b.y;
      sim.entities.push({
        kind: 'seeker',
        id: sim.nextEntityId++,
        owner: racer.index,
        target: findSeekerTarget(sim, racer.index),
        s,
        lateral: b.lateral,
        y: g + AbilityTuning.seeker.height,
        age: 0,
        alive: true,
      });
      break;
    }
    case 'snare': {
      const lane = laneOfLateral(b.lateral);
      const s = b.s - AbilityTuning.snare.offsetBehind;
      const g = sim.track.groundAtLane(s, lane);
      if (g === null) return 'invalid';
      sim.entities.push({ kind: 'snare', id: sim.nextEntityId++, owner: racer.index, s, lane, y: g, ttl: ABILITIES.snare.duration, alive: true });
      break;
    }
    case 'sap': {
      const lane = laneOfLateral(b.lateral);
      const s1 = b.s - AbilityTuning.sap.offsetBehind;
      if (sim.track.groundAtLane(s1, lane) === null) return 'invalid';
      let lanes = laneBit(lane);
      if (lane > -1) lanes |= laneBit(lane - 1);
      if (lane < 1) lanes |= laneBit(lane + 1);
      sim.entities.push({
        kind: 'sap',
        id: sim.nextEntityId++,
        owner: racer.index,
        s0: s1 - AbilityTuning.sap.length,
        s1,
        lanes,
        ttl: ABILITIES.sap.duration,
        alive: true,
      });
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
  const r2 = GameplayConfig.itemBox.pickupRadius;
  for (const racer of sim.racers) {
    if (racer.item || racer.body.phase !== 'run') continue;
    const b = racer.body;
    for (let i = 0; i < boxes.length; i++) {
      const box = boxes[i];
      if (Math.abs(box.s - b.s) > r2) continue;
      if (sim.itemBoxReadyAt[i] > sim.time) continue;
      if (Math.abs(laneToLateral(box.lane) - b.lateral) > r2) continue;
      const g = sim.track.groundAtLane(box.s, box.lane) ?? 0;
      const by = g + box.lift;
      if (b.y > by + 0.6 || b.y + GameplayConfig.hitbox.height < by - 0.6) continue;
      sim.itemBoxReadyAt[i] = sim.time + GameplayConfig.itemBox.respawnSeconds;
      racer.item = rollItem(sim, sim.placeOf(racer.index));
      racer.stats.itemBoxes++;
      sim.emit('itemPickup', racer.index, i, b);
      break;
    }
  }
}
