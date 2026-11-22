import assert from 'node:assert/strict';
import test from 'node:test';

import { buyCraft, chosenCraft, flyCraft, hangarView, loadoutFor, loadoutOf, owns, paintCraft, setupOf, ticketsFor, TOP_RATING, tuneCraft } from '../src/application/hangar.js';
import { CRAFT_SYSTEMS } from '../src/application/ports.js';
import { WARP_LOADOUT } from '../src/config.js';
import { HANGAR } from '../src/hangar.js';

const EMPTY = { craft: '', owned: {} };
const STOCK = { engine: 0, nitro: 0, grip: 0, armor: 0, guns: 0 };
const [KESTREL, HORNET, MANTA, BULWARK, HALO] = HANGAR.crafts;

/** A hangar with these crafts bought, and the first of them flown. */
function owning(...specs) {
  return { craft: specs[0].id, owned: Object.fromEntries(specs.map((spec) => [spec.id, { tune: STOCK, paint: '', decal: '', glow: '' }])) };
}

test('the hangar offers five crafts, each good at something, and the first is everyone\'s', () => {
  assert.deepEqual(HANGAR.crafts.map((craft) => craft.kind), ['jet', 'dart', 'wing', 'heavy', 'saucer']);
  assert.equal(new Set(HANGAR.crafts.map((craft) => craft.id)).size, HANGAR.crafts.length);
  assert.equal(KESTREL.price, 0);

  for (const craft of HANGAR.crafts) {
    assert.deepEqual(Object.keys(craft.stats), CRAFT_SYSTEMS, craft.name);
    assert.ok(Object.values(craft.stats).every((rating) => rating >= 1 && rating <= 5), craft.name);
    assert.ok(HANGAR.paints.some((paint) => paint.id === craft.paint), `${craft.name} comes in a paint the shop has`);
    assert.ok(Object.values(craft.stats).every((rating) => rating + HANGAR.prices.length <= TOP_RATING), `${craft.name} fits the bars`);
  }

  // A dearer craft is not simply better: they all add up to much the same.
  const totals = HANGAR.crafts.map((craft) => Object.values(craft.stats).reduce((sum, rating) => sum + rating, 0));
  assert.ok(Math.max(...totals) - Math.min(...totals) <= 2, JSON.stringify(totals));
  assert.deepEqual(HANGAR.crafts.map((craft) => craft.price), [...HANGAR.crafts.map((craft) => craft.price)].sort((a, b) => a - b));
  assert.deepEqual([...HANGAR.prices], [...HANGAR.prices].sort((a, b) => a - b), 'each level costs more than the last');
  assert.equal(HANGAR.decals[0].id, 'none');
});

test('the craft everyone has, untuned, is the one the cup is tuned for', () => {
  assert.deepEqual(loadoutOf(HANGAR, EMPTY), WARP_LOADOUT);
  assert.equal(chosenCraft(HANGAR, EMPTY), KESTREL);
  assert.equal(owns(HANGAR, EMPTY, KESTREL.id), true);
  assert.equal(owns(HANGAR, EMPTY, HORNET.id), false);
  assert.equal(owns(HANGAR, EMPTY, 'tricycle'), false);
});

test('a craft chosen but not owned, or no longer offered, is not flown', () => {
  assert.equal(chosenCraft(HANGAR, { craft: MANTA.id, owned: {} }), KESTREL);
  assert.equal(chosenCraft(HANGAR, { craft: 'tricycle', owned: { tricycle: owning(KESTREL).owned.kestrel } }), KESTREL);
  assert.equal(chosenCraft(HANGAR, owning(MANTA)), MANTA);
  // An inherited name is not a craft.
  assert.equal(chosenCraft(HANGAR, { craft: 'toString', owned: {} }), KESTREL);
});

