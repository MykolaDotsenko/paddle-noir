import test from 'node:test';
import assert from 'node:assert/strict';

import { drawBossBar, drawEnemies, drawLoot, drawMultiplier, drawShip, drawShots, drawSpace, hash, MULTIPLIER_SHOWN } from '../src/adapters/canvas/nova.js';
import { ENEMY_FIRE_RGB, ENEMY_RGB, LOOT_STYLE, SUPER_STYLE, THEME } from '../src/adapters/canvas/theme.js';
import { GAME_CONFIG, NOVA_CONFIG } from '../src/config.js';
import { LOOT_SHARES, shipY } from '../src/domain/nova.js';
import { createInitialState, GAME_PHASE } from '../src/domain/game.js';
import { callsNamed, createRecordingContext } from './support/fake-canvas.js';

// The Nova game on the canvas: what is drawn, where, and in which colors.

const config = NOVA_CONFIG;
const glows = { get: (rgb) => ({ glow: rgb }) };

function game(space = {}, rest = {}) {
  const state = { ...createInitialState(config, 1), phase: GAME_PHASE.RUNNING, player: { x: 250, vx: 0 } };
  return { ...state, ...rest, nova: { ...state.nova, ...space } };
}

const enemy = (kind, placed = {}) => ({ id: 3, kind, x: 200, y: 200, vx: 0, vy: 0, rx: 20, ry: 16, hp: 2, maxHp: 4, age: 0, home: 0, sway: 0, phase: 0, angle: 0.5, spin: 0, fireIn: 1, altIn: 1, ...placed });
const draw = (painter) => {
  const ctx = createRecordingContext();
  painter(ctx);
  return ctx;
};
const painted = (ctx) => ctx.calls.filter(({ name }) => ['fill', 'stroke', 'fillRect', 'fillText'].includes(name));
const colors = (ctx) => painted(ctx).map(({ brush }) => `${brush.fillStyle} ${brush.strokeStyle}`).join(' ');

test('a match has no space, and nothing of Nova is drawn in it', () => {
  const state = createInitialState(GAME_CONFIG, 1);
  const ctx = draw((context) => {
    drawSpace(context, state, GAME_CONFIG);
    drawEnemies(context, state, 0, glows);
    drawShots(context, state, glows);
    drawLoot(context, state, 0, glows);
    drawShip(context, state, GAME_CONFIG, 0, glows);
  });

  assert.equal(ctx.calls.length, 0);
});

