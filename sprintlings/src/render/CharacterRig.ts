import type { BodyPlan, CharacterPalette } from '../player/CharacterDefinition';
import { ellipse, mix, roundRect, shade, star, tint, type Ctx } from './draw';

/**
 * Vector western critters drawn with Canvas2D paths: an animal head, a
 * frontier outfit (shirt, vest, bandana, belt, jeans, boots), jointed legs
 * and arms, and a tail. Local units: 1 = one world unit (the hitbox is
 * 1.1 u tall), origin at the feet, +x forward (racers face right), +y up.
 * The rig is a pure function of the pose, so the race, the menu stage and
 * the UI thumbnails all share it.
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
  bob: number;
  squash: number;
  lean: number;
  rot: number;
  /** Horizontal facing scale: 1 faces right, -1 left (spins animate through 0). */
  flip: number;
  /** Feet relative to their hip, in normalised run-cycle units. */
  footNear: Vec;
  footFar: Vec;
  /** Arm angles in radians: 0 hangs down, +PI/2 points forward, PI straight up. */
  armNear: number;
  armFar: number;
  armReach: number;
  /** Secondary-motion angles (ears, tail, bandana). */
  wobbleA: number;
  wobbleB: number;
  blink: number;
  lookX: number;
  lookY: number;
  eyes: EyeKind;
  mouth: MouthKind;
  dizzy: number;
  blush: number;
  hop: number;
  /** 0 = side view (running right), 1 = facing the camera. */
  facing: number;
  /** Set by drawMonster while turning: 1 = front view still turned 3/4 toward the right, 0 = straight on. */
  yaw?: number;
  /** Run-cycle phase and amount (0..1), for mounts that gallop along. */
  gait?: number;
  runAmt?: number;
  climbing?: boolean;
  sliding?: boolean;
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
    armNear: 0.2,
    armFar: 0.15,
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

/** Anchors cosmetics attach to. Head fields are in head space, back fields in torso space. */
/** One eye in head space; `sx` squashes it horizontally when the head is turned. */
export interface EyeAnchor {
  x: number;
  y: number;
  r: number;
  sx: number;
}

export interface RigAnchors {
  headTop: Vec;
  headW: number;
  eyeCenter: Vec;
  eyeSpan: number;
  /** [near eye (the right eye, the one facing the camera while racing), far eye]. */
  eyes: [EyeAnchor, EyeAnchor];
  /** Head seen from the side (eyewear gets a temple arm). */
  side: boolean;
  /** Torso outline (body space): bottom/top half widths and bottom/top heights. */
  torso: { wBot: number; wTop: number; y0: number; y1: number };
  back: Vec;
  bodyRx: number;
  bodyRy: number;
}

export interface MonsterStyle {
  flat: boolean;
  shadow: boolean;
  shadowDrop: number;
}

export type CosmeticLayer = (ctx: Ctx, anchors: RigAnchors, pose: MonsterPose, pal: CharacterPalette) => void;

/** Something ridden: drawn under (and partly over) the rider, who sits on `saddle`. */
export interface MountLayer {
  kind: 'ride' | 'hover' | 'stick';
  /** Height of the seat above the ground (ignored for 'stick', ridden on foot). */
  saddle: number;
  riderScale: number;
  /** Highest point of the mount (for name tags). */
  top: number;
  behind?: (ctx: Ctx, pose: MonsterPose) => void;
  front?: (ctx: Ctx, pose: MonsterPose) => void;
}

/** Every cosmetic layer the rig knows how to place. */
export interface RigLayers {
  back?: CosmeticLayer;
  front?: CosmeticLayer;
  /** Full outfit: palette overrides plus drawings behind the body, on the torso (clipped) and over it. */
  outfit?: { palette?: Partial<CharacterPalette>; under?: CosmeticLayer; overClip?: CosmeticLayer; over?: CosmeticLayer };
  /** Prop held in the right hand; drawn in hand space with +y running up the prop. */
  hand?: (ctx: Ctx, pose: MonsterPose) => void;
  mount?: MountLayer;
}

export function makeAnchors(): RigAnchors {
  return {
    headTop: { x: 0, y: 0 },
    headW: 0.6,
    eyeCenter: { x: 0, y: 0 },
    eyeSpan: 0.3,
    eyes: [
      { x: -0.1, y: 0.05, r: 0.072, sx: 1 },
      { x: 0.1, y: 0.05, r: 0.072, sx: 1 },
    ],
    side: false,
    torso: { wBot: 0.24, wTop: 0.27, y0: 0.39, y1: 0.85 },
    back: { x: 0, y: 0 },
    bodyRx: 0.2,
    bodyRy: 0.24,
  };
}

// --- proportions --------------------------------------------------------------------

const OW = 0.038;
const HIP_Y = 0.42;
const SHOULDER_Y = 0.8;
const HEAD_Y = 1.08;
const THIGH = 0.22;
const SHIN = 0.22;
const LEG_W = 0.13;
const ARM_W = 0.095;
const ARM_LEN = 0.17;
/** Animator foot offsets are tuned for stubby legs; these legs reach further. */
const STRIDE_SCALE = 1.45;

interface Species {
  headRx: number;
  headRy: number;
  /** Extra height for the name tag (tall ears). */
  earTop: number;
  build: number;
}

const SPECIES: Record<BodyPlan, Species> = {
  fox: { headRx: 0.27, headRy: 0.25, earTop: 0.2, build: 1 },
  rabbit: { headRx: 0.24, headRy: 0.25, earTop: 0.42, build: 0.95 },
  bear: { headRx: 0.29, headRy: 0.27, earTop: 0.08, build: 1.18 },
  raccoon: { headRx: 0.27, headRy: 0.25, earTop: 0.12, build: 1 },
  bull: { headRx: 0.29, headRy: 0.26, earTop: 0.2, build: 1.15 },
  wolf: { headRx: 0.27, headRy: 0.26, earTop: 0.22, build: 1.05 },
};

/** Visual height from feet to the top of the head/ears (for name tags). */
export function monsterHeight(plan: BodyPlan): number {
  const s = SPECIES[plan];
  return HEAD_Y + s.headRy + s.earTop;
}

const OL = '#2a1a1e';

/** Two-pass stroke so a polyline limb gets one clean outline. */
function tube(ctx: Ctx, pts: number[], width: number, fill: string, cap?: () => void): void {
  for (let pass = 0; pass < 2; pass++) {
    ctx.beginPath();
    ctx.moveTo(pts[0], pts[1]);
    for (let i = 2; i < pts.length; i += 2) ctx.lineTo(pts[i], pts[i + 1]);
    ctx.lineWidth = width + (pass === 0 ? OW * 2 : 0);
    ctx.strokeStyle = pass === 0 ? OL : fill;
    ctx.stroke();
    if (cap) {
      ctx.beginPath();
      cap();
      ctx.fillStyle = pass === 0 ? OL : fill;
      if (pass === 0) {
        ctx.lineWidth = OW * 2;
        ctx.strokeStyle = OL;
        ctx.stroke();
      }
      ctx.fill();
    }
  }
}

