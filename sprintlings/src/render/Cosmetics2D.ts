import type { CharacterPalette } from '../player/CharacterDefinition';
import { COSMETIC_BY_ID } from '../shop/CosmeticCatalog';
import { ellipse, mix, roundRect, shade, star, tint, type Ctx } from './draw';
import type { CosmeticLayer, MonsterPose, RigAnchors } from './CharacterRig';

/**
 * Vector cosmetics drawn on the monster rig, in body space (+y up, origin
 * at the body centre). Purely visual: the simulation never reads them.
 */

const OL = '#2a1d2e';
const LW = 0.035;

function model(id: string | undefined): { model: string; color: string } | null {
  if (!id) return null;
  const def = COSMETIC_BY_ID[id];
  if (!def) return null;
  return { model: def.model ?? def.id, color: def.color };
}

function outlined(ctx: Ctx, fill: string): void {
  ctx.fillStyle = fill;
  ctx.fill();
  ctx.lineWidth = LW;
  ctx.strokeStyle = OL;
  ctx.stroke();
}

function drawHat(ctx: Ctx, m: string, color: string, a: RigAnchors, pose: MonsterPose): void {
  const w = a.headW;
  ctx.save();
  ctx.translate(a.headTop.x, a.headTop.y - 0.04);
  ctx.rotate(0.12 + pose.wobbleA * 0.12);
  ctx.lineJoin = 'round';
  switch (m) {
    case 'hat_leaf': {
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.quadraticCurveTo(-w * 0.35, w * 0.3, 0.02, w * 0.62);
      ctx.quadraticCurveTo(w * 0.38, w * 0.3, 0, 0);
      outlined(ctx, color);
      ctx.beginPath();
      ctx.moveTo(0, 0.02);
      ctx.quadraticCurveTo(0.02, w * 0.3, 0.02, w * 0.55);
      ctx.lineWidth = LW * 0.7;
      ctx.strokeStyle = shade(color, 0.35);
      ctx.stroke();
      break;
    }
    case 'hat_acorn': {
      ctx.beginPath();
      ctx.ellipse(0, 0.05, w * 0.48, w * 0.36, 0, 0, Math.PI);
      ctx.closePath();
      outlined(ctx, color);
      ctx.beginPath();
      roundRect(ctx, -w * 0.5, -0.02, w, 0.1, 0.05);
      outlined(ctx, shade(color, 0.25));
      ctx.beginPath();
      ctx.moveTo(0, w * 0.4);
      ctx.lineTo(0.03, w * 0.52);
      ctx.lineWidth = 0.05;
      ctx.strokeStyle = OL;
      ctx.stroke();
      break;
    }
    case 'hat_party': {
      ctx.beginPath();
      ctx.moveTo(-w * 0.3, 0);
      ctx.lineTo(0.02, w * 0.85);
      ctx.lineTo(w * 0.3, 0);
      ctx.closePath();
      outlined(ctx, color);
      ctx.save();
      ctx.clip();
      ctx.strokeStyle = tint(color, 0.6);
      ctx.lineWidth = 0.05;
      for (let i = 0; i < 4; i++) {
        ctx.beginPath();
        ctx.moveTo(-w * 0.4, 0.08 + i * 0.13);
        ctx.lineTo(w * 0.4, 0.16 + i * 0.13);
        ctx.stroke();
      }
      ctx.restore();
      ctx.beginPath();
      ellipse(ctx, 0.02, w * 0.88, 0.06, 0.06);
      outlined(ctx, '#ffe14d');
      break;
    }
    case 'hat_flower': {
      for (let i = 0; i < 5; i++) {
        const x = -w * 0.36 + i * w * 0.18;
        const y = 0.04 + Math.sin(i * 1.3) * 0.02;
        for (let k = 0; k < 5; k++) {
          const ang = (k / 5) * Math.PI * 2 + i;
          ctx.beginPath();
          ellipse(ctx, x + Math.cos(ang) * 0.045, y + Math.sin(ang) * 0.045, 0.04, 0.04);
          ctx.fillStyle = color;
          ctx.fill();
        }
        ctx.beginPath();
        ellipse(ctx, x, y, 0.03, 0.03);
        ctx.fillStyle = '#ffb020';
        ctx.fill();
      }
      break;
    }
    case 'hat_mushroom': {
      ctx.beginPath();
      ctx.ellipse(0, 0.02, w * 0.55, w * 0.42, 0, 0, Math.PI);
      ctx.closePath();
      outlined(ctx, color);
      ctx.fillStyle = '#ffffff';
      for (const [x, y, r] of [
        [-0.14, 0.12, 0.05],
        [0.1, 0.18, 0.06],
        [0.0, 0.07, 0.035],
        [0.2, 0.06, 0.03],
      ]) {
        ctx.beginPath();
        ellipse(ctx, x * w * 2.2, y, r, r);
        ctx.fill();
      }
      break;
    }
    case 'hat_propeller': {
      ctx.beginPath();
      ctx.ellipse(0, 0, w * 0.42, w * 0.3, 0, 0, Math.PI);
      ctx.closePath();
      outlined(ctx, color);
      ctx.beginPath();
      ctx.ellipse(0, 0, w * 0.42, w * 0.3, 0, Math.PI * 0.25, Math.PI * 0.5);
      ctx.lineTo(0, 0);
      ctx.closePath();
      ctx.fillStyle = '#ffe14d';
      ctx.fill();
      ctx.beginPath();
      ctx.moveTo(0, w * 0.3);
      ctx.lineTo(0, w * 0.42);
      ctx.lineWidth = 0.035;
      ctx.strokeStyle = OL;
      ctx.stroke();
      const spin = Math.cos(pose.time * 22);
      ctx.beginPath();
      ellipse(ctx, 0, w * 0.44, w * 0.42 * Math.abs(spin) + 0.02, 0.04);
      outlined(ctx, '#ff5a4f');
      break;
    }
    case 'hat_wizard': {
      ctx.beginPath();
      ctx.moveTo(-w * 0.55, 0);
      ctx.quadraticCurveTo(0, 0.08, w * 0.55, 0);
      ctx.quadraticCurveTo(0, -0.06, -w * 0.55, 0);
      outlined(ctx, color);
      ctx.beginPath();
      ctx.moveTo(-w * 0.32, 0.02);
      ctx.quadraticCurveTo(-0.05, w * 0.6, -w * 0.25 + pose.wobbleA * 0.1, w * 1.05);
      ctx.quadraticCurveTo(w * 0.15, w * 0.5, w * 0.32, 0.02);
      ctx.closePath();
      outlined(ctx, color);
      ctx.beginPath();
      star(ctx, 0.02, w * 0.35, 0.07);
      ctx.fillStyle = '#ffe14d';
      ctx.fill();
      break;
    }
    case 'hat_tophat': {
      ctx.beginPath();
      roundRect(ctx, -w * 0.48, -0.02, w * 0.96, 0.07, 0.03);
      outlined(ctx, color);
      ctx.beginPath();
      roundRect(ctx, -w * 0.3, 0.03, w * 0.6, w * 0.6, 0.03);
      outlined(ctx, color);
      ctx.beginPath();
      ctx.rect(-w * 0.3, 0.07, w * 0.6, 0.07);
      ctx.fillStyle = '#e8473b';
      ctx.fill();
      break;
    }
    case 'hat_horns': {
      for (const dir of [-1, 1]) {
        ctx.beginPath();
        ctx.moveTo(dir * w * 0.25, 0);
        ctx.bezierCurveTo(dir * w * 0.7, 0.05, dir * w * 0.75, 0.3, dir * w * 0.5, 0.32);
        ctx.bezierCurveTo(dir * w * 0.62, 0.2, dir * w * 0.45, 0.1, dir * w * 0.12, 0.06);
        ctx.closePath();
        outlined(ctx, color);
      }
      break;
    }
    case 'hat_crown': {
      ctx.beginPath();
      ctx.moveTo(-w * 0.38, 0);
      ctx.lineTo(-w * 0.42, w * 0.38);
      ctx.lineTo(-w * 0.2, w * 0.2);
      ctx.lineTo(0, w * 0.45);
      ctx.lineTo(w * 0.2, w * 0.2);
      ctx.lineTo(w * 0.42, w * 0.38);
      ctx.lineTo(w * 0.38, 0);
      ctx.closePath();
      outlined(ctx, color);
      for (const [x, c] of [
        [-w * 0.2, '#ff4f8a'],
        [0, '#4fd6ff'],
        [w * 0.2, '#5bd16b'],
      ] as const) {
        ctx.beginPath();
        ellipse(ctx, x, 0.07, 0.035, 0.035);
        ctx.fillStyle = c;
        ctx.fill();
      }
      ctx.beginPath();
      star(ctx, w * 0.25, w * 0.45, 0.04 + Math.max(0, Math.sin(pose.time * 3)) * 0.04, 0.3, 4);
      ctx.fillStyle = '#ffffff';
      ctx.fill();
      break;
    }
    case 'hat_halo': {
      const y = w * 0.35 + Math.sin(pose.time * 2.5) * 0.03;
      ctx.beginPath();
      ctx.ellipse(0, y, w * 0.42, w * 0.1, 0, 0, Math.PI * 2);
      ctx.lineWidth = 0.08;
      ctx.strokeStyle = color;
      ctx.shadowColor = color;
      ctx.shadowBlur = 8;
      ctx.stroke();
      ctx.shadowBlur = 0;
      break;
    }
    case 'hat_pumpkin': {
      ctx.beginPath();
      ctx.ellipse(0, 0.05, w * 0.55, w * 0.38, 0, Math.PI * 0.05, Math.PI * 0.95);
      ctx.closePath();
      outlined(ctx, color);
      ctx.strokeStyle = shade(color, 0.3);
      ctx.lineWidth = 0.03;
      for (const x of [-0.12, 0.12]) {
        ctx.beginPath();
        ctx.moveTo(x * w * 2.5, 0.06);
        ctx.quadraticCurveTo(x * w * 1.2, w * 0.25, 0, w * 0.4);
        ctx.stroke();
      }
      ctx.beginPath();
      ctx.moveTo(0, w * 0.4);
      ctx.quadraticCurveTo(0.04, w * 0.55, 0.12, w * 0.55);
      ctx.lineWidth = 0.05;
      ctx.strokeStyle = '#3f8f3a';
      ctx.stroke();
      break;
    }
    default: {
      ctx.beginPath();
      ctx.ellipse(0, 0.02, w * 0.45, w * 0.32, 0, 0, Math.PI);
      ctx.closePath();
      outlined(ctx, color);
    }
  }
  ctx.restore();
}

