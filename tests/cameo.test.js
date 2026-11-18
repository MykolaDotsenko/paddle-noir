import test from 'node:test';
import assert from 'node:assert/strict';

import { CAMEO_SECONDS, CAMEO_WORD, CameoCue, cameoSide } from '../src/adapters/cameo.js';
import { drawCameo } from '../src/adapters/canvas/hud.js';
import { GAME_CONFIG } from '../src/config.js';
import { callsNamed, createRecordingContext } from './support/fake-canvas.js';

const DUO_CONFIG = { ...GAME_CONFIG, opponent: { ...GAME_CONFIG.opponent, controller: 'human' } };

const hit = (side, kind) => ({ type: 'paddle-hit', side, x: 0, y: 0, speed: 500, spin: 0, offset: 0, rally: 1, ...(kind ? { super: kind } : {}) });

test('the cameo comes for a super a person fires, and only with the fun extras on', () => {
  assert.equal(cameoSide(hit('player', 'fireball'), GAME_CONFIG, true), 'player');
  assert.equal(cameoSide(hit('player', 'fireball'), GAME_CONFIG, false), null, 'the Fun switch is off');
  assert.equal(cameoSide(hit('player'), GAME_CONFIG, true), null, 'an ordinary return');
  assert.equal(cameoSide({ type: 'point', scorer: 'player', x: 0, y: 0, super: 'fireball' }, GAME_CONFIG, true), null, 'the hit, not the point it wins');
});

test('the computer\'s super brings nobody, a second player\'s does', () => {
  assert.equal(cameoSide(hit('opponent', 'zigzag'), GAME_CONFIG, true), null);
  assert.equal(cameoSide(hit('opponent', 'zigzag'), DUO_CONFIG, true), 'opponent');
  assert.equal(cameoSide(hit('player', 'zigzag'), DUO_CONFIG, true), 'player');
});

test('he comes once a match, with the first super a person fires, and again in the next match', () => {
  const cue = new CameoCue();

  assert.equal(cue.take(hit('player'), GAME_CONFIG, true), null);
  assert.equal(cue.take(hit('opponent', 'thunder'), GAME_CONFIG, true), null, 'the computer\'s does not use it up');
  assert.equal(cue.take(hit('player', 'thunder'), GAME_CONFIG, true), 'player');
  assert.equal(cue.take(hit('player', 'fireball'), GAME_CONFIG, true), null, 'a surprise, not a habit');

  assert.equal(cue.take({ type: 'match-start' }, GAME_CONFIG, true), null);
  assert.equal(cue.take(hit('player', 'phantom'), GAME_CONFIG, true), 'player');
});

test('with the fun extras off a super does not use the cameo up', () => {
  const cue = new CameoCue();

  assert.equal(cue.take(hit('player', 'fireball'), GAME_CONFIG, false), null);
  assert.equal(cue.take(hit('player', 'fireball'), GAME_CONFIG, true), 'player', 'switched on mid-match, he still comes');
});

test('the cameo is short: over in little more than a second', () => {
  assert.ok(CAMEO_SECONDS > 0.8 && CAMEO_SECONDS <= 1.2);
});

const cameo = (life, side = 'player') => ({ side, life, maxLife: CAMEO_SECONDS });
const draw = (value, reducedMotion = false) => {
  const ctx = createRecordingContext();
  drawCameo(ctx, value, GAME_CONFIG, reducedMotion);
  return ctx;
};
/** Where the drawing's origin was moved to. */
const origin = (ctx) => callsNamed(ctx, 'translate').at(-1).args;

test('with no cameo nothing is drawn', () => {
  assert.equal(draw(null).calls.length, 0);
});

test('he is drawn at the right wall of the player\'s half, with his word beside him', () => {
  const ctx = draw(cameo(CAMEO_SECONDS / 2));
  const [x, y] = origin(ctx);
  const [word] = callsNamed(ctx, 'fillText');

  assert.ok(x > GAME_CONFIG.width * 0.8 && x < GAME_CONFIG.width, 'all the way in, his head is inside the court');
  assert.ok(y > GAME_CONFIG.height / 2, 'in the half of the player who fired');
  assert.equal(word.args[0], CAMEO_WORD);
  assert.ok(word.args[1] < 0, 'the word is on the court side of him');
  assert.equal(callsNamed(ctx, 'rotate').length, 0);
  assert.equal(callsNamed(ctx, 'save').length, callsNamed(ctx, 'restore').length, 'the brush is left as it was found');
});

test('he slides in from outside the wall and back out again', () => {
  const x = (life) => origin(draw(cameo(life)))[0];
  const inside = x(CAMEO_SECONDS / 2);

  assert.ok(x(CAMEO_SECONDS) > GAME_CONFIG.width + 20, 'he starts out of sight');
  assert.ok(x(CAMEO_SECONDS - 0.07) > inside && x(CAMEO_SECONDS - 0.07) < x(CAMEO_SECONDS), 'on his way in');
  assert.ok(x(0.05) > inside, 'on his way out');
});

test('for a second player he is turned to face them from the other end of the table', () => {
  const ctx = draw(cameo(CAMEO_SECONDS / 2, 'opponent'));

  assert.deepEqual(callsNamed(ctx, 'translate')[0].args, [GAME_CONFIG.width, GAME_CONFIG.height]);
  assert.deepEqual(callsNamed(ctx, 'rotate')[0].args, [Math.PI]);
  assert.deepEqual(origin(ctx), origin(draw(cameo(CAMEO_SECONDS / 2))), 'the same picture, turned around');
});

test('with reduced motion he does not slide: he fades in where he stands', () => {
  const still = (life) => draw(cameo(life), true);

  assert.deepEqual(origin(still(CAMEO_SECONDS - 0.02)), origin(still(CAMEO_SECONDS / 2)));
  assert.ok(callsNamed(still(CAMEO_SECONDS - 0.02), 'fillText')[0].brush.globalAlpha < 0.5);
  assert.equal(callsNamed(still(CAMEO_SECONDS / 2), 'fillText')[0].brush.globalAlpha, 1);
  assert.equal(callsNamed(draw(cameo(CAMEO_SECONDS - 0.02)), 'fillText')[0].brush.globalAlpha, 1, 'with motion he is solid as he slides');
});

test('nothing in the cameo is the pure white kept for the ball, or blended to add light', () => {
  const ctx = draw(cameo(CAMEO_SECONDS / 2));
  const painted = ctx.calls.filter(({ name }) => ['fill', 'stroke', 'fillText', 'strokeText'].includes(name));

  assert.ok(painted.length > 8);

  for (const { brush } of painted) {
    assert.doesNotMatch(String(brush.fillStyle) + String(brush.strokeStyle), /#fff\b|#ffffff|255, ?255, ?255|white/i);
    assert.equal(brush.globalCompositeOperation, 'source-over');
  }
});

test('in Nova the ship fires its super with no paddle-hit, and the sound man comes for it, once a match', () => {
  const cue = new CameoCue();
  const fired = { type: 'super-fire', kind: 'zigzag', x: 250, y: 734 };

  assert.equal(cameoSide(fired, GAME_CONFIG, true), 'player');
  assert.equal(cameoSide(fired, GAME_CONFIG, false), null, 'not with the fun extras off');
  assert.equal(cue.take(fired, GAME_CONFIG, true), 'player');
  assert.equal(cue.take(fired, GAME_CONFIG, true), null);
});
