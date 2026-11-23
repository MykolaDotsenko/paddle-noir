import { mixRgb, roundedRect, THEME } from './theme.js';
import { drawAirframeDetails } from './warp-airframe-details.js';

/**
 * The racing craft of the Warp game, seen from behind and a little above, their noses away
 * from the eye and their engines toward it: a jet, a dart, a flying wing, a gunship and a
 * saucer. Each is built of plates shaded in its paint, with a dark glass canopy, engine
 * nozzles that burn in the color of its light, guns on its wings, rockets under them once it
 * carries any, a decal if it wears one, and a red and a green light on its wing tips. Far
 * away a craft is drawn plainly: nobody can see a panel line at that size.
 *
 * The same drawing stands the craft in the hangar. Nothing here is the pure white kept for
 * the ball, and no tint of a paint comes near the color of a paddle's core: the light on the
 * canopy is the only thing of that color, which is how the player's craft is told apart.
 *
 * @import { CraftKind, Loadout } from '../../domain/types.js'
 * @import { GlowSprites } from './court.js'
 *
 * @typedef {readonly (readonly [number, number])[]} Outline corners, in the craft's own units
 *
 * @typedef {object} Blueprint
 * @property {Outline} wings
 * @property {Outline} body
 * @property {Outline} canopy the glass round the light on it
 * @property {readonly (readonly [number, number, number, number])[]} fins each from its root to its tip
 * @property {readonly (readonly [number, number, number])[]} engines where each nozzle is, and how wide
 * @property {readonly number[]} guns how far out on each wing a barrel is
 * @property {number} pods how far out the rockets hang
 * @property {number} span half its width
 *
 * @typedef {object} CraftStyle
 * @property {CraftKind} kind
 * @property {string} paint "r, g, b"
 * @property {string} decal none, stripes, chevrons, flames or the earned signal
 * @property {string} glow "r, g, b": the light under it and in its engines
 * @property {string} cockpit a color: the light on its canopy
 * @property {number} x
 * @property {number} y
 * @property {number} scale
 * @property {number} bank radians it leans, or turns while it spins
 * @property {number} [yaw] side-slip angle, for a subtle 2.5D perspective deformation
 * @property {number} [pitch] nose-up attitude, for a small depth change in the silhouette
 * @property {boolean} [active] signature system is engaged
 * @property {number} [damage] visible airframe wear, 0 fresh to 1 heavily damaged
 * @property {number} flame 0 to 1 and a little more
 * @property {boolean} nitro whether it burns nitro: a longer, blue flame
 * @property {number} rockets how many hang under its wings
 * @property {number} now milliseconds, for the lights that blink; 0 holds them still
 * @property {GlowSprites | null} glows the glow sprites, or null to shade each glow in place
 * @property {string} [sky] "r, g, b": the sky its paint and glass reflect
 */

/** How large the player's own craft is drawn: it is the nearest to the eye. */
export const CRAFT_SCALE = 1.45;
/** Smaller than this on the board, a craft is drawn without its details. */
const DETAIL_SCALE = 0.42;
const DARK = '5, 6, 15';
const STEEL = '30, 41, 59';
const LIGHT = '226, 232, 240';
const GLASS = '15, 23, 42';
const HOT = '254, 240, 138';
const NITRO = '125, 211, 252';
const NITRO_HOT = '210, 245, 255';
const PORT = '239, 68, 68';
const STARBOARD = '74, 222, 128';
/** The most a paint is lightened: any lighter, cyan would pass for a paddle's core. */
const SHEEN = 0.4;
/**
 * Light off a polished surface. It is warm, its blue well under a paddle's core's, so that no
 * highlight on a cyan paint, nor any blend of one, passes for that core; and it is not the
 * ball's white either.
 */
const SHINE = '255, 238, 214';
/** The strobe on a craft's tail: warm too, for the same reasons. */
const STROBE = '255, 244, 228';
/** What a craft's paint and glass reflect when nothing says which sky it flies under. */
const SKY = '148, 163, 210';
/** Heat-tinted titanium round a hot nozzle, and the gunmetal of a barrel. */
const TITANIUM = '128, 104, 92';
const GUNMETAL = '51, 65, 85';
const TAU = Math.PI * 2;
/**
 * From this size up a craft shows its polish, the sky reflected in it and its panel seams lit,
 * and the finest hardware of its airframe: the player's own craft always, a rival only when it
 * is right alongside, so a pack of them close ahead costs no more than it must.
 */
const POLISH_SCALE = 1;
/**
 * From this size up the small parts are shaded too, the plume, the nozzles' glowing throats,
 * the nacelles and the fins; smaller, they are a few pixels wide, and a flat color reads the same.
 */
const RICH_SCALE = 0.7;

/** @type {Readonly<Record<Exclude<CraftKind, 'saucer'>, Blueprint>>} */
const BLUEPRINTS = Object.freeze({
  jet: {
    wings: [[-34, 7], [-31, 3], [-10, -4], [-6, -12], [6, -12], [10, -4], [31, 3], [34, 7], [13, 9], [-13, 9]],
    body: [[0, -24], [3.5, -17], [6.5, -6], [8, 8], [-8, 8], [-6.5, -6], [-3.5, -17]],
    canopy: [[0, -18], [4.4, -11], [4.6, -2], [0, 4], [-4.6, -2], [-4.4, -11]],
    fins: [[-7, 3, -12, -12], [7, 3, 12, -12]],
    engines: [[-4.4, 8, 3.4], [4.4, 8, 3.4]],
    guns: [19],
    pods: 26,
    span: 34,
  },
  dart: {
    wings: [[0, -26], [7, -2], [24, 7], [23, 10], [8, 8], [-8, 8], [-23, 10], [-24, 7], [-7, -2]],
    body: [[0, -26], [4.6, -8], [5.6, 8], [-5.6, 8], [-4.6, -8]],
    canopy: [[0, -18], [4, -11], [4.2, -2], [0, 4], [-4.2, -2], [-4, -11]],
    fins: [[0, 5, 0, -15]],
    engines: [[0, 8, 4.6]],
    guns: [11],
    pods: 18,
    span: 24,
  },
  wing: {
    wings: [[-40, 6], [-36, 2], [-14, -8], [0, -12], [14, -8], [36, 2], [40, 6], [22, 9], [10, 6], [0, 9], [-10, 6], [-22, 9]],
    body: [[0, -16], [7, -7], [8, 6], [0, 8], [-8, 6], [-7, -7]],
    canopy: [[0, -15], [4.6, -9], [4.6, -1], [0, 4], [-4.6, -1], [-4.6, -9]],
    fins: [[-37, 4, -40, -6], [37, 4, 40, -6]],
    engines: [[-13, 7, 3.4], [13, 7, 3.4]],
    guns: [23],
    pods: 30,
    span: 40,
  },
  heavy: {
    wings: [[-33, 9], [-33, 1], [-15, -6], [-9, -14], [9, -14], [15, -6], [33, 1], [33, 9], [14, 11], [-14, 11]],
    body: [[0, -21], [8, -13], [11, -2], [11, 10], [-11, 10], [-11, -2], [-8, -13]],
    canopy: [[0, -18], [5.2, -11], [5.2, -2], [0, 4], [-5.2, -2], [-5.2, -11]],
    fins: [[-10, 3, -15, -12], [10, 3, 15, -12]],
    engines: [[-7, 10, 3.5], [0, 10, 3.5], [7, 10, 3.5]],
    guns: [20, 27],
    pods: 30,
    span: 33,
  },
});

