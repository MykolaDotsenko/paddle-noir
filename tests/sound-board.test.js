import test from 'node:test';
import assert from 'node:assert/strict';

import { AudioOutput } from '../src/adapters/audio-output.js';
import { MusicPlayer } from '../src/adapters/music-player.js';
import { comboNote, SoundBoard } from '../src/adapters/sound-board.js';
import { finisherFor } from '../src/adapters/finisher.js';
import { RIVALS } from '../src/catalog.js';
import { GAME_CONFIG, RUSH_CONFIG } from '../src/config.js';
import { createInitialState } from '../src/domain/game.js';

function fakeParam(value = 0) {
  const param = {
    value,
    events: [],
    setValueAtTime(value, time) {
      param.events.push(['set', value, time]);
    },
    exponentialRampToValueAtTime(value, time) {
      param.events.push(['ramp', value, time]);
    },
    linearRampToValueAtTime(value, time) {
      param.events.push(['linear', value, time]);
    },
    cancelScheduledValues(time) {
      param.events.push(['cancel', time]);
    },
  };
  return param;
}

class FakeAudioContext {
  constructor() {
    this.state = 'suspended';
    this.currentTime = 10;
    this.destination = { name: 'speakers' };
    this.oscillators = [];
    this.gains = [];
    this.resumes = 0;
    FakeAudioContext.created.push(this);
  }

  resume() {
    this.resumes += 1;
    this.state = 'running';
    return Promise.resolve();
  }

  createGain() {
    // A browser's new gain node passes full level until something is scheduled on it.
    const gain = { gain: fakeParam(1), connections: [], connect: (node) => gain.connections.push(node) };
    this.gains.push(gain);
    return gain;
  }

  createOscillator() {
    const oscillator = {
      type: '',
      frequency: fakeParam(),
      connect: () => {},
      start: (time) => {
        oscillator.startedAt = time;
      },
      stop: (time) => {
        oscillator.stoppedAt = time;
      },
    };
    this.oscillators.push(oscillator);
    return oscillator;
  }
}

function setup({ sound = true, withAudio = true, jokes = false } = {}) {
  FakeAudioContext.created = [];
  const board = new SoundBoard({
    audio: new AudioOutput(withAudio ? { AudioContext: FakeAudioContext } : {}),
    preferences: { get: () => ({ sound, jokes }) },
  });
  return { board, contexts: FakeAudioContext.created };
}

/** The first match seed whose finisher, for the player's win, passes the test. */
function seedFor(test) {
  for (let seed = 0; ; seed += 1) {
    const finisher = finisherFor({ winner: 'player', twoPlayers: false, rush: false, jokes: true, seed });
    if (finisher && test(finisher)) return seed;
  }
}

const hit = (rally, side = 'player') => ({ type: 'paddle-hit', side, x: 0, y: 0, speed: 500, spin: 0, rally });

test('nothing is created while sound is off', () => {
  const { board, contexts } = setup({ sound: false });

  board.handle([{ type: 'match-start' }]);

  assert.equal(contexts.length, 0);
});

test('browsers without Web Audio are handled quietly', () => {
  const { board } = setup({ withAudio: false });

  assert.doesNotThrow(() => board.handle([{ type: 'match-start' }]));
});

test('the first event creates and resumes one audio context routed to the speakers', () => {
  const { board, contexts } = setup();

  board.handle([{ type: 'match-start' }]);
  board.handle([hit(1)]);

  assert.equal(contexts.length, 1);
  const [context] = contexts;
  assert.equal(context.resumes, 1);
  assert.deepEqual(board.master.connections, [context.destination]);
  assert.ok(context.oscillators.length > 4);
  assert.ok(context.oscillators.every((oscillator) => oscillator.stoppedAt > oscillator.startedAt));
});

test('hit pitch climbs as the rally grows', () => {
  const { board, contexts } = setup();

  board.handle([hit(1)]);
  board.handle([hit(8)]);

  const pitches = contexts[0].oscillators
    .filter((oscillator) => oscillator.type === 'square')
    .map((oscillator) => oscillator.frequency.events[0][1]);

  assert.equal(pitches.length, 2);
  assert.ok(pitches[1] > pitches[0]);
});

