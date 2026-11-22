import test from 'node:test';
import assert from 'node:assert/strict';

import { THEME } from '../src/adapters/canvas/theme.js';
import { CanvasRenderer } from '../src/adapters/canvas-renderer.js';
import { HIGH_SCORES } from '../src/catalog.js';
import { BRICKS_CONFIG, GAME_CONFIG, NOVA_CONFIG, RUSH_CONFIG, WARP_CONFIG } from '../src/config.js';
import { createInitialState, GAME_PHASE, startGame } from '../src/domain/game.js';
import { callsNamed, createFrameScheduler, createRendererWindow, FakeCanvas } from './support/fake-canvas.js';

function setup({ clientWidth = 400, devicePixelRatio = 1, reducedMotion = false, jokes = false } = {}) {
  const canvas = new FakeCanvas({ clientWidth });
  const window = createRendererWindow({ devicePixelRatio, reducedMotion });
  const scheduler = createFrameScheduler();
  const renderer = new CanvasRenderer({ canvas, window, scheduler, config: GAME_CONFIG, preferences: { get: () => ({ jokes }) }, random: () => 0.5 });
  return { canvas, window, scheduler, renderer, ctx: () => canvas.contexts[0] };
}

const running = (overrides = {}) => ({
  ...startGame(createInitialState(GAME_CONFIG), GAME_CONFIG),
  serveCountdown: 0,
  ball: { x: 200, y: 300, vx: 0, vy: -440, spin: 0 },
  ...overrides,
});

const clearCalls = (canvas) => {
  canvas.calls.length = 0;
};

test('without Canvas 2D the renderer says so instead of failing later', () => {
  assert.throws(
    () => new CanvasRenderer({ canvas: new FakeCanvas({ contextAvailable: false }), window: createRendererWindow(), scheduler: createFrameScheduler(), config: GAME_CONFIG }),
    /Canvas 2D/,
  );
});

test('the backing store matches the displayed size in device pixels, capped at twice the CSS size', () => {
  const sharp = setup({ clientWidth: 400, devicePixelRatio: 1.5 });
  assert.deepEqual([sharp.canvas.width, sharp.canvas.height], [600, 960]);
  assert.equal(sharp.renderer.scale, 600 / GAME_CONFIG.width);

  const capped = setup({ clientWidth: 400, devicePixelRatio: 3 });
  assert.equal(capped.canvas.width, 800);

  const unlaidOut = setup({ clientWidth: 0 });
  assert.equal(unlaidOut.canvas.width, GAME_CONFIG.width, 'falls back to the board size before layout');
});

test('resizing repaints only when the size really changed, and redraws the last frame', () => {
  const { canvas, renderer, window } = setup();
  renderer.connect();
  renderer.render(running(), GAME_CONFIG);
  clearCalls(canvas);

  window.observers[0].callback();
  assert.equal(canvas.calls.length, 0, 'same size: nothing to do');

  canvas.clientWidth = 320;
  window.observers[0].callback();
  assert.equal(canvas.width, 320);
  assert.ok(callsNamed(canvas.contexts[0], 'drawImage').length > 0, 'the frame is drawn again at the new size');
});

test('a change of pixel ratio, from zoom or another display, resizes and keeps watching', () => {
  const { canvas, renderer, window } = setup({ clientWidth: 400 });
  renderer.connect();

  window.devicePixelRatio = 2;
  const query = window.queries.find((media) => media.query.includes('dppx'));
  query.change(true);

  assert.equal(canvas.width, 800);
  assert.equal(window.queries.filter((media) => media.query.includes('dppx')).length, 2, 'a new query for the new ratio');
});

test('disconnecting stops observing, listening and requesting frames', () => {
  const { renderer, window, scheduler } = setup();
  renderer.connect();
  renderer.handle([{ type: 'game-over', winner: 'player' }]);
  renderer.render({ ...running(), phase: GAME_PHASE.GAME_OVER }, GAME_CONFIG);
  assert.equal(scheduler.pending.size, 1);

  renderer.disconnect();

  assert.equal(window.observers[0].disconnected, true);
  assert.equal(scheduler.pending.size, 0);
  assert.ok(window.queries.every((media) => media.listeners.size === 0));
});

