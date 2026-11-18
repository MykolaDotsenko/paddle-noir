import { ENEMY_FIRE_RGB, ENEMY_RGB, LOOT_STYLE, SUPER_STYLE, THEME } from './theme.js';

/**
 * What the Nova game's events look like: an enemy goes down in a burst of its color, a rock
 * in tumbling pieces, a gunship with a shake and the boss in a string of blasts; the ship is
 * hit; a bonus is caught; a super goes off, thunder jumping from enemy to enemy; the boss
 * arrives and rages; and a sector is cleared. `playEvents` hands these events here.
 *
 * @import { GameConfig, GameEvent } from '../../domain/types.js'
 * @import { Effects } from '../effects.js'
 */

/** The boss goes down in this many blasts, one after another. */
const BOSS_BLASTS = 7;

/**
 * An enemy goes down.
 *
 * @param {Effects} effects
 * @param {Extract<GameEvent, { type: 'enemy-down' }>} event
 * @param {GameConfig} config
 * @param {() => number} random
 */
function downed(effects, event, config, random) {
  const color = `rgb(${ENEMY_RGB[event.kind]})`;
  const size = event.rx;

  if (event.kind === 'boss') {
    // A string of blasts across its hull, then one that fills the court.
    for (let blast = 0; blast < (effects.reducedMotion ? 3 : BOSS_BLASTS); blast += 1) {
      const x = event.x + (random() - 0.5) * size * 1.8;
      const y = event.y + (random() - 0.5) * 50;

      effects.schedule(blast * 0.14, () => {
        effects.burst({ x, y, color: `rgb(${THEME.amber})`, count: 30, speed: 360, life: 0.7, size: 2.4 });
        effects.ring({ x, y, color, radius: 10, growth: 420, life: 0.45, width: 5 });
        effects.shake(0.6);
      });
    }

    effects.schedule(BOSS_BLASTS * 0.14, () => {
      effects.burst({ x: event.x, y: event.y, color, count: 90, speed: 620, life: 1.1, size: 3 });
      effects.ring({ x: event.x, y: event.y, color: `rgb(${THEME.amber})`, radius: 20, growth: 900, life: 0.8, width: 8 });
      effects.flashSparingly(color, 0.35);
      effects.shake(1.2);
      effects.pulse(1);
    });
    effects.label({ text: 'DREADNOUGHT DOWN!', x: config.width / 2, y: config.height * 0.4, color: `rgb(${THEME.amber})`, life: 1.6, size: 30 });
    return;
  }

  effects.burst({ x: event.x, y: event.y, color, count: Math.round(10 + size), speed: 160 + size * 6, life: 0.55, size: 2 });
  effects.burst({ x: event.x, y: event.y, color: THEME.spark, count: 6, speed: 300, life: 0.3, size: 1.5 });
  effects.ring({ x: event.x, y: event.y, color, radius: size * 0.4, growth: 200 + size * 6, life: 0.35, width: 3 });

  if (event.kind === 'rock' || event.kind === 'pebble' || event.kind === 'gunship') {
    // Tumbling pieces of it.
    const pieces = effects.reducedMotion ? 2 : event.kind === 'pebble' ? 3 : 5;

    for (let piece = 0; piece < pieces; piece += 1) {
      const angle = (piece / pieces) * Math.PI * 2 + random();
      const speed = 60 + random() * 120;

      effects.shard({
        x: event.x,
        y: event.y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        width: size * 0.45,
        height: size * 0.3,
        color,
        spin: (random() - 0.5) * 10,
        life: 0.6 + random() * 0.4,
        shrink: 0.7,
      });
    }
  }

  if (event.kind === 'gunship') {
    effects.shake(0.5);
    effects.pulse(0.5);
  }

  if (event.points > 0 && event.multiplier > 1 && event.kind !== 'pebble') {
    effects.label({ text: `+${event.points}`, x: event.x, y: event.y - 24, color: `rgb(${THEME.amber})`, life: 0.6, size: 18 });
  }

  effects.pop();
}

/**
 * @param {Effects} effects
 * @param {GameEvent} event
 * @param {{ config: GameConfig, random: () => number }} context
 * @returns {boolean} whether the event was one of the Nova game's
 */
