import { CRAFT_SYSTEMS } from './ports.js';

/**
 * The hangar of the Warp game: which craft the player flies, what it can do once tuned, and
 * what buying and tuning cost. Everything here is worked out from what the hangar offers and
 * what the player has chosen; nothing is stored here. A purchase is a change to the player's
 * tickets and hangar, or null when it cannot be made.
 *
 * @import { Loadout } from '../domain/types.js'
 * @import { CraftSetup, CraftSpec, CraftSystem, HangarCatalog, HangarChoices } from './ports.js'
 *
 * @typedef {{ tickets: number, hangar: HangarChoices }} Wallet what the player has to spend, and their hangar
 *
 * @typedef {object} SystemView A system of a craft, as the hangar shows it.
 * @property {CraftSystem} system
 * @property {string} name
 * @property {number} rating how good it is now, tuning included
 * @property {number} level how far it is tuned, from 0
 * @property {number} levels how far it can be tuned
 * @property {number | null} price what the next level costs; null when there is none
 * @property {boolean} affordable whether the player owns the craft and has the tickets for it
 *
 * @typedef {object} CraftView A craft, as the hangar shows it.
 * @property {CraftSpec} spec
 * @property {boolean} owned
 * @property {boolean} chosen whether it is the craft the player flies
 * @property {boolean} affordable whether the player has the tickets to buy it
 * @property {CraftSetup} setup
 * @property {readonly SystemView[]} systems
 * @property {Loadout} loadout
 */

/** The highest a system is rated, tuned as far as it goes: the hangar's bars are this long. */
export const TOP_RATING = 8;

/**
 * @param {HangarCatalog} catalog
 * @param {HangarChoices} hangar
 * @param {string} id
 * @returns {boolean} whether the player has the craft: the first is everyone's
 */
export function owns(catalog, hangar, id) {
  const spec = catalog.crafts.find((craft) => craft.id === id);
  return spec !== undefined && (spec.price === 0 || Object.hasOwn(hangar.owned, id));
}

/**
 * @param {HangarCatalog} catalog
 * @param {HangarChoices} hangar
 * @returns {CraftSpec} the craft the player flies: the one chosen, if they have it, else the first
 */
export function chosenCraft(catalog, hangar) {
  return catalog.crafts.find((craft) => craft.id === hangar.craft && owns(catalog, hangar, craft.id)) ?? catalog.crafts[0];
}

/**
 * How a craft is set up: as the player left it, with anything the hangar no longer offers put
 * back to how the craft comes.
 *
 * @param {HangarCatalog} catalog
 * @param {HangarChoices} hangar
 * @param {CraftSpec} spec
 * @returns {CraftSetup}
 */
export function setupOf(catalog, hangar, spec) {
  const kept = Object.hasOwn(hangar.owned, spec.id) ? hangar.owned[spec.id] : null;
  const levels = catalog.prices.length;
  /** @param {string | undefined} id */
  const paint = (id) => (catalog.paints.some((entry) => entry.id === id) ? /** @type {string} */ (id) : spec.paint);

  return {
    tune: /** @type {Record<CraftSystem, number>} */ (Object.fromEntries(CRAFT_SYSTEMS.map((system) => [system, Math.min(kept?.tune[system] ?? 0, levels)]))),
    paint: paint(kept?.paint),
    decal: catalog.decals.find((entry) => entry.id === kept?.decal)?.id ?? catalog.decals[0].id,
    glow: paint(kept?.glow),
  };
}

/**
 * What a craft can do, from how its systems are rated, tuning included. A craft rated 3 all
 * round is the one the game is tuned for.
 *
 * @param {HangarCatalog} catalog
 * @param {CraftSpec} spec
 * @param {CraftSetup} setup
 * @returns {Loadout}
 */
export function loadoutFor(catalog, spec, setup) {
  /** @param {CraftSystem} system */
  const rated = (system) => spec.stats[system] + setup.tune[system];
  /** @param {string} id */
  const rgb = (id) => /** @type {{ rgb: string }} */ (catalog.paints.find((entry) => entry.id === id)).rgb;
  const armor = rated('armor');

  return {
    name: spec.name,
    kind: spec.kind,
    paint: rgb(setup.paint),
    decal: setup.decal,
    glow: rgb(setup.glow),
    // In whole hundredths, so a craft rated 3 comes to exactly 1.
    speed: (94 + 2 * rated('engine')) / 100,
    nitroBars: 2 + Math.floor(rated('nitro') / 2),
    nitroSeconds: (12 + rated('nitro')) / 10,
    drift: (130 - 10 * rated('grip')) / 100,
    spin: (115 - 5 * armor) / 100,
    shields: armor >= 7 ? 2 : armor >= 5 ? 1 : 0,
    damage: 25 + 10 * rated('guns'),
    rockets: 1 + Math.floor(rated('guns') / 3),
  };
}

/**
 * @param {HangarCatalog} catalog
 * @param {HangarChoices} hangar
 * @returns {Loadout} the craft the player flies, as tuned and painted
 */
export function loadoutOf(catalog, hangar) {
  const spec = chosenCraft(catalog, hangar);
  return loadoutFor(catalog, spec, setupOf(catalog, hangar, spec));
}

