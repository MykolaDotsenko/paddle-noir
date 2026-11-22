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
  const perfect = play({ type: 'ring', grade: 'perfect', chain: 3, air: false, z: 300, x: 0, points: 150 }).effects;

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

test('a rival taken down goes up in its color where it is, and is named, with how it went', () => {
  const name = WARP_COURSES[0].pilots[2].name.toUpperCase();
  const down = (by, pilot = 2) => play({ type: 'takedown', pilot, z: 330, x: -0.2, points: 150, by }).effects;
  const effects = down('super');

  assert.deepEqual(labelled(effects), [`${name} DOWN! +150`]);
  assert.ok(effects.particles.some((particle) => particle.color === `rgb(${WARP_COURSES[0].pilots[2].rgb})`));
  assert.deepEqual(labelled(down('super', 9)), ['RIVAL DOWN! +150']);
  assert.deepEqual(labelled(down('guns')), [`${name} SHOT DOWN! +150`]);
  assert.deepEqual(labelled(down('rocket')), [`${name} BLOWN UP! +150`]);
  assert.deepEqual(labelled(down('ram')), [`${name} RAMMED! +150`]);
  // Rammed, it is felt in the craft itself.
  assert.ok(down('ram').shakeAmount > down('guns').shakeAmount);
  assert.deepEqual([down('ram').squash.player, down('guns').squash.player], [1, 0]);
});

test('nitro lets go out of the engines, in its own blue, and is called out', () => {
  const { effects } = play({ type: 'nitro', z: 300, x: 0 });

  assert.deepEqual(labelled(effects), ['NITRO!']);
  assert.ok(effects.particles.length >= 20 && effects.particles.every((particle) => particle.color === 'rgb(125, 211, 252)' && particle.vy > 0));
  assert.equal(effects.rings.length, 1);
  assert.ok(effects.flashAlpha > 0 && effects.pulseAmount > 0);
});

test('the guns\' rounds are left to the picture of the lane: nothing is added over the rival they land on', () => {
  const { effects, known } = play({ type: 'gun-fire', z: 330, x: 0.1 });

  assert.equal(known, true);
  assert.deepEqual([effects.particles.length, effects.rings.length, effects.labels.length, effects.flashAlpha], [0, 0, 0, 0]);
});

test('a rocket leaves the craft with a word, and blows up where its rival is, larger the nearer', () => {
  const launch = play({ type: 'rocket-launch', pilot: 1, z: 300, x: 0 }).effects;
  assert.deepEqual(labelled(launch), ['ROCKET AWAY!']);
  assert.ok(launch.particles.length > 0 && launch.particles.every((particle) => particle.color === 'rgb(251, 146, 60)'));

  const blast = (z) => {
    const effects = new Effects({ random: () => 0.5 });
    playWarpEvent(effects, { type: 'explosion', z, x: 0.2 }, context);
    return effects;
  };
  const near = blast(312);
  const far = blast(380);
  const at = viewOf(state.warp, config).project(312, 0.2);

  assert.ok(near.particles.length >= 60);
  assert.ok(Math.abs(near.rings[0].x - at.x) < 1e-9);
  assert.ok(near.rings[0].growth > far.rings[0].growth);
  assert.ok(near.shakeAmount > far.shakeAmount && far.shakeAmount > 0);
  assert.ok(near.flashAlpha > 0);
  assert.equal(near.labels.length, 0, 'the takedown names who it caught');
  // A second ring follows the first.
  near.update(0.1);
  assert.equal(near.rings.length, 2);
});

test('a crate and a cell flown over say what they gave; a shield says what it took', () => {
  assert.deepEqual(labelled(play({ type: 'ammo', kind: 'rocket', z: 300, x: 0 }).effects), ['ROCKET!']);
  assert.deepEqual(labelled(play({ type: 'ammo', kind: 'nitro', z: 300, x: 0 }).effects), ['NITRO +1']);
  assert.equal(play({ type: 'ammo', kind: 'nitro', z: 300, x: 0 }).effects.rings[0].x, 180, 'at the craft');

  const hit = play({ type: 'shield-hit', z: 300, x: 0, left: 1 }).effects;
  assert.deepEqual(labelled(hit), ['SHIELD ×1']);
  assert.ok(hit.particles.length > 20 && hit.shakeAmount > 0);
  assert.equal(hit.flashAlpha, 0, 'a hit taken is no flash');
  assert.deepEqual(labelled(play({ type: 'shield-hit', z: 300, x: 0, left: 0 }).effects), ['SHIELD DOWN']);
});

