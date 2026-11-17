import test from 'node:test';
import assert from 'node:assert/strict';

import { playBrickEvent } from '../src/adapters/canvas/brick-effects.js';
import { playEvents } from '../src/adapters/canvas/event-effects.js';
import { brickRgb, DROP_STYLE, STEEL_RGB, SUPER_STYLE, THEME } from '../src/adapters/canvas/theme.js';
import { Effects } from '../src/adapters/effects.js';
import { BRICKS_CONFIG } from '../src/config.js';
import { createInitialState } from '../src/domain/game.js';

// What the Bricks game's events leave on the board.

const config = BRICKS_CONFIG;
const { width, height } = config;
const state = createInitialState(config, 1);
const context = { config, state, random: () => 0.5 };

function play(event, effects = new Effects({ random: () => 0.5 })) {
  const known = playBrickEvent(effects, event, context);
  return { effects, known };
}

const broken = (overrides = {}) => ({ type: 'brick-break', kind: 'plain', row: 2, x: 200, y: 150, w: 44, h: 20, by: 'ball', vx: 0, vy: -500, combo: 1, points: 10, ...overrides });

test('a broken brick flies apart in pieces of its own color, the way the ball was going, and they fall', () => {
  const { effects } = play(broken());

  assert.equal(effects.shards.length, 6, 'three across, in two rows');
  assert.ok(effects.shards.every((shard) => shard.color === `rgb(${brickRgb({ kind: 'plain', row: 2 })})`));
  assert.ok(effects.shards.every((shard) => shard.vy < 0), 'up, as the ball was going');
  assert.ok(effects.shards.every((shard) => shard.gravity > 0), 'and then down');
  assert.ok(effects.shards.some((shard) => shard.vx < 0) && effects.shards.some((shard) => shard.vx > 0), 'scattering from its middle');
  assert.ok(effects.shards.every((shard) => Math.abs(shard.x - 200) < 22 && Math.abs(shard.y - 150) < 10), 'from where the brick was');
  assert.ok(effects.particles.length > 0, 'with sparks');
  assert.equal(effects.popAmount, 1, 'and the combo counter swells');
  assert.equal(effects.labels.length, 0);
});

test('pieces thrown by a blast fly the way it threw them', () => {
  const { effects } = play(broken({ by: 'blast', vx: 420, vy: 0 }));

  assert.ok(effects.shards.filter((shard) => shard.vx > 0).length >= 5);
});

test('with reduced motion a brick breaks into fewer pieces', () => {
  const { effects } = play(broken(), new Effects({ random: () => 0.5, reducedMotion: true }));

  assert.equal(effects.shards.length, 4);
});

test('a combo is called out at five, at ten, and at every tenth brick after', () => {
  const called = (combo) => play(broken({ combo })).effects.labels.map((label) => label.text);

  assert.deepEqual(called(4), []);
  assert.deepEqual(called(5), ['COMBO ×5']);
  assert.deepEqual(called(10), ['COMBO ×10']);
  assert.deepEqual(called(15), []);
  assert.deepEqual(called(20), ['COMBO ×20']);
  assert.deepEqual(called(30), ['COMBO ×30']);
});

test('a brick that takes a hit and stands sparks in its color; steel in its own', () => {
  const tough = play({ type: 'brick-hit', kind: 'tough', row: 0, x: 100, y: 100, hp: 1 }).effects;
  const steel = play({ type: 'brick-hit', kind: 'steel', row: 0, x: 100, y: 100, hp: 1 }).effects;

  assert.ok(tough.particles.every((particle) => particle.color === `rgb(${brickRgb({ kind: 'tough', row: 0 })})`));
  assert.ok(steel.particles.every((particle) => particle.color === `rgb(${STEEL_RGB})`));
  assert.equal(tough.rings.length, 1);
  assert.equal(tough.shards.length, 0, 'nothing breaks off');
});

test('a bomb goes off with rings, sparks, a shake and a flash', () => {
  const { effects } = play({ type: 'blast', x: 200, y: 150, radius: 62 });

  assert.equal(effects.rings.length, 2);
  assert.ok(effects.particles.length >= 40);
  assert.ok(effects.shakeAmount > 0.5);
  assert.ok(effects.flashAlpha > 0.15);
  assert.equal(effects.flashColor, `rgb(${THEME.amber})`);
});

test('bombs going off one after another flash the board once, not once each', () => {
  const effects = new Effects({ random: () => 0.5 });
  const blast = { type: 'blast', x: 200, y: 150, radius: 62 };
  let flashes = 0;
  let previous = 0;

  // Six bombs, a fuse apart, as a row of them goes up.
  for (let bomb = 0; bomb < 6; bomb += 1) {
    playBrickEvent(effects, blast, context);
    flashes += effects.flashAlpha > previous + 1e-9 ? 1 : 0;

    for (let frame = 0; frame < 5; frame += 1) {
      effects.update(0.09 / 5);
    }

    previous = effects.flashAlpha;
  }

  assert.ok(flashes <= 2, `${flashes} flashes in half a second`);

  // After a moment's quiet the next one flashes again.
  effects.update(0.5);
  playBrickEvent(effects, blast, context);
  assert.ok(effects.flashAlpha > 0.15);
});