test('every sound starts silent, so an oscillator starting a sample early cannot click', () => {
  const { board, contexts } = setup();

  board.handle([hit(5, 'player'), { type: 'game-over', winner: 'player' }]);

  const envelopes = contexts[0].gains.slice(1);
  assert.ok(envelopes.length > 5);
  assert.ok(envelopes.every((gain) => gain.gain.value === 0.0001));
});

test('the effects play well below full scale, leaving headroom for the music', () => {
  const { board, contexts } = setup();

  board.handle([hit(1)]);

  assert.ok(contexts[0].gains[0].gain.value <= 0.5);
});

test('every event type has a sound, and milestone rallies add a chime', () => {
  const { board, contexts } = setup();
  const events = [
    { type: 'countdown', value: 3 },
    { type: 'countdown', value: 1 },
    { type: 'serve', x: 0, y: 0 },
    { type: 'pickup-spawn', kind: 'wide', x: 0, y: 0 },
    { type: 'pickup', kind: 'wide', side: 'player', x: 0, y: 0 },
    { type: 'pickup', kind: 'ghost', side: 'opponent', x: 0, y: 0 },
    { type: 'paddle-graze', side: 'player', x: 0, y: 0, speed: 500 },
    { type: 'wall-bounce', x: 0, y: 0, speed: 400 },
    { type: 'match-point', side: 'player' },
    { type: 'life-lost', lives: 2 },
    { type: 'point', scorer: 'player', x: 0, y: 0 },
    { type: 'point', scorer: 'opponent', x: 0, y: 0 },
    { type: 'game-over', winner: 'player' },
    { type: 'game-over', winner: 'opponent' },
    { type: 'paused' },
    { type: 'resumed' },
    { type: 'hazard-warn', kind: 'drip', x: 0 },
    { type: 'hazard-warn', kind: 'beam', x: 0 },
    { type: 'hazard-warn', kind: 'lag', x: 0 },
    { type: 'hazard-hit', kind: 'drip', x: 0, y: 0 },
    { type: 'hazard-hit', kind: 'beam', x: 0, y: 0 },
    { type: 'hazard-hit', kind: 'lag', x: 0, y: 0 },
  ];

  for (const event of events) {
    const before = FakeAudioContext.created[0]?.oscillators.length ?? 0;
    board.handle([event]);
    assert.ok(contexts[0].oscillators.length > before, event.type);
  }

  const beforeMilestone = contexts[0].oscillators.length;
  board.handle([hit(5, 'opponent')]);
  assert.equal(contexts[0].oscillators.length - beforeMilestone, 5);

  // A Multiball ball's return sounds like a hit, but is no fifth hit of the rally.
  const beforeExtra = contexts[0].oscillators.length;
  board.handle([{ ...hit(5, 'opponent'), extra: true }]);
  assert.equal(contexts[0].oscillators.length - beforeExtra, 2);
});

test('supers sound off: a meter filling, each super its own way, a swerve and a save', () => {
  const { board, contexts } = setup();
  const count = (events) => {
    const before = contexts[0]?.oscillators.length ?? 0;
    board.handle(events);
    return contexts[0].oscillators.length - before;
  };
  const plain = count([hit(1)]);
  const kinds = ['fireball', 'zigzag', 'phantom', 'thunder'].map((kind) => {
    const before = contexts[0].oscillators.length;
    board.handle([{ ...hit(1), super: kind }]);
    return contexts[0].oscillators.slice(before + plain).map((oscillator) => `${oscillator.type}@${oscillator.frequency.events[0][1]}`).join(' ');
  });

  assert.equal(new Set(kinds).size, 4, 'each super sounds different');
  assert.ok(kinds.every((sound) => sound.length > 0));
  assert.ok(count([{ ...hit(1), saved: 'zigzag' }]) > plain, 'a save clangs');
  assert.equal(count([{ type: 'super-ready', side: 'player', kind: 'zigzag' }]), 4);
  assert.equal(count([{ type: 'super-ready', side: 'opponent', kind: 'zigzag' }]), 3);
  assert.equal(count([{ type: 'super-swerve', x: 0, y: 0 }]), 1);
});

