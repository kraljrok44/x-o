import { CHARACTERS, type CharacterId } from '../player/CharacterDefinition';
import { COSMETIC_BY_ID } from '../shop/CosmeticCatalog';
import { cosmeticLayers, paletteFor } from './Cosmetics2D';
import type { GameRenderer } from './GameRenderer';
import { drawMonster, makeAnchors, monsterHeight, neutralPose } from './CharacterRig';

/** Renders monster and cosmetic portraits into cached data URLs for the DOM UI. */
export class ThumbnailRenderer {
  private readonly cache = new Map<string, string>();
  private readonly size = 192;
  private readonly canvas = document.createElement('canvas');

  constructor(_gr?: GameRenderer) {
    this.canvas.width = this.canvas.height = this.size;
  }

  portrait(characterId: CharacterId, variantId: string | null = null, cosmetics: Record<string, string> = {}, closeUp = false, sideOn = false): string {
    const key = `p|${characterId}|${variantId}|${JSON.stringify(cosmetics)}|${closeUp}|${sideOn}`;
    const hit = this.cache.get(key);
    if (hit) return hit;
    const def = CHARACTERS[characterId];
    const ctx = this.canvas.getContext('2d')!;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, this.size, this.size);
    const height = monsterHeight(def.bodyPlan) + (cosmetics.hat ? 0.3 : 0.1);
    const scale = closeUp ? this.size / 0.95 : this.size / Math.max(1.45, height + 0.15);
    const pose = neutralPose();
    // Side-on shows what is worn on the back.
    pose.facing = sideOn ? 0 : 1;
    if (sideOn) pose.lookX = 0.6;
    pose.mouth = 'happy';
    pose.blush = 0.7;
    pose.lookX = 0;
    pose.armNear = 0.5;
    pose.armFar = 0.5;
    if (sideOn) {
      // Zoom on the torso so the back item fills the card.
      const z = this.size / 1.35;
      ctx.translate(this.size * 0.56, this.size * 0.5);
      ctx.scale(z, -z);
      ctx.translate(0, -0.78);
    } else {
      ctx.translate(this.size / 2, closeUp ? this.size * 1.05 : this.size - (this.size - height * scale) / 2 - 4);
      ctx.scale(scale, -scale);
      if (closeUp) ctx.translate(0, -0.62);
    }
    drawMonster(ctx, def.bodyPlan, paletteFor(def.palette, def.variants, variantId), pose, { flat: false, shadow: !closeUp && !sideOn, shadowDrop: 0 }, cosmeticLayers(cosmetics), makeAnchors());
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
    if (def.slot === 'back') return this.portrait('moss', null, { back: itemId }, false, true);
    return this.portrait('moss', null, { [def.slot]: itemId }, true);
  }
}
