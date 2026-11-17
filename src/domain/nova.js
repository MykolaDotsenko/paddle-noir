import { nextRandom } from './random.js';
import { chargeMeter, isLoaded } from './supers.js';

/**
 * The Nova game: the player's paddle is a starship. It fires by itself, a bolt every fifth of
 * a second, so the player only steers, as in every other mode. Waves of rocks, drones and
 * gunships come down the court sector by sector, and the last sector ends with the boss. This
 * module is space and everything in it: the waves, how each enemy moves and fires, the ship's
 * shots and what they hit, the bonuses, the ship's shield and its lives, and what a super does
 * out here. `game.js` runs the game around it: the countdown, pause and the end.
 *
 * @import {
 *   DownCause,
 *   Enemy,
 *   EnemyKind,
 *   EnemyShot,
 *   GameConfig,
 *   GameEvent,
 *   GameState,
 *   Loot,
 *   LootKind,
 *   NovaConfig,
 *   NovaState,
 *   SectorLayout,
 *   Shot,
 *   SuperKind,
 *   Wave,
 * } from './types.js'
 *
 * @typedef {NovaState & { enemies: Enemy[], shots: Shot[], fire: EnemyShot[], loot: Loot[] }} Space
 *
 * @typedef {object} Flight one step's changes to space, gathered before they become a state
 * @property {GameState} state the state the step began with, the ship already moved
 * @property {Space} space
 * @property {number} seed
 * @property {number} lives
 * @property {number} charge the super meter's charge the step earned
 * @property {boolean} mercy whether the ship was lost this step, which clears the enemies' fire
 * @property {GameConfig} config
 * @property {GameEvent[]} events
 */

/** What falls from a downed enemy, and how often, in shares of a hundred. */
/** @type {readonly (readonly [LootKind, number])[]} */
export const LOOT_SHARES = Object.freeze([['rapid', 34], ['triple', 32], ['shield', 26], ['life', 8]]);

/** How each kind of enemy is built, before a sector's speed is applied. */
const BUILD = Object.freeze({
  rock: { rx: 24, ry: 24, hp: 3, speed: [70, 115] },
  pebble: { rx: 13, ry: 13, hp: 1, speed: [95, 135] },
  drone: { rx: 16, ry: 13, hp: 2, speed: [78, 78] },
  gunship: { rx: 26, ry: 18, hp: 7, speed: [75, 75] },
  boss: { rx: 86, ry: 30, hp: 0, speed: [60, 60] },
});

const BOLT_RADIUS = 3;
const FIREBALL_RADIUS = 22;
const SPREAD_ARC = 1.1;
const SPREAD_POWER = 2;
const FIREBALL_SPEED = 650;
// A drone weaves this often, in radians a second, and fires no nearer the ship than this.
const WEAVE = 1.4;
const HOLD_FIRE = 230;
const GUNSHIP_STRAFE = 60;
const GUNSHIP_SPREAD = 0.22;
const BOSS_TOP = 130;
const BOSS_SWING = 140;
// The ship is drawn this far above its center; its shots leave from its nose.
const NOSE = 18;
// The ship catches a falling bonus this far to either side of its center, and this far up and down.
const CATCH_X = 28;
const CATCH_Y = 24;

/**
 * @param {GameConfig} config
 * @returns {NovaConfig}
 */
function rulesOf(config) {
  return /** @type {NovaConfig} */ (config.nova);
}

/**
 * Where the ship flies: the line a paddle's middle runs along.
 *
 * @param {GameConfig} config
 */
export function shipY(config) {
  return config.height - config.paddle.inset - config.paddle.height / 2;
}

/**
 * A sector as it starts: nothing in space yet, the first wave a moment away. The points, the
 * shield, the chain and the ids carry over from the sector before.
 *
 * @param {GameConfig} config
 * @param {number} sector
 * @param {Partial<Pick<NovaState, 'points' | 'shield' | 'chain' | 'nextId' | 'rapid' | 'triple'>>} [carry]
 * @returns {NovaState}
 */