test('turning on reduced motion while playing calms the effects at once', () => {
  const { renderer, window } = setup();
  renderer.connect();

  window.queries.find((media) => media.query.includes('reduced-motion')).change(true);

  assert.equal(renderer.effects.reducedMotion, true);
});

test('a frame draws the court, the ball core at the ball and both paddles', () => {
  const { canvas, renderer } = setup();

  renderer.render(running(), GAME_CONFIG);

  const ctx = canvas.contexts[0];
  assert.equal(callsNamed(ctx, 'fillRect')[0].brush.fillStyle, THEME.background);
  const core = callsNamed(ctx, 'arc').find((call) => call.brush.fillStyle === THEME.ballCore);
  assert.deepEqual(core.args.slice(0, 2), [200, 300]);
  const paddleBodies = callsNamed(ctx, 'fill').filter((call) => [THEME.side.player.body, THEME.side.opponent.body].includes(call.brush.fillStyle));
  assert.equal(paddleBodies.length, 2);
});

test('the ready screen starts clean: no leftover effects or trail', () => {
  const { renderer } = setup();
  renderer.handle([{ type: 'point', scorer: 'player', x: 250, y: 0 }]);
  renderer.trail.points.push({ x: 1, y: 1 });

  renderer.render(createInitialState(GAME_CONFIG), GAME_CONFIG);

  assert.equal(renderer.effects.active, false);
  assert.deepEqual(renderer.trail.points, []);
});

test('the renderer knows the high-score table and the player\'s best run, so a Rush run can pass its rows', () => {
  const canvas = new FakeCanvas({ clientWidth: 400 });
  const preferences = { bestRush: 0, jokes: false };
  const renderer = new CanvasRenderer({
    canvas,
    window: createRendererWindow(),
    scheduler: createFrameScheduler(),
    config: GAME_CONFIG,
    preferences: { get: () => preferences },
    highScores: HIGH_SCORES,
    random: () => 0.5,
  });
  const rom = HIGH_SCORES.at(-1);
  const state = { ...running(), hits: { player: rom.hits + 1, opponent: rom.hits } };
  const event = { type: 'paddle-hit', side: 'player', x: 250, y: 734, speed: 500, spin: 0, offset: 0, rally: 3 };

  renderer.render(state, RUSH_CONFIG);
  renderer.handle([event], state);
  assert.deepEqual(renderer.effects.labels.map((label) => label.text), ['PASSED ROM!']);

  // With that row already beaten on an earlier run, the same hit is nothing new.
  renderer.effects.clear();
  preferences.bestRush = 20;
  renderer.handle([event], state);
  assert.deepEqual(renderer.effects.labels, []);

  // A renderer given no table shows none, and one given no record counts from nothing.
  const bare = setup();
  bare.renderer.render(state, RUSH_CONFIG);
  bare.renderer.handle([event], state);
  assert.deepEqual(bare.renderer.effects.labels, []);
});

test('a new match clears the old trail', () => {
  const { renderer } = setup();
  renderer.trail.points.push({ x: 1, y: 1 }, { x: 2, y: 2 });

  renderer.handle([{ type: 'match-start' }]);

  assert.deepEqual(renderer.trail.points, []);
});

test('after a match ends, the renderer keeps requesting frames until the fireworks settle', () => {
  const { renderer, scheduler, window } = setup();
  const over = { ...running(), phase: GAME_PHASE.GAME_OVER };

  renderer.render(over, GAME_CONFIG);
  renderer.handle([{ type: 'game-over', winner: 'opponent' }]);
  assert.equal(scheduler.pending.size, 1);

  let frames = 0;
  while (scheduler.pending.size > 0 && frames < 1000) {
    window.advance(16);
    scheduler.flush();
    frames += 1;
  }

  assert.ok(frames > 10 && frames < 1000, `settled after ${frames} frames`);
  assert.equal(renderer.effects.active, false);
});

