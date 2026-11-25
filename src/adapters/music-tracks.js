/** @import { TrackId } from '../application/ports.js' */

/**
 * Backing tracks for the music player, written as step sequences. Eight are original; the seven
 * in nineties dance styles arrange melodies long in the public domain, so nothing here is
 * taken from a record. A step is a sixteenth note and a bar has 16 of them. Pitches are
 * semitones above the track's root frequency; null is a rest. Every part loops, so a pattern
 * shorter than the whole track repeats (a 16-step bass line plays in every bar).
 *
 * Each track has three layers that the player brings in as a rally grows: the bass (with the
 * kick) from the first hit, the chords (with the snare and hi-hat) at 3 hits and the lead
 * at 6.
 *
 * @typedef {object} TrackPart
 * @property {OscillatorType} wave
 * @property {number} volume peak gain of one note
 * @property {number} length how long a note sounds, in steps
 *
 * @typedef {object} MusicTrack
 * @property {TrackId} id
 * @property {string} label shown on the track button
 * @property {number} bpm
 * @property {number} root frequency in Hz that every pitch counts up from
 * @property {readonly number[]} bars each bar's root, in semitones; the loop is this many bars long
 * @property {TrackPart & { notes: readonly (number | null)[] }} bass one entry per step, above the bar's root
 * @property {TrackPart & { hits: string, chords: readonly (readonly number[])[] }} chord
 *   `x` in hits strikes the chord on that step; chords are intervals above the bar's root, one per bar
 * @property {TrackPart & { every: number, notes: readonly (number | null)[] }} lead
 *   a note every `every` steps, above the track's root (not the bar's), so a melody reads as written
 * @property {{ kick: string, snare: string, hat: string } | null} drums `x` plays that drum on that step
 */

const _ = null;

