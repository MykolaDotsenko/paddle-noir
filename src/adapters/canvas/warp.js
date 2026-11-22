import { curveAt, heightAt, ITEM_RADIUS, itemX, laneX, onRumble } from '../../domain/warp.js';
import { FONT, mixRgb, roundedRect, SUPER_STYLE, THEME } from './theme.js';
import { drawCell, drawCrate, drawHullBar, weapons } from './warp-combat.js';
import { CRAFT_SCALE, drawHull, drawShield, drawUnderglow } from './warp-craft.js';
import { CORE_LIGHT, drawDust, drawSky, fogLevel, hash, HORIZON, LOOKS, PAD, paletteOf, roadside } from './warp-scenery.js';

/**
 * The Warp game on the canvas, seen from just behind the player's craft: a neon lane that
 * bends away and rolls over hills, what is on it, the rivals, and the craft where the paddle
 * would be. The course is projected a stretch at a time, as the arcade racers did: each
 * stretch nearer is lower on the board and wider, and everything is painted from the farthest
 * to the nearest, so a hill hides what is behind it. The camera leans into a bend. What
 * surrounds the course is in `canvas/warp-scenery.js`, the craft themselves in
 * `canvas/warp-craft.js`, their weapons in `canvas/warp-combat.js`, and what is written over
 * it all in `canvas/warp-hud.js`. Each function draws onto a context already scaled to board
 * coordinates, and does nothing in any other game. Nothing here is the pure white kept for the
 * ball.
 *
 * @import { Course, GameConfig, GameState, Pilot, Racer, TrackItem, WarpConfig, WarpState } from '../../domain/types.js'
 * @import { GlowSprites } from './court.js'
 * @import { Scene, Spot, Sprite, View } from './warp-scenery.js'
 *
 * @typedef {{ left: Spot, right: Spot, stretch: number }} Row the lane's two edges at the start of a stretch
 */

/** The eye is this far behind the player's craft. */
const EYE_BEHIND = 7;
/** Things nearer the eye than this are out of sight. */
const NEAR = 0.7;
/** How far ahead the lane is drawn, in stretches. */
const DRAW_STRETCHES = 64;
/** How hard a bend of 1 turns the lane, across it, for each stretch along it. */
const BEND = 0.02;
/** The lane's edge, rumble strips and all, in half lanes from its middle. */
const LANE = 1.08;
/** How far the camera leans for a bend of 1, and at most, in radians. */
const LEAN_PER_BEND = 0.022;
const MAX_LEAN = 0.045;
/** How high a jump lifts a craft at its top, and where the rings in the air hang, in half lanes. */
const JUMP_LIFT = 0.42;
const AIR_RING_LIFT = 0.4;
/** A rival's name shows above its craft while it is this near. */
const NAME_TAG_METERS = 40;
/** The blue of nitro: its fire, its light on the lane and its streaks. */
const NITRO_LIGHT = '125, 211, 252';
/** Lines on the ground beside the lane, in half lanes from its middle. */
const GRID_LINES = Object.freeze([-9, -6.5, -4.5, -3, -2, 2, 3, 4.5, 6.5, 9]);
const STRIP_DARK = 'rgba(5, 6, 15, 0.9)';
const CHECKER = 'rgba(226, 232, 240, 0.85)';

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
 * @param {number} value
 * @param {number} min
 * @param {number} max
 */
function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

/**
 * The course as the eye sees it for a frame. The eye rides behind the craft at its own height
 * above the lane there, so the craft is always where the paddle would be, and the lane under
 * it spans the paddle's reach; the hills ahead rise above that and the dips fall below.
 *
 * @param {WarpState} race
 * @param {GameConfig} config
 * @returns {View}
 */
export function viewOf(race, config) {
  const rules = /** @type {WarpConfig} */ (config.warp);
  const { course } = race;
  const craftY = config.height - config.paddle.inset - config.paddle.height / 2;
  const reach = (config.width - config.paddle.width) / 2;
  const tall = (craftY - HORIZON) * EYE_BEHIND;
  const wide = reach * EYE_BEHIND;
  const eye = race.z - EYE_BEHIND;
  const line = lineOf(course);
  const here = race.z / rules.segment;
  const [hereAt, heading] = middleAt(line, course.curves, here);
  const base = heightAt(course, race.z);

  /** @type {View['project']} */
  const project = (z, x, lift = 0) => {
    const depth = z - eye;

    if (depth < NEAR) {
      return null;
    }

    const stretch = z / rules.segment;
    // The lane's middle there, measured from the line straight ahead of the craft.
    const [at] = middleAt(line, course.curves, stretch);
    const across = at - hereAt - heading * (stretch - here);
    const scale = EYE_BEHIND / depth;

    return {
      x: config.width / 2 + (across + x) * (wide / depth),
      y: HORIZON + (tall / depth) * (1 - (heightAt(course, z) - base)) - lift * reach * scale,
      scale,
      depth,
    };
  };

  // The camera leans into the bend the craft is in and about to be in.
  let bends = 0;

  for (let ahead = -2; ahead < 10; ahead += 1) {
    bends += curveAt(course, race.z + ahead * rules.segment, rules);
  }

  const far = eye + DRAW_STRETCHES * rules.segment;
  const end = /** @type {Spot} */ (project(far, 0));

  return {
    project,
    eye,
    far,
    heading,
    // Level on a straight: no lean, rather than a lean of minus nothing.
    lean: clamp((-bends / 12) * LEAN_PER_BEND, -MAX_LEAN, MAX_LEAN) || 0,
    vanish: { x: end.x, y: Math.min(end.y, HORIZON + 40) },
    craftY,
    reach,
    segment: rules.segment,
  };
}

