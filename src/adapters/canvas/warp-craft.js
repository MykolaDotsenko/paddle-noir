import { mixRgb, roundedRect, THEME } from './theme.js';

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
 * @property {string} decal none, stripes, chevrons or flames
 * @property {string} glow "r, g, b": the light under it and in its engines
 * @property {string} cockpit a color: the light on its canopy
 * @property {number} x
 * @property {number} y
 * @property {number} scale
 * @property {number} bank radians it leans, or turns while it spins
 * @property {number} flame 0 to 1 and a little more
 * @property {boolean} nitro whether it burns nitro: a longer, blue flame
 * @property {number} rockets how many hang under its wings
 * @property {number} now milliseconds, for the lights that blink; 0 holds them still
 * @property {GlowSprites | null} glows the glow sprites, or null to shade each glow in place
 */

/** How large the player's own craft is drawn: it is the nearest to the eye. */
export const CRAFT_SCALE = 1.2;
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
 * The fire out of an engine, toward the eye: a cone in the color of the craft's light round a
 * hot one. Nitro burns longer and blue, with the knots of a jet at full thrust in it. The
 * flames are painted over what is under them, never added to it: added, they would burn out
 * to the white kept for the ball.
 *
 * @param {CanvasRenderingContext2D} ctx
 * @param {CraftStyle} style
 * @param {readonly [number, number, number]} engine
 */
function exhaust(ctx, { flame, nitro, glow: rgb, glows }, [x, y, wide]) {
  const length = wide * (1.2 + flame * (nitro ? 7.5 : 5.2));
  const outer = nitro ? NITRO : rgb;
  const inner = nitro ? NITRO_HOT : HOT;

  glow(ctx, glows, outer, x, y + 4, 15 + wide * 1.5);
  ctx.fillStyle = `rgba(${outer}, ${0.45 + Math.min(1, flame) * 0.35})`;
  trace(ctx, [[x - wide, y], [x - wide * 0.55, y + length * 0.45], [x, y + length], [x + wide * 0.55, y + length * 0.45], [x + wide, y]]);
  ctx.fill();
  ctx.fillStyle = `rgba(${inner}, 0.92)`;
  trace(ctx, [[x - wide * 0.55, y], [x, y + length * 0.55], [x + wide * 0.55, y]]);
  ctx.fill();

  if (nitro) {
    ctx.fillStyle = `rgba(${NITRO_HOT}, 0.85)`;

    for (const along of [0.3, 0.5, 0.68]) {
      ctx.beginPath();
      ctx.ellipse(x, y + length * along, wide * (0.5 - along * 0.4), wide * 0.28, 0, 0, Math.PI * 2);
      ctx.fill();
    }
  }
}

/**
 * A nozzle: a dark ring with the fire in its throat.
 *
 * @param {CanvasRenderingContext2D} ctx
 * @param {CraftStyle} style
 * @param {readonly [number, number, number]} engine
 */
function nozzle(ctx, { nitro, glow: rgb }, [x, y, wide]) {
  ctx.beginPath();
  ctx.ellipse(x, y, wide, wide * 0.5, 0, 0, Math.PI * 2);
  ctx.fillStyle = `rgb(${STEEL})`;
  ctx.fill();
  ctx.lineWidth = 0.9;
  ctx.strokeStyle = `rgb(${mixRgb(STEEL, LIGHT, 0.35)})`;
  ctx.stroke();
  ctx.beginPath();
  ctx.ellipse(x, y, wide * 0.66, wide * 0.3, 0, 0, Math.PI * 2);
  ctx.fillStyle = `rgb(${nitro ? NITRO_HOT : mixRgb(rgb, HOT, 0.6)})`;
  ctx.fill();
}

/**
 * What a craft wears over its paint, within its own outline: two stripes nose to tail, a
 * chevron on each wing, or flames back from the nose.
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
 * The plated crafts: wings shaded from root to tip, a body rounded by its shading, guns,
 * rockets, fins that lean with the craft, panel lines and a lit edge in the paint.
 *
 * @param {CanvasRenderingContext2D} ctx
 * @param {CraftStyle} style
 * @param {Blueprint} print
 * @param {boolean} fine whether it is near enough for its details
 */
