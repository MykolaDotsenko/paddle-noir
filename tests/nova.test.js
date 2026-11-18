import test from 'node:test';
import assert from 'node:assert/strict';

import { GAME_CONFIG, NOVA_CONFIG, NOVA_LIVES } from '../src/config.js';
import { advanceGame, createInitialState, GAME_PHASE, getWinner, startGame } from '../src/domain/game.js';
import { bossOf, bossPhase, LOOT_SHARES, multiplier, sectorState, shipY } from '../src/domain/nova.js';
import { NOVA_SECTORS } from '../src/sectors.js';

// The Nova game: the paddle is a starship. These tests put enemies, shots and bonuses where
// each case needs them and let the game run.

const RULES = NOVA_CONFIG.nova;
const STEP = NOVA_CONFIG.fixedStepSeconds;
const SHIP_Y = shipY(NOVA_CONFIG);
const IDLE = { horizontalAxis: 0, pointerX: null, opponentAxis: 0, opponentPointerX: null };
const at = (x) => ({ ...IDLE, pointerX: x });

/** A sector of the test's own, with nothing coming in unless the test asks. */
function game({ sectors = [{ name: 'Test', boss: false, waves: [] }, { name: 'Next', boss: false, waves: [{ kind: 'rock', count: 1, every: 1, formation: 'scatter' }] }], supers = false, nova = {}, seed = 7 } = {}) {
  const config = { ...NOVA_CONFIG, supers: { ...NOVA_CONFIG.supers, enabled: supers }, nova: { ...RULES, ...nova, sectors } };
  const started = startGame(createInitialState(config, seed), config);
  // Past the countdown, with the ship's first shot a while away so that it hits nothing by
  // chance, and the sector held in its calm, so that nothing comes in and it never clears,
  // unless the test lets it.
  const state = { ...started, serveCountdown: 0, nova: { ...started.nova, fireIn: 99, calm: 999 } };
  return { config, state };
}

/** An enemy of a kind, with whatever the test sets. */
function enemy(kind, placed = {}) {
  const sizes = { rock: [24, 24, 3], pebble: [13, 13, 1], drone: [16, 13, 2], gunship: [26, 18, 7], boss: [86, 30, 160] };
  const [rx, ry, hp] = sizes[kind];
  return { id: 500 + Math.round((placed.x ?? 250) + (placed.y ?? 0)), kind, x: 250, y: 300, vx: 0, vy: 0, rx, ry, hp, maxHp: hp, age: 0, home: 0, sway: 0, phase: 0, angle: 0, spin: 0, fireIn: 99, altIn: 99, ...placed };
}

const space = (state, changes) => ({ ...state, nova: { ...state.nova, ...changes } });
const named = (events, type) => events.filter((event) => event.type === type);

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

test('every other game has no space in it', () => {
  assert.equal(createInitialState(GAME_CONFIG, 1).nova, null);
  assert.equal(GAME_CONFIG.nova, null);
});

test('a Nova game starts in the first sector, with three ships, nothing in space and no ball in play', () => {
  const state = createInitialState(NOVA_CONFIG, 1);

  assert.equal(state.lives, NOVA_LIVES);
  assert.equal(state.nova.sector, 0);
  assert.deepEqual([state.nova.enemies, state.nova.shots, state.nova.fire, state.nova.loot], [[], [], [], []]);
  assert.deepEqual({ points: state.nova.points, shield: state.nova.shield, chain: state.nova.chain }, { points: 0, shield: 0, chain: 0 });
  assert.deepEqual(state.ball, { x: NOVA_CONFIG.width / 2, y: NOVA_CONFIG.height / 2, vx: 0, vy: 0, spin: 0 });
  assert.equal(SHIP_Y, NOVA_CONFIG.height - NOVA_CONFIG.paddle.inset - NOVA_CONFIG.paddle.height / 2, 'the ship flies where a paddle\'s middle runs');
});

