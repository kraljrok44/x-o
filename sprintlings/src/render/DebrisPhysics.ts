import * as THREE from 'three';
import { toon } from './Materials';

type RapierModule = typeof import('@dimforge/rapier3d-compat');

interface Shard {
  mesh: THREE.Mesh;
  body: import('@dimforge/rapier3d-compat').RigidBody | null;
  life: number;
}

/**
 * Cosmetic rigid-body debris (Rune Box shards, hurdle chips) simulated with
 * Rapier 3D. It runs in its own world on the DEBRIS layer and never affects
 * the race. Rapier is loaded lazily (dynamic import) only on Medium/High
 * graphics so the initial download stays small.
 */
export class DebrisPhysics {
  private world: import('@dimforge/rapier3d-compat').World | null = null;
  private rapier: RapierModule | null = null;
  private readonly shards: Shard[] = [];
  private readonly floors: { body: import('@dimforge/rapier3d-compat').RigidBody; life: number }[] = [];
  private readonly geometry = new THREE.BoxGeometry(0.22, 0.22, 0.22);
  private cursor = 0;

  constructor(
    private readonly scene: THREE.Object3D,
    capacity = 36,
  ) {
    for (let i = 0; i < capacity; i++) {
      const mesh = new THREE.Mesh(this.geometry, toon('#ffffff'));
      mesh.visible = false;
      mesh.castShadow = true;
      scene.add(mesh);
      this.shards.push({ mesh, body: null, life: 0 });
    }
  }

  get ready(): boolean {
    return this.world !== null;
  }

  async load(): Promise<boolean> {
    try {
      const mod = await import('@dimforge/rapier3d-compat');
      await mod.init();
      this.rapier = mod;
      this.world = new mod.World({ x: 0, y: -24, z: 0 });
      return true;
    } catch (err) {
      console.warn('[debris] Rapier unavailable, cosmetic debris disabled', err);
      return false;
    }
  }

  /** Throws `count` shards from `origin`; `floorY` places a temporary floor under them. */
  spawn(origin: THREE.Vector3, floorY: number, colors: string[], count = 6, power = 5): void {
    const R = this.rapier;
    const world = this.world;
    if (!R || !world) return;
    const floor = world.createRigidBody(R.RigidBodyDesc.fixed().setTranslation(origin.x, floorY - 0.25, origin.z));
    world.createCollider(R.ColliderDesc.cuboid(4, 0.25, 4).setFriction(0.8), floor);
    this.floors.push({ body: floor, life: 2.6 });
    for (let i = 0; i < count; i++) {
      const shard = this.shards[this.cursor];
      this.cursor = (this.cursor + 1) % this.shards.length;
      if (shard.body) world.removeRigidBody(shard.body);
      const body = world.createRigidBody(
        R.RigidBodyDesc.dynamic()
          .setTranslation(origin.x + (Math.random() - 0.5) * 0.4, origin.y + Math.random() * 0.3, origin.z + (Math.random() - 0.5) * 0.4)
          .setLinvel((Math.random() - 0.5) * power, power * (0.6 + Math.random() * 0.6), (Math.random() - 0.5) * power)
          .setAngvel({ x: Math.random() * 10, y: Math.random() * 10, z: Math.random() * 10 }),
      );
      world.createCollider(R.ColliderDesc.cuboid(0.11, 0.11, 0.11).setRestitution(0.45).setDensity(0.6), body);
      shard.body = body;
      shard.life = 2.2;
      shard.mesh.material = toon(colors[i % colors.length]);
      shard.mesh.visible = true;
      shard.mesh.scale.setScalar(0.7 + Math.random() * 0.8);
    }
  }

  update(dt: number): void {
    const world = this.world;
    if (!world) return;
    world.timestep = Math.min(1 / 30, dt);
    world.step();
    for (const s of this.shards) {
      if (!s.body) continue;
      s.life -= dt;
      if (s.life <= 0) {
        world.removeRigidBody(s.body);
        s.body = null;
        s.mesh.visible = false;
        continue;
      }
      const p = s.body.translation();
      const q = s.body.rotation();
      s.mesh.position.set(p.x, p.y, p.z);
      s.mesh.quaternion.set(q.x, q.y, q.z, q.w);
      if (s.life < 0.4) s.mesh.scale.multiplyScalar(0.9);
    }
    for (let i = this.floors.length - 1; i >= 0; i--) {
      this.floors[i].life -= dt;
      if (this.floors[i].life <= 0) {
        world.removeRigidBody(this.floors[i].body);
        this.floors.splice(i, 1);
      }
    }
  }

  dispose(): void {
    for (const s of this.shards) this.scene.remove(s.mesh);
    this.world?.free();
    this.world = null;
  }
}
