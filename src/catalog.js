import { BRICKS_CONFIG, DIFFICULTY_CONFIGS, GAME_CONFIG, RUSH_CONFIG, TWO_PLAYER_CONFIG, tuned } from './config.js';

/**
 * @import { HighScore, MatchCatalog, Rival } from './application/ports.js'
 */

// The matches a player can choose, handed to the application: the three difficulties of a
// Solo match, Rush, two players, and the career ladder below.

// The Last Arcade: the career ladder. Nine regulars of the last arcade in town, each with a
// tuning and one line of story, from a first-timer to the router in the back room, and at the
// top the landlord who wants the place gone. The fourth, the seventh and the ninth are bosses,
// which attack the player's end of the court; the landlord is the final boss, who borrows all
// three of their attacks, one after another as the player closes in on winning. Each has a neon
// emblem, and a line for the result screen whichever way the match went. Every name is made up
// and names nobody.

const NO_POWER_UPS = Object.freeze({ enabled: false });

/** @type {readonly Rival[]} */
export const RIVALS = Object.freeze([
  {
    name: 'Rookie Roma',
    short: 'Roma',
    story: 'First night at the arcade. Holds the paddle like a shawarma.',
    emblem: 'wrap',
    says: { winning: 'I won? Do not tell my mom I was here.', beaten: 'Wait, we were keeping score?' },
    boss: false,
    config: tuned(GAME_CONFIG, {
      ball: { initialSpeed: 380, maxSpeed: 820, speedIncrease: 1.035 },
      opponent: { maxSpeed: 210, reach: 0.4, predictionWeight: 0.3, error: 130, aim: 0 },
      powerUps: NO_POWER_UPS,
    }),
  },
  {
    name: 'Aunt Halyna',
    short: 'Halyna',
    story: 'Runs the cloakroom. Wide paddle, slow hands, zero mercy.',
    emblem: 'hanger',
    says: { winning: 'No ticket, no coat, no rematch.', beaten: 'Fine. But you are not getting your coat back.' },
    boss: false,
    config: tuned(GAME_CONFIG, {
      ball: { initialSpeed: 400, maxSpeed: 900, speedIncrease: 1.04 },
      opponent: { maxSpeed: 185, reach: 0.5, predictionWeight: 0.45, error: 105, aim: 0.1, widthScale: 1.4 },
      powerUps: NO_POWER_UPS,
    }),
  },
  {
    name: 'Twisty Taras',
    short: 'Taras',
    story: 'Everything he hits comes back bent. Rules included.',
    emblem: 'spiral',
    says: { winning: 'Never trust a straight line.', beaten: 'That last one was out. Probably.' },
    boss: false,
    config: tuned(GAME_CONFIG, {
      ball: { initialSpeed: 420, maxSpeed: 980, speedIncrease: 1.045 },
      opponent: { maxSpeed: 260, reach: 0.55, predictionWeight: 0.6, error: 85, aim: 0.2, curve: 0.45 },
      powerUps: NO_POWER_UPS,
    }),
  },
  {
    name: 'The Janitor',
    short: 'Janitor',
    story: 'Mops the floor with players. His bucket leaks on purpose.',
    emblem: 'bucket',
    says: { winning: 'Mind the wet floor on your way out.', beaten: 'Great. Now I have to mop up my pride.' },
    boss: true,
    config: tuned(GAME_CONFIG, {
      opponent: { maxSpeed: 280, reach: 0.6, predictionWeight: 0.65, error: 72, aim: 0.25 },
      powerUps: NO_POWER_UPS,
      boss: { attack: 'drip', every: [7, 10], warning: 1, shrinkSeconds: 2.5, lagSeconds: 0 },
    }),
  },
  {
    name: 'Hoarder Hryts',
    short: 'Hryts',
    story: 'Never met a power-up he did not pocket.',
    emblem: 'sack',
    says: { winning: 'Finders keepers.', beaten: 'Keep the win. I am keeping the power-ups.' },
    boss: false,
    config: tuned(GAME_CONFIG, {
      powerUps: { enabled: true, spawnDelay: [2.5, 4.5] },
    }),
  },
  {
    name: 'Sniper Sanya',
    short: 'Sanya',
    story: 'Aims for the corners. Blames the lag when he misses.',
    emblem: 'crosshair',
    says: { winning: 'Called it. Top corner.', beaten: 'Lag. It was definitely lag.' },
    boss: false,
    config: tuned(GAME_CONFIG, {
      ball: { initialSpeed: 450, maxSpeed: 1100, speedIncrease: 1.055 },
      opponent: { maxSpeed: 420, reach: 0.7, predictionWeight: 0.9, error: 30, aim: 0.75 },
      powerUps: NO_POWER_UPS,
    }),
  },
  {
    name: 'DJ Wobble',
    short: 'DJ Wobble',
    story: 'Drops the bass, then a beam right where you stand.',
    emblem: 'headphones',
    says: { winning: 'And that is how you drop the beat.', beaten: 'You just scratched my best record.' },
    boss: true,
    config: tuned(GAME_CONFIG, {
      ball: { initialSpeed: 450, maxSpeed: 1100, speedIncrease: 1.05 },
      opponent: { maxSpeed: 400, reach: 0.68, predictionWeight: 0.8, error: 40, aim: 0.35 },
      powerUps: NO_POWER_UPS,
      boss: { attack: 'beam', every: [7, 9.5], warning: 1, shrinkSeconds: 2.5, lagSeconds: 0 },
    }),
  },
  {
    name: 'Grandmaster Zina',
    short: 'Zina',
    story: 'Unbeaten since the arcade opened. Knits between points.',
    emblem: 'yarn',
    says: { winning: 'I knitted a whole scarf during that one.', beaten: 'Hm. I dropped a stitch. Well played, dear.' },
    boss: false,
    config: tuned(GAME_CONFIG, {
      ball: { initialSpeed: 480, maxSpeed: 1200, speedIncrease: 1.06 },
      opponent: { maxSpeed: 480, reach: 0.8, predictionWeight: 0.9, error: 30, aim: 0.45, curve: 0.25 },
      powerUps: NO_POWER_UPS,
    }),
  },
  {
    name: 'LAG',
    short: 'LAG',
    story: 'The router in the back room. Buffering since 1998.',
    emblem: 'router',
    says: { winning: 'Your skills are still buffering. 12%...', beaten: 'Connection lost. Reconnecting... never.' },
    boss: true,
    config: tuned(GAME_CONFIG, {
      ball: { initialSpeed: 480, maxSpeed: 1200, speedIncrease: 1.06 },
      opponent: { maxSpeed: 480, reach: 0.8, predictionWeight: 0.9, error: 30, aim: 0.4 },
      powerUps: NO_POWER_UPS,
      boss: { attack: 'lag', every: [9, 12], warning: 1, shrinkSeconds: 0, lagSeconds: 2.2 },
    }),
  },
  {
    name: 'The Landlord',
    short: 'Landlord',
    story: 'Owns the building. Wants a parking lot where the arcade stands.',
    emblem: 'key',
    says: { winning: 'The parking lot opens Monday.', beaten: 'Fine. Keep your arcade. The roof still leaks.' },
    boss: true,
    config: tuned(GAME_CONFIG, {
      ball: { initialSpeed: 480, maxSpeed: 1200, speedIncrease: 1.06 },
      opponent: { maxSpeed: 480, reach: 0.8, predictionWeight: 0.9, error: 30, aim: 0.45, widthScale: 1.15 },
      powerUps: NO_POWER_UPS,
      supers: { cpuChance: 0.75 },
      boss: {
        attack: 'drip',
        phases: [['drip'], ['beam'], ['lag'], ['drip', 'beam', 'lag']],
        every: [7, 9.5],
        warning: 1,
        shrinkSeconds: 2.5,
        lagSeconds: 2,
      },
    }),
  },
]);