test('the countdown runs as before a match, and nothing comes in during it', () => {
  const config = NOVA_CONFIG;
  const { state: after, events } = run(startGame(createInitialState(config, 3), config), config, config.startDelaySeconds - 0.1);

  assert.deepEqual(named(events, 'countdown').map((event) => event.value), [3, 2, 1]);
  assert.equal(after.nova.enemies.length, 0);
  assert.equal(after.nova.shots.length, 0, 'and the ship holds its fire');
});

test('the ship flies where the player steers, nearer the walls than a paddle can', () => {
  const { config, state } = game();
  const left = run(state, config, 0.3, { input: at(0) }).state;
  const right = run(state, config, 0.3, { input: at(9999) }).state;

  assert.equal(left.player.x, config.paddle.width / 2);
  assert.equal(right.player.x, config.width - config.paddle.width / 2);
  assert.ok(config.paddle.width < GAME_CONFIG.paddle.width);
});

test('the ship fires by itself, a bolt a fifth of a second, straight up from its nose', () => {
  const { config, state } = game();
  const { state: after, events } = run(space(state, { fireIn: 0 }), config, 1.01, { input: at(200) });
  const fired = named(events, 'ship-fire');

  assert.equal(fired.length, 6, 'at once, then every fifth of a second');
  assert.ok(fired.every((event) => event.x === 200 && event.y < SHIP_Y));
  assert.ok(after.nova.shots.every((shot) => shot.kind === 'bolt' && shot.vx === 0 && shot.vy === -RULES.shotSpeed));
  assert.ok(after.nova.shots.length >= 5, 'and its bolts fly up the court');
});

test('bolts that meet nothing leave the court', () => {
  const { config, state } = game();
  const { state: after } = run(space(state, { fireIn: 0 }), config, 1.2, { input: at(200), until: (next) => next.nova.time > 0.2 && (next.nova.fireIn = 99) && false });

  assert.ok(after.nova.shots.length <= 6);
  const later = run(space(after, { fireIn: 99 }), config, 1.2).state;
  assert.equal(later.nova.shots.length, 0);
});

test('rapid fire fires twice as fast, and the triple shot fans three bolts', () => {
  const { config, state } = game();
  const rapid = run(space(state, { fireIn: 0, rapid: 5 }), config, 1.01);
  assert.equal(named(rapid.events, 'ship-fire').length, 11);

  const triple = run(space(state, { fireIn: 0, triple: 5 }), config, STEP);
  const fan = triple.state.nova.shots.map((shot) => Math.sign(shot.vx));
  assert.deepEqual(fan.sort(), [-1, 0, 1]);
});

test('a bolt damages what it meets and is spent; an enemy with no health left goes down and scores', () => {
  const { config, state } = game();
  const drone = enemy('drone', { x: 250, y: 300, home: 250, hp: 2, maxHp: 2 });
  const shooting = space(state, { enemies: [drone], shots: [{ id: 1, kind: 'bolt', x: 250, y: 330, vx: 0, vy: -900, power: 1, radius: 3, hits: [] }] });
  const first = run(shooting, config, 0.05);

  assert.deepEqual(named(first.events, 'enemy-hit').map(({ kind, hp }) => [kind, hp]), [['drone', 1]]);
  assert.equal(first.state.nova.shots.length, 0);

  const second = run(space(first.state, { shots: [{ id: 2, kind: 'bolt', x: first.state.nova.enemies[0].x, y: 330, vx: 0, vy: -900, power: 1, radius: 3, hits: [] }] }), config, 0.05);
  const [down] = named(second.events, 'enemy-down');
  assert.deepEqual({ kind: down.kind, by: down.by, points: down.points, multiplier: down.multiplier }, { kind: 'drone', by: 'bolt', points: RULES.worth.drone, multiplier: 1 });
  assert.equal(second.state.nova.enemies.length, 0);
  assert.equal(second.state.nova.points, RULES.worth.drone);
  assert.equal(second.state.nova.chain, 1);
});

