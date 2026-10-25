import * as THREE from 'three';
import { CHARACTERS, type CharacterId, type CharacterPalette } from '../player/CharacterDefinition';
import { addOutlines, flat, toon } from './Materials';

/**
 * Procedural critter models built from primitives. Each model has a light
 * "skeleton" of pivot nodes that PlayerAnimation drives procedurally, and
 * anchor nodes where cosmetics attach. Models face -Z, feet at y = 0, and are
 * about 1.25 units tall to match the gameplay hitbox.
 */
export interface CharacterRig {
  characterId: CharacterId;
  root: THREE.Group;
  /** Squash & stretch pivot at the feet. */
  body: THREE.Group;
  torso: THREE.Group;
  head: THREE.Group;
  legL: THREE.Group;
  legR: THREE.Group;
  armL: THREE.Group;
  armR: THREE.Group;
  tail: THREE.Group | null;
  ears: THREE.Group[];
  anchors: { hat: THREE.Group; eyes: THREE.Group; back: THREE.Group; trail: THREE.Group };
  /** Parts with their own idle motion (flame tip, gills...). */
  extras: THREE.Object3D[];
  eyeMeshes: THREE.Mesh[];
}

const geo = {
  sphere: new THREE.SphereGeometry(1, 20, 14),
  sphereLow: new THREE.SphereGeometry(1, 10, 8),
  capsule: new THREE.CapsuleGeometry(0.5, 1, 5, 10),
  cone: new THREE.ConeGeometry(1, 1, 10),
  coneLow: new THREE.ConeGeometry(1, 1, 6),
  box: new THREE.BoxGeometry(1, 1, 1),
  rock: new THREE.IcosahedronGeometry(1, 1),
  cyl: new THREE.CylinderGeometry(1, 1, 1, 12),
  torus: new THREE.TorusGeometry(1, 0.18, 8, 20),
};

function part(
  g: THREE.BufferGeometry,
  mat: THREE.Material,
  pos: [number, number, number],
  scale: [number, number, number] | number,
  rot: [number, number, number] = [0, 0, 0],
): THREE.Mesh {
  const m = new THREE.Mesh(g, mat);
  m.position.set(...pos);
  if (typeof scale === 'number') m.scale.setScalar(scale);
  else m.scale.set(...scale);
  m.rotation.set(...rot);
  m.castShadow = true;
  return m;
}

function pivot(parent: THREE.Object3D, pos: [number, number, number]): THREE.Group {
  const g = new THREE.Group();
  g.position.set(...pos);
  parent.add(g);
  return g;
}

interface Mats {
  body: THREE.Material;
  belly: THREE.Material;
  accent: THREE.Material;
  eyeWhite: THREE.Material;
  pupil: THREE.Material;
  shine: THREE.Material;
  nose: THREE.Material;
  glow: THREE.Material;
}

function mats(p: CharacterPalette): Mats {
  return {
    body: toon(p.body),
    belly: toon(p.belly),
    accent: toon(p.accent),
    eyeWhite: toon('#ffffff'),
    pupil: toon(p.eye),
    shine: flat('#ffffff'),
    nose: toon('#2b1f2f'),
    glow: toon(p.accent, { emissive: p.accent, emissiveIntensity: 1.4 }),
  };
}

function addEyes(rig: CharacterRig, m: Mats, y: number, z: number, spread: number, size: number): void {
  for (const side of [-1, 1]) {
    const white = part(geo.sphere, m.eyeWhite, [side * spread, y, z], [size, size * 1.15, size * 0.7]);
    const pupil = part(geo.sphere, m.pupil, [side * spread, y - size * 0.05, z - size * 0.45], [size * 0.62, size * 0.75, size * 0.4]);
    const shine = part(geo.sphereLow, m.shine, [side * spread + size * 0.18, y + size * 0.3, z - size * 0.72], size * 0.2);
    shine.userData.noOutline = true;
    pupil.userData.noOutline = true;
    rig.head.add(white, pupil, shine);
    rig.eyeMeshes.push(white, pupil);
  }
}