function drawEyewear(ctx: Ctx, m: string, color: string, a: RigAnchors, pose: MonsterPose): void {
  if (pose.eyes === 'dizzy') return;
  const span = a.eyeSpan;
  const cx = a.eyeCenter.x;
  const cy = a.eyeCenter.y;
  const r = Math.min(0.16, span * 0.3);
  const xs = span > 0.45 ? [cx - span * 0.27, cx + span * 0.27] : [cx];
  ctx.save();
  ctx.lineJoin = 'round';
  switch (m) {
    case 'eyes_round':
    case 'eyes_monocle': {
      const list = m === 'eyes_monocle' ? [xs[xs.length - 1]] : xs;
      for (const x of list) {
        ctx.beginPath();
        ellipse(ctx, x, cy, r * 1.05, r * 1.05);
        ctx.fillStyle = 'rgba(200,230,255,0.18)';
        ctx.fill();
        ctx.lineWidth = 0.035;
        ctx.strokeStyle = color;
        ctx.stroke();
      }
      if (list.length > 1) {
        ctx.beginPath();
        ctx.moveTo(list[0] + r, cy);
        ctx.lineTo(list[1] - r, cy);
        ctx.stroke();
      } else {
        ctx.beginPath();
        ctx.moveTo(list[0], cy - r);
        ctx.quadraticCurveTo(list[0] + 0.02, cy - r * 2.6, list[0] - 0.08, cy - r * 3.2);
        ctx.lineWidth = 0.015;
        ctx.stroke();
      }
      break;
    }
    case 'eyes_patch': {
      const x = xs[xs.length - 1];
      ctx.beginPath();
      ctx.moveTo(cx - span * 0.6, cy + r * 1.2);
      ctx.lineTo(cx + span * 0.6, cy - r * 0.4);
      ctx.lineWidth = 0.025;
      ctx.strokeStyle = color;
      ctx.stroke();
      ctx.beginPath();
      ellipse(ctx, x, cy, r * 0.95, r * 0.85);
      outlined(ctx, color);
      break;
    }
    case 'eyes_heart':
    case 'eyes_star': {
      for (const x of xs) {
        ctx.beginPath();
        if (m === 'eyes_star') star(ctx, x, cy, r * 1.3, 0.5);
        else {
          const s = r * 1.15;
          ctx.moveTo(x, cy - s * 0.9);
          ctx.bezierCurveTo(x - s * 1.4, cy + s * 0.1, x - s * 0.5, cy + s * 1.05, x, cy + s * 0.45);
          ctx.bezierCurveTo(x + s * 0.5, cy + s * 1.05, x + s * 1.4, cy + s * 0.1, x, cy - s * 0.9);
          ctx.closePath();
        }
        outlined(ctx, color);
        ctx.beginPath();
        ellipse(ctx, x - r * 0.35, cy + r * 0.35, r * 0.18, r * 0.12, -0.5);
        ctx.fillStyle = 'rgba(255,255,255,0.7)';
        ctx.fill();
      }
      if (xs.length > 1) {
        ctx.beginPath();
        ctx.moveTo(xs[0] + r, cy + r * 0.2);
        ctx.lineTo(xs[1] - r, cy + r * 0.2);
        ctx.lineWidth = 0.03;
        ctx.strokeStyle = OL;
        ctx.stroke();
      }
      break;
    }
    case 'eyes_visor': {
      ctx.beginPath();
      roundRect(ctx, cx - span * 0.62, cy - r * 0.7, span * 1.24, r * 1.4, r * 0.6);
      ctx.fillStyle = 'rgba(76,242,255,0.55)';
      ctx.fill();
      ctx.lineWidth = 0.03;
      ctx.strokeStyle = OL;
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(cx - span * 0.45 + ((pose.time * 0.6) % 1) * span * 0.9, cy + r * 0.5);
      ctx.lineTo(cx - span * 0.5 + ((pose.time * 0.6) % 1) * span * 0.9, cy - r * 0.5);
      ctx.lineWidth = 0.04;
      ctx.strokeStyle = 'rgba(255,255,255,0.8)';
      ctx.stroke();
      break;
    }
  }
  ctx.restore();
}

