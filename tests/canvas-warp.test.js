import test from 'node:test';
import assert from 'node:assert/strict';

import { drawWarp, drawWarpHud, HORIZON, LOOKS, ordinal, viewOf } from '../src/adapters/canvas/warp.js';
import { SUPER_STYLE, THEME } from '../src/adapters/canvas/theme.js';
import { GAME_CONFIG, WARP_CONFIG } from '../src/config.js';
import { WARP_COURSES } from '../src/courses.js';
import { createInitialState, GAME_PHASE } from '../src/domain/game.js';
import { buildCourse, raceState } from '../src/domain/warp.js';
import { callsNamed, createRecordingContext } from './support/fake-canvas.js';

// The Warp game on the canvas: the course in perspective, what is on it, the craft and the
// race's own display.

const config = WARP_CONFIG;
const rules = config.warp;
const glows = { get: (rgb) => ({ glow: rgb }) };
const CRAFT_Y = config.height - config.paddle.inset - config.paddle.height / 2;

/** A race under way on a course, with whatever the test sets. */
function game(changes = {}, rest = {}) {
  const race = changes.race ?? 0;
  const state = { ...createInitialState(config, 1), phase: GAME_PHASE.RUNNING, serveCountdown: 0, player: { x: 250, vx: 0 } };
  return { ...state, ...rest, warp: { ...raceState(config, race), speed: rules.topSpeed, ...changes } };
}

const draw = (painter) => {
  const ctx = createRecordingContext();
  painter(ctx);
  return ctx;
};
const painted = (ctx) => ctx.calls.filter(({ name }) => ['fill', 'stroke', 'fillRect', 'fillText'].includes(name));
const colors = (ctx) => painted(ctx).map(({ brush }) => `${brush.fillStyle} ${brush.strokeStyle}`).join(' ');
const texts = (ctx) => callsNamed(ctx, 'fillText').map((call) => call.args[0]);
const frame = (state, now = 1000, reducedMotion = false) => draw((context) => drawWarp(context, state, config, now, glows, reducedMotion));
const hud = (state, pop = 0) => draw((context) => drawWarpHud(context, state, config, pop));

test('a match has no race, and nothing of Warp is drawn in it', () => {
  const state = createInitialState(GAME_CONFIG, 1);
  const ctx = draw((context) => {
    drawWarp(context, state, GAME_CONFIG, 0, glows);
    drawWarpHud(context, state, GAME_CONFIG, 0);
  });

  assert.equal(ctx.calls.length, 0);
});

test('the craft is where the paddle would be: the lane under it spans the paddle\'s reach, and farther is higher and smaller', () => {
  const race = game().warp;
  const view = viewOf(race, config);
  const here = view.project(race.z, 0);
  const edge = view.project(race.z, 1);
  const far = view.project(race.z + 60, 0);

  assert.deepEqual([here.x, here.y, here.scale], [config.width / 2, CRAFT_Y, 1]);
  assert.equal(edge.x, config.width - config.paddle.width / 2, 'the lane\'s edge is as far as the paddle goes');
  assert.ok(far.y < here.y && far.y > HORIZON && far.scale < 0.2);
  assert.equal(view.project(race.z - 7.5, 0), null, 'nothing behind the eye');
});

test('the lane bends away the way the course turns, and runs straight out from under the craft', () => {
  // The first course turns right after its opening straight.
  const course = buildCourse(config, 0);
  const into = course.curves.findIndex((bend) => bend > 0) * rules.segment;
  const view = viewOf(game({ z: into - 20 }).warp, config);
  const ahead = view.project(into + 100, 0);
  const near = view.project(into - 20 + 1, 0);

  assert.ok(ahead.x > config.width / 2 + 20, 'a right-hand bend runs off to the right');
  assert.ok(Math.abs(near.x - config.width / 2) < 2, 'with the lane straight under the craft');

  const left = WARP_COURSES[0].bends.findIndex(([, bend]) => bend < 0);
  const start = WARP_COURSES[0].bends.slice(0, left).reduce((sum, [meters]) => sum + meters, 0);
  const turning = viewOf(game({ z: start + 20 }).warp, config);
  assert.ok(turning.project(start + 140, 0).x < config.width / 2 - 20, 'and a left-hand bend to the left');
});