test('thunder runs down the column from the ceiling; a zigzag runs along the row from wall to wall', () => {
  const thunder = play({ type: 'strike', kind: 'thunder', x: 200, y: 180 }).effects;
  const zigzag = play({ type: 'strike', kind: 'zigzag', x: 200, y: 180 }).effects;
  const ends = (bolt) => [bolt.points[0], bolt.points.at(-1)];

  assert.equal(thunder.bolts.length, 2, 'a bolt and its bright core');
  const [top, bottom] = ends(thunder.bolts[0]);
  assert.deepEqual([top.x, top.y], [200, 0]);
  assert.ok(bottom.y > 180 && bottom.x === 200);
  assert.equal(thunder.bolts[0].color, `rgb(${SUPER_STYLE.thunder.rgb})`);

  const [left, right] = ends(zigzag.bolts[0]);
  assert.deepEqual([left.x, left.y, right.x, right.y], [0, 180, width, 180]);
  assert.equal(zigzag.bolts[0].color, `rgb(${SUPER_STYLE.zigzag.rgb})`);
  assert.ok(zigzag.shakeAmount > 0.5 && zigzag.flashAlpha > 0.15);
});

test('a caught bonus is called out by name, in its color, where the paddle caught it', () => {
  for (const [kind, style] of Object.entries(DROP_STYLE)) {
    const { effects } = play({ type: 'drop', kind, x: 250, y: 740 });

    assert.deepEqual(effects.labels.map((label) => [label.text, label.color]), [[style.label, `rgb(${style.rgb})`]], kind);
    assert.ok(effects.labels[0].y < 740, 'above the paddle');
    assert.ok(effects.particles.length > 0);
    assert.ok(effects.squash.player > 0, 'the paddle takes it');
  }

  // Caught at the wall, its name is still read in full.
  assert.ok(play({ type: 'drop', kind: 'multi', x: 10, y: 740 }).effects.labels[0].x >= 90);
  assert.ok(play({ type: 'drop', kind: 'multi', x: width - 10, y: 740 }).effects.labels[0].x <= width - 90);
});

test('a bonus leaving its brick, and a laser volley, are small things', () => {
  const spawned = play({ type: 'drop-spawn', kind: 'wide', x: 200, y: 150 }).effects;
  assert.equal(spawned.rings.length, 1);
  assert.equal(spawned.labels.length, 0);
  assert.equal(spawned.flashAlpha, 0);

  const fired = play({ type: 'bolt-fire', x: 200, y: 744 }).effects;
  assert.equal(fired.particles.length, 3);
  assert.equal(fired.flashAlpha, 0);
  assert.equal(fired.shakeAmount, 0);
});

test('the safety net\'s save is called out', () => {
  const { effects } = play({ type: 'shield-save', x: 300, y: 780 });

  assert.deepEqual(effects.labels.map((label) => label.text), ['SAVED!']);
  assert.equal(effects.labels[0].color, `rgb(${DROP_STYLE.shield.rgb})`);
  assert.ok(effects.rings.length === 1 && effects.particles.length > 0);
});

test('a wall coming down is celebrated, and the next wall is named as it arrives', () => {
  const { effects } = play({ type: 'level-clear', level: 0, bonus: 100, last: false });

  assert.deepEqual(effects.labels.map((label) => label.text), ['WALL DOWN!']);
  assert.ok(effects.flashAlpha > 0);

  effects.update(0.7);
  assert.ok(effects.particles.length > 60, 'fireworks, one shell after another');

  effects.update(0.4);
  assert.deepEqual(effects.labels.map((label) => label.text), [`WALL 2 · ${config.bricks.levels[1].name.toUpperCase()}`]);
  assert.ok(effects.labels[0].y > height / 2, 'under the wall, clear of it');
});

test('the last wall coming down clears the game, and names no next wall', () => {
  const last = config.bricks.levels.length - 1;
  const { effects } = play({ type: 'level-clear', level: last, bonus: 800, last: true });

  assert.deepEqual(effects.labels.map((label) => label.text), ['ALL CLEAR!']);
  effects.update(0.6);
  effects.update(0.6);
  assert.ok(!effects.labels.some((label) => label.text.startsWith('WALL ')));
});

test('with reduced motion the fireworks are fewer', () => {
  const shells = (reducedMotion) => {
    const effects = new Effects({ random: () => 0.5, reducedMotion, maxParticles: 10000 });
    playBrickEvent(effects, { type: 'level-clear', level: 0, bonus: 100, last: false }, context);
    effects.update(0.3);
    effects.update(0.4);
    return effects.rings.length;
  };

  assert.ok(shells(true) < shells(false));
});

test('events of a match are not the Bricks game\'s to draw', () => {
  const { effects, known } = play({ type: 'paused' });

  assert.equal(known, false);
  assert.ok(!effects.active);
});

test('the board\'s event player hands the Bricks game\'s events over', () => {
  const effects = new Effects({ random: () => 0.5 });
  playEvents(effects, [broken(), { type: 'blast', x: 200, y: 150, radius: 62 }], { config, random: () => 0.5, state });

  assert.equal(effects.shards.length, 6);
  assert.equal(effects.rings.length, 2);
});
