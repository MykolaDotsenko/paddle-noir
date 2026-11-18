import test from 'node:test';
import assert from 'node:assert/strict';

import { playEvents } from '../src/adapters/canvas/event-effects.js';
import { playNovaEvent } from '../src/adapters/canvas/nova-effects.js';
import { ENEMY_RGB, LOOT_STYLE, SUPER_STYLE, THEME } from '../src/adapters/canvas/theme.js';
import { Effects } from '../src/adapters/effects.js';
import { NOVA_CONFIG } from '../src/config.js';
import { createInitialState } from '../src/domain/game.js';

// What the Nova game's events leave on the board.

const config = NOVA_CONFIG;
const { width, height } = config;
const context = { config, random: () => 0.5 };

function play(event, effects = new Effects({ random: () => 0.5 })) {
  return { effects, known: playNovaEvent(effects, event, context) };
}

const down = (overrides = {}) => ({ type: 'enemy-down', kind: 'drone', x: 200, y: 300, rx: 16, by: 'bolt', points: 30, multiplier: 1, ...overrides });

test('an enemy goes down in a burst of its color, and the combo counter swells', () => {
  const { effects } = play(down());

  assert.ok(effects.particles.length > 10);
  assert.ok(effects.particles.some((particle) => particle.color === `rgb(${ENEMY_RGB.drone})`));
  assert.equal(effects.rings.length, 1);
  assert.equal(effects.popAmount, 1);
  assert.equal(effects.shards.length, 0, 'a drone leaves no pieces');
  assert.equal(effects.labels.length, 0, 'and at no multiplier, no points called');
});

test('a rock, a pebble and a gunship break into tumbling pieces; with reduced motion, fewer', () => {
  assert.equal(play(down({ kind: 'rock', rx: 24 })).effects.shards.length, 5);
  assert.equal(play(down({ kind: 'pebble', rx: 13 })).effects.shards.length, 3);
  assert.equal(play(down({ kind: 'gunship', rx: 26 })).effects.shards.length, 5);
  assert.equal(play(down({ kind: 'rock', rx: 24 }), new Effects({ random: () => 0.5, reducedMotion: true })).effects.shards.length, 2);

  const gunship = play(down({ kind: 'gunship', rx: 26 })).effects;
  assert.ok(gunship.shakeAmount > 0.4, 'a gunship shakes the board');
});

test('with a multiplier, what a downed enemy scored is called out where it went down', () => {
  const { effects } = play(down({ points: 90, multiplier: 3 }));

  assert.deepEqual(effects.labels.map((label) => [label.text, label.x]), [['+90', 200]]);
  assert.equal(play(down({ kind: 'pebble', points: 30, multiplier: 3 })).effects.labels.length, 0, 'not for a pebble: too many');
  assert.equal(play(down({ by: 'ram', points: 0, multiplier: 3 })).effects.labels.length, 0);
});

test('the boss goes down in a string of blasts, then one that fills the court', () => {
  const { effects } = play(down({ kind: 'boss', rx: 86, points: 5000, multiplier: 2 }));

  assert.deepEqual(effects.labels.map((label) => label.text), ['DREADNOUGHT DOWN!']);
  assert.equal(effects.particles.length, 0, 'nothing yet');

  effects.update(0.3);
  assert.ok(effects.rings.length >= 2, 'blast after blast');

  let flash = 0;

  for (let frame = 0; frame < 16; frame += 1) {
    effects.update(0.05);
    flash = Math.max(flash, effects.flashAlpha);
  }

  assert.ok(flash > 0.2, 'then the big one');
  assert.ok(effects.labels.length === 1);
});

test('a hit enemy sparks; its fire leaves a ring at the muzzle; a shot of the ship\'s leaves nothing', () => {
  assert.equal(play({ type: 'enemy-hit', kind: 'gunship', x: 1, y: 2, hp: 3 }).effects.particles.length, 4);
  assert.equal(play({ type: 'enemy-fire', kind: 'drone', x: 1, y: 2, count: 1 }).effects.rings.length, 1);

  const fired = play({ type: 'ship-fire', x: 250, y: 734 });
  assert.equal(fired.known, true);
  assert.ok(!fired.effects.active, 'five times a second, it would only clutter the board');
});

