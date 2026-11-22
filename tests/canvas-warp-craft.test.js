import test from 'node:test';
import assert from 'node:assert/strict';

import { THEME } from '../src/adapters/canvas/theme.js';
import { drawWarp, viewOf } from '../src/adapters/canvas/warp.js';
import { drawHullBar } from '../src/adapters/canvas/warp-combat.js';
import { CRAFT_SCALE, drawCraftPortrait, drawHull, drawShield, drawUnderglow, muzzlesOf } from '../src/adapters/canvas/warp-craft.js';
import { drawWarpHud } from '../src/adapters/canvas/warp-hud.js';
import { loadoutFor, setupOf } from '../src/application/hangar.js';
import { WARP_CONFIG } from '../src/config.js';
import { createInitialState, GAME_PHASE } from '../src/domain/game.js';
import { buildCourse, raceState } from '../src/domain/warp.js';
import { HANGAR } from '../src/hangar.js';
import { callsNamed, createRecordingContext, FakeCanvas, fakeGlows } from './support/fake-canvas.js';

// The racing craft of the Warp game on the canvas, their weapons at work, and what the race's
// display says of them.

const config = WARP_CONFIG;
const rules = config.warp;
const glows = fakeGlows;
const KINDS = ['jet', 'dart', 'wing', 'heavy', 'saucer'];
const CYAN = THEME.side.player.rgb;
const CORE = THEME.side.player.core;
const CRAFT_Y = config.height - config.paddle.inset - config.paddle.height / 2;
const NITRO = '125, 211, 252';
const ROCKET = '251, 146, 60';
const TRACER = '254, 240, 138';
const SMOKE = '148, 163, 184';
const SHIELD = '96, 165, 250';

const style = (changes = {}) => ({ kind: 'jet', paint: CYAN, decal: 'none', glow: CYAN, cockpit: CORE, x: 100, y: 200, scale: 1, bank: 0, flame: 0.5, nitro: false, rockets: 0, now: 0, glows, ...changes });
const draw = (painter) => {
  const ctx = createRecordingContext();
  painter(ctx);
  return ctx;
};
const hull = (changes) => draw((ctx) => drawHull(ctx, style(changes)));
const painted = (ctx) => ctx.calls.filter(({ name }) => ['fill', 'stroke', 'fillRect', 'strokeRect', 'fillText'].includes(name));
const stroked = (ctx, color) => painted(ctx).filter(({ name, brush }) => name === 'stroke' && String(brush.strokeStyle).includes(color)).length;
const filled = (ctx, color) => painted(ctx).filter(({ name, brush }) => name !== 'stroke' && String(brush.fillStyle).includes(color)).length;
const texts = (ctx) => callsNamed(ctx, 'fillText').map((call) => call.args[0]);
const picture = (ctx) => JSON.stringify(ctx.calls.map(({ name, args, brush }) => [name, args, brush.fillStyle, brush.strokeStyle]));

/** Every color a picture was painted in, the stops of its gradients included, as [r, g, b]. */
function colorsOf(ctx) {
  const brushes = painted(ctx).flatMap(({ name, brush }) => [name === 'stroke' ? brush.strokeStyle : brush.fillStyle]);
  const named = brushes.flatMap((brush) => (typeof brush === 'string' ? [brush] : brush.stops.map(([, color]) => color)));

  return named.map((color) => (color.startsWith('#')
    ? [1, 3, 5].map((at) => parseInt(color.slice(at, at + 2), 16))
    : color.match(/\d+(\.\d+)?/g).slice(0, 3).map(Number)));
}

test('every kind of craft is built where its style says, in its paint, with the light on its canopy', () => {
  for (const kind of KINDS) {
    const ctx = hull({ kind, bank: 0.2, scale: 1.2 });

    assert.deepEqual(callsNamed(ctx, 'translate')[0].args, [100, 200], kind);
    assert.deepEqual(callsNamed(ctx, 'scale')[0].args, [1.2, 1.2], kind);
    assert.deepEqual(callsNamed(ctx, 'rotate')[0].args, [0.2], kind);
    assert.ok(stroked(ctx, `rgb(${CYAN})`) >= 1, `${kind} is edged in its paint`);
    assert.equal(callsNamed(ctx, 'fill').filter(({ brush }) => brush.fillStyle === CORE).length, 1, `${kind} wears one light on its canopy`);
    assert.ok(callsNamed(ctx, 'createLinearGradient').length >= 1, `${kind} is shaded`);
    assert.equal(callsNamed(ctx, 'save').length, callsNamed(ctx, 'restore').length, kind);
  }

  // No two are the same craft.
  assert.equal(new Set(KINDS.map((kind) => picture(hull({ kind })))).size, KINDS.length);
});


