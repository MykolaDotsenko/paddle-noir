import { viewOf } from './warp.js';
import { SUPER_STYLE, THEME } from './theme.js';

/**
 * What the Warp game's events look like. Most happen at the player's craft: a ring flown dead
 * center, a boost, a crash, a near miss, a slingshot, a burst of nitro, a shield taking a hit.
 * What happens to a rival happens where the board shows it: it crashes, the guns' rounds land
 * on it, a rocket blows up on it, it is taken down, thunder strikes it. The callouts are short and
 * one at a time, so they never hide the lane. `playEvents` hands these events here.
 *
 * @import { GameConfig, GameEvent, GameState, WarpConfig } from '../../domain/types.js'
 * @import { Effects } from '../effects.js'
 */

const CYAN = THEME.side.player.rgb;
/** Seconds between two racers over the line that the board calls a photo finish. */
const PHOTO_FINISH = 0.25;
const SPARKS = '254, 240, 138';
const NITRO = '125, 211, 252';
const ROCKET = '251, 146, 60';
const SHIELD = '96, 165, 250';
/** What the board calls a rival taken down, by how. */
const TAKEN_DOWN = Object.freeze({ guns: 'SHOT DOWN', rocket: 'BLOWN UP', ram: 'RAMMED', super: 'DOWN' });

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
 * @param {{ config: GameConfig, state?: GameState, random: () => number, jokes?: boolean }} context
 * @returns {boolean} whether the event was one of the Warp game's
 */
