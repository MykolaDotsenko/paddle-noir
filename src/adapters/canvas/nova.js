import { bossOf, multiplier, shipY } from '../../domain/nova.js';
import { ENEMY_FIRE_RGB, ENEMY_RGB, FONT, LOOT_STYLE, roundedRect, SUPER_STYLE, THEME } from './theme.js';

/**
 * The Nova game on the canvas: deep space over the court, with stars drifting down; the ship;
 * every enemy, its fire and the ship's; the bonuses; the boss's health; and the multiplier.
 * Each function draws onto a context already scaled to board coordinates, and does nothing in
 * any other game. Nothing here is the pure white kept for the ball.
 *
 * @import { Enemy, GameConfig, GameState, NovaState } from '../../domain/types.js'
 * @import { GlowSprites } from './court.js'
 */

/** Stars in three layers, nearer ones bigger, brighter and faster. */
const STAR_LAYERS = Object.freeze([
  Object.freeze({ count: 46, speed: 14, size: 1, alpha: 0.35 }),
  Object.freeze({ count: 26, speed: 34, size: 1.4, alpha: 0.55 }),
  Object.freeze({ count: 12, speed: 80, size: 2, alpha: 0.8 }),
]);
const STAR_RGB = '199, 210, 254';
// A rock is drawn with this many corners, each at its own distance from its center.
const ROCK_CORNERS = 9;
const LOOT_WIDTH = 38;
const LOOT_HEIGHT = 18;
/** The multiplier shows from here. */
export const MULTIPLIER_SHOWN = 2;

/**
 * A number from 0 to 1 that is always the same for the same two numbers, for the stars and the
 * shapes of rocks, so the picture never flickers.
 *
 * @param {number} a
 * @param {number} b
 */
export function hash(a, b) {
  let h = (Math.imul(a + 1, 2654435761) ^ Math.imul(b + 7, 2246822519)) >>> 0;
  h ^= h >>> 15;
  h = Math.imul(h, 2246822519) >>> 0;
  h ^= h >>> 13;
  return (h >>> 0) / 4294967296;
}

/**
 * Deep space: the court is darkened, and stars drift down past it, faster as they are nearer,
 * so the ship seems to fly up. They move with the game's own clock, so they stop when it is paused.
 *
 * @param {CanvasRenderingContext2D} ctx
 * @param {GameState} state
 * @param {GameConfig} config
 */
export function drawSpace(ctx, state, config) {
  const space = state.nova;

  if (!space) {
    return;
  }

  const { width, height } = config;
  const time = space.time + space.sector * 37;

  ctx.save();
  ctx.globalAlpha = 0.62;
  ctx.fillStyle = THEME.background;
  ctx.fillRect(0, 0, width, height);
  ctx.globalAlpha = 1;

  STAR_LAYERS.forEach((layer, depth) => {
    ctx.fillStyle = `rgba(${STAR_RGB}, ${layer.alpha})`;

    for (let index = 0; index < layer.count; index += 1) {
      const x = hash(index, depth) * width;
      const y = (hash(depth, index) * height + time * layer.speed) % height;
      ctx.fillRect(x, y, layer.size, layer.size * (depth === 2 ? 3 : 1));
    }
  });

  ctx.restore();
}

/**
 * A rock: a jagged outline that turns as it drifts, the same shape every frame.
 *
 * @param {CanvasRenderingContext2D} ctx
 * @param {Enemy} enemy
 */
function drawRock(ctx, enemy) {
  const rgb = ENEMY_RGB[enemy.kind];

  ctx.rotate(enemy.angle);
  ctx.beginPath();

  for (let corner = 0; corner < ROCK_CORNERS; corner += 1) {
    const angle = (corner / ROCK_CORNERS) * Math.PI * 2;
    const reach = enemy.rx * (0.74 + 0.3 * hash(enemy.id, corner));
    const x = Math.cos(angle) * reach;
    const y = Math.sin(angle) * reach;

    if (corner === 0) {
      ctx.moveTo(x, y);
    } else {
      ctx.lineTo(x, y);
    }
  }

  ctx.closePath();
  ctx.fillStyle = `rgba(${rgb}, 0.16)`;
  ctx.fill();
  ctx.strokeStyle = `rgba(${rgb}, 0.9)`;
  ctx.lineWidth = 2;
  ctx.stroke();

  // A crater or two.
  ctx.lineWidth = 1;
  ctx.strokeStyle = `rgba(${rgb}, 0.45)`;
  ctx.beginPath();
  ctx.arc(enemy.rx * 0.25, -enemy.rx * 0.2, enemy.rx * 0.22, 0, Math.PI * 2);
  ctx.stroke();
}