function plates(ctx, style, print, fine) {
  const { paint, decal, bank, rockets } = style;
  const lean = Math.sin(bank);

  // The wings, lit along the span from the side the craft leans away from.
  trace(ctx, print.wings);

  if (fine) {
    const across = ctx.createLinearGradient(-print.span, 0, print.span, 0);

    across.addColorStop(0, `rgb(${shade(paint, 0.45 + lean * 0.2)})`);
    across.addColorStop(0.5, `rgb(${shade(paint, 0.2)})`);
    across.addColorStop(1, `rgb(${shade(paint, 0.45 - lean * 0.2)})`);
    ctx.fillStyle = across;
  } else {
    ctx.fillStyle = `rgb(${shade(paint, 0.35)})`;
  }

  ctx.fill();

  if (fine) {
    // Panel lines, flaps and all.
    ctx.strokeStyle = `rgba(${DARK}, 0.55)`;
    ctx.lineWidth = 0.7;
    ctx.beginPath();

    for (const side of [-1, 1]) {
      ctx.moveTo(side * print.span * 0.36, -4);
      ctx.lineTo(side * print.span * 0.42, 8);
      ctx.moveTo(side * print.span * 0.66, 0);
      ctx.lineTo(side * print.span * 0.7, 8);
      ctx.moveTo(side * print.span * 0.4, 5.5);
      ctx.lineTo(side * print.span * 0.86, 5.5);
    }

    ctx.stroke();

    // Rockets under the wings, as many as it carries.
    for (let rocket = 0; rocket < Math.min(rockets, 4); rocket += 1) {
      const side = rocket % 2 === 0 ? -1 : 1;
      const at = side * (print.pods - Math.floor(rocket / 2) * 5);

      ctx.fillStyle = `rgb(${LIGHT})`;
      roundedRect(ctx, at - 1.3, -3, 2.6, 11, 1.3);
      ctx.fill();
      ctx.fillStyle = `rgb(${PORT})`;
      ctx.fillRect(at - 1.3, -3, 2.6, 2.4);
    }

    // The guns: barrels ahead of the wing, a spark of light at each muzzle.
    for (const out of print.guns) {
      for (const side of [-1, 1]) {
        ctx.fillStyle = `rgb(${STEEL})`;
        ctx.fillRect(side * out - 1, -9, 2, 10);
        ctx.fillStyle = `rgb(${sheen(paint, 1)})`;
        ctx.fillRect(side * out - 1, -9, 2, 1.6);
      }
    }
  }

  ctx.lineJoin = 'round';
  ctx.strokeStyle = `rgb(${paint})`;
  ctx.lineWidth = fine ? 1.4 : 2;
  trace(ctx, print.wings);
  ctx.stroke();

  // The body, rounded: dark at its sides and lit down its back.
  trace(ctx, print.body);

  if (fine) {
    const round = ctx.createLinearGradient(-11, 0, 11, 0);

    round.addColorStop(0, `rgb(${shade(paint, 0.55)})`);
    round.addColorStop(0.5 - lean * 0.25, `rgb(${sheen(paint, 1)})`);
    round.addColorStop(1, `rgb(${shade(paint, 0.55)})`);
    ctx.fillStyle = round;
  } else {
    ctx.fillStyle = `rgb(${shade(paint, 0.15)})`;
  }

  ctx.fill();

  if (fine) {
    mark(ctx, print, decal, paint);
    ctx.strokeStyle = `rgb(${shade(paint, 0.25)})`;
    ctx.lineWidth = 1;
    trace(ctx, print.body);
    ctx.stroke();
  }

  for (const engine of print.engines) {
    nozzle(ctx, style, engine);
  }

  // The fins stand up from the craft, so their tips go the way it leans.
  for (const [rootX, rootY, tipX, tipY] of print.fins) {
    const tip = tipX + lean * 7;

    trace(ctx, [[rootX - 1.6, rootY], [rootX + 1.6, rootY], [tip + 1, tipY + 5], [tip, tipY]]);
    ctx.fillStyle = `rgb(${shade(paint, 0.3)})`;
    ctx.fill();
    ctx.strokeStyle = `rgb(${paint})`;
    ctx.lineWidth = 1.2;
    ctx.stroke();
  }

  // The canopy: dark glass, with the sky in it.
  trace(ctx, print.canopy);
  ctx.fillStyle = `rgb(${GLASS})`;
  ctx.fill();

  if (fine) {
    ctx.strokeStyle = `rgba(${LIGHT}, 0.5)`;
    ctx.lineWidth = 0.8;
    ctx.stroke();
  }
}

/**
 * The saucer: a disc with lights running round its rim, a ring of plating, and a dome.
 *
 * @param {CanvasRenderingContext2D} ctx
 * @param {CraftStyle} style
 * @param {boolean} fine
 */