test('sound effects and music share one audio context', () => {
  FakeAudioContext.created = [];
  const audio = new AudioOutput({ AudioContext: FakeAudioContext });
  const preferences = { get: () => ({ sound: true, music: true }) };
  const board = new SoundBoard({ audio, preferences });
  const music = new MusicPlayer({ audio, timers: { setInterval: () => 1, clearInterval: () => {} }, preferences });

  board.handle([{ type: 'match-start' }]);
  music.handle([{ type: 'match-start' }], { phase: 'running' });

  assert.equal(FakeAudioContext.created.length, 1);
  assert.strictEqual(board.context, music.context);
});

test('the finisher lands with a crunch on top of the fanfare, only where a finisher plays', () => {
  const won = { type: 'game-over', winner: 'player' };
  const lost = { type: 'game-over', winner: 'opponent' };
  // A match whose seed draws a finisher that crunches, not a comic one.
  const seed = seedFor((finisher) => finisher.kind === 'shatter');
  const over = { ...createInitialState(GAME_CONFIG, 1), seed, score: { player: 7, opponent: 3 } };
  // A null state stands for none at all.
  const count = (options, event, config, state = over) => {
    const { board, contexts } = setup(options);
    board.handle([event], state ?? undefined, config);
    return contexts[0].oscillators.length;
  };

  const fanfare = count({ jokes: false }, won, GAME_CONFIG);
  assert.equal(count({ jokes: true }, won, GAME_CONFIG), fanfare + 2);
  assert.equal(count({ jokes: true }, lost, GAME_CONFIG), count({ jokes: false }, lost, GAME_CONFIG));
  assert.equal(count({ jokes: true }, lost, RUSH_CONFIG), count({ jokes: false }, lost, RUSH_CONFIG));
  assert.equal(count({ jokes: true }, won, undefined), fanfare, 'without the match config it cannot tell, so it stays quiet');
  assert.equal(count({ jokes: true }, won, GAME_CONFIG, null), fanfare, 'nor without the final state');
});

test('a super\'s finisher sounds the super again, and the comic ones sob or snore instead of crunching', () => {
  const won = { type: 'game-over', winner: 'player' };
  const sounds = (event, seed) => {
    const { board, contexts } = setup({ jokes: true });
    board.handle([event], { ...createInitialState(GAME_CONFIG, 1), seed, score: { player: 7, opponent: 2 } }, GAME_CONFIG);
    return contexts[0].oscillators.map((oscillator) => `${oscillator.type}@${oscillator.frequency.events[0][1]}`);
  };
  const plain = sounds(won, seedFor((finisher) => finisher.kind === 'shatter'));
  const superWin = sounds({ ...won, super: 'thunder' }, 1);
  const tiny = sounds(won, seedFor((finisher) => finisher.kind === 'tiny'));
  const snooze = sounds(won, seedFor((finisher) => finisher.kind === 'snooze'));

  assert.equal(superWin.length, plain.length + 2, 'thunder\'s crack and rumble after the crunch');
  assert.notDeepEqual(tiny, plain);
  assert.notDeepEqual(snooze, plain);
  assert.notDeepEqual(tiny, snooze);
});

test('the landlord laughs at every point it takes with the fun extras on, longer at the one that wins', () => {
  const landlord = RIVALS.at(-1).config;
  const point = { type: 'point', scorer: 'opponent', x: 250, y: 800 };
  const sounds = (events, { jokes = true, config = landlord, phase = 'running' } = {}) => {
    const { board, contexts } = setup({ jokes });
    board.handle(events, { ...createInitialState(config, 1), phase }, config);
    return contexts[0].oscillators.length;
  };
  const plain = sounds([point], { jokes: false });

  assert.equal(sounds([point]), plain + 3, 'ha, ha, ha');
  assert.equal(sounds([point], { phase: 'game-over' }), plain + 5);
  assert.equal(sounds([point], { config: RIVALS[8].config }), plain, 'no other rival laughs');
  assert.equal(sounds([{ ...point, scorer: 'player', y: 0 }]), sounds([{ ...point, scorer: 'player', y: 0 }], { jokes: false }));
});

