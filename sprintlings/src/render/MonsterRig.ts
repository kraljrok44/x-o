import type { BodyPlan, CharacterPalette } from '../player/CharacterDefinition';
import { ellipse, mix, rgba, shade, smoothClosed, star, tint, type Ctx } from './draw';

/**
 * Vector cartoon monsters drawn with Canvas2D paths. Everything is in local
 * units (1 = one world unit, roughly the racer's hitbox height), origin at
 * the feet, +x forward (the racer faces right), +y up. The rig is purely a
 * function of the pose, so the same drawing code serves the race, the menu
 * stage and the UI thumbnails.
 */

export type MouthKind = 'smile' | 'grin' | 'open' | 'ouch' | 'o' | 'flat' | 'happy';
export type EyeKind = 'normal' | 'dizzy' | 'happy' | 'closed' | 'wide' | 'squint';

export interface Vec {
  x: number;
  y: number;
}

/** Everything the rig needs to draw one frame. Produced by MonsterAnimator. */
export interface MonsterPose {
  time: number;
  /** Body centre offset from the hips (bob), and whole-body transforms. */
  bob: number;
  squash: number;
  lean: number;
  rot: number;
  /** Horizontal facing scale: 1 faces right, -1 left (spins animate through 0). */
  flip: number;
  /** Feet relative to their hip (near = closer to the camera). */
  footNear: Vec;
  footFar: Vec;
  /** Arm angles in radians: 0 hangs down, +PI/2 points forward, PI straight up. */
  armNear: number;
  armFar: number;
  /** Rubber-hose arm length multiplier (emotes reach above the head). */
  armReach: number;
  /** Secondary-motion angles for appendages (antennae, ears, horns, hair). */
  wobbleA: number;
  wobbleB: number;
  blink: number;
  lookX: number;
  lookY: number;
  eyes: EyeKind;
  mouth: MouthKind;
  /** 0..1 strength of the stun stars / dizzy wobble. */
  dizzy: number;
  /** Cheeks glow when happy or boosting. */
  blush: number;
  /** Whole-monster vertical offset (emote hops); the shadow stays on the ground. */
  hop: number;
  /** 0 = side view (running right), 1 = facing the camera (menu, celebrations). */
  facing: number;
}

export function neutralPose(): MonsterPose {
  return {
    time: 0,
    bob: 0,
    squash: 1,
    lean: 0,
    rot: 0,
    flip: 1,
    footNear: { x: 0.02, y: 0 },
    footFar: { x: -0.02, y: 0 },
    armNear: 0.35,
    armFar: 0.25,
    armReach: 1,
    wobbleA: 0,
    wobbleB: 0,
    blink: 0,
    lookX: 0.5,
    lookY: 0,
    eyes: 'normal',
    mouth: 'smile',
    dizzy: 0,
    blush: 0.3,
    hop: 0,
    facing: 0,
  };
}

interface Eye {
  x: number;
  y: number;
  r: number;
}

interface PlanSpec {
  /** Body half width / half height and centre height above the feet. */
  rx: number;
  ry: number;
  cy: number;
  /** Outline bumpiness: [count, amplitude] (fur, shag). */
  fluff: [number, number];
  /** Squarer bodies (shaggy) use a superellipse exponent > 2. */
  squareness: number;
  hipX: number;
  hipY: number;
  footRx: number;
  footRy: number;
  armLen: number;
  armR: number;
  /** Shoulder relative to the body centre. */
  shoulder: Vec;
  eyes: Eye[];
  mouth: { x: number; y: number; w: number };
  belly: { x: number; y: number; rx: number; ry: number } | null;
  /** Where hats sit (relative to the body centre) and how wide the head is. */
  headTop: Vec;
  headW: number;
}

