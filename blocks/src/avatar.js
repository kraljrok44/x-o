// Customisable blocky character. The same skin description is used for the menu preview and for the
// third-person view (and is what other players will see once multiplayer is added).
import * as THREE from 'three';

export const TONES = ['#f8d9b8', '#eab98b', '#cf9565', '#a86b43', '#7a4a2d', '#4f2f1d'];
export const HAIR = ['#1b1512', '#4a2e1a', '#8a5a2b', '#d6a84a', '#c24a2c', '#d8d8d8', '#3a6ee8', '#d84aa8'];
export const EYES = ['#2a62d6', '#2e8a4a', '#6b4423', '#222', '#8a3ad8', '#2aa6b8'];
export const CLOTHES = ['#d94040', '#e8892a', '#e8c92a', '#4aa84a', '#2aa6b8', '#3a6ee8', '#8a3ad8', '#e060b0', '#f2f2f2', '#2c2c34', '#7a5230', '#7ac8e8'];
export const HAIR_STYLES = ['None', 'Short', 'Long', 'Spiky'];
export const HATS = ['None', 'Cap', 'Beanie', 'Crown', 'Top hat'];
export const EYE_STYLES = ['Round', 'Wide', 'Sleepy', 'Happy'];

export const DEFAULT_SKIN = { name: 'Steve', tone: 1, hairStyle: 1, hairColor: 1, eyeColor: 0, eyeStyle: 0, shirt: 4, pants: 5, shoes: 9, hat: 0, hatColor: 0, cape: false, capeColor: 0 };

export function randomSkin() {
  const r = (n) => Math.floor(Math.random() * n);
  return { ...DEFAULT_SKIN, tone: r(TONES.length), hairStyle: r(HAIR_STYLES.length), hairColor: r(HAIR.length), eyeColor: r(EYES.length), eyeStyle: r(EYE_STYLES.length), shirt: r(CLOTHES.length), pants: r(CLOTHES.length), shoes: r(CLOTHES.length), hat: r(3) === 0 ? 1 + r(HATS.length - 1) : 0, hatColor: r(CLOTHES.length), cape: r(4) === 0, capeColor: r(CLOTHES.length) };
}

/** Accepts a stored skin of any older shape and fills in what is missing. */
export function cleanSkin(s) {
  const o = { ...DEFAULT_SKIN, ...(s || {}) };
  const clamp = (v, n) => Math.max(0, Math.min(n - 1, v | 0));
  o.tone = clamp(o.tone, TONES.length); o.hairStyle = clamp(o.hairStyle, HAIR_STYLES.length); o.hairColor = clamp(o.hairColor, HAIR.length);
  o.eyeColor = clamp(o.eyeColor, EYES.length); o.eyeStyle = clamp(o.eyeStyle, EYE_STYLES.length); o.shirt = clamp(o.shirt, CLOTHES.length);
  o.pants = clamp(o.pants, CLOTHES.length); o.shoes = clamp(o.shoes, CLOTHES.length); o.hat = clamp(o.hat, HATS.length); o.hatColor = clamp(o.hatColor, CLOTHES.length);
  o.capeColor = clamp(o.capeColor, CLOTHES.length); o.cape = !!o.cape;
  o.name = String(o.name || 'Steve').replace(/[^\p{L}\p{N} _\-.]/gu, '').slice(0, 14) || 'Steve';
  return o;
}

const mat = (c) => new THREE.MeshLambertMaterial({ color: c });

function faceTexture(skin) {
  const c = document.createElement('canvas'); c.width = c.height = 16;
  const g = c.getContext('2d');
  g.fillStyle = TONES[skin.tone]; g.fillRect(0, 0, 16, 16);
  const ec = EYES[skin.eyeColor];
  const eye = (x) => {
    const st = skin.eyeStyle;
    if (st === 0) { g.fillStyle = '#fff'; g.fillRect(x, 6, 3, 3); g.fillStyle = ec; g.fillRect(x + (x < 8 ? 1 : 0), 6, 2, 3); g.fillStyle = '#111'; g.fillRect(x + (x < 8 ? 1 : 0), 7, 1, 1); }
    else if (st === 1) { g.fillStyle = '#fff'; g.fillRect(x, 5, 3, 4); g.fillStyle = ec; g.fillRect(x + 1, 6, 2, 3); g.fillStyle = '#111'; g.fillRect(x + 1, 7, 1, 2); }
    else if (st === 2) { g.fillStyle = '#fff'; g.fillRect(x, 7, 3, 2); g.fillStyle = ec; g.fillRect(x + 1, 7, 2, 2); g.fillStyle = 'rgba(0,0,0,.45)'; g.fillRect(x, 6, 3, 1); }
    else { g.fillStyle = '#222'; g.fillRect(x, 8, 1, 1); g.fillRect(x + 1, 7, 1, 1); g.fillRect(x + 2, 8, 1, 1); }
  };
  eye(3); eye(10);
  g.fillStyle = 'rgba(120,50,40,.9)';
  if (skin.eyeStyle === 3) { g.fillRect(6, 11, 4, 1); g.fillRect(5, 10, 1, 1); g.fillRect(10, 10, 1, 1); } else g.fillRect(6, 11, 4, 1);
  g.fillStyle = 'rgba(240,120,120,.25)'; g.fillRect(2, 10, 2, 1); g.fillRect(12, 10, 2, 1);
  const t = new THREE.CanvasTexture(c); t.magFilter = THREE.NearestFilter; t.minFilter = THREE.NearestFilter; t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function box(w, h, d, m, x, y, z) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m);
  mesh.position.set(x, y, z);
  return mesh;
}

