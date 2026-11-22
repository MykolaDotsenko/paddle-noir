import test from 'node:test';
import assert from 'node:assert/strict';

import { GAME_CONFIG, WARP_CONFIG, WARP_LIVES } from '../src/config.js';
import { WARP_COURSES } from '../src/courses.js';
import { advanceGame, createInitialState, GAME_PHASE, getWinner, startGame } from '../src/domain/game.js';
import { buildCourse, curveAt, FINAL_STRETCH, flowOf, gradeAt, heightAt, ITEM_RADIUS, itemX, laneX, onRumble, placeOf, raceState, roll, TRICK_POINTS } from '../src/domain/warp.js';

// The Warp game: the paddle is a racing craft. These tests lay out courses of their own, put
// rings, pads, hazards and rivals where each case needs them, and let the race run.

const RULES = WARP_CONFIG.warp;
const STEP = WARP_CONFIG.fixedStepSeconds;
const REACH = (WARP_CONFIG.width - WARP_CONFIG.paddle.width) / 2;
const IDLE = { horizontalAxis: 0, pointerX: null, opponentAxis: 0, opponentPointerX: null };
/** Steers the craft to a place across the lane. */
const lane = (x) => ({ ...IDLE, pointerX: WARP_CONFIG.width / 2 + x * REACH });

const SLOW = Object.freeze({ name: 'Slow', rgb: '1, 2, 3', craft: 'jet', pace: 0.5, skill: 1, trait: 'none' });

/** A course of the test's own: straight, with nothing on it unless the test puts it there. */
function layout(changes = {}) {
  return {
    name: 'Test',
    theme: 'sunset',
    length: 600,
    bends: [[600, 0]],
    hills: [],
    every: { rings: 0, pads: 0, mines: 0, debris: 0, cargo: 0, ramps: 0, gates: 0, crates: 0, cells: 0 },
    pilots: [SLOW, SLOW, SLOW, SLOW],
    qualify: 1,
    ...changes,
  };
}

/** A race under way, past its start lights, with a course and rivals of the test's own. */
function game({ courses = [layout(), layout({ name: 'Next' })], items = [], rivals = [], supers = false, warp = {}, seed = 7, x = 0, launched = true, loadout = {} } = {}) {
  // An unarmed craft with an empty tank, unless the test is about its guns, rockets or nitro.
  const config = { ...WARP_CONFIG, supers: { ...WARP_CONFIG.supers, enabled: supers }, warp: { ...RULES, nitroPerTrick: 0, ...warp, courses, loadout: { ...RULES.loadout, damage: 0, rockets: 0, ...loadout } } };
  const started = startGame(createInitialState(config, seed), config);
  const race = started.warp;
  const field = rivals.map((rival, index) => racer({ id: index + 1, pilot: index, ...rival }));
  const state = {
    ...started,
    serveCountdown: 0,
    player: { x: config.width / 2 + x * REACH, vx: 0 },
    warp: {
      ...race,
      speed: RULES.topSpeed,
      // The moment for a rocket start is over, unless the test is about it.
      launched,
      nitro: 0,
      course: { ...race.course, items: items.map((item, index) => ({ id: index + 1, x: 0, sway: 0, air: false, ...item })) },
      rivals: field,
      place: placeOf({ ...race, rivals: field }),
    },
  };
  return { config, state };
}

/** A rival, on a line it keeps a long while. */
function racer(placed = {}) {
  return { id: 1, pilot: 0, z: 100, x: 0, speed: 0, line: placed.x ?? 0, lineIn: 99, boost: 0, spin: 0, bumped: 0, air: 0, mineIn: 99, hull: RULES.rivalHull, finish: 0, ...placed };
}

const race = (state, changes) => ({ ...state, warp: { ...state.warp, ...changes } });
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

test('every other game has no race in it', () => {
  assert.equal(createInitialState(GAME_CONFIG, 1).warp, null);
  assert.equal(GAME_CONFIG.warp, null);
});

test('a Warp cup starts at the first race, with three credits, the player at the back of the grid and no ball in play', () => {
  const state = createInitialState(WARP_CONFIG, 1);
  const { rivals } = state.warp;

  assert.equal(state.lives, WARP_LIVES);
  assert.deepEqual({ race: state.warp.race, z: state.warp.z, speed: state.warp.speed, points: state.warp.points }, { race: 0, z: 0, speed: 0, points: 0 });
  assert.equal(rivals.length, WARP_COURSES[0].pilots.length);
  assert.ok(rivals.every((rival) => rival.z > 0 && rival.speed === 0 && rival.finish === 0));
  assert.deepEqual(new Set(rivals.map((rival) => Math.sign(rival.x))), new Set([-1, 1]), 'the grid is two abreast');
  assert.equal(state.warp.place, rivals.length + 1);
  assert.deepEqual(state.ball, { x: WARP_CONFIG.width / 2, y: WARP_CONFIG.height / 2, vx: 0, vy: 0, spin: 0 });
});

test('the start lights count down as before a match, and nobody moves until they go green', () => {
  const state = startGame(createInitialState(WARP_CONFIG, 1), WARP_CONFIG);
  const { state: lights, events } = run(state, WARP_CONFIG, WARP_CONFIG.startDelaySeconds - 0.1);

  assert.deepEqual(named(events, 'countdown').map((event) => event.value), [3, 2, 1]);
  assert.equal(lights.warp.z, 0);
  assert.ok(lights.warp.rivals.every((rival, index) => rival.z === state.warp.rivals[index].z));

  const { state: green, events: off } = run(lights, WARP_CONFIG, 0.6);
  assert.equal(named(off, 'serve').length, 1);
  assert.ok(green.warp.z > 0 && green.warp.speed > 0, 'the craft takes off by itself');
  assert.ok(green.warp.rivals.every((rival) => rival.speed > 0));
});

test('the craft flies on by itself at its top speed, and steers across the lane with the paddle', () => {
  const { config, state } = game();
  const { state: flown } = run(race(state, { speed: 0 }), config, 4, { input: lane(0.6) });

  assert.ok(Math.abs(flown.warp.speed - RULES.topSpeed) < 1);
  assert.ok(Math.abs(laneX(flown, config) - 0.6) < 0.01);

  const far = run(state, config, 1, { input: lane(5) }).state;
  assert.equal(laneX(far, config), 1, 'no farther than the edge of the lane');
});

test('the lane\'s very edge is its rumble strips, which slow a craft on them, the player\'s or a rival\'s', () => {
  const pilots = [{ ...SLOW, pace: 1 }, { ...SLOW, pace: 1 }];
  const { config, state } = game({ courses: [layout({ pilots, length: 2000 }), layout({ pilots })], rivals: [{ z: 340, x: 0.97, speed: 40 }, { z: 340, x: 0.5, speed: 40 }] });
  const { state: edge } = run(race(state, { z: 300 }), config, 4, { input: lane(1) });
  const { state: lane0 } = run(race(state, { z: 300 }), config, 4, { input: lane(0.9) });

  assert.ok(onRumble(1) && onRumble(-0.96) && !onRumble(0.9));
  assert.ok(edge.warp.speed < RULES.topSpeed * 0.9);
  assert.ok(Math.abs(lane0.warp.speed - RULES.topSpeed) < 1);
  assert.ok(edge.warp.rivals[0].speed < edge.warp.rivals[1].speed - 3);
});

