import { validInitials } from '../application/high-scores.js';
import { CRAFT_SYSTEMS, DIFFICULTIES, MODES, TRACK_IDS, WARP_STEERING_MODES } from '../application/ports.js';

/** @import { CraftSetup, CraftSystem, HangarChoices, MatchStats, Preferences, PreferencesPort } from '../application/ports.js' */

const STORAGE_KEY = 'ping-pong-lab:preferences';

/** @type {Readonly<MatchStats>} */
const NO_STATS = Object.freeze({ matches: 0, wins: 0, streak: 0, bestStreak: 0 });

/** @type {Readonly<HangarChoices>} */
const NO_HANGAR = Object.freeze({ craft: '', owned: Object.freeze({}) });

/** @type {Readonly<Preferences>} */
const DEFAULTS = Object.freeze({
  mode: 'solo',
  warpSteering: 'buttons',
  difficulty: 'normal',
  powerUps: true,
  supers: true,
  sound: true,
  music: true,
  track: 'neon',
  jokes: true,
  vibration: true,
  tutorialSeen: false,
  bestRally: 0,
  bestRush: 0,
  bestBricks: 0,
  bestNova: 0,
  bestWarp: 0,
  tickets: 0,
  hangar: NO_HANGAR,
  warpTimes: Object.freeze([]),
  signal: 0,
  initials: '',
  stats: NO_STATS,
  rival: 0,
  careerStars: Object.freeze([]),
  careerLosses: Object.freeze([]),
});

/**
 * @param {unknown} value
 * @param {boolean} fallback
 */
const bool = (value, fallback) => (typeof value === 'boolean' ? value : fallback);

/**
 * @param {unknown} value
 */
const count = (value) => (Number.isInteger(value) && Number(value) >= 0 ? Number(value) : 0);

// A career ladder is far shorter; the cap only keeps a corrupted entry small.
const MAX_LADDER = 32;

/**
 * A list of counts, one per career rival; anything malformed in it counts as 0.
 *
 * @param {unknown} value
 * @param {number} [max]
 * @returns {number[]}
 */
const counts = (value, max = Infinity) => (
  Array.isArray(value) ? value.slice(0, MAX_LADDER).map((entry) => Math.min(count(entry), max)) : []
);

// Five Warp courses and five chapters; the caps only keep a corrupted entry small.
const MAX_COURSES = 16;
const MAX_SIGNAL = 2 ** MAX_COURSES - 1;
// No course takes an hour: a longer time is not one.
const MAX_SECONDS = 3600;

/**
 * The best time on each course, in seconds; anything that is not a sensible time is no time,
 * 0, so a corrupted entry can never stand as a record nobody can beat.
 *
 * @param {unknown} value
 * @returns {number[]}
 */
const times = (value) => (
  Array.isArray(value)
    ? value.slice(0, MAX_COURSES).map((entry) => (typeof entry === 'number' && entry > 0 && entry < MAX_SECONDS ? entry : 0))
    : []
);

/**
 * @param {unknown} value
 * @returns {MatchStats}
 */
function sanitizeStats(value) {
  const stats = /** @type {Record<string, unknown>} */ (value !== null && typeof value === 'object' ? value : {});
  const wins = count(stats.wins);
  const matches = Math.max(count(stats.matches), wins);
  const bestStreak = Math.min(count(stats.bestStreak), wins);

  return { matches, wins, streak: Math.min(count(stats.streak), bestStreak), bestStreak };
}

// A hangar is far smaller; the caps only keep a corrupted entry small.
const MAX_CRAFTS = 16;
const MAX_TUNE = 9;
const NAME = /^[a-z][a-z0-9-]{0,23}$/;

/**
 * @param {unknown} value
 * @returns {string} the name of a craft, a paint or a decal; '' for anything else
 */
const name = (value) => (typeof value === 'string' && NAME.test(value) ? value : '');

/**
 * The hangar as it is shaped: which crafts are owned, how far each system of each is tuned,
 * and what each wears. Whether the game still offers a craft or a paint is not known here;
 * the hangar itself answers that.
 *
 * @param {unknown} value
 * @returns {HangarChoices}
 */
function sanitizeHangar(value) {
  const hangar = /** @type {Record<string, unknown>} */ (value !== null && typeof value === 'object' ? value : {});
  const owned = /** @type {Record<string, unknown>} */ (hangar.owned !== null && typeof hangar.owned === 'object' ? hangar.owned : {});
  /** @type {Record<string, CraftSetup>} */
  const kept = {};

  for (const id of Object.keys(owned).filter((key) => name(key) !== '').slice(0, MAX_CRAFTS)) {
    const setup = /** @type {Record<string, unknown>} */ (owned[id] !== null && typeof owned[id] === 'object' ? owned[id] : {});
    const tune = /** @type {Record<string, unknown>} */ (setup.tune !== null && typeof setup.tune === 'object' ? setup.tune : {});

    kept[id] = {
      tune: /** @type {Record<CraftSystem, number>} */ (Object.fromEntries(CRAFT_SYSTEMS.map((system) => [system, Math.min(count(tune[system]), MAX_TUNE)]))),
      paint: name(setup.paint),
      decal: name(setup.decal),
      glow: name(setup.glow),
    };
  }

  return { craft: name(hangar.craft), owned: kept };
}

