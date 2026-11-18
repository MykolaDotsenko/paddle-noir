/** @import { SectorLayout } from './domain/types.js' */

/**
 * The sectors of the Nova game, flown in order: what comes in each, wave by wave. Rocks drift
 * down and split in two; drones weave down in formation and fire at the ship; gunships stop
 * near the top, strafe and fire in threes. The last sector ends with the boss.
 *
 * @type {readonly SectorLayout[]}
 */
export const NOVA_SECTORS = Object.freeze(/** @type {SectorLayout[]} */ ([
  {
    name: 'Rock Garden',
    boss: false,
    waves: [
      { kind: 'rock', count: 6, every: 1.2, formation: 'scatter' },
      { kind: 'rock', count: 8, every: 0.9, formation: 'scatter' },
      { kind: 'drone', count: 5, every: 0.5, formation: 'line' },
      { kind: 'pebble', count: 10, every: 0.45, formation: 'scatter' },
      { kind: 'rock', count: 8, every: 0.8, formation: 'scatter' },
    ],
  },
  {
    name: 'Drone Hive',
    boss: false,
    waves: [
      { kind: 'drone', count: 8, every: 0.35, formation: 'snake' },
      { kind: 'drone', count: 6, every: 0.4, formation: 'left' },
      { kind: 'drone', count: 6, every: 0.4, formation: 'right' },
      { kind: 'rock', count: 6, every: 0.8, formation: 'scatter' },
      { kind: 'drone', count: 7, every: 0.5, formation: 'line' },
    ],
  },
  {
    name: 'Gunship Alley',
    boss: false,
    waves: [
      { kind: 'gunship', count: 2, every: 2, formation: 'scatter' },
      { kind: 'drone', count: 8, every: 0.35, formation: 'snake' },
      { kind: 'gunship', count: 3, every: 2.5, formation: 'scatter' },
      { kind: 'pebble', count: 12, every: 0.4, formation: 'scatter' },
      { kind: 'drone', count: 6, every: 0.45, formation: 'line' },
    ],
  },
  {
    name: 'Meteor Storm',
    boss: false,
    waves: [
      { kind: 'rock', count: 12, every: 0.55, formation: 'scatter' },
      { kind: 'pebble', count: 16, every: 0.3, formation: 'scatter' },
      { kind: 'drone', count: 8, every: 0.35, formation: 'left' },
      { kind: 'gunship', count: 2, every: 2, formation: 'scatter' },
      { kind: 'rock', count: 14, every: 0.45, formation: 'scatter' },
    ],
  },
  {
    name: 'The Dreadnought',
    boss: true,
    waves: [
      { kind: 'drone', count: 8, every: 0.35, formation: 'snake' },
      { kind: 'gunship', count: 2, every: 2, formation: 'scatter' },
      { kind: 'drone', count: 6, every: 0.4, formation: 'line' },
    ],
  },
]).map((sector) => Object.freeze({ ...sector, waves: Object.freeze(sector.waves.map((wave) => Object.freeze({ ...wave }))) })));