function baseRig(id: CharacterId): CharacterRig {
  const root = new THREE.Group();
  root.name = `critter_${id}`;
  const body = pivot(root, [0, 0, 0]);
  const torso = pivot(body, [0, 0.5, 0]);
  const head = pivot(torso, [0, 0.42, -0.02]);
  return {
    characterId: id,
    root,
    body,
    torso,
    head,
    legL: pivot(body, [-0.2, 0.32, 0]),
    legR: pivot(body, [0.2, 0.32, 0]),
    armL: pivot(torso, [-0.36, 0.08, 0]),
    armR: pivot(torso, [0.36, 0.08, 0]),
    tail: null,
    ears: [],
    anchors: {
      hat: pivot(head, [0, 0.38, 0]),
      eyes: pivot(head, [0, 0.05, -0.33]),
      back: pivot(torso, [0, 0.05, 0.36]),
      trail: pivot(root, [0, 0.2, 0.4]),
    },
    extras: [],
    eyeMeshes: [],
  };
}

function legs(rig: CharacterRig, m: Mats, footMat: THREE.Material, len = 0.26, footScale = 1): void {
  for (const [leg, side] of [
    [rig.legL, -1],
    [rig.legR, 1],
  ] as const) {
    leg.add(part(geo.capsule, m.body, [0, -len / 2, 0], [0.16, len * 0.75, 0.16]));
    leg.add(part(geo.sphere, footMat, [side * 0.01, -len - 0.02, -0.06], [0.14 * footScale, 0.08, 0.2 * footScale]));
  }
}

function arms(rig: CharacterRig, m: Mats, mat: THREE.Material, len = 0.24): void {
  for (const arm of [rig.armL, rig.armR]) {
    arm.add(part(geo.capsule, mat, [0, -len / 2, 0], [0.12, len * 0.8, 0.12]));
    arm.add(part(geo.sphere, m.belly, [0, -len, 0], 0.08));
  }
}

function buildHedgehog(rig: CharacterRig, m: Mats): void {
  rig.torso.add(part(geo.sphere, m.body, [0, 0.05, 0], [0.42, 0.4, 0.4]));
  rig.torso.add(part(geo.sphere, m.belly, [0, 0.0, -0.18], [0.32, 0.32, 0.26]));
  // Mossy quills on the back.
  const quillMat = m.accent;
  for (let row = 0; row < 4; row++) {
    for (let i = 0; i < 6; i++) {
      const a = (i / 5 - 0.5) * 2.2;
      const el = 0.15 + row * 0.32;
      const dir = new THREE.Vector3(Math.sin(a) * Math.cos(el), Math.sin(el), Math.cos(a) * Math.cos(el)).normalize();
      if (dir.z < -0.05) continue;
      const q = part(geo.coneLow, quillMat, [dir.x * 0.4, 0.08 + dir.y * 0.42, dir.z * 0.4], [0.07, 0.24, 0.07]);
      q.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);
      rig.torso.add(q);
    }
  }
  rig.head.add(part(geo.sphere, m.body, [0, 0.02, 0], [0.33, 0.3, 0.32]));
  rig.head.add(part(geo.sphere, m.belly, [0, -0.07, -0.22], [0.2, 0.15, 0.18]));
  rig.head.add(part(geo.sphere, m.nose, [0, -0.04, -0.38], 0.06));
  for (const side of [-1, 1]) {
    const ear = pivot(rig.head, [side * 0.2, 0.24, 0.04]);
    ear.add(part(geo.sphere, m.body, [0, 0.04, 0], [0.08, 0.1, 0.05]));
    ear.add(part(geo.sphere, m.belly, [0, 0.04, -0.02], [0.05, 0.06, 0.03]));
    rig.ears.push(ear);
  }
  addEyes(rig, m, 0.07, -0.25, 0.12, 0.085);
  legs(rig, m, m.accent);
  arms(rig, m, m.body);
  rig.tail = pivot(rig.torso, [0, -0.15, 0.38]);
  rig.tail.add(part(geo.sphere, m.accent, [0, 0, 0], 0.07));
}

function buildHare(rig: CharacterRig, m: Mats): void {
  rig.torso.position.y = 0.55;
  rig.torso.add(part(geo.sphere, m.body, [0, 0.02, 0], [0.32, 0.38, 0.3]));
  rig.torso.add(part(geo.sphere, m.belly, [0, -0.02, -0.15], [0.24, 0.3, 0.2]));
  rig.head.position.y = 0.42;
  rig.head.add(part(geo.sphere, m.body, [0, 0.02, 0], [0.3, 0.28, 0.29]));
  rig.head.add(part(geo.sphere, m.belly, [0, -0.08, -0.2], [0.15, 0.12, 0.14]));
  rig.head.add(part(geo.sphere, toon('#ff8fb0'), [0, -0.03, -0.31], 0.045));
  for (const side of [-1, 1]) {
    const ear = pivot(rig.head, [side * 0.12, 0.22, 0.02]);
    ear.rotation.z = -side * 0.15;
    ear.add(part(geo.capsule, m.body, [0, 0.26, 0], [0.11, 0.42, 0.06]));
    ear.add(part(geo.capsule, m.belly, [0, 0.26, -0.03], [0.06, 0.34, 0.02]));
    rig.ears.push(ear);
  }
  rig.anchors.hat.position.y = 0.3;
  addEyes(rig, m, 0.05, -0.23, 0.12, 0.08);
  legs(rig, m, m.belly, 0.3, 1.35);
  arms(rig, m, m.body, 0.22);
  rig.tail = pivot(rig.torso, [0, -0.12, 0.3]);
  rig.tail.add(part(geo.sphere, m.belly, [0, 0, 0], 0.11));
}