test('while the match runs or is paused the game loop owns the frames', () => {
  const { renderer, scheduler } = setup();

  renderer.render(running(), GAME_CONFIG);
  renderer.handle([{ type: 'point', scorer: 'player', x: 250, y: 0 }]);
  assert.equal(scheduler.pending.size, 0);

  renderer.render({ ...running(), phase: GAME_PHASE.PAUSED }, GAME_CONFIG);
  assert.equal(scheduler.pending.size, 0);
});

test('a paused frame freezes the effects in place', () => {
  const { renderer, window } = setup();
  renderer.render(running(), GAME_CONFIG);
  renderer.handle([{ type: 'point', scorer: 'player', x: 250, y: 0 }]);
  const before = renderer.effects.particles.map((particle) => particle.life);

  window.advance(100);
  renderer.render({ ...running(), phase: GAME_PHASE.PAUSED }, GAME_CONFIG);

  assert.deepEqual(renderer.effects.particles.map((particle) => particle.life), before);
});

test('a flash covers the whole board in the event\'s color', () => {
  const { canvas, renderer, window } = setup();
  renderer.render(running(), GAME_CONFIG);
  renderer.handle([{ type: 'life-lost', lives: 2 }]);
  clearCalls(canvas);

  window.advance(16);
  renderer.render(running(), GAME_CONFIG);

  const flash = callsNamed(canvas.contexts[0], 'fillRect').at(-1);
  assert.equal(flash.brush.fillStyle, `rgb(${THEME.rose})`);
  assert.ok(flash.brush.globalAlpha > 0 && flash.brush.globalAlpha < 1);
});

test('drawing before any state has arrived does nothing', () => {
  const { canvas, renderer } = setup();
  clearCalls(canvas);

  renderer.draw();

  assert.equal(canvas.calls.length, 0);
});

test('while the finisher plays, the destroyed paddle is not drawn, and the next match brings it back', () => {
  const { renderer, canvas } = setup({ jokes: true });
  const over = { ...running(), phase: GAME_PHASE.GAME_OVER };
  const opponentCoreDrawn = () => canvas.contexts[0].calls.some((call) => call.name === 'fill' && call.brush.fillStyle === THEME.side.opponent.core);

  renderer.render(over, GAME_CONFIG);
  renderer.handle([{ type: 'game-over', winner: 'player' }], over);
  clearCalls(canvas);
  renderer.draw();
  assert.equal(opponentCoreDrawn(), false, 'the computer\'s paddle is in pieces');
  assert.ok(canvas.contexts[0].calls.some((call) => call.name === 'fillRect' && call.brush.fillStyle === THEME.side.opponent.body) || renderer.effects.particles.length > 50);

  renderer.handle([{ type: 'match-start' }], running());
  renderer.render(running(), GAME_CONFIG);
  clearCalls(canvas);
  renderer.draw();
  assert.equal(opponentCoreDrawn(), true);
});

test('under the Lag boss\'s attack the balls show where they were, a few times a second, with no trail', () => {
  const { canvas, renderer, window } = setup();
  const lagging = (x) => running({
    ball: { x, y: 300, vx: 400, vy: -440, spin: 0 },
    modifiers: { player: { wide: 0, tiny: 0, ghost: 0, lag: 2 }, opponent: { wide: 0, tiny: 0, ghost: 0, lag: 0 } },
  });
  const coreX = () => callsNamed(canvas.contexts[0], 'arc').filter((call) => call.brush.fillStyle === THEME.ballCore).at(-1).args[0];

  renderer.render(lagging(100), GAME_CONFIG);
  assert.equal(coreX(), 100);

  window.advance(60);
  renderer.render(lagging(124), GAME_CONFIG);
  assert.equal(coreX(), 100, 'still the old picture');

  window.advance(90);
  renderer.render(lagging(160), GAME_CONFIG);
  assert.equal(coreX(), 160, 'a new picture, jumping ahead');

  clearCalls(canvas);
  window.advance(16);
  renderer.render(lagging(166), GAME_CONFIG);
  assert.equal(callsNamed(canvas.contexts[0], 'arc').filter((call) => call.brush.fillStyle !== THEME.ballCore && call.brush.globalAlpha < 0.5).length, 0, 'no trail gives it away');

  // Once it wears off, the ball is drawn where it is again.
  window.advance(16);
  renderer.render(running({ ball: { x: 170, y: 300, vx: 400, vy: -440, spin: 0 } }), GAME_CONFIG);
  assert.equal(coreX(), 170);
});