export function sectorState(config, sector, carry = {}) {
  return {
    sector,
    time: 0,
    wave: 0,
    spawned: 0,
    spawnIn: 0,
    sinceSpawn: 0,
    bossSent: false,
    enemies: [],
    shots: [],
    fire: [],
    loot: [],
    fireIn: 0,
    rapid: carry.rapid ?? 0,
    triple: carry.triple ?? 0,
    shield: carry.shield ?? 0,
    cloak: 0,
    invulnerable: 0,
    calm: sector === 0 ? 0 : rulesOf(config).calmSeconds,
    chain: carry.chain ?? 0,
    points: carry.points ?? 0,
    nextId: carry.nextId ?? 1,
  };
}

/**
 * @param {GameConfig} config
 * @returns {NovaState | null} the first sector, or null in any other game
 */
export function initialNovaState(config) {
  return config.nova ? sectorState(config, 0) : null;
}

/**
 * @param {NovaState} space
 * @param {NovaConfig} rules
 * @returns {number} what each enemy downed now scores times: one more for every few downed
 *   since the ship was last hit
 */
export function multiplier(space, rules) {
  return Math.min(rules.maxMultiplier, 1 + Math.floor(space.chain / rules.chainStep));
}

/**
 * @param {Flight} flight
 * @param {number} min
 * @param {number} max
 */
function draw(flight, min, max) {
  const roll = nextRandom(flight.seed);
  flight.seed = roll.seed;
  return min + roll.value * (max - min);
}

/**
 * @param {Flight} flight
 */
function nextId(flight) {
  flight.space.nextId += 1;
  return flight.space.nextId - 1;
}

/**
 * @param {Flight} flight
 */
function speedOf(flight) {
  return 1 + flight.space.sector * rulesOf(flight.config).speedPerSector;
}

/**
 * A new enemy, at the top of the court, moving as its kind does.
 *
 * @param {Flight} flight
 * @param {EnemyKind} kind
 * @param {Partial<Enemy>} placed
 * @returns {Enemy}
 */
function build(flight, kind, placed) {
  const { rx, ry, hp, speed } = BUILD[kind];
  const pace = speedOf(flight);

  return {
    id: nextId(flight),
    kind,
    x: flight.config.width / 2,
    y: -ry - 4,
    vx: 0,
    vy: draw(flight, speed[0], speed[1]) * pace,
    rx,
    ry,
    hp,
    maxHp: hp,
    age: 0,
    home: 0,
    sway: 0,
    phase: 0,
    angle: 0,
    spin: 0,
    fireIn: 0,
    altIn: 0,
    ...placed,
  };
}

/**
 * Sends in the next enemy of a wave, where its formation puts it.
 *
 * @param {Flight} flight
 * @param {Wave} wave
 * @param {number} index its place in the wave, from 0
 */
function send(flight, wave, index) {
  const { width } = flight.config;
  const { rx } = BUILD[wave.kind];

  if (wave.kind === 'rock' || wave.kind === 'pebble') {
    flight.space.enemies.push(build(flight, wave.kind, {
      x: draw(flight, rx + 10, width - rx - 10),
      vx: draw(flight, -35, 35),
      angle: draw(flight, 0, Math.PI * 2),
      spin: draw(flight, -1.6, 1.6),
    }));
    return;
  }

  if (wave.kind === 'gunship') {
    const x = draw(flight, 90, width - 90);
    flight.space.enemies.push(build(flight, 'gunship', {
      x,
      home: draw(flight, 110, 190),
      vx: GUNSHIP_STRAFE * (x < width / 2 ? 1 : -1),
      fireIn: draw(flight, 1.6, 2.6),
    }));
    return;
  }

  // Drones, in formation.
  /** @type {Record<Wave['formation'], () => { home: number, sway: number, phase: number }>} */
  const formations = {
    line: () => ({ home: (width * (index + 1)) / (wave.count + 1), sway: 34, phase: 0 }),
    snake: () => ({ home: width / 2, sway: 150, phase: -index * 0.55 }),
    left: () => ({ home: 120, sway: 80, phase: -index * 0.6 }),
    right: () => ({ home: width - 120, sway: 80, phase: -index * 0.6 }),
    scatter: () => ({ home: draw(flight, 90, width - 90), sway: 50, phase: draw(flight, 0, Math.PI * 2) }),
  };
  const { home, sway, phase } = formations[wave.formation]();

  flight.space.enemies.push(build(flight, 'drone', {
    x: home + sway * Math.sin(phase),
    home,
    sway,
    phase,
    fireIn: draw(flight, 1.2, 3.2),
  }));
}

