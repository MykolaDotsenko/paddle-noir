import test from 'node:test';
import assert from 'node:assert/strict';

import { WARP_CONFIG } from '../src/config.js';
import { advanceGame, createInitialState, startGame, GAME_PHASE } from '../src/domain/game.js';
import { activateWarpAbility, WARP_ABILITIES } from '../src/domain/warp.js';

const INPUT = { horizontalAxis: 0, pointerX: null, opponentAxis: 0, opponentPointerX: null };

/** A race already under way, with a chosen craft and no competing events. */
function running(kind, changes = {}) {
  const config = {
    ...WARP_CONFIG,
    warp: {
      ...WARP_CONFIG.warp,
      loadout: { ...WARP_CONFIG.warp.loadout, kind, damage: 70, rockets: 2, nitroBars: 4, shields: kind === 'heavy' ? 1 : 0 },
    },
  };
  const started = startGame(createInitialState(config, 123), config);
  const state = {
    ...started,
    phase: GAME_PHASE.RUNNING,
    serveCountdown: 0,
    player: { ...started.player, vx: 0 },
    warp: {
      ...started.warp,
      launched: true,
      z: 150,
      speed: config.warp.topSpeed,
      nitro: 1,
      rivals: [],
      ...changes,
    },
  };
  return { config, state };
}

test('all five airframes have a distinct signature ability and a positive cooldown', () => {
  assert.deepEqual(Object.keys(WARP_ABILITIES).sort(), ['dart', 'heavy', 'jet', 'saucer', 'wing']);
  assert.equal(new Set(Object.values(WARP_ABILITIES).map((ability) => ability.name)).size, 5);
  assert.ok(Object.values(WARP_ABILITIES).every(({ duration, cooldown }) => duration > 0 && cooldown > duration));
});

test('each signature consumes one activation, enters cooldown and announces its craft kind', () => {
  for (const kind of Object.keys(WARP_ABILITIES)) {
    const { state, config } = running(kind);
    assert.equal(state.warp.abilityCooldown, 0);
    const activated = activateWarpAbility(state, config);
    assert.notEqual(activated, state);
    assert.equal(activated.warp.abilityTime, WARP_ABILITIES[kind].duration);
    assert.equal(activated.warp.abilityCooldown, WARP_ABILITIES[kind].cooldown);
    assert.deepEqual(activated.events, [{ type: 'craft-ability', kind, z: 150, x: 0 }]);
    assert.equal(activateWarpAbility(activated, config), activated, kind + ' cannot spam its power');
    const after = advanceGame(activated, 0.1, INPUT, config);
    assert.ok(after.warp.abilityTime < activated.warp.abilityTime);
    assert.ok(after.warp.abilityCooldown < activated.warp.abilityCooldown);
    assert.ok(after.warp.abilityCooldown > 0);
  }
});

test('signature power is ignored outside flight, in a countdown, in a spin, and after finish', () => {
  const { state, config } = running('jet');
  for (const blocked of [
    { ...state, phase: GAME_PHASE.PAUSED },
    { ...state, serveCountdown: 1 },
    { ...state, warp: { ...state.warp, calm: 2 } },
    { ...state, warp: { ...state.warp, spin: 1 } },
    { ...state, warp: { ...state.warp, finished: true } },
    { ...state, warp: null },
  ]) {
    assert.equal(activateWarpAbility(blocked, config), blocked);
  }
  assert.equal(activateWarpAbility(state, { ...config, warp: null }), state);
});

test('Hornet phases through hazards, Manta gains boost, Bulwark deploys armour and Halo refills nitro', () => {
  const hornet = running('dart');
  const dodged = activateWarpAbility(hornet.state, hornet.config);
  assert.equal(dodged.warp.ghost, WARP_ABILITIES.dart.duration);
  assert.ok(dodged.warp.boost >= 0.75);

  const manta = running('wing');
  const surged = activateWarpAbility(manta.state, manta.config);
  assert.equal(surged.warp.boost, WARP_ABILITIES.wing.duration);
  const after = advanceGame(surged, 0.15, INPUT, manta.config);
  assert.ok(after.warp.speed > manta.state.warp.speed, 'surge accelerates');

  const bulwark = running('heavy');
  assert.equal(activateWarpAbility(bulwark.state, bulwark.config).warp.shield, 2);
  const maxed = { ...bulwark.state, warp: { ...bulwark.state.warp, shield: 2 } };
  assert.equal(activateWarpAbility(maxed, bulwark.config).warp.shield, 2, 'armour cannot exceed cap');

  const halo = running('saucer');
  assert.equal(activateWarpAbility(halo.state, halo.config).warp.nitro, 2);
  const full = { ...halo.state, warp: { ...halo.state.warp, nitro: halo.config.warp.loadout.nitroBars } };
  assert.equal(activateWarpAbility(full, halo.config).warp.nitro, full.warp.nitro, 'energy cannot overflow');
});

test('Kestrel target link acquires a rival outside normal gun alignment and lock speed', () => {
  const { state, config } = running('jet');
  const rival = {
    id: 1, pilot: 0, z: 175, x: 0.2, line: 0.2, lineIn: 100, speed: 0,
    boost: 0, spin: 0, bumped: 0, air: 0, mineIn: 100, hull: config.warp.rivalHull, finish: 0,
  };
  const withTarget = { ...state, warp: { ...state.warp, rivals: [rival], rockets: 1, lock: 0, lockOn: 0 } };
  const normal = advanceGame(withTarget, 0.15, INPUT, config);
  const enhanced = advanceGame(activateWarpAbility(withTarget, config), 0.15, INPUT, config);

  assert.equal(normal.warp.aim, 0, 'without the power the target is outside gun alignment');
  assert.equal(enhanced.warp.aim, rival.id, 'target link widens the aiming cone');
  assert.ok(enhanced.warp.rivals[0].hull < normal.warp.rivals[0].hull, 'it deals meaningful damage');
  assert.ok(enhanced.warp.lock > normal.warp.lock, 'rocket target acquisition is faster');
});

test('Bulwark power raises turret damage for the active window, but not after its duration', () => {
  const { state, config } = running('heavy');
  const rival = {
    id: 1, pilot: 0, z: 182, x: 0, line: 0, lineIn: 100, speed: 0,
    boost: 0, spin: 0, bumped: 0, air: 0, mineIn: 100, hull: config.warp.rivalHull, finish: 0,
  };
  const field = { ...state, warp: { ...state.warp, rivals: [rival] } };
  const plain = advanceGame(field, 0.12, INPUT, config);
  const powered = advanceGame(activateWarpAbility(field, config), 0.12, INPUT, config);
  assert.ok(powered.warp.rivals[0].hull < plain.warp.rivals[0].hull);
  const expired = { ...powered, warp: { ...powered.warp, abilityTime: 0 } };
  const cooled = advanceGame(expired, 0.12, INPUT, config);
  assert.ok(cooled.warp.abilityCooldown < expired.warp.abilityCooldown);
});
