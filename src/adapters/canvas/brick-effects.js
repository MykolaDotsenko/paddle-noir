import { brickRgb, DROP_STYLE, STEEL_RGB, SUPER_STYLE, THEME } from './theme.js';

/**
 * What the Bricks game's events look like: a brick breaks into pieces that fly the way the
 * ball was going and fall, a bomb goes off, thunder runs down a column and a zigzag along a
 * row, a caught bonus is called out, and a wall coming down is celebrated. `playEvents` hands
 * these events here; every other event is drawn as in a match.
 *
 * @import { GameConfig, GameEvent, GameState } from '../../domain/types.js'
 * @import { Effects } from '../effects.js'
 */

/** A combo is called out at these counts, and at every tenth brick after them. */
const COMBO_CALLS = Object.freeze([5, 10]);
/** Pieces a brick breaks into: this many across, in two rows. */
const PIECES_ACROSS = 3;
/** How much of what struck a brick its pieces keep, and how fast they scatter besides. */
const CARRY = 0.28;
const SCATTER = 150;
const PIECE_GRAVITY = 900;

/**
 * A brick breaks: its pieces keep some of the speed of what struck it, scatter from its
 * middle, tumble and fall, shrinking as they go; sparks fly from where it was.
 *
 * @param {Effects} effects
 * @param {Extract<GameEvent, { type: 'brick-break' }>} event
 * @param {() => number} random
 */
function shatterBrick(effects, event, random) {
  const rgb = brickRgb(event);
  const color = `rgb(${rgb})`;
  const across = effects.reducedMotion ? 2 : PIECES_ACROSS;
  const width = event.w / across;
  const height = event.h / 2;

  for (let row = 0; row < 2; row += 1) {
    for (let column = 0; column < across; column += 1) {
      const x = event.x - event.w / 2 + (column + 0.5) * width;
      const y = event.y - event.h / 2 + (row + 0.5) * height;

      effects.shard({
        x,
        y,
        vx: event.vx * CARRY + (x - event.x) * 6 + (random() - 0.5) * SCATTER,
        vy: event.vy * CARRY + (y - event.y) * 6 + (random() - 0.5) * SCATTER - 60,
        width: width - 1,
        height: height - 1,
        color,
        spin: (random() - 0.5) * 16,
        life: 0.7 + random() * 0.4,
        gravity: PIECE_GRAVITY,
        shrink: 0.6,
      });
    }
  }

  effects.burst({ x: event.x, y: event.y, color, count: 10, speed: 220, life: 0.4, size: 1.8, gravity: 300 });
  effects.pop();
}

/**
 * @param {Effects} effects
 * @param {GameEvent} event
 * @param {{ config: GameConfig, state?: GameState, random: () => number }} context
 * @returns {boolean} whether the event was one of the Bricks game's
 */
