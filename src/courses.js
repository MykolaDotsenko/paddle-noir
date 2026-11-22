/** @import { CourseLayout, Pilot } from './domain/types.js' */

/**
 * The cup of the Warp game: five courses flown in order, from a sunset skyway to the warp core.
 * The pilots are the regulars of the arcade the career knows, each in a craft and a color of
 * their own, and some with a way of racing of their own; the field grows faster course by
 * course, and the last race is against the Landlord, who drops mines for whoever follows.
 * Each course says how it bends and rolls, how far apart its rings, boost pads, ramps, gates,
 * rocket crates, nitro cells and hazards come, and how well the player must place to go through.
 */

/**
 * @param {string} name
 * @param {string} rgb
 * @param {Pilot['craft']} craft
 * @param {number} pace
 * @param {number} skill
 * @param {Pilot['trait']} [trait]
 * @returns {Pilot}
 */
const pilot = (name, rgb, craft, pace, skill, trait = 'none') => Object.freeze({ name, rgb, craft, pace, skill, trait });

const ROMA = pilot('Roma', '96, 165, 250', 'jet', 0.99, 0.55);
const HALYNA = pilot('Halyna', '244, 114, 182', 'wing', 1.0, 0.6);
const TARAS = pilot('Taras', '163, 230, 53', 'dart', 1.02, 0.6);
const JANITOR = pilot('Janitor', '148, 163, 184', 'saucer', 1.03, 0.65);
const HRYTS = pilot('Hryts', '251, 146, 60', 'jet', 1.04, 0.65);
const SANYA = pilot('Sanya', '45, 212, 191', 'dart', 1.06, 0.75, 'blocker');
const WOBBLE = pilot('DJ Wobble', '232, 121, 249', 'saucer', 1.07, 0.7, 'weaver');
const ZINA = pilot('Zina', '250, 204, 21', 'wing', 1.09, 0.85, 'blocker');
const LAG = pilot('LAG', '167, 139, 250', 'dart', 1.1, 0.8, 'weaver');
const LANDLORD = pilot('Landlord', '239, 68, 68', 'heavy', 1.12, 0.9, 'miner');

/** @type {readonly CourseLayout[]} */
export const WARP_COURSES = Object.freeze(/** @type {CourseLayout[]} */ ([
  {
    name: 'Sunset Skyway',
    theme: 'sunset',
    length: 2200,
    bends: [[260, 0], [300, 0.9], [200, 0], [320, -1.1], [240, 0.5], [300, 0], [280, -0.8], [300, 1]],
    hills: [[1, 420, 0.1], [0.35, 170, 0.6]],
    every: { rings: 100, pads: 185, mines: 0, debris: 0, cargo: 340, ramps: 560, gates: 0, crates: 440, cells: 450 },
    pilots: [ROMA, HALYNA, TARAS, JANITOR, HRYTS],
    qualify: 4,
  },
  {
    name: 'Neon Canyon',
    theme: 'canyon',
    length: 2400,
    bends: [[200, 0], [260, -1.4], [180, 1.2], [240, 0], [300, 1.6], [220, -1.5], [260, 0.6], [340, -0.9], [200, 0.7], [200, 0]],
    hills: [[1.4, 360, 0.3], [0.5, 140, 0.2]],
    every: { rings: 115, pads: 190, mines: 330, debris: 0, cargo: 0, ramps: 650, gates: 630, crates: 420, cells: 440 },
    pilots: [TARAS, JANITOR, HRYTS, SANYA, WOBBLE],
    qualify: 4,
  },
  {
    name: 'Cloud Nine',
    theme: 'clouds',
    length: 2500,
    bends: [[240, 0], [320, 1.1], [260, -1.1], [200, 0.4], [300, -1.6], [260, 1.4], [320, 0], [300, -0.7], [300, 0.9]],
    hills: [[2, 480, 0], [0.7, 190, 0.4]],
    every: { rings: 105, pads: 195, mines: 0, debris: 350, cargo: 330, ramps: 410, gates: 780, crates: 410, cells: 440 },
    pilots: [HRYTS, SANYA, WOBBLE, ZINA, LAG],
    qualify: 3,
  },
  {
    name: 'Orbital Ring',
    theme: 'orbit',
    length: 2600,
    bends: [[220, 0], [400, 1.8], [200, 0], [400, -1.8], [260, 0.5], [320, 1.3], [400, -1.2], [400, 0]],
    hills: [[1.2, 300, 0.5], [0.9, 210, 0.1]],
    every: { rings: 115, pads: 190, mines: 300, debris: 290, cargo: 0, ramps: 550, gates: 550, crates: 400, cells: 420 },
    pilots: [SANYA, WOBBLE, ZINA, LAG, HRYTS],
    qualify: 3,
  },
  {
    name: 'Warp Core',
    theme: 'tunnel',
    length: 2800,
    bends: [[200, 0], [240, -1.7], [240, 1.7], [200, 0], [300, 2], [260, -2], [300, 0.8], [360, -1.2], [300, 1.4], [400, 0]],
    hills: [[1.8, 330, 0.2], [0.8, 150, 0.7]],
    every: { rings: 110, pads: 195, mines: 280, debris: 320, cargo: 390, ramps: 510, gates: 460, crates: 380, cells: 430 },
    pilots: [WOBBLE, ZINA, LAG, SANYA, LANDLORD],
    qualify: 2,
  },
].map((course) => Object.freeze({
  ...course,
  bends: Object.freeze(course.bends.map((bend) => Object.freeze(bend))),
  hills: Object.freeze(course.hills.map((hill) => Object.freeze(hill))),
  every: Object.freeze(course.every),
  pilots: Object.freeze(course.pilots),
}))));
