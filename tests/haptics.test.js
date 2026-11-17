import test from 'node:test';
import assert from 'node:assert/strict';

import { Haptics } from '../src/adapters/haptics.js';

function setup({ vibration = true, supported = true } = {}) {
  const calls = [];
  const navigator = supported ? { vibrate: (pattern) => calls.push(pattern) } : {};
  const haptics = new Haptics({ navigator, preferences: { get: () => ({ vibration }) } });

  return { haptics, calls };
}

test('the player feels their own hits, points and the end of a match', () => {
  const { haptics, calls } = setup();

  haptics.handle([
    { type: 'paddle-hit', side: 'player', x: 0, y: 0, speed: 400, spin: 0, rally: 1 },
    { type: 'paddle-hit', side: 'opponent', x: 0, y: 0, speed: 400, spin: 0, rally: 2 },
    { type: 'wall-bounce', x: 0, y: 0, speed: 400 },
    { type: 'point', scorer: 'player', x: 0, y: 0 },
    { type: 'point', scorer: 'opponent', x: 0, y: 0 },
    { type: 'game-over', winner: 'player' },
    { type: 'game-over', winner: 'opponent' },
  ]);

  assert.deepEqual(calls, [12, [18, 40, 18], 45, [30, 60, 30, 60, 120], [160]]);
});

test('firing a super thumps, answering one knocks, and a full meter taps twice, for the player only', () => {
  const { haptics, calls } = setup();
  const hit = (side, extra) => ({ type: 'paddle-hit', side, x: 0, y: 0, speed: 400, spin: 0, rally: 1, ...extra });

  haptics.handle([hit('player', { super: 'fireball' })]);
  haptics.handle([hit('player', { saved: 'zigzag' })]);
  haptics.handle([{ type: 'super-ready', side: 'player', kind: 'thunder' }]);
  haptics.handle([hit('opponent', { super: 'phantom' }), { type: 'super-ready', side: 'opponent', kind: 'zigzag' }]);

  assert.deepEqual(calls, [[25, 30, 45], 30, [12, 40, 24]]);
});

test('vibration can be switched off', () => {
  const { haptics, calls } = setup({ vibration: false });

  haptics.handle([{ type: 'point', scorer: 'player', x: 0, y: 0 }]);

  assert.deepEqual(calls, []);
});

test('devices without vibration are left alone', () => {
  const { haptics } = setup({ supported: false });

  assert.equal(haptics.supported, false);
  assert.doesNotThrow(() => haptics.handle([{ type: 'point', scorer: 'player', x: 0, y: 0 }]));
});

test('a boss\'s attack that lands is felt too', () => {
  const { haptics, calls } = setup();

  haptics.handle([{ type: 'hazard-warn', kind: 'drip', x: 0 }, { type: 'hazard-hit', kind: 'drip', x: 0, y: 0 }]);

  assert.deepEqual(calls, [35]);
});

test('in Bricks only what stands out is felt: a blast, a super landing, a bonus, a save, a wall down', () => {
  const { haptics, calls } = setup();

  haptics.handle([
    { type: 'brick-break', kind: 'plain', row: 0, x: 0, y: 0, w: 44, h: 20, by: 'ball', vx: 0, vy: 0, combo: 1, points: 10 },
    { type: 'brick-hit', kind: 'steel', row: 0, x: 0, y: 0, hp: 1 },
    { type: 'bolt-fire', x: 0, y: 0 },
    { type: 'drop-spawn', kind: 'wide', x: 0, y: 0 },
    { type: 'blast', x: 0, y: 0, radius: 62 },
    { type: 'strike', kind: 'thunder', x: 0, y: 0 },
    { type: 'drop', kind: 'wide', x: 0, y: 0 },
    { type: 'shield-save', x: 0, y: 0 },
    { type: 'level-clear', level: 0, bonus: 100, last: false },
  ]);

  assert.deepEqual(calls, [40, [20, 30, 40], 15, 30, [30, 50, 30]], 'a brick breaking, several times a second, is not');
});

test('in Nova only what stands out is felt: the ship hit, a gunship or the boss down, a bonus, a super, the boss coming', () => {
  const { haptics, calls } = setup();
  const down = (kind) => ({ type: 'enemy-down', kind, x: 0, y: 0, rx: 10, by: 'bolt', points: 10, multiplier: 1 });

  haptics.handle([
    { type: 'ship-fire', x: 0, y: 0 },
    { type: 'enemy-hit', kind: 'boss', x: 0, y: 0, hp: 3 },
    down('pebble'),
    down('drone'),
    { type: 'enemy-fire', kind: 'drone', x: 0, y: 0, count: 1 },
    { type: 'ship-hit', x: 0, y: 0 },
    down('gunship'),
    down('boss'),
    { type: 'loot', kind: 'rapid', x: 0, y: 0 },
    { type: 'super-fire', kind: 'zigzag', x: 0, y: 0 },
    { type: 'enemy-arrive', kind: 'boss', x: 0, y: 0 },
    { type: 'sector-clear', sector: 0, bonus: 300, last: false },
  ]);

  assert.deepEqual(calls, [70, 20, [40, 40, 80, 40, 120], 15, [25, 30, 45], [20, 60, 20, 60, 20], [30, 50, 30]]);
});