test('nearby aircraft have volumetric wings, reflective canopies and aircraft-specific hardpoints', () => {
  for (const kind of KINDS) {
    const near = hull({ kind, scale: 1.2, bank: 0.2 });
    const middle = hull({ kind, scale: 0.5, bank: 0.2 });
    const far = hull({ kind, scale: 0.3, bank: 0.2 });

    const gradients = (ctx) => callsNamed(ctx, 'createLinearGradient').length;
    assert.ok(gradients(near) >= (kind === 'saucer' ? 2 : 5), kind + ' has multiple material layers');
    assert.ok(painted(near).length > painted(middle).length, kind + ' draws fine hardware up close');
    assert.ok(painted(middle).length > painted(far).length, kind + ' keeps a simple distant hull');
    assert.equal(gradients(far), 0, kind + ' does not pay for gradients far away');
    assert.equal(callsNamed(near, 'save').length, callsNamed(near, 'restore').length, kind);
  }

  // Fasteners and engine cooling vents only appear at the closer level of detail.
  const at = (scale) => hull({ kind: 'heavy', scale });
  assert.ok(callsNamed(at(1.2), 'arc').length > callsNamed(at(0.5), 'arc').length);
  assert.ok(callsNamed(at(1.2), 'stroke').length > callsNamed(at(0.5), 'stroke').length);
});

test('flight attitude adds a subtle 2.5D perspective without changing the steering bank', () => {
  const level = hull({ bank: 0.15 });
  const leaning = hull({ bank: 0.15, yaw: 0.2, pitch: 0.16 });
  const tooMuch = hull({ bank: 0.15, yaw: 10, pitch: 10 });

  assert.equal(callsNamed(level, 'transform').length, 0);
  assert.deepEqual(callsNamed(leaning, 'rotate')[0].args, [0.15]);
  assert.equal(callsNamed(leaning, 'transform').length, 1);
  assert.notDeepEqual(callsNamed(leaning, 'transform')[0].args, [1, 0, 0, 1, 0, 0]);

  const [xScale, yShear, xShear, yScale] = callsNamed(tooMuch, 'transform')[0].args;
  assert.ok(xScale > 0.9 && yScale < 1.1, 'attitude is clamped to preserve silhouette readability');
  assert.ok(Math.abs(yShear) < 0.04 && Math.abs(xShear) < 0.12);
  assert.equal(painted(level).length, painted(leaning).length, 'attitude does not add per-frame draw passes');
});

test('the light on the canopy is the same on every craft: a paddle\'s core where a paddle\'s core would be', () => {
  const light = (kind) => {
    const { calls } = hull({ kind });
    const fill = calls.findIndex(({ name, brush }) => name === 'fill' && brush.fillStyle === CORE);
    const start = calls.slice(0, fill).findLastIndex(({ name }) => name === 'beginPath');

    return JSON.stringify(calls.slice(start, fill).map(({ name, args }) => [name, args]));
  };

  assert.equal(new Set(KINDS.map(light)).size, 1);
  // It spans the craft's own middle, where the board is read for the paddle.
  const ys = JSON.parse(light('jet')).flatMap(([, args]) => args.filter((_, index) => index % 2 === 1));
  assert.ok(Math.min(...ys) <= -10 && Math.max(...ys) >= 1.5);
});

test('far away a craft is drawn plainly: no shading, no panel lines, no lights', () => {
  for (const kind of KINDS) {
    const near = hull({ kind, scale: 0.5, rockets: 2, decal: 'stripes' });
    const far = hull({ kind, scale: 0.3, rockets: 2, decal: 'stripes' });

    assert.equal(callsNamed(far, 'createLinearGradient').length, 0, kind);
    assert.ok(far.calls.length < near.calls.length * 0.7, `${kind}: ${far.calls.length} of ${near.calls.length}`);
    assert.equal(callsNamed(far, 'clip').length, 0, kind);
    assert.equal(filled(far, '239, 68, 68'), 0, `${kind} shows no rocket and no port light`);
    assert.ok(stroked(far, `rgb(${CYAN})`) >= 1, kind);
    assert.equal(callsNamed(far, 'fill').filter(({ brush }) => brush.fillStyle === CORE).length, 1, kind);
  }
});

