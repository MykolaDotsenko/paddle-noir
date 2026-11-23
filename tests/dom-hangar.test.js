import test from 'node:test';
import assert from 'node:assert/strict';

import { DomHangar } from '../src/adapters/dom-hangar.js';
import { loadoutOf, TOP_RATING } from '../src/application/hangar.js';
import { HANGAR } from '../src/hangar.js';

// The hangar's dialog: the craft on show, its benches, and what a press on each control does.

// A small stand-in for the DOM: elements with attributes and children, found by [name] or
// [name="value"], among those the page has and those the hangar builds.
class FakeElement extends EventTarget {
  constructor(attributes = {}) {
    super();
    this.attributes = new Map(Object.entries(attributes));
    this.dataset = {};
    this.hidden = false;
    this.textContent = '';
    this.className = '';
    this.children = [];
    this.classes = new Set();
    this.properties = {};
    this.style = { setProperty: (name, value) => { this.properties[name] = value; } };
    this.classList = { toggle: (name, force) => (force ? this.classes.add(name) : this.classes.delete(name)) };
    this.ownerDocument = { createElement: () => new FakeElement() };

    for (const [name, value] of this.attributes) {
      if (name.startsWith('data-')) {
        this.dataset[name.slice(5).replace(/-([a-z])/g, (_, letter) => letter.toUpperCase())] = value;
      }
    }
  }