/**
 * The boss comes in from the top.
 *
 * @param {Flight} flight
 */
function sendBoss(flight) {
  const rules = rulesOf(flight.config);
  const boss = build(flight, 'boss', { hp: rules.bossHp, maxHp: rules.bossHp, fireIn: 2, altIn: 3, home: 0 });

  flight.space.enemies.push(boss);
  flight.events.push({ type: 'enemy-arrive', kind: 'boss', x: boss.x, y: boss.y });
}

/**
 * The sector's waves come in one after another: each enemy of a wave a moment after the last,
 * and the next wave once this one is all in and the court has all but cleared, or after a
 * while regardless. Once the waves are done the boss comes, in a sector that has one.
 *
 * @param {Flight} flight
 * @param {SectorLayout} sector
 * @param {number} deltaSeconds
 */
function sendWaves(flight, sector, deltaSeconds) {
  const { space } = flight;

  if (space.calm > 0) {
    space.calm = Math.max(0, space.calm - deltaSeconds);
    return;
  }

  space.sinceSpawn += deltaSeconds;
  const wave = sector.waves[space.wave];

  if (!wave) {
    if (sector.boss && !space.bossSent && space.enemies.length === 0) {
      space.bossSent = true;
      sendBoss(flight);
    }
    return;
  }

  space.spawnIn -= deltaSeconds;

  if (space.spawnIn > 0) {
    return;
  }

  if (space.spawned < wave.count) {
    send(flight, wave, space.spawned);
    space.spawned += 1;
    space.spawnIn = wave.every;
    space.sinceSpawn = 0;
  } else if (space.enemies.length <= 1 || space.sinceSpawn >= rulesOf(flight.config).waveGap) {
    space.wave += 1;
    space.spawned = 0;
    space.spawnIn = 0.6;
  }
}

/**
 * Fires at the ship from a point: one shot aimed at it, or a fan of them about that aim.
 *
 * @param {Flight} flight
 * @param {Enemy} enemy
 * @param {readonly number[]} angles radians off the aim, one a shot
 * @param {number} fromY
 */
function fireAtShip(flight, enemy, angles, fromY) {
  const { space, config, state } = flight;
  const speed = rulesOf(config).enemyShotSpeed * speedOf(flight);
  const aim = Math.atan2(state.player.x - enemy.x, shipY(config) - fromY);

  for (const angle of angles) {
    space.fire.push({ id: nextId(flight), x: enemy.x, y: fromY, vx: Math.sin(aim + angle) * speed, vy: Math.cos(aim + angle) * speed });
  }

  flight.events.push({ type: 'enemy-fire', kind: enemy.kind, x: enemy.x, y: fromY, count: angles.length });
}

/**
 * Fires a ring of shots all round, turned a little each time.
 *
 * @param {Flight} flight
 * @param {Enemy} enemy
 * @param {number} count
 */
function fireRing(flight, enemy, count) {
  const speed = rulesOf(flight.config).enemyShotSpeed * 0.8;
  const turn = enemy.age * 0.7;

  for (let index = 0; index < count; index += 1) {
    const angle = turn + (index / count) * Math.PI * 2;
    flight.space.fire.push({ id: nextId(flight), x: enemy.x, y: enemy.y + enemy.ry, vx: Math.sin(angle) * speed, vy: Math.cos(angle) * speed });
  }

  flight.events.push({ type: 'enemy-fire', kind: enemy.kind, x: enemy.x, y: enemy.y + enemy.ry, count });
}