export function playNovaEvent(effects, event, { config, random }) {
  const { width, height } = config;

  switch (event.type) {
    case 'ship-fire':
      return true;
    case 'enemy-hit':
      effects.burst({ x: event.x, y: event.y, color: `rgb(${ENEMY_RGB[event.kind]})`, count: 4, speed: 160, life: 0.22, size: 1.4 });
      return true;
    case 'enemy-down':
      downed(effects, event, config, random);
      return true;
    case 'enemy-fire':
      effects.ring({ x: event.x, y: event.y, color: `rgba(${ENEMY_FIRE_RGB}, 0.8)`, radius: 3, growth: 90, life: 0.2, width: 2 });
      return true;
    case 'enemy-arrive': {
      const red = `rgb(${THEME.red})`;
      effects.label({ text: 'WARNING!', x: width / 2, y: height * 0.45, color: red, life: 1.6, size: 40 });
      effects.ring({ x: width / 2, y: height * 0.45, color: red, radius: 30, growth: 700, life: 0.9, width: 6 });
      effects.flashSparingly(red, 0.16);
      effects.shake(0.5);
      return true;
    }
    case 'boss-rage': {
      const red = `rgb(${THEME.red})`;
      effects.ring({ x: event.x, y: event.y, color: red, radius: 40, growth: 520, life: 0.6, width: 5 });
      effects.label({ text: event.phase === 2 ? 'FINAL FURY!' : 'ENRAGED!', x: width / 2, y: height * 0.32, color: red, life: 1, size: 32 });
      effects.shake(0.6);
      return true;
    }
    case 'ship-hit': {
      const cyan = `rgb(${THEME.side.player.rgb})`;
      effects.burst({ x: event.x, y: event.y, color: cyan, count: 44, speed: 380, life: 0.7, size: 2.4 });
      effects.burst({ x: event.x, y: event.y, color: `rgb(${THEME.amber})`, count: 20, speed: 260, life: 0.5, size: 2 });
      effects.ring({ x: event.x, y: event.y, color: cyan, radius: 12, growth: 520, life: 0.5, width: 5 });
      effects.kick('player');
      return true;
    }
    case 'loot-spawn':
      effects.ring({ x: event.x, y: event.y, color: `rgba(${LOOT_STYLE[event.kind].rgb}, 0.9)`, radius: 4, growth: 190, life: 0.4, width: 2 });
      return true;
    case 'loot': {
      const style = LOOT_STYLE[event.kind];
      const color = `rgb(${style.rgb})`;

      effects.burst({ x: event.x, y: event.y, color, count: 30, speed: 300, direction: -Math.PI / 2, spread: Math.PI, life: 0.55, size: 2.2 });
      effects.ring({ x: event.x, y: event.y, color, radius: 10, growth: 420, life: 0.45, width: 4 });
      effects.flashSparingly(color, 0.12);
      effects.label({ text: style.label, x: Math.min(Math.max(event.x, 90), width - 90), y: event.y - 60, color, size: 24 });
      return true;
    }
    case 'super-fire': {
      const style = SUPER_STYLE[event.kind];
      const color = `rgb(${style.rgb})`;

      effects.label({ text: `${style.label}!`, x: width / 2, y: height * 0.62, color, size: 38 });
      effects.burst({ x: event.x, y: event.y, color, count: 46, speed: 460, direction: -Math.PI / 2, spread: 2.6, life: 0.6, size: 2.6 });
      effects.ring({ x: event.x, y: event.y, color, radius: 10, growth: 700, life: 0.5, width: 5 });
      effects.flashSparingly(color, 0.14);
      effects.shake(0.45);
      effects.pulse(0.9);
      return true;
    }
    case 'chain': {
      const color = `rgb(${SUPER_STYLE.thunder.rgb})`;
      let from = { x: event.x, y: event.y };

      // From the ship to the nearest enemy, and on from one to the next.
      for (const target of event.targets) {
        effects.bolt({ x1: from.x, y1: from.y, x2: target.x, y2: target.y, color, segments: 7, jag: 14, life: 0.4, width: 3 });
        effects.bolt({ x1: from.x, y1: from.y, x2: target.x, y2: target.y, color: THEME.spark, segments: 5, jag: 8, life: 0.25, width: 1.5 });
        from = target;
      }
      return true;
    }
    case 'sector-clear': {
      const lime = `rgb(${THEME.lime})`;
      const next = config.nova?.sectors[event.sector + 1];

      for (let shell = 0; shell < (effects.reducedMotion ? 2 : 5); shell += 1) {
        const x = width * (0.15 + random() * 0.7);
        const y = height * (0.12 + random() * 0.3);
        const color = `rgb(${Object.values(LOOT_STYLE)[shell % 4].rgb})`;

        effects.schedule(shell * 0.12, () => {
          effects.burst({ x, y, color, count: 34, speed: 330, life: 0.9, size: 2.2, gravity: 220 });
          effects.ring({ x, y, color, radius: 6, growth: 300, life: 0.5, width: 3 });
        });
      }

      effects.flashSparingly(lime, 0.18);
      effects.pulse(1);
      effects.label({ text: event.last ? 'GALAXY SAVED!' : 'SECTOR CLEAR!', x: width / 2, y: height * 0.4, color: lime, life: 1.2, size: 38 });

      if (next) {
        effects.schedule(1.2, () => effects.label({
          text: `SECTOR ${event.sector + 2} · ${next.name.toUpperCase()}`,
          x: width / 2,
          y: height * 0.5,
          color: `rgb(${THEME.text})`,
          life: 1.2,
          size: 22,
        }));
      }
      return true;
    }
    default:
      return false;
  }
}