test('the final boss rings a gong on the first serve and sounds a sting as it changes phase', () => {
  const landlord = RIVALS.at(-1).config;
  const count = (events, config, serveNumber = 0) => {
    const { board, contexts } = setup();
    board.handle(events, { ...createInitialState(config, 1), serveNumber }, config);
    return contexts[0].oscillators.length;
  };
  const serve = { type: 'serve', x: 250, y: 400 };

  assert.equal(count([serve], landlord), count([serve], GAME_CONFIG) + 2);
  assert.equal(count([serve], landlord, 2), count([serve], GAME_CONFIG, 2), 'only on the first serve');
  assert.equal(count([{ type: 'boss-phase', phase: 1 }], landlord), 4, 'a sweep and three notes');
  assert.equal(count([{ type: 'boss-phase', phase: 1 }], GAME_CONFIG), 0);
});

test('an EVICTALITY rumbles after the crunch', () => {
  const landlord = RIVALS.at(-1).config;
  const won = [{ type: 'game-over', winner: 'player' }];
  const over = { ...createInitialState(landlord, 1), phase: 'game-over', score: { player: 7, opponent: 3 } };
  const sounds = (jokes) => {
    const { board, contexts } = setup({ jokes });
    board.handle(won, over, landlord);
    return contexts[0].oscillators.length;
  };

  assert.equal(sounds(true), sounds(false) + 3, 'the crunch, and the building coming down');
});

test('with the fun extras on a match starts with a coin, and the fanfare waits for it to drop', () => {
  const started = (jokes) => {
    const { board, contexts } = setup({ jokes });
    board.handle([{ type: 'match-start' }]);
    return contexts[0].oscillators.map((oscillator) => ({
      type: oscillator.type,
      frequency: oscillator.frequency.events[0][1],
      at: Number((oscillator.startedAt - contexts[0].currentTime).toFixed(3)),
    }));
  };

  const plain = started(false);
  assert.deepEqual(plain.map(({ type, at }) => [type, at]), [['triangle', 0], ['triangle', 0.07], ['triangle', 0.14], ['triangle', 0.21]]);

  const coined = started(true);
  const coin = coined.slice(0, -plain.length);
  const fanfare = coined.slice(-plain.length);

  assert.equal(coin.length, 4);
  assert.ok(coin.slice(0, 3).every(({ type, frequency }) => type === 'sine' && frequency > 2000), 'two bright clinks, the first with a ring to it');
  assert.ok(coin[3].frequency < 250, 'then the thud of the coin box');
  assert.deepEqual(fanfare.map(({ frequency }) => frequency), plain.map(({ frequency }) => frequency), 'the same fanfare');
  assert.ok(Math.max(...coin.map(({ at }) => at)) < fanfare[0].at, 'which starts once the coin has dropped');
  assert.deepEqual(fanfare.map(({ at }) => Number((at - fanfare[0].at).toFixed(3))), [0, 0.07, 0.14, 0.21]);
  assert.ok(fanfare[0].at <= 0.25, 'and soon');
});

test('the coin is for the start of a match only', () => {
  const { board, contexts } = setup({ jokes: true });

  board.handle([{ type: 'resumed' }, { type: 'serve', x: 0, y: 0 }, { type: 'countdown', value: 3 }]);

  assert.ok(contexts[0].oscillators.every((oscillator) => oscillator.frequency.events[0][1] < 2000));
});

