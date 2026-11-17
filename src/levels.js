/** @import { LevelLayout } from './domain/types.js' */

/**
 * The walls of the Bricks game, drawn a character a brick: `.` nothing, `o` a plain brick,
 * `O` a tough one, `#` steel, `*` a bomb. Each is ten bricks across. They are the emblems of
 * the arcade's regulars, from the career ladder, in the order a player meets them; the last
 * two sway from side to side.
 *
 * @type {readonly LevelLayout[]}
 */
export const BRICK_LEVELS = Object.freeze([
  {
    name: 'First Coin',
    drift: null,
    rows: [
      '..........',
      '.oooooooo.',
      '.oooooooo.',
      '.oo*oo*oo.',
      '.oooooooo.',
      '.oooooooo.',
    ],
  },
  {
    name: 'The Hanger',
    drift: null,
    rows: [
      '....oo....',
      '...o..o...',
      '......o...',
      '.....o....',
      '....oo....',
      '...oOOo...',
      '..oo..oo..',
      '.oo....oo.',
      'oOOOOOOOOo',
    ],
  },
  {
    name: 'The Bucket',
    drift: null,
    rows: [
      'o........o',
      'oo......oo',
      '.OOOOOOOO.',
      '.oooooooo.',
      '.oo*oo*oo.',
      '..oooooo..',
      '..oooooo..',
      '...OOOO...',
      '....oo....',
    ],
  },
  {
    name: 'Crosshair',
    drift: null,
    rows: [
      '....oo....',
      '..oo##oo..',
      '.o..oo..o.',
      'o...oo...o',
      'o#oo**oo#o',
      'o...oo...o',
      '.o..oo..o.',
      '..oo##oo..',
      '....oo....',
    ],
  },
  {
    name: 'Headphones',
    drift: null,
    rows: [
      '..OOOOOO..',
      '.Oo....oO.',
      '.o......o.',
      'oo......oo',
      'ooo....ooo',
      'o*o....o*o',
      'ooo....ooo',
      '.o......o.',
    ],
  },
  {
    name: 'The Router',
    drift: null,
    rows: [
      'o........o',
      '.o......o.',
      '..o....o..',
      '#OOOOOOOO#',
      'Oo*oooo*oO',
      'Oooo**oooO',
      'oOOOOOOOOo',
    ],
  },
  {
    name: 'Ball of Yarn',
    drift: { span: 34, period: 7 },
    rows: [
      '...oooo...',
      '..oOooOo..',
      '.oOooOooo.',
      '.OooOooOo.',
      '.ooOooOoo.',
      '.oOooOooo.',
      '..oooOoo..',
      '...oooo...',
    ],
  },
  {
    name: 'The Key',
    drift: { span: 80, period: 6 },
    rows: [
      '...OOOO...',
      '..OO**OO..',
      '..O*..*O..',
      '..OO**OO..',
      '...OOOO...',
      '....OO....',
      '....OO....',
      '....OOOO..',
      '....OO....',
      '....OOOO..',
    ],
  },
].map((level) => Object.freeze({ ...level, rows: Object.freeze(level.rows) })));