/**
 * The Warp game: the sky and what is on its horizon, then the lane and everything on it and
 * beside it from the farthest to the nearest, the player's craft among them, and the dust in
 * the air. With motion reduced the camera does not lean and nothing streams past.
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
  /** @type {Scene} */
  const scene = { ctx, look, palette: paletteOf(look), view, race, config, now, glows, still: reducedMotion };

  ctx.save();

  if (!reducedMotion && view.lean !== 0) {
    // About the craft, so it stays where the paddle is.
    ctx.translate(state.player.x, view.craftY);
    ctx.rotate(view.lean);
    ctx.translate(-state.player.x, -view.craftY);
  }

  drawSky(scene);

  const sprites = [...lanePieces(scene), ...field(scene, state), ...roadside(scene)];
  sprites.sort((a, b) => b.depth - a.depth);

  for (const sprite of sprites) {
    sprite.draw();
  }

  if (!reducedMotion) {
    drawDust(scene);
  }

  ctx.restore();

  if (!reducedMotion) {
    drawRush(scene);
  }
}

/**
 * The lane, a piece a stretch: each is painted in its turn among everything else, far to near.
 *
 * @param {Scene} scene
 * @returns {Sprite[]}
 */
function lanePieces(scene) {
  const { view } = scene;
  const first = Math.floor(view.eye / view.segment);
  /** @type {Row[]} */
  const rows = [];

  for (let stretch = first; stretch <= first + DRAW_STRETCHES; stretch += 1) {
    const left = view.project(stretch * view.segment, -LANE);
    const right = view.project(stretch * view.segment, LANE);

    if (left && right) {
      rows.push({ left, right, stretch });
    }
  }

  return rows.slice(1).map((far, index) => ({ depth: far.left.depth, draw: () => drawPiece(scene, rows[index], far) }));
}

/**
 * A stretch of the course: the ground it lies on, with its grid, or the sides of the slab where
 * the lane hangs in the air; its surface, in bands that rush toward the craft; its rumble
 * strips and dashed lines; and its two glowing edges. A stretch over a crest, facing away, is
 * not there to be seen.
 *
 * @param {Scene} scene
 * @param {Row} near
 * @param {Row} far
 */
