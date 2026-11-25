import test from 'node:test';
import assert from 'node:assert/strict';

import { TRACK_IDS } from '../src/application/ports.js';
import { MUSIC_TRACKS, findTrack } from '../src/adapters/music-tracks.js';

// The tracks are data, so a typo would only show up as a wrong note or a skipped beat. These
// checks keep every part in step with the loop and every note in a range a phone can play.

const STEPS_PER_BAR = 16;

test('every track id the preferences accept has a track, in the same order', () => {
  assert.deepEqual(MUSIC_TRACKS.map((track) => track.id), TRACK_IDS);
  assert.equal(new Set(MUSIC_TRACKS.map((track) => track.label)).size, MUSIC_TRACKS.length, 'labels are distinct');
});

test('every part loops evenly within its track', () => {
  for (const track of MUSIC_TRACKS) {
    const loop = STEPS_PER_BAR * track.bars.length;
    const patterns = [track.chord.hits, ...(track.drums ? Object.values(track.drums) : [])];

    assert.equal(loop % track.bass.notes.length, 0, `${track.id} bass`);
    assert.equal(loop % (track.lead.notes.length * track.lead.every), 0, `${track.id} lead`);
    assert.equal(track.bars.length % track.chord.chords.length, 0, `${track.id} chords`);

    for (const pattern of patterns) {
      assert.match(pattern, /^[x.]+$/, `${track.id} patterns use x and .`);
      assert.equal(loop % pattern.length, 0, `${track.id} pattern ${pattern}`);
    }
  }
});

test('every note lands between 30 Hz and 2 kHz and every part has a sensible sound', () => {
  for (const track of MUSIC_TRACKS) {
    const pitch = (semitones) => track.root * 2 ** (semitones / 12);
    const notes = [
      ...track.bars.flatMap((root) => track.bass.notes.filter((note) => note !== null).map((note) => pitch(root + note))),
      ...track.bars.flatMap((root) => track.chord.chords.flat().map((interval) => pitch(root + interval))),
      ...track.lead.notes.filter((note) => note !== null).map(pitch),
    ];

    for (const frequency of notes) {
      assert.ok(frequency >= 30 && frequency <= 2000, `${track.id}: ${frequency.toFixed(1)} Hz`);
    }

    for (const part of [track.bass, track.chord, track.lead]) {
      assert.ok(['sine', 'square', 'sawtooth', 'triangle'].includes(part.wave), track.id);
      assert.ok(part.volume > 0 && part.volume <= 0.2, `${track.id} volume`);
      assert.ok(part.length > 0, `${track.id} length`);
    }

    assert.ok(track.bpm >= 90 && track.bpm <= 160, `${track.id} tempo`);
  }
});

test('an unknown or missing track id falls back to the first track', () => {
  assert.equal(findTrack('iron').id, 'iron');
  assert.equal(findTrack('polka'), MUSIC_TRACKS[0]);
  assert.equal(findTrack(undefined), MUSIC_TRACKS[0]);
});

test('the nineties tracks dance: a kick on every beat, a clap on two and four, and all three layers', () => {
  for (const id of ['eurodance', 'rave', 'trance', 'rondo', 'cancan', 'ode']) {
    const track = findTrack(id);

    assert.equal(track.id, id);
    assert.equal(track.drums?.kick, 'x...x...x...x...', id);
    assert.ok(track.drums?.snare.startsWith('....x.......x'), id);
    assert.ok(track.bpm >= 130, `${id} is fast enough to dance to`);
    assert.equal(track.lead.notes.length * track.lead.every, STEPS_PER_BAR * track.bars.length, `${id}: the lead runs the whole loop`);
  }
});

// The seven nineties tracks carry tunes people know, so a wrong note would be heard at once.
// These spell each lead's opening out by name, as it is sung.
const NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
/** The lead's notes by name, rests left out; the root's own name is where the count starts. */
const sung = (track, rootName, count) => track.lead.notes
  .filter((note) => note !== null)
  .slice(0, count)
  .map((note) => NAMES[(NAMES.indexOf(rootName) + note) % 12])
  .join(' ');

