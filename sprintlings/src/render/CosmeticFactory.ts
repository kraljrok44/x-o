import * as THREE from 'three';
import { COSMETIC_BY_ID } from '../shop/CosmeticCatalog';
import { addOutlines, flat, toon } from './Materials';
import type { CharacterRig } from './CharacterFactory';

/** Builds the 3D mesh for a hat/eyewear/back cosmetic. Purely visual. */
const g = {
  sphere: new THREE.SphereGeometry(1, 16, 12),
  cone: new THREE.ConeGeometry(1, 1, 14),
  cyl: new THREE.CylinderGeometry(1, 1, 1, 16),
  torus: new THREE.TorusGeometry(1, 0.12, 8, 24),
  box: new THREE.BoxGeometry(1, 1, 1),
  star: makeStarGeometry(),
  heart: makeHeartGeometry(),
};

function makeStarGeometry(): THREE.ExtrudeGeometry {
  const shape = new THREE.Shape();
  for (let i = 0; i < 10; i++) {
    const r = i % 2 === 0 ? 1 : 0.45;
    const a = (i / 10) * Math.PI * 2 + Math.PI / 2;
    if (i === 0) shape.moveTo(Math.cos(a) * r, Math.sin(a) * r);
    else shape.lineTo(Math.cos(a) * r, Math.sin(a) * r);
  }
  shape.closePath();
  return new THREE.ExtrudeGeometry(shape, { depth: 0.3, bevelEnabled: false });
}

function makeHeartGeometry(): THREE.ExtrudeGeometry {
  const s = new THREE.Shape();
  s.moveTo(0, -0.9);
  s.bezierCurveTo(0.9, -0.2, 1.1, 0.6, 0.5, 0.85);
  s.bezierCurveTo(0.2, 1.0, 0, 0.7, 0, 0.5);
  s.bezierCurveTo(0, 0.7, -0.2, 1.0, -0.5, 0.85);
  s.bezierCurveTo(-1.1, 0.6, -0.9, -0.2, 0, -0.9);
  return new THREE.ExtrudeGeometry(s, { depth: 0.3, bevelEnabled: false });
}

function m(geom: THREE.BufferGeometry, mat: THREE.Material, pos: [number, number, number], scale: [number, number, number] | number, rot: [number, number, number] = [0, 0, 0]): THREE.Mesh {
  const mesh = new THREE.Mesh(geom, mat);
  mesh.position.set(...pos);
  if (typeof scale === 'number') mesh.scale.setScalar(scale);
  else mesh.scale.set(...scale);
  mesh.rotation.set(...rot);
  mesh.castShadow = true;
  return mesh;
}

