import { GameplayConfig } from '../config/GameplayConfig';
import { CHARACTERS, SPECIALS, type SpecialId } from '../player/CharacterDefinition';
import type { RaceSimulation } from '../game/RaceManager';
import type { Racer } from '../game/RaceState';
import { applyHit } from './StatusEffectSystem';
import { ITEM_LIFETIME } from './AbilityDefinition';

export const SPECIAL_IDS: readonly SpecialId[] = ['quickDash', 'doubleHop', 'ironHide', 'pickpocket', 'stampede', 'howl'];

export const SpecialTuning = {
  quickDash: { duration: 0.9 },
  doubleHop: { velocity: 0.85 },
  ironHide: { duration: 2.5 },
  pickpocket: { range: 8 },
  stampede: { duration: 1.2, stun: 0.6 },
  howl: { range: 10, duration: 1.5, factor: 0.7 },
} as const;

export function specialOf(racer: Racer): SpecialId {
  return CHARACTERS[racer.characterId].special;
}

/** Whether the special would do anything right now (AI and HUD use this too). */
export function specialReady(sim: RaceSimulation, racer: Racer): boolean {
  const b = racer.body;
  if (racer.specialCooldown > 0 || b.phase !== 'run') return false;
  switch (specialOf(racer)) {
    case 'quickDash':
    case 'stampede':
      return b.stun <= 0;
    case 'doubleHop':
      return b.stun <= 0 && !b.grounded && b.airHop;
    case 'ironHide':
      return b.shield <= 0;
    case 'pickpocket':
      return racer.item === null && pickpocketTarget(sim, racer) >= 0;
    case 'howl':
      return true;
  }
}

function pickpocketTarget(sim: RaceSimulation, racer: Racer): number {
  const me = racer.body;
  let best = -1;
  let bestD: number = SpecialTuning.pickpocket.range;
  for (const r of sim.racers) {
    if (r.item === null || sim.sameTeam(r.index, racer.index) || r.body.phase !== 'run') continue;
    const d = Math.hypot(r.body.x - me.x, r.body.y - me.y);
    if (d < bestD) {
      bestD = d;
      best = r.index;
    }
  }
  return best;
}

/** Fires the animal special. Uses that would do nothing never start the cooldown. */
export function trySpecial(sim: RaceSimulation, racer: Racer): boolean {
  if (!specialReady(sim, racer)) return false;
  const b = racer.body;
  const id = specialOf(racer);
  switch (id) {
    case 'quickDash':
      b.dash = Math.max(b.dash, SpecialTuning.quickDash.duration);
      break;
    case 'doubleHop':
      b.vy = GameplayConfig.jump.velocity * SpecialTuning.doubleHop.velocity;
      b.airHop = false;
      b.jumping = true;
      b.jumpAge = 0;
      b.cutPending = false;
      break;
    case 'ironHide':
      b.shield = SpecialTuning.ironHide.duration;
      break;
    case 'pickpocket': {
      const victim = sim.racers[pickpocketTarget(sim, racer)];
      racer.item = victim.item;
      racer.itemTime = ITEM_LIFETIME;
      victim.item = null;
      sim.emitAt('abilityHit', victim.index, racer.index, victim.body.x, victim.body.y);
      sim.events[sim.events.length - 1].special = id;
      break;
    }
    case 'stampede':
      b.dash = Math.max(b.dash, SpecialTuning.stampede.duration);
      b.stampede = SpecialTuning.stampede.duration;
      break;
    case 'howl':
      for (const r of sim.racers) {
        if (sim.sameTeam(r.index, racer.index) || r.body.phase !== 'run') continue;
        if (Math.hypot(r.body.x - b.x, r.body.y - b.y) > SpecialTuning.howl.range) continue;
        if (r.body.shield > 0) continue;
        r.body.slow = SpecialTuning.howl.duration;
      }
      break;
  }
  racer.specialCooldown = SPECIALS[id].cooldown;
  sim.emit('special', racer.index, SPECIAL_IDS.indexOf(id), b);
  return true;
}

/** Bulls on a stampede knock over every rival they run into. */
export function stepStampedes(sim: RaceSimulation): void {
  for (const racer of sim.racers) {
    const b = racer.body;
    if (b.stampede <= 0 || b.phase !== 'run' || b.stun > 0) continue;
    for (const r of sim.racers) {
      if (sim.sameTeam(r.index, racer.index) || r.body.phase !== 'run') continue;
      if (Math.abs(r.body.x - b.x) > 0.75 || Math.abs(r.body.y - b.y) > 1.1) continue;
      const outcome = applyHit(r.body, r.mods, 330000 + racer.index, SpecialTuning.stampede.stun, false);
      if (outcome === 'stunned') {
        sim.emitAt('abilityHit', r.index, racer.index, r.body.x, r.body.y);
        sim.events[sim.events.length - 1].special = 'stampede';
      } else if (outcome === 'blocked') sim.emit('shieldBlock', r.index, 0, r.body);
    }
  }
}