function drawBack(ctx: Ctx, m: string, color: string, a: RigAnchors, pose: MonsterPose): void {
  const bx = a.back.x;
  const t = pose.time;
  ctx.save();
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  switch (m) {
    case 'back_scarf': {
      // Neck wrap plus two tails fluttering behind.
      ctx.beginPath();
      for (let k = 0; k < 2; k++) {
        const off = k * 0.08;
        ctx.moveTo(bx + 0.05, -0.05 - off);
        for (let i = 1; i <= 6; i++) {
          const x = bx + 0.05 - i * 0.09;
          const y = -0.05 - off - i * 0.01 + Math.sin(t * 14 - i * 1.1 + k) * 0.035 * i * 0.4;
          ctx.lineTo(x, y);
        }
      }
      ctx.lineWidth = 0.09;
      ctx.strokeStyle = OL;
      ctx.stroke();
      ctx.lineWidth = 0.06;
      ctx.strokeStyle = color;
      ctx.stroke();
      break;
    }
    case 'back_pack': {
      ctx.beginPath();
      roundRect(ctx, bx - 0.12, -0.25, 0.3, 0.38, 0.07);
      outlined(ctx, color);
      ctx.beginPath();
      roundRect(ctx, bx - 0.1, -0.2, 0.24, 0.12, 0.04);
      outlined(ctx, shade(color, 0.2));
      break;
    }
    case 'back_balloon': {
      const bob = Math.sin(t * 2.2) * 0.06;
      const sway = Math.sin(t * 1.7) * 0.06 + pose.wobbleB * 0.1;
      const top = { x: bx - 0.25 + sway, y: a.bodyRy + 0.65 + bob };
      ctx.beginPath();
      ctx.moveTo(bx + 0.05, -0.1);
      ctx.quadraticCurveTo(bx - 0.25, a.bodyRy * 0.5, top.x, top.y - 0.22);
      ctx.lineWidth = 0.015;
      ctx.strokeStyle = OL;
      ctx.stroke();
      ctx.beginPath();
      ellipse(ctx, top.x, top.y, 0.2, 0.24);
      outlined(ctx, color);
      ctx.beginPath();
      ellipse(ctx, top.x - 0.07, top.y + 0.08, 0.05, 0.07, 0.4);
      ctx.fillStyle = 'rgba(255,255,255,0.6)';
      ctx.fill();
      break;
    }
    case 'back_cape': {
      ctx.beginPath();
      ctx.moveTo(bx + 0.25, a.bodyRy * 0.25);
      for (let i = 0; i <= 5; i++) {
        const k = i / 5;
        const x = bx + 0.2 - k * 0.65;
        const y = a.bodyRy * 0.25 - k * 0.55 + Math.sin(t * 12 - k * 4) * 0.05 * k;
        ctx.lineTo(x, y);
      }
      ctx.lineTo(bx + 0.05, -a.bodyRy * 0.6);
      ctx.closePath();
      outlined(ctx, color);
      break;
    }
    case 'back_leafwings': {
      for (const k of [0, 1]) {
        const flap = Math.sin(t * 10 + k * 0.6) * 0.25;
        ctx.save();
        ctx.translate(bx + 0.1, 0.05 + k * 0.05);
        ctx.rotate(0.7 + flap - k * 0.35);
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.quadraticCurveTo(-0.2, 0.18, -0.55, 0.05);
        ctx.quadraticCurveTo(-0.25, -0.12, 0, 0);
        outlined(ctx, k ? shade(color, 0.15) : color);
        ctx.restore();
      }
      break;
    }
    case 'back_rocket': {
      ctx.save();
      ctx.translate(bx - 0.02, -0.02);
      ctx.rotate(0.2);
      ctx.beginPath();
      roundRect(ctx, -0.09, -0.25, 0.18, 0.46, 0.09);
      outlined(ctx, color);
      ctx.beginPath();
      ellipse(ctx, 0, 0.05, 0.045, 0.045);
      outlined(ctx, '#4fd6ff');
      const fl = 0.12 + Math.sin(t * 40) * 0.04;
      ctx.beginPath();
      ctx.moveTo(-0.06, -0.25);
      ctx.quadraticCurveTo(0, -0.25 - fl * 2, 0.06, -0.25);
      ctx.fillStyle = '#ffb020';
      ctx.fill();
      ctx.restore();
      break;
    }
  }
  ctx.restore();
}

