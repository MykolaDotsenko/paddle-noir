import { mixRgb } from './theme.js';

/**
 * Hard-surface aircraft detail, drawn over a complete hull before the cockpit beacon.
 * A 2.5D top-down aircraft does not have real 3D meshes, but layered metal facets,
 * articulated control surfaces, fasteners and hot exhaust collars make its build
 * legible and consistent with its flight attitude.
 *
 * Small/distant craft never enter this layer, keeping mobile draw calls bounded.
 *
 * @import { CraftKind } from '../../domain/types.js'
 *
 * @typedef {object} AirframeDetail
 * @property {CraftKind} kind
 * @property {string} paint comma-separated RGB
 * @property {number} span half-width of the wings
 * @property {number} bank craft banking radians
 * @property {number} yaw sideways slip angle
 * @property {number} pitch longitudinal pitch
 * @property {number} damage 0 to 1: how worn the rival hull is
 * @property {boolean} active whether the craft's signature system is running
 * @property {readonly (readonly [number, number, number])[]} engines engine positions
 */

const STEEL = '148, 163, 184';
const HIGHLIGHT = '226, 232, 240';
const GRAPHITE = '15, 23, 42';
const SHADOW = '5, 6, 15';
const PLASMA = '125, 211, 252';

/** @param {CanvasRenderingContext2D} ctx @param {readonly [number, number][]} points */
function polygon(ctx, points) {
  ctx.beginPath();
  points.forEach(([x, y], i) => i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y));
  ctx.closePath();
}

/**
 * Wing-top facets have chamfered roots and contrasting trailing-edge hinges,
 * with their movement linked to actual steering rather than a random animation.
 *
 * @param {CanvasRenderingContext2D} ctx
 * @param {AirframeDetail} craft
 */
function wingSurfaces(ctx, { kind, span, bank, yaw, paint, active }) {
  const deflection = Math.max(-3.3, Math.min(3.3, bank * 5 + yaw * 4));
  const wingRoot = kind === 'heavy' ? 12 : kind === 'dart' ? 6 : kind === 'wing' ? 9 : 10;

  for (const side of [-1, 1]) {
    const edge = span * (kind === 'wing' ? 0.91 : kind === 'dart' ? 0.84 : 0.89);
    const upper = ctx.createLinearGradient(side * wingRoot, -8, side * edge, 8);
    upper.addColorStop(0, 'rgba(' + mixRgb(paint, HIGHLIGHT, 0.22) + ', 0.74)');
    upper.addColorStop(0.55, 'rgba(' + mixRgb(paint, GRAPHITE, 0.35) + ', 0.76)');
    upper.addColorStop(1, 'rgba(' + mixRgb(paint, SHADOW, 0.6) + ', 0.75)');
    ctx.fillStyle = upper;
    polygon(ctx, [
      [side * wingRoot, -5.3],
      [side * edge * 0.63, -0.7],
      [side * edge, 5.0],
      [side * edge * 0.83, 6.5],
      [side * wingRoot, 3.4],
    ]);
    ctx.fill();

    // Exposed elevon hinge and a lifted moving surface. Opposite wings counter-rotate.
    const hingeY = 7.6 + side * deflection * 0.3;
    const tipY = 10.1 + side * deflection;
    polygon(ctx, [
      [side * span * 0.45, hingeY],
      [side * span * 0.82, hingeY + 0.4],
      [side * span * 0.73, tipY],
      [side * span * 0.46, tipY],
    ]);
    ctx.fillStyle = 'rgb(' + mixRgb(paint, SHADOW, 0.66) + ')';
    ctx.fill();
    ctx.strokeStyle = 'rgba(' + STEEL + ', 0.72)';
    ctx.lineWidth = 0.75;
    ctx.stroke();

    ctx.strokeStyle = 'rgba(' + HIGHLIGHT + ', 0.42)';
    ctx.beginPath();
    ctx.moveTo(side * span * 0.47, hingeY - 0.6);
    ctx.lineTo(side * span * 0.82, hingeY - 0.3);
    ctx.stroke();

    // Individual narrow panel joins and rivets are smaller than the canopy beacon.
    ctx.strokeStyle = 'rgba(' + GRAPHITE + ', 0.62)';
    ctx.lineWidth = 0.65;
    ctx.beginPath();
    ctx.moveTo(side * span * 0.34, -2.5);
    ctx.lineTo(side * span * 0.39, 5.3);
    ctx.moveTo(side * span * 0.62, 1.5);
    ctx.lineTo(side * span * 0.68, 5.6);
    ctx.stroke();

    ctx.fillStyle = 'rgba(' + STEEL + ', 0.7)';
    for (let rivet = 0; rivet < 3; rivet += 1) {
      ctx.beginPath();
      ctx.arc(side * span * (0.38 + rivet * 0.115), 3.5 + rivet * 0.55, 0.47, 0, Math.PI * 2);
      ctx.fill();
    }

    if (active) {
      ctx.strokeStyle = 'rgba(' + PLASMA + ', 0.92)';
      ctx.lineWidth = 1.1;
      ctx.beginPath();
      ctx.moveTo(side * wingRoot, -3.2);
      ctx.lineTo(side * edge * 0.66, 0.5);
      ctx.stroke();
    }
  }
}

