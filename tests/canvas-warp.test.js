import test from 'node:test';
import assert from 'node:assert/strict';

import { drawWarp, stretchOf, trailsOf, viewOf } from '../src/adapters/canvas/warp.js';
import { drawWarpHud, ordinal, standings } from '../src/adapters/canvas/warp-hud.js';
import { fogLevel, hash, HORIZON, LOOKS, PAD, paletteOf } from '../src/adapters/canvas/warp-scenery.js';
import { LIGHT_FLOOR, LIGHT_SWAY, lightShift } from '../src/adapters/canvas/warp-lighting.js';
import { SUPER_STYLE, THEME } from '../src/adapters/canvas/theme.js';
import { GAME_CONFIG, WARP_CONFIG } from '../src/config.js';
import { WARP_COURSES } from '../src/courses.js';
import { createInitialState, GAME_PHASE } from '../src/domain/game.js';
import { buildCourse, heightAt, raceState } from '../src/domain/warp.js';
import { callsNamed, createRecordingContext, fakeGlows } from './support/fake-canvas.js';
import { brushColors, tinted } from './support/paint.js';

// The Warp game on the canvas: the course in perspective, over its hills, what is on it and
// round it, the craft, and the race's own display.

const config = WARP_CONFIG;
const rules = config.warp;
const glows = fakeGlows;
const CRAFT_Y = config.height - config.paddle.inset - config.paddle.height / 2;
const REACH = (config.width - config.paddle.width) / 2;

/** A race under way on a course, with whatever the test sets. */
function game(changes = {}, rest = {}) {
  const race = changes.race ?? 0;
  const state = { ...createInitialState(config, 1), phase: GAME_PHASE.RUNNING, serveCountdown: 0, player: { x: 250, vx: 0 } };
  return { ...state, ...rest, warp: { ...raceState(config, race), speed: rules.topSpeed, launched: true, ...changes } };
}

/** The first course, flat, with only what the test puts on it. */
const flat = (items = []) => ({ ...buildCourse(config, 0), hills: [], items: items.map((item, index) => ({ id: index + 1, x: 0, sway: 0, air: false, ...item })) });

const draw = (painter) => {
  const ctx = createRecordingContext();
  painter(ctx);
  return ctx;
};
const painted = (ctx) => ctx.calls.filter(({ name }) => ['fill', 'stroke', 'fillRect', 'strokeRect', 'fillText'].includes(name));
const colors = (ctx) => painted(ctx).map(({ brush }) => `${brush.fillStyle} ${brush.strokeStyle}`).join(' ');
const texts = (ctx) => callsNamed(ctx, 'fillText').map((call) => call.args[0]);
const frame = (state, now = 1000, reducedMotion = false) => draw((context) => drawWarp(context, state, config, now, glows, reducedMotion));
const hud = (state, pop = 0) => draw((context) => drawWarpHud(context, state, config, pop));
const stroked = (ctx, rgb) => painted(ctx).filter(({ name, brush }) => name === 'stroke' && String(brush.strokeStyle).includes(rgb)).length;
const filled = (ctx, rgb) => painted(ctx).filter(({ name, brush }) => name !== 'stroke' && String(brush.fillStyle).includes(rgb)).length;

test('a match has no race, and nothing of Warp is drawn in it', () => {
  const state = createInitialState(GAME_CONFIG, 1);
  const ctx = draw((context) => {
    drawWarp(context, state, GAME_CONFIG, 0, glows);
    drawWarpHud(context, state, GAME_CONFIG, 0);
  });

  assert.equal(ctx.calls.length, 0);
});

test('the craft is where the paddle would be: the lane under it spans the paddle\'s reach, and farther is higher and smaller', () => {
  const race = game({ course: flat() }).warp;
  const view = viewOf(race, config);
  const here = view.project(race.z, 0);
  const edge = view.project(race.z, 1);
  const far = view.project(race.z + 60, 0);

  assert.deepEqual([here.x, here.y, here.scale], [config.width / 2, CRAFT_Y, 1]);
  assert.equal(edge.x, config.width - config.paddle.width / 2, 'the lane\'s edge is as far as the paddle goes');
  assert.ok(far.y < here.y && far.y > HORIZON && far.scale < 0.2);
  assert.equal(view.project(race.z - 7.5, 0), null, 'nothing behind the eye');
  assert.ok(Math.abs(view.project(race.z, 0, 0.5).y - (CRAFT_Y - 0.5 * REACH)) < 1e-9, 'and what is lifted stands that much higher');
  assert.deepEqual([view.craftY, view.reach, view.segment], [CRAFT_Y, REACH, rules.segment]);
});