function hat(id: string, color: string): THREE.Group {
  const grp = new THREE.Group();
  const main = toon(color);
  switch (id) {
    case 'hat_leaf': {
      grp.add(m(g.sphere, main, [0, 0.08, 0], [0.18, 0.03, 0.3], [0.3, 0.4, 0.2]));
      grp.add(m(g.cyl, toon('#7a5230'), [0, 0.02, 0.05], [0.015, 0.1, 0.015]));
      break;
    }
    case 'hat_acorn':
      grp.add(m(g.sphere, main, [0, 0.0, 0], [0.32, 0.18, 0.32]));
      grp.add(m(g.cyl, toon('#6b4424'), [0, 0.17, 0], [0.03, 0.12, 0.03]));
      break;
    case 'hat_party':
      grp.add(m(g.cone, main, [0, 0.18, 0], [0.13, 0.38, 0.13]));
      grp.add(m(g.sphere, toon('#fff36b'), [0, 0.38, 0], 0.05));
      grp.add(m(g.torus, toon('#4dd6ff'), [0, 0.06, 0], [0.12, 0.12, 0.12], [Math.PI / 2, 0, 0]));
      break;
    case 'hat_flower':
      for (let i = 0; i < 7; i++) {
        const a = (i / 7) * Math.PI * 2;
        grp.add(m(g.sphere, toon('#ffffff'), [Math.cos(a) * 0.2, 0.02, Math.sin(a) * 0.2], [0.07, 0.03, 0.07]));
        grp.add(m(g.sphere, main, [Math.cos(a) * 0.2, 0.05, Math.sin(a) * 0.2], 0.03));
      }
      break;
    case 'hat_mushroom':
      grp.add(m(g.sphere, main, [0, 0.06, 0], [0.36, 0.2, 0.36]));
      for (const [x, z] of [
        [0.12, -0.1],
        [-0.15, 0.05],
        [0.05, 0.18],
        [-0.02, -0.2],
      ] as const)
        grp.add(m(g.sphere, toon('#ffffff'), [x, 0.2, z], [0.06, 0.03, 0.06]));
      break;
    case 'hat_propeller':
      grp.add(m(g.sphere, main, [0, 0.0, 0], [0.3, 0.15, 0.3]));
      grp.add(m(g.cyl, toon('#ffd23a'), [0, 0.17, 0], [0.015, 0.1, 0.015]));
      {
        const prop = new THREE.Group();
        prop.position.y = 0.22;
        prop.add(m(g.box, toon('#ff4f6a'), [0, 0, 0], [0.42, 0.015, 0.07]));
        prop.userData.spin = 18;
        grp.add(prop);
      }
      break;
    case 'hat_wizard':
      grp.add(m(g.cyl, main, [0, 0.0, 0], [0.34, 0.03, 0.34]));
      grp.add(m(g.cone, main, [0, 0.27, 0.04], [0.2, 0.55, 0.2], [0.2, 0, 0]));
      grp.add(m(g.star, toon('#ffe066', { emissive: '#ffcc33', emissiveIntensity: 0.6 }), [0.05, 0.2, -0.16], 0.05));
      break;
    case 'hat_tophat':
      grp.add(m(g.cyl, main, [0, 0.0, 0], [0.3, 0.025, 0.3]));
      grp.add(m(g.cyl, main, [0, 0.17, 0], [0.19, 0.32, 0.19]));
      grp.add(m(g.cyl, toon('#d94a5a'), [0, 0.06, 0], [0.195, 0.06, 0.195]));
      break;
    case 'hat_horns':
      for (const side of [-1, 1]) {
        const horn = new THREE.Group();
        horn.position.set(side * 0.22, -0.05, 0.02);
        for (let i = 0; i < 5; i++) {
          const a = i * 0.55;
          horn.add(m(g.sphere, main, [side * Math.sin(a) * 0.12, Math.cos(a) * 0.1 + 0.05, -Math.sin(a * 0.5) * 0.05], 0.06 - i * 0.008));
        }
        grp.add(horn);
      }
      break;
    case 'hat_crown': {
      const gold = toon(color, { emissive: '#ffb000', emissiveIntensity: 0.25 });
      grp.add(m(g.cyl, gold, [0, 0.04, 0], [0.24, 0.1, 0.24]));
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2;
        grp.add(m(g.cone, gold, [Math.cos(a) * 0.21, 0.15, Math.sin(a) * 0.21], [0.05, 0.14, 0.05]));
        grp.add(m(g.sphere, toon(i % 2 ? '#ff4f8a' : '#4cf2ff'), [Math.cos(a) * 0.24, 0.05, Math.sin(a) * 0.24], 0.03));
      }
      break;
    }
    case 'hat_halo': {
      const halo = m(g.torus, toon(color, { emissive: color, emissiveIntensity: 1.5 }), [0, 0.18, 0], [0.22, 0.22, 0.22], [Math.PI / 2, 0, 0]);
      halo.userData.bob = true;
      grp.add(halo);
      break;
    }
    case 'hat_pumpkin':
      grp.add(m(g.sphere, main, [0, 0.02, 0], [0.35, 0.24, 0.35]));
      grp.add(m(g.cyl, toon('#4a7a2a'), [0, 0.25, 0], [0.03, 0.08, 0.03]));
      break;
    default:
      grp.add(m(g.sphere, main, [0, 0, 0], 0.15));
  }
  return grp;
}

function eyewear(id: string, color: string): THREE.Group {
  const grp = new THREE.Group();
  const frame = toon(color);
  const lens = toon('#1b1530', { opacity: 0.85 });
  switch (id) {
    case 'eyes_round':
      for (const side of [-1, 1]) grp.add(m(g.torus, frame, [side * 0.12, 0, 0], [0.085, 0.085, 0.12]));
      grp.add(m(g.box, frame, [0, 0, 0], [0.07, 0.015, 0.015]));
      break;
    case 'eyes_patch':
      grp.add(m(g.sphere, frame, [0.12, 0, 0], [0.09, 0.09, 0.03]));
      grp.add(m(g.box, frame, [0, 0.06, 0.02], [0.5, 0.015, 0.015], [0, 0, -0.25]));
      break;
    case 'eyes_heart':
      for (const side of [-1, 1]) grp.add(m(g.heart, toon(color, { opacity: 0.9 }), [side * 0.12, 0, -0.02], 0.09));
      break;
    case 'eyes_star':
      for (const side of [-1, 1]) grp.add(m(g.star, toon(color), [side * 0.12, 0, -0.02], 0.1));
      break;
    case 'eyes_monocle':
      grp.add(m(g.torus, frame, [0.12, 0, 0], [0.09, 0.09, 0.15]));
      grp.add(m(g.cyl, frame, [0.18, -0.15, 0], [0.006, 0.2, 0.006]));
      break;
    case 'eyes_visor': {
      const v = m(g.box, toon(color, { emissive: color, emissiveIntensity: 1.2, opacity: 0.85 }), [0, 0, 0], [0.42, 0.08, 0.04]);
      grp.add(v);
      break;
    }
    default:
      for (const side of [-1, 1]) grp.add(m(g.sphere, lens, [side * 0.12, 0, 0], [0.08, 0.06, 0.02]));
  }
  grp.position.z = -0.05;
  return grp;
}