function disc(ctx, style, fine) {
  const { paint, decal, bank, now, rockets } = style;
  const lean = Math.sin(bank);

  ctx.beginPath();
  ctx.ellipse(0, 2, SAUCER.span, 10, 0, 0, Math.PI * 2);

  if (fine) {
    const across = ctx.createLinearGradient(-SAUCER.span, 0, SAUCER.span, 0);

    across.addColorStop(0, `rgb(${shade(paint, 0.55 + lean * 0.2)})`);
    across.addColorStop(0.5, `rgb(${shade(paint, 0.15)})`);
    across.addColorStop(1, `rgb(${shade(paint, 0.55 - lean * 0.2)})`);
    ctx.fillStyle = across;
  } else {
    ctx.fillStyle = `rgb(${shade(paint, 0.3)})`;
  }

  ctx.fill();
  ctx.strokeStyle = `rgb(${paint})`;
  ctx.lineWidth = fine ? 1.4 : 2;
  ctx.stroke();

  if (fine) {
    // The plating round the dome, and what the craft wears on it.
    ctx.beginPath();
    ctx.ellipse(0, 0.5, 19, 6, 0, 0, Math.PI * 2);
    ctx.fillStyle = `rgb(${sheen(paint, 0.7)})`;
    ctx.fill();
    ctx.strokeStyle = `rgba(${DARK}, 0.55)`;
    ctx.lineWidth = 0.7;
    ctx.stroke();

    if (decal !== 'none') {
      const ink = decal === 'flames' ? `rgba(${PORT}, 0.9)` : `rgba(${DARK}, 0.7)`;

      ctx.strokeStyle = ink;
      ctx.lineWidth = decal === 'chevrons' ? 1.6 : 2.2;
      ctx.beginPath();

      if (decal === 'chevrons') {
        for (const side of [-1, 1]) {
          ctx.moveTo(side * 26, 6);
          ctx.lineTo(side * 23, 1);
          ctx.lineTo(side * 20, 6);
        }
      } else {
        ctx.ellipse(0, 1.2, 24.5, 7.8, 0, Math.PI * 0.12, Math.PI * 0.88);
      }

      ctx.stroke();
    }

    // Lights round the rim, one after another.
    const lit = now === 0 ? 0 : Math.floor(now / 140) % 7;

    for (let light = 0; light < 7; light += 1) {
      const at = -24 + light * 8;

      ctx.fillStyle = light === lit ? `rgb(${HOT})` : `rgb(${sheen(paint, 1)})`;
      ctx.fillRect(at - 1.3, 5.2 - Math.abs(at) * 0.07, 2.6, 2.2);
    }

    for (let rocket = 0; rocket < Math.min(rockets, 4); rocket += 1) {
      const at = (rocket % 2 === 0 ? -1 : 1) * (SAUCER.pods - Math.floor(rocket / 2) * 5);

      ctx.fillStyle = `rgb(${LIGHT})`;
      roundedRect(ctx, at - 1.3, -5, 2.6, 10, 1.3);
      ctx.fill();
      ctx.fillStyle = `rgb(${PORT})`;
      ctx.fillRect(at - 1.3, -5, 2.6, 2.4);
    }
  }

  // The dome.
  ctx.beginPath();
  ctx.ellipse(0, -1, 10.5, 12, 0, Math.PI, Math.PI * 2);
  ctx.ellipse(0, -1, 10.5, 4, 0, 0, Math.PI);
  ctx.fillStyle = `rgb(${GLASS})`;
  ctx.fill();

  if (fine) {
    ctx.strokeStyle = `rgba(${LIGHT}, 0.5)`;
    ctx.lineWidth = 0.8;
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

  for (const engine of engines) {
    exhaust(ctx, style, engine);
  }

  if (print) {
    plates(ctx, style, print, fine);
  } else {
    disc(ctx, style, fine);
  }

  // The light on the canopy.
  ctx.fillStyle = cockpit;
  roundedRect(ctx, -3.4, -11, 6.8, 13, 3.4);
  ctx.fill();

  if (fine) {
    // A glint down the glass, beside the light.
    ctx.strokeStyle = `rgba(${LIGHT}, 0.45)`;
    ctx.lineWidth = 0.7;
    ctx.beginPath();
    ctx.moveTo(-3.9, -9);
    ctx.lineTo(-3.9, -2);
    ctx.stroke();

    // Wing-tip lights: they blink, port and starboard in turn.
    const blink = now === 0 ? 1 : Math.floor(now / 380) % 2;

    ctx.fillStyle = `rgba(${PORT}, ${blink === 0 ? 1 : 0.45})`;
    ctx.fillRect(-span - 0.5, 4.4, 2.8, 2.8);
    ctx.fillStyle = `rgba(${STARBOARD}, ${blink === 1 ? 1 : 0.45})`;
    ctx.fillRect(span - 2.3, 4.4, 2.8, 2.8);
  }

  ctx.restore();
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
