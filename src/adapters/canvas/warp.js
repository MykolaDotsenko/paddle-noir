import { ITEM_RADIUS, itemX, laneX, onRumble } from '../../domain/warp.js';
import { FONT, mixRgb, roundedRect, SUPER_STYLE, THEME } from './theme.js';

/**
 * The Warp game on the canvas, seen from just behind the player's craft: a sky and a horizon
 * of the course's own, a neon lane that bends away into the distance, what is on it, the
 * rivals, and the craft where the paddle would be; over them the place, the progress and the
 * speed, the start lights and how a race ended. The course is projected a stretch at a time,
 * as the arcade racers did: each stretch nearer is lower on the board and wider. Each function
 * draws onto a context already scaled to board coordinates, and does nothing in any other
 * game. Nothing here is the pure white kept for the ball.
 *
 * @import { Course, CourseTheme, GameConfig, GameState, Pilot, Racer, TrackItem, WarpConfig, WarpState } from '../../domain/types.js'
 * @import { GlowSprites } from './court.js'
 *
 * @typedef {object} Spot where something on the course is on the board
 * @property {number} x
 * @property {number} y the lane's surface under it
 * @property {number} scale 1 where the player's craft is, smaller farther away
 * @property {number} depth meters ahead of the eye
 *
 * @typedef {(z: number, x: number) => Spot | null} Projector null for what is out of sight
 */

/** Where the horizon is on the board. */
export const HORIZON = 272;
/** The eye is this far behind the player's craft. */
const EYE_BEHIND = 7;
/** Things nearer the eye than this are out of sight. */
const NEAR = 0.7;
/** How far ahead the lane is drawn, in stretches. */
const DRAW_STRETCHES = 64;
/** How hard a bend of 1 turns the lane, across it, for each stretch along it. */
const BEND = 0.02;
/** How far the horizon slides for a turn of the lane. */
const PARALLAX = 70;
/** How wide the place figure stands, P and a digit, at its size. */
const PLACE_WIDTH = 54;
/** Displayed speed, a share of the meters a second. */
const KMH = 16;
/** The player's craft is drawn a little larger than a rival as near, so it reads at a glance. */
const CRAFT_SCALE = 1.2;
/** A rival's name shows above its craft while it is this near. */
const NAME_TAG_METERS = 40;
const CORE_LIGHT = '248, 250, 252';

/**
 * @typedef {object} Look how a course is painted
 * @property {readonly string[]} sky top to the horizon
 * @property {readonly string[]} ground the horizon to the bottom
 * @property {string} grid "r, g, b" of the lines on the ground; empty for none
 * @property {string} edge "r, g, b" of the lane's edges
 * @property {string} stripe "r, g, b" of the rumble strips
 * @property {string} ring "r, g, b" of the rings
 * @property {'mountains' | 'mesas' | 'clouds' | 'planet' | 'core'} skyline
 * @property {string} skylineRgb
 * @property {'palms' | 'rocks' | 'beacons' | 'masts' | 'arches'} side what stands beside the lane
 * @property {boolean} stars
 */

/** @type {Readonly<Record<CourseTheme, Look>>} */
export const LOOKS = Object.freeze({
  sunset: Object.freeze({
    sky: ['#10052a', '#3b0f5c', '#9d2a6b', '#f9733d'],
    ground: ['#1a0525', '#07061a'],
    grid: '244, 114, 182',
    edge: '34, 211, 238',
    stripe: '244, 114, 182',
    ring: '251, 191, 36',
    skyline: 'mountains',
    skylineRgb: '167, 139, 250',
    side: 'palms',
    stars: false,
  }),
  canyon: Object.freeze({
    sky: ['#020a10', '#05232b', '#0d4d4a', '#1f7a4d'],
    ground: ['#081a14', '#030807'],
    grid: '163, 230, 53',
    edge: '251, 146, 60',
    stripe: '163, 230, 53',
    ring: '45, 212, 191',
    skyline: 'mesas',
    skylineRgb: '251, 146, 60',
    side: 'rocks',
    stars: true,
  }),
  clouds: Object.freeze({
    sky: ['#0a1240', '#26338a', '#6b5bd6', '#e879f9'],
    ground: ['#3b2f8f', '#141245'],
    grid: '',
    edge: '34, 211, 238',
    stripe: '232, 121, 249',
    ring: '250, 204, 21',
    skyline: 'clouds',
    skylineRgb: '216, 180, 254',
    side: 'beacons',
    stars: true,
  }),
  orbit: Object.freeze({
    sky: ['#020208', '#06061a', '#0f0c2e', '#1c1450'],
    ground: ['#0a0820', '#020208'],
    grid: '167, 139, 250',
    edge: '251, 191, 36',
    stripe: '167, 139, 250',
    ring: '34, 211, 238',
    skyline: 'planet',
    skylineRgb: '96, 165, 250',
    side: 'masts',
    stars: true,
  }),
  tunnel: Object.freeze({
    sky: ['#0a0210', '#24041c', '#4a0a2a', '#7f1d1d'],
    ground: ['#1a0410', '#050106'],
    grid: '239, 68, 68',
    edge: '216, 180, 254',
    stripe: '239, 68, 68',
    ring: '251, 191, 36',
    skyline: 'core',
    skylineRgb: '239, 68, 68',
    side: 'arches',
    stars: false,
  }),
});

/** Every so many meters something stands beside the lane, on alternate sides. */
const SIDE_EVERY = Object.freeze({ palms: 22, rocks: 26, beacons: 30, masts: 34, arches: 30 });

/**
 * A number from 0 to 1, always the same for the same two numbers.
 *
 * @param {number} a
 * @param {number} b
 */
function hash(a, b) {
  let h = (Math.imul(a + 3, 2654435761) ^ Math.imul(b + 11, 2246822519)) >>> 0;
  h ^= h >>> 15;
  h = Math.imul(h, 2246822519) >>> 0;
  h ^= h >>> 13;
  return (h >>> 0) / 4294967296;
}

/** @type {WeakMap<Course, { at: Float64Array, slope: Float64Array }>} */
const LINES = new WeakMap();

/**
 * Where the middle of the lane runs, across, at the start of each stretch, and which way it
 * runs there, from the course's bends, worked out once for each course.
 *
 * @param {Course} course
 */
function lineOf(course) {
  const known = LINES.get(course);

  if (known) {
    return known;
  }

  const count = course.curves.length + DRAW_STRETCHES + 4;
  const at = new Float64Array(count + 1);
  const slope = new Float64Array(count + 1);

  for (let index = 0; index < count; index += 1) {
    const bend = (course.curves[index] ?? 0) * BEND;
    slope[index + 1] = slope[index] + bend;
    at[index + 1] = at[index] + slope[index] + bend / 2;
  }

  const line = { at, slope };
  LINES.set(course, line);
  return line;
}

/**
 * @param {{ at: Float64Array, slope: Float64Array }} line
 * @param {readonly number[]} curves
 * @param {number} stretch how far along, in stretches
 * @returns {[number, number]} where the middle of the lane is across, and which way it runs
 */
function middleAt(line, curves, stretch) {
  const index = Math.max(0, Math.min(line.at.length - 2, Math.floor(stretch)));
  const into = stretch - index;
  const bend = (curves[index] ?? 0) * BEND;
  return [line.at[index] + line.slope[index] * into + (bend * into * into) / 2, line.slope[index] + bend * into];
}

/**
 * The lane's geometry on the board for a frame.
 *
 * @param {WarpState} race
 * @param {GameConfig} config
 */
export function viewOf(race, config) {
  const rules = /** @type {WarpConfig} */ (config.warp);
  const craftY = config.height - config.paddle.inset - config.paddle.height / 2;
  const reach = (config.width - config.paddle.width) / 2;
  const tall = (craftY - HORIZON) * EYE_BEHIND;
  const wide = reach * EYE_BEHIND;
  const eye = race.z - EYE_BEHIND;
  const line = lineOf(race.course);
  const here = race.z / rules.segment;
  const [hereAt, heading] = middleAt(line, race.course.curves, here);

  /** @type {Projector} */
  const project = (z, x) => {
    const depth = z - eye;

    if (depth < NEAR) {
      return null;
    }

    const stretch = z / rules.segment;
    // The lane's middle there, measured from the line straight ahead of the craft.
    const [at] = middleAt(line, race.course.curves, stretch);
    const across = at - hereAt - heading * (stretch - here);
    const scale = EYE_BEHIND / depth;

    return { x: config.width / 2 + (across + x) * (wide / depth), y: HORIZON + tall / depth, scale, depth };
  };

  return { project, eye, heading, craftY, reach, segment: rules.segment };
}

