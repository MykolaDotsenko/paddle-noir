import test from 'node:test';
import assert from 'node:assert/strict';

import { highScores, hitsToPass, INITIALS_LENGTH, standing, TABLE_ROWS, UNSIGNED, validInitials } from '../src/application/high-scores.js';
import { HIGH_SCORES, RIVALS } from '../src/catalog.js';

// The Rush cabinet's high-score table: the regulars' rows, and the player's place among them.

const initialsOf = (rows) => rows.map((row) => row.initials);
const named = (initials) => HIGH_SCORES.find((row) => row.initials === initials);

test('initials are three capital letters, and nothing else', () => {
  assert.equal(INITIALS_LENGTH, 3);
  assert.equal(validInitials('MYK'), 'MYK');

  for (const malformed of ['myk', 'MY', 'MYKO', 'M1K', 'M K', '', 3, null, undefined, ['M', 'Y', 'K']]) {
    assert.equal(validInitials(malformed), '', JSON.stringify(malformed));
  }

  assert.equal(validInitials(UNSIGNED), UNSIGNED, 'the stand-in is itself a signature that fits');
});

test('the table the arcade left: ten rows, best first, the nine regulars in ladder order under an unsigned record', () => {
  assert.equal(HIGH_SCORES.length, TABLE_ROWS);
  assert.ok(Object.isFrozen(HIGH_SCORES) && HIGH_SCORES.every(Object.isFrozen));

  for (let index = 1; index < HIGH_SCORES.length; index += 1) {
    assert.ok(HIGH_SCORES[index - 1].hits > HIGH_SCORES[index].hits, 'strictly best first');
  }

  assert.equal(new Set(initialsOf(HIGH_SCORES)).size, TABLE_ROWS);
  assert.ok(HIGH_SCORES.every((row) => validInitials(row.initials) === row.initials && Number.isInteger(row.hits) && row.hits > 0));

  // From the bottom up the regulars stand as they do on the career ladder.
  const regulars = HIGH_SCORES.slice(1).reverse();
  assert.deepEqual(regulars.map((row) => row.name), RIVALS.slice(0, regulars.length).map((rival) => rival.name));
  assert.equal(HIGH_SCORES[0].initials, 'AAA');
  assert.ok(!RIVALS.some((rival) => rival.name === HIGH_SCORES[0].name), 'nobody at the arcade owns up to the record');
  assert.ok(!HIGH_SCORES.some((row) => row.name === RIVALS.at(-1).name), 'the landlord does not play for fun');
});

