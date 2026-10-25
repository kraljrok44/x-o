import type { SegmentTemplate } from '../game/TrackSegment';

/**
 * Hand-authored segment library. Lane masks: L = lane -1, M = lane 0,
 * R = lane 1. Distances are relative to the segment start.
 *
 * Design rules every segment follows (checked again by TrackValidator):
 *  - a lane is never blocked by two jump-requiring hazards closer than 9 u,
 *  - walls never cover all lanes, gaps covering all lanes are <= 5 u long,
 *  - un-jumpable gaps (> 6 u) always leave a solid lane, visible 12 u ahead,
 *  - periodic hazards that can't be jumped never cover all lanes at once.
 */
const Lf = 1;
const M = 2;
const R = 4;
const LM = Lf | M;
const MR = M | R;
const LR = Lf | R;
const ALL = 7;

type SegmentDef = Pick<SegmentTemplate, 'id' | 'length' | 'difficulty' | 'build'> &
  Partial<Omit<SegmentTemplate, 'id' | 'length' | 'difficulty' | 'build'>>;

function seg(def: SegmentDef): SegmentTemplate {
  return {
    tags: [],
    allowedAfter: [],
    allowedBefore: [],
    minSafeLeadIn: 4,
    hilly: false,
    pickupRule: 'Glimmers mark the intended line; never placed inside a hazard box.',
    ...def,
  };
}