test('a boss\'s attacks are drawn on the court', () => {
  const { canvas, renderer } = setup();

  renderer.render(running({ hazards: [{ kind: 'drip', x: 120, y: 300, warn: 0, ttl: 0 }] }), GAME_CONFIG);

  assert.equal(callsNamed(canvas.contexts[0], 'ellipse')[0].args[0], 120, 'the drip\'s shadow');
});

test('with the fun extras on, the first super a person fires brings the sound man in, once a match', () => {
  const { renderer, canvas } = setup({ jokes: true });
  const fired = (side = 'player') => ({ type: 'paddle-hit', side, x: 250, y: 734, speed: 900, spin: 0, offset: 0, rally: 3, super: 'fireball' });
  const state = running();
  const words = () => callsNamed(canvas.contexts[0], 'fillText').filter((call) => call.args[0] === 'WHOOPEE!').length;

  renderer.render(state, GAME_CONFIG);
  renderer.handle([fired('opponent')], state);
  assert.equal(renderer.effects.cameo, null, 'not for the computer');

  renderer.handle([fired()], state);
  assert.deepEqual(renderer.effects.cameo, { side: 'player', life: 1.1, maxLife: 1.1 });

  clearCalls(canvas);
  renderer.render(state, GAME_CONFIG);
  assert.equal(words(), 1, 'he is drawn with his word');

  renderer.effects.update(2);
  renderer.handle([fired()], state);
  assert.equal(renderer.effects.cameo, null, 'the second super of the match is only a super');

  renderer.handle([{ type: 'match-start' }], state);
  renderer.handle([fired()], state);
  assert.equal(renderer.effects.cameo?.side, 'player', 'a new match, a new cameo');
});

test('with the fun extras off nobody leans in', () => {
  const { renderer, canvas } = setup();
  const state = running();

  renderer.render(state, GAME_CONFIG);
  renderer.handle([{ type: 'paddle-hit', side: 'player', x: 250, y: 734, speed: 900, spin: 0, offset: 0, rally: 3, super: 'fireball' }], state);
  renderer.render(state, GAME_CONFIG);

  assert.equal(renderer.effects.cameo, null);
  assert.equal(callsNamed(canvas.contexts[0], 'fillText').filter((call) => call.args[0] === 'WHOOPEE!').length, 0);
});

// Bricks: the wall on the board.

function bricksSetup({ supers = false } = {}) {
  const config = { ...BRICKS_CONFIG, supers: { ...BRICKS_CONFIG.supers, enabled: supers } };
  const canvas = new FakeCanvas({ clientWidth: 400 });
  const renderer = new CanvasRenderer({ canvas, window: createRendererWindow(), scheduler: createFrameScheduler(), config, preferences: { get: () => ({ jokes: false }) }, random: () => 0.5 });
  const state = { ...startGame(createInitialState(config), config), serveCountdown: 0, rally: 7, ball: { x: 250, y: 500, vx: 0, vy: -470, spin: 0 } };
  return { canvas, renderer, config, state: { ...state, bricks: { ...state.bricks, time: 5 } } };
}

test('a Bricks frame draws the wall, the player\'s paddle alone, and the combo where a match shows its rally', () => {
  const { canvas, renderer, config, state } = bricksSetup();
  const ctx = canvas.contexts[0];

  renderer.render({ ...state, bricks: { ...state.bricks, combo: 4 } }, config);

  const fills = callsNamed(ctx, 'fill').map((call) => call.brush.fillStyle);
  assert.ok(fills.includes(THEME.side.player.core), 'the player\'s paddle');
  assert.ok(!fills.includes(THEME.side.opponent.core), 'and no paddle at the far end');

  const texts = callsNamed(ctx, 'fillText').map((call) => call.args[0]);
  assert.ok(texts.includes('×4') && texts.includes('COMBO 4'));
  assert.ok(!texts.includes('RALLY'), 'not the rally');

  const frames = callsNamed(ctx, 'stroke').filter((call) => call.brush.lineWidth === 1.5);
  assert.ok(frames.length >= state.bricks.bricks.length, 'every brick is framed');
});

