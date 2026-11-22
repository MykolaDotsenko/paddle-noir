import test from 'node:test';
import assert from 'node:assert/strict';

import { drawEngineWake, drawJumpLighting, drawSkyLighting, drawTrackLighting } from '../src/adapters/canvas/warp-lighting.js';
import { LOOKS } from '../src/adapters/canvas/warp-scenery.js';
import { callsNamed, createRecordingContext } from './support/fake-canvas.js';

const context = (paint) => {
  const ctx = createRecordingContext();
  paint(ctx);
  return ctx;
};
const scene = (ctx, look = LOOKS.sunset, changes = {}) => ({
  ctx,
  look,
  config: { width: 500, height: 750 },
  view: { heading: 0.13 },
  now: 800,
  still: false,
  race: { speed: 45 },
  ...changes,
});
const road = (stretch = 8, scale = 0.8) => ({
  near: {
    left: { x: 82, y: 615, depth: 12, scale },
    right: { x: 418, y: 615, depth: 12, scale },
    stretch,
  },
  far: {
    left: { x: 115, y: 530, depth: 19, scale: scale * 0.7 },
    right: { x: 385, y: 530, depth: 19, scale: scale * 0.7 },
    stretch: stretch + 1,
  },
});

test('five course looks have restrained colored atmospheric bloom and shafts', () => {
  for (const look of Object.values(LOOKS)) {
    const ctx = context((c) => drawSkyLighting(scene(c, look)));
    const gradients = callsNamed(ctx, 'createRadialGradient');
    const fills = callsNamed(ctx, 'fill');

    assert.equal(gradients.length, 1, look.skyline);
    assert.equal(gradients[0].args[4] > gradients[0].args[2], true);
    assert.equal(gradients[0].args[5] > 150, true);
    assert.equal(gradients[0].args[3], gradients[0].args[1]);
    assert.equal(gradients.length, 1);
    assert.equal(fills.length, 4, look.skyline);
    assert.equal(callsNamed(ctx, 'save').length, callsNamed(ctx, 'restore').length);
  }

  const fixed = (now) => context((ctx) => drawSkyLighting(scene(ctx, LOOKS.orbit, { still: true, now }))).calls;
  const moving = (now) => context((ctx) => drawSkyLighting(scene(ctx, LOOKS.orbit, { now }))).calls;
  assert.deepEqual(fixed(100), fixed(800));
  assert.notDeepEqual(moving(100), moving(800));
});

test('track light catches its surface in near segments, without expensive per-segment gradients', () => {
  const paint = (stretch, scale = 0.8, speed = 45, upsideDown = false) => context((ctx) => {
    const rows = road(stretch, scale);
    if (upsideDown) rows.far.left.y = 700;
    drawTrackLighting(scene(ctx, LOOKS.canyon, { race: { speed } }), rows.near, rows.far);
  });

  const near = paint(28);
  assert.ok(callsNamed(near, 'fill').length >= 2);
  assert.equal(callsNamed(near, 'createLinearGradient').length, 0);
  assert.equal(callsNamed(near, 'createRadialGradient').length, 0);
  assert.equal(callsNamed(paint(28, 0.08), 'fill').length, 0, 'far scenery uses simpler paint');
  assert.equal(callsNamed(paint(28, 0.8, 45, true), 'fill').length, 0, 'backsides of crests do not reflect');
  assert.ok(callsNamed(paint(28), 'stroke').length >= 1, 'close expansion joint');
  assert.ok(callsNamed(paint(28, 0.8, 45), 'fill').length > callsNamed(paint(28, 0.8, 0), 'fill').length);
  assert.ok(callsNamed(paint(28, 0.8), 'fill').length > callsNamed(paint(29, 0.8), 'fill').length);
});

test('engine wakes respond to movement and boost, but vanish with reduced motion', () => {
  const paint = (changes) => context((ctx) => drawEngineWake(ctx, {
    x: 250, y: 620, glow: '34, 211, 238', speed: 70, boost: false, now: 400, still: false, ...changes,
  }));

  assert.equal(callsNamed(paint({ speed: 0 }), 'stroke').length, 0);
  assert.equal(callsNamed(paint({ still: true }), 'stroke').length, 0);

  const cruising = paint({});
  const boosted = paint({ boost: true });
  assert.equal(callsNamed(cruising, 'createLinearGradient').length, 2);
  assert.equal(callsNamed(boosted, 'createLinearGradient').length, 2);
  assert.equal(callsNamed(cruising, 'quadraticCurveTo').length, 2);
  assert.equal(callsNamed(cruising, 'save').length, callsNamed(cruising, 'restore').length);
  assert.ok(callsNamed(boosted, 'stroke')[0].brush.lineWidth > callsNamed(cruising, 'stroke')[0].brush.lineWidth);
  assert.notDeepEqual(callsNamed(paint({ now: 0 }), 'quadraticCurveTo'), callsNamed(paint({ now: 800 }), 'quadraticCurveTo'));
});

test('jump light projects a widening cone only while a craft is off the track', () => {
  const paint = (groundY) => context((ctx) => drawJumpLighting(ctx, {
    x: 250, y: 510, groundY, glow: '244, 114, 182',
  }));

  assert.equal(paint(515).calls.length, 0);
  const high = paint(610);
  assert.equal(callsNamed(high, 'createLinearGradient').length, 1);
  assert.equal(callsNamed(high, 'fill').length, 1);
  assert.equal(callsNamed(high, 'save').length, callsNamed(high, 'restore').length);
  const colors = callsNamed(high, 'fill')[0].brush.fillStyle.stops.map(([, color]) => color);
  assert.deepEqual(colors, ['rgba(244, 114, 182, 0.16)', 'rgba(244, 114, 182, 0)']);
});