const PLANS: Record<BodyPlan, PlanSpec> = {
  fluff: {
    rx: 0.52,
    ry: 0.47,
    cy: 0.62,
    fluff: [16, 0.035],
    squareness: 2,
    hipX: 0.17,
    hipY: 0.17,
    footRx: 0.15,
    footRy: 0.085,
    armLen: 0.21,
    armR: 0.064,
    shoulder: { x: 0.0, y: -0.16 },
    eyes: [
      { x: 0.08, y: 0.12, r: 0.149 },
      { x: 0.33, y: 0.12, r: 0.132 },
    ],
    mouth: { x: 0.25, y: -0.1, w: 0.22 },
    belly: { x: 0.12, y: -0.2, rx: 0.3, ry: 0.22 },
    headTop: { x: 0.04, y: 0.46 },
    headW: 0.62,
  },
  antenna: {
    rx: 0.43,
    ry: 0.52,
    cy: 0.64,
    fluff: [0, 0],
    squareness: 2,
    hipX: 0.14,
    hipY: 0.18,
    footRx: 0.13,
    footRy: 0.08,
    armLen: 0.19,
    armR: 0.06,
    shoulder: { x: -0.02, y: -0.2 },
    eyes: [
      { x: 0.04, y: 0.16, r: 0.161 },
      { x: 0.29, y: 0.15, r: 0.144 },
    ],
    mouth: { x: 0.2, y: -0.08, w: 0.14 },
    belly: { x: 0.1, y: -0.24, rx: 0.24, ry: 0.22 },
    headTop: { x: 0.02, y: 0.5 },
    headW: 0.56,
  },
  shaggy: {
    rx: 0.5,
    ry: 0.56,
    cy: 0.68,
    fluff: [22, 0.045],
    squareness: 3.2,
    hipX: 0.18,
    hipY: 0.25,
    footRx: 0.16,
    footRy: 0.09,
    armLen: 0.24,
    armR: 0.068,
    shoulder: { x: 0.0, y: -0.22 },
    eyes: [
      { x: 0.08, y: 0.1, r: 0.127 },
      { x: 0.31, y: 0.1, r: 0.115 },
    ],
    mouth: { x: 0.23, y: -0.14, w: 0.24 },
    belly: { x: 0.12, y: -0.28, rx: 0.3, ry: 0.2 },
    headTop: { x: 0.02, y: 0.56 },
    headW: 0.66,
  },
  cyclops: {
    rx: 0.47,
    ry: 0.47,
    cy: 0.6,
    fluff: [0, 0],
    squareness: 2,
    hipX: 0.15,
    hipY: 0.17,
    footRx: 0.14,
    footRy: 0.08,
    armLen: 0.20,
    armR: 0.06,
    shoulder: { x: 0.0, y: -0.18 },
    eyes: [{ x: 0.2, y: 0.12, r: 0.230 }],
    mouth: { x: 0.24, y: -0.17, w: 0.26 },
    belly: null,
    headTop: { x: 0.04, y: 0.46 },
    headW: 0.6,
  },
  chomper: {
    rx: 0.55,
    ry: 0.44,
    cy: 0.6,
    fluff: [0, 0],
    squareness: 2.4,
    hipX: 0.18,
    hipY: 0.15,
    footRx: 0.15,
    footRy: 0.085,
    armLen: 0.19,
    armR: 0.064,
    shoulder: { x: -0.02, y: -0.16 },
    eyes: [
      { x: 0.1, y: 0.22, r: 0.127 },
      { x: 0.33, y: 0.21, r: 0.115 },
    ],
    mouth: { x: 0.24, y: -0.06, w: 0.46 },
    belly: null,
    headTop: { x: 0.02, y: 0.43 },
    headW: 0.64,
  },
  yeti: {
    rx: 0.5,
    ry: 0.53,
    cy: 0.66,
    fluff: [18, 0.04],
    squareness: 2,
    hipX: 0.18,
    hipY: 0.02,
    footRx: 0.18,
    footRy: 0.095,
    armLen: 0.24,
    armR: 0.072,
    shoulder: { x: -0.02, y: -0.2 },
    eyes: [
      { x: 0.1, y: 0.14, r: 0.115 },
      { x: 0.32, y: 0.14, r: 0.109 },
    ],
    mouth: { x: 0.23, y: -0.1, w: 0.2 },
    belly: { x: 0.2, y: 0.06, rx: 0.3, ry: 0.27 },
    headTop: { x: 0.02, y: 0.52 },
    headW: 0.64,
  },
};

export function planSpec(plan: BodyPlan): Readonly<PlanSpec> {
  return PLANS[plan];
}

/** World-space anchor points cosmetics attach to (filled by drawMonster). */
export interface RigAnchors {
  headTop: Vec;
  headW: number;
  eyeCenter: Vec;
  eyeSpan: number;
  back: Vec;
  bodyRx: number;
  bodyRy: number;
}

export interface MonsterStyle {
  /** Flat fills only (low quality and tiny thumbnails). */
  flat: boolean;
  /** Draw the soft ground shadow ellipse. */
  shadow: boolean;
  /** Ground height relative to the feet for the shadow (<= 0 when airborne). */
  shadowDrop: number;
}

export type CosmeticLayer = (ctx: Ctx, anchors: RigAnchors, pose: MonsterPose, pal: CharacterPalette) => void;

const OUTLINE_W = 0.042;

function outlineOf(c: string): string {
  return mix(c, '#1a0f24', 0.62);
}

function bodyPath(ctx: Ctx, spec: PlanSpec, time: number, ripple: number): void {
  const n = 40;
  const pts: number[] = [];
  const [count, amp] = spec.fluff;
  const p = spec.squareness;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    const c = Math.cos(a);
    const s = Math.sin(a);
    // Superellipse for squarer bodies, plain ellipse otherwise.
    const k = p === 2 ? 1 : Math.pow(Math.pow(Math.abs(c), p) + Math.pow(Math.abs(s), p), -1 / p);
    let r = 1;
    if (count > 0) r += amp * (0.6 + 0.4 * Math.sin(time * 6 + i)) * Math.cos(a * count) * (s > -0.6 ? 1 : 0.5) + ripple * Math.sin(a * 3 + time * 9) * 0.02;
    pts.push(c * k * spec.rx * r, s * k * spec.ry * r);
  }
  smoothClosed(ctx, pts);
}

