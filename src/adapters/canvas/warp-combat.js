import { FONT, roundedRect, THEME } from './theme.js';
import { CRAFT_SCALE, muzzlesOf } from './warp-craft.js';

/**
 * The weapons of the Warp game on the canvas: the crates and cells that arm the craft, the
 * guns' tracers to the rival they bear on, the reticle closing on the rival a rocket is
 * locking on to, the rockets in flight with their smoke behind them, and how much of its hull
 * a rival under fire has left. Each is a sprite among everything else on the lane, painted in
 * its turn from far to near. Nothing here is the pure white kept for the ball.
 *
 * @import { GameState, Racer, WarpConfig } from '../../domain/types.js'
 * @import { Scene, Spot, Sprite } from './warp-scenery.js'
 */

const ROCKET = '251, 146, 60';
const NITRO = '125, 211, 252';
const TRACER = '254, 240, 138';
const SMOKE = '148, 163, 184';
const BODY = '226, 232, 240';
const DARK = '5, 6, 15';
/** How high over the lane a crate or a cell hangs, and a rocket flies, in half lanes. */
const HOVER = 0.14;
/** How far apart, in meters, the puffs of a rocket's smoke are, and how many. */
const PUFF_GAP = 1.6;
const PUFFS = 5;
/**
 * How far from the eye the tracers and the reticle are painted: just beyond the player's own
 * craft, over the lane and everything on it, since they are seen from the craft.
 */
const OVER_ALL = 7.02;

/**
 * The light something that hangs over the lane throws on it.
 *
 * @param {Scene} scene
 * @param {string} rgb
 * @param {Spot} spot
 * @param {number} unit
 */
function pool({ ctx, glows }, rgb, { x, y }, unit) {
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  ctx.translate(x, y);
  ctx.scale(1, 0.3);
  ctx.drawImage(glows.get(rgb), -unit * 0.4, -unit * 0.4, unit * 0.8, unit * 0.8);
  ctx.restore();
}

/**
 * A rocket crate: a dark box edged in orange that bobs over the lane, with a rocket on its side.
 *
 * @param {Scene} scene
 * @param {Spot} spot
 * @param {number} unit half the lane's width there, in board units
 */
export function drawCrate(scene, spot, unit) {
  const { ctx, now, still } = scene;
  const size = unit * 0.2;
  const y = spot.y - unit * HOVER - size - (still ? 0 : Math.sin(now / 260) * unit * 0.03);

  pool(scene, ROCKET, spot, unit);
  ctx.fillStyle = `rgba(${DARK}, 0.92)`;
  roundedRect(ctx, spot.x - size, y - size, size * 2, size * 2, size * 0.25);
  ctx.fill();
  ctx.strokeStyle = `rgb(${ROCKET})`;
  ctx.lineWidth = Math.max(1, size * 0.14);
  ctx.stroke();

  // The rocket on it: a body, a nose and two fins.
  ctx.fillStyle = `rgb(${BODY})`;
  roundedRect(ctx, spot.x - size * 0.16, y - size * 0.5, size * 0.32, size * 0.95, size * 0.16);
  ctx.fill();
  ctx.fillStyle = `rgb(${ROCKET})`;
  ctx.beginPath();
  ctx.moveTo(spot.x - size * 0.16, y - size * 0.34);
  ctx.lineTo(spot.x, y - size * 0.74);
  ctx.lineTo(spot.x + size * 0.16, y - size * 0.34);
  ctx.closePath();
  ctx.moveTo(spot.x - size * 0.16, y + size * 0.12);
  ctx.lineTo(spot.x - size * 0.46, y + size * 0.56);
  ctx.lineTo(spot.x - size * 0.16, y + size * 0.44);
  ctx.closePath();
  ctx.moveTo(spot.x + size * 0.16, y + size * 0.12);
  ctx.lineTo(spot.x + size * 0.46, y + size * 0.56);
  ctx.lineTo(spot.x + size * 0.16, y + size * 0.44);
  ctx.closePath();
  ctx.fill();
}

/**
 * A nitro cell: a canister of blue light that bobs over the lane, marked with the chevrons of
 * something that makes a craft go.
 *
 * @param {Scene} scene
 * @param {Spot} spot
 * @param {number} unit
 */
