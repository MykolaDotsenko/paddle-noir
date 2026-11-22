import { mixRgb, THEME } from './theme.js';
import { drawSkyLighting } from './warp-lighting.js';

/**
 * What surrounds a Warp course: the look of each of the five, its sky and what stands on its
 * horizon, what stands beside the lane or spans it, and the dust the craft flies through.
 * `canvas/warp.js` projects the course and paints the lane and what is on it; the painters here
 * are handed that frame as a scene. Nothing here is the pure white kept for the ball.
 *
 * @import { CourseTheme, GameConfig, WarpState } from '../../domain/types.js'
 * @import { GlowSprites } from './court.js'
 *
 * @typedef {object} Spot where something on the course is on the board
 * @property {number} x
 * @property {number} y the lane's surface under it, or the thing itself if it is lifted
 * @property {number} scale 1 where the player's craft is, smaller farther away
 * @property {number} depth meters ahead of the eye
 *
 * @typedef {(z: number, x: number, lift?: number) => Spot | null} Projector null for what is
 *   out of sight; `lift` raises the point above the lane, in widths of half the lane
 *
 * @typedef {object} View the course as the eye sees it this frame
 * @property {Projector} project
 * @property {number} eye where the eye is along the course
 * @property {number} far how far along the course is drawn
 * @property {number} heading which way the lane runs under the craft
 * @property {number} lean how far the camera leans into the bend, in radians
 * @property {{ x: number, y: number }} vanish where the lane runs out of sight
 * @property {number} craftY
 * @property {number} reach the lane's half width at the craft, in board units
 * @property {number} segment
 *
 * @typedef {object} Look how a course is painted
 * @property {readonly string[]} sky top to the horizon
 * @property {string} haze "r, g, b" of the glow on the horizon, and of the distance
 * @property {readonly string[] | null} ground "r, g, b" of the ground's two bands; null
 *   where the lane hangs in the air
 * @property {string} depths "r, g, b" of what lies under the horizon, where there is no ground
 * @property {string} grid "r, g, b" of the lines on the ground; empty for none
 * @property {readonly string[]} lane "r, g, b" of the lane's two bands
 * @property {string} edge "r, g, b" of the lane's edges
 * @property {string} stripe "r, g, b" of the rumble strips
 * @property {string} ring "r, g, b" of the rings
 * @property {'city' | 'mesas' | 'clouds' | 'planet' | 'core'} skyline
 * @property {string} skylineRgb
 * @property {'palms' | 'cliffs' | 'pylons' | 'station' | 'tunnel'} side what stands beside the lane
 * @property {string} dust "r, g, b" of what flies past
 * @property {boolean} stars
 *
 * @typedef {object} Palette a look's colors, ready to paint with
 * @property {readonly (readonly string[])[]} lane each band, from near to lost in the distance
 * @property {readonly (readonly string[])[] | null} ground
 * @property {string} edgeGlow
 * @property {string} edgeCore
 * @property {string} stripe
 * @property {string} dash
 * @property {string} grid
 * @property {string} skirt
 *
 * @typedef {object} Scene one frame of the race, as its painters need it
 * @property {CanvasRenderingContext2D} ctx
 * @property {Look} look
 * @property {Palette} palette
 * @property {View} view
 * @property {WarpState} race
 * @property {GameConfig} config
 * @property {number} now milliseconds
 * @property {GlowSprites} glows
 * @property {boolean} still whether motion is reduced
 *
 * @typedef {{ depth: number, draw: () => void }} Sprite something to paint, and how far it is
 */

/** Where the horizon is on the board. */
export const HORIZON = 272;
/** How far past the board's edges the sky and the ground are painted, for when the camera leans. */
export const PAD = 110;
/** Shades between a color near the eye and the same color lost in the distance. */
const FOG_STEPS = 8;
const NIGHT = '5, 6, 15';
export const CORE_LIGHT = '248, 250, 252';

/** @type {Readonly<Record<CourseTheme, Look>>} */
export const LOOKS = Object.freeze({
  sunset: Object.freeze({
    sky: ['#10052a', '#3b0f5c', '#9d2a6b', '#f9733d'],
    haze: '244, 114, 182',
    ground: ['30, 8, 44', '18, 5, 30'],
    depths: '',
    grid: '244, 114, 182',
    lane: ['16, 13, 44', '28, 23, 68'],
    edge: '34, 211, 238',
    stripe: '244, 114, 182',
    ring: '251, 191, 36',
    skyline: 'city',
    skylineRgb: '167, 139, 250',
    side: 'palms',
    dust: '253, 186, 116',
    stars: false,
  }),
  canyon: Object.freeze({
    sky: ['#020a10', '#05232b', '#0d4d4a', '#1f7a4d'],
    haze: '45, 212, 191',
    ground: ['9, 30, 24', '5, 18, 14'],
    depths: '',
    grid: '163, 230, 53',
    lane: ['12, 20, 30', '20, 34, 46'],
    edge: '251, 146, 60',
    stripe: '163, 230, 53',
    ring: '250, 204, 21',
    skyline: 'mesas',
    skylineRgb: '251, 146, 60',
    side: 'cliffs',
    dust: '190, 242, 100',
    stars: true,
  }),
  clouds: Object.freeze({
    sky: ['#0a1240', '#26338a', '#6b5bd6', '#e879f9'],
    haze: '232, 121, 249',
    ground: null,
    depths: '84, 56, 160',
    grid: '',
    lane: ['20, 22, 70', '34, 36, 100'],
    edge: '34, 211, 238',
    stripe: '232, 121, 249',
    ring: '250, 204, 21',
    skyline: 'clouds',
    skylineRgb: '216, 180, 254',
    side: 'pylons',
    dust: '224, 231, 255',
    stars: true,
  }),
  orbit: Object.freeze({
    sky: ['#020208', '#06061a', '#0f0c2e', '#1c1450'],
    haze: '129, 140, 248',
    ground: null,
    depths: '12, 10, 36',
    grid: '',
    lane: ['12, 12, 34', '22, 22, 56'],
    edge: '251, 191, 36',
    stripe: '167, 139, 250',
    ring: '34, 211, 238',
    skyline: 'planet',
    skylineRgb: '96, 165, 250',
    side: 'station',
    dust: '199, 210, 254',
    stars: true,
  }),
  tunnel: Object.freeze({
    sky: ['#060108', '#12030e', '#2a0616', '#4a0a1a'],
    haze: '239, 68, 68',
    ground: null,
    depths: '44, 8, 22',
    grid: '',
    lane: ['24, 8, 22', '38, 13, 32'],
    edge: '216, 180, 254',
    stripe: '239, 68, 68',
    ring: '251, 191, 36',
    skyline: 'core',
    skylineRgb: '239, 68, 68',
    side: 'tunnel',
    dust: '253, 164, 175',
    stars: false,
  }),
});