export const SEGMENTS: SegmentTemplate[] = [
  seg({
    id: 'start_meadow',
    length: 30,
    difficulty: 0,
    tags: ['start'],
    minSafeLeadIn: 30,
    pickupRule: 'One Rune Box per lane so everyone starts with an ability.',
    build(c) {
      for (const lane of [-1, 0, 1]) c.glimmerLine(10, 20, lane, 2.5);
      c.itemBoxes(25, ALL);
    },
  }),
  seg({
    id: 'finish_line',
    length: 12,
    difficulty: 0,
    tags: ['finish'],
    allowedAfter: ['rest', 'easy', 'medium', 'hard', 'finale'],
    minSafeLeadIn: 12,
    build(c) {
      c.glimmerLine(2, 10, 0, 2);
    },
  }),
  seg({
    id: 'rest_glade',
    length: 18,
    difficulty: 0,
    tags: ['rest'],
    hilly: true,
    minSafeLeadIn: 18,
    build(c) {
      c.glimmerLine(3, 7, -1, 2);
      c.glimmerLine(9, 11, 0, 2);
      c.glimmerLine(13, 15, 1, 2);
    },
  }),
  seg({
    id: 'item_alley',
    length: 20,
    difficulty: 0,
    tags: ['rest'],
    hilly: true,
    minSafeLeadIn: 20,
    pickupRule: 'A full row of Rune Boxes, no hazards around them.',
    build(c) {
      c.itemBoxes(10, ALL);
      c.glimmerLine(4, 8, 0, 2);
      c.glimmerLine(13, 17, 0, 2);
    },
  }),
  seg({
    id: 'hurdle_trio',
    length: 32,
    difficulty: 1,
    tags: ['easy'],
    hilly: true,
    build(c) {
      c.hurdle(10, ALL);
      c.glimmerArc(5.6, 0);
      c.hurdle(22, LM);
      c.glimmerLine(18, 26, 1, 2);
    },
  }),
  seg({
    id: 'log_steps',
    length: 36,
    difficulty: 1,
    tags: ['easy'],
    build(c) {
      c.hurdle(8, Lf);
      c.hurdle(17, M);
      c.hurdle(26, R);
      c.glimmerArc(13, 0, 4);
      c.glimmerLine(4, 12, 1, 2);
    },
  }),
  seg({
    id: 'wall_slalom',
    length: 40,
    difficulty: 2,
    tags: ['medium'],
    build(c) {
      c.wall(12, LM);
      c.glimmerLine(6, 14, 1, 2);
      c.wall(26, MR);
      c.glimmerLine(20, 28, -1, 2);
      c.itemBoxes(36, M);
    },
  }),
  seg({
    id: 'gap_hop',
    length: 26,
    difficulty: 2,
    tags: ['medium'],
    build(c) {
      c.gap(10, 14.5, ALL);
      c.glimmerArc(7.5, 0);
      c.glimmerArc(7.5, -1, 3);
      c.glimmerArc(7.5, 1, 3);
    },
  }),
  seg({
    id: 'gap_bridge',
    length: 36,
    difficulty: 3,
    tags: ['medium'],
    minSafeLeadIn: 12,
    build(c) {
      c.gap(12, 26, LM);
      c.hurdle(19, R);
      c.glimmerLine(13, 16, 1, 1.5);
      c.glimmerArc(14.6, 1, 4);
      c.itemBoxes(31, M);
    },
  }),
  seg({
    id: 'spike_garden',
    length: 32,
    difficulty: 2,
    tags: ['medium'],
    build(c) {
      c.spikes(10, ALL, 0);
      c.spikes(21, ALL, 1.2);
      c.glimmerArc(5.6, 0, 4);
      c.glimmerArc(16.6, 0, 4);
    },
  }),
  seg({
    id: 'vent_row',
    length: 36,
    difficulty: 3,
    tags: ['hard'],
    build(c) {
      c.flame(10, Lf, 0);
      c.flame(18, M, 0.75);
      c.flame(26, R, 1.5);
      c.glimmerLine(6, 30, 0, 3);
    },
  }),
  seg({
    id: 'pendulum_gate',
    length: 28,
    difficulty: 3,
    tags: ['medium'],
    build(c) {
      c.pendulum(14, 0);
      c.glimmerLine(8, 20, 0, 2);
    },
  }),
  seg({
    id: 'twin_pendulums',
    length: 38,
    difficulty: 4,
    tags: ['hard'],
    build(c) {
      c.pendulum(12, 0);
      c.pendulum(26, 1.4);
      c.glimmerLine(16, 22, -1, 2);
      c.glimmerLine(16, 22, 1, 2);
      c.itemBoxes(34, LR);
    },
  }),
  seg({
    id: 'boulder_chute',
    length: 42,
    difficulty: 3,
    tags: ['hard'],
    build(c) {
      c.boulder(24, -1, 0);
      c.boulder(24, 1, 1.6);
      c.hurdle(14, M);
      c.hurdle(29, M);
      c.glimmerArc(9.6, 0, 4);
      c.glimmerArc(24.6, 0, 4);
    },
  }),
  seg({
    id: 'bog_crossing',
    length: 34,
    difficulty: 1,
    tags: ['easy'],
    build(c) {
      c.zone('mud', 6, 24, LM);
      c.hurdle(15, R);
      c.glimmerArc(10.6, 1, 5);
      c.itemBoxes(29, Lf);
    },
  }),
  seg({
    id: 'frost_run',
    length: 44,
    difficulty: 3,
    tags: ['medium'],
    build(c) {
      c.zone('ice', 4, 40, ALL);
      c.wall(26, M);
      c.hurdle(35, Lf);
      c.glimmerLine(10, 22, 0, 2);
      c.glimmerLine(28, 38, 1, 2);
    },
  }),
  seg({
    id: 'ledge_terrace',
    length: 42,
    difficulty: 2,
    tags: ['medium'],
    build(c) {
      c.ledge(10, 32, M, 1.2);
      c.glimmerLine(13, 30, 0, 2.2, 0.7);
      c.itemBoxes(21, M);
      c.hurdle(20, Lf);
      c.hurdle(26, R);
    },
  }),
  seg({
    id: 'boost_streak',
    length: 34,
    difficulty: 1,
    tags: ['easy'],
    build(c) {
      c.pad('boostPad', 8, R);
      c.pad('boostPad', 17, R);
      c.glimmerLine(10, 22, 1, 2);
      c.hurdle(28, R);
      c.hurdle(12, Lf);
    },
  }),
  seg({
    id: 'bounce_chasm',
    length: 30,
    difficulty: 2,
    tags: ['medium'],
    build(c) {
      c.pad('bouncePad', 8.2, ALL);
      c.gap(9, 13.5, ALL);
      c.glimmerArc(7.6, 0, 6, 0.7, 15.5);
      c.glimmerArc(7.6, -1, 4, 0.7, 15.5);
      c.glimmerArc(7.6, 1, 4, 0.7, 15.5);
    },
  }),
  seg({
    id: 'zigzag_gaps',
    length: 44,
    difficulty: 4,
    tags: ['hard'],
    minSafeLeadIn: 6,
    build(c) {
      c.gap(6, 18, Lf);
      c.gap(19, 30, R);
      c.gap(33, 37, M);
      c.glimmerLine(4, 16, 0, 2);
      c.glimmerArc(30.6, 0, 4);
    },
  }),
  seg({
    id: 'snake_walls',
    length: 46,
    difficulty: 3,
    tags: ['hard'],
    build(c) {
      c.wall(10, Lf);
      c.hurdle(10, M);
      c.wall(22, R);
      c.hurdle(22, Lf);
      c.wall(35, M);
      c.hurdle(35, LR);
      c.glimmerLine(6, 12, 1, 2);
      c.glimmerLine(18, 24, 0, 2);
    },
  }),
  seg({
    id: 'finale_gauntlet',
    length: 58,
    difficulty: 5,
    tags: ['finale'],
    allowedAfter: ['rest', 'medium', 'easy'],
    allowedBefore: ['finish'],
    build(c) {
      c.spikes(8, ALL, 0.4);
      c.wall(19, LM);
      c.glimmerLine(14, 20, 1, 1.5);
      c.pendulum(29, 0.3);
      c.gap(39, 43.5, ALL);
      c.glimmerArc(36.5, 0, 4);
      c.wall(51, Lf);
      c.hurdle(51, MR);
    },
  }),
];

export const SEGMENT_BY_ID: Record<string, SegmentTemplate> = Object.fromEntries(SEGMENTS.map((s) => [s.id, s]));
