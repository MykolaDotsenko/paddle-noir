import test from 'node:test';
import assert from 'node:assert/strict';

import { WARP_CONFIG, WARP_LIVES } from '../src/config.js';
import { WARP_COURSES } from '../src/courses.js';
import { advanceGame, createInitialState, GAME_PHASE, startGame } from '../src/domain/game.js';
import { activateWarpControl, buildCourse, warpControlStatus, WARP_CONTROLS } from '../src/domain/warp.js';

const INPUT = { horizontalAxis: 0, pointerX: null, opponentAxis: 0, opponentPointerX: null };

/** Start a real race without waiting through the lights; no fake mouse state required. */
function running({ kind = 'jet', changes = {}, rivals = [] } = {}) {
  const config = {
    ...WARP_CONFIG,
    warp: { ...WARP_CONFIG.warp, loadout: {
      ...WARP_CONFIG.warp.loadout, kind, damage: 50, rockets: 3, nitroBars: 4, shields: 0,
    } },
  };
  const fresh = startGame(createInitialState(config, 97), config);
  const race = {
    ...fresh.warp,
    z: 210, speed: config.warp.topSpeed, launched: true,
    rivals, place: rivals.length + 1, nitro: 2, rockets: 2, shield: 0, ...changes,
  };
  return { config, state: { ...fresh, phase: GAME_PHASE.RUNNING, serveCountdown: 0, warp: race } };
}

function rival(z = 260, x = 0) {
  return {
    id: 1, pilot: 0, z, x, line: x, lineIn: 100, speed: 0,
    boost: 0, spin: 0, bumped: 0, air: 0, mineIn: 99,
    hull: WARP_CONFIG.warp.rivalHull, finish: 0,
  };
}

test('bridge exposes five independently usable controls, never outside a running Warp race', () => {
  const { config, state } = running();
  assert.deepEqual(WARP_CONTROLS, ['nitro', 'guns', 'rockets', 'shield', 'warp']);
  const status = warpControlStatus(state, config);
  assert.equal(status.nitro.ready, true);
  assert.equal(status.guns.ready, true);
  assert.equal(status.shield.ready, true);
  assert.equal(status.warp.ready, true);
  assert.equal(status.rockets.ready, false, 'a guided rocket needs a rival in front');

  for (const invalid of [
    { ...state, phase: GAME_PHASE.PAUSED },
    { ...state, serveCountdown: 1 },
    { ...state, warp: { ...state.warp, spin: 0.5 } },
    { ...state, warp: { ...state.warp, finished: true } },
  ]) {
    for (const control of WARP_CONTROLS) {
      assert.equal(activateWarpControl(invalid, config, control), invalid, control);
    }
  }
  assert.equal(warpControlStatus({ ...state, phase: GAME_PHASE.READY }, config).nitro.ready, false);
});

test('NITRO works from the touch bridge and the existing keyboard input with identical fuel behavior', () => {
  const { config, state } = running();
  const pressed = activateWarpControl(state, config, 'nitro');
  assert.equal(pressed.warp.nitro, 1);
  assert.ok(pressed.warp.nitroBurn > 0);
  assert.deepEqual(pressed.events.map((event) => event.type), ['nitro']);
  assert.equal(activateWarpControl(pressed, config, 'nitro'), pressed, 'no charge consumed twice');

  const keyed = advanceGame(state, 0.016, { ...INPUT, action: true }, config);
  assert.equal(keyed.warp.nitro, pressed.warp.nitro);
  assert.ok(keyed.warp.nitroBurn > 0);
  assert.ok(keyed.events.some((event) => event.type === 'nitro'));
});

test('GUNS enables a timed rapid-fire mode, visibly increases damage, then recharges', () => {
  const { config, state } = running({ rivals: [rival(242)] });
  const plain = advanceGame(state, 0.15, INPUT, config);
  const armed = activateWarpControl(state, config, 'guns');

  assert.equal(armed.warp.gunTime, 2.6);
  assert.equal(armed.warp.gunCooldown, 8);
  assert.deepEqual(armed.events.map((event) => event.type), ['warp-system']);
  assert.equal(activateWarpControl(armed, config, 'guns'), armed, 'burst cannot be stacked');
  assert.equal(warpControlStatus(armed, config).guns.status, 'FIRING');
  assert.equal(warpControlStatus(armed, config).guns.ready, false);

  const powered = advanceGame(armed, 0.15, INPUT, config);
  assert.ok(powered.warp.rivals[0].hull < plain.warp.rivals[0].hull);
  assert.ok(powered.warp.gunCooldown < armed.warp.gunCooldown);
  assert.ok(powered.warp.gunTime < armed.warp.gunTime);
});