test('the fire out of the engines is painted over what is under it, never added to it', () => {
  for (const kind of KINDS) {
    for (const nitro of [false, true]) {
      const ctx = hull({ kind, nitro, flame: 1.4, rockets: 2, decal: 'flames', now: 500 });

      assert.ok(painted(ctx).every(({ brush }) => brush.globalCompositeOperation === 'source-over'), `${kind}: only the glow adds its light`);
      assert.ok(callsNamed(ctx, 'drawImage').every(({ brush }) => brush.globalCompositeOperation === 'lighter'), kind);
    }
  }

  // An engine each: two on a jet, one on a dart and a saucer, three on a gunship.
  const engines = (kind) => callsNamed(hull({ kind }), 'drawImage').length;
  assert.deepEqual(KINDS.map(engines), [2, 1, 2, 3, 1]);
});

test('the flame grows with the thrust, and nitro burns longer and blue, with knots in it', () => {
  const tip = (changes) => Math.max(...callsNamed(hull(changes), 'lineTo').map((call) => call.args[1]));

  assert.ok(tip({ flame: 1 }) > tip({ flame: 0.4 }));
  assert.ok(tip({ flame: 1, nitro: true }) > tip({ flame: 1 }));

  const plain = hull({ flame: 1, glow: '244, 114, 182' });
  const burning = hull({ flame: 1, glow: '244, 114, 182', nitro: true });

  assert.ok(filled(plain, 'rgba(244, 114, 182') >= 2, 'the flame is the color of the craft\'s light');
  assert.equal(filled(plain, NITRO), 0);
  assert.ok(filled(burning, `rgba(${NITRO}`) >= 2);
  assert.equal(filled(burning, 'rgba(244, 114, 182'), 0);
  assert.ok(callsNamed(burning, 'ellipse').length > callsNamed(plain, 'ellipse').length, 'the knots of a jet at full thrust');
  assert.ok(callsNamed(burning, 'drawImage').every((call) => call.args[0].glow === NITRO));
  assert.ok(callsNamed(plain, 'drawImage').every((call) => call.args[0].glow === '244, 114, 182'));
});

test('a craft shows the rockets it carries under its wings, four at most', () => {
  for (const kind of KINDS) {
    const noses = (rockets) => callsNamed(hull({ kind, rockets }), 'fillRect').filter(({ brush }) => brush.fillStyle === 'rgb(239, 68, 68)').length;

    assert.deepEqual([0, 1, 2, 3, 9].map(noses), [0, 1, 2, 3, 4], kind);
  }
});

test('a craft wears its decal within its own outline: stripes, chevrons, flames or the earned signal', () => {
  for (const kind of KINDS) {
    const pictures = ['none', 'stripes', 'chevrons', 'flames', 'signal'].map((decal) => picture(hull({ kind, decal })));
    assert.equal(new Set(pictures).size, 5, kind);
  }

  // The signal: a beacon on each wing and its rings going out, none joined to the next.
  const signal = hull({ decal: 'signal' });
  assert.equal(callsNamed(signal, 'clip').length, 1);
  assert.equal(callsNamed(signal, 'arc').filter((call) => call.args[2] === 1.7).length, 2);
  assert.equal(callsNamed(signal, 'arc').filter((call) => call.args[2] === 4.2 || call.args[2] === 7.6).length, 4);
  assert.equal(callsNamed(hull({ kind: 'saucer', decal: 'signal' }), 'ellipse').filter((call) => call.args[2] === 17 || call.args[2] === 22.5).length, 2);

  assert.equal(callsNamed(hull({ decal: 'none' }), 'clip').length, 0);
  assert.equal(callsNamed(hull({ decal: 'stripes' }), 'clip').length, 1);
  assert.ok(callsNamed(hull({ decal: 'flames' }), 'quadraticCurveTo').length >= 6);
  assert.ok(filled(hull({ decal: 'flames' }), `rgba(${THEME.amber}, 0.9)`) >= 2);

  // Light on a dark paint, dark on a light one.
  assert.ok(filled(hull({ decal: 'stripes', paint: '239, 68, 68' }), 'rgba(226, 232, 240, 0.85)') >= 4);
  assert.ok(filled(hull({ decal: 'stripes', paint: '203, 213, 225' }), 'rgba(5, 6, 15, 0.7)') >= 4);
  assert.ok(stroked(hull({ decal: 'chevrons', paint: '203, 213, 225' }), 'rgba(5, 6, 15, 0.7)') >= 1);
});

test('the lights on its wing tips blink in turn, the saucer\'s run round its rim, and with no clock they hold still', () => {
  const lights = (kind, now) => JSON.stringify(painted(hull({ kind, now })).map(({ brush }) => brush.fillStyle));

  for (const kind of KINDS) {
    assert.notEqual(lights(kind, 100), lights(kind, 480), kind);
    assert.equal(lights(kind, 0), lights(kind, 0), kind);
    assert.ok(filled(hull({ kind, now: 100 }), 'rgba(239, 68, 68, 1)') === 1 && filled(hull({ kind, now: 100 }), 'rgba(74, 222, 128, 0.45)') === 1, `${kind}: red to port`);
    assert.ok(filled(hull({ kind, now: 480 }), 'rgba(74, 222, 128, 1)') === 1, `${kind}: green to starboard`);
  }

  assert.notEqual(lights('saucer', 100), lights('saucer', 250), 'round the rim');
});