test('a place gained swells the place and calls it; a place lost is called in rose; a slipstream is left to the craft', () => {
  const gained = play({ type: 'overtake', place: 1, pilot: 0, points: 50 }).effects;
  assert.equal(gained.popAmount, 1);
  assert.deepEqual(gained.labels.map((label) => [label.text, label.color]), [['P1!', `rgb(${THEME.amber})`]]);
  assert.equal(play({ type: 'overtake', place: 3, pilot: 0, points: 50 }).effects.labels[0].color, `rgb(${THEME.side.player.rgb})`);

  const lost = play({ type: 'overtaken', place: 4, pilot: 0 }).effects;
  assert.deepEqual(lost.labels.map((label) => [label.text, label.color]), [['P4', `rgb(${THEME.rose})`]]);
  assert.equal(lost.popAmount, 0);

  // Called out in the sky with the others, clear of the place, the arsenal and the radio up top.
  for (const label of [...gained.labels, ...lost.labels]) {
    assert.equal(label.x, config.width / 2);
    assert.ok(label.y - 36 > config.height * 0.33, 'not even at the top of its rise');
  }

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

test('a ring caught in the air is called by what it scored', () => {
  const { effects } = play({ type: 'ring', grade: 'perfect', chain: 2, air: true, z: 300, x: 0, points: 100 });

  assert.deepEqual(effects.labels.map((label) => [label.text, label.color]), [['AIR RING +100', `rgb(${THEME.side.player.rgb})`]]);
});

test('a drift boost and a rocket start are called out like a slingshot, each in its own color', () => {
  const called = (by) => play({ type: 'boost', z: 300, x: 0, by }).effects.labels.map((label) => [label.text, label.color]);

  assert.deepEqual(called('drift'), [['DRIFT BOOST!', `rgb(${THEME.amber})`]]);
  assert.deepEqual(called('start'), [['ROCKET START!', `rgb(${THEME.lime})`]]);
  assert.deepEqual(called('pad'), []);
});

test('the craft kicks off a ramp and lands in a puff either side; a rival\'s jump is seen as it flies', () => {
  const jump = play({ type: 'jump', z: 300, x: 0 }).effects;
  assert.ok(jump.particles.length === 18 && jump.rings.length === 1 && jump.pulseAmount > 0);

  const rival = play({ type: 'jump', z: 320, x: 0.3, pilot: 2 });
  assert.equal(rival.known, true);
  assert.equal(rival.effects.particles.length + rival.effects.rings.length, 0);

  const land = play({ type: 'land', z: 340, x: 0, points: 60 }).effects;
  assert.deepEqual(labelled(land), ['BIG AIR +60']);
  assert.equal(land.particles.length, 20);
  assert.ok(land.shakeAmount > 0);
});

test('a gate threaded dead center is called out; one flown through off its middle only rings', () => {
  const threaded = play({ type: 'gate', grade: 'perfect', z: 300, x: 0.2, points: 40 }).effects;
  assert.deepEqual(labelled(threaded), ['THREADED! +40']);
  assert.ok(threaded.particles.length > 0);

  const through = play({ type: 'gate', grade: 'good', z: 300, x: 0.2, points: 0 }).effects;
  assert.deepEqual([through.labels.length, through.rings.length, through.particles.length], [0, 1, 0]);
});

test('a drift charged rings at the craft, and the flow going up is called, in amber at its highest', () => {
  const ready = play({ type: 'drift-ready', z: 300, x: 0.7 }).effects;
  assert.deepEqual([ready.rings.length, ready.rings[0].x, ready.labels.length], [1, 180, 0]);

  const up = play({ type: 'flow', multiplier: 3 }).effects;
  assert.deepEqual(up.labels.map((label) => [label.text, label.color]), [['FLOW ×3', `rgb(${THEME.lime})`]]);
  assert.equal(up.popAmount, 1);
  assert.deepEqual(play({ type: 'flow', multiplier: config.warp.maxFlow }).effects.labels.map((label) => [label.text, label.color]), [[`MAX FLOW ×${config.warp.maxFlow}`, `rgb(${THEME.amber})`]]);
});

test('a mine dropped ahead is flagged where it lies, and with the fun extras it is an eviction notice', () => {
  const drop = { type: 'mine-drop', pilot: 4, z: 340, x: 0.2 };
  const spot = viewOf(state.warp, config).project(340, 0.2);
  const plain = play(drop).effects;

  assert.deepEqual(labelled(plain), ['MINE!']);
  assert.ok(Math.abs(plain.rings[0].x - spot.x) < 0.01);

  const fun = new Effects({ random: () => 0.5 });
  playEvents(fun, [drop], { config, state, random: () => 0.5, jokes: true });
  assert.deepEqual(labelled(fun), ['EVICTION NOTICE!']);
});

test('two racers side by side over the line are a photo finish', () => {
  const finish = (changes) => {
    const effects = new Effects({ random: () => 0.5 });
    playWarpEvent(effects, { type: 'race-finish', race: 0, place: 1, points: 1000, qualified: true, last: false, margin: 0.1, ...changes }, context);
    return labelled(effects);
  };

  assert.deepEqual(finish({}), ['PHOTO FINISH!']);
  const photo = play({ type: 'race-finish', race: 0, place: 1, points: 1000, qualified: true, last: false, margin: 0.1 }).effects.labels.find((label) => label.text === 'PHOTO FINISH!');
  // The board of results runs from 112 to 380; the callout rises 36 and is about 30 tall.
  assert.ok(photo.y - 36 - 15 > 380, 'clear of the board of results');
  assert.deepEqual(finish({ place: 2, qualified: false }), ['PHOTO FINISH!'], 'on either side of it');
  assert.deepEqual(finish({ margin: 0.8 }), []);
  assert.deepEqual(finish({ place: 4 }), [], 'not for the places behind');
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