/**
 * A drone: a dart pointing down at the ship, with a glowing eye.
 *
 * @param {CanvasRenderingContext2D} ctx
 * @param {Enemy} enemy
 * @param {number} now
 */
function drawDrone(ctx, enemy, now) {
  const rgb = ENEMY_RGB.drone;
  const { rx, ry } = enemy;

  ctx.beginPath();
  ctx.moveTo(0, ry);
  ctx.lineTo(rx, -ry);
  ctx.lineTo(0, -ry * 0.35);
  ctx.lineTo(-rx, -ry);
  ctx.closePath();
  ctx.fillStyle = THEME.background;
  ctx.fill();
  ctx.fillStyle = `rgba(${rgb}, 0.25)`;
  ctx.fill();
  ctx.strokeStyle = `rgb(${rgb})`;
  ctx.lineWidth = 2;
  ctx.stroke();
  ctx.fillStyle = `rgba(${THEME.amber}, ${0.6 + 0.4 * Math.sin(now / 120 + enemy.id)})`;
  ctx.beginPath();
  ctx.arc(0, 0, 3, 0, Math.PI * 2);
  ctx.fill();
}

/**
 * A gunship: a broad hull with a gun at each side, and lights that show its health.
 *
 * @param {CanvasRenderingContext2D} ctx
 * @param {Enemy} enemy
 */
function drawGunship(ctx, enemy) {
  const rgb = ENEMY_RGB.gunship;
  const { rx, ry } = enemy;

  ctx.beginPath();
  ctx.moveTo(-rx, -ry * 0.4);
  ctx.lineTo(-rx * 0.45, -ry);
  ctx.lineTo(rx * 0.45, -ry);
  ctx.lineTo(rx, -ry * 0.4);
  ctx.lineTo(rx * 0.6, ry * 0.6);
  ctx.lineTo(0, ry);
  ctx.lineTo(-rx * 0.6, ry * 0.6);
  ctx.closePath();
  ctx.fillStyle = THEME.background;
  ctx.fill();
  ctx.fillStyle = `rgba(${rgb}, 0.2)`;
  ctx.fill();
  ctx.strokeStyle = `rgb(${rgb})`;
  ctx.lineWidth = 2.2;
  ctx.stroke();

  for (const side of [-1, 1]) {
    ctx.fillStyle = `rgb(${rgb})`;
    ctx.fillRect(side * rx * 0.72 - 2, ry * 0.2, 4, ry * 0.7);
  }

  // A light for each hit it has left.
  for (let pip = 0; pip < enemy.maxHp; pip += 1) {
    ctx.fillStyle = pip < enemy.hp ? `rgba(${THEME.red}, 0.9)` : `rgba(${rgb}, 0.25)`;
    ctx.fillRect(-enemy.maxHp * 3 + pip * 6, -ry * 0.45, 4, 3);
  }
}

/**
 * The boss: a long hull across the top of the court, with a core that glows red as it rages.
 *
 * @param {CanvasRenderingContext2D} ctx
 * @param {Enemy} enemy
 * @param {number} now
 */