test('a craft that leans is lit from the side it leans away from, and its fins go with it', () => {
  const corners = (bank) => JSON.stringify(callsNamed(hull({ bank }), 'lineTo').map((call) => call.args));
  const stops = (bank) => JSON.stringify(callsNamed(hull({ bank }), 'createLinearGradient').length);

  assert.notEqual(corners(0.3), corners(0), 'the fins lean');
  assert.equal(stops(0.3), stops(0));

  const shading = (kind, bank) => JSON.stringify(painted(hull({ kind, bank })).map(({ brush }) => brush.fillStyle).filter((brush) => typeof brush !== 'string').map((gradient) => gradient.stops));
  for (const kind of KINDS) {
    assert.notEqual(shading(kind, 0.3), shading(kind, -0.3), kind);
  }
});

test('with no sprites to hand, each glow is shaded in place', () => {
  const ctx = hull({ glows: null });

  assert.equal(callsNamed(ctx, 'drawImage').length, 0);
  assert.equal(callsNamed(ctx, 'createRadialGradient').length, 4, 'two engine glows and two recessed turbine housings');
  assert.ok(painted(ctx).every(({ brush }) => brush.globalCompositeOperation === 'source-over'));
});

test('no craft in any paint is painted in the white kept for the ball, or in anything like a paddle\'s core but its canopy light', () => {
  const isBall = ([red, green, blue]) => red > 250 && green > 250 && blue > 250;
  // What the board is read for to find the player's paddle.
  const isCore = ([red, green, blue]) => red > 135 && red < 195 && green > 225 && blue > 235;

  for (const kind of KINDS) {
    for (const paint of HANGAR.paints) {
      for (const decal of HANGAR.decals) {
        for (const nitro of [false, true]) {
          const ctx = hull({ kind, paint: paint.rgb, glow: paint.rgb, decal: decal.id, nitro, flame: 1.4, rockets: 3, bank: 0.3, now: 500, cockpit: 'rgb(1, 2, 3)' });
          const used = colorsOf(ctx);

          assert.ok(used.length > 20);
          assert.deepEqual(used.filter(isBall), [], `${kind} in ${paint.name}`);
          assert.deepEqual(used.filter(isCore), [], `${kind} in ${paint.name} with ${decal.name}`);
        }
      }
    }
  }
});

test('the guns sit the same way out on each side of a craft', () => {
  for (const kind of KINDS) {
    const [left, right] = muzzlesOf(kind);

    assert.equal(muzzlesOf(kind).length, 2, kind);
    assert.ok(left < 0 && right === -left, kind);
  }

  assert.ok(muzzlesOf('dart')[1] < muzzlesOf('wing')[1], 'a dart is narrow');
});

test('a craft throws its light on the lane under it, flat on the ground', () => {
  const ctx = draw((context) => drawUnderglow(context, CYAN, 100, 300, 50, 0.8));
  const [light] = callsNamed(ctx, 'createRadialGradient');

  assert.deepEqual(light.args, [100, 300, 0, 100, 300, 50]);
  assert.deepEqual(callsNamed(ctx, 'scale')[0].args, [1, 0.3]);
  assert.deepEqual(callsNamed(ctx, 'fillRect')[0].brush.fillStyle.stops.map(([, color]) => color), [`rgba(${CYAN}, 0.4)`, `rgba(${CYAN}, ${0.16 * 0.8})`, `rgba(${CYAN}, 0)`]);
});

test('a shield is a bubble round the craft that shimmers, with a second ring while two are up', () => {
  const rings = (shields, now = 0) => draw((ctx) => drawShield(ctx, 100, 200, 1.2, shields, now));

  assert.equal(stroked(rings(1), `rgba(${SHIELD}`), 1);
  assert.equal(stroked(rings(2), `rgba(${SHIELD}`), 2);
  assert.equal(stroked(rings(5), `rgba(${SHIELD}`), 2, 'two rings say enough');
  assert.equal(filled(rings(2), `rgba(${SHIELD}, 0.08)`), 1);
  assert.equal(picture(rings(1)), picture(rings(1)));
  assert.notEqual(picture(rings(1, 100)), picture(rings(1, 400)));
  assert.ok(callsNamed(rings(1), 'ellipse')[0].args[2] > 46, 'as large as the craft is drawn');
});