/**
 * A number from 0 to 1, always the same for the same two numbers, so nothing flickers.
 *
 * @param {number} a
 * @param {number} b
 */
export function hash(a, b) {
  let h = (Math.imul(a + 3, 2654435761) ^ Math.imul(b + 11, 2246822519)) >>> 0;
  h ^= h >>> 15;
  h = Math.imul(h, 2246822519) >>> 0;
  h ^= h >>> 13;
  return (h >>> 0) / 4294967296;
}

/** @type {WeakMap<Look, Palette>} */
const PALETTES = new WeakMap();

/**
 * A look's colors as strings, mixed once: the lane and the ground fade toward the haze with
 * distance, in a few steps.
 *
 * @param {Look} look
 * @returns {Palette}
 */
export function paletteOf(look) {
  const known = PALETTES.get(look);

  if (known) {
    return known;
  }

  const fog = mixRgb(look.haze, NIGHT, 0.7);
  /** @param {string} rgb */
  const shades = (rgb) => Array.from({ length: FOG_STEPS }, (_, level) => `rgb(${mixRgb(rgb, fog, (level / (FOG_STEPS - 1)) * 0.62)})`);
  const palette = {
    lane: look.lane.map(shades),
    ground: look.ground ? look.ground.map(shades) : null,
    edgeGlow: `rgba(${look.edge}, 0.2)`,
    edgeCore: `rgb(${look.edge})`,
    stripe: `rgba(${look.stripe}, 0.8)`,
    dash: `rgba(${look.edge}, 0.4)`,
    grid: look.grid ? `rgba(${look.grid}, 0.2)` : '',
    skirt: `rgb(${mixRgb(look.stripe, NIGHT, 0.78)})`,
  };

  PALETTES.set(look, palette);
  return palette;
}

/**
 * @param {number} depth meters ahead of the eye
 * @returns {number} which shade of the distance it takes, from 0 near to the last far off
 */
export function fogLevel(depth) {
  return Math.max(0, Math.min(FOG_STEPS - 1, Math.round((depth - 30) / 22)));
}

/**
 * The sky, down to the horizon and a little under it, and what stands on the horizon. It
 * slides sideways as the lane turns, the far things less than the near.
 *
 * @param {Scene} scene
 */
export function drawSky(scene) {
  const { ctx, look, view, config, now, still } = scene;
  const { width, height } = config;
  const sky = ctx.createLinearGradient(0, 0, 0, HORIZON);
  look.sky.forEach((color, index) => sky.addColorStop(index / (look.sky.length - 1), color));
  ctx.fillStyle = sky;
  ctx.fillRect(-PAD, -PAD, width + PAD * 2, HORIZON + PAD + 1);

  // Under the horizon: the ground's own color, or the depths the lane hangs over.
  const under = ctx.createLinearGradient(0, HORIZON, 0, height);
  under.addColorStop(0, `rgb(${look.ground ? mixRgb(look.ground[0], look.haze, 0.25) : look.depths})`);
  under.addColorStop(look.ground ? 0.5 : 0.7, look.ground ? `rgb(${look.ground[1]})` : `rgb(${NIGHT})`);
  under.addColorStop(1, `rgb(${NIGHT})`);
  ctx.fillStyle = under;
  ctx.fillRect(-PAD, HORIZON, width + PAD * 2, height - HORIZON + PAD);

  const slide = -view.heading * 70;
  const time = still ? 0 : now;

  if (look.stars) {
    for (let index = 0; index < 80; index += 1) {
      const x = ((((hash(index, 1) * width * 2 + slide * 0.3) % (width * 2)) + width * 2) % (width * 2)) - width / 2;
      // In orbit there is no ground to hide them: the stars are all round the lane.
      const y = hash(index, 2) * (look.skyline === 'planet' ? height : HORIZON - 24);
      const twinkle = 0.3 + 0.4 * hash(index, 3) + 0.2 * Math.sin(time / 600 + index);
      const size = index % 9 === 0 ? 2 : 1.2;
      ctx.fillStyle = `rgba(199, 210, 254, ${twinkle})`;
      ctx.fillRect(x, y, size, size);
    }
  }

  switch (look.skyline) {
    case 'city':
      drawSun(scene, time);
      drawRidge(scene, slide * 0.4, 74, 9, 0);
      drawCity(scene, slide * 0.7);
      drawRidge(scene, slide, 40, 13, 1);
      break;
    case 'mesas':
      drawMoon(scene, slide * 0.2);
      drawAurora(scene, time);
      drawMesas(scene, slide);
      break;
    case 'clouds':
      drawDaystar(scene, slide * 0.2, time);
      drawCloudBank(scene, slide * 0.4, 0, time);
      drawCloudBank(scene, slide * 0.8, 1, time);
      break;
    case 'planet':
      drawNebula(scene, slide * 0.15);
      drawPlanet(scene, slide * 0.4);
      break;
    case 'core':
    default:
      drawCore(scene, time);
  }

  // Atmospheric scatter sits behind the track, but over the distant skyline.
  drawSkyLighting(scene);

  // A glow along the horizon.
  const haze = ctx.createLinearGradient(0, HORIZON - 18, 0, HORIZON + 30);
  haze.addColorStop(0, `rgba(${look.haze}, 0)`);
  haze.addColorStop(0.4, `rgba(${look.haze}, 0.38)`);
  haze.addColorStop(1, `rgba(${look.haze}, 0)`);
  ctx.fillStyle = haze;
  ctx.fillRect(-PAD, HORIZON - 18, width + PAD * 2, 48);
}

