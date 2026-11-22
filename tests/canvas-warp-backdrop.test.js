import test from 'node:test';
import assert from 'node:assert/strict';

import { drawBackdrop } from '../src/adapters/canvas/warp-backdrop.js';
import { LOOKS } from '../src/adapters/canvas/warp-scenery.js';
import { callsNamed, createRecordingContext } from './support/fake-canvas.js';

const scene = (look, changes = {}) => ({
  ctx: createRecordingContext(),
  look,
  config: { width: 500, height: 800 },
  view: { heading: 0.12, vanish: { x: 250, y: 265 } },
  race: { z: 340 },
  now: 1000,
  still: false,
  ...changes,
});
const paint = (look, changes) => {
  const frame = scene(look, changes);
  drawBackdrop(frame);
  return frame.ctx;
};
const imageOf = (ctx) => JSON.stringify(ctx.calls);
const paints = (ctx) => ctx.calls.filter(({ name }) => ['fill', 'fillRect', 'stroke'].includes(name));

test('every Warp course paints its own multi-layer background in finite Canvas coordinates', () => {
  const cases = [
    [LOOKS.sunset, 'bezierCurveTo', 18],
    [LOOKS.canyon, 'lineTo', 25],
    [LOOKS.clouds, 'ellipse', 54],
    [LOOKS.orbit, 'arc', 38],
    [LOOKS.tunnel, 'ellipse', 4],
  ];

  for (const [look, operation, minimum] of cases) {
    const ctx = paint(look);
    assert.ok(callsNamed(ctx, operation).length >= minimum, look.skyline);
    assert.equal(callsNamed(ctx, 'save').length, callsNamed(ctx, 'restore').length, look.skyline);
    assert.ok(paints(ctx).length >= 3, look.skyline + ' paints in several layers');
    assert.ok(paints(ctx).length <= 40, look.skyline + ' paints a layer of like shapes at once');
    assert.ok(ctx.calls.length < 900, look.skyline + ' stays within a bounded frame budget');

    for (const call of ctx.calls) {
      if (['moveTo', 'lineTo', 'arc', 'ellipse', 'rect', 'fillRect', 'strokeRect'].includes(call.name)) {
        assert.ok(call.args.every((arg) => typeof arg === 'number' && Number.isFinite(arg)), look.skyline + ': ' + call.name);
      }
    }
  }
});

test('sunset features are multi-plane wisps and distant air traffic, not random frame flicker', () => {
  const ctx = paint(LOOKS.sunset);
  assert.ok(callsNamed(ctx, 'bezierCurveTo').length >= 18);
  assert.ok(callsNamed(ctx, 'quadraticCurveTo').length >= 18);
  assert.equal(callsNamed(ctx, 'stroke').length, 5, 'a stroke for each band of cirrus, one for their sunlit edges, one for the air traffic');
  assert.equal(new Set(callsNamed(ctx, 'stroke').map(({ brush }) => brush.strokeStyle)).size, 5);
});

test('canyon retains dark near and far ridges, layered rock and one diffuse dust sheet', () => {
  const ctx = paint(LOOKS.canyon);
  const fills = paints(ctx).map(({ brush }) => brush.fillStyle);
  assert.ok(fills.includes('rgba(8, 49, 47, 0.43)'));
  assert.ok(fills.includes('rgba(5, 34, 31, 0.61)'));
  assert.equal(callsNamed(ctx, 'createLinearGradient').length, 1);
});

test('clouds have three different depth gradients but only a fixed number of painted lobes', () => {
  const ctx = paint(LOOKS.clouds);
  assert.equal(callsNamed(ctx, 'createLinearGradient').length, 3);
  assert.equal(callsNamed(ctx, 'fill').length, 3, 'one shape for each depth of cloud');
  assert.equal(callsNamed(ctx, 'stroke').length, 3, 'and one stroke for its sunlit crowns');
  assert.equal(callsNamed(ctx, 'ellipse').length, 18 * 4);
  // Each lobe and crown starts a shape of its own, so no edge runs from one cloud to the next.
  assert.equal(callsNamed(ctx, 'moveTo').length, 18 * 4);
});

test('orbit is filled with deterministic stars, planetary arcs and shaded irregular debris', () => {
  const ctx = paint(LOOKS.orbit);
  assert.equal(callsNamed(ctx, 'createLinearGradient').length, 1);
  assert.ok(callsNamed(ctx, 'arc').length >= 38);
  assert.ok(callsNamed(ctx, 'ellipse').length >= 3);
  assert.equal(callsNamed(ctx, 'rotate').length, 1);
  assert.equal(callsNamed(ctx, 'closePath').length, 4);
});

test('tunnel geometry converges on the camera vanishing point without spawning particles', () => {
  const ctx = paint(LOOKS.tunnel);
  assert.equal(callsNamed(ctx, 'moveTo').length, 10);
  assert.equal(callsNamed(ctx, 'ellipse').length, 4);
  assert.equal(callsNamed(ctx, 'createRadialGradient').length, 0);
});

test('reduced motion holds every background still when only the clock changes', () => {
  for (const look of Object.values(LOOKS)) {
    const fixed = (now) => imageOf(paint(look, { still: true, now }));
    assert.equal(fixed(500), fixed(2500), look.skyline);
  }

  assert.notEqual(imageOf(paint(LOOKS.sunset, { now: 500 })), imageOf(paint(LOOKS.sunset, { now: 2500 })));
  assert.notEqual(imageOf(paint(LOOKS.clouds, { now: 500 })), imageOf(paint(LOOKS.clouds, { now: 2500 })));
  assert.notEqual(imageOf(paint(LOOKS.tunnel, { now: 500 })), imageOf(paint(LOOKS.tunnel, { now: 2500 })));
});

test('the skyline parallax follows the course instead of changing with random clock state', () => {
  for (const look of Object.values(LOOKS)) {
    const here = imageOf(paint(look));
    const farther = imageOf(paint(look, { race: { z: 620 } }));
    const turn = imageOf(paint(look, { view: { heading: -0.2, vanish: { x: 290, y: 245 } } }));

    assert.notEqual(here, farther, look.skyline + ' scrolls with race progress');
    assert.notEqual(here, turn, look.skyline + ' reacts to the road direction');
    assert.equal(here, imageOf(paint(look)), look.skyline + ' remains deterministic');
  }
});

test('unknown course skyline is safely ignored', () => {
  const ctx = paint({ ...LOOKS.sunset, skyline: 'unknown' });
  assert.equal(ctx.calls.length, 0);
});
