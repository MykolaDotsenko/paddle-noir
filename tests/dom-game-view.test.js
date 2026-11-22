import test from 'node:test';
import assert from 'node:assert/strict';
import { setImmediate as nextTick } from 'node:timers/promises';

import { DomGameView } from '../src/adapters/dom-game-view.js';
import { highScores } from '../src/application/high-scores.js';
import { GAME_COMMAND } from '../src/application/ports.js';
import { HIGH_SCORES } from '../src/catalog.js';
import { GAME_PHASE } from '../src/domain/game.js';

// A small stand-in for the DOM: elements with attributes, found by [name] or [name="value"].
class FakeElement extends EventTarget {
  constructor(attributes = {}) {
    super();
    this.attributes = new Map(Object.entries(attributes));
    this.dataset = {};
    this.hidden = false;
    this.textContent = '';
    this.innerHTML = '';
    this.offsetWidth = 100;
    this.children = [];
    this.focusCalls = [];
    this.ownerDocument = { createElement: () => new FakeElement() };
    this.classes = new Set();
    this.classList = {
      add: (name) => this.classes.add(name),
      remove: (name) => this.classes.delete(name),
      toggle: (name, force) => (force ? this.classes.add(name) : this.classes.delete(name)),
    };

    for (const [name, value] of this.attributes) {
      if (name.startsWith('data-')) {
        const key = name.slice(5).replace(/-([a-z])/g, (_, letter) => letter.toUpperCase());
        this.dataset[key] = value;
      }
    }
  }

  set className(value) {
    this.classes = new Set(value.split(' '));
  }

  get className() {
    return [...this.classes].join(' ');
  }

  appendChild(child) {
    this.children.push(child);
  }

  replaceChildren(...nodes) {
    this.children = nodes;
    this.textContent = nodes.map((node) => (typeof node === 'string' ? node : node.textContent)).join('');
  }

  setAttribute(name, value) {
    this.attributes.set(name, value);
  }

  getAttribute(name) {
    return this.attributes.get(name) ?? null;
  }

  hasAttribute(name) {
    return this.attributes.has(name);
  }

  removeAttribute(name) {
    this.attributes.delete(name);
  }

  focus(options) {
    this.focusCalls.push(options);
  }

  toggleAttribute(name, force) {
    if (force) this.attributes.set(name, '');
    else this.attributes.delete(name);
  }

  matches(selector) {
    const [, name, value] = selector.match(/^\[([\w-]+)(?:="([^"]*)")?\]$/) ?? [];
    return this.attributes.has(name) && (value === undefined || this.attributes.get(name) === value);
  }
}

// A <dialog>: showModal() opens it as a modal, close() closes it and announces 'close',
// as browsers do for the close button and for Escape alike.
class FakeDialog extends FakeElement {
  showModal() {
    this.modal = true;
    this.setAttribute('open', '');
  }

