import test from 'node:test';
import assert from 'node:assert/strict';

import { analogFlightAxis, InputController } from '../src/adapters/input-controller.js';

const board = {
  getBoundingClientRect: () => ({ left: 100, top: 50, width: 400, height: 640 }),
};

function input() {
  const surface = /** @type {unknown} */ (new EventTarget());
  const window = /** @type {unknown} */ (new EventTarget());
  const document = { querySelector: () => null };
  return new InputController({
    surface: /** @type {HTMLElement} */ (surface),
    board: /** @type {HTMLElement} */ (board),
    window: /** @type {Window} */ (window),
    document: /** @type {Document} */ (document),
    config: { width: 800 },
  });
}
const touch = (pointerId, clientX, clientY = 550, target = {}) => (
  /** @type {PointerEvent} */ (/** @type {unknown} */ ({
    pointerId, clientX, clientY, pointerType: 'touch', target,
    preventDefault() {},
  }))
);
const button = (direction) => {
  const element = {
    dataset: { warpSteer: direction },
    setPointerCapture() {},
    closest() { return element; },
  };
  return element;
};

test('analog flight steering has a generous deadzone, curved precision and bounded extremes', () => {
  assert.equal(analogFlightAxis(0, 80), 0);
  assert.equal(analogFlightAxis(8, 80), 0);
  assert.ok(analogFlightAxis(20, 80) > 0 && analogFlightAxis(20, 80) < 0.25);
  assert.ok(analogFlightAxis(55, 80) > 0.3 && analogFlightAxis(55, 80) < 0.8);
  assert.equal(analogFlightAxis(80, 80), 1);
  assert.equal(analogFlightAxis(120, 80), 1);
  assert.equal(analogFlightAxis(-130, 80), -1);
  assert.equal(analogFlightAxis(20, 0), 0);
  assert.equal(analogFlightAxis(NaN, 80), 0);
});

test('left and right touch buttons steer independently with held multi-touch, never teleport', () => {
  const controller = input();
  controller.configure({ players: 1, warpSteering: 'buttons' });
  const left = touch(1, 100, 520, button('left'));
  const right = touch(2, 475, 520, button('right'));
  controller.handlePointer(left, true);
  assert.equal(controller.snapshot().horizontalAxis, -1);
  assert.equal(controller.snapshot().pointerX, null);
  controller.handlePointer(right, true);
  assert.equal(controller.snapshot().horizontalAxis, 0, 'opposed simultaneous presses cancel out');
  controller.releasePointer(left);
  assert.equal(controller.snapshot().horizontalAxis, 1);
  controller.releasePointer(right);
  assert.equal(controller.snapshot().horizontalAxis, 0);
});

test('dual buttons ignore stray touches on the road but allow keyboard as a fallback', () => {
  const controller = input();
  controller.configure({ players: 1, warpSteering: 'buttons' });
  controller.handlePointer(touch(7, 300), true);
  controller.handlePointer(touch(7, 400), false);
  assert.equal(controller.snapshot().pointerX, null);
  assert.equal(controller.snapshot().horizontalAxis, 0);
  controller.player.leftPressed = true;
  assert.equal(controller.snapshot().horizontalAxis, -1);
});

test('floating joystick starts neutrally at the finger, steers proportionally and releases to zero', () => {
  const controller = input();
  controller.configure({ players: 1, warpSteering: 'stick' });
  const first = touch(9, 280);
  controller.handlePointer(first, true);
  assert.equal(controller.snapshot().horizontalAxis, 0);
  assert.equal(controller.snapshot().pointerX, null, 'the aircraft never snaps to the touch position');

  controller.handlePointer(touch(9, 305), false);
  assert.ok(controller.snapshot().horizontalAxis > 0);
  controller.handlePointer(touch(9, 370), false);
  assert.equal(controller.snapshot().horizontalAxis, 1);
  controller.handlePointer(touch(11, 120), false);
  assert.equal(controller.snapshot().horizontalAxis, 1, 'other fingers cannot steal the stick');
  controller.handlePointer(touch(9, 180), false);
  assert.equal(controller.snapshot().horizontalAxis, -1);
  controller.releasePointer(first);
  assert.equal(controller.snapshot().horizontalAxis, 0);
  assert.equal(controller.snapshot().pointerX, null);
});

test('floating stick ignores upper-screen touches and input is reset on mode change or focus loss', () => {
  const controller = input();
  controller.configure({ players: 1, warpSteering: 'stick' });
  controller.handlePointer(touch(1, 200, 150), true);
  assert.equal(controller.snapshot().horizontalAxis, 0);
  controller.handlePointer(touch(1, 300, 150), false);
  assert.equal(controller.snapshot().horizontalAxis, 0);

  controller.handlePointer(touch(2, 240), true);
  controller.handlePointer(touch(2, 290), false);
  assert.ok(controller.snapshot().horizontalAxis > 0);
  controller.configure({ players: 1, warpSteering: 'buttons' });
  assert.equal(controller.snapshot().horizontalAxis, 0);

  controller.handlePointer(touch(3, 200, 540, button('left')), true);
  assert.equal(controller.snapshot().horizontalAxis, -1);
  controller.handleFocusLoss();
  assert.equal(controller.snapshot().horizontalAxis, 0);
});

test('classic drag remains available and the other cabinet modes use original pointer semantics', () => {
  const controller = input();
  controller.configure({ players: 1, warpSteering: 'drag' });
  controller.handlePointer(touch(4, 300), true);
  assert.equal(controller.snapshot().pointerX, 400);
  controller.configure({ players: 2, warpSteering: 'drag' });
  controller.handlePointer(touch(5, 300), true);
  assert.equal(controller.snapshot().pointerX, 400);
});
