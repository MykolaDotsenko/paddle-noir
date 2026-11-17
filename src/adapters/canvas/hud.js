import { GAME_PHASE } from '../../domain/game.js';
import { isLoaded } from '../../domain/supers.js';
import { CAMEO_WORD } from '../cameo.js';
import { FEVER_RALLY, FONT, roundedRect, SUPER_STYLE, THEME } from './theme.js';

/**
 * What the canvas shows on top of the play: the serve countdown, the rally counter, the
 * super meters, the callouts and the cameo. Each function draws onto a context already scaled
 * to board coordinates.
 *
 * @import { GameConfig, GameState, Side, SuperMeter } from '../../domain/types.js'
 * @import { Cameo, Label } from '../effects.js'
 */

// A super meter: a slim bar in a corner at each end of the court, clear of the paddles.
const METER_WIDTH = 104;
const METER_HEIGHT = 7;
const METER_MARGIN = 14;

/**
 * Before a serve: a closing ring and a filling arc around the waiting ball, and on the
 * first serve of a match the countdown number itself.
 *
 * @param {CanvasRenderingContext2D} ctx
 * @param {GameState} state
 * @param {GameConfig} config
 */
export function drawServeCountdown(ctx, state, config) {
  if (state.serveCountdown <= 0 || state.phase === GAME_PHASE.READY) {
    return;
  }

  const { ball } = state;
  const radius = config.ball.radius;
  const total = state.serveNumber === 0 ? config.startDelaySeconds : config.serveDelaySeconds;
  const remaining = state.serveCountdown / total;

  ctx.save();
  ctx.lineCap = 'round';
  ctx.strokeStyle = `rgba(${THEME.violet}, 0.75)`;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(ball.x, ball.y, radius + 4 + 26 * remaining, 0, Math.PI * 2);
  ctx.stroke();
  ctx.strokeStyle = `rgba(${THEME.side.player.rgb}, 0.9)`;
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.arc(ball.x, ball.y, radius + 12, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * (1 - remaining));
  ctx.stroke();

  if (state.serveNumber === 0) {
    const value = Math.ceil(state.serveCountdown);
    // Each number swells as it lands and shrinks away before the next.
    const within = 1 - (state.serveCountdown - (value - 1));
    const scale = 1.4 - 0.4 * within;

    ctx.translate(ball.x, ball.y - 70);
    ctx.scale(scale, scale);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = `rgba(248, 250, 252, ${0.95 - within * 0.5})`;
    ctx.font = `900 64px ${FONT}`;
    ctx.fillText(String(value), 0, 0);
  }

  ctx.restore();
}

/**
 * The current rally count, pulsing on every hit and turning amber in a long exchange.
 *
 * @param {CanvasRenderingContext2D} ctx
 * @param {GameState} state
 * @param {GameConfig} config
 * @param {number} pop 1 right after a hit, settling to 0
 */
export function drawRally(ctx, state, config, pop) {
  if (state.rally < 2) {
    return;
  }

  const { width, height } = config;
  const color = state.rally >= FEVER_RALLY ? THEME.amber : THEME.text;

  ctx.save();
  ctx.translate(width - 26, height / 2 + 34);
  ctx.scale(1 + pop * 0.3, 1 + pop * 0.3);
  ctx.textAlign = 'right';
  ctx.fillStyle = `rgba(${color}, ${0.3 + pop * 0.5})`;
  ctx.font = `800 44px ${FONT}`;
  ctx.fillText(String(state.rally), 0, 0);
  ctx.font = `700 11px ${FONT}`;
  ctx.fillStyle = `rgba(${color}, ${0.35 + pop * 0.4})`;
  ctx.fillText('RALLY', 0, 16);
  ctx.restore();
}

/**
 * Where a side's super meter sits: the player's in the bottom-left corner, the top side's in
 * the top-right corner.
 *
 * @param {Side} side
 * @param {GameConfig} config
 * @returns {{ x: number, y: number, width: number, height: number }}
 */
export function meterBox(side, config) {
  const { width, height } = config;

  return side === 'player'
    ? { x: METER_MARGIN, y: height - METER_MARGIN - METER_HEIGHT, width: METER_WIDTH, height: METER_HEIGHT }
    : { x: width - METER_MARGIN - METER_WIDTH, y: METER_MARGIN, width: METER_WIDTH, height: METER_HEIGHT };
}

