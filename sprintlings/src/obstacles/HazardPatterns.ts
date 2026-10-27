import type { SegmentTemplate } from '../game/TrackSegment';

/**
 * Hand-authored side-view segment library. Positions are relative to the
 * segment start. Reference numbers (TrackSegment/GameplayConfig): a full jump
 * rises ~2.2 u and travels ~7.5 u; one-way platforms sit 1.8 u up so they're
 * comfortably reachable.
 *
 * Rules every segment follows (checked by TrackValidator):
 *  - pits are <= 4.5 u unless a spring is provided right before them,
 *  - consecutive jump requirements leave landing room,
 *  - timed hazards always have a safe window at normal speed,
 *  - every segment ends on solid ground.
 */
type SegmentDef = Pick<SegmentTemplate, 'id' | 'length' | 'difficulty' | 'build'> &
  Partial<Omit<SegmentTemplate, 'id' | 'length' | 'difficulty' | 'build'>>;

function seg(def: SegmentDef): SegmentTemplate {
  return {
    tags: [],
    allowedAfter: [],
    allowedBefore: [],
    minSafeLeadIn: 4,
    pickupRule: 'Glimmers mark the intended line; never inside a hazard box.',
    ...def,
  };
}

const PLAT = 1.8;

export const SEGMENTS: SegmentTemplate[] = [
  seg({
    id: 'start_meadow',
    length: 30,
    difficulty: 0,
    tags: ['start'],
    minSafeLeadIn: 30,
    pickupRule: 'A cluster of Rune Boxes so everyone starts with an ability.',
    build(c) {
      c.run(30).glimmerLine(9, 19, 0.6, 2.5);
      c.box(23).box(24.4).box(25.8).box(24.4, 2.6);
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
      c.run(12).glimmerLine(2, 10, 0.6, 2);
    },
  }),
  seg({
    id: 'rest_glade',
    length: 18,
    difficulty: 0,
    tags: ['rest'],
    minSafeLeadIn: 18,
    build(c) {
      c.run(18).glimmerLine(3, 15, 0.6, 1.5);
    },
  }),
  seg({
    id: 'item_row',
    length: 20,
    difficulty: 0,
    tags: ['rest'],
    minSafeLeadIn: 20,
    pickupRule: 'Three Rune Boxes in a row plus one high box for jumpers.',
    build(c) {
      c.run(20).box(9).box(10.4).box(11.8).box(10.4, 2.6);
      c.glimmerLine(3, 7, 0.6, 1.5).glimmerLine(14, 18, 0.6, 1.5);
    },
  }),
  seg({
    id: 'log_hop',
    length: 32,
    difficulty: 1,
    tags: ['easy'],
    build(c) {
      c.run(32).log(10).glimmerArc(6.3).log(23, 0.9, 0.5).glimmerArc(19);
    },
  }),
  seg({
    id: 'spike_strip',
    length: 30,
    difficulty: 1,
    tags: ['easy'],
    build(c) {
      c.run(30).spikes(10, 0.8).glimmerArc(6.2).spikes(21, 1.0).glimmerArc(17);
    },
  }),
  seg({
    id: 'gap_hop',
    length: 26,
    difficulty: 2,
    tags: ['medium'],
    build(c) {
      c.run(9).glimmerArc(7.4).gap(4).run(13);
    },
  }),
  seg({
    id: 'double_gap',
    length: 30,
    difficulty: 2,
    tags: ['medium'],
    build(c) {
      c.run(7).glimmerArc(5.5, 4).gap(3.5).run(6).gap(3.5).run(10);
    },
  }),
  seg({
    id: 'step_up',
    length: 34,
    difficulty: 1,
    tags: ['easy'],
    build(c) {
      c.run(8).glimmerArc(4.8, 4).step(1.2).run(12).glimmerLine(10, 18, 0.6, 2).ramp(8, -1.2).run(6);
    },
  }),
  seg({
    id: 'high_road',
    length: 40,
    difficulty: 2,
    tags: ['medium'],
    pickupRule: 'Upper platform carries glimmers and a box; the lower path has hazards.',
    build(c) {
      c.run(40).platform(8, 22, PLAT).spikes(14, 0.8).log(24);
      c.glimmerLine(10, 28, PLAT + 0.6, 1.6).box(20, PLAT + 0.9);
    },
  }),
  seg({
    id: 'saw_dip',
    length: 34,
    difficulty: 2,
    tags: ['medium'],
    build(c) {
      c.run(8).ramp(5, -1.5).run(8).ramp(5, 1.5).run(8);
      c.saw(17, { lift: 0.05, radius: 0.6 });
      c.glimmerArc(13.5, 4, undefined, c.level - 1.5);
    },
  }),
  seg({
    id: 'crusher_alley',
    length: 36,
    difficulty: 3,
    tags: ['hard'],
    build(c) {
      c.run(36).crusher(12, 0).crusher(24, 1.3).glimmerLine(4, 32, 0.6, 2);
    },
  }),
  seg({
    id: 'vent_row',
    length: 36,
    difficulty: 3,
    tags: ['hard'],
    build(c) {
      c.run(36).flame(10, 0).flame(18, 0.75).flame(26, 1.5).glimmerLine(4, 32, 0.6, 2);
    },
  }),
  seg({
    id: 'pendulum_pass',
    length: 28,
    difficulty: 3,
    tags: ['medium'],
    build(c) {
      c.run(28).pendulum(14).glimmerLine(6, 22, 0.6, 2);
    },
  }),
  seg({
    id: 'boulder_roll',
    length: 40,
    difficulty: 3,
    tags: ['hard'],
    build(c) {
      c.run(40).boulder(26).glimmerLine(5, 15, 0.6, 2);
    },
  }),
  seg({
    id: 'mud_bog',
    length: 36,
    difficulty: 1,
    tags: ['easy'],
    build(c) {
      c.run(36).mud(6, 27).platform(5, 21, PLAT).glimmerLine(7, 24, PLAT + 0.6, 1.6).box(16, PLAT + 0.9);
    },
  }),
  seg({
    id: 'spring_chasm',
    length: 32,
    difficulty: 2,
    tags: ['medium'],
    pickupRule: 'Glimmers follow the spring launch arc.',
    build(c) {
      c.run(8).pad('spring', 6.8).glimmerArc(6.8, 6, 16).gap(8.5).run(15.5);
    },
  }),
  seg({
    id: 'stairs',
    length: 34,
    difficulty: 2,
    tags: ['medium'],
    build(c) {
      c.run(5).step(0.9).run(4).step(0.9).run(4).step(0.9).run(6).glimmerLine(15, 18, 0.6, 1.5);
      c.gap(4, -2.7).run(11);
    },
  }),
  seg({
    id: 'floating_isles',
    length: 40.5,
    difficulty: 3,
    tags: ['hard'],
    build(c) {
      c.run(6).gap(3, 0.8).run(5).gap(3, -0.4).run(5).gap(3.5, 0.6).run(6).ramp(5, -1.0).run(4);
      c.glimmerLine(10, 13, 1.4, 1.5);
    },
  }),
  seg({
    id: 'boost_run',
    length: 34,
    difficulty: 1,
    tags: ['easy'],
    build(c) {
      c.run(34).pad('boostPad', 6).pad('boostPad', 16).glimmerLine(8, 20, 0.6, 1.5).log(27, 0.8);
    },
  }),
  seg({
    id: 'finale_gauntlet',
    length: 56,
    difficulty: 5,
    tags: ['finale'],
    allowedAfter: ['rest', 'medium', 'easy'],
    allowedBefore: ['finish'],
    build(c) {
      c.run(14).spikes(7, 0.8).glimmerArc(3.2, 4);
      c.gap(4).run(14).crusher(25);
      c.gap(3.5, 0.6).run(20.5).saw(41, { lift: 0.05 }).log(50, 0.8);
    },
  }),
  seg({
    id: 'cactus_patch',
    length: 34,
    difficulty: 1,
    tags: ['easy'],
    pickupRule: 'The plank above the cactus patch carries the glimmers.',
    build(c) {
      c.run(34).spikes(9, 0.9).spikes(22, 0.9).platform(5, 24, PLAT);
      c.glimmerLine(7, 27, PLAT + 0.6, 1.6);
    },
  }),
  seg({
    id: 'rooftops',
    length: 42,
    difficulty: 2,
    tags: ['medium'],
    pickupRule: 'Glimmers float over each rooftop.',
    build(c) {
      c.run(6).gap(2.5, 0.6).run(7).gap(2.5, 0.6).run(7).gap(3, -0.6).run(6).ramp(4, -0.6).run(4);
      c.glimmerLine(9.5, 14.5, 1.2, 1.25, c.level + 0.6).glimmerLine(19, 24, 1.2, 1.25, c.level + 1.2);
    },
  }),
  seg({
    id: 'bridge_jump',
    length: 36,
    difficulty: 2,
    tags: ['medium'],
    pickupRule: 'A box waits on the mesa top; the pit below is the price of a late jump.',
    build(c) {
      c.run(8).gap(16).run(12).island(7, 14, 1.2);
      c.glimmerArc(4.2, 4).box(15, 2.1);
    },
  }),
  seg({
    id: 'barrel_alley',
    length: 44,
    difficulty: 3,
    tags: ['hard'],
    pickupRule: 'The high plank dodges the rolling barrels.',
    build(c) {
      c.run(44).boulder(30).platform(8, 26, PLAT);
      c.glimmerLine(10, 32, PLAT + 0.6, 1.6);
    },
  }),
  seg({
    id: 'geyser_bog',
    length: 38,
    difficulty: 2,
    tags: ['medium'],
    build(c) {
      c.run(38).mud(5, 33).flame(12, 0).flame(24, 1.1).glimmerLine(4, 34, 0.6, 2);
    },
  }),
  seg({
    id: 'saw_steps',
    length: 40,
    difficulty: 3,
    tags: ['hard'],
    build(c) {
      c.run(8).step(0.9).run(10).step(0.9).run(10).ramp(6, -1.8).run(6);
      c.saw(14, { lift: 0.05 }).saw(24, { lift: 0.05 });
      c.glimmerArc(11.5, 4, undefined, 0.9).glimmerArc(21.5, 4, undefined, 1.8);
    },
  }),
  seg({
    id: 'spring_hop',
    length: 40,
    difficulty: 2,
    tags: ['medium'],
    pickupRule: 'Glimmers trace both spring arcs.',
    build(c) {
      c.run(8).pad('spring', 6.8).gap(8.5).run(6.5).pad('spring', 22.3).gap(8.5).run(8.5);
      c.glimmerArc(6.8, 6, 16).glimmerArc(22.3, 6, 16);
    },
  }),
  seg({
    id: 'cliff_climb',
    length: 44,
    difficulty: 2,
    tags: ['medium'],
    pickupRule: 'Glimmers lead over the cloud onto the cliff top; climbing works but costs time.',
    build(c) {
      c.run(12).cloud(4, 6, 1.8).glimmerLine(5, 9, 2.4, 1.3);
      c.step(3.5).run(16).glimmerLine(2 + 12, 12 + 13, 0.6, 1.6).box(12 + 8, 0.9);
      c.step(-3.5).run(16);
    },
  }),
  seg({
    id: 'cloud_route',
    length: 48,
    difficulty: 2,
    tags: ['medium'],
    pickupRule: 'The cloud road carries a boost pad and the glimmers; the ground road is muddy and spiky.',
    build(c) {
      c.run(48).mud(13, 35).spikes(18, 0.8).spikes(30, 0.8);
      c.cloud(3, 7, 1.8).cloud(12, 10, 2.9).cloud(24, 10, 2.9).cloud(36, 7, 1.8);
      c.pad('boostPad', 14.5, 2.9).pad('boostPad', 26.5, 2.9);
      c.glimmerLine(4, 9, 2.4, 1.25).glimmerLine(16, 33, 3.5, 1.4).box(40, 2.7);
    },
  }),
  seg({
    id: 'tower_climb',
    length: 42,
    difficulty: 3,
    tags: ['hard'],
    pickupRule: 'Two clouds form a staircase to the tower top; otherwise climb the wall.',
    build(c) {
      c.run(14).cloud(3, 4, 1.8).cloud(8.5, 4, 3.2).glimmerLine(4, 7, 2.4, 1.2).glimmerLine(9, 12, 3.8, 1.2);
      c.step(4.5).run(10).glimmerLine(15, 23, 0.6, 1.6);
      c.step(-4.5).run(18).beam(37).glimmerLine(35, 39, 0.35, 1);
    },
  }),
  seg({
    id: 'sky_bridge',
    length: 40,
    difficulty: 3,
    tags: ['hard'],
    pickupRule: 'Glimmers float over each cloud stepping stone across the chasm.',
    build(c) {
      c.run(8).gap(22).run(10);
      c.cloud(9, 4, 0.8).cloud(15.5, 4, 1.5).cloud(22, 4, 0.8);
      c.glimmerLine(10, 12, 1.4, 1).glimmerLine(16.5, 18.5, 2.1, 1).glimmerLine(23, 25, 1.4, 1);
    },
  }),
  seg({
    id: 'sign_alley',
    length: 36,
    difficulty: 2,
    tags: ['medium'],
    pickupRule: 'Low glimmers under each sign reward sliding.',
    build(c) {
      c.run(36).beam(9).log(18, 0.8).beam(27);
      c.glimmerLine(7.5, 10.5, 0.35, 1).glimmerArc(15.4, 4).glimmerLine(25.5, 28.5, 0.35, 1);
    },
  }),
];

export const SEGMENT_BY_ID: Record<string, SegmentTemplate> = Object.fromEntries(SEGMENTS.map((s) => [s.id, s]));