/** Builds the back/front cosmetic layers for a loadout (null when nothing to draw). */
export function cosmeticLayers(loadout: Record<string, string>): { back?: CosmeticLayer; front?: CosmeticLayer } {
  const hat = model(loadout.hat);
  const eyes = model(loadout.eyes);
  const back = model(loadout.back);
  const out: { back?: CosmeticLayer; front?: CosmeticLayer } = {};
  if (back) out.back = (ctx, a, pose) => drawBack(ctx, back.model, back.color, a, pose);
  if (hat || eyes) {
    out.front = (ctx, a, pose) => {
      if (eyes) drawEyewear(ctx, eyes.model, eyes.color, a, pose);
      if (hat) drawHat(ctx, hat.model, hat.color, a, pose);
    };
  }
  return out;
}

/** Palette for a character's colour variant (or its base palette). */
export function paletteFor(base: CharacterPalette, variants: { id: string; palette: CharacterPalette }[], variantId: string | null): CharacterPalette {
  return (variantId && variants.find((v) => v.id === variantId)?.palette) || base;
}

/** Trail particle look for a trail cosmetic id. */
export function trailStyle(id: string | undefined): { kind: 'dust' | 'sparkle' | 'leaf' | 'bubble' | 'note' | 'flame' | 'ribbon'; color: string } {
  const m = model(id);
  const color = m?.color ?? '#e8dcc8';
  switch (m?.model) {
    case 'trail_sparkle':
      return { kind: 'sparkle', color };
    case 'trail_leaves':
      return { kind: 'leaf', color };
    case 'trail_bubbles':
      return { kind: 'bubble', color };
    case 'trail_notes':
      return { kind: 'note', color };
    case 'trail_flame':
      return { kind: 'flame', color };
    case 'trail_rainbow':
      return { kind: 'ribbon', color };
    default:
      return { kind: 'dust', color: mix(color, '#ffffff', 0.2) };
  }
}