export function playBrickEvent(effects, event, { config, state, random }) {
  const { width, height } = config;

  switch (event.type) {
    case 'brick-hit': {
      const rgb = event.kind === 'steel' ? STEEL_RGB : brickRgb(event);
      effects.burst({ x: event.x, y: event.y, color: `rgb(${rgb})`, count: event.kind === 'steel' ? 6 : 9, speed: 190, life: 0.3, size: 1.6 });
      effects.ring({ x: event.x, y: event.y, color: `rgba(${rgb}, 0.8)`, radius: 5, growth: 150, life: 0.22, width: 2 });
      return true;
    }
    case 'brick-break': {
      shatterBrick(effects, event, random);

      if (COMBO_CALLS.includes(event.combo) || (event.combo > 10 && event.combo % 10 === 0)) {
        effects.label({ text: `COMBO ×${event.combo}`, x: width / 2, y: height * 0.55, color: `rgb(${THEME.amber})`, life: 0.8, size: 30 });
        effects.pulse(0.6);
      }
      return true;
    }
    case 'blast': {
      const amber = `rgb(${THEME.amber})`;
      effects.ring({ x: event.x, y: event.y, color: amber, radius: 8, growth: event.radius * 5, life: 0.35, width: 6 });
      effects.ring({ x: event.x, y: event.y, color: `rgba(${THEME.red}, 0.9)`, radius: 4, growth: event.radius * 3, life: 0.45, width: 3 });
      effects.burst({ x: event.x, y: event.y, color: amber, count: 34, speed: 420, life: 0.6, size: 2.4, gravity: 260 });
      effects.burst({ x: event.x, y: event.y, color: THEME.spark, count: 12, speed: 520, life: 0.35, size: 1.6 });
      effects.flashSparingly(amber, 0.2);
      effects.shake(0.8);
      effects.pulse(0.8);
      return true;
    }
    case 'strike': {
      const rgb = SUPER_STYLE[event.kind].rgb;
      const color = `rgb(${rgb})`;

      if (event.kind === 'thunder') {
        // Down the column, from the ceiling to under where the ball landed.
        effects.bolt({ x1: event.x, y1: 0, x2: event.x, y2: event.y + 24, color, segments: 9, jag: 16, life: 0.4, width: 4 });
        effects.bolt({ x1: event.x, y1: 0, x2: event.x, y2: event.y + 24, color: THEME.spark, segments: 7, jag: 10, life: 0.25, width: 2 });
      } else {
        // Along the row, from wall to wall.
        effects.bolt({ x1: 0, y1: event.y, x2: width, y2: event.y, color, segments: 11, jag: 9, life: 0.4, width: 4 });
        effects.bolt({ x1: 0, y1: event.y, x2: width, y2: event.y, color: THEME.spark, segments: 9, jag: 6, life: 0.25, width: 2 });
      }

      effects.ring({ x: event.x, y: event.y, color, radius: 10, growth: 520, life: 0.4, width: 5 });
      effects.flashSparingly(color, 0.24);
      effects.shake(0.9);
      return true;
    }
    case 'drop-spawn':
      effects.ring({ x: event.x, y: event.y, color: `rgba(${DROP_STYLE[event.kind].rgb}, 0.9)`, radius: 4, growth: 190, life: 0.4, width: 2 });
      return true;
    case 'drop': {
      const style = DROP_STYLE[event.kind];
      const color = `rgb(${style.rgb})`;

      effects.burst({ x: event.x, y: event.y, color, count: 30, speed: 300, direction: -Math.PI / 2, spread: Math.PI, life: 0.55, size: 2.2 });
      effects.ring({ x: event.x, y: event.y, color, radius: 10, growth: 460, life: 0.45, width: 4 });
      effects.flashSparingly(color, 0.12);
      effects.kick('player');
      effects.label({ text: style.label, x: Math.min(Math.max(event.x, 90), width - 90), y: event.y - 54, color, size: 26 });
      return true;
    }
    case 'bolt-fire':
      effects.burst({ x: event.x, y: event.y - 6, color: `rgb(${DROP_STYLE.laser.rgb})`, count: 3, speed: 160, direction: -Math.PI / 2, spread: 0.9, life: 0.2, size: 1.5 });
      return true;
    case 'shield-save': {
      const color = `rgb(${DROP_STYLE.shield.rgb})`;
      effects.burst({ x: event.x, y: event.y, color, count: 26, speed: 320, direction: -Math.PI / 2, spread: Math.PI, life: 0.5, size: 2 });
      effects.ring({ x: event.x, y: event.y, color, radius: 8, growth: 420, life: 0.4, width: 4 });
      effects.flashSparingly(color, 0.14);
      effects.label({ text: 'SAVED!', x: Math.min(Math.max(event.x, 90), width - 90), y: event.y - 70, color, size: 28 });
      return true;
    }
    case 'level-clear': {
      const lime = `rgb(${THEME.lime})`;
      const next = config.bricks?.levels[event.level + 1];

      for (let shell = 0; shell < (effects.reducedMotion ? 2 : 5); shell += 1) {
        const x = width * (0.15 + random() * 0.7);
        const y = height * (0.12 + random() * 0.3);
        const color = `rgb(${brickRgb({ kind: 'plain', row: shell * 2 + event.level })})`;

        effects.schedule(shell * 0.12, () => {
          effects.burst({ x, y, color, count: 34, speed: 330, life: 0.9, size: 2.2, gravity: 220 });
          effects.ring({ x, y, color, radius: 6, growth: 300, life: 0.5, width: 3 });
        });
      }

      effects.flash(lime, 0.18);
      effects.pulse(1);
      effects.label({ text: event.last ? 'ALL CLEAR!' : 'WALL DOWN!', x: width / 2, y: height * 0.4, color: lime, life: 1, size: 40 });

      if (next && state) {
        // The next wall is named as it comes down into place.
        effects.schedule(1, () => effects.label({
          text: `WALL ${event.level + 2} · ${next.name.toUpperCase()}`,
          x: width / 2,
          y: height * 0.64,
          color: `rgb(${THEME.text})`,
          life: 1,
          size: 22,
        }));
      }
      return true;
    }
    default:
      return false;
  }
}