/**
 * The sunset's sun, in bands, half sunk behind the horizon.
 *
 * @param {Scene} scene
 * @param {number} time
 */
function drawSun({ ctx, config }, time) {
  const x = config.width / 2;
  const radius = 118;
  const gradient = ctx.createLinearGradient(0, HORIZON - radius, 0, HORIZON);
  gradient.addColorStop(0, 'rgb(253, 224, 71)');
  gradient.addColorStop(0.55, 'rgb(251, 146, 60)');
  gradient.addColorStop(1, 'rgb(236, 72, 153)');

  ctx.save();
  ctx.beginPath();
  ctx.rect(-PAD, -PAD, config.width + PAD * 2, HORIZON + PAD);
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
  const drift = (time / 900) % 1;

  for (let band = 0; band < 7; band += 1) {
    ctx.fillRect(x - radius, HORIZON - radius * 0.62 + (band + drift) * 13, radius * 2, 1.5 + band * 0.9);
  }

  ctx.restore();
}

/**
 * A ridge of neon mountains along the horizon.
 *
 * @param {Scene} scene
 * @param {number} slide
 * @param {number} high
 * @param {number} peaks
 * @param {number} layer
 */
function drawRidge({ ctx, look, config }, slide, high, peaks, layer) {
  const span = config.width * 1.5;
  const step = span / peaks;
  const start = (((slide % span) + span) % span) - span - PAD;

  ctx.beginPath();
  ctx.moveTo(start, HORIZON);

  for (let index = 0; index <= peaks * 2 + 4; index += 1) {
    const peak = index % 2 === 0 ? 0.25 : 0.55 + 0.45 * hash(index % peaks, layer + 5);
    ctx.lineTo(start + index * step, HORIZON - high * peak);
  }

  ctx.lineTo(start + (peaks * 2 + 4) * step, HORIZON);
  ctx.closePath();
  ctx.fillStyle = layer === 0 ? 'rgba(22, 6, 40, 0.92)' : 'rgba(12, 4, 26, 0.96)';
  ctx.fill();
  ctx.strokeStyle = `rgba(${look.skylineRgb}, ${layer === 0 ? 0.45 : 0.85})`;
  ctx.lineWidth = layer === 0 ? 1 : 1.6;
  ctx.stroke();
}

/**
 * A far city between the ridges: dark towers with a few lit windows.
 *
 * @param {Scene} scene
 * @param {number} slide
 */
function drawCity({ ctx, config }, slide) {
  const span = config.width * 1.4;
  const start = (((slide % span) + span) % span) - span - PAD;

  for (let copy = 0; copy < 3; copy += 1) {
    for (let index = 0; index < 16; index += 1) {
      const left = start + copy * span + (index / 16) * span;
      const wide = 14 + hash(index, 41) * 22;
      const high = 14 + hash(index, 42) * 46;

      ctx.fillStyle = 'rgba(14, 5, 30, 0.97)';
      ctx.fillRect(left, HORIZON - high, wide, high);
      ctx.fillStyle = `rgba(${THEME.amber}, 0.75)`;

      for (let lit = 0; lit < 4; lit += 1) {
        if (hash(index * 7 + lit, 43) > 0.45) {
          ctx.fillRect(left + 3 + hash(index, lit + 44) * (wide - 7), HORIZON - high + 4 + hash(lit, index + 45) * (high - 10), 2, 2);
        }
      }
    }
  }
}

/**
 * A pale moon over the canyon.
 *
 * @param {Scene} scene
 * @param {number} slide
 */
