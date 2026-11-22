/** @import { HangarCatalog } from './application/ports.js' */

/**
 * The hangar of the Warp game: the crafts a player can fly, what tuning costs, and the paint
 * shop. Each craft is good at something: its systems are rated from 1 to 5 untuned, and each
 * can be tuned three levels up. The first craft is everyone's, and the cup is tuned for it as
 * it comes; the rest are bought with the tickets the cabinet pays out for a cup. Paint, decals
 * and the light under a craft cost nothing: they are only for show.
 *
 * The prices come from flying the cup with human-like pilots: a cup scores forty to fifty-five
 * thousand points, races flown again included, so it pays about two thousand tickets. That is
 * a few first levels of tuning after a first cup, a second craft after two, and a craft tuned
 * all the way after about ten. Tuned so, a casual pilot who wins one cup in four in the craft
 * as it comes wins nearly every one.
 *
 * @type {HangarCatalog}
 */
export const HANGAR = Object.freeze({
  crafts: Object.freeze([
    Object.freeze({ id: 'kestrel', name: 'Kestrel', kind: 'jet', price: 0, paint: 'cyan', blurb: 'The all-rounder the cup is tuned for.', stats: Object.freeze({ engine: 3, nitro: 3, grip: 3, armor: 3, guns: 3 }) }),
    Object.freeze({ id: 'hornet', name: 'Hornet', kind: 'dart', price: 2500, paint: 'lime', blurb: 'Light, and quick to charge a drift.', stats: Object.freeze({ engine: 3, nitro: 4, grip: 5, armor: 1, guns: 2 }) }),
    Object.freeze({ id: 'manta', name: 'Manta', kind: 'wing', price: 4000, paint: 'violet', blurb: 'Flat out the fastest thing in the cup.', stats: Object.freeze({ engine: 5, nitro: 2, grip: 2, armor: 3, guns: 3 }) }),
    Object.freeze({ id: 'bulwark', name: 'Bulwark', kind: 'heavy', price: 6000, paint: 'amber', blurb: 'A shield, and the biggest guns.', stats: Object.freeze({ engine: 2, nitro: 2, grip: 2, armor: 5, guns: 5 }) }),
    Object.freeze({ id: 'halo', name: 'Halo', kind: 'saucer', price: 8000, paint: 'pink', blurb: 'A tank of nitro with a hull round it.', stats: Object.freeze({ engine: 4, nitro: 5, grip: 4, armor: 2, guns: 1 }) }),
  ]),
  systems: Object.freeze({ engine: 'Engine', nitro: 'Nitro', grip: 'Grip', armor: 'Armor', guns: 'Guns' }),
  prices: Object.freeze([500, 1200, 2500]),
  paints: Object.freeze([
    Object.freeze({ id: 'cyan', name: 'Cyan', rgb: '34, 211, 238' }),
    Object.freeze({ id: 'pink', name: 'Pink', rgb: '244, 114, 182' }),
    Object.freeze({ id: 'amber', name: 'Amber', rgb: '251, 191, 36' }),
    Object.freeze({ id: 'lime', name: 'Lime', rgb: '163, 230, 53' }),
    Object.freeze({ id: 'violet', name: 'Violet', rgb: '167, 139, 250' }),
    Object.freeze({ id: 'red', name: 'Red', rgb: '239, 68, 68' }),
    Object.freeze({ id: 'teal', name: 'Teal', rgb: '45, 212, 191' }),
    Object.freeze({ id: 'silver', name: 'Silver', rgb: '203, 213, 225' }),
  ]),
  decals: Object.freeze([
    Object.freeze({ id: 'none', name: 'None' }),
    Object.freeze({ id: 'stripes', name: 'Stripes' }),
    Object.freeze({ id: 'chevrons', name: 'Chevrons' }),
    Object.freeze({ id: 'flames', name: 'Flames' }),
  ]),
  pointsPerTicket: 25,
});