test('a ring flown dead center is perfect: points, a chain, a nudge of boost and charge', () => {
  const { config, state } = game({ supers: true, items: [{ kind: 'ring', z: 10 }, { kind: 'ring', z: 30 }, { kind: 'ring', z: 50, x: 0.2 }, { kind: 'ring', z: 70, x: 0.6 }] });
  const { state: flown, events } = run(state, config, 2.2, { input: lane(0) });
  const rings = named(events, 'ring');

  assert.deepEqual(rings.map((ring) => [ring.grade, ring.chain, ring.points]), [
    ['perfect', 1, TRICK_POINTS.perfect],
    ['perfect', 2, TRICK_POINTS.perfect],
    ['good', 0, TRICK_POINTS.good],
    ['miss', 0, 0],
  ]);
  assert.equal(flown.warp.points, TRICK_POINTS.perfect * 2 + TRICK_POINTS.good);
  assert.ok(Math.abs(flown.meters.player.charge - RULES.chargePerTrick * 2) < 1e-9);
  assert.equal(flown.warp.cursor, 4);
});

test('a boost pad flown over speeds the craft up a while; one flown by does nothing', () => {
  const { config, state } = game({ items: [{ kind: 'pad', z: 5, x: 0.6 }, { kind: 'pad', z: 20 }] });
  const missed = run(state, config, 0.3, { input: lane(0) });

  assert.equal(named(missed.events, 'boost').length, 0);

  const { state: boosted, events } = run(missed.state, config, 1.2, { input: lane(0) });
  assert.deepEqual(named(events, 'boost').map((event) => event.by), ['pad']);
  assert.ok(boosted.warp.speed > RULES.topSpeed + 8);

  const after = run(boosted, config, 4, { input: lane(0) }).state;
  assert.ok(after.warp.speed < RULES.topSpeed + 1, 'and wears off');
});

test('a hazard flown into spins the craft and costs it speed, its chain and a moment to recover', () => {
  const { config, state } = game({ items: [{ kind: 'mine', z: 10 }, { kind: 'debris', z: 20 }] });
  const { state: hit, events } = run(race(state, { chain: 3 }), config, 0.3, { input: lane(0) });
  const [crash] = named(events, 'crash');

  assert.equal(crash.kind, 'mine');
  assert.ok(hit.warp.speed < RULES.topSpeed * 0.6);
  assert.equal(hit.warp.chain, 0);
  assert.ok(hit.warp.spin > 0 && hit.warp.safe > 0);

  const { events: through } = run(hit, config, 0.5, { input: lane(0), until: (next) => next.warp.cursor === 2 });
  assert.equal(named(through, 'crash').length, 0, 'nothing hits it again while it recovers');
});

test('every hazard is hit across its own width, and passed close by it is a near miss', () => {
  for (const kind of /** @type {const} */ (['mine', 'debris', 'cargo'])) {
    const reach = ITEM_RADIUS[kind] + RULES.craftRadius;
    const at = (x) => {
      const { config, state } = game({ items: [{ kind, z: 10, x }] });
      return run(state, config, 0.4, { input: lane(0) }).events;
    };

    assert.equal(named(at(reach - 0.02), 'crash').length, 1, kind);
    assert.deepEqual(named(at(reach + RULES.nearMiss / 2), 'near-miss').map((event) => event.points), [TRICK_POINTS.nearMiss], kind);
    assert.deepEqual(named(at(-(reach + RULES.nearMiss * 2)), 'near-miss').concat(named(at(reach + RULES.nearMiss * 2), 'crash')), [], kind);
  }
});

test('debris drifts across the lane; everything else stays where it is', () => {
  const debris = { id: 3, kind: 'debris', z: 10, x: 0.1, sway: 0.3 };
  const mine = { id: 4, kind: 'mine', z: 10, x: 0.1, sway: 0 };
  const places = [0, 0.5, 1, 1.5, 2].map((time) => itemX(debris, time));

  assert.ok(Math.max(...places) - Math.min(...places) > 0.2);
  assert.ok(places.every((x) => Math.abs(x) <= 0.9));
  assert.equal(itemX(mine, 2), 0.1);
});

test('a rival flies on, steers round what is in its way as well as its skill allows, and crashes into the rest', () => {
  const ahead = (skill) => {
    const pilots = [{ ...SLOW, pace: 1, skill }];
    const { config, state } = game({ courses: [layout({ pilots }), layout({ pilots })], rivals: [{ z: 40, x: 0, speed: 40 }], items: [{ kind: 'cargo', z: 80 }] });
    return run(race(state, { z: 0 }), config, 2, { input: lane(0.9) });
  };

  const careful = ahead(1);
  assert.equal(named(careful.events, 'crash').length, 0);
  assert.ok(Math.abs(careful.state.warp.rivals[0].x) > ITEM_RADIUS.cargo, 'it went round');

  const careless = ahead(0);
  assert.deepEqual(named(careless.events, 'crash').map((event) => event.kind), ['cargo']);
  assert.ok(careless.state.warp.rivals[0].spin > 0);
});

test('a rival far ahead of the player eases off, and one far behind pushes', () => {
  const pilots = [{ ...SLOW, pace: 1 }, { ...SLOW, pace: 1 }];
  const { config, state } = game({ courses: [layout({ pilots, length: 2000 }), layout({ pilots })], rivals: [{ z: 300, x: -0.5, speed: 40 }, { z: 100, x: 0.5, speed: 40 }] });
  const { state: flown } = run(race(state, { z: 200 }), config, 3, { input: lane(0) });
  const [front, back] = flown.warp.rivals;

  assert.ok(front.speed < RULES.topSpeed * 0.93);
  assert.ok(back.speed > RULES.topSpeed * 1.07);
});

test('a rival takes a boost pad it can reach', () => {
  const pilots = [{ ...SLOW, pace: 1, skill: 1 }];
  const { config, state } = game({ courses: [layout({ pilots }), layout({ pilots })], rivals: [{ z: 50, x: 0.1, speed: 40 }], items: [{ kind: 'pad', z: 70, x: 0.1 }] });
  const { state: flown } = run(state, config, 1.5, { input: lane(-0.9) });

  assert.ok(flown.warp.rivals[0].speed > RULES.topSpeed + 5);
});

test('flying into a rival bumps it aside, and costs the one behind some speed', () => {
  const { config, state } = game({ rivals: [{ z: 3, x: 0.05, speed: 30 }] });
  const { state: bumped, events } = run(state, config, 0.2, { input: lane(0) });
  const rival = bumped.warp.rivals[0];

  assert.equal(named(events, 'bump').length, 1);
  assert.ok(rival.x > 0.2, 'pushed off to its side');
  assert.ok(bumped.warp.speed < RULES.topSpeed * 0.95);
});

test('flying close behind a rival builds a slipstream that slings the craft past it', () => {
  const pilots = [{ ...SLOW, pace: 1 }];
  const { config, state } = game({ courses: [layout({ pilots, length: 2000 }), layout({ pilots })], rivals: [{ z: 8, x: 0, speed: 40 }] });
  const tow = race(state, { speed: 38 });
  const { state: slung, events } = run(tow, config, RULES.slipSeconds + 0.5, { input: lane(0), until: (_, seen) => named(seen, 'boost').length > 0 });

  assert.equal(named(events, 'slipstream').length, 1);
  assert.deepEqual(named(events, 'boost').map((event) => event.by), ['slingshot']);
  assert.equal(slung.warp.points, TRICK_POINTS.slingshot);
  assert.ok(slung.warp.boost > 0);

  const aside = run(race(state, { speed: 38 }), config, RULES.slipSeconds + 0.5, { input: lane(0.8) });
  assert.equal(named(aside.events, 'boost').length, 0, 'not from beside it');
});