test('a match frame still draws both paddles and the rally', () => {
  const { canvas, renderer } = setup();

  renderer.render(running({ rally: 7 }), GAME_CONFIG);

  const fills = callsNamed(canvas.contexts[0], 'fill').map((call) => call.brush.fillStyle);
  assert.ok(fills.includes(THEME.side.player.core) && fills.includes(THEME.side.opponent.core));
  assert.ok(callsNamed(canvas.contexts[0], 'fillText').some((call) => call.args[0] === 'RALLY'));
});

test('bonuses, bolts and the safety net are drawn over the wall', () => {
  const { canvas, renderer, config, state } = bricksSetup();
  const wall = { ...state.bricks, shield: 1, laser: 3, bolts: [{ id: 1, x: 100, y: 400 }], drops: [{ id: 2, kind: 'multi', x: 300, y: 450, vy: 100 }] };

  renderer.render({ ...state, bricks: wall }, config);

  const ctx = canvas.contexts[0];
  assert.ok(callsNamed(ctx, 'fillText').some((call) => call.args[0] === '••'), 'the falling bonus');
  assert.ok(callsNamed(ctx, 'moveTo').some((call) => call.args[0] === 100 && call.args[1] === 400), 'the bolt');
  assert.ok(callsNamed(ctx, 'lineTo').some((call) => call.args[1] === config.height - config.paddle.inset / 4), 'the net');
});

test('with supers on, Bricks shows the player\'s meter and none for the wall', () => {
  const { canvas, renderer, config, state } = bricksSetup({ supers: true });
  const loaded = { ...state, meters: { player: { charge: 1, kind: 'thunder' }, opponent: { charge: 1, kind: 'fireball' } } };

  renderer.render(loaded, config);

  const texts = callsNamed(canvas.contexts[0], 'fillText').map((call) => String(call.args[0]));
  assert.ok(texts.some((text) => text.startsWith('THUNDER')));
  assert.ok(!texts.some((text) => text.startsWith('FIREBALL')));
});

test('the wall\'s events reach the board: a brick breaks into pieces', () => {
  const { renderer, config, state } = bricksSetup();

  renderer.render(state, config);
  renderer.handle([{ type: 'brick-break', kind: 'plain', row: 0, x: 200, y: 150, w: 44, h: 20, by: 'ball', vx: 0, vy: -470, combo: 1, points: 10 }], state, config);

  assert.equal(renderer.effects.shards.length, 6);
});

// Nova: space on the board.

function novaSetup() {
  const config = { ...NOVA_CONFIG, supers: { ...NOVA_CONFIG.supers, enabled: true } };
  const canvas = new FakeCanvas({ clientWidth: 400 });
  const renderer = new CanvasRenderer({ canvas, window: createRendererWindow(), scheduler: createFrameScheduler(), config, preferences: { get: () => ({ jokes: false }) }, random: () => 0.5 });
  const started = startGame(createInitialState(config), config);
  const state = { ...started, serveCountdown: 0, player: { x: 300, vx: 0 } };
  return { canvas, renderer, config, state };
}