function fillOutlined(ctx: Ctx, fill: string | CanvasGradient, lw = OW): void {
  ctx.fillStyle = fill;
  ctx.fill();
  ctx.lineWidth = lw;
  ctx.strokeStyle = OL;
  ctx.stroke();
}

// --- limbs --------------------------------------------------------------------------

/** Two-bone leg from hip to foot (knee bends forward) with a cowboy boot. */
function drawLeg(ctx: Ctx, hx: number, hy: number, fx: number, fy: number, pal: CharacterPalette, far: boolean, front: boolean): void {
  let dx = fx - hx;
  let dy = fy + 0.1 - hy;
  const d = Math.min(Math.hypot(dx, dy), THIGH + SHIN - 0.005);
  const ang = Math.atan2(dy, dx);
  dx = Math.cos(ang) * d;
  dy = Math.sin(ang) * d;
  const a = Math.acos(Math.max(-1, Math.min(1, (THIGH * THIGH + d * d - SHIN * SHIN) / (2 * THIGH * d))));
  // Knee forward (+x): rotate the hip->foot direction toward +x.
  const kAng = ang + (front ? 0 : a);
  const kx = hx + Math.cos(kAng) * THIGH;
  const ky = hy + Math.sin(kAng) * THIGH;
  const ax = hx + dx;
  const ay = hy + dy;
  const pants = far ? shade(pal.pants, 0.25) : pal.pants;
  tube(ctx, [hx, hy, kx, ky, ax, ay], LEG_W, pants);
  // Boot.
  const boot = far ? shade(pal.boots, 0.25) : pal.boots;
  ctx.beginPath();
  if (front) {
    roundRect(ctx, ax - 0.075, fy, 0.15, 0.16, 0.05);
  } else {
    ctx.moveTo(ax - 0.07, ay + 0.04);
    ctx.lineTo(ax - 0.075, fy + 0.03);
    ctx.lineTo(ax - 0.1, fy);
    ctx.lineTo(ax + 0.14, fy);
    ctx.quadraticCurveTo(ax + 0.2, fy + 0.005, ax + 0.18, fy + 0.055);
    ctx.quadraticCurveTo(ax + 0.1, fy + 0.085, ax + 0.065, fy + 0.1);
    ctx.lineTo(ax + 0.07, ay + 0.04);
    ctx.closePath();
  }
  fillOutlined(ctx, boot);
  // Heel and top stitching.
  ctx.fillStyle = shade(boot, 0.35);
  if (!front) ctx.fillRect(ax - 0.1, fy, 0.06, 0.03);
  ctx.beginPath();
  ctx.moveTo(ax - 0.07, ay + 0.02);
  ctx.lineTo(ax + 0.07, ay + 0.02);
  ctx.lineWidth = 0.02;
  ctx.strokeStyle = tint(boot, 0.3);
  ctx.stroke();
}

function drawArm(ctx: Ctx, sx: number, sy: number, angle: number, reach: number, pal: CharacterPalette, far: boolean, held?: () => void): void {
  const len = ARM_LEN * reach;
  // Elbow bends against the swing for a natural arc.
  const elbowAng = angle - 0.35;
  const ex = sx + Math.sin(elbowAng) * len;
  const ey = sy - Math.cos(elbowAng) * len;
  const hx = ex + Math.sin(angle + 0.25) * len;
  const hy = ey - Math.cos(angle + 0.25) * len;
  const sleeve = far ? shade(pal.shirt, 0.25) : pal.shirt;
  tube(ctx, [sx, sy, ex, ey, hx, hy], ARM_W, sleeve);
  if (held) {
    // Prop gripped in the fist, tilted up and forward from the forearm.
    ctx.save();
    ctx.translate(hx, hy);
    ctx.rotate(angle + 0.25 - 0.5);
    held();
    ctx.restore();
  }
  ctx.beginPath();
  ellipse(ctx, hx, hy, 0.065, 0.06, angle);
  fillOutlined(ctx, far ? shade(pal.body, 0.2) : pal.body);
}

// --- torso --------------------------------------------------------------------------

function torsoDims(plan: BodyPlan, front: boolean): { wBot: number; wTop: number; y0: number; y1: number } {
  const b = SPECIES[plan].build;
  return { wBot: (front ? 0.24 : 0.23) * b, wTop: (front ? 0.27 : 0.24) * b, y0: HIP_Y - 0.03, y1: SHOULDER_Y + 0.05 };
}

function torsoPath(ctx: Ctx, plan: BodyPlan, front: boolean): void {
  const { wBot, wTop, y0, y1 } = torsoDims(plan, front);
  ctx.beginPath();
  ctx.moveTo(-wBot, y0);
  ctx.quadraticCurveTo(-wTop * 1.12, (y0 + y1) / 2, -wTop, y1);
  ctx.quadraticCurveTo(0, y1 + 0.07, wTop, y1);
  ctx.quadraticCurveTo(wTop * 1.12, (y0 + y1) / 2, wBot, y0);
  ctx.closePath();
}