test('passing a rival is an overtake, and being passed costs the place back', () => {
  const pilots = [{ ...SLOW, pace: 0.5 }, { ...SLOW, pace: 1.2 }];
  const { config, state } = game({ courses: [layout({ pilots, length: 2000 }), layout({ pilots })], rivals: [{ z: 6, x: -0.8, speed: 20 }, { z: -12, x: 0.8, speed: 60, boost: 9 }] });

  assert.equal(placeOf(state.warp), 2);
  const { state: flown, events } = run(state, config, 1.5, { input: lane(0) });

  assert.deepEqual(named(events, 'overtake').map((event) => [event.place, event.pilot, event.points]), [[1, 0, TRICK_POINTS.overtake]]);
  assert.deepEqual(named(events, 'overtaken').map((event) => [event.place, event.pilot]), [[2, 1]]);
  assert.equal(flown.warp.place, 2);
});

test('the last stretch of a course is called once', () => {
  const { config, state } = game();
  const near = race(state, { z: 600 * FINAL_STRETCH - 5 });
  const { events } = run(near, config, 1, { input: lane(0) });

  assert.equal(named(events, 'final-stretch').length, 1);
});

test('crossing the line in a place that goes through scores it, and the next race lines up after a pause', () => {
  const { config, state } = game({ rivals: [{ z: 40, x: -0.8, speed: 10 }] });
  const { state: over, events } = run(race(state, { z: 590, place: 1, points: 100 }), config, 0.5, { input: lane(0) });
  const [finish] = named(events, 'race-finish');

  assert.deepEqual({ ...finish, margin: undefined }, { type: 'race-finish', race: 0, place: 1, points: RULES.placePoints[0], qualified: true, last: false, margin: undefined });
  assert.ok(finish.margin > 10);
  assert.equal(over.warp.points, 100 + RULES.placePoints[0]);
  assert.ok(over.warp.finished && over.warp.calm > 0);
  assert.equal(over.lives, WARP_LIVES);

  const calm = run(over, config, RULES.calmSeconds - 0.5, { input: lane(0) }).state;
  assert.ok(calm.warp.z > over.warp.z, 'the racers cruise on past the line');
  assert.equal(calm.warp.race, 0);

  const { state: grid, events: lights } = run(calm, config, 1, { input: lane(0) });
  assert.equal(grid.warp.race, 1);
  assert.equal(grid.warp.z, 0);
  assert.equal(grid.warp.points, over.warp.points, 'the cup keeps its points');
  assert.ok(grid.serveCountdown > 0 && grid.serveNumber === 0);
  assert.deepEqual(named(lights, 'countdown').map((event) => event.value), [3]);
});

test('a race placed too low costs a credit, and is flown again', () => {
  const { config, state } = game({ rivals: [{ z: 700, x: 0, speed: 10, finish: 9 }] });
  const { state: over, events } = run(race(state, { z: 590 }), config, 0.5, { input: lane(0) });

  assert.deepEqual(named(events, 'race-finish').map((event) => [event.place, event.points, event.qualified]), [[2, RULES.placePoints[1], false]]);
  assert.deepEqual(named(events, 'life-lost').map((event) => event.lives), [WARP_LIVES - 1]);

  const again = run(over, config, RULES.calmSeconds + 0.1, { input: lane(0) }).state;
  assert.equal(again.warp.race, 0);
  assert.equal(again.lives, WARP_LIVES - 1);
});

test('a race counts once: flown again, it is flown for its points anew', () => {
  const { config, state } = game({ rivals: [{ z: 700, x: 0, speed: 10, finish: 9 }] });
  // Two races in, 5000 points banked, and 900 more made in this one before a place too low.
  const flying = race(state, { z: 590, points: 5900, banked: 5000, lost: 300 });
  const { state: over } = run(flying, config, 0.5, { input: lane(0) });

  assert.equal(over.warp.points, 5900 + RULES.placePoints[1], 'on the board the race still shows what it made');

  const again = run(over, config, RULES.calmSeconds + 0.1, { input: lane(0) }).state.warp;
  assert.deepEqual({ points: again.points, banked: again.banked, lost: again.lost }, { points: 5000, banked: 5000, lost: 300 + 900 + RULES.placePoints[1] });

  // Gone through, a race's points are the cup's, and the next race starts from them.
  const through = game({ rivals: [{ z: 40, x: -0.8, speed: 10 }] });
  const next = run(race(through.state, { z: 590, points: 5900, banked: 5000, lost: 300 }), through.config, RULES.calmSeconds + 0.6, { input: lane(0) }).state.warp;
  assert.deepEqual({ race: next.race, banked: next.banked, lost: next.lost }, { race: 1, banked: next.points, lost: 300 });
  assert.ok(next.points >= 5900 + RULES.placePoints[0]);
});

test('the last credit spent ends the cup', () => {
  const { config, state } = game({ rivals: [{ z: 700, x: 0, speed: 10, finish: 9 }] });
  const { state: over, events } = run({ ...race(state, { z: 590 }), lives: 1 }, config, 0.5, { input: lane(0) });

  assert.equal(over.phase, GAME_PHASE.GAME_OVER);
  assert.equal(getWinner(over), 'opponent');
  assert.deepEqual(named(events, 'game-over').map((event) => event.winner), ['opponent']);
});

test('going through the last race wins the cup', () => {
  const { config, state } = game({ rivals: [{ z: 40, x: -0.8, speed: 10 }] });
  const last = race(state, { race: 1, z: 590 });
  const { state: over, events } = run(last, config, 0.5, { input: lane(0) });

  assert.deepEqual(named(events, 'race-finish').map((event) => [event.place, event.last, event.qualified]), [[1, true, true]]);
  assert.equal(over.phase, GAME_PHASE.GAME_OVER);
  assert.equal(getWinner(over), 'player');
});

test('with supers on, tricks charge the meter; with them off nothing does', () => {
  const charged = (supers) => {
    const { config, state } = game({ supers, items: [{ kind: 'ring', z: 10 }] });
    return run(state, config, 0.5, { input: lane(0) }).state.meters.player.charge;
  };

  assert.ok(Math.abs(charged(true) - RULES.chargePerTrick) < 1e-9);
  assert.equal(charged(false), 0);
});

/** A full meter, and a flick of the craft. */
function firing(kind, options = {}) {
  const { config, state } = game({ supers: true, ...options });
  const loaded = { ...state, meters: { ...state.meters, player: { charge: 1, kind } }, player: { x: 250, vx: config.supers.flickSpeed * 4 } };
  const { state: after, events } = run(loaded, config, STEP, { input: lane(0) });
  return { config, after, events };
}

test('a full meter fires its super with a flick; a full meter and a still craft keep it', () => {
  const fired = firing('phantom');
  assert.deepEqual(named(fired.events, 'super-fire').map((event) => event.kind), ['phantom']);
  assert.deepEqual(fired.after.meters.player, { charge: 0, kind: 'phantom' });

  const { config, state } = game({ supers: true });
  const still = { ...state, meters: { ...state.meters, player: { charge: 1, kind: 'phantom' } } };
  const kept = run(still, config, 0.2, { input: lane(0) });
  assert.equal(named(kept.events, 'super-fire').length, 0);
  assert.equal(kept.state.meters.player.charge, 1);
});