test('ROCKET manually launches into a target lock, consumes one missile and cannot waste ammo on empty sky', () => {
  const { config, state } = running({ rivals: [rival(270, 0.3)] });
  const initial = warpControlStatus(state, config);
  assert.equal(initial.rockets.ready, true);
  assert.equal(initial.rockets.status, '2 LOCK');

  const shot = activateWarpControl(state, config, 'rockets');
  assert.equal(shot.warp.rockets, 1);
  assert.equal(shot.warp.missiles.length, 1);
  assert.equal(shot.warp.missiles[0].target, 1);
  assert.deepEqual(shot.events.map((event) => event.type), ['rocket-launch']);
  assert.equal(state.warp.rockets, 2, 'original state is untouched');

  const emptySky = { ...state, warp: { ...state.warp, rivals: [] } };
  assert.equal(activateWarpControl(emptySky, config, 'rockets'), emptySky);
  const out = { ...state, warp: { ...state.warp, rockets: 0 } };
  assert.equal(activateWarpControl(out, config, 'rockets'), out);
  const airborne = { ...state, warp: { ...state.warp, air: 0.5 } };
  assert.equal(activateWarpControl(airborne, config, 'rockets'), airborne);
});

test('SHIELD blocks a real mine strike, has finite lifetime, and remains on cooldown after consuming its bubble', () => {
  const { state, config } = running({
    changes: { course: { ...buildCourse(WARP_CONFIG, 0), items: [
      { id: 41, kind: 'mine', z: 213, x: 0, sway: 0, air: false },
    ] }, cursor: 0, shield: 0 },
  });

  const unshielded = advanceGame(state, 0.12, INPUT, config);
  assert.ok(unshielded.events.some((event) => event.type === 'crash'), 'the mine is a genuine collision');
  assert.ok(unshielded.warp.spin > 0);

  const protectedState = activateWarpControl(state, config, 'shield');
  assert.equal(protectedState.warp.shieldTime, 3.2);
  assert.equal(protectedState.warp.shieldCooldown, 14);
  const survived = advanceGame(protectedState, 0.12, INPUT, config);
  assert.ok(survived.events.some((event) => event.type === 'shield-hit'));
  assert.ok(!survived.events.some((event) => event.type === 'crash'));
  assert.equal(survived.warp.spin, 0);
  assert.equal(survived.warp.shieldTime, 0, 'shield spent on impact');
  assert.equal(activateWarpControl(survived, config, 'shield'), survived, 'cannot spam a new shield');
});

test('WARP drives every craft forward and briefly phases it while retaining its unique signature', () => {
  for (const kind of ['jet', 'dart', 'wing', 'heavy', 'saucer']) {
    const { state, config } = running({ kind });
    const warped = activateWarpControl(state, config, 'warp');
    assert.ok(warped.warp.boost >= 1.7, kind);
    assert.ok(warped.warp.ghost >= 0.85, kind);
    assert.ok(warped.warp.abilityTime > 0);
    assert.ok(warped.warp.abilityCooldown > warped.warp.abilityTime);
    assert.deepEqual(warped.events.map((event) => event.type), ['craft-ability']);
    assert.equal(warpControlStatus(warped, config).warp.status, 'ENGAGED');
  }
});

test('the intro races offer safe opening space, more rewards and fewer early hazards', () => {
  assert.equal(WARP_LIVES, 4, 'four retries instead of three');
  assert.deepEqual(WARP_COURSES.map((course) => course.qualify), [4, 4, 3, 3, 2]);

  const course = buildCourse(WARP_CONFIG, 0);
  const hazards = course.items.filter((item) => ['mine', 'debris', 'cargo', 'gate'].includes(item.kind));
  assert.ok(hazards.length > 0 && hazards.length < 9, 'hazards remain interesting but sparse');
  assert.ok(hazards.every((item) => item.z >= 480), 'the first 480m has no hazards');
  assert.ok(course.items.some((item) => item.kind === 'ring' && item.z < 480));
  assert.ok(course.items.some((item) => item.kind === 'pad' && item.z < 480));

  const starter = createInitialState(WARP_CONFIG, 88);
  assert.equal(starter.warp.shield, WARP_CONFIG.warp.loadout.shields + 1, 'one introductory shield');
});