function drawTorso(ctx: Ctx, plan: BodyPlan, pal: CharacterPalette, pose: MonsterPose, front: boolean): void {
  const b = SPECIES[plan].build;
  const wBot = (front ? 0.24 : 0.23) * b;
  const wTop = (front ? 0.27 : 0.24) * b;
  const y0 = HIP_Y - 0.03;
  const y1 = SHOULDER_Y + 0.05;
  const shirt = ctx.createLinearGradient(0, y1 + 0.07, 0, y0 - 0.03);
  shirt.addColorStop(0, tint(pal.shirt, 0.14));
  shirt.addColorStop(0.46, pal.shirt);
  shirt.addColorStop(1, shade(pal.shirt, 0.12));
  ctx.beginPath();
  ctx.moveTo(-wBot, y0);
  ctx.quadraticCurveTo(-wTop * 1.12, (y0 + y1) / 2, -wTop, y1);
  ctx.quadraticCurveTo(0, y1 + 0.07, wTop, y1);
  ctx.quadraticCurveTo(wTop * 1.12, (y0 + y1) / 2, wBot, y0);
  ctx.closePath();
  fillOutlined(ctx, shirt);
  ctx.save();
  ctx.clip();
  // Vest panels (front view: both sides; side view: the front half).
  const vest = ctx.createLinearGradient(0, y1 + 0.08, 0, y0 - 0.02);
  vest.addColorStop(0, tint(pal.vest, 0.12));
  vest.addColorStop(0.52, pal.vest);
  vest.addColorStop(1, shade(pal.vest, 0.16));
  ctx.fillStyle = vest;
  if (front) {
    ctx.beginPath();
    ctx.moveTo(-wTop - 0.05, y1 + 0.1);
    ctx.lineTo(-0.05, y1 - 0.05);
    ctx.lineTo(-0.07, y0 - 0.05);
    ctx.lineTo(-wBot - 0.1, y0 - 0.05);
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(wTop + 0.05, y1 + 0.1);
    ctx.lineTo(0.05, y1 - 0.05);
    ctx.lineTo(0.07, y0 - 0.05);
    ctx.lineTo(wBot + 0.1, y0 - 0.05);
    ctx.fill();
  } else {
    ctx.beginPath();
    ctx.moveTo(-wTop - 0.05, y1 + 0.1);
    ctx.lineTo(0.06, y1 + 0.1);
    ctx.lineTo(0.08, y0 - 0.05);
    ctx.lineTo(-wBot - 0.1, y0 - 0.05);
    ctx.fill();
  }
  // Pockets / stitching.
  ctx.strokeStyle = tint(pal.vest, 0.25);
  ctx.lineWidth = 0.018;
  ctx.setLineDash([0.03, 0.025]);
  ctx.beginPath();
  if (front) {
    ctx.moveTo(-0.07, y1 - 0.04);
    ctx.lineTo(-0.09, y0);
    ctx.moveTo(0.07, y1 - 0.04);
    ctx.lineTo(0.09, y0);
  } else {
    ctx.moveTo(0.05, y1 + 0.02);
    ctx.lineTo(0.07, y0);
  }
  ctx.stroke();
  ctx.setLineDash([]);
  // Belt.
  ctx.fillStyle = shade(pal.boots, 0.15);
  ctx.fillRect(-0.5, y0 - 0.02, 1, 0.07);
  ctx.restore();
  // Buckle.
  ctx.beginPath();
  roundRect(ctx, (front ? 0 : wBot * 0.55) - 0.045, y0 - 0.025, 0.09, 0.075, 0.015);
  fillOutlined(ctx, '#f2c14e', 0.02);
  // Sheriff badge for the wolf.
  if (plan === 'wolf') {
    ctx.beginPath();
    star(ctx, front ? -0.12 : -0.02, y1 - 0.13, 0.055, 0.5, 5);
    fillOutlined(ctx, '#ffd23f', 0.015);
  }
  // Bandana knotted at the neck, its tip fluttering.
  const flap = pose.wobbleB * 0.03;
  ctx.beginPath();
  if (front) {
    ctx.moveTo(-0.15, y1 + 0.03);
    ctx.quadraticCurveTo(0, y1 - 0.02, 0.15, y1 + 0.03);
    ctx.lineTo(flap, y1 - 0.13);
    ctx.closePath();
  } else {
    ctx.moveTo(-0.13, y1 + 0.04);
    ctx.quadraticCurveTo(0.02, y1 - 0.01, 0.17, y1 + 0.04);
    ctx.lineTo(0.12 + flap, y1 - 0.1);
    ctx.closePath();
  }
  fillOutlined(ctx, pal.scarf, 0.03);
  ctx.fillStyle = 'rgba(255,255,255,0.75)';
  for (const [x, y] of front
    ? [
        [-0.06, y1 + 0.005],
        [0.06, y1 + 0.005],
        [0, y1 - 0.06],
      ]
    : [
        [0.04, y1 + 0.01],
        [0.12, y1 - 0.04],
      ]) {
    ctx.beginPath();
    ellipse(ctx, x, y, 0.014, 0.014);
    ctx.fill();
  }
}

// --- tails --------------------------------------------------------------------------