test('space darkens the court, and its stars drift down with the game\'s clock, the nearer the faster', () => {
  const stars = (time) => callsNamed(draw((context) => drawSpace(context, game({ time }), config)), 'fillRect').slice(1);
  const still = stars(0);
  const later = stars(1);

  assert.equal(still.length, 46 + 26 + 12, 'three layers of stars');
  assert.equal(callsNamed(draw((context) => drawSpace(context, game(), config)), 'fillRect')[0].brush.globalAlpha < 1, true, 'the court shows through, dimmed');
  const moved = still.map((star, index) => (later[index].args[1] - star.args[1] + config.height) % config.height);
  assert.ok(moved[0] < moved[80], 'a far star drifts less than a near one');
  assert.deepEqual(stars(0).map((call) => call.args), still.map((call) => call.args), 'the same frame every time: no flicker');
  assert.doesNotMatch(colors(draw((context) => drawSpace(context, game(), config))), /255, ?255, ?255|#fff/i);
});

test('the shapes of space are fixed by a hash: the same for the same numbers, spread from 0 to 1', () => {
  const values = Array.from({ length: 400 }, (_, index) => hash(index, 3));

  assert.equal(hash(5, 9), hash(5, 9));
  assert.notEqual(hash(5, 9), hash(9, 5));
  assert.ok(values.every((value) => value >= 0 && value < 1));
  assert.ok(Math.min(...values) < 0.05 && Math.max(...values) > 0.95);
});

test('each kind of enemy is drawn its own way, in its own color, where it is', () => {
  for (const kind of ['rock', 'pebble', 'drone', 'gunship', 'boss']) {
    const ctx = draw((context) => drawEnemies(context, game({ enemies: [enemy(kind, { x: 120, y: 340 })] }), 1000, glows));

    assert.deepEqual(callsNamed(ctx, 'translate')[0].args, [120, 340], kind);
    assert.equal(callsNamed(ctx, 'drawImage')[0].args[0].glow, ENEMY_RGB[kind], `${kind} glows in its color`);
    assert.ok(colors(ctx).includes(ENEMY_RGB[kind]), kind);
    assert.equal(callsNamed(ctx, 'save').length, callsNamed(ctx, 'restore').length, kind);
  }
});

test('a rock is jagged and turns, and keeps its shape from frame to frame', () => {
  const corners = (angle) => callsNamed(draw((context) => drawEnemies(context, game({ enemies: [enemy('rock', { angle })] }), 0, glows)), 'lineTo').slice(0, 8).map((call) => call.args);
  const turn = (angle) => callsNamed(draw((context) => drawEnemies(context, game({ enemies: [enemy('rock', { angle })] }), 0, glows)), 'rotate')[0].args[0];

  assert.deepEqual(corners(0.5), corners(0.5));
  assert.equal(turn(1.2), 1.2);
  const reach = corners(0).map(([x, y]) => Math.hypot(x, y));
  assert.ok(Math.max(...reach) - Math.min(...reach) > 2, 'its corners stand at different distances');
});

test('a gunship shows a light for each hit it has left', () => {
  const ctx = draw((context) => drawEnemies(context, game({ enemies: [enemy('gunship', { hp: 3, maxHp: 7 })] }), 0, glows));
  const lights = callsNamed(ctx, 'fillRect').filter((call) => call.args[3] === 3);

  assert.equal(lights.length, 7);
  assert.equal(lights.filter((call) => String(call.brush.fillStyle).includes(THEME.red)).length, 3);
});

test('the ship\'s bolts are cyan, a zigzag\'s yellow, a fireball an orb; the enemies\' fire is rose', () => {
  const shots = [
    { id: 1, kind: 'bolt', x: 100, y: 500, vx: 0, vy: -900, power: 1, radius: 3, hits: [] },
    { id: 2, kind: 'spread', x: 200, y: 500, vx: 300, vy: -850, power: 2, radius: 3, hits: [] },
    { id: 3, kind: 'fireball', x: 300, y: 400, vx: 0, vy: -650, power: 10, radius: 22, hits: [] },
  ];
  const ctx = draw((context) => drawShots(context, game({ shots, fire: [{ id: 4, x: 50, y: 300, vx: 0, vy: 250 }] }), glows));
  const strokes = callsNamed(ctx, 'stroke').map((call) => String(call.brush.strokeStyle));

  assert.ok(strokes.some((style) => style === THEME.side.player.core));
  assert.ok(strokes.some((style) => style.includes(SUPER_STYLE.zigzag.rgb)));
  assert.deepEqual(callsNamed(ctx, 'drawImage').map((call) => call.args[0].glow), [SUPER_STYLE.fireball.rgb, ENEMY_FIRE_RGB]);
  assert.ok(callsNamed(ctx, 'arc').some((call) => call.args[0] === 50 && call.args[1] === 300), 'the enemy shot where it is');
  assert.doesNotMatch(colors(ctx), /255, ?255, ?255|#fff\b|#ffffff/i, 'nothing the white kept for the ball');

  // A bolt trails behind where it is going.
  const [trail] = callsNamed(ctx, 'lineTo');
  assert.deepEqual(trail.args, [100, 514]);
});

test('nothing is drawn with no shots in space', () => {
  assert.equal(draw((context) => drawShots(context, game(), glows)).calls.length, 0);
});

test('a falling bonus is a capsule in its color with its sign; every bonus has its own', () => {
  const ctx = draw((context) => drawLoot(context, game({ loot: [{ id: 1, kind: 'shield', x: 140, y: 420 }] }), 0, glows));

  assert.deepEqual(callsNamed(ctx, 'fillText').map((call) => call.args[0]), [LOOT_STYLE.shield.glyph]);
  assert.deepEqual(callsNamed(ctx, 'translate')[0].args, [140, 420]);
  assert.deepEqual(Object.keys(LOOT_STYLE).sort(), LOOT_SHARES.map(([kind]) => kind).sort());
  assert.equal(new Set(Object.values(LOOT_STYLE).map((style) => style.label)).size, 4);
  assert.equal(draw((context) => drawLoot(context, game(), 0, glows)).calls.length, 0);
});

test('the ship is drawn where the paddle would be, its cockpit in the paddle\'s core color on the paddle\'s line', () => {
  const ctx = draw((context) => drawShip(context, game(), config, 0, glows));
  const [placed] = callsNamed(ctx, 'translate');
  const cockpit = callsNamed(ctx, 'fill').find((call) => call.brush.fillStyle === THEME.side.player.core);

  assert.deepEqual(placed.args, [250, shipY(config)]);
  assert.ok(cockpit, 'so a test can find it in the pixels, as it finds a paddle');
  assert.ok(callsNamed(ctx, 'stroke').some((call) => call.brush.strokeStyle === THEME.side.player.body));
  assert.equal(callsNamed(ctx, 'fill')[1].brush.globalAlpha, 1, 'solid');
});

test('just after a hit the ship blinks; with reduced motion it is faint instead; as a phantom it is faint and ringed', () => {
  const alpha = (space, now, reduced = false) => callsNamed(draw((context) => drawShip(context, game(space), config, now, glows, reduced)), 'stroke')[0].brush.globalAlpha;

  assert.equal(alpha({ invulnerable: 1 }, 0), 0.35);
  assert.equal(alpha({ invulnerable: 1 }, 90), 1, 'on and off');
  assert.equal(alpha({ invulnerable: 1 }, 90, true), 0.35);
  assert.equal(alpha({ cloak: 2 }, 0), 0.45);
  assert.ok(callsNamed(draw((context) => drawShip(context, game({ cloak: 2 }), config, 0, glows)), 'arc').length >= 1);
});

test('a shield rings the ship, and a powered gun is lit', () => {
  const shielded = draw((context) => drawShip(context, game({ shield: 1 }), config, 0, glows));
  const ring = callsNamed(shielded, 'arc').at(-1);
  assert.deepEqual([ring.args[0], ring.args[2]], [250, 28]);
  assert.ok(String(callsNamed(shielded, 'stroke').at(-1).brush.strokeStyle).includes(LOOT_STYLE.shield.rgb));

  const guns = (space) => callsNamed(draw((context) => drawShip(context, game(space), config, 0, glows)), 'fillRect').length;
  assert.equal(guns({}), 0);
  assert.equal(guns({ rapid: 3 }), 2);
  assert.equal(guns({ triple: 3 }), 2);
});

test('the boss\'s health stands across the top of the court while it is there', () => {
  const bar = (enemies) => draw((context) => drawBossBar(context, game({ enemies }).nova, config));

  assert.equal(bar([enemy('drone')]).calls.length, 0);
  const ctx = bar([enemy('boss', { hp: 40, maxHp: 160 })]);
  const widths = callsNamed(ctx, 'moveTo').map((call) => call.args[0]);
  assert.equal(widths.length, 2);
  assert.deepEqual(callsNamed(ctx, 'fillText').map((call) => call.args[0]), ['DREADNOUGHT']);
  assert.equal(callsNamed(ctx, 'fill').length, 2, 'the track and what is left');
});

test('the multiplier shows from two, with the chain behind it, amber at its highest', () => {
  const texts = (chain) => callsNamed(draw((context) => drawMultiplier(context, game({ chain }).nova, config, 0)), 'fillText');
  const step = config.nova.chainStep;

  assert.equal(MULTIPLIER_SHOWN, 2);
  assert.deepEqual(texts(step - 1), []);
  assert.deepEqual(texts(step).map((call) => call.args[0]), ['×2', `CHAIN ${step}`]);
  assert.ok(String(texts(step * 10)[0].brush.fillStyle).includes(THEME.amber));
  assert.ok(String(texts(step)[0].brush.fillStyle).includes(THEME.text));
  assert.equal(draw((context) => drawMultiplier(context, game({ chain: 99 }).nova, GAME_CONFIG, 0)).calls.length, 0);
});