function drawBoss(ctx, enemy, now) {
  const rgb = ENEMY_RGB.boss;
  const { rx, ry } = enemy;
  const rage = 1 - enemy.hp / enemy.maxHp;

  ctx.beginPath();
  ctx.moveTo(-rx, 0);
  ctx.lineTo(-rx * 0.7, -ry);
  ctx.lineTo(rx * 0.7, -ry);
  ctx.lineTo(rx, 0);
  ctx.lineTo(rx * 0.55, ry);
  ctx.lineTo(rx * 0.2, ry * 0.7);
  ctx.lineTo(0, ry * 1.25);
  ctx.lineTo(-rx * 0.2, ry * 0.7);
  ctx.lineTo(-rx * 0.55, ry);
  ctx.closePath();
  ctx.fillStyle = THEME.background;
  ctx.fill();
  ctx.fillStyle = `rgba(${rgb}, 0.18)`;
  ctx.fill();
  ctx.strokeStyle = `rgb(${rgb})`;
  ctx.lineWidth = 3;
  ctx.stroke();

  // Panels along the hull.
  ctx.strokeStyle = `rgba(${rgb}, 0.45)`;
  ctx.lineWidth = 1;
  ctx.beginPath();

  for (const x of [-0.5, -0.25, 0.25, 0.5]) {
    ctx.moveTo(rx * x, -ry * 0.8);
    ctx.lineTo(rx * x, ry * 0.4);
  }

  ctx.stroke();

  // Its core, which beats faster as it weakens.
  const beat = 0.5 + 0.5 * Math.sin(now / (220 - 140 * rage));
  ctx.fillStyle = `rgba(${THEME.amber}, ${0.5 + 0.5 * beat})`;
  ctx.beginPath();
  ctx.arc(0, 0, 8 + 4 * beat, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = `rgba(${rgb}, 0.9)`;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(0, 0, 15, 0, Math.PI * 2);
  ctx.stroke();
}

/**
 * Every enemy, over a soft glow in its color.
 *
 * @param {CanvasRenderingContext2D} ctx
 * @param {GameState} state
 * @param {number} now
 * @param {GlowSprites} glows
 */
export function drawEnemies(ctx, state, now, glows) {
  const space = state.nova;

  if (!space || space.enemies.length === 0) {
    return;
  }

  for (const enemy of space.enemies) {
    const glow = Math.max(enemy.rx, enemy.ry) * 2.6;

    ctx.save();
    ctx.translate(enemy.x, enemy.y);
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = enemy.kind === 'rock' || enemy.kind === 'pebble' ? 0.25 : 0.55;
    ctx.drawImage(glows.get(ENEMY_RGB[enemy.kind]), -glow, -glow, glow * 2, glow * 2);
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = 1;
    ctx.lineJoin = 'round';

    if (enemy.kind === 'drone') {
      drawDrone(ctx, enemy, now);
    } else if (enemy.kind === 'gunship') {
      drawGunship(ctx, enemy);
    } else if (enemy.kind === 'boss') {
      drawBoss(ctx, enemy, now);
    } else {
      drawRock(ctx, enemy);
    }

    ctx.restore();
  }
}

/**
 * The shots in flight: the ship's cyan bolts, a zigzag's yellow ones and a fireball, and the
 * enemies' rose fire, each over a glow.
 *
 * @param {CanvasRenderingContext2D} ctx
 * @param {GameState} state
 * @param {GlowSprites} glows
 */
export function drawShots(ctx, state, glows) {
  const space = state.nova;

  if (!space || (space.shots.length === 0 && space.fire.length === 0)) {
    return;
  }

  ctx.save();
  ctx.lineCap = 'round';

  for (const shot of space.shots) {
    if (shot.kind === 'fireball') {
      const rgb = SUPER_STYLE.fireball.rgb;
      ctx.globalCompositeOperation = 'lighter';
      ctx.drawImage(glows.get(rgb), shot.x - shot.radius * 2.4, shot.y - shot.radius * 2.4, shot.radius * 4.8, shot.radius * 4.8);
      ctx.globalCompositeOperation = 'source-over';
      ctx.fillStyle = `rgb(${THEME.amber})`;
      ctx.beginPath();
      ctx.arc(shot.x, shot.y, shot.radius * 0.55, 0, Math.PI * 2);
      ctx.fill();
      continue;
    }

    const rgb = shot.kind === 'spread' ? SUPER_STYLE.zigzag.rgb : THEME.side.player.rgb;
    const length = 14 / Math.hypot(shot.vx, shot.vy);
    ctx.strokeStyle = `rgba(${rgb}, 0.35)`;
    ctx.lineWidth = 6;
    ctx.beginPath();
    ctx.moveTo(shot.x, shot.y);
    ctx.lineTo(shot.x - shot.vx * length, shot.y - shot.vy * length);
    ctx.stroke();
    ctx.strokeStyle = shot.kind === 'spread' ? `rgb(${rgb})` : THEME.side.player.core;
    ctx.lineWidth = 2.5;
    ctx.stroke();
  }

  for (const shot of space.fire) {
    ctx.globalCompositeOperation = 'lighter';
    ctx.drawImage(glows.get(ENEMY_FIRE_RGB), shot.x - 14, shot.y - 14, 28, 28);
    ctx.globalCompositeOperation = 'source-over';
    ctx.fillStyle = `rgb(${ENEMY_FIRE_RGB})`;
    ctx.beginPath();
    ctx.arc(shot.x, shot.y, 4, 0, Math.PI * 2);
    ctx.fill();
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
export function drawLoot(ctx, state, now, glows) {
  const space = state.nova;

  if (!space || space.loot.length === 0) {
    return;
  }

  for (const loot of space.loot) {
    const style = LOOT_STYLE[loot.kind];

    ctx.save();
    ctx.translate(loot.x, loot.y);
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = 0.8;
    ctx.drawImage(glows.get(style.rgb), -LOOT_WIDTH, -LOOT_HEIGHT * 1.6, LOOT_WIDTH * 2, LOOT_HEIGHT * 3.2);
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = 1;
    ctx.rotate(Math.sin(now / 210 + loot.id) * 0.14);
    ctx.fillStyle = THEME.background;
    ctx.strokeStyle = `rgba(${style.rgb}, 0.95)`;
    ctx.lineWidth = 2;
    roundedRect(ctx, -LOOT_WIDTH / 2, -LOOT_HEIGHT / 2, LOOT_WIDTH, LOOT_HEIGHT, LOOT_HEIGHT / 2);
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
 * The ship: an arrowhead in the player's cyan with a cockpit in the paddle's core color, a
 * flame under it, a shield ring while it has one, and its guns lit by rapid fire or the triple
 * shot. Just after a hit it blinks; as a phantom it is faint and shimmers. With reduced motion
 * it does not blink: it is faint instead.
 *
 * @param {CanvasRenderingContext2D} ctx
 * @param {GameState} state
 * @param {GameConfig} config
 * @param {number} now
 * @param {GlowSprites} glows
 * @param {boolean} [reducedMotion]
 */
export function drawShip(ctx, state, config, now, glows, reducedMotion = false) {
  const space = state.nova;

  if (!space) {
    return;
  }

  const colors = THEME.side.player;
  const x = state.player.x;
  const y = shipY(config);
  const blinking = space.invulnerable > 0 && (reducedMotion || Math.floor(now / 90) % 2 === 0);
  const flame = 8 + 4 * Math.sin(now / 40) + (Math.abs(state.player.vx) > 200 ? 4 : 0);

  ctx.save();
  ctx.translate(x, y);
  ctx.globalAlpha = space.cloak > 0 ? 0.45 : blinking ? 0.35 : 1;

  // Its glow and its flame.
  ctx.globalCompositeOperation = 'lighter';
  ctx.drawImage(glows.get(colors.rgb), -40, -34, 80, 68);
  ctx.fillStyle = `rgba(${THEME.amber}, 0.85)`;
  ctx.beginPath();
  ctx.moveTo(-5, 12);
  ctx.lineTo(0, 12 + flame);
  ctx.lineTo(5, 12);
  ctx.closePath();
  ctx.fill();
  ctx.globalCompositeOperation = 'source-over';

  // The hull.
  ctx.lineJoin = 'round';
  ctx.beginPath();
  ctx.moveTo(0, -20);
  ctx.lineTo(18, 12);
  ctx.lineTo(6, 7);
  ctx.lineTo(0, 12);
  ctx.lineTo(-6, 7);
  ctx.lineTo(-18, 12);
  ctx.closePath();
  ctx.fillStyle = THEME.background;
  ctx.fill();
  ctx.fillStyle = `rgba(${colors.rgb}, 0.3)`;
  ctx.fill();
  ctx.strokeStyle = colors.body;
  ctx.lineWidth = 2.5;
  ctx.stroke();

  // The cockpit, in the color of a paddle's core, where a paddle's core would be.
  ctx.fillStyle = colors.core;
  roundedRect(ctx, -3, -6, 6, 12, 3);
  ctx.fill();

  // The guns, lit while a bonus powers them.
  if (space.rapid > 0 || space.triple > 0) {
    ctx.fillStyle = `rgb(${space.triple > 0 ? LOOT_STYLE.triple.rgb : LOOT_STYLE.rapid.rgb})`;

    for (const side of [-1, 1]) {
      ctx.fillRect(side * 12 - 1.5, 2, 3, 7);
    }
  }

  if (space.cloak > 0) {
    ctx.strokeStyle = `rgba(${SUPER_STYLE.phantom.rgb}, ${0.5 + 0.4 * Math.sin(now / 70)})`;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(0, -2, 24, 0, Math.PI * 2);
    ctx.stroke();
  }

  ctx.restore();

  if (space.shield > 0) {
    ctx.save();
    ctx.strokeStyle = `rgba(${LOOT_STYLE.shield.rgb}, ${0.6 + 0.3 * Math.sin(now / 200)})`;
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.arc(x, y - 2, 28, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }
}

/**
 * The boss's health, across the top of the court while it is there, with its name.
 *
 * @param {CanvasRenderingContext2D} ctx
 * @param {NovaState} space
 * @param {GameConfig} config
 */
export function drawBossBar(ctx, space, config) {
  const boss = bossOf(space);

  if (!boss) {
    return;
  }

  const width = config.width * 0.6;
  const left = (config.width - width) / 2;
  const top = 18;
  const rgb = ENEMY_RGB.boss;

  ctx.save();
  ctx.fillStyle = `rgba(${rgb}, 0.18)`;
  roundedRect(ctx, left, top, width, 7, 3.5);
  ctx.fill();
  ctx.fillStyle = `rgba(${rgb}, 0.9)`;
  roundedRect(ctx, left, top, Math.max(7, (width * boss.hp) / boss.maxHp), 7, 3.5);
  ctx.fill();
  ctx.font = `800 10px ${FONT}`;
  ctx.textAlign = 'center';
  ctx.fillStyle = `rgba(${rgb}, 0.9)`;
  ctx.fillText('DREADNOUGHT', config.width / 2, top + 20);
  ctx.restore();
}

/**
 * The multiplier: what each enemy downed now scores times, and the enemies downed since the
 * ship was last hit, where a match shows its rally. It turns amber at its highest.
 *
 * @param {CanvasRenderingContext2D} ctx
 * @param {NovaState} space
 * @param {GameConfig} config
 * @param {number} pop 1 right after an enemy goes down, settling to 0
 */
export function drawMultiplier(ctx, space, config, pop) {
  const rules = config.nova;

  if (!rules) {
    return;
  }

  const times = multiplier(space, rules);

  if (times < MULTIPLIER_SHOWN) {
    return;
  }

  const top = times >= rules.maxMultiplier;
  const color = top ? THEME.amber : THEME.text;

  ctx.save();
  ctx.translate(config.width - 26, config.height / 2 + 34);
  ctx.scale(1 + pop * 0.3, 1 + pop * 0.3);
  ctx.textAlign = 'right';
  ctx.fillStyle = `rgba(${color}, ${0.3 + pop * 0.5})`;
  ctx.font = `800 44px ${FONT}`;
  ctx.fillText(`×${times}`, 0, 0);
  ctx.font = `700 11px ${FONT}`;
  ctx.fillStyle = `rgba(${color}, ${0.35 + pop * 0.4})`;
  ctx.fillText(`CHAIN ${space.chain}`, 0, 16);
  ctx.restore();
}
