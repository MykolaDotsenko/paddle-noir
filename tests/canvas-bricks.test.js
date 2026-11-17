import test from 'node:test';
import assert from 'node:assert/strict';

import { COMBO_SHOWN, drawBricks, drawCombo, drawDrops, drawLaser, drawNet } from '../src/adapters/canvas/bricks.js';
import { brickRgb, BOMB_RGB, BRICK_ROWS, DROP_STYLE, STEEL_RGB, THEME } from '../src/adapters/canvas/theme.js';
import { BRICKS_CONFIG, GAME_CONFIG } from '../src/config.js';
import { DROP_SHARES, netLine } from '../src/domain/bricks.js';
import { createInitialState, GAME_PHASE } from '../src/domain/game.js';
import { callsNamed, createRecordingContext } from './support/fake-canvas.js';

// The Bricks game on the canvas: what is drawn, where, and in which colors.

const RULES = BRICKS_CONFIG.bricks;
const glows = { get: (rgb) => ({ glow: rgb }) };

/** A game on a wall drawn for the test, long enough in play that every row has landed. */
function game(rows, wall = {}) {
  const config = { ...BRICKS_CONFIG, bricks: { ...RULES, levels: [{ name: 'Test', drift: null, rows }] } };
  const state = { ...createInitialState(config, 1), phase: GAME_PHASE.RUNNING };
  return { config, state: { ...state, bricks: { ...state.bricks, time: 5, ...wall } } };
}

const draw = (painter) => {
  const ctx = createRecordingContext();
  painter(ctx);
  return ctx;
};
const painted = (ctx) => ctx.calls.filter(({ name }) => ['fill', 'stroke', 'fillRect', 'fillText'].includes(name));
const colors = (ctx) => painted(ctx).map(({ brush }) => `${brush.fillStyle} ${brush.strokeStyle}`).join(' ');

test('a match has no wall, and nothing of Bricks is drawn in it', () => {
  const state = createInitialState(GAME_CONFIG, 1);
  const ctx = draw((context) => {
    drawBricks(context, state, GAME_CONFIG, 0);
    drawDrops(context, state, 0, glows);
    drawLaser(context, state, GAME_CONFIG, 0);
    drawNet(context, state, GAME_CONFIG, 0);
  });

  assert.equal(ctx.calls.length, 0);
});

test('every brick is drawn where it stands, in its row\'s color', () => {
  const { config, state } = game(['o........o', '.o........']);
  const ctx = draw((context) => drawBricks(context, state, config, 0));
  const frames = callsNamed(ctx, 'stroke').filter(({ brush }) => brush.lineWidth === 1.5);

  assert.equal(frames.length, 3);
  assert.ok(String(frames[0].brush.strokeStyle).includes(BRICK_ROWS[0]));
  assert.ok(String(frames[2].brush.strokeStyle).includes(BRICK_ROWS[1]), 'the second row has the next color');
  assert.equal(callsNamed(ctx, 'save').length, callsNamed(ctx, 'restore').length);
});

test('a drifting formation is drawn where it has drifted to', () => {
  const still = game(['o.........']);
  const drifted = game(['o.........'], { drift: 30 });
  const left = ({ config, state }) => callsNamed(draw((context) => drawBricks(context, state, config, 0)), 'moveTo')[0].args[0];

  assert.equal(left(drifted) - left(still), 30);
});

test('the kinds of brick look different: tough framed twice, steel riveted, a bomb with a core', () => {
  const count = (rows, wall) => {
    const { config, state } = game(rows, wall);
    return painted(draw((context) => drawBricks(context, state, config, 0))).length;
  };
  const plain = count(['o.........']);

  assert.ok(count(['O.........']) > plain, 'a tough brick has a second frame');
  assert.ok(count(['#.........']) > plain, 'steel has rivets');
  assert.ok(count(['*.........']) > plain, 'a bomb has a core');

  const steel = game(['#.........']);
  assert.ok(colors(draw((context) => drawBricks(context, steel.state, steel.config, 0))).includes(STEEL_RGB));
  const bomb = game(['*.........']);
  assert.ok(colors(draw((context) => drawBricks(context, bomb.state, bomb.config, 0))).includes(BOMB_RGB));
  assert.equal(brickRgb({ kind: 'steel', row: 3 }), STEEL_RGB);
  assert.equal(brickRgb({ kind: 'bomb', row: 3 }), BOMB_RGB);
  assert.equal(brickRgb({ kind: 'plain', row: BRICK_ROWS.length + 1 }), BRICK_ROWS[1], 'the rows\' colors come round again');
});