/**
 * @param {Enemy} boss
 * @returns {number} the boss's pattern of fire, from 0, which follows its health in thirds
 */
export function bossPhase(boss) {
  return boss.hp > (boss.maxHp * 2) / 3 ? 0 : boss.hp > boss.maxHp / 3 ? 1 : 2;
}

/**
 * Moves an enemy for one step, and lets it fire.
 *
 * @param {Flight} flight
 * @param {Enemy} enemy
 * @param {number} deltaSeconds
 */
function fly(flight, enemy, deltaSeconds) {
  const { width } = flight.config;
  enemy.age += deltaSeconds;

  switch (enemy.kind) {
    case 'rock':
    case 'pebble':
      enemy.x += enemy.vx * deltaSeconds;
      enemy.y += enemy.vy * deltaSeconds;
      enemy.angle += enemy.spin * deltaSeconds;

      // Off the side walls, as the ball does.
      if ((enemy.x < enemy.rx && enemy.vx < 0) || (enemy.x > width - enemy.rx && enemy.vx > 0)) {
        enemy.vx = -enemy.vx;
      }
      return;
    case 'drone':
      enemy.y += enemy.vy * deltaSeconds;
      enemy.x = enemy.home + enemy.sway * Math.sin(WEAVE * enemy.age + enemy.phase);
      enemy.fireIn -= deltaSeconds;

      if (enemy.fireIn <= 0) {
        enemy.fireIn = draw(flight, 2.2, 4);

        if (enemy.y > 0 && shipY(flight.config) - enemy.y > HOLD_FIRE) {
          fireAtShip(flight, enemy, [0], enemy.y + enemy.ry);
        }
      }
      return;
    case 'gunship':
      if (enemy.y < enemy.home) {
        enemy.y = Math.min(enemy.home, enemy.y + enemy.vy * deltaSeconds);
      } else {
        enemy.x += enemy.vx * deltaSeconds;

        if ((enemy.x < 60 && enemy.vx < 0) || (enemy.x > width - 60 && enemy.vx > 0)) {
          enemy.vx = -enemy.vx;
        }
      }

      enemy.fireIn -= deltaSeconds;

      if (enemy.fireIn <= 0) {
        enemy.fireIn = draw(flight, 2.4, 3.2);
        fireAtShip(flight, enemy, [-GUNSHIP_SPREAD, 0, GUNSHIP_SPREAD], enemy.y + enemy.ry);
      }
      return;
    case 'boss':
    default:
      bossFlies(flight, enemy, deltaSeconds);
  }
}

/**
 * The boss comes down to its place near the top, then swings from side to side. Its fire
 * grows fiercer as its health goes, in thirds: fans aimed at the ship, then rings with single
 * shots between them, then both, faster, with drones called in as well.
 *
 * @param {Flight} flight
 * @param {Enemy} boss
 * @param {number} deltaSeconds
 */
function bossFlies(flight, boss, deltaSeconds) {
  const { width } = flight.config;

  if (boss.y < BOSS_TOP) {
    boss.y = Math.min(BOSS_TOP, boss.y + boss.vy * deltaSeconds);
    return;
  }

  boss.home += deltaSeconds;
  boss.x = width / 2 + BOSS_SWING * Math.sin(boss.home * 0.55);
  boss.fireIn -= deltaSeconds;
  boss.altIn -= deltaSeconds;
  const phase = bossPhase(boss);

  if (boss.fireIn <= 0) {
    if (phase === 0) {
      boss.fireIn = 1.5;
      fireAtShip(flight, boss, [-0.2, 0, 0.2], boss.y + boss.ry);
    } else {
      boss.fireIn = phase === 1 ? 2 : 1.7;
      fireRing(flight, boss, phase === 1 ? 12 : 14);
    }
  }

  if (phase > 0 && boss.altIn <= 0) {
    boss.altIn = phase === 1 ? 1 : 1.3;
    fireAtShip(flight, boss, phase === 1 ? [0] : [-0.18, 0, 0.18], boss.y + boss.ry);
  }

  // In its last third it calls drones in, two at a time.
  if (phase === 2 && Math.floor(boss.home / 9) !== Math.floor((boss.home - deltaSeconds) / 9)) {
    for (const side of [-1, 1]) {
      flight.space.enemies.push(build(flight, 'drone', { home: width / 2 + side * 150, sway: 40, fireIn: draw(flight, 1.5, 3) }));
    }
  }
}

