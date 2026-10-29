import type { CharacterPalette } from '../player/CharacterDefinition';
import { COSMETIC_BY_ID } from '../shop/CosmeticCatalog';
import { ellipse, mix, roundRect, shade, star, tint, type Ctx } from './draw';
import type { EyeAnchor, MonsterPose, MountLayer, RigAnchors, RigLayers } from './CharacterRig';

/**
 * Vector cosmetics drawn on the monster rig, in body space (+y up, origin
 * at the body centre). Purely visual: the simulation never reads them.
 */

const OL = '#1f1218';
const LW = 0.038;

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
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
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
    case 'hat_fedora': {
      // Pinched crown, dark band, brim dipping at the front.
      ctx.beginPath();
      ctx.moveTo(-w * 0.62, 0.02);
      ctx.quadraticCurveTo(0, -0.08, w * 0.66, 0.05);
      ctx.quadraticCurveTo(0, 0.07, -w * 0.62, 0.02);
      ctx.closePath();
      outlined(ctx, color);
      ctx.beginPath();
      ctx.moveTo(-w * 0.34, 0.03);
      ctx.lineTo(-w * 0.3, 0.24);
      ctx.quadraticCurveTo(-w * 0.1, 0.3, 0, 0.24);
      ctx.quadraticCurveTo(w * 0.1, 0.3, w * 0.3, 0.24);
      ctx.lineTo(w * 0.34, 0.03);
      ctx.closePath();
      outlined(ctx, color);
      ctx.beginPath();
      ctx.rect(-w * 0.33, 0.04, w * 0.66, 0.06);
      ctx.fillStyle = '#a3161c';
      ctx.fill();
      ctx.beginPath();
      ctx.moveTo(-w * 0.05, 0.22);
      ctx.lineTo(0, 0.17);
      ctx.lineTo(w * 0.05, 0.22);
      ctx.lineWidth = 0.02;
      ctx.strokeStyle = shade(color, 0.4);
      ctx.stroke();
      break;
    }
    case 'hat_astro': {
      // Glass dome round the whole head, with a collar ring at the neck.
      ctx.rotate(-(0.12 + pose.wobbleA * 0.12));
      ctx.translate(-a.headTop.x, -(a.headTop.y - 0.04));
      const r = w * 0.74;
      ctx.beginPath();
      ellipse(ctx, 0, 0.02, r, r * 1.02);
      ctx.fillStyle = 'rgba(190,225,255,0.28)';
      ctx.fill();
      ctx.lineWidth = 0.035;
      ctx.strokeStyle = '#ffffff';
      ctx.stroke();
      ctx.lineWidth = 0.015;
      ctx.strokeStyle = OL;
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(0, 0.02, r * 0.78, Math.PI * 0.6, Math.PI * 0.85);
      ctx.lineWidth = 0.04;
      ctx.strokeStyle = 'rgba(255,255,255,0.75)';
      ctx.stroke();
      ctx.beginPath();
      roundRect(ctx, -r * 0.72, -r * 0.98, r * 1.44, 0.11, 0.05);
      outlined(ctx, '#c8ccd6');
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
    case 'eyes_shades': {
      for (const e of both) {
        lens(e, 1.45, (r) => {
          ctx.beginPath();
          roundRect(ctx, -r, -r * 0.75, r * 2, r * 1.5, r * 0.45);
          ctx.fillStyle = color;
          ctx.fill();
          ctx.lineWidth = 0.025;
          ctx.strokeStyle = OL;
          ctx.stroke();
          ctx.beginPath();
          ctx.moveTo(-r * 0.6, r * 0.4);
          ctx.lineTo(-r * 0.1, r * 0.4);
          ctx.lineWidth = 0.025;
          ctx.strokeStyle = 'rgba(255,255,255,0.55)';
          ctx.stroke();
        });
      }
      bridge(near.r * 1.4, far.r * 1.4, 0.01, 0.03, OL);
      temple(near.r * 1.45, OL);
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
    case 'back_jetpack': {
      // Twin oxygen tanks with orange caps and a little nozzle.
      for (const k of [1, 0]) {
        const x = bx - 0.18 + k * 0.1;
        ctx.beginPath();
        roundRect(ctx, x - 0.08, -0.26 + k * 0.02, 0.16, 0.48, 0.08);
        outlined(ctx, k ? shade(color, 0.12) : color);
        ctx.beginPath();
        roundRect(ctx, x - 0.07, 0.16 + k * 0.02, 0.14, 0.07, 0.03);
        outlined(ctx, '#ff7a2a');
      }
      ctx.beginPath();
      ctx.moveTo(bx - 0.18, -0.26);
      ctx.lineTo(bx - 0.22, -0.34);
      ctx.lineTo(bx - 0.12, -0.34);
      ctx.closePath();
      outlined(ctx, '#8a93a3');
      ctx.beginPath();
      ctx.moveTo(bx - 0.05, 0.12);
      ctx.quadraticCurveTo(bx + 0.08, 0.2, bx + 0.12, 0.3);
      ctx.lineWidth = 0.03;
      ctx.strokeStyle = '#8a93a3';
      ctx.stroke();
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

// --- outfits --------------------------------------------------------------------------

/** Ermine trim: white fur with black tail tips. */
function ermine(ctx: Ctx, x0: number, y0: number, x1: number, y1: number, h: number): void {
  ctx.beginPath();
  ctx.moveTo(x0, y0);
  ctx.lineTo(x1, y1);
  ctx.lineWidth = h + 0.03;
  ctx.strokeStyle = OL;
  ctx.stroke();
  ctx.lineWidth = h;
  ctx.strokeStyle = '#fbf8f0';
  ctx.stroke();
  const n = Math.max(2, Math.round(Math.hypot(x1 - x0, y1 - y0) / 0.12));
  ctx.fillStyle = '#1f1a26';
  for (let k = 0; k < n; k++) {
    const t = (k + 0.5) / n;
    ctx.beginPath();
    ellipse(ctx, x0 + (x1 - x0) * t, y0 + (y1 - y0) * t, 0.012, 0.022);
    ctx.fill();
  }
}

type OutfitDef = NonNullable<RigLayers['outfit']>;

function outfitFor(m: string, color: string): OutfitDef | undefined {
  switch (m) {
    case 'outfit_royal':
      return {
        palette: { vest: '#8e1b22', shirt: '#f6ead2', pants: '#6e1820', scarf: '#ffc93c' },
        // The mantle hangs from the shoulders behind the body, down to the ankles.
        under: (ctx, a, pose) => {
          const bx = a.back.x;
          const sway = Math.sin(pose.time * 6) * 0.03 + pose.wobbleB * 0.04;
          if (!a.side) {
            // Facing the camera: the mantle frames the body evenly on both sides.
            ctx.beginPath();
            ctx.moveTo(-0.24, 0.22);
            ctx.lineTo(0.24, 0.22);
            ctx.quadraticCurveTo(0.42, -0.1, 0.46 + sway * 0.5, -0.52);
            ctx.lineTo(-0.46 + sway * 0.5, -0.52);
            ctx.quadraticCurveTo(-0.42, -0.1, -0.24, 0.22);
            ctx.closePath();
            ctx.fillStyle = color;
            ctx.fill();
            ctx.lineWidth = 0.05;
            ctx.strokeStyle = '#ffc93c';
            ctx.stroke();
            ctx.lineWidth = 0.02;
            ctx.strokeStyle = OL;
            ctx.stroke();
            ermine(ctx, -0.46 + sway * 0.5, -0.52, 0.46 + sway * 0.5, -0.52, 0.07);
            return;
          }
          const w = 0;
          ctx.beginPath();
          ctx.moveTo(bx + 0.12 + w * 0.4, 0.2);
          ctx.lineTo(bx - 0.1 - w * 0.4, 0.22);
          ctx.quadraticCurveTo(bx - 0.4 - w, -0.1, bx - 0.5 - w + sway, -0.5);
          ctx.lineTo(bx + 0.05 + w + sway * 0.5, -0.52);
          ctx.quadraticCurveTo(bx + 0.12 + w * 0.6, -0.1, bx + 0.12 + w * 0.4, 0.2);
          ctx.closePath();
          ctx.fillStyle = color;
          ctx.fill();
          ctx.lineWidth = 0.05;
          ctx.strokeStyle = '#ffc93c';
          ctx.stroke();
          ctx.lineWidth = 0.02;
          ctx.strokeStyle = OL;
          ctx.stroke();
          ermine(ctx, bx - 0.5 - w + sway, -0.5, bx + 0.05 + w + sway * 0.5, -0.52, 0.07);
        },
        // Front edges of the mantle, a gold clasp and an ermine collar.
        over: (ctx, a) => {
          const { wTop, y0, y1 } = a.torso;
          const edge = (dir: number, x: number) => {
            ctx.beginPath();
            ctx.moveTo(x - dir * 0.02, y1 + 0.05);
            ctx.lineTo(x + dir * 0.09, y1 + 0.02);
            ctx.quadraticCurveTo(x + dir * 0.12, (y0 + y1) / 2, x + dir * 0.16, y0 - 0.12);
            ctx.lineTo(x + dir * 0.04, y0 - 0.12);
            ctx.closePath();
            ctx.fillStyle = color;
            ctx.fill();
            ctx.lineWidth = 0.03;
            ctx.strokeStyle = '#ffc93c';
            ctx.stroke();
          };
          if (a.side) edge(1, 0.02);
          else {
            edge(-1, -wTop + 0.05);
            edge(1, wTop - 0.05);
          }
          ermine(ctx, a.side ? -0.16 : -wTop + 0.02, y1 + 0.02, a.side ? 0.14 : wTop - 0.02, y1 + 0.02, 0.07);
          // Clasp: two gold discs joined by a chain.
          const cy = y1 - 0.08;
          const xs = a.side ? [0.1] : [-0.1, 0.1];
          if (xs.length > 1) {
            ctx.beginPath();
            ctx.moveTo(xs[0], cy);
            ctx.quadraticCurveTo(0, cy - 0.04, xs[1], cy);
            ctx.lineWidth = 0.02;
            ctx.strokeStyle = '#ffc93c';
            ctx.stroke();
          }
          for (const x of xs) {
            ctx.beginPath();
            ellipse(ctx, x, cy, 0.035, 0.035);
            outlined(ctx, '#ffc93c');
          }
          ctx.beginPath();
          star(ctx, xs.length > 1 ? 0 : xs[0], cy - (xs.length > 1 ? 0.03 : 0), 0.03, 0.5, 4);
          ctx.fillStyle = '#e8473b';
          ctx.fill();
        },
      };
    case 'outfit_mafia':
      return {
        palette: { shirt: '#f2f2f4', vest: '#2b2b35', pants: '#2b2b35', boots: '#141418', scarf: '#a3161c' },
        overClip: (ctx, a) => {
          // Pinstripes over the jacket.
          const { wTop, y0, y1 } = a.torso;
          ctx.strokeStyle = 'rgba(225,225,240,0.32)';
          ctx.lineWidth = 0.012;
          ctx.beginPath();
          for (let x = -wTop - 0.1; x <= wTop + 0.1; x += 0.05) {
            ctx.moveTo(x, y0 - 0.1);
            ctx.lineTo(x + 0.01, y1 + 0.1);
          }
          ctx.stroke();
        },
        over: (ctx, a) => {
          const { y0, y1 } = a.torso;
          const tx = a.side ? 0.09 : 0;
          // Long red tie and a pocket square.
          ctx.beginPath();
          ctx.moveTo(tx - 0.025, y1 - 0.04);
          ctx.lineTo(tx + 0.025, y1 - 0.04);
          ctx.lineTo(tx + 0.04, y0 + 0.06);
          ctx.lineTo(tx, y0 + 0.01);
          ctx.lineTo(tx - 0.04, y0 + 0.06);
          ctx.closePath();
          outlined(ctx, '#a3161c');
          ctx.beginPath();
          ctx.moveTo(tx - 0.02, y1 - 0.12);
          ctx.lineTo(tx + 0.025, y1 - 0.16);
          ctx.lineWidth = 0.012;
          ctx.strokeStyle = 'rgba(255,255,255,0.5)';
          ctx.stroke();
          const px = a.side ? -0.06 : -0.13;
          ctx.beginPath();
          ctx.moveTo(px - 0.04, y1 - 0.14);
          ctx.lineTo(px + 0.04, y1 - 0.14);
          ctx.lineTo(px, y1 - 0.08);
          ctx.closePath();
          outlined(ctx, '#ffffff');
        },
      };
    case 'outfit_astro':
      return {
        palette: { shirt: '#eef1f6', vest: '#dde2ea', pants: '#dde2ea', boots: '#9aa3b2', scarf: '#ff7a2a' },
        overClip: (ctx, a) => {
          const { wTop, y0, y1 } = a.torso;
          // Blue stripe across the chest and a small control panel.
          ctx.fillStyle = '#3f6fb0';
          ctx.fillRect(-wTop - 0.1, y1 - 0.22, wTop * 2 + 0.2, 0.05);
          const cx = a.side ? 0.06 : 0;
          ctx.beginPath();
          roundRect(ctx, cx - 0.08, y0 + 0.07, 0.16, 0.12, 0.025);
          ctx.fillStyle = '#9aa3b2';
          ctx.fill();
          ctx.lineWidth = 0.015;
          ctx.strokeStyle = OL;
          ctx.stroke();
          for (const [k, c] of [
            [0, '#e8473b'],
            [1, '#ffd23f'],
            [2, '#5bd16b'],
          ] as const) {
            ctx.beginPath();
            ellipse(ctx, cx - 0.045 + k * 0.045, y0 + 0.13, 0.016, 0.016);
            ctx.fillStyle = c;
            ctx.fill();
          }
        },
      };
  }
  return undefined;
}

// --- props held in the right hand (hand space: +y runs up the prop) ----------------------

function drawHandProp(ctx: Ctx, m: string, color: string, pose: MonsterPose): void {
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  const rod = (y0: number, y1: number, width: number, fill: string) => {
    ctx.beginPath();
    ctx.moveTo(0, y0);
    ctx.lineTo(0, y1);
    ctx.lineWidth = width + 0.03;
    ctx.strokeStyle = OL;
    ctx.stroke();
    ctx.lineWidth = width;
    ctx.strokeStyle = fill;
    ctx.stroke();
  };
  switch (m) {
    case 'hand_pickaxe': {
      rod(-0.12, 0.44, 0.045, '#9a5b2e');
      ctx.beginPath();
      ctx.moveTo(-0.24, 0.36);
      ctx.quadraticCurveTo(0, 0.5, 0.24, 0.36);
      ctx.quadraticCurveTo(0, 0.44, -0.24, 0.36);
      ctx.closePath();
      outlined(ctx, color);
      ctx.beginPath();
      roundRect(ctx, -0.045, 0.39, 0.09, 0.08, 0.02);
      outlined(ctx, shade(color, 0.3));
      break;
    }
    case 'hand_scepter': {
      rod(-0.1, 0.42, 0.035, color);
      ctx.beginPath();
      ellipse(ctx, 0, -0.11, 0.03, 0.03);
      outlined(ctx, color);
      ctx.beginPath();
      ctx.moveTo(-0.06, 0.42);
      ctx.lineTo(0.06, 0.42);
      ctx.lineWidth = 0.035;
      ctx.strokeStyle = color;
      ctx.stroke();
      ctx.beginPath();
      ellipse(ctx, 0, 0.49, 0.065, 0.065);
      outlined(ctx, '#e8473b');
      ctx.beginPath();
      ellipse(ctx, -0.02, 0.51, 0.018, 0.018);
      ctx.fillStyle = 'rgba(255,255,255,0.7)';
      ctx.fill();
      ctx.beginPath();
      star(ctx, 0, 0.6, 0.04, 0.45, 4);
      outlined(ctx, color);
      if ((pose.time * 1.3) % 2 < 0.3) {
        ctx.beginPath();
        star(ctx, 0.07, 0.56, 0.035, 0.25, 4);
        ctx.fillStyle = '#ffffff';
        ctx.fill();
      }
      break;
    }
    case 'hand_cane': {
      // Gold knob in the fist, black cane down toward the ground.
      ctx.rotate(0.55);
      rod(0.05, -0.62, 0.035, '#1a1a20');
      ctx.beginPath();
      ellipse(ctx, 0, 0.07, 0.05, 0.05);
      outlined(ctx, color);
      ctx.beginPath();
      ctx.moveTo(-0.02, -0.6);
      ctx.lineTo(0.02, -0.6);
      ctx.lineWidth = 0.04;
      ctx.strokeStyle = color;
      ctx.stroke();
      break;
    }
    case 'hand_flag': {
      rod(-0.14, 0.58, 0.025, '#c8ccd6');
      const wave = (k: number) => Math.sin(pose.time * 9 - k * 3) * 0.025 * k;
      ctx.beginPath();
      ctx.moveTo(0, 0.56);
      for (let k = 0; k <= 4; k++) ctx.lineTo(-0.3 * (k / 4), 0.56 + wave(k / 4));
      for (let k = 4; k >= 0; k--) ctx.lineTo(-0.3 * (k / 4), 0.38 + wave(k / 4));
      ctx.closePath();
      outlined(ctx, color);
      ctx.beginPath();
      star(ctx, -0.15, 0.47 + wave(0.5), 0.045, 0.45, 5);
      ctx.fillStyle = '#ffffff';
      ctx.fill();
      ctx.beginPath();
      ellipse(ctx, 0, 0.6, 0.02, 0.02);
      outlined(ctx, '#ffd23f');
      break;
    }
  }
}

// --- mounts (world space at the rider's feet; the mount faces +x) -------------------------

function limb(ctx: Ctx, x0: number, y0: number, x1: number, y1: number, x2: number, y2: number, w: number, fill: string): void {
  ctx.beginPath();
  ctx.moveTo(x0, y0);
  ctx.quadraticCurveTo(x1, y1, x2, y2);
  ctx.lineWidth = w + 0.035;
  ctx.strokeStyle = OL;
  ctx.stroke();
  ctx.lineWidth = w;
  ctx.strokeStyle = fill;
  ctx.stroke();
}

function mountFor(m: string, color: string): MountLayer | undefined {
  switch (m) {
    case 'mount_hobby':
      return {
        kind: 'stick',
        saddle: 0,
        riderScale: 1,
        top: 1.6,
        front: (ctx, pose) => {
          const g = pose.gait ?? 0;
          // Stick from the wheel behind to the head in front, the head bobbing a little.
          const bob = Math.sin(g * 2) * 0.02 * (pose.runAmt ?? 0);
          const hx = 0.42;
          const hy = 0.78 + bob;
          limb(ctx, -0.38, 0.08, 0, 0.45, hx - 0.05, hy - 0.05, 0.04, '#c8a06a');
          ctx.save();
          ctx.translate(-0.38, 0.08);
          ctx.rotate(-g);
          ctx.beginPath();
          ellipse(ctx, 0, 0, 0.075, 0.075);
          outlined(ctx, '#e8473b');
          ctx.beginPath();
          ctx.moveTo(-0.06, 0);
          ctx.lineTo(0.06, 0);
          ctx.moveTo(0, -0.06);
          ctx.lineTo(0, 0.06);
          ctx.lineWidth = 0.015;
          ctx.strokeStyle = '#ffffff';
          ctx.stroke();
          ctx.restore();
          ctx.save();
          ctx.translate(hx, hy);
          ctx.rotate(-0.5);
          ctx.beginPath();
          ellipse(ctx, 0.08, 0, 0.17, 0.085);
          outlined(ctx, color);
          ctx.beginPath();
          ellipse(ctx, 0.2, -0.01, 0.06, 0.055);
          outlined(ctx, tint(color, 0.25));
          ctx.beginPath();
          ctx.moveTo(-0.02, 0.07);
          ctx.lineTo(0.0, 0.16);
          ctx.lineTo(0.05, 0.08);
          ctx.closePath();
          outlined(ctx, color);
          ctx.beginPath();
          for (let k = 0; k < 4; k++) {
            ctx.moveTo(-0.08 + k * 0.04, 0.06);
            ctx.lineTo(-0.12 + k * 0.04 + Math.sin(pose.time * 8 + k) * 0.02, 0.15);
          }
          ctx.lineWidth = 0.03;
          ctx.strokeStyle = '#ffd23f';
          ctx.stroke();
          ctx.beginPath();
          ellipse(ctx, 0.08, 0.02, 0.022, 0.022);
          ctx.fillStyle = OL;
          ctx.fill();
          ctx.restore();
        },
      };
    case 'mount_pony':
      return {
        kind: 'ride',
        saddle: 0.6,
        riderScale: 0.8,
        top: 1.45,
        behind: (ctx, pose) => {
          const g = pose.gait ?? 0;
          const run = pose.runAmt ?? 0;
          const by = 0.58 + Math.sin(g * 2) * 0.03 * run;
          const legs = (far: boolean) => {
            const c = far ? shade(color, 0.25) : color;
            for (const [x, off] of [
              [0.24, far ? Math.PI : 0],
              [-0.26, far ? 0 : Math.PI],
            ] as const) {
              const sw = Math.sin(g + off) * 0.5 * run;
              const fx = x + Math.sin(sw) * 0.3;
              const fy = Math.max(0, -Math.cos(sw)) * 0 + Math.max(0, Math.sin(g + off + 1.2)) * 0.12 * run;
              limb(ctx, x, by - 0.1, x + Math.sin(sw) * 0.12 + 0.03, (by + fy) / 2, fx, fy + 0.02, 0.075, c);
              ctx.beginPath();
              roundRect(ctx, fx - 0.05, fy - 0.01, 0.1, 0.05, 0.02);
              outlined(ctx, '#2a1d1a');
            }
          };
          legs(true);
          // Tail, body, neck and head.
          const tsw = Math.sin(pose.time * 7) * 0.06;
          limb(ctx, -0.36, by + 0.06, -0.55, by - 0.02 + tsw, -0.5, by - 0.28 + tsw, 0.07, shade(color, 0.35));
          ctx.beginPath();
          ellipse(ctx, -0.02, by, 0.38, 0.16);
          outlined(ctx, color);
          ctx.beginPath();
          ctx.moveTo(0.18, by + 0.1);
          ctx.lineTo(0.38, by + 0.36);
          ctx.lineTo(0.48, by + 0.28);
          ctx.lineTo(0.32, by - 0.02);
          ctx.closePath();
          outlined(ctx, color);
          ctx.save();
          ctx.translate(0.5, by + 0.33);
          ctx.rotate(-0.55);
          ctx.beginPath();
          ellipse(ctx, 0.05, 0, 0.16, 0.085);
          outlined(ctx, color);
          ctx.beginPath();
          ellipse(ctx, 0.15, -0.02, 0.06, 0.055);
          outlined(ctx, tint(color, 0.3));
          ctx.beginPath();
          ctx.moveTo(-0.06, 0.06);
          ctx.lineTo(-0.04, 0.15);
          ctx.lineTo(0.0, 0.07);
          ctx.closePath();
          outlined(ctx, color);
          ctx.beginPath();
          ellipse(ctx, 0.02, 0.03, 0.02, 0.022);
          ctx.fillStyle = OL;
          ctx.fill();
          ctx.restore();
          // Mane along the neck.
          ctx.beginPath();
          for (let k = 0; k < 5; k++) {
            const t = k / 4;
            const x = 0.2 + t * 0.24;
            const y = by + 0.16 + t * 0.26;
            ctx.moveTo(x, y);
            ctx.lineTo(x - 0.08 + Math.sin(pose.time * 9 + k) * 0.02, y - 0.02);
          }
          ctx.lineWidth = 0.04;
          ctx.strokeStyle = shade(color, 0.45);
          ctx.stroke();
          // Saddle.
          ctx.beginPath();
          ctx.moveTo(-0.2, by + 0.13);
          ctx.quadraticCurveTo(-0.02, by + 0.06, 0.14, by + 0.15);
          ctx.lineTo(0.12, by + 0.08);
          ctx.quadraticCurveTo(-0.03, by + 0.0, -0.2, by + 0.06);
          ctx.closePath();
          outlined(ctx, '#7a2a1e');
          legs(false);
        },
      };
    case 'mount_terror':
      return {
        kind: 'ride',
        saddle: 0.66,
        riderScale: 0.8,
        top: 1.5,
        behind: (ctx, pose) => {
          const g = pose.gait ?? 0;
          const run = pose.runAmt ?? 0;
          const by = 0.64 + Math.abs(Math.sin(g)) * 0.03 * run;
          const leg = (off: number, c: string) => {
            const fx = 0.02 + Math.sin(g + off) * 0.3 * run;
            const fy = Math.max(0, Math.cos(g + off)) * 0.16 * run;
            // Backward knee, long shin, three-toed foot.
            limb(ctx, -0.02, by - 0.08, -0.16 + fx * 0.3, (by + fy) * 0.55, fx, fy + 0.03, 0.06, c);
            ctx.beginPath();
            ctx.moveTo(fx - 0.06, fy);
            ctx.lineTo(fx + 0.1, fy);
            ctx.moveTo(fx, fy + 0.02);
            ctx.lineTo(fx + 0.08, fy + 0.05);
            ctx.lineWidth = 0.03;
            ctx.strokeStyle = '#d9a24a';
            ctx.stroke();
          };
          leg(Math.PI, shade('#d9a24a', 0.25));
          // Tail plumes.
          for (let k = 0; k < 3; k++) {
            ctx.beginPath();
            ellipse(ctx, -0.36 - k * 0.04, by + 0.08 + k * 0.05, 0.16, 0.05, 0.4 + k * 0.25 + Math.sin(pose.time * 6 + k) * 0.05);
            outlined(ctx, shade(color, 0.2 + k * 0.1));
          }
          ctx.beginPath();
          ellipse(ctx, -0.04, by, 0.32, 0.17);
          outlined(ctx, color);
          // Neck and big hooked beak.
          limb(ctx, 0.16, by + 0.06, 0.3, by + 0.18, 0.3, by + 0.36, 0.11, color);
          ctx.save();
          ctx.translate(0.32, by + 0.4);
          ctx.beginPath();
          ellipse(ctx, 0, 0, 0.11, 0.09);
          outlined(ctx, color);
          ctx.beginPath();
          ctx.moveTo(0.06, 0.05);
          ctx.quadraticCurveTo(0.3, 0.06, 0.3, -0.04);
          ctx.quadraticCurveTo(0.26, 0.0, 0.24, -0.02);
          ctx.quadraticCurveTo(0.16, -0.06, 0.06, -0.04);
          ctx.closePath();
          outlined(ctx, '#f2c14e');
          ctx.beginPath();
          ellipse(ctx, 0.01, 0.02, 0.025, 0.025);
          outlined(ctx, '#ff5a2e');
          ctx.beginPath();
          for (let k = 0; k < 3; k++) {
            ctx.moveTo(-0.04 + k * 0.03, 0.07);
            ctx.lineTo(-0.1 + k * 0.03, 0.15 + Math.sin(pose.time * 8 + k) * 0.015);
          }
          ctx.lineWidth = 0.03;
          ctx.strokeStyle = '#e8473b';
          ctx.stroke();
          ctx.restore();
          // Saddle blanket.
          ctx.beginPath();
          roundRect(ctx, -0.18, by + 0.1, 0.3, 0.08, 0.03);
          outlined(ctx, '#e8473b');
          leg(0, '#d9a24a');
        },
      };
    case 'mount_dragon':
      return {
        kind: 'ride',
        saddle: 0.72,
        riderScale: 0.8,
        top: 1.55,
        behind: (ctx, pose) => {
          const t = pose.time;
          // Flies low, wings beating, legs tucked.
          const by = 0.62 + Math.sin(t * 4) * 0.04;
          const flap = Math.sin(t * 8);
          const wing = (far: boolean) => {
            const tipX = -0.35;
            const tipY = by + 0.4 + flap * 0.28 + (far ? 0.06 : 0);
            ctx.beginPath();
            ctx.moveTo(-0.02, by + 0.08);
            ctx.lineTo(tipX + 0.1, tipY);
            ctx.lineTo(tipX - 0.22, tipY - 0.06);
            ctx.quadraticCurveTo(-0.3, by + 0.12, -0.24, by + 0.06);
            ctx.closePath();
            outlined(ctx, far ? shade(color, 0.3) : tint(color, 0.1));
            ctx.beginPath();
            ctx.moveTo(-0.02, by + 0.08);
            ctx.lineTo(tipX - 0.08, tipY - 0.03);
            ctx.lineWidth = 0.015;
            ctx.strokeStyle = shade(color, 0.45);
            ctx.stroke();
          };
          wing(true);
          // Tail with a spade tip.
          const tw = Math.sin(t * 5) * 0.06;
          limb(ctx, -0.3, by, -0.55, by - 0.05 + tw, -0.72, by + 0.06 + tw, 0.07, color);
          ctx.beginPath();
          ctx.moveTo(-0.72, by + 0.06 + tw);
          ctx.lineTo(-0.82, by + 0.14 + tw);
          ctx.lineTo(-0.8, by + 0.0 + tw);
          ctx.closePath();
          outlined(ctx, shade(color, 0.2));
          // Tucked legs.
          for (const x of [-0.16, 0.18]) limb(ctx, x, by - 0.08, x + 0.04, by - 0.18, x + 0.1, by - 0.16, 0.06, shade(color, 0.15));
          ctx.beginPath();
          ellipse(ctx, -0.02, by, 0.34, 0.15);
          outlined(ctx, color);
          ctx.beginPath();
          ellipse(ctx, 0.0, by - 0.06, 0.26, 0.07);
          ctx.fillStyle = '#f2e2a8';
          ctx.fill();
          // Back spikes.
          ctx.beginPath();
          for (let k = 0; k < 4; k++) {
            const x = -0.3 + k * 0.06;
            ctx.moveTo(x, by + 0.12);
            ctx.lineTo(x + 0.03, by + 0.2);
            ctx.lineTo(x + 0.06, by + 0.12);
          }
          ctx.fillStyle = '#ffd23f';
          ctx.fill();
          // Neck and head with horns.
          limb(ctx, 0.2, by + 0.04, 0.36, by + 0.1, 0.42, by + 0.24, 0.1, color);
          ctx.save();
          ctx.translate(0.46, by + 0.28);
          for (const dx of [-0.05, 0.0]) {
            ctx.beginPath();
            ctx.moveTo(dx - 0.02, 0.06);
            ctx.quadraticCurveTo(dx - 0.08, 0.16, dx - 0.12, 0.17);
            ctx.lineTo(dx + 0.02, 0.07);
            ctx.closePath();
            outlined(ctx, '#f2e2a8');
          }
          ctx.beginPath();
          ellipse(ctx, 0.02, 0, 0.12, 0.08);
          outlined(ctx, color);
          ctx.beginPath();
          ellipse(ctx, 0.13, -0.02, 0.07, 0.05);
          outlined(ctx, tint(color, 0.2));
          ctx.beginPath();
          ellipse(ctx, 0.0, 0.025, 0.025, 0.028);
          ctx.fillStyle = '#ffd23f';
          ctx.fill();
          ctx.beginPath();
          ellipse(ctx, 0.005, 0.025, 0.01, 0.022);
          ctx.fillStyle = OL;
          ctx.fill();
          ctx.restore();
          // Saddle.
          ctx.beginPath();
          roundRect(ctx, -0.18, by + 0.1, 0.3, 0.07, 0.03);
          outlined(ctx, '#7a2a1e');
          wing(false);
        },
      };
    case 'mount_broom':
      return {
        kind: 'hover',
        saddle: 0.42,
        riderScale: 0.85,
        top: 1.4,
        behind: (ctx, pose) => {
          const t = pose.time;
          const y = 0.36 + Math.sin(t * 3) * 0.04;
          limb(ctx, -0.5, y - 0.02, 0, y + 0.02, 0.6, y + 0.05, 0.045, color);
          // Straw bristles fanned at the back, tied with a red band.
          ctx.save();
          ctx.translate(-0.5, y - 0.02);
          ctx.beginPath();
          ctx.moveTo(0.02, 0.04);
          ctx.lineTo(-0.34, 0.12 + Math.sin(t * 9) * 0.02);
          ctx.lineTo(-0.38, -0.02);
          ctx.lineTo(-0.32, -0.14 - Math.sin(t * 9) * 0.02);
          ctx.lineTo(0.02, -0.04);
          ctx.closePath();
          outlined(ctx, '#e8c27a');
          ctx.beginPath();
          for (let k = -2; k <= 2; k++) {
            ctx.moveTo(0, k * 0.012);
            ctx.lineTo(-0.34, k * 0.05);
          }
          ctx.lineWidth = 0.012;
          ctx.strokeStyle = '#b08840';
          ctx.stroke();
          ctx.beginPath();
          roundRect(ctx, -0.03, -0.05, 0.06, 0.1, 0.02);
          outlined(ctx, '#e8473b');
          ctx.restore();
          // A few sparkles trailing behind.
          for (let k = 0; k < 3; k++) {
            const ph = (t * 1.5 + k / 3) % 1;
            ctx.save();
            ctx.globalAlpha *= 1 - ph;
            ctx.beginPath();
            star(ctx, -0.9 - ph * 0.5, y + Math.sin(k * 2 + t * 4) * 0.08, 0.04, 0.4, 4);
            ctx.fillStyle = '#ffe9a8';
            ctx.fill();
            ctx.restore();
          }
        },
      };
  }
  return undefined;
}

/** Mount kind for an equipped mount id (the animator seats the rider accordingly). */
export function mountKind(id: string | undefined): MountLayer['kind'] | undefined {
  const m = model(id);
  return m ? mountFor(m.model, m.color)?.kind : undefined;
}

/** Highest point of the character on its mount (name tags sit above it). */
export function mountedHeight(id: string | undefined, riderHeight: number): number {
  const m = model(id);
  const mt = m ? mountFor(m.model, m.color) : undefined;
  if (!mt) return riderHeight;
  if (mt.kind === 'stick') return Math.max(riderHeight, mt.top * 0.6);
  return Math.max(mt.top * 0.7, mt.saddle - 0.42 * mt.riderScale + riderHeight * mt.riderScale);
}

/** Builds the back/front cosmetic layers for a loadout (null when nothing to draw). */
export function cosmeticLayers(loadout: Record<string, string>): RigLayers {
  const hat = model(loadout.hat);
  const eyes = model(loadout.eyes);
  const back = model(loadout.back);
  const out: RigLayers = {};
  if (back) out.back = (ctx, a, pose) => drawBack(ctx, back.model, back.color, a, pose);
  const outfit = model(loadout.outfit);
  if (outfit) out.outfit = outfitFor(outfit.model, outfit.color);
  const hand = model(loadout.hand);
  if (hand) out.hand = (ctx, pose) => drawHandProp(ctx, hand.model, hand.color, pose);
  const mount = model(loadout.mount);
  if (mount) out.mount = mountFor(mount.model, mount.color);
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