test('the nineties tracks play the melodies they are named for in the notes', () => {
  assert.equal(sung(findTrack('eurodance'), 'A', 19), 'E B C D C B A A C E D C B C D E C A A', 'Korobeiniki');
  assert.equal(sung(findTrack('rave'), 'D', 13), 'D E F G A F A G# E G# G D# G', 'In the Hall of the Mountain King');
  assert.equal(sung(findTrack('rondo'), 'A', 21), 'C D C B C E F E D# E B A G# A B A G# A C A C', 'Rondo alla Turca');
  assert.equal(sung(findTrack('cancan'), 'D', 26), 'D D E G F# E A A A B F# G E E E G F# E D D C# B A G F# E', 'the can-can');
  assert.equal(
    sung(findTrack('ode'), 'C', 30),
    'E E F G G F E D C C D E E D D E E F G G F E D C C D E D C C',
    'Ode to Joy',
  );
  assert.equal(sung(findTrack('shchedryk'), 'G', 8), 'A# A A# G A# A A# G', 'Shchedryk');
  // The Canon's line is the note each bar begins on; the plucks under it are that bar's chord.
  const canon = findTrack('trance');
  const tops = canon.bars.map((_, bar) => canon.lead.notes[bar * STEPS_PER_BAR]);
  assert.equal(tops.map((note) => NAMES[(NAMES.indexOf('D') + note) % 12]).join(' '), 'F# E D C# B A B C#', 'Pachelbel\'s Canon');

  canon.bars.forEach((root, bar) => {
    const chord = canon.chord.chords[bar].map((interval) => (root + interval) % 12);
    const plucked = canon.lead.notes.slice(bar * STEPS_PER_BAR, (bar + 1) * STEPS_PER_BAR);
    assert.ok(plucked.every((note) => chord.includes(note % 12)), `bar ${bar + 1} stays in its chord`);
  });
});

test('Korobeiniki sits on the chords that belong under it', () => {
  // Every bar's first lead note is a note of that bar's chord, or the bar begins on a rest.
  const track = findTrack('eurodance');
  const perBar = STEPS_PER_BAR / track.lead.every;

  track.bars.forEach((root, bar) => {
    const note = track.lead.notes[bar * perBar];
    const chord = track.chord.chords[bar].map((interval) => (root + interval + 120) % 12);

    assert.ok(note === null || chord.includes(note % 12), `bar ${bar + 1}`);
  });
});

test('Shchedryk keeps its three beats a bar: every pattern is a bar of twelve steps, a kick on each beat', () => {
  const track = findTrack('shchedryk');
  const bar = 12;

  for (const pattern of [track.chord.hits, track.drums.kick, track.drums.snare, track.drums.hat]) {
    assert.equal(pattern.length, bar);
  }

  assert.equal(track.bass.notes.length, bar);
  assert.equal(track.drums.kick, 'x...x...x...');
  // The bell figure, B flat, A, B flat, G, starts every bar of the melody.
  const perBar = bar / track.lead.every;
  for (let start = 0; start < track.lead.notes.length; start += perBar) {
    const figure = track.lead.notes.slice(start, start + perBar).filter((note) => note !== null);
    assert.deepEqual(figure.map((note) => note - figure[3]), [3, 2, 3, 0], `bar ${start / perBar + 1}`);
  }
});

test('the three original Warp rock tracks have power chords, backbeat and distinct riffs', () => {
  const rock = ['outlaw', 'redline', 'rift-rock'].map(findTrack);
  assert.equal(new Set(rock.map((track) => track.bpm)).size, 3);
  assert.equal(new Set(rock.map((track) => JSON.stringify(track.bass.notes))).size, 3);
  for (const track of rock) {
    assert.equal(track.bars.length, 8);
    assert.deepEqual(track.chord.chords[0], [12, 19, 24]);
    assert.equal(track.drums.snare, '....x.......x...');
    assert.ok(track.bpm >= 138);
  }
});