function drawPiece({ ctx, palette, race, view, config }, near, far) {
  if (far.left.y >= near.left.y) {
    return;
  }

  const level = fogLevel(far.left.depth);
  // Whole stretches, counted from before the start line too.
  const band = (Math.floor(near.stretch / 2) & 1) === 0;
  const finish = near.stretch * view.segment <= race.course.length && far.stretch * view.segment > race.course.length;

  if (palette.ground) {
    ctx.fillStyle = palette.ground[Math.floor(near.stretch / 4) & 1][level];
    ctx.fillRect(-PAD, far.left.y, config.width + PAD * 2, near.left.y - far.left.y + 1);

    if (palette.grid) {
      const nearMiddle = (near.left.x + near.right.x) / 2;
      const nearUnit = (near.right.x - near.left.x) / (LANE * 2);
      const farMiddle = (far.left.x + far.right.x) / 2;
      const farUnit = (far.right.x - far.left.x) / (LANE * 2);

      ctx.strokeStyle = palette.grid;
      ctx.lineWidth = 1;
      ctx.beginPath();

      if (near.stretch % 3 === 0) {
        ctx.moveTo(-PAD, near.left.y);
        ctx.lineTo(config.width + PAD, near.left.y);
      }

      for (const offset of GRID_LINES) {
        ctx.moveTo(nearMiddle + offset * nearUnit, near.left.y);
        ctx.lineTo(farMiddle + offset * farUnit, far.left.y);
      }

      ctx.stroke();
    }
  } else {
    // The lane is a slab hanging in the air: its sides show under its edges.
    for (const side of /** @type {const} */ (['left', 'right'])) {
      quad(ctx, near[side], far[side], { x: far[side].x, y: far[side].y + 18 * far[side].scale }, { x: near[side].x, y: near[side].y + 18 * near[side].scale }, palette.skirt);
    }
  }

  // The surface.
  quad(ctx, near.left, near.right, far.right, far.left, palette.lane[band ? 0 : 1][level]);

  // Rumble strips.
  const strip = band ? palette.stripe : STRIP_DARK;
  quad(ctx, near.left, inset(near, 0.05), inset(far, 0.05), far.left, strip);
  quad(ctx, inset(near, 0.95), near.right, far.right, inset(far, 0.95), strip);

  // Dashed lines a third of the way in from each edge.
  if (band) {
    for (const share of [0.355, 0.645]) {
      quad(ctx, inset(near, share - 0.004), inset(near, share + 0.004), inset(far, share + 0.004), inset(far, share - 0.004), palette.dash);
    }
  }

  if (finish) {
    for (let square = 0; square < 12; square += 2) {
      quad(ctx, inset(near, square / 12), inset(near, (square + 1) / 12), inset(far, (square + 1) / 12), inset(far, square / 12), CHECKER);
    }
  }

  // The edges, glowing.
  ctx.lineCap = 'round';

  for (const [width, style] of /** @type {[number, string][]} */ ([[7, palette.edgeGlow], [2.4, palette.edgeCore]])) {
    ctx.strokeStyle = style;
    ctx.lineWidth = width;
    ctx.beginPath();
    ctx.moveTo(near.left.x, near.left.y);
    ctx.lineTo(far.left.x, far.left.y);
    ctx.moveTo(near.right.x, near.right.y);
    ctx.lineTo(far.right.x, far.right.y);
    ctx.stroke();
  }
}

/**
 * @param {Row} row
 * @param {number} share from 0 at the lane's left edge to 1 at its right
 * @returns {{ x: number, y: number }} that far across the lane there
 */