export function drawCell(scene, spot, unit) {
  const { ctx, now, still } = scene;
  const wide = unit * 0.12;
  const tall = unit * 0.2;
  const y = spot.y - unit * HOVER - tall - (still ? 0 : Math.sin(now / 260 + 2) * unit * 0.03);

  pool(scene, NITRO, spot, unit);
  ctx.fillStyle = `rgba(${NITRO}, 0.3)`;
  roundedRect(ctx, spot.x - wide, y - tall, wide * 2, tall * 2, wide * 0.8);
  ctx.fill();
  ctx.strokeStyle = `rgb(${NITRO})`;
  ctx.lineWidth = Math.max(1, wide * 0.22);
  ctx.stroke();
  // The caps at its ends.
  ctx.fillStyle = `rgb(${NITRO})`;
  ctx.fillRect(spot.x - wide * 0.6, y - tall - wide * 0.3, wide * 1.2, wide * 0.4);
  ctx.fillRect(spot.x - wide * 0.6, y + tall - wide * 0.1, wide * 1.2, wide * 0.4);
  ctx.strokeStyle = `rgb(${BODY})`;
  ctx.lineWidth = Math.max(1, wide * 0.24);
  ctx.lineJoin = 'round';
  ctx.beginPath();

  for (const rise of [0.1, -0.5]) {
    ctx.moveTo(spot.x - wide * 0.5, y + tall * (rise + 0.4));
    ctx.lineTo(spot.x, y + tall * rise);
    ctx.lineTo(spot.x + wide * 0.5, y + tall * (rise + 0.4));
  }

  ctx.stroke();
}

/**
 * How much of its hull a rival has left, over it, once the guns have worn it at all.
 *
 * @param {CanvasRenderingContext2D} ctx
 * @param {number} share 0 to 1
 * @param {Spot} spot where the rival is
 */
export function drawHullBar(ctx, share, spot) {
  const wide = Math.max(18, 44 * spot.scale);
  const y = spot.y - 30 * spot.scale - 6;

  ctx.fillStyle = `rgba(${DARK}, 0.8)`;
  ctx.fillRect(spot.x - wide / 2 - 1, y - 1, wide + 2, 5);
  ctx.fillStyle = `rgb(${share > 0.5 ? THEME.lime : share > 0.25 ? THEME.amber : THEME.red})`;
  ctx.fillRect(spot.x - wide / 2, y, wide * Math.max(0, Math.min(1, share)), 3);
}

/**
 * The guns firing: from each muzzle of the craft to the rival they bear on, a faint line with
 * rounds running up it, and sparks where they land. With motion reduced only the line is drawn.
 *
 * @param {Scene} scene
 * @param {GameState} state
 * @param {Spot} target
 */