test('a player who has not played stands under the table, with its last row to beat', () => {
  const table = highScores(HIGH_SCORES, 0, '');

  assert.deepEqual(table.rows.map(({ initials, name, hits }) => ({ initials, name, hits })), HIGH_SCORES);
  assert.deepEqual(table.rows.map((row) => row.rank), [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
  assert.ok(table.rows.every((row) => !row.own));
  assert.deepEqual(table.own, { initials: UNSIGNED, name: 'You', hits: 0, rank: 0, own: true });
  assert.equal(table.target.initials, 'ROM');
  assert.equal(hitsToPass(table), named('ROM').hits + 1);
  assert.equal(table.signed, false);
  assert.deepEqual(table.passed, []);
});

test('a run takes its place among the regulars, and the lowest row leaves the table', () => {
  const table = highScores(HIGH_SCORES, 21, '');

  assert.equal(table.rows.length, TABLE_ROWS);
  assert.deepEqual(initialsOf(table.rows), ['AAA', 'LAG', 'ZIN', 'WOB', 'SAN', 'HRY', 'JAN', UNSIGNED, 'TAR', 'HAL']);
  assert.deepEqual(table.rows.map((row) => row.rank), [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
  assert.deepEqual(table.rows.filter((row) => row.own), [table.own]);
  assert.deepEqual(table.own, { initials: UNSIGNED, name: 'You', hits: 21, rank: 8, own: true });
  assert.equal(table.target.initials, 'JAN');
  assert.equal(hitsToPass(table), 2);
});

test('a row has to be beaten to be passed: on equal hits whoever was there first stays above', () => {
  const level = highScores(HIGH_SCORES, named('JAN').hits, '');
  assert.equal(level.own.rank, 8);
  assert.equal(level.target.initials, 'JAN');
  assert.equal(hitsToPass(level), 1);

  const past = highScores(HIGH_SCORES, named('JAN').hits + 1, '');
  assert.equal(past.own.rank, 7);
  assert.equal(past.target.initials, 'HRY');

  // Level with the table's last row is still off the table.
  const short = highScores(HIGH_SCORES, named('ROM').hits, '');
  assert.equal(short.own.rank, 0);
  assert.ok(short.rows.every((row) => !row.own));
  assert.equal(short.target.initials, 'ROM');
  assert.equal(hitsToPass(short), 1);
  assert.equal(highScores(HIGH_SCORES, named('ROM').hits + 1, '').own.rank, TABLE_ROWS);
});

test('past the unsigned record the player holds the table, with nobody left to beat', () => {
  const level = highScores(HIGH_SCORES, named('AAA').hits, '');
  assert.equal(level.own.rank, 2);
  assert.equal(level.target.initials, 'AAA');

  const top = highScores(HIGH_SCORES, named('AAA').hits + 1, '');
  assert.equal(top.own.rank, 1);
  assert.equal(top.rows[0], top.own);
  assert.equal(top.target, null);
  assert.equal(hitsToPass(top), 0);
});

test('the row is signed with the player\'s initials once they have some, and with YOU until then', () => {
  const signed = highScores(HIGH_SCORES, 21, 'MYK');
  assert.equal(signed.own.initials, 'MYK');
  assert.equal(signed.signed, true);
  assert.equal(signed.own.name, 'You');

  for (const malformed of ['', 'my', undefined]) {
    const table = highScores(HIGH_SCORES, 21, malformed);
    assert.equal(table.own.initials, UNSIGNED);
    assert.equal(table.signed, false);
  }

  // A player may sign like a regular; their row is still told apart.
  const twin = highScores(HIGH_SCORES, 21, 'ZIN');
  assert.deepEqual(twin.rows.filter((row) => row.initials === 'ZIN').map((row) => row.own), [false, true]);
});

test('a run that beats the player\'s best names whose rows it went past, lowest first', () => {
  assert.deepEqual(highScores(HIGH_SCORES, 21, '', 5).passed, ['Rookie Roma', 'Aunt Halyna', 'Twisty Taras']);
  assert.deepEqual(highScores(HIGH_SCORES, 21, '', 0).passed, ['Rookie Roma', 'Aunt Halyna', 'Twisty Taras']);
  assert.deepEqual(highScores(HIGH_SCORES, 23, '', 22).passed, ['The Janitor'], 'a row the player was level with');
  assert.deepEqual(highScores(HIGH_SCORES, 21, '', 19).passed, [], 'a better run that passes nobody');
  assert.deepEqual(highScores(HIGH_SCORES, 21, '', 21).passed, []);
  assert.deepEqual(highScores(HIGH_SCORES, 21, '').passed, [], 'no run has just finished');
  assert.equal(highScores(HIGH_SCORES, 99, '', 50).passed.at(-1), named('AAA').name);
});

test('the standing shows the row to beat, the player\'s and the one just passed, as the ends allow', () => {
  const around = (best) => initialsOf(standing(highScores(HIGH_SCORES, best, 'MYK')));

  assert.deepEqual(around(21), ['JAN', 'MYK', 'TAR']);
  assert.deepEqual(around(99), ['MYK', 'AAA', 'LAG'], 'at the top');
  assert.deepEqual(around(50), ['AAA', 'MYK', 'LAG']);
  assert.deepEqual(around(9), ['TAR', 'HAL', 'MYK'], 'in the last place');
  assert.deepEqual(around(3), ['HAL', 'ROM', 'MYK'], 'off the table, under its last rows');
  assert.equal(standing(highScores(HIGH_SCORES, 3, 'MYK')).at(-1).rank, 0);
  assert.deepEqual(initialsOf(standing(highScores(HIGH_SCORES, 21, 'MYK'), 5)), ['HRY', 'JAN', 'MYK', 'TAR', 'HAL']);
});

test('any table will do: it is read best first whatever its order, and never changed', () => {
  const shuffled = Object.freeze([{ initials: 'LOW', name: 'Low', hits: 3 }, { initials: 'TOP', name: 'Top', hits: 30 }]);
  const table = highScores(shuffled, 10, 'MID');

  assert.deepEqual(initialsOf(table.rows), ['TOP', 'MID', 'LOW']);
  assert.deepEqual(initialsOf(shuffled), ['LOW', 'TOP']);
  assert.deepEqual(initialsOf(standing(table)), ['TOP', 'MID', 'LOW']);

  // A table with room to spare takes any run at all, and an empty one has nobody to beat.
  assert.equal(highScores(shuffled, 1, '').own.rank, 3);
  assert.deepEqual(highScores([], 0, ''), { rows: [], own: { initials: UNSIGNED, name: 'You', hits: 0, rank: 0, own: true }, target: null, signed: false, passed: [] });
  assert.equal(highScores([], 4, '').own.rank, 1);
});
