import { CHARACTERS, type CharacterId } from '../player/CharacterDefinition';
import { COSMETIC_BY_ID } from '../shop/CosmeticCatalog';
import { cosmeticLayers, paletteFor } from './Cosmetics2D';
import type { GameRenderer } from './GameRenderer';
import { drawMonster, makeAnchors, neutralPose, planSpec } from './MonsterRig';

/** Renders monster and cosmetic portraits into cached data URLs for the DOM UI. */
export class ThumbnailRenderer {
  private readonly cache = new Map<string, string>();
  private readonly size = 192;
  private readonly canvas = document.createElement('canvas');

  constructor(_gr?: GameRenderer) {
    this.canvas.width = this.canvas.height = this.size;
  }

  portrait(characterId: CharacterId, variantId: string | null = null, cosmetics: Record<string, string> = {}, closeUp = false): string {
    const key = `p|${characterId}|${variantId}|${JSON.stringify(cosmetics)}|${closeUp}`;
    const hit = this.cache.get(key);
    if (hit) return hit;
    const def = CHARACTERS[characterId];
    const ctx = this.canvas.getContext('2d')!;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, this.size, this.size);
    const spec = planSpec(def.bodyPlan);
    const height = spec.cy + spec.ry + (cosmetics.hat ? 0.55 : 0.3);
    const scale = closeUp ? this.size / 1.35 : this.size / Math.max(1.45, height + 0.15);
    const pose = neutralPose();
    pose.facing = 1;
    pose.mouth = 'happy';
    pose.blush = 0.7;
    pose.lookX = 0;
    pose.armNear = 0.5;
    pose.armFar = 0.5;
    ctx.translate(this.size / 2, closeUp ? this.size * 1.05 : this.size - (this.size - height * scale) / 2 - 4);
    ctx.scale(scale, -scale);
    if (closeUp) ctx.translate(0, -0.35);
    drawMonster(ctx, def.bodyPlan, paletteFor(def.palette, def.variants, variantId), pose, { flat: false, shadow: !closeUp, shadowDrop: 0 }, cosmeticLayers(cosmetics), makeAnchors());
    const url = this.canvas.toDataURL('image/png');
    this.cache.set(key, url);
    return url;
  }

  /** Thumbnail for a cosmetic: shown on Bloop (or the item's own character for colours). */
  item(itemId: string): string {
    const def = COSMETIC_BY_ID[itemId];
    if (!def) return '';
    if (def.slot === 'variant' && def.characterId) return this.portrait(def.characterId as CharacterId, def.id);
    if (def.slot === 'trail' || def.slot === 'emote') return '';
    return this.portrait('moss', null, { [def.slot]: itemId }, def.slot !== 'back');
  }
}