test('in the hangar a craft stands on a lit pad, as it is tuned and painted', () => {
  const loadout = (id, setup = {}) => {
    const spec = HANGAR.crafts.find((craft) => craft.id === id);
    return loadoutFor(HANGAR, spec, { ...setupOf(HANGAR, { craft: '', owned: {} }, spec), ...setup });
  };
  const portrait = (id, setup) => {
    const canvas = new FakeCanvas();
    canvas.width = 640;
    canvas.height = 320;
    drawCraftPortrait(canvas, loadout(id, setup));
    return canvas.contexts[0];
  };
  const kestrel = portrait('kestrel');

  assert.deepEqual(callsNamed(kestrel, 'clearRect')[0].args, [0, 0, 640, 320]);
  assert.equal(callsNamed(kestrel, 'fill').filter(({ brush }) => brush.fillStyle === CORE).length, 1);
  assert.ok(stroked(kestrel, `rgb(${CYAN})`) >= 1);
  assert.ok(stroked(kestrel, `rgba(${CYAN}, 0.8)`) === 1, 'the pad is lit in the craft\'s glow');
  assert.equal(callsNamed(kestrel, 'drawImage').length, 0, 'it needs no sprites');
  assert.ok(callsNamed(kestrel, 'scale')[1].args[0] > 4, 'large enough to see');
  assert.equal(stroked(kestrel, `rgba(${SHIELD}`), 0);

  // Its paint, its light, its rockets, its shields.
  const red = HANGAR.paints.find((paint) => paint.id === 'red').rgb;
  const amber = HANGAR.paints.find((paint) => paint.id === 'amber').rgb;
  const bulwark = portrait('bulwark', { paint: 'red', glow: 'amber', decal: 'flames' });

  assert.ok(stroked(bulwark, `rgb(${red})`) >= 1);
  assert.ok(stroked(bulwark, `rgba(${amber}, 0.8)`) === 1);
  assert.equal(stroked(bulwark, `rgba(${SHIELD}`), 1, 'a Bulwark comes with a shield');
  assert.equal(callsNamed(bulwark, 'fillRect').filter(({ brush }) => brush.fillStyle === 'rgb(239, 68, 68)').length, loadout('bulwark').rockets);
  assert.notEqual(picture(portrait('halo')), picture(portrait('manta')));

  // A canvas that cannot be drawn on is left alone.
  assert.doesNotThrow(() => drawCraftPortrait(new FakeCanvas({ contextAvailable: false }), loadout('kestrel')));
});

// The craft in a race, and its weapons.

/** A race under way on the first course, flat and empty but for what the test puts on it. */
function game(changes = {}, { loadout = {}, items = [], player = { x: 250, vx: 0 } } = {}) {
  const tuned = { ...config, warp: { ...rules, loadout: { ...rules.loadout, ...loadout } } };
  const course = { ...buildCourse(tuned, 0), hills: [], items: items.map((item, index) => ({ id: index + 1, x: 0, sway: 0, air: false, ...item })) };
  const state = { ...createInitialState(tuned, 1), phase: GAME_PHASE.RUNNING, serveCountdown: 0, player };

  return { config: tuned, state: { ...state, warp: { ...raceState(tuned, 0), z: 300, speed: rules.topSpeed, launched: true, course, rivals: [], ...changes } } };
}

const frame = ({ config: tuned, state }, now = 1000, still = false) => draw((ctx) => drawWarp(ctx, state, tuned, now, glows, still));
const hud = ({ config: tuned, state }) => draw((ctx) => drawWarpHud(ctx, state, tuned, 0));
const rival = (changes = {}) => ({ ...raceState(config, 0).rivals[0], z: 320, x: 0, line: 0, ...changes });
const spotOf = (z, x, lift = 0) => viewOf(game().state.warp, config).project(z, x, lift);

