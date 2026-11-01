// Character skin: a small description (indices into fixed palettes) that every client renders as a
// blocky player. Shared by the client (editor + rendering) and the room (validation + broadcast).

export const TONES = ['#f8d9b8', '#eab98b', '#cf9565', '#a86b43', '#7a4a2d', '#4f2f1d'];
export const HAIR = ['#1b1512', '#4a2e1a', '#8a5a2b', '#d6a84a', '#c24a2c', '#d8d8d8', '#3a6ee8', '#d84aa8'];
export const EYES = ['#2a62d6', '#2e8a4a', '#6b4423', '#222222', '#8a3ad8', '#2aa6b8'];
export const CLOTHES = ['#d94040', '#e8892a', '#e8c92a', '#4aa84a', '#2aa6b8', '#3a6ee8', '#8a3ad8', '#e060b0', '#f2f2f2', '#2c2c34', '#7a5230', '#7ac8e8'];
export const HAIR_STYLES = ['None', 'Short', 'Long', 'Spiky'];
export const HATS = ['None', 'Cap', 'Beanie', 'Crown', 'Top hat'];
export const EYE_STYLES = ['Round', 'Wide', 'Sleepy', 'Happy'];

export const DEFAULT_SKIN = { tone: 1, hairStyle: 1, hairColor: 1, eyeColor: 0, eyeStyle: 0, shirt: 4, pants: 5, shoes: 9, hat: 0, hatColor: 0, cape: false, capeColor: 0 };

const clamp = (v, n) => Math.max(0, Math.min(n - 1, Number(v) | 0));

/** Any input (even hostile) becomes a valid skin. */
export function cleanSkin(s) {
  const o = { ...DEFAULT_SKIN, ...(s && typeof s === 'object' ? s : {}) };
  return {
    tone: clamp(o.tone, TONES.length), hairStyle: clamp(o.hairStyle, HAIR_STYLES.length), hairColor: clamp(o.hairColor, HAIR.length),
    eyeColor: clamp(o.eyeColor, EYES.length), eyeStyle: clamp(o.eyeStyle, EYE_STYLES.length), shirt: clamp(o.shirt, CLOTHES.length),
    pants: clamp(o.pants, CLOTHES.length), shoes: clamp(o.shoes, CLOTHES.length), hat: clamp(o.hat, HATS.length),
    hatColor: clamp(o.hatColor, CLOTHES.length), cape: o.cape === true, capeColor: clamp(o.capeColor, CLOTHES.length),
  };
}

export function randomSkin(rand = Math.random) {
  const r = (n) => Math.floor(rand() * n);
  return cleanSkin({ tone: r(TONES.length), hairStyle: r(HAIR_STYLES.length), hairColor: r(HAIR.length), eyeColor: r(EYES.length), eyeStyle: r(EYE_STYLES.length), shirt: r(CLOTHES.length), pants: r(CLOTHES.length), shoes: r(CLOTHES.length), hat: r(3) === 0 ? 1 + r(HATS.length - 1) : 0, hatColor: r(CLOTHES.length), cape: r(4) === 0, capeColor: r(CLOTHES.length) });
}

/** Players who never picked a skin get a stable, varied one derived from their id. */
export function skinForId(id) {
  let s = (Number(id) * 2654435761) >>> 0 || 1;
  return randomSkin(() => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 4294967296; });
}