/**
 * @param {HangarCatalog} catalog
 * @param {number} points a cup's points
 * @returns {number} the tickets they earn
 */
export function ticketsFor(catalog, points) {
  return Math.floor(points / catalog.pointsPerTicket);
}

/**
 * Every craft of the hangar, as it stands for the player.
 *
 * @param {HangarCatalog} catalog
 * @param {Wallet} wallet
 * @returns {CraftView[]}
 */
export function hangarView(catalog, { tickets, hangar }) {
  const flown = chosenCraft(catalog, hangar);

  return catalog.crafts.map((spec) => {
    const owned = owns(catalog, hangar, spec.id);
    const setup = setupOf(catalog, hangar, spec);

    return {
      spec,
      owned,
      chosen: spec === flown,
      affordable: !owned && tickets >= spec.price,
      setup,
      systems: CRAFT_SYSTEMS.map((system) => {
        const level = setup.tune[system];
        const price = catalog.prices[level] ?? null;

        return { system, name: catalog.systems[system], rating: spec.stats[system] + level, level, levels: catalog.prices.length, price, affordable: owned && price !== null && tickets >= price };
      }),
      loadout: loadoutFor(catalog, spec, setup),
    };
  });
}

/**
 * @param {HangarChoices} hangar
 * @param {string} id
 * @param {CraftSetup} setup
 * @returns {HangarChoices} the hangar with that craft set up so
 */
function withSetup(hangar, id, setup) {
  return { ...hangar, owned: { ...hangar.owned, [id]: setup } };
}

/**
 * Buys a craft, and flies it.
 *
 * @param {HangarCatalog} catalog
 * @param {Wallet} wallet
 * @param {string} id
 * @returns {Wallet | null} null if there is no such craft, the player has it, or cannot afford it
 */
export function buyCraft(catalog, { tickets, hangar }, id) {
  const spec = catalog.crafts.find((craft) => craft.id === id);

  if (!spec || owns(catalog, hangar, id) || tickets < spec.price) {
    return null;
  }

  return { tickets: tickets - spec.price, hangar: { ...withSetup(hangar, id, setupOf(catalog, hangar, spec)), craft: id } };
}

/**
 * Chooses the craft to fly.
 *
 * @param {HangarCatalog} catalog
 * @param {Wallet} wallet
 * @param {string} id
 * @returns {Wallet | null} null if the player does not have it
 */
export function flyCraft(catalog, { tickets, hangar }, id) {
  return owns(catalog, hangar, id) ? { tickets, hangar: { ...hangar, craft: id } } : null;
}

/**
 * Tunes a system of a craft the player has one level up.
 *
 * @param {HangarCatalog} catalog
 * @param {Wallet} wallet
 * @param {string} id
 * @param {CraftSystem} system
 * @returns {Wallet | null} null if it cannot be tuned further, or the player cannot afford it
 */
export function tuneCraft(catalog, { tickets, hangar }, id, system) {
  const spec = catalog.crafts.find((craft) => craft.id === id);

  if (!spec || !owns(catalog, hangar, id) || !CRAFT_SYSTEMS.includes(system)) {
    return null;
  }

  const setup = setupOf(catalog, hangar, spec);
  const price = catalog.prices[setup.tune[system]];

  if (price === undefined || tickets < price) {
    return null;
  }

  return { tickets: tickets - price, hangar: withSetup(hangar, id, { ...setup, tune: { ...setup.tune, [system]: setup.tune[system] + 1 } }) };
}

/**
 * How many fragments of the Warp story's signal the player has recovered, from the chapters
 * recovered, a bit a chapter.
 *
 * @param {number} signal
 */
export function fragmentsIn(signal) {
  let count = 0;

  for (let rest = Math.max(0, Math.floor(signal)); rest > 0; rest = Math.floor(rest / 2)) {
    count += rest % 2;
  }

  return count;
}

/**
 * Whether the player may wear a decal: any of them, but one earned from the story only once
 * they have recovered its fragments.
 *
 * @param {{ fragments?: number }} decal
 * @param {number} fragments recovered
 */
export function decalOpen(decal, fragments) {
  return decal.fragments === undefined || fragments >= decal.fragments;
}

/**
 * Paints a craft the player has: its paint, how the paint is marked, or the light under it.
 *
 * @param {HangarCatalog} catalog
 * @param {Wallet} wallet
 * @param {string} id
 * @param {Partial<Pick<CraftSetup, 'paint' | 'decal' | 'glow'>>} look
 * @param {number} [fragments] fragments of the story's signal recovered, which earn a decal
 * @returns {Wallet | null} null if the player does not have the craft, the hangar has no such paint, or
 *   the decal is not yet earned
 */
export function paintCraft(catalog, { tickets, hangar }, id, look, fragments = 0) {
  const spec = catalog.crafts.find((craft) => craft.id === id);
  const decal = catalog.decals.find((entry) => entry.id === look.decal);
  const known = [look.paint, look.glow].every((paint) => paint === undefined || catalog.paints.some((entry) => entry.id === paint))
    && (look.decal === undefined || (decal !== undefined && decalOpen(decal, fragments)));

  if (!spec || !owns(catalog, hangar, id) || !known) {
    return null;
  }

  return { tickets, hangar: withSetup(hangar, id, { ...setupOf(catalog, hangar, spec), ...look }) };
}