/** Feet at y = 0, facing +Z. Total height about 1.8. */
export function buildAvatar(skin) {
  skin = cleanSkin(skin);
  const root = new THREE.Group();
  const tone = mat(TONES[skin.tone]);
  const shirt = mat(CLOTHES[skin.shirt]), pants = mat(CLOTHES[skin.pants]), shoes = mat(CLOTHES[skin.shoes]);
  const faceMat = new THREE.MeshLambertMaterial({ map: faceTexture(skin) });
  // legs (pivot at the hip)
  const mkLeg = (x) => {
    const p = new THREE.Group(); p.position.set(x, 0.7, 0);
    p.add(box(0.24, 0.5, 0.24, pants, 0, -0.25, 0));
    p.add(box(0.26, 0.2, 0.28, shoes, 0, -0.6, 0.01));
    return p;
  };
  const legL = mkLeg(-0.13), legR = mkLeg(0.13);
  const torso = box(0.52, 0.7, 0.28, shirt, 0, 1.05, 0);
  const mkArm = (x) => {
    const p = new THREE.Group(); p.position.set(x, 1.38, 0);
    p.add(box(0.2, 0.46, 0.22, shirt, 0, -0.23, 0));
    p.add(box(0.19, 0.26, 0.21, tone, 0, -0.56, 0));
    return p;
  };
  const armL = mkArm(-0.36), armR = mkArm(0.36);
  const head = new THREE.Group(); head.position.set(0, 1.62, 0);
  const headBox = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.46, 0.46), [tone, tone, tone, tone, faceMat, tone]);
  headBox.position.y = 0.23; head.add(headBox);
  const hair = mat(HAIR[skin.hairColor]);
  const hs = skin.hairStyle;
  if (hs >= 1) { head.add(box(0.5, 0.12, 0.5, hair, 0, 0.47, 0)); head.add(box(0.5, 0.3, 0.1, hair, 0, 0.3, -0.2)); head.add(box(0.1, 0.18, 0.4, hair, 0.2, 0.36, 0)); head.add(box(0.1, 0.18, 0.4, hair, -0.2, 0.36, 0)); head.add(box(0.5, 0.1, 0.1, hair, 0, 0.43, 0.2)); }
  if (hs === 2) { head.add(box(0.5, 0.5, 0.12, hair, 0, 0.0, -0.2)); head.add(box(0.1, 0.4, 0.2, hair, 0.2, 0.08, -0.12)); head.add(box(0.1, 0.4, 0.2, hair, -0.2, 0.08, -0.12)); }
  if (hs === 3) for (let i = -2; i <= 2; i++) head.add(box(0.1, 0.16 + (i % 2 ? 0.06 : 0.14), 0.1, hair, i * 0.1, 0.58, (i % 2) * 0.08));
  const hatM = mat(CLOTHES[skin.hatColor]);
  if (skin.hat === 1) { head.add(box(0.5, 0.16, 0.5, hatM, 0, 0.5, 0)); head.add(box(0.5, 0.04, 0.24, hatM, 0, 0.44, 0.32)); }
  if (skin.hat === 2) { head.add(box(0.52, 0.24, 0.52, hatM, 0, 0.52, 0)); head.add(box(0.14, 0.12, 0.14, hatM, 0, 0.7, 0)); }
  if (skin.hat === 3) { const gold = new THREE.MeshLambertMaterial({ color: '#ffd23f', emissive: '#6a4a00' }); head.add(box(0.5, 0.1, 0.5, gold, 0, 0.5, 0)); for (const [x, z] of [[-0.2, -0.2], [0.2, -0.2], [-0.2, 0.2], [0.2, 0.2], [0, 0.22], [0, -0.22]]) head.add(box(0.09, 0.16, 0.09, gold, x, 0.6, z)); }
  if (skin.hat === 4) { head.add(box(0.72, 0.04, 0.72, hatM, 0, 0.47, 0)); head.add(box(0.44, 0.34, 0.44, hatM, 0, 0.66, 0)); head.add(box(0.46, 0.06, 0.46, mat('#222'), 0, 0.52, 0)); }
  let cape = null;
  if (skin.cape) { cape = new THREE.Group(); cape.position.set(0, 1.38, -0.15); cape.add(box(0.46, 0.8, 0.05, mat(CLOTHES[skin.capeColor]), 0, -0.4, -0.03)); }
  root.add(legL, legR, torso, armL, armR, head);
  if (cape) root.add(cape);
  root.userData = { legL, legR, armL, armR, head, cape, phase: 0 };
  return root;
}

/** speed: horizontal speed in blocks/s. Call every frame. */
export function animateAvatar(root, speed, dt) {
  const u = root.userData;
  u.phase += dt * Math.min(speed, 8) * 1.6;
  const amp = Math.min(speed / 4, 1) * 0.9;
  const s = Math.sin(u.phase) * amp;
  u.legL.rotation.x = s; u.legR.rotation.x = -s;
  u.armL.rotation.x = -s; u.armR.rotation.x = s;
  if (u.cape) u.cape.rotation.x = Math.min(0.15 + speed * 0.06, 0.7);
}

export function disposeAvatar(root) {
  root.traverse((o) => {
    if (o.geometry) o.geometry.dispose();
    if (o.material) (Array.isArray(o.material) ? o.material : [o.material]).forEach((m) => { if (m.map) m.map.dispose(); m.dispose(); });
  });
}