/**
 * Keeps only well-formed values, so a corrupted or outdated stored entry cannot break the game.
 *
 * @param {Record<string, unknown>} stored
 * @returns {Preferences}
 */
function sanitize(stored) {
  return {
    mode: MODES.find((mode) => mode === stored.mode) ?? DEFAULTS.mode,
    warpSteering: WARP_STEERING_MODES.find((mode) => mode === stored.warpSteering) ?? DEFAULTS.warpSteering,
    difficulty: DIFFICULTIES.find((level) => level === stored.difficulty) ?? DEFAULTS.difficulty,
    powerUps: bool(stored.powerUps, DEFAULTS.powerUps),
    supers: bool(stored.supers, DEFAULTS.supers),
    sound: bool(stored.sound, DEFAULTS.sound),
    music: bool(stored.music, DEFAULTS.music),
    track: TRACK_IDS.find((track) => track === stored.track) ?? DEFAULTS.track,
    jokes: bool(stored.jokes, DEFAULTS.jokes),
    vibration: bool(stored.vibration, DEFAULTS.vibration),
    tutorialSeen: bool(stored.tutorialSeen, DEFAULTS.tutorialSeen),
    bestRally: count(stored.bestRally),
    bestRush: count(stored.bestRush),
    bestBricks: count(stored.bestBricks),
    bestNova: count(stored.bestNova),
    bestWarp: count(stored.bestWarp),
    tickets: count(stored.tickets),
    hangar: sanitizeHangar(stored.hangar),
    warpTimes: times(stored.warpTimes),
    signal: Math.min(count(stored.signal), MAX_SIGNAL),
    initials: validInitials(stored.initials),
    stats: sanitizeStats(stored.stats),
    rival: count(stored.rival),
    careerStars: counts(stored.careerStars, 3),
    careerLosses: counts(stored.careerLosses),
  };
}

/**
 * @typedef {object} StorageWindow
 * @property {Storage} [localStorage]
 * @property {(type: 'storage', listener: (event: { key: string | null }) => void) => void} [addEventListener]
 * @property {(type: 'storage', listener: (event: { key: string | null }) => void) => void} [removeEventListener]
 */

/**
 * Preferences saved in localStorage. Storage may be missing or throw (private browsing,
 * blocked site data), so every access is guarded and the game falls back to in-memory values.
 *
 * The game may be open in several tabs. Each tab follows the others' saves through the
 * storage event, and merges its own changes into what is stored at that moment, so one tab
 * never writes back another's older records.
 *
 * @implements {PreferencesPort}
 */
export class LocalPreferences {
  /** @param {StorageWindow} window */
  constructor(window) {
    this.window = window;
    this.values = this.read() ?? { ...DEFAULTS };
    /** False once a save has failed: from then on this tab's values are newer than storage. */
    this.saving = true;
    /** @param {{ key: string | null }} event */
    this.handleStorage = (event) => {
      // A null key means another tab cleared the whole storage.
      if (this.saving && (event.key === STORAGE_KEY || event.key === null)) {
        this.values = this.read() ?? this.values;
      }
    };
  }

  connect() {
    this.window.addEventListener?.('storage', this.handleStorage);
  }

  disconnect() {
    this.window.removeEventListener?.('storage', this.handleStorage);
  }

  /** @returns {Preferences | null} what is stored now, or null when storage cannot be read */
  read() {
    try {
      const storage = this.window.localStorage;

      if (!storage) {
        return null;
      }

      const raw = storage.getItem(STORAGE_KEY);
      const parsed = raw ? JSON.parse(raw) : {};
      return sanitize(parsed !== null && typeof parsed === 'object' ? parsed : {});
    } catch {
      return null;
    }
  }

  get() {
    return this.values;
  }

  /** @param {Partial<Preferences>} changes */
  set(changes) {
    const current = (this.saving ? this.read() : null) ?? this.values;
    this.values = sanitize({ ...current, ...changes });

    try {
      this.window.localStorage?.setItem(STORAGE_KEY, JSON.stringify(this.values));
    } catch {
      // Keep the new values for this visit even if they cannot be saved.
      this.saving = false;
    }
  }
}