test('a fireball\'s afterburner outruns any boost and smashes through what it meets, rivals too', () => {
  const { config, after, events } = firing('fireball', { items: [{ kind: 'cargo', z: 20 }], rivals: [{ z: 40, x: 0, speed: 20 }] });

  assert.deepEqual(named(events, 'boost').map((event) => event.by), ['super']);
  const { state: flown, events: burning } = run(after, config, 1.6, { input: lane(0) });

  assert.ok(flown.warp.speed > RULES.boostSpeed);
  assert.deepEqual(named(burning, 'smash').map((event) => [event.kind, event.points]), [['cargo', TRICK_POINTS.smash]]);
  assert.deepEqual(named(burning, 'takedown').map((event) => event.points), [TRICK_POINTS.takedown]);
  assert.equal(named(burning, 'crash').length, 0);
});

test('a zigzag\'s shockwave takes down every rival near, and none far', () => {
  const { after, events } = firing('zigzag', { rivals: [{ z: 10, x: 0.6 }, { z: -6, x: -0.6 }, { z: 60, x: 0 }] });

  assert.equal(named(events, 'shockwave').length, 1);
  assert.deepEqual(named(events, 'takedown').map((event) => event.pilot), [0, 1]);
  assert.deepEqual(after.warp.rivals.map((rival) => rival.spin > 0), [true, true, false]);
});

test('thunder strikes the two rivals just ahead', () => {
  const { after, events } = firing('thunder', { rivals: [{ z: 80, x: 0.6 }, { z: 20, x: -0.6 }, { z: 40, x: 0 }, { z: -5, x: 0.3 }] });
  const [bolt] = named(events, 'lightning');

  assert.deepEqual(bolt.targets.map((target) => target.z), [20, 40]);
  assert.deepEqual(after.warp.rivals.map((rival) => rival.spin > 0), [false, true, true, false]);
});

test('a phantom flies through hazards and rivals a while', () => {
  const { config, after } = firing('phantom', { items: [{ kind: 'mine', z: 20 }], rivals: [{ z: 40, x: 0, speed: 10 }] });
  const { events } = run(after, config, 1.5, { input: lane(0) });

  assert.ok(after.warp.ghost > RULES.ghostSeconds - 0.1);
  assert.deepEqual(named(events, 'crash').concat(named(events, 'bump')), []);
});

test('a course is laid out the same every time: its bends a stretch at a time, everything in order and clear of the start and finish', () => {
  WARP_COURSES.forEach((written, index) => {
    const course = buildCourse(WARP_CONFIG, index);
    const length = written.bends.reduce((sum, [meters]) => sum + meters, 0);

    assert.equal(buildCourse(WARP_CONFIG, index), course);
    assert.equal(course.length, written.length);
    assert.ok(course.curves.length * RULES.segment >= written.length, written.name);
    assert.equal(length, written.length, `${written.name}: its bends add up to its length`);
    assert.ok(course.items.every((item, at) => at === 0 || item.z >= course.items[at - 1].z), written.name);
    assert.ok(course.items[0].z > 60 && course.items.at(-1).z < written.length - 50, written.name);
    assert.equal(new Set(course.items.map((item) => item.id)).size, course.items.length);
    assert.ok(course.items.every((item) => Math.abs(item.x) <= 0.8));

    for (const kind of /** @type {const} */ (['rings', 'pads', 'mines', 'debris', 'cargo', 'ramps', 'gates', 'crates', 'cells'])) {
      const singular = { rings: 'ring', pads: 'pad', mines: 'mine', debris: 'debris', cargo: 'cargo', ramps: 'ramp', gates: 'gate', crates: 'crate', cells: 'cell' }[kind];
      const count = course.items.filter((item) => item.kind === singular).length;
      assert.equal(count > 0, written.every[kind] > 0, `${written.name}: ${kind}`);
    }
  });
});

test('the game\'s own cup is well made: five courses, named, faster fields and the Landlord last', () => {
  assert.equal(WARP_COURSES.length, 5);
  assert.equal(new Set(WARP_COURSES.map((course) => course.name)).size, WARP_COURSES.length);

  for (const course of WARP_COURSES) {
    assert.equal(course.pilots.length, 5, course.name);
    assert.ok(course.qualify >= 1 && course.qualify <= 3, course.name);
  }

  const pace = WARP_COURSES.map((course) => Math.max(...course.pilots.map((pilot) => pilot.pace)));
  assert.ok(pace.every((fastest, index) => index === 0 || fastest >= pace[index - 1]));
  assert.equal(WARP_COURSES.at(-1).pilots.at(-1).name, 'Landlord');
  assert.equal(WARP_COURSES.at(-1).qualify, 1, 'the last race must be won');
});

test('the start of a race and a few hashes are as they should be', () => {
  const grid = raceState(WARP_CONFIG, 2, 1234);

  assert.equal(grid.race, 2);
  assert.equal(grid.points, 1234);
  assert.equal(grid.course, buildCourse(WARP_CONFIG, 2));
  assert.equal(roll(3, 4), roll(3, 4));
  assert.notEqual(roll(3, 4), roll(4, 3));
  assert.ok(roll(9, 9) >= 0 && roll(9, 9) < 1);
});

test('the same seed and the same hands race the same cup', () => {
  const fly = (seed) => {
    const config = { ...WARP_CONFIG, supers: { ...WARP_CONFIG.supers, enabled: true } };
    let state = startGame(createInitialState(config, seed), config);

    for (let step = 0; step < 2400; step += 1) {
      state = advanceGame(state, STEP, lane(Math.sin(step / 70) * 0.7), config);
    }

    return { z: state.warp.z, points: state.warp.points, rivals: state.warp.rivals.map((rival) => [rival.z, rival.x]) };
  };

  assert.deepEqual(fly(5), fly(5));
});

// Hills.

test('a course rolls over hills, level at its start and its finish, and a slope speeds a craft up or slows it down', () => {
  const hills = [[2, 300, 0]];
  const { config, state } = game({ courses: [layout({ length: 2000, bends: [[2000, 0]], hills }), layout()] });
  const { course } = state.warp;

  assert.deepEqual([heightAt(course, 0), heightAt(course, -40), heightAt(course, 2000), heightAt(course, 2300)], [0, 0, 0, 0]);
  assert.ok(Math.abs(heightAt(course, 675) - 2) < 1e-9, 'a crest as high as it is written');
  assert.ok(gradeAt(course, 750, RULES) > 1.02 && gradeAt(course, 600, RULES) < 0.98);
  assert.ok(gradeAt(course, 750, RULES) <= 1.06 && gradeAt(course, 600, RULES) >= 0.94, 'by so much and no more');
  assert.equal(gradeAt(course, -20, RULES), 1, 'and level ground changes nothing');

  const after = (z) => run(race(state, { z }), config, 0.6, { input: lane(0) }).state.warp.speed;
  assert.ok(after(730) > RULES.topSpeed + 0.5, 'faster downhill');
  assert.ok(after(580) < RULES.topSpeed - 0.5, 'slower up');
});

test('the game\'s own courses roll, and their heights never jump', () => {
  WARP_COURSES.forEach((written, index) => {
    const course = buildCourse(WARP_CONFIG, index);
    const heights = Array.from({ length: written.length }, (_, z) => heightAt(course, z));

    assert.ok(Math.max(...heights) - Math.min(...heights) > 1, written.name);
    assert.ok(heights.every((height, z) => z === 0 || Math.abs(height - heights[z - 1]) < 0.08), written.name);
  });
});