test('the boss arriving is a warning, and its rage is called', () => {
  const warned = play({ type: 'enemy-arrive', kind: 'boss', x: 250, y: -30 }).effects;
  assert.deepEqual(warned.labels.map((label) => label.text), ['WARNING!']);
  assert.equal(warned.labels[0].color, `rgb(${THEME.red})`);

  assert.deepEqual(play({ type: 'boss-rage', phase: 1, x: 250, y: 130 }).effects.labels.map((label) => label.text), ['ENRAGED!']);
  assert.deepEqual(play({ type: 'boss-rage', phase: 2, x: 250, y: 130 }).effects.labels.map((label) => label.text), ['FINAL FURY!']);
});

test('the ship hit bursts in its color and the paddle kicks', () => {
  const { effects } = play({ type: 'ship-hit', x: 250, y: 752 });

  assert.ok(effects.particles.some((particle) => particle.color === `rgb(${THEME.side.player.rgb})`));
  assert.ok(effects.squash.player > 0);
  assert.equal(effects.flashAlpha, 0, 'the life lost flashes the board; this does not flash it twice');
});

test('a caught bonus is called out by name, in its color, kept on the court', () => {
  for (const [kind, style] of Object.entries(LOOT_STYLE)) {
    const { effects } = play({ type: 'loot', kind, x: 250, y: 752 });
    assert.deepEqual(effects.labels.map((label) => [label.text, label.color]), [[style.label, `rgb(${style.rgb})`]]);
  }

  assert.ok(play({ type: 'loot', kind: 'rapid', x: 5, y: 752 }).effects.labels[0].x >= 90);
  assert.equal(play({ type: 'loot-spawn', kind: 'life', x: 5, y: 300 }).effects.rings.length, 1);
});

test('a super goes off with its name, in its color', () => {
  for (const [kind, style] of Object.entries(SUPER_STYLE)) {
    const { effects } = play({ type: 'super-fire', kind, x: 250, y: 734 });
    assert.deepEqual(effects.labels.map((label) => [label.text, label.color]), [[`${style.label}!`, `rgb(${style.rgb})`]]);
  }
});

test('thunder jumps from the ship to one enemy and on to the next', () => {
  const targets = [{ x: 100, y: 300 }, { x: 300, y: 200 }];
  const { effects } = play({ type: 'chain', x: 250, y: 734, targets });
  const ends = effects.bolts.map((bolt) => [bolt.points[0], bolt.points.at(-1)]);

  assert.equal(effects.bolts.length, 4, 'a bolt and its core, for each jump');
  assert.deepEqual([ends[0][0].x, ends[0][0].y, ends[0][1].x, ends[0][1].y], [250, 734, 100, 300]);
  assert.deepEqual([ends[2][0].x, ends[2][0].y, ends[2][1].x, ends[2][1].y], [100, 300, 300, 200]);
});

test('a sector cleared is celebrated, and the next sector is named; the last saves the galaxy', () => {
  const { effects } = play({ type: 'sector-clear', sector: 0, bonus: 300, last: false });
  assert.deepEqual(effects.labels.map((label) => label.text), ['SECTOR CLEAR!']);
  effects.update(0.7);
  effects.update(0.6);
  assert.deepEqual(effects.labels.map((label) => label.text), [`SECTOR 2 · ${config.nova.sectors[1].name.toUpperCase()}`]);
  assert.ok(effects.labels[0].y > height * 0.45 && effects.labels[0].x === width / 2);

  const last = play({ type: 'sector-clear', sector: 4, bonus: 1500, last: true }).effects;
  assert.deepEqual(last.labels.map((label) => label.text), ['GALAXY SAVED!']);
  last.update(0.7);
  last.update(0.7);
  assert.ok(!last.labels.some((label) => label.text.startsWith('SECTOR ')));
});

test('events of a match are not Nova\'s to draw, and the board\'s player hands Nova\'s over', () => {
  assert.equal(play({ type: 'paused' }).known, false);

  const effects = new Effects({ random: () => 0.5 });
  playEvents(effects, [down({ kind: 'rock', rx: 24 })], { config, random: () => 0.5, state: createInitialState(config, 1) });
  assert.equal(effects.shards.length, 5);
});