/**
 * Now and then a downed enemy lets a bonus fall.
 *
 * @param {Flight} flight
 * @param {Enemy} enemy
 */
function letFall(flight, enemy) {
  const rules = rulesOf(flight.config);
  const chance = enemy.kind === 'gunship' ? 0.35 : enemy.kind === 'boss' ? 0 : rules.lootChance;

  if (draw(flight, 0, 1) >= chance) {
    return;
  }

  let share = draw(flight, 0, 100);
  const [kind] = LOOT_SHARES.find(([, weight]) => (share -= weight) < 0) ?? LOOT_SHARES[0];

  flight.space.loot.push({ id: nextId(flight), kind, x: enemy.x, y: enemy.y });
  flight.events.push({ type: 'loot-spawn', kind, x: enemy.x, y: enemy.y });
}

/**
 * An enemy is hit: it takes the damage, and when it has none left it goes down. A downed
 * enemy scores, times the multiplier, unless it went down ramming the ship; it charges the
 * super meter; it may let a bonus fall; and a rock splits in two pebbles that fly apart.
 *
 * @param {Flight} flight
 * @param {Enemy} enemy
 * @param {number} power
 * @param {DownCause} by
 */
function damage(flight, enemy, power, by) {
  const { space, events } = flight;
  const index = space.enemies.indexOf(enemy);

  if (index < 0) {
    return;
  }

  enemy.hp -= power;

  if (enemy.hp > 0) {
    events.push({ type: 'enemy-hit', kind: enemy.kind, x: enemy.x, y: enemy.y, hp: enemy.hp });

    if (enemy.kind === 'boss') {
      const before = bossPhase({ ...enemy, hp: enemy.hp + power });
      const after = bossPhase(enemy);

      if (after !== before) {
        events.push({ type: 'boss-rage', phase: after, x: enemy.x, y: enemy.y });
      }
    }
    return;
  }

  const rules = rulesOf(flight.config);
  space.enemies.splice(index, 1);

  if (by === 'ram') {
    events.push({ type: 'enemy-down', kind: enemy.kind, x: enemy.x, y: enemy.y, rx: enemy.rx, by, points: 0, multiplier: multiplier(space, rules) });
  } else {
    space.chain += 1;
    const times = multiplier(space, rules);
    const points = rules.worth[enemy.kind] * times;
    space.points += points;
    flight.charge += rules.chargePerKill;
    events.push({ type: 'enemy-down', kind: enemy.kind, x: enemy.x, y: enemy.y, rx: enemy.rx, by, points, multiplier: times });
    letFall(flight, enemy);
  }

  // A rock splits in two pebbles, which fly apart more than they fall, so that a rock shot
  // just above the ship leaves it a moment to get out from under them.
  if (enemy.kind === 'rock') {
    for (const side of [-1, 1]) {
      space.enemies.push(build(flight, 'pebble', {
        x: enemy.x + side * 8,
        y: enemy.y,
        vx: side * draw(flight, 80, 120),
        vy: enemy.vy * 0.55,
        spin: side * 2,
      }));
    }
  }

  if (enemy.kind === 'boss') {
    // The boss's guns fall silent with it.
    space.fire = [];
  }
}