// Ramps and the air.

test('a ramp throws the craft into the air: over hazards, gates and rivals, past the rings on the ground, and through the rings that hang there', () => {
  const items = [{ kind: 'ramp', z: 10 }, { kind: 'ring', z: 22 }, { kind: 'ring', z: 26, air: true }, { kind: 'mine', z: 30 }, { kind: 'gate', z: 36, x: 0.8 }, { kind: 'pad', z: 40 }];
  const { config, state } = game({ items, rivals: [{ z: 20, x: 0.8, speed: 20 }] });
  const { state: up, events: launch } = run(state, config, 0.3, { input: lane(0) });

  assert.deepEqual(named(launch, 'jump').map((event) => [event.z, event.pilot]), [[10, undefined]]);
  assert.ok(up.warp.air > 0);

  const { state: down, events } = run(up, config, RULES.airSeconds, { input: lane(0) });
  assert.deepEqual(named(events, 'ring').map((ring) => [ring.z, ring.air, ring.grade, ring.points]), [[26, true, 'perfect', TRICK_POINTS.perfect * 2]]);
  assert.deepEqual(named(events, 'crash').concat(named(events, 'bump'), named(events, 'boost'), named(events, 'near-miss')), []);
  assert.deepEqual(named(events, 'land').map((event) => event.points), [TRICK_POINTS.air]);
  assert.equal(down.warp.air, 0);
  assert.equal(down.warp.points, TRICK_POINTS.perfect * 2 + TRICK_POINTS.air + TRICK_POINTS.overtake, 'and passing a rival from above is an overtake all the same');
  assert.ok(Math.abs(down.warp.speed - RULES.topSpeed) < 2, 'it keeps its speed through the air');
});

test('a ramp flown by throws nobody, and the rings in the air are out of reach from the ground', () => {
  const { config, state } = game({ items: [{ kind: 'ramp', z: 10, x: 0.6 }, { kind: 'ring', z: 20, air: true }] });
  const { state: flown, events } = run(state, config, 0.7, { input: lane(0) });

  assert.deepEqual(named(events, 'jump').concat(named(events, 'ring')), []);
  assert.equal(flown.warp.air, 0);
  assert.equal(flown.warp.cursor, 2);
});

test('a rival takes a ramp too, and flies over what is under it', () => {
  const pilots = [{ ...SLOW, pace: 1, skill: 0 }];
  const { config, state } = game({ courses: [layout({ pilots }), layout({ pilots })], rivals: [{ z: 20, x: 0, speed: 40 }], items: [{ kind: 'ramp', z: 30 }, { kind: 'mine', z: 45 }, { kind: 'gate', z: 55, x: 0.8 }] });
  const { state: flown, events } = run(state, config, 1, { input: lane(-0.9) });

  assert.deepEqual(named(events, 'jump').map((event) => event.pilot), [0]);
  assert.equal(named(events, 'crash').length, 0);
  assert.ok(flown.warp.rivals[0].air > 0);
});

// Gates.

test('a gate is threaded through its gap: dead center for points, or anywhere in it; outside it is a crash', () => {
  const through = (x, changes = {}) => {
    const { config, state } = game({ items: [{ kind: 'gate', z: 10, x: 0.3 }], x });
    return run(race(state, changes), config, 0.4, { input: lane(x) });
  };

  assert.deepEqual(named(through(0.3).events, 'gate').map((event) => [event.grade, event.points]), [['perfect', TRICK_POINTS.gate]]);
  assert.deepEqual(named(through(0.3 + RULES.gateCenter + 0.05).events, 'gate').map((event) => [event.grade, event.points]), [['good', 0]]);
  assert.deepEqual(named(through(0.3 - RULES.gateGap).events, 'crash').map((event) => event.kind), ['gate']);
  assert.ok(through(-0.5).state.warp.spin > 0);
  assert.deepEqual(named(through(-0.5, { burn: 2 }).events, 'smash').map((event) => [event.kind, event.points]), [['gate', TRICK_POINTS.smash]]);
  assert.deepEqual(through(-0.5, { ghost: 2 }).events.filter((event) => event.type === 'crash' || event.type === 'gate'), []);
});

test('a rival steers for a gate\'s gap if it reads the gate, and crashes into the gate if it does not', () => {
  const at = (skill, reads) => {
    const pilots = [{ ...SLOW, pace: 1, skill }];
    // An item the rival's roll for it comes out as the test needs.
    const id = Array.from({ length: 200 }, (_, n) => n + 1).find((n) => (roll(17, n) < 0.45 + skill / 2) === reads);
    const { config, state } = game({ courses: [layout({ pilots }), layout({ pilots })], rivals: [{ z: 30, x: -0.6, speed: 40 }], items: [{ id, kind: 'gate', z: 90, x: 0.4 }] });
    return run(state, config, 2, { input: lane(0.4) });
  };

  const sharp = at(1, true);
  assert.equal(named(sharp.events, 'crash').length, 0);
  assert.ok(Math.abs(sharp.state.warp.rivals[0].x - 0.4) < 0.1);
  assert.deepEqual(named(at(0, false).events, 'crash').map((event) => [event.kind, event.pilot]), [['gate', 0]]);
});

// Drifts.

test('holding the inside of a bend charges a drift, which boosts the craft as it leaves the line', () => {
  const courses = [layout({ bends: [[600, 1]] }), layout()];
  const { config, state } = game({ courses, x: 0.7 });

  assert.equal(curveAt(state.warp.course, 100, RULES), 1);
  assert.equal(curveAt(state.warp.course, -5, RULES), 0);
  const { state: charged, events } = run(state, config, RULES.driftSeconds + 0.2, { input: lane(0.7) });
  assert.equal(charged.warp.drift, 1);
  assert.equal(named(events, 'drift-ready').length, 1);
  assert.equal(named(events, 'boost').length, 0, 'held while the line is held');

  const { state: out, events: released } = run(charged, config, 0.2, { input: lane(0.1) });
  assert.deepEqual(named(released, 'boost').map((event) => event.by), ['drift']);
  assert.equal(out.warp.drift, 0);
  assert.equal(out.warp.points, TRICK_POINTS.drift);
  assert.ok(out.warp.boost > RULES.driftBoostSeconds - 0.3);
});

test('a drift charges only on the inside of a bend, off the rumble strips, and fades if the line is left early', () => {
  const drift = (bend, x, seconds = 0.6) => {
    const { config, state } = game({ courses: [layout({ bends: [[600, bend]] }), layout()], x });
    return run(state, config, seconds, { input: lane(x) }).state.warp.drift;
  };

  assert.ok(drift(1, 0.7) > 0.4);
  assert.ok(drift(-1, -0.7) > 0.4, 'the inside of a left-hand bend is the left');
  assert.equal(drift(1, -0.7), 0, 'not on the outside');
  assert.equal(drift(1, 0.2), 0, 'nor in the middle');
  assert.equal(drift(0, 0.7), 0, 'nor on a straight');
  assert.equal(drift(0.3, 0.7), 0, 'nor in a bend too gentle');
  assert.equal(drift(1, 1), 0, 'nor on the rumble strips');
  assert.ok(drift(1.5, 0.7) > drift(1, 0.7), 'faster in a harder bend');

  const { config, state } = game({ courses: [layout({ bends: [[600, 1]] }), layout()], x: 0.7 });
  const half = run(state, config, 0.5, { input: lane(0.7) }).state;
  const left = run(half, config, 1, { input: lane(0) });
  assert.equal(left.state.warp.drift, 0);
  assert.equal(named(left.events, 'boost').length, 0);
});