/**
 * The super meters, while supers are on: each fills in its side's color from the corner in,
 * and once full it glows in the color of the super it holds, under that super's name and, for
 * a person, a reminder to flick. Between two people the top player's name is turned to face
 * them across the table.
 *
 * @param {CanvasRenderingContext2D} ctx
 * @param {GameState} state
 * @param {GameConfig} config
 * @param {number} now milliseconds, for the glow of a full meter
 */
export function drawMeters(ctx, state, config, now) {
  if (!config.supers.enabled || state.phase === GAME_PHASE.READY) {
    return;
  }

  const twoPlayers = config.opponent.controller === 'human';

  drawMeter(ctx, state.meters.player, 'player', config, now, { turned: false, person: true });
  drawMeter(ctx, state.meters.opponent, 'opponent', config, now, { turned: twoPlayers, person: twoPlayers });
}

/**
 * @param {CanvasRenderingContext2D} ctx
 * @param {SuperMeter} meter
 * @param {Side} side
 * @param {GameConfig} config
 * @param {number} now
 * @param {{ turned: boolean, person: boolean }} holder whether its name faces the top of the
 *   court, and whether a person fires it, with a flick
 */
function drawMeter(ctx, meter, side, config, now, { turned, person }) {
  const box = meterBox(side, config);
  const sideRgb = THEME.side[side].rgb;
  const full = isLoaded(meter) && meter.kind !== null;
  const rgb = full && meter.kind ? SUPER_STYLE[meter.kind].rgb : sideRgb;
  const glow = full ? 0.5 + 0.5 * Math.sin(now / 170) : 0;
  const filled = box.width * Math.min(1, meter.charge);
  // It fills from the corner in: the player's from the left, the top side's from the right.
  const fillX = side === 'player' ? box.x : box.x + box.width - filled;

  ctx.save();
  ctx.fillStyle = `rgba(${sideRgb}, 0.16)`;
  roundedRect(ctx, box.x, box.y, box.width, box.height, box.height / 2);
  ctx.fill();

  if (full) {
    // A soft halo, cheaper than a canvas shadow, breathes around a full meter.
    const halo = 3 + 2 * glow;
    ctx.fillStyle = `rgba(${rgb}, ${0.18 + 0.14 * glow})`;
    roundedRect(ctx, box.x - halo, box.y - halo, box.width + 2 * halo, box.height + 2 * halo, box.height / 2 + halo);
    ctx.fill();
  }

  if (filled > 0.5) {
    ctx.fillStyle = `rgba(${rgb}, ${full ? 0.8 + 0.2 * glow : 0.7})`;
    roundedRect(ctx, fillX, box.y, filled, box.height, box.height / 2);
    ctx.fill();
  }

  // The name sits on the court side of the bar.
  const labelX = side === 'player' ? box.x : box.x + box.width;
  const labelY = side === 'player' ? box.y - 7 : box.y + box.height + 7;

  ctx.translate(labelX, labelY);

  if (turned) {
    ctx.rotate(Math.PI);
  }

  ctx.font = `900 12px ${FONT}`;
  ctx.textBaseline = 'middle';
  ctx.textAlign = (side === 'player') !== turned ? 'left' : 'right';
  ctx.fillStyle = full ? `rgba(${rgb}, ${0.85 + 0.15 * glow})` : `rgba(${sideRgb}, 0.45)`;

  if (full && meter.kind) {
    ctx.fillText(person ? `${SUPER_STYLE[meter.kind].label} · FLICK` : SUPER_STYLE[meter.kind].label, 0, 0);
  } else {
    ctx.fillText('SUPER', 0, 0);
  }

  ctx.restore();
}

/**
 * Callouts rise and fade; each swells in over its first tenth.
 *
 * @param {CanvasRenderingContext2D} ctx
 * @param {readonly Label[]} labels
 */