/**
 * Whether a point lies within an enemy grown by a radius, the enemy taken as an ellipse.
 *
 * @param {Enemy} enemy
 * @param {number} x
 * @param {number} y
 * @param {number} radius
 */
function inside(enemy, x, y, radius) {
  return ((x - enemy.x) / (enemy.rx + radius)) ** 2 + ((y - enemy.y) / (enemy.ry + radius)) ** 2 <= 1;
}

/**
 * The ship fires: its bolt, three with the triple shot, from its nose.
 *
 * @param {Flight} flight
 * @param {number} deltaSeconds
 */
function shipFires(flight, deltaSeconds) {
  const { space, config, state } = flight;
  const rules = rulesOf(config);
  space.fireIn -= deltaSeconds;

  if (space.fireIn > 0) {
    return;
  }

  space.fireIn += space.rapid > 0 ? rules.rapidEvery : rules.fireEvery;
  const x = state.player.x;
  const y = shipY(config) - NOSE;
  const angles = space.triple > 0 ? [-rules.tripleSpread, 0, rules.tripleSpread] : [0];

  for (const angle of angles) {
    space.shots.push({ id: nextId(flight), kind: 'bolt', x, y, vx: Math.sin(angle) * rules.shotSpeed, vy: -Math.cos(angle) * rules.shotSpeed, power: 1, radius: BOLT_RADIUS, hits: [] });
  }

  flight.events.push({ type: 'ship-fire', x, y });
}

/**
 * A super out here, fired with a flick of the ship while the meter is full: a fireball that
 * goes through everything in its way, a zigzag's fan of bolts, thunder that jumps from the
 * ship to the nearest enemies, or a phantom, which keeps the ship out of harm's way a while
 * and fires fast.
 *
 * @param {Flight} flight
 * @param {SuperKind} kind
 */
function fireSuper(flight, kind) {
  const { space, config, state, events } = flight;
  const rules = rulesOf(config);
  const x = state.player.x;
  const y = shipY(config) - NOSE;

  events.push({ type: 'super-fire', kind, x, y });

  switch (kind) {
    case 'fireball':
      space.shots.push({ id: nextId(flight), kind: 'fireball', x, y, vx: 0, vy: -FIREBALL_SPEED, power: rules.fireballPower, radius: FIREBALL_RADIUS, hits: [] });
      return;
    case 'zigzag':
      for (let index = 0; index < rules.spreadCount; index += 1) {
        const angle = -SPREAD_ARC / 2 + (SPREAD_ARC * index) / (rules.spreadCount - 1);
        space.shots.push({ id: nextId(flight), kind: 'spread', x, y, vx: Math.sin(angle) * rules.shotSpeed, vy: -Math.cos(angle) * rules.shotSpeed, power: SPREAD_POWER, radius: BOLT_RADIUS, hits: [] });
      }
      return;
    case 'thunder': {
      const targets = space.enemies
        .filter((enemy) => enemy.y > 0)
        .sort((a, b) => Math.hypot(a.x - x, a.y - y) - Math.hypot(b.x - x, b.y - y))
        .slice(0, rules.chainTargets);

      events.push({ type: 'chain', x, y, targets: targets.map((enemy) => ({ x: enemy.x, y: enemy.y })) });

      for (const enemy of targets) {
        damage(flight, enemy, rules.chainPower, 'super');
      }
      return;
    }
    case 'phantom':
    default:
      space.cloak = rules.cloakSeconds;
      space.rapid = Math.max(space.rapid, rules.cloakSeconds);
  }
}

/**
 * The ship is hit. A phantom or a ship just hit takes nothing; a shield takes the hit in its
 * place; otherwise a ship is lost, the multiplier starts again, and the enemy fire on the
 * court is cleared, as an arcade gives a player a moment to breathe.
 *
 * @param {Flight} flight
 * @returns {boolean} whether it took the hit, shield or ship
 */
