import * as THREE from 'three';
import type { CharacterId } from '../player/CharacterDefinition';
import { BiomeEnvironment } from './BiomeEnvironment';
import { createCharacter, paletteFor, type CharacterRig } from './CharacterFactory';
import { animateCosmetics, applyCosmetics } from './CosmeticFactory';
import type { GameRenderer } from './GameRenderer';
import { PlayerAnimator } from './PlayerAnimation';
import { toon } from './Materials';
import type { Biome } from '../game/Track';

export interface ShowcaseLoadout {
  characterId: CharacterId;
  variantId: string | null;
  cosmetics: Record<string, string>;
}

/** Menu backdrop: a floating stage with the player's critter on show. */
export class MenuScene {
  readonly scene = new THREE.Scene();
  readonly camera: THREE.PerspectiveCamera;
  private env: BiomeEnvironment;
  private rig: CharacterRig | null = null;
  private animator: PlayerAnimator | null = null;
  private parts: THREE.Object3D[] = [];
  private readonly stage = new THREE.Group();
  private readonly holder = new THREE.Group();
  private time = 0;
  private emoteTime = 0;
  private dragYaw = 0;
  private yawVel = 0;
  private biome: Biome;
  private key = '';
  /** Horizontal offset of the critter, so UI panels can sit beside it. */
  offsetX = 0;

  constructor(
    private readonly gr: GameRenderer,
    biome: Biome = 'forest',
  ) {
    this.biome = biome;
    this.camera = new THREE.PerspectiveCamera(40, gr.aspect, 0.1, 900);
    this.env = new BiomeEnvironment(null, null, gr.quality === 'high' ? 'medium' : gr.quality, biome);
    this.env.applyFog(this.scene);
    this.scene.add(this.env.group);
    this.buildStage();
    this.scene.add(this.stage);
    this.stage.add(this.holder);
    this.resize();
  }

  setBiome(biome: Biome): void {
    if (biome === this.biome) return;
    this.biome = biome;
    this.scene.remove(this.env.group);
    this.env = new BiomeEnvironment(null, null, this.gr.quality === 'high' ? 'medium' : this.gr.quality, biome);
    this.env.applyFog(this.scene);
    this.scene.add(this.env.group);
  }

  private buildStage(): void {
    const top = new THREE.Mesh(new THREE.CylinderGeometry(2.2, 2.0, 0.5, 28), toon('#8fd16a'));
    top.position.y = -0.25;
    top.receiveShadow = true;
    const rim = new THREE.Mesh(new THREE.TorusGeometry(2.15, 0.12, 8, 40), toon('#ffd23a'));
    rim.rotation.x = Math.PI / 2;
    rim.position.y = 0.0;
    const under = new THREE.Mesh(new THREE.ConeGeometry(2.0, 3.2, 10), toon('#8a5a36'));
    under.rotation.x = Math.PI;
    under.position.y = -2.1;
    this.stage.add(top, rim, under);
    for (let i = 0; i < 7; i++) {
      const a = (i / 7) * Math.PI * 2 + 0.3;
      const flower = new THREE.Mesh(new THREE.SphereGeometry(0.12, 8, 6), toon(['#ff7ab8', '#fff1a8', '#7ec8ff'][i % 3]));
      flower.position.set(Math.cos(a) * 1.85, 0.05, Math.sin(a) * 1.85);
      this.stage.add(flower);
    }
  }

  show(loadout: ShowcaseLoadout, playEmote = false): void {
    const key = JSON.stringify(loadout);
    if (key !== this.key) {
      const charChanged = !this.rig || this.rig.characterId !== loadout.characterId || this.key === '' || JSON.parse(this.key).variantId !== loadout.variantId;
      if (charChanged) {
        if (this.rig) this.holder.remove(this.rig.root);
        this.rig = createCharacter(loadout.characterId, paletteFor(loadout.characterId, loadout.variantId));
        this.rig.root.scale.setScalar(1.35);
        this.holder.add(this.rig.root);
        this.animator = new PlayerAnimator(this.rig);
      }
      this.parts = applyCosmetics(this.rig!, loadout.cosmetics);
      this.animator!.setEmote(loadout.cosmetics.emote ?? 'emote_wave');
      this.key = key;
    }
    if (playEmote) this.emoteTime = 2.2;
  }

  /** Lets the player spin the critter by dragging. */
  drag(dx: number): void {
    this.yawVel = dx * 0.01;
  }

  resize(): void {
    this.camera.aspect = this.gr.aspect;
    this.camera.fov = this.gr.aspect < 1 ? 52 : 40;
    this.camera.updateProjectionMatrix();
  }

  frame(dt: number): void {
    this.time += dt;
    this.emoteTime = Math.max(0, this.emoteTime - dt);
    this.dragYaw += this.yawVel;
    this.yawVel *= Math.exp(-dt * 4);
    this.holder.rotation.y = Math.PI + Math.sin(this.time * 0.4) * 0.35 + this.dragYaw;
    this.stage.position.set(this.offsetX, Math.sin(this.time * 0.8) * 0.08, 0);
    const portrait = this.gr.aspect < 1;
    this.camera.position.set(0, portrait ? 2.6 : 2.2, portrait ? 9.5 : 7.8);
    this.camera.lookAt(0, portrait ? 0.6 : 0.9, 0);
    if (this.animator) {
      this.animator.update(dt, { mode: this.emoteTime > 0 ? 'celebrate' : 'showcase', speed: 0, vy: 0, latVel: 0, modeTime: 2.2 - this.emoteTime }, this.time);
      animateCosmetics(this.parts, this.time, 3);
    }
    this.env.update(this.time, new THREE.Vector3(0, 0, 0), 0);
    this.env.sun.position.set(6, 12, 8);
    this.env.sun.target.position.set(0, 0, 0);
    this.gr.render(this.scene, this.camera, 0.4);
  }
}