test('a rock splits in two pebbles that fly apart more than they fall', () => {
  const { config, state } = game();
  const rock = enemy('rock', { x: 250, y: 300, hp: 1, vy: 100 });
  const { state: after, events } = run(space(state, { enemies: [rock], shots: [{ id: 1, kind: 'bolt', x: 250, y: 330, vx: 0, vy: -900, power: 1, radius: 3, hits: [] }] }), config, 0.05);
  const pebbles = after.nova.enemies;

  assert.equal(named(events, 'enemy-down')[0].kind, 'rock');
  assert.deepEqual(pebbles.map((pebble) => pebble.kind), ['pebble', 'pebble']);
  assert.ok(pebbles[0].vx < 0 && pebbles[1].vx > 0, 'one to each side');
  assert.ok(pebbles.every((pebble) => Math.abs(pebble.vx) > pebble.vy && pebble.vy > 0));
  assert.notEqual(pebbles[0].id, pebbles[1].id);
});

test('rocks drift down, turn and come off the side walls', () => {
  const { config, state } = game();
  const rock = enemy('rock', { x: 30, y: 100, vx: -60, vy: 80, spin: 1 });
  const { state: after } = run(space(state, { enemies: [rock] }), config, 0.5, { input: at(450) });
  const [moved] = after.nova.enemies;

  assert.ok(moved.vx > 0, 'off the wall');
  assert.ok(moved.y > 130 && moved.angle > 0.4);
});

test('a drone weaves down about its line and fires at the ship, never from close by', () => {
  const { config, state } = game();
  const drone = enemy('drone', { x: 250, y: 100, vy: 80, home: 250, sway: 60, fireIn: 0.01 });
  const { state: after, events } = run(space(state, { enemies: [drone] }), config, 1, { input: at(120) });
  const [fired] = named(events, 'enemy-fire');
  const [shot] = after.nova.fire;

  assert.ok(Math.abs(after.nova.enemies[0].x - 250) > 30 && Math.abs(after.nova.enemies[0].x - 250) <= 60, 'it weaves');
  assert.deepEqual({ kind: fired.kind, count: fired.count }, { kind: 'drone', count: 1 });
  assert.ok(shot.vx < 0, 'toward where the ship is');
  assert.ok(Math.abs(Math.hypot(shot.vx, shot.vy) - RULES.enemyShotSpeed) < 1e-6);

  const close = enemy('drone', { x: 250, y: SHIP_Y - 150, vy: 80, home: 250, sway: 0, fireIn: 0.01 });
  assert.equal(named(run(space(state, { enemies: [close] }), config, 0.1, { input: at(400) }).events, 'enemy-fire').length, 0);
});

test('a gunship comes down to its line, then strafes from side to side and fires in threes', () => {
  const { config, state } = game();
  const gunship = enemy('gunship', { x: 200, y: -10, vy: 75, home: 150, vx: 60, fireIn: 2.8 });
  const { state: after, events } = run(space(state, { enemies: [gunship] }), config, 3, { input: at(400) });
  const [moved] = after.nova.enemies;

  assert.equal(moved.y, 150, 'it stops at its line');
  assert.ok(moved.x > 200, 'and strafes');
  assert.deepEqual(named(events, 'enemy-fire').map((event) => event.count), [3]);
  assert.equal(after.nova.fire.length, 3);
});