  replaceChildren(...nodes) {
    this.children = nodes;
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

  toggleAttribute(name, force) {
    if (force) this.attributes.set(name, '');
    else this.attributes.delete(name);
  }

  matches(selector) {
    const [, name, value] = selector.match(/^\[([\w-]+)(?:="([^"]*)")?\]$/) ?? [];
    return this.attributes.has(name) && (value === undefined || this.attributes.get(name) === value);
  }
}

class FakeDialog extends FakeElement {
  showModal() {
    this.modal = true;
    this.setAttribute('open', '');
  }

  close() {
    this.removeAttribute('open');
    this.dispatchEvent(new Event('close'));
  }
}

const PARTS = {
  dialog: { 'data-overlay': 'hangar' },
  canvas: { 'data-hangar-canvas': '' },
  card: { 'data-show-hangar': '' },
  done: { 'data-dismiss-hangar': '' },
  previous: { 'data-hangar-step': '-1' },
  next: { 'data-hangar-step': '1' },
  tuneTab: { 'data-hangar-tab': 'tune' },
  paintTab: { 'data-hangar-tab': 'paint' },
  glowTab: { 'data-hangar-tab': 'glow' },
  tuneBench: { 'data-hangar-bench': 'tune' },
  paintBench: { 'data-hangar-bench': 'paint' },
  glowBench: { 'data-hangar-bench': 'glow' },
  systems: { 'data-hangar-systems': '' },
  paints: { 'data-hangar-paints': '' },
  decals: { 'data-hangar-decals': '' },
  earn: { 'data-hangar-earn': '' },
  glows: { 'data-hangar-glows': '' },
  locked: { 'data-hangar-locked': '' },
  buy: { 'data-hangar-buy': '' },
  wallet: { 'data-hangar-wallet': '' },
  name: { 'data-hangar-name': '' },
  blurb: { 'data-hangar-blurb': '' },
  tag: { 'data-hangar-tag': '' },
  place: { 'data-hangar-place': '' },
};

function createRoot({ modal = true, without = [] } = {}) {
  const entries = Object.entries(PARTS).filter(([name]) => !without.includes(name))
    .map(([name, attributes]) => [name, name === 'dialog' && modal ? new FakeDialog(attributes) : new FakeElement(attributes)]);
  const all = entries.map(([, element]) => element);

  return {
    ...Object.fromEntries(entries),
    root: {
      querySelector: (selector) => all.find((element) => element.matches(selector)) ?? null,
      querySelectorAll: (selector) => all.filter((element) => element.matches(selector)),
    },
  };
}

function setup({ tickets = 0, hangar = { craft: '', owned: {} }, signal = 0, ...rootOptions } = {}) {
  let values = { tickets, hangar, signal };
  const preferences = { writes: [], get: () => values, set(changes) { this.writes.push(changes); values = { ...values, ...changes }; } };
  const dom = createRoot(rootOptions);
  const portraits = [];
  const changes = [];
  const view = new DomHangar({ root: dom.root, catalog: HANGAR, preferences, portrait: (canvas, loadout) => portraits.push({ canvas, loadout }), onChange: () => changes.push(values) });

  view.connect();

  /** The row the hangar built for a system: its bar's pips and its button. */
  const row = (system) => {
    const built = dom.systems.children[Object.keys(HANGAR.systems).indexOf(system)];
    const [name, bar, button] = built.children;
    return { built, name, bar, button, pips: bar.children.map((pip) => pip.className) };
  };
  const chip = (part, id) => dom[part].children.find((button) => Object.values(button.dataset).includes(id));

  return { view, dom, preferences, portraits, changes, row, chip };
}

const click = (element) => element.dispatchEvent(new Event('click'));
const [KESTREL, HORNET, MANTA] = HANGAR.crafts;
const STOCK = { engine: 0, nitro: 0, grip: 0, armor: 0, guns: 0 };
const owning = (...specs) => ({ craft: specs[0].id, owned: Object.fromEntries(specs.map((spec) => [spec.id, { tune: STOCK, paint: '', decal: '', glow: '' }])) });

test('connecting builds the benches from what the hangar offers, and leaves the dialog shut', () => {
  const { dom, row, chip } = setup();

  assert.equal(dom.dialog.hasAttribute('open'), false);
  assert.deepEqual(dom.systems.children.map((built) => built.children[0].textContent), Object.values(HANGAR.systems));
  assert.ok(dom.systems.children.every((built) => built.className === 'tune' && built.children[1].children.length === TOP_RATING));
  assert.deepEqual([row('engine').bar.getAttribute('role'), row('engine').button.getAttribute('type'), row('engine').button.dataset.hangarTune], ['img', 'button', 'engine']);

  assert.deepEqual(dom.paints.children.map((button) => button.dataset.hangarPaint), HANGAR.paints.map((paint) => paint.id));
  assert.deepEqual(dom.glows.children.map((button) => button.dataset.hangarGlow), HANGAR.paints.map((paint) => paint.id));
  assert.deepEqual(dom.decals.children.map((button) => [button.dataset.hangarDecal, button.textContent]), HANGAR.decals.map((decal) => [decal.id, decal.name]));

  // A chip is the paint itself, with its name for those who cannot see it.
  const red = HANGAR.paints.find((paint) => paint.id === 'red');
  assert.deepEqual([chip('paints', 'red').className, chip('paints', 'red').getAttribute('aria-label'), chip('paints', 'red').properties['--swatch']], ['swatch', red.name, red.rgb]);
  assert.equal(chip('decals', 'flames').className, '');
});

test('a page without the hangar\'s dialog cannot start', () => {
  assert.throws(() => setup({ without: ['dialog'] }), /\[data-overlay="hangar"\] is missing/);
  assert.throws(() => setup({ without: ['systems'] }), /\[data-hangar-systems\] is missing/);
});

test('the card in the menu opens the hangar on the craft the player flies, and Done closes it', () => {
  const { dom, portraits } = setup({ tickets: 320, hangar: owning(MANTA) });

  click(dom.card);

  assert.equal(dom.dialog.modal, true);
  assert.deepEqual([dom.name.textContent, dom.blurb.textContent, dom.tag.textContent, dom.place.textContent], [MANTA.name, MANTA.blurb, 'Flying', '3/5']);
  assert.ok(dom.tag.classes.has('is-owned'));
  assert.equal(dom.wallet.textContent, '320');
  assert.equal(dom.buy.hidden, true);
  assert.deepEqual(portraits.at(-1), { canvas: dom.canvas, loadout: loadoutOf(HANGAR, owning(MANTA)) });
  assert.deepEqual([dom.tuneBench.hidden, dom.paintBench.hidden, dom.glowBench.hidden, dom.locked.hidden], [false, true, true, true]);
  assert.deepEqual([dom.tuneTab, dom.paintTab, dom.glowTab].map((tab) => tab.getAttribute('aria-pressed')), ['true', 'false', 'false']);

  // Opening it again changes nothing; closing it twice neither.
  click(dom.card);
  assert.equal(portraits.length, 1);
  click(dom.done);
  assert.equal(dom.dialog.hasAttribute('open'), false);
  click(dom.done);
  assert.equal(dom.dialog.hasAttribute('open'), false);
});

test('where dialogs are not modal the hangar still opens and closes', () => {
  const { dom } = setup({ modal: false });

  click(dom.card);
  assert.equal(dom.dialog.hasAttribute('open'), true);
  click(dom.done);
  assert.equal(dom.dialog.hasAttribute('open'), false);
});

test('each system shows what the craft comes with, what tuning added, and what the next level costs', () => {
  const hangar = { craft: '', owned: { [KESTREL.id]: { tune: { ...STOCK, engine: 2, guns: 3 }, paint: '', decal: '', glow: '' } } };
  const { dom, row } = setup({ tickets: HANGAR.prices[0], hangar });

  click(dom.card);

  const lit = (pips) => [pips.filter((pip) => pip === 'is-on').length, pips.filter((pip) => pip === 'is-tuned').length, pips.filter((pip) => pip === '').length];
  assert.deepEqual(lit(row('engine').pips), [3, 2, 3]);
  assert.deepEqual(lit(row('nitro').pips), [3, 0, 5]);
  assert.deepEqual(lit(row('guns').pips), [3, 3, 2]);
  assert.equal(row('engine').bar.getAttribute('aria-label'), `Engine 5 of ${TOP_RATING}`);

  // The next level, within reach or not; and none above the top.
  assert.deepEqual([row('nitro').button.textContent, row('nitro').button.hasAttribute('disabled')], [`+ ${HANGAR.prices[0]}`, false]);
  assert.equal(row('nitro').button.getAttribute('aria-label'), `Tune nitro to level 1 of 3 for ${HANGAR.prices[0]} tickets`);
  assert.deepEqual([row('engine').button.textContent, row('engine').button.hasAttribute('disabled')], [`+ ${HANGAR.prices[2]}`, true]);
  assert.deepEqual([row('guns').button.textContent, row('guns').button.hasAttribute('disabled'), row('guns').button.getAttribute('aria-label')], ['Max', true, 'Guns is tuned all the way']);
  assert.ok(Object.keys(HANGAR.systems).every((system) => row(system).button.hidden === false));
});

test('tuning a system spends the tickets, saves the craft, tells the game and shows it', () => {
  const { dom, row, preferences, changes, portraits } = setup({ tickets: HANGAR.prices[0] + 30 });

  click(dom.card);
  click(row('nitro').button);

  assert.deepEqual(preferences.writes, [{ tickets: 30, hangar: { craft: '', owned: { [KESTREL.id]: { tune: { ...STOCK, nitro: 1 }, paint: KESTREL.paint, decal: 'none', glow: KESTREL.paint } } } }]);
  assert.equal(changes.length, 1);
  assert.equal(dom.wallet.textContent, '30');
  assert.equal(row('nitro').pips.filter((pip) => pip === 'is-tuned').length, 1);
  assert.ok(portraits.at(-1).loadout.nitroSeconds > portraits[0].loadout.nitroSeconds, 'the craft on show is the craft as it now is');

  // Out of tickets, a press changes nothing.
  click(row('nitro').button);
  assert.equal(preferences.writes.length, 1);
  assert.equal(changes.length, 1);
});

test('the arrows bring the next craft round and round; one the player owns is flown from then on', () => {
  const { dom, preferences, changes } = setup({ hangar: owning(KESTREL, MANTA) });

  click(dom.card);
  assert.equal(dom.name.textContent, KESTREL.name);

  click(dom.next);
  assert.deepEqual([dom.name.textContent, dom.tag.textContent, dom.place.textContent], [HORNET.name, `${HORNET.price} tickets`, '2/5']);
  assert.equal(dom.tag.classes.has('is-owned'), false);
  assert.equal(preferences.writes.length, 0, 'looking at a craft does not choose it');

  click(dom.next);
  assert.deepEqual([dom.name.textContent, dom.tag.textContent], [MANTA.name, 'Flying']);
  assert.equal(preferences.get().hangar.craft, MANTA.id);
  assert.equal(changes.length, 1);

  click(dom.previous);
  click(dom.previous);
  assert.equal(dom.name.textContent, KESTREL.name);
  assert.equal(preferences.get().hangar.craft, KESTREL.id);
  click(dom.previous);
  assert.equal(dom.place.textContent, '5/5', 'round the end');
  click(dom.next);
  assert.equal(dom.place.textContent, '1/5');
  assert.equal(changes.length, 2, 'stopping again on the craft already flown changes nothing');
});

test('a craft the player does not own shows its price, and can be bought when the tickets are there', () => {
  const { dom, row, chip, preferences, changes } = setup({ tickets: HORNET.price - 100 });

  click(dom.card);
  click(dom.next);

  assert.deepEqual([dom.buy.hidden, dom.buy.hasAttribute('disabled'), dom.buy.textContent], [false, true, '100 tickets short']);
  assert.ok(Object.keys(HANGAR.systems).every((system) => row(system).button.hidden), 'nothing to tune on a craft not owned');
  click(dom.buy);
  assert.equal(preferences.writes.length, 0);

  // On the paint benches it says why nothing can be pressed.
  click(dom.paintTab);
  assert.deepEqual([dom.tuneBench.hidden, dom.paintBench.hidden, dom.glowBench.hidden, dom.locked.hidden], [true, false, true, false]);
  assert.ok(chip('paints', 'red').hasAttribute('disabled') && chip('decals', 'flames').hasAttribute('disabled'));
  click(chip('paints', 'red'));
  assert.equal(preferences.writes.length, 0);
  click(dom.glowTab);
  assert.deepEqual([dom.paintBench.hidden, dom.glowBench.hidden, dom.locked.hidden], [true, false, false]);
  assert.equal(dom.glowTab.getAttribute('aria-pressed'), 'true');
  click(dom.tuneTab);
  assert.equal(dom.locked.hidden, true);

  preferences.set({ tickets: HORNET.price + 40 });
  preferences.writes.length = 0;
  click(dom.previous);
  click(dom.next);
  assert.deepEqual([dom.buy.hasAttribute('disabled'), dom.buy.textContent], [false, `Buy · ${HORNET.price}`]);

  click(dom.buy);
  assert.equal(preferences.get().tickets, 40);
  assert.equal(preferences.get().hangar.craft, HORNET.id);
  assert.equal(changes.length, 1);
  assert.deepEqual([dom.buy.hidden, dom.tag.textContent, dom.wallet.textContent], [true, 'Flying', '40']);
  assert.ok(Object.keys(HANGAR.systems).every((system) => row(system).button.hidden === false));
});

test('a craft the player owns takes a paint, a decal and a light, each at a press', () => {
  const { dom, chip, preferences, portraits, changes } = setup();
  const rgb = (id) => HANGAR.paints.find((paint) => paint.id === id).rgb;

  click(dom.card);
  click(dom.paintTab);

  assert.equal(chip('paints', KESTREL.paint).getAttribute('aria-pressed'), 'true');
  assert.equal(chip('decals', 'none').getAttribute('aria-pressed'), 'true');
  assert.equal(chip('paints', 'red').hasAttribute('disabled'), false);

  click(chip('paints', 'red'));
  click(chip('decals', 'flames'));
  click(dom.glowTab);
  click(chip('glows', 'amber'));

  assert.deepEqual(preferences.get().hangar.owned[KESTREL.id], { tune: STOCK, paint: 'red', decal: 'flames', glow: 'amber' });
  assert.equal(preferences.get().tickets, 0, 'paint is free');
  assert.equal(changes.length, 3);
  assert.deepEqual([chip('paints', 'red'), chip('paints', KESTREL.paint), chip('decals', 'flames'), chip('glows', 'amber'), chip('glows', 'red')].map((button) => button.getAttribute('aria-pressed')), ['true', 'false', 'true', 'true', 'false']);

  const { loadout } = portraits.at(-1);
  assert.deepEqual([loadout.paint, loadout.decal, loadout.glow], [rgb('red'), 'flames', rgb('amber')]);
});

test('the Signal decal is earned from the story: until then it says how far the player is from it', () => {
  const locked = setup({ signal: 0b01001 });
  click(locked.dom.card);
  click(locked.dom.paintTab);
  const signal = locked.chip('decals', 'signal');

  assert.equal(signal.textContent, 'Signal', 'short, so five decals fit a small screen');
  assert.ok(signal.hasAttribute('disabled'));
  assert.equal(signal.getAttribute('aria-label'), 'Signal, earned by recovering all 5 fragments of The Last Signal: 2 so far');
  assert.deepEqual([locked.dom.earn.hidden, locked.dom.earn.textContent], [false, 'Signal: 2/5 fragments']);
  click(signal);
  assert.deepEqual(locked.preferences.writes, [], 'not worn before it is earned');

  const earned = setup({ signal: 0b11111 });
  click(earned.dom.card);
  click(earned.dom.paintTab);
  const worn = earned.chip('decals', 'signal');
  assert.deepEqual([worn.textContent, worn.hasAttribute('disabled'), worn.getAttribute('aria-label')], ['Signal', false, 'Signal']);
  assert.equal(earned.dom.earn.hidden, true);
  click(worn);
  assert.equal(earned.preferences.get().hangar.owned[KESTREL.id].decal, 'signal');
  assert.equal(earned.chip('decals', 'signal').getAttribute('aria-pressed'), 'true');
});

test('disconnecting takes the hangar\'s hands off the page', () => {
  const { view, dom, row, preferences } = setup({ tickets: 9999 });
  const button = row('engine').button;

  view.disconnect();
  click(dom.card);
  click(button);

  assert.equal(dom.dialog.hasAttribute('open'), false);
  assert.equal(preferences.writes.length, 0);
});
