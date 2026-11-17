/**
 * The Rush cabinet's high-score table, in the manner of an arcade's: ten rows of three initials
 * and a run's hits, best first. It arrives filled in by the arcade's regulars, and the player's
 * best run takes its place among them, under "YOU" until they sign it. A run has to beat a row
 * to pass it: on equal hits the row that was there first stays above.
 *
 * @import { HighScore, HighScoreRow, HighScoresView } from './ports.js'
 */

/** Rows on the table; a run below the last of them is not on it. */
export const TABLE_ROWS = 10;

/** What the player's row is signed with until they enter initials. */
export const UNSIGNED = 'YOU';

export const INITIALS_LENGTH = 3;

/**
 * @param {unknown} value
 * @returns {string} three capital letters, or '' for anything else
 */
export function validInitials(value) {
  return typeof value === 'string' && /^[A-Z]{3}$/.test(value) ? value : '';
}

/**
 * @param {readonly HighScore[]} table the table as the arcade left it
 * @param {number} best the player's best run, in hits
 * @param {string} initials the player's initials, or '' while they have not signed
 * @param {number} [before] the player's best before the run just finished, which tells who that
 *   run went past; the best itself when no run has just finished
 * @returns {HighScoresView}
 */
export function highScores(table, best, initials, before = best) {
  const regulars = [...table].sort((a, b) => b.hits - a.hits);
  // Whoever has at least as many hits stays above the player.
  const above = regulars.filter((row) => row.hits >= best).length;
  const onTable = best > 0 && above < TABLE_ROWS;
  const player = { initials: validInitials(initials) || UNSIGNED, name: 'You', hits: best };
  const listed = onTable ? [...regulars.slice(0, above), player, ...regulars.slice(above)] : regulars;
  /** @type {HighScoreRow[]} */
  const rows = listed.slice(0, TABLE_ROWS).map((row, index) => ({ ...row, rank: index + 1, own: row === player }));
  const own = rows.find((row) => row.own) ?? { ...player, rank: 0, own: true };

  return {
    rows,
    own,
    target: (own.rank === 0 ? rows.at(-1) : rows[own.rank - 2]) ?? null,
    signed: validInitials(initials) !== '',
    passed: regulars.filter((row) => row.hits >= before && row.hits < best).map((row) => row.name).reverse(),
  };
}

/**
 * The few rows around the player's, for where the whole table does not fit: the row to beat,
 * the player's own and the one just passed, or as near to that as the table's ends allow. A
 * player off the table stands under its last rows.
 *
 * @param {HighScoresView} view
 * @param {number} [size]
 * @returns {readonly HighScoreRow[]}
 */
export function standing({ rows, own }, size = 3) {
  if (own.rank === 0) {
    return [...rows.slice(-(size - 1)), own];
  }

  const first = Math.min(Math.max(0, own.rank - 2), Math.max(0, rows.length - size));
  return rows.slice(first, first + size);
}

/**
 * @param {HighScoresView} view
 * @returns {number} the hits the player's best is short of passing the row to beat; 0 at the top
 */
export function hitsToPass({ own, target }) {
  return target ? target.hits - own.hits + 1 : 0;
}