  close() {
    this.modal = false;
    this.removeAttribute('open');
    this.dispatchEvent(new Event('close'));
  }
}

function createRoot({ modalDialogs = true } = {}) {
  const elements = [
    ['status', { 'data-game-status': '' }],
    ['scoreboard', { 'data-scoreboard': '' }],
    ['playerScore', { 'data-score': 'player' }],
    ['opponentScore', { 'data-score': 'opponent' }],
    ['playerLabel', { 'data-label': 'player' }],
    ['opponentLabel', { 'data-label': 'opponent' }],
    ['lives', { 'data-lives': '' }],
    ['matchPoint', { 'data-match-point': '' }],
    ['menu', { 'data-overlay': 'menu' }],
    ['tutorial', { 'data-overlay': 'tutorial' }],
    ['settings', { 'data-overlay': 'settings' }],
    ['pause', { 'data-overlay': 'pause' }],
    ['over', { 'data-overlay': 'over' }],
    ['hudPause', { 'data-hud-pause': '', 'data-command': 'toggle-pause' }],
    ['fullscreen', { 'data-fullscreen': '' }],
    ['hudSound', { 'data-setting': 'sound' }],
    ['settingsSound', { 'data-setting': 'sound' }],
    ['music', { 'data-setting': 'music' }],
    ['settingsTrack', { 'data-track': '' }],
    ['settingsTrackLabel', { 'data-track-label': '' }],
    ['pauseTrack', { 'data-track': '' }],
    ['pauseTrackLabel', { 'data-track-label': '' }],
    ['powerUps', { 'data-setting': 'powerUps' }],
    ['supers', { 'data-setting': 'supers' }],
    ['vibration', { 'data-setting': 'vibration' }],
    ['jokes', { 'data-setting': 'jokes' }],
    ['solo', { 'data-mode': 'solo' }],
    ['rush', { 'data-mode': 'rush' }],
    ['duo', { 'data-mode': 'duo' }],
    ['career', { 'data-mode': 'career' }],
    ['bricks', { 'data-mode': 'bricks' }],
    ['nova', { 'data-mode': 'nova' }],
    ['tutorialNova', { 'data-nova-only': '' }],
    ['warp', { 'data-mode': 'warp' }],
    ['tutorialWarp', { 'data-warp-only': '' }],
    ['hangarCard', { 'data-warp-only': '', 'data-show-hangar': '' }],
    ['hangarCraft', { 'data-hangar-craft': '' }],
    ['hangarTickets', { 'data-hangar-tickets': '' }],
    ['overTickets', { 'data-over-tickets': '' }],
    ['tutorialBricks', { 'data-bricks-only': '' }],
    ['tutorialMatch', { 'data-match-only': '' }],
    ['tutorialBall', { 'data-ball-only': '' }],
    ['rivalGroup', { 'data-career-only': '' }],
    ['rivalPrevious', { 'data-rival-step': '-1' }],
    ['rivalNext', { 'data-rival-step': '1' }],
    ['rivalPlace', { 'data-rival-place': '' }],
    ['rivalName', { 'data-rival-name': '' }],
    ['rivalBoss', { 'data-rival-boss': '' }],
    ['rivalTired', { 'data-rival-tired': '' }],
    ['rivalStars', { 'data-rival-stars': '' }],
    ['rivalEmblem', { 'data-rival-emblem': '' }],
    ['versus', { 'data-versus': '' }],
    ['versusEmblem', { 'data-versus-emblem': '' }],
    ['versusTag', { 'data-versus-tag': '' }],
    ['versusName', { 'data-versus-name': '' }],
    ['versusYou', { 'data-versus-you': '' }],
    ['scoresCard', { 'data-rush-only': '', 'data-show-scores': '' }],
    ['scoresPlace', { 'data-scores-place': '' }],
    ['scoresNext', { 'data-scores-next': '' }],
    ['scores', { 'data-overlay': 'scores' }],
    ['scoresAbout', { 'data-scores-about': '' }],
    ['scoresRows', { 'data-scores-rows': '' }],
    ['scoresActions', { 'data-scores-actions': '' }],
    ['signOpen', { 'data-sign-open': '' }],
    ['dismissScores', { 'data-dismiss-scores': '' }],
    ['sign', { 'data-sign': '' }],
    ['signSlots', { 'data-sign-slots': '' }],
    ['letterA', { 'data-letter': 'A' }],
    ['letterK', { 'data-letter': 'K' }],
    ['letterM', { 'data-letter': 'M' }],
    ['letterY', { 'data-letter': 'Y' }],
    ['letterDelete', { 'data-letter-delete': '' }],
    ['signActions', { 'data-sign-actions': '' }],
    ['signCancel', { 'data-sign-cancel': '' }],
    ['signOk', { 'data-sign-ok': '' }],
    ['difficultyGroup', { 'data-solo-only': '' }],
    ['easy', { 'data-difficulty': 'easy' }],
    ['normal', { 'data-difficulty': 'normal' }],
    ['hard', { 'data-difficulty': 'hard' }],
    ['play', { 'data-command': 'start' }],
    ['resume', { 'data-command': 'toggle-pause', 'data-focus': 'pause' }],
    ['playAgain', { 'data-command': 'start', 'data-focus': 'over' }],
    ['restart', { 'data-command': 'restart' }],
    ['menuButton', { 'data-command': 'reset' }],
    ['bogus', { 'data-command': 'self-destruct' }],
    ['menuMeta', { 'data-menu-meta': '' }],
    ['stats', { 'data-stats': '' }],
    ['showTutorial', { 'data-show-tutorial': '' }],
    ['dismissTutorial', { 'data-dismiss-tutorial': '' }],
    ['showSettings', { 'data-show-settings': '' }],
    ['dismissSettings', { 'data-dismiss-settings': '' }],
    ['share', { 'data-share': '' }],
    ['shareNote', { 'data-share-note': '' }],
    ['overTitle', { 'data-over-title': '' }],
    ['overScore', { 'data-over-score': '' }],
    ['overRally', { 'data-over-rally': '' }],
    ['overMeta', { 'data-over-meta': '' }],
    ['overQuote', { 'data-over-quote': '' }],
    ['overQuoteText', { 'data-over-quote-text': '' }],
    ['overQuoteEmblem', { 'data-over-quote-emblem': '' }],
    ['overScores', { 'data-over-scores': '', 'data-show-scores': '' }],
    ['standingRows', { 'data-standing-rows': '' }],
    ['standingNote', { 'data-standing-note': '' }],
    ['standingHint', { 'data-standing-hint': '' }],
    ['overDifficulty', { 'data-over-difficulty': '' }],
    ['overBest', { 'data-over-best': '' }],
    ['overBestRush', { 'data-over-best-rush': '' }],
    ['overBestBricks', { 'data-over-best-bricks': '' }],
    ['overBestNova', { 'data-over-best-nova': '' }],
    ['overBestWarp', { 'data-over-best-warp': '' }],
    ['overWall', { 'data-over-wall': '' }],
    ['overChampion', { 'data-over-champion': '' }],
    ['continueLine', { 'data-continue': '', 'aria-hidden': 'true' }],
    ['overStars', { 'data-over-stars': '' }],
  ].map(([name, attributes]) => [
    name,
    ['tutorial', 'settings', 'scores'].includes(name) && modalDialogs ? new FakeDialog(attributes) : new FakeElement(attributes),
  ]);
  const byName = Object.fromEntries(elements);
  const all = elements.map(([, element]) => element);
  const board = new FakeElement({ 'data-game-canvas': '' });
  const document = { body: new FakeElement(), activeElement: null };

  return {
    ...byName,
    board,
    document,
    root: Object.assign(new EventTarget(), {
      dataset: {},
      scrolls: [],
      ownerDocument: document,
      scrollIntoView(options) {
        this.scrolls.push(options);
      },
      contains: (element) => element === board || all.includes(element),
      querySelector: (selector) => all.find((element) => element.matches(selector)) ?? null,
      querySelectorAll: (selector) => all.filter((element) => element.matches(selector)),
    }),
  };
}

const DEFAULT_STATS = { matches: 0, wins: 0, streak: 0, bestStreak: 0 };

function createPreferences(initial = {}) {
  let values = {
    mode: 'solo',
    difficulty: 'normal',
    powerUps: true,
    supers: true,
    sound: true,
    music: true,
    track: 'neon',
    jokes: true,
    vibration: true,
    tutorialSeen: true,
    bestRally: 0,
    bestRush: 0,
    initials: '',
    stats: DEFAULT_STATS,
    ...initial,
  };
  return {
    get: () => values,
    set(changes) {
      values = { ...values, ...changes };
    },
  };
}

function createDevice(overrides = {}) {
  return {
    canShare: true,
    canFullscreen: true,
    shared: [],
    fullscreenToggles: 0,
    async share(text) {
      this.shared.push(text);
      return 'shared';
    },
    async toggleFullscreen() {
      this.fullscreenToggles += 1;
    },
    ...overrides,
  };
}

const TRACKS = [{ id: 'neon', label: 'Neon' }, { id: 'arena', label: 'Arena' }, { id: 'iron', label: 'Iron' }];

function createTimers() {
  const pending = new Map();
  let nextId = 1;

  return {
    pending,
    setTimeout(callback, ms) {
      pending.set(nextId, { callback, ms });
      return nextId++;
    },
    clearTimeout(id) {
      pending.delete(id);
    },
    fire() {
      const due = [...pending.values()];
      pending.clear();
      due.forEach(({ callback }) => callback());
    },
  };
}

function setup({ canVibrate = true, preferences = createPreferences(), device = createDevice(), modalDialogs = true } = {}) {
  const dom = createRoot({ modalDialogs });
  const { board } = dom;
  const previews = [];
  const timers = createTimers();
  const view = new DomGameView({
    root: dom.root,
    board,
    preferences,
    canVibrate,
    device,
    tracks: TRACKS,
    previewTrack: (track) => previews.push(track),
    timers,
  });
  const commands = [];

  view.onCommand((command) => commands.push({ command, focusedBefore: board.focusCalls.length }));
  view.connect();

  return { view, dom, board, commands, preferences, device, previews, timers };
}

const click = (element) => element.dispatchEvent(new Event('click'));
const noModifiers = { wide: 0, tiny: 0, ghost: 0 };

function presentation(overrides = {}) {
  return {
    phase: GAME_PHASE.READY,
    mode: 'solo',
    difficulty: 'normal',
    rules: { kind: 'match', winningScore: 7 },
    opponent: { label: 'CPU', name: 'Computer', proper: false },
    status: 'First to 7. Start when ready.',
    score: { player: 0, opponent: 0 },
    hits: { player: 0, opponent: 0 },
    lives: 0,
    maxLives: 0,
    rally: 0,
    longestRally: 0,
    bestRally: 0,
    newBest: false,
    bestRush: 0,
    newBestRush: false,
    matchPoint: null,
    modifiers: { player: noModifiers, opponent: noModifiers },
    stats: DEFAULT_STATS,
    winner: null,
    career: null,
    highScores: null,
    bricks: null,
    nova: null,
    warp: null,
    ...overrides,
  };
}

test('a command button brings the whole court into view', () => {
  const { dom } = setup();

  click(dom.play);

  assert.deepEqual(dom.root.scrolls, [{ block: 'nearest' }]);
});

test('command buttons hand focus back to the board before sending their command', () => {
  const { dom, board, commands } = setup();

  click(dom.play);
  click(dom.hudPause);
  click(dom.restart);
  click(dom.menuButton);
  click(dom.bogus);

  assert.deepEqual(commands, [
    { command: GAME_COMMAND.START, focusedBefore: 1 },
    { command: GAME_COMMAND.TOGGLE_PAUSE, focusedBefore: 2 },
    { command: GAME_COMMAND.RESTART, focusedBefore: 3 },
    { command: GAME_COMMAND.RESET, focusedBefore: 4 },
  ]);
  assert.deepEqual(board.focusCalls[0], { preventScroll: true });
});

const tutorialOpen = (dom) => dom.tutorial.hasAttribute('open');

test('overlays and the pause button follow the match phase', () => {
  const { view, dom, timers } = setup();
  const visible = () => ['menu', 'pause', 'over'].filter((name) => !dom[name].hidden)
    .concat(tutorialOpen(dom) ? ['tutorial'] : []);

  view.render(presentation());
  assert.deepEqual(visible(), ['menu']);
  assert.equal(dom.root.dataset.phase, 'ready');
  assert.ok(dom.hudPause.attributes.has('disabled'));

  view.render(presentation({ phase: GAME_PHASE.RUNNING }));
  assert.deepEqual(visible(), []);
  assert.ok(!dom.hudPause.attributes.has('disabled'));
  assert.equal(dom.hudPause.getAttribute('aria-label'), 'Pause');

  view.render(presentation({ phase: GAME_PHASE.PAUSED }));
  assert.deepEqual(visible(), ['pause']);
  assert.equal(dom.hudPause.getAttribute('aria-label'), 'Resume');

  view.render(presentation({ phase: GAME_PHASE.GAME_OVER, winner: 'player' }));
  assert.ok(dom.hudPause.attributes.has('disabled'), 'disabled already while the finisher plays');
  timers.fire();
  assert.deepEqual(visible(), ['over']);
});

test('mode buttons choose the next match, show the right options, and refresh the menu', () => {
  const { dom, preferences, commands } = setup();
  const pressed = () => ['solo', 'rush', 'duo'].filter((mode) => dom[mode].getAttribute('aria-pressed') === 'true');

  assert.deepEqual(pressed(), ['solo']);
  assert.equal(dom.difficultyGroup.hidden, false);

  click(dom.rush);

  assert.equal(preferences.get().mode, 'rush');
  assert.deepEqual(pressed(), ['rush']);
  assert.equal(dom.difficultyGroup.hidden, true);
  assert.equal(dom.root.dataset.mode, 'rush');
  assert.deepEqual(commands.map((entry) => entry.command), [GAME_COMMAND.RESET]);

  click(dom.duo);
  assert.equal(dom.difficultyGroup.hidden, true);
  // The power-up and supers switches live in the settings, whose notes say where they apply.
  assert.equal(dom.powerUps.hidden, false);
  assert.equal(dom.supers.hidden, false);
});

test('difficulty buttons choose the next match and show the choice', () => {
  const { dom, preferences } = setup();
  const pressed = () => ['easy', 'normal', 'hard'].filter((level) => dom[level].getAttribute('aria-pressed') === 'true');

  assert.deepEqual(pressed(), ['normal']);

  click(dom.hard);

  assert.equal(preferences.get().difficulty, 'hard');
  assert.deepEqual(pressed(), ['hard']);
});

test('setting toggles flip the preference and every matching switch', () => {
  const { dom, preferences } = setup();

  click(dom.hudSound);

  assert.equal(preferences.get().sound, false);
  assert.equal(dom.hudSound.getAttribute('aria-pressed'), 'false');
  assert.equal(dom.settingsSound.getAttribute('aria-pressed'), 'false');

  click(dom.music);
  click(dom.powerUps);
  click(dom.supers);
  click(dom.vibration);
  click(dom.jokes);
  assert.equal(preferences.get().music, false);
  assert.equal(preferences.get().powerUps, false);
  assert.equal(preferences.get().supers, false);
  assert.equal(dom.supers.getAttribute('aria-pressed'), 'false');
  assert.equal(preferences.get().vibration, false);
  assert.equal(preferences.get().jokes, false);
  assert.equal(dom.jokes.getAttribute('aria-pressed'), 'false');
});

test('the scoreboard names the rival: a nickname in its own style, else CPU or P2', () => {
  const { view, dom } = setup();
  const nick = { label: 'Vitalik95', name: 'Vitalik95', proper: true };

  view.render(presentation({ opponent: nick }));
  assert.equal(dom.opponentLabel.textContent, 'Vitalik95');
  assert.ok(dom.opponentLabel.classes.has('scoreboard__label--nick'));
  assert.ok(dom.scoreboard.classes.has('scoreboard--nick'), 'the scoreboard makes room');

  view.render(presentation({ mode: 'duo', opponent: { label: 'P2', name: 'Player 2', proper: false } }));
  assert.equal(dom.opponentLabel.textContent, 'P2');
  assert.equal(dom.playerLabel.textContent, 'P1');
  assert.equal(dom.opponentLabel.classes.has('scoreboard__label--nick'), false);
  assert.equal(dom.scoreboard.classes.has('scoreboard--nick'), false);

  view.render(presentation({ phase: GAME_PHASE.GAME_OVER, winner: 'opponent', opponent: nick }));
  assert.equal(dom.overDifficulty.textContent, 'Normal · vs Vitalik95');
});

test('the track button shows the saved track and every tap moves on, turns music on and plays a sample', () => {
  const { dom, preferences, previews } = setup({ preferences: createPreferences({ track: 'arena', music: false }) });

  assert.equal(dom.settingsTrackLabel.textContent, 'Arena');
  assert.equal(dom.pauseTrack.getAttribute('aria-label'), 'Music track: Arena');

  click(dom.settingsTrack);
  assert.equal(preferences.get().track, 'iron');
  assert.equal(preferences.get().music, true, 'a picked track is meant to be heard');
  assert.equal(dom.music.getAttribute('aria-pressed'), 'true');
  assert.equal(dom.pauseTrackLabel.textContent, 'Iron', 'both pickers follow');
  assert.equal(dom.settingsTrack.getAttribute('aria-label'), 'Music track: Iron');

  click(dom.pauseTrack);
  assert.equal(preferences.get().track, 'neon', 'wraps around to the first track');
  assert.deepEqual(previews, ['iron', 'neon']);
});

test('an unknown saved track shows as the first one', () => {
  const { dom } = setup({ preferences: createPreferences({ track: 'polka' }) });

  assert.equal(dom.settingsTrackLabel.textContent, 'Neon');
});

test('the vibration switch is hidden where the device cannot vibrate', () => {
  assert.equal(setup({ canVibrate: false }).dom.vibration.hidden, true);
  assert.equal(setup({ canVibrate: true }).dom.vibration.hidden, false);
});

test('share and full-screen buttons appear only where the browser supports them', () => {
  const capable = setup();
  assert.equal(capable.dom.share.hidden, false);
  assert.equal(capable.dom.fullscreen.hidden, false);

  click(capable.dom.fullscreen);
  assert.equal(capable.device.fullscreenToggles, 1);

  const limited = setup({ device: createDevice({ canShare: false, canFullscreen: false }) });
  assert.equal(limited.dom.share.hidden, true);
  assert.equal(limited.dom.fullscreen.hidden, true);
});

test('the tutorial opens as a modal dialog on a first visit, and dismissing it remembers that', () => {
  const preferences = createPreferences({ tutorialSeen: false });
  const { view, dom } = setup({ preferences });

  view.render(presentation());
  assert.equal(tutorialOpen(dom), true);
  assert.equal(dom.tutorial.modal, true, 'the page behind it is inert');
  assert.equal(dom.menu.hidden, false, 'the menu waits, dimmed, behind the dialog');
  assert.equal(preferences.get().tutorialSeen, false);

  click(dom.dismissTutorial);
  assert.equal(tutorialOpen(dom), false);
  assert.equal(preferences.get().tutorialSeen, true);

  click(dom.showTutorial);
  assert.equal(tutorialOpen(dom), true);
  assert.equal(dom.tutorial.modal, true);
});

test('closing the tutorial with Escape counts as having seen it, saved before it even closes', () => {
  const preferences = createPreferences({ tutorialSeen: false });
  const { dom } = setup({ preferences });

  // Escape fires 'cancel' right away; the browser announces 'close' only in a later task.
  dom.tutorial.dispatchEvent(new Event('cancel'));
  assert.equal(preferences.get().tutorialSeen, true);

  const other = createPreferences({ tutorialSeen: false });
  setup({ preferences: other }).dom.tutorial.close();
  assert.equal(other.get().tutorialSeen, true, 'any other way of closing it counts too');
});

test('without modal dialog support the tutorial still opens and closes', () => {
  const preferences = createPreferences({ tutorialSeen: false });
  const { dom } = setup({ preferences, modalDialogs: false });

  assert.equal(tutorialOpen(dom), true);

  click(dom.dismissTutorial);
  assert.equal(tutorialOpen(dom), false);
  assert.equal(preferences.get().tutorialSeen, true);
});

test('the settings open as a modal dialog from the menu, and Done closes them', () => {
  const { dom, preferences } = setup();
  const settingsOpen = () => dom.settings.hasAttribute('open');

  assert.equal(settingsOpen(), false);

  click(dom.showSettings);
  assert.equal(settingsOpen(), true);
  assert.equal(dom.settings.modal, true, 'the menu behind them is inert');

  click(dom.powerUps);
  assert.equal(preferences.get().powerUps, false, 'a switch applies as it is pressed');

  click(dom.showSettings);
  assert.equal(settingsOpen(), true, 'opening them twice changes nothing');

  click(dom.dismissSettings);
  assert.equal(settingsOpen(), false);
  assert.equal(preferences.get().powerUps, false, 'closing keeps the choice');

  click(dom.dismissSettings);
  assert.equal(settingsOpen(), false, 'closing them twice changes nothing');
});

test('without modal dialog support the settings still open and close', () => {
  const { dom } = setup({ modalDialogs: false });

  click(dom.showSettings);
  assert.equal(dom.settings.hasAttribute('open'), true);

  click(dom.dismissSettings);
  assert.equal(dom.settings.hasAttribute('open'), false);
});

test('once a match has been played, the menu comes back with its sign already lit', () => {
  const { view, dom } = setup();

  view.render(presentation());
  assert.equal(dom.root.dataset.played, undefined, 'the sign lights up on the first visit to the menu');

  view.render(presentation({ phase: GAME_PHASE.RUNNING }));
  view.render(presentation({ phase: GAME_PHASE.READY }));
  assert.equal(dom.root.dataset.played, 'true');
});

test('a returning player goes straight to the menu', () => {
  const { view, dom } = setup();

  view.render(presentation());

  assert.equal(tutorialOpen(dom), false);
  assert.equal(dom.menu.hidden, false);
});

test('the pause and result screens take keyboard focus, and play hands it back to the board', () => {
  const { view, dom, board } = setup();

  view.render(presentation());
  view.render(presentation({ phase: GAME_PHASE.RUNNING }));
  assert.equal(board.focusCalls.length, 1, 'a match started from the keyboard focuses the board');

  view.render(presentation({ phase: GAME_PHASE.PAUSED }));
  assert.deepEqual(dom.resume.focusCalls, [{ preventScroll: true }]);

  dom.document.activeElement = dom.resume;
  view.render(presentation({ phase: GAME_PHASE.RUNNING }));
  assert.equal(board.focusCalls.length, 2);

  dom.document.activeElement = board;
  view.render(presentation({ phase: GAME_PHASE.GAME_OVER, winner: 'opponent' }));
  assert.deepEqual(dom.playAgain.focusCalls, [{ preventScroll: true }]);
});

test('focus the player moved elsewhere on the page is left alone', () => {
  const { view, dom, board } = setup();
  const elsewhere = new FakeElement();

  view.render(presentation());
  dom.document.activeElement = elsewhere;
  view.render(presentation({ phase: GAME_PHASE.RUNNING }));
  view.render(presentation({ phase: GAME_PHASE.PAUSED }));

  assert.equal(board.focusCalls.length, 0);
  assert.deepEqual(dom.resume.focusCalls, []);
});

test('an unchanged status is not rewritten, keeping the live region quiet', () => {
  const { view, dom } = setup();
  let writes = 0;
  let text = '';
  Object.defineProperty(dom.status, 'textContent', {
    get: () => text,
    set: (value) => {
      writes += 1;
      text = value;
    },
  });

  for (let frame = 0; frame < 3; frame += 1) {
    view.render(presentation({ phase: GAME_PHASE.RUNNING, status: 'You 0 — 0 Computer' }));
  }
  view.render(presentation({ phase: GAME_PHASE.RUNNING, status: 'You 1 — 0 Computer' }));

  assert.equal(writes, 2);
  assert.equal(text, 'You 1 — 0 Computer');
});

test('a new point updates the scoreboard with a pop', () => {
  const { view, dom } = setup();

  view.render(presentation({ phase: GAME_PHASE.RUNNING }));
  assert.equal(dom.playerScore.classes.has('is-popping'), false);

  view.render(presentation({ phase: GAME_PHASE.RUNNING, score: { player: 1, opponent: 0 } }));

  assert.equal(dom.playerScore.textContent, '1');
  assert.ok(dom.playerScore.classes.has('is-popping'));
  assert.equal(dom.opponentScore.classes.has('is-popping'), false);
});

test('in Rush the scoreboard counts hits and shows the lives as hearts', () => {
  const { view, dom } = setup();

  view.render(presentation({ phase: GAME_PHASE.RUNNING, mode: 'rush', hits: { player: 12, opponent: 11 }, lives: 2, maxLives: 3 }));

  assert.equal(dom.playerScore.textContent, '12');
  assert.equal(dom.playerLabel.textContent, 'Hits');
  assert.equal(dom.lives.hidden, false);
  assert.deepEqual(dom.lives.children.map((heart) => heart.className), ['lives__heart', 'lives__heart', 'lives__heart lives__heart--lost']);

  view.render(presentation({ phase: GAME_PHASE.RUNNING }));
  assert.equal(dom.lives.hidden, true);
});

test('match point is announced on the side that is one point away', () => {
  const { view, dom } = setup();

  view.render(presentation({ phase: GAME_PHASE.RUNNING }));
  assert.equal(dom.matchPoint.hidden, true);

  view.render(presentation({ phase: GAME_PHASE.RUNNING, matchPoint: 'opponent' }));
  assert.equal(dom.matchPoint.hidden, false);
  assert.equal(dom.matchPoint.dataset.side, 'opponent');
});

test('the menu states the rules and the record for the chosen mode, from the match config', () => {
  const { view, dom } = setup();
  const record = () => dom.menuMeta.children.find((child) => typeof child !== 'string');

  view.render(presentation({ bestRally: 14, rules: { kind: 'match', winningScore: 11 } }));
  assert.equal(dom.menuMeta.textContent, 'First to 11 · Best rally 14');
  assert.equal(record().textContent, '14', 'the record stands out');

  view.render(presentation({ mode: 'rush', bestRush: 27, rules: { kind: 'rush', lives: 5 } }));
  assert.equal(dom.menuMeta.textContent, '5 lives · Best run 27 hits');
  assert.equal(record().textContent, '27');

  view.render(presentation({ mode: 'rush', bestRush: 1, rules: { kind: 'rush', lives: 5 } }));
  assert.equal(dom.menuMeta.textContent, '5 lives · Best run 1 hit');

  view.render(presentation({ mode: 'duo', bestRally: 14 }));
  assert.equal(dom.menuMeta.textContent, 'First to 7 · Two players, one screen', 'a Solo record is not a two-player one');
});

test('the menu shows Solo win statistics, with the streak flame hidden from screen readers', () => {
  const { view, dom } = setup();

  view.render(presentation({ stats: { matches: 5, wins: 3, streak: 2, bestStreak: 2 } }));
  assert.equal(dom.stats.hidden, false);
  assert.equal(dom.stats.textContent, '3/5 won (60%) · 2 in a row 🔥');
  const flame = dom.stats.children.find((child) => typeof child !== 'string');
  assert.equal(flame.getAttribute('aria-hidden'), 'true');

  view.render(presentation({ stats: { matches: 5, wins: 3, streak: 0, bestStreak: 2 } }));
  assert.equal(dom.stats.textContent, '3/5 won (60%)');

  view.render(presentation({ mode: 'rush' }));
  assert.equal(dom.stats.hidden, true);
});

test('win statistics stay hidden until a Solo match has been played', () => {
  const { view, dom } = setup();

  view.render(presentation({ stats: DEFAULT_STATS }));

  assert.equal(dom.stats.hidden, true);
});

test('the result screen shows the winner, score, rally, difficulty and a new record', () => {
  const { view, dom } = setup({ preferences: createPreferences({ difficulty: 'hard' }) });

  view.render(presentation({ phase: GAME_PHASE.RUNNING }));
  view.render(presentation({
    phase: GAME_PHASE.GAME_OVER,
    difficulty: 'hard',
    score: { player: 7, opponent: 5 },
    longestRally: 12,
    bestRally: 12,
    newBest: true,
    winner: 'player',
  }));

  assert.equal(dom.overTitle.textContent, 'Victory');
  assert.equal(dom.overTitle.dataset.winner, 'player');
  assert.equal(dom.overScore.textContent, '7 : 5');
  assert.equal(dom.overRally.textContent, '12');
  assert.equal(dom.overDifficulty.textContent, 'Hard');
  assert.equal(dom.overBest.hidden, false);
  assert.equal(dom.overBestRush.hidden, true);

  view.render(presentation({ phase: GAME_PHASE.RUNNING }));
  view.render(presentation({ phase: GAME_PHASE.GAME_OVER, score: { player: 2, opponent: 7 }, winner: 'opponent' }));
  assert.equal(dom.overTitle.textContent, 'Defeat');
  assert.equal(dom.overBest.hidden, true);
});

test('a Rush result reports the run and its record', () => {
  const { view, dom } = setup();

  view.render(presentation({ phase: GAME_PHASE.RUNNING, mode: 'rush' }));
  view.render(presentation({ phase: GAME_PHASE.GAME_OVER, mode: 'rush', hits: { player: 31, opponent: 30 }, winner: 'opponent', newBestRush: true }));

  assert.equal(dom.overTitle.textContent, 'Run over');
  assert.equal(dom.overScore.textContent, '31 hits');
  assert.equal(dom.overDifficulty.textContent, 'Rush');
  assert.equal(dom.overBestRush.hidden, false);

  view.render(presentation({ phase: GAME_PHASE.RUNNING, mode: 'rush' }));
  view.render(presentation({ phase: GAME_PHASE.GAME_OVER, mode: 'rush', hits: { player: 1, opponent: 1 }, winner: 'opponent' }));
  assert.equal(dom.overScore.textContent, '1 hit', 'one hit is one hit');
});

test('sharing sends a summary of the last result and reports what happened', async () => {
  const { view, dom, device } = setup();

  view.render(presentation({ phase: GAME_PHASE.RUNNING }));
  view.render(presentation({ phase: GAME_PHASE.GAME_OVER, score: { player: 7, opponent: 3 }, longestRally: 9, winner: 'player' }));
  click(dom.share);
  await nextTick();

  assert.equal(device.shared[0], 'I won 7:3 on Normal in Paddle Noir. Longest rally: 9.');
  assert.equal(dom.shareNote.textContent, '');

  device.share = async () => 'copied';
  click(dom.share);
  await nextTick();
  assert.equal(dom.shareNote.textContent, 'Copied to clipboard');
});

test('disconnect unbinds every control', () => {
  const { view, dom, commands, preferences } = setup();

  view.disconnect();
  click(dom.play);
  click(dom.hard);
  click(dom.rush);

  assert.deepEqual(commands, []);
  assert.equal(preferences.get().difficulty, 'normal');
  assert.equal(preferences.get().mode, 'solo');
});

test('a missing element is reported by name', () => {
  const { root } = createRoot();
  const incomplete = { ...root, querySelector: (selector) => (selector === '[data-game-status]' ? null : root.querySelector(selector)) };

  assert.throws(
    () => new DomGameView({ root: incomplete, board: { focus() {} }, preferences: createPreferences(), canVibrate: true, device: createDevice() }),
    /\[data-game-status\] is missing/,
  );
});

test('a won match keeps the result screen back while the finisher plays, then brings it with focus', () => {
  const { view, dom, timers } = setup();

  view.render(presentation({ phase: GAME_PHASE.RUNNING }));
  view.render(presentation({ phase: GAME_PHASE.GAME_OVER, winner: 'player' }));

  assert.equal(dom.over.hidden, true);
  assert.equal(timers.pending.size, 1);
  assert.ok([...timers.pending.values()][0].ms <= 1200);

  timers.fire();
  assert.equal(dom.over.hidden, false);
  assert.equal(dom.playAgain.focusCalls.length, 1);
});

/** A key press as the court sees it, recording whether the view kept it from going further. */
function keyPress(overrides = {}) {
  const event = Object.assign(new Event('keydown', { cancelable: true }), {
    code: 'Space', repeat: false, ctrlKey: false, metaKey: false, altKey: false, ...overrides,
  });
  event.stopped = false;
  event.stopPropagation = () => {
    event.stopped = true;
  };
  return event;
}

function finishing() {
  const context = setup();
  context.view.render(presentation({ phase: GAME_PHASE.RUNNING }));
  context.view.render(presentation({ phase: GAME_PHASE.GAME_OVER, winner: 'player' }));
  return context;
}

test('a tap on the court or a key skips the finisher and shows the result at once', () => {
  for (const event of [() => new Event('click'), () => keyPress()]) {
    const { dom, timers } = finishing();
    const type = event().type;

    dom.root.dispatchEvent(event());
    assert.equal(dom.over.hidden, false, type);
    assert.equal(timers.pending.size, 0, `${type} cancels the wait`);
    assert.equal(dom.playAgain.focusCalls.length, 1, `${type} hands focus to Play again`);

    dom.root.dispatchEvent(event());
    assert.equal(dom.playAgain.focusCalls.length, 1, 'a second one changes nothing');
  }
});

test('a key that skips the finisher goes no further, so Space cannot also start the next match', () => {
  const { dom } = finishing();
  const space = keyPress();

  dom.root.dispatchEvent(space);
  assert.equal(space.defaultPrevented, true);
  assert.equal(space.stopped, true);

  // Once the result screen is up, keys mean what they always do.
  const next = keyPress();
  dom.root.dispatchEvent(next);
  assert.equal(next.defaultPrevented, false);
  assert.equal(next.stopped, false);
});

test('a held key and shortcuts with a modifier do not skip the finisher', () => {
  for (const overrides of [{ repeat: true, code: 'ArrowLeft' }, { ctrlKey: true, code: 'KeyR' }, { metaKey: true }, { altKey: true }]) {
    const { dom, timers } = finishing();
    const key = keyPress(overrides);

    dom.root.dispatchEvent(key);
    assert.equal(dom.over.hidden, true, JSON.stringify(overrides));
    assert.equal(timers.pending.size, 1);
    assert.equal(key.defaultPrevented, false);
    assert.equal(key.stopped, false);
  }
});

test('the result comes at once when no finisher plays: a defeat, a Rush run, or the fun extras off', () => {
  const cases = [
    [createPreferences(), presentation({ phase: GAME_PHASE.GAME_OVER, winner: 'opponent' })],
    [createPreferences({ mode: 'rush' }), presentation({ phase: GAME_PHASE.GAME_OVER, mode: 'rush', winner: 'opponent' })],
    [createPreferences({ jokes: false }), presentation({ phase: GAME_PHASE.GAME_OVER, winner: 'player' })],
  ];

  for (const [preferences, result] of cases) {
    const { view, dom, timers } = setup({ preferences });
    view.render(presentation({ phase: GAME_PHASE.RUNNING, mode: result.mode }));
    view.render(result);
    assert.equal(dom.over.hidden, false);
    // Nothing waits; a loss with the fun extras on only starts the "Continue?" countdown.
    const countdown = result.winner === 'opponent' && preferences.get().jokes;
    assert.deepEqual([...timers.pending.values()].map(({ ms }) => ms), countdown ? [1000] : []);
  }

  // Between two people the second player's win is finished too.
  const duo = { mode: 'duo', opponent: { label: 'P2', name: 'Player 2', proper: false } };
  const { view, dom, timers } = setup({ preferences: createPreferences({ mode: 'duo' }) });
  view.render(presentation({ ...duo, phase: GAME_PHASE.RUNNING }));
  view.render(presentation({ ...duo, phase: GAME_PHASE.GAME_OVER, winner: 'opponent' }));
  assert.equal(dom.over.hidden, true);
  assert.equal(timers.pending.size, 1);
});

test('after a loss to the computer, "Continue?" counts down a second a step, then gives up', () => {
  const { view, dom, timers } = setup();

  view.render(presentation({ phase: GAME_PHASE.RUNNING }));
  view.render(presentation({ phase: GAME_PHASE.GAME_OVER, winner: 'opponent' }));

  assert.equal(dom.over.hidden, false, 'the result screen comes at once');
  assert.equal(dom.continueLine.hidden, false);
  assert.equal(dom.continueLine.textContent, 'Continue? 9');
  assert.equal(dom.continueLine.getAttribute('aria-hidden'), 'true', 'decoration, which screen readers skip');
  assert.deepEqual([...timers.pending.values()].map(({ ms }) => ms), [1000]);

  for (let count = 8; count >= 0; count -= 1) {
    timers.fire();
    assert.equal(dom.continueLine.textContent, `Continue? ${count}`);
    assert.equal(dom.continueLine.dataset.state, 'counting');
  }

  timers.fire();
  assert.equal(dom.continueLine.textContent, 'Game over');
  assert.equal(dom.continueLine.dataset.state, 'over');
  assert.equal(timers.pending.size, 0, 'and stops there');
  assert.ok(dom.continueLine.classes.has('is-ticking'), 'each step pops');
});

test('a Rush run counts down too; a win, a two-player match or the fun extras off do not', () => {
  const duo = { mode: 'duo', opponent: { label: 'P2', name: 'Player 2', proper: false } };
  const cases = [
    [createPreferences({ mode: 'rush' }), { mode: 'rush', winner: 'opponent' }, true],
    [createPreferences(), { winner: 'player' }, false],
    [createPreferences({ mode: 'duo' }), { ...duo, winner: 'opponent' }, false],
    [createPreferences({ jokes: false }), { winner: 'opponent' }, false],
  ];

  for (const [preferences, result, counts] of cases) {
    const { view, dom } = setup({ preferences });
    view.render(presentation({ ...result, phase: GAME_PHASE.RUNNING, winner: null }));
    view.render(presentation({ ...result, phase: GAME_PHASE.GAME_OVER }));
    assert.equal(dom.continueLine.hidden, !counts, JSON.stringify(result));
  }
});

test('leaving the result screen stops the countdown, and the next loss starts it again from 9', () => {
  const { view, dom, timers } = setup();
  const lose = () => {
    view.render(presentation({ phase: GAME_PHASE.RUNNING }));
    view.render(presentation({ phase: GAME_PHASE.GAME_OVER, winner: 'opponent' }));
  };

  lose();
  timers.fire();
  timers.fire();
  assert.equal(dom.continueLine.textContent, 'Continue? 7');

  view.render(presentation({ phase: GAME_PHASE.RUNNING }));
  assert.equal(timers.pending.size, 0);

  lose();
  assert.equal(dom.continueLine.textContent, 'Continue? 9');
  view.disconnect();
  assert.equal(timers.pending.size, 0);
});

test('leaving for the menu during the finisher drops the wait, so the result never pops up over the menu', () => {
  const { view, dom, timers } = setup();

  view.render(presentation({ phase: GAME_PHASE.RUNNING }));
  view.render(presentation({ phase: GAME_PHASE.GAME_OVER, winner: 'player' }));
  view.render(presentation({ phase: GAME_PHASE.READY }));

  assert.equal(timers.pending.size, 0);
  assert.equal(dom.over.hidden, true);
  assert.equal(dom.menu.hidden, false);

  view.disconnect();
  assert.equal(timers.pending.size, 0);
});

// The career: the rival picker, the ladder in the menu, and the result of a career match.

const RIVAL_VIEW = {
  name: 'The Janitor',
  short: 'Janitor',
  story: 'Mops the floor with players.',
  emblem: 'bucket',
  says: { winning: 'Mind the wet floor.', beaten: 'Now I have to mop up my pride.' },
  boss: true,
};

function careerView(overrides = {}) {
  return {
    index: 3,
    count: 9,
    unlocked: 5,
    rival: RIVAL_VIEW,
    stars: 2,
    earned: 0,
    eased: false,
    next: null,
    totalStars: 11,
    beaten: 5,
    ...overrides,
  };
}

const inCareer = (overrides = {}, career = {}) => presentation({
  mode: 'career',
  opponent: { label: 'Janitor', name: 'The Janitor', proper: true },
  career: careerView(career),
  ...overrides,
});

test('Career shows the rival picker instead of the difficulty', () => {
  const { dom } = setup({ preferences: createPreferences({ mode: 'career' }) });

  assert.equal(dom.rivalGroup.hidden, false);
  assert.equal(dom.difficultyGroup.hidden, true);

  click(dom.solo);
  assert.equal(dom.rivalGroup.hidden, true);
  assert.equal(dom.difficultyGroup.hidden, false);
});

test('the rival card shows its place on the ladder, its name, a boss tag and its stars', () => {
  const { view, dom } = setup({ preferences: createPreferences({ mode: 'career' }) });

  view.render(inCareer());

  assert.equal(dom.rivalPlace.textContent, '4/9');
  assert.equal(dom.rivalName.textContent, 'The Janitor');
  assert.equal(dom.rivalEmblem.getAttribute('href'), '#emblem-bucket');
  assert.equal(dom.rivalBoss.hidden, false);
  assert.equal(dom.rivalTired.hidden, true);
  assert.equal(dom.rivalStars.textContent, '★★☆2 of 3 stars');
  assert.equal(dom.rivalStars.children[0].getAttribute('aria-hidden'), 'true', 'the glyphs are decoration');
  assert.equal(dom.menuMeta.textContent, 'Mops the floor with players.');
  assert.equal(dom.stats.hidden, false);
  assert.equal(dom.stats.textContent, '5 of 9 beaten · 11/27 stars');

  view.render(inCareer({}, { eased: true, rival: { ...RIVAL_VIEW, boss: false } }));
  assert.equal(dom.rivalBoss.hidden, true);
  assert.equal(dom.rivalTired.hidden, false);
  assert.equal(dom.menuMeta.textContent, 'After beating you twice, The Janitor is tired and plays slower.', 'the story makes way for why');
});

test('the rival steps move along the open part of the ladder and redraw the menu', () => {
  const { view, dom, commands, preferences } = setup({ preferences: createPreferences({ mode: 'career' }) });

  view.render(inCareer({}, { index: 3, unlocked: 3 }));
  assert.equal(dom.rivalNext.hasAttribute('disabled'), true, 'the next rival is not open yet');
  assert.equal(dom.rivalPrevious.hasAttribute('disabled'), false);

  click(dom.rivalNext);
  assert.deepEqual(commands, [], 'a closed rung does nothing');

  click(dom.rivalPrevious);
  assert.equal(preferences.get().rival, 2);
  assert.deepEqual(commands.map(({ command }) => command), [GAME_COMMAND.RESET]);

  view.render(inCareer({}, { index: 0, unlocked: 3 }));
  assert.equal(dom.rivalPrevious.hasAttribute('disabled'), true);
  click(dom.rivalPrevious);
  assert.equal(preferences.get().rival, 2, 'nothing before the first rival');
});

test('a career result shows the stars earned, and a win takes on the next rival from the same button', () => {
  const { view, dom } = setup({ preferences: createPreferences({ mode: 'career', jokes: false }) });

  view.render(inCareer({ phase: GAME_PHASE.RUNNING }));
  view.render(inCareer({ phase: GAME_PHASE.GAME_OVER, winner: 'player', score: { player: 7, opponent: 3 } }, { earned: 2, next: 'Hoarder Hryts' }));

  assert.equal(dom.overTitle.textContent, 'Victory');
  assert.equal(dom.overDifficulty.textContent, 'Career 4/9 · vs The Janitor');
  assert.equal(dom.overStars.hidden, false);
  assert.equal(dom.overStars.textContent, '★★☆2 of 3 stars');
  assert.equal(dom.playAgain.textContent, 'Next rival');
  assert.equal(dom.continueLine.hidden, true);

  view.render(inCareer({ phase: GAME_PHASE.RUNNING }));
  view.render(inCareer({ phase: GAME_PHASE.GAME_OVER, winner: 'opponent', score: { player: 2, opponent: 7 } }));
  assert.equal(dom.overTitle.textContent, 'Defeat');
  assert.equal(dom.overStars.hidden, true);
  assert.equal(dom.playAgain.textContent, 'Play again');
});

test('a career loss counts down "Continue?", and beating the final boss makes a champion', () => {
  const { view, dom, timers } = setup({ preferences: createPreferences({ mode: 'career' }) });

  view.render(inCareer({ phase: GAME_PHASE.RUNNING }));
  view.render(inCareer({ phase: GAME_PHASE.GAME_OVER, winner: 'opponent' }));
  assert.equal(dom.continueLine.textContent, 'Continue? 9');
  assert.equal(dom.overChampion.hidden, true);

  view.render(inCareer({ phase: GAME_PHASE.RUNNING }, { index: 8 }));
  view.render(inCareer({ phase: GAME_PHASE.GAME_OVER, winner: 'player' }, { index: 8, earned: 3 }));
  timers.fire();
  assert.equal(dom.overTitle.textContent, 'Champion');
  assert.equal(dom.overTitle.dataset.winner, 'player');
  assert.equal(dom.overChampion.hidden, false, 'the arcade stays open');
});

test('the final boss is named as such, on the rival card and as the match starts', () => {
  const { view, dom } = setup({ preferences: createPreferences({ mode: 'career' }) });
  const landlord = { index: 9, count: 10, unlocked: 9, rival: { ...RIVAL_VIEW, name: 'The Landlord' } };

  view.render(inCareer({}, landlord));
  assert.equal(dom.rivalBoss.textContent, 'Final boss');
  assert.equal(dom.rivalBoss.hidden, false);

  view.render(inCareer({ phase: GAME_PHASE.RUNNING }, landlord));
  assert.equal(dom.versusTag.textContent, 'Final boss');
  assert.equal(dom.versusName.textContent, 'The Landlord');

  view.render(inCareer({ phase: GAME_PHASE.READY }));
  assert.equal(dom.rivalBoss.textContent, 'Boss', 'the other bosses are just bosses');
});

test('beating the final boss is shared as saving the last arcade', async () => {
  const { view, dom, device } = setup({ preferences: createPreferences({ mode: 'career', jokes: false }) });
  const landlord = { index: 9, count: 10, earned: 2, rival: { ...RIVAL_VIEW, name: 'The Landlord' } };

  view.render(inCareer({ phase: GAME_PHASE.RUNNING }, landlord));
  view.render(inCareer({ phase: GAME_PHASE.GAME_OVER, winner: 'player', score: { player: 7, opponent: 3 } }, landlord));
  click(dom.share);
  await nextTick();

  assert.equal(device.shared[0], 'I beat The Landlord 7:3 and saved the last arcade in Paddle Noir: 2 of 3 stars.');
});

test('a career match starts under a versus card: the rival\'s emblem and name over the player\'s', () => {
  const { view, dom, timers } = setup({ preferences: createPreferences({ mode: 'career' }) });

  view.render(inCareer({ phase: GAME_PHASE.READY }));
  assert.equal(dom.versus.hidden, true, 'not in the menu');
  view.render(inCareer({ phase: GAME_PHASE.RUNNING }));

  assert.equal(dom.versus.hidden, false);
  assert.equal(dom.versusEmblem.getAttribute('href'), '#emblem-bucket');
  assert.equal(dom.versusName.textContent, 'The Janitor');
  assert.equal(dom.versusTag.textContent, 'Boss');
  assert.ok(dom.versusTag.classes.has('versus__tag--boss'));
  assert.equal(dom.versusYou.textContent, 'You');

  // It rides the countdown, which waits for nothing, and is gone half-way through it.
  assert.deepEqual([...timers.pending.values()].map(({ ms }) => ms), [1500]);
  timers.fire();
  assert.equal(dom.versus.hidden, true);
  assert.equal(timers.pending.size, 0);
});

test('the versus card names an ordinary rival by its place on the ladder, and the player by their initials', () => {
  const { view, dom } = setup({ preferences: createPreferences({ mode: 'career', initials: 'MYK' }) });
  const roma = { index: 0, count: 10, rival: { ...RIVAL_VIEW, name: 'Rookie Roma', emblem: 'wrap', boss: false } };

  view.render(inCareer({ phase: GAME_PHASE.READY }, roma));
  view.render(inCareer({ phase: GAME_PHASE.RUNNING }, roma));

  assert.equal(dom.versusEmblem.getAttribute('href'), '#emblem-wrap');
  assert.equal(dom.versusName.textContent, 'Rookie Roma');
  assert.equal(dom.versusTag.textContent, 'Rival 1/10');
  assert.equal(dom.versusTag.classes.has('versus__tag--boss'), false);
  assert.equal(dom.versusYou.textContent, 'MYK');
});

test('the versus card comes with a new match only: not on resuming, not outside the career, and pausing puts it away', () => {
  const { view, dom, timers } = setup({ preferences: createPreferences({ mode: 'career' }) });

  view.render(inCareer({ phase: GAME_PHASE.READY }));
  view.render(inCareer({ phase: GAME_PHASE.RUNNING }));
  view.render(inCareer({ phase: GAME_PHASE.PAUSED }));
  assert.equal(dom.versus.hidden, true, 'pausing puts it away at once');
  assert.equal(timers.pending.size, 0);

  view.render(inCareer({ phase: GAME_PHASE.RUNNING }));
  assert.equal(dom.versus.hidden, true, 'a resumed match does not bring it back');

  // The next match does, straight from the result screen.
  view.render(inCareer({ phase: GAME_PHASE.GAME_OVER, winner: 'opponent' }));
  view.render(inCareer({ phase: GAME_PHASE.RUNNING }));
  assert.equal(dom.versus.hidden, false);

  view.render(presentation({ phase: GAME_PHASE.READY }));
  assert.equal(dom.versus.hidden, true, 'the menu puts it away too');
  view.render(presentation({ phase: GAME_PHASE.RUNNING }));
  assert.equal(dom.versus.hidden, true, 'outside the career there is none');

  view.render(inCareer({ phase: GAME_PHASE.READY }));
  view.render(inCareer({ phase: GAME_PHASE.RUNNING }));
  view.disconnect();
  assert.equal(timers.pending.size, 0);
  assert.equal(dom.versus.hidden, true);
});

test('after a career match the rival has a word to say, whichever way it went', () => {
  const { view, dom, timers } = setup({ preferences: createPreferences({ mode: 'career' }) });

  view.render(inCareer({ phase: GAME_PHASE.RUNNING }));
  view.render(inCareer({ phase: GAME_PHASE.GAME_OVER, winner: 'opponent' }));
  assert.equal(dom.overQuote.hidden, false);
  assert.equal(dom.overQuoteText.textContent, '“Mind the wet floor.”');
  assert.equal(dom.overQuoteEmblem.getAttribute('href'), '#emblem-bucket');

  view.render(inCareer({ phase: GAME_PHASE.RUNNING }));
  view.render(inCareer({ phase: GAME_PHASE.GAME_OVER, winner: 'player' }));
  timers.fire();
  assert.equal(dom.overQuoteText.textContent, '“Now I have to mop up my pride.”');
  assert.equal(dom.overMeta.hidden, false, 'the longest rally still shows');
  assert.equal(dom.overScores.hidden, true, 'the high-score table is Rush\'s');
});

test('the rival\'s line is one of the fun extras, and belongs to the career', () => {
  const quiet = setup({ preferences: createPreferences({ mode: 'career', jokes: false }) });
  quiet.view.render(inCareer({ phase: GAME_PHASE.RUNNING }));
  quiet.view.render(inCareer({ phase: GAME_PHASE.GAME_OVER, winner: 'opponent' }));
  assert.equal(quiet.dom.overQuote.hidden, true);
  assert.equal(quiet.dom.overQuoteText.textContent, '');

  const solo = setup();
  solo.view.render(presentation({ phase: GAME_PHASE.RUNNING }));
  solo.view.render(presentation({ phase: GAME_PHASE.GAME_OVER, winner: 'opponent' }));
  assert.equal(solo.dom.overQuote.hidden, true);

  // A career result gives way to a Solo one without leaving its line behind.
  const { view, dom } = setup({ preferences: createPreferences({ mode: 'career' }) });
  view.render(inCareer({ phase: GAME_PHASE.RUNNING }));
  view.render(inCareer({ phase: GAME_PHASE.GAME_OVER, winner: 'opponent' }));
  view.render(presentation({ phase: GAME_PHASE.RUNNING }));
  view.render(presentation({ phase: GAME_PHASE.GAME_OVER, winner: 'opponent' }));
  assert.equal(dom.overQuote.hidden, true);
});

test('a career result is shared with the rival\'s name and the stars', async () => {
  const { view, dom, device } = setup({ preferences: createPreferences({ mode: 'career', jokes: false }) });

  view.render(inCareer({ phase: GAME_PHASE.RUNNING }));
  view.render(inCareer({ phase: GAME_PHASE.GAME_OVER, winner: 'player', score: { player: 7, opponent: 2 } }, { earned: 2 }));
  click(dom.share);
  await nextTick();
  assert.equal(device.shared[0], 'I beat The Janitor 7:2 in Paddle Noir career mode: 2 of 3 stars.');

  view.render(inCareer({ phase: GAME_PHASE.RUNNING }));
  view.render(inCareer({ phase: GAME_PHASE.GAME_OVER, winner: 'opponent', score: { player: 4, opponent: 7 } }));
  click(dom.share);
  await nextTick();
  assert.equal(device.shared[1], 'The Janitor beat me 7:4 in Paddle Noir career mode. Rematch!');
});

// The Rush high-score table: the card in the menu, the standing on the result screen, the
// whole table in its dialog and the letters to sign it with.

const table = (best, initials = '', before = best) => highScores(HIGH_SCORES, best, initials, before);
const inRush = (overrides = {}) => presentation({
  mode: 'rush',
  rules: { kind: 'rush', lives: 3 },
  maxLives: 3,
  highScores: table(0),
  ...overrides,
});
const rowsOf = (element) => element.children.map((row) => row.children.map((cell) => cell.textContent));
const ownRows = (element) => element.children.filter((row) => row.classes.has('score-row--own'));

/** A key press as the high-score dialog sees it. */
const typed = (key, overrides = {}) => Object.assign(new Event('keydown', { cancelable: true }), {
  key, ctrlKey: false, metaKey: false, altKey: false, ...overrides,
});

test('Rush shows the high-score card where Solo has its difficulty and the career its rival', () => {
  const { dom } = setup({ preferences: createPreferences({ mode: 'rush' }) });

  assert.equal(dom.scoresCard.hidden, false);
  assert.equal(dom.difficultyGroup.hidden, true);
  assert.equal(dom.rivalGroup.hidden, true);

  click(dom.career);
  assert.equal(dom.scoresCard.hidden, true);
  click(dom.rush);
  assert.equal(dom.scoresCard.hidden, false);
});

test('the card says where the player stands and which row to beat next', () => {
  const { view, dom } = setup({ preferences: createPreferences({ mode: 'rush' }) });

  view.render(inRush());
  assert.equal(dom.scoresPlace.textContent, 'No run yet');
  assert.equal(dom.scoresNext.textContent, 'Next: ROM · 8 hits');

  view.render(inRush({ highScores: table(1) }));
  assert.equal(dom.scoresPlace.textContent, 'YOU · 1 hit', 'a run short of the table has no place on it');
  assert.equal(dom.scoresNext.textContent, 'Next: ROM · 8 hits');

  view.render(inRush({ highScores: table(21, 'MYK') }));
  assert.equal(dom.scoresPlace.textContent, '#8 · MYK · 21 hits');
  assert.equal(dom.scoresNext.textContent, 'Next: JAN · 22 hits');

  view.render(inRush({ highScores: table(99, 'MYK') }));
  assert.equal(dom.scoresPlace.textContent, '#1 · MYK · 99 hits');
  assert.equal(dom.scoresNext.textContent, 'The record is yours');
});

test('the table is drawn once for each change of it, not once a frame', () => {
  const { view, dom } = setup({ preferences: createPreferences({ mode: 'rush' }) });
  const same = table(21);

  view.render(inRush({ highScores: same }));
  const drawn = dom.scoresRows.children;
  view.render(inRush({ phase: GAME_PHASE.RUNNING, highScores: same }));
  assert.strictEqual(dom.scoresRows.children, drawn);

  view.render(inRush({ phase: GAME_PHASE.RUNNING, highScores: table(22) }));
  assert.notStrictEqual(dom.scoresRows.children, drawn);

  // Out of Rush there is no table to draw, and the last one is left alone.
  view.render(presentation());
  assert.equal(dom.scoresRows.children.length, 10);
});

test('the result of a run shows the rows around the player\'s, and what the run did to them', () => {
  const { view, dom } = setup({ preferences: createPreferences({ mode: 'rush' }) });
  const finish = (highScores) => {
    view.render(inRush({ phase: GAME_PHASE.RUNNING }));
    view.render(inRush({ phase: GAME_PHASE.GAME_OVER, winner: 'opponent', highScores }));
  };

  finish(table(21, '', 5));
  assert.equal(dom.overScores.hidden, false);
  assert.equal(dom.overMeta.hidden, true, 'a run is told by its hits and its place, not its longest rally');
  assert.deepEqual(rowsOf(dom.standingRows), [['7', 'JAN', '22'], ['8', 'YOU', '21'], ['9', 'TAR', '18']]);
  assert.deepEqual(ownRows(dom.standingRows).map((row) => row.children[1].textContent), ['YOU']);
  assert.equal(dom.standingNote.textContent, 'You passed 3 regulars!');
  assert.equal(dom.standingHint.hidden, false, 'an unsigned row says how to sign it');
  assert.equal(dom.overScores.getAttribute('aria-label'), 'High scores: number 8 with 21 hits. You passed 3 regulars! Sign your score.');

  finish(table(23, 'MYK', 21));
  assert.equal(dom.standingNote.textContent, 'You passed The Janitor!');
  assert.equal(dom.standingHint.hidden, true, 'a signed one does not');

  finish(table(23, 'MYK'));
  assert.equal(dom.standingNote.textContent, '4 more to pass HRY', 'a run that changed nothing says how far the next row is');
  assert.equal(dom.overScores.getAttribute('aria-label'), 'High scores: number 7 with 23 hits. 4 more to pass HRY. Show the table.');

  finish(table(61, 'MYK', 23));
  assert.deepEqual(rowsOf(dom.standingRows), [['1', 'MYK', '61'], ['2', 'AAA', '60'], ['3', 'LAG', '48']]);
  assert.equal(dom.standingNote.textContent, 'The record is yours!');

  finish(table(61, 'MYK'));
  assert.equal(dom.standingNote.textContent, 'You hold the record');
});

test('a run short of the table stands under its last rows, with no place and nothing to sign', () => {
  const { view, dom } = setup({ preferences: createPreferences({ mode: 'rush' }) });

  view.render(inRush({ phase: GAME_PHASE.RUNNING }));
  view.render(inRush({ phase: GAME_PHASE.GAME_OVER, winner: 'opponent', highScores: table(5, '', 0) }));

  assert.deepEqual(rowsOf(dom.standingRows), [['9', 'HAL', '13'], ['10', 'ROM', '8'], ['–', 'YOU', '5']]);
  assert.equal(dom.standingNote.textContent, '4 more to get on the table');
  assert.equal(dom.standingHint.hidden, true);
  assert.equal(dom.overScores.getAttribute('aria-label'), 'High scores: 5 hits, not on the table yet. 4 more to get on the table. Show the table.');

  click(dom.overScores);
  assert.ok(dom.scores.hasAttribute('open'));
  assert.equal(dom.sign.hidden, true, 'it opens on the table');
});

test('the high-score dialog shows the whole table: rank, initials, whose they are and the hits', () => {
  const { view, dom } = setup({ preferences: createPreferences({ mode: 'rush' }) });

  view.render(inRush({ highScores: table(21, 'MYK') }));
  click(dom.scoresCard);

  assert.ok(dom.scores.hasAttribute('open'));
  assert.equal(dom.scores.modal, true);
  assert.equal(dom.scoresRows.hidden, false);
  assert.equal(dom.sign.hidden, true);
  assert.equal(dom.scoresActions.hidden, false);
  assert.equal(dom.signActions.hidden, true);
  assert.equal(dom.scoresAbout.textContent, 'Rush · most hits in one run');
  assert.equal(dom.scoresRows.children.length, 10);
  assert.deepEqual(rowsOf(dom.scoresRows)[0], ['1', 'AAA', 'Unknown', '60']);
  assert.deepEqual(rowsOf(dom.scoresRows)[7], ['8', 'MYK', 'You', '21']);
  assert.deepEqual(rowsOf(dom.scoresRows)[9], ['10', 'HAL', 'Aunt Halyna', '13']);
  assert.deepEqual(ownRows(dom.scoresRows).length, 1);
  assert.equal(dom.signOpen.textContent, 'Change initials');

  click(dom.dismissScores);
  assert.equal(dom.scores.hasAttribute('open'), false);

  view.render(inRush({ highScores: table(21) }));
  assert.equal(dom.signOpen.textContent, 'Enter initials');
});

test('a tap on an unsigned standing goes straight to the letters, three of which sign the table', () => {
  const { view, dom, commands, preferences } = setup({ preferences: createPreferences({ mode: 'rush' }) });

  view.render(inRush({ phase: GAME_PHASE.RUNNING }));
  view.render(inRush({ phase: GAME_PHASE.GAME_OVER, winner: 'opponent', highScores: table(21, '', 5) }));
  click(dom.overScores);

  assert.ok(dom.scores.hasAttribute('open'));
  assert.equal(dom.sign.hidden, false);
  assert.equal(dom.scoresRows.hidden, true);
  assert.equal(dom.scoresActions.hidden, true);
  assert.equal(dom.signActions.hidden, false);
  assert.equal(dom.scoresAbout.textContent, 'Sign the table with three letters');
  assert.equal(dom.signSlots.focusCalls.length, 1, 'focus goes to the slots, where typing lands');
  assert.equal(dom.letterA.focusCalls.length, 0, 'not to a letter, which Enter would press');
  assert.equal(dom.signSlots.textContent, '___');
  assert.deepEqual(dom.signSlots.children.map((slot) => slot.className), ['sign__slot is-next', 'sign__slot', 'sign__slot']);
  assert.ok(dom.signOk.hasAttribute('disabled'));

  click(dom.letterM);
  click(dom.letterY);
  assert.equal(dom.signSlots.textContent, 'MY_');
  assert.deepEqual(dom.signSlots.children.map((slot) => slot.className), ['sign__slot', 'sign__slot', 'sign__slot is-next']);
  assert.ok(dom.signOk.hasAttribute('disabled'));

  click(dom.signOk);
  assert.equal(preferences.get().initials, '', 'two letters sign nothing');

  click(dom.letterA);
  click(dom.letterDelete);
  click(dom.letterK);
  click(dom.letterA);
  assert.equal(dom.signSlots.textContent, 'MYK', 'a fourth letter has no slot');
  assert.equal(dom.signOk.hasAttribute('disabled'), false);
  assert.deepEqual(commands, []);

  click(dom.signOk);
  assert.equal(preferences.get().initials, 'MYK');
  assert.deepEqual(commands.map(({ command }) => command), [GAME_COMMAND.REFRESH], 'the screen is drawn again with them');
  assert.equal(dom.sign.hidden, true, 'and the table comes back');
  assert.equal(dom.scoresRows.hidden, false);
  assert.ok(dom.scores.hasAttribute('open'));
  assert.equal(dom.dismissScores.focusCalls.length, 1);
});

test('a keyboard signs the table too: letters, Backspace and Enter', () => {
  const { view, dom, preferences } = setup({ preferences: createPreferences({ mode: 'rush' }) });
  const press = (key, overrides) => {
    const event = typed(key, overrides);
    dom.scores.dispatchEvent(event);
    return event.defaultPrevented;
  };

  view.render(inRush({ highScores: table(21) }));
  click(dom.scoresCard);
  assert.equal(press('m'), false, 'while the table shows, keys keep their meaning');
  click(dom.signOpen);

  assert.equal(press('m'), true);
  assert.equal(press('Y'), true);
  assert.equal(press('x'), true);
  assert.equal(press('Backspace'), true);
  assert.equal(dom.signSlots.textContent, 'MY_');
  assert.equal(press('Enter'), false, 'Enter on two letters is left to the button in focus');
  assert.equal(press('k', { ctrlKey: true }), false, 'a shortcut is no letter');
  assert.equal(press('k', { metaKey: true }), false);
  assert.equal(press('k', { altKey: true }), false);
  assert.equal(press('7'), false);
  assert.equal(press('Tab'), false);
  assert.equal(press(' '), false);
  assert.equal(dom.signSlots.textContent, 'MY_');

  assert.equal(press('k'), true);

  // Enter on Back or OK presses that button, as on any button; anywhere else it confirms.
  for (const button of [dom.signCancel, dom.signOk]) {
    const onButton = typed('Enter');
    Object.defineProperty(onButton, 'target', { value: button });
    view.typeByKey(onButton);
    assert.equal(onButton.defaultPrevented, false);
    assert.equal(preferences.get().initials, '');
  }

  assert.equal(press('Enter'), true);
  assert.equal(preferences.get().initials, 'MYK');
  assert.equal(dom.sign.hidden, true);
});

test('changing initials starts from the ones the player has, and Back keeps them', () => {
  const { view, dom, commands, preferences } = setup({ preferences: createPreferences({ mode: 'rush', initials: 'MYK' }) });

  view.render(inRush({ highScores: table(21, 'MYK') }));
  click(dom.scoresCard);
  click(dom.signOpen);
  assert.equal(dom.signSlots.textContent, 'MYK');
  assert.equal(dom.signOk.hasAttribute('disabled'), false);

  click(dom.letterDelete);
  click(dom.letterDelete);
  click(dom.signCancel);
  assert.equal(preferences.get().initials, 'MYK');
  assert.equal(dom.sign.hidden, true);
  assert.equal(dom.scoresRows.hidden, false);
  assert.deepEqual(commands, []);

  // Closing the dialog from the letters, by Escape say, opens it on the table next time.
  click(dom.signOpen);
  dom.scores.close();
  assert.equal(dom.sign.hidden, true);
  click(dom.scoresCard);
  assert.equal(dom.sign.hidden, true);
  assert.equal(dom.scoresRows.hidden, false);
});

test('a signed standing opens the table, not the letters', () => {
  const { view, dom } = setup({ preferences: createPreferences({ mode: 'rush', initials: 'MYK' }) });

  view.render(inRush({ phase: GAME_PHASE.RUNNING }));
  view.render(inRush({ phase: GAME_PHASE.GAME_OVER, winner: 'opponent', highScores: table(21, 'MYK', 5) }));
  click(dom.overScores);

  assert.ok(dom.scores.hasAttribute('open'));
  assert.equal(dom.sign.hidden, true);

  // Before any table has been drawn there is nothing to sign either.
  const blank = setup();
  click(blank.dom.overScores);
  assert.equal(blank.dom.sign.hidden, true);
});

test('a Rush run is shared with its hits, and with the player\'s place on the table once they have one', async () => {
  const { view, dom, device } = setup({ preferences: createPreferences({ mode: 'rush' }) });
  const share = async (result) => {
    view.render(inRush({ phase: GAME_PHASE.RUNNING }));
    view.render(inRush({ phase: GAME_PHASE.GAME_OVER, winner: 'opponent', ...result }));
    click(dom.share);
    await nextTick();
    return device.shared.at(-1);
  };

  assert.equal(await share({ hits: { player: 5, opponent: 5 }, highScores: table(5) }), 'I survived 5 hits in Rush mode of Paddle Noir. Beat that!');
  assert.equal(
    await share({ hits: { player: 21, opponent: 21 }, highScores: table(21, 'MYK', 5) }),
    'I survived 21 hits in Rush mode of Paddle Noir. My best run is number 8 on its high-score table. Beat that!',
  );
  assert.equal(
    await share({ hits: { player: 1, opponent: 0 }, highScores: table(21, 'MYK') }),
    'I survived 1 hit in Rush mode of Paddle Noir. My best run is number 8 on its high-score table. Beat that!',
  );
});

test('without modal dialog support the high scores still open and close', () => {
  const { view, dom } = setup({ modalDialogs: false, preferences: createPreferences({ mode: 'rush' }) });

  view.render(inRush({ highScores: table(21) }));
  click(dom.scoresCard);
  assert.ok(dom.scores.hasAttribute('open'));
  click(dom.dismissScores);
  assert.equal(dom.scores.hasAttribute('open'), false);
});

test('the scoreboard names the player by their initials once they have signed, in Solo and the career', () => {
  const preferences = createPreferences({ initials: 'MYK' });
  const { view, dom, commands } = setup({ preferences });

  view.render(presentation({ phase: GAME_PHASE.RUNNING }));
  assert.equal(dom.playerLabel.textContent, 'MYK');

  view.render(inCareer({ phase: GAME_PHASE.RUNNING }));
  assert.equal(dom.playerLabel.textContent, 'MYK');

  view.render(inRush({ phase: GAME_PHASE.RUNNING }));
  assert.equal(dom.playerLabel.textContent, 'Hits', 'Rush counts hits there');

  view.render(presentation({ phase: GAME_PHASE.RUNNING, mode: 'duo', opponent: { label: 'P2', name: 'Player 2', proper: false } }));
  assert.equal(dom.playerLabel.textContent, 'P1', 'and two people are P1 and P2');

  // New initials show with the next frame, with nothing else changed.
  view.render(presentation({ phase: GAME_PHASE.RUNNING }));
  preferences.set({ initials: 'ZZZ' });
  view.render(presentation({ phase: GAME_PHASE.RUNNING }));
  assert.equal(dom.playerLabel.textContent, 'ZZZ');
  assert.deepEqual(commands, []);

  const unsigned = setup();
  unsigned.view.render(presentation({ phase: GAME_PHASE.RUNNING }));
  assert.equal(unsigned.dom.playerLabel.textContent, 'You');
});

// Bricks: the second game.

const wall = (overrides = {}) => ({ level: 1, levels: 8, name: 'First Coin', points: 0, best: 0, newBest: false, ...overrides });
const bricksGame = (overrides = {}) => presentation({
  mode: 'bricks',
  rules: { kind: 'bricks', lives: 3 },
  opponent: { label: 'Wall', name: 'The wall', proper: false },
  lives: 3,
  maxLives: 3,
  bricks: wall(),
  ...overrides,
});

test('in Bricks the scoreboard shows the points and the wall being played, under their own labels', () => {
  const { view, dom } = setup({ preferences: createPreferences({ mode: 'bricks', initials: 'MYK' }) });

  view.render(bricksGame({ phase: GAME_PHASE.RUNNING, bricks: wall({ points: 1280, level: 3 }) }));

  assert.equal(dom.playerLabel.textContent, 'Score', 'not the player\'s initials: the number beside it is not theirs to name');
  assert.equal(dom.opponentLabel.textContent, 'Wall');
  assert.equal(dom.playerScore.textContent, '1280');
  assert.equal(dom.opponentScore.textContent, '3');
  assert.equal(dom.opponentLabel.classes.has('scoreboard__label--nick'), false);
  assert.equal(dom.lives.hidden, false);
  assert.equal(dom.lives.children.length, 3);
});

test('points tick up without the fanfare a point of a match gets; a new wall still pops', () => {
  const { view, dom } = setup({ preferences: createPreferences({ mode: 'bricks' }) });

  view.render(bricksGame({ phase: GAME_PHASE.RUNNING, bricks: wall({ points: 10 }) }));
  view.render(bricksGame({ phase: GAME_PHASE.RUNNING, bricks: wall({ points: 30 }) }));
  assert.equal(dom.playerScore.textContent, '30');
  assert.equal(dom.playerScore.classes.has('is-popping'), false);

  view.render(bricksGame({ phase: GAME_PHASE.RUNNING, bricks: wall({ points: 130, level: 2 }) }));
  assert.ok(dom.opponentScore.classes.has('is-popping'));
});

test('the menu says how many walls there are and the best score', () => {
  const { view, dom } = setup({ preferences: createPreferences({ mode: 'bricks' }) });
  const record = () => dom.menuMeta.children.find((child) => typeof child !== 'string');

  view.render(bricksGame({ bricks: wall({ best: 18730 }) }));
  assert.equal(dom.menuMeta.textContent, '8 walls · Best 18730 points');
  assert.equal(record().textContent, '18730', 'the record stands out');

  view.render(bricksGame({ bricks: wall({ best: 1 }) }));
  assert.equal(dom.menuMeta.textContent, '8 walls · Best 1 point');
});

test('a lost Bricks game is told by its points and the wall it reached, with no rally and no finisher', () => {
  const { view, dom } = setup({ preferences: createPreferences({ mode: 'bricks' }) });

  view.render(bricksGame({ phase: GAME_PHASE.RUNNING }));
  view.render(bricksGame({ phase: GAME_PHASE.GAME_OVER, winner: 'opponent', lives: 0, bricks: wall({ points: 1690, level: 4, name: 'Crosshair', best: 1690, newBest: true }) }));

  assert.equal(dom.over.hidden, false, 'the result comes at once');
  assert.equal(dom.overTitle.textContent, 'Game over');
  assert.equal(dom.overTitle.dataset.winner, 'opponent');
  assert.equal(dom.overScore.textContent, '1690');
  assert.equal(dom.overWall.textContent, 'points · wall 4 of 8 · Crosshair');
  assert.equal(dom.overWall.hidden, false);
  assert.equal(dom.overMeta.hidden, true, 'the longest rally belongs to a match');
  assert.equal(dom.overDifficulty.textContent, 'Bricks');
  assert.equal(dom.overBestBricks.hidden, false);
  assert.equal(dom.overBestRush.hidden, true);
  assert.equal(dom.overScores.hidden, true);
  assert.equal(dom.continueLine.hidden, false, 'and the arcade asks whether to continue');
});

test('a won Bricks game is all clear, at once: a wall has no paddle for a finisher to break', () => {
  const { view, dom } = setup({ preferences: createPreferences({ mode: 'bricks' }) });

  view.render(bricksGame({ phase: GAME_PHASE.RUNNING }));
  view.render(bricksGame({ phase: GAME_PHASE.GAME_OVER, winner: 'player', bricks: wall({ points: 21840, level: 8, name: 'The Key', best: 30000 }) }));

  assert.equal(dom.over.hidden, false);
  assert.equal(dom.overTitle.textContent, 'All clear');
  assert.equal(dom.overTitle.dataset.winner, 'player');
  assert.equal(dom.overScore.textContent, '21840');
  assert.equal(dom.overWall.textContent, 'points · all 8 walls down');
  assert.equal(dom.overBestBricks.hidden, true);
  assert.equal(dom.continueLine.hidden, true);
});

test('a match after a Bricks game shows its own result again', () => {
  const { view, dom } = setup();

  view.render(bricksGame({ phase: GAME_PHASE.RUNNING }));
  view.render(bricksGame({ phase: GAME_PHASE.GAME_OVER, winner: 'opponent', bricks: wall({ points: 50, newBest: true }) }));
  view.render(presentation({ phase: GAME_PHASE.RUNNING }));
  view.render(presentation({ phase: GAME_PHASE.GAME_OVER, winner: 'opponent', score: { player: 2, opponent: 7 }, longestRally: 6 }));

  assert.equal(dom.overWall.hidden, true);
  assert.equal(dom.overBestBricks.hidden, true);
  assert.equal(dom.overMeta.hidden, false);
  assert.equal(dom.overScore.textContent, '2 : 7');
});

test('a Bricks game is shared with its points, and how far it got', async () => {
  const { view, dom, device } = setup({ preferences: createPreferences({ mode: 'bricks' }) });
  const shared = async (result) => {
    view.render(bricksGame({ phase: GAME_PHASE.RUNNING }));
    view.render(bricksGame({ phase: GAME_PHASE.GAME_OVER, ...result }));
    click(dom.share);
    await nextTick();
    return device.shared.at(-1);
  };

  assert.equal(
    await shared({ winner: 'opponent', bricks: wall({ points: 1690, level: 4 }) }),
    'I made 1690 points in Bricks mode of Paddle Noir, up to wall 4 of 8. Beat that!',
  );
  assert.equal(
    await shared({ winner: 'player', bricks: wall({ points: 21840, level: 8 }) }),
    'I broke all 8 walls of Bricks in Paddle Noir: 21840 points. Beat that!',
  );
  assert.equal(await shared({ winner: 'opponent', bricks: wall({ points: 1 }) }), 'I made 1 point in Bricks mode of Paddle Noir, up to wall 1 of 8. Beat that!');
});

test('choosing Bricks in the menu hides what belongs to the other modes', () => {
  const { dom, preferences } = setup();

  click(dom.bricks);

  assert.equal(preferences.get().mode, 'bricks');
  assert.equal(dom.bricks.getAttribute('aria-pressed'), 'true');
  assert.equal(dom.solo.getAttribute('aria-pressed'), 'false');
  assert.equal(dom.root.dataset.mode, 'bricks');
  assert.deepEqual([dom.tutorialBricks.hidden, dom.tutorialMatch.hidden], [false, true], 'How to play tells of the wall');

  click(dom.solo);
  assert.deepEqual([dom.tutorialBricks.hidden, dom.tutorialMatch.hidden], [true, false], 'and of power-ups again in a match');
});

// Nova: the paddle as a starship.

const flight = (overrides = {}) => ({ sector: 1, sectors: 5, name: 'Rock Garden', points: 0, best: 0, newBest: false, ...overrides });
const novaGame = (overrides = {}) => presentation({
  mode: 'nova',
  rules: { kind: 'nova', lives: 3 },
  opponent: { label: 'Sector', name: 'The fleet', proper: false },
  lives: 3,
  maxLives: 3,
  nova: flight(),
  ...overrides,
});

test('in Nova the scoreboard shows the points and the sector, and points tick up without a pop', () => {
  const { view, dom } = setup({ preferences: createPreferences({ mode: 'nova', initials: 'MYK' }) });

  view.render(novaGame({ phase: GAME_PHASE.RUNNING, nova: flight({ points: 40 }) }));
  view.render(novaGame({ phase: GAME_PHASE.RUNNING, nova: flight({ points: 3120, sector: 2 }) }));

  assert.deepEqual([dom.playerLabel.textContent, dom.opponentLabel.textContent], ['Score', 'Sector']);
  assert.deepEqual([dom.playerScore.textContent, dom.opponentScore.textContent], ['3120', '2']);
  assert.equal(dom.playerScore.classes.has('is-popping'), false);
  assert.ok(dom.opponentScore.classes.has('is-popping'), 'a new sector pops');
});

test('the menu says how many sectors there are and the best score', () => {
  const { view, dom } = setup({ preferences: createPreferences({ mode: 'nova' }) });

  view.render(novaGame({ nova: flight({ best: 31200 }) }));
  assert.equal(dom.menuMeta.textContent, '5 sectors · Best 31200 points');

  view.render(novaGame({ nova: flight({ best: 1 }) }));
  assert.equal(dom.menuMeta.textContent, '5 sectors · Best 1 point');
});

test('a lost Nova game is told by its points and the sector it reached, at once, and asks to continue', () => {
  const { view, dom } = setup({ preferences: createPreferences({ mode: 'nova' }) });

  view.render(novaGame({ phase: GAME_PHASE.RUNNING }));
  view.render(novaGame({ phase: GAME_PHASE.GAME_OVER, winner: 'opponent', lives: 0, nova: flight({ points: 7400, sector: 3, name: 'Gunship Alley', best: 7400, newBest: true }) }));

  assert.equal(dom.over.hidden, false);
  assert.equal(dom.overTitle.textContent, 'Ship lost');
  assert.equal(dom.overScore.textContent, '7400');
  assert.equal(dom.overWall.textContent, 'points · sector 3 of 5 · Gunship Alley');
  assert.equal(dom.overMeta.hidden, true);
  assert.equal(dom.overDifficulty.textContent, 'Nova');
  assert.equal(dom.overBestNova.hidden, false);
  assert.equal(dom.overBestBricks.hidden, true);
  assert.equal(dom.continueLine.hidden, false);
});

test('a won Nova game saves the galaxy, at once', () => {
  const { view, dom } = setup({ preferences: createPreferences({ mode: 'nova' }) });

  view.render(novaGame({ phase: GAME_PHASE.RUNNING }));
  view.render(novaGame({ phase: GAME_PHASE.GAME_OVER, winner: 'player', nova: flight({ points: 30420, sector: 5, name: 'The Dreadnought', best: 40000 }) }));

  assert.equal(dom.over.hidden, false);
  assert.equal(dom.overTitle.textContent, 'Galaxy saved');
  assert.equal(dom.overWall.textContent, 'points · all 5 sectors flown');
  assert.equal(dom.overBestNova.hidden, true);
  assert.equal(dom.continueLine.hidden, true);
});

test('a Nova game is shared with its points, and how far it got', async () => {
  const { view, dom, device } = setup({ preferences: createPreferences({ mode: 'nova' }) });
  const shared = async (result) => {
    view.render(novaGame({ phase: GAME_PHASE.RUNNING }));
    view.render(novaGame({ phase: GAME_PHASE.GAME_OVER, ...result }));
    click(dom.share);
    await nextTick();
    return device.shared.at(-1);
  };

  assert.equal(await shared({ winner: 'opponent', nova: flight({ points: 7400, sector: 3 }) }), 'I made 7400 points in Nova mode of Paddle Noir, up to sector 3 of 5. Beat that!');
  assert.equal(await shared({ winner: 'player', nova: flight({ points: 30420, sector: 5 }) }), 'I flew all 5 sectors of Nova in Paddle Noir and downed the Dreadnought: 30420 points. Beat that!');
});

test('How to play tells of the ship in Nova', () => {
  const { dom } = setup();

  click(dom.nova);
  assert.deepEqual([dom.tutorialNova.hidden, dom.tutorialBricks.hidden, dom.tutorialMatch.hidden], [false, true, true]);

  click(dom.solo);
  assert.deepEqual([dom.tutorialNova.hidden, dom.tutorialBricks.hidden, dom.tutorialMatch.hidden], [true, true, false]);
});

const cup = (overrides = {}) => ({ race: 1, races: 5, name: 'Sunset Skyway', place: 6, points: 0, best: 0, newBest: false, craft: 'Kestrel', tickets: 0, earned: 0, ...overrides });
const warpGame = (overrides = {}) => presentation({
  mode: 'warp',
  rules: { kind: 'warp', lives: 3 },
  opponent: { label: 'Race', name: 'The field', proper: false },
  lives: 3,
  maxLives: 3,
  warp: cup(),
  ...overrides,
});

test('in Warp the scoreboard shows the points and the race, and points tick up without a pop', () => {
  const { view, dom } = setup({ preferences: createPreferences({ mode: 'warp', initials: 'MYK' }) });

  view.render(warpGame({ phase: GAME_PHASE.RUNNING, warp: cup({ points: 40 }) }));
  view.render(warpGame({ phase: GAME_PHASE.RUNNING, warp: cup({ points: 1320, race: 2 }) }));

  assert.deepEqual([dom.playerLabel.textContent, dom.opponentLabel.textContent], ['Score', 'Race']);
  assert.deepEqual([dom.playerScore.textContent, dom.opponentScore.textContent], ['1320', '2']);
  assert.equal(dom.playerScore.classes.has('is-popping'), false);
  assert.ok(dom.opponentScore.classes.has('is-popping'), 'a new race pops');
});

test('the menu says how many races there are and the best score', () => {
  const { view, dom } = setup({ preferences: createPreferences({ mode: 'warp' }) });

  view.render(warpGame({ warp: cup({ best: 15200 }) }));
  assert.equal(dom.menuMeta.textContent, '5 races · Best 15200 points');

  view.render(warpGame({ warp: cup({ best: 1 }) }));
  assert.equal(dom.menuMeta.textContent, '5 races · Best 1 point');
});

test('in Warp the menu has the hangar\'s card: the craft the cup is flown in, and the tickets to spend', () => {
  const { view, dom } = setup({ preferences: createPreferences({ mode: 'warp' }) });

  // The rules of the cup stay the same whatever is bought: the card follows the craft and the tickets.
  const rules = { kind: 'warp', lives: 3 };

  assert.equal(dom.hangarCard.hidden, false);
  view.render(warpGame({ rules, warp: cup({ craft: 'Manta', tickets: 2480 }) }));
  assert.deepEqual([dom.hangarCraft.textContent, dom.hangarTickets.textContent], ['Manta', '2480 tickets']);

  view.render(warpGame({ rules, warp: cup({ craft: 'Manta', tickets: 1 }) }));
  assert.deepEqual([dom.hangarCraft.textContent, dom.hangarTickets.textContent], ['Manta', '1 ticket']);

  view.render(warpGame({ rules, warp: cup({ tickets: 1 }) }));
  assert.deepEqual([dom.hangarCraft.textContent, dom.hangarTickets.textContent], ['Kestrel', '1 ticket']);

  // No other game has a hangar.
  click(dom.solo);
  assert.equal(dom.hangarCard.hidden, true);
  view.render(presentation());
  assert.equal(dom.hangarCraft.textContent, 'Kestrel', 'and its card is left as it was');
});

test('a cup\'s result says what it paid out for the hangar, and nothing when it paid nothing', () => {
  const { view, dom } = setup({ preferences: createPreferences({ mode: 'warp' }) });
  const over = (earned) => {
    view.render(warpGame({ phase: GAME_PHASE.RUNNING }));
    view.render(warpGame({ phase: GAME_PHASE.GAME_OVER, winner: 'opponent', lives: 0, warp: cup({ points: 7400, earned, tickets: 500 + earned }) }));
    return [dom.overTickets.hidden, dom.overTickets.textContent];
  };

  assert.deepEqual(over(296), [false, '+296 tickets for the hangar']);
  assert.deepEqual(over(1), [false, '+1 ticket for the hangar']);
  assert.equal(over(0)[0], true);

  // A match has nothing of the kind.
  view.render(presentation({ phase: GAME_PHASE.RUNNING }));
  view.render(presentation({ phase: GAME_PHASE.GAME_OVER, winner: 'player' }));
  assert.equal(dom.overTickets.hidden, true);
});

test('a cup out of credits is told by its points and the race it reached, at once, and asks to continue', () => {
  const { view, dom } = setup({ preferences: createPreferences({ mode: 'warp' }) });

  view.render(warpGame({ phase: GAME_PHASE.RUNNING }));
  view.render(warpGame({ phase: GAME_PHASE.GAME_OVER, winner: 'opponent', lives: 0, warp: cup({ points: 7400, race: 4, name: 'Orbital Ring', best: 7400, newBest: true }) }));

  assert.equal(dom.over.hidden, false);
  assert.equal(dom.overTitle.textContent, 'Out of credits');
  assert.equal(dom.overScore.textContent, '7400');
  assert.equal(dom.overWall.textContent, 'points · race 4 of 5 · Orbital Ring');
  assert.equal(dom.overMeta.hidden, true);
  assert.equal(dom.overDifficulty.textContent, 'Warp');
  assert.equal(dom.overBestWarp.hidden, false);
  assert.equal(dom.overBestNova.hidden, true);
  assert.equal(dom.continueLine.hidden, false);
});

test('a won cup is the cup won, at once', () => {
  const { view, dom } = setup({ preferences: createPreferences({ mode: 'warp' }) });

  view.render(warpGame({ phase: GAME_PHASE.RUNNING }));
  view.render(warpGame({ phase: GAME_PHASE.GAME_OVER, winner: 'player', warp: cup({ points: 17020, race: 5, name: 'Warp Core', best: 20000 }) }));

  assert.equal(dom.over.hidden, false);
  assert.equal(dom.overTitle.textContent, 'Cup won');
  assert.equal(dom.overWall.textContent, 'points · all 5 races won through');
  assert.equal(dom.overBestWarp.hidden, true);
  assert.equal(dom.continueLine.hidden, true);
});

test('a Warp cup is shared with its points, and how far it got', async () => {
  const { view, dom, device } = setup({ preferences: createPreferences({ mode: 'warp' }) });
  const shared = async (result) => {
    view.render(warpGame({ phase: GAME_PHASE.RUNNING }));
    view.render(warpGame({ phase: GAME_PHASE.GAME_OVER, ...result }));
    click(dom.share);
    await nextTick();
    return device.shared.at(-1);
  };

  assert.equal(await shared({ winner: 'opponent', warp: cup({ points: 7400, race: 3 }) }), 'I made 7400 points in the Warp cup of Paddle Noir, up to race 3 of 5. Beat that!');
  assert.equal(await shared({ winner: 'player', warp: cup({ points: 17020, race: 5 }) }), 'I won all 5 races of the Warp cup in Paddle Noir: 17020 points. Beat that!');
});

test('How to play tells of the race in Warp', () => {
  const { dom } = setup();

  click(dom.warp);
  assert.deepEqual([dom.tutorialWarp.hidden, dom.tutorialNova.hidden, dom.tutorialMatch.hidden], [false, true, true]);

  click(dom.solo);
  assert.deepEqual([dom.tutorialWarp.hidden, dom.tutorialNova.hidden, dom.tutorialMatch.hidden], [true, true, false]);
});

test('How to play tells of curving and angling the ball only where there is one', () => {
  const { dom } = setup();
  const told = (mode) => {
    click(dom[mode]);
    return !dom.tutorialBall.hidden;
  };

  assert.deepEqual(['solo', 'rush', 'duo', 'career', 'bricks', 'nova', 'warp'].map(told), [true, true, true, true, true, false, false]);
});
