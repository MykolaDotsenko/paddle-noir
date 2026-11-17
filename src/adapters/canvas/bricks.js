import { netLine } from '../../domain/bricks.js';
import { GAME_PHASE } from '../../domain/game.js';
import { paddleWidth } from '../../domain/power-ups.js';
import { BOMB_RGB, brickRgb, DROP_STYLE, FONT, roundedRect, THEME } from './theme.js';

/**
 * The Bricks game on the canvas: the wall, what falls from it, the paddle's laser and its
 * safety net, and the combo counter. Each function draws onto a context already scaled to
 * board coordinates, and does nothing in any other game. Nothing here is the pure white kept
 * for the ball, and nothing is blurred: a wall is a hundred bricks, drawn every frame.
 *
 * @import { Brick, BricksState, GameConfig, GameState } from '../../domain/types.js'
 * @import { GlowSprites } from './court.js'
 */

const BRICK_RADIUS = 4;
const DROP_WIDTH = 38;
const DROP_HEIGHT = 18;
const BOLT_LENGTH = 16;
/** From this many bricks without the paddle touching a ball, the combo shows. */
export const COMBO_SHOWN = 2;

/**
 * A brick: a pane of colored glass in a bright frame. A tough brick has a second frame inside
 * the first, and cracks across once it has taken a hit; steel is plated and riveted; a bomb
 * carries a core that pulses, and flares when it is lit.
 *
 * @param {CanvasRenderingContext2D} ctx
 * @param {Brick} brick
 * @param {number} left where its left edge is now
 * @param {number} toughHits hits a tough brick takes when whole
 * @param {number} now milliseconds
 */
