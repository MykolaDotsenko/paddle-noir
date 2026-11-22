import test from 'node:test';
import assert from 'node:assert/strict';

import { GAME_CONFIG, WARP_CONFIG, WARP_LIVES } from '../src/config.js';
import { WARP_COURSES } from '../src/courses.js';
import { advanceGame, createInitialState, GAME_PHASE, getWinner, startGame } from '../src/domain/game.js';
import { buildCourse, FINAL_STRETCH, ITEM_RADIUS, itemX, laneX, onRumble, placeOf, raceState, roll, TRICK_POINTS } from '../src/domain/warp.js';

// The Warp game: the paddle is a racing craft. These tests lay out courses of their own, put
// rings, pads, hazards and rivals where each case needs them, and let the race run.

const RULES = WARP_CONFIG.warp;
const STEP = WARP_CONFIG.fixedStepSeconds;
const REACH = (WARP_CONFIG.width - WARP_CONFIG.paddle.width) / 2;
const IDLE = { horizontalAxis: 0, pointerX: null, opponentAxis: 0, opponentPointerX: null };
/** Steers the craft to a place across the lane. */
const lane = (x) => ({ ...IDLE, pointerX: WARP_CONFIG.width / 2 + x * REACH });

const SLOW = Object.freeze({ name: 'Slow', rgb: '1, 2, 3', craft: 'jet', pace: 0.5, skill: 1 });

/** A course of the test's own: straight, with nothing on it unless the test puts it there. */
function layout(changes = {}) {
  return {
    name: 'Test',
    theme: 'sunset',
    length: 600,
    bends: [[600, 0]],
    every: { rings: 0, pads: 0, mines: 0, debris: 0, cargo: 0 },
    pilots: [SLOW, SLOW, SLOW, SLOW],
    qualify: 1,
    ...changes,
  };
}

/** A race under way, past its start lights, with a course and rivals of the test's own. */
function game({ courses = [layout(), layout({ name: 'Next' })], items = [], rivals = [], supers = false, warp = {}, seed = 7, x = 0 } = {}) {
  const config = { ...WARP_CONFIG, supers: { ...WARP_CONFIG.supers, enabled: supers }, warp: { ...RULES, ...warp, courses } };
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
      course: { ...race.course, items: items.map((item, index) => ({ id: index + 1, x: 0, sway: 0, ...item })) },
      rivals: field,
      place: placeOf({ ...race, rivals: field }),
    },
  };
  return { config, state };
}

/** A rival, on a line it keeps a long while. */
function racer(placed = {}) {
  return { id: 1, pilot: 0, z: 100, x: 0, speed: 0, line: placed.x ?? 0, lineIn: 99, boost: 0, spin: 0, bumped: 0, finish: 0, ...placed };
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
    ['perfect', 2, TRICK_POINTS.perfect * 2],
    ['good', 0, TRICK_POINTS.good],
    ['miss', 0, 0],
  ]);
  assert.equal(flown.warp.points, TRICK_POINTS.perfect * 3 + TRICK_POINTS.good);
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
    assert.ok(course.items.every((item) => Math.abs(item.x) < 0.85));

    for (const kind of /** @type {const} */ (['rings', 'pads', 'mines', 'debris', 'cargo'])) {
      const singular = { rings: 'ring', pads: 'pad', mines: 'mine', debris: 'debris', cargo: 'cargo' }[kind];
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