function fillBody(ctx: Ctx, color: string, rx: number, ry: number, flat: boolean): void {
  if (flat) {
    ctx.fillStyle = color;
    return;
  }
  const g = ctx.createRadialGradient(-rx * 0.25, ry * 0.4, rx * 0.1, 0, 0, Math.max(rx, ry) * 1.15);
  g.addColorStop(0, tint(color, 0.35));
  g.addColorStop(0.55, color);
  g.addColorStop(1, shade(color, 0.22));
  ctx.fillStyle = g;
}

/**
 * Limbs are drawn in two passes (outline colour at full width, then the fill
 * colour narrower) so the tube and its mitten/foot merge into one clean
 * silhouette instead of overlapping rings.
 */
function limbPasses(ctx: Ctx, fill: string, outline: string, width: number, path: () => void, blob: () => void): void {
  for (let pass = 0; pass < 2; pass++) {
    const o = pass === 0 ? OUTLINE_W : 0;
    ctx.strokeStyle = pass === 0 ? outline : fill;
    ctx.fillStyle = pass === 0 ? outline : fill;
    ctx.lineWidth = width + o * 2;
    ctx.beginPath();
    path();
    ctx.stroke();
    ctx.save();
    ctx.lineWidth = o * 2;
    ctx.beginPath();
    blob();
    ctx.fill();
    if (o > 0) ctx.stroke();
    ctx.restore();
  }
}

function drawLeg(ctx: Ctx, hx: number, hy: number, fx: number, fy: number, spec: PlanSpec, pal: CharacterPalette, far: boolean): void {
  const col = far ? shade(pal.body, 0.22) : shade(pal.body, 0.05);
  const ol = outlineOf(pal.body);
  const tilt = Math.max(-0.45, Math.min(0.45, (fx - hx) * 1.1)) * -0.6;
  const footX = fx + spec.footRx * 0.2;
  const footY = fy + spec.footRy * 0.95;
  limbPasses(
    ctx,
    col,
    ol,
    spec.footRy * 1.5,
    () => {
      ctx.moveTo(hx, hy);
      ctx.quadraticCurveTo((hx + fx) / 2 + 0.04, (hy + fy) / 2, fx, footY);
    },
    () => ellipse(ctx, footX, footY, spec.footRx, spec.footRy, tilt),
  );
  if (!far) {
    // Toe crease and a soft sole highlight.
    ctx.beginPath();
    ctx.moveTo(footX + spec.footRx * 0.45, footY + spec.footRy * 0.45);
    ctx.lineTo(footX + spec.footRx * 0.45, footY - spec.footRy * 0.1);
    ctx.lineWidth = OUTLINE_W * 0.5;
    ctx.strokeStyle = ol;
    ctx.stroke();
  }
}

function drawArm(ctx: Ctx, sx: number, sy: number, angle: number, spec: PlanSpec, pal: CharacterPalette, far: boolean, reach: number): void {
  // angle 0 = hanging down; positive swings forward (+x).
  const len = spec.armLen * reach;
  const ex = sx + Math.sin(angle) * len;
  const ey = sy - Math.cos(angle) * len;
  // Elbow bends slightly against the swing for a rubber-hose feel.
  const mx = (sx + ex) / 2 - Math.cos(angle) * 0.045 * reach;
  const my = (sy + ey) / 2 - Math.sin(angle) * 0.045 * reach;
  const col = far ? shade(pal.body, 0.2) : pal.body;
  limbPasses(
    ctx,
    col,
    outlineOf(pal.body),
    spec.armR * 1.7,
    () => {
      ctx.moveTo(sx, sy);
      ctx.quadraticCurveTo(mx, my, ex, ey);
    },
    () => ellipse(ctx, ex, ey, spec.armR * 1.3, spec.armR * 1.2, angle),
  );
  // Blend the shoulder into the body so it reads as attached, not a rounded cap.
  ctx.beginPath();
  ellipse(ctx, sx, sy, spec.armR * 0.95, spec.armR * 0.95);
  ctx.fillStyle = col;
  ctx.fill();
}