/** The saucer has no plates to speak of: a disc, a dome and an engine under it. */
const SAUCER = Object.freeze({ engines: /** @type {readonly (readonly [number, number, number])[]} */ ([[0, 6, 8]]), span: 31, pods: 22 });

/**
 * @param {CraftKind} kind
 * @returns {number} half a craft's width, to its wing tips, in its own units
 */
export function spanOf(kind) {
  return kind === 'saucer' ? SAUCER.span : BLUEPRINTS[kind].span;
}

/**
 * @param {CraftKind} kind
 * @returns {number[]} how far to each side of a craft's middle its guns are, in its own units
 */
export function muzzlesOf(kind) {
  const guns = kind === 'saucer' ? [20] : BLUEPRINTS[kind].guns.slice(0, 1);
  return guns.flatMap((out) => [-out, out]);
}

/**
 * @param {CanvasRenderingContext2D} ctx
 * @param {Outline} corners
 */
function trace(ctx, corners) {
  ctx.beginPath();
  corners.forEach(([x, y], index) => (index === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y)));
  ctx.closePath();
}

/**
 * @param {string} rgb
 * @param {number} amount 0 to 1
 * @returns {string} the paint, darker
 */
const shade = (rgb, amount) => mixRgb(rgb, DARK, amount);

/**
 * @param {string} rgb
 * @param {number} amount 0 to 1, of the most a paint is lightened
 * @returns {string} the paint, lighter
 */
const sheen = (rgb, amount) => mixRgb(rgb, LIGHT, amount * SHEEN);

/**
 * @param {string} rgb
 * @param {number} alpha
 */
const rgba = (rgb, alpha) => `rgba(${rgb}, ${alpha})`;

/**
 * A straight gradient through the given stops.
 *
 * @param {CanvasRenderingContext2D} ctx
 * @param {number} x0
 * @param {number} y0
 * @param {number} x1
 * @param {number} y1
 * @param {readonly (readonly [number, string])[]} stops
 */
function gradient(ctx, x0, y0, x1, y1, stops) {
  const paint = ctx.createLinearGradient(x0, y0, x1, y1);

  for (const [at, color] of stops) {
    paint.addColorStop(at, color);
  }

  return paint;
}

/**
 * A glow: a sprite laid over what is under it, or shaded in place where there are no sprites.
 *
 * @param {CanvasRenderingContext2D} ctx
 * @param {GlowSprites | null} glows
 * @param {string} rgb
 * @param {number} x
 * @param {number} y
 * @param {number} radius
 */
function glow(ctx, glows, rgb, x, y, radius) {
  if (glows) {
    ctx.globalCompositeOperation = 'lighter';
    ctx.drawImage(glows.get(rgb), x - radius, y - radius, radius * 2, radius * 2);
    ctx.globalCompositeOperation = 'source-over';
    return;
  }

  const light = ctx.createRadialGradient(x, y, 0, x, y, radius);

  light.addColorStop(0, `rgba(${rgb}, 0.6)`);
  light.addColorStop(0.5, `rgba(${rgb}, 0.16)`);
  light.addColorStop(1, `rgba(${rgb}, 0)`);
  ctx.fillStyle = light;
  ctx.fillRect(x - radius, y - radius, radius * 2, radius * 2);
}

/**
 * The fire out of an engine, toward the eye: a plume as wide as the nozzle where it leaves it,
 * thinning to nothing and brightest at its root, round a shorter hot core; at full thrust, and
 * always with nitro, which burns longer and blue, the shock diamonds of a jet stand in it. It
 * flickers a little while the clock runs. The flames are painted over what is under them,
 * never added to it: added, they would burn out to the white kept for the ball.
 *
 * @param {CanvasRenderingContext2D} ctx
 * @param {CraftStyle} style
 * @param {readonly [number, number, number]} engine
 * @param {boolean} rich whether it is near enough for its plume to be shaded
 */
function exhaust(ctx, { flame, nitro, glow: rgb, glows, now }, [x, y, wide], rich) {
  const flicker = now === 0 ? 1 : 1 + 0.06 * Math.sin(now / 23 + x * 1.7);
  const length = wide * (1.2 + flame * (nitro ? 7.5 : 5.2)) * flicker;
  const core = length * 0.5;
  const outer = nitro ? NITRO : rgb;
  const inner = nitro ? NITRO_HOT : HOT;

  glow(ctx, glows, outer, x, y + 4, 15 + wide * 1.5);

  ctx.beginPath();
  ctx.moveTo(x - wide * 0.9, y);
  ctx.quadraticCurveTo(x - wide * 0.75, y + length * 0.45, x, y + length);
  ctx.quadraticCurveTo(x + wide * 0.75, y + length * 0.45, x + wide * 0.9, y);
  ctx.closePath();
  ctx.fillStyle = rich
    ? gradient(ctx, 0, y, 0, y + length, [[0, rgba(outer, 0.88)], [0.55, rgba(outer, 0.42)], [1, rgba(outer, 0)]])
    : rgba(outer, 0.45 + Math.min(1, flame) * 0.35);
  ctx.fill();

  ctx.beginPath();
  ctx.moveTo(x - wide * 0.5, y);
  ctx.quadraticCurveTo(x - wide * 0.32, y + core * 0.55, x, y + core);
  ctx.quadraticCurveTo(x + wide * 0.32, y + core * 0.55, x + wide * 0.5, y);
  ctx.closePath();
  ctx.fillStyle = rich ? gradient(ctx, 0, y, 0, y + core, [[0, rgba(inner, 0.95)], [1, rgba(inner, 0.1)]]) : rgba(inner, 0.92);
  ctx.fill();

  if (nitro || flame > 1) {
    for (const along of [0.24, 0.42, 0.58, 0.72]) {
      ctx.fillStyle = rgba(inner, 0.85 - along * 0.75);
      ctx.beginPath();
      ctx.ellipse(x, y + length * along, wide * (0.46 - along * 0.38), wide * 0.24, 0, 0, TAU);
      ctx.fill();
    }
  }
}

/**
 * A nozzle, seen from behind: a shroud of heat-tinted metal cut into petals, round a throat
 * that glows from its hot middle out to the color of the craft's light.
 *
 * @param {CanvasRenderingContext2D} ctx
 * @param {CraftStyle} style
 * @param {readonly [number, number, number]} engine
 * @param {boolean} rich whether it is near enough for its metal and its throat to be shaded
 */