function inset(row, share) {
  return { x: row.left.x + (row.right.x - row.left.x) * share, y: row.left.y };
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
 * How high a craft in the air is: up and down again over its jump.
 *
 * @param {number} air seconds of the jump left
 * @param {WarpConfig} rules
 * @returns {number} in half lanes
 */
function liftOf(air, rules) {
  return air > 0 ? Math.sin(Math.PI * (1 - air / rules.airSeconds)) * JUMP_LIFT : 0;
}

/**
 * Everything on the lane: what the course has on it, the mines dropped on it, the finish
 * gantry, the rivals, the player's craft, and its weapons at work.
 *
 * @param {Scene} scene
 * @param {GameState} state
 * @returns {Sprite[]}
 */
function field(scene, state) {
  const { view, race, config } = scene;
  const rules = /** @type {WarpConfig} */ (config.warp);
  const pilots = rules.courses[race.race].pilots;
  /** @type {Sprite[]} */
  const sprites = [];

  for (const items of [race.course.items, race.drops]) {
    for (const item of items) {
      if (item.z > view.far) {
        break;
      }

      const spot = view.project(item.z, itemX(item, race.time), item.air ? AIR_RING_LIFT : 0);

      if (spot) {
        sprites.push({ depth: spot.depth, draw: () => drawItem(scene, item, spot) });
      }
    }
  }

  const finish = view.project(race.course.length, 0);

  if (finish && race.course.length <= view.far) {
    sprites.push({ depth: finish.depth, draw: () => drawGantry(scene, finish) });
  }

  for (const rival of race.rivals) {
    const ground = view.project(rival.z, rival.x);
    const spot = view.project(rival.z, rival.x, liftOf(rival.air, rules));

    if (ground && spot && rival.z <= view.far) {
      sprites.push({ depth: spot.depth, draw: () => drawRival(scene, rival, pilots[rival.pilot], spot, ground) });
    }
  }

  sprites.push({ depth: EYE_BEHIND, draw: () => drawCraft(scene, state) });
  return [...sprites, ...weapons(scene, state)];
}

/**
 * Something on the course. Things fade in from the distance, and out as they pass the craft.
 *
 * @param {Scene} scene
 * @param {TrackItem} item
 * @param {Spot} spot
 */
function drawItem(scene, item, spot) {
  const { ctx, view } = scene;
  const unit = view.reach * spot.scale;

  ctx.save();
  ctx.globalAlpha = Math.max(0, Math.min(1, spot.scale * 3) * (spot.depth < EYE_BEHIND ? spot.depth / EYE_BEHIND : 1));

  switch (item.kind) {
    case 'ring':
      drawRing(scene, item, spot, unit);
      break;
    case 'pad':
      drawPad(scene, item, spot, unit);
      break;
    case 'ramp':
      drawRamp(scene, item, spot, unit);
      break;
    case 'gate':
      drawGate(scene, item, spot, unit);
      break;
    case 'mine':
      drawMine(scene, item, spot, unit);
      break;
    case 'debris':
      drawDebris(scene, item, spot, unit);
      break;
    case 'crate':
      drawCrate(scene, spot, unit);
      break;
    case 'cell':
      drawCell(scene, spot, unit);
      break;
    case 'cargo':
    default:
      drawCargo(scene, spot, unit);
  }

  ctx.restore();
}

/**
 * A ring to fly through, standing on the lane with its light on the lane under it, or hanging
 * in the air on the way of a jump, doubled.
 *
 * @param {Scene} scene
 * @param {TrackItem} item
 * @param {Spot} spot
 * @param {number} unit
 */
function drawRing({ ctx, look, race, now, still }, item, { x, y, scale }, unit) {
  const radius = 0.34 * unit;
  const cy = y - radius * 0.8;
  const passed = item.z <= race.z;
  const rgb = item.air ? THEME.side.player.rgb : look.ring;
  const turn = still ? 0 : now / 700;

  if (!item.air) {
    // Its light on the lane.
    ctx.fillStyle = `rgba(${rgb}, ${passed ? 0.05 : 0.16})`;
    ctx.beginPath();
    ctx.ellipse(x, y, radius * 1.1, radius * 0.22, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.globalCompositeOperation = 'lighter';

  for (const [width, alpha] of [[26, 0.14], [12, 0.35], [4, 1]]) {
    ctx.strokeStyle = `rgba(${rgb}, ${passed ? alpha * 0.3 : alpha})`;
    ctx.lineWidth = Math.max(width / 6, width * scale);
    ctx.beginPath();
    ctx.arc(x, cy, radius, 0, Math.PI * 2);
    ctx.stroke();
  }

  if (item.air) {
    ctx.strokeStyle = `rgba(${look.ring}, ${passed ? 0.25 : 0.9})`;
    ctx.lineWidth = Math.max(1, 2.5 * scale);
    ctx.beginPath();
    ctx.arc(x, cy, radius * 0.72, turn, turn + Math.PI * 1.5);
    ctx.stroke();
  }

  // Marks turning round it, and its middle, faintly.
  ctx.fillStyle = `rgba(${mixRgb(rgb, CORE_LIGHT, 0.4)}, 0.9)`;

  for (let mark = 0; mark < 8; mark += 1) {
    const angle = (Math.PI / 4) * mark + turn;
    ctx.beginPath();
    ctx.arc(x + Math.cos(angle) * radius, cy + Math.sin(angle) * radius, Math.max(1, 2.6 * scale), 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.fillStyle = `rgba(${rgb}, 0.12)`;
  ctx.beginPath();
  ctx.arc(x, cy, 0.1 * unit, 0, Math.PI * 2);
  ctx.fill();
}

/**
 * A boost pad on the lane: an amber strip with chevrons running up it.
 *
 * @param {Scene} scene
 * @param {TrackItem} item
 * @param {Spot} spot
 * @param {number} unit
 */
function drawPad({ ctx, view, race, now, still }, item, { x, y, scale }, unit) {
  const next = view.project(item.z + 6, itemX(item, race.time));

  if (!next) {
    return;
  }

  const width = 0.22 * unit;
  const farWidth = 0.22 * view.reach * next.scale;
  const glow = still ? 0.8 : 0.55 + 0.35 * Math.sin(now / 160 + item.id);
  const run = still ? 0 : (now / 300) % 1;

  quad(ctx, { x: x - width, y }, { x: x + width, y }, { x: next.x + farWidth, y: next.y }, { x: next.x - farWidth, y: next.y }, `rgba(${THEME.amber}, ${0.22 * glow})`);
  ctx.strokeStyle = `rgba(${THEME.amber}, ${glow})`;
  ctx.lineWidth = Math.max(1, 2.4 * scale);
  ctx.lineJoin = 'round';

  for (let chevron = 0; chevron < 3; chevron += 1) {
    const share = (chevron + run) / 3;
    const cy = y + (next.y - y) * share;
    const cx = x + (next.x - x) * share;
    const half = (width + (farWidth - width) * share) * 0.7;
    ctx.beginPath();
    ctx.moveTo(cx - half, cy + (y - next.y) * 0.12);
    ctx.lineTo(cx, cy - (y - next.y) * 0.1);
    ctx.lineTo(cx + half, cy + (y - next.y) * 0.12);
    ctx.stroke();
  }
}

/**
 * A ramp: a wedge rising from the lane, lit from inside, with arrows up its face.
 *
 * @param {Scene} scene
 * @param {TrackItem} item
 * @param {Spot} spot
 * @param {number} unit
 */
function drawRamp({ ctx, view, config, now, still }, item, { x, y, scale }, unit) {
  const rules = /** @type {WarpConfig} */ (config.warp);
  const lip = view.project(item.z + 5, item.x, 0.2);
  const foot = view.project(item.z + 5, item.x);

  if (!lip || !foot) {
    return;
  }

  const rgb = THEME.side.player.rgb;
  const width = rules.rampWidth * unit;
  const farWidth = rules.rampWidth * view.reach * lip.scale;
  const run = still ? 0 : (now / 260) % 1;

  // Its sides, down to the lane, and its face.
  ctx.fillStyle = 'rgba(8, 20, 38, 0.92)';

  for (const side of [-1, 1]) {
    ctx.beginPath();
    ctx.moveTo(x + side * width, y);
    ctx.lineTo(lip.x + side * farWidth, lip.y);
    ctx.lineTo(foot.x + side * farWidth, foot.y);
    ctx.closePath();
    ctx.fill();
  }

  quad(ctx, { x: x - width, y }, { x: x + width, y }, { x: lip.x + farWidth, y: lip.y }, { x: lip.x - farWidth, y: lip.y }, `rgba(${rgb}, 0.3)`);
  ctx.strokeStyle = `rgb(${rgb})`;
  ctx.lineWidth = Math.max(1, 2.6 * scale);
  ctx.lineJoin = 'round';
  ctx.beginPath();
  ctx.moveTo(x - width, y);
  ctx.lineTo(lip.x - farWidth, lip.y);
  ctx.lineTo(lip.x + farWidth, lip.y);
  ctx.lineTo(x + width, y);
  ctx.closePath();
  ctx.stroke();

  for (let arrow = 0; arrow < 2; arrow += 1) {
    const share = (arrow + run) / 2;
    const cy = y + (lip.y - y) * share;
    const cx = x + (lip.x - x) * share;
    const half = (width + (farWidth - width) * share) * 0.55;
    ctx.beginPath();
    ctx.moveTo(cx - half, cy + (y - lip.y) * 0.16);
    ctx.lineTo(cx, cy - (y - lip.y) * 0.12);
    ctx.lineTo(cx + half, cy + (y - lip.y) * 0.16);
    ctx.stroke();
  }
}

/**
 * A gate: a barrier of light across the lane, with a gap marked by two posts and an arrow
 * over it. The barrier is see-through, so what is behind it still shows.
 *
 * @param {Scene} scene
 * @param {TrackItem} item
 * @param {Spot} spot
 * @param {number} unit
 */
function drawGate({ ctx, view, config, now, still }, item, { x, y, scale }, unit) {
  const rules = /** @type {WarpConfig} */ (config.warp);
  const left = view.project(item.z, -LANE);
  const right = view.project(item.z, LANE);

  if (!left || !right) {
    return;
  }

  const gap = rules.gateGap * unit;
  const high = 0.72 * unit;
  const beat = still ? 0.8 : 0.6 + 0.3 * Math.sin(now / 140 + item.id);

  for (const [from, to] of [[left.x, x - gap], [x + gap, right.x]]) {
    if (to - from < 2) {
      continue;
    }

    ctx.fillStyle = `rgba(${THEME.rose}, ${0.3 * beat})`;
    ctx.fillRect(from, y - high, to - from, high);
    ctx.strokeStyle = `rgba(${THEME.rose}, ${beat})`;
    ctx.lineWidth = Math.max(1, 2.4 * scale);
    ctx.strokeRect(from, y - high, to - from, high);
    // Bars of light across it.
    ctx.beginPath();
    ctx.moveTo(from, y - high * 0.66);
    ctx.lineTo(to, y - high * 0.66);
    ctx.moveTo(from, y - high * 0.33);
    ctx.lineTo(to, y - high * 0.33);
    ctx.stroke();
  }

  // The posts of the gap, and the arrow over it.
  ctx.globalCompositeOperation = 'lighter';
  ctx.strokeStyle = `rgb(${THEME.lime})`;
  ctx.fillStyle = `rgb(${THEME.lime})`;
  ctx.lineWidth = Math.max(1.5, 4 * scale);
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(x - gap, y);
  ctx.lineTo(x - gap, y - high * 1.25);
  ctx.moveTo(x + gap, y);
  ctx.lineTo(x + gap, y - high * 1.25);
  ctx.stroke();

  const bob = still ? 0 : Math.sin(now / 180) * high * 0.08;
  const tip = y - high * 1.3 + bob;
  ctx.beginPath();
  ctx.moveTo(x, tip);
  ctx.lineTo(x - gap * 0.3, tip - high * 0.3);
  ctx.lineTo(x + gap * 0.3, tip - high * 0.3);
  ctx.closePath();
  ctx.fill();
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
 * A mine: a spiked ball hovering over the lane, with a light that beats.
 *
 * @param {Scene} scene
 * @param {TrackItem} item
 * @param {Spot} spot
 * @param {number} unit
 */
function drawMine({ ctx, glows, now, still }, item, { x, y, scale }, unit) {
  const radius = ITEM_RADIUS.mine * unit;
  const cy = y - radius * 1.6;
  const turn = still ? 0 : now / 900;

  shadow(ctx, x, y, radius * 1.2, scale);
  ctx.globalCompositeOperation = 'lighter';
  ctx.drawImage(glows.get(THEME.red), x - radius * 3, cy - radius * 3, radius * 6, radius * 6);
  ctx.globalCompositeOperation = 'source-over';
  ctx.strokeStyle = `rgb(${THEME.red})`;
  ctx.lineWidth = Math.max(1, 2 * scale);

  for (let spike = 0; spike < 8; spike += 1) {
    const angle = (Math.PI / 4) * spike + turn;
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
  ctx.fillStyle = `rgba(${THEME.red}, ${still ? 0.8 : 0.5 + 0.5 * Math.sin(now / 170 + item.id)})`;
  ctx.beginPath();
  ctx.arc(x, cy, radius * 0.3, 0, Math.PI * 2);
  ctx.fill();
}

/**
 * A piece of debris, jagged and turning, the same shape every frame.
 *
 * @param {Scene} scene
 * @param {TrackItem} item
 * @param {Spot} spot
 * @param {number} unit
 */
function drawDebris({ ctx, now, still }, item, { x, y, scale }, unit) {
  const radius = ITEM_RADIUS.debris * unit;
  const cy = y - radius * 1.3;
  const turn = (still ? 0 : now / 600) + item.id;

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
}

/**
 * A slow cargo hauler, seen from behind: a wide hull with hazard stripes and its engines.
 *
 * @param {Scene} scene
 * @param {Spot} spot
 * @param {number} unit
 */
function drawCargo({ ctx, glows, now, still }, { x, y, scale }, unit) {
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

  ctx.fillStyle = `rgba(${THEME.red}, ${still ? 0.8 : 0.6 + 0.3 * Math.sin(now / 250)})`;
  ctx.fillRect(x - half + 4 * scale, top + 4 * scale, 6 * scale, 4 * scale);
  ctx.fillRect(x + half - 10 * scale, top + 4 * scale, 6 * scale, 4 * scale);
}

/**
 * The finish gantry over the lane, checkered, with its banner.
 *
 * @param {Scene} scene
 * @param {Spot} spot
 */
function drawGantry({ ctx, look, view, now, still }, { x, y, scale }) {
  const unit = view.reach * scale;
  const wide = unit * 1.2;
  const high = unit * 1.05;
  const bannerHigh = unit * 0.2;
  const size = (wide * 2) / 16;

  ctx.save();
  ctx.globalAlpha = Math.min(1, scale * 6);
  ctx.strokeStyle = `rgba(${look.edge}, 0.95)`;
  ctx.lineWidth = Math.max(1.5, 5 * scale);
  ctx.beginPath();
  ctx.moveTo(x - wide, y);
  ctx.lineTo(x - wide, y - high);
  ctx.moveTo(x + wide, y);
  ctx.lineTo(x + wide, y - high);
  ctx.stroke();
  ctx.fillStyle = '#0b0a1f';
  ctx.fillRect(x - wide, y - high - bannerHigh, wide * 2, bannerHigh);
  ctx.fillStyle = CHECKER;

  for (let square = 0; square < 16; square += 1) {
    ctx.fillRect(x - wide + square * size, y - high - bannerHigh + (square % 2) * (bannerHigh / 2), size, bannerHigh / 2);
  }

  if (scale > 0.18) {
    ctx.font = `900 ${Math.round(unit * 0.13)}px ${FONT}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'bottom';
    ctx.fillStyle = `rgba(${THEME.amber}, ${still ? 0.9 : 0.75 + 0.25 * Math.sin(now / 200)})`;
    ctx.fillText('FINISH', x, y - high - bannerHigh - 4 * scale);
  }

  ctx.restore();
}

/**
 * A rival: its shadow and its light on the lane, its craft over them, higher while it jumps,
 * how much of its hull is left once the guns have worn it, and its name while it is near ahead.
 *
 * @param {Scene} scene
 * @param {Racer} rival
 * @param {Pilot} pilot
 * @param {Spot} spot where the craft is
 * @param {Spot} ground where the lane is under it
 */
function drawRival({ ctx, config, glows, now, still }, rival, pilot, spot, ground) {
  const rules = /** @type {WarpConfig} */ (config.warp);
  const turn = rival.spin > 0 ? (rival.spin / 1.2) * Math.PI * 3 : clamp((rival.line - rival.x) * 1.4, -0.35, 0.35);

  ctx.save();
  ctx.globalAlpha = Math.min(1, spot.scale * 4) * (spot.depth < EYE_BEHIND ? Math.max(0.2, spot.depth / EYE_BEHIND) : 1);
  shadow(ctx, ground.x, ground.y + 12 * ground.scale, 30 * ground.scale, ground.scale);
  drawUnderglow(ctx, pilot.rgb, ground.x, ground.y + 12 * ground.scale, 40 * ground.scale, 0.8);
  drawHull(ctx, {
    kind: pilot.craft,
    paint: pilot.rgb,
    decal: 'none',
    glow: pilot.rgb,
    cockpit: `rgb(${mixRgb(pilot.rgb, CORE_LIGHT, 0.55)})`,
    x: spot.x,
    y: spot.y,
    scale: spot.scale,
    bank: turn,
    flame: rival.boost > 0 ? 1 : 0.45 + (still ? 0 : 0.1 * Math.sin(now / 50 + rival.id)),
    nitro: false,
    rockets: 0,
    now: still ? 0 : now + rival.id * 130,
    glows,
  });

  // Under fire, it shows how much of its hull is left.
  if (rival.hull < rules.rivalHull && rival.spin === 0 && rival.finish === 0) {
    drawHullBar(ctx, rival.hull / rules.rivalHull, spot);
  }

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
 * The player's craft where the paddle would be: the one chosen in the hangar, in its paint,
 * with the rockets it has aboard under its wings and a bubble round it while a shield is up.
 * It leans as it steers and spins when it is hit; it rises off a ramp, leaving its shadow and
 * its light on the lane; it blazes with an afterburner, burns blue with nitro, fades with a
 * phantom, streams the air when it rides a slipstream, and throws sparks from its inside wing
 * while a drift charges, amber once it is charged. The light on its canopy is the color of a
 * paddle's core, where a paddle's core would be.
 *
 * @param {Scene} scene
 * @param {GameState} state
 */
function drawCraft({ ctx, race, config, view, glows, now, still }, state) {
  const rules = /** @type {WarpConfig} */ (config.warp);
  const colors = THEME.side.player;
  const x = state.player.x;
  const ground = view.craftY;
  const across = laneX(state, config);
  // On the rumble strips the craft judders.
  const judder = onRumble(across) && race.air === 0 && !still ? Math.sin(now / 16) * 1.6 : 0;
  const y = ground - liftOf(race.air, rules) * view.reach + judder;
  const spinning = race.spin > 0 ? (race.spin / rules.spinSeconds) * Math.PI * 4 : 0;
  const bank = spinning || clamp(state.player.vx / 1500, -0.38, 0.38);
  const rush = clamp((race.speed - rules.topSpeed) / (rules.boostSpeed - rules.topSpeed), 0, 1.2);
  const high = (ground - y) / (JUMP_LIFT * view.reach);
  const { loadout } = rules;
  const nitro = race.nitroBurn > 0;

  ctx.save();
  // Its shadow stays on the lane, smaller the higher the craft is, and so does its light.
  shadow(ctx, x, ground + 15, 36 * (1 - high * 0.4), 1);
  drawUnderglow(ctx, nitro ? NITRO_LIGHT : loadout.glow, x, ground + 15, 58 * (1 - high * 0.4), nitro ? 1 : 0.85);

  if (race.burn > 0) {
    ctx.globalCompositeOperation = 'lighter';
    ctx.drawImage(glows.get(SUPER_STYLE.fireball.rgb), x - 70, y - 60, 140, 120);
    ctx.globalCompositeOperation = 'source-over';
  }

  ctx.lineCap = 'round';

  if (rush > 0 && !still) {
    // The air off its wing tips.
    ctx.strokeStyle = `rgba(165, 243, 252, ${0.2 + rush * 0.4})`;
    ctx.lineWidth = 1.6;
    ctx.beginPath();

    for (const side of [-1, 1]) {
      ctx.moveTo(x + side * 38, y + 8);
      ctx.lineTo(x + side * 42, y + 20 + rush * 34);
    }

    ctx.stroke();
  }

  if (race.slip > 0) {
    // The air streaming past, closing in as the slingshot builds.
    ctx.strokeStyle = `rgba(165, 243, 252, ${0.25 + race.slip * 0.5})`;
    ctx.lineWidth = 1.5;

    for (let line = 0; line < 6; line += 1) {
      const side = line % 2 === 0 ? -1 : 1;
      const along = ((still ? 0 : now / 260) + line / 6) % 1;
      const gap = 48 - race.slip * 16;
      ctx.beginPath();
      ctx.moveTo(x + side * gap, y - 40 + along * 60);
      ctx.lineTo(x + side * (gap - 4), y - 22 + along * 60);
      ctx.stroke();
    }
  }

  if (race.drift > 0) {
    // Sparks off the wing on the inside of the bend, and how far the drift is charged.
    const side = Math.sign(curveAt(race.course, race.z, rules)) || 1;
    const rgb = race.drift >= 1 ? THEME.amber : colors.rgb;
    const flicker = still ? 0 : Math.floor(now / 40);

    ctx.strokeStyle = `rgba(${rgb}, 0.9)`;
    ctx.lineWidth = 1.8;
    ctx.beginPath();

    for (let spark = 0; spark < 6; spark += 1) {
      const angle = Math.PI / 2 + side * (0.2 + hash(spark, flicker) * 0.9);
      const reach = 8 + hash(flicker, spark) * 22 * (0.4 + race.drift);
      ctx.moveTo(x + side * 36, y + 9);
      ctx.lineTo(x + side * 36 + Math.cos(angle) * reach, y + 9 + Math.sin(angle) * reach);
    }

    ctx.stroke();
    ctx.strokeStyle = `rgba(${rgb}, 0.85)`;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(x, y + 2, 50, Math.PI * 0.2, Math.PI * (0.2 + 0.6 * race.drift));
    ctx.stroke();
  }

  ctx.globalAlpha = race.ghost > 0 ? 0.5 : race.safe > 0 && race.spin === 0 ? 0.55 + (still ? 0 : 0.25 * Math.sin(now / 120)) : 1;
  drawHull(ctx, {
    kind: loadout.kind,
    paint: loadout.paint,
    decal: loadout.decal,
    glow: loadout.glow,
    cockpit: colors.core,
    x,
    y,
    scale: CRAFT_SCALE,
    bank,
    flame: race.burn > 0 || nitro ? 1.4 : 0.5 + rush * 0.6 + (still ? 0 : 0.08 * Math.sin(now / 40)),
    nitro,
    rockets: race.rockets,
    now: still ? 0 : now,
    glows,
  });

  if (race.shield > 0) {
    drawShield(ctx, x, y, CRAFT_SCALE, race.shield, still ? 0 : now);
  }

  if (race.ghost > 0) {
    ctx.strokeStyle = `rgba(${SUPER_STYLE.phantom.rgb}, ${still ? 0.7 : 0.5 + 0.3 * Math.sin(now / 90)})`;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.ellipse(x, y - 2, 46, 24, 0, 0, Math.PI * 2);
    ctx.stroke();
  }

  ctx.restore();
}

/**
 * The rush of a boost, over the whole picture: lines that streak out from where the lane runs
 * out of sight, and the edges of the board closing in. Nitro streaks more of them, faster, and
 * in its own blue.
 *
 * @param {Scene} scene
 */
function drawRush({ ctx, look, view, race, config, now }) {
  const rules = /** @type {WarpConfig} */ (config.warp);
  const nitro = race.nitroBurn > 0;
  const rush = nitro ? 1 : clamp((race.speed - rules.topSpeed - 2) / (rules.boostSpeed - rules.topSpeed), 0, 1);

  if (rush <= 0) {
    return;
  }

  const { width, height } = config;
  const { x, y } = view.vanish;

  ctx.save();
  ctx.lineCap = 'round';

  for (let line = 0; line < (nitro ? 40 : 26); line += 1) {
    const angle = hash(line, 50) * Math.PI * 2;
    const along = (now / (nitro ? 300 : 420) + hash(line, 51)) % 1;
    const from = 60 + along * along * height;
    const length = (nitro ? 50 : 30) + along * 90;
    ctx.strokeStyle = `rgba(${nitro ? NITRO_LIGHT : '165, 243, 252'}, ${rush * along * (nitro ? 0.65 : 0.5)})`;
    ctx.lineWidth = 1 + along * 1.5;
    ctx.beginPath();
    ctx.moveTo(x + Math.cos(angle) * from, y + Math.sin(angle) * from * 0.8);
    ctx.lineTo(x + Math.cos(angle) * (from + length), y + Math.sin(angle) * (from + length) * 0.8);
    ctx.stroke();
  }

  const edges = ctx.createRadialGradient(width / 2, height * 0.55, height * 0.3, width / 2, height * 0.55, height * 0.75);
  edges.addColorStop(0, `rgba(${nitro ? NITRO_LIGHT : look.edge}, 0)`);
  edges.addColorStop(1, `rgba(${nitro ? NITRO_LIGHT : look.edge}, ${(nitro ? 0.3 : 0.22) * rush})`);
  ctx.fillStyle = edges;
  ctx.fillRect(0, 0, width, height);
  ctx.restore();
}