function buildGolem(rig: CharacterRig, m: Mats): void {
  rig.torso.add(part(geo.rock, m.body, [0, 0.04, 0], [0.42, 0.38, 0.38]));
  rig.torso.add(part(geo.rock, m.belly, [0, -0.02, -0.2], [0.26, 0.24, 0.16]));
  // Glowing seams.
  for (const [x, y, rz] of [
    [-0.18, 0.12, 0.6],
    [0.2, -0.05, -0.4],
    [0.05, 0.22, 1.2],
  ] as const) {
    const seam = part(geo.box, m.glow, [x, y, -0.33], [0.16, 0.03, 0.03], [0, 0, rz]);
    seam.userData.noOutline = true;
    rig.torso.add(seam);
  }
  rig.head.position.y = 0.4;
  rig.head.add(part(geo.rock, m.body, [0, 0.02, 0], [0.3, 0.27, 0.28]));
  rig.head.add(part(geo.rock, m.accent, [0, 0.22, 0.05], [0.12, 0.1, 0.1]));
  // Glowing eyes instead of white eyes.
  for (const side of [-1, 1]) {
    const eye = part(geo.sphere, m.glow, [side * 0.11, 0.04, -0.24], [0.06, 0.07, 0.04]);
    eye.userData.noOutline = true;
    rig.head.add(eye);
    rig.eyeMeshes.push(eye);
  }
  legs(rig, m, m.accent, 0.24, 1.2);
  for (const arm of [rig.armL, rig.armR]) {
    arm.position.x *= 1.15;
    arm.add(part(geo.capsule, m.body, [0, -0.1, 0], [0.13, 0.18, 0.13]));
    arm.add(part(geo.rock, m.accent, [0, -0.24, 0], 0.12));
  }
}

function buildAxolotl(rig: CharacterRig, m: Mats): void {
  rig.torso.add(part(geo.sphere, m.body, [0, 0.02, 0.02], [0.33, 0.33, 0.38]));
  rig.torso.add(part(geo.sphere, m.belly, [0, -0.03, -0.16], [0.24, 0.24, 0.22]));
  rig.head.position.y = 0.38;
  rig.head.add(part(geo.sphere, m.body, [0, 0.02, 0], [0.38, 0.27, 0.3]));
  // Smile.
  const smile = part(geo.torus, m.nose, [0, -0.08, -0.28], [0.08, 0.05, 0.05], [0, 0, Math.PI]);
  smile.userData.noOutline = true;
  rig.head.add(smile);
  // Gills: three fronds each side, emissive accent.
  for (const side of [-1, 1]) {
    for (let i = 0; i < 3; i++) {
      const g = pivot(rig.head, [side * 0.32, 0.08 - i * 0.08, 0.04]);
      g.rotation.z = side * (0.6 + i * 0.35);
      g.add(part(geo.capsule, m.glow, [0, 0.11, 0], [0.06, 0.16, 0.04]));
      rig.ears.push(g);
    }
  }
  addEyes(rig, m, 0.06, -0.22, 0.17, 0.065);
  legs(rig, m, m.belly, 0.24);
  arms(rig, m, m.body, 0.2);
  rig.tail = pivot(rig.torso, [0, -0.02, 0.36]);
  rig.tail.add(part(geo.sphere, m.body, [0, 0, 0.16], [0.12, 0.12, 0.26]));
  rig.tail.add(part(geo.sphere, m.glow, [0, 0.05, 0.22], [0.02, 0.13, 0.22]));
}