// The flow.

test('tricks landed without a crash multiply what the next ones score, and a crash ends the flow', () => {
  const rings = [10, 20, 30, 40, 50, 60, 70].map((z) => ({ kind: 'ring', z }));
  const { config, state } = game({ items: [...rings, { kind: 'mine', z: 80 }, { kind: 'ring', z: 130 }] });
  const { state: flowing, events } = run(state, config, 3, { input: lane(0), until: (_, seen) => named(seen, 'ring').length === 7 });

  const times = (tricks) => 1 + Math.floor(tricks / RULES.flowStep);
  assert.deepEqual(named(events, 'ring').map((ring) => ring.points), rings.map((_, landed) => TRICK_POINTS.perfect * times(landed)));
  assert.deepEqual(named(events, 'flow').map((event) => event.multiplier), [2]);
  assert.equal(flowing.warp.flow, 7);
  assert.equal(flowOf(flowing.warp, RULES), times(7));
  assert.ok(times(7) > 1);
  assert.equal(flowOf({ flow: 99 }, RULES), RULES.maxFlow, 'up to a point');

  const { state: crashed, events: after } = run(flowing, config, 3, { input: lane(0) });
  assert.equal(named(after, 'crash').length, 1);
  assert.deepEqual(named(after, 'ring').map((ring) => ring.points), [50], 'from one again');
  assert.equal(crashed.warp.flow, 1);
});

// The start.

test('a flick as the lights go green is a rocket start; a moment later it is only a flick', () => {
  const flick = (time) => {
    const { config, state } = game({ launched: false });
    const waiting = run(race(state, { speed: 0, time: 0 }), config, time, { input: lane(0) }).state;
    return run({ ...waiting, player: { x: 250, vx: config.supers.flickSpeed * 4 } }, config, STEP, { input: lane(0) });
  };

  const rocket = flick(0.2);
  assert.deepEqual(named(rocket.events, 'boost').map((event) => event.by), ['start']);
  assert.ok(rocket.state.warp.boost > RULES.startBoostSeconds - 0.1);
  assert.equal(rocket.state.warp.points, TRICK_POINTS.start);
  assert.equal(rocket.state.warp.launched, true);

  const late = flick(RULES.startWindow + 0.2);
  assert.equal(named(late.events, 'boost').length, 0);
  assert.equal(late.state.warp.launched, true);
});

test('one flick is one rocket start', () => {
  const { config, state } = game({ launched: false });
  const { events } = run({ ...race(state, { time: 0 }), player: { x: 250, vx: config.supers.flickSpeed * 4 } }, config, 0.3, { input: (next) => ({ ...lane(0), pointerX: next.player.x + 6 }) });

  assert.equal(named(events, 'boost').length, 1);
});

// Pilots with a way of their own.

test('a blocker covers the player\'s line while they are close behind, and only then', () => {
  const covering = (trait, gap) => {
    const pilots = [{ ...SLOW, pace: 1, trait }];
    const { config, state } = game({ courses: [layout({ pilots, length: 2000 }), layout({ pilots })], rivals: [{ z: gap, x: -0.5, speed: 40 }], x: 0.6 });
    return run(state, config, 1.2, { input: lane(0.6) }).state.warp.rivals[0];
  };

  assert.ok(covering('blocker', 9).x > 0.4);
  assert.equal(covering('blocker', 9).line, 0.6);
  assert.equal(covering('none', 9).x, -0.5);
  assert.equal(covering('blocker', 50).x, -0.5, 'not from far ahead');
});

test('a weaver changes its line far more often than anyone else', () => {
  const changes = (trait) => {
    const pilots = [{ ...SLOW, pace: 1, trait }];
    const { config, state } = game({ courses: [layout({ pilots, length: 4000 }), layout({ pilots })], rivals: [{ z: 120, x: 0, speed: 40, lineIn: 0 }] });
    const lines = new Set();
    run(state, config, 12, { input: lane(0), until: (next) => { lines.add(next.warp.rivals[0].line); return false; } });
    return lines.size;
  };

  assert.ok(changes('weaver') >= changes('none') + 3);
});

test('a miner drops mines for a player who follows, a few at most, and they are mines like any other', () => {
  const pilots = [{ ...SLOW, pace: 1, trait: 'miner' }];
  const behind = (gap, seconds, x = 0.8) => {
    const { config, state } = game({ courses: [layout({ pilots, length: 4000 }), layout({ pilots })], rivals: [{ z: gap, x: 0, speed: 40, mineIn: 0 }], x });
    return run(state, config, seconds, { input: lane(x) });
  };

  const first = behind(40, 0.1);
  assert.deepEqual(named(first.events, 'mine-drop').map((event) => event.pilot), [0]);
  assert.deepEqual(first.state.warp.drops.map((drop) => [drop.kind, drop.x, drop.air]), [['mine', 0, false]]);
  assert.ok(first.state.warp.drops[0].z > first.state.warp.z + 20);

  const many = behind(69, RULES.mineEvery * 2 + 0.2);
  assert.equal(named(many.events, 'mine-drop').length, 3, 'one every so often');
  assert.ok(many.state.warp.drops.length <= RULES.maxDrops);
  assert.equal(named(many.events, 'crash').length, 0, 'flown by on another line');

  const into = behind(40, 2, 0);
  assert.deepEqual(named(into.events, 'crash').map((event) => event.kind), ['mine']);
  assert.equal(into.state.warp.drops.length, 0, 'a mine flown past is gone');

  assert.equal(named(behind(-30, 1).events, 'mine-drop').length, 0, 'none for a player ahead');
  assert.equal(named(behind(8, 1).events, 'mine-drop').length, 0, 'nor right behind, with no time to see it');
});

// The courses, as laid out.

test('rings hang in the air past every ramp, nothing stands at a gate or on a ramp, and no gate where a jump comes down', () => {
  WARP_COURSES.forEach((written, index) => {
    const { items } = buildCourse(WARP_CONFIG, index);
    const ramps = items.filter((item) => item.kind === 'ramp');
    const gates = items.filter((item) => item.kind === 'gate');
    const grounded = items.filter((item) => !item.air && item.kind !== 'ramp' && item.kind !== 'gate');

    for (const ramp of ramps) {
      const hanging = items.filter((item) => item.air && item.z > ramp.z && item.z < ramp.z + 40);
      assert.deepEqual(hanging.map((ring) => [ring.kind, Math.round(ring.z - ramp.z)]), [['ring', 16], ['ring', 30]], written.name);
      assert.equal(hanging[0].x, ramp.x, 'the first straight ahead');
      assert.ok(grounded.every((item) => Math.abs(item.z - ramp.z) >= 8), written.name);
      assert.ok(gates.every((gate) => gate.z <= ramp.z - 16 || gate.z >= ramp.z + 50), written.name);
    }

    for (const gate of gates) {
      assert.ok(grounded.every((item) => Math.abs(item.z - gate.z) >= 16), written.name);
    }

    assert.equal(items.filter((item) => item.air).length, ramps.length * 2);
  });
});