test('the player flies the craft of their loadout, in its paint, lit in its glow', () => {
  const red = '239, 68, 68';
  const amber = '251, 191, 36';
  const kestrel = frame(game());
  const bulwark = frame(game({}, { loadout: { kind: 'heavy', paint: red, glow: amber, decal: 'flames' } }));

  // The lane's own edges are cyan too: the craft's are those a red craft does not have.
  assert.ok(stroked(kestrel, `rgb(${CYAN})`) - stroked(bulwark, `rgb(${CYAN})`) >= 2);
  assert.equal(stroked(kestrel, `rgb(${red})`), 0);
  assert.ok(stroked(bulwark, `rgb(${red})`) >= 2);
  assert.equal(callsNamed(bulwark, 'drawImage').filter((call) => call.args[0].glow === amber).length, 3, 'a gunship\'s three engines');
  assert.equal(callsNamed(bulwark, 'clip').length, callsNamed(kestrel, 'clip').length + 1, 'and its decal');
  assert.deepEqual(callsNamed(bulwark, 'scale').find((call) => call.args[0] === CRAFT_SCALE).args, [CRAFT_SCALE, CRAFT_SCALE]);

  for (const ctx of [kestrel, bulwark]) {
    assert.equal(callsNamed(ctx, 'fill').filter(({ brush }) => brush.fillStyle === CORE).length, 1, 'whatever the paint, a paddle\'s core');
  }

  // Its light lies on the lane under it, and the rockets aboard hang under its wings.
  const lights = (ctx) => callsNamed(ctx, 'createRadialGradient').filter((call) => call.args[0] === 250 && call.args[1] > CRAFT_Y);
  assert.equal(lights(kestrel).length, 1);
  const noses = (rockets) => callsNamed(frame(game({ rockets })), 'fillRect').filter(({ brush }) => brush.fillStyle === 'rgb(239, 68, 68)').length;
  assert.deepEqual([noses(0), noses(2)], [0, 2]);
});

test('nitro burns blue: the flames, the light on the lane, and streaks over the whole board', () => {
  const burning = frame(game({ nitroBurn: 1 }));
  const cruising = frame(game());
  const streaks = (ctx) => stroked(ctx, `rgba(${NITRO}, `);

  assert.ok(filled(burning, `rgba(${NITRO}`) >= 2);
  assert.equal(filled(cruising, `rgba(${NITRO}`), 0);
  assert.ok(streaks(burning) >= 30, 'even at cruising speed');
  assert.equal(streaks(cruising), 0);
  assert.equal(streaks(frame(game({ nitroBurn: 1 }), 1000, true)), 0, 'nothing streams past with motion reduced');
  assert.ok(callsNamed(burning, 'drawImage').some((call) => call.args[0].glow === NITRO));
});

test('a shield still up is a bubble round the craft', () => {
  assert.equal(stroked(frame(game({ shield: 0 })), `rgba(${SHIELD}`), 0);
  assert.equal(stroked(frame(game({ shield: 1 })), `rgba(${SHIELD}`), 1);
  assert.equal(stroked(frame(game({ shield: 2 })), `rgba(${SHIELD}`), 2);
  assert.equal(picture(frame(game({ shield: 1 }), 1000, true)), picture(frame(game({ shield: 1 }), 1400, true)), 'and holds still with motion reduced');
});

test('a rocket crate and a nitro cell hang over the lane where they are, each over its own light', () => {
  const ctx = frame(game({}, { items: [{ kind: 'crate', z: 320, x: -0.4 }, { kind: 'cell', z: 320, x: 0.4 }] }));
  const pools = callsNamed(ctx, 'drawImage').filter((call) => [ROCKET, NITRO].includes(call.args[0].glow));
  const crate = spotOf(320, -0.4);

  assert.deepEqual(pools.map((call) => call.args[0].glow).sort(), [NITRO, ROCKET].sort());
  assert.ok(stroked(ctx, `rgb(${ROCKET})`) >= 1 && stroked(ctx, `rgb(${NITRO})`) >= 1);
  assert.ok(callsNamed(ctx, 'translate').some((call) => Math.abs(call.args[0] - crate.x) < 1e-9 && Math.abs(call.args[1] - crate.y) < 1e-9));

  // They bob, and hold still with motion reduced.
  const bobbing = (now, still) => picture(frame(game({}, { items: [{ kind: 'crate', z: 320 }, { kind: 'cell', z: 330 }] }), now, still));
  assert.notEqual(bobbing(1000, false), bobbing(1300, false));
  assert.equal(bobbing(1000, true), bobbing(1300, true));
  assert.equal(stroked(frame(game()), `rgb(${ROCKET})`), 0);
});