function drawMoon({ ctx, config }, slide) {
  const x = config.width * 0.7 + slide;
  const y = 156;
  const glow = ctx.createRadialGradient(x, y, 4, x, y, 90);
  glow.addColorStop(0, 'rgba(204, 251, 241, 0.5)');
  glow.addColorStop(1, 'rgba(204, 251, 241, 0)');
  ctx.fillStyle = glow;
  ctx.fillRect(x - 90, y - 90, 180, 180);
  ctx.fillStyle = 'rgb(204, 251, 241)';
  ctx.beginPath();
  ctx.arc(x, y, 30, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = 'rgba(94, 234, 212, 0.35)';

  for (const [dx, dy, radius] of [[-9, -6, 7], [8, 9, 5], [10, -11, 3.5]]) {
    ctx.beginPath();
    ctx.arc(x + dx, y + dy, radius, 0, Math.PI * 2);
    ctx.fill();
  }
}

/**
 * Ribbons of an aurora, waving slowly over the canyon.
 *
 * @param {Scene} scene
 * @param {number} time
 */
function drawAurora({ ctx, config }, time) {
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';

  for (let ribbon = 0; ribbon < 3; ribbon += 1) {
    const top = 60 + ribbon * 38;
    const glow = ctx.createLinearGradient(0, top - 30, 0, top + 80);
    glow.addColorStop(0, 'rgba(45, 212, 191, 0)');
    glow.addColorStop(0.35, `rgba(${ribbon === 1 ? '163, 230, 53' : '45, 212, 191'}, 0.2)`);
    glow.addColorStop(1, 'rgba(45, 212, 191, 0)');
    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.moveTo(-PAD, top + 80);

    for (let x = -PAD; x <= config.width + PAD; x += 40) {
      ctx.lineTo(x, top + 18 * Math.sin(x / 90 + time / 2300 + ribbon * 2) + 10 * Math.sin(x / 37 + time / 1700));
    }

    ctx.lineTo(config.width + PAD, top + 80);
    ctx.closePath();
    ctx.fill();
  }

  ctx.restore();
}

/**
 * The canyon's mesas, flat-topped, standing up from the horizon.
 *
 * @param {Scene} scene
 * @param {number} slide
 */
function drawMesas({ ctx, look, config }, slide) {
  const span = config.width * 1.6;
  const start = (((slide % span) + span) % span) - span - PAD;

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
}

/**
 * A low sun above the clouds, with rays that turn slowly.
 *
 * @param {Scene} scene
 * @param {number} slide
 * @param {number} time
 */
function drawDaystar({ ctx, config }, slide, time) {
  const x = config.width * 0.32 + slide;
  const y = HORIZON - 64;

  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  ctx.fillStyle = 'rgba(253, 224, 71, 0.07)';

  for (let ray = 0; ray < 10; ray += 1) {
    const angle = (Math.PI * 2 * ray) / 10 + time / 9000;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + Math.cos(angle - 0.07) * 420, y + Math.sin(angle - 0.07) * 420);
    ctx.lineTo(x + Math.cos(angle + 0.07) * 420, y + Math.sin(angle + 0.07) * 420);
    ctx.closePath();
    ctx.fill();
  }

  const glow = ctx.createRadialGradient(x, y, 6, x, y, 110);
  glow.addColorStop(0, 'rgba(254, 240, 138, 0.95)');
  glow.addColorStop(0.25, 'rgba(253, 186, 116, 0.5)');
  glow.addColorStop(1, 'rgba(232, 121, 249, 0)');
  ctx.fillStyle = glow;
  ctx.fillRect(x - 110, y - 110, 220, 220);
  ctx.restore();
}

/**
 * A bank of cloud along the horizon, the skyway above it.
 *
 * @param {Scene} scene
 * @param {number} slide
 * @param {number} layer
 * @param {number} time
 */
function drawCloudBank({ ctx, look, config }, slide, layer, time) {
  const span = config.width * 1.4;
  const start = ((((slide + time * 0.004 * (layer + 1)) % span) + span) % span) - span - PAD;

  for (let copy = 0; copy < 3; copy += 1) {
    for (let index = 0; index < 8; index += 1) {
      const x = start + copy * span + hash(index, 31 + layer) * span;
      const radius = 22 + hash(index, 32 + layer) * 38 + layer * 8;
      ctx.fillStyle = `rgba(${look.skylineRgb}, ${0.14 + hash(index, 33) * 0.12 + layer * 0.08})`;
      ctx.beginPath();
      ctx.ellipse(x, HORIZON - radius * 0.15 + layer * 6, radius * 1.9, radius * 0.55, 0, 0, Math.PI * 2);
      ctx.fill();
    }
  }
}

/**
 * Clouds of a nebula, far behind everything in orbit.
 *
 * @param {Scene} scene
 * @param {number} slide
 */
function drawNebula({ ctx, config }, slide) {
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';

  for (const [share, y, radius, rgb] of /** @type {[number, number, number, string][]} */ ([[0.8, 70, 150, '167, 139, 250'], [0.15, 150, 120, '236, 72, 153'], [0.55, 210, 100, '34, 211, 238']])) {
    const x = config.width * share + slide;
    const cloud = ctx.createRadialGradient(x, y, 0, x, y, radius);
    cloud.addColorStop(0, `rgba(${rgb}, 0.2)`);
    cloud.addColorStop(1, `rgba(${rgb}, 0)`);
    ctx.fillStyle = cloud;
    ctx.fillRect(x - radius, y - radius, radius * 2, radius * 2);
  }

  ctx.restore();
}

/**
 * A ringed planet low over the horizon, and its moon.
 *
 * @param {Scene} scene
 * @param {number} slide
 */
