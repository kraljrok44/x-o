import type { CharacterPalette } from '../player/CharacterDefinition';
import { COSMETIC_BY_ID } from '../shop/CosmeticCatalog';
import { ellipse, mix, roundRect, shade, star, tint, type Ctx } from './draw';
import type { CosmeticLayer, EyeAnchor, MonsterPose, RigAnchors } from './CharacterRig';

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
    case 'hat_cowboy':
    case 'hat_tengallon':
    case 'hat_sombrero': {
      const tall = m === 'hat_tengallon' ? 1.5 : m === 'hat_sombrero' ? 0.85 : 1;
      const brim = m === 'hat_sombrero' ? 1.55 : 1.05;
      // Brim curling up at both ends.
      ctx.beginPath();
      ctx.moveTo(-w * 0.62 * brim, 0.1);
      ctx.quadraticCurveTo(-w * 0.5 * brim, -0.02, 0, -0.02);
      ctx.quadraticCurveTo(w * 0.5 * brim, -0.02, w * 0.62 * brim, 0.1);
      ctx.quadraticCurveTo(w * 0.45 * brim, 0.05, 0, 0.06);
      ctx.quadraticCurveTo(-w * 0.45 * brim, 0.05, -w * 0.62 * brim, 0.1);
      ctx.closePath();
      outlined(ctx, shade(color, 0.08));
      // Crown with the classic pinch on top.
      const ch = w * 0.42 * tall;
      ctx.beginPath();
      ctx.moveTo(-w * 0.3, 0.04);
      ctx.quadraticCurveTo(-w * 0.34, ch * 0.8, -w * 0.18, ch);
      ctx.quadraticCurveTo(0, ch * (m === 'hat_sombrero' ? 1.05 : 0.82), w * 0.18, ch);
      ctx.quadraticCurveTo(w * 0.34, ch * 0.8, w * 0.3, 0.04);
      ctx.closePath();
      outlined(ctx, color);
      // Band.
      ctx.beginPath();
      ctx.moveTo(-w * 0.31, 0.1);
      ctx.lineTo(w * 0.31, 0.1);
      ctx.lineWidth = 0.06;
      ctx.strokeStyle = m === 'hat_sombrero' ? '#e8473b' : shade(color, 0.55);
      ctx.stroke();
      if (m !== 'hat_sombrero') {
        ctx.beginPath();
        star(ctx, w * 0.12, 0.1, 0.035, 0.45, 5);
        ctx.fillStyle = '#ffd23f';
        ctx.fill();
      }
      break;
    }
    case 'hat_miner': {
      ctx.beginPath();
      ctx.ellipse(0, 0.03, w * 0.46, w * 0.38, 0, 0, Math.PI);
      ctx.closePath();
      outlined(ctx, color);
      ctx.beginPath();
      roundRect(ctx, -w * 0.55, -0.01, w * 1.1, 0.07, 0.03);
      outlined(ctx, shade(color, 0.25));
      // Lamp.
      ctx.beginPath();
      roundRect(ctx, w * 0.12, w * 0.1, 0.12, 0.1, 0.03);
      outlined(ctx, '#3a3448');
      ctx.beginPath();
      ellipse(ctx, w * 0.12 + 0.11, w * 0.1 + 0.05, 0.035, 0.04);
      ctx.fillStyle = '#ffe14d';
      ctx.fill();
      ctx.beginPath();
      ctx.moveTo(w * 0.12 + 0.12, w * 0.1 + 0.08);
      ctx.lineTo(w * 1.4, w * 0.28);
      ctx.lineTo(w * 1.4, w * -0.08);
      ctx.lineTo(w * 0.12 + 0.12, w * 0.1 + 0.02);
      ctx.fillStyle = 'rgba(255,240,150,0.25)';
      ctx.fill();
      break;
    }
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
  const [near, far] = a.eyes;
  // Two-lens items sit on both eyes; single-lens items (monocle, patch) on
  // the near eye, the character's right eye that faces the camera while racing.
  const both = [near, far];
  ctx.save();
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  const lens = (e: EyeAnchor, grow: number, path: (r: number) => void) => {
    ctx.save();
    ctx.translate(e.x, e.y);
    ctx.scale(e.sx, 1);
    path(e.r * grow);
    ctx.restore();
  };
  const bridge = (r0: number, r1: number, dy = 0, width = 0.03, stroke = color) => {
    ctx.beginPath();
    ctx.moveTo(near.x + r0 * near.sx, near.y + dy);
    ctx.quadraticCurveTo((near.x + far.x) / 2, (near.y + far.y) / 2 + dy + 0.02, far.x - r1 * far.sx, far.y + dy);
    ctx.lineWidth = width;
    ctx.strokeStyle = stroke;
    ctx.stroke();
  };
  // Temple arm back toward the ear in the side view.
  const temple = (r: number, stroke = color) => {
    if (!a.side) return;
    ctx.beginPath();
    ctx.moveTo(near.x - r, near.y + 0.01);
    ctx.lineTo(near.x - r - 0.13, near.y + 0.03);
    ctx.lineWidth = 0.025;
    ctx.strokeStyle = stroke;
    ctx.stroke();
  };
  switch (m) {
    case 'eyes_round': {
      for (const e of both) {
        lens(e, 1.45, (r) => {
          ctx.beginPath();
          ellipse(ctx, 0, 0, r, r);
          ctx.fillStyle = 'rgba(200,230,255,0.18)';
          ctx.fill();
          ctx.lineWidth = 0.032;
          ctx.strokeStyle = color;
          ctx.stroke();
        });
      }
      bridge(near.r * 1.45, far.r * 1.45);
      temple(near.r * 1.45);
      break;
    }
    case 'eyes_monocle': {
      lens(near, 1.5, (r) => {
        ctx.beginPath();
        ellipse(ctx, 0, 0, r, r);
        ctx.fillStyle = 'rgba(200,230,255,0.2)';
        ctx.fill();
        ctx.lineWidth = 0.035;
        ctx.strokeStyle = color;
        ctx.stroke();
      });
      const r = near.r * 1.5;
      ctx.beginPath();
      ctx.moveTo(near.x, near.y - r);
      ctx.quadraticCurveTo(near.x + 0.02, near.y - r * 2.4, near.x - 0.08, near.y - r * 3);
      ctx.lineWidth = 0.015;
      ctx.strokeStyle = color;
      ctx.stroke();
      break;
    }
    case 'eyes_patch': {
      // Strap round the head, patch over the near eye only.
      ctx.beginPath();
      if (a.side) {
        ctx.moveTo(near.x - 0.25, near.y + 0.13);
        ctx.lineTo(near.x + near.r, near.y + near.r * 0.6);
      } else {
        const half = a.headW * 0.44;
        ctx.moveTo(-half + (near.x + 0.1), near.y + 0.1);
        ctx.lineTo(half + (near.x + 0.1) * 0.6, far.y + 0.12);
      }
      ctx.lineWidth = 0.025;
      ctx.strokeStyle = color;
      ctx.stroke();
      lens(near, 1.35, (r) => {
        ctx.beginPath();
        ellipse(ctx, 0, 0, r, r * 0.9);
        outlined(ctx, color);
      });
      break;
    }
    case 'eyes_heart':
    case 'eyes_star': {
      for (const e of both) {
        lens(e, 1.35, (r) => {
          ctx.beginPath();
          if (m === 'eyes_star') star(ctx, 0, 0, r * 1.25, 0.5);
          else {
            const k = r * 1.05;
            ctx.moveTo(0, -k * 0.9);
            ctx.bezierCurveTo(-k * 1.4, k * 0.1, -k * 0.5, k * 1.05, 0, k * 0.45);
            ctx.bezierCurveTo(k * 0.5, k * 1.05, k * 1.4, k * 0.1, 0, -k * 0.9);
            ctx.closePath();
          }
          outlined(ctx, color);
          ctx.beginPath();
          ellipse(ctx, -r * 0.35, r * 0.35, r * 0.18, r * 0.12, -0.5);
          ctx.fillStyle = 'rgba(255,255,255,0.7)';
          ctx.fill();
        });
      }
      bridge(near.r * 1.2, far.r * 1.2, 0.01, 0.028, OL);
      temple(near.r * 1.3, OL);
      break;
    }
    case 'eyes_visor': {
      // One band across both eyes.
      const xl = Math.min(near.x - near.r * 1.4 * near.sx, far.x - far.r * 1.4 * far.sx);
      const xr = Math.max(near.x + near.r * 1.4 * near.sx, far.x + far.r * 1.4 * far.sx);
      const cy = (near.y + far.y) / 2;
      const hh = Math.max(near.r, far.r) * 1.25;
      ctx.beginPath();
      roundRect(ctx, xl, cy - hh, xr - xl, hh * 2, hh * 0.8);
      ctx.fillStyle = 'rgba(76,242,255,0.55)';
      ctx.fill();
      ctx.lineWidth = 0.03;
      ctx.strokeStyle = OL;
      ctx.stroke();
      const sweep = (pose.time * 0.6) % 1;
      ctx.beginPath();
      ctx.moveTo(xl + 0.03 + sweep * (xr - xl - 0.06), cy + hh * 0.7);
      ctx.lineTo(xl + sweep * (xr - xl - 0.06), cy - hh * 0.7);
      ctx.lineWidth = 0.04;
      ctx.strokeStyle = 'rgba(255,255,255,0.8)';
      ctx.stroke();
      temple(near.r * 1.4, OL);
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
      // Hangs off the back far enough to be seen past the torso.
      roundRect(ctx, bx - 0.26, -0.27, 0.34, 0.42, 0.08);
      outlined(ctx, color);
      ctx.beginPath();
      roundRect(ctx, bx - 0.24, -0.04, 0.3, 0.16, 0.05);
      outlined(ctx, shade(color, 0.2));
      ctx.beginPath();
      roundRect(ctx, bx - 0.13, -0.08, 0.08, 0.06, 0.02);
      outlined(ctx, '#f2c14e');
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
      // Poncho cape hanging from the shoulders and billowing back.
      const wave = Math.sin(t * 10) * 0.04;
      ctx.beginPath();
      ctx.moveTo(bx + 0.08, 0.22);
      ctx.quadraticCurveTo(bx - 0.2, 0.2, bx - 0.6 + wave, -0.22);
      ctx.quadraticCurveTo(bx - 0.48, -0.28 + wave, bx - 0.36, -0.26);
      ctx.quadraticCurveTo(bx - 0.24, -0.34 - wave, bx - 0.1, -0.3);
      ctx.quadraticCurveTo(bx + 0.02, -0.1, bx + 0.08, 0.22);
      ctx.closePath();
      outlined(ctx, color);
      // Woven stripes.
      ctx.save();
      ctx.clip();
      ctx.lineWidth = 0.035;
      for (const [k, c] of [
        [0, '#ffd23f'],
        [1, shade(color, 0.35)],
      ] as const) {
        ctx.beginPath();
        ctx.moveTo(bx + 0.1, 0.06 - k * 0.12);
        ctx.lineTo(bx - 0.7, -0.08 - k * 0.12 + wave);
        ctx.strokeStyle = c;
        ctx.stroke();
      }
      ctx.restore();
      break;
    }
    case 'back_leafwings': {
      for (const k of [0, 1]) {
        const flap = Math.sin(t * 10 + k * 0.6) * 0.25;
        ctx.save();
        ctx.translate(bx + 0.02, 0.08 + k * 0.05);
        ctx.rotate(0.6 + flap - k * 0.35);
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.quadraticCurveTo(-0.28, 0.26, -0.78, 0.08);
        ctx.quadraticCurveTo(-0.62, -0.02, -0.7, -0.08);
        ctx.quadraticCurveTo(-0.5, -0.06, -0.55, -0.14);
        ctx.quadraticCurveTo(-0.3, -0.16, 0, 0);
        outlined(ctx, k ? shade(color, 0.15) : color);
        ctx.restore();
      }
      break;
    }
    case 'back_rocket': {
      ctx.save();
      ctx.translate(bx - 0.14, -0.02);
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