test('a tough brick that has taken a hit shows a crack', () => {
  const whole = game(['O.........']);
  const hit = game(['O.........']);
  hit.state = { ...hit.state, bricks: { ...hit.state.bricks, bricks: hit.state.bricks.bricks.map((brick) => ({ ...brick, hp: 1 })) } };
  const lines = ({ config, state }) => callsNamed(draw((context) => drawBricks(context, state, config, 0)), 'lineTo').length;

  assert.equal(lines(whole), 0);
  assert.equal(lines(hit), 4);
});

test('a lit bomb burns red', () => {
  const lit = game(['*.........']);
  lit.state = { ...lit.state, bricks: { ...lit.state.bricks, bricks: lit.state.bricks.bricks.map((brick) => ({ ...brick, fuse: 0.05 })) } };
  const unlit = game(['*.........']);
  const core = ({ config, state }) => callsNamed(draw((context) => drawBricks(context, state, config, 0)), 'fill').at(-1).brush.fillStyle;

  assert.ok(String(core(lit)).includes(THEME.red));
  assert.ok(String(core(unlit)).includes(BOMB_RGB));
});

test('a new wall comes down row by row; with reduced motion it stands from the start', () => {
  const rows = ['o.........', 'o.........', 'o.........'];
  const frames = (time, reducedMotion = false) => {
    const { config, state } = game(rows, { time });
    const ctx = draw((context) => drawBricks(context, state, config, 0, reducedMotion));
    return { count: callsNamed(ctx, 'stroke').length, ctx };
  };

  assert.equal(frames(0).count, 0, 'nothing yet');

  const menu = game(rows, { time: 0 });
  const behindMenu = draw((context) => drawBricks(context, { ...menu.state, phase: GAME_PHASE.READY }, menu.config, 0));
  assert.equal(callsNamed(behindMenu, 'stroke').length, 3, 'behind the menu the wall already stands');
  assert.equal(frames(0.07).count, 2, 'the first two rows are on their way');
  assert.equal(frames(1).count, 3);
  assert.equal(frames(0, true).count, 3);

  const landing = frames(0.1).ctx;
  assert.ok(callsNamed(landing, 'translate').some(({ args }) => args[1] < 0), 'a row on its way is drawn above where it belongs');
  assert.ok(callsNamed(landing, 'stroke').some(({ brush }) => brush.globalAlpha < 1), 'and faint');
  assert.equal(callsNamed(frames(1).ctx, 'translate').length, 0, 'once landed it is drawn in place');
});