function shipHit(flight) {
  const { space, config, state, events } = flight;

  if (space.cloak > 0 || space.invulnerable > 0 || flight.lives === 0) {
    return false;
  }

  const x = state.player.x;
  const y = shipY(config);

  if (space.shield > 0) {
    space.shield -= 1;
    space.invulnerable = 0.6;
    events.push({ type: 'shield-save', x, y });
    return true;
  }

  flight.lives -= 1;
  space.invulnerable = rulesOf(config).invulnerableSeconds;
  space.chain = 0;
  flight.mercy = true;
  events.push({ type: 'ship-hit', x, y }, { type: 'life-lost', lives: flight.lives });
  return true;
}

/**
 * What a caught bonus does: rapid fire and the triple shot for a while, a shield that takes
 * one hit, or one more ship.
 *
 * @param {Flight} flight
 * @param {Loot} loot
 */
function catchLoot(flight, loot) {
  const { space } = flight;
  const rules = rulesOf(flight.config);
  flight.events.push({ type: 'loot', kind: loot.kind, x: loot.x, y: loot.y });

  switch (loot.kind) {
    case 'rapid':
      space.rapid = rules.powerSeconds;
      break;
    case 'triple':
      space.triple = rules.powerSeconds;
      break;
    case 'shield':
      space.shield = 1;
      break;
    case 'life':
    default:
      flight.lives = Math.min(flight.lives + 1, rules.maxLives);
  }
}

/**
 * One step of the Nova game, once the ship has moved: the sector sends its waves in, every
 * enemy moves and fires, the ship fires, shots fly and hit, the ship is hit or not, bonuses
 * fall and are caught, and a sector with nothing left in it is cleared. The state it returns
 * has the lives left; `game.js` ends the game when none are, or when the last sector is clear.
 *
 * @param {GameState} state
 * @param {number} deltaSeconds
 * @param {GameConfig} config
 * @param {GameEvent[]} events
 * @returns {GameState}
 */