test('every system does what it says, and tuning it does more', () => {
  const stock = (spec) => loadoutFor(HANGAR, spec, setupOf(HANGAR, EMPTY, spec));
  const tuned = (spec, system) => loadoutFor(HANGAR, spec, { ...setupOf(HANGAR, EMPTY, spec), tune: { ...STOCK, [system]: 3 } });

  assert.ok(stock(MANTA).speed > stock(KESTREL).speed && stock(KESTREL).speed > stock(BULWARK).speed, 'engine is speed');
  assert.ok(stock(HALO).nitroBars > stock(KESTREL).nitroBars && stock(HALO).nitroSeconds > stock(KESTREL).nitroSeconds, 'nitro is bars and seconds');
  assert.ok(stock(HORNET).drift < stock(KESTREL).drift, 'grip charges a drift sooner');
  assert.ok(stock(BULWARK).spin < stock(KESTREL).spin && stock(HORNET).spin > stock(KESTREL).spin, 'armor shortens a spin');
  assert.equal(stock(BULWARK).shields, 1);
  assert.equal(stock(KESTREL).shields, 0);
  assert.ok(stock(BULWARK).damage > stock(KESTREL).damage && stock(HALO).damage < stock(KESTREL).damage, 'guns are damage');
  assert.ok(stock(BULWARK).rockets >= stock(KESTREL).rockets && stock(KESTREL).rockets > stock(HALO).rockets, 'and rockets carried');

  assert.ok(tuned(KESTREL, 'engine').speed > stock(KESTREL).speed);
  assert.ok(tuned(KESTREL, 'nitro').nitroBars > stock(KESTREL).nitroBars);
  assert.ok(tuned(KESTREL, 'nitro').nitroSeconds > stock(KESTREL).nitroSeconds);
  assert.ok(tuned(KESTREL, 'grip').drift < stock(KESTREL).drift);
  assert.ok(tuned(KESTREL, 'armor').spin < stock(KESTREL).spin);
  assert.equal(tuned(KESTREL, 'armor').shields, 1);
  assert.equal(tuned(BULWARK, 'armor').shields, 2);
  assert.ok(tuned(KESTREL, 'guns').damage > stock(KESTREL).damage);
  assert.ok(tuned(KESTREL, 'guns').rockets > stock(KESTREL).rockets);

  for (const spec of HANGAR.crafts) {
    const most = loadoutFor(HANGAR, spec, { ...setupOf(HANGAR, EMPTY, spec), tune: { engine: 3, nitro: 3, grip: 3, armor: 3, guns: 3 } });

    assert.ok(most.speed <= 1.1 && stock(spec).speed >= 0.96, `${spec.name} stays a craft of this cup`);
    assert.ok(most.drift > 0 && most.spin > 0 && stock(spec).damage > 0 && stock(spec).rockets >= 1 && stock(spec).nitroBars >= 1, spec.name);
  }
});

test('a craft comes in its own paint, unmarked, and lit to match', () => {
  const loadout = loadoutOf(HANGAR, owning(MANTA));
  const violet = HANGAR.paints.find((paint) => paint.id === MANTA.paint);

  assert.deepEqual({ name: loadout.name, kind: loadout.kind, paint: loadout.paint, decal: loadout.decal, glow: loadout.glow }, { name: 'Manta', kind: 'wing', paint: violet.rgb, decal: 'none', glow: violet.rgb });
});

test('a setup the hangar no longer offers goes back to how the craft comes', () => {
  const kept = { tune: { engine: 9, nitro: 1, grip: 0, armor: 0, guns: 0 }, paint: 'tartan', decal: 'skulls', glow: 'red' };
  const setup = setupOf(HANGAR, { craft: HORNET.id, owned: { [HORNET.id]: kept } }, HORNET);

  assert.deepEqual(setup, { tune: { engine: HANGAR.prices.length, nitro: 1, grip: 0, armor: 0, guns: 0 }, paint: HORNET.paint, decal: 'none', glow: 'red' });
});

test('tickets are a share of a cup\'s points', () => {
  assert.equal(ticketsFor(HANGAR, 0), 0);
  assert.equal(ticketsFor(HANGAR, HANGAR.pointsPerTicket - 1), 0);
  assert.equal(ticketsFor(HANGAR, 12340), Math.floor(12340 / HANGAR.pointsPerTicket));
});

test('buying a craft spends its price and flies it', () => {
  const wallet = { tickets: HORNET.price + 40, hangar: EMPTY };
  const bought = buyCraft(HANGAR, wallet, HORNET.id);

  assert.equal(bought.tickets, 40);
  assert.equal(bought.hangar.craft, HORNET.id);
  assert.equal(owns(HANGAR, bought.hangar, HORNET.id), true);
  assert.deepEqual(wallet, { tickets: HORNET.price + 40, hangar: EMPTY }, 'the wallet handed in is left as it was');

  assert.equal(buyCraft(HANGAR, { tickets: HORNET.price - 1, hangar: EMPTY }, HORNET.id), null, 'too dear');
  assert.equal(buyCraft(HANGAR, bought, HORNET.id), null, 'already owned');
  assert.equal(buyCraft(HANGAR, wallet, KESTREL.id), null, 'everyone has it');
  assert.equal(buyCraft(HANGAR, wallet, 'tricycle'), null);
});

test('only a craft the player has can be flown', () => {
  const wallet = { tickets: 7, hangar: owning(MANTA) };

  assert.deepEqual(flyCraft(HANGAR, wallet, KESTREL.id), { tickets: 7, hangar: { ...wallet.hangar, craft: KESTREL.id } });
  assert.equal(flyCraft(HANGAR, wallet, HALO.id), null);
});