function drawTracers({ ctx, config, view, now, still }, state, target) {
  const rules = /** @type {WarpConfig} */ (config.warp);
  const y = view.craftY - 11;
  const aim = { x: target.x, y: target.y - 8 * target.scale };

  ctx.save();
  ctx.lineCap = 'round';

  for (const out of muzzlesOf(rules.loadout.kind)) {
    const from = { x: state.player.x + out * CRAFT_SCALE, y };

    ctx.strokeStyle = `rgba(${TRACER}, 0.22)`;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(from.x, from.y);
    ctx.lineTo(aim.x, aim.y);
    ctx.stroke();

    if (still) {
      continue;
    }

    // Rounds on their way: nearer the rival they are smaller.
    for (let round = 0; round < 3; round += 1) {
      const along = (now / 110 + round / 3 + (out > 0 ? 0.17 : 0)) % 1;
      const end = Math.min(1, along + 0.1);

      ctx.strokeStyle = `rgba(${TRACER}, 0.95)`;
      ctx.lineWidth = 2.4 - along * 1.6;
      ctx.beginPath();
      ctx.moveTo(from.x + (aim.x - from.x) * along, from.y + (aim.y - from.y) * along);
      ctx.lineTo(from.x + (aim.x - from.x) * end, from.y + (aim.y - from.y) * end);
      ctx.stroke();
    }

    // The flash at the muzzle.
    if (Math.floor(now / 55) % 2 === 0) {
      ctx.fillStyle = `rgba(${TRACER}, 0.9)`;
      ctx.beginPath();
      ctx.arc(from.x, from.y, 2.6, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  // Where the rounds land.
  const spark = still ? 3 : 3 + (Math.floor(now / 45) % 3) * 2;

  ctx.strokeStyle = `rgba(${TRACER}, 0.9)`;
  ctx.lineWidth = 1.4;
  ctx.beginPath();

  for (let ray = 0; ray < 4; ray += 1) {
    const angle = ray * (Math.PI / 4) + (still ? 0 : Math.floor(now / 45));
    const reach = spark * Math.max(0.5, target.scale * 1.6);

    ctx.moveTo(aim.x - Math.cos(angle) * reach, aim.y - Math.sin(angle) * reach);
    ctx.lineTo(aim.x + Math.cos(angle) * reach, aim.y + Math.sin(angle) * reach);
  }

  ctx.stroke();
  ctx.restore();
}

/**
 * A rocket's lock: four corners round the rival that close in and turn as the lock builds,
 * amber, then red once it is nearly whole.
 *
 * @param {Scene} scene
 * @param {number} lock 0 to 1
 * @param {Spot} target
 */
function drawReticle({ ctx }, lock, target) {
  const rgb = lock > 0.75 ? THEME.red : THEME.amber;
  const size = (18 + 30 * (1 - lock)) * Math.max(0.5, Math.min(1.2, target.scale * 1.6));
  const arm = size * 0.42;

  ctx.save();
  ctx.translate(target.x, target.y - 10 * target.scale);
  ctx.rotate((1 - lock) * (Math.PI / 2));
  ctx.strokeStyle = `rgba(${rgb}, 0.95)`;
  ctx.lineWidth = 2;
  ctx.lineCap = 'round';
  ctx.beginPath();

  for (const [sx, sy] of /** @type {const} */ ([[-1, -1], [1, -1], [1, 1], [-1, 1]])) {
    ctx.moveTo(sx * size, sy * (size - arm));
    ctx.lineTo(sx * size, sy * size);
    ctx.lineTo(sx * (size - arm), sy * size);
  }

  ctx.stroke();
  ctx.fillStyle = `rgba(${rgb}, 0.95)`;
  ctx.fillRect(-1.5, -1.5, 3, 3);
  ctx.restore();

  if (lock > 0.75) {
    ctx.font = `900 10px ${FONT}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'bottom';
    ctx.fillStyle = `rgb(${THEME.red})`;
    ctx.fillText('LOCK', target.x, target.y - 10 * target.scale - size - 3);
  }
}

/**
 * A puff of the smoke a rocket leaves: larger and thinner the older it is.
 *
 * @param {Scene} scene
 * @param {number} age 1 for the newest
 * @param {Spot} spot
 */
function drawPuff({ ctx }, age, spot) {
  ctx.fillStyle = `rgba(${SMOKE}, ${0.4 - age * 0.06})`;
  ctx.beginPath();
  ctx.arc(spot.x, spot.y, (4 + age * 2) * spot.scale, 0, Math.PI * 2);
  ctx.fill();
}

/**
 * A rocket in flight, seen from behind: its fire and its four fins.
 *
 * @param {Scene} scene
 * @param {Spot} spot
 */
function drawMissile({ ctx, glows }, spot) {
  const size = Math.max(1.5, 5 * spot.scale);

  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  ctx.drawImage(glows.get(ROCKET), spot.x - size * 4, spot.y - size * 4, size * 8, size * 8);
  ctx.globalCompositeOperation = 'source-over';
  ctx.strokeStyle = `rgb(${BODY})`;
  ctx.lineWidth = Math.max(1, size * 0.4);
  ctx.beginPath();
  ctx.moveTo(spot.x - size * 1.5, spot.y - size * 1.5);
  ctx.lineTo(spot.x + size * 1.5, spot.y + size * 1.5);
  ctx.moveTo(spot.x + size * 1.5, spot.y - size * 1.5);
  ctx.lineTo(spot.x - size * 1.5, spot.y + size * 1.5);
  ctx.stroke();
  ctx.fillStyle = `rgb(${TRACER})`;
  ctx.beginPath();
  ctx.arc(spot.x, spot.y, size, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

/**
 * The weapons at work, for a frame: every rocket in flight with the smoke behind it, each puff
 * in its own place on the lane; the tracers to the rival under the guns; and the reticle on
 * the rival a rocket is locking on to. What is aimed from the craft is painted over the lane.
 *
 * @param {Scene} scene
 * @param {GameState} state
 * @returns {Sprite[]}
 */
export function weapons(scene, state) {
  const { view, race } = scene;
  /** @type {Sprite[]} */
  const sprites = [];
  /** @param {number} id */
  const spotOf = (id) => {
    const rival = /** @type {Racer | undefined} */ (race.rivals.find((racer) => racer.id === id));
    return rival && rival.z <= view.far ? view.project(rival.z, rival.x) : null;
  };

  for (const missile of race.missiles) {
    const spot = missile.z <= view.far ? view.project(missile.z, missile.x, HOVER) : null;

    if (spot) {
      sprites.push({ depth: spot.depth, draw: () => drawMissile(scene, spot) });
    }

    for (let age = 1; age <= PUFFS; age += 1) {
      const behind = view.project(missile.z - age * PUFF_GAP, missile.x, HOVER);

      if (behind) {
        sprites.push({ depth: behind.depth, draw: () => drawPuff(scene, age, behind) });
      }
    }
  }

  const mark = race.aim ? spotOf(race.aim) : null;

  if (mark) {
    sprites.push({ depth: OVER_ALL, draw: () => drawTracers(scene, state, mark) });
  }

  const prey = race.lockOn ? spotOf(race.lockOn) : null;

  if (prey) {
    sprites.push({ depth: OVER_ALL, draw: () => drawReticle(scene, race.lock, prey) });
  }

  return sprites;
}
