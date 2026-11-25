/**
 * Atmospheric lighting and fast, depth-aware highlights for Warp.
 *
 * These are deliberately Canvas 2D passes, not simulated physics or a WebGL dependency.
 * They use a handful of gradients for the whole scene, while the road's tiny specular
 * facets are polygons. Near-only details keep the full-width mobile renderer inexpensive.
 *
 * @import { Look, Scene } from './warp-scenery.js'
 */

import { mixRgb } from './theme.js';

/** @typedef {{ x: number, y: number, scale: number, depth: number }} Point */
/** @typedef {{ left: Point, right: Point, stretch: number }} RoadRow */

/** @param {number} value @param {number} minimum @param {number} maximum */
const clamp = (value, minimum, maximum) => Math.min(maximum, Math.max(minimum, value));

/**
 * How far either way a course's light slides as the lane turns; past that it stays put. No
 * bend of the five courses slides it that far.
 */
export const LIGHT_SWAY = 80;

/** The light reaches down to here, a little under the horizon, and no further. */
export const LIGHT_FLOOR = 310;

/**
 * Each course has a different light source: a sunset, canyon aurora, sun above clouds,
 * reflected planetary glow or the pulsing core. Where it sits when the lane runs straight,
 * how wide and strong it is, and how far it slides for each unit of the lane's heading.
 *
 * @param {Look} look
 * @param {number} width
 */
function skyLight(look, width) {
  const city = look.skyline === 'city';
  return {
    x: width * (city ? 0.72 : look.skyline === 'planet' ? 0.27 : 0.52),
    y: city ? 232 : look.skyline === 'clouds' ? 133 : look.skyline === 'core' ? 257 : 177,
    spread: city ? width * 0.57 : width * 0.43,
    rgb: look.skyline === 'clouds' ? '216, 180, 254' : look.haze,
    power: city ? 0.26 : look.skyline === 'core' ? 0.2 : 0.16,
    slide: city ? 30 : 14,
  };
}

/**
 * How far the light has slid from where it sits on a straight.
 *
 * @param {Look} look
 * @param {number} heading which way the lane runs under the craft
 */
export function lightShift(look, heading) {
  return clamp(0 - heading * skyLight(look, 0).slide, -LIGHT_SWAY, LIGHT_SWAY);
}

/**
 * The light's glow, where it sits on a straight. It is painted once into the sky's own kept
 * picture, behind the skyline, which slides it as the lane turns: a glow over the whole sky,
 * shaded anew each frame, cost a phone more than anything else that was added to the races.
 *
 * @param {CanvasRenderingContext2D} ctx
 * @param {Look} look
 * @param {number} width
 * @param {number} left the left edge of the picture
 * @param {number} right its right edge
 */
export function paintSkyLight(ctx, look, width, left, right) {
  const { x, y, spread, rgb, power } = skyLight(look, width);
  const glow = ctx.createRadialGradient(x, y, 8, x, y, spread);
  glow.addColorStop(0, 'rgba(' + rgb + ', ' + power + ')');
  glow.addColorStop(0.42, 'rgba(' + rgb + ', ' + (power * 0.32) + ')');
  glow.addColorStop(1, 'rgba(' + rgb + ', 0)');
  ctx.fillStyle = glow;
  ctx.fillRect(left, -50, right - left, LIGHT_FLOOR + 50);
}

/**
 * A few soft, wide shafts from the light, cheaper and cleaner than a full-screen per-pixel
 * bloom. They sway a little with time, never in reduced-motion mode, and stay behind track
 * geometry, so hills, rivals and trackside buildings correctly occlude them.
 *
 * @param {Scene} scene
 */