test('the guns\' tracers run from the craft\'s muzzles to the rival they bear on, over the lane', () => {
  const target = rival({ z: 320, x: 0.1, line: 0.1 });
  const firing = frame(game({ rivals: [target], aim: target.id }));
  const idle = frame(game({ rivals: [target], aim: 0 }));
  const lines = (ctx) => stroked(ctx, `rgba(${TRACER}`);

  assert.equal(lines(idle), 0);
  assert.ok(lines(firing) >= 2 + 6 + 1, 'a line and three rounds a muzzle, and the sparks where they land');
  assert.ok(filled(firing, `rgba(${TRACER}, 0.9)`) + filled(frame(game({ rivals: [target], aim: target.id }), 1060), `rgba(${TRACER}, 0.9)`) >= 2, 'the muzzles flash');

  // From each side of the craft, to the rival.
  const at = spotOf(320, 0.1);
  const [left, right] = muzzlesOf('jet').map((out) => 250 + out * CRAFT_SCALE);
  const moves = callsNamed(firing, 'moveTo').map((call) => call.args[0]);
  assert.ok(moves.includes(left) && moves.includes(right));
  assert.ok(callsNamed(firing, 'lineTo').some((call) => Math.abs(call.args[0] - at.x) < 1e-9));

  // Painted after the lane and the rival, before the player's own craft.
  const names = firing.calls.map(({ name, brush }) => `${name} ${brush.strokeStyle} ${brush.fillStyle}`);
  const tracer = names.findIndex((entry) => entry.startsWith(`stroke rgba(${TRACER}`));
  assert.ok(tracer > names.findLastIndex((entry) => entry.startsWith(`stroke rgb(${rules.courses[0].pilots[0].rgb})`)));
  assert.ok(tracer < names.findIndex((entry) => entry.includes(CORE)));

  // With motion reduced the lines stay, and nothing runs along them.
  const still = frame(game({ rivals: [target], aim: target.id }), 1000, true);
  assert.equal(lines(still), 3);
  assert.equal(picture(still), picture(frame(game({ rivals: [target], aim: target.id }), 1090, true)));

  // A rival that is gone, or out of sight, is not fired at.
  assert.equal(lines(frame(game({ rivals: [], aim: 99 }))), 0);
  assert.equal(lines(frame(game({ rivals: [rival({ z: 900 })], aim: target.id }))), 0);
});

test('a rocket\'s lock closes four corners in on its rival, amber, then red with the word once it is nearly whole', () => {
  const target = rival({ z: 330 });
  const locking = (lock) => frame(game({ rivals: [target], lockOn: target.id, lock }));
  const size = (lock) => Math.max(...callsNamed(locking(lock), 'lineTo').filter(({ brush }) => String(brush.strokeStyle).includes(THEME.amber) || String(brush.strokeStyle).includes(THEME.red)).map((call) => Math.abs(call.args[0])));

  assert.equal(stroked(locking(0.3), `rgba(${THEME.amber}, 0.95)`), 1);
  assert.equal(stroked(locking(0.9), `rgba(${THEME.red}, 0.95)`), 1);
  assert.ok(!texts(locking(0.3)).includes('LOCK'));
  assert.ok(texts(locking(0.9)).includes('LOCK'));
  assert.ok(size(0.1) > size(0.6), 'it closes in');
  assert.equal(stroked(frame(game({ rivals: [target], lockOn: 0, lock: 0 })), `rgba(${THEME.amber}, 0.95)`), 0);
  assert.equal(stroked(frame(game({ rivals: [], lockOn: 7, lock: 0.5 })), `rgba(${THEME.amber}, 0.95)`), 0);
});

test('a rocket in flight is its fire and its fins, with smoke behind it that thins out', () => {
  const smoke = (ctx) => callsNamed(ctx, 'fill').filter(({ brush }) => String(brush.fillStyle).startsWith(`rgba(${SMOKE}`));
  const flying = frame(game({ missiles: [{ id: 1, z: 320, x: 0.2, target: 1 }] }));
  const puffs = smoke(flying);
  const at = spotOf(320, 0.2, 0.14);

  assert.equal(callsNamed(flying, 'drawImage').filter((call) => call.args[0].glow === ROCKET).length, 1);
  assert.equal(puffs.length, 5);
  assert.equal(new Set(puffs.map(({ brush }) => brush.fillStyle)).size, 5, 'each thinner than the last');
  assert.ok(callsNamed(flying, 'arc').some((call) => Math.abs(call.args[0] - at.x) < 1e-9 && Math.abs(call.args[1] - at.y) < 1e-9));

  // Smoke that would be behind the eye is not drawn; out of sight, nothing is.
  const launched = frame(game({ missiles: [{ id: 1, z: 299, x: 0, target: 1 }] }));
  assert.equal(smoke(launched).length, 3);
  assert.equal(callsNamed(frame(game({ missiles: [{ id: 1, z: 900, x: 0, target: 1 }] })), 'drawImage').filter((call) => call.args[0].glow === ROCKET).length, 0);
  assert.equal(callsNamed(frame(game()), 'drawImage').filter((call) => call.args[0].glow === ROCKET).length, 0);
});