export function playWarpEvent(effects, event, { config, state, random, jokes = false }) {
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
        effects.label({
          text: event.air ? `AIR RING +${event.points}` : event.chain > 1 ? `PERFECT ×${event.chain}` : 'PERFECT',
          x: craft.x,
          y: craft.y - 92,
          color: `rgb(${event.air ? CYAN : THEME.amber})`,
          life: 0.7,
          size: 18 + Math.min(event.chain, 5) * 2,
        });
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

      if (event.by !== 'pad') {
        const [text, rgb] = event.by === 'slingshot' ? ['SLINGSHOT!', CYAN] : event.by === 'drift' ? ['DRIFT BOOST!', THEME.amber] : ['ROCKET START!', THEME.lime];
        effects.label({ text, x: width / 2, y: height * 0.46, color: `rgb(${rgb})`, life: 0.8, size: 28 });
        effects.flashSparingly(`rgb(${rgb})`, 0.1);
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
    case 'jump':
      // A rival's jump is seen as it flies; the player's own kicks off the lane.
      if (event.pilot === undefined) {
        effects.ring({ x: craft.x, y: craft.y + 6, color: `rgba(${CYAN}, 0.9)`, radius: 16, growth: 380, life: 0.4, width: 4 });
        effects.burst({ x: craft.x, y: craft.y + 10, color: `rgb(${CYAN})`, count: 18, speed: 260, direction: Math.PI / 2, spread: 1.6, life: 0.4, size: 2 });
        effects.pulse(0.6);
      }
      return true;
    case 'land':
      for (const side of [-1, 1]) {
        effects.burst({ x: craft.x + side * 26, y: craft.y + 12, color: `rgb(${SPARKS})`, count: 10, speed: 220, direction: side > 0 ? 0 : Math.PI, spread: 1, life: 0.35, size: 1.8 });
      }

      effects.label({ text: `BIG AIR +${event.points}`, x: craft.x, y: craft.y - 92, color: `rgb(${CYAN})`, life: 0.7, size: 20 });
      effects.shake(0.25);
      return true;
    case 'gate':
      effects.ring({ x: craft.x, y: craft.y - 20, color: `rgba(${THEME.lime}, 0.9)`, radius: 26, growth: 300, life: 0.35, width: event.grade === 'perfect' ? 4 : 2 });

      if (event.grade === 'perfect') {
        effects.burst({ x: craft.x, y: craft.y - 20, color: `rgb(${THEME.lime})`, count: 16, speed: 260, life: 0.4, size: 1.8 });
        effects.label({ text: `THREADED! +${event.points}`, x: craft.x, y: craft.y - 92, color: `rgb(${THEME.lime})`, life: 0.7, size: 20 });
      }
      return true;
    case 'drift-ready':
      effects.ring({ x: craft.x, y: craft.y, color: `rgba(${THEME.amber}, 0.9)`, radius: 30, growth: 240, life: 0.3, width: 3 });
      return true;
    case 'flow': {
      const top = event.multiplier >= rules.maxFlow;
      effects.pop();
      effects.label({ text: top ? `MAX FLOW ×${event.multiplier}` : `FLOW ×${event.multiplier}`, x: width / 2, y: height * 0.34, color: `rgb(${top ? THEME.amber : THEME.lime})`, life: 0.8, size: 26, stack: true });
      return true;
    }
    case 'mine-drop': {
      const at = spotOf(state, config, event.z, event.x);
      effects.ring({ x: at.x, y: at.y, color: `rgba(${THEME.red}, 0.9)`, radius: 3, growth: 80 + 240 * at.scale, life: 0.5, width: 2 });
      effects.label({ text: jokes ? 'EVICTION NOTICE!' : 'MINE!', x: width / 2, y: height * 0.4, color: `rgb(${THEME.red})`, life: 0.7, size: 22 });
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
      effects.label({ text: `${(pilot?.name ?? 'RIVAL').toUpperCase()} ${TAKEN_DOWN[event.by]}! +${event.points}`, x: width / 2, y: height * 0.42, color: `rgb(${THEME.amber})`, life: 0.9, size: 22, stack: true });
      effects.shake(event.by === 'ram' ? 0.6 : 0.4);

      if (event.by === 'ram') {
        effects.kick('player');
      }
      return true;
    }
    case 'warp-system': {
      const shielding = event.system === 'shield';
      const rgb = shielding ? SHIELD : THEME.amber;
      effects.ring({ x: craft.x, y: craft.y, color: `rgba(${rgb}, 0.85)`, radius: 25, growth: shielding ? 320 : 210, life: 0.4, width: 3 });
      effects.label({ text: shielding ? 'SHIELDS ONLINE' : 'RAPID FIRE!', x: width / 2, y: height * 0.44, color: `rgb(${rgb})`, life: 0.6, size: 22 });
      effects.pulse(0.35);
      return true;
    }
    case 'craft-ability': {
      const rgb = '216, 180, 254';
      effects.ring({ x: craft.x, y: craft.y, color: `rgba(${rgb}, 0.9)`, radius: 20, growth: 530, life: 0.6, width: 5 });
      effects.burst({ x: craft.x, y: craft.y + 14, color: `rgb(${rgb})`, count: 25, speed: 330, direction: Math.PI / 2, spread: 0.95, life: 0.38, size: 2 });
      effects.label({ text: 'WARP ENGAGED!', x: width / 2, y: height * 0.42, color: `rgb(${rgb})`, life: 0.8, size: 29 });
      effects.flashSparingly(`rgb(${rgb})`, 0.12);
      effects.pulse(0.65);
      return true;
    }
    case 'nitro':
      // The tank lets go: fire out of the engines, a ring off the craft, and the word.
      effects.burst({ x: craft.x, y: craft.y + 14, color: `rgb(${NITRO})`, count: 26, speed: 320, direction: Math.PI / 2, spread: 1.1, life: 0.4, size: 2.2 });
      effects.ring({ x: craft.x, y: craft.y, color: `rgba(${NITRO}, 0.9)`, radius: 26, growth: 420, life: 0.4, width: 4 });
      effects.label({ text: 'NITRO!', x: width / 2, y: height * 0.46, color: `rgb(${NITRO})`, life: 0.6, size: 28 });
      effects.flashSparingly(`rgb(${NITRO})`, 0.1);
      effects.pulse(0.7);
      return true;
    case 'gun-fire':
      // The rounds are drawn as they fly and land, with the lane: sparks here would add their
      // light to the rival under them, several times a second, and burn out to white.
      return true;
    case 'rocket-launch':
      effects.burst({ x: craft.x, y: craft.y - 6, color: `rgb(${ROCKET})`, count: 14, speed: 220, direction: Math.PI / 2, spread: 1.4, life: 0.35, size: 2 });
      effects.label({ text: 'ROCKET AWAY!', x: craft.x, y: craft.y - 92, color: `rgb(${ROCKET})`, life: 0.6, size: 17 });
      return true;
    case 'explosion': {
      const at = spotOf(state, config, event.z, event.x);
      const size = 0.4 + at.scale;

      effects.burst({ x: at.x, y: at.y, color: `rgb(${ROCKET})`, count: 44, speed: 160 + 320 * at.scale, life: 0.7, size: 2.6 });
      effects.burst({ x: at.x, y: at.y, color: `rgb(${SPARKS})`, count: 22, speed: 100 + 220 * at.scale, life: 0.5, size: 2 });
      effects.ring({ x: at.x, y: at.y, color: `rgba(${ROCKET}, 0.95)`, radius: 6, growth: 260 * size, life: 0.5, width: 6 });
      effects.schedule(0.08, () => effects.ring({ x: at.x, y: at.y, color: `rgba(${SPARKS}, 0.8)`, radius: 4, growth: 180 * size, life: 0.4, width: 3 }));
      effects.flashSparingly(`rgb(${ROCKET})`, 0.14);
      effects.shake(0.3 + 0.4 * Math.min(1, at.scale));
      return true;
    }
    case 'ammo': {
      const [text, rgb] = event.kind === 'rocket' ? ['ROCKET!', ROCKET] : ['NITRO +1', NITRO];
      effects.ring({ x: craft.x, y: craft.y - 14, color: `rgba(${rgb}, 0.9)`, radius: 20, growth: 260, life: 0.3, width: 3 });
      effects.label({ text, x: craft.x, y: craft.y - 86, color: `rgb(${rgb})`, life: 0.6, size: 17 });
      return true;
    }
    case 'shield-hit':
      // The bubble takes it and bursts.
      effects.ring({ x: craft.x, y: craft.y - 6, color: `rgba(${SHIELD}, 0.95)`, radius: 40, growth: 300, life: 0.45, width: 5 });
      effects.burst({ x: craft.x, y: craft.y - 6, color: `rgb(${SHIELD})`, count: 28, speed: 300, life: 0.5, size: 2 });
      effects.label({ text: event.left > 0 ? `SHIELD ×${event.left}` : 'SHIELD DOWN', x: craft.x, y: craft.y - 92, color: `rgb(${SHIELD})`, life: 0.7, size: 18 });
      effects.shake(0.35);
      return true;
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

  // Side by side over the line.
  if (event.margin < PHOTO_FINISH && event.place <= 2) {
    effects.label({ text: 'PHOTO FINISH!', x: width / 2, y: height * 0.5, color: `rgb(${THEME.amber})`, life: 1.4, size: 30 });
  }

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
