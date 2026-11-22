import { viewOf } from './warp.js';
import { SUPER_STYLE, THEME } from './theme.js';

/**
 * What the Warp game's events look like. Most happen at the player's craft: a ring flown dead
 * center, a boost, a crash, a near miss, a slingshot. What happens to a rival happens where the
 * board shows it: it crashes, it is taken down, thunder strikes it. The callouts are short and
 * one at a time, so they never hide the lane. `playEvents` hands these events here.
 *
 * @import { GameConfig, GameEvent, GameState, WarpConfig } from '../../domain/types.js'
 * @import { Effects } from '../effects.js'
 */

const CYAN = THEME.side.player.rgb;
const SPARKS = '254, 240, 138';

/**
 * Where the player's craft is on the board.
 *
 * @param {GameState} state
 * @param {GameConfig} config
 */
function craftAt(state, config) {
  return { x: state.player.x, y: config.height - config.paddle.inset - config.paddle.height / 2 };
}

/**
 * Where something on the course is on the board, or the craft if it is out of sight.
 *
 * @param {GameState} state
 * @param {GameConfig} config
 * @param {number} z
 * @param {number} x
 */
function spotOf(state, config, z, x) {
  const race = state.warp;
  const spot = race ? viewOf(race, config).project(z, x) : null;
  return spot ? { x: spot.x, y: spot.y - 18 * spot.scale, scale: spot.scale } : { ...craftAt(state, config), scale: 1 };
}

/**
 * @param {Effects} effects
 * @param {GameEvent} event
 * @param {{ config: GameConfig, state?: GameState, random: () => number }} context
 * @returns {boolean} whether the event was one of the Warp game's
 */