test('the sound man whoops at the first super a person fires, once a match, and never for the computer', () => {
  const { board, contexts } = setup({ jokes: true });
  const count = (events) => {
    const before = contexts[0]?.oscillators.length ?? 0;
    board.handle(events, undefined, GAME_CONFIG);
    return contexts[0].oscillators.length - before;
  };
  const fired = (side = 'player') => ({ ...hit(1, side), super: 'fireball' });
  const plain = count([fired('opponent')]);

  const before = contexts[0].oscillators.length;
  assert.equal(count([fired()]), plain + 3, 'two rising notes and a glint on top');
  const whoop = contexts[0].oscillators.slice(before + plain);
  assert.ok(whoop.every((oscillator) => oscillator.frequency.events[1][1] > oscillator.frequency.events[0][1]), 'each rises');
  assert.ok(whoop.every((oscillator) => oscillator.startedAt > contexts[0].currentTime), 'just after the super\'s own sound');

  assert.equal(count([fired()]), plain, 'the next super is only a super');
  board.handle([{ type: 'match-start' }], undefined, GAME_CONFIG);
  assert.equal(count([fired()]), plain + 3, 'until the next match');
});

test('without the fun extras, or without a match\'s settings, there is no whoop', () => {
  const fired = { ...hit(1), super: 'fireball' };
  const sounds = (jokes, config) => {
    const { board, contexts } = setup({ jokes });
    board.handle([fired], undefined, config);
    return contexts[0].oscillators.length;
  };

  assert.equal(sounds(false, GAME_CONFIG), sounds(true, undefined));
  assert.equal(sounds(true, GAME_CONFIG), sounds(false, GAME_CONFIG) + 3);
});

test('the cameo is counted while the sound is off, so sound switched on mid-match stays in step with the picture', () => {
  const preferences = { sound: false, jokes: true };
  FakeAudioContext.created = [];
  const board = new SoundBoard({ audio: new AudioOutput({ AudioContext: FakeAudioContext }), preferences: { get: () => preferences } });
  const fired = { ...hit(1), super: 'fireball' };

  board.handle([fired], undefined, GAME_CONFIG);
  assert.equal(FakeAudioContext.created.length, 0);

  preferences.sound = true;
  board.handle([{ ...hit(1, 'opponent'), super: 'fireball' }], undefined, GAME_CONFIG);
  const plain = FakeAudioContext.created[0].oscillators.length;
  board.handle([fired], undefined, GAME_CONFIG);

  assert.equal(FakeAudioContext.created[0].oscillators.length, plain * 2, 'he already came, in silence');
});

const brokenBrick = (overrides = {}) => ({ type: 'brick-break', kind: 'plain', row: 0, x: 0, y: 0, w: 44, h: 20, by: 'ball', vx: 0, vy: 0, combo: 1, points: 10, ...overrides });

test('bricks breaking in a combo climb a scale, a note a brick, and stop climbing after two octaves', () => {
  const notes = Array.from({ length: 16 }, (_, index) => comboNote(index + 1));

  assert.equal(notes[0], 440);
  assert.ok(notes.slice(0, 13).every((note, index) => index === 0 || note > notes[index - 1]), 'each higher than the last');
  assert.ok(Math.abs(notes[5] - 880) < 1e-9, 'an octave every five bricks');
  assert.equal(notes[13], notes[12], 'the top note holds');
  assert.equal(notes[15], notes[12]);
  assert.ok(notes[12] < 2500, 'within what a phone plays well');
  assert.equal(comboNote(0), 440, 'a combo of nothing sounds the first note');
});

test('a brick sounds the note of its place in the combo', () => {
  const { board, contexts } = setup();
  const pitch = (combo) => {
    const before = contexts[0]?.oscillators.length ?? 0;
    board.handle([brokenBrick({ combo })]);
    return contexts[0].oscillators[before].frequency.events[0][1];
  };

  assert.equal(pitch(1), comboNote(1));
  assert.equal(pitch(7), comboNote(7));
});