export function drawLabels(ctx, labels) {
  for (const label of labels) {
    const age = 1 - label.life / label.maxLife;
    const swell = Math.min(1, age / 0.1);
    const scale = 0.6 + 0.4 * swell + age * 0.15;

    ctx.save();
    ctx.translate(label.x, label.y - age * 36);
    ctx.scale(scale, scale);
    ctx.globalAlpha = Math.min(1, label.life / 0.3);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = `900 ${label.size}px ${FONT}`;
    ctx.lineWidth = 5;
    ctx.strokeStyle = 'rgba(5, 6, 15, 0.85)';
    ctx.strokeText(label.text, 0, 0);
    ctx.fillStyle = label.color;
    ctx.fillText(label.text, 0, 0);
    ctx.restore();
  }
}

// The cameo: a head in headphones, a little above the paddle's end of the court, clear of the
// rally counter, the meters and the paddles' rows.
const CAMEO_HEIGHT = 0.7;
/** The head is drawn 24 units in radius, then enlarged to be seen from across a room. */
const CAMEO_HEAD = 24;
const CAMEO_SCALE = 1.5;
/** How far outside the wall he waits, in board units, before he leans in. */
const CAMEO_REACH = 130;
const CAMEO_IN = 0.14;
const CAMEO_OUT = 0.18;

/**
 * The arcade's sound man leans in from the wall and whoops: a line drawing of a head in
 * headphones, eyes shut with delight, and his word beside him. He comes in at the end of the
 * court whose player fired the super; for a second player he is turned to face them across the
 * table. With reduced motion he does not slide: he is there, then he is not. Nothing here is
 * the pure white kept for the ball.
 *
 * @param {CanvasRenderingContext2D} ctx
 * @param {Cameo | null} cameo
 * @param {GameConfig} config
 * @param {boolean} [reducedMotion]
 */
export function drawCameo(ctx, cameo, config, reducedMotion = false) {
  if (!cameo) {
    return;
  }

  const { width, height } = config;
  const age = cameo.maxLife - cameo.life;
  // 0 out of sight, 1 leaning all the way in.
  const shown = Math.min(1, age / CAMEO_IN, cameo.life / CAMEO_OUT);
  const eased = 1 - (1 - shown) ** 3;
  const violet = `rgb(${THEME.violet})`;

  ctx.save();

  if (cameo.side === 'opponent') {
    // The same picture, seen from the other end of the table.
    ctx.translate(width, height);
    ctx.rotate(Math.PI);
  }

  ctx.globalAlpha = reducedMotion ? shown : 1;
  ctx.translate(width - (CAMEO_HEAD + 10) * CAMEO_SCALE + (reducedMotion ? 0 : (1 - eased) * CAMEO_REACH), height * CAMEO_HEIGHT);
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  // His word, beside him on the court side.
  ctx.textAlign = 'right';
  ctx.textBaseline = 'middle';
  ctx.font = `900 30px ${FONT}`;
  ctx.lineWidth = 5;
  ctx.strokeStyle = 'rgba(5, 6, 15, 0.85)';
  ctx.strokeText(CAMEO_WORD, -(CAMEO_HEAD + 14) * CAMEO_SCALE, -44);
  ctx.fillStyle = `rgb(${THEME.amber})`;
  ctx.fillText(CAMEO_WORD, -(CAMEO_HEAD + 14) * CAMEO_SCALE, -44);

  ctx.scale(CAMEO_SCALE, CAMEO_SCALE);

  // The head, filled so the court's lines do not show through it.
  ctx.fillStyle = THEME.background;
  ctx.strokeStyle = violet;
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.arc(0, 0, CAMEO_HEAD, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();

  // Eyes shut with delight, and a mouth wide open.
  for (const x of [-9, 9]) {
    ctx.beginPath();
    ctx.arc(x, -3, 4.5, Math.PI, Math.PI * 2);
    ctx.stroke();
  }

  ctx.beginPath();
  ctx.arc(0, 11, 5, 0, Math.PI * 2);
  ctx.stroke();

  // The headphones: a band over the head and a cup on each ear.
  ctx.strokeStyle = `rgb(${THEME.side.opponent.rgb})`;
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.arc(0, 0, CAMEO_HEAD + 5, Math.PI * 1.12, Math.PI * 1.88);
  ctx.stroke();

  for (const x of [-CAMEO_HEAD - 9, CAMEO_HEAD + 1]) {
    roundedRect(ctx, x, -9, 8, 20, 4);
    ctx.fill();
    ctx.stroke();
  }

  ctx.restore();
}