test('an enemy shot that reaches the ship costs a ship; the next is a while away', () => {
  const { config, state } = game({ nova: {} });
  const incoming = space(state, { chain: 12, fire: [{ id: 1, x: 250, y: SHIP_Y - 20, vx: 0, vy: 250 }, { id: 2, x: 100, y: 100, vx: 0, vy: 250 }] });
  const { state: after, events } = run(incoming, config, 0.2, { input: at(250) });

  assert.deepEqual(events.filter((event) => ['ship-hit', 'life-lost'].includes(event.type)).map((event) => event.type), ['ship-hit', 'life-lost']);
  assert.equal(after.lives, NOVA_LIVES - 1);
  assert.equal(after.nova.chain, 0, 'the multiplier starts again');
  assert.equal(after.nova.fire.length, 0, 'and the enemy fire is cleared, to give a moment to breathe');
  assert.ok(after.nova.invulnerable > RULES.invulnerableSeconds - 0.3);

  const again = run(space(after, { fire: [{ id: 3, x: 250, y: SHIP_Y - 10, vx: 0, vy: 250 }] }), config, 0.2, { input: at(250) });
  assert.equal(named(again.events, 'life-lost').length, 0, 'a ship just hit takes nothing');
});

test('the ship is hit as a small circle: a shot that grazes its wing goes by', () => {
  const { config, state } = game();
  const grazing = space(state, { fire: [{ id: 1, x: 250 + RULES.shipRadius + RULES.enemyShotRadius + 2, y: SHIP_Y - 30, vx: 0, vy: 250 }] });

  assert.equal(named(run(grazing, config, 0.3, { input: at(250) }).events, 'ship-hit').length, 0);
});

test('a shield takes one hit in the ship\'s place', () => {
  const { config, state } = game();
  const shielded = space(state, { shield: 1, fire: [{ id: 1, x: 250, y: SHIP_Y - 20, vx: 0, vy: 250 }] });
  const { state: after, events } = run(shielded, config, 0.2, { input: at(250) });

  assert.deepEqual(named(events, 'shield-save').map((event) => event.x), [250]);
  assert.equal(named(events, 'life-lost').length, 0);
  assert.deepEqual([after.lives, after.nova.shield], [NOVA_LIVES, 0]);
});

test('an enemy that flies into the ship goes down with the blow, and scores nothing', () => {
  const { config, state } = game();
  const ram = space(state, { enemies: [enemy('pebble', { x: 250, y: SHIP_Y - 40, vy: 120 })] });
  const { state: after, events } = run(ram, config, 0.5, { input: at(250) });
  const [down] = named(events, 'enemy-down');

  assert.deepEqual({ by: down.by, points: down.points }, { by: 'ram', points: 0 });
  assert.equal(after.lives, NOVA_LIVES - 1);
  assert.equal(after.nova.points, 0);
});

test('the last ship lost ends the game', () => {
  const { config, state } = game();
  const last = { ...space(state, { fire: [{ id: 1, x: 250, y: SHIP_Y - 20, vx: 0, vy: 250 }] }), lives: 1 };
  const { state: after, events } = run(last, config, 0.3, { input: at(250) });

  assert.deepEqual(events.slice(-3).map((event) => event.type), ['ship-hit', 'life-lost', 'game-over']);
  assert.equal(after.phase, GAME_PHASE.GAME_OVER);
  assert.equal(getWinner(after), 'opponent');
  assert.deepEqual([after.nova.shots, after.nova.fire], [[], []]);
});

test('enemies that get past the ship are gone, and cost nothing', () => {
  const { config, state } = game();
  const passing = space(state, { enemies: [enemy('rock', { x: 40, y: config.height - 10, vy: 100 })] });
  const { state: after } = run(passing, config, 0.5, { input: at(400) });

  assert.equal(after.nova.enemies.length, 0);
  assert.equal(after.lives, NOVA_LIVES);
});

test('downing enemies without being hit raises the multiplier, a step every few, up to its highest', () => {
  const s = (chain) => multiplier({ chain }, RULES);

  assert.deepEqual([s(0), s(RULES.chainStep - 1), s(RULES.chainStep), s(RULES.chainStep * 2), s(1000)], [1, 1, 2, 3, RULES.maxMultiplier]);

  const { config, state } = game();
  const chained = space(state, { chain: RULES.chainStep * 2 - 1, enemies: [enemy('pebble', { x: 250, y: 300 })], shots: [{ id: 1, kind: 'bolt', x: 250, y: 320, vx: 0, vy: -900, power: 1, radius: 3, hits: [] }] });
  const [down] = named(run(chained, config, 0.05).events, 'enemy-down');
  assert.deepEqual([down.multiplier, down.points], [3, RULES.worth.pebble * 3]);
});

