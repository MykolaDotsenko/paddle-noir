import test from 'node:test';
import assert from 'node:assert/strict';

import { BRICKS_CONFIG, BRICKS_LIVES, GAME_CONFIG } from '../src/config.js';
import { buildLevel, DROP_SHARES, levelCleared, netLine } from '../src/domain/bricks.js';
import { advanceGame, createInitialState, GAME_PHASE, getWinner, startGame } from '../src/domain/game.js';
import { BRICK_LEVELS } from '../src/levels.js';

// The Bricks game: the player's ball against a wall. These tests build small walls of their
// own, put the ball where the case needs it and let the game run.

const RULES = BRICKS_CONFIG.bricks;
const STEP = BRICKS_CONFIG.fixedStepSeconds;
const IDLE = { horizontalAxis: 0, pointerX: null, opponentAxis: 0, opponentPointerX: null };
const BRICK_WIDTH = (BRICKS_CONFIG.width - 2 * RULES.margin - (RULES.columns - 1) * RULES.gap) / RULES.columns;
const PADDLE_TOP = BRICKS_CONFIG.height - BRICKS_CONFIG.paddle.inset - BRICKS_CONFIG.paddle.height;
const RADIUS = BRICKS_CONFIG.ball.radius;

/** The center of the brick in a column and row of the layout. */
const at = (column, row) => ({
  x: RULES.margin + column * (BRICK_WIDTH + RULES.gap) + BRICK_WIDTH / 2,
  y: RULES.top + row * (RULES.rowHeight + RULES.gap) + RULES.rowHeight / 2,
});

/**
 * A game on a wall drawn for the test, with a second level after it. No bonuses fall unless
 * the test asks for them.
 */
function game(rows, { drift = null, bricks = {}, supers = false, seed = 7 } = {}) {
  const config = {
    ...BRICKS_CONFIG,
    supers: { ...BRICKS_CONFIG.supers, enabled: supers },
    bricks: {
      ...RULES,
      dropChance: 0,
      levels: [{ name: 'Test', drift, rows }, { name: 'Next', drift: null, rows: ['oo........'] }],
      ...bricks,
    },
  };
  const state = { ...startGame(createInitialState(config, seed), config), serveCountdown: 0 };
  return { config, state };
}

/** A ball flying straight up at a point from 30 units below it. */
const below = (point, speed = 400) => ({ x: point.x, y: point.y + 30 + RULES.rowHeight / 2, vx: 0, vy: -speed, spin: 0 });

/** Runs the game for some seconds, or until `until` says so, and gathers the events. */
function run(state, config, seconds, { input = IDLE, until = () => false } = {}) {
  const events = [];
  let next = state;

  for (let step = 0; step < Math.round(seconds / STEP) && next.phase === GAME_PHASE.RUNNING; step += 1) {
    next = advanceGame(next, STEP, typeof input === 'function' ? input(next) : input, config);
    events.push(...next.events);

    if (until(next, events)) {
      break;
    }
  }

  return { state: next, events };
}

const named = (events, type) => events.filter((event) => event.type === type);
const kinds = (state) => state.bricks.bricks.map((brick) => brick.kind);

test('every other game has no wall', () => {
  const state = createInitialState(GAME_CONFIG, 1);

  assert.equal(state.bricks, null);
  assert.equal(GAME_CONFIG.bricks, null);
});

test('a Bricks game starts with the first wall up, three lives and the ball under the wall, to come down', () => {
  const state = createInitialState(BRICKS_CONFIG, 1);

  assert.equal(state.lives, BRICKS_LIVES);
  assert.equal(state.bricks.level, 0);
  assert.equal(state.bricks.bricks.length, BRICK_LEVELS[0].rows.join('').replaceAll('.', '').length);
  assert.deepEqual([state.ball.x, state.ball.y], [BRICKS_CONFIG.width / 2, RULES.serveY]);
  assert.ok(state.ball.vy > 0, 'toward the paddle');
  assert.ok(Math.abs(Math.hypot(state.ball.vx, state.ball.vy) - BRICKS_CONFIG.ball.initialSpeed) < 1e-9);
  assert.deepEqual({ points: state.bricks.points, combo: state.bricks.combo, drops: state.bricks.drops, shield: state.bricks.shield }, { points: 0, combo: 0, drops: [], shield: 0 });
});

test('a level is laid out from its drawing: a brick a character, kinds by their letters', () => {
  const { config } = game(['o.O#*.....', '.........o']);
  const bricks = buildLevel(config, 0);

  assert.deepEqual(bricks.map((brick) => brick.kind), ['plain', 'tough', 'steel', 'bomb', 'plain']);
  assert.deepEqual(bricks.map((brick) => brick.hp), [1, RULES.toughHits, 1, 1, 1]);
  assert.deepEqual(bricks.map((brick) => brick.row), [0, 0, 0, 0, 1]);
  assert.equal(new Set(bricks.map((brick) => brick.id)).size, 5);
  assert.ok(Math.abs(bricks[0].x - RULES.margin) < 1e-9);
  assert.ok(Math.abs(bricks[4].x + bricks[4].w - (config.width - RULES.margin)) < 1e-9, 'ten bricks fill the court between its margins');
  assert.equal(bricks[4].y, RULES.top + RULES.rowHeight + RULES.gap);
  assert.ok(bricks.every((brick) => brick.h === RULES.rowHeight && brick.fuse === 0));
});