test('nothing of the wall is the pure white kept for the ball, or blended to add light', () => {
  const { config, state } = game(['oO#*......']);
  const cracked = { ...state, bricks: { ...state.bricks, bricks: state.bricks.bricks.map((brick) => ({ ...brick, hp: 1, fuse: brick.kind === 'bomb' ? 0.05 : 0 })) } };
  const ctx = draw((context) => drawBricks(context, cracked, config, 0));

  assert.doesNotMatch(colors(ctx), /#fff\b|#ffffff|255, ?255, ?255|white/i);
  assert.ok(painted(ctx).every(({ brush }) => brush.globalCompositeOperation === 'source-over'));
});

test('a falling bonus is a capsule in its color with its sign, over a glow', () => {
  const { state } = game(['o.........'], { drops: [{ id: 1, kind: 'laser', x: 120, y: 300, vy: 100 }, { id: 2, kind: 'life', x: 300, y: 500, vy: 100 }] });
  const ctx = draw((context) => drawDrops(context, state, 0, glows));

  assert.deepEqual(callsNamed(ctx, 'fillText').map(({ args }) => args[0]), [DROP_STYLE.laser.glyph, DROP_STYLE.life.glyph]);
  assert.deepEqual(callsNamed(ctx, 'drawImage').map(({ args }) => args[0].glow), [DROP_STYLE.laser.rgb, DROP_STYLE.life.rgb]);
  assert.deepEqual(callsNamed(ctx, 'translate').map(({ args }) => args), [[120, 300], [300, 500]]);
  assert.ok(String(callsNamed(ctx, 'fillText')[0].brush.fillStyle).includes(DROP_STYLE.laser.rgb));
  assert.equal(callsNamed(ctx, 'save').length, callsNamed(ctx, 'restore').length);
});

test('every bonus that can fall has a look and a word of its own', () => {
  const kinds = DROP_SHARES.map(([kind]) => kind);

  assert.deepEqual(Object.keys(DROP_STYLE).sort(), [...kinds].sort());
  assert.equal(new Set(Object.values(DROP_STYLE).map((style) => style.label)).size, kinds.length);
  assert.equal(new Set(Object.values(DROP_STYLE).map((style) => style.glyph)).size, kinds.length);
});

test('the laser\'s bolts are drawn in flight, and an armed paddle shows a muzzle at each end', () => {
  const { config, state } = game(['o.........'], { laser: 3, bolts: [{ id: 1, x: 100, y: 400 }, { id: 2, x: 180, y: 250 }] });
  const ctx = draw((context) => drawLaser(context, { ...state, player: { x: 250, vx: 0 } }, config, 0));

  assert.deepEqual(callsNamed(ctx, 'moveTo').slice(0, 2).map(({ args }) => args), [[100, 400], [180, 250]]);
  assert.equal(callsNamed(ctx, 'stroke').length, 2, 'a glow and a core for all the bolts at once');
  assert.equal(callsNamed(ctx, 'fill').length, 2, 'two muzzles');
  assert.ok(String(callsNamed(ctx, 'fill')[0].brush.fillStyle).includes(DROP_STYLE.laser.rgb));

  // Bolts still in flight after the laser has run out are drawn without the muzzles.
  const spent = draw((context) => drawLaser(context, { ...state, bricks: { ...state.bricks, laser: 0 } }, config, 0));
  assert.equal(callsNamed(spent, 'fill').length, 0);
  assert.equal(callsNamed(spent, 'stroke').length, 2);
});

test('the muzzles blink in the laser\'s last second', () => {
  const { config, state } = game(['o.........'], { laser: 0.6 });
  const muzzles = (now) => callsNamed(draw((context) => drawLaser(context, state, config, now)), 'fill').length;

  assert.equal(muzzles(0), 2);
  assert.equal(muzzles(110), 0);
  assert.equal(muzzles(220), 2);
});

test('the safety net is a line from wall to wall under the paddle, while it has a save left', () => {
  const armed = game(['o.........'], { shield: 1 });
  const ctx = draw((context) => drawNet(context, armed.state, armed.config, 0));
  const [from] = callsNamed(ctx, 'moveTo');
  const [to] = callsNamed(ctx, 'lineTo');

  assert.equal(from.args[1], netLine(armed.config));
  assert.equal(to.args[1], netLine(armed.config));
  assert.ok(to.args[0] - from.args[0] > armed.config.width - 20);
  assert.ok(netLine(armed.config) > armed.config.height - armed.config.paddle.inset, 'below the paddle');
  assert.ok(String(callsNamed(ctx, 'stroke')[0].brush.strokeStyle).includes(DROP_STYLE.shield.rgb));

  const bare = game(['o.........']);
  assert.equal(draw((context) => drawNet(context, bare.state, bare.config, 0)).calls.length, 0);
});

test('the combo shows from its second brick, with the multiplier it scores at', () => {
  const texts = (combo, pop = 0) => {
    const { config, state } = game(['o.........'], { combo });
    const ctx = draw((context) => drawCombo(context, state.bricks, config, pop));
    return { texts: callsNamed(ctx, 'fillText').map(({ args }) => args[0]), ctx };
  };

  assert.deepEqual(texts(COMBO_SHOWN - 1).texts, []);
  assert.deepEqual(texts(3).texts, ['×3', 'COMBO 3']);
  assert.deepEqual(texts(RULES.maxCombo + 6).texts, [`×${RULES.maxCombo}`, `COMBO ${RULES.maxCombo + 6}`], 'the multiplier stops at its highest');

  assert.ok(String(callsNamed(texts(3).ctx, 'fillText')[0].brush.fillStyle).includes(THEME.text));
  assert.ok(String(callsNamed(texts(RULES.maxCombo).ctx, 'fillText')[0].brush.fillStyle).includes(THEME.amber), 'amber at its highest');

  const [calm] = callsNamed(texts(3).ctx, 'scale');
  const [popped] = callsNamed(texts(3, 1).ctx, 'scale');
  assert.ok(popped.args[0] > calm.args[0], 'it swells with every brick');
});

test('a match draws no combo', () => {
  const { state } = game(['o.........'], { combo: 9 });
  assert.equal(draw((context) => drawCombo(context, state.bricks, GAME_CONFIG, 0)).calls.length, 0);
});
