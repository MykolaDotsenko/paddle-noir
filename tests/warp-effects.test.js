import test from 'node:test';
import assert from 'node:assert/strict';

import { playEvents } from '../src/adapters/canvas/event-effects.js';
import { playWarpEvent } from '../src/adapters/canvas/warp-effects.js';
import { SUPER_STYLE, THEME } from '../src/adapters/canvas/theme.js';
import { viewOf } from '../src/adapters/canvas/warp.js';
import { Effects } from '../src/adapters/effects.js';
import { GAME_CONFIG, WARP_CONFIG } from '../src/config.js';
import { WARP_COURSES } from '../src/courses.js';
import { createInitialState, GAME_PHASE } from '../src/domain/game.js';
import { raceState } from '../src/domain/warp.js';

// What the Warp game's events leave on the board.

const config = WARP_CONFIG;
const { width, height } = config;
const CRAFT_Y = config.height - config.paddle.inset - config.paddle.height / 2;
const state = { ...createInitialState(config, 1), phase: GAME_PHASE.RUNNING, player: { x: 180, vx: 0 }, warp: { ...raceState(config, 0), z: 300 } };
const context = { config, state, random: () => 0.5 };

function play(event, effects = new Effects({ random: () => 0.5 })) {
  return { effects, known: playWarpEvent(effects, event, context) };
}

const labelled = (effects) => effects.labels.map((label) => label.text);

test('other games\' events are not the race\'s, and outside a race nothing is', () => {
  assert.equal(play({ type: 'enemy-down', kind: 'rock', x: 1, y: 1, rx: 4, by: 'bolt', points: 0, multiplier: 1 }).known, false);
  assert.equal(playWarpEvent(new Effects(), { type: 'final-stretch' }, { config: GAME_CONFIG, state: createInitialState(GAME_CONFIG, 1), random: () => 0.5 }), false);
  assert.equal(playWarpEvent(new Effects(), { type: 'final-stretch' }, { config, random: () => 0.5 }), false);
});

test('a ring flown dead center rings out at the craft and calls the chain; one off its middle only rings; a miss is silent', () => {
  const perfect = play({ type: 'ring', grade: 'perfect', chain: 3, z: 300, x: 0, points: 150 }).effects;

  assert.deepEqual(labelled(perfect), ['PERFECT ×3']);
  assert.equal(perfect.rings[0].x, 180);
  assert.ok(perfect.particles.length > 14);
  assert.deepEqual(labelled(play({ type: 'ring', grade: 'perfect', chain: 1, z: 300, x: 0, points: 50 }).effects), ['PERFECT']);

  const good = play({ type: 'ring', grade: 'good', chain: 0, z: 300, x: 0, points: 20 }).effects;
  assert.deepEqual([good.labels.length, good.rings.length, good.particles.length], [0, 1, 0]);

  const miss = play({ type: 'ring', grade: 'miss', chain: 0, z: 300, x: 0, points: 0 });
  assert.equal(miss.known, true);
  assert.deepEqual([miss.effects.rings.length, miss.effects.particles.length], [0, 0]);
});

test('a boost blows out of the engines; a slingshot is called out; a super\'s boost is left to the super', () => {
  const pad = play({ type: 'boost', z: 300, x: 0, by: 'pad' }).effects;
  assert.ok(pad.particles.length >= 16 && pad.labels.length === 0 && pad.pulseAmount > 0);

  const sling = play({ type: 'boost', z: 300, x: 0, by: 'slingshot' }).effects;
  assert.deepEqual(labelled(sling), ['SLINGSHOT!']);
  assert.ok(sling.flashAlpha > 0);

  const fired = play({ type: 'boost', z: 300, x: 0, by: 'super' });
  assert.equal(fired.known, true);
  assert.equal(fired.effects.particles.length, 0);
});

test('the craft crashing shakes the board, throws pieces of it and flashes, sparingly; a rival crashing is a burst where it is', () => {
  const mine = play({ type: 'crash', z: 300, x: 0, kind: 'mine' }).effects;

  assert.ok(mine.shakeAmount > 0.5 && mine.flashAlpha > 0 && mine.shards.length === 5);
  assert.equal(play({ type: 'crash', z: 300, x: 0, kind: 'mine' }, new Effects({ random: () => 0.5, reducedMotion: true })).effects.shards.length, 2);

  const rival = play({ type: 'crash', z: 320, x: 0.4, kind: 'cargo', pilot: 1 }).effects;
  const spot = viewOf(state.warp, config).project(320, 0.4);
  assert.equal(rival.shakeAmount, 0);
  assert.equal(rival.flashAlpha, 0);
  assert.ok(Math.abs(rival.rings[0].x - spot.x) < 0.01);
  assert.ok(rival.particles.some((particle) => particle.color === `rgb(${WARP_COURSES[0].pilots[1].rgb})`));

  const unseen = play({ type: 'crash', z: 100, x: 0, kind: 'mine', pilot: 9 }).effects;
  assert.equal(unseen.rings[0].x, 180, 'out of sight, it is shown at the craft');
  assert.ok(unseen.particles.some((particle) => particle.color === `rgb(${THEME.rose})`));
});