test('the cup has pilots with a way of their own: blockers, weavers, and the Landlord with his mines', () => {
  const traits = new Set(WARP_COURSES.flatMap((course) => course.pilots.map((pilot) => pilot.trait)));

  assert.deepEqual([...traits].sort(), ['blocker', 'miner', 'none', 'weaver']);
  assert.equal(WARP_COURSES.at(-1).pilots.at(-1).trait, 'miner');
  assert.ok(WARP_COURSES[0].pilots.every((pilot) => pilot.trait === 'none'), 'the first race is among plain racers');
});

test('the player\'s own finish is timed', () => {
  const { config, state } = game({ rivals: [{ z: 40, x: -0.8, speed: 10 }] });
  const { state: over } = run(race(state, { z: 590, place: 1, time: 31 }), config, 0.5, { input: lane(0) });

  assert.ok(over.warp.finishTime > 31 && over.warp.finishTime < 31.5);
});

// Nitro, weapons and the craft's loadout.

const burn = (x = 0) => ({ ...lane(x), action: true });

test('a race starts with a bar of nitro in the tank and a rocket aboard, and every rival\'s hull whole', () => {
  const { warp } = createInitialState(WARP_CONFIG, 1);

  assert.deepEqual([warp.nitro, warp.nitroBurn, warp.rockets, warp.shield, warp.lock, warp.aim], [1, 0, 1, RULES.loadout.shields, 0, 0]);
  assert.deepEqual(warp.missiles, []);
  assert.ok(warp.rivals.every((rival) => rival.hull === RULES.rivalHull));
});

test('a bar of nitro burns when the player asks: faster than any boost, for as long as the craft\'s tank gives', () => {
  const { config, state } = game();
  const { state: lit, events } = run(race(state, { nitro: 2 }), config, STEP, { input: burn() });

  assert.equal(named(events, 'nitro').length, 1);
  assert.equal(lit.warp.nitro, 1);
  assert.ok(Math.abs(lit.warp.nitroBurn - RULES.loadout.nitroSeconds) < STEP * 2);

  const { state: burning, events: held } = run(lit, config, 1, { input: burn() });
  assert.equal(named(held, 'nitro').length, 0, 'one bar at a time, however long it is asked for');
  assert.equal(burning.warp.nitro, 1);
  assert.ok(burning.warp.speed > RULES.boostSpeed + 1);

  const after = run(burning, config, 3, { input: lane(0) }).state;
  assert.equal(after.warp.nitroBurn, 0);
  assert.ok(after.warp.speed < RULES.topSpeed + 1, 'and wears off');
});

test('no bar, no nitro; nor while the craft spins', () => {
  const { config, state } = game();

  assert.equal(named(run(race(state, { nitro: 0.9 }), config, 0.2, { input: burn() }).events, 'nitro').length, 0);
  assert.equal(named(run(race(state, { nitro: 2, spin: 1 }), config, 0.2, { input: burn() }).events, 'nitro').length, 0);
  assert.equal(named(run(race(state, { nitro: 2 }), config, 0.2, { input: lane(0) }).events, 'nitro').length, 0, 'nor unasked');
});

test('tricks and nitro cells fill the tank, as far as it holds', () => {
  const items = [{ kind: 'ring', z: 10 }, { kind: 'cell', z: 20 }, { kind: 'cell', z: 30, x: 0.9 }, { kind: 'cell', z: 40 }, { kind: 'cell', z: 50 }, { kind: 'cell', z: 60 }];
  const { config, state } = game({ items, warp: { nitroPerTrick: 0.2 }, loadout: { nitroBars: 3 } });
  const { state: ringed } = run(state, config, 0.3, { input: lane(0) });

  assert.ok(Math.abs(ringed.warp.nitro - 0.2) < 1e-9);
  const { state: filled, events } = run(ringed, config, 1.2, { input: lane(0) });
  assert.deepEqual(named(events, 'ammo').map((event) => [event.kind, event.z]), [['nitro', 20], ['nitro', 40], ['nitro', 50], ['nitro', 60]], 'a cell flown by is left where it is');
  assert.equal(filled.warp.nitro, 3);
});

test('at the speed of nitro the craft rams a rival out of its way', () => {
  const { config, state } = game({ rivals: [{ z: 3, x: 0.05, speed: 30 }] });
  const { state: rammed, events } = run(race(state, { nitro: 1 }), config, 0.2, { input: burn() });

  assert.deepEqual(named(events, 'takedown').map((event) => [event.by, event.points]), [['ram', TRICK_POINTS.takedown]]);
  assert.equal(named(events, 'bump').length, 0);
  assert.ok(rammed.warp.rivals[0].spin > 0);
  assert.ok(rammed.warp.speed > RULES.topSpeed, 'and keeps its speed');
});

test('the guns fire by themselves at a rival lined up ahead, and wear its hull down until it is taken down', () => {
  const pilots = [{ ...SLOW, pace: 1 }];
  // Guns that take a hull down in two seconds.
  const armed = { courses: [layout({ pilots, length: 4000 }), layout({ pilots })], loadout: { damage: RULES.rivalHull / 2 } };
  const { config, state } = game({ ...armed, rivals: [{ z: 30, x: 0.05, speed: 40 }] });
  const { state: firing, events } = run(state, config, 1, { input: lane(0) });

  assert.equal(firing.warp.aim, 1);
  assert.ok(Math.abs(firing.warp.rivals[0].hull - RULES.rivalHull / 2) < 2);
  assert.ok(named(events, 'gun-fire').length >= 7 && named(events, 'gun-fire').length <= 10, 'told of a few times a second, not every step');
  assert.equal(named(events, 'takedown').length, 0);

  const { state: downed, events: more } = run(firing, config, 1.2, { input: lane(0) });
  assert.deepEqual(named(more, 'takedown').map((event) => [event.by, event.pilot]), [['guns', 0]]);
  assert.equal(downed.warp.rivals[0].hull, RULES.rivalHull, 'its hull is whole again when it flies on');
  assert.equal(downed.warp.aim, 0, 'and a rival spinning is left alone');
});

test('the guns do not bear on a rival out of line, out of range, under the craft\'s nose, or from the air', () => {
  const pilots = [{ ...SLOW, pace: 1 }];
  const aim = (rival, changes = {}) => {
    const { config, state } = game({ courses: [layout({ pilots, length: 4000 }), layout({ pilots })], loadout: { damage: 50 }, rivals: [{ speed: 40, ...rival }] });
    return run(race(state, changes), config, 0.3, { input: lane(0) }).state.warp;
  };

  assert.equal(aim({ z: 30, x: 0 }).aim, 1);
  assert.equal(aim({ z: 30, x: RULES.gunAim + 0.1 }).aim, 0);
  assert.equal(aim({ z: RULES.gunRange + 10, x: 0 }).aim, 0);
  assert.equal(aim({ z: 2, x: 0.6 }).aim, 0);
  assert.equal(aim({ z: 30, x: 0 }, { air: 1 }).aim, 0);
  assert.equal(aim({ z: 30, x: 0 }, { spin: 1 }).aim, 0);
  assert.equal(aim({ z: 30, x: 0, air: 1 }).rivals[0].hull, RULES.rivalHull, 'nor on a rival in the air');
});