export function playWarpEvent(effects, event, { config, state, random }) {
  const rules = config.warp;

  if (!rules || !state?.warp) {
    return false;
  }

  const { width, height } = config;
  const craft = craftAt(state, config);
  const pilots = rules.courses[state.warp.race].pilots;

  switch (event.type) {
    case 'ring': {
      if (event.grade === 'miss') {
        return true;
      }

      const rgb = event.grade === 'perfect' ? THEME.amber : CYAN;
      effects.ring({ x: craft.x, y: craft.y - 26, color: `rgba(${rgb}, 0.9)`, radius: 30, growth: 260, life: 0.35, width: event.grade === 'perfect' ? 4 : 2 });

      if (event.grade === 'perfect') {
        effects.burst({ x: craft.x, y: craft.y - 26, color: `rgb(${SPARKS})`, count: 14 + Math.min(event.chain, 5) * 3, speed: 260, life: 0.4, size: 1.8 });
        effects.label({ text: event.chain > 1 ? `PERFECT ×${event.chain}` : 'PERFECT', x: craft.x, y: craft.y - 92, color: `rgb(${THEME.amber})`, life: 0.7, size: 18 + Math.min(event.chain, 5) * 2 });
      }
      return true;
    }
    case 'boost': {
      if (event.by === 'super') {
        return true;
      }

      // Thrust out of the engines, toward the eye.
      effects.burst({ x: craft.x, y: craft.y + 12, color: `rgb(${THEME.amber})`, count: 16, speed: 240, direction: Math.PI / 2, spread: 1.2, life: 0.35, size: 2 });
      effects.ring({ x: craft.x, y: craft.y, color: `rgba(${CYAN}, 0.8)`, radius: 24, growth: 320, life: 0.35, width: 3 });
      effects.pulse(0.5);

      if (event.by === 'slingshot') {
        effects.label({ text: 'SLINGSHOT!', x: width / 2, y: height * 0.46, color: `rgb(${CYAN})`, life: 0.8, size: 28 });
        effects.flashSparingly(`rgb(${CYAN})`, 0.1);
      }
      return true;
    }
    case 'crash': {
      if (event.pilot !== undefined) {
        // A rival, where it crashed.
        const at = spotOf(state, config, event.z, event.x);
        const rgb = pilots[event.pilot]?.rgb ?? THEME.rose;
        effects.burst({ x: at.x, y: at.y, color: `rgb(${rgb})`, count: Math.round(8 + 14 * at.scale), speed: 90 + 200 * at.scale, life: 0.45, size: 1.6 });
        effects.ring({ x: at.x, y: at.y, color: `rgba(${THEME.amber}, 0.7)`, radius: 4, growth: 60 + 200 * at.scale, life: 0.35, width: 2 });
        return true;
      }

      effects.burst({ x: craft.x, y: craft.y - 10, color: `rgb(${THEME.amber})`, count: 40, speed: 360, life: 0.6, size: 2.4 });
      effects.burst({ x: craft.x, y: craft.y - 10, color: `rgb(${CYAN})`, count: 20, speed: 260, life: 0.5, size: 2 });
      effects.ring({ x: craft.x, y: craft.y - 10, color: `rgb(${THEME.rose})`, radius: 12, growth: 420, life: 0.45, width: 5 });

      for (let piece = 0; piece < (effects.reducedMotion ? 2 : 5); piece += 1) {
        const angle = -Math.PI / 2 + (random() - 0.5) * 2.4;
        const speed = 140 + random() * 180;
        effects.shard({ x: craft.x, y: craft.y - 10, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed, width: 7, height: 4, color: `rgb(${CYAN})`, spin: (random() - 0.5) * 12, life: 0.7, gravity: 600, shrink: 0.6 });
      }

      effects.flashSparingly(`rgb(${THEME.rose})`, 0.2);
      effects.shake(0.9);
      effects.kick('player');
      return true;
    }
    case 'near-miss':
      effects.burst({ x: craft.x, y: craft.y - 14, color: `rgb(${SPARKS})`, count: 8, speed: 200, life: 0.3, size: 1.5 });
      effects.label({ text: `CLOSE! +${event.points}`, x: craft.x, y: craft.y - 86, color: `rgb(${CYAN})`, life: 0.6, size: 17 });
      return true;
    case 'bump': {
      const at = spotOf(state, config, event.z, event.x);
      effects.burst({ x: at.x, y: at.y, color: `rgb(${SPARKS})`, count: 18, speed: 300, life: 0.35, size: 1.8 });
      effects.shake(0.35);
      return true;
    }
    case 'takedown': {
      const at = spotOf(state, config, event.z, event.x);
      const pilot = pilots[event.pilot];
      const rgb = pilot?.rgb ?? THEME.rose;
      effects.burst({ x: at.x, y: at.y, color: `rgb(${rgb})`, count: 36, speed: 140 + 260 * at.scale, life: 0.7, size: 2.2 });
      effects.burst({ x: at.x, y: at.y, color: `rgb(${THEME.amber})`, count: 18, speed: 120 + 200 * at.scale, life: 0.5, size: 1.8 });
      effects.ring({ x: at.x, y: at.y, color: `rgb(${rgb})`, radius: 6, growth: 160 + 300 * at.scale, life: 0.5, width: 4 });
      effects.label({ text: `${(pilot?.name ?? 'RIVAL').toUpperCase()} DOWN! +${event.points}`, x: width / 2, y: height * 0.42, color: `rgb(${THEME.amber})`, life: 0.9, size: 22, stack: true });
      effects.shake(0.4);
      return true;
    }
    case 'smash':
      effects.burst({ x: craft.x, y: craft.y - 40, color: `rgb(${SUPER_STYLE.fireball.rgb})`, count: 26, speed: 320, direction: -Math.PI / 2, spread: 2, life: 0.45, size: 2 });
      effects.label({ text: `SMASH +${event.points}`, x: craft.x, y: craft.y - 92, color: `rgb(${SUPER_STYLE.fireball.rgb})`, life: 0.6, size: 18 });
      effects.shake(0.3);
      return true;
    case 'overtake':
      effects.pop();
      effects.label({ text: `P${event.place}!`, x: 60, y: 150, color: `rgb(${event.place === 1 ? THEME.amber : CYAN})`, life: 0.7, size: 26 });
      return true;
    case 'overtaken':
      effects.label({ text: `P${event.place}`, x: 60, y: 150, color: `rgb(${THEME.rose})`, life: 0.6, size: 22 });
      return true;
    case 'slipstream':
      return true;
    case 'lightning': {
      const color = `rgb(${SUPER_STYLE.thunder.rgb})`;
      const from = { x: craft.x, y: craft.y - 20 };

      for (const target of event.targets) {
        const at = spotOf(state, config, target.z, target.x);
        effects.bolt({ x1: from.x, y1: from.y, x2: at.x, y2: at.y, color, segments: 9, jag: 16, life: 0.45, width: 3 });
        effects.bolt({ x1: from.x, y1: from.y, x2: at.x, y2: at.y, color: THEME.spark, segments: 6, jag: 9, life: 0.3, width: 1.5 });
      }
      return true;
    }
    case 'shockwave': {
      const color = SUPER_STYLE.zigzag.rgb;
      effects.ring({ x: craft.x, y: craft.y - 10, color: `rgba(${color}, 0.9)`, radius: 20, growth: 900, life: 0.6, width: 8 });
      effects.schedule(0.1, () => effects.ring({ x: craft.x, y: craft.y - 10, color: `rgba(${color}, 0.6)`, radius: 10, growth: 700, life: 0.5, width: 4 }));
      effects.shake(0.6);
      return true;
    }
    case 'final-stretch':
      effects.label({ text: 'FINAL STRETCH!', x: width / 2, y: height * 0.42, color: `rgb(${THEME.amber})`, life: 1.1, size: 30 });
      effects.pulse(0.8);
      return true;
    case 'race-finish':
      finishLine(effects, event, rules, config, random);
      return true;
    default:
      return false;
  }
}

/**
 * Over the line: fireworks for a win, a flash in the place's color, and nothing to rub it in
 * for a race that did not go through.
 *
 * @param {Effects} effects
 * @param {Extract<GameEvent, { type: 'race-finish' }>} event
 * @param {WarpConfig} rules
 * @param {GameConfig} config
 * @param {() => number} random
 */
function finishLine(effects, event, rules, config, random) {
  const { width, height } = config;
  const rgb = event.place === 1 ? THEME.amber : event.qualified ? CYAN : THEME.rose;

  effects.clearLabels();
  effects.pulse(1);

  if (!event.qualified) {
    return;
  }

  effects.flashSparingly(`rgb(${rgb})`, 0.16);

  if (event.place === 1) {
    for (let shell = 0; shell < (effects.reducedMotion ? 2 : 5); shell += 1) {
      const x = width * (0.15 + random() * 0.7);
      const y = height * (0.4 + random() * 0.2);
      const color = `rgb(${rules.courses[event.race].pilots[shell % 5].rgb})`;

      effects.schedule(shell * 0.14, () => {
        effects.burst({ x, y, color, count: 34, speed: 330, life: 0.9, size: 2.2, gravity: 220 });
        effects.ring({ x, y, color, radius: 6, growth: 300, life: 0.5, width: 3 });
      });
    }
  }
}