test('a Nova frame draws the ship where the paddle would be, and neither paddle nor ball', () => {
  const { canvas, renderer, config, state } = novaSetup();
  const drone = { id: 1, kind: 'drone', x: 120, y: 200, vx: 0, vy: 80, rx: 16, ry: 13, hp: 2, maxHp: 2, age: 0, home: 120, sway: 0, phase: 0, angle: 0, spin: 0, fireIn: 2, altIn: 2 };

  renderer.render({ ...state, nova: { ...state.nova, enemies: [drone], chain: 20 } }, config);

  const ctx = canvas.contexts[0];
  const fills = callsNamed(ctx, 'fill').map((call) => call.brush.fillStyle);
  assert.ok(fills.includes(THEME.side.player.core), 'the ship\'s cockpit');
  assert.ok(!fills.includes(THEME.side.opponent.core), 'no paddle at the far end');
  assert.ok(!fills.includes(THEME.ballCore), 'no ball');
  assert.ok(callsNamed(ctx, 'translate').some((call) => call.args[0] === 120 && call.args[1] === 200), 'the drone where it is');
  const texts = callsNamed(ctx, 'fillText').map((call) => call.args[0]);
  assert.ok(texts.includes('×3') && !texts.includes('RALLY'), 'the multiplier, where a match shows its rally');
  assert.ok(texts.includes('SUPER'), 'the player\'s meter, and none for the enemies');
});

test('the boss\'s health shows while it is in space', () => {
  const { canvas, renderer, config, state } = novaSetup();
  const boss = { id: 9, kind: 'boss', x: 250, y: 130, vx: 0, vy: 60, rx: 86, ry: 30, hp: 80, maxHp: 160, age: 0, home: 0, sway: 0, phase: 0, angle: 0, spin: 0, fireIn: 2, altIn: 2 };

  renderer.render({ ...state, nova: { ...state.nova, enemies: [boss] } }, config);

  assert.ok(callsNamed(canvas.contexts[0], 'fillText').some((call) => call.args[0] === 'DREADNOUGHT'));
});

test('a finisher-hidden ship is not drawn, and a flash covers the board', () => {
  const { canvas, renderer, config, state } = novaSetup();

  renderer.render(state, config);
  renderer.effects.hidePaddle('player');
  renderer.effects.flash('#123456', 0.5);
  canvas.calls.length = 0;
  renderer.render(state, config);

  const ctx = canvas.contexts[0];
  assert.ok(!callsNamed(ctx, 'fill').some((call) => call.brush.fillStyle === THEME.side.player.core));
  assert.ok(callsNamed(ctx, 'fillRect').some((call) => call.brush.fillStyle === '#123456'));
});

test('Nova\'s events reach the board: an enemy goes down in pieces', () => {
  const { renderer, config, state } = novaSetup();

  renderer.render(state, config);
  renderer.handle([{ type: 'enemy-down', kind: 'rock', x: 200, y: 150, rx: 24, by: 'bolt', points: 20, multiplier: 1 }], state, config);

  assert.equal(renderer.effects.shards.length, 5);
});

// Warp: the course on the board.

test('a Warp frame draws the course and the craft where the paddle would be, the race\'s display, and neither paddle nor ball', () => {
  const config = { ...WARP_CONFIG, supers: { ...WARP_CONFIG.supers, enabled: true } };
  const canvas = new FakeCanvas({ clientWidth: 400 });
  const renderer = new CanvasRenderer({ canvas, window: createRendererWindow(), scheduler: createFrameScheduler(), config, preferences: { get: () => ({ jokes: false }) }, random: () => 0.5 });
  const started = startGame(createInitialState(config), config);

  renderer.render({ ...started, serveCountdown: 0, player: { x: 300, vx: 0 }, warp: { ...started.warp, z: 200, speed: 40 } }, config);

  const ctx = canvas.contexts[0];
  const fills = callsNamed(ctx, 'fill').map((call) => call.brush.fillStyle);
  assert.ok(fills.includes(THEME.side.player.core), 'the craft\'s cockpit');
  assert.ok(!fills.includes(THEME.side.opponent.core), 'no paddle at the far end');
  assert.ok(!fills.includes(THEME.ballCore), 'no ball');
  const texts = callsNamed(ctx, 'fillText').map((call) => call.args[0]);
  assert.ok(texts.includes('P6') && texts.includes('KM/H') && !texts.includes('RALLY'), 'the place and the speed, where a match shows its rally');
  assert.equal(texts.filter((text) => text === 'SUPER').length, 1, 'the player\'s meter, and none for the field');
  assert.ok(callsNamed(ctx, 'scale').some((call) => call.args[0] > 1), 'the course drawn a little past the edges, so a shake never shows them');
});