export function drawSkyLighting({ ctx, config, view, look, still, now }) {
  const { width } = config;
  const { x, y, rgb } = skyLight(look, width);
  const sourceX = x + lightShift(look, view.heading);
  const phase = still ? 0 : Math.sin(now / 3600) * 0.035;

  ctx.save();
  for (let index = 0; index < 4; index += 1) {
    const angle = (index - 1.5) * 0.29 + phase;
    const drift = Math.sin(angle) * width * 0.68;
    ctx.beginPath();
    ctx.moveTo(sourceX - 7, y);
    ctx.lineTo(sourceX + drift - width * 0.065, -60);
    ctx.lineTo(sourceX + drift + width * 0.065, -60);
    ctx.closePath();
    ctx.fillStyle = 'rgba(' + rgb + ', ' + (0.016 + index * 0.003) + ')';
    ctx.fill();
  }
  ctx.restore();
}

/** @param {RoadRow} row @param {number} share */
const along = (row, share) => ({
  x: row.left.x + (row.right.x - row.left.x) * share,
  y: row.left.y,
});

/**
 * @param {CanvasRenderingContext2D} ctx
 * @param {RoadRow} near
 * @param {RoadRow} far
 * @param {number} from
 * @param {number} to
 * @param {string} color
 */
function roadFacet(ctx, near, far, from, to, color) {
  const a = along(near, from);
  const b = along(near, to);
  const c = along(far, to);
  const d = along(far, from);
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
 * A reflective racing surface with a restrained central racing-line sheen, broken
 * edge-light reflections, and seams. The subtle highlights follow course coordinates
 * rather than frame time, so they don't sparkle randomly and stay still under pause.
 *
 * @param {Scene} scene
 * @param {RoadRow} near
 * @param {RoadRow} far
 */
export function drawTrackLighting({ ctx, look, race }, near, far) {
  if (near.left.scale < 0.12 || far.left.y >= near.left.y) {
    return;
  }

  const close = clamp((near.left.scale - 0.12) * 2.6, 0, 1);
  const seam = near.stretch % 4 === 0;
  const shimmer = ((near.stretch % 7) + 7) % 7;
  const tint = look.edge;

  // Two restrained, uneven glossy ribbons: not permanent glowing road stripes.
  // Their separation makes the projected surface read as a sloped, hard material.
  if (near.stretch % 2 === 0) {
    roadFacet(ctx, near, far, 0.16, 0.205, 'rgba(' + tint + ', ' + (0.025 + close * 0.05) + ')');
    roadFacet(ctx, near, far, 0.795, 0.84, 'rgba(' + look.haze + ', ' + (0.025 + close * 0.044) + ')');
  }

  if (close > 0.14 && shimmer === 0) {
    roadFacet(ctx, near, far, 0.25, 0.75, 'rgba(' + look.haze + ', ' + (close * 0.068) + ')');
  }

  // Every fourth near segment has a tiny metallic expansion joint, fading into the haze.
  if (seam && near.left.scale > 0.29) {
    const left = along(near, 0.085);
    const right = along(near, 0.915);
    ctx.strokeStyle = 'rgba(' + look.haze + ', ' + (0.1 + close * 0.17) + ')';
    ctx.lineWidth = clamp(near.left.scale * 0.65, 0.6, 1.8);
    ctx.beginPath();
    ctx.moveTo(left.x, left.y);
    ctx.lineTo(right.x, right.y);
    ctx.stroke();
  }

  // A little polished surface reflection appears beneath the nearest moving craft.
  if (near.stretch % 3 === 0 && near.left.depth < 45 && race.speed > 0) {
    roadFacet(ctx, near, far, 0.475, 0.525, 'rgba(' + tint + ', ' + (0.025 + close * 0.042) + ')');
  }
}

/**
 * Air compresses into paired streaks just outside the engine exhaust. This adds
 * motion parallax without touching racing physics or duplicating bloom sprites.
 *
 * @param {CanvasRenderingContext2D} ctx
 * @param {{ x: number, y: number, glow: string, speed: number, boost: boolean, now: number, still: boolean }} flight
 */
export function drawEngineWake(ctx, { x, y, glow, speed, boost, now, still }) {
  if (still || speed <= 0) {
    return;
  }

  const intensity = clamp(speed / 75, 0.15, 1);
  const reach = boost ? 82 : 43 + intensity * 18;
  const drift = Math.sin(now / 250) * 2.3;
  ctx.save();
  ctx.lineCap = 'round';

  for (const side of [-1, 1]) {
    const startX = x + side * 27;
    const tailX = x + side * (39 + intensity * 9) + drift;
    const haze = ctx.createLinearGradient(startX, y + 4, tailX, y + reach);
    haze.addColorStop(0, 'rgba(' + glow + ', ' + (boost ? 0.55 : 0.27) + ')');
    haze.addColorStop(0.52, 'rgba(' + glow + ', ' + (boost ? 0.22 : 0.08) + ')');
    haze.addColorStop(1, 'rgba(' + glow + ', 0)');
    ctx.strokeStyle = haze;
    ctx.lineWidth = boost ? 5 : 2.6;
    ctx.beginPath();
    ctx.moveTo(startX, y + 4);
    ctx.quadraticCurveTo(x + side * 33, y + reach * 0.48, tailX, y + reach);
    ctx.stroke();
  }
  ctx.restore();
}

/**
 * During jumps, the craft casts a tapered engine-lit cone toward its ground shadow.
 * The cone is visible only when there is meaningful clearance and is omitted when
 * the craft is grounded, avoiding a distracting permanent spotlight.
 *
 * @param {CanvasRenderingContext2D} ctx
 * @param {{ x: number, y: number, groundY: number, glow: string }} flight
 */
export function drawJumpLighting(ctx, { x, y, groundY, glow }) {
  const height = groundY - y;

  if (height < 24) {
    return;
  }

  const spread = clamp(height * 0.45, 10, 32);
  const cone = ctx.createLinearGradient(x, y + 5, x, groundY);
  cone.addColorStop(0, 'rgba(' + glow + ', 0.16)');
  cone.addColorStop(1, 'rgba(' + glow + ', 0)');
  ctx.save();
  ctx.fillStyle = cone;
  ctx.beginPath();
  ctx.moveTo(x - 12, y + 12);
  ctx.lineTo(x + 12, y + 12);
  ctx.lineTo(x + spread, groundY);
  ctx.lineTo(x - spread, groundY);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}


/**
 * Cached edge-weighted color grade and vignette, applied before HUD.
 * @param {Scene} scene
 */
export function drawCinematicGrade({ ctx, look, config, glows, race, still }) {
  const { width, height } = config;
  const key = (look.biome ?? look.skyline) + ' ' + width + ' ' + height;
  const grade = glows.layer('warp-cinematic-grade', key, width, height, (layer) => {
    const vignette = layer.createRadialGradient(width / 2, height * 0.53, height * 0.26, width / 2, height * 0.53, height * 0.78);
    vignette.addColorStop(0, 'rgba(5, 9, 17, 0)');
    vignette.addColorStop(0.65, 'rgba(5, 9, 17, 0.035)');
    vignette.addColorStop(1, 'rgba(5, 9, 17, 0.24)');
    layer.fillStyle = vignette;
    layer.fillRect(0, 0, width, height);
    const tint = layer.createLinearGradient(0, 0, 0, height);
    tint.addColorStop(0, 'rgba(' + look.haze + ', 0.08)');
    tint.addColorStop(0.38, 'rgba(' + look.haze + ', 0)');
    tint.addColorStop(0.76, 'rgba(' + look.edge + ', 0)');
    tint.addColorStop(1, 'rgba(' + look.edge + ', 0.07)');
    layer.fillStyle = tint;
    layer.fillRect(0, 0, width, height);
  });
  ctx.save();
  ctx.drawImage(grade, 0, 0);
  // Edge-only optical fringe, not a displaced framebuffer.
  if (!still && (race.nitroBurn > 0 || race.abilityTime > 0)) {
    const fringe = ctx.createLinearGradient(0, 0, width, 0);
    fringe.addColorStop(0, 'rgba(222, 95, 137, 0.13)');
    fringe.addColorStop(0.075, 'rgba(222, 95, 137, 0)');
    fringe.addColorStop(0.925, 'rgba(83, 171, 230, 0)');
    fringe.addColorStop(1, 'rgba(83, 171, 230, 0.13)');
    ctx.fillStyle = fringe;
    ctx.fillRect(0, 0, width, height);
  }
  ctx.restore();
}

/**
 * Course-aware key, fill and exhaust light.
 * @param {Scene} scene
 * @param {string} engine
 * @param {boolean} boost
 * @param {number} damage
 */
export function airframeLight({ look, view }, engine, boost, damage) {
  return {
    key: mixRgb(look.haze, '192, 184, 174', 0.4),
    bounce: mixRgb(look.edge, '87, 97, 112', 0.42),
    engine: boost ? '123, 173, 220' : mixRgb(engine, '193, 111, 63', 0.42),
    direction: clamp((look.skyline === 'planet' ? -0.75 : 0.65) - view.heading * 0.19, -1, 1),
    heat: clamp((boost ? 0.9 : 0.35) + damage * 0.35, 0, 1),
  };
}

/**
 * Bounded, deterministic smoke, exhaust turbulence and biome particles.
 * @param {Scene} scene
 * @param {{ x: number, y: number, glow: string, boost: boolean }} flight
 */
export function drawFlightAtmosphere({ ctx, race, look, now, still }, { x, y, glow, boost }) {
  if (still || race.speed <= 0) return;
  const power = clamp(race.speed / 75, 0, 1);
  const biome = look.biome;
  const tint = biome === 'ice' ? '190, 218, 234' : biome === 'lava' ? '223, 115, 58' : '141, 153, 170';
  ctx.save();
  ctx.lineCap = 'round';
  if (race.spin > 0) {
    ctx.fillStyle = 'rgba(57, 63, 76, 0.24)';
    ctx.beginPath();
    for (let puff = 0; puff < 5; puff += 1) {
      const t = (now / 750 + puff / 5) % 1;
      const r = 3 + t * 9;
      const px = x + Math.sin(puff * 2.4 + t * 3) * 13;
      const py = y + 15 + t * 46;
      ctx.moveTo(px + r, py);
      ctx.ellipse(px, py, r, r * 0.67, 0, 0, Math.PI * 2);
    }
    ctx.fill();
  }
  // Heat shimmer approximation: transparent curved bands of exhaust light.
  if (boost) {
    const trail = ctx.createLinearGradient(x, y + 8, x, y + 98);
    trail.addColorStop(0, 'rgba(' + glow + ', 0.24)');
    trail.addColorStop(0.55, 'rgba(' + glow + ', 0.08)');
    trail.addColorStop(1, 'rgba(' + glow + ', 0)');
    ctx.strokeStyle = trail;
    ctx.lineWidth = 3.2;
    ctx.beginPath();
    for (const side of [-1, 1]) {
      for (let band = 0; band < 3; band += 1) {
        const at = (now / 220 + band / 3) % 1;
        const yy = y + 17 + at * 69;
        const xx = x + side * (10 + band * 5 + at * 8);
        ctx.moveTo(xx - 3, yy);
        ctx.quadraticCurveTo(xx + Math.sin(at * 9) * 5, yy + 7, xx + 4, yy + 12);
      }
    }
    ctx.stroke();
  }
  ctx.strokeStyle = 'rgba(' + tint + ', 0.30)';
  ctx.lineWidth = biome === 'ice' ? 1.6 : 1.1;
  ctx.beginPath();
  for (let i = 0; i < 12; i += 1) {
    const side = i % 2 ? -1 : 1;
    const t = ((race.z * 0.016 + i * 0.618) % 1 + 1) % 1;
    const xx = x + side * (34 + t * 24);
    const yy = y + 12 + t * 55;
    ctx.moveTo(xx, yy);
    ctx.lineTo(xx + side * power * 4, yy + (biome === 'ice' ? 3 : 7) * power);
  }
  ctx.stroke();
  ctx.restore();
}
