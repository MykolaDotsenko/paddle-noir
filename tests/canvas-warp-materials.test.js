import test from 'node:test';
import assert from 'node:assert/strict';

import { drawSurfaceMaterial, drawWorldArchitecture } from '../src/adapters/canvas/warp-materials.js';
import { LOOKS } from '../src/adapters/canvas/warp-scenery.js';
import { callsNamed, createRecordingContext } from './support/fake-canvas.js';

const frame = (look, overrides = {}) => ({
  ctx: createRecordingContext(),
  look,
  config: { width: 500, height: 800 },
  view: { heading: 0.2, vanish: { x: 260, y: 272 } },
  race: { z: 680 },
  now: 1500,
  still: false,
  ...overrides,
});
const rows = (scale = 0.85) => ({
  near: {
    left: { x: 74, y: 700, scale, depth: 10 },
    right: { x: 426, y: 700, scale, depth: 10 },
    stretch: 14,
  },
  far: {
    left: { x: 115, y: 630, scale: scale * 0.7, depth: 18 },
    right: { x: 385, y: 630, scale: scale * 0.7, depth: 18 },
    stretch: 15,
  },
});

test('each track draws a distinct, bounded set of detailed physical material marks', () => {
  const shapes = new Set();
  for (const look of Object.values(LOOKS)) {
    const scene = frame(look);
    const road = rows();
    drawSurfaceMaterial(scene, road.near, road.far);
    assert.ok(scene.ctx.calls.length > 18, look.skyline);
    assert.ok(scene.ctx.calls.length < 225, look.skyline + ' remains cheap per near segment');
    assert.equal(callsNamed(scene.ctx, 'createLinearGradient').length, 0);
    assert.equal(callsNamed(scene.ctx, 'createRadialGradient').length, 0);
    assert.equal(callsNamed(scene.ctx, 'save').length, callsNamed(scene.ctx, 'restore').length);
    shapes.add(JSON.stringify(scene.ctx.calls));
  }
  assert.ok(shapes.size >= 4, 'road surfaces must not all have the same texture');
});

test('distant and back-facing segments omit microdetails, preserving mobile performance', () => {
  const look = LOOKS.canyon;
  const draw = (scale, backFacing = false) => {
    const scene = frame(look);
    const road = rows(scale);
    if (backFacing) road.far.left.y = 730;
    drawSurfaceMaterial(scene, road.near, road.far);
    return scene.ctx.calls.length;
  };
  assert.equal(draw(0.1), 0);
  assert.equal(draw(0.8, true), 0);
  assert.ok(draw(0.8) > draw(0.3));
});

test('world architecture adds coherent landmark silhouettes to every course', () => {
  const signatures = new Set();
  for (const look of Object.values(LOOKS)) {
    const scene = frame(look);
    drawWorldArchitecture(scene);
    const ctx = scene.ctx;
    assert.ok(ctx.calls.length >= 25, look.skyline);
    assert.ok(ctx.calls.length < 500, look.skyline + ' budgeted upper bound');
    assert.equal(callsNamed(ctx, 'save').length, callsNamed(ctx, 'restore').length);
    assert.equal(callsNamed(ctx, 'clip').length, 1);
    signatures.add(JSON.stringify(ctx.calls));
    for (const item of ctx.calls) {
      if (['moveTo', 'lineTo', 'fillRect', 'strokeRect', 'ellipse', 'arc'].includes(item.name)) {
        assert.ok(item.args.every((number) => Number.isFinite(number)), look.skyline + ' has finite geometry');
      }
    }
  }
  assert.equal(signatures.size, 5);
});

test('scenery is deterministic, follows road parallax and honors reduced motion', () => {
  for (const look of Object.values(LOOKS)) {
    const render = (overrides) => {
      const scene = frame(look, overrides);
      drawWorldArchitecture(scene);
      return JSON.stringify(scene.ctx.calls);
    };
    assert.equal(render({ still: true, now: 100 }), render({ still: true, now: 2000 }), look.skyline);
    assert.notEqual(render({ race: { z: 100 } }), render({ race: { z: 900 } }), look.skyline);
    assert.notEqual(render({ view: { heading: -0.3, vanish: { x: 290, y: 255 } } }), render({}), look.skyline);
  }
});