test('the game\'s own levels are well drawn: ten wide, something to break, clear of the serve, swaying inside the walls', () => {
  assert.ok(BRICK_LEVELS.length >= 6);
  assert.equal(new Set(BRICK_LEVELS.map((level) => level.name)).size, BRICK_LEVELS.length);

  BRICK_LEVELS.forEach((layout, level) => {
    const bricks = buildLevel(BRICKS_CONFIG, level);

    assert.ok(layout.rows.every((row) => row.length === RULES.columns && /^[.oO#*]+$/.test(row)), layout.name);
    assert.ok(bricks.filter((brick) => brick.kind !== 'steel').length >= 20, `${layout.name} has bricks to break`);
    assert.ok(Math.max(...bricks.map((brick) => brick.y + brick.h)) < RULES.serveY - 60, `${layout.name} leaves the serve room`);

    const reach = layout.drift ? layout.drift.span : 0;
    assert.ok(Math.min(...bricks.map((brick) => brick.x)) - reach >= 0, `${layout.name} stays off the left wall`);
    assert.ok(Math.max(...bricks.map((brick) => brick.x + brick.w)) + reach <= BRICKS_CONFIG.width, `${layout.name} stays off the right wall`);
  });
});

test('no brick of the game\'s levels hides behind steel from every straight shot from below', () => {
  // A brick with steel right under it is fine if it can be reached past it; one walled in by
  // steel below and to both sides would hold a level up for good.
  BRICK_LEVELS.forEach((layout) => {
    layout.rows.forEach((row, r) => {
      [...row].forEach((kind, c) => {
        if (kind === '.' || kind === '#') return;
        const under = layout.rows[r + 1]?.[c];
        const sides = [row[c - 1], row[c + 1]];
        assert.ok(!(under === '#' && sides.every((side) => side === '#')), `${layout.name} row ${r} column ${c}`);
      });
    });
  });
});

test('the ball breaks a plain brick and bounces back off it', () => {
  const { config, state } = game(['o........o']);
  const { state: after, events } = run({ ...state, ball: below(at(0, 0)) }, config, 0.2);
  const [broken] = named(events, 'brick-break');

  assert.equal(after.bricks.bricks.length, 1);
  assert.ok(after.ball.vy > 0, 'it comes back down');
  assert.equal(after.ball.vx, 0);
  assert.deepEqual(
    { kind: broken.kind, row: broken.row, by: broken.by, combo: broken.combo, points: broken.points, w: broken.w, h: broken.h },
    { kind: 'plain', row: 0, by: 'ball', combo: 1, points: RULES.pointsPerBrick, w: BRICK_WIDTH, h: RULES.rowHeight },
  );
  assert.ok(Math.abs(broken.x - at(0, 0).x) < 1e-9 && Math.abs(broken.y - at(0, 0).y) < 1e-9, 'the event is at the brick');
  assert.equal(broken.vy, -400, 'and carries what struck it, for the pieces to fly from');
});

test('a ball never shows inside a brick: it turns back one radius short of the face', () => {
  const { config, state } = game(['O.........']);
  const face = RULES.top + RULES.rowHeight;
  let next = { ...state, ball: below(at(0, 0), 780) };
  let nearest = Infinity;

  for (let step = 0; step < 30; step += 1) {
    next = advanceGame(next, STEP, IDLE, config);
    nearest = Math.min(nearest, next.ball.y - face);
  }

  assert.ok(nearest >= RADIUS - 1e-6, `the ball came within ${nearest} of the face`);
  assert.ok(next.ball.vy > 0);
});

test('off a brick\'s side the ball turns back sideways and keeps its climb', () => {
  const { config, state } = game(['..........', '....O.....']);
  const brick = at(4, 1);
  const ball = { x: brick.x - BRICK_WIDTH / 2 - 30, y: brick.y + 9, vx: 300, vy: -200, spin: 0.4 };
  const { state: after, events } = run({ ...state, ball }, config, 0.1);

  assert.equal(named(events, 'brick-hit').length, 1);
  assert.ok(after.ball.vx < 0, 'back the way it came');
  assert.ok(after.ball.vy < 0, 'still going up');
  assert.ok(after.ball.spin < 0, 'and its spin turns over, as off a wall');
});

test('a brick\'s corner sends the ball off at the angle a real corner would', () => {
  const { config, state } = game(['..........', '....O.....']);
  const brick = at(4, 1);
  const corner = { x: brick.x - BRICK_WIDTH / 2, y: brick.y + RULES.rowHeight / 2 };
  // Straight up, half a radius outside the brick's left edge: it clips the bottom-left corner.
  const ball = { x: corner.x - RADIUS / 2, y: corner.y + 30, vx: 0, vy: -400, spin: 0 };
  const { state: after } = run({ ...state, ball }, config, 0.08);

  assert.ok(after.ball.vx < -50, 'thrown to the left, away from the brick');
  assert.ok(Math.abs(Math.hypot(after.ball.vx, after.ball.vy) - 400) < 1e-6, 'at the speed it came');
});

test('a ball never leaves a brick flying flatter than the game allows', () => {
  const { config, state } = game(['..........', '....O.....']);
  const brick = at(4, 1);
  // Almost level, into the brick's side: the bounce alone would leave it flying side to side.
  const ball = { x: brick.x - BRICK_WIDTH / 2 - 30, y: brick.y, vx: 500, vy: -10, spin: 0 };
  const { state: after } = run({ ...state, ball }, config, 0.08);
  const lean = Math.atan2(Math.abs(after.ball.vx), Math.abs(after.ball.vy));

  assert.ok(lean <= RULES.maxLean + 1e-9, `it leans ${lean} from straight up`);
  assert.ok(after.ball.vx < 0 && after.ball.vy < 0);
});

test('a tough brick takes a hit and stands, then breaks, and is worth twice a plain one', () => {
  const { config, state } = game(['O.........']);
  const first = run({ ...state, ball: below(at(0, 0)) }, config, 0.2);

  assert.deepEqual(named(first.events, 'brick-hit').map(({ kind, hp }) => [kind, hp]), [['tough', 1]]);
  assert.equal(first.state.bricks.bricks[0].hp, 1);
  assert.equal(first.state.bricks.points, 0);

  const second = run({ ...first.state, ball: below(at(0, 0)) }, config, 0.2);
  assert.equal(named(second.events, 'brick-break')[0].points, RULES.pointsPerBrick * 2);
});

test('steel shrugs the ball off, and a wall is cleared without it', () => {
  const { config, state } = game(['#o........']);
  const { state: after, events } = run({ ...state, ball: below(at(0, 0)) }, config, 0.2);

  assert.deepEqual(kinds(after), ['steel', 'plain']);
  assert.deepEqual(named(events, 'brick-hit').map(({ kind }) => kind), ['steel']);
  assert.equal(after.bricks.idle, 1, 'a bounce off steel counts toward a stalled ball');
  assert.equal(levelCleared(after.bricks), false);
  assert.equal(levelCleared({ ...after.bricks, bricks: after.bricks.bricks.filter((brick) => brick.kind === 'steel') }), true);
});

test('a bomb takes its neighbors with it, steel included, and throws their pieces outward', () => {
  const { config, state } = game(['#o#.......', 'o*o.......', '.....o....']);
  const { state: after, events } = run({ ...state, ball: below(at(1, 1)) }, config, 0.5, { until: (_, seen) => named(seen, 'blast').length > 0 });
  const broken = named(events, 'brick-break');

  assert.deepEqual(kinds(after), ['plain'], 'only the brick out of reach is left');
  assert.equal(named(events, 'blast').length, 1);
  assert.equal(named(events, 'blast')[0].radius, RULES.blastRadius);
  assert.deepEqual(broken.map((event) => event.by), ['ball', 'blast', 'blast', 'blast', 'blast', 'blast']);
  assert.equal(broken.filter((event) => event.kind === 'steel').length, 2);

  const left = broken.find((event) => event.by === 'blast' && event.x < at(1, 1).x - 1 && Math.abs(event.y - at(1, 1).y) < 1);
  assert.ok(left.vx < 0 && Math.abs(left.vy) < 1e-9, 'the brick to its left flies left');
});

test('a bomb caught in a blast is lit and goes off a moment later, so bombs go up one after another', () => {
  const { config, state } = game(['***.......']);
  const lit = run({ ...state, ball: below(at(0, 0)) }, config, 0.2, { until: (_, seen) => named(seen, 'blast').length > 0 });

  assert.deepEqual(lit.state.bricks.bricks.map((brick) => brick.fuse > 0), [true, false], 'the next bomb is lit, the far one untouched');

  const chain = run(lit.state, config, 0.5);
  assert.equal(named(chain.events, 'blast').length, 2);
  assert.equal(chain.state.bricks.level, 1, 'and the wall is down');

  // One after another: about a fuse apart.
  const gap = run(lit.state, config, RULES.fuseSeconds - 2 * STEP);
  assert.equal(named(gap.events, 'blast').length, 0);
});

test('bricks broken without the paddle touching a ball build a combo, which multiplies their points up to a limit', () => {
  const { config, state } = game(['oooooooooo', 'oooooooooo'], { bricks: { maxCombo: 3 } });
  let next = state;
  const points = [];

  for (let column = 0; column < 5; column += 1) {
    const { state: after, events } = run({ ...next, ball: below(at(column, 1)) }, config, 0.15);
    points.push(named(events, 'brick-break')[0].points);
    next = after;
  }

  assert.deepEqual(points, [10, 20, 30, 30, 30]);
  assert.equal(next.bricks.combo, 5);
  assert.equal(next.bricks.points, 120);
});

test('a return ends the combo and counts as a hit of the rally', () => {
  const { config, state } = game(['oooooooooo']);
  const playing = { ...state, bricks: { ...state.bricks, combo: 4, idle: 5 }, ball: { x: 250, y: PADDLE_TOP - 40, vx: 0, vy: 400, spin: 0 } };
  const { state: after, events } = run(playing, config, 0.2, { until: (_, seen) => named(seen, 'paddle-hit').length > 0 });
  const [hit] = named(events, 'paddle-hit');

  assert.deepEqual({ side: hit.side, rally: hit.rally }, { side: 'player', rally: 1 });
  assert.deepEqual({ combo: after.bricks.combo, idle: after.bricks.idle }, { combo: 0, idle: 0 });
  assert.deepEqual({ rally: after.rally, hits: after.hits.player, longest: after.longestRally }, { rally: 1, hits: 1, longest: 1 });
  assert.ok(after.ball.vy < 0);
  assert.ok(Math.abs(hit.speed - 400 * config.ball.speedIncrease) < 1e-6, 'and the ball gathers a little pace');
});

test('there is no paddle at the far end: the ball flies on to the ceiling and comes back', () => {
  const { config, state } = game(['.........o']);
  const ball = { x: 250, y: 120, vx: 0, vy: -400, spin: 0.5 };
  const { state: after, events } = run({ ...state, ball }, config, 0.4);

  assert.equal(named(events, 'paddle-hit').length, 0);
  assert.equal(named(events, 'wall-bounce').length, 1);
  assert.ok(Math.abs(named(events, 'wall-bounce')[0].y - RADIUS) < 1e-9);
  assert.ok(after.ball.vy > 0);
  assert.equal(after.opponent.x, state.opponent.x, 'and nothing moves up there');
});

test('a ball past the paddle costs a life, and the next is served to a paddle without its bonuses', () => {
  const { config, state } = game(['o.........']);
  const playing = {
    ...state,
    player: { x: 100, vx: 0 },
    modifiers: { ...state.modifiers, player: { ...state.modifiers.player, wide: 9 } },
    bricks: { ...state.bricks, combo: 3, laser: 4, laserIn: 1, drops: [{ id: 1, kind: 'wide', x: 300, y: 300, vy: 0 }], bolts: [{ id: 2, x: 300, y: 500 }] },
    ball: { x: 400, y: 790, vx: 0, vy: 400, spin: 0 },
  };
  const { state: after, events } = run(playing, config, 0.2, { until: (_, seen) => named(seen, 'life-lost').length > 0 });

  assert.deepEqual(events.map((event) => event.type), ['point', 'life-lost']);
  assert.deepEqual(named(events, 'point')[0], { type: 'point', scorer: 'opponent', x: 400, y: config.height });
  assert.equal(after.lives, BRICKS_LIVES - 1);
  assert.equal(after.phase, GAME_PHASE.RUNNING);
  assert.equal(after.serveCountdown, config.serveDelaySeconds);
  assert.deepEqual([after.ball.x, after.ball.y], [config.width / 2, RULES.serveY]);
  assert.ok(after.ball.vx < 0, 'the second serve leans the other way');
  assert.deepEqual({ wide: after.modifiers.player.wide, combo: after.bricks.combo, laser: after.bricks.laser, drops: after.bricks.drops, bolts: after.bricks.bolts },
    { wide: 0, combo: 0, laser: 0, drops: [], bolts: [] });
  assert.equal(after.bricks.bricks.length, 1, 'the wall stays as it was');
});

test('the last life ends the game, lost', () => {
  const { config, state } = game(['o.........']);
  const playing = { ...state, lives: 1, player: { x: 100, vx: 0 }, ball: { x: 400, y: 790, vx: 0, vy: 400, spin: 0 } };
  const { state: after, events } = run(playing, config, 0.2);

  assert.deepEqual(events.map((event) => event.type), ['point', 'life-lost', 'game-over']);
  assert.equal(after.phase, GAME_PHASE.GAME_OVER);
  assert.equal(after.lives, 0);
  assert.equal(getWinner(after), 'opponent');
  assert.equal(advanceGame(after, STEP, IDLE, config), after, 'and nothing moves after it');
});

test('clearing a wall earns a bonus and raises the next, served a little faster after a pause', () => {
  const { config, state } = game(['o.........']);
  const playing = { ...state, bricks: { ...state.bricks, shield: 1, points: 50 }, rally: 4, ball: below(at(0, 0)) };
  const { state: after, events } = run(playing, config, 0.2, { until: (_, seen) => named(seen, 'level-clear').length > 0 });

  assert.deepEqual(named(events, 'level-clear'), [{ type: 'level-clear', level: 0, bonus: RULES.clearBonus, last: false }]);
  assert.equal(after.bricks.level, 1);
  assert.equal(after.bricks.bricks.length, 2);
  assert.equal(after.bricks.points, 50 + RULES.pointsPerBrick + RULES.clearBonus);
  assert.equal(after.bricks.shield, 1, 'the safety net is kept');
  assert.equal(after.serveCountdown, RULES.clearSeconds);
  assert.equal(after.rally, 0);
  assert.equal(after.lives, BRICKS_LIVES);
  assert.ok(Math.abs(Math.hypot(after.ball.vx, after.ball.vy) - config.ball.initialSpeed * (1 + RULES.speedPerLevel)) < 1e-9);
  assert.equal(after.phase, GAME_PHASE.RUNNING);
});

test('clearing the last wall wins the game', () => {
  const { config, state } = game(['o.........'], { bricks: { levels: [{ name: 'Only', drift: null, rows: ['o.........'] }] } });
  const { state: after, events } = run({ ...state, ball: below(at(0, 0)) }, config, 0.2);

  assert.deepEqual(events.slice(-2).map((event) => event.type), ['level-clear', 'game-over']);
  assert.equal(named(events, 'level-clear')[0].last, true);
  assert.equal(named(events, 'game-over')[0].winner, 'player');
  assert.equal(after.phase, GAME_PHASE.GAME_OVER);
  assert.equal(getWinner(after), 'player');
  assert.equal(after.bricks.points, RULES.pointsPerBrick + RULES.clearBonus);
});

test('the first serve counts down from three, and the wait is not play', () => {
  const { config } = game(['o.........']);
  const start = startGame(createInitialState(config, 3), config);
  const { state: after, events } = run(start, config, config.startDelaySeconds + 0.05);

  assert.deepEqual(named(events, 'countdown').map((event) => event.value), [3, 2, 1]);
  assert.equal(named(events, 'serve').length, 1);
  assert.ok(after.bricks.quiet < 0.1, 'the time without a break is counted from the serve');
  assert.ok(after.ball.y > RULES.serveY);
});

test('a formation that sways moves from side to side, and a ball meets its bricks where they are', () => {
  const sway = { span: 40, period: 4 };
  const { config, state } = game(['....O.....'], { drift: sway });
  const quarter = run({ ...state, ball: { x: 250, y: 600, vx: 0, vy: -1, spin: 0 } }, config, 1);

  assert.ok(Math.abs(quarter.state.bricks.drift - 40) < 0.5, 'a quarter of the way through, it is as far over as it goes');
  assert.ok(Math.abs(quarter.state.bricks.bricks[0].x - (at(4, 0).x - BRICK_WIDTH / 2)) < 1e-9, 'its bricks keep where they rest');

  // Where the brick rests there is now only its left end; a ball further right still hits it.
  const ball = { x: at(4, 0).x + BRICK_WIDTH / 2 + 30, y: at(4, 0).y + 40, vx: 0, vy: -400, spin: 0 };
  const hit = run({ ...quarter.state, ball }, config, 0.1);
  const [event] = named(hit.events, 'brick-hit');
  assert.ok(event, 'the brick is there');
  assert.ok(Math.abs(event.x - (at(4, 0).x + hit.state.bricks.drift)) < 1.5, 'and the event is where it is drawn');
});

test('a brick that sways into a ball pushes it out instead of swallowing it', () => {
  const { config, state } = game(['....O.....'], { drift: { span: 40, period: 4 } });
  const brick = at(4, 0);
  // Resting beside the brick's right end, where the formation is about to arrive.
  const ball = { x: brick.x + BRICK_WIDTH / 2 + RADIUS + 0.2, y: brick.y, vx: 0, vy: 1, spin: 0 };
  let next = { ...state, ball, bricks: { ...state.bricks, time: 0 } };

  for (let step = 0; step < 30; step += 1) {
    next = advanceGame(next, STEP, IDLE, config);
    const left = next.bricks.bricks[0].x + next.bricks.drift;
    const overlap = next.ball.x - RADIUS < left + BRICK_WIDTH - 1e-6 && Math.abs(next.ball.y - brick.y) < RULES.rowHeight / 2;
    assert.ok(!overlap, `the ball is inside the brick at step ${step}`);
  }
});

test('a ball that bounces between walls and steel too long is nudged off its course', () => {
  const { config, state } = game(['o.........'], { bricks: { stallBounces: 3 } });
  // Flying almost level, from wall to wall, well under the bricks.
  const ball = { x: 250, y: 600, vx: 399, vy: -20, spin: 0 };
  const before = Math.atan2(ball.vx, -ball.vy);
  const { state: after, events } = run({ ...state, ball, player: { x: 250, vx: 0 } }, config, 5, { until: (next, seen) => named(seen, 'wall-bounce').length === 3 });

  assert.equal(named(events, 'wall-bounce').length, 3);
  assert.equal(after.bricks.idle, 0);
  const course = Math.atan2(Math.abs(after.ball.vx), Math.abs(after.ball.vy));
  assert.ok(Math.abs(course - before) > 0.1, 'its course has changed');
  assert.ok(Math.abs(Math.hypot(after.ball.vx, after.ball.vy) - Math.hypot(ball.vx, ball.vy)) < 1e-6, 'its speed has not');
  assert.notEqual(after.seed, state.seed, 'the nudge is drawn from the seeded source');
});

test('with nothing broken for a while, the next return goes straight at the nearest brick a shot can reach', () => {
  const { config, state } = game(['.........o']);
  const target = at(9, 0);
  const quiet = { ...state, bricks: { ...state.bricks, quiet: RULES.helpAfter }, player: { x: 100, vx: 0 }, ball: { x: 100, y: PADDLE_TOP - 30, vx: 0, vy: 400, spin: 0 } };
  const { state: after } = run(quiet, config, 0.2, { until: (_, seen) => named(seen, 'paddle-hit').length > 0 });
  const face = PADDLE_TOP - RADIUS;

  assert.ok(Math.abs(Math.atan2(after.ball.vx, -after.ball.vy) - Math.atan2(target.x - 100, face - target.y)) < 0.02, 'aimed at the brick');
  assert.equal(after.ball.spin, 0);

  const { events } = run(after, config, 2, { until: (_, seen) => named(seen, 'brick-break').length > 0 });
  assert.equal(named(events, 'brick-break').length, 1, 'and it gets there');
  assert.equal(named(events, 'wall-bounce').length, 0, 'directly');

  // Before the wait is up, a return off the middle of the paddle goes straight up.
  const early = run({ ...quiet, bricks: { ...quiet.bricks, quiet: RULES.helpAfter - 1 } }, config, 0.2, { until: (_, seen) => named(seen, 'paddle-hit').length > 0 });
  assert.ok(Math.abs(early.state.ball.vx) < 1e-6);
});

test('the help never aims at steel, nor at a brick with steel in the way, nor wider than the paddle can hit', () => {
  const returned = (rows) => {
    const { config, state } = game(rows);
    const quiet = { ...state, bricks: { ...state.bricks, quiet: RULES.helpAfter }, player: { x: 250, vx: 0 }, ball: { x: 250, y: PADDLE_TOP - 30, vx: 0, vy: 400, spin: 0 } };
    return run(quiet, config, 0.2, { until: (_, seen) => named(seen, 'paddle-hit').length > 0 }).state.ball;
  };

  // The brick right above is behind steel; the one off to the side is not.
  const around = returned(['....o....o', '....#.....']);
  assert.ok(around.vx > 100, 'it goes for the brick it can reach');

  // Nothing but steel in reach: the return goes as it was struck.
  assert.ok(Math.abs(returned(['....o.....', '...###....', '..........', '..........', '..........', '..........', '..........', '..........', '..........', '..........']).vx) < 1e-6);
});

test('a bonus falls from a broken brick, faster as it goes, and the paddle catches it', () => {
  const { config, state } = game(['....o....o'], { bricks: { dropChance: 1 } });
  const broke = run({ ...state, ball: below(at(4, 0)), player: { x: at(4, 0).x, vx: 0 } }, config, 0.2, { until: (_, seen) => named(seen, 'drop-spawn').length > 0 });
  const [spawned] = named(broke.events, 'drop-spawn');

  assert.ok(DROP_SHARES.some(([kind]) => kind === spawned.kind));
  assert.deepEqual([spawned.x, spawned.y], [at(4, 0).x, at(4, 0).y]);
  assert.equal(broke.state.bricks.drops.length, 1);

  const falling = run(broke.state, config, 0.6, { input: { ...IDLE, pointerX: at(4, 0).x } });
  const [drop] = falling.state.bricks.drops;
  assert.ok(drop.vy > 150 && drop.vy <= RULES.dropMaxSpeed, 'it gathers speed, up to its top speed');

  const caught = run(falling.state, config, 5, { input: { ...IDLE, pointerX: at(4, 0).x }, until: (_, seen) => named(seen, 'drop').length > 0 });
  assert.equal(named(caught.events, 'drop').length, 1);
  assert.equal(named(caught.events, 'drop')[0].kind, drop.kind);
  assert.equal(caught.state.bricks.drops.length, 0);
});

test('a bonus the paddle is not under falls out of the court', () => {
  const { config, state } = game(['o........o']);
  const falling = { ...state, player: { x: 400, vx: 0 }, ball: { x: 400, y: 300, vx: 0, vy: -1, spin: 0 }, bricks: { ...state.bricks, drops: [{ id: 5, kind: 'life', x: 60, y: PADDLE_TOP - 40, vy: 200 }] } };
  const { state: after, events } = run(falling, config, 1.2, { input: { ...IDLE, pointerX: 400 } });

  assert.equal(named(events, 'drop').length, 0);
  assert.equal(after.bricks.drops.length, 0);
  assert.equal(after.lives, BRICKS_LIVES);
});

test('no more bonuses fall than the game allows at once', () => {
  const { config, state } = game(['oooooooooo'], { bricks: { dropChance: 1, maxDrops: 2 } });
  let next = state;

  for (let column = 0; column < 4; column += 1) {
    next = run({ ...next, ball: below(at(column, 0)), player: { x: 450, vx: 0 } }, config, 0.12, { input: { ...IDLE, pointerX: 450 } }).state;
  }

  assert.equal(next.bricks.drops.length, 2);
});

/** Drops a bonus onto the paddle and returns the state once it is caught. */
function catching(kind, prepare = (state) => state) {
  const { config, state } = game(['o........o']);
  const ready = prepare({ ...state, player: { x: 250, vx: 0 }, ball: { x: 250, y: 400, vx: 60, vy: -390, spin: 0 }, bricks: { ...state.bricks, drops: [{ id: 5, kind, x: 250, y: PADDLE_TOP - 30, vy: 200 }] } });
  const { state: after, events } = run(ready, config, 1, { input: { ...IDLE, pointerX: 250 }, until: (_, seen) => named(seen, 'drop').length > 0 });
  assert.equal(named(events, 'drop')[0]?.kind, kind);
  return { config, before: ready, after };
}

test('Wide enlarges the paddle for a while', () => {
  const { after } = catching('wide');
  assert.equal(after.modifiers.player.wide, RULES.wideSeconds);
  assert.equal(after.modifiers.opponent.wide, 0);
});

test('Multi splits a ball off every ball in play, up to the most the game allows', () => {
  const one = catching('multi');
  assert.equal(one.after.extraBalls.length, 1);
  assert.ok(Math.abs(Math.hypot(one.after.extraBalls[0].vx, one.after.extraBalls[0].vy) - 394.588) < 0.01, 'the copy flies as fast');
  assert.notEqual(Math.sign(one.after.extraBalls[0].vx), Math.sign(one.after.ball.vx), 'and parts from the ball');

  const extra = (id, x) => ({ id, ttl: 8, x, y: 400, vx: 0, vy: -400, spin: 0 });
  const three = catching('multi', (state) => ({ ...state, extraBalls: [extra(1, 100), extra(2, 400)] }));
  assert.equal(three.after.extraBalls.length, RULES.maxBalls - 1, 'three balls become five, not six');
  assert.equal(new Set(three.after.extraBalls.map((ball) => ball.id)).size, RULES.maxBalls - 1);
});

test('Laser arms the paddle: bolts fly up from both its ends and break what is above them', () => {
  const { config, state } = game(['oooooooooo', '....O.....']);
  const armed = { ...state, player: { x: 250, vx: 0 }, ball: { x: 250, y: 500, vx: 0, vy: 1, spin: 0 }, bricks: { ...state.bricks, laser: RULES.laserSeconds, laserIn: 0 } };
  const first = run(armed, config, STEP * 2, { input: { ...IDLE, pointerX: 250 } });

  assert.equal(named(first.events, 'bolt-fire').length, 2);
  assert.deepEqual(first.state.bricks.bolts.map((bolt) => Math.round(bolt.x)), [214, 286], 'one from each end of the paddle');

  const { state: after, events } = run(first.state, config, 1.2, { input: { ...IDLE, pointerX: 250 } });
  const broken = named(events, 'brick-break');
  assert.ok(broken.length >= 2);
  assert.ok(broken.every((event) => event.by === 'bolt'));
  assert.ok(named(events, 'bolt-fire').length >= 4, 'it keeps firing');
  assert.ok(after.bricks.bolts.every((bolt) => bolt.y > 0));
});

test('a bolt stops at the first brick above it, wears a tough one down and cannot mark steel', () => {
  const { config, state } = game(['....o.....', '....O.....', '.....#....']);
  const shot = (x) => run({
    ...state,
    player: { x: 60, vx: 0 },
    ball: { x: 60, y: 500, vx: 0, vy: 1, spin: 0 },
    bricks: { ...state.bricks, bolts: [{ id: 9, x, y: 400 }] },
  }, config, 0.6, { input: { ...IDLE, pointerX: 60 } });

  const tough = shot(at(4, 0).x);
  assert.deepEqual(named(tough.events, 'brick-hit').map(({ kind, hp }) => [kind, hp]), [['tough', 1]]);
  assert.equal(tough.state.bricks.bricks.length, 3, 'the brick above the tough one is untouched');
  assert.equal(tough.state.bricks.bolts.length, 0, 'and the bolt is spent');

  const steel = shot(at(5, 2).x);
  assert.deepEqual(named(steel.events, 'brick-hit').map(({ kind }) => kind), ['steel']);
  assert.equal(steel.state.bricks.bricks.length, 3);

  const clear = shot(at(0, 0).x);
  assert.equal(clear.state.bricks.bolts.length, 0, 'a bolt that meets nothing flies out of the court');
  assert.equal(named(clear.events, 'brick-hit').length + named(clear.events, 'brick-break').length, 0);
});

test('the laser runs out', () => {
  const { config, state } = game(['o.........']);
  const armed = { ...state, player: { x: 400, vx: 0 }, ball: { x: 400, y: 300, vx: 0, vy: 1, spin: 0 }, bricks: { ...state.bricks, laser: 0.5, laserIn: 0 } };
  const { state: after, events } = run(armed, config, 0.9, { input: { ...IDLE, pointerX: 400 } });

  assert.equal(after.bricks.laser, 0);
  assert.equal(named(events, 'bolt-fire').length, 4, 'two volleys in half a second');
});

test('Shield strings a safety net under the paddle, which saves one ball', () => {
  const { after, config } = catching('shield');
  assert.equal(after.bricks.shield, 1);

  const past = { ...after, player: { x: 80, vx: 0 }, extraBalls: [], ball: { x: 420, y: 770, vx: 30, vy: 400, spin: 0 } };
  const saved = run(past, config, 0.15, { input: { ...IDLE, pointerX: 80 } });
  const [save] = named(saved.events, 'shield-save');

  assert.ok(save, 'the net returns it');
  assert.ok(Math.abs(save.y - (netLine(config) - RADIUS)) < 1e-9);
  assert.ok(saved.state.ball.vy < 0);
  assert.equal(saved.state.bricks.shield, 0);
  assert.equal(saved.state.lives, BRICKS_LIVES);

  const again = run({ ...saved.state, ball: past.ball }, config, 0.2, { input: { ...IDLE, pointerX: 80 } });
  assert.equal(named(again.events, 'life-lost').length, 1, 'the second ball goes through');
});

test('Slow takes the pace off every ball, though never below a serve\'s', () => {
  const fast = catching('slow', (state) => ({ ...state, ball: { x: 250, y: 300, vx: 0, vy: -700, spin: 0 }, extraBalls: [{ id: 1, ttl: 8, x: 100, y: 300, vx: 0, vy: -420, spin: 0 }] }));

  assert.ok(Math.abs(Math.hypot(fast.after.ball.vx, fast.after.ball.vy) - 700 * RULES.slowScale) < 1e-6);
  assert.ok(Math.abs(Math.hypot(fast.after.extraBalls[0].vx, fast.after.extraBalls[0].vy) - fast.config.ball.initialSpeed) < 1e-6);
  assert.equal(fast.after.extraBalls[0].id, 1);
});

test('Life adds a life, up to the most a player can hold', () => {
  assert.equal(catching('life').after.lives, BRICKS_LIVES + 1);
  assert.equal(catching('life', (state) => ({ ...state, lives: RULES.maxLives })).after.lives, RULES.maxLives);
});

test('every kind of bonus falls, in about its share', () => {
  const { config, state } = game(['oooooooooo'], { bricks: { dropChance: 1, maxDrops: 1000 } });
  const counts = {};
  let next = state;

  for (let round = 0; round < 600; round += 1) {
    const rebuilt = { ...next, bricks: { ...next.bricks, bricks: state.bricks.bricks, drops: [] }, ball: below(at(round % 10, 0)), player: { x: 250, vx: 0 } };
    const { state: after, events } = run(rebuilt, config, 0.12, { until: (_, seen) => named(seen, 'drop-spawn').length > 0 });
    const [spawned] = named(events, 'drop-spawn');
    counts[spawned.kind] = (counts[spawned.kind] ?? 0) + 1;
    next = after;
  }

  for (const [kind, share] of DROP_SHARES) {
    assert.ok(Math.abs(counts[kind] / 6 - share) < 6, `${kind}: ${counts[kind] / 6}% for a share of ${share}`);
  }

  assert.equal(DROP_SHARES.reduce((sum, [, share]) => sum + share, 0), 100);
});

test('with several balls in play, losing one costs nothing; losing the last costs a life', () => {
  const { config, state } = game(['o........o']);
  const extra = { id: 1, ttl: 8, x: 100, y: 300, vx: 0, vy: -400, spin: 0 };
  const two = { ...state, player: { x: 100, vx: 0 }, extraBalls: [extra], ball: { x: 420, y: 790, vx: 0, vy: 400, spin: 0 } };
  const { state: after, events } = run(two, config, 0.1, { input: { ...IDLE, pointerX: 100 } });

  assert.equal(named(events, 'life-lost').length, 0);
  assert.equal(after.extraBalls.length, 0);
  assert.ok(Math.abs(after.ball.x - 100) < 1e-9 && after.ball.vy < 0, 'the ball left in play is now the ball');
  assert.deepEqual(Object.keys(after.ball).sort(), ['spin', 'vx', 'vy', 'x', 'y']);
  assert.equal(after.lives, BRICKS_LIVES);

  // The other way round: the ball stays, the copy goes.
  const copyLost = run({ ...two, ball: { ...extra }, extraBalls: [{ ...two.ball, id: 1, ttl: 8 }] }, config, 0.1, { input: { ...IDLE, pointerX: 100 } });
  assert.equal(copyLost.state.extraBalls.length, 0);
  assert.equal(named(copyLost.events, 'life-lost').length, 0);
});

test('every ball in play breaks bricks and is returned by the paddle', () => {
  const { config, state } = game(['oo.......o']);
  const two = { ...state, ball: below(at(0, 0)), extraBalls: [{ ...below(at(1, 0)), id: 1, ttl: 8 }] };
  const { state: after, events } = run(two, config, 0.15);

  assert.equal(named(events, 'brick-break').length, 2);
  assert.deepEqual(named(events, 'brick-break').map((event) => event.combo), [1, 2]);
  assert.ok(after.ball.vy > 0 && after.extraBalls[0].vy > 0);
  assert.equal(after.extraBalls[0].id, 1);

  const down = { ...after, player: { x: at(1, 0).x, vx: 0 }, ball: { ...after.ball, x: 400, y: 300 }, extraBalls: [{ ...after.extraBalls[0], y: PADDLE_TOP - 30 }] };
  const returned = run(down, config, 0.2, { input: { ...IDLE, pointerX: at(1, 0).x }, until: (_, seen) => named(seen, 'paddle-hit').length > 0 });
  assert.equal(named(returned.events, 'paddle-hit').length, 1);
  assert.ok(returned.state.extraBalls[0].vy < 0);
});

test('a ball that takes its super out of the court leaves none behind', () => {
  const { config, state } = game(['o........o'], { supers: true });
  const extra = { id: 1, ttl: 8, x: 100, y: 300, vx: 0, vy: -400, spin: 0 };
  const flying = { ...state, player: { x: 100, vx: 0 }, extraBalls: [extra], superShot: { kind: 'thunder', side: 'player', speed: 400 }, ball: { x: 420, y: 790, vx: 0, vy: 400, spin: 0 } };
  const { state: after } = run(flying, config, 0.1, { input: { ...IDLE, pointerX: 100 } });

  assert.equal(after.superShot, null);
});

/** A full meter holding a super, and a ball about to land on a paddle that flicks through it. */
function firing(kind, rows, { extraBalls = [] } = {}) {
  const { config, state } = game(rows, { supers: true });
  const loaded = {
    ...state,
    meters: { ...state.meters, player: { charge: 1, kind } },
    // The paddle's measured speed settles over a few steps; this is a hard flick.
    player: { x: 250, vx: config.supers.flickSpeed * 4 },
    extraBalls,
    ball: { x: 250, y: PADDLE_TOP - RADIUS - 2, vx: 0, vy: 400, spin: 0 },
  };
  const { state: after, events } = run(loaded, config, 0.1, { input: { ...IDLE, pointerX: 250 }, until: (_, seen) => named(seen, 'paddle-hit').length > 0 });
  return { config, after, hit: named(events, 'paddle-hit')[0] };
}

test('with supers on, bricks and returns charge the meter', () => {
  const { config, state } = game(['oooooooooo'], { supers: true });
  const broke = run({ ...state, ball: below(at(0, 0)) }, config, 0.15);
  assert.ok(Math.abs(broke.state.meters.player.charge - RULES.chargePerBrick) < 1e-9);

  const returned = run({ ...broke.state, player: { x: 250, vx: 0 }, ball: { x: 250, y: PADDLE_TOP - 30, vx: 0, vy: 400, spin: 0 } }, config, 0.2, { until: (_, seen) => named(seen, 'paddle-hit').length > 0 });
  assert.ok(Math.abs(returned.state.meters.player.charge - RULES.chargePerBrick - config.supers.perHit) < 1e-9);

  // Off the paddle's edge the return is skilful, and charges more.
  const edge = run({ ...broke.state, player: { x: 250, vx: 0 }, ball: { x: 250 + 46, y: PADDLE_TOP - 30, vx: 0, vy: 400, spin: 0 } }, config, 0.2, { until: (_, seen) => named(seen, 'paddle-hit').length > 0 });
  assert.ok(Math.abs(edge.state.meters.player.charge - RULES.chargePerBrick - config.supers.perHit - config.supers.perSkill) < 1e-9);
  assert.equal(returned.state.meters.opponent.charge, 0);
});

test('with supers off nothing charges and a flick fires nothing', () => {
  const { config, state } = game(['oooooooooo']);
  const loaded = { ...state, meters: { ...state.meters, player: { charge: 1, kind: 'fireball' } }, player: { x: 250, vx: 900 }, ball: { x: 250, y: PADDLE_TOP - RADIUS - 2, vx: 0, vy: 400, spin: 0 } };
  const { state: after, events } = run(loaded, config, 0.1, { input: { ...IDLE, pointerX: 250 }, until: (_, seen) => named(seen, 'paddle-hit').length > 0 });

  assert.equal(named(events, 'paddle-hit')[0].super, undefined);
  assert.equal(after.superShot, null);

  const broke = run({ ...state, ball: below(at(0, 0)) }, config, 0.15);
  assert.equal(broke.state.meters.player.charge, 0);
});

test('a full meter and a flick fire the super; a full meter alone keeps it', () => {
  const fired = firing('fireball', ['oooooooooo']);
  assert.equal(fired.hit.super, 'fireball');
  assert.deepEqual(fired.after.meters.player, { charge: 0, kind: 'fireball' });
  assert.equal(fired.after.superShot.kind, 'fireball');
  assert.ok(Math.abs(fired.hit.speed - fired.config.ball.maxSpeed) < 1e-6, 'a fireball flies at the ball\'s top speed');
  assert.ok(Math.abs(fired.after.superShot.speed - 400 * fired.config.ball.speedIncrease) < 1e-6, 'and remembers the rally\'s own pace');
  assert.equal(fired.after.bricks.pierce, RULES.pierce);

  const { config, state } = game(['oooooooooo'], { supers: true });
  const still = { ...state, meters: { ...state.meters, player: { charge: 1, kind: 'fireball' } }, player: { x: 250, vx: 0 }, ball: { x: 250, y: PADDLE_TOP - RADIUS - 2, vx: 0, vy: 400, spin: 0 } };
  const kept = run(still, config, 0.1, { until: (_, seen) => named(seen, 'paddle-hit').length > 0 });
  assert.equal(named(kept.events, 'paddle-hit')[0].super, undefined);
  assert.equal(kept.state.meters.player.charge, 1);
});

test('a fireball goes through bricks, breaking each, and ends against the ceiling at the rally\'s pace', () => {
  const rows = ['.....o...o', ...Array.from({ length: 5 }, () => '.....o....')];
  const { config, after } = firing('fireball', rows);
  const column = at(5, 0).x;
  const { state: flown, events } = run({ ...after, ball: { ...after.ball, x: column, vx: 0, vy: -config.ball.maxSpeed } }, config, 1.5, { until: (_, seen) => named(seen, 'wall-bounce').length > 0 });
  const broken = named(events, 'brick-break');

  assert.equal(broken.length, 6, 'the whole column in one flight');
  assert.ok(broken.every((event) => event.by === 'super'));
  assert.deepEqual(broken.map((event) => event.combo), [1, 2, 3, 4, 5, 6]);
  assert.equal(flown.superShot, null, 'the ceiling ends it');
  assert.equal(flown.bricks.pierce, 0);
  assert.ok(Math.abs(Math.hypot(flown.ball.vx, flown.ball.vy) - 400 * config.ball.speedIncrease) < 1e-6);
  assert.ok(flown.ball.vy > 0);
});

test('a fireball passes through only so many bricks, then bounces off the next as a ball does', () => {
  const rows = Array.from({ length: 6 }, () => '.....O....');
  const { config, after } = firing('fireball', rows);
  const armed = { ...after, bricks: { ...after.bricks, pierce: 2 }, ball: { ...after.ball, x: at(5, 0).x, vx: 0, vy: -config.ball.maxSpeed } };
  const { state: flown, events } = run(armed, config, 1, { until: (_, seen) => named(seen, 'brick-hit').length > 0 });

  assert.equal(named(events, 'brick-break').length, 2, 'tough bricks too');
  assert.equal(named(events, 'brick-hit').length, 1, 'the third only takes a hit');
  assert.equal(flown.superShot, null);
  assert.ok(flown.ball.vy > 0);
  assert.ok(Math.hypot(flown.ball.vx, flown.ball.vy) < config.ball.maxSpeed - 100, 'and the ball is back to the rally\'s pace');
});

test('thunder takes the column it lands in, top to bottom, steel and all', () => {
  const rows = ['...o#o....', '...oOo....', '...o*o....', '...ooo....'];
  const { config, after, hit } = firing('thunder', rows);
  assert.equal(hit.super, 'thunder');
  assert.ok(hit.speed >= config.ball.maxSpeed * 0.85 - 1e-6);

  const column = at(4, 0).x;
  const { state: flown, events } = run({ ...after, ball: { ...after.ball, x: column, vx: 0 } }, config, 1.5, { until: (_, seen) => named(seen, 'strike').length > 0 });
  const [strike] = named(events, 'strike');
  const broken = named(events, 'brick-break');

  assert.deepEqual({ kind: strike.kind, x: Math.round(strike.x) }, { kind: 'thunder', x: Math.round(column) });
  assert.deepEqual(broken.slice(0, 3).map((event) => [event.kind, event.by]), [['steel', 'super'], ['tough', 'super'], ['bomb', 'super']], 'down the column');
  assert.equal(named(events, 'blast').length, 1, 'and the bomb in it goes off, taking what is around it');
  assert.ok(!flown.bricks.bricks.some((brick) => Math.abs(brick.x + brick.w / 2 - column) < 1), 'nothing of the column is left');
  assert.equal(flown.superShot, null);
  assert.ok(flown.ball.vy > 0, 'the ball itself bounces back');
});

test('a zigzag takes the row it lands in', () => {
  const rows = ['oooooooooo', 'oO#o..oooo'];
  const { config, after } = firing('zigzag', rows);
  const { state: flown, events } = run({ ...after, ball: { ...after.ball, x: at(0, 1).x, vx: 0 } }, config, 1.5, { until: (_, seen) => named(seen, 'strike').length > 0 });
  const [strike] = named(events, 'strike');

  assert.equal(strike.kind, 'zigzag');
  assert.ok(Math.abs(strike.y - at(0, 1).y) < 1e-9, 'along the row');
  assert.equal(named(events, 'brick-break').length, 8);
  assert.deepEqual([...new Set(flown.bricks.bricks.map((brick) => brick.row))], [0], 'the row above stands');
  assert.equal(flown.superShot, null);
});

test('a phantom splits the ball in three, as far as the game has room for balls', () => {
  const { after, hit } = firing('phantom', ['oooooooooo']);
  assert.equal(hit.super, 'phantom');
  assert.equal(after.extraBalls.length, 2);
  assert.equal(after.superShot, null, 'nothing is left in flight to hide the ball');
  assert.ok(after.extraBalls[0].vx * after.extraBalls[1].vx < 0, 'one to each side');
  assert.ok(after.extraBalls.every((ball) => ball.vy < 0 && Math.abs(Math.hypot(ball.vx, ball.vy) - Math.hypot(after.ball.vx, after.ball.vy)) < 1e-6));
  assert.equal(new Set(after.extraBalls.map((ball) => ball.id)).size, 2);

  const extra = (id) => ({ id, ttl: 8, x: 60 * id, y: 300, vx: 0, vy: -400, spin: 0 });
  const crowded = firing('phantom', ['oooooooooo'], { extraBalls: [extra(1), extra(2), extra(3)] });
  assert.equal(crowded.after.extraBalls.length, RULES.maxBalls - 1);
});

test('a super the wall never stops comes back to the paddle as a ball, at the rally\'s pace', () => {
  const { config, after } = firing('zigzag', ['o.........']);
  const back = { ...after, player: { x: 250, vx: 0 }, ball: { x: 250, y: PADDLE_TOP - 30, vx: 0, vy: 660, spin: 0 } };
  const { state: returned, events } = run(back, config, 0.2, { until: (_, seen) => named(seen, 'paddle-hit').length > 0 });

  assert.equal(returned.superShot, null);
  assert.ok(Math.abs(named(events, 'paddle-hit')[0].speed - after.superShot.speed * config.ball.speedIncrease) < 1e-6);
});

test('the same seed and the same hands play the same game', () => {
  const play = (seed) => {
    const config = { ...BRICKS_CONFIG, supers: { ...BRICKS_CONFIG.supers, enabled: true } };
    let state = startGame(createInitialState(config, seed), config);
    const trace = [];

    for (let step = 0; step < 120 * 40 && state.phase === GAME_PHASE.RUNNING; step += 1) {
      const watched = [state.ball, ...state.extraBalls].find((ball) => ball.vy > 0) ?? state.ball;
      state = advanceGame(state, STEP, { ...IDLE, pointerX: watched.x + Math.sin(step / 37) * 30 }, config);
      trace.push(...state.events.map((event) => event.type));
    }

    return { trace: trace.join(','), points: state.bricks.points, left: state.bricks.bricks.length, seed: state.seed };
  };

  const first = play(11);
  assert.deepEqual(play(11), first);
  assert.ok(first.points > 300, 'and it is a real game: bricks break');
  assert.ok(first.trace.includes('paddle-hit') && first.trace.includes('brick-break'));
});

test('a tough brick worn down counts as progress; steel that rings does not', () => {
  const { config, state } = game(['O#.......o']);
  const waiting = { ...state, bricks: { ...state.bricks, quiet: 5 } };

  const tough = run({ ...waiting, ball: below(at(0, 0)) }, config, 0.2, { until: (_, seen) => named(seen, 'brick-hit').length > 0 });
  assert.ok(tough.state.bricks.quiet < 0.01);

  const steel = run({ ...waiting, ball: below(at(1, 0)) }, config, 0.2, { until: (_, seen) => named(seen, 'brick-hit').length > 0 });
  assert.ok(steel.state.bricks.quiet > 5);
});

test('when nothing has broken for far too long, the brick nearest the ball gives way by itself', () => {
  const { config, state } = game(['o...#....O']);
  // A ball going up and down in the middle of the court, between the ceiling and the paddle, breaking nothing.
  const stuck = { ...state, bricks: { ...state.bricks, quiet: RULES.mercyAfter - 0.05 }, player: { x: 300, vx: 0 }, ball: { x: 300, y: 400, vx: 0, vy: -470, spin: 0 } };
  const { state: after, events } = run(stuck, config, 0.2, { input: { ...IDLE, pointerX: 300 } });
  const broken = named(events, 'brick-break');

  assert.equal(broken.length, 1);
  assert.deepEqual({ kind: broken[0].kind, by: broken[0].by }, { kind: 'tough', by: 'blast' }, 'the nearer of the two, tough as it is, and never the steel');
  assert.deepEqual(kinds(after), ['plain', 'steel']);
  assert.ok(after.bricks.quiet < 0.2, 'and the wait starts again');
  assert.ok(RULES.mercyAfter > 2 * RULES.helpAfter, 'well after the help has had its chances');
});

test('on a wall that sways, the help aims where the brick will be when the ball arrives', () => {
  const sway = { span: 80, period: 6 };
  const { config, state } = game(['....o.....'], { drift: sway });
  // The formation is passing its middle at full speed as the ball is returned.
  const quiet = { ...state, bricks: { ...state.bricks, time: 0, drift: 0, quiet: RULES.helpAfter }, player: { x: 250, vx: 0 }, ball: { x: 250, y: PADDLE_TOP - 30, vx: 0, vy: 470, spin: 0 } };
  const returned = run(quiet, config, 0.2, { until: (_, seen) => named(seen, 'paddle-hit').length > 0 });
  const here = at(4, 0).x + returned.state.bricks.drift;

  assert.ok(returned.state.ball.vx !== 0);
  const aim = returned.state.ball.x + (returned.state.ball.vx / -returned.state.ball.vy) * (returned.state.ball.y - at(4, 0).y);
  assert.ok(aim > here + 20, 'ahead of where the brick is now, the way it is moving');

  const { events } = run(returned.state, config, 2, { until: (_, seen) => named(seen, 'brick-break').length > 0 });
  assert.equal(named(events, 'brick-break').length, 1, 'and it lands');
  assert.equal(named(events, 'wall-bounce').length, 0);
});