/**
 * Correctly shaded turbine mouths, inset intakes and a cool metal exhaust rim.
 * The nozzle's existing engine flame is untouched: these details sit on top of
 * its painted airframe and indicate where thrust actually emerges.
 *
 * @param {CanvasRenderingContext2D} ctx
 * @param {AirframeDetail} craft
 */
function engineHardware(ctx, { engines, paint, active, pitch }) {
  for (const [x, y, width] of engines) {
    const radius = width * 1.6;
    const intake = ctx.createRadialGradient(x - width * 0.18, y - 3, 0.4, x, y - 2, radius);
    intake.addColorStop(0, 'rgb(' + mixRgb(paint, GRAPHITE, 0.82) + ')');
    intake.addColorStop(0.65, 'rgb(' + mixRgb(paint, STEEL, 0.3) + ')');
    intake.addColorStop(1, 'rgb(' + mixRgb(paint, SHADOW, 0.84) + ')');
    ctx.fillStyle = intake;
    ctx.beginPath();
    ctx.ellipse(x, y - 3.2 - pitch * 2, radius * 0.84, radius * 0.67, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.strokeStyle = 'rgba(' + STEEL + ', 0.78)';
    ctx.lineWidth = 1;
    ctx.stroke();

    // A two-stage fan is a clear physical component, not an isolated glow dot.
    ctx.strokeStyle = active ? 'rgba(' + PLASMA + ', 0.8)' : 'rgba(' + HIGHLIGHT + ', 0.37)';
    ctx.lineWidth = 0.65;
    for (let blade = 0; blade < 5; blade += 1) {
      const angle = blade * (Math.PI * 2 / 5);
      ctx.beginPath();
      ctx.moveTo(x, y - 3.2);
      ctx.lineTo(x + Math.cos(angle) * width * 0.67, y - 3.2 + Math.sin(angle) * width * 0.54);
      ctx.stroke();
    }

    ctx.fillStyle = active ? 'rgba(' + PLASMA + ', 0.75)' : 'rgba(' + GRAPHITE + ', 0.9)';
    ctx.beginPath();
    ctx.arc(x, y - 3.2, 0.8, 0, Math.PI * 2);
    ctx.fill();
  }
}

/**
 * Make each hull family distinct even with no paint or decal. Component outlines
 * follow its existing blueprint rather than introducing separate, incompatible hulls.
 *
 * @param {CanvasRenderingContext2D} ctx
 * @param {AirframeDetail} craft
 */
function signatureHardware(ctx, { kind, paint, span, active }) {
  const panel = 'rgb(' + mixRgb(paint, GRAPHITE, 0.53) + ')';
  const trim = 'rgba(' + STEEL + ', 0.8)';
  ctx.fillStyle = panel;
  ctx.strokeStyle = trim;
  ctx.lineWidth = 0.85;

  if (kind === 'jet') {
    // Twin detachable canard roots and a reinforced, pointed radar radome.
    for (const side of [-1, 1]) {
      polygon(ctx, [[side * 5, -17], [side * 15, -11], [side * 12, -7], [side * 5, -10]]);
      ctx.fill();
      ctx.stroke();
    }
    ctx.strokeStyle = 'rgba(' + HIGHLIGHT + ', 0.55)';
    ctx.beginPath();
    ctx.moveTo(0, -23);
    ctx.lineTo(0, -18.5);
    ctx.stroke();
  } else if (kind === 'dart') {
    // Split thrust-vector actuators and a high, knife-like dorsal stabilizer.
    ctx.fillRect(-7, 4, 3.5, 6);
    ctx.fillRect(3.5, 4, 3.5, 6);
    ctx.beginPath();
    ctx.moveTo(0, -24);
    ctx.lineTo(0, 7);
    ctx.stroke();
  } else if (kind === 'wing') {
    // Laminar-flow winglets and paired buried-engine service hatches.
    for (const side of [-1, 1]) {
      polygon(ctx, [[side * (span - 5), 4.3], [side * (span - 1), -8], [side * span, 5.5]]);
      ctx.fill();
      ctx.stroke();
      ctx.strokeRect(side * 14 - 3, 0.5, 6, 3.7);
    }
  } else if (kind === 'heavy') {
    // Bolt-on armour blocks shielding its turret mounts.
    for (const side of [-1, 1]) {
      polygon(ctx, [[side * 14, -4], [side * 24, -2], [side * 26, 6], [side * 14, 6]]);
      ctx.fill();
      ctx.stroke();
      ctx.strokeStyle = 'rgba(' + HIGHLIGHT + ', 0.38)';
      ctx.beginPath();
      ctx.moveTo(side * 17, -2);
      ctx.lineTo(side * 21, 5);
      ctx.stroke();
    }
  } else {
    // Halo's ring is cut into service quadrants around the central dome.
    ctx.strokeStyle = 'rgba(' + STEEL + ', 0.72)';
    ctx.lineWidth = 0.8;
    for (let panelIndex = 0; panelIndex < 12; panelIndex += 1) {
      const angle = panelIndex * Math.PI / 6;
      ctx.beginPath();
      ctx.moveTo(Math.cos(angle) * 18, Math.sin(angle) * 5);
      ctx.lineTo(Math.cos(angle) * 30, 2 + Math.sin(angle) * 9);
      ctx.stroke();
    }
  }

  if (active) {
    ctx.strokeStyle = 'rgba(' + PLASMA + ', 0.72)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(0, 0, kind === 'saucer' ? 19 : 11, 0, Math.PI * 2);
    ctx.stroke();
  }
}

/**
 * Damage is visualized as worn paint and scorched outer panels, with no orange
 * explosion shape mistaken for a projectile and with zero animation state.
 *
 * @param {CanvasRenderingContext2D} ctx
 * @param {AirframeDetail} craft
 */
function wear(ctx, { damage, span }) {
  const amount = Math.max(0, Math.min(1, damage));

  if (amount < 0.05) {
    return;
  }

  ctx.strokeStyle = 'rgba(' + SHADOW + ', ' + (0.2 + amount * 0.6) + ')';
  ctx.lineWidth = 1 + amount * 2.1;

  for (const side of [-1, 1]) {
    ctx.beginPath();
    ctx.moveTo(side * span * 0.35, 0);
    ctx.lineTo(side * span * (0.35 + amount * 0.17), 4.5);
    ctx.lineTo(side * span * (0.45 + amount * 0.13), 6);
    ctx.stroke();

    if (amount > 0.45) {
      ctx.fillStyle = 'rgba(78, 35, 36, ' + (amount * 0.48) + ')';
      ctx.beginPath();
      ctx.ellipse(side * span * 0.59, 4.3, 4.6 * amount, 1.7, side * 0.28, 0, Math.PI * 2);
      ctx.fill();
    }
  }
}

/**
 * @param {CanvasRenderingContext2D} ctx
 * @param {AirframeDetail} craft
 */
export function drawAirframeDetails(ctx, craft) {
  if (craft.kind !== 'saucer') wingSurfaces(ctx, craft);
  engineHardware(ctx, craft);
  signatureHardware(ctx, craft);
  wear(ctx, craft);
}