test('waves come in one after another, each enemy a moment after the last', () => {
  const sector = { name: 'Test', boss: false, waves: [{ kind: 'drone', count: 3, every: 0.5, formation: 'line' }, { kind: 'rock', count: 2, every: 0.5, formation: 'scatter' }] };
  const { config, state: held } = game({ sectors: [sector, sector] });
  const state = space(held, { calm: 0 });
  const first = run(state, config, 1.1, { input: at(30) });

  assert.deepEqual(first.state.nova.enemies.map((e) => e.kind), ['drone', 'drone', 'drone']);
  const xs = first.state.nova.enemies.map((e) => e.home);
  assert.deepEqual(xs.map(Math.round), [125, 250, 375], 'abreast, across the court');
  assert.equal(first.state.nova.wave, 0);

  // The next wave waits while the first is still about, until the gap has passed.
  const waiting = run(first.state, config, 2, { input: at(30) });
  assert.equal(waiting.state.nova.wave, 0);
  const next = run(space(first.state, { enemies: [] }), config, 1.5, { input: at(30) });
  assert.equal(next.state.nova.wave, 1, 'once the court has cleared');
  assert.ok(next.state.nova.enemies.some((e) => e.kind === 'rock'));
});

test('every drone formation comes in where it should', () => {
  const homes = (formation) => {
    const sector = { name: 'Test', boss: false, waves: [{ kind: 'drone', count: 3, every: 0.01, formation }] };
    const { config, state } = game({ sectors: [sector, sector] });
    return run(space(state, { calm: 0 }), config, 0.1, { input: at(30) }).state.nova.enemies.map((e) => ({ home: e.home, sway: e.sway, phase: e.phase }));
  };

  assert.ok(homes('snake').every((d) => d.home === 250 && d.sway === 150), 'down the middle');
  assert.ok(homes('snake')[1].phase < homes('snake')[0].phase, 'one behind the other');
  assert.ok(homes('left').every((d) => d.home < 250));
  assert.ok(homes('right').every((d) => d.home > 250));
  assert.equal(new Set(homes('scatter').map((d) => d.home)).size, 3, 'anywhere');
});

test('a sector with nothing left in it is clear: a bonus, then the next after a calm', () => {
  const sector = { name: 'Test', boss: false, waves: [{ kind: 'pebble', count: 1, every: 0.1, formation: 'scatter' }] };
  const { config, state } = game({ sectors: [sector, { ...sector, name: 'Two' }] });
  const sent = run(space(state, { calm: 0 }), config, 0.2, { input: at(30) }).state;
  const target = sent.nova.enemies[0];
  const shot = space(sent, { shield: 1, chain: 4, points: 50, rapid: 3, shots: [{ id: 999, kind: 'bolt', x: target.x, y: target.y + 20, vx: 0, vy: -900, power: 1, radius: 3, hits: [] }] });
  const { state: after, events } = run(shot, config, 1.5, { input: at(30), until: (_, seen) => named(seen, 'sector-clear').length > 0 });

  assert.deepEqual(named(events, 'sector-clear'), [{ type: 'sector-clear', sector: 0, bonus: RULES.sectorBonus, last: false }]);
  assert.equal(after.nova.sector, 1);
  assert.equal(after.nova.points, 50 + RULES.worth.pebble + RULES.sectorBonus);
  assert.deepEqual([after.nova.shield, after.nova.chain], [1, 5], 'the shield and the multiplier are kept');
  assert.ok(after.nova.rapid > 2);
  assert.equal(after.nova.calm, RULES.calmSeconds);
  assert.equal(after.phase, GAME_PHASE.RUNNING);

  const calm = run(after, config, RULES.calmSeconds - 0.2, { input: at(30) });
  assert.equal(calm.state.nova.enemies.length, 0, 'nothing comes in during the calm');
});