function backItem(id: string, color: string): THREE.Group {
  const grp = new THREE.Group();
  const main = toon(color);
  switch (id) {
    case 'back_scarf': {
      grp.add(m(g.torus, main, [0, 0.32, -0.3], [0.26, 0.26, 0.5], [Math.PI / 2, 0, 0]));
      const tail = new THREE.Group();
      tail.position.set(0.1, 0.3, 0.05);
      tail.add(m(g.box, main, [0, -0.05, 0.15], [0.1, 0.03, 0.32], [0.3, 0, 0]));
      tail.userData.flap = true;
      grp.add(tail);
      break;
    }
    case 'back_pack':
      grp.add(m(g.box, main, [0, 0.02, 0.06], [0.34, 0.36, 0.18]));
      grp.add(m(g.box, toon('#8a5a30'), [0, -0.06, 0.16], [0.26, 0.14, 0.06]));
      break;
    case 'back_balloon': {
      const string = m(g.cyl, flat('#ffffff'), [0, 0.45, 0.15], [0.006, 0.9, 0.006], [-0.25, 0, 0]);
      string.userData.noOutline = true;
      grp.add(string);
      const balloon = m(g.sphere, toon(color, { emissive: color, emissiveIntensity: 0.15 }), [0, 0.95, 0.35], [0.2, 0.24, 0.2]);
      balloon.userData.bob = true;
      grp.add(balloon);
      break;
    }
    case 'back_cape': {
      const cape = new THREE.Group();
      cape.position.set(0, 0.25, 0);
      cape.add(m(g.box, main, [0, -0.25, 0.04], [0.5, 0.55, 0.02]));
      cape.userData.flap = true;
      grp.add(cape);
      break;
    }
    case 'back_leafwings':
      for (const side of [-1, 1]) {
        const wing = new THREE.Group();
        wing.position.set(side * 0.08, 0.1, 0.05);
        wing.add(m(g.sphere, main, [side * 0.3, 0.05, 0.05], [0.3, 0.03, 0.14], [0, side * 0.3, side * 0.3]));
        wing.add(m(g.sphere, toon('#c4622d'), [side * 0.22, -0.08, 0.06], [0.2, 0.03, 0.1], [0, side * 0.5, side * -0.2]));
        wing.userData.wing = side;
        grp.add(wing);
      }
      break;
    case 'back_rocket':
      grp.add(m(g.cyl, main, [0, 0.05, 0.08], [0.1, 0.42, 0.1]));
      grp.add(m(g.cone, toon('#ff4f4f'), [0, 0.34, 0.08], [0.1, 0.16, 0.1]));
      for (const side of [-1, 1]) grp.add(m(g.box, toon('#ff4f4f'), [side * 0.1, -0.12, 0.08], [0.06, 0.12, 0.02]));
      {
        const flame = m(g.cone, toon('#ffb23a', { emissive: '#ff6a1a', emissiveIntensity: 1.4 }), [0, -0.25, 0.08], [0.07, 0.16, 0.07], [Math.PI, 0, 0]);
        flame.userData.flame = true;
        flame.userData.noOutline = true;
        grp.add(flame);
      }
      break;
    default:
      grp.add(m(g.box, main, [0, 0, 0.05], 0.2));
  }
  return grp;
}

export interface CosmeticAttachments {
  hat: THREE.Object3D | null;
  eyes: THREE.Object3D | null;
  back: THREE.Object3D | null;
}

/** Equips cosmetics on a rig, replacing previous ones. Returns animated parts. */
export function applyCosmetics(rig: CharacterRig, loadout: Record<string, string>, outline = true): THREE.Object3D[] {
  const animated: THREE.Object3D[] = [];
  for (const slot of ['hat', 'eyes', 'back'] as const) {
    const anchor = rig.anchors[slot];
    for (const child of [...anchor.children]) anchor.remove(child);
    const id = loadout[slot];
    const def = id ? COSMETIC_BY_ID[id] : undefined;
    if (!def) continue;
    const model = def.model ?? id;
    const obj = slot === 'hat' ? hat(model, def.color) : slot === 'eyes' ? eyewear(model, def.color) : backItem(model, def.color);
    if (outline) addOutlines(obj, 0.025);
    anchor.add(obj);
    obj.traverse((o) => {
      if (o.userData.spin || o.userData.bob || o.userData.flap || o.userData.wing || o.userData.flame) animated.push(o);
    });
  }
  return animated;
}

/** Idle motion for cosmetic parts. */
export function animateCosmetics(parts: THREE.Object3D[], t: number, speed: number): void {
  for (const p of parts) {
    if (p.userData.spin) p.rotation.y += p.userData.spin * 0.016 * (0.4 + speed / 9);
    if (p.userData.bob) p.position.y += Math.sin(t * 3 + p.id) * 0.0015;
    if (p.userData.flap) p.rotation.x = 0.2 + Math.sin(t * 14) * 0.15 * Math.min(1, speed / 9) + speed * 0.04;
    if (p.userData.wing) p.rotation.z = Math.sin(t * 10) * 0.25 * p.userData.wing;
    if (p.userData.flame) {
      if (p.userData.baseY === undefined) p.userData.baseY = p.scale.y;
      p.scale.y = p.userData.baseY * (1 + Math.sin(t * 30 + p.id) * 0.25);
    }
  }
}
