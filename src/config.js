import { BRICK_LEVELS } from './levels.js';
import { WARP_COURSES } from './courses.js';
import { NOVA_SECTORS } from './sectors.js';

/**
 * @import { GameConfig, Loadout } from './domain/types.js'
 * @import { Difficulty } from './application/ports.js'
 */

/** Misses a Rush run allows; the menu names it once Rush is chosen. */
export const RUSH_LIVES = 3;

// A portrait 5:8 court: it fills a phone held upright and reads as a vertical arcade on desktop.
/** @satisfies {GameConfig} */
export const GAME_CONFIG = Object.freeze({
  width: 500,
  height: 800,
  rules: Object.freeze({ kind: /** @type {const} */ ('match'), winningScore: 7 }),
  startDelaySeconds: 3,
  serveDelaySeconds: 0.9,
  fixedStepSeconds: 1 / 120,
  maxFrameSeconds: 0.1,
  paddle: Object.freeze({
    width: 100,
    height: 16,
    inset: 40,
    keyboardSpeed: 640,
    velocityResponse: 30,
  }),
  ball: Object.freeze({
    radius: 10,
    initialSpeed: 440,
    maxSpeed: 1050,
    speedIncrease: 1.05,
    maxBounceAngleRadians: (62 * Math.PI) / 180,
    spinPerPaddleSpeed: 0.0009,
    maxSpin: 1.1,
    spinDecay: 0.8,
  }),
  opponent: Object.freeze({
    controller: /** @type {const} */ ('cpu'),
    maxSpeed: 380,
    reach: 0.65,
    trackingDeadZone: 6,
    predictionWeight: 0.75,
    error: 45,
    aim: 0.3,
    curve: 0,
    widthScale: 1,
  }),
  powerUps: Object.freeze({
    enabled: true,
    spawnDelay: /** @type {[number, number]} */ ([5, 9]),
    lifetime: 7,
    radius: 20,
    minRally: 1,
    duration: 8,
    wideScale: 1.6,
    shrinkScale: 0.6,
    turboSpeed: 1250,
    // Multiball: the split-off ball parts from the ball at about 34 degrees.
    splitAngle: 0.6,
    maxExtraBalls: 2,
  }),
  // Off here, so a classic match plays exactly as it always has; the player's Supers setting
  // turns them on for the match being built.
  supers: Object.freeze({
    enabled: false,
    perHit: 0.05,
    perSkill: 0.02,
    perSave: 0.08,
    perConceded: 0.08,
    flickSpeed: 360,
    cpuChance: 0.5,
  }),
  boss: null,
  bricks: null,
  nova: null,
  warp: null,
});

/**
 * @typedef {object} Tuning
 * @property {GameConfig['rules']} [rules]
 * @property {Partial<GameConfig['ball']>} [ball]
 * @property {Partial<GameConfig['opponent']>} [opponent]
 * @property {Partial<GameConfig['powerUps']>} [powerUps]
 * @property {Partial<GameConfig['supers']>} [supers]
 * @property {GameConfig['boss']} [boss]
 * @property {GameConfig['bricks']} [bricks]
 * @property {GameConfig['nova']} [nova]
 * @property {GameConfig['warp']} [warp]
 */

/**
 * @param {GameConfig} base
 * @param {Tuning} tuning
 * @returns {GameConfig}
 */
export function tuned(base, tuning) {
  return Object.freeze({
    ...base,
    rules: tuning.rules ?? base.rules,
    ball: Object.freeze({ ...base.ball, ...tuning.ball }),
    opponent: Object.freeze({ ...base.opponent, ...tuning.opponent }),
    powerUps: Object.freeze({ ...base.powerUps, ...tuning.powerUps }),
    supers: Object.freeze({ ...base.supers, ...tuning.supers }),
    boss: tuning.boss === undefined ? base.boss : tuning.boss && Object.freeze({ ...tuning.boss }),
    bricks: tuning.bricks === undefined ? base.bricks : tuning.bricks && Object.freeze({ ...tuning.bricks }),
    nova: tuning.nova === undefined ? base.nova : tuning.nova && Object.freeze({ ...tuning.nova }),
    warp: tuning.warp === undefined ? base.warp : tuning.warp && Object.freeze({ ...tuning.warp }),
  });
}