test('however many bricks a blast takes in one step, two of them sound, and the bomb is heard as its blast', () => {
  const { board, contexts } = setup();
  const count = (events) => {
    const before = contexts[0]?.oscillators.length ?? 0;
    board.handle(events);
    return contexts[0].oscillators.length - before;
  };
  const one = count([brokenBrick()]);
  const blast = count([{ type: 'blast', x: 0, y: 0, radius: 62 }]);

  assert.equal(one, 2);
  assert.equal(blast, 2, 'a low boom and a crack');
  assert.equal(count([brokenBrick({ kind: 'bomb' })]), 0);
  assert.equal(count(Array.from({ length: 8 }, (_, index) => brokenBrick({ combo: index + 1 }))), 2 * one);
  assert.equal(count([brokenBrick(), { type: 'blast', x: 0, y: 0, radius: 62 }, ...Array.from({ length: 7 }, () => brokenBrick())]), 2 * one + blast);
  assert.equal(count([brokenBrick()]), one, 'the next step sounds again');
});

test('every other event of the Bricks game has its sound', () => {
  const { board, contexts } = setup();
  const sounds = (event) => {
    const before = contexts[0]?.oscillators.length ?? 0;
    board.handle([event]);
    return contexts[0].oscillators.slice(before).map((oscillator) => `${oscillator.type}@${Math.round(oscillator.frequency.events[0][1])}`).join(' ');
  };
  const heard = [
    sounds({ type: 'brick-hit', kind: 'tough', row: 0, x: 0, y: 0, hp: 1 }),
    sounds({ type: 'brick-hit', kind: 'steel', row: 0, x: 0, y: 0, hp: 1 }),
    sounds({ type: 'strike', kind: 'thunder', x: 0, y: 0 }),
    sounds({ type: 'strike', kind: 'zigzag', x: 0, y: 0 }),
    sounds({ type: 'drop', kind: 'wide', x: 0, y: 0 }),
    sounds({ type: 'bolt-fire', x: 0, y: 0 }),
    sounds({ type: 'shield-save', x: 0, y: 0 }),
    sounds({ type: 'level-clear', level: 0, bonus: 100, last: false }),
  ];

  assert.ok(heard.every((sound) => sound.length > 0));
  assert.equal(new Set(heard).size, heard.length, 'each its own');
  assert.equal(sounds({ type: 'drop-spawn', kind: 'wide', x: 0, y: 0 }), '', 'a bonus leaving its brick is silent');
});

test('a laser volley sounds once, though it is two bolts', () => {
  const { board, contexts } = setup();
  board.handle([{ type: 'bolt-fire', x: 0, y: 0 }, { type: 'bolt-fire', x: 10, y: 0 }]);

  assert.equal(contexts[0].oscillators.length, 1);
});

test('Nova\'s events each have their sound, and the ship\'s own fire is the softest of them', () => {
  const { board, contexts } = setup();
  const sounds = (event) => {
    const before = contexts[0]?.oscillators.length ?? 0;
    board.handle([event]);
    return contexts[0].oscillators.slice(before);
  };
  const describe = (oscillators) => oscillators.map((oscillator) => `${oscillator.type}@${Math.round(oscillator.frequency.events[0][1])}`).join(' ');
  const events = [
    { type: 'ship-fire', x: 0, y: 0 },
    { type: 'enemy-hit', kind: 'drone', x: 0, y: 0, hp: 1 },
    { type: 'enemy-fire', kind: 'drone', x: 0, y: 0, count: 1 },
    ...['pebble', 'rock', 'drone', 'gunship', 'boss'].map((kind) => ({ type: 'enemy-down', kind, x: 0, y: 0, rx: 10, by: 'bolt', points: 10, multiplier: 1 })),
    { type: 'enemy-arrive', kind: 'boss', x: 0, y: 0 },
    { type: 'boss-rage', phase: 1, x: 0, y: 0 },
    { type: 'ship-hit', x: 0, y: 0 },
    { type: 'loot', kind: 'rapid', x: 0, y: 0 },
    { type: 'chain', x: 0, y: 0, targets: [] },
    { type: 'sector-clear', sector: 0, bonus: 300, last: false },
  ];
  const heard = events.map((event) => describe(sounds(event)));

  assert.ok(heard.every((sound) => sound.length > 0));
  assert.equal(new Set(heard).size, heard.length, 'each its own');
  assert.equal(describe(sounds({ type: 'loot-spawn', kind: 'rapid', x: 0, y: 0 })), '', 'a bonus leaving its enemy is silent');

  const peak = (oscillators) => Math.max(...contexts[0].gains.slice(-oscillators.length).map((gain) => Math.max(...gain.gain.events.filter((entry) => entry[0] === 'ramp').map((entry) => entry[1]))));
  const fire = sounds({ type: 'ship-fire', x: 0, y: 0 });
  assert.ok(peak(fire) <= 0.05, 'five times a second for minutes: felt more than heard');
});