test('the boss comes once the last sector\'s waves are down, fights in three patterns, and downing it wins the game', () => {
  const sector = { name: 'Boss', boss: true, waves: [] };
  const { config, state } = game({ sectors: [sector] });
  const arrived = run(space(state, { calm: 0 }), config, 0.1, { input: at(30) });
  const [boss] = arrived.state.nova.enemies;

  assert.deepEqual(named(arrived.events, 'enemy-arrive').map((e) => e.kind), ['boss']);
  assert.equal(boss.kind, 'boss');
  assert.equal(boss.hp, RULES.bossHp);
  assert.strictEqual(bossOf(arrived.state.nova), arrived.state.nova.enemies[0]);
  assert.equal(bossOf(sectorState(config, 0)), null);

  // It comes down to its place and swings.
  const swinging = run(arrived.state, config, 5.5, { input: at(30) });
  assert.ok(Math.abs(bossOf(swinging.state.nova).y - 130) < 1e-6);
  assert.ok(named(swinging.events, 'enemy-fire').some((e) => e.count === 3), 'fans aimed at the ship');

  assert.deepEqual([bossPhase({ hp: 160, maxHp: 160 }), bossPhase({ hp: 100, maxHp: 160 }), bossPhase({ hp: 40, maxHp: 160 })], [0, 1, 2]);

  // Hurt into its second third: it rages, and fires rings.
  const hurt = space(swinging.state, { enemies: [{ ...bossOf(swinging.state.nova), hp: 107 }] });
  const raging = run(space(hurt, { shots: [{ id: 1, kind: 'bolt', x: bossOf(hurt.nova).x, y: 170, vx: 0, vy: -900, power: 1, radius: 3, hits: [] }] }), config, 3, { input: at(30) });
  assert.deepEqual(named(raging.events, 'boss-rage').map((e) => e.phase), [1]);
  assert.ok(named(raging.events, 'enemy-fire').some((e) => e.count === 12), 'a ring');

  // In its last third, rings of fourteen and drones called in.
  const last = run(space(raging.state, { enemies: [{ ...bossOf(raging.state.nova), hp: 30, home: 8.9 }] }), config, 2, { input: at(30) });
  assert.ok(named(last.events, 'enemy-fire').some((e) => e.count === 14));
  assert.ok(last.state.nova.enemies.some((e) => e.kind === 'drone'));

  // Down: its guns fall silent and the game is won.
  const finale = space(last.state, { enemies: [{ ...bossOf(last.state.nova), hp: 1 }], shots: [{ id: 2, kind: 'bolt', x: bossOf(last.state.nova).x, y: 170, vx: 0, vy: -900, power: 1, radius: 3, hits: [] }] });
  const won = run({ ...finale, nova: { ...finale.nova, enemies: finale.nova.enemies.filter((e) => e.kind === 'boss') } }, config, 0.1, { input: at(30) });
  assert.deepEqual(won.events.slice(-3).map((e) => e.type), ['enemy-down', 'sector-clear', 'game-over']);
  assert.equal(named(won.events, 'enemy-down')[0].kind, 'boss');
  assert.equal(won.state.phase, GAME_PHASE.GAME_OVER);
  assert.equal(getWinner(won.state), 'player');
});