/**
 * The Warp game: the sky and what is on its horizon, the ground, the lane, everything on the
 * lane far to near, and the player's craft.
 *
 * @param {CanvasRenderingContext2D} ctx
 * @param {GameState} state
 * @param {GameConfig} config
 * @param {number} now milliseconds
 * @param {GlowSprites} glows
 * @param {boolean} [reducedMotion]
 */
export function drawWarp(ctx, state, config, now, glows, reducedMotion = false) {
  const race = state.warp;
  const rules = config.warp;

  if (!race || !rules) {
    return;
  }

  const look = LOOKS[rules.courses[race.race].theme];
  const view = viewOf(race, config);

  drawSky(ctx, race, look, view.heading, config, now);
  drawGround(ctx, race, look, view, config);
  drawLane(ctx, race, look, view, config);

  if (!reducedMotion) {
    drawSpeedLines(ctx, race, rules, config, now);
  }

  drawField(ctx, state, look, view, config, now, glows);
}

/**
 * @param {CanvasRenderingContext2D} ctx
 * @param {WarpState} race
 * @param {Look} look
 * @param {number} heading which way the lane runs, which slides the horizon
 * @param {GameConfig} config
 * @param {number} now
 */
function drawSky(ctx, race, look, heading, config, now) {
  const { width } = config;
  const sky = ctx.createLinearGradient(0, 0, 0, HORIZON);
  look.sky.forEach((color, index) => sky.addColorStop(index / (look.sky.length - 1), color));
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, width, HORIZON + 1);

  const slide = -heading * PARALLAX;

  if (look.stars) {
    for (let index = 0; index < 70; index += 1) {
      const x = (((hash(index, 1) * width * 2 + slide * 0.3) % (width * 2)) + width * 2) % (width * 2) - width / 2;
      const y = hash(index, 2) * (HORIZON - 30);
      const twinkle = 0.35 + 0.4 * hash(index, 3) + 0.15 * Math.sin(now / 600 + index);
      ctx.fillStyle = `rgba(199, 210, 254, ${twinkle})`;
      ctx.fillRect(x, y, index % 9 === 0 ? 2 : 1.2, index % 9 === 0 ? 2 : 1.2);
    }
  }

  switch (look.skyline) {
    case 'mountains':
      drawSun(ctx, config, now);
      drawRidge(ctx, look, slide * 0.5, 70, 9, config, 0);
      drawRidge(ctx, look, slide, 44, 13, config, 1);
      break;
    case 'mesas':
      drawMesas(ctx, look, slide, config);
      break;
    case 'clouds':
      drawCloudBank(ctx, look, slide, config, race.time);
      break;
    case 'planet':
      drawPlanet(ctx, look, slide, config);
      break;
    case 'core':
    default:
      drawCore(ctx, look, config, now);
  }
}

/**
 * The sunset's sun, in bands, half sunk behind the horizon.
 *
 * @param {CanvasRenderingContext2D} ctx
 * @param {GameConfig} config
 * @param {number} now
 */
function drawSun(ctx, config, now) {
  const x = config.width / 2;
  const radius = 118;
  const gradient = ctx.createLinearGradient(0, HORIZON - radius, 0, HORIZON);
  gradient.addColorStop(0, 'rgb(253, 224, 71)');
  gradient.addColorStop(0.55, 'rgb(251, 146, 60)');
  gradient.addColorStop(1, 'rgb(236, 72, 153)');

  ctx.save();
  ctx.beginPath();
  ctx.rect(0, 0, config.width, HORIZON);
  ctx.clip();
  ctx.globalCompositeOperation = 'lighter';
  ctx.globalAlpha = 0.35;
  ctx.fillStyle = 'rgb(236, 72, 153)';
  ctx.beginPath();
  ctx.arc(x, HORIZON - 6, radius + 30, 0, Math.PI * 2);
  ctx.fill();
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = 'source-over';
  ctx.fillStyle = gradient;
  ctx.beginPath();
  ctx.arc(x, HORIZON - 6, radius, 0, Math.PI * 2);
  ctx.fill();

  // Bands cut across its lower half, drifting down.
  ctx.fillStyle = '#3b0f5c';
  const drift = (now / 900) % 1;

  for (let band = 0; band < 7; band += 1) {
    const top = HORIZON - radius * 0.62 + (band + drift) * 13;
    ctx.fillRect(x - radius, top, radius * 2, 1.5 + band * 0.9);
  }

  ctx.restore();
}

/**
 * A ridge of neon mountains along the horizon.
 *
 * @param {CanvasRenderingContext2D} ctx
 * @param {Look} look
 * @param {number} slide
 * @param {number} high
 * @param {number} peaks
 * @param {GameConfig} config
 * @param {number} layer
 */
function drawRidge(ctx, look, slide, high, peaks, config, layer) {
  const span = config.width * 1.5;
  const step = span / peaks;
  const start = ((slide % span) + span) % span - span;

  ctx.save();
  ctx.beginPath();
  ctx.moveTo(start, HORIZON);

  for (let index = 0; index <= peaks * 2 + 1; index += 1) {
    const x = start + index * step;
    const peak = index % 2 === 0 ? 0.25 : 0.55 + 0.45 * hash(index % peaks, layer + 5);
    ctx.lineTo(x, HORIZON - high * peak);
  }

  ctx.lineTo(start + (peaks * 2 + 1) * step, HORIZON);
  ctx.closePath();
  ctx.fillStyle = layer === 0 ? 'rgba(22, 6, 40, 0.92)' : 'rgba(12, 4, 26, 0.96)';
  ctx.fill();
  ctx.strokeStyle = `rgba(${look.skylineRgb}, ${layer === 0 ? 0.45 : 0.85})`;
  ctx.lineWidth = layer === 0 ? 1 : 1.6;
  ctx.stroke();
  ctx.restore();
}

/**
 * The canyon's mesas, flat-topped, standing up from the horizon.
 *
 * @param {CanvasRenderingContext2D} ctx
 * @param {Look} look
 * @param {number} slide
 * @param {GameConfig} config
 */
function drawMesas(ctx, look, slide, config) {
  const span = config.width * 1.6;
  const start = ((slide % span) + span) % span - span;

  ctx.save();
  ctx.lineWidth = 1.5;

  for (let copy = 0; copy < 3; copy += 1) {
    for (let index = 0; index < 6; index += 1) {
      const left = start + copy * span + hash(index, 21) * span;
      const wide = 50 + hash(index, 22) * 90;
      const high = 40 + hash(index, 23) * 70;

      ctx.beginPath();
      ctx.moveTo(left, HORIZON);
      ctx.lineTo(left + wide * 0.12, HORIZON - high);
      ctx.lineTo(left + wide * 0.88, HORIZON - high);
      ctx.lineTo(left + wide, HORIZON);
      ctx.closePath();
      ctx.fillStyle = 'rgba(4, 20, 18, 0.95)';
      ctx.fill();
      ctx.strokeStyle = `rgba(${look.skylineRgb}, 0.7)`;
      ctx.stroke();
    }
  }

  ctx.restore();
}

/**
 * Banks of cloud along the horizon, the skyway above them.
 *
 * @param {CanvasRenderingContext2D} ctx
 * @param {Look} look
 * @param {number} slide
 * @param {GameConfig} config
 * @param {number} time
 */