test('a super fired in Nova sounds as the same super does in a match', () => {
  const { board, contexts } = setup();
  const count = (events) => {
    const before = contexts[0]?.oscillators.length ?? 0;
    board.handle(events);
    return contexts[0].oscillators.slice(before).map((oscillator) => `${oscillator.type}@${oscillator.frequency.events[0][1]}`).join(' ');
  };
  const plain = count([{ ...hit(1) }]);
  const match = count([{ ...hit(1), super: 'thunder' }]);

  assert.equal(count([{ type: 'super-fire', kind: 'thunder', x: 0, y: 0 }]), match.slice(plain.length + 1));
});

test('however much goes down, is hit or fires in one step, only a little of it sounds', () => {
  const { board, contexts } = setup();
  const count = (events) => {
    const before = contexts[0]?.oscillators.length ?? 0;
    board.handle(events);
    return contexts[0].oscillators.length - before;
  };
  const pebble = { type: 'enemy-down', kind: 'pebble', x: 0, y: 0, rx: 13, by: 'bolt', points: 10, multiplier: 1 };
  const one = count([pebble]);

  assert.equal(count(Array.from({ length: 6 }, () => pebble)), 2 * one);
  assert.equal(count([{ type: 'enemy-hit', kind: 'boss', x: 0, y: 0, hp: 9 }, { type: 'enemy-hit', kind: 'boss', x: 0, y: 0, hp: 8 }, { type: 'enemy-fire', kind: 'boss', x: 0, y: 0, count: 12 }]), 1);
});