// Tuned by simulating matches against human-like bots of three skill levels: a casual player
// wins almost every match on Easy, a confident one about two in three on Normal, and Hard is
// beaten mostly with curved shots.
/** @type {Readonly<Record<Difficulty, GameConfig>>} */
export const DIFFICULTY_CONFIGS = Object.freeze({
  easy: tuned(GAME_CONFIG, {
    ball: { initialSpeed: 400, maxSpeed: 900, speedIncrease: 1.04 },
    opponent: { maxSpeed: 250, reach: 0.45, predictionWeight: 0.35, error: 110, aim: 0 },
    supers: { cpuChance: 0.3 },
  }),
  normal: GAME_CONFIG,
  hard: tuned(GAME_CONFIG, {
    ball: { initialSpeed: 480, maxSpeed: 1200, speedIncrease: 1.06 },
    opponent: { maxSpeed: 520, reach: 0.82, predictionWeight: 0.92, error: 26, aim: 0.5 },
    supers: { cpuChance: 0.75 },
  }),
});

// Rush: a survival run against a computer that returns everything but a curve, with a ball
// that keeps accelerating. Three misses end the run; the score is the number of hits.
export const RUSH_CONFIG = tuned(GAME_CONFIG, {
  rules: Object.freeze({ kind: 'rush', lives: RUSH_LIVES }),
  ball: { initialSpeed: 440, maxSpeed: 1500, speedIncrease: 1.05 },
  opponent: { maxSpeed: 1400, reach: 1, predictionWeight: 1, error: 0, aim: 0.35 },
  powerUps: { enabled: false },
});

// Two people on one screen, each steering their own end of the court.
export const TWO_PLAYER_CONFIG = tuned(GAME_CONFIG, {
  opponent: { controller: 'human' },
});

/** Balls a Bricks game allows the player to lose. */
export const BRICKS_LIVES = 3;

// Bricks: the player's paddle and ball against a wall instead of an opponent. The ball starts
// slower than a match's and gathers pace with every return, to a top speed a person can still
// follow among the bricks; each level serves a little faster than the last. Tuned by playing
// every level with human-like bots: a casual player clears the first walls, a confident one
// reaches the last, and no ball circles between walls and steel forever.
export const BRICKS_CONFIG = tuned(GAME_CONFIG, {
  rules: Object.freeze({ kind: 'bricks', lives: BRICKS_LIVES }),
  ball: { initialSpeed: 470, maxSpeed: 820, speedIncrease: 1.02 },
  powerUps: { enabled: false },
  bricks: {
    levels: BRICK_LEVELS,
    columns: 10,
    top: 70,
    margin: 14,
    gap: 4,
    rowHeight: 20,
    serveY: 440,
    speedPerLevel: 0.03,
    toughHits: 2,
    // A bomb takes the bricks beside it, above and below it and on its diagonals.
    blastRadius: 62,
    fuseSeconds: 0.09,
    dropChance: 0.14,
    dropGravity: 380,
    dropMaxSpeed: 260,
    dropRadius: 14,
    maxDrops: 3,
    maxBalls: 5,
    laserSeconds: 6,
    laserEvery: 0.42,
    boltSpeed: 900,
    wideSeconds: 14,
    slowScale: 0.72,
    maxLives: 5,
    pointsPerBrick: 10,
    maxCombo: 8,
    clearBonus: 100,
    chargePerBrick: 0.012,
    pierce: 8,
    strikeWidth: 14,
    stallBounces: 9,
    maxLean: (72 * Math.PI) / 180,
    clearSeconds: 2,
    helpAfter: 7,
    mercyAfter: 22,
  },
});

/** Ships a Nova game gives the player. */
export const NOVA_LIVES = 3;