function drawCloudBank(ctx, look, slide, config, time) {
  const span = config.width * 1.4;
  const start = ((slide * 0.6 + time * 4) % span + span) % span - span;

  ctx.save();

  for (let copy = 0; copy < 3; copy += 1) {
    for (let index = 0; index < 9; index += 1) {
      const x = start + copy * span + hash(index, 31) * span;
      const radius = 26 + hash(index, 32) * 40;
      ctx.fillStyle = `rgba(${look.skylineRgb}, ${0.18 + hash(index, 33) * 0.14})`;
      ctx.beginPath();
      ctx.ellipse(x, HORIZON - radius * 0.15, radius * 1.8, radius * 0.55, 0, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  ctx.restore();
}

/**
 * A ringed planet low over the horizon, and its moon.
 *
 * @param {CanvasRenderingContext2D} ctx
 * @param {Look} look
 * @param {number} slide
 * @param {GameConfig} config
 */
function drawPlanet(ctx, look, slide, config) {
  const span = config.width * 2;
  // Mostly in sight, a little left of the middle, sliding as the lane turns.
  const x = config.width * 0.3 + ((((slide * 0.4) % span) + span * 1.5) % span) - span / 2;
  const y = HORIZON - 70;
  const body = ctx.createRadialGradient(x - 24, y - 24, 6, x, y, 70);
  body.addColorStop(0, `rgb(${mixRgb(look.skylineRgb, CORE_LIGHT, 0.3)})`);
  body.addColorStop(0.7, `rgb(${look.skylineRgb})`);
  body.addColorStop(1, 'rgb(15, 23, 72)');

  ctx.save();
  ctx.strokeStyle = 'rgba(251, 191, 36, 0.55)';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.ellipse(x, y, 120, 22, -0.25, Math.PI, Math.PI * 2);
  ctx.stroke();
  ctx.fillStyle = body;
  ctx.beginPath();
  ctx.arc(x, y, 64, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.ellipse(x, y, 120, 22, -0.25, 0, Math.PI);
  ctx.stroke();
  ctx.fillStyle = 'rgba(216, 180, 254, 0.85)';
  ctx.beginPath();
  ctx.arc(x + 190, y - 90, 12, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

/**
 * The warp core: rings of light far down the tunnel, pulsing.
 *
 * @param {CanvasRenderingContext2D} ctx
 * @param {Look} look
 * @param {GameConfig} config
 * @param {number} now
 */
function drawCore(ctx, look, config, now) {
  const x = config.width / 2;

  ctx.save();
  ctx.globalCompositeOperation = 'lighter';

  for (let ring = 0; ring < 6; ring += 1) {
    const grow = (now / 1400 + ring / 6) % 1;
    ctx.strokeStyle = `rgba(${look.skylineRgb}, ${0.5 * (1 - grow)})`;
    ctx.lineWidth = 2;
    ctx.beginPath();
    hexagon(ctx, x, HORIZON - 10, 12 + grow * 220);
    ctx.stroke();
  }

  const glow = ctx.createRadialGradient(x, HORIZON - 10, 0, x, HORIZON - 10, 90);
  glow.addColorStop(0, 'rgba(251, 191, 36, 0.7)');
  glow.addColorStop(1, 'rgba(239, 68, 68, 0)');
  ctx.fillStyle = glow;
  ctx.fillRect(x - 90, HORIZON - 100, 180, 180);
  ctx.restore();
}

/**
 * @param {CanvasRenderingContext2D} ctx
 * @param {number} x
 * @param {number} y
 * @param {number} radius
 */
function hexagon(ctx, x, y, radius) {
  for (let corner = 0; corner <= 6; corner += 1) {
    const angle = (Math.PI / 3) * corner + Math.PI / 6;
    const px = x + Math.cos(angle) * radius;
    const py = y + Math.sin(angle) * radius * 0.8;

    if (corner === 0) {
      ctx.moveTo(px, py);
    } else {
      ctx.lineTo(px, py);
    }
  }
}

/**
 * The ground: dark below the horizon, with a grid on it that runs with the lane.
 *
 * @param {CanvasRenderingContext2D} ctx
 * @param {WarpState} race
 * @param {Look} look
 * @param {ReturnType<typeof viewOf>} view
 * @param {GameConfig} config
 */
function drawGround(ctx, race, look, view, config) {
  const { width, height } = config;
  const ground = ctx.createLinearGradient(0, HORIZON, 0, height);
  look.ground.forEach((color, index) => ground.addColorStop(index / (look.ground.length - 1), color));
  ctx.fillStyle = ground;
  ctx.fillRect(0, HORIZON, width, height - HORIZON);

  // A glow along the horizon.
  const haze = ctx.createLinearGradient(0, HORIZON - 14, 0, HORIZON + 26);
  haze.addColorStop(0, `rgba(${look.stripe}, 0)`);
  haze.addColorStop(0.4, `rgba(${look.stripe}, 0.35)`);
  haze.addColorStop(1, `rgba(${look.stripe}, 0)`);
  ctx.fillStyle = haze;
  ctx.fillRect(0, HORIZON - 14, width, 40);

  if (!look.grid) {
    drawCloudSea(ctx, look, view);
    return;
  }

  ctx.save();
  ctx.lineWidth = 1;
  const first = Math.ceil(view.eye / view.segment);

  // Across: a line every few stretches, nearer ones brighter.
  for (let stretch = first + DRAW_STRETCHES; stretch >= first; stretch -= 1) {
    if (stretch % 3 !== 0) {
      continue;
    }

    const spot = view.project(stretch * view.segment, 0);

    if (spot) {
      ctx.strokeStyle = `rgba(${look.grid}, ${Math.min(0.5, 0.06 + spot.scale * 0.3)})`;
      ctx.beginPath();
      ctx.moveTo(0, spot.y);
      ctx.lineTo(width, spot.y);
      ctx.stroke();
    }
  }

  // Along: lines either side of the lane, bending with it.
  for (const offset of [-9, -6.5, -4.5, -3, -2, 2, 3, 4.5, 6.5, 9]) {
    ctx.strokeStyle = `rgba(${look.grid}, 0.22)`;
    ctx.beginPath();
    let started = false;

    for (let stretch = first + DRAW_STRETCHES; stretch >= first; stretch -= 2) {
      const spot = view.project(stretch * view.segment, offset);

      if (spot) {
        if (started) {
          ctx.lineTo(spot.x, spot.y);
        } else {
          ctx.moveTo(spot.x, spot.y);
          started = true;
        }
      }
    }

    ctx.stroke();
  }

  ctx.restore();
}

/**
 * Under the skyway, a sea of cloud rushing past.
 *
 * @param {CanvasRenderingContext2D} ctx
 * @param {Look} look
 * @param {ReturnType<typeof viewOf>} view
 */
function drawCloudSea(ctx, look, view) {
  const first = Math.ceil(view.eye / 12);

  ctx.save();

  for (let row = first + 14; row >= first; row -= 1) {
    for (const side of [-1, 1]) {
      const x = side * (2.2 + hash(row, side + 40) * 5);
      const spot = view.project(row * 12, x);

      if (spot) {
        ctx.fillStyle = `rgba(${look.skylineRgb}, ${Math.min(0.32, 0.08 + spot.scale * 0.2)})`;
        ctx.beginPath();
        ctx.ellipse(spot.x, spot.y + 6 * spot.scale, 160 * spot.scale, 26 * spot.scale, 0, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }

  ctx.restore();
}

/**
 * The lane: its surface in alternating bands that rush toward the craft, rumble strips along
 * its edges, a dashed line either side of the middle, and its two glowing edges.
 *
 * @param {CanvasRenderingContext2D} ctx
 * @param {WarpState} race
 * @param {Look} look
 * @param {ReturnType<typeof viewOf>} view
 * @param {GameConfig} config
 */
function drawLane(ctx, race, look, view, config) {
  const first = Math.floor(view.eye / view.segment);
  /** @type {{ left: Spot, right: Spot, stretch: number }[]} */
  const rows = [];

  for (let stretch = first; stretch <= first + DRAW_STRETCHES; stretch += 1) {
    const z = stretch * view.segment;
    const left = view.project(z, -1.08);
    const right = view.project(z, 1.08);

    if (left && right) {
      rows.push({ left, right, stretch });
    }
  }

  // Between the eye and the first stretch in sight, the lane runs on to the bottom of the board.
  if (rows.length > 0 && rows[0].left.y < config.height) {
    const { left, right } = rows[0];
    const spread = (right.x - left.x) * 3;
    const middle = (left.x + right.x) / 2;
    rows.unshift({
      left: { ...left, x: middle - spread / 2, y: config.height + 400, scale: left.scale * 3 },
      right: { ...right, x: middle + spread / 2, y: config.height + 400, scale: right.scale * 3 },
      stretch: first - 1,
    });
  }

  ctx.save();

  for (let index = rows.length - 1; index > 0; index -= 1) {
    const far = rows[index];
    const near = rows[index - 1];
    const band = Math.floor(near.stretch / 2) % 2 === 0;
    const finish = near.stretch * view.segment <= race.course.length && far.stretch * view.segment > race.course.length;

    // The surface.
    quad(ctx, near.left, near.right, far.right, far.left, finish ? 'rgba(248, 250, 252, 0.08)' : band ? '#100d2c' : '#1a1640');

    // Rumble strips.
    const strip = band ? `rgba(${look.stripe}, 0.75)` : 'rgba(5, 6, 15, 0.9)';
    /** @type {(a: Spot, b: Spot, share: number) => Spot} */
    const inset = (a, b, share) => ({ ...a, x: a.x + (b.x - a.x) * share });
    quad(ctx, near.left, inset(near.left, near.right, 0.05), inset(far.left, far.right, 0.05), far.left, strip);
    quad(ctx, inset(near.right, near.left, 0.05), near.right, far.right, inset(far.right, far.left, 0.05), strip);

    // Dashed lines a third of the way in from each edge.
    if (band) {
      for (const share of [0.355, 0.645]) {
        const a = inset(near.left, near.right, share - 0.004);
        const b = inset(near.left, near.right, share + 0.004);
        const c = inset(far.left, far.right, share + 0.004);
        const d = inset(far.left, far.right, share - 0.004);
        quad(ctx, a, b, c, d, `rgba(${look.edge}, 0.35)`);
      }
    }

    if (finish) {
      checkers(ctx, near, far);
    }
  }

  // The sky's glow on the lane, strongest near the horizon.
  if (rows.length > 1) {
    const top = rows[rows.length - 1];
    const sheen = ctx.createLinearGradient(0, top.left.y, 0, config.height);
    sheen.addColorStop(0, `rgba(${look.stripe}, 0.32)`);
    sheen.addColorStop(0.35, `rgba(${look.stripe}, 0.06)`);
    sheen.addColorStop(1, `rgba(${look.edge}, 0.05)`);
    ctx.globalCompositeOperation = 'lighter';
    ctx.fillStyle = sheen;
    ctx.beginPath();
    rows.forEach((row, index) => (index === 0 ? ctx.moveTo(row.left.x, row.left.y) : ctx.lineTo(row.left.x, row.left.y)));
    for (let index = rows.length - 1; index >= 0; index -= 1) {
      ctx.lineTo(rows[index].right.x, rows[index].right.y);
    }
    ctx.closePath();
    ctx.fill();
    ctx.globalCompositeOperation = 'source-over';
  }

  // The edges, glowing.
  ctx.lineJoin = 'round';

  for (const side of /** @type {const} */ (['left', 'right'])) {
    for (const [width, alpha] of [[12, 0.12], [6, 0.22], [2.4, 1]]) {
      ctx.strokeStyle = `rgba(${look.edge}, ${alpha})`;
      ctx.lineWidth = width;
      ctx.beginPath();
      rows.forEach((row, index) => {
        if (index === 0) {
          ctx.moveTo(row[side].x, row[side].y);
        } else {
          ctx.lineTo(row[side].x, row[side].y);
        }
      });
      ctx.stroke();
    }
  }

  ctx.restore();
}

/**
 * @param {CanvasRenderingContext2D} ctx
 * @param {{ x: number, y: number }} a
 * @param {{ x: number, y: number }} b
 * @param {{ x: number, y: number }} c
 * @param {{ x: number, y: number }} d
 * @param {string} color
 */
function quad(ctx, a, b, c, d, color) {
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(a.x, a.y);
  ctx.lineTo(b.x, b.y);
  ctx.lineTo(c.x, c.y);
  ctx.lineTo(d.x, d.y);
  ctx.closePath();
  ctx.fill();
}

/**
 * The finish line, checkered across the lane.
 *
 * @param {CanvasRenderingContext2D} ctx
 * @param {{ left: Spot, right: Spot }} near
 * @param {{ left: Spot, right: Spot }} far
 */
function checkers(ctx, near, far) {
  const squares = 12;

  for (let square = 0; square < squares; square += 2) {
    /** @type {(row: { left: Spot, right: Spot }, share: number) => { x: number, y: number }} */
    const at = (row, share) => ({ x: row.left.x + (row.right.x - row.left.x) * share, y: row.left.y });
    quad(ctx, at(near, square / squares), at(near, (square + 1) / squares), at(far, (square + 1) / squares), at(far, square / squares), 'rgba(226, 232, 240, 0.85)');
  }
}

/**
 * Lines that streak past from the horizon while the craft is boosting.
 *
 * @param {CanvasRenderingContext2D} ctx
 * @param {WarpState} race
 * @param {WarpConfig} rules
 * @param {GameConfig} config
 * @param {number} now
 */
function drawSpeedLines(ctx, race, rules, config, now) {
  const rush = Math.min(1, Math.max(0, (race.speed - rules.topSpeed - 2) / (rules.boostSpeed - rules.topSpeed)));

  if (rush <= 0) {
    return;
  }

  const x = config.width / 2;
  const reach = config.height;

  ctx.save();
  ctx.lineCap = 'round';

  for (let line = 0; line < 26; line += 1) {
    const angle = hash(line, 50) * Math.PI * 2;
    const along = (now / 420 + hash(line, 51)) % 1;
    const from = 60 + along * along * reach;
    const length = 30 + along * 90;
    ctx.strokeStyle = `rgba(165, 243, 252, ${rush * along * 0.5})`;
    ctx.lineWidth = 1 + along * 1.5;
    ctx.beginPath();
    ctx.moveTo(x + Math.cos(angle) * from, HORIZON + Math.sin(angle) * from * 0.8);
    ctx.lineTo(x + Math.cos(angle) * (from + length), HORIZON + Math.sin(angle) * (from + length) * 0.8);
    ctx.stroke();
  }

  ctx.restore();
}

/**
 * Everything on the lane and beside it, farthest first, the player's craft among them.
 *
 * @param {CanvasRenderingContext2D} ctx
 * @param {GameState} state
 * @param {Look} look
 * @param {ReturnType<typeof viewOf>} view
 * @param {GameConfig} config
 * @param {number} now
 * @param {GlowSprites} glows
 */
function drawField(ctx, state, look, view, config, now, glows) {
  const race = /** @type {WarpState} */ (state.warp);
  const rules = /** @type {WarpConfig} */ (config.warp);
  const pilots = rules.courses[race.race].pilots;
  const far = view.eye + DRAW_STRETCHES * view.segment;
  /** @type {{ depth: number, draw: () => void }[]} */
  const sprites = [];

  for (const item of race.course.items) {
    if (item.z > far) {
      break;
    }

    const spot = view.project(item.z, itemX(item, race.time));

    if (spot) {
      sprites.push({ depth: spot.depth, draw: () => drawItem(ctx, item, spot, look, view, race, now, glows) });
    }
  }

  // What stands beside the lane.
  const every = SIDE_EVERY[look.side];

  for (let index = Math.ceil(view.eye / every); index * every <= far; index += 1) {
    const side = index % 2 === 0 ? -1 : 1;
    const spot = view.project(index * every, look.side === 'arches' ? 0 : side * (1.5 + hash(index, 60) * 0.8));

    if (spot) {
      sprites.push({ depth: spot.depth, draw: () => drawSide(ctx, look, spot, side, index, view, now) });
    }
  }

  // The finish gantry.
  const finish = view.project(race.course.length, 0);

  if (finish) {
    sprites.push({ depth: finish.depth, draw: () => drawGantry(ctx, finish, look, view, now) });
  }

  for (const rival of race.rivals) {
    const spot = view.project(rival.z, rival.x);

    if (spot && spot.depth < far - view.eye) {
      sprites.push({ depth: spot.depth, draw: () => drawRival(ctx, rival, pilots[rival.pilot], spot, now, glows) });
    }
  }

  sprites.push({ depth: EYE_BEHIND, draw: () => drawCraft(ctx, state, config, view, now, glows) });
  sprites.sort((a, b) => b.depth - a.depth);

  for (const sprite of sprites) {
    sprite.draw();
  }
}

/**
 * @param {CanvasRenderingContext2D} ctx
 * @param {TrackItem} item
 * @param {Spot} spot
 * @param {Look} look
 * @param {ReturnType<typeof viewOf>} view
 * @param {WarpState} race
 * @param {number} now
 * @param {GlowSprites} glows
 */
function drawItem(ctx, item, spot, look, view, race, now, glows) {
  const { x, y, scale } = spot;
  const unit = view.reach * scale;
  // Things fade in from the distance, and out as they pass the craft.
  const fade = Math.min(1, scale * 3) * (spot.depth < EYE_BEHIND ? spot.depth / EYE_BEHIND : 1);

  ctx.save();
  ctx.globalAlpha = Math.max(0, fade);

  switch (item.kind) {
    case 'ring': {
      const radius = 0.34 * unit;
      const cy = y - radius * 0.8;
      const passed = item.z <= race.z;
      ctx.globalCompositeOperation = 'lighter';
      ctx.strokeStyle = `rgba(${look.ring}, ${passed ? 0.06 : 0.14})`;
      ctx.lineWidth = Math.max(6, 26 * scale);
      ctx.beginPath();
      ctx.arc(x, cy, radius, 0, Math.PI * 2);
      ctx.stroke();
      ctx.strokeStyle = `rgba(${look.ring}, ${passed ? 0.15 : 0.35})`;
      ctx.lineWidth = Math.max(3, 12 * scale);
      ctx.beginPath();
      ctx.arc(x, cy, radius, 0, Math.PI * 2);
      ctx.stroke();
      ctx.strokeStyle = `rgba(${look.ring}, ${passed ? 0.3 : 1})`;
      ctx.lineWidth = Math.max(1.5, 4 * scale);
      ctx.stroke();

      // Marks turning round it, and its middle, faintly.
      ctx.fillStyle = `rgba(${mixRgb(look.ring, CORE_LIGHT, 0.4)}, 0.9)`;

      for (let mark = 0; mark < 8; mark += 1) {
        const angle = (Math.PI / 4) * mark + now / 700;
        ctx.beginPath();
        ctx.arc(x + Math.cos(angle) * radius, cy + Math.sin(angle) * radius, Math.max(1, 2.6 * scale), 0, Math.PI * 2);
        ctx.fill();
      }

      ctx.fillStyle = `rgba(${look.ring}, 0.12)`;
      ctx.beginPath();
      ctx.arc(x, cy, 0.1 * unit, 0, Math.PI * 2);
      ctx.fill();
      break;
    }
    case 'pad': {
      const next = view.project(item.z + 6, itemX(item, race.time));
      const width = 0.22 * unit;

      if (next) {
        const farWidth = 0.22 * view.reach * next.scale;
        const glow = 0.55 + 0.35 * Math.sin(now / 160 + item.id);
        quad(ctx, { x: x - width, y }, { x: x + width, y }, { x: next.x + farWidth, y: next.y }, { x: next.x - farWidth, y: next.y }, `rgba(${THEME.amber}, ${0.22 * glow})`);
        ctx.strokeStyle = `rgba(${THEME.amber}, ${glow})`;
        ctx.lineWidth = Math.max(1, 2.4 * scale);

        for (let chevron = 0; chevron < 3; chevron += 1) {
          const share = (chevron + ((now / 300) % 1)) / 3;
          const cy = y + (next.y - y) * share;
          const cx = x + (next.x - x) * share;
          const half = width + (farWidth - width) * share;
          ctx.beginPath();
          ctx.moveTo(cx - half * 0.7, cy + (y - next.y) * 0.12);
          ctx.lineTo(cx, cy - (y - next.y) * 0.1);
          ctx.lineTo(cx + half * 0.7, cy + (y - next.y) * 0.12);
          ctx.stroke();
        }
      }
      break;
    }
    case 'mine': {
      const radius = ITEM_RADIUS.mine * unit;
      const cy = y - radius * 1.6;
      ctx.globalCompositeOperation = 'lighter';
      ctx.drawImage(glows.get(THEME.red), x - radius * 3, cy - radius * 3, radius * 6, radius * 6);
      ctx.globalCompositeOperation = 'source-over';
      ctx.strokeStyle = `rgb(${THEME.red})`;
      ctx.lineWidth = Math.max(1, 2 * scale);

      for (let spike = 0; spike < 8; spike += 1) {
        const angle = (Math.PI / 4) * spike + now / 900;
        ctx.beginPath();
        ctx.moveTo(x + Math.cos(angle) * radius * 0.8, cy + Math.sin(angle) * radius * 0.8);
        ctx.lineTo(x + Math.cos(angle) * radius * 1.35, cy + Math.sin(angle) * radius * 1.35);
        ctx.stroke();
      }

      ctx.fillStyle = '#1a0508';
      ctx.beginPath();
      ctx.arc(x, cy, radius * 0.85, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = `rgba(${THEME.red}, ${0.5 + 0.5 * Math.sin(now / 170 + item.id)})`;
      ctx.beginPath();
      ctx.arc(x, cy, radius * 0.3, 0, Math.PI * 2);
      ctx.fill();
      shadow(ctx, x, y, radius * 1.2, scale);
      break;
    }
    case 'debris': {
      const radius = ITEM_RADIUS.debris * unit;
      const cy = y - radius * 1.3;
      const turn = now / 600 + item.id;
      shadow(ctx, x, y, radius, scale);
      ctx.beginPath();

      for (let corner = 0; corner < 7; corner += 1) {
        const angle = (Math.PI * 2 * corner) / 7 + turn;
        const reach = radius * (0.65 + 0.4 * hash(item.id, corner));
        const px = x + Math.cos(angle) * reach;
        const py = cy + Math.sin(angle) * reach * 0.85;

        if (corner === 0) {
          ctx.moveTo(px, py);
        } else {
          ctx.lineTo(px, py);
        }
      }

      ctx.closePath();
      ctx.fillStyle = '#1c1a33';
      ctx.fill();
      ctx.strokeStyle = 'rgba(165, 180, 252, 0.9)';
      ctx.lineWidth = Math.max(1, 2 * scale);
      ctx.stroke();
      break;
    }
    case 'cargo':
    default:
      drawCargo(ctx, x, y, unit, scale, now, glows);
  }

  ctx.restore();
}

/**
 * @param {CanvasRenderingContext2D} ctx
 * @param {number} x
 * @param {number} y
 * @param {number} radius
 * @param {number} scale
 */
function shadow(ctx, x, y, radius, scale) {
  ctx.fillStyle = 'rgba(0, 0, 0, 0.45)';
  ctx.beginPath();
  ctx.ellipse(x, y + 2 * scale, radius, radius * 0.22, 0, 0, Math.PI * 2);
  ctx.fill();
}

/**
 * A slow cargo hauler, seen from behind: a wide hull with hazard stripes and its engines.
 *
 * @param {CanvasRenderingContext2D} ctx
 * @param {number} x
 * @param {number} y
 * @param {number} unit
 * @param {number} scale
 * @param {number} now
 * @param {GlowSprites} glows
 */
function drawCargo(ctx, x, y, unit, scale, now, glows) {
  const half = ITEM_RADIUS.cargo * unit;
  const high = half * 0.62;
  const top = y - high - 10 * scale;

  shadow(ctx, x, y, half, scale);
  ctx.fillStyle = '#16142c';
  roundedRect(ctx, x - half, top, half * 2, high, 6 * scale);
  ctx.fill();
  ctx.strokeStyle = `rgba(${THEME.amber}, 0.9)`;
  ctx.lineWidth = Math.max(1, 2 * scale);
  ctx.stroke();

  // Hazard stripes along its back.
  ctx.save();
  roundedRect(ctx, x - half, top + high * 0.55, half * 2, high * 0.22, 2 * scale);
  ctx.clip();
  ctx.fillStyle = `rgba(${THEME.amber}, 0.85)`;

  for (let stripe = -half; stripe < half; stripe += 16 * scale) {
    ctx.beginPath();
    ctx.moveTo(x + stripe, top + high * 0.77);
    ctx.lineTo(x + stripe + 8 * scale, top + high * 0.55);
    ctx.lineTo(x + stripe + 14 * scale, top + high * 0.55);
    ctx.lineTo(x + stripe + 6 * scale, top + high * 0.77);
    ctx.fill();
  }

  ctx.restore();

  // Engines and tail lights.
  ctx.globalCompositeOperation = 'lighter';

  for (const side of [-0.55, 0.55]) {
    ctx.drawImage(glows.get('96, 165, 250'), x + side * half - 18 * scale, top + high * 0.2 - 18 * scale, 36 * scale, 36 * scale);
  }

  ctx.fillStyle = `rgba(${THEME.red}, ${0.6 + 0.3 * Math.sin(now / 250)})`;
  ctx.fillRect(x - half + 4 * scale, top + 4 * scale, 6 * scale, 4 * scale);
  ctx.fillRect(x + half - 10 * scale, top + 4 * scale, 6 * scale, 4 * scale);
  ctx.globalCompositeOperation = 'source-over';
}

/**
 * What stands beside the lane: neon palms at sunset, rocks in the canyon, beacons above the
 * clouds, masts in orbit, and arches over the lane in the warp core.
 *
 * @param {CanvasRenderingContext2D} ctx
 * @param {Look} look
 * @param {Spot} spot
 * @param {number} side
 * @param {number} index
 * @param {ReturnType<typeof viewOf>} view
 * @param {number} now
 */
function drawSide(ctx, look, spot, side, index, view, now) {
  const { x, y, scale } = spot;
  const unit = view.reach * scale;
  const fade = Math.min(1, scale * 4);

  ctx.save();
  ctx.globalAlpha = fade;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  switch (look.side) {
    case 'palms': {
      const high = unit * 0.9;
      const lean = side * -unit * 0.1;
      ctx.strokeStyle = `rgba(${look.stripe}, 0.95)`;
      ctx.lineWidth = Math.max(1, 4 * scale);
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.quadraticCurveTo(x + lean * 0.2, y - high * 0.6, x + lean, y - high);
      ctx.stroke();
      ctx.strokeStyle = `rgba(${look.edge}, 0.95)`;
      ctx.lineWidth = Math.max(1, 3 * scale);

      for (let frond = 0; frond < 6; frond += 1) {
        const angle = -Math.PI / 2 + (frond - 2.5) * 0.55;
        const reach = unit * 0.32;
        ctx.beginPath();
        ctx.moveTo(x + lean, y - high);
        ctx.quadraticCurveTo(
          x + lean + Math.cos(angle) * reach * 0.6,
          y - high + Math.sin(angle) * reach * 0.6 - reach * 0.15,
          x + lean + Math.cos(angle) * reach,
          y - high + Math.sin(angle) * reach * 0.3 + reach * 0.35,
        );
        ctx.stroke();
      }
      break;
    }
    case 'rocks': {
      const wide = unit * (0.25 + hash(index, 70) * 0.2);
      const high = unit * (0.5 + hash(index, 71) * 0.6);
      ctx.beginPath();
      ctx.moveTo(x - wide, y);
      ctx.lineTo(x - wide * 0.7, y - high * 0.8);
      ctx.lineTo(x - wide * 0.1, y - high);
      ctx.lineTo(x + wide * 0.6, y - high * 0.7);
      ctx.lineTo(x + wide, y);
      ctx.closePath();
      ctx.fillStyle = 'rgba(6, 26, 22, 0.95)';
      ctx.fill();
      ctx.strokeStyle = `rgba(${look.skylineRgb}, 0.8)`;
      ctx.lineWidth = Math.max(1, 2 * scale);
      ctx.stroke();
      break;
    }
    case 'beacons':
    case 'masts': {
      const high = unit * (look.side === 'masts' ? 1.1 : 0.7);
      const rgb = look.side === 'masts' ? look.edge : look.stripe;
      ctx.strokeStyle = `rgba(${rgb}, 0.7)`;
      ctx.lineWidth = Math.max(1, 3 * scale);
      ctx.beginPath();
      ctx.moveTo(x, y + (look.side === 'beacons' ? unit * 0.6 : 0));
      ctx.lineTo(x, y - high);
      ctx.stroke();
      const blink = 0.4 + 0.6 * Math.max(0, Math.sin(now / 260 + index));
      ctx.globalCompositeOperation = 'lighter';
      ctx.fillStyle = `rgba(${rgb}, ${blink})`;
      ctx.beginPath();
      ctx.arc(x, y - high, Math.max(1.5, 7 * scale), 0, Math.PI * 2);
      ctx.fill();

      if (look.side === 'masts') {
        ctx.strokeStyle = `rgba(${rgb}, 0.5)`;
        ctx.beginPath();
        ctx.moveTo(x - side * unit * 0.25, y - high * 0.75);
        ctx.lineTo(x, y - high * 0.55);
        ctx.stroke();
      }
      break;
    }
    case 'arches':
    default: {
      const wide = unit * 1.35;
      const high = unit * 1.2;
      const glow = index % 3 === 0 ? 0.95 : 0.55;
      ctx.globalCompositeOperation = 'lighter';
      ctx.strokeStyle = `rgba(${look.skylineRgb}, ${glow * 0.35})`;
      ctx.lineWidth = Math.max(2, 10 * scale);
      ctx.beginPath();
      archPath(ctx, x, y, wide, high);
      ctx.stroke();
      ctx.strokeStyle = `rgba(${look.edge}, ${glow})`;
      ctx.lineWidth = Math.max(1, 2.5 * scale);
      ctx.beginPath();
      archPath(ctx, x, y, wide, high);
      ctx.stroke();
    }
  }

  ctx.restore();
}

/**
 * @param {CanvasRenderingContext2D} ctx
 * @param {number} x
 * @param {number} y
 * @param {number} wide
 * @param {number} high
 */
function archPath(ctx, x, y, wide, high) {
  ctx.moveTo(x - wide, y);
  ctx.lineTo(x - wide, y - high * 0.55);
  ctx.lineTo(x - wide * 0.55, y - high);
  ctx.lineTo(x + wide * 0.55, y - high);
  ctx.lineTo(x + wide, y - high * 0.55);
  ctx.lineTo(x + wide, y);
}

/**
 * The finish gantry over the lane, checkered, with its banner.
 *
 * @param {CanvasRenderingContext2D} ctx
 * @param {Spot} spot
 * @param {Look} look
 * @param {ReturnType<typeof viewOf>} view
 * @param {number} now
 */
function drawGantry(ctx, spot, look, view, now) {
  const { x, y, scale } = spot;
  const unit = view.reach * scale;
  const wide = unit * 1.2;
  const high = unit * 1.05;

  ctx.save();
  ctx.strokeStyle = `rgba(${look.edge}, 0.95)`;
  ctx.lineWidth = Math.max(1.5, 5 * scale);
  ctx.beginPath();
  ctx.moveTo(x - wide, y);
  ctx.lineTo(x - wide, y - high);
  ctx.moveTo(x + wide, y);
  ctx.lineTo(x + wide, y - high);
  ctx.stroke();

  const bannerHigh = unit * 0.2;
  ctx.fillStyle = '#0b0a1f';
  ctx.fillRect(x - wide, y - high - bannerHigh, wide * 2, bannerHigh);
  const squares = 16;
  const size = (wide * 2) / squares;

  for (let square = 0; square < squares; square += 1) {
    for (let row = 0; row < 2; row += 1) {
      if ((square + row) % 2 === 0) {
        ctx.fillStyle = 'rgba(226, 232, 240, 0.9)';
        ctx.fillRect(x - wide + square * size, y - high - bannerHigh + row * (bannerHigh / 2), size, bannerHigh / 2);
      }
    }
  }

  if (scale > 0.18) {
    ctx.font = `900 ${Math.round(unit * 0.13)}px ${FONT}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'bottom';
    ctx.fillStyle = `rgba(${THEME.amber}, ${0.75 + 0.25 * Math.sin(now / 200)})`;
    ctx.fillText('FINISH', x, y - high - bannerHigh - 4 * scale);
  }

  ctx.restore();
}

/**
 * @param {CanvasRenderingContext2D} ctx
 * @param {Racer} rival
 * @param {Pilot} pilot
 * @param {Spot} spot
 * @param {number} now
 * @param {GlowSprites} glows
 */
function drawRival(ctx, rival, pilot, spot, now, glows) {
  const fade = Math.min(1, spot.scale * 4) * (spot.depth < EYE_BEHIND ? Math.max(0.2, spot.depth / EYE_BEHIND) : 1);
  const turn = rival.spin > 0 ? (rival.spin / 1.2) * Math.PI * 3 : clamp((rival.line - rival.x) * 1.4, -0.35, 0.35);

  ctx.save();
  ctx.globalAlpha = fade;
  hull(ctx, {
    craft: pilot.craft,
    rgb: pilot.rgb,
    core: mixRgb(pilot.rgb, CORE_LIGHT, 0.55),
    x: spot.x,
    y: spot.y,
    scale: spot.scale,
    bank: turn,
    flame: rival.boost > 0 ? 1 : 0.45 + 0.1 * Math.sin(now / 50 + rival.id),
    glows,
  });

  if (spot.depth < NAME_TAG_METERS && spot.depth > EYE_BEHIND + 1 && rival.finish === 0) {
    ctx.font = `800 ${Math.round(clamp(11 * spot.scale, 9, 13))}px ${FONT}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'bottom';
    ctx.fillStyle = `rgba(${pilot.rgb}, ${0.85 * Math.min(1, (NAME_TAG_METERS - spot.depth) / 10)})`;
    ctx.fillText(pilot.name.toUpperCase(), spot.x, spot.y - 34 * spot.scale - 4);
  }

  ctx.restore();
}

/**
 * @param {number} value
 * @param {number} min
 * @param {number} max
 */
function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

/**
 * @typedef {object} HullStyle
 * @property {Pilot['craft']} craft
 * @property {string} rgb
 * @property {string} core "r, g, b" or a color
 * @property {number} x
 * @property {number} y
 * @property {number} scale
 * @property {number} bank radians it leans, or turns while it spins
 * @property {number} flame 0 to 1
 * @property {GlowSprites} glows
 * @property {string} [coreColor] a color for the cockpit, in place of the core's rgb
 */

/**
 * A racing craft seen from behind, its engines toward the eye: a jet, a flying wing, a saucer
 * or a dart, each in its pilot's color.
 *
 * @param {CanvasRenderingContext2D} ctx
 * @param {HullStyle} style
 */
function hull(ctx, style) {
  const { craft, rgb, x, y, scale, bank, flame, glows } = style;

  ctx.save();
  ctx.translate(x, y);
  ctx.scale(scale, scale);

  // Its shadow on the lane.
  ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
  ctx.beginPath();
  ctx.ellipse(0, 14, 30, 5, 0, 0, Math.PI * 2);
  ctx.fill();

  ctx.rotate(bank);

  // Engine glow and flames, toward the eye.
  ctx.globalCompositeOperation = 'lighter';
  const engines = craft === 'saucer' ? [0] : craft === 'dart' ? [-5, 5] : [-11, 11];

  for (const at of engines) {
    ctx.drawImage(glows.get(rgb), at - 16, -10, 32, 32);
    ctx.fillStyle = `rgba(${THEME.amber}, ${0.5 + flame * 0.4})`;
    ctx.beginPath();
    ctx.moveTo(at - 3.5, 5);
    ctx.lineTo(at, 5 + 6 + flame * 16);
    ctx.lineTo(at + 3.5, 5);
    ctx.closePath();
    ctx.fill();
  }

  ctx.globalCompositeOperation = 'source-over';
  ctx.lineJoin = 'round';
  ctx.beginPath();

  switch (craft) {
    case 'wing':
      ctx.moveTo(-36, 6);
      ctx.lineTo(-8, -10);
      ctx.lineTo(8, -10);
      ctx.lineTo(36, 6);
      ctx.lineTo(14, 9);
      ctx.lineTo(-14, 9);
      break;
    case 'saucer':
      ctx.ellipse(0, 2, 30, 9, 0, 0, Math.PI * 2);
      break;
    case 'dart':
      ctx.moveTo(0, -18);
      ctx.lineTo(10, 6);
      ctx.lineTo(22, 9);
      ctx.lineTo(-22, 9);
      ctx.lineTo(-10, 6);
      break;
    case 'jet':
    default:
      ctx.moveTo(0, -16);
      ctx.lineTo(9, -3);
      ctx.lineTo(30, 6);
      ctx.lineTo(10, 9);
      ctx.lineTo(-10, 9);
      ctx.lineTo(-30, 6);
      ctx.lineTo(-9, -3);
  }

  ctx.closePath();
  ctx.fillStyle = THEME.background;
  ctx.fill();
  ctx.fillStyle = `rgba(${rgb}, 0.35)`;
  ctx.fill();
  ctx.strokeStyle = `rgb(${rgb})`;
  ctx.lineWidth = 2.4;
  ctx.stroke();

  // Fins.
  if (craft === 'jet' || craft === 'dart') {
    ctx.beginPath();
    ctx.moveTo(-7, -2);
    ctx.lineTo(-9, -14);
    ctx.moveTo(7, -2);
    ctx.lineTo(9, -14);
    ctx.stroke();
  }

  // The cockpit.
  ctx.fillStyle = style.coreColor ?? `rgb(${style.core})`;

  if (craft === 'saucer') {
    ctx.beginPath();
    ctx.ellipse(0, -3, 10, 7, 0, Math.PI, Math.PI * 2);
    ctx.fill();
  } else {
    roundedRect(ctx, -3.5, -9, 7, 14, 3.5);
    ctx.fill();
  }

  ctx.restore();
}

/**
 * The player's craft where the paddle would be. It leans as it steers and spins when it is
 * hit; it blazes with an afterburner, fades with a phantom, and streams the air when it rides
 * a slipstream. Its cockpit is the color of a paddle's core, where a paddle's core would be.
 *
 * @param {CanvasRenderingContext2D} ctx
 * @param {GameState} state
 * @param {GameConfig} config
 * @param {ReturnType<typeof viewOf>} view
 * @param {number} now
 * @param {GlowSprites} glows
 */
function drawCraft(ctx, state, config, view, now, glows) {
  const race = /** @type {WarpState} */ (state.warp);
  const rules = /** @type {WarpConfig} */ (config.warp);
  const colors = THEME.side.player;
  const x = state.player.x;
  const y = view.craftY;
  const spinning = race.spin > 0 ? (race.spin / rules.spinSeconds) * Math.PI * 4 : 0;
  const bank = spinning || clamp(state.player.vx / 1500, -0.38, 0.38);
  const rush = clamp((race.speed - rules.topSpeed) / (rules.boostSpeed - rules.topSpeed), 0, 1.2);
  // On the rumble strips the craft judders.
  const judder = onRumble(laneX(state, config)) ? Math.sin(now / 16) * 1.6 : 0;

  ctx.save();

  if (race.burn > 0) {
    ctx.globalCompositeOperation = 'lighter';
    ctx.drawImage(glows.get(SUPER_STYLE.fireball.rgb), x - 70, y - 60, 140, 120);
    ctx.globalCompositeOperation = 'source-over';
  }

  if (race.slip > 0) {
    // The air streaming past, closing in as the slingshot builds.
    ctx.strokeStyle = `rgba(165, 243, 252, ${0.25 + race.slip * 0.5})`;
    ctx.lineWidth = 1.5;

    for (let line = 0; line < 6; line += 1) {
      const side = line % 2 === 0 ? -1 : 1;
      const along = (now / 260 + line / 6) % 1;
      const gap = 44 - race.slip * 16;
      ctx.beginPath();
      ctx.moveTo(x + side * gap, y - 40 + along * 60);
      ctx.lineTo(x + side * (gap - 4), y - 22 + along * 60);
      ctx.stroke();
    }
  }

  ctx.globalAlpha = race.ghost > 0 ? 0.5 : race.safe > 0 && race.spin === 0 ? 0.55 + 0.25 * Math.sin(now / 120) : 1;
  hull(ctx, {
    craft: 'jet',
    rgb: colors.rgb,
    core: colors.rgb,
    coreColor: colors.core,
    x,
    y: y + judder,
    scale: CRAFT_SCALE,
    bank,
    flame: race.burn > 0 ? 1.4 : 0.5 + rush * 0.6 + 0.08 * Math.sin(now / 40),
    glows,
  });

  if (race.ghost > 0) {
    ctx.strokeStyle = `rgba(${SUPER_STYLE.phantom.rgb}, ${0.5 + 0.3 * Math.sin(now / 90)})`;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.ellipse(x, y - 2, 42, 22, 0, 0, Math.PI * 2);
    ctx.stroke();
  }

  ctx.restore();
}

/**
 * @param {number} place
 * @returns {string} 1ST, 2ND, 3RD, 4TH
 */
export function ordinal(place) {
  return `${place}${place === 1 ? 'ST' : place === 2 ? 'ND' : place === 3 ? 'RD' : 'TH'}`;
}

/**
 * Over the race: the place, with the worst place that goes through; how far along the course
 * everyone is; and the speed. Before a race the course's name and the start lights; after it,
 * how it ended.
 *
 * @param {CanvasRenderingContext2D} ctx
 * @param {GameState} state
 * @param {GameConfig} config
 * @param {number} pop 1 right after a change of place, settling to 0
 */
export function drawWarpHud(ctx, state, config, pop) {
  const race = state.warp;
  const rules = config.warp;

  if (!race || !rules) {
    return;
  }

  const layout = rules.courses[race.race];
  const field = race.rivals.length + 1;
  const through = race.place <= layout.qualify;
  const placeRgb = race.place === 1 ? THEME.amber : through ? THEME.side.player.rgb : THEME.rose;

  ctx.save();

  // The place.
  ctx.textBaseline = 'alphabetic';
  ctx.textAlign = 'left';
  ctx.translate(18, 60);
  ctx.scale(1 + pop * 0.25, 1 + pop * 0.25);
  ctx.fillStyle = `rgb(${placeRgb})`;
  ctx.font = `900 40px ${FONT}`;
  ctx.fillText(`P${race.place}`, 0, 0);
  ctx.font = `800 14px ${FONT}`;
  ctx.fillStyle = `rgba(${THEME.text}, 0.8)`;
  // Two characters of the 40px figure, then the field.
  ctx.fillText(`/${field}`, PLACE_WIDTH, 0);
  ctx.restore();

  ctx.save();
  ctx.font = `800 10px ${FONT}`;
  ctx.textAlign = 'left';
  ctx.fillStyle = `rgba(${THEME.text}, 0.75)`;
  ctx.fillText(layout.qualify === 1 ? 'WIN TO GO THROUGH' : `TOP ${layout.qualify} GO THROUGH`, 18, 76);

  // The speed.
  const kmh = Math.round(race.speed * KMH);
  const boosting = race.speed > rules.topSpeed + 1;
  ctx.textAlign = 'right';
  ctx.font = `900 30px ${FONT}`;
  ctx.fillStyle = boosting ? `rgb(${THEME.amber})` : `rgba(${THEME.side.player.rgb}, 0.95)`;
  ctx.fillText(String(kmh), config.width - 18, 52);
  ctx.font = `800 10px ${FONT}`;
  ctx.fillStyle = `rgba(${THEME.text}, 0.75)`;
  ctx.fillText('KM/H', config.width - 18, 66);

  // How far along everyone is.
  const left = 120;
  const width = config.width - 240;
  const top = 34;
  /** @param {number} z */
  const along = (z) => left + clamp(z / race.course.length, 0, 1) * width;
  ctx.fillStyle = 'rgba(165, 180, 252, 0.18)';
  roundedRect(ctx, left, top - 2, width, 4, 2);
  ctx.fill();
  ctx.fillStyle = `rgba(${THEME.side.player.rgb}, 0.5)`;
  roundedRect(ctx, left, top - 2, Math.max(4, along(race.z) - left), 4, 2);
  ctx.fill();

  for (const rival of race.rivals) {
    ctx.fillStyle = `rgb(${layout.pilots[rival.pilot].rgb})`;
    ctx.beginPath();
    ctx.arc(along(rival.z), top, 3.5, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.fillStyle = THEME.side.player.core;
  ctx.beginPath();
  ctx.moveTo(along(race.z), top - 8);
  ctx.lineTo(along(race.z) + 5, top + 3);
  ctx.lineTo(along(race.z) - 5, top + 3);
  ctx.closePath();
  ctx.fill();

  ctx.font = `800 10px ${FONT}`;
  ctx.textAlign = 'center';
  ctx.fillStyle = `rgba(${THEME.text}, 0.8)`;
  ctx.fillText(`RACE ${race.race + 1}/${rules.courses.length} · ${layout.name.toUpperCase()}`, config.width / 2, top + 20);
  ctx.restore();

  if (state.serveCountdown > 0 && state.serveNumber === 0) {
    drawStartLights(ctx, state, config, layout.name, layout.qualify);
  } else if (race.finished && race.calm > 0) {
    drawRaceEnd(ctx, race, rules, config);
  }
}

/**
 * Before a race: its name, how well to place, and three lights that come on one a second.
 *
 * @param {CanvasRenderingContext2D} ctx
 * @param {GameState} state
 * @param {GameConfig} config
 * @param {string} name
 * @param {number} qualify
 */
function drawStartLights(ctx, state, config, name, qualify) {
  const lit = Math.min(3, Math.floor(config.startDelaySeconds - state.serveCountdown) + 1);
  const x = config.width / 2;
  const y = 150;

  ctx.save();
  ctx.textAlign = 'center';
  ctx.font = `900 30px ${FONT}`;
  ctx.fillStyle = 'rgba(248, 250, 252, 0.95)';
  ctx.fillText(name.toUpperCase(), x, y - 36);
  ctx.font = `800 12px ${FONT}`;
  ctx.fillStyle = `rgba(${THEME.amber}, 0.95)`;
  ctx.fillText(qualify === 1 ? 'WIN IT TO TAKE THE CUP' : `FINISH IN THE TOP ${qualify} TO GO THROUGH`, x, y - 16);

  ctx.fillStyle = 'rgba(5, 6, 15, 0.85)';
  roundedRect(ctx, x - 66, y, 132, 40, 10);
  ctx.fill();

  for (let light = 0; light < 3; light += 1) {
    const on = light < lit;
    ctx.fillStyle = on ? `rgb(${THEME.red})` : 'rgba(239, 68, 68, 0.15)';
    ctx.beginPath();
    ctx.arc(x - 40 + light * 40, y + 20, 13, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.restore();
}

/**
 * After the line: the place, the points it earned, and whether the player goes through.
 *
 * @param {CanvasRenderingContext2D} ctx
 * @param {WarpState} race
 * @param {WarpConfig} rules
 * @param {GameConfig} config
 */
function drawRaceEnd(ctx, race, rules, config) {
  const x = config.width / 2;
  const y = 170;
  const qualified = !race.retry;
  const next = rules.courses[race.race + 1];
  const rgb = race.place === 1 ? THEME.amber : qualified ? THEME.side.player.rgb : THEME.rose;

  ctx.save();
  ctx.fillStyle = 'rgba(5, 6, 15, 0.72)';
  roundedRect(ctx, x - 150, y - 62, 300, 118, 16);
  ctx.fill();
  ctx.strokeStyle = `rgba(${rgb}, 0.7)`;
  ctx.lineWidth = 1.5;
  ctx.stroke();
  ctx.textAlign = 'center';
  ctx.font = `900 46px ${FONT}`;
  ctx.fillStyle = `rgb(${rgb})`;
  ctx.fillText(ordinal(race.place), x, y - 10);
  ctx.font = `800 13px ${FONT}`;
  ctx.fillStyle = 'rgba(248, 250, 252, 0.9)';
  ctx.fillText(`+${rules.placePoints[race.place - 1] ?? 0} POINTS`, x, y + 14);
  ctx.font = `800 12px ${FONT}`;
  ctx.fillStyle = `rgba(${rgb}, 0.95)`;
  ctx.fillText(qualified ? (next ? `THROUGH · NEXT: ${next.name.toUpperCase()}` : 'CUP WON!') : 'NOT THROUGH · ONE MORE GO', x, y + 38);
  ctx.restore();
}