test('a downed enemy may let a bonus fall, which the ship catches by flying into it', () => {
  const { config, state } = game({ nova: { lootChance: 1 } });
  const shooting = space(state, { enemies: [enemy('pebble', { x: 250, y: 300 })], shots: [{ id: 1, kind: 'bolt', x: 250, y: 320, vx: 0, vy: -900, power: 1, radius: 3, hits: [] }] });
  const dropped = run(shooting, config, 0.05, { input: at(400) });
  const [spawned] = named(dropped.events, 'loot-spawn');

  assert.ok(LOOT_SHARES.some(([kind]) => kind === spawned.kind));
  assert.equal(dropped.state.nova.loot.length, 1);

  const missed = run(dropped.state, config, 5, { input: at(450) });
  assert.equal(missed.state.nova.loot.length, 0, 'it falls out of the court');
  assert.equal(named(missed.events, 'loot').length, 0);

  const caught = run(dropped.state, config, 5, { input: at(250), until: (_, seen) => named(seen, 'loot').length > 0 });
  assert.deepEqual(named(caught.events, 'loot').map((e) => e.kind), [spawned.kind]);
});

test('every bonus does what it says', () => {
  const catching = (kind, changes = {}) => {
    const { config, state } = game();
    const falling = { ...space(state, { loot: [{ id: 1, kind, x: 250, y: SHIP_Y - 30 }], ...changes }), lives: changes.lives ?? NOVA_LIVES };
    return run(falling, config, 0.5, { input: at(250), until: (_, seen) => named(seen, 'loot').length > 0 }).state;
  };

  assert.equal(catching('rapid').nova.rapid, RULES.powerSeconds);
  assert.equal(catching('triple').nova.triple, RULES.powerSeconds);
  assert.equal(catching('shield').nova.shield, 1);
  assert.equal(catching('life').lives, NOVA_LIVES + 1);
  assert.equal(catching('life', { lives: RULES.maxLives }).lives, RULES.maxLives, 'no more ships than a player can hold');
  assert.equal(LOOT_SHARES.reduce((sum, [, share]) => sum + share, 0), 100);
});

test('with supers on, downed enemies charge the meter; with them off nothing does', () => {
  const downing = (supers) => {
    const { config, state } = game({ supers });
    const shooting = space(state, { enemies: [enemy('pebble', { x: 250, y: 300 })], shots: [{ id: 1, kind: 'bolt', x: 250, y: 320, vx: 0, vy: -900, power: 1, radius: 3, hits: [] }] });
    return run(shooting, config, 0.05, { input: at(400) }).state.meters.player.charge;
  };

  assert.ok(Math.abs(downing(true) - RULES.chargePerKill) < 1e-9);
  assert.equal(downing(false), 0);
});

/** A full meter, and a flick of the ship. */
function firing(kind, changes = {}) {
  const { config, state } = game({ supers: true });
  const loaded = { ...space(state, changes), meters: { ...state.meters, player: { charge: 1, kind } }, player: { x: 250, vx: config.supers.flickSpeed * 4 } };
  const { state: after, events } = run(loaded, config, STEP, { input: at(250) });
  return { config, after, events };
}

test('a full meter fires its super with a flick; a full meter and a still ship keep it', () => {
  const fired = firing('fireball');
  assert.deepEqual(named(fired.events, 'super-fire').map((e) => [e.kind, e.x]), [['fireball', 250]]);
  assert.deepEqual(fired.after.meters.player, { charge: 0, kind: 'fireball' });

  const { config, state } = game({ supers: true });
  const still = { ...state, meters: { ...state.meters, player: { charge: 1, kind: 'fireball' } }, player: { x: 250, vx: 0 } };
  const kept = run(still, config, 0.2, { input: at(250) });
  assert.equal(named(kept.events, 'super-fire').length, 0);
  assert.equal(kept.state.meters.player.charge, 1);
});

