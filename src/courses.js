/** @import { CourseLayout, Pilot } from './domain/types.js' */

/**
 * The cup of the Warp game: five courses flown in order, from a sunset skyway to the warp core.
 * The pilots are the regulars of the arcade the career knows, each in a craft and a color of
 * their own; the field grows faster course by course, and the last race is against the
 * Landlord. Each course says how far apart its rings, boost pads and hazards come, and how
 * well the player must place to go through.
 */

/**
 * @param {string} name
 * @param {string} rgb
 * @param {Pilot['craft']} craft
 * @param {number} pace
 * @param {number} skill
 * @returns {Pilot}
 */
const pilot = (name, rgb, craft, pace, skill) => Object.freeze({ name, rgb, craft, pace, skill });

const ROMA = pilot('Roma', '96, 165, 250', 'jet', 0.92, 0.55);
const HALYNA = pilot('Halyna', '244, 114, 182', 'wing', 0.93, 0.6);
const TARAS = pilot('Taras', '163, 230, 53', 'dart', 0.95, 0.6);
const JANITOR = pilot('Janitor', '148, 163, 184', 'saucer', 0.96, 0.65);
const HRYTS = pilot('Hryts', '251, 146, 60', 'jet', 0.97, 0.65);
const SANYA = pilot('Sanya', '45, 212, 191', 'dart', 0.99, 0.75);
const WOBBLE = pilot('DJ Wobble', '232, 121, 249', 'saucer', 1.0, 0.7);
const ZINA = pilot('Zina', '250, 204, 21', 'wing', 1.02, 0.85);
const LAG = pilot('LAG', '167, 139, 250', 'dart', 1.03, 0.8);
const LANDLORD = pilot('Landlord', '239, 68, 68', 'wing', 1.04, 0.9);

/** @type {readonly CourseLayout[]} */
export const WARP_COURSES = Object.freeze(/** @type {CourseLayout[]} */ ([
  {
    name: 'Sunset Skyway',
    theme: 'sunset',
    length: 2200,
    bends: [[260, 0], [300, 0.9], [200, 0], [320, -1.1], [240, 0.5], [300, 0], [280, -0.8], [300, 1]],
    every: { rings: 120, pads: 230, mines: 0, debris: 0, cargo: 170 },
    pilots: [ROMA, HALYNA, TARAS, JANITOR, HRYTS],
    qualify: 3,
  },
  {
    name: 'Neon Canyon',
    theme: 'canyon',
    length: 2400,
    bends: [[200, 0], [260, -1.4], [180, 1.2], [240, 0], [300, 1.6], [220, -1.5], [260, 0.6], [340, -0.9], [200, 0.7], [200, 0]],
    every: { rings: 130, pads: 220, mines: 150, debris: 0, cargo: 0 },
    pilots: [TARAS, JANITOR, HRYTS, SANYA, WOBBLE],
    qualify: 3,
  },
  {
    name: 'Cloud Nine',
    theme: 'clouds',
    length: 2500,
    bends: [[240, 0], [320, 1.1], [260, -1.1], [200, 0.4], [300, -1.6], [260, 1.4], [320, 0], [300, -0.7], [300, 0.9]],
    every: { rings: 120, pads: 220, mines: 0, debris: 190, cargo: 140 },
    pilots: [HRYTS, SANYA, WOBBLE, ZINA, LAG],
    qualify: 3,
  },
  {
    name: 'Orbital Ring',
    theme: 'orbit',
    length: 2600,
    bends: [[220, 0], [400, 1.8], [200, 0], [400, -1.8], [260, 0.5], [320, 1.3], [400, -1.2], [400, 0]],
    every: { rings: 125, pads: 210, mines: 170, debris: 120, cargo: 0 },
    pilots: [SANYA, WOBBLE, ZINA, LAG, HRYTS],
    qualify: 2,
  },
  {
    name: 'Warp Core',
    theme: 'tunnel',
    length: 2800,
    bends: [[200, 0], [240, -1.7], [240, 1.7], [200, 0], [300, 2], [260, -2], [300, 0.8], [360, -1.2], [300, 1.4], [400, 0]],
    every: { rings: 115, pads: 200, mines: 140, debris: 160, cargo: 230 },
    pilots: [WOBBLE, ZINA, LAG, SANYA, LANDLORD],
    qualify: 1,
  },
].map((course) => Object.freeze({
  ...course,
  bends: Object.freeze(course.bends.map((bend) => Object.freeze(bend))),
  every: Object.freeze(course.every),
  pilots: Object.freeze(course.pilots),
}))));