test('every course paints a frame of its own, with nothing in the pure white kept for the ball', () => {
  WARP_COURSES.forEach((course, index) => {
    const look = LOOKS[course.theme];
    const ctx = frame(game({ race: index, z: 300, rivals: raceState(config, index).rivals.map((rival, at) => ({ ...rival, z: 304 + at * 6, x: -0.6 + at * 0.3 })) }));
    const gradients = callsNamed(ctx, 'createLinearGradient');

    assert.ok(look, course.name);
    assert.ok(painted(ctx).length > 200, `${course.name} is drawn`);
    assert.ok(gradients.length >= 2, `${course.name}: a sky and the ground`);
    assert.doesNotMatch(colors(ctx), /255, ?255, ?255|#fff\b|#ffffff/i, course.name);
    assert.ok(texts(ctx).includes(course.pilots[0].name.toUpperCase()), `${course.name}: the rival just ahead is named`);
  });
});

test('everything on the course is drawn where it is: rings, pads, mines, debris and cargo', () => {
  const items = [
    { id: 1, kind: 'ring', z: 310, x: 0, sway: 0 },
    { id: 2, kind: 'pad', z: 320, x: 0.3, sway: 0 },
    { id: 3, kind: 'mine', z: 330, x: -0.3, sway: 0 },
    { id: 4, kind: 'debris', z: 340, x: 0.2, sway: 0.3 },
    { id: 5, kind: 'cargo', z: 350, x: 0, sway: 0 },
  ];
  const state = game({ z: 300, course: { ...buildCourse(config, 0), items } });
  const ctx = frame(state);
  const arcs = callsNamed(ctx, 'arc');
  const ring = viewOf(state.warp, config).project(310, 0);

  assert.ok(arcs.some((call) => Math.abs(call.args[0] - ring.x) < 0.01 && call.args[2] > 20), 'the ring stands round its place');
  assert.ok(painted(ctx).some(({ brush }) => String(brush.strokeStyle).includes(THEME.amber)), 'the pad\'s chevrons and the cargo\'s stripes');
  assert.ok(painted(ctx).some(({ brush }) => String(brush.fillStyle).includes(THEME.red)), 'the mine\'s light');
  assert.ok(callsNamed(ctx, 'drawImage').some((call) => call.args[0].glow === THEME.red), 'and its glow');
});

test('the finish line is checkered across the lane, under a gantry with its banner', () => {
  const near = frame(game({ z: buildCourse(config, 0).length - 30 }));
  const far = frame(game({ z: 300 }));

  assert.ok(texts(near).includes('FINISH'));
  assert.ok(!texts(far).includes('FINISH'));
  assert.ok(painted(near).filter(({ brush }) => brush.fillStyle === 'rgba(226, 232, 240, 0.85)').length >= 6, 'checkers on the lane');
});

test('the player\'s craft wears a paddle\'s core where a paddle\'s core would be, and leans as it steers', () => {
  const still = frame(game({ z: 300 }));
  const core = callsNamed(still, 'fill').filter(({ brush }) => brush.fillStyle === THEME.side.player.core);

  assert.equal(core.length, 1);
  const turns = (vx) => callsNamed(frame(game({ z: 300 }, { player: { x: 250, vx } })), 'rotate').at(-1).args[0];
  assert.ok(turns(900) > 0 && turns(-900) < 0 && turns(0) === 0);
  assert.ok(turns(9000) <= 0.38, 'but only so far');
});

test('the craft shows what it is doing: an afterburner, a phantom, a slipstream, a spin and a moment to recover', () => {
  const look = (changes) => frame(game({ z: 300, ...changes }));
  const alphaOfCore = (ctx) => callsNamed(ctx, 'fill').find(({ brush }) => brush.fillStyle === THEME.side.player.core).brush.globalAlpha;

  assert.ok(callsNamed(look({ burn: 2 }), 'drawImage').some((call) => call.args[0].glow === SUPER_STYLE.fireball.rgb));
  assert.equal(alphaOfCore(look({ ghost: 2 })), 0.5);
  assert.ok(painted(look({ ghost: 2 })).some(({ brush }) => String(brush.strokeStyle).includes(SUPER_STYLE.phantom.rgb)));
  assert.ok(callsNamed(look({ slip: 0.5 }), 'stroke').length > callsNamed(look({}), 'stroke').length, 'the air streams past');
  assert.ok(Math.abs(callsNamed(look({ spin: 0.5 }), 'rotate').at(-1).args[0]) > 1, 'it spins');
  assert.ok(alphaOfCore(look({ safe: 1 })) < 1, 'and flickers a little while it recovers');
});

test('on the rumble strips the craft judders', () => {
  const coreY = (x) => callsNamed(frame(game({ z: 300 }, { player: { x, vx: 0 } }), 1010), 'translate').filter((call) => call.args[0] === x).at(-1).args[1];

  assert.equal(coreY(250), CRAFT_Y);
  assert.notEqual(coreY(config.width - config.paddle.width / 2), CRAFT_Y);
});

test('lines streak past while the craft is boosting, but not with reduced motion', () => {
  const streaks = (speed, reduced = false) => painted(frame(game({ z: 300, speed }), 1000, reduced)).filter(({ brush }) => String(brush.strokeStyle).startsWith('rgba(165, 243, 252')).length;

  assert.equal(streaks(rules.topSpeed), 0);
  assert.ok(streaks(rules.boostSpeed) >= 20);
  assert.equal(streaks(rules.boostSpeed, true), 0);
});

test('rivals far, near and behind: named only near ahead, faded behind, spinning when hit', () => {
  const field = (rival) => frame(game({ z: 300, rivals: [{ ...raceState(config, 0).rivals[0], ...rival }] }));
  const named = (rival) => texts(field(rival)).includes('ROMA');

  assert.equal(named({ z: 320 }), true);
  assert.equal(named({ z: 300 + 60 }), false, 'too far to read');
  assert.equal(named({ z: 300 }), false, 'alongside the craft');
  assert.equal(named({ z: 330, finish: 40 }), false, 'past the line');
  assert.ok(Math.abs(callsNamed(field({ z: 320, spin: 0.6 }), 'rotate')[0].args[0]) > 1);
});

test('over the race: the place out of the field, how well to place, the speed and how far along everyone is', () => {
  const ctx = hud(game({ z: 500, place: 3, speed: 42 }));
  const said = texts(ctx);

  assert.ok(said.includes('P3') && said.includes('/6'));
  assert.ok(said.includes('TOP 3 GO THROUGH'));
  assert.ok(said.includes(String(Math.round(42 * 16))) && said.includes('KM/H'));
  assert.ok(said.includes(`RACE 1/5 · ${WARP_COURSES[0].name.toUpperCase()}`));
  assert.equal(callsNamed(ctx, 'arc').length, 5, 'a dot for each rival');

  const first = texts(hud(game({ race: 4, place: 1 })));
  assert.ok(first.includes('WIN TO GO THROUGH'));
});

test('the place is amber in front, the player\'s color in a place that goes through, and rose out of one', () => {
  const placeColor = (place) => callsNamed(hud(game({ place })), 'fillText').find((call) => call.args[0] === `P${place}`).brush.fillStyle;

  assert.equal(placeColor(1), `rgb(${THEME.amber})`);
  assert.equal(placeColor(3), `rgb(${THEME.side.player.rgb})`);
  assert.equal(placeColor(4), `rgb(${THEME.rose})`);
});

test('before a race the course is named and the start lights come on one a second', () => {
  const lit = (serveCountdown) => {
    const ctx = hud(game({}, { serveCountdown, serveNumber: 0 }));
    return { said: texts(ctx), on: callsNamed(ctx, 'fill').filter(({ brush }) => brush.fillStyle === `rgb(${THEME.red})`).length };
  };

  assert.ok(lit(2.9).said.includes(WARP_COURSES[0].name.toUpperCase()));
  assert.ok(lit(2.9).said.includes('FINISH IN THE TOP 3 TO GO THROUGH'));
  assert.deepEqual([lit(2.9).on, lit(1.9).on, lit(0.5).on], [1, 2, 3]);
  assert.equal(lit(0).said.includes(WARP_COURSES[0].name.toUpperCase()), false, 'gone once they go green');
  assert.ok(texts(hud(game({ race: 4 }, { serveCountdown: 2, serveNumber: 0 }))).includes('WIN IT TO TAKE THE CUP'));
});

test('after the line, the place and what it earned, and whether the player goes through', () => {
  const after = (changes) => texts(hud(game({ finished: true, calm: 2, ...changes })));

  assert.deepEqual(after({ place: 1 }).slice(-3), ['1ST', `+${rules.placePoints[0]} POINTS`, `THROUGH · NEXT: ${WARP_COURSES[1].name.toUpperCase()}`]);
  assert.deepEqual(after({ place: 5, retry: true }).slice(-3), ['5TH', `+${rules.placePoints[4]} POINTS`, 'NOT THROUGH · ONE MORE GO']);
  assert.equal(after({ race: 4, place: 1 }).at(-1), 'CUP WON!');
  assert.deepEqual([ordinal(1), ordinal(2), ordinal(3), ordinal(4), ordinal(6)], ['1ST', '2ND', '3RD', '4TH', '6TH']);
});

test('the frame is the same every time for the same moment: nothing flickers', () => {
  const state = game({ z: 800, time: 20 });

  assert.equal(JSON.stringify(frame(state, 5000).calls), JSON.stringify(frame(state, 5000).calls));
});