test('a rival under fire shows how much of its hull is left: green, amber, then red', () => {
  const bar = (share, changes = {}) => callsNamed(frame(game({ rockets: 0, rivals: [rival({ hull: rules.rivalHull * share, ...changes })] })), 'fillRect')
    .filter(({ brush }) => [THEME.lime, THEME.amber, THEME.red].some((rgb) => brush.fillStyle === `rgb(${rgb})`));

  assert.equal(bar(1).length, 0, 'whole, it shows nothing');
  assert.deepEqual(bar(0.8).map(({ brush }) => brush.fillStyle), [`rgb(${THEME.lime})`]);
  assert.deepEqual(bar(0.4).map(({ brush }) => brush.fillStyle), [`rgb(${THEME.amber})`]);
  assert.deepEqual(bar(0.1).map(({ brush }) => brush.fillStyle), [`rgb(${THEME.red})`]);
  assert.ok(bar(0.8)[0].args[2] > bar(0.4)[0].args[2], 'as long as what is left');
  assert.equal(bar(0.4, { spin: 1 }).length, 0, 'not while it spins');
  assert.equal(bar(0.4, { finish: 30 }).length, 0, 'nor past the line');

  // Never shorter than nothing or longer than the hull.
  const ends = (share) => draw((ctx) => drawHullBar(ctx, share, { x: 100, y: 100, scale: 1, depth: 10 })).calls.at(-1).args[2];
  assert.equal(ends(-0.5), 0);
  assert.equal(ends(1.5), ends(1));
});

test('rivals throw their own light on the lane, and each kind of craft is among them', () => {
  const pilots = rules.courses[4].pilots;
  const kinds = new Set(rules.courses.flatMap((course) => course.pilots.map((pilot) => pilot.craft)));
  const { state } = game();
  const last = { ...state, warp: { ...raceState(config, 4), z: 300, speed: rules.topSpeed, launched: true } };
  const ctx = draw((context) => drawWarp(context, { ...last, warp: { ...last.warp, rivals: last.warp.rivals.map((racer, at) => ({ ...racer, z: 306 + at * 4, x: -0.7 + at * 0.35 })) } }, config, 1000, glows, true));

  assert.deepEqual([...kinds].sort(), [...KINDS].sort());
  assert.equal(pilots.at(-1).craft, 'heavy', 'the Landlord flies a gunship');

  for (const pilot of pilots) {
    assert.ok(stroked(ctx, `rgb(${pilot.rgb})`) >= 1, pilot.name);
    assert.ok(painted(ctx).some(({ brush }) => typeof brush.fillStyle !== 'string' && brush.fillStyle.kind === 'createRadialGradient' && brush.fillStyle.stops[0][1].startsWith(`rgba(${pilot.rgb}`)), `${pilot.name}'s light`);
  }
});

test('under the place: the nitro in the tank, the rockets aboard and the shields up', () => {
  const said = (changes, loadout) => hud(game(changes, { loadout }));
  const bars = (ctx, alpha) => callsNamed(ctx, 'fillRect').filter(({ brush }) => brush.fillStyle === `rgba(${NITRO}, ${alpha})`);
  const rockets = (ctx, color) => callsNamed(ctx, 'fill').filter(({ brush }) => brush.fillStyle === color).length;
  const full = said({ nitro: 2.5, rockets: 1, shield: 0 }, { nitroBars: 4, rockets: 3 });

  assert.ok(texts(full).includes('NITRO'));
  assert.equal(bars(full, 0.2).length, 4, 'a bar for each the tank holds');
  assert.equal(bars(full, 1).length, 2, 'two of them full');
  assert.deepEqual(bars(full, 0.55).map((call) => call.args[2]), [7, 0], 'the third half full, the fourth empty');
  assert.equal(rockets(full, `rgb(${ROCKET})`), 1);
  assert.equal(rockets(full, `rgba(${ROCKET}, 0.22)`), 2);
  assert.equal(rockets(full, `rgb(${SHIELD})`), 0);
  assert.equal(rockets(said({ shield: 2 }), `rgb(${SHIELD})`), 2);

  // The word is bright once there is a bar to burn; a line runs down under the bars while one burns.
  const word = (ctx) => callsNamed(ctx, 'fillText').find((call) => call.args[0] === 'NITRO').brush.fillStyle;
  assert.equal(word(said({ nitro: 1 })), `rgba(${NITRO}, 1)`);
  assert.equal(word(said({ nitro: 0.9 })), `rgba(${NITRO}, 0.6)`);
  const line = (nitroBurn) => callsNamed(said({ nitroBurn }), 'fillRect').filter(({ args, brush }) => args[3] === 2 && brush.fillStyle === `rgb(${THEME.amber})`);
  assert.equal(line(0).length, 0);
  assert.ok(line(rules.loadout.nitroSeconds)[0].args[2] > line(rules.loadout.nitroSeconds / 3)[0].args[2]);
});