test('a fireball goes through everything in its way, hitting each once', () => {
  const column = [enemy('drone', { x: 250, y: 500, home: 250, hp: 2 }), enemy('gunship', { x: 250, y: 380, hp: 7 }), enemy('rock', { x: 250, y: 250, hp: 3 })];
  const { config, after } = firing('fireball', { enemies: column });
  const [ball] = after.nova.shots.filter((shot) => shot.kind === 'fireball');

  assert.equal(ball.power, RULES.fireballPower);
  const { state: flown, events } = run(after, config, 1.2, { input: at(250) });
  const downed = named(events, 'enemy-down').filter((e) => e.by === 'super').map((e) => e.kind);

  assert.deepEqual(downed.slice(0, 3), ['drone', 'gunship', 'rock']);
  assert.ok(downed.slice(3).every((kind) => kind === 'pebble'), 'and the rock\'s pebbles too, if they are still in its way');
  assert.ok(flown.nova.enemies.every((e) => e.kind === 'pebble'));
});

test('a zigzag fans bolts across the court', () => {
  const { after } = firing('zigzag');
  const spread = after.nova.shots.filter((shot) => shot.kind === 'spread');

  assert.equal(spread.length, RULES.spreadCount);
  assert.ok(spread.some((shot) => shot.vx < -300) && spread.some((shot) => shot.vx > 300));
  assert.ok(spread.every((shot) => shot.vy < 0 && shot.power === 2));
});

test('thunder jumps from the ship to the nearest enemies, striking each', () => {
  const near = [1, 2, 3, 4, 5, 6, 7].map((n) => enemy('gunship', { id: n, x: 40 + n * 50, y: 600 - n * 60, hp: 20, maxHp: 20 }));
  const { after, events } = firing('thunder', { enemies: near });
  const [chain] = named(events, 'chain');

  assert.equal(chain.targets.length, RULES.chainTargets);
  assert.deepEqual([chain.x, chain.y], [250, SHIP_Y - 18]);
  assert.equal(after.nova.enemies.filter((e) => e.hp === 20 - RULES.chainPower).length, RULES.chainTargets);
  assert.equal(after.nova.enemies.filter((e) => e.hp === 20).length, 1, 'the farthest is spared');
});

test('a phantom keeps the ship out of harm\'s way a while, and fires fast', () => {
  const { config, after } = firing('phantom');

  assert.ok(after.nova.cloak > RULES.cloakSeconds - 0.1);
  assert.ok(after.nova.rapid > RULES.cloakSeconds - 0.1);

  const shot = run({ ...after, nova: { ...after.nova, fire: [{ id: 1, x: 250, y: SHIP_Y - 20, vx: 0, vy: 250 }] } }, config, 0.3, { input: at(250) });
  assert.equal(named(shot.events, 'life-lost').length, 0);
});

test('the game\'s own sectors are well made: named, enemies to shoot, the boss last', () => {
  assert.ok(NOVA_SECTORS.length >= 4);
  assert.equal(new Set(NOVA_SECTORS.map((sector) => sector.name)).size, NOVA_SECTORS.length);
  assert.deepEqual(NOVA_SECTORS.map((sector) => sector.boss), [...NOVA_SECTORS.slice(0, -1).map(() => false), true]);

  for (const sector of NOVA_SECTORS) {
    assert.ok(sector.waves.length >= 3, sector.name);
    assert.ok(sector.waves.every((wave) => wave.count > 0 && wave.every > 0), sector.name);
  }
});

test('the same seed and the same hands fly the same game', () => {
  const fly = (seed) => {
    const config = { ...NOVA_CONFIG, supers: { ...NOVA_CONFIG.supers, enabled: true } };
    let state = startGame(createInitialState(config, seed), config);
    const trace = [];

    for (let step = 0; step < 120 * 40 && state.phase === GAME_PHASE.RUNNING; step += 1) {
      const target = state.nova.enemies.find((e) => e.y > 0)?.x ?? 250;
      state = advanceGame(state, STEP, at(target + Math.sin(step / 29) * 60), config);
      trace.push(...state.events.map((event) => event.type));
    }

    return { trace: trace.join(','), points: state.nova.points, seed: state.seed };
  };

  const first = fly(11);
  assert.deepEqual(fly(11), first);
  assert.ok(first.points > 300, 'and it is a real game: enemies go down');
});