// Nova: the paddle is a starship. It fires by itself, so the player only steers, as in every
// other mode: out of the way of rocks and enemy fire, and under what is to be shot down. Its
// track is the paddle's, and it is hit as a small circle, smaller than it is drawn. Tuned by
// flying every sector with human-like bots.
export const NOVA_CONFIG = Object.freeze({
  ...tuned(GAME_CONFIG, {
    rules: Object.freeze({ kind: 'nova', lives: NOVA_LIVES }),
    powerUps: { enabled: false },
    nova: {
      sectors: NOVA_SECTORS,
      shipRadius: 8,
      fireEvery: 0.2,
      rapidEvery: 0.1,
      shotSpeed: 900,
      tripleSpread: 0.16,
      enemyShotSpeed: 250,
      enemyShotRadius: 5,
      speedPerSector: 0.07,
      waveGap: 7,
      calmSeconds: 2.5,
      invulnerableSeconds: 2,
      lootChance: 0.06,
      lootSpeed: 120,
      lootRadius: 14,
      powerSeconds: 10,
      maxLives: 5,
      worth: Object.freeze({ rock: 20, pebble: 10, drone: 30, gunship: 80, boss: 2500 }),
      chainStep: 8,
      maxMultiplier: 5,
      sectorBonus: 300,
      chargePerKill: 0.07,
      bossHp: 160,
      fireballPower: 10,
      spreadCount: 9,
      chainTargets: 6,
      chainPower: 8,
      cloakSeconds: 4,
    },
  }),
  // The ship is narrower than a paddle, so it reaches nearer the walls.
  paddle: Object.freeze({ ...GAME_CONFIG.paddle, width: 44 }),
});

/** Credits a Warp cup gives the player: a race placed too low to go through spends one. */
export const WARP_LIVES = 4;

/**
 * The craft a Warp race is flown in unless the hangar says otherwise: the first craft of the
 * hangar, untuned, in the player's own cyan. The game is tuned for it.
 *
 * @type {Readonly<Loadout>}
 */
export const WARP_LOADOUT = Object.freeze({
  name: 'Kestrel',
  kind: 'jet',
  paint: '34, 211, 238',
  decal: 'none',
  glow: '34, 211, 238',
  speed: 1,
  nitroBars: 3,
  nitroSeconds: 1.5,
  drift: 1,
  spin: 1,
  shields: 0,
  damage: 55,
  rockets: 2,
});

// Warp: the paddle is a racing craft on a neon course, seen from behind. It flies on by itself,
// so the player only steers, as in every other mode: through rings and gates, over boost pads
// and off ramps, round hazards, along the inside of a bend for a drift, and past five rivals a
// race. Its place across the lane is the paddle's place across the court. A race lasts about a
// minute. Tuned by racing the cup with human-like bots.
export const WARP_CONFIG = Object.freeze({
  ...tuned(GAME_CONFIG, {
    rules: Object.freeze({ kind: 'warp', lives: WARP_LIVES }),
    powerUps: { enabled: false },
    warp: {
      courses: WARP_COURSES,
      segment: 3,
      topSpeed: 40,
      boostSpeed: 54,
      accel: 1.2,
      gravity: 2,
      spinSeconds: 0.8,
      spinSpeed: 0.7,
      safeSeconds: 2.25,
      craftRadius: 0.09,
      ringCenter: 0.1,
      ringRadius: 0.28,
      padWidth: 0.22,
      padSeconds: 1.4,
      rampWidth: 0.36,
      airSeconds: 1.05,
      gateGap: 0.45,
      gateCenter: 0.08,
      nearMiss: 0.13,
      draft: 14,
      slipSeconds: 1.2,
      slingSeconds: 1.2,
      driftBend: 0.5,
      driftFrom: 0.45,
      driftSeconds: 1.1,
      driftBoostSeconds: 0.9,
      startWindow: 0.4,
      startBoostSeconds: 1.2,
      flowStep: 4,
      maxFlow: 5,
      placePoints: Object.freeze([1000, 600, 400, 200, 100, 50]),
      chargePerTrick: 0.04,
      burnSeconds: 3,
      ghostSeconds: 4,
      shockRange: 18,
      pickupWidth: 0.32,
      nitroSpeed: 62,
      nitroPerTrick: 0.05,
      gunRange: 45,
      gunAim: 0.14,
      rivalHull: 140,
      rocketRange: 110,
      rocketAim: 0.4,
      lockSeconds: 0.7,
      missileSpeed: 45,
      blastRange: 7,
      mineEvery: 7,
      maxDrops: 5,
      calmSeconds: 4.5,
      loadout: WARP_LOADOUT,
    },
  }),
  // The craft steers across the whole lane with the paddle's whole reach.
  paddle: Object.freeze({ ...GAME_CONFIG.paddle, width: 80 }),
});