function drawEye(ctx: Ctx, e: Eye, pose: MonsterPose, pal: CharacterPalette, lashes: boolean): void {
  const r = e.r;
  ctx.save();
  ctx.translate(e.x, e.y);
  const kind = pose.eyes;
  ctx.lineWidth = OUTLINE_W * 0.9;
  ctx.strokeStyle = outlineOf(pal.body);
  if (kind === 'happy' || (kind === 'closed' && pose.blink < 0.5)) {
    // ^ ^ arcs.
    ctx.beginPath();
    ctx.arc(0, -r * 0.2, r * 0.75, Math.PI * 0.15, Math.PI * 0.85);
    ctx.lineWidth = r * 0.35;
    ctx.lineCap = 'round';
    ctx.strokeStyle = pal.eye;
    ctx.stroke();
    ctx.restore();
    return;
  }
  if (kind === 'closed') {
    ctx.beginPath();
    ctx.moveTo(-r * 0.7, 0);
    ctx.quadraticCurveTo(0, -r * 0.45, r * 0.7, 0);
    ctx.lineWidth = r * 0.3;
    ctx.lineCap = 'round';
    ctx.strokeStyle = pal.eye;
    ctx.stroke();
    ctx.restore();
    return;
  }
  const squint = kind === 'squint' ? 0.55 : 1;
  const wide = kind === 'wide' ? 1.12 : 1;
  const open = Math.max(0.08, (1 - pose.blink) * squint);
  ctx.scale(wide, open * wide);
  // Sclera.
  ctx.beginPath();
  ellipse(ctx, 0, 0, r, r * 1.08);
  ctx.fillStyle = '#ffffff';
  ctx.fill();
  ctx.stroke();
  if (kind === 'dizzy') {
    // Swirl.
    ctx.beginPath();
    for (let i = 0; i <= 24; i++) {
      const a = i * 0.55 + pose.time * 10;
      const rr = (i / 24) * r * 0.8;
      const x = Math.cos(a) * rr;
      const y = Math.sin(a) * rr;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.lineWidth = r * 0.16;
    ctx.strokeStyle = pal.eye;
    ctx.stroke();
  } else {
    const px = Math.max(-1, Math.min(1, pose.lookX)) * r * 0.32;
    const py = Math.max(-1, Math.min(1, pose.lookY)) * r * 0.3;
    const pr = kind === 'wide' ? r * 0.42 : r * 0.56;
    ctx.beginPath();
    ellipse(ctx, px, py, pr, pr * 1.06);
    ctx.fillStyle = pal.eye;
    ctx.fill();
    // Glints.
    ctx.beginPath();
    ellipse(ctx, px - pr * 0.32, py + pr * 0.38, pr * 0.32, pr * 0.32);
    ctx.fillStyle = '#ffffff';
    ctx.fill();
    ctx.beginPath();
    ellipse(ctx, px + pr * 0.35, py - pr * 0.3, pr * 0.14, pr * 0.14);
    ctx.fill();
  }
  ctx.restore();
  if (lashes && kind !== 'dizzy') {
    ctx.save();
    ctx.translate(e.x, e.y);
    ctx.strokeStyle = pal.eye;
    ctx.lineWidth = r * 0.14;
    ctx.lineCap = 'round';
    const top = r * 1.05 * open * wide;
    for (let i = 0; i < 3; i++) {
      const a = 0.9 + i * 0.35;
      ctx.beginPath();
      ctx.moveTo(Math.cos(a) * r * 0.8, top * 0.95);
      ctx.lineTo(Math.cos(a) * r * 1.2, top * 1.25);
      ctx.stroke();
    }
    ctx.restore();
  }
}

function drawMouth(ctx: Ctx, spec: PlanSpec, plan: BodyPlan, pose: MonsterPose, pal: CharacterPalette): void {
  const m = spec.mouth;
  const w = m.w;
  const kind = pose.mouth;
  ctx.save();
  ctx.translate(m.x, m.y);
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.strokeStyle = outlineOf(pal.body);
  ctx.lineWidth = OUTLINE_W;
  const dark = mix(pal.eye, '#5a1030', 0.35);
  if (plan === 'chomper' && kind !== 'ouch' && kind !== 'o') {
    // Big toothy grin: the chomper's signature.
    const open = kind === 'open' || kind === 'grin' ? 0.2 : 0.12;
    ctx.beginPath();
    ctx.moveTo(-w / 2, 0.04);
    ctx.quadraticCurveTo(0, -open * 1.9, w / 2, 0.06);
    ctx.quadraticCurveTo(0, -open * 0.2, -w / 2, 0.04);
    ctx.fillStyle = dark;
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = '#ffffff';
    for (let i = 0; i < 6; i++) {
      const tx = -w / 2 + w * ((i + 0.5) / 6);
      const ty = 0.035 - Math.pow((tx / (w / 2)) * 0.9, 2) * 0.03;
      ctx.beginPath();
      ctx.moveTo(tx - 0.03, ty);
      ctx.lineTo(tx, ty - 0.065);
      ctx.lineTo(tx + 0.03, ty);
      ctx.closePath();
      ctx.fill();
    }
    ctx.restore();
    return;
  }
  switch (kind) {
    case 'smile':
    case 'happy': {
      const depth = kind === 'happy' ? 0.13 : 0.09;
      ctx.beginPath();
      ctx.moveTo(-w / 2, 0);
      ctx.quadraticCurveTo(0, -depth * 2, w / 2, 0);
      if (kind === 'happy') {
        ctx.quadraticCurveTo(0, -depth * 0.4, -w / 2, 0);
        ctx.fillStyle = dark;
        ctx.fill();
        // Tongue, clipped to the mouth.
        ctx.save();
        ctx.clip();
        ctx.beginPath();
        ellipse(ctx, 0.02, -depth * 1.25, w * 0.22, depth * 0.55);
        ctx.fillStyle = '#ff7a9a';
        ctx.fill();
        ctx.restore();
        ctx.beginPath();
        ctx.moveTo(-w / 2, 0);
        ctx.quadraticCurveTo(0, -depth * 2, w / 2, 0);
        ctx.quadraticCurveTo(0, -depth * 0.4, -w / 2, 0);
      }
      ctx.stroke();
      if (plan === 'fluff' || plan === 'cyclops') {
        // Tiny fang.
        ctx.beginPath();
        ctx.moveTo(w * 0.12, -0.035);
        ctx.lineTo(w * 0.2, -0.1);
        ctx.lineTo(w * 0.28, -0.03);
        ctx.fillStyle = '#ffffff';
        ctx.fill();
        ctx.lineWidth = OUTLINE_W * 0.5;
        ctx.stroke();
      }
      break;
    }
    case 'grin': {
      ctx.beginPath();
      ctx.moveTo(-w / 2, 0.02);
      ctx.quadraticCurveTo(0, -0.26, w / 2, 0.02);
      ctx.closePath();
      ctx.fillStyle = dark;
      ctx.fill();
      ctx.stroke();
      ctx.beginPath();
      ctx.rect(-w * 0.35, -0.01, w * 0.7, 0.04);
      ctx.fillStyle = '#ffffff';
      ctx.fill();
      break;
    }
    case 'open':
    case 'o': {
      const s = kind === 'o' ? 0.6 : 1;
      ctx.beginPath();
      ellipse(ctx, 0, -0.05, w * 0.32 * s, 0.09 * s + 0.02);
      ctx.fillStyle = dark;
      ctx.fill();
      ctx.stroke();
      break;
    }
    case 'ouch': {
      ctx.beginPath();
      ctx.moveTo(-w / 2, -0.04);
      for (let i = 1; i <= 4; i++) ctx.lineTo(-w / 2 + (w * i) / 4, i % 2 ? 0.01 : -0.06);
      ctx.lineWidth = OUTLINE_W * 1.1;
      ctx.stroke();
      break;
    }
    case 'flat': {
      ctx.beginPath();
      ctx.moveTo(-w * 0.35, -0.03);
      ctx.lineTo(w * 0.35, -0.02);
      ctx.stroke();
      break;
    }
  }
  ctx.restore();
}

function hornPath(ctx: Ctx, x: number, y: number, len: number, curl: number, width: number): void {
  ctx.beginPath();
  ctx.moveTo(x - width, y);
  ctx.quadraticCurveTo(x - width * 0.6 + curl * 0.3, y + len * 0.7, x + curl, y + len);
  ctx.quadraticCurveTo(x + width * 0.4 + curl * 0.2, y + len * 0.5, x + width, y);
  ctx.closePath();
}

/** Appendages behind the body (drawn before it). */
function drawBackFeatures(ctx: Ctx, spec: PlanSpec, plan: BodyPlan, pose: MonsterPose, pal: CharacterPalette): void {
  const ol = outlineOf(pal.body);
  ctx.strokeStyle = ol;
  ctx.lineWidth = OUTLINE_W;
  if (plan === 'cyclops') {
    // Bat-like ear at the back.
    ctx.save();
    ctx.translate(-spec.rx * 0.7, spec.ry * 0.45);
    ctx.rotate(0.5 + pose.wobbleA * 0.6);
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(-0.16, 0.24);
    ctx.lineTo(0.12, 0.06);
    ctx.closePath();
    ctx.fillStyle = shade(pal.body, 0.15);
    ctx.fill();
    ctx.stroke();
    ctx.restore();
  }
  if (plan === 'yeti' || plan === 'fluff') {
    // Far horn.
    const hx = plan === 'yeti' ? -0.16 : -0.14;
    const hy = spec.ry * 0.82;
    ctx.save();
    ctx.translate(hx, hy);
    ctx.rotate(0.35 + pose.wobbleB * 0.15);
    hornPath(ctx, 0, 0, plan === 'yeti' ? 0.3 : 0.22, -0.12, 0.06);
    ctx.fillStyle = shade(pal.accent, 0.18);
    ctx.fill();
    ctx.stroke();
    ctx.restore();
  }
  if (plan === 'antenna') {
    drawAntenna(ctx, -0.12, spec.ry * 0.85, 0.32 + pose.wobbleB * 0.5, pal, true);
  }
}

function drawAntenna(ctx: Ctx, x: number, y: number, angle: number, pal: CharacterPalette, far: boolean): void {
  const len = 0.36;
  const tipX = x + Math.sin(-angle) * len;
  const tipY = y + Math.cos(angle) * len;
  ctx.beginPath();
  ctx.moveTo(x, y);
  ctx.quadraticCurveTo(x + (tipX - x) * 0.2 + 0.05, y + len * 0.6, tipX, tipY);
  ctx.lineWidth = 0.05 + OUTLINE_W * 2;
  ctx.strokeStyle = outlineOf(pal.body);
  ctx.stroke();
  ctx.lineWidth = 0.05;
  ctx.strokeStyle = far ? shade(pal.body, 0.2) : pal.body;
  ctx.stroke();
  ctx.beginPath();
  ellipse(ctx, tipX, tipY, 0.085, 0.085);
  ctx.fillStyle = far ? shade(pal.accent, 0.2) : pal.accent;
  ctx.lineWidth = OUTLINE_W;
  ctx.strokeStyle = outlineOf(pal.body);
  ctx.fill();
  ctx.stroke();
  if (!far) {
    ctx.beginPath();
    ellipse(ctx, tipX - 0.025, tipY + 0.03, 0.025, 0.025);
    ctx.fillStyle = 'rgba(255,255,255,0.8)';
    ctx.fill();
  }
}

/** Plan-specific details on top of the body (before the face). */
function drawFrontFeatures(ctx: Ctx, spec: PlanSpec, plan: BodyPlan, pose: MonsterPose, pal: CharacterPalette): void {
  const ol = outlineOf(pal.body);
  ctx.strokeStyle = ol;
  ctx.lineWidth = OUTLINE_W;
  switch (plan) {
    case 'fluff': {
      ctx.save();
      ctx.translate(0.18, spec.ry * 0.86);
      ctx.rotate(-0.3 + pose.wobbleA * 0.15);
      hornPath(ctx, 0, 0, 0.24, 0.12, 0.065);
      ctx.fillStyle = pal.accent;
      ctx.fill();
      ctx.stroke();
      ctx.restore();
      // Fur tuft on top.
      ctx.save();
      ctx.translate(0.02, spec.ry * 0.95);
      ctx.rotate(pose.wobbleA * 0.5);
      ctx.beginPath();
      ctx.moveTo(-0.1, -0.02);
      ctx.quadraticCurveTo(-0.08, 0.14, 0.02, 0.18);
      ctx.quadraticCurveTo(0.0, 0.08, 0.1, -0.02);
      ctx.fillStyle = pal.body;
      ctx.fill();
      ctx.stroke();
      ctx.restore();
      break;
    }
    case 'antenna':
      drawAntenna(ctx, 0.14, spec.ry * 0.88, -0.25 + pose.wobbleA * 0.6, pal, false);
      break;
    case 'shaggy': {
      // Swoopy hair tuft: three fat strands that sway with the wobble springs.
      const top = spec.ry * 0.96;
      for (let i = 0; i < 3; i++) {
        const bx = -0.16 + i * 0.13;
        const sway = pose.wobbleA * (0.08 + i * 0.03) + Math.sin(pose.time * 3 + i) * 0.012;
        ctx.beginPath();
        ctx.moveTo(bx - 0.08, top - 0.06);
        ctx.quadraticCurveTo(bx - 0.1 + sway, top + 0.2, bx + 0.12 + sway * 1.6, top + 0.16 - i * 0.03);
        ctx.quadraticCurveTo(bx + 0.02 + sway, top + 0.08, bx + 0.08, top - 0.07);
        ctx.closePath();
        ctx.fillStyle = i === 1 ? pal.body : shade(pal.body, 0.08);
        ctx.fill();
        ctx.stroke();
      }
      // Bushy brows.
      for (const e of spec.eyes) {
        ctx.beginPath();
        ellipse(ctx, e.x + 0.01, e.y + e.r * 1.45, e.r * 0.8, e.r * 0.24, -0.15);
        ctx.fillStyle = shade(pal.body, 0.4);
        ctx.fill();
      }
      // Little horn nubs.
      for (const hx of [-0.3, 0.3]) {
        ctx.beginPath();
        hornPath(ctx, hx, spec.ry * 0.78, 0.13, hx * 0.25, 0.05);
        ctx.fillStyle = pal.accent;
        ctx.fill();
        ctx.stroke();
      }
      break;
    }
    case 'cyclops': {
      ctx.save();
      ctx.translate(0.06, spec.ry * 0.94);
      ctx.rotate(pose.wobbleA * 0.25);
      hornPath(ctx, 0, 0, 0.22, 0.04, 0.07);
      ctx.fillStyle = pal.accent;
      ctx.fill();
      ctx.stroke();
      ctx.restore();
      // Spots.
      ctx.fillStyle = rgba(tint(pal.body, 0.5), 0.55);
      for (const [x, y, r] of [
        [-0.3, 0.1, 0.06],
        [-0.22, -0.18, 0.045],
        [-0.36, -0.06, 0.035],
      ]) {
        ctx.beginPath();
        ellipse(ctx, x, y, r, r);
        ctx.fill();
      }
      break;
    }
    case 'chomper': {
      // Leaf sprout.
      ctx.save();
      ctx.translate(-0.04, spec.ry * 0.92);
      ctx.rotate(pose.wobbleA * 0.7);
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(0, 0.12);
      ctx.lineWidth = 0.04;
      ctx.strokeStyle = shade(pal.accent, 0.2);
      ctx.stroke();
      for (const dir of [-1, 1]) {
        ctx.beginPath();
        ctx.moveTo(0, 0.12);
        ctx.quadraticCurveTo(dir * 0.16, 0.26, dir * 0.24, 0.14);
        ctx.quadraticCurveTo(dir * 0.12, 0.08, 0, 0.12);
        ctx.fillStyle = dir > 0 ? pal.accent : shade(pal.accent, 0.15);
        ctx.lineWidth = OUTLINE_W;
        ctx.strokeStyle = ol;
        ctx.fill();
        ctx.stroke();
      }
      ctx.restore();
      break;
    }
    case 'yeti': {
      ctx.save();
      ctx.translate(0.2, spec.ry * 0.82);
      ctx.rotate(-0.35 + pose.wobbleA * 0.12);
      hornPath(ctx, 0, 0, 0.3, 0.13, 0.065);
      ctx.fillStyle = pal.accent;
      ctx.fill();
      ctx.stroke();
      ctx.restore();
      break;
    }
  }
}

function drawCheeks(ctx: Ctx, spec: PlanSpec, pose: MonsterPose): void {
  if (pose.blush <= 0.02) return;
  const e = spec.eyes;
  const y = e[0].y - e[0].r * 1.25;
  ctx.fillStyle = `rgba(255,110,150,${0.35 * pose.blush + 0.1})`;
  const xs = e.length > 1 ? [e[0].x - 0.04, e[e.length - 1].x + 0.06] : [e[0].x - 0.2, e[0].x + 0.22];
  for (const x of xs) {
    ctx.beginPath();
    ellipse(ctx, x, y, 0.06, 0.035);
    ctx.fill();
  }
}

function drawDizzy(ctx: Ctx, spec: PlanSpec, pose: MonsterPose): void {
  if (pose.dizzy <= 0.02) return;
  const y = spec.ry + 0.22;
  for (let i = 0; i < 3; i++) {
    const a = pose.time * 5 + (i * Math.PI * 2) / 3;
    const x = Math.cos(a) * 0.34;
    const yy = y + Math.sin(a) * 0.08;
    ctx.save();
    ctx.globalAlpha *= pose.dizzy;
    ctx.beginPath();
    star(ctx, x, yy, 0.085, 0.45, 5, a);
    ctx.fillStyle = '#ffe14d';
    ctx.strokeStyle = '#a86a00';
    ctx.lineWidth = 0.025;
    ctx.fill();
    ctx.stroke();
    ctx.restore();
  }
}

/**
 * Draws a monster. The context must already be in world units with +y up
 * at the feet (use beginLocal). Returns the cosmetics anchors.
 */
export function drawMonster(
  ctx: Ctx,
  plan: BodyPlan,
  pal: CharacterPalette,
  pose: MonsterPose,
  style: MonsterStyle,
  layers: { back?: CosmeticLayer; front?: CosmeticLayer } = {},
  anchorsOut?: RigAnchors,
): void {
  const spec = PLANS[plan];
  const ol = outlineOf(pal.body);
  const f = Math.max(0, Math.min(1, pose.facing));

  if (style.shadow) {
    const drop = Math.max(-3, style.shadowDrop);
    const sc = Math.max(0.25, 1 + drop * 0.18);
    ctx.beginPath();
    ellipse(ctx, 0.02, drop + 0.01, 0.5 * sc, 0.09 * sc);
    ctx.fillStyle = `rgba(20,10,30,${0.22 * sc})`;
    ctx.fill();
  }

  ctx.save();
  ctx.translate(0, pose.hop);
  // Rotations (flips, dizzy wobble) pivot around the body centre.
  ctx.translate(0, spec.cy);
  ctx.rotate(-pose.rot);
  ctx.translate(0, -spec.cy);
  ctx.scale(pose.flip, 1);
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';

  // Squash & stretch around the feet, lean around the body centre.
  const sy = pose.squash;
  const sx = 1 / Math.sqrt(Math.max(0.3, sy));
  const hipY = spec.hipY * sy + pose.bob;
  // Side view: legs one behind the other; front view: side by side.
  const farHip = -spec.hipX * (0.35 + 0.65 * f);
  const nearHip = spec.hipX * (0.6 + 0.4 * f);
  const footSpread = f * 0.06;

  // Both legs sit behind the body; only the stubby lower part and the feet show.
  ctx.save();
  ctx.scale(sx, 1);
  drawLeg(ctx, farHip, hipY, farHip + pose.footFar.x * (1 - f) - footSpread, pose.footFar.y, spec, pal, f < 0.5);
  drawLeg(ctx, nearHip, hipY, nearHip + pose.footNear.x * (1 - f) + footSpread, pose.footNear.y, spec, pal, false);
  ctx.restore();

  const bodyY = spec.cy * sy + pose.bob;
  // Face features slide to the centre when the monster turns to the camera.
  const faceShift = -f * (spec.eyes.length > 1 ? (spec.eyes[0].x + spec.eyes[spec.eyes.length - 1].x) / 2 : spec.eyes[0].x);
  const farShoulderX = spec.shoulder.x - 0.16 + f * (-spec.rx * 0.78 - spec.shoulder.x + 0.16);
  const nearShoulderX = spec.shoulder.x + 0.04 + f * (spec.rx * 0.78 - spec.shoulder.x - 0.04);
  const shoulderY = spec.shoulder.y + f * 0.04;

  ctx.save();
  ctx.translate(0, bodyY);
  ctx.rotate(-pose.lean);
  ctx.scale(sx, sy);

  // In side view the far arm hides behind the body.
  if (f < 0.5) drawArm(ctx, farShoulderX, shoulderY + 0.03, pose.armFar, spec, pal, true, pose.armReach);
  const anchors = anchorsOut ? fillAnchors(anchorsOut, spec, faceShift) : null;
  if (layers.back && anchors) layers.back(ctx, anchors, pose, pal);

  drawBackFeatures(ctx, spec, plan, pose, pal);

  ctx.beginPath();
  bodyPath(ctx, spec, pose.time, Math.abs(pose.squash - 1));
  fillBody(ctx, pal.body, spec.rx, spec.ry, style.flat);
  ctx.fill();
  ctx.lineWidth = OUTLINE_W;
  ctx.strokeStyle = ol;
  ctx.stroke();

  if (!style.flat) {
    // Rim highlight along the top-left.
    ctx.beginPath();
    ctx.ellipse(-spec.rx * 0.2, spec.ry * 0.25, spec.rx * 0.62, spec.ry * 0.55, 0.4, Math.PI * 0.55, Math.PI * 0.95);
    ctx.lineWidth = 0.045;
    ctx.strokeStyle = 'rgba(255,255,255,0.38)';
    ctx.stroke();
  }

  if (spec.belly) {
    const b = spec.belly;
    ctx.beginPath();
    ellipse(ctx, b.x + faceShift * 0.8, b.y, b.rx, b.ry);
    ctx.fillStyle = pal.belly;
    ctx.fill();
    if (plan === 'yeti') {
      ctx.lineWidth = OUTLINE_W * 0.6;
      ctx.strokeStyle = rgba(ol, 0.5);
      ctx.stroke();
    }
  }

  drawFrontFeatures(ctx, spec, plan, pose, pal);
  ctx.save();
  ctx.translate(faceShift, 0);
  drawCheeks(ctx, spec, pose);
  for (let i = 0; i < spec.eyes.length; i++) drawEye(ctx, spec.eyes[i], pose, pal, plan === 'antenna');
  drawMouth(ctx, spec, plan, pose, pal);
  ctx.restore();

  if (layers.front && anchors) layers.front(ctx, anchors, pose, pal);
  ctx.restore();

  // Arm(s) in front of the body.
  ctx.save();
  ctx.translate(0, bodyY);
  ctx.rotate(-pose.lean);
  ctx.scale(sx, sy);
  if (f >= 0.5) {
    // Front view: the far arm mirrors to the left side.
    ctx.save();
    ctx.scale(-1, 1);
    drawArm(ctx, -farShoulderX, shoulderY, pose.armFar, spec, pal, false, pose.armReach);
    ctx.restore();
  }
  drawArm(ctx, nearShoulderX, shoulderY, pose.armNear, spec, pal, false, pose.armReach);
  ctx.restore();

  ctx.save();
  ctx.translate(0, bodyY);
  drawDizzy(ctx, spec, pose);
  ctx.restore();

  ctx.restore();
}

function fillAnchors(out: RigAnchors, spec: PlanSpec, faceShift: number): RigAnchors {
  out.headTop.x = spec.headTop.x + faceShift * 0.3;
  out.headTop.y = spec.headTop.y;
  out.headW = spec.headW;
  const e = spec.eyes;
  out.eyeCenter.x = (e.length > 1 ? (e[0].x + e[e.length - 1].x) / 2 : e[0].x) + faceShift;
  out.eyeCenter.y = e[0].y;
  out.eyeSpan = e.length > 1 ? e[e.length - 1].x - e[0].x + e[0].r * 2 : e[0].r * 2.2;
  out.back.x = -spec.rx * 0.8;
  out.back.y = 0;
  out.bodyRx = spec.rx;
  out.bodyRy = spec.ry;
  return out;
}

export function makeAnchors(): RigAnchors {
  return { headTop: { x: 0, y: 0 }, headW: 0.6, eyeCenter: { x: 0, y: 0 }, eyeSpan: 0.4, back: { x: 0, y: 0 }, bodyRx: 0.5, bodyRy: 0.5 };
}

/** Visual height of a plan from feet to the top of the head (for name tags, etc.). */
export function monsterHeight(plan: BodyPlan): number {
  const s = PLANS[plan];
  return s.cy + s.ry + 0.2;
}