function nozzle(ctx, { nitro, glow: rgb }, [x, y, wide], rich) {
  ctx.beginPath();
  ctx.ellipse(x, y, wide * 1.08, wide * 0.56, 0, 0, TAU);
  ctx.fillStyle = rich
    ? gradient(ctx, x - wide, y, x + wide, y, [[0, `rgb(${mixRgb(STEEL, DARK, 0.3)})`], [0.35, `rgb(${mixRgb(STEEL, LIGHT, 0.45)})`], [0.62, `rgb(${TITANIUM})`], [1, `rgb(${mixRgb(STEEL, DARK, 0.5)})`]])
    : `rgb(${STEEL})`;
  ctx.fill();

  if (rich) {
    // The petals of the shroud.
    ctx.strokeStyle = rgba(DARK, 0.6);
    ctx.lineWidth = 0.45;
    ctx.beginPath();

    for (let petal = 0; petal < 10; petal += 1) {
      const angle = (petal / 10) * TAU;
      ctx.moveTo(x + Math.cos(angle) * wide * 0.7, y + Math.sin(angle) * wide * 0.34);
      ctx.lineTo(x + Math.cos(angle) * wide * 1.06, y + Math.sin(angle) * wide * 0.54);
    }

    ctx.stroke();
  }

  const hot = nitro ? NITRO_HOT : mixRgb(rgb, HOT, 0.6);
  ctx.beginPath();
  ctx.ellipse(x, y, wide * 0.66, wide * 0.32, 0, 0, TAU);

  if (rich) {
    const throat = ctx.createRadialGradient(x, y, 0, x, y, wide * 0.66);
    throat.addColorStop(0, `rgb(${nitro ? NITRO_HOT : HOT})`);
    throat.addColorStop(0.55, `rgb(${hot})`);
    throat.addColorStop(1, `rgb(${mixRgb(nitro ? NITRO : rgb, DARK, 0.45)})`);
    ctx.fillStyle = throat;
  } else {
    ctx.fillStyle = `rgb(${hot})`;
  }

  ctx.fill();
}

/**
 * What a craft wears over its paint, within its own outline: two stripes nose to tail, a
 * chevron on each wing, flames back from the nose, or the signal earned from the story.
 *
 * @param {CanvasRenderingContext2D} ctx
 * @param {Blueprint} print
 * @param {string} decal
 * @param {string} paint
 */
function mark(ctx, print, decal, paint) {
  if (decal === 'none') {
    return;
  }

  // Light on a dark paint, dark on a light one.
  const [red, green, blue] = paint.split(',').map(Number);
  const ink = red * 0.3 + green * 0.59 + blue * 0.11 > 150 ? `rgba(${DARK}, 0.7)` : `rgba(${LIGHT}, 0.85)`;
  const top = Math.min(...print.body.map(([, y]) => y));

  ctx.save();
  ctx.beginPath();
  for (const outline of [print.wings, print.body]) {
    outline.forEach(([x, y], index) => (index === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y)));
    ctx.closePath();
  }
  ctx.clip();

  if (decal === 'stripes') {
    ctx.fillStyle = ink;
    ctx.fillRect(-5.2, top, 1.8, 40);
    ctx.fillRect(3.4, top, 1.8, 40);
    ctx.fillRect(-print.span * 0.74, -20, 2.2, 40);
    ctx.fillRect(print.span * 0.74 - 2.2, -20, 2.2, 40);
  } else if (decal === 'chevrons') {
    ctx.strokeStyle = ink;
    ctx.lineWidth = 1.8;
    ctx.beginPath();

    for (const side of [-1, 1]) {
      for (const out of [0.42, 0.58]) {
        ctx.moveTo(side * print.span * out - 4, 9);
        ctx.lineTo(side * print.span * out, 0);
        ctx.lineTo(side * print.span * out + 4, 9);
      }
    }

    ctx.stroke();
  } else if (decal === 'signal') {
    // HORIZON's mark, for the pilot who brought it home: a beacon on each wing, its signal
    // going out along the wing in rings.
    ctx.strokeStyle = ink;
    ctx.fillStyle = ink;
    ctx.lineWidth = 1.4;

    for (const side of [-1, 1]) {
      const x = side * print.span * 0.42;
      const facing = side > 0 ? 0 : Math.PI;
      ctx.beginPath();
      ctx.arc(x, 3, 1.7, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();

      for (const radius of [4.2, 7.6]) {
        ctx.moveTo(x + Math.cos(facing - 0.8) * radius, 3 + Math.sin(facing - 0.8) * radius);
        ctx.arc(x, 3, radius, facing - 0.8, facing + 0.8);
      }

      ctx.stroke();
    }
  } else {
    // Flames: licks of amber and red, back from the leading edge.
    for (const [rgb, reach] of /** @type {const} */ ([[PORT, 1], [THEME.amber, 0.62]])) {
      ctx.fillStyle = `rgba(${rgb}, 0.9)`;

      for (const side of [-1, 1]) {
        ctx.beginPath();
        ctx.moveTo(side * 2, top + 4);
        ctx.quadraticCurveTo(side * 9, -8, side * (8 + 22 * reach), 4 * reach);
        ctx.quadraticCurveTo(side * 12, -1, side * (6 + 12 * reach), 8 * reach);
        ctx.quadraticCurveTo(side * 7, 1, side * 4, 8 * reach);
        ctx.closePath();
        ctx.fill();
      }
    }
  }

  ctx.restore();
}


/**
 * Gives the aerodynamic shells a visible underside. The shadow shell is offset toward the
 * viewer, like a shallow extrusion, instead of being a second flat outline. Only render
 * it for nearby craft: thin geometry at tiny sizes shimmers on phones.
 *
 * @param {CanvasRenderingContext2D} ctx
 * @param {Blueprint} print
 * @param {string} paint
 */
function airframeVolume(ctx, print, paint) {
  const underside = ctx.createLinearGradient(0, 4, 0, 16);
  underside.addColorStop(0, 'rgb(' + shade(paint, 0.64) + ')');
  underside.addColorStop(1, 'rgb(' + shade(paint, 0.87) + ')');
  ctx.fillStyle = underside;
  ctx.beginPath();

  for (const [index, [x, y]] of print.wings.entries()) {
    const drop = 2.7 + Math.abs(x / print.span) * 1.7;

    if (index === 0) {
      ctx.moveTo(x, y + drop);
    } else {
      ctx.lineTo(x, y + drop);
    }
  }

  ctx.closePath();
  ctx.fill();

  ctx.fillStyle = 'rgb(' + shade(paint, 0.81) + ')';
  ctx.beginPath();

  for (const [index, [x, y]] of print.body.entries()) {
    if (index === 0) {
      ctx.moveTo(x, y + 4);
    } else {
      ctx.lineTo(x, y + 4);
    }
  }

  ctx.closePath();
  ctx.fill();
}

