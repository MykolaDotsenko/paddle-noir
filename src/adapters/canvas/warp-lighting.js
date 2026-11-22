/**
 * Atmospheric lighting and fast, depth-aware highlights for Warp.
 *
 * These are deliberately Canvas 2D passes, not simulated physics or a WebGL dependency.
 * They use a handful of gradients for the whole scene, while the road's tiny specular
 * facets are polygons. Near-only details keep the full-width mobile renderer inexpensive.
 *
 * @import { Scene } from './warp-scenery.js'
 */

/** @typedef {{ x: number, y: number, scale: number, depth: number }} Point */
/** @typedef {{ left: Point, right: Point, stretch: number }} RoadRow */

/** @param {number} value @param {number} minimum @param {number} maximum */
const clamp = (value, minimum, maximum) => Math.min(maximum, Math.max(minimum, value));

/**
 * Each course has a different light source: a sunset, canyon aurora, sun above clouds,
 * reflected planetary glow or the pulsing core. It stays behind track geometry, so hills,
 * rivals and trackside buildings correctly occlude the light.
 *
 * @param {Scene} scene
 */
export function drawSkyLighting({ ctx, config, view, look, still, now }) {
  const { width } = config;
  const sourceX = width * (look.skyline === 'city' ? 0.72 : look.skyline === 'planet' ? 0.27 : 0.52)
    - view.heading * (look.skyline === 'city' ? 30 : 14);
  const sourceY = look.skyline === 'city' ? 232
    : look.skyline === 'clouds' ? 133
      : look.skyline === 'core' ? 257 : 177;
  const spread = look.skyline === 'city' ? width * 0.57 : width * 0.43;
  const light = look.skyline === 'clouds' ? '216, 180, 254' : look.haze;
  const power = look.skyline === 'city' ? 0.26 : look.skyline === 'core' ? 0.2 : 0.16;

  ctx.save();
  const glow = ctx.createRadialGradient(sourceX, sourceY, 8, sourceX, sourceY, spread);
  glow.addColorStop(0, 'rgba(' + light + ', ' + power + ')');
  glow.addColorStop(0.42, 'rgba(' + light + ', ' + (power * 0.32) + ')');
  glow.addColorStop(1, 'rgba(' + light + ', 0)');
  ctx.fillStyle = glow;
  ctx.fillRect(-80, -50, width + 160, 360);

  // A few soft, wide shafts are cheaper and cleaner than a full-screen per-pixel bloom.
  // Time never affects them in reduced-motion mode.
  const phase = still ? 0 : Math.sin(now / 3600) * 0.035;
  for (let index = 0; index < 4; index += 1) {
    const angle = (index - 1.5) * 0.29 + phase;
    const drift = Math.sin(angle) * width * 0.68;
    ctx.beginPath();
    ctx.moveTo(sourceX - 7, sourceY);
    ctx.lineTo(sourceX + drift - width * 0.065, -60);
    ctx.lineTo(sourceX + drift + width * 0.065, -60);
    ctx.closePath();
    ctx.fillStyle = 'rgba(' + light + ', ' + (0.016 + index * 0.003) + ')';
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
