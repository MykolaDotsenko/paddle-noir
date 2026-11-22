import test from 'node:test';
import assert from 'node:assert/strict';

import { drawAirframeDetails } from '../src/adapters/canvas/warp-airframe-details.js';
import { drawHull } from '../src/adapters/canvas/warp-craft.js';
import { drawWarpHud } from '../src/adapters/canvas/warp-hud.js';
import { WARP_CONFIG } from '../src/config.js';
import { activateWarpAbility } from '../src/domain/warp.js';
import { createInitialState, startGame } from '../src/domain/game.js';
import { callsNamed, createRecordingContext } from './support/fake-canvas.js';

const ENGINES = {
  jet: [[-4.4, 8, 3.4], [4.4, 8, 3.4]],
  dart: [[0, 8, 4.6]],
  wing: [[-13, 7, 3.4], [13, 7, 3.4]],
  heavy: [[-7, 10, 3.5], [0, 10, 3.5], [7, 10, 3.5]],
  saucer: [[0, 6, 8]],
};
const kinds = Object.keys(ENGINES);

const record = (callback) => {
  const ctx = createRecordingContext();
  callback(ctx);
  return ctx;
};
const hardware = (kind, changes = {}) => record((ctx) => drawAirframeDetails(ctx, {
  kind, paint: '34, 211, 238', span: kind === 'wing' ? 40 : kind === 'dart' ? 24 : 33,
  bank: 0.18, yaw: 0.1, pitch: 0.12, engines: ENGINES[kind], damage: 0, active: false, ...changes,
}));
const hull = (kind, changes = {}) => record((ctx) => drawHull(ctx, {
  kind, x: 250, y: 620, scale: 1.2, bank: 0.2,
  paint: '34, 211, 238', glow: '34, 211, 238', cockpit: '#a5f3fc',
  decal: 'none', flame: 0.5, nitro: false, rockets: 2, glows: null, now: 500, ...changes,
}));

test('every aircraft has its own hardware silhouette, turbine detail and stable painted materials', () => {
  const signatures = [];
  for (const kind of kinds) {
    const ctx = hardware(kind);
    const picture = ctx.calls.map(({ name, args }) => [name, args]);
    signatures.push(JSON.stringify(picture));
    assert.ok(callsNamed(ctx, 'ellipse').length >= 1, kind + ' has physical engine housings');
    assert.ok(callsNamed(ctx, 'stroke').length >= 8, kind + ' has separate metal components');
    assert.equal(callsNamed(ctx, 'save').length, callsNamed(ctx, 'restore').length, kind);
    assert.ok(ctx.calls.length < 550, kind + ' is within near-craft draw budget');
  }
  assert.equal(new Set(signatures).size, 5);
});

test('control surfaces move mechanically as the pilot banks and yaws', () => {
  const level = hardware('wing', { bank: 0, yaw: 0 });
  const banked = hardware('wing', { bank: 0.3, yaw: 0.2 });
  assert.notDeepEqual(
    callsNamed(level, 'lineTo').map((call) => call.args),
    callsNamed(banked, 'lineTo').map((call) => call.args),
  );
});

test('active hardware lights up and damage reveals scorched material without random flicker', () => {
  const fresh = hardware('heavy');
  const powered = hardware('heavy', { active: true });
  const worn = hardware('heavy', { damage: 0.8 });
  assert.ok(callsNamed(powered, 'stroke').length > callsNamed(fresh, 'stroke').length);
  assert.ok(callsNamed(worn, 'ellipse').length > callsNamed(fresh, 'ellipse').length);
  assert.ok(callsNamed(worn, 'stroke').length > callsNamed(fresh, 'stroke').length);
  assert.equal(JSON.stringify(hardware('heavy', { damage: 0.8 }).calls), JSON.stringify(worn.calls));
});

test('distant rivals keep the simplified hull and never pay for turbine internals', () => {
  for (const kind of kinds) {
    const near = hull(kind);
    const far = hull(kind, { scale: 0.3 });
    assert.ok(callsNamed(near, 'createRadialGradient').length > callsNamed(far, 'createRadialGradient').length, kind);
    assert.ok(near.calls.length > far.calls.length * 2, kind);
  }
});

test('signature HUD names its craft and shows a cooldown after activating', () => {
  const config = WARP_CONFIG;
  const started = startGame(createInitialState(config, 19), config);
  const ready = { ...started, serveCountdown: 0 };
  const active = activateWarpAbility(ready, config);
  const texts = (state) => callsNamed(record((ctx) => drawWarpHud(ctx, state, config, 0)), 'fillText').map((c) => c.args[0]);
  assert.ok(texts(ready).some((label) => String(label).includes('TARGET LINK') && String(label).includes('READY')));
  assert.ok(texts(active).some((label) => String(label).includes('TARGET LINK') && String(label).includes('ACTIVE')));
});