function drawTail(ctx: Ctx, plan: BodyPlan, pal: CharacterPalette, pose: MonsterPose, x: number, y: number): void {
  const sway = pose.wobbleB * 0.5 + Math.sin(pose.time * 6) * 0.05;
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(sway);
  ctx.beginPath();
  switch (plan) {
    case 'fox':
    case 'wolf': {
      const len = plan === 'fox' ? 0.5 : 0.42;
      ctx.moveTo(0.02, 0.03);
      ctx.bezierCurveTo(-0.18, 0.2, -len * 0.8, 0.12, -len, 0.18);
      ctx.bezierCurveTo(-len * 0.9, 0.0, -0.25, -0.12, 0.02, -0.05);
      ctx.closePath();
      fillOutlined(ctx, pal.body);
      // Light tip.
      ctx.save();
      ctx.clip();
      ctx.beginPath();
      ellipse(ctx, -len, 0.14, 0.14, 0.12);
      ctx.fillStyle = pal.belly;
      ctx.fill();
      ctx.restore();
      break;
    }
    case 'raccoon': {
      ctx.moveTo(0.02, 0.03);
      ctx.bezierCurveTo(-0.15, 0.15, -0.35, 0.18, -0.42, 0.1);
      ctx.bezierCurveTo(-0.4, -0.02, -0.2, -0.08, 0.02, -0.05);
      ctx.closePath();
      fillOutlined(ctx, pal.body);
      ctx.save();
      ctx.clip();
      ctx.fillStyle = pal.accent;
      for (const k of [0.12, 0.25, 0.38]) {
        ctx.beginPath();
        ctx.ellipse(-k, 0.05, 0.035, 0.2, -0.4, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
      break;
    }
    case 'rabbit':
      ellipse(ctx, -0.04, 0.02, 0.09, 0.085);
      fillOutlined(ctx, pal.belly);
      break;
    case 'bear':
      ellipse(ctx, -0.03, 0.02, 0.06, 0.055);
      fillOutlined(ctx, pal.body);
      break;
    case 'bull': {
      ctx.moveTo(0, 0);
      ctx.quadraticCurveTo(-0.15, -0.05, -0.22, -0.22);
      ctx.lineWidth = 0.035;
      ctx.strokeStyle = OL;
      ctx.stroke();
      ctx.beginPath();
      ellipse(ctx, -0.23, -0.25, 0.04, 0.06);
      fillOutlined(ctx, shade(pal.body, 0.35));
      break;
    }
  }
  ctx.restore();
}

// --- heads --------------------------------------------------------------------------

function drawEye(ctx: Ctx, x: number, y: number, r: number, pose: MonsterPose, pal: CharacterPalette, lashes: boolean): void {
  ctx.save();
  ctx.translate(x, y);
  const kind = pose.eyes;
  ctx.lineCap = 'round';
  if (kind === 'happy' || (kind === 'closed' && pose.blink < 0.5)) {
    ctx.beginPath();
    ctx.arc(0, -r * 0.25, r * 0.8, Math.PI * 0.15, Math.PI * 0.85);
    ctx.lineWidth = r * 0.38;
    ctx.strokeStyle = pal.eye;
    ctx.stroke();
    ctx.restore();
    return;
  }
  const squint = kind === 'squint' ? 0.55 : 1;
  const wide = kind === 'wide' ? 1.15 : 1;
  const open = Math.max(0.08, (1 - pose.blink) * squint);
  ctx.scale(wide, open * wide);
  ctx.beginPath();
  ellipse(ctx, 0, 0, r, r * 1.12);
  ctx.fillStyle = '#ffffff';
  ctx.fill();
  ctx.lineWidth = OW * 0.8;
  ctx.strokeStyle = OL;
  ctx.stroke();
  if (kind === 'dizzy') {
    ctx.beginPath();
    for (let i = 0; i <= 20; i++) {
      const a = i * 0.6 + pose.time * 10;
      const rr = (i / 20) * r * 0.8;
      if (i === 0) ctx.moveTo(Math.cos(a) * rr, Math.sin(a) * rr);
      else ctx.lineTo(Math.cos(a) * rr, Math.sin(a) * rr);
    }
    ctx.lineWidth = r * 0.18;
    ctx.strokeStyle = pal.eye;
    ctx.stroke();
  } else {
    const px = Math.max(-1, Math.min(1, pose.lookX)) * r * 0.35;
    const py = Math.max(-1, Math.min(1, pose.lookY)) * r * 0.3;
    const pr = kind === 'wide' ? r * 0.45 : r * 0.6;
    ctx.beginPath();
    ellipse(ctx, px, py, pr, pr * 1.08);
    ctx.fillStyle = pal.eye;
    ctx.fill();
    ctx.beginPath();
    ellipse(ctx, px - pr * 0.3, py + pr * 0.4, pr * 0.35, pr * 0.35);
    ctx.fillStyle = '#ffffff';
    ctx.fill();
  }
  ctx.restore();
  if (lashes && kind !== 'dizzy') {
    ctx.beginPath();
    ctx.moveTo(x + r * 0.5, y + r * 0.95);
    ctx.lineTo(x + r * 1.05, y + r * 1.25);
    ctx.lineWidth = r * 0.2;
    ctx.lineCap = 'round';
    ctx.strokeStyle = pal.eye;
    ctx.stroke();
  }
}

function drawMouth(ctx: Ctx, x: number, y: number, w: number, pose: MonsterPose, pal: CharacterPalette, buckTeeth: boolean): void {
  ctx.save();
  ctx.translate(x, y);
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.strokeStyle = OL;
  ctx.lineWidth = OW * 0.9;
  const dark = mix(pal.eye, '#6a1028', 0.4);
  switch (pose.mouth) {
    case 'happy':
    case 'grin': {
      ctx.beginPath();
      ctx.moveTo(-w / 2, 0);
      ctx.quadraticCurveTo(0, -w * 1.1, w / 2, 0);
      ctx.closePath();
      ctx.fillStyle = dark;
      ctx.fill();
      ctx.save();
      ctx.clip();
      if (pose.mouth === 'grin') {
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(-w / 2, -w * 0.18, w, w * 0.18);
      } else {
        ctx.beginPath();
        ellipse(ctx, 0, -w * 0.5, w * 0.25, w * 0.2);
        ctx.fillStyle = '#ff7a9a';
        ctx.fill();
      }
      ctx.restore();
      ctx.stroke();
      break;
    }
    case 'open':
    case 'o': {
      const k = pose.mouth === 'o' ? 0.5 : 0.8;
      ctx.beginPath();
      ellipse(ctx, 0, -w * 0.25, w * 0.3 * k, w * 0.32 * k);
      ctx.fillStyle = dark;
      ctx.fill();
      ctx.stroke();
      break;
    }
    case 'ouch':
      ctx.beginPath();
      ctx.moveTo(-w / 2, -0.01);
      for (let i = 1; i <= 4; i++) ctx.lineTo(-w / 2 + (w * i) / 4, i % 2 ? -0.04 : -0.01);
      ctx.stroke();
      break;
    case 'flat':
      ctx.beginPath();
      ctx.moveTo(-w * 0.35, -0.01);
      ctx.lineTo(w * 0.35, -0.01);
      ctx.stroke();
      break;
    default:
      ctx.beginPath();
      ctx.moveTo(-w / 2, 0);
      ctx.quadraticCurveTo(0, -w * 0.7, w / 2, 0);
      ctx.stroke();
  }
  if (buckTeeth && pose.mouth !== 'ouch') {
    ctx.beginPath();
    roundRect(ctx, -0.025, -0.06, 0.05, 0.055, 0.01);
    fillOutlined(ctx, '#ffffff', 0.015);
  }
  ctx.restore();
}

/** One ear in head space, rooted at (x, y), pointing up, tilted by `tilt`. */
function drawEar(ctx: Ctx, plan: BodyPlan, pal: CharacterPalette, x: number, y: number, tilt: number, far: boolean): void {
  const fur = far ? shade(pal.body, 0.18) : pal.body;
  const inner = plan === 'rabbit' || plan === 'raccoon' || plan === 'bear' ? pal.belly : plan === 'bull' ? tint(pal.body, 0.3) : pal.belly;
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(tilt);
  ctx.beginPath();
  switch (plan) {
    case 'rabbit':
      ellipse(ctx, 0, 0.21, 0.065, 0.24);
      fillOutlined(ctx, fur);
      ctx.beginPath();
      ellipse(ctx, 0.005, 0.22, 0.032, 0.18);
      ctx.fillStyle = far ? shade(pal.accent, 0.2) : pal.accent;
      ctx.fill();
      break;
    case 'bear':
      ellipse(ctx, 0, 0.04, 0.075, 0.07);
      fillOutlined(ctx, fur);
      ctx.beginPath();
      ellipse(ctx, 0, 0.04, 0.04, 0.038);
      ctx.fillStyle = inner;
      ctx.fill();
      break;
    case 'bull':
      // Ears stick out sideways; horns are drawn separately.
      ellipse(ctx, 0, 0, 0.1, 0.045, 0.4);
      fillOutlined(ctx, fur);
      break;
    default: {
      const h = plan === 'raccoon' ? 0.15 : plan === 'wolf' ? 0.22 : 0.21;
      const w = plan === 'raccoon' ? 0.085 : 0.075;
      ctx.moveTo(-w, -0.02);
      ctx.quadraticCurveTo(-w * 0.6, h * 0.7, 0, h);
      ctx.quadraticCurveTo(w * 0.7, h * 0.6, w, -0.02);
      ctx.closePath();
      fillOutlined(ctx, plan === 'raccoon' && !far ? shade(pal.body, 0.1) : fur);
      ctx.beginPath();
      ctx.moveTo(-w * 0.5, 0.01);
      ctx.quadraticCurveTo(-w * 0.3, h * 0.6, 0, h * 0.8);
      ctx.quadraticCurveTo(w * 0.35, h * 0.5, w * 0.5, 0.01);
      ctx.closePath();
      ctx.fillStyle = plan === 'fox' ? pal.accent : inner;
      ctx.fill();
    }
  }
  ctx.restore();
}

function drawHorn(ctx: Ctx, pal: CharacterPalette, x: number, y: number, dir: number, far: boolean): void {
  ctx.beginPath();
  ctx.moveTo(x, y - 0.03);
  ctx.quadraticCurveTo(x + dir * 0.16, y - 0.02, x + dir * 0.2, y + 0.16);
  ctx.quadraticCurveTo(x + dir * 0.1, y + 0.06, x - dir * 0.01, y + 0.05);
  ctx.closePath();
  fillOutlined(ctx, far ? shade(pal.accent, 0.2) : pal.accent);
}

/** Side-view head, in head space (centre 0,0). */
function drawHeadSide(ctx: Ctx, plan: BodyPlan, pal: CharacterPalette, pose: MonsterPose, flat: boolean): void {
  const sp = SPECIES[plan];
  const rx = sp.headRx;
  const ry = sp.headRy;
  const wa = pose.wobbleA;
  // Far ear / horn behind the head.
  if (plan === 'bull') {
    drawHorn(ctx, pal, -0.08, ry * 0.7, -1, true);
    drawEar(ctx, plan, pal, -0.2, ry * 0.25, 0.5 + wa * 0.2, true);
  } else drawEar(ctx, plan, pal, plan === 'rabbit' ? -0.1 : -0.12, ry * 0.75, (plan === 'rabbit' ? 0.35 : 0.2) + wa * (plan === 'rabbit' ? 0.5 : 0.25), true);

  // Head.
  ctx.beginPath();
  ellipse(ctx, 0, 0, rx, ry);
  if (flat) ctx.fillStyle = pal.body;
  else {
    const g = ctx.createRadialGradient(-rx * 0.3, ry * 0.4, rx * 0.1, 0, 0, rx * 1.2);
    g.addColorStop(0, tint(pal.body, 0.3));
    g.addColorStop(0.6, pal.body);
    g.addColorStop(1, shade(pal.body, 0.15));
    ctx.fillStyle = g;
  }
  ctx.fill();
  ctx.lineWidth = OW;
  ctx.strokeStyle = OL;
  ctx.stroke();

  // Cheek fluff / light lower face.
  ctx.save();
  ctx.beginPath();
  ellipse(ctx, 0, 0, rx, ry);
  ctx.clip();
  ctx.beginPath();
  if (plan === 'fox' || plan === 'wolf' || plan === 'raccoon') ellipse(ctx, 0.12, -ry * 0.55, rx * 0.75, ry * 0.5);
  else if (plan === 'rabbit') ellipse(ctx, 0.12, -ry * 0.45, rx * 0.55, ry * 0.42);
  ctx.fillStyle = pal.belly;
  ctx.fill();
  if (plan === 'raccoon') {
    // Bandit mask across the eyes.
    ctx.beginPath();
    ctx.moveTo(-rx, 0.06);
    ctx.quadraticCurveTo(0, 0.14, rx, 0.08);
    ctx.lineTo(rx, -0.04);
    ctx.quadraticCurveTo(0.08, -0.06, -rx, -0.06);
    ctx.closePath();
    ctx.fillStyle = pal.accent;
    ctx.fill();
  }
  ctx.restore();

  // Snout / muzzle.
  let noseX = 0;
  let noseY = 0;
  let mouthX = 0;
  let mouthY = 0;
  let mouthW = 0.1;
  ctx.beginPath();
  switch (plan) {
    case 'fox':
    case 'wolf': {
      const L = plan === 'fox' ? 0.2 : 0.23;
      ctx.moveTo(rx * 0.55, 0.05);
      ctx.quadraticCurveTo(rx + L * 0.6, 0.03, rx + L, -0.03);
      ctx.quadraticCurveTo(rx + L + 0.02, -0.08, rx + L - 0.05, -0.1);
      ctx.quadraticCurveTo(rx * 0.9, -0.15, rx * 0.5, -0.13);
      ctx.closePath();
      fillOutlined(ctx, pal.belly);
      ctx.beginPath();
      ctx.moveTo(rx * 0.55, 0.05);
      ctx.quadraticCurveTo(rx + L * 0.6, 0.03, rx + L, -0.03);
      ctx.lineTo(rx + L * 0.4, -0.01);
      ctx.closePath();
      ctx.fillStyle = pal.body;
      ctx.fill();
      noseX = rx + L - 0.005;
      noseY = -0.04;
      mouthX = rx + L * 0.55;
      mouthY = -0.1;
      break;
    }
    case 'raccoon':
      ctx.moveTo(rx * 0.6, 0.02);
      ctx.quadraticCurveTo(rx + 0.12, 0.0, rx + 0.16, -0.05);
      ctx.quadraticCurveTo(rx + 0.1, -0.12, rx * 0.5, -0.12);
      ctx.closePath();
      fillOutlined(ctx, pal.belly);
      noseX = rx + 0.15;
      noseY = -0.045;
      mouthX = rx + 0.06;
      mouthY = -0.095;
      break;
    case 'bear':
      ellipse(ctx, rx * 0.85, -0.07, 0.13, 0.1);
      fillOutlined(ctx, pal.belly);
      noseX = rx * 0.85 + 0.1;
      noseY = -0.03;
      mouthX = rx * 0.85 + 0.04;
      mouthY = -0.11;
      break;
    case 'bull':
      ellipse(ctx, rx * 0.8, -0.1, 0.15, 0.12);
      fillOutlined(ctx, pal.belly);
      ctx.fillStyle = shade(pal.belly, 0.45);
      for (const dx of [0.02, 0.1]) {
        ctx.beginPath();
        ellipse(ctx, rx * 0.8 + dx, -0.07, 0.022, 0.03);
        ctx.fill();
      }
      // Nose ring.
      ctx.beginPath();
      ctx.arc(rx * 0.8 + 0.14, -0.13, 0.04, Math.PI * 0.6, Math.PI * 2.2);
      ctx.lineWidth = 0.022;
      ctx.strokeStyle = '#f2c14e';
      ctx.stroke();
      noseX = -1;
      mouthX = rx * 0.8 + 0.02;
      mouthY = -0.16;
      mouthW = 0.12;
      break;
    case 'rabbit':
      ellipse(ctx, rx * 0.85, -0.06, 0.08, 0.07);
      fillOutlined(ctx, pal.belly);
      noseX = rx * 0.85 + 0.07;
      noseY = -0.02;
      mouthX = rx * 0.85 + 0.03;
      mouthY = -0.08;
      mouthW = 0.07;
      break;
  }
  if (noseX > 0) {
    ctx.beginPath();
    ellipse(ctx, noseX, noseY, 0.04, 0.032);
    ctx.fillStyle = plan === 'rabbit' ? pal.accent : '#2a1d2e';
    ctx.fill();
    ctx.beginPath();
    ellipse(ctx, noseX - 0.012, noseY + 0.012, 0.012, 0.01);
    ctx.fillStyle = 'rgba(255,255,255,0.7)';
    ctx.fill();
  }

  // Eyes (3/4 view: far eye smaller and closer to the snout).
  drawEye(ctx, rx * 0.15, 0.04, 0.075, pose, pal, plan === 'rabbit');
  drawEye(ctx, rx * 0.62, 0.05, 0.062, pose, pal, false);
  // Brows give attitude.
  if (plan === 'wolf' || plan === 'bull' || plan === 'bear') {
    ctx.beginPath();
    ctx.moveTo(rx * 0.0, 0.15);
    ctx.lineTo(rx * 0.32, 0.13 + (pose.eyes === 'squint' ? -0.02 : 0));
    ctx.moveTo(rx * 0.5, 0.135);
    ctx.lineTo(rx * 0.74, 0.12);
    ctx.lineWidth = 0.03;
    ctx.lineCap = 'round';
    ctx.strokeStyle = shade(pal.body, 0.5);
    ctx.stroke();
  }
  // Blush.
  if (pose.blush > 0.05) {
    ctx.beginPath();
    ellipse(ctx, rx * 0.4, -0.07, 0.05, 0.028);
    ctx.fillStyle = `rgba(255,110,140,${0.25 + 0.3 * pose.blush})`;
    ctx.fill();
  }
  drawMouth(ctx, mouthX, mouthY, mouthW, pose, pal, plan === 'rabbit');

  // Near ear / horn in front.
  if (plan === 'bull') {
    drawHorn(ctx, pal, 0.06, ry * 0.75, 1, false);
  } else drawEar(ctx, plan, pal, plan === 'rabbit' ? 0.02 : 0.0, ry * 0.8, (plan === 'rabbit' ? 0.15 : 0.05) + wa * (plan === 'rabbit' ? 0.6 : 0.3), false);
}

/** Camera-facing head, in head space. */
function drawHeadFront(ctx: Ctx, plan: BodyPlan, pal: CharacterPalette, pose: MonsterPose, flat: boolean): void {
  const sp = SPECIES[plan];
  const rx = sp.headRx * 1.05;
  const ry = sp.headRy;
  const wa = pose.wobbleA;
  // While turning, the face slides toward the side it came from (a 3/4 view).
  const yaw = pose.yaw ?? 0;
  const s = frontShift(plan, yaw);
  if (plan === 'bull') {
    drawHorn(ctx, pal, -0.14 + s * 0.5, ry * 0.7, -1, false);
    drawHorn(ctx, pal, 0.14 + s * 0.8, ry * 0.7, 1, false);
    drawEar(ctx, plan, pal, -rx * 0.95 + s * 0.4, ry * 0.3, 0.3, false);
    drawEar(ctx, plan, pal, rx * 0.95 + s * 0.6, ry * 0.3, -0.3, false);
  } else {
    const ex = plan === 'rabbit' ? 0.09 : plan === 'bear' ? rx * 0.72 : rx * 0.6;
    const ey = plan === 'bear' ? ry * 0.7 : ry * 0.72;
    const spread = plan === 'rabbit' ? 0.12 : plan === 'bear' ? 0 : 0.35;
    drawEar(ctx, plan, pal, -ex + s * 0.45, ey, spread + wa * 0.3, false);
    drawEar(ctx, plan, pal, ex + s * 0.7, ey, -spread - wa * 0.3, false);
  }
  ctx.beginPath();
  ellipse(ctx, 0, 0, rx, ry);
  if (flat) ctx.fillStyle = pal.body;
  else {
    const g = ctx.createRadialGradient(-rx * 0.3, ry * 0.4, rx * 0.1, 0, 0, rx * 1.2);
    g.addColorStop(0, tint(pal.body, 0.3));
    g.addColorStop(0.6, pal.body);
    g.addColorStop(1, shade(pal.body, 0.15));
    ctx.fillStyle = g;
  }
  ctx.fill();
  ctx.lineWidth = OW;
  ctx.strokeStyle = OL;
  ctx.stroke();
  ctx.save();
  ctx.beginPath();
  ellipse(ctx, 0, 0, rx, ry);
  ctx.clip();
  if (plan === 'fox' || plan === 'wolf' || plan === 'raccoon' || plan === 'rabbit') {
    // Light cheeks.
    for (const d of [-1, 1]) {
      ctx.beginPath();
      ellipse(ctx, d * rx * 0.45 + s * 0.8, -ry * 0.5, rx * 0.5, ry * 0.45);
      ctx.fillStyle = pal.belly;
      ctx.fill();
    }
  }
  if (plan === 'raccoon') {
    ctx.beginPath();
    ctx.moveTo(-rx, 0.1);
    ctx.quadraticCurveTo(0, 0.02, rx, 0.1);
    ctx.lineTo(rx, -0.04);
    ctx.quadraticCurveTo(0, -0.1, -rx, -0.04);
    ctx.closePath();
    ctx.fillStyle = pal.accent;
    ctx.fill();
  }
  ctx.restore();
  // Muzzle.
  const mw = plan === 'bull' ? 0.17 : plan === 'bear' ? 0.13 : 0.1;
  const my = plan === 'bull' ? -0.12 : -0.08;
  const mx = s * 1.35;
  ctx.beginPath();
  ellipse(ctx, mx, my, mw, mw * 0.75);
  fillOutlined(ctx, pal.belly);
  if (plan === 'bull') {
    ctx.fillStyle = shade(pal.belly, 0.45);
    for (const dx of [-0.06, 0.06]) {
      ctx.beginPath();
      ellipse(ctx, mx + dx, my + 0.02, 0.022, 0.03);
      ctx.fill();
    }
    ctx.beginPath();
    ctx.arc(mx, my - 0.09, 0.04, Math.PI * 0.15, Math.PI * 0.85, true);
    ctx.lineWidth = 0.022;
    ctx.strokeStyle = '#f2c14e';
    ctx.stroke();
  } else {
    ctx.beginPath();
    ellipse(ctx, mx + s * 0.25, my + mw * 0.35, 0.045, 0.034);
    ctx.fillStyle = plan === 'rabbit' ? pal.accent : '#2a1d2e';
    ctx.fill();
  }
  const [en, ef] = frontEyes(plan, yaw);
  drawEye(ctx, en.x, en.y, en.r, pose, pal, plan === 'rabbit');
  ctx.save();
  ctx.translate(ef.x, ef.y);
  ctx.scale(ef.sx, 1);
  drawEye(ctx, 0, 0, ef.r, pose, pal, plan === 'rabbit');
  ctx.restore();
  if (pose.blush > 0.05) {
    ctx.fillStyle = `rgba(255,110,140,${0.25 + 0.3 * pose.blush})`;
    for (const d of [-1, 1]) {
      ctx.beginPath();
      ellipse(ctx, d * 0.17 + s, -0.05, 0.045, 0.026);
      ctx.fill();
    }
  }
  drawMouth(ctx, mx, my - mw * 0.35, mw * 0.9, pose, pal, plan === 'rabbit');
}

/** Sideways slide of the face in a turned (3/4) front view. */
function frontShift(plan: BodyPlan, yaw: number): number {
  return yaw * SPECIES[plan].headRx * 1.05 * 0.4;
}

/** Eye positions of the front head: [near (character's right, viewer's left), far]. */
function frontEyes(plan: BodyPlan, yaw: number): [EyeAnchor, EyeAnchor] {
  const s = frontShift(plan, yaw);
  return [
    { x: -0.1 + s * 0.9, y: 0.05, r: 0.072, sx: 1 },
    { x: 0.1 + s * 1.15, y: 0.05, r: 0.072, sx: 1 - 0.4 * yaw },
  ];
}

/** Eye positions of the side head: [near, far (peeking past the snout)]. */
function sideEyes(plan: BodyPlan): [EyeAnchor, EyeAnchor] {
  const rx = SPECIES[plan].headRx;
  return [
    { x: rx * 0.15, y: 0.04, r: 0.075, sx: 1 },
    { x: rx * 0.62, y: 0.05, r: 0.062, sx: 0.8 },
  ];
}

function drawDizzy(ctx: Ctx, y: number, pose: MonsterPose): void {
  if (pose.dizzy <= 0.02) return;
  for (let i = 0; i < 3; i++) {
    const a = pose.time * 5 + (i * Math.PI * 2) / 3;
    ctx.save();
    ctx.globalAlpha *= pose.dizzy;
    ctx.beginPath();
    star(ctx, Math.cos(a) * 0.3, y + Math.sin(a) * 0.07, 0.075, 0.45, 5, a);
    ctx.fillStyle = '#ffe14d';
    ctx.strokeStyle = '#a86a00';
    ctx.lineWidth = 0.022;
    ctx.fill();
    ctx.stroke();
    ctx.restore();
  }
}

/**
 * Draws a character. The context must be in world units with +y up at the
 * feet. Cosmetic layers draw the back item (torso space) and hat/eyewear
 * (head space).
 */
export function drawMonster(
  ctx: Ctx,
  plan: BodyPlan,
  pal: CharacterPalette,
  pose: MonsterPose,
  style: MonsterStyle,
  layers: RigLayers = {},
  anchorsOut?: RigAnchors,
): void {
  if (layers.outfit?.palette) pal = { ...pal, ...layers.outfit.palette };
  if (layers.mount) {
    drawMounted(ctx, plan, pal, pose, style, layers, layers.mount, anchorsOut);
    return;
  }
  if (style.shadow) {
    const drop = Math.max(-3, style.shadowDrop);
    const sc = Math.max(0.25, 1 + drop * 0.18);
    ctx.beginPath();
    ellipse(ctx, 0.02, drop + 0.01, 0.38 * sc, 0.07 * sc);
    ctx.fillStyle = `rgba(30,15,10,${0.24 * sc})`;
    ctx.fill();
  }
  const f = Math.max(0, Math.min(1, pose.facing));
  const anchors = anchorsOut ?? makeAnchors();
  // The turn is continuous: the side view narrows as the head starts to turn,
  // a brief blend hands over to a 3/4 front view, and the face then slides
  // round to look straight at the camera. Every frame is a new in-between.
  const SIDE_END = 0.3;
  const BLEND_END = 0.42;
  if (f <= SIDE_END || f >= 0.97 || !turnLayers(ctx)) {
    if (f <= SIDE_END) {
      drawView(ctx, plan, pal, pose, style, layers, anchors, false, 1 - 0.14 * (f / SIDE_END));
    } else {
      const yaw = f >= 0.97 ? 0 : Math.max(0, Math.min(1, (0.97 - f) / (0.97 - BLEND_END)));
      drawView(ctx, plan, pal, { ...pose, yaw }, style, layers, anchors, true, 1 - 0.14 * yaw);
    }
    return;
  }
  if (f > BLEND_END) {
    const yaw = (0.97 - f) / (0.97 - BLEND_END);
    drawView(ctx, plan, pal, { ...pose, yaw }, style, layers, anchors, true, 1 - 0.14 * yaw);
    return;
  }
  // Short hand-over between the side and the 3/4 view on separate layers.
  const blend = (f - SIDE_END) / (BLEND_END - SIDE_END);
  const m = ctx.getTransform();
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  for (const [lx, ly] of [
    [-1.4, -0.5],
    [1.4, -0.5],
    [-1.4, 2.8],
    [1.4, 2.8],
  ]) {
    const sx = m.a * lx + m.c * ly + m.e;
    const sy = m.b * lx + m.d * ly + m.f;
    x0 = Math.min(x0, sx);
    y0 = Math.min(y0, sy);
    x1 = Math.max(x1, sx);
    y1 = Math.max(y1, sy);
  }
  x0 = Math.floor(x0);
  y0 = Math.floor(y0);
  const w = Math.ceil(x1 - x0) + 2;
  const hgt = Math.ceil(y1 - y0) + 2;
  const L = turnLayers(ctx);
  const hopPose = { ...pose, hop: pose.hop + 0.06 * Math.sin(Math.PI * blend), yaw: 1 };
  if (!L || w > 2048 || hgt > 2048 || w < 2 || hgt < 2) {
    drawView(ctx, plan, pal, hopPose, style, layers, anchors, blend > 0.5, 0.86);
    return;
  }
  const views: [HTMLCanvasElement, boolean, number][] = [
    [L[0], false, Math.min(1, 2 * (1 - blend))],
    [L[1], true, Math.min(1, 2 * blend)],
  ];
  for (const [cv, front] of views) {
    if (cv.width < w) cv.width = w;
    if (cv.height < hgt) cv.height = hgt;
    const lc = cv.getContext('2d')!;
    lc.setTransform(1, 0, 0, 1, 0, 0);
    lc.clearRect(0, 0, w, hgt);
    lc.setTransform(m.a, m.b, m.c, m.d, m.e - x0, m.f - y0);
    drawView(lc, plan, pal, hopPose, style, layers, anchors, front, 0.86);
  }
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  const base = ctx.globalAlpha;
  for (const [cv, , alpha] of views) {
    ctx.globalAlpha = base * alpha;
    ctx.drawImage(cv, 0, 0, w, hgt, x0, y0, w, hgt);
  }
  ctx.restore();
}

/** Mount under the rider; the rider sits (or, on a hobby horse, runs) on top. */
function drawMounted(ctx: Ctx, plan: BodyPlan, pal: CharacterPalette, pose: MonsterPose, style: MonsterStyle, layers: RigLayers, m: MountLayer, anchors?: RigAnchors): void {
  if (style.shadow) {
    const drop = Math.max(-3, style.shadowDrop);
    const sc = Math.max(0.25, 1 + drop * 0.18);
    ctx.beginPath();
    ellipse(ctx, 0.02, drop + 0.01, (m.kind === 'stick' ? 0.42 : 0.6) * sc, 0.08 * sc);
    ctx.fillStyle = `rgba(30,15,10,${0.24 * sc})`;
    ctx.fill();
  }
  ctx.save();
  if (pose.climbing) {
    // Scale the wall nose-first, mount and all.
    ctx.translate(0.35, 0);
    ctx.rotate(1.15);
    ctx.translate(-0.35, 0);
  }
  ctx.translate(0, pose.hop);
  const rider: RigLayers = { ...layers, mount: undefined, outfit: layers.outfit ? { ...layers.outfit, palette: undefined } : undefined };
  m.behind?.(ctx, pose);
  ctx.save();
  if (m.kind !== 'stick') {
    const hover = m.kind === 'hover' ? Math.sin(pose.time * 3) * 0.04 : 0;
    ctx.translate(0, m.saddle - HIP_Y * m.riderScale + hover);
    ctx.scale(m.riderScale, m.riderScale);
  }
  drawMonster(ctx, plan, pal, { ...pose, hop: 0 }, { ...style, shadow: false }, rider, anchors);
  ctx.restore();
  m.front?.(ctx, pose);
  ctx.restore();
}

let layerPair: [HTMLCanvasElement, HTMLCanvasElement] | null | undefined;

/** Two scratch canvases for blending the side and front views during a turn. */
function turnLayers(ctx: Ctx): [HTMLCanvasElement, HTMLCanvasElement] | null {
  if (layerPair !== undefined) return layerPair;
  if (typeof document === 'undefined' || typeof (ctx as CanvasRenderingContext2D).getTransform !== 'function') return (layerPair = null);
  layerPair = [document.createElement('canvas'), document.createElement('canvas')];
  return layerPair;
}

function drawView(
  ctx: Ctx,
  plan: BodyPlan,
  pal: CharacterPalette,
  pose: MonsterPose,
  style: MonsterStyle,
  layers: RigLayers,
  anchors: RigAnchors,
  front: boolean,
  turn: number,
): void {
  const sp = SPECIES[plan];

  ctx.save();
  ctx.translate(0, pose.hop);
  ctx.translate(0, 0.7);
  ctx.rotate(-pose.rot);
  ctx.translate(0, -0.7);
  ctx.scale(pose.flip * turn, 1);
  const sy = pose.squash;
  const sx = 1 / Math.sqrt(Math.max(0.3, sy));
  ctx.scale(sx, sy);
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';

  const hipY = HIP_Y + pose.bob;
  const b = sp.build;
  const footN = { x: pose.footNear.x * STRIDE_SCALE, y: pose.footNear.y * 1.3 };
  const footF = { x: pose.footFar.x * STRIDE_SCALE, y: pose.footFar.y * 1.3 };

  // Upper body (torso + head + arms) leans around the hips.
  const upper = (fn: () => void) => {
    ctx.save();
    ctx.translate(0, hipY);
    ctx.rotate(-pose.lean);
    ctx.translate(0, -HIP_Y);
    fn();
    ctx.restore();
  };
  const shoulderX = front ? 0.25 * b : 0.02;
  const shoulderY = SHOULDER_Y - 0.02;
  const headX = front ? 0 : 0.05;

  const drawHead = () => {
    ctx.save();
    ctx.translate(headX, HEAD_Y + 0.02 * Math.sin(pose.time * 2.4));
    ctx.rotate(-pose.lean * 0.3 + pose.wobbleA * 0.03);
    if (front) drawHeadFront(ctx, plan, pal, pose, style.flat);
    else drawHeadSide(ctx, plan, pal, pose, style.flat);
    if (layers.front) {
      anchors.headTop.x = front ? 0 : -0.02;
      anchors.headTop.y = sp.headRy * 0.82;
      anchors.headW = sp.headRx * 2.15;
      anchors.eyeCenter.x = front ? 0 : sp.headRx * 0.38;
      anchors.eyeCenter.y = 0.05;
      anchors.eyeSpan = front ? 0.34 : sp.headRx * 0.75;
      anchors.eyes = front ? frontEyes(plan, pose.yaw ?? 0) : sideEyes(plan);
      anchors.side = !front;
      layers.front(ctx, anchors, pose, pal);
    }
    ctx.restore();
  };
  const drawBackLayer = () => {
    if (!layers.back && !layers.outfit?.under) return;
    ctx.save();
    ctx.translate(0, (HIP_Y + SHOULDER_Y) / 2);
    anchors.back.x = front ? 0 : -0.2 * b;
    anchors.back.y = 0;
    anchors.bodyRx = 0.22 * b;
    anchors.bodyRy = 0.22;
    anchors.side = !front;
    layers.outfit?.under?.(ctx, anchors, pose, pal);
    layers.back?.(ctx, anchors, pose, pal);
    ctx.restore();
  };
  // Outfit drawn on the torso: clipped details (stripes, panels), then free ones (tie, clasp).
  const drawTorsoOutfit = () => {
    const o = layers.outfit;
    if (!o || (!o.overClip && !o.over)) return;
    anchors.torso = torsoDims(plan, front);
    anchors.side = !front;
    if (o.overClip) {
      ctx.save();
      torsoPath(ctx, plan, front);
      ctx.clip();
      o.overClip(ctx, anchors, pose, pal);
      ctx.restore();
    }
    o.over?.(ctx, anchors, pose, pal);
  };
  const held = layers.hand ? () => layers.hand!(ctx, pose) : undefined;

  if (front) {
    // Only bushy tails peek out from behind when facing the camera.
    if (plan === 'fox' || plan === 'wolf' || plan === 'raccoon') {
      ctx.save();
      ctx.scale(-1, 1);
      drawTail(ctx, plan, pal, pose, -0.12, hipY + 0.05);
      ctx.restore();
    }
    upper(drawBackLayer);
    const spread = 0.1 * b;
    drawLeg(ctx, -spread, hipY, -spread - 0.03 + footF.x * 0.2, footF.y, pal, false, true);
    drawLeg(ctx, spread, hipY, spread + 0.03 + footN.x * 0.2, footN.y, pal, false, true);
    upper(() => {
      drawTorso(ctx, plan, pal, pose, true);
      drawTorsoOutfit();
      ctx.save();
      ctx.scale(-1, 1);
      // Facing the camera, the character's right hand is on the viewer's left.
      drawArm(ctx, shoulderX, shoulderY, pose.armFar, pose.armReach, pal, false, held);
      ctx.restore();
      drawArm(ctx, shoulderX, shoulderY, pose.armNear, pose.armReach, pal, false);
      drawHead();
    });
  } else {
    upper(() => drawArm(ctx, shoulderX - 0.08, shoulderY + 0.01, pose.armFar, pose.armReach, pal, true));
    drawLeg(ctx, -0.04, hipY, -0.04 + footF.x, footF.y, pal, true, false);
    drawTail(ctx, plan, pal, pose, -0.17 * b, hipY + 0.06);
    upper(drawBackLayer);
    drawLeg(ctx, 0.04, hipY, 0.04 + footN.x, footN.y, pal, false, false);
    upper(() => {
      drawTorso(ctx, plan, pal, pose, false);
      drawTorsoOutfit();
      drawHead();
      drawArm(ctx, shoulderX + 0.02, shoulderY, pose.armNear, pose.armReach, pal, false, held);
    });
  }
  upper(() => drawDizzy(ctx, HEAD_Y + sp.headRy + sp.earTop * 0.6 + 0.12, pose));
  ctx.restore();
}
