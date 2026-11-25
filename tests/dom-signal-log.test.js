import test from 'node:test';
import assert from 'node:assert/strict';

import { DomSignalLog } from '../src/adapters/dom-signal-log.js';
import { WARP_STORY } from '../src/domain/warp-story.js';
import { HANGAR } from '../src/hangar.js';

// The Signal Log's dialog, on a small stand-in for the DOM: elements found by [name], and the
// entries the log builds.
class FakeElement extends EventTarget {
  constructor(attributes = {}) {
    super();
    this.attributes = new Map(Object.entries(attributes));
    this.dataset = {};
    this.textContent = '';
    this.className = '';
    this.children = [];
    this.ownerDocument = { createElement: () => new FakeElement() };
  }

  replaceChildren(...nodes) {
    this.children = nodes;
  }

  setAttribute(name, value) {
    this.attributes.set(name, value);
  }

  hasAttribute(name) {
    return this.attributes.has(name);
  }

  removeAttribute(name) {
    this.attributes.delete(name);
  }

  matches(selector) {
    const [, name, value] = selector.match(/^\[([\w-]+)(?:="([^"]*)")?\]$/) ?? [];
    return this.attributes.has(name) && (value === undefined || this.attributes.get(name) === value);
  }
}

class FakeDialog extends FakeElement {
  showModal() {
    this.setAttribute('open', '');
  }

  close() {
    this.removeAttribute('open');
  }
}

function setup(signal = 0, { modal = true } = {}) {
  const elements = {
    card: new FakeElement({ 'data-show-signal': '' }),
    close: new FakeElement({ 'data-dismiss-signal': '' }),
    dialog: modal ? new FakeDialog({ 'data-overlay': 'signal' }) : new FakeElement({ 'data-overlay': 'signal' }),
    summary: new FakeElement({ 'data-signal-summary': '' }),
    entries: new FakeElement({ 'data-signal-entries': '' }),
    reward: new FakeElement({ 'data-signal-reward': '' }),
  };
  const all = Object.values(elements);
  const root = {
    querySelector: (selector) => all.find((element) => element.matches(selector)) ?? null,
    querySelectorAll: (selector) => all.filter((element) => element.matches(selector)),
  };
  let values = { signal };
  const preferences = { get: () => values, set: (changes) => { values = { ...values, ...changes }; } };
  const log = new DomSignalLog({ root, story: WARP_STORY, decals: HANGAR.decals, preferences });
  log.connect();
  return { log, preferences, ...elements };
}

const click = (element) => element.dispatchEvent(new Event('click'));
const shown = (entries) => entries.children.map((entry) => [entry.dataset.recovered, ...entry.children.map((part) => part.textContent)]);

test('the log opens from its card and lists every chapter: decoded once recovered, the mission that decodes it until then', () => {
  const { card, close, dialog, summary, entries, reward } = setup(0b00101);

  assert.equal(dialog.hasAttribute('open'), false);
  click(card);
  assert.equal(dialog.hasAttribute('open'), true);
  assert.equal(summary.textContent, '2 of 8 fragments recovered');
  assert.deepEqual(shown(entries)[0], ['true', `◆ ${WARP_STORY[0].title}`, `“${WARP_STORY[0].fragment}”`]);
  assert.deepEqual(shown(entries)[1], ['false', `◇ ${WARP_STORY[1].title}`, 'Encrypted. Fly its mission to decode it: hit 9 boost pads.']);
  assert.deepEqual(shown(entries).map(([recovered]) => recovered), ['true', 'false', 'true', 'false', 'false', 'false', 'false', 'false']);
  assert.equal(reward.textContent, 'Recover all 5 for the Signal decal in the hangar.');
  assert.equal(reward.dataset.earned, 'false');

  click(close);
  assert.equal(dialog.hasAttribute('open'), false);
});

test('read fresh each time it opens, and once every fragment is in, the decal is waiting', () => {
  const { card, close, preferences, summary, reward } = setup(0b00101);

  click(card);
  click(close);
  preferences.set({ signal: 0b11111 });
  click(card);
  assert.equal(summary.textContent, '5 of 8 fragments recovered');
  assert.equal(reward.dataset.earned, 'true');
  assert.match(reward.textContent, /Signal decal waits on the hangar's paint bench/);
});

test('without modal dialogs the log still opens and closes, and disconnecting takes its hands off the page', () => {
  const { log, card, close, dialog } = setup(0, { modal: false });

  click(card);
  assert.equal(dialog.hasAttribute('open'), true);
  click(card);
  assert.equal(dialog.hasAttribute('open'), true, 'already open');
  click(close);
  assert.equal(dialog.hasAttribute('open'), false);

  log.disconnect();
  click(card);
  assert.equal(dialog.hasAttribute('open'), false);
});

test('a page without the log\'s dialog says what is missing', () => {
  const root = { querySelector: () => null, querySelectorAll: () => [] };
  assert.throws(() => new DomSignalLog({ root, story: WARP_STORY, decals: [], preferences: { get: () => ({ signal: 0 }) } }), /data-overlay="signal"/);
});