function drawPlanet({ ctx, look, config }, slide) {
  const x = config.width * 0.3 + slide;
  const y = HORIZON - 78;
  const body = ctx.createRadialGradient(x - 24, y - 24, 6, x, y, 74);
  body.addColorStop(0, `rgb(${mixRgb(look.skylineRgb, CORE_LIGHT, 0.3)})`);
  body.addColorStop(0.7, `rgb(${look.skylineRgb})`);
  body.addColorStop(1, 'rgb(15, 23, 72)');

  ctx.save();
  ctx.strokeStyle = 'rgba(251, 191, 36, 0.55)';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.ellipse(x, y, 124, 22, -0.25, Math.PI, Math.PI * 2);
  ctx.stroke();
  ctx.fillStyle = body;
  ctx.beginPath();
  ctx.arc(x, y, 66, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.ellipse(x, y, 124, 22, -0.25, 0, Math.PI);
  ctx.stroke();
  ctx.strokeStyle = 'rgba(251, 191, 36, 0.25)';
  ctx.lineWidth = 7;
  ctx.beginPath();
  ctx.ellipse(x, y, 108, 17, -0.25, 0, Math.PI);
  ctx.stroke();
  ctx.fillStyle = 'rgba(216, 180, 254, 0.85)';
  ctx.beginPath();
  ctx.arc(x + 200, y - 96, 12, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

/**
 * The warp core, where the tunnel runs out of sight: rings of light pulsing out of it.
 *
 * @param {Scene} scene
 * @param {number} time
 */
function drawCore({ ctx, look, view }, time) {
  const { x, y } = view.vanish;

  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  const glow = ctx.createRadialGradient(x, y, 0, x, y, 150);
  glow.addColorStop(0, 'rgba(254, 240, 138, 0.9)');
  glow.addColorStop(0.2, 'rgba(251, 146, 60, 0.55)');
  glow.addColorStop(1, 'rgba(239, 68, 68, 0)');
  ctx.fillStyle = glow;
  ctx.fillRect(x - 150, y - 150, 300, 300);
  ctx.lineWidth = 2;

  for (let ring = 0; ring < 5; ring += 1) {
    const grow = (time / 1500 + ring / 5) % 1;
    ctx.strokeStyle = `rgba(${look.skylineRgb}, ${0.45 * (1 - grow)})`;
    ctx.beginPath();
    ctx.arc(x, y, 10 + grow * 170, 0, Math.PI * 2);
    ctx.stroke();
  }

  ctx.restore();
}

/** Meters between one thing beside the lane and the next, for each kind of side. */
const SIDE_EVERY = Object.freeze({ palms: 18, cliffs: 12, pylons: 20, station: 30, tunnel: 12 });

/**
 * What stands beside the lane, or spans it, as far as the lane is drawn: palms, signs and
 * towers at sunset, the canyon's walls and arches, pylons and clouds, the ribs and masts of a
 * station in orbit, and the tunnel of the warp core.
 *
 * @param {Scene} scene
 * @returns {Sprite[]}
 */
export function roadside(scene) {
  const { look, view } = scene;
  const every = SIDE_EVERY[look.side];
  /** @type {Sprite[]} */
  const sprites = [];
  /**
   * @param {number} z
   * @param {number} x
   * @param {number} lift
   * @param {(spot: Spot, unit: number) => void} paint
   */
  const stand = (z, x, lift, paint) => {
    const spot = view.project(z, x, lift);

    if (spot) {
      sprites.push({ depth: spot.depth, draw: () => paint(spot, view.reach * spot.scale) });
    }
  };

  for (let index = Math.ceil(view.eye / every); index * every <= view.far; index += 1) {
    const z = index * every;
    const side = index % 2 === 0 ? -1 : 1;

    switch (look.side) {
      case 'palms':
        if (index % 6 === 3) {
          stand(z, side * 2.05, 0, (spot, unit) => drawSign(scene, spot, unit, index));
        } else {
          stand(z, side * (1.45 + hash(index, 60) * 0.5), 0, (spot, unit) => drawPalm(scene, spot, unit, side));
        }

        if (index % 3 === 0) {
          stand(z + 7, -side * (3.4 + hash(index, 61) * 2.6), 0, (spot, unit) => drawTower(scene, spot, unit, index));
        }
        break;
      case 'cliffs':
        stand(z, -(1.32 + hash(index, 62) * 0.4), 0, (spot, unit) => drawCliff(scene, spot, unit, index, -1));
        stand(z, 1.32 + hash(index, 63) * 0.4, 0, (spot, unit) => drawCliff(scene, spot, unit, index + 500, 1));

        if (index % 14 === 7) {
          stand(z, 0, 0, (spot, unit) => drawSpan(scene, spot, unit, look.skylineRgb, 1.55, 1.5, true));
        }
        break;
      case 'pylons':
        stand(z, side * (1.6 + hash(index, 64) * 1.8), -0.15 + hash(index, 65) * 0.3, (spot, unit) => drawPuff(scene, spot, unit, index));
        stand(z + 6, -side * (3.5 + hash(index, 66) * 3), -1.2, (spot, unit) => drawPuff(scene, spot, unit * 1.6, index + 300));

        if (index % 3 === 0) {
          stand(z, side * 1.24, 0, (spot, unit) => drawPylon(scene, spot, unit, index));
        }
        break;
      case 'station':
        if (index % 2 === 0) {
          stand(z, 0, 0, (spot, unit) => drawSpan(scene, spot, unit, look.edge, 1.5, 1.7, false));
        } else {
          stand(z, side * 1.5, 0, (spot, unit) => drawMast(scene, spot, unit, side, index));
        }

        stand(z + 11, -side * (3 + hash(index, 67) * 4), 0.4 + hash(index, 68) * 2.2, (spot, unit) => drawRock(scene, spot, unit, index));
        break;
      case 'tunnel':
      default:
        stand(z, 0, 0, (spot) => drawTunnelRing(scene, z, every, index, spot));
    }
  }

  return sprites;
}

/**
 * @param {number} scale
 * @returns {number} how much of itself something that far away shows
 */
function fade(scale) {
  return Math.min(1, scale * 4.5);
}

/**
 * A neon palm, leaning away from the lane.
 *
 * @param {Scene} scene
 * @param {Spot} spot
 * @param {number} unit
 * @param {number} side
 */
function drawPalm({ ctx, look }, { x, y, scale }, unit, side) {
  const high = unit * 0.95;
  const lean = side * unit * 0.12;

  ctx.save();
  ctx.globalAlpha = fade(scale);
  ctx.lineCap = 'round';
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
    const reach = unit * 0.34;
    ctx.beginPath();
    ctx.moveTo(x + lean, y - high);
    ctx.quadraticCurveTo(x + lean + Math.cos(angle) * reach * 0.6, y - high + Math.sin(angle) * reach * 0.6 - reach * 0.15, x + lean + Math.cos(angle) * reach, y - high + Math.sin(angle) * reach * 0.3 + reach * 0.35);
    ctx.stroke();
  }

  ctx.restore();
}

/** What the signs along the skyway show: shapes, never words. */
const SIGNS = Object.freeze(['▶', '♪', '★', '◆', '∞']);

/**
 * A neon sign on two posts.
 *
 * @param {Scene} scene
 * @param {Spot} spot
 * @param {number} unit
 * @param {number} index
 */
function drawSign({ ctx, look, now, still }, { x, y, scale }, unit, index) {
  const wide = unit * 0.62;
  const high = unit * 0.36;
  const top = y - unit * 0.95;
  const rgb = index % 2 === 0 ? look.ring : look.stripe;
  const lit = still || Math.sin(now / 300 + index) > -0.7;

  ctx.save();
  ctx.globalAlpha = fade(scale);
  ctx.strokeStyle = 'rgba(148, 163, 184, 0.7)';
  ctx.lineWidth = Math.max(1, 2.5 * scale);
  ctx.beginPath();
  ctx.moveTo(x - wide * 0.35, y);
  ctx.lineTo(x - wide * 0.35, top + high);
  ctx.moveTo(x + wide * 0.35, y);
  ctx.lineTo(x + wide * 0.35, top + high);
  ctx.stroke();
  ctx.fillStyle = 'rgba(10, 6, 28, 0.92)';
  ctx.fillRect(x - wide / 2, top, wide, high);
  ctx.strokeStyle = `rgba(${rgb}, ${lit ? 0.95 : 0.3})`;
  ctx.lineWidth = Math.max(1, 3 * scale);
  ctx.strokeRect(x - wide / 2, top, wide, high);

  if (scale > 0.12) {
    ctx.fillStyle = `rgba(${rgb}, ${lit ? 0.95 : 0.3})`;
    ctx.font = `900 ${Math.round(high * 0.7)}px system-ui, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(SIGNS[index % SIGNS.length], x, top + high / 2);
  }

  ctx.restore();
}

/**
 * A tower of the city the skyway crosses, off to the side, with lit windows.
 *
 * @param {Scene} scene
 * @param {Spot} spot
 * @param {number} unit
 * @param {number} index
 */
function drawTower({ ctx, look }, { x, y, scale }, unit, index) {
  const wide = unit * (0.7 + hash(index, 71) * 0.7);
  const high = unit * (1.6 + hash(index, 72) * 2.6);

  ctx.save();
  ctx.globalAlpha = fade(scale);
  ctx.fillStyle = 'rgba(16, 6, 34, 0.96)';
  ctx.fillRect(x - wide / 2, y - high, wide, high);
  ctx.strokeStyle = `rgba(${look.skylineRgb}, 0.6)`;
  ctx.lineWidth = Math.max(1, 1.6 * scale);
  ctx.strokeRect(x - wide / 2, y - high, wide, high);
  ctx.fillStyle = `rgba(${index % 3 === 0 ? look.edge : THEME.amber}, 0.8)`;

  for (let row = 0; row < 6; row += 1) {
    for (let column = 0; column < 3; column += 1) {
      if (hash(index * 31 + row, column + 73) > 0.4) {
        ctx.fillRect(x - wide * 0.34 + column * wide * 0.27, y - high * (0.92 - row * 0.15), wide * 0.14, high * 0.05);
      }
    }
  }

  ctx.restore();
}

/**
 * A piece of the canyon's wall: a tall rock with a lit edge.
 *
 * @param {Scene} scene
 * @param {Spot} spot
 * @param {number} unit
 * @param {number} index
 * @param {number} side
 */
function drawCliff({ ctx, look }, { x, y, scale }, unit, index, side) {
  const wide = unit * (0.5 + hash(index, 74) * 0.4);
  const high = unit * (1.2 + hash(index, 75) * 1.7);
  const out = side * wide;

  ctx.save();
  ctx.globalAlpha = fade(scale);
  ctx.beginPath();
  ctx.moveTo(x - out * 0.2, y);
  ctx.lineTo(x, y - high * (0.55 + hash(index, 76) * 0.2));
  ctx.lineTo(x + out * 0.3, y - high);
  ctx.lineTo(x + out * 0.9, y - high * (0.8 + hash(index, 77) * 0.15));
  ctx.lineTo(x + out * 1.5, y);
  ctx.closePath();
  ctx.fillStyle = 'rgba(5, 22, 18, 0.97)';
  ctx.fill();
  ctx.strokeStyle = `rgba(${look.skylineRgb}, 0.75)`;
  ctx.lineWidth = Math.max(1, 2 * scale);
  ctx.stroke();
  // A seam of light down its face.
  ctx.strokeStyle = `rgba(${look.stripe}, 0.35)`;
  ctx.beginPath();
  ctx.moveTo(x + out * 0.3, y - high);
  ctx.lineTo(x + out * 0.45, y - high * 0.4);
  ctx.lineTo(x + out * 0.35, y);
  ctx.stroke();
  ctx.restore();
}

/**
 * Something that spans the lane: an arch of rock in the canyon, a rib of the station in orbit.
 *
 * @param {Scene} scene
 * @param {Spot} spot
 * @param {number} unit
 * @param {string} rgb
 * @param {number} half how far to either side it stands, in half lanes
 * @param {number} high
 * @param {boolean} solid whether it is rock, with a body, or a beam of light
 */
function drawSpan({ ctx }, { x, y, scale }, unit, rgb, half, high, solid) {
  const wide = unit * half;
  const top = y - unit * high;

  ctx.save();
  ctx.globalAlpha = fade(scale);
  ctx.lineJoin = 'round';

  if (solid) {
    ctx.strokeStyle = 'rgba(5, 22, 18, 0.97)';
    ctx.lineWidth = Math.max(3, 26 * scale);
    spanPath(ctx, x, y, wide, top);
    ctx.stroke();
  } else {
    ctx.globalCompositeOperation = 'lighter';
    ctx.strokeStyle = `rgba(${rgb}, 0.25)`;
    ctx.lineWidth = Math.max(2, 10 * scale);
    spanPath(ctx, x, y, wide, top);
    ctx.stroke();
  }

  ctx.strokeStyle = `rgba(${rgb}, 0.9)`;
  ctx.lineWidth = Math.max(1, 2.4 * scale);
  spanPath(ctx, x, y, wide, top);
  ctx.stroke();
  ctx.restore();
}

/**
 * @param {CanvasRenderingContext2D} ctx
 * @param {number} x
 * @param {number} y
 * @param {number} wide
 * @param {number} top
 */
function spanPath(ctx, x, y, wide, top) {
  ctx.beginPath();
  ctx.moveTo(x - wide, y);
  ctx.lineTo(x - wide, top + (y - top) * 0.45);
  ctx.quadraticCurveTo(x - wide, top, x, top);
  ctx.quadraticCurveTo(x + wide, top, x + wide, top + (y - top) * 0.45);
  ctx.lineTo(x + wide, y);
}

/**
 * A puff of cloud.
 *
 * @param {Scene} scene
 * @param {Spot} spot
 * @param {number} unit
 * @param {number} index
 */
function drawPuff({ ctx, look }, { x, y, scale }, unit, index) {
  ctx.save();
  ctx.globalAlpha = fade(scale) * (0.22 + hash(index, 78) * 0.16);
  ctx.fillStyle = `rgb(${look.skylineRgb})`;

  for (let lobe = 0; lobe < 3; lobe += 1) {
    ctx.beginPath();
    ctx.ellipse(x + (lobe - 1) * unit * 0.3, y - (lobe === 1 ? unit * 0.12 : 0), unit * (0.42 + hash(index, lobe + 79) * 0.2), unit * 0.2, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.restore();
}

/**
 * A pylon that holds the skyway up, with a beacon that blinks.
 *
 * @param {Scene} scene
 * @param {Spot} spot
 * @param {number} unit
 * @param {number} index
 */
function drawPylon({ ctx, look, now, still }, { x, y, scale }, unit, index) {
  const blink = still ? 0.8 : 0.35 + 0.65 * Math.max(0, Math.sin(now / 260 + index));

  ctx.save();
  ctx.globalAlpha = fade(scale);
  ctx.strokeStyle = `rgba(${look.stripe}, 0.6)`;
  ctx.lineWidth = Math.max(1, 3.5 * scale);
  ctx.beginPath();
  ctx.moveTo(x, y + unit * 1.6);
  ctx.lineTo(x, y - unit * 0.55);
  ctx.stroke();
  ctx.globalCompositeOperation = 'lighter';
  ctx.fillStyle = `rgba(${look.edge}, ${blink})`;
  ctx.beginPath();
  ctx.arc(x, y - unit * 0.55, Math.max(1.5, 7 * scale), 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

/**
 * A mast of the station, with a solar panel out to its side.
 *
 * @param {Scene} scene
 * @param {Spot} spot
 * @param {number} unit
 * @param {number} side
 * @param {number} index
 */
function drawMast({ ctx, look, now, still }, { x, y, scale }, unit, side, index) {
  const high = unit * 1.25;
  const blink = still ? 0.8 : 0.35 + 0.65 * Math.max(0, Math.sin(now / 320 + index));

  ctx.save();
  ctx.globalAlpha = fade(scale);
  ctx.strokeStyle = `rgba(${look.edge}, 0.7)`;
  ctx.lineWidth = Math.max(1, 2.6 * scale);
  ctx.beginPath();
  ctx.moveTo(x, y + unit * 0.5);
  ctx.lineTo(x, y - high);

  // Braces up the mast.
  for (let brace = 0; brace < 4; brace += 1) {
    ctx.moveTo(x - unit * 0.07, y - high * (brace / 4));
    ctx.lineTo(x + unit * 0.07, y - high * ((brace + 1) / 4));
  }

  ctx.stroke();
  ctx.fillStyle = 'rgba(30, 27, 75, 0.9)';
  ctx.strokeStyle = `rgba(${look.stripe}, 0.85)`;
  ctx.beginPath();
  ctx.rect(x + side * unit * 0.1, y - high * 0.86, side * unit * 0.6, high * 0.26);
  ctx.fill();
  ctx.stroke();
  ctx.beginPath();

  for (let cell = 1; cell < 4; cell += 1) {
    ctx.moveTo(x + side * unit * (0.1 + cell * 0.15), y - high * 0.86);
    ctx.lineTo(x + side * unit * (0.1 + cell * 0.15), y - high * 0.6);
  }

  ctx.stroke();
  ctx.globalCompositeOperation = 'lighter';
  ctx.fillStyle = `rgba(${THEME.red}, ${blink})`;
  ctx.beginPath();
  ctx.arc(x, y - high, Math.max(1.5, 5 * scale), 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

/**
 * A rock adrift beside the station, turning slowly.
 *
 * @param {Scene} scene
 * @param {Spot} spot
 * @param {number} unit
 * @param {number} index
 */
function drawRock({ ctx, now, still }, { x, y, scale }, unit, index) {
  const radius = unit * (0.2 + hash(index, 84) * 0.3);
  const turn = (still ? 0 : now / 2600) + index;

  ctx.save();
  ctx.globalAlpha = fade(scale);
  ctx.beginPath();

  for (let corner = 0; corner < 8; corner += 1) {
    const angle = (Math.PI * 2 * corner) / 8 + turn;
    const reach = radius * (0.7 + 0.35 * hash(index, corner + 85));
    const px = x + Math.cos(angle) * reach;
    const py = y + Math.sin(angle) * reach * 0.85;

    if (corner === 0) {
      ctx.moveTo(px, py);
    } else {
      ctx.lineTo(px, py);
    }
  }

  ctx.closePath();
  ctx.fillStyle = 'rgba(17, 16, 40, 0.95)';
  ctx.fill();
  ctx.strokeStyle = 'rgba(165, 180, 252, 0.6)';
  ctx.lineWidth = Math.max(1, 1.6 * scale);
  ctx.stroke();
  ctx.restore();
}

/** The tunnel's rings: six-sided, this wide and with their middle this high over the lane. */
const TUNNEL_RADIUS = 1.9;
const TUNNEL_LIFT = 0.8;

/**
 * A ring of the warp core's tunnel around the lane, and the beams that run from it to the
 * next one, so the rings read as one tunnel. Every few rings one burns brighter, and the
 * light runs down the tunnel toward the craft.
 *
 * @param {Scene} scene
 * @param {number} z
 * @param {number} every meters to the next ring
 * @param {number} index
 * @param {Spot} at the ring's foot on the lane
 */
function drawTunnelRing({ ctx, look, view, now, still }, z, every, index, at) {
  /** @param {number} along */
  const corners = (along) => Array.from({ length: 6 }, (_, corner) => {
    const angle = (Math.PI / 3) * corner + Math.PI / 6;
    return view.project(along, Math.cos(angle) * TUNNEL_RADIUS, TUNNEL_LIFT + Math.sin(angle) * TUNNEL_RADIUS);
  });
  const ring = corners(z);
  const next = corners(z + every);
  const pulse = still ? 0 : Math.floor(now / 90);
  const bright = (index + pulse) % 6 === 0;

  if (ring.some((corner) => corner === null)) {
    return;
  }

  ctx.save();
  ctx.globalAlpha = fade(at.scale);
  ctx.globalCompositeOperation = 'lighter';
  ctx.lineJoin = 'round';

  // The beams along the tunnel.
  if (next.every((corner) => corner !== null)) {
    ctx.strokeStyle = `rgba(${look.stripe}, 0.28)`;
    ctx.lineWidth = Math.max(1, 1.5 * at.scale);
    ctx.beginPath();
    ring.forEach((corner, which) => {
      ctx.moveTo(/** @type {Spot} */ (corner).x, /** @type {Spot} */ (corner).y);
      ctx.lineTo(/** @type {Spot} */ (next[which]).x, /** @type {Spot} */ (next[which]).y);
    });
    ctx.stroke();
  }

  for (const [width, alpha] of bright ? [[9, 0.3], [2.6, 1]] : [[5, 0.14], [1.8, 0.6]]) {
    ctx.strokeStyle = `rgba(${bright ? look.ring : look.edge}, ${alpha})`;
    ctx.lineWidth = Math.max(1, width * at.scale);
    ctx.beginPath();
    ring.forEach((corner, which) => {
      const { x, y } = /** @type {Spot} */ (corner);

      if (which === 0) {
        ctx.moveTo(x, y);
      } else {
        ctx.lineTo(x, y);
      }
    });
    ctx.closePath();
    ctx.stroke();
  }

  ctx.restore();
}

/** What flies past: this many motes, in a box this long that the craft flies through again and again. */
const MOTES = 44;
const MOTE_SPAN = 150;

/**
 * Dust, sparks or stars streaming past the craft, nearer ones faster and longer, so the
 * course has air in it. They are where the distance flown puts them, so they stop with the
 * race, and the same frame is the same picture.
 *
 * @param {Scene} scene
 */
export function drawDust({ ctx, look, view, race }) {
  ctx.save();
  ctx.lineCap = 'round';
  ctx.globalCompositeOperation = 'lighter';

  for (let mote = 0; mote < MOTES; mote += 1) {
    const z = view.eye + 1 + ((((hash(mote, 91) * MOTE_SPAN - race.z) % MOTE_SPAN) + MOTE_SPAN) % MOTE_SPAN);
    const x = (hash(mote, 92) - 0.5) * 9;
    const lift = 0.15 + hash(mote, 93) * 3;
    const head = view.project(z, x, lift);
    const tail = view.project(z + 0.4 + race.speed * 0.03, x, lift);

    // A mote right at the eye would be a bar across the board: it is let go by unseen.
    if (head && tail && head.scale < 1.4) {
      ctx.strokeStyle = `rgba(${look.dust}, ${Math.min(0.6, head.scale * 1.6)})`;
      ctx.lineWidth = Math.max(1, 1.5 * head.scale);
      ctx.beginPath();
      ctx.moveTo(head.x, head.y);
      ctx.lineTo(tail.x, tail.y);
      ctx.stroke();
    }
  }

  ctx.restore();
}