test('Warp\'s events each have their sound, and a rival\'s crash is only a distant thud', () => {
  const { board, contexts } = setup();
  const sounds = (event) => {
    board.handle([event]);
    const all = contexts[0]?.oscillators ?? [];
    const fresh = all.slice(all.counted ?? 0);
    all.counted = all.length;
    return fresh;
  };
  const describe = (oscillators) => oscillators.map((oscillator) => `${oscillator.type}@${Math.round(oscillator.frequency.events[0][1])}`).join(' ');
  const events = [
    { type: 'ring', grade: 'perfect', chain: 1, z: 0, x: 0, points: 50 },
    { type: 'ring', grade: 'good', chain: 0, z: 0, x: 0, points: 20 },
    { type: 'boost', z: 0, x: 0, by: 'pad' },
    { type: 'boost', z: 0, x: 0, by: 'slingshot' },
    { type: 'crash', z: 0, x: 0, kind: 'mine' },
    { type: 'crash', z: 0, x: 0, kind: 'mine', pilot: 2 },
    { type: 'near-miss', z: 0, x: 0, points: 40 },
    { type: 'bump', z: 0, x: 0 },
    { type: 'takedown', pilot: 1, z: 0, x: 0, points: 150, by: 'guns' },
    { type: 'takedown', pilot: 1, z: 0, x: 0, points: 150, by: 'ram' },
    { type: 'nitro', z: 0, x: 0 },
    { type: 'gun-fire', z: 0, x: 0 },
    { type: 'rocket-launch', pilot: 1, z: 0, x: 0 },
    { type: 'explosion', z: 0, x: 0 },
    { type: 'ammo', kind: 'rocket', z: 0, x: 0 },
    { type: 'ammo', kind: 'nitro', z: 0, x: 0 },
    { type: 'shield-hit', z: 0, x: 0, left: 0 },
    { type: 'warp-system', system: 'guns', z: 0, x: 0 },
    { type: 'warp-system', system: 'shield', z: 0, x: 0 },
    { type: 'craft-ability', kind: 'jet', z: 0, x: 0 },
    { type: 'story-complete', race: 0, points: 180, reward: 'nitro' },
    { type: 'smash', kind: 'cargo', z: 0, x: 0, points: 60 },
    { type: 'overtake', place: 2, pilot: 1, points: 50 },
    { type: 'overtaken', place: 3, pilot: 1 },
    { type: 'slipstream', z: 0, x: 0 },
    { type: 'lightning', targets: [] },
    { type: 'shockwave', z: 0, x: 0 },
    { type: 'final-stretch' },
    { type: 'race-finish', race: 0, place: 1, points: 1000, qualified: true, last: false, margin: 1 },
    { type: 'race-finish', race: 0, place: 3, points: 400, qualified: true, last: false, margin: 1 },
    { type: 'ring', grade: 'perfect', chain: 1, air: true, z: 0, x: 0, points: 100 },
    { type: 'boost', z: 0, x: 0, by: 'drift' },
    { type: 'boost', z: 0, x: 0, by: 'start' },
    { type: 'jump', z: 0, x: 0 },
    { type: 'land', z: 0, x: 0, points: 60 },
    { type: 'gate', grade: 'perfect', z: 0, x: 0, points: 40 },
    { type: 'gate', grade: 'good', z: 0, x: 0, points: 0 },
    { type: 'drift-ready', z: 0, x: 0 },
    { type: 'flow', multiplier: 2 },
    { type: 'flow', multiplier: 4 },
    { type: 'mine-drop', pilot: 4, z: 0, x: 0 },
  ];
  const heard = events.map((event) => describe(sounds(event)));

  assert.ok(heard.every((sound) => sound.length > 0), heard.join(' | '));
  assert.ok(heard.every((sound) => !sound.includes('NaN')), 'every note is a real pitch');
  assert.equal(new Set(heard).size, heard.length, 'each its own');
  assert.equal(describe(sounds({ type: 'ring', grade: 'miss', chain: 0, z: 0, x: 0, points: 0 })), '', 'a ring missed is silent');
  assert.equal(describe(sounds({ type: 'boost', z: 0, x: 0, by: 'super' })), '', 'a super\'s boost is the super\'s sound');
  assert.equal(describe(sounds({ type: 'jump', z: 0, x: 0, pilot: 1 })), '', 'a rival\'s jump is seen, not heard');
  assert.equal(describe(sounds({ type: 'race-finish', race: 0, place: 5, points: 100, qualified: false, last: false, margin: 1 })), '', 'a race not gone through is told by the credit lost');
});

test('a chain of rings flown dead center chimes higher ring by ring, up to a point', () => {
  const { board, contexts } = setup();
  const pitch = (chain) => {
    board.handle([{ type: 'ring', grade: 'perfect', chain, z: 0, x: 0, points: 50 }]);
    return contexts[0].oscillators.at(-2).frequency.events[0][1];
  };

  assert.ok(pitch(1) < pitch(2) && pitch(2) < pitch(5));
  assert.equal(pitch(8), pitch(12), 'it stops climbing');
});

test('however many rivals crash in one step, only one of them is heard', () => {
  const { board, contexts } = setup();
  const count = (events) => {
    const before = contexts[0]?.oscillators.length ?? 0;
    board.handle(events);
    return contexts[0].oscillators.length - before;
  };
  const wreck = (pilot) => ({ type: 'crash', z: 0, x: 0, kind: 'debris', pilot });
  const one = count([wreck(1)]);

  assert.equal(count([wreck(1), wreck(2), wreck(3)]), one);
  assert.equal(count([wreck(1), { type: 'crash', z: 0, x: 0, kind: 'mine' }]) > one, true, 'the player\'s own always sounds');
});
