import type { MenuScene } from '../render/MenuScene';
import type { RaceController } from './RaceController';

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
