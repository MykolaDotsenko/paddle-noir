import test from 'node:test';
import assert from 'node:assert/strict';

import { FramePace } from '../src/adapters/frame-pace.js';

/** Frames every `gap` milliseconds, from `start`; the verdict of each. */
function frames(pace, count, gap, start = 0) {
  return Array.from({ length: count }, (_, index) => pace.slow(start + index * gap));
}

test('a device that keeps up, at any refresh rate, is never slow', () => {
  assert.ok(!frames(new FramePace(), 400, 1000 / 60).includes(true));
  assert.ok(!frames(new FramePace(), 400, 1000 / 120).includes(true));
  assert.ok(!frames(new FramePace(), 400, 1000 / 48).includes(true), 'a dropped frame now and then is no shortfall');
});

test('a steady shortfall is slow once its frames are counted, then counted afresh', () => {
  const verdicts = frames(new FramePace({ frames: 90 }), 300, 1000 / 30);
  assert.deepEqual(verdicts.flatMap((slow, index) => (slow ? [index] : [])), [90, 180, 270], 'ninety gaps between frames make a verdict');
});

test('a break, a hidden tab or a clock that runs back starts the count over', () => {
  const pace = new FramePace({ frames: 90 });
  assert.ok(!frames(pace, 80, 40).includes(true));
  assert.equal(pace.slow(80 * 40 + 400), false, 'a long gap is a break, not a frame');
  assert.ok(!frames(pace, 80, 40, 80 * 40 + 440).includes(true), 'counted from the break');

  const jumpy = new FramePace({ frames: 90 });
  frames(jumpy, 80, 40, 10_000);
  jumpy.slow(5_000);
  assert.ok(!frames(jumpy, 80, 40, 5_040).includes(true));
});

test('at rest the count is dropped, so a pause never counts against the device', () => {
  const pace = new FramePace({ frames: 90 });
  frames(pace, 80, 40);
  pace.rest();
  assert.ok(!frames(pace, 85, 40, 3_600).includes(true));
  assert.equal(pace.slow(3_600 + 85 * 40), false);
  assert.equal(frames(pace, 6, 40, 3_600 + 86 * 40).includes(true), true);
});