test('the lane bends away the way the course turns, and runs straight out from under the craft', () => {
  // The first course turns right after its opening straight.
  const course = flat();
  const into = course.curves.findIndex((bend) => bend > 0) * rules.segment;
  const view = viewOf(game({ z: into - 20, course }).warp, config);

  assert.ok(view.project(into + 100, 0).x > config.width / 2 + 20, 'a right-hand bend runs off to the right');
  assert.ok(Math.abs(view.project(into - 19, 0).x - config.width / 2) < 2, 'with the lane straight under the craft');

  const left = WARP_COURSES[0].bends.findIndex(([, bend]) => bend < 0);
  const start = WARP_COURSES[0].bends.slice(0, left).reduce((sum, [meters]) => sum + meters, 0);
  assert.ok(viewOf(game({ z: start + 20, course }).warp, config).project(start + 140, 0).x < config.width / 2 - 20, 'and a left-hand bend to the left');
});

test('the lane rolls over the course\'s hills: a rise ahead stands higher on the board, a dip lower, and the craft stays put', () => {
  const course = buildCourse(config, 2);
  const climbs = (z) => heightAt(course, z + 60) - heightAt(course, z);
  const up = Array.from({ length: 2000 }, (_, z) => z + 200).find((z) => climbs(z) > 0.8);
  const down = Array.from({ length: 2000 }, (_, z) => z + 200).find((z) => climbs(z) < -0.8);
  const ahead = (z, hills) => viewOf(game({ race: 2, z, course: hills ? course : { ...course, hills: [] } }).warp, config).project(z + 60, 0).y;

  assert.ok(ahead(up, true) < ahead(up, false) - 15);
  assert.ok(ahead(down, true) > ahead(down, false) + 15);
  assert.equal(viewOf(game({ race: 2, z: up, course }).warp, config).project(up, 0).y, CRAFT_Y);
});

test('a stretch over a crest, facing away, is not painted', () => {
  const steep = { ...flat(), hills: [[7, 240, 0]] };
  const surface = (course, z) => painted(frame(game({ z, course }), 1000, true)).filter(({ name, brush }) => name === 'fill' && paletteOf(LOOKS.sunset).lane.some((band) => band.includes(brush.fillStyle))).length;

  // Just short of a crest: the far side of it is out of sight.
  assert.ok(surface(steep, 400) < surface(flat(), 400) - 5);
});

test('the camera leans into a bend, about the craft, and not at all with motion reduced', () => {
  const course = flat();
  const right = course.curves.findIndex((bend) => bend > 0) * rules.segment + 30;
  const left = course.curves.findIndex((bend) => bend < 0) * rules.segment + 30;
  const lean = (z) => viewOf(game({ z, course }).warp, config).lean;

  assert.ok(lean(right) < 0 && lean(left) > 0);
  assert.equal(lean(60), 0, 'level on a straight');
  assert.ok(Math.abs(lean(right)) <= 0.045 && Math.abs(lean(left)) <= 0.045);

  const state = game({ z: right, course }, { player: { x: 300, vx: 0 } });
  const leaning = frame(state);
  assert.deepEqual(callsNamed(leaning, 'translate')[0].args, [300, CRAFT_Y]);
  assert.equal(callsNamed(leaning, 'rotate')[0].args[0], lean(right));
  assert.equal(callsNamed(frame(state, 1000, true), 'rotate').length, callsNamed(leaning, 'rotate').length - 1);
  assert.equal(callsNamed(frame(game({ z: 60, course })), 'rotate').length, callsNamed(frame(game({ z: 60, course }), 1000, true), 'rotate').length, 'nor on a straight');
});