test('tuning goes a level at a time, each dearer, and stops at the top', () => {
  let wallet = { tickets: HANGAR.prices.reduce((sum, price) => sum + price, 0), hangar: EMPTY };

  HANGAR.prices.forEach((price, level) => {
    const before = wallet.tickets;
    wallet = tuneCraft(HANGAR, wallet, KESTREL.id, 'engine');
    assert.equal(wallet.tickets, before - price);
    assert.equal(wallet.hangar.owned[KESTREL.id].tune.engine, level + 1);
  });

  assert.equal(wallet.tickets, 0);
  assert.equal(tuneCraft(HANGAR, { ...wallet, tickets: 99999 }, KESTREL.id, 'engine'), null, 'nothing above the top');
  assert.equal(tuneCraft(HANGAR, { tickets: HANGAR.prices[0] - 1, hangar: EMPTY }, KESTREL.id, 'guns'), null, 'too dear');
  assert.equal(tuneCraft(HANGAR, { tickets: 99999, hangar: EMPTY }, HORNET.id, 'guns'), null, 'not theirs to tune');
  assert.equal(tuneCraft(HANGAR, { tickets: 99999, hangar: EMPTY }, 'tricycle', 'guns'), null);
  assert.equal(tuneCraft(HANGAR, { tickets: 99999, hangar: EMPTY }, KESTREL.id, 'cupholder'), null);
  assert.equal(loadoutOf(HANGAR, wallet.hangar).speed, loadoutFor(HANGAR, KESTREL, { ...setupOf(HANGAR, EMPTY, KESTREL), tune: { ...STOCK, engine: 3 } }).speed);
});

test('paint is free, and only what the shop has goes on', () => {
  const wallet = { tickets: 3, hangar: EMPTY };
  const painted = paintCraft(HANGAR, wallet, KESTREL.id, { paint: 'red', decal: 'flames' });

  assert.equal(painted.tickets, 3);
  assert.deepEqual(painted.hangar.owned[KESTREL.id], { tune: STOCK, paint: 'red', decal: 'flames', glow: KESTREL.paint });

  const lit = paintCraft(HANGAR, painted, KESTREL.id, { glow: 'pink' });
  const loadout = loadoutOf(HANGAR, lit.hangar);
  const rgb = (id) => HANGAR.paints.find((paint) => paint.id === id).rgb;

  assert.deepEqual({ paint: loadout.paint, decal: loadout.decal, glow: loadout.glow }, { paint: rgb('red'), decal: 'flames', glow: rgb('pink') });
  assert.equal(paintCraft(HANGAR, wallet, KESTREL.id, { paint: 'tartan' }), null);
  assert.equal(paintCraft(HANGAR, wallet, KESTREL.id, { glow: 'tartan' }), null);
  assert.equal(paintCraft(HANGAR, wallet, KESTREL.id, { decal: 'skulls' }), null);
  assert.equal(paintCraft(HANGAR, wallet, HORNET.id, { paint: 'red' }), null, 'not theirs to paint');
  assert.equal(paintCraft(HANGAR, wallet, 'tricycle', { paint: 'red' }), null);
});

test('the hangar shows every craft as it stands for the player', () => {
  const tuned = tuneCraft(HANGAR, { tickets: HANGAR.prices[0] + HORNET.price, hangar: EMPTY }, KESTREL.id, 'nitro');
  const view = hangarView(HANGAR, tuned);
  const [kestrel, hornet, manta] = view;

  assert.deepEqual(view.map((craft) => craft.spec), HANGAR.crafts);
  assert.deepEqual(view.map((craft) => craft.owned), [true, false, false, false, false]);
  assert.deepEqual(view.map((craft) => craft.chosen), [true, false, false, false, false]);
  assert.deepEqual([kestrel.affordable, hornet.affordable, manta.affordable], [false, true, false], 'only what is not owned and within reach');

  const nitro = kestrel.systems.find((entry) => entry.system === 'nitro');
  const engine = kestrel.systems.find((entry) => entry.system === 'engine');

  assert.deepEqual(kestrel.systems.map((entry) => entry.system), CRAFT_SYSTEMS);
  assert.deepEqual(nitro, { system: 'nitro', name: 'Nitro', rating: KESTREL.stats.nitro + 1, level: 1, levels: 3, price: HANGAR.prices[1], affordable: true });
  assert.deepEqual({ price: engine.price, affordable: engine.affordable }, { price: HANGAR.prices[0], affordable: true });
  assert.ok(hornet.systems.every((entry) => !entry.affordable), 'a craft not owned cannot be tuned');
  assert.equal(kestrel.loadout.nitroSeconds, loadoutOf(HANGAR, tuned.hangar).nitroSeconds);

  // Tuned as far as it goes, a system has no next level to price.
  let wallet = { tickets: 99999, hangar: EMPTY };
  for (let level = 0; level < HANGAR.prices.length; level += 1) {
    wallet = tuneCraft(HANGAR, wallet, KESTREL.id, 'guns');
  }
  const guns = hangarView(HANGAR, wallet)[0].systems.find((entry) => entry.system === 'guns');
  assert.deepEqual({ level: guns.level, price: guns.price, affordable: guns.affordable }, { level: 3, price: null, affordable: false });
});