/** @type {readonly MusicTrack[]} */
export const MUSIC_TRACKS = Object.freeze([
  {
    // The game's first track: a four-bar loop in A minor (A, A, F, G).
    id: 'neon',
    label: 'Neon',
    bpm: 128,
    root: 110,
    bars: [0, 0, -4, -2],
    bass: { wave: 'sawtooth', volume: 0.16, length: 3.6, notes: [0, _, _, _, 0, _, _, _, 0, _, _, _, 0, _, _, _] },
    chord: { wave: 'triangle', volume: 0.05, length: 1.8, hits: '..x...x...x...x.', chords: [[12, 15, 19]] },
    lead: {
      wave: 'square',
      volume: 0.07,
      length: 1.7,
      every: 2,
      notes: [
        24, _, 27, 24, 31, _, 29, 27,
        24, _, 27, 29, 31, _, 36, 34,
        20, _, 23, 20, 25, _, 23, 20,
        18, _, 20, 22, 25, _, 22, _,
      ],
    },
    drums: null,
  },
  {
    // Arcade fighter techno in E minor at 140 bpm: four on the floor, a bouncing octave bass
    // and a sixteenth-note lead that runs up and down the chord.
    id: 'arena',
    label: 'Arena',
    bpm: 140,
    root: 82.41,
    bars: [0, 0, 3, -2],
    bass: { wave: 'sawtooth', volume: 0.14, length: 0.9, notes: [0, _, 12, 0, _, 0, 12, _, 0, _, 12, 0, 3, _, 12, 5] },
    chord: {
      wave: 'square',
      volume: 0.035,
      length: 0.8,
      hits: '...x..x....x..x.',
      chords: [[12, 15, 19], [12, 15, 19], [12, 16, 19], [12, 16, 19]],
    },
    lead: {
      wave: 'square',
      volume: 0.05,
      length: 0.9,
      every: 1,
      notes: [
        24, _, 27, _, 31, 29, 27, _, 24, _, 22, 24, _, 27, _, _,
        24, _, 27, _, 31, 29, 27, _, 34, _, 31, _, 29, 27, 29, _,
        27, _, 31, _, 34, _, 31, 29, 27, _, 26, 27, _, 31, _, _,
        26, _, 29, _, 34, _, 31, 29, 26, 24, 22, _, 24, _, 26, _,
      ],
    },
    drums: { kick: 'x...x...x...x...', snare: '....x.......x...', hat: '..x...x...x...x.' },
  },
  {
    // A big synth anthem in D minor at 118 bpm: held brass chords (Dm, F, C, G), a slow bass
    // and a heroic lead.
    id: 'anthem',
    label: 'Anthem',
    bpm: 118,
    root: 73.42,
    bars: [0, 3, -2, 5],
    bass: { wave: 'sawtooth', volume: 0.15, length: 3.5, notes: [0, _, _, _, _, _, 0, _, 12, _, _, _, 0, _, _, _] },
    chord: {
      wave: 'sawtooth',
      volume: 0.022,
      length: 7.6,
      hits: 'x.......x.......',
      chords: [[12, 15, 19, 24], [12, 16, 19, 24], [12, 16, 19, 24], [12, 16, 19, 24]],
    },
    lead: {
      wave: 'sawtooth',
      volume: 0.045,
      length: 1.9,
      every: 2,
      notes: [
        31, _, 31, 32, 34, _, 31, _,
        36, _, 34, 32, 31, _, 27, _,
        34, _, 31, 34, 38, _, 36, 34,
        29, _, 33, 34, 36, _, _, _,
      ],
    },
    drums: { kick: 'x.....x...x.....', snare: '....x.......x...', hat: '................' },
  },
  {
    // Training-montage rock in C minor at 108 bpm: a chugging eighth-note bass, power-chord
    // stabs and a punchy horn line.
    id: 'contender',
    label: 'Contender',
    bpm: 108,
    root: 65.41,
    bars: [0, 3, 5, -2],
    bass: { wave: 'sawtooth', volume: 0.15, length: 1.3, notes: [0, _, 0, _, 0, _, 0, _, 0, _, 0, _, 0, _, 7, _] },
    chord: { wave: 'square', volume: 0.04, length: 1.6, hits: 'x.....x...x..x..', chords: [[12, 19, 24]] },
    lead: {
      wave: 'sawtooth',
      volume: 0.045,
      length: 1.5,
      every: 2,
      notes: [
        31, _, 31, 34, _, 31, 29, 27,
        27, _, 29, 31, _, 34, _, 31,
        29, _, 29, 32, _, 34, 32, 29,
        34, _, 36, 34, 31, _, 29, _,
      ],
    },
    drums: { kick: 'x.......x.x.....', snare: '....x.......x...', hat: 'x.x.x.x.x.x.x.x.' },
  },
  {
    // Heavy industrial in E Phrygian at 124 bpm: a galloping low riff, crunching power chords,
    // a stomping kick and a cold, slow synth line on top.
    id: 'iron',
    label: 'Iron',
    bpm: 124,
    root: 82.41,
    bars: [0, 0, 1, -2],
    bass: { wave: 'sawtooth', volume: 0.16, length: 0.8, notes: [0, _, 0, 0, 0, _, 0, 0, 0, _, _, 12, 0, _, 10, _] },
    chord: { wave: 'sawtooth', volume: 0.05, length: 2.6, hits: 'x.....x.....x...', chords: [[0, 7, 12]] },
    lead: {
      wave: 'square',
      volume: 0.04,
      length: 3.5,
      every: 4,
      notes: [31, _, 32, _, 31, _, 27, _, 32, _, 31, 29, 34, _, 31, _],
    },
    drums: { kick: 'x.x...x.x.x...x.', snare: '....x.......x...', hat: 'x...x...x...x...' },
  },
  {
    // Korobeiniki, the Russian peddlers' song of the 1860s that a generation knows from a
    // falling-blocks game, as nineties eurodance in A minor at 132 bpm: the kick on every beat
    // with the bass answering off it and a house piano stabbing across the bar.
    id: 'eurodance',
    label: 'Eurodance',
    bpm: 132,
    root: 110,
    bars: [-5, 0, -5, 0, 5, 0, -5, 0],
    bass: { wave: 'sawtooth', volume: 0.14, length: 1.1, notes: [_, _, 0, 0, _, _, 0, 0, _, _, 0, 0, _, _, 0, 12] },
    chord: {
      wave: 'triangle',
      volume: 0.05,
      length: 1.4,
      hits: 'x..x..x..x..x.x.',
      // E, A minor, E, A minor; D minor, A minor, E, A minor.
      chords: [[12, 16, 19], [12, 15, 19], [12, 16, 19], [12, 15, 19], [12, 15, 19], [12, 15, 19], [12, 16, 19], [12, 15, 19]],
    },
    lead: {
      wave: 'square',
      volume: 0.05,
      length: 1.8,
      every: 2,
      notes: [
        31, _, 26, 27, 29, _, 27, 26,
        24, _, 24, 27, 31, _, 29, 27,
        26, _, _, 27, 29, _, 31, _,
        27, _, 24, _, 24, _, _, _,
        _, 29, _, 32, 36, _, 34, 32,
        31, _, _, 27, 31, _, 29, 27,
        26, _, 26, 27, 29, _, 31, _,
        27, _, 24, _, 24, _, _, _,
      ],
    },
    drums: { kick: 'x...x...x...x...', snare: '....x.......x...', hat: '..x...x...x...xx' },
  },
  {
    // Grieg's In the Hall of the Mountain King (1875) as a warehouse rave in D minor at 150 bpm:
    // the creeping theme once low and once an octave up over a rolling sixteenth-note bass,
    // bare fifths stabbed off the beat and a shuffling hi-hat.
    id: 'rave',
    label: 'Rave',
    bpm: 150,
    root: 73.42,
    bars: [0, 0, 0, 3, 0, 0, 0, 3],
    bass: { wave: 'sawtooth', volume: 0.13, length: 0.8, notes: [0, 0, 12, 0, 0, 12, 0, 0, 12, 0, 0, 12, 0, 12, 0, 12] },
    chord: {
      wave: 'triangle',
      volume: 0.05,
      length: 1.2,
      hits: '..x..x..x.x..x.x',
      // No third under the theme's chromatic turns; the phrase ends on F major.
      chords: [[12, 19, 24], [12, 19, 24], [12, 19, 24], [12, 16, 19, 24]],
    },
    lead: {
      wave: 'sawtooth',
      volume: 0.035,
      length: 1.5,
      every: 2,
      notes: [
        24, 26, 27, 29, 31, 27, 31, _,
        30, 26, 30, _, 29, 25, 29, _,
        24, 26, 27, 29, 31, 27, 31, 36,
        34, 31, 27, 31, 34, _, _, _,
        36, 38, 39, 41, 43, 39, 43, _,
        42, 38, 42, _, 41, 37, 41, _,
        36, 38, 39, 41, 43, 39, 43, 48,
        46, 43, 39, 43, 46, _, _, _,
      ],
    },
    drums: { kick: 'x...x...x...x...', snare: '....x.......x.x.', hat: 'x.xxx.xxx.xxx.xx' },
  },
  {
    // Pachelbel's Canon as late-nineties trance in D at 138 bpm: its eight chords a bar each
    // (D, A, B minor, F sharp minor, G, D, G, A) on one long pad, a bass that ducks under every
    // kick, and the violins' descending line on top, plucked in threes down each chord against
    // the four of the beat.
    id: 'trance',
    label: 'Trance',
    bpm: 138,
    root: 73.42,
    bars: [12, 7, 9, 4, 5, 0, 5, 7],
    bass: { wave: 'sawtooth', volume: 0.13, length: 0.8, notes: [_, 0, 0, 0, _, 0, 0, 0, _, 0, 0, 0, _, 0, 0, 0] },
    chord: {
      wave: 'sawtooth',
      volume: 0.02,
      length: 15,
      hits: 'x...............',
      chords: [[12, 16, 19], [12, 16, 19], [12, 15, 19], [12, 15, 19], [12, 16, 19], [12, 16, 19], [12, 16, 19], [12, 16, 19]],
    },
    lead: {
      wave: 'square',
      volume: 0.04,
      length: 0.9,
      every: 1,
      notes: [
        40, 36, 31, 40, 36, 31, 40, 36, 31, 40, 36, 31, 40, 31, 40, 31,
        38, 35, 31, 38, 35, 31, 38, 35, 31, 38, 35, 31, 38, 31, 38, 31,
        36, 33, 28, 36, 33, 28, 36, 33, 28, 36, 33, 28, 36, 28, 36, 28,
        35, 31, 28, 35, 31, 28, 35, 31, 28, 35, 31, 28, 35, 28, 35, 28,
        33, 29, 24, 33, 29, 24, 33, 29, 24, 33, 29, 24, 33, 24, 33, 24,
        31, 28, 24, 31, 28, 24, 31, 28, 24, 31, 28, 24, 31, 24, 31, 24,
        33, 29, 24, 33, 29, 24, 33, 29, 24, 33, 29, 24, 33, 24, 33, 24,
        35, 31, 26, 35, 31, 26, 35, 31, 26, 35, 31, 26, 35, 26, 35, 26,
      ],
    },
    drums: { kick: 'x...x...x...x...', snare: '....x.......x...', hat: '..x...x...x...x.' },
  },
  {
    // Mozart's Rondo alla Turca, the Turkish March of a thousand ringtones, as techno in
    // A minor at 132 bpm: the tune in its own running sixteenths over a bass off the beat.
    id: 'rondo',
    label: 'Rondo',
    bpm: 132,
    root: 110,
    bars: [0, 0, -5, -5],
    bass: { wave: 'sawtooth', volume: 0.14, length: 1.1, notes: [_, _, 0, _, _, _, 0, _, _, _, 0, _, _, _, 0, 0] },
    chord: {
      wave: 'triangle',
      volume: 0.05,
      length: 1.4,
      hits: '..x...x...x...x.',
      // A minor twice, E minor, then a bare fifth on E under the turn that leads back.
      chords: [[12, 15, 19], [12, 15, 19], [12, 15, 19], [12, 19, 24]],
    },
    lead: {
      wave: 'square',
      volume: 0.045,
      length: 1,
      every: 1,
      notes: [
        27, _, _, _, 29, 27, 26, 27, 31, _, _, _, 32, 31, 30, 31,
        38, 36, 35, 36, 38, 36, 35, 36, 39, _, _, _, 36, _, 39, _,
        38, _, 36, _, 34, _, 36, _, 38, _, 36, _, 34, _, 36, _,
        38, _, 36, _, 34, _, 33, _, 31, _, _, _, 26, 24, 23, 24,
      ],
    },
    drums: { kick: 'x...x...x...x...', snare: '....x.......x...', hat: '..x...x...x...x.' },
  },
  {
    // Offenbach's galop from Orpheus in the Underworld (1858), the can-can, as happy hardcore
    // in D at 152 bpm: an oom-pah bass that steps to the fifth halfway through each bar, as
    // the tune does, and the melody once low and once an octave up.
    id: 'cancan',
    label: 'Cancan',
    bpm: 152,
    root: 73.42,
    bars: [0, 0, 7, 0, 0, 0, 7, 0],
    bass: { wave: 'sawtooth', volume: 0.13, length: 1.2, notes: [0, _, 12, _, 0, _, 12, _, 7, _, 19, _, 7, _, 19, _] },
    // The chord sounds while the bass is on the bar's root, and leaves the fifth to the bass.
    chord: { wave: 'triangle', volume: 0.05, length: 1.2, hits: '..x...x.........', chords: [[12, 16, 19]] },
    lead: {
      wave: 'square',
      volume: 0.04,
      length: 1.6,
      every: 2,
      notes: [
        24, _, 24, _, 26, 29, 28, 26,
        31, _, 31, _, 31, 33, 28, 29,
        26, _, 26, _, 26, 29, 28, 26,
        24, 36, 35, 33, 31, 29, 28, 26,
        36, _, 36, _, 38, 41, 40, 38,
        43, _, 43, _, 43, 45, 40, 41,
        38, _, 38, _, 38, 41, 40, 38,
        36, 48, 47, 45, 43, 41, 40, 38,
      ],
    },
    drums: { kick: 'x...x...x...x...', snare: '....x.......x...', hat: '..x...x...x...x.' },
  },
  {
    // Beethoven's Ode to Joy as nineties eurotrance in C at 132 bpm: the hymn whole, both
    // verses and the bridge between, over a bass off the beat, the same way a dozen dance
    // records of the decade set it.
    id: 'ode',
    label: 'Ode',
    bpm: 132,
    root: 65.41,
    bars: [0, -5, 0, -5, 0, -5, 0, 0, -5, -5, -5, -5, 0, -5, 0, 0],
    bass: { wave: 'sawtooth', volume: 0.14, length: 1.1, notes: [_, _, 0, _, _, _, 0, _, _, _, 0, _, _, _, 0, 12] },
    chord: { wave: 'triangle', volume: 0.05, length: 1.4, hits: '..x...x...x...x.', chords: [[12, 16, 19]] },
    lead: {
      wave: 'square',
      volume: 0.045,
      length: 3.2,
      every: 2,
      notes: [
        28, _, 28, _, 29, _, 31, _,
        31, _, 29, _, 28, _, 26, _,
        24, _, 24, _, 26, _, 28, _,
        28, _, _, 26, 26, _, _, _,
        28, _, 28, _, 29, _, 31, _,
        31, _, 29, _, 28, _, 26, _,
        24, _, 24, _, 26, _, 28, _,
        26, _, _, 24, 24, _, _, _,
        26, _, 26, _, 28, _, 24, _,
        26, _, 28, 29, 28, _, 24, _,
        26, _, 28, 29, 28, _, 26, _,
        24, _, 26, _, 19, _, _, _,
        28, _, 28, _, 29, _, 31, _,
        31, _, 29, _, 28, _, 26, _,
        24, _, 24, _, 26, _, 28, _,
        26, _, _, 24, 24, _, _, _,
      ],
    },
    drums: { kick: 'x...x...x...x...', snare: '....x.......x...', hat: '..x...x...x...x.' },
  },
  {
    // Leontovych's Shchedryk (1916), the four-note carol the world sings as the Carol of the
    // Bells, as a dance track in G minor that keeps its three beats a bar: every pattern here
    // is a bar of twelve steps, a kick on each beat, oom-pah-pah in the bass, the bell figure
    // four times low and four times an octave up.
    id: 'shchedryk',
    label: 'Shchedryk',
    bpm: 144,
    root: 49,
    bars: [0, 0, 0, 0, 0, 0],
    bass: { wave: 'sawtooth', volume: 0.14, length: 1.6, notes: [0, _, _, _, 12, _, _, _, 12, _, _, _] },
    chord: { wave: 'triangle', volume: 0.05, length: 2.4, hits: '....x...x...', chords: [[12, 15, 19]] },
    lead: {
      wave: 'square',
      volume: 0.045,
      length: 1.8,
      every: 2,
      notes: [
        39, _, 38, 39, 36, _,
        39, _, 38, 39, 36, _,
        39, _, 38, 39, 36, _,
        39, _, 38, 39, 36, _,
        51, _, 50, 51, 48, _,
        51, _, 50, 51, 48, _,
        51, _, 50, 51, 48, _,
        51, _, 50, 51, 48, _,
      ],
    },
    drums: { kick: 'x...x...x...', snare: '....x.......', hat: '..x...x...x.' },
  },
  {
    // Original sixteen-bit hard rock: palm-muted-style pulses and power chords.
    id: 'outlaw',
    label: 'Outlaw Rock',
    bpm: 146,
    root: 82.41,
    bars: [0,0,3,-2,0,5,3,-2],
    bass: { wave: 'square', volume: 0.095, length: 0.85, notes: [0, 0, _, 0, 7, _, 0, 0, 0, _, 3, 0, 5, 7, _, 0] },
    chord: { wave: 'sawtooth', volume: 0.043, length: 1.65, hits: 'x..x..x.x..x.x..', chords: [[12, 19, 24]] },
    lead: { wave: 'sawtooth', volume: 0.052, length: 1.7, every: 2, notes: [
      24, _, 27, 29, 31, 29, 27, _,
      24, 31, 34, 31, 29, _, 27, 24,
      27, 29, 31, _, 34, 36, 34, 31,
      22, 24, 26, 29, 31, _, 26, 22,
      24, _, 29, 31, 34, 31, 29, 27,
      29, 31, 36, 34, 36, _, 31, 29,
      27, 34, 36, 34, 31, 29, 27, _,
      26, 29, 31, 34, 31, 26, 24, _,
    ] },
    drums: { kick: 'x.x...x.x.x...x.', snare: '....x.......x...', hat: 'x.x.x.x.x.x.x.xx' },
  },
  {
    // Original sixteen-bit hard rock: palm-muted-style pulses and power chords.
    id: 'redline',
    label: 'Redline Riot',
    bpm: 158,
    root: 73.42,
    bars: [0,0,5,3,0,0,-2,3],
    bass: { wave: 'square', volume: 0.095, length: 0.85, notes: [0, _, 0, 0, 0, 0, _, 0, 7, _, 0, 0, 5, 3, 0, _] },
    chord: { wave: 'sawtooth', volume: 0.043, length: 1.65, hits: 'x.x.x..xx.x..x..', chords: [[12, 19, 24]] },
    lead: { wave: 'sawtooth', volume: 0.052, length: 1.7, every: 2, notes: [
      24, 24, 27, 31, 29, _, 27, 24,
      24, 29, 31, 34, 31, 29, 27, _,
      29, 31, 36, 34, 36, 31, 29, _,
      27, 31, 34, 39, 36, 34, 31, 27,
      24, _, 24, 29, 31, 34, 31, 29,
      24, 27, 31, 36, 34, 31, 27, _,
      22, 24, 29, 31, 29, 26, 24, 22,
      27, 31, 34, 36, 34, 31, 27, _,
    ] },
    drums: { kick: 'x.x.x.x.x.x.xx..', snare: '....x.......x...', hat: 'xxxxxxxxxxxxxxxx' },
  },
  {
    // Original sixteen-bit hard rock: palm-muted-style pulses and power chords.
    id: 'rift-rock',
    label: 'Rift Thunder',
    bpm: 138,
    root: 98,
    bars: [0,-2,-5,-3,0,-2,-5,-3],
    bass: { wave: 'square', volume: 0.095, length: 0.85, notes: [0, _, 0, 0, 7, _, 0, _, 0, 0, 3, _, 5, 0, 7, _] },
    chord: { wave: 'sawtooth', volume: 0.043, length: 1.65, hits: 'x...x.x.x..x..x.', chords: [[12, 19, 24]] },
    lead: { wave: 'sawtooth', volume: 0.052, length: 1.7, every: 2, notes: [
      24, _, 31, 34, 31, 29, 27, _,
      22, 29, 31, 34, 31, 29, 26, _,
      19, 24, 26, 31, 29, 26, 24, _,
      21, 24, 28, 31, 33, 31, 28, _,
      24, 27, 31, 36, 34, 31, 29, 27,
      22, 26, 29, 34, 31, 29, 26, _,
      19, 26, 31, 29, 26, 24, 26, 19,
      21, 28, 33, 36, 33, 31, 28, 24,
    ] },
    drums: { kick: 'x...x.x.x.x...x.', snare: '....x.......x...', hat: 'x.x.x.x.x.x.x.x.' },
  },
]);

/**
 * @param {string | undefined} id
 * @returns {MusicTrack} the track with that id, or the first one
 */
export function findTrack(id) {
  return MUSIC_TRACKS.find((track) => track.id === id) ?? MUSIC_TRACKS[0];
}