test('a near miss, a bump and a smash each have their own small mark', () => {
  assert.deepEqual(labelled(play({ type: 'near-miss', z: 300, x: 0.3, points: 40 }).effects), ['CLOSE! +40']);

  const bump = play({ type: 'bump', z: 302, x: 0.1 }).effects;
  assert.ok(bump.particles.length === 18 && bump.shakeAmount > 0);

  const smash = play({ type: 'smash', kind: 'cargo', z: 300, x: 0, points: 60 }).effects;
  assert.deepEqual(labelled(smash), ['SMASH +60']);
  assert.ok(smash.particles.every((particle) => particle.color === `rgb(${SUPER_STYLE.fireball.rgb})`));
});

test('a rival taken down goes up in its color where it is, and is named', () => {
  const { effects } = play({ type: 'takedown', pilot: 2, z: 330, x: -0.2, points: 150 });

  assert.deepEqual(labelled(effects), [`${WARP_COURSES[0].pilots[2].name.toUpperCase()} DOWN! +150`]);
  assert.ok(effects.particles.some((particle) => particle.color === `rgb(${WARP_COURSES[0].pilots[2].rgb})`));
  assert.deepEqual(labelled(play({ type: 'takedown', pilot: 9, z: 330, x: 0, points: 150 }).effects), ['RIVAL DOWN! +150']);
});

test('a place gained swells the place and calls it; a place lost is called in rose; a slipstream is left to the craft', () => {
  const gained = play({ type: 'overtake', place: 1, pilot: 0, points: 50 }).effects;
  assert.equal(gained.popAmount, 1);
  assert.deepEqual(gained.labels.map((label) => [label.text, label.color]), [['P1!', `rgb(${THEME.amber})`]]);
  assert.equal(play({ type: 'overtake', place: 3, pilot: 0, points: 50 }).effects.labels[0].color, `rgb(${THEME.side.player.rgb})`);

  const lost = play({ type: 'overtaken', place: 4, pilot: 0 }).effects;
  assert.deepEqual(lost.labels.map((label) => [label.text, label.color]), [['P4', `rgb(${THEME.rose})`]]);
  assert.equal(lost.popAmount, 0);

  const slip = play({ type: 'slipstream', z: 300, x: 0 });
  assert.equal(slip.known, true);
  assert.equal(slip.effects.labels.length + slip.effects.particles.length, 0);
});

test('thunder strikes from the craft to each rival it hits, and a zigzag\'s shockwave spreads from the craft', () => {
  const thunder = play({ type: 'lightning', targets: [{ z: 320, x: 0.2 }, { z: 340, x: -0.3 }] }).effects;
  const spot = viewOf(state.warp, config).project(340, -0.3);

  assert.equal(thunder.bolts.length, 4);
  assert.ok(thunder.bolts.every((bolt) => bolt.points[0].x === 180));
  assert.ok(Math.abs(thunder.bolts.at(-1).points.at(-1).y - (spot.y - 18 * spot.scale)) < 0.01);

  const wave = play({ type: 'shockwave', z: 300, x: 0 }).effects;
  assert.equal(wave.rings.length, 1);
  wave.update(0.2);
  assert.equal(wave.rings.length, 2, 'a second ring follows');
  assert.ok(wave.shakeAmount > 0);
});

test('the final stretch is called out, with a pulse of the board', () => {
  const { effects } = play({ type: 'final-stretch' });

  assert.deepEqual(labelled(effects), ['FINAL STRETCH!']);
  assert.equal(effects.labels[0].x, width / 2);
  assert.ok(effects.pulseAmount > 0);
});

test('over the line: fireworks for a win, a flash for going through, and nothing to rub it in otherwise', () => {
  const finish = (changes, effects = new Effects({ random: () => 0.5 })) => {
    effects.label({ text: 'CLOSE! +40', x: 1, y: 1, color: 'x' });
    playWarpEvent(effects, { type: 'race-finish', race: 0, place: 1, points: 1000, qualified: true, last: false, margin: 2, ...changes }, context);
    const flashed = effects.flashAlpha;
    effects.update(0.6);
    return { effects, flashed };
  };

  const won = finish({});
  assert.equal(won.effects.labels.length, 0, 'the board says it, not a callout');
  assert.ok(won.effects.particles.length > 100 && won.flashed > 0);
  assert.ok(finish({}, new Effects({ random: () => 0.5, reducedMotion: true })).effects.particles.length < won.effects.particles.length);

  const through = finish({ place: 3 });
  assert.ok(through.effects.particles.length === 0 && through.flashed > 0);

  const out = finish({ place: 5, qualified: false });
  assert.ok(out.effects.particles.length === 0 && out.flashed === 0);
});

test('the lights going out say go, in a race only; the countdown leaves its ring to a match', () => {
  const run = (cfg, events) => {
    const effects = new Effects({ random: () => 0.5 });
    playEvents(effects, events, { config: cfg, random: () => 0.5, state: cfg === config ? state : createInitialState(cfg, 1) });
    return effects;
  };

  assert.deepEqual(labelled(run(config, [{ type: 'serve', x: 250, y: 400 }])), ['GO!']);
  assert.deepEqual(labelled(run(GAME_CONFIG, [{ type: 'serve', x: 250, y: 400 }])), []);
  assert.equal(run(config, [{ type: 'countdown', value: 2 }]).rings.length, 0);
  assert.equal(run(GAME_CONFIG, [{ type: 'countdown', value: 2 }]).rings.length, 1);
  assert.equal(run(config, [{ type: 'near-miss', z: 300, x: 0, points: 40 }]).labels[0].y, CRAFT_Y - 86);
  assert.ok(height > CRAFT_Y);
});