test('every course paints a frame of its own, with nothing in the pure white kept for the ball', () => {
  WARP_COURSES.forEach((course, index) => {
    const look = LOOKS[course.theme];
    const ctx = frame(game({ race: index, z: 300, rivals: raceState(config, index).rivals.map((rival, at) => ({ ...rival, z: 304 + at * 6, x: -0.6 + at * 0.3 })) }));
    const strips = callsNamed(ctx, 'fillRect').filter((call) => call.args[0] === -PAD && call.args[2] === config.width + PAD * 2).length;

    assert.ok(look, course.name);
    assert.ok(painted(ctx).length > 300, `${course.name} is drawn`);
    assert.ok(callsNamed(ctx, 'createLinearGradient').length >= 3, `${course.name}: a sky, what is under it and the haze`);
    assert.doesNotMatch(colors(ctx), /255, ?255, ?255|#fff\b|#ffffff/i, course.name);
    assert.ok(texts(ctx).includes(course.pilots[0].name.toUpperCase()), `${course.name}: the rival just ahead is named`);
    // The sky, what is under it and the haze are painted past the board's edges; so is the ground, a strip a stretch.
    assert.equal(strips > 3, look.ground !== null, `${course.name}: ground under the lane, or none`);
    assert.equal(stroked(ctx, look.edge) > 50, true, `${course.name}: the lane's edges, a piece a stretch`);
  });
});

test('the sky, the top of the ground and the course\'s light are painted once, and slid with the light as the lane turns', () => {
  const sky = (state) => callsNamed(frame(state), 'drawImage').find((call) => call.args[0].layer === 'warp-sky');
  const straight = sky(game({ z: 60, course: flat() }));
  const layer = straight.args[0];

  assert.equal(layer.key, `${LOOKS.sunset.skyline} ${config.width} ${config.height}`, 'kept for the course and the board');
  assert.deepEqual([layer.width, layer.height], [config.width + (PAD + LIGHT_SWAY) * 2, LIGHT_FLOOR + PAD]);
  assert.deepEqual(straight.args.slice(1), [-PAD - LIGHT_SWAY, -PAD], 'on a straight the light sits where it belongs');
  const held = (name) => layer.calls.filter((call) => call.name === name).length;
  assert.equal(held('createRadialGradient'), 1, 'the light');
  assert.equal(held('createLinearGradient'), 2, 'the sky, and the ground just under the horizon');

  WARP_COURSES.forEach((course, index) => {
    const turning = game({ race: index, z: 300 });
    const { heading } = viewOf(turning.warp, config);
    const look = LOOKS[course.theme];
    assert.equal(sky(turning).args[1], -PAD - LIGHT_SWAY + lightShift(look, heading), course.name);
    assert.ok(Math.abs(lightShift(look, heading)) < LIGHT_SWAY, `${course.name}: the light never runs out of sky`);
  });
});

test('each rival near ahead leaves its slipstream on the lane, lit up while the player sits in it', () => {
  const pilots = WARP_COURSES[0].pilots;
  const racers = raceState(config, 0).rivals.map((rival, at) => ({ ...rival, z: [306, 330, 290, 500, 320][at], x: [0, 0.6, 0, 0, -0.5][at] }));
  const state = game({ z: 300, rivals: [...racers.slice(0, 4), { ...racers[4], spin: 0.4 }], slip: 0.5 });
  const trails = trailsOf(state, config);

  assert.deepEqual(trails.map((trail) => trail.rgb), [pilots[racers[0].pilot].rgb, pilots[racers[1].pilot].rgb], 'behind, too far ahead and spun out leave none');
  assert.deepEqual([trails[0].from, trails[0].to], [306 - rules.draft, 305], 'as long as the slipstream');
  assert.equal(trails[0].lit, 0.4 + 0.6 * 0.5, 'right behind it, charging');
  assert.equal(trails[1].lit, 0, 'off to the side');
  assert.equal(trailsOf(game({ z: 300, rivals: racers, air: 0.3 }), config)[0].lit, 0, 'and none in the air');

  const color = (rgb) => painted(frame(state)).filter(({ brush }) => String(brush.fillStyle).startsWith(`rgba(${rgb}, `)).length;
  const plain = painted(frame(game({ z: 300, rivals: racers.map((rival) => ({ ...rival, z: 900 })) })));
  assert.ok(color(trails[0].rgb) > 2, 'painted a stretch at a time, on the lane');
  assert.ok(!plain.some(({ brush }) => String(brush.fillStyle).startsWith(`rgba(${pilots[racers[1].pilot].rgb}, 0.2`)), 'no trail where no rival is');
});

test('at speed the view stretches out ahead of the craft, never at the craft, and never with motion reduced', () => {
  const cruising = game({ z: 300, speed: rules.topSpeed });
  const flooring = game({ z: 300, speed: rules.nitroSpeed });

  assert.equal(stretchOf(cruising.warp, rules, false), 1);
  assert.ok(Math.abs(stretchOf(flooring.warp, rules, false) - 1.2) < 1e-9);
  assert.equal(stretchOf(flooring.warp, rules, true), 1);
  assert.equal(stretchOf(game({ z: 300, speed: rules.nitroSpeed * 2 }).warp, rules, false), stretchOf(flooring.warp, rules, false), 'and no further');

  const calm = viewOf(cruising.warp, config);
  const fast = viewOf(flooring.warp, config);
  const craftRow = (view) => view.project(view.eye + 7, 0.5);
  assert.deepEqual(craftRow(fast), craftRow(calm), 'the craft and the lane under it stay put');
  assert.ok(fast.project(360, 0).y < calm.project(360, 0).y, 'far things look farther');
  assert.ok(fast.project(360, 0).scale < calm.project(360, 0).scale);
  assert.deepEqual(viewOf(flooring.warp, config, true).project(360, 0), calm.project(360, 0));
});

test('each look\'s colors are mixed once, and fade with the distance in a few steps', () => {
  const palette = paletteOf(LOOKS.sunset);

  assert.equal(paletteOf(LOOKS.sunset), palette);
  assert.equal(palette.lane.length, 2);
  assert.equal(palette.lane[0].length, 8);
  assert.equal(new Set(palette.lane[0]).size, 8);
  assert.equal(paletteOf(LOOKS.clouds).ground, null);
  assert.equal(paletteOf(LOOKS.clouds).grid, '');
  assert.deepEqual([fogLevel(0), fogLevel(30), fogLevel(96), fogLevel(999)], [0, 0, 3, 7]);
  assert.equal(hash(4, 9), hash(4, 9));
  assert.ok(hash(4, 9) >= 0 && hash(4, 9) < 1 && hash(4, 9) !== hash(9, 4));
});

test('the lane is a slab where it hangs in the air, and lies on a gridded ground where there is one', () => {
  const skirts = (race) => filled(frame(game({ race, z: 300 }), 1000, true), paletteOf(LOOKS[WARP_COURSES[race].theme]).skirt.slice(4, -1));
  const grid = (race) => stroked(frame(game({ race, z: 300 }), 1000, true), `${LOOKS[WARP_COURSES[race].theme].grid}, 0.2`);

  assert.ok(skirts(2) > 60);
  assert.equal(skirts(0), 0);
  assert.ok(grid(0) > 30);
});

test('everything on the course is drawn where it is: rings, pads, ramps, gates, mines, debris and cargo', () => {
  const only = (item) => frame(game({ z: 300, course: flat([{ z: 320, ...item }]), rivals: [] }), 1000, true);
  const bare = only({ kind: 'ring', z: 9000 });
  const spot = viewOf(game({ z: 300, course: flat() }).warp, config).project(320, 0.3);
  const more = (ctx, name) => callsNamed(ctx, name).length - callsNamed(bare, name).length;

  const ring = only({ kind: 'ring', x: 0.3 });
  assert.ok(callsNamed(ring, 'arc').some((call) => Math.abs(call.args[0] - spot.x) < 0.01 && call.args[2] > 12), 'the ring stands round its place');
  assert.equal(more(ring, 'ellipse'), 1, 'with its light on the lane under it');

  const hanging = only({ kind: 'ring', x: 0.3, air: true });
  assert.equal(more(hanging, 'ellipse'), 0, 'a ring in the air throws none');
  assert.ok(stroked(hanging, THEME.side.player.rgb) > stroked(ring, THEME.side.player.rgb), 'and is the player\'s own color');
  const height = (ctx) => Math.min(...callsNamed(ctx, 'arc').filter((call) => Math.abs(call.args[0] - spot.x) < 0.01 && call.args[2] > 12).map((call) => call.args[1]));
  assert.ok(height(hanging) < height(ring) - 10, 'higher than one on the lane');

  assert.ok(stroked(only({ kind: 'pad' }), THEME.amber) >= 3, 'chevrons up a pad');
  assert.ok(stroked(only({ kind: 'ramp' }), THEME.side.player.rgb) > stroked(bare, THEME.side.player.rgb) + 2, 'a ramp\'s face and its arrows');
  assert.ok(filled(only({ kind: 'mine' }), THEME.red) > 0 && callsNamed(only({ kind: 'mine' }), 'drawImage').some((call) => call.args[0].glow === THEME.red));
  assert.ok(stroked(only({ kind: 'debris' }), '165, 180, 252') > 0);
  assert.equal(more(only({ kind: 'cargo' }), 'clip'), 1, 'the hauler\'s hazard stripes');

  const gate = only({ kind: 'gate', x: 0.3 });
  assert.equal(more(gate, 'strokeRect'), 2, 'a barrier either side of the gap');
  assert.ok(stroked(gate, THEME.lime) > 0 && filled(gate, THEME.lime) > 0, 'its posts and the arrow over it');
  assert.equal(more(only({ kind: 'gate', x: -0.75 }), 'strokeRect'), 1, 'a gap at the lane\'s edge leaves one barrier');
});

test('mines a rival has dropped are drawn on the lane like any other', () => {
  const dropped = frame(game({ z: 300, course: flat(), drops: [{ id: 9000, kind: 'mine', z: 330, x: 0.2, sway: 0, air: false }] }), 1000, true);

  assert.ok(callsNamed(dropped, 'drawImage').some((call) => call.args[0].glow === THEME.red));
});

test('the finish line is checkered across the lane, under a gantry with its banner', () => {
  const near = frame(game({ z: buildCourse(config, 0).length - 30 }));
  const far = frame(game({ z: 300 }));

  assert.ok(texts(near).includes('FINISH'));
  assert.ok(!texts(far).includes('FINISH'));
  assert.ok(painted(near).filter(({ name, brush }) => name === 'fill' && brush.fillStyle === 'rgba(226, 232, 240, 0.85)').length >= 6, 'checkers on the lane');
});

const hullAt = (ctx, x) => callsNamed(ctx, 'translate').filter((call) => call.args[0] === x).at(-1).args[1];

test('the player\'s craft wears a paddle\'s core where a paddle\'s core would be, and leans as it steers', () => {
  const still = frame(game({ z: 60, course: flat() }));
  const core = callsNamed(still, 'fill').filter(({ brush }) => brush.fillStyle === THEME.side.player.core);

  assert.equal(core.length, 1);
  assert.equal(hullAt(still, 250), CRAFT_Y);
  const turns = (vx) => callsNamed(frame(game({ z: 60, course: flat() }, { player: { x: 250, vx } })), 'rotate').at(-1).args[0];
  assert.ok(turns(900) > 0 && turns(-900) < 0 && turns(0) === 0);
  assert.ok(turns(9000) <= 0.38, 'but only so far');
});

test('off a ramp the craft rises and comes down again, its shadow left on the lane', () => {
  const at = (air) => hullAt(frame(game({ z: 60, course: flat(), air })), 250);

  assert.ok(Math.abs(at(rules.airSeconds / 2) - (CRAFT_Y - 0.42 * REACH)) < 0.01, 'highest halfway');
  assert.ok(at(rules.airSeconds * 0.9) > at(rules.airSeconds / 2) && at(rules.airSeconds * 0.1) > at(rules.airSeconds / 2));
  // A soft shadow: dark in the middle, gone at its edge.
  const shadows = (air) => callsNamed(frame(game({ z: 60, course: flat(), rivals: [], air })), 'createRadialGradient').filter((call) => call.args[1] > CRAFT_Y && call.args[5] > 0 && call.args[2] === 0 && call.args[0] !== 250);
  assert.equal(shadows(rules.airSeconds / 2).length, 1);
  assert.ok(shadows(rules.airSeconds / 2)[0].args[5] < shadows(0)[0].args[5], 'smaller the higher the craft');
});

test('the craft shows what it is doing: an afterburner, a phantom, a slipstream, a drift, a spin and a moment to recover', () => {
  const look = (changes, now = 1000) => frame(game({ z: 60, course: flat(), rivals: [], ...changes }), now);
  const alphaOfCore = (ctx) => callsNamed(ctx, 'fill').find(({ brush }) => brush.fillStyle === THEME.side.player.core).brush.globalAlpha;

  assert.ok(callsNamed(look({ burn: 2 }), 'drawImage').some((call) => call.args[0].glow === SUPER_STYLE.fireball.rgb));
  assert.equal(alphaOfCore(look({ ghost: 2 })), 0.5);
  assert.ok(stroked(look({ ghost: 2 }), SUPER_STYLE.phantom.rgb) > 0);
  assert.ok(callsNamed(look({ slip: 0.5 }), 'stroke').length > callsNamed(look({}), 'stroke').length, 'the air streams past');
  assert.ok(Math.abs(callsNamed(look({ spin: 0.5 }), 'rotate').at(-1).args[0]) > 1, 'it spins');
  assert.ok(alphaOfCore(look({ safe: 1 })) < 1, 'and flickers a little while it recovers');

  // Sparks and a gauge while a drift charges, in the craft's color; amber once it is charged.
  assert.equal(stroked(look({ drift: 0.5 }), `${THEME.side.player.rgb}, 0.9)`), 1);
  assert.equal(stroked(look({ drift: 1 }), `${THEME.amber}, 0.9)`), 1);
  assert.equal(stroked(look({}), `${THEME.amber}, 0.9)`), 0);
  assert.notEqual(JSON.stringify(look({ drift: 0.5 }, 1000).calls), JSON.stringify(look({ drift: 0.5 }, 1200).calls), 'the sparks flicker');
});

test('on the rumble strips the craft judders, on the ground only', () => {
  const edge = config.width - config.paddle.width / 2;
  const at = (x, changes = {}, reduced = false) => hullAt(frame(game({ z: 60, course: flat(), ...changes }, { player: { x, vx: 0 } }), 1010, reduced), x);

  assert.equal(at(250), CRAFT_Y);
  assert.notEqual(at(edge), CRAFT_Y);
  assert.equal(at(edge, {}, true), CRAFT_Y, 'not with motion reduced');
});

test('a boost streaks lines out from where the lane runs out of sight and closes the edges in, but not with motion reduced', () => {
  const rush = (speed, reduced = false) => frame(game({ z: 300, speed }), 1000, reduced);
  const streaks = (ctx) => painted(ctx).filter(({ brush }) => String(brush.strokeStyle).startsWith('rgba(165, 243, 252')).length;

  assert.equal(streaks(rush(rules.topSpeed)), 0);
  assert.ok(streaks(rush(rules.boostSpeed)) >= 20);
  assert.equal(streaks(rush(rules.boostSpeed, true)), 0);
  // The edges close in: one more shading than the lights the craft throw on the lane.
  assert.equal(callsNamed(rush(rules.boostSpeed), 'createRadialGradient').length, callsNamed(rush(rules.topSpeed), 'createRadialGradient').length + 1);
});

test('dust streams past the craft as it flies, and stays put with motion reduced', () => {
  const dust = (z, reduced = false) => painted(frame(game({ z, course: flat(), rivals: [] }), 1000, reduced)).filter(({ name, brush }) => name === 'stroke' && String(brush.strokeStyle).includes(LOOKS.sunset.dust));
  const lines = (z) => JSON.stringify(frame(game({ z, course: flat(), rivals: [] })).calls.filter(({ name }) => name === 'lineTo'));

  assert.ok(dust(300).length > 20);
  assert.equal(dust(300, true).length, 0);
  assert.equal(lines(300), lines(300), 'the same moment is the same picture');
  assert.notEqual(lines(300), lines(305));
});

test('every course has things of its own beside the lane', () => {
  const beside = (race, z = 400) => frame(game({ race, z, rivals: [] }));

  assert.ok(texts(beside(0, 456)).some((text) => ['▶', '♪', '★', '◆', '∞'].includes(text)), 'signs along the skyway');
  assert.ok(callsNamed(beside(0), 'quadraticCurveTo').length > 20, 'and palms');
  assert.ok(stroked(beside(1), `${LOOKS.canyon.skylineRgb}, 0.75`) > 10, 'the canyon\'s walls');
  assert.ok(callsNamed(beside(2), 'ellipse').length > 30, 'clouds round the skyway');
  assert.ok(stroked(beside(3), `${LOOKS.orbit.edge}, 0.9`) >= 2, 'the ribs of the station');
  assert.ok(stroked(beside(4), `${LOOKS.tunnel.stripe}, 0.28`) > 5, 'the beams of the tunnel');
});

test('the tunnel\'s light runs down it, and holds still with motion reduced', () => {
  const bright = (now, reduced = false) => JSON.stringify(painted(frame(game({ race: 4, z: 400, rivals: [] }), now, reduced)).map(({ brush }) => brush.strokeStyle));

  assert.notEqual(bright(1000), bright(1090));
  assert.equal(bright(1000, true), bright(1090, true));
});

test('rivals far, near and behind: named only near ahead, spinning when hit, higher off a ramp', () => {
  const field = (rival) => frame(game({ z: 300, course: flat(), rivals: [{ ...raceState(config, 0).rivals[0], x: 0.5, line: 0.5, ...rival }] }), 1000, true);
  const named = (rival) => texts(field(rival)).includes('ROMA');
  const spot = (z) => viewOf(game({ z: 300, course: flat() }).warp, config).project(z, 0.5);

  assert.equal(named({ z: 320 }), true);
  assert.equal(named({ z: 300 + 60 }), false, 'too far to read');
  assert.equal(named({ z: 300 }), false, 'alongside the craft');
  assert.equal(named({ z: 330, finish: 40 }), false, 'past the line');
  assert.ok(Math.abs(callsNamed(field({ z: 320, spin: 0.6 }), 'rotate')[0].args[0]) > 1);
  assert.equal(hullAt(field({ z: 320 }), spot(320).x), spot(320).y);
  assert.ok(hullAt(field({ z: 320, air: rules.airSeconds / 2 }), spot(320).x) < spot(320).y - 5);
});

test('every kind of craft is drawn, each in its pilot\'s color', () => {
  WARP_COURSES.forEach((course, index) => {
    const ctx = frame(game({ race: index, z: 300, rivals: raceState(config, index).rivals.map((rival, at) => ({ ...rival, z: 306 + at * 5, x: -0.7 + at * 0.35 })) }), 1000, true);

    for (const pilot of course.pilots) {
      assert.ok(tinted(ctx, pilot.rgb) >= 3, `${course.name}: ${pilot.name}`);
    }
  });

  assert.deepEqual([...new Set(WARP_COURSES.flatMap((course) => course.pilots.map((pilot) => pilot.craft)))].sort(), ['dart', 'heavy', 'jet', 'saucer', 'wing']);
});

// What is written over the race.

test('over the race: the place out of the field, how well to place, the speed and how far along everyone is', () => {
  const ctx = hud(game({ z: 500, place: 3, speed: 42 }));
  const said = texts(ctx);

  assert.ok(said.includes('P3') && said.includes('/6'));
  assert.ok(said.includes(`TOP ${WARP_COURSES[0].qualify} GO THROUGH`));
  assert.ok(said.includes(String(Math.round(42 * 16))) && said.includes('KM/H'));
  assert.ok(said.includes(`RACE 1/5 · ${WARP_COURSES[0].name.toUpperCase()}`));
  assert.equal(callsNamed(ctx, 'arc').length, 5, 'a dot for each rival');
  assert.ok(texts(hud(game({ race: 4, place: 1 }))).includes('TOP 2 GO THROUGH'));
});

test('the place is amber in front, the player\'s color in a place that goes through, and rose out of one', () => {
  const placeColor = (place) => callsNamed(hud(game({ place })), 'fillText').find((call) => call.args[0] === `P${place}`).brush.fillStyle;

  assert.equal(placeColor(1), `rgb(${THEME.amber})`);
  assert.equal(placeColor(3), `rgb(${THEME.side.player.rgb})`);
  assert.equal(placeColor(5), `rgb(${THEME.rose})`);
});

test('the flow shows once tricks multiply, with a pip for each trick toward the next step, and turns amber at its highest', () => {
  const flow = (tricks) => {
    const ctx = hud(game({ flow: tricks }));
    const label = callsNamed(ctx, 'fillText').find((call) => String(call.args[0]).startsWith('FLOW'));
    return { text: label?.args[0], color: label?.brush.fillStyle, lit: callsNamed(ctx, 'fillRect').filter((call) => call.args[3] === 3 && call.brush.fillStyle === label?.brush.fillStyle).length };
  };

  assert.equal(flow(rules.flowStep - 1).text, undefined);
  assert.deepEqual(flow(rules.flowStep), { text: 'FLOW ×2', color: `rgb(${THEME.lime})`, lit: 0 });
  assert.equal(flow(rules.flowStep + 2).lit, 2);
  assert.deepEqual(flow(rules.flowStep * 9), { text: `FLOW ×${rules.maxFlow}`, color: `rgb(${THEME.amber})`, lit: rules.flowStep });
});

test('before a race the course is named and the start lights come on one a second', () => {
  const lit = (serveCountdown) => {
    const ctx = hud(game({}, { serveCountdown, serveNumber: 0 }));
    return { said: texts(ctx), on: callsNamed(ctx, 'fill').filter(({ brush }) => brush.fillStyle === `rgb(${THEME.red})`).length };
  };

  assert.ok(lit(2.9).said.includes(WARP_COURSES[0].name.toUpperCase()));
  assert.ok(lit(2.9).said.includes(`FINISH IN THE TOP ${WARP_COURSES[0].qualify} TO GO THROUGH`));
  assert.deepEqual([lit(2.9).on, lit(1.9).on, lit(0.5).on], [1, 2, 3]);
  assert.equal(lit(0).said.includes(WARP_COURSES[0].name.toUpperCase()), false, 'gone once they go green');
  assert.ok(texts(hud(game({ race: 4 }, { serveCountdown: 2, serveNumber: 0 }))).includes('FINISH IN THE TOP 2 TO GO THROUGH'));
});

test('after the line everyone is listed in the order they came in, those still racing by how far along they are', () => {
  const rivals = raceState(config, 0).rivals.map((rival, index) => ({ ...rival, z: 2100 - index * 10, finish: [50.5, 0, 52.25, 0, 0][index] }));
  const race = game({ finished: true, finishTime: 51, calm: 2, place: 2, rivals }).warp;
  const order = standings(race, rules);

  assert.deepEqual(order.map((racer) => racer.name), ['ROMA', 'YOU', 'TARAS', 'HALYNA', 'JANITOR', 'HRYTS']);
  assert.deepEqual(order.map((racer) => racer.own), [false, true, false, false, false, false]);
  assert.equal(order[1].rgb, THEME.side.player.rgb);

  const said = texts(hud(game({ finished: true, finishTime: 51, calm: 2, place: 2, rivals })));
  assert.deepEqual(said.slice(said.indexOf('2ND')), [
    '2ND', `+${rules.placePoints[1]} POINTS`,
    '1', 'ROMA', '50.5s', '2', 'YOU', '+0.50', '3', 'TARAS', '+1.75', '4', 'HALYNA', '…', '5', 'JANITOR', '…', '6', 'HRYTS', '…',
    '★ NEW COURSE RECORD 51.00s',
    '◇ FRAGMENT 01 LOST',
    `THROUGH · NEXT: ${WARP_COURSES[1].name.toUpperCase()}`,
  ]);
});

test('each course keeps the player\'s best time: shown before the race, and beaten or not after it', () => {
  const finished = (time, race = 0) => game({ race, finished: true, finishTime: time, calm: 2, place: 1 });
  const board = (state, records) => texts(draw((context) => drawWarpHud(context, state, config, 0, records)));
  const line = (state, records) => board(state, records).find((text) => text.includes('RECORD'));

  assert.equal(line(finished(48.257), []), '★ NEW COURSE RECORD 48.26s', 'the first time on a course is its record');
  assert.equal(line(finished(48.2), [49.5]), '★ NEW COURSE RECORD 48.20s');
  assert.equal(line(finished(50.75), [49.5]), 'RECORD 49.50s · +1.25');
  assert.equal(line(finished(52, 2), [40, 41, 47.123]), 'RECORD 47.12s · +4.88', 'each course its own');

  const grid = (records) => board(game({ race: 1 }, { serveCountdown: 2, serveNumber: 0 }), records);
  assert.ok(grid([45, 51.333]).includes('COURSE RECORD 51.33s'), 'the time to beat, on the grid');
  assert.ok(!grid([45]).some((text) => text.includes('RECORD')), 'none before the player has one');
});

test('the board after the line says whether the race recovered its chapter\'s fragment of the signal', () => {
  const fragment = (changes) => texts(hud(game({ finished: true, finishTime: 50, calm: 2, place: 1, ...changes }))).find((text) => text.includes('FRAGMENT'));
  const story = (done) => ({ progress: done ? 12 : 4, done, recovered: 0, beat: 4, cue: '', cueTime: 0 });

  assert.equal(fragment({ story: story(true) }), '◆ FRAGMENT 01 RECOVERED');
  assert.equal(fragment({ race: 3, story: story(false) }), '◇ FRAGMENT 04 LOST');
  assert.equal(fragment({ story: undefined }), '◇ FRAGMENT 01 LOST', 'a race without a story yet has recovered nothing');
});

test('the board after the line says whether the player goes through', () => {
  const verdict = (changes) => texts(hud(game({ finished: true, finishTime: 50, calm: 2, ...changes }))).at(-1);

  assert.equal(verdict({ place: 5, retry: true }), 'NOT THROUGH · ONE MORE GO');
  assert.equal(verdict({ race: 4, place: 1 }), 'CUP WON!');
  assert.deepEqual([ordinal(1), ordinal(2), ordinal(3), ordinal(4), ordinal(6)], ['1ST', '2ND', '3RD', '4TH', '6TH']);
  assert.equal(texts(hud(game({ finished: true, calm: 0 }))).includes('1ST'), false, 'and is gone once the pause is over');
});

test('a craft\'s flames never add their light to what is under them, so they cannot burn out to the white kept for the ball', () => {
  const ctx = frame(game({ z: 300, rivals: raceState(config, 0).rivals.map((rival, at) => ({ ...rival, z: 306 + at * 5, boost: 1 })) }), 1000, true);
  // A boosting rival's flames and the player's at its ease: the hot heart of each.
  const flames = callsNamed(ctx, 'fill').filter(({ brush }) => brushColors(brush.fillStyle).some((color) => color.startsWith('rgba(254, 240, 138, 0.9')));

  assert.ok(flames.length >= 6, 'a flame an engine');
  assert.ok(flames.every(({ brush }) => brush.globalCompositeOperation === 'source-over'));
});