function buildSalamander(rig: CharacterRig, m: Mats): void {
  rig.torso.add(part(geo.sphere, m.body, [0, 0.0, 0.04], [0.31, 0.32, 0.4]));
  rig.torso.add(part(geo.sphere, m.belly, [0, -0.05, -0.12], [0.22, 0.24, 0.24]));
  for (const [x, y, z] of [
    [-0.16, 0.2, 0.1],
    [0.18, 0.16, 0.2],
    [0.0, 0.27, 0.05],
  ] as const) {
    const spot = part(geo.sphere, m.accent, [x, y, z], 0.07);
    spot.userData.noOutline = true;
    rig.torso.add(spot);
  }
  rig.head.position.y = 0.36;
  rig.head.add(part(geo.sphere, m.body, [0, 0.02, -0.03], [0.3, 0.24, 0.33]));
  rig.head.add(part(geo.sphere, m.belly, [0, -0.08, -0.2], [0.2, 0.08, 0.16]));
  addEyes(rig, m, 0.12, -0.18, 0.14, 0.08);
  legs(rig, m, m.body, 0.24);
  arms(rig, m, m.body, 0.2);
  rig.tail = pivot(rig.torso, [0, -0.08, 0.38]);
  rig.tail.add(part(geo.capsule, m.body, [0, 0, 0.22], [0.13, 0.36, 0.13], [Math.PI / 2 - 0.3, 0, 0]));
  const flameMat = toon('#ffb23a', { emissive: '#ff6a1a', emissiveIntensity: 1.6 });
  const flame = part(geo.cone, flameMat, [0, 0.12, 0.42], [0.1, 0.24, 0.1], [-0.5, 0, 0]);
  flame.userData.noOutline = true;
  flame.userData.flame = true;
  rig.tail.add(flame);
  rig.extras.push(flame);
}

function buildOwlet(rig: CharacterRig, m: Mats): void {
  rig.torso.position.y = 0.48;
  rig.torso.add(part(geo.sphere, m.body, [0, 0.12, 0], [0.4, 0.5, 0.38]));
  rig.torso.add(part(geo.sphere, m.belly, [0, 0.05, -0.17], [0.3, 0.36, 0.24]));
  // Chest lantern glow.
  const lantern = part(geo.sphere, m.glow, [0, -0.02, -0.36], 0.06);
  lantern.userData.noOutline = true;
  rig.torso.add(lantern);
  rig.extras.push(lantern);
  rig.head.position.y = 0.5;
  rig.head.add(part(geo.sphere, m.body, [0, 0, 0], [0.34, 0.27, 0.3]));
  for (const side of [-1, 1]) {
    const ring = part(geo.sphere, m.belly, [side * 0.13, 0.02, -0.18], [0.13, 0.13, 0.12]);
    rig.head.add(ring);
    const tuft = pivot(rig.head, [side * 0.22, 0.22, 0]);
    tuft.add(part(geo.cone, m.accent, [0, 0.07, 0], [0.07, 0.17, 0.05], [0, 0, -side * 0.4]));
    rig.ears.push(tuft);
  }
  rig.head.add(part(geo.cone, toon('#ffb23a'), [0, -0.07, -0.3], [0.05, 0.1, 0.05], [-Math.PI / 2, 0, 0]));
  addEyes(rig, m, 0.03, -0.27, 0.13, 0.085);
  legs(rig, m, toon('#ffb23a'), 0.2);
  for (const [arm, side] of [
    [rig.armL, -1],
    [rig.armR, 1],
  ] as const) {
    arm.position.x = side * 0.38;
    arm.add(part(geo.sphere, m.accent, [side * 0.04, -0.12, 0.02], [0.08, 0.2, 0.16]));
  }
  rig.anchors.hat.position.y = 0.26;
}

const BUILDERS: Record<string, (rig: CharacterRig, m: Mats) => void> = {
  hedgehog: buildHedgehog,
  hare: buildHare,
  golem: buildGolem,
  axolotl: buildAxolotl,
  salamander: buildSalamander,
  owlet: buildOwlet,
};

/** Builds a fresh, fully rigged critter. */
export function createCharacter(id: CharacterId, palette?: CharacterPalette, outline = true): CharacterRig {
  const def = CHARACTERS[id];
  const rig = baseRig(id);
  const m = mats(palette ?? def.palette);
  BUILDERS[def.bodyPlan](rig, m);
  if (outline) addOutlines(rig.root, 0.035);
  rig.root.traverse((o) => {
    if ((o as THREE.Mesh).isMesh && !o.userData.isOutline) o.castShadow = true;
  });
  return rig;
}

export function paletteFor(id: CharacterId, variantId: string | null | undefined): CharacterPalette {
  const def = CHARACTERS[id];
  const v = variantId ? def.variants.find((x) => x.id === variantId) : undefined;
  return v ? v.palette : def.palette;
}