export function advanceNova(state, deltaSeconds, config, events) {
  const rules = rulesOf(config);
  const before = /** @type {NovaState} */ (state.nova);
  /** @type {Flight} */
  const flight = {
    state,
    space: {
      ...before,
      enemies: before.enemies.map((enemy) => ({ ...enemy })),
      shots: [...before.shots],
      fire: [...before.fire],
      loot: [...before.loot],
    },
    seed: state.seed,
    lives: state.lives,
    charge: 0,
    mercy: false,
    config,
    events,
  };
  const { space } = flight;
  const sector = rules.sectors[space.sector];
  const ship = { x: state.player.x, y: shipY(config) };
  let { meters } = state;

  space.time += deltaSeconds;
  space.rapid = Math.max(0, space.rapid - deltaSeconds);
  space.triple = Math.max(0, space.triple - deltaSeconds);
  space.cloak = Math.max(0, space.cloak - deltaSeconds);
  space.invulnerable = Math.max(0, space.invulnerable - deltaSeconds);

  // A super, with a flick of the ship while the meter is full.
  if (config.supers.enabled && isLoaded(meters.player) && Math.abs(state.player.vx) >= config.supers.flickSpeed) {
    const kind = /** @type {SuperKind} */ (meters.player.kind);
    meters = { ...meters, player: { charge: 0, kind } };
    fireSuper(flight, kind);
  }

  shipFires(flight, deltaSeconds);
  sendWaves(flight, sector, deltaSeconds);

  for (const enemy of [...space.enemies]) {
    fly(flight, enemy, deltaSeconds);
  }

  // The ship's shots fly, and hit what they meet.
  const flown = space.shots;
  space.shots = [];

  for (const shot of flown) {
    const moved = { ...shot, x: shot.x + shot.vx * deltaSeconds, y: shot.y + shot.vy * deltaSeconds };
    let spent = false;

    for (const enemy of [...space.enemies]) {
      if (moved.hits.includes(enemy.id) || !inside(enemy, moved.x, moved.y, moved.radius)) {
        continue;
      }

      damage(flight, enemy, moved.power, moved.kind === 'bolt' ? 'bolt' : 'super');

      if (moved.kind === 'fireball') {
        moved.hits = [...moved.hits, enemy.id];
      } else {
        spent = true;
        break;
      }
    }

    if (!spent && moved.y > -moved.radius && moved.x > -moved.radius && moved.x < config.width + moved.radius) {
      space.shots.push(moved);
    }
  }

  // The enemies' fire flies, and may hit the ship.
  const incoming = space.fire;
  const reach = rules.shipRadius + rules.enemyShotRadius;
  space.fire = [];

  for (const shot of incoming) {
    const moved = { ...shot, x: shot.x + shot.vx * deltaSeconds, y: shot.y + shot.vy * deltaSeconds };

    if (Math.hypot(moved.x - ship.x, moved.y - ship.y) <= reach && shipHit(flight)) {
      continue;
    }

    if (moved.y < config.height + 10 && moved.y > -10 && moved.x > -10 && moved.x < config.width + 10) {
      space.fire.push(moved);
    }
  }

  // An enemy that flies into the ship goes down with the blow, unless it is the boss.
  for (const enemy of [...space.enemies]) {
    if (enemy.kind !== 'boss' && inside(enemy, ship.x, ship.y, rules.shipRadius) && shipHit(flight)) {
      damage(flight, enemy, enemy.hp, 'ram');
    }
  }

  // A ship lost clears the enemies' fire, as an arcade gives a player a moment to breathe.
  if (flight.mercy) {
    space.fire = [];
  }

  // Enemies that got past the ship are gone.
  space.enemies = space.enemies.filter((enemy) => enemy.y - enemy.ry <= config.height);

  // Bonuses fall, and the ship catches what it flies into.
  const falling = space.loot;
  space.loot = [];

  for (const loot of falling) {
    const y = loot.y + rules.lootSpeed * deltaSeconds;

    if (Math.abs(loot.x - ship.x) <= CATCH_X && Math.abs(y - ship.y) <= CATCH_Y) {
      catchLoot(flight, { ...loot, y });
    } else if (y - rules.lootRadius <= config.height) {
      space.loot.push({ ...loot, y });
    }
  }

  const cleared = space.calm === 0 && space.wave >= sector.waves.length && space.enemies.length === 0 && (!sector.boss || space.bossSent);
  /** @type {GameState} */
  let next = { ...state, seed: flight.seed, lives: flight.lives, meters, nova: space };

  if (config.supers.enabled && flight.charge > 0) {
    next = chargeMeter(next, 'player', flight.charge, events);
  }

  return cleared && flight.lives > 0 ? clearSector(next, config, events) : next;
}

/**
 * A sector is clear: a bonus, larger each sector, and after the last one the game is won;
 * otherwise the next sector begins after a short calm. The ship keeps its points, its shield,
 * its multiplier and what is left of its bonuses.
 *
 * @param {GameState} state
 * @param {GameConfig} config
 * @param {GameEvent[]} events
 * @returns {GameState}
 */
function clearSector(state, config, events) {
  const rules = rulesOf(config);
  const space = /** @type {NovaState} */ (state.nova);
  const bonus = rules.sectorBonus * (space.sector + 1);
  const last = space.sector + 1 >= rules.sectors.length;
  const points = space.points + bonus;

  events.push({ type: 'sector-clear', sector: space.sector, bonus, last });

  if (last) {
    return { ...state, nova: { ...space, points, shots: [], fire: [], loot: [] } };
  }

  return {
    ...state,
    nova: sectorState(config, space.sector + 1, {
      points,
      shield: space.shield,
      chain: space.chain,
      nextId: space.nextId,
      rapid: space.rapid,
      triple: space.triple,
    }),
  };
}

/**
 * @param {NovaState} space
 * @returns {Enemy | null} the boss, while it is in space
 */
export function bossOf(space) {
  return space.enemies.find((enemy) => enemy.kind === 'boss') ?? null;
}
