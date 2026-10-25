import type { MenuScene } from '../render/MenuScene';
import type { RaceController } from './RaceController';

/** Decides which 3D scene renders each frame: the menu stage or the active race. */
export class SceneManager {
  race: RaceController | null = null;

  constructor(private readonly menu: MenuScene) {}

  frame(dt: number): void {
    if (this.race) this.race.frame(dt);
    else this.menu.frame(dt);
  }

  resize(): void {
    this.menu.resize();
    this.race?.scene.resize();
  }
}