test('a rocket crate flown over puts a rocket aboard, as many as the craft carries', () => {
  const { config, state } = game({ items: [{ kind: 'crate', z: 10 }, { kind: 'crate', z: 20, x: 0.9 }, { kind: 'crate', z: 30 }, { kind: 'crate', z: 40 }], loadout: { rockets: 2 } });
  const { state: loaded, events } = run(state, config, 1.2, { input: lane(0) });

  assert.deepEqual(named(events, 'ammo').map((event) => [event.kind, event.z]), [['rocket', 10], ['rocket', 30], ['rocket', 40]]);
  assert.equal(loaded.warp.rockets, 2);
});

test('a rocket locks on to a rival roughly in line ahead, launches, homes on it and takes it down with a blast', () => {
  const pilots = [{ ...SLOW, pace: 1 }, { ...SLOW, pace: 1 }, { ...SLOW, pace: 1 }];
  const { config, state } = game({ courses: [layout({ pilots, length: 4000 }), layout({ pilots })], loadout: { rockets: 2 }, rivals: [{ z: 60, x: 0.3, speed: 40 }, { z: 64, x: 0.4, speed: 40 }, { z: 60, x: -0.8, speed: 40 }] });
  const armed = race(state, { rockets: 1 });
  const { state: locking } = run(armed, config, RULES.lockSeconds / 2, { input: lane(0) });

  assert.equal(locking.warp.lockOn, 1);
  assert.ok(locking.warp.lock > 0.4 && locking.warp.lock < 0.6);
  assert.equal(locking.warp.missiles.length, 0);

  const { state: away, events } = run(locking, config, RULES.lockSeconds / 2 + 0.05, { input: lane(0) });
  assert.deepEqual(named(events, 'rocket-launch').map((event) => event.pilot), [0]);
  assert.equal(away.warp.rockets, 0);
  assert.deepEqual([away.warp.lock, away.warp.lockOn], [0, 0]);
  assert.deepEqual(away.warp.missiles.map((missile) => missile.target), [1]);

  const { state: hit, events: blast } = run(away, config, 3, { input: lane(0), until: (_, seen) => named(seen, 'explosion').length > 0 });
  assert.equal(named(blast, 'explosion').length, 1);
  assert.deepEqual(named(blast, 'takedown').map((event) => [event.by, event.pilot]), [['rocket', 0], ['rocket', 1]], 'and whoever is beside it');
  assert.deepEqual(hit.warp.rivals.map((rival) => rival.spin > 0), [true, true, false]);
  assert.equal(hit.warp.missiles.length, 0);
});

test('a lock is lost when its rival leaves the line, and no rocket is spent on a rival one is already on its way to', () => {
  const pilots = [{ ...SLOW, pace: 1 }];
  const { config, state } = game({ courses: [layout({ pilots, length: 4000 }), layout({ pilots })], loadout: { rockets: 2 }, rivals: [{ z: 80, x: 0, speed: 40 }] });
  const half = run(race(state, { rockets: 2 }), config, RULES.lockSeconds / 2, { input: lane(0) }).state;
  const lost = run(half, config, 0.3, { input: lane(0.9) }).state;

  assert.deepEqual([lost.warp.lock, lost.warp.lockOn, lost.warp.rockets], [0, 0, 2]);

  const { state: flying, events } = run(race(state, { rockets: 2 }), config, RULES.lockSeconds * 2, { input: lane(0) });
  assert.equal(named(events, 'rocket-launch').length, 1);
  assert.equal(flying.warp.rockets, 1);
  assert.equal(flying.warp.lock, 0);
});

test('a rocket whose rival has finished flies on and is gone', () => {
  const pilots = [{ ...SLOW, pace: 1 }];
  const { config, state } = game({ courses: [layout({ pilots, length: 4000 }), layout({ pilots })], rivals: [{ z: 80, x: 0, speed: 40, finish: 12 }] });
  const flying = race(state, { missiles: [{ id: 1, z: 20, x: 0, target: 1 }] });
  const { state: gone, events } = run(flying, config, 5, { input: lane(0) });

  assert.equal(named(events, 'explosion').length, 0);
  assert.equal(gone.warp.missiles.length, 0);
  assert.equal(run(flying, config, 0.5, { input: lane(0) }).state.warp.missiles.length, 1, 'not at once');
});

test('a shield takes a crash in the craft\'s place, once for each it has', () => {
  const { config, state } = game({ items: [{ kind: 'mine', z: 10 }, { kind: 'mine', z: 110 }], loadout: { shields: 1 } });
  const shielded = race(state, { flow: 5, shield: 1 });
  const { state: saved, events } = run(shielded, config, 0.4, { input: lane(0) });

  assert.deepEqual(named(events, 'shield-hit').map((event) => event.left), [0]);
  assert.equal(named(events, 'crash').length, 0);
  assert.deepEqual([saved.warp.spin, saved.warp.shield, saved.warp.flow], [0, 0, 5], 'and the flow goes on');
  assert.ok(saved.warp.safe > 0);

  const { events: later } = run(saved, config, 3, { input: lane(0) });
  assert.deepEqual(named(later, 'crash').map((event) => event.kind), ['mine'], 'the next one is a crash');
});

test('a craft\'s loadout sets how fast it flies, how soon its drift charges and how long a crash spins it', () => {
  const flown = (loadout) => {
    const { config, state } = game({ loadout });
    return run(state, config, 3, { input: lane(0) }).state.warp.speed;
  };
  assert.ok(Math.abs(flown({ speed: 1.1 }) - RULES.topSpeed * 1.1) < 0.5);
  assert.ok(Math.abs(flown({ speed: 0.95 }) - RULES.topSpeed * 0.95) < 0.5);

  const drift = (share) => {
    const { config, state } = game({ courses: [layout({ bends: [[600, 1]] }), layout()], x: 0.7, loadout: { drift: share } });
    return run(state, config, 0.5, { input: lane(0.7) }).state.warp.drift;
  };
  assert.ok(drift(0.7) > drift(1) && drift(1) > drift(1.3));

  const spun = (share) => {
    const { config, state } = game({ items: [{ kind: 'mine', z: 5 }], loadout: { spin: share } });
    return run(state, config, 0.2, { input: lane(0) }).state.warp.spin;
  };
  assert.ok(spun(0.7) < spun(1) - 0.2);
});

test('rivals fly through the crates and cells as if they were not there', () => {
  const pilots = [{ ...SLOW, pace: 1, skill: 0 }];
  const { config, state } = game({ courses: [layout({ pilots }), layout({ pilots })], rivals: [{ z: 20, x: 0, speed: 40 }], items: [{ kind: 'crate', z: 30 }, { kind: 'cell', z: 40 }] });
  const { state: flown, events } = run(state, config, 1, { input: lane(-0.9) });

  assert.equal(named(events, 'crash').concat(named(events, 'ammo')).length, 0);
  assert.equal(flown.warp.rivals[0].x, 0, 'nor steer for them or round them');
});

test('the game\'s own courses carry crates and cells, and its own craft is armed', () => {
  WARP_COURSES.forEach((written, index) => {
    const { items } = buildCourse(WARP_CONFIG, index);
    assert.ok(items.some((item) => item.kind === 'crate') && items.some((item) => item.kind === 'cell'), written.name);
  });

  assert.ok(RULES.loadout.damage > 0 && RULES.loadout.rockets > 0 && RULES.loadout.nitroBars >= 1);
  assert.deepEqual([RULES.loadout.speed, RULES.loadout.drift, RULES.loadout.spin], [1, 1, 1], 'the game is tuned for it');
});
