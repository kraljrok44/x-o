import * as THREE from 'three';
import type { CharacterId } from '../player/CharacterDefinition';
import { COSMETIC_BY_ID } from '../shop/CosmeticCatalog';
import { createCharacter, paletteFor } from './CharacterFactory';
import { applyCosmetics } from './CosmeticFactory';
import type { GameRenderer } from './GameRenderer';

/**
 * Renders small portraits of critters and cosmetics into data URLs for the
 * DOM UI, using an off-screen render target on the shared WebGL context.
 */
export class ThumbnailRenderer {
  private readonly scene = new THREE.Scene();
  private readonly camera = new THREE.PerspectiveCamera(30, 1, 0.1, 50);
  private readonly target: THREE.WebGLRenderTarget;
  private readonly cache = new Map<string, string>();
  private readonly size = 160;
  private readonly pixels: Uint8Array;
  private readonly canvas = document.createElement('canvas');

  constructor(private readonly gr: GameRenderer) {
    this.target = new THREE.WebGLRenderTarget(this.size, this.size, { samples: 4 });
    this.target.texture.colorSpace = THREE.SRGBColorSpace;
    this.pixels = new Uint8Array(this.size * this.size * 4);
    this.canvas.width = this.canvas.height = this.size;
    this.scene.add(new THREE.HemisphereLight('#ffffff', '#8a7aa8', 2.2));
    const sun = new THREE.DirectionalLight('#ffffff', 2.2);
    sun.position.set(2, 4, 3);
    this.scene.add(sun);
  }

  portrait(characterId: CharacterId, variantId: string | null = null, cosmetics: Record<string, string> = {}, closeUp = false): string {
    const key = `p|${characterId}|${variantId}|${JSON.stringify(cosmetics)}|${closeUp}`;
    const hit = this.cache.get(key);
    if (hit) return hit;
    const rig = createCharacter(characterId, paletteFor(characterId, variantId));
    applyCosmetics(rig, cosmetics);
    rig.root.rotation.y = 0.5;
    rig.armR.rotation.z = 0.4;
    this.scene.add(rig.root);
    if (closeUp) {
      this.camera.position.set(0.9, 1.25, -2.4);
      this.camera.lookAt(0, 1.0, 0);
    } else {
      this.camera.position.set(1.5, 1.2, -3.6);
      this.camera.lookAt(0, 0.68, 0);
    }
    const url = this.capture();
    this.scene.remove(rig.root);
    this.cache.set(key, url);
    return url;
  }

  /** Thumbnail for a cosmetic: shown on Moss (or the item's own character for colours). */
  item(itemId: string): string {
    const def = COSMETIC_BY_ID[itemId];
    if (!def) return '';
    if (def.slot === 'variant' && def.characterId) return this.portrait(def.characterId as CharacterId, def.id);
    if (def.slot === 'trail' || def.slot === 'emote') return '';
    return this.portrait('moss', null, { [def.slot]: itemId }, true);
  }

  private capture(): string {
    const r = this.gr.renderer;
    const prevTarget = r.getRenderTarget();
    const prevClear = r.getClearColor(new THREE.Color());
    const prevAlpha = r.getClearAlpha();
    r.setRenderTarget(this.target);
    r.setClearColor(0x000000, 0);
    r.clear();
    r.render(this.scene, this.camera);
    r.readRenderTargetPixels(this.target, 0, 0, this.size, this.size, this.pixels);
    r.setRenderTarget(prevTarget);
    r.setClearColor(prevClear, prevAlpha);
    const ctx = this.canvas.getContext('2d')!;
    const img = ctx.createImageData(this.size, this.size);
    // Flip vertically (GL origin is bottom-left).
    for (let y = 0; y < this.size; y++) {
      const src = (this.size - 1 - y) * this.size * 4;
      img.data.set(this.pixels.subarray(src, src + this.size * 4), y * this.size * 4);
    }
    ctx.putImageData(img, 0, 0);
    return this.canvas.toDataURL('image/png');
  }
}