function drawBrick(ctx, brick, left, toughHits, now) {
  const { y, w, h, kind } = brick;
  const rgb = brickRgb(brick);

  ctx.fillStyle = `rgba(${rgb}, ${kind === 'steel' ? 0.2 : 0.3})`;
  ctx.strokeStyle = `rgba(${rgb}, 0.95)`;
  ctx.lineWidth = 1.5;
  roundedRect(ctx, left + 0.75, y + 0.75, w - 1.5, h - 1.5, BRICK_RADIUS);
  ctx.fill();
  ctx.stroke();

  // A line of light along the top edge, as on glass.
  ctx.fillStyle = `rgba(${rgb}, 0.45)`;
  ctx.fillRect(left + 5, y + 3, w - 10, 1.5);

  if (kind === 'tough') {
    ctx.strokeStyle = `rgba(${rgb}, 0.6)`;
    ctx.lineWidth = 1;
    roundedRect(ctx, left + 4, y + 5.5, w - 8, h - 9, 2);
    ctx.stroke();

    if (brick.hp < toughHits) {
      // A crack from edge to edge.
      ctx.strokeStyle = `rgba(${THEME.text}, 0.85)`;
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.moveTo(left + w * 0.18, y + 2);
      ctx.lineTo(left + w * 0.36, y + h * 0.55);
      ctx.lineTo(left + w * 0.52, y + h * 0.3);
      ctx.lineTo(left + w * 0.7, y + h * 0.75);
      ctx.lineTo(left + w * 0.84, y + h - 2);
      ctx.stroke();
    }
  } else if (kind === 'steel') {
    ctx.fillStyle = `rgba(${rgb}, 0.8)`;

    for (const [dx, dy] of [[5, 5.5], [w - 7, 5.5], [5, h - 6.5], [w - 7, h - 6.5]]) {
      ctx.fillRect(left + dx, y + dy, 2, 2);
    }

    ctx.strokeStyle = `rgba(${rgb}, 0.35)`;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(left + w * 0.3, y + h - 4);
    ctx.lineTo(left + w * 0.45, y + 4);
    ctx.moveTo(left + w * 0.55, y + h - 4);
    ctx.lineTo(left + w * 0.7, y + 4);
    ctx.stroke();
  } else if (kind === 'bomb') {
    const lit = brick.fuse > 0;
    const pulse = lit ? 1 : 0.5 + 0.5 * Math.sin(now / 180 + brick.id);

    ctx.fillStyle = `rgba(${lit ? THEME.red : BOMB_RGB}, ${0.5 + 0.5 * pulse})`;
    ctx.beginPath();
    ctx.arc(left + w / 2, y + h / 2, 3.5 + 1.5 * pulse, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = `rgba(${THEME.red}, ${0.5 + 0.4 * pulse})`;
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.arc(left + w / 2, y + h / 2, 7, 0, Math.PI * 2);
    ctx.stroke();
  }
}

/**
 * The wall, each brick where the formation's drift has it. As a level starts, its rows come
 * down into place one after another while the ball waits to be served. Behind the menu the
 * first wall already stands, so the mode shows what it is before it is played.
 *
 * @param {CanvasRenderingContext2D} ctx
 * @param {GameState} state
 * @param {GameConfig} config
 * @param {number} now milliseconds, for the bombs' pulse
 * @param {boolean} [reducedMotion] the rows then stand where they belong from the start
 */
export function drawBricks(ctx, state, config, now, reducedMotion = false) {
  const wall = state.bricks;

  if (!wall || !config.bricks) {
    return;
  }

  // Seconds since the level went up: the wall's own clock runs through the wait before a serve.
  const arriving = reducedMotion || state.phase === GAME_PHASE.READY ? Infinity : wall.time;

  ctx.save();

  for (const brick of wall.bricks) {
    // A row lands a twentieth of a second after the one above it, over a fifth of a second.
    const landed = Math.min(1, Math.max(0, (arriving - brick.row * 0.05) / 0.2));

    if (landed <= 0) {
      continue;
    }

    if (landed < 1) {
      const above = (1 - landed) ** 2 * 60;

      ctx.globalAlpha = landed;
      ctx.translate(0, -above);
      drawBrick(ctx, brick, brick.x + wall.drift, config.bricks.toughHits, now);
      ctx.translate(0, above);
      ctx.globalAlpha = 1;
    } else {
      drawBrick(ctx, brick, brick.x + wall.drift, config.bricks.toughHits, now);
    }
  }

  ctx.restore();
}

/**
 * Bonuses on their way down: a capsule in the bonus's color, with its sign, rocking as it falls.
 *
 * @param {CanvasRenderingContext2D} ctx
 * @param {GameState} state
 * @param {number} now
 * @param {GlowSprites} glows
 */
export function drawDrops(ctx, state, now, glows) {
  const wall = state.bricks;

  if (!wall || wall.drops.length === 0) {
    return;
  }

  for (const drop of wall.drops) {
    const style = DROP_STYLE[drop.kind];

    ctx.save();
    ctx.translate(drop.x, drop.y);
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = 0.8;
    ctx.drawImage(glows.get(style.rgb), -DROP_WIDTH, -DROP_HEIGHT * 1.6, DROP_WIDTH * 2, DROP_HEIGHT * 3.2);
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = 1;
    ctx.rotate(Math.sin(now / 210 + drop.id) * 0.14);
    ctx.fillStyle = THEME.background;
    ctx.strokeStyle = `rgba(${style.rgb}, 0.95)`;
    ctx.lineWidth = 2;
    roundedRect(ctx, -DROP_WIDTH / 2, -DROP_HEIGHT / 2, DROP_WIDTH, DROP_HEIGHT, DROP_HEIGHT / 2);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = `rgba(${style.rgb}, 0.28)`;
    ctx.fill();
    ctx.fillStyle = `rgb(${style.rgb})`;
    ctx.font = `800 13px ${FONT}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(style.glyph, 0, 1);
    ctx.restore();
  }
}

/**
 * The laser: its bolts in flight, and while the paddle is armed a muzzle at each end of it,
 * which blinks in the last second.
 *
 * @param {CanvasRenderingContext2D} ctx
 * @param {GameState} state
 * @param {GameConfig} config
 * @param {number} now
 */
export function drawLaser(ctx, state, config, now) {
  const wall = state.bricks;

  if (!wall || (wall.laser === 0 && wall.bolts.length === 0)) {
    return;
  }

  const rgb = DROP_STYLE.laser.rgb;

  ctx.save();
  ctx.lineCap = 'round';

  if (wall.bolts.length > 0) {
    ctx.strokeStyle = `rgba(${rgb}, 0.35)`;
    ctx.lineWidth = 6;
    ctx.beginPath();

    for (const bolt of wall.bolts) {
      ctx.moveTo(bolt.x, bolt.y);
      ctx.lineTo(bolt.x, bolt.y + BOLT_LENGTH);
    }

    ctx.stroke();
    ctx.strokeStyle = `rgb(${rgb})`;
    ctx.lineWidth = 2.5;
    ctx.stroke();
  }

  if (wall.laser > 0 && (wall.laser > 1 || Math.floor(now / 110) % 2 === 0)) {
    const top = config.height - config.paddle.inset - config.paddle.height;
    const reach = paddleWidth(state, 'player', config) * 0.36;

    ctx.fillStyle = `rgb(${rgb})`;

    for (const side of [-1, 1]) {
      roundedRect(ctx, state.player.x + side * reach - 3, top - 7, 6, 9, 2);
      ctx.fill();
    }
  }

  ctx.restore();
}

/**
 * The safety net under the paddle, while it has a save left: a line of light from wall to
 * wall, breathing.
 *
 * @param {CanvasRenderingContext2D} ctx
 * @param {GameState} state
 * @param {GameConfig} config
 * @param {number} now
 */
export function drawNet(ctx, state, config, now) {
  if (!state.bricks || state.bricks.shield <= 0) {
    return;
  }

  const y = netLine(config);
  const rgb = DROP_STYLE.shield.rgb;
  const breath = 0.5 + 0.5 * Math.sin(now / 240);

  ctx.save();
  ctx.lineCap = 'round';
  ctx.strokeStyle = `rgba(${rgb}, ${0.2 + 0.15 * breath})`;
  ctx.lineWidth = 9;
  ctx.beginPath();
  ctx.moveTo(6, y);
  ctx.lineTo(config.width - 6, y);
  ctx.stroke();
  ctx.strokeStyle = `rgba(${rgb}, ${0.75 + 0.25 * breath})`;
  ctx.lineWidth = 2.5;
  ctx.stroke();
  ctx.restore();
}

/**
 * The combo: bricks broken since the paddle last touched a ball, with the multiplier they
 * score at, where a match shows its rally. It swells with every brick and turns amber once the
 * multiplier is at its highest.
 *
 * @param {CanvasRenderingContext2D} ctx
 * @param {BricksState} wall
 * @param {GameConfig} config
 * @param {number} pop 1 right after a brick breaks, settling to 0
 */
export function drawCombo(ctx, wall, config, pop) {
  if (!config.bricks || wall.combo < COMBO_SHOWN) {
    return;
  }

  const { width, height } = config;
  const top = wall.combo >= config.bricks.maxCombo;
  const color = top ? THEME.amber : THEME.text;

  ctx.save();
  ctx.translate(width - 26, height / 2 + 34);
  ctx.scale(1 + pop * 0.3, 1 + pop * 0.3);
  ctx.textAlign = 'right';
  ctx.fillStyle = `rgba(${color}, ${0.3 + pop * 0.5})`;
  ctx.font = `800 44px ${FONT}`;
  ctx.fillText(`×${Math.min(wall.combo, config.bricks.maxCombo)}`, 0, 0);
  ctx.font = `700 11px ${FONT}`;
  ctx.fillStyle = `rgba(${color}, ${0.35 + pop * 0.4})`;
  ctx.fillText(`COMBO ${wall.combo}`, 0, 16);
  ctx.restore();
}