/**
 * Small believable airframe details: tapered outer panels, moving elevons, fasteners and
 * cooling louvers. All positions scale with the blueprint, so a dart stays distinctly
 * slimmer than a flying wing or a heavy gunship.
 *
 * @param {CanvasRenderingContext2D} ctx
 * @param {CraftStyle} style
 * @param {Blueprint} print
 */
function wingStructure(ctx, style, print) {
  const { kind, paint, bank } = style;
  const lean = Math.sin(bank);
  const span = print.span;
  const close = style.scale >= 0.72;
  const highlight = ctx.createLinearGradient(-span, -5, span, 10);
  highlight.addColorStop(0, 'rgba(' + shade(paint, 0.16) + ', 0.34)');
  highlight.addColorStop(0.5, 'rgba(' + sheen(paint, 0.35) + ', 0.42)');
  highlight.addColorStop(1, 'rgba(' + shade(paint, 0.38) + ', 0.34)');

  // Distinct trapezoidal upper wing skin, away from the very dark leading edge.
  for (const side of [-1, 1]) {
    const root = kind === 'heavy' ? 15 : kind === 'dart' ? 8 : 11;
    const out = span * (kind === 'wing' ? 0.9 : 0.84);
    ctx.beginPath();
    ctx.moveTo(side * root, -3);
    ctx.lineTo(side * span * 0.58, 0.4);
    ctx.lineTo(side * out, 5.5);
    ctx.lineTo(side * root, 5.8);
    ctx.closePath();
    ctx.fillStyle = highlight;
    ctx.fill();

    // Elevon, with a visible hinge and a bank-sensitive trailing surface.
    const hingeY = 6 + side * lean * 1.9;
    ctx.beginPath();
    ctx.moveTo(side * span * 0.49, hingeY);
    ctx.lineTo(side * span * 0.82, hingeY + 0.2);
    ctx.lineTo(side * span * 0.77, hingeY + 2.3);
    ctx.lineTo(side * span * 0.52, hingeY + 2.2);
    ctx.closePath();
    ctx.fillStyle = 'rgb(' + shade(paint, 0.48 - side * lean * 0.13) + ')';
    ctx.fill();
    ctx.strokeStyle = 'rgba(' + DARK + ', 0.45)';
    ctx.lineWidth = 0.45;
    ctx.stroke();

    // A small de-icing/leading-edge metallic strip, rather than a neon outline.
    ctx.strokeStyle = 'rgba(' + mixRgb(STEEL, LIGHT, 0.4) + ', 0.62)';
    ctx.lineWidth = 0.75;
    ctx.beginPath();
    ctx.moveTo(side * (root + 2), -3.2);
    ctx.lineTo(side * span * 0.7, 1.7);
    ctx.stroke();

    // Countersunk fasteners only resolve at portrait/close-race scale.
    if (close) {
      ctx.fillStyle = 'rgba(' + DARK + ', 0.68)';
      for (const offset of [0.32, 0.46, 0.6]) {
        ctx.beginPath();
        ctx.arc(side * span * offset, 4.4, 0.45, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }


  // Each family's own hardware (canards, keel, winglets, armour) is the airframe details' to draw.

  // The fuselage has a narrow raised spine and removable access panels.
  ctx.strokeStyle = 'rgba(' + mixRgb(STEEL, LIGHT, 0.53) + ', 0.54)';
  ctx.lineWidth = 0.85;
  ctx.beginPath();
  ctx.moveTo(0, -18);
  ctx.lineTo(0, -12);
  ctx.moveTo(-7, 5);
  ctx.lineTo(7, 5);
  ctx.stroke();
}

/**
 * A canopy of tinted glass in a metal frame: the sky reflected at its top, deepening to dark
 * glass, a bright curve of light down one side and a glint at the other. It stays round, never
 * over, the light on the canopy, which on the player's craft is the color of a paddle's core.
 *
 * @param {CanvasRenderingContext2D} ctx
 * @param {string} paint
 * @param {number} bank
 * @param {string} sky
 */
function canopyMaterial(ctx, paint, bank, sky) {
  const lean = Math.sin(bank);

  ctx.fillStyle = gradient(ctx, lean * 3, -18, -lean * 3, 5, [
    [0, `rgb(${mixRgb(GLASS, sky, 0.55)})`],
    [0.34, `rgb(${mixRgb(GLASS, sky, 0.2)})`],
    [0.52, `rgb(${GLASS})`],
    [1, `rgb(${mixRgb(GLASS, paint, 0.14)})`],
  ]);
  ctx.fill();

  // The frame round the glass.
  ctx.strokeStyle = rgba(mixRgb(STEEL, LIGHT, 0.5), 0.85);
  ctx.lineWidth = 0.9;
  ctx.stroke();

  // Light off the glass: a long curve down the side away from the bank, and a glint.
  ctx.strokeStyle = rgba(SHINE, 0.6);
  ctx.lineWidth = 0.75;
  ctx.beginPath();
  ctx.moveTo(-3.3 - lean, -14.5);
  ctx.quadraticCurveTo(-4.5 - lean, -9, -3.7 - lean, -3.5);
  ctx.moveTo(2.4, -15);
  ctx.lineTo(3.3, -13);
  ctx.stroke();
}

/**
 * What hangs under the wings, drawn before them so that the wings cover all but the ends: the
 * guns' barrels poking out ahead of the leading edge, and the rockets it carries, their noses
 * ahead of the wing, a red band behind each tip, and their fins behind the trailing edge.
 *
 * @param {CanvasRenderingContext2D} ctx
 * @param {{ guns: readonly number[], pods: number }} mounts
 * @param {number} rockets
 * @param {(x: number) => [number, number]} edges where the wing's leading and trailing edges are, that far across
 */
function ordnance(ctx, { guns, pods }, rockets, edges) {
  for (const out of guns) {
    for (const side of [-1, 1]) {
      const [front] = edges(side * out);
      ctx.fillStyle = `rgb(${GUNMETAL})`;
      ctx.fillRect(side * out - 0.7, front - 3.6, 1.4, 6);
      ctx.fillStyle = `rgb(${mixRgb(STEEL, LIGHT, 0.5)})`;
      ctx.fillRect(side * out - 0.9, front - 3.9, 1.8, 1);
    }
  }

  for (let rocket = 0; rocket < Math.min(rockets, 4); rocket += 1) {
    const side = rocket % 2 === 0 ? -1 : 1;
    const at = side * (pods - Math.floor(rocket / 2) * 5);
    // A rocket hangs from nose to fins under the wing: its nose a little ahead of the wing,
    // its fins a little behind it.
    const [front, back] = edges(at);
    const nose = front - 3.6;
    const tail = back + 2.4;

    ctx.fillStyle = gradient(ctx, at - 1.3, 0, at + 1.3, 0, [[0, `rgb(${mixRgb(LIGHT, DARK, 0.55)})`], [0.42, `rgb(${LIGHT})`], [1, `rgb(${mixRgb(LIGHT, DARK, 0.62)})`]]);
    roundedRect(ctx, at - 1.3, nose, 2.6, tail - nose, 1.3);
    ctx.fill();
    ctx.fillStyle = `rgb(${PORT})`;
    ctx.fillRect(at - 1.3, nose + 1.4, 2.6, 1.3);
    ctx.fillStyle = `rgb(${STEEL})`;
    trace(ctx, [[at - 2.6, tail], [at - 1, tail - 2.6], [at + 1, tail - 2.6], [at + 2.6, tail]]);
    ctx.fill();
  }
}

/**
 * Where the leading and the trailing edge of an outline are, that far across it.
 *
 * @param {Outline} outline
 * @returns {(x: number) => [number, number]} the front and the back of it there
 */
function edgesOf(outline) {
  return (x) => {
    /** @type {number[]} */
    const ys = [];

    outline.forEach(([x1, y1], index) => {
      const [x2, y2] = outline[(index + 1) % outline.length];

      if ((x1 - x) * (x2 - x) <= 0 && x1 !== x2) {
        ys.push(y1 + ((x - x1) / (x2 - x1)) * (y2 - y1));
      }
    });

    return ys.length > 0 ? [Math.min(...ys), Math.max(...ys)] : [0, 0];
  };
}

/**
 * The polish on the paint, as on a car's clear coat: the sky reflected across the top of the
 * craft down to a bright line where its horizon is, and the dark ground under that. The line
 * tilts as the craft banks and moves as it climbs, as a reflection would.
 *
 * @param {CanvasRenderingContext2D} ctx
 * @param {readonly Outline[]} outlines what the polish is on
 * @param {number} span
 * @param {string} sky
 * @param {number} lean
 * @param {number} pitch
 */
function clearcoat(ctx, outlines, span, sky, lean, pitch) {
  ctx.save();
  ctx.beginPath();

  for (const outline of outlines) {
    outline.forEach(([x, y], index) => (index === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y)));
    ctx.closePath();
  }

  ctx.clip();
  const tilt = lean * 10;
  const lift = pitch * 10;
  ctx.fillStyle = gradient(ctx, tilt, -26 + lift, -tilt, 12 + lift, [
    [0, rgba(sky, 0.26)], [0.55, rgba(sky, 0.1)], [0.6, rgba(SHINE, 0.32)], [0.64, rgba(DARK, 0.16)], [1, rgba(DARK, 0.34)],
  ]);
  ctx.fillRect(-span - 2, -28, span * 2 + 4, 42);
  ctx.restore();
}

/**
 * An edge lit where it faces the sky and dark where it turns away: along the leading edges and
 * down to the trailing ones, in place of an outline.
 *
 * @param {CanvasRenderingContext2D} ctx
 * @param {string} paint
 * @param {number} top
 * @param {number} bottom
 */
function litEdge(ctx, paint, top, bottom) {
  return gradient(ctx, 0, top, 0, bottom, [[0, rgba(SHINE, 0.7)], [0.45, rgba(sheen(paint, 0.5), 0.55)], [1, rgba(DARK, 0.85)]]);
}

/**
 * The plated crafts: the guns and rockets under the wings; the wings, metal lit from the front
 * and from the side the craft leans away from, polished to reflect the sky, with their panel
 * seams; a body rounded by its light, a gleam down its spine; the engines' nacelles and
 * nozzles; fins that lean with the craft; and a glass canopy.
 *
 * @param {CanvasRenderingContext2D} ctx
 * @param {CraftStyle} style
 * @param {Blueprint} print
 * @param {boolean} fine whether it is near enough for its details
 */
function plates(ctx, style, print, fine) {
  const { paint, decal, bank, rockets } = style;
  const lean = Math.sin(bank);
  const sky = style.sky ?? SKY;
  const close = fine && style.scale >= POLISH_SCALE;
  const rich = fine && style.scale >= RICH_SCALE;

  if (fine) {
    ordnance(ctx, print, rockets, edgesOf(print.wings));
    // The wings have physical thickness, dark underneath and lit on their top surfaces.
    airframeVolume(ctx, print, paint);
  }

  trace(ctx, print.wings);

  if (fine) {
    ctx.fillStyle = gradient(ctx, 0, -14, 0, 11, [[0, `rgb(${sheen(paint, 0.55)})`], [0.45, `rgb(${shade(paint, 0.2)})`], [1, `rgb(${shade(paint, 0.62)})`]]);

    if (rich) {
      ctx.fill();
      // Lit from the side it leans away from, and shadowed on the other.
      const lit = rgba(SHINE, 0.1 + Math.abs(lean) * 0.25);
      const dim = rgba(DARK, 0.18 + Math.abs(lean) * 0.4);
      ctx.fillStyle = gradient(ctx, -print.span, 0, print.span, 0, [[0, lean > 0 ? dim : lit], [0.5, rgba(DARK, 0)], [1, lean > 0 ? lit : dim]]);
    }
  } else {
    ctx.fillStyle = `rgb(${shade(paint, 0.35)})`;
  }

  ctx.fill();

  if (fine) {
    wingStructure(ctx, style, print);

    if (close) {
      clearcoat(ctx, [print.wings, print.body], print.span, sky, lean, style.pitch ?? 0);
    }

    // Panel seams, flaps and all; up close each with the light catching its far lip.
    ctx.lineWidth = 0.6;

    for (const [color, lip] of /** @type {const} */ ([[rgba(DARK, 0.6), 0], [rgba(SHINE, 0.16), 0.55]])) {
      if (lip > 0 && !close) {
        break;
      }

      ctx.strokeStyle = color;
      ctx.beginPath();

      for (const side of [-1, 1]) {
        ctx.moveTo(side * print.span * 0.36, -4 + lip);
        ctx.lineTo(side * print.span * 0.42, 8 + lip);
        ctx.moveTo(side * print.span * 0.66, lip);
        ctx.lineTo(side * print.span * 0.7, 8 + lip);
        ctx.moveTo(side * print.span * 0.4, 5.5 + lip);
        ctx.lineTo(side * print.span * 0.86, 5.5 + lip);
      }

      ctx.stroke();
    }
  }

  ctx.lineJoin = 'round';
  ctx.strokeStyle = fine ? litEdge(ctx, paint, -14, 11) : `rgb(${paint})`;
  ctx.lineWidth = fine ? 1.1 : 2;
  trace(ctx, print.wings);
  ctx.stroke();

  // The body, rounded: dark at its sides, lit down its back toward the light.
  trace(ctx, print.body);

  if (fine) {
    ctx.fillStyle = gradient(ctx, -11, 0, 11, 0, [
      [0, `rgb(${shade(paint, 0.72)})`],
      [0.3, `rgb(${shade(paint, 0.32)})`],
      [0.5 - lean * 0.22, `rgb(${sheen(paint, 0.9)})`],
      [0.68, `rgb(${shade(paint, 0.25)})`],
      [1, `rgb(${shade(paint, 0.78)})`],
    ]);
  } else {
    ctx.fillStyle = `rgb(${shade(paint, 0.15)})`;
  }

  ctx.fill();

  if (fine) {
    mark(ctx, print, decal, paint);

    if (close) {
      // A gleam down the spine, where the body faces the light.
      ctx.strokeStyle = gradient(ctx, 0, -24, 0, 8, [[0, rgba(SHINE, 0)], [0.22, rgba(SHINE, 0.55)], [0.7, rgba(SHINE, 0.22)], [1, rgba(SHINE, 0)]]);
      ctx.lineWidth = 0.9;
      ctx.beginPath();
      ctx.moveTo(-lean * 2, -22);
      ctx.lineTo(-lean * 2.6, 6);
      ctx.stroke();
    }

    ctx.strokeStyle = litEdge(ctx, paint, -24, 10);
    ctx.lineWidth = 1;
    trace(ctx, print.body);
    ctx.stroke();
  }

  for (const engine of print.engines) {
    if (fine) {
      nacelle(ctx, paint, engine, rich);
    }

    nozzle(ctx, style, engine, rich);
  }

  // The fins stand up from the craft, so their tips go the way it leans.
  for (const [rootX, rootY, tipX, tipY] of print.fins) {
    const tip = tipX + lean * 7;

    trace(ctx, [[rootX - 1.6, rootY], [rootX + 1.6, rootY], [tip + 1, tipY + 5], [tip, tipY]]);
    ctx.fillStyle = rich
      ? gradient(ctx, rootX - 1.6, 0, tip + 1, 0, [[0, `rgb(${shade(paint, 0.5)})`], [1, `rgb(${sheen(paint, 0.45)})`]])
      : `rgb(${shade(paint, 0.3)})`;
    ctx.fill();
    ctx.strokeStyle = fine ? litEdge(ctx, paint, tipY, rootY) : `rgb(${paint})`;
    ctx.lineWidth = fine ? 1 : 1.2;
    ctx.stroke();
  }

  // The canopy: tinted glass in its frame, the sky in it.
  trace(ctx, print.canopy);

  if (fine) {
    canopyMaterial(ctx, paint, bank, sky);
  } else {
    ctx.fillStyle = `rgb(${GLASS})`;
    ctx.fill();
  }
}

/**
 * An engine's nacelle over its nozzle: a rounded housing, lit down its top.
 *
 * @param {CanvasRenderingContext2D} ctx
 * @param {string} paint
 * @param {readonly [number, number, number]} engine
 * @param {boolean} rich whether it is near enough to be shaded round
 */
function nacelle(ctx, paint, [x, y, wide], rich) {
  ctx.beginPath();
  ctx.ellipse(x, y - 4, wide * 1.25, wide * 1.6, 0, 0, TAU);
  ctx.fillStyle = rich
    ? gradient(ctx, x - wide * 1.25, 0, x + wide * 1.25, 0, [[0, `rgb(${shade(paint, 0.72)})`], [0.45, `rgb(${sheen(paint, 0.5)})`], [1, `rgb(${shade(paint, 0.78)})`]])
    : `rgb(${shade(paint, 0.4)})`;
  ctx.fill();
  ctx.strokeStyle = rgba(DARK, 0.5);
  ctx.lineWidth = 0.6;
  ctx.stroke();
}

/**
 * The saucer: rockets slung either side of its rim; a recessed underside; a disc of metal lit
 * from the middle out toward its rim, from the side it leans away from, polished to reflect the
 * sky, its rim lit where it faces the sky; a ring of plating, lights running round the rim, and
 * a glass dome with the sky in it.
 *
 * @param {CanvasRenderingContext2D} ctx
 * @param {CraftStyle} style
 * @param {boolean} fine
 */
function disc(ctx, style, fine) {
  const { paint, decal, bank, now, rockets } = style;
  const lean = Math.sin(bank);
  const sky = style.sky ?? SKY;
  const close = fine && style.scale >= POLISH_SCALE;
  const span = SAUCER.span;

  if (fine) {
    // Slung either side of the rim.
    ordnance(ctx, { guns: [], pods: SAUCER.pods + 10 }, rockets, () => [0, 4]);
    // The disc has a bevel and a recessed underside, not a single flat ellipse.
    ctx.beginPath();
    ctx.ellipse(0, 5.5, span, 10, 0, 0, TAU);
    ctx.fillStyle = `rgb(${shade(paint, 0.82)})`;
    ctx.fill();
    ctx.beginPath();
    ctx.ellipse(0, 5.5, span * 0.8, 5.5, 0, 0, TAU);
    ctx.strokeStyle = rgba(mixRgb(STEEL, LIGHT, 0.35), 0.5);
    ctx.lineWidth = 0.8;
    ctx.stroke();
  }

  ctx.beginPath();
  ctx.ellipse(0, 2, span, 10, 0, 0, TAU);

  if (fine) {
    const metal = ctx.createRadialGradient(-lean * 6, -2, 2, 0, 2, span);
    metal.addColorStop(0, `rgb(${sheen(paint, 0.7)})`);
    metal.addColorStop(0.45, `rgb(${shade(paint, 0.2)})`);
    metal.addColorStop(1, `rgb(${shade(paint, 0.7)})`);
    ctx.fillStyle = metal;
    ctx.fill();
    ctx.fillStyle = gradient(ctx, -span, 0, span, 0, [[0, rgba(DARK, 0.1 + Math.max(0, lean) * 0.45)], [0.5, rgba(DARK, 0)], [1, rgba(DARK, 0.1 + Math.max(0, -lean) * 0.45)]]);
  } else {
    ctx.fillStyle = `rgb(${shade(paint, 0.3)})`;
  }

  ctx.fill();

  if (close) {
    ctx.save();
    ctx.beginPath();
    ctx.ellipse(0, 2, span, 10, 0, 0, TAU);
    ctx.clip();
    ctx.fillStyle = gradient(ctx, lean * 8, -9, -lean * 8, 12, [[0, rgba(sky, 0.28)], [0.45, rgba(sky, 0.1)], [0.5, rgba(SHINE, 0.3)], [0.55, rgba(DARK, 0.14)], [1, rgba(DARK, 0.3)]]);
    ctx.fillRect(-span, -9, span * 2, 22);
    ctx.restore();
    ctx.beginPath();
    ctx.ellipse(0, 2, span, 10, 0, 0, TAU);
  }

  ctx.strokeStyle = fine ? litEdge(ctx, paint, -8, 12) : `rgb(${paint})`;
  ctx.lineWidth = fine ? 1.2 : 2;
  ctx.stroke();

  if (fine) {
    // The plating round the dome, and what the craft wears on it.
    ctx.beginPath();
    ctx.ellipse(0, 0.5, 19, 6, 0, 0, TAU);
    ctx.fillStyle = gradient(ctx, -19, -5, 19, 6, [[0, `rgb(${sheen(paint, 0.75)})`], [1, `rgb(${shade(paint, 0.3)})`]]);
    ctx.fill();
    ctx.strokeStyle = rgba(DARK, 0.55);
    ctx.lineWidth = 0.7;
    ctx.stroke();

    if (decal !== 'none') {
      const ink = decal === 'flames' ? rgba(PORT, 0.9) : rgba(DARK, 0.7);

      ctx.strokeStyle = ink;
      ctx.lineWidth = decal === 'chevrons' ? 1.6 : 2.2;
      ctx.beginPath();

      if (decal === 'chevrons') {
        for (const side of [-1, 1]) {
          ctx.moveTo(side * 26, 6);
          ctx.lineTo(side * 23, 1);
          ctx.lineTo(side * 20, 6);
        }
      } else if (decal === 'signal') {
        // The signal going out from the front of the rim, in rings.
        for (const radius of [17, 22.5]) {
          ctx.moveTo(Math.cos(Math.PI * 0.3) * radius, 1.2 + Math.sin(Math.PI * 0.3) * radius * 0.32);
          ctx.ellipse(0, 1.2, radius, radius * 0.32, 0, Math.PI * 0.3, Math.PI * 0.7);
        }
      } else {
        ctx.ellipse(0, 1.2, 24.5, 7.8, 0, Math.PI * 0.12, Math.PI * 0.88);
      }

      ctx.stroke();
    }

    // Close-up armour segmentation; omit sub-pixel service joints on distant saucers.
    if (close) {
      ctx.strokeStyle = rgba(DARK, 0.55);
      ctx.lineWidth = 0.8;
      ctx.beginPath();

      for (let segment = 0; segment < 12; segment += 1) {
        const angle = (segment / 12) * TAU;
        ctx.moveTo(Math.cos(angle) * 20, 1.2 + Math.sin(angle) * 6);
        ctx.lineTo(Math.cos(angle) * 29.5, 2 + Math.sin(angle) * 9);
      }

      ctx.stroke();
    }

    // Lights round the rim, one after another, each a little lamp.
    const lit = now === 0 ? 0 : Math.floor(now / 140) % 7;

    for (let light = 0; light < 7; light += 1) {
      const at = -24 + light * 8;
      const y = 6.3 - Math.abs(at) * 0.07;

      if (light === lit) {
        ctx.fillStyle = rgba(HOT, 0.3);
        ctx.beginPath();
        ctx.arc(at, y, 3.2, 0, TAU);
        ctx.fill();
      }

      ctx.fillStyle = light === lit ? `rgb(${HOT})` : `rgb(${sheen(paint, 1)})`;
      ctx.beginPath();
      ctx.arc(at, y, 1.25, 0, TAU);
      ctx.fill();
    }
  }

  // The dome: glass with the sky in it, a curve of light across it, in its frame.
  ctx.beginPath();
  ctx.ellipse(0, -1, 10.5, 12, 0, Math.PI, TAU);
  ctx.ellipse(0, -1, 10.5, 4, 0, 0, Math.PI);

  if (fine) {
    ctx.fillStyle = gradient(ctx, lean * 3, -13, -lean * 3, 3, [[0, `rgb(${mixRgb(GLASS, sky, 0.55)})`], [0.4, `rgb(${mixRgb(GLASS, sky, 0.18)})`], [0.62, `rgb(${GLASS})`], [1, `rgb(${mixRgb(GLASS, paint, 0.16)})`]]);
  } else {
    ctx.fillStyle = `rgb(${GLASS})`;
  }

  ctx.fill();

  if (fine) {
    ctx.strokeStyle = rgba(mixRgb(STEEL, LIGHT, 0.5), 0.85);
    ctx.lineWidth = 0.9;
    ctx.stroke();
    ctx.strokeStyle = rgba(SHINE, 0.55);
    ctx.lineWidth = 0.8;
    ctx.beginPath();
    ctx.ellipse(0, -1, 8, 9.5, 0, Math.PI * 1.12, Math.PI * 1.45);
    ctx.stroke();
  }
}

/**
 * A racing craft, where and as large as its style says. Its fire is painted first, then its
 * plates over it; then the light on its canopy, which on the player's craft is the color of a
 * paddle's core, where a paddle's core would be; and last the lights on its wing tips, red to
 * port and green to starboard, as on anything that flies.
 *
 * @param {CanvasRenderingContext2D} ctx
 * @param {CraftStyle} style
 */
export function drawHull(ctx, style) {
  const { kind, cockpit, x, y, scale, bank, now } = style;
  const print = kind === 'saucer' ? null : BLUEPRINTS[kind];
  const engines = print ? print.engines : SAUCER.engines;
  const span = print ? print.span : SAUCER.span;
  const fine = scale >= DETAIL_SCALE;

  ctx.save();
  ctx.translate(x, y);
  ctx.scale(scale, scale);
  ctx.rotate(bank);
  // Subtle perspective shear without a GPU or a second renderer. The bank remains
  // independent, so the apparent side-slip and nose attitude do not change steering.
  if (style.yaw || style.pitch) {
    const yaw = Math.max(-0.4, Math.min(0.4, style.yaw ?? 0));
    const pitch = Math.max(-0.3, Math.min(0.3, style.pitch ?? 0));
    ctx.transform(1 - Math.abs(yaw) * 0.17, pitch * 0.11, yaw * 0.27, 1 + pitch * 0.15, 0, 0);
  }

  for (const engine of engines) {
    exhaust(ctx, style, engine, fine && scale >= RICH_SCALE);
  }

  if (print) {
    plates(ctx, style, print, fine);
  } else {
    disc(ctx, style, fine);
  }

  // Sculpted metal facets, actuated surfaces, turbine detail and battle wear.
  // The near-only pass is kept behind the unique cockpit beacon and navigation lights.
  if (fine && scale >= POLISH_SCALE) {
    drawAirframeDetails(ctx, {
      kind, paint: style.paint, span, bank,
      yaw: style.yaw ?? 0, pitch: style.pitch ?? 0,
      active: style.active ?? false, damage: style.damage ?? 0, engines,
    });
  }

  // The light on the canopy.
  ctx.fillStyle = cockpit;
  roundedRect(ctx, -3.4, -11, 6.8, 13, 3.4);
  ctx.fill();

  if (fine) {
    // Glass over the lit cockpit: the top of it reflects the sky and catches a curve of light.
    // Only the top: the board is read for the player's craft along the bottom of the light.
    ctx.fillStyle = gradient(ctx, 0, -11, 0, -4.6, [[0, rgba(mixRgb(GLASS, style.sky ?? SKY, 0.4), 0.62)], [1, rgba(GLASS, 0)]]);
    roundedRect(ctx, -3.4, -11, 6.8, 6.4, 3.4);
    ctx.fill();
    ctx.strokeStyle = rgba(SHINE, 0.7);
    ctx.lineWidth = 0.6;
    ctx.beginPath();
    ctx.moveTo(-1.9, -10.2);
    ctx.quadraticCurveTo(-2.9, -8.4, -2.6, -5.6);
    ctx.stroke();
  }

  if (fine) {
    // Wing-tip lights: they blink, port and starboard in turn, each a lamp in its own glow.
    const blink = now === 0 ? 1 : Math.floor(now / 380) % 2;

    navigationLight(ctx, PORT, -span + 0.9, 5.8, blink === 0);
    navigationLight(ctx, STARBOARD, span - 0.9, 5.8, blink === 1);

    // And the strobe on its tail, a short flash a little more than once a second; not with the
    // clock stopped, so never with motion reduced.
    if (now !== 0 && (now + span * 37) % STROBE_MS < STROBE_ON_MS) {
      navigationLight(ctx, STROBE, 0, print ? Math.max(...print.body.map(([, y]) => y)) + 1.5 : -12, true);
    }
  }

  ctx.restore();
}

/** The tail strobe flashes this long, this often, in milliseconds. */
const STROBE_MS = 1300;
const STROBE_ON_MS = 70;

/**
 * A navigation light: a small lamp, and round it, while it is lit, a soft glow painted over
 * the craft, never added to it, so a green one cannot brighten a pink sky into a paddle's core.
 *
 * @param {CanvasRenderingContext2D} ctx
 * @param {string} rgb
 * @param {number} x
 * @param {number} y
 * @param {boolean} lit
 */
function navigationLight(ctx, rgb, x, y, lit) {
  if (lit) {
    ctx.fillStyle = rgba(rgb, 0.28);
    ctx.beginPath();
    ctx.arc(x, y, 3.6, 0, TAU);
    ctx.fill();
  }

  ctx.fillStyle = rgba(rgb, lit ? 1 : 0.45);
  ctx.beginPath();
  ctx.arc(x, y, 1.5, 0, TAU);
  ctx.fill();
}

/**
 * The light a craft throws on the lane under it, in the color of its glow.
 *
 * @param {CanvasRenderingContext2D} ctx
 * @param {string} rgb
 * @param {number} x
 * @param {number} y
 * @param {number} radius
 * @param {number} strength 0 to 1
 */
export function drawUnderglow(ctx, rgb, x, y, radius, strength) {
  const light = ctx.createRadialGradient(x, y, 0, x, y, radius);

  light.addColorStop(0, `rgba(${rgb}, ${0.5 * strength})`);
  light.addColorStop(0.6, `rgba(${rgb}, ${0.16 * strength})`);
  light.addColorStop(1, `rgba(${rgb}, 0)`);
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(1, 0.3);
  ctx.translate(-x, -y);
  ctx.fillStyle = light;
  ctx.fillRect(x - radius, y - radius, radius * 2, radius * 2);
  ctx.restore();
}

/**
 * A shield round a craft: a bubble that shimmers, and a second ring while two are up.
 *
 * @param {CanvasRenderingContext2D} ctx
 * @param {number} x
 * @param {number} y
 * @param {number} scale
 * @param {number} shields how many are up
 * @param {number} now milliseconds; 0 holds it still
 */
export function drawShield(ctx, x, y, scale, shields, now) {
  const rgb = '96, 165, 250';
  const shimmer = now === 0 ? 0.5 : 0.5 + 0.25 * Math.sin(now / 160);

  ctx.save();
  ctx.translate(x, y - 3 * scale);
  ctx.lineWidth = 1.6;

  for (let ring = 0; ring < Math.min(shields, 2); ring += 1) {
    const wide = (46 + ring * 6) * scale;
    const tall = (25 + ring * 5) * scale;

    ctx.beginPath();
    ctx.ellipse(0, 0, wide, tall, 0, 0, Math.PI * 2);

    if (ring === 0) {
      ctx.fillStyle = `rgba(${rgb}, 0.08)`;
      ctx.fill();
    }

    ctx.strokeStyle = `rgba(${rgb}, ${shimmer - ring * 0.15})`;
    ctx.stroke();
  }

  // A glint that runs round the bubble.
  const turn = now === 0 ? 4 : now / 300;

  ctx.strokeStyle = `rgba(${LIGHT}, 0.55)`;
  ctx.beginPath();
  ctx.ellipse(0, 0, 46 * scale, 25 * scale, 0, turn, turn + 0.5);
  ctx.stroke();
  ctx.restore();
}

/**
 * The craft as it stands in the hangar: on a lit pad over a floor of neon lines, from the
 * same side it is seen in a race, its engines idling.
 *
 * @param {HTMLCanvasElement} canvas
 * @param {Loadout} loadout
 */
export function drawCraftPortrait(canvas, loadout) {
  const ctx = canvas.getContext('2d');

  if (!ctx) {
    return;
  }

  const { width, height } = canvas;
  const x = width / 2;
  const y = height * 0.52;
  const scale = Math.min(width / 96, height / 54);
  const floor = height * 0.78;
  const back = ctx.createRadialGradient(x, floor, 0, x, floor, width * 0.6);

  ctx.clearRect(0, 0, width, height);
  back.addColorStop(0, `rgba(${loadout.glow}, 0.2)`);
  back.addColorStop(1, `rgba(${loadout.glow}, 0)`);
  ctx.fillStyle = back;
  ctx.fillRect(0, 0, width, height);

  // The floor: lines running away to a point behind the craft, and across.
  ctx.strokeStyle = `rgba(${THEME.violet}, 0.28)`;
  ctx.lineWidth = Math.max(1, scale * 0.25);
  ctx.beginPath();

  for (let line = -6; line <= 6; line += 1) {
    ctx.moveTo(x + line * width * 0.02, height * 0.56);
    ctx.lineTo(x + line * width * 0.16, height);
  }

  for (const depth of [0.62, 0.7, 0.82, 0.98]) {
    ctx.moveTo(0, height * depth);
    ctx.lineTo(width, height * depth);
  }

  ctx.stroke();

  // The pad it stands on, and its own light on it.
  ctx.strokeStyle = `rgba(${loadout.glow}, 0.8)`;
  ctx.lineWidth = Math.max(1.5, scale * 0.5);
  ctx.beginPath();
  ctx.ellipse(x, floor, scale * 42, scale * 7, 0, 0, Math.PI * 2);
  ctx.stroke();
  drawUnderglow(ctx, loadout.glow, x, floor, scale * 46, 1);
  drawHull(ctx, {
    kind: loadout.kind,
    paint: loadout.paint,
    decal: loadout.decal,
    glow: loadout.glow,
    cockpit: THEME.side.player.core,
    x,
    y,
    scale,
    bank: 0,
    flame: 0.45,
    nitro: false,
    rockets: loadout.rockets,
    now: 0,
    glows: null,
  });

  if (loadout.shields > 0) {
    drawShield(ctx, x, y, scale, loadout.shields, 0);
  }
}