// The Rush cabinet's high-score table as the arcade left it: the nine regulars' best runs, in
// the order of the ladder, under a record nobody ever signed. The runs were set by simulating
// Rush with human-like bots of three skill levels: a first run lands a casual player on the
// table, steady play takes them to the middle of it, and the record at the top is a skilled
// player's run of a lifetime, about one in fifty.
/** @type {readonly (readonly [string, number])[]} */
const REGULARS_RUNS = [['ROM', 8], ['HAL', 13], ['TAR', 18], ['JAN', 22], ['HRY', 26], ['SAN', 31], ['WOB', 35], ['ZIN', 41], ['LAG', 48]];

/** @type {readonly HighScore[]} */
export const HIGH_SCORES = Object.freeze([
  Object.freeze({ initials: 'AAA', name: 'Unknown', hits: 60 }),
  ...REGULARS_RUNS.map(([initials, hits], index) => Object.freeze({ initials, name: RIVALS[index].name, hits })).reverse(),
]);

/** @type {MatchCatalog} */
export const MATCH_CATALOG = Object.freeze({
  difficulties: DIFFICULTY_CONFIGS,
  rush: RUSH_CONFIG,
  duo: TWO_PLAYER_CONFIG,
  bricks: BRICKS_CONFIG,
  career: RIVALS,
  highScores: HIGH_SCORES,
});
