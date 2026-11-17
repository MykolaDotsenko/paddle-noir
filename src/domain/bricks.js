import { clamp, findBoxContact } from './physics.js';
import { NO_EXTRA_BALLS, NO_MODIFIERS, paddleWidth, splitBall } from './power-ups.js';
import { nextRandom } from './random.js';
import { chargeMeter, CURVE_SPIN, EDGE_OFFSET, isLoaded } from './supers.js';

/**
 * The Bricks game: the player's paddle and ball against a wall of bricks instead of an
 * opponent. This module is the wall and all that goes with it: how a level is built, how a
 * ball flies through it, what breaks and what a break sets off, the bonuses that fall, the
 * laser, the safety net and what a super does to bricks. `game.js` runs the match around it.
 *
 * @import {
 *   Ball,
 *   Bolt,
 *   BreakCause,
 *   Brick,
 *   BrickKind,
 *   BricksConfig,
 *   BricksState,
 *   Drop,
 *   DropKind,
 *   ExtraBall,
 *   GameConfig,
 *   GameEvent,
 *   GameState,
 *   SuperKind,
 * } from './types.js'
 *
 * @typedef {{ x: number, y: number }} Point
 * @typedef {{ vx: number, vy: number }} Impulse what struck a brick, which its pieces fly from
 *
 * @typedef {object} Session one step's changes to the wall, gathered before they become a state
 * @property {GameState} state
 * @property {BricksState & { bricks: Brick[], drops: Drop[], bolts: Bolt[] }} wall
 * @property {number} seed
 * @property {number} broken bricks broken in the step
 */

/** @type {Readonly<Record<string, BrickKind>>} */
const LAYOUT_KINDS = Object.freeze({ o: 'plain', O: 'tough', '#': 'steel', '*': 'bomb' });

/** What falls from a broken brick, and how often, in shares of a hundred. */
/** @type {readonly (readonly [DropKind, number])[]} */
export const DROP_SHARES = Object.freeze([['wide', 26], ['multi', 22], ['laser', 20], ['shield', 16], ['slow', 10], ['life', 6]]);

/** Damage nothing survives: a blast, or a super. */
const LETHAL = Infinity;
/** Bricks a ball can meet in one step; past this it flies on, to be met again the next step. */
const MAX_CONTACTS = 6;
// A ball keeps this share of its spin through a bounce, as off a wall; off a brick's side the
// spin turns over.
const SPIN_RETENTION = 0.6;
// Thunder and a zigzag fly at least this share of the ball's top speed.
const STRIKE_SPEED_SHARE = 0.85;
// A phantom's two copies part from the ball by this much, in radians, one to each side.
const PHANTOM_FAN = 0.5;
// A stalled ball is turned by between these angles, in radians, either way.
const NUDGE_MIN = 0.15;
const NUDGE_RANGE = 0.3;
// How hard a blast throws the pieces of what it breaks.
const BLAST_PUSH = 420;
// Points a brick is worth, in bricks' worth: a tough or a steel one is worth more.
/** @type {Readonly<Record<BrickKind, number>>} */
const WORTH = Object.freeze({ plain: 1, tough: 2, bomb: 1, steel: 3 });

/**
 * @param {GameState} state
 * @returns {BricksState}
 */
function wallOf(state) {
  return /** @type {BricksState} */ (state.bricks);
}

/**
 * @param {GameConfig} config
 * @returns {BricksConfig}
 */
function rulesOf(config) {
  return /** @type {BricksConfig} */ (config.bricks);
}

/**
 * @param {Ball} ball
 * @param {number} speed
 * @returns {Ball}
 */
function withSpeed(ball, speed) {
  const current = Math.hypot(ball.vx, ball.vy);
  return current > 0 ? { ...ball, vx: (ball.vx / current) * speed, vy: (ball.vy / current) * speed } : ball;
}

/**
 * A ball leaving a brick never leans further from straight up or down than `maxLean`, so it
 * cannot settle into flying side to side between the walls. A ball flying level goes up.
 *
 * @param {Ball} ball
 * @param {GameConfig} config
 * @returns {Ball}
 */
function steady(ball, config) {
  const speed = Math.hypot(ball.vx, ball.vy);
  const least = speed * Math.cos(rulesOf(config).maxLean);

  if (Math.abs(ball.vy) >= least) {
    return ball;
  }

  return {
    ...ball,
    vx: (ball.vx < 0 ? -1 : 1) * speed * Math.sin(rulesOf(config).maxLean),
    vy: (ball.vy > 0 ? 1 : -1) * least,
  };
}

/**
 * @param {Ball} ball
 * @param {number} angle radians, counter-clockwise on the board
 * @returns {Ball}
 */
function turned(ball, angle) {
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  return { ...ball, vx: ball.vx * cos - ball.vy * sin, vy: ball.vx * sin + ball.vy * cos };
}

/**
 * The bricks of a level, laid out from its drawing.
 *
 * @param {GameConfig} config
 * @param {number} level
 * @returns {Brick[]}
 */
export function buildLevel(config, level) {
  const { levels, columns, top, margin, gap, rowHeight, toughHits } = rulesOf(config);
  const width = (config.width - 2 * margin - (columns - 1) * gap) / columns;
  /** @type {Brick[]} */
  const bricks = [];

  levels[level].rows.forEach((row, rowIndex) => {
    for (let column = 0; column < columns; column += 1) {
      const kind = LAYOUT_KINDS[row[column]];

      if (kind) {
        bricks.push({
          id: rowIndex * columns + column + 1,
          row: rowIndex,
          x: margin + column * (width + gap),
          y: top + rowIndex * (rowHeight + gap),
          w: width,
          h: rowHeight,
          kind,
          hp: kind === 'tough' ? toughHits : 1,
          fuse: 0,
        });
      }
    }
  });

  return bricks;
}

/**
 * A level as it starts: its wall whole and nothing in the air. The points carry over.
 *
 * @param {GameConfig} config
 * @param {number} level
 * @param {number} [points]
 * @param {number} [shield]
 * @returns {BricksState}
 */
export function levelState(config, level, points = 0, shield = 0) {
  return {
    level,
    bricks: buildLevel(config, level),
    time: 0,
    drift: 0,
    drops: [],
    bolts: [],
    laser: 0,
    laserIn: 0,
    shield,
    combo: 0,
    points,
    pierce: 0,
    idle: 0,
    quiet: 0,
    nextId: 1000,
  };
}

/**
 * @param {GameConfig} config
 * @returns {BricksState | null} the first level's wall, or null in any other game
 */
export function initialBricksState(config) {
  return config.bricks ? levelState(config, 0) : null;
}

/**
 * The ball as it waits to be served: under the wall, and it will come down to the paddle, a
 * little to one side and then the other. Each level serves a little faster than the last.
 *
 * @param {GameConfig} config
 * @param {number} level
 * @param {number} serveNumber
 * @returns {Ball}
 */
export function brickServeBall(config, level, serveNumber) {
  const speed = config.ball.initialSpeed * (1 + level * rulesOf(config).speedPerLevel);
  const vx = speed * 0.34 * (serveNumber % 2 === 0 ? 1 : -1);

  return { x: config.width / 2, y: rulesOf(config).serveY, vx, vy: Math.sqrt(speed ** 2 - vx ** 2), spin: 0 };
}

/**
 * @param {BricksState} wall
 * @returns {boolean} whether every brick that can be broken by play is gone
 */
export function levelCleared(wall) {
  return !wall.bricks.some((brick) => brick.kind !== 'steel');
}

/**
 * @param {GameState} state
 * @returns {Session}
 */
function begin(state) {
  const wall = wallOf(state);
  return { state, wall: { ...wall, bricks: [...wall.bricks], drops: [...wall.drops], bolts: [...wall.bolts] }, seed: state.seed, broken: 0 };
}

/**
 * The state a session leaves. Every brick broken charges the player's super meter a little.
 *
 * @param {Session} session
 * @param {GameConfig} config
 * @param {GameEvent[]} events
 * @returns {GameState}
 */
function commit(session, config, events) {
  const next = { ...session.state, seed: session.seed, bricks: session.wall };

  return config.supers.enabled && session.broken > 0
    ? chargeMeter(next, 'player', session.broken * rulesOf(config).chargePerBrick, events)
    : next;
}

/**
 * @param {Brick} brick
 * @param {number} drift
 * @returns {Point}
 */
function centerOf(brick, drift) {
  return { x: brick.x + drift + brick.w / 2, y: brick.y + brick.h / 2 };
}

/**
 * Now and then a broken brick lets a bonus fall.
 *
 * @param {Session} session
 * @param {Point} from
 * @param {GameConfig} config
 * @param {GameEvent[]} events
 */
function letFall(session, from, config, events) {
  const { dropChance, maxDrops } = rulesOf(config);

  if (session.wall.drops.length >= maxDrops) {
    return;
  }

  const chance = nextRandom(session.seed);
  session.seed = chance.seed;

  if (chance.value >= dropChance) {
    return;
  }

  const pick = nextRandom(session.seed);
  session.seed = pick.seed;
  let share = pick.value * 100;
  const [kind] = DROP_SHARES.find(([, weight]) => (share -= weight) < 0) ?? DROP_SHARES[0];

  session.wall.drops.push({ id: session.wall.nextId, kind, x: from.x, y: from.y, vy: 0 });
  session.wall.nextId += 1;
  events.push({ type: 'drop-spawn', kind, x: from.x, y: from.y });
}

/**
 * A bomb going off: every brick near it breaks, steel too, and its pieces fly outward; a bomb
 * near it is lit, to go off a moment later, so a row of bombs goes up one after another.
 *
 * @param {Session} session
 * @param {Point} center
 * @param {GameConfig} config
 * @param {GameEvent[]} events
 */
function blast(session, center, config, events) {
  const { blastRadius, fuseSeconds } = rulesOf(config);
  events.push({ type: 'blast', x: center.x, y: center.y, radius: blastRadius });

  for (const other of [...session.wall.bricks]) {
    const at = centerOf(other, session.wall.drift);
    const distance = Math.hypot(at.x - center.x, at.y - center.y);

    if (distance > blastRadius) {
      continue;
    }

    if (other.kind === 'bomb') {
      const index = session.wall.bricks.indexOf(other);
      session.wall.bricks[index] = other.fuse > 0 ? other : { ...other, fuse: fuseSeconds };
    } else {
      const away = distance > 0 ? BLAST_PUSH / distance : 0;
      strike(session, other, LETHAL, 'blast', { vx: (at.x - center.x) * away, vy: (at.y - center.y) * away }, config, events);
    }
  }
}

/**
 * Something hits a brick. Steel shrugs off all but a blast or a super; a tough brick takes the
 * hit and stands; anything else breaks, which counts toward the combo, scores, may let a bonus
 * fall and, for a bomb, blasts its neighbors.
 *
 * @param {Session} session
 * @param {Brick} brick
 * @param {number} power
 * @param {BreakCause} by
 * @param {Impulse} impulse
 * @param {GameConfig} config
 * @param {GameEvent[]} events
 */
function strike(session, brick, power, by, impulse, config, events) {
  const { wall } = session;
  const index = wall.bricks.findIndex((candidate) => candidate.id === brick.id);

  if (index < 0) {
    return;
  }

  const { kind, row, w, h } = brick;
  const center = centerOf(brick, wall.drift);
  const stands = power !== LETHAL && (kind === 'steel' || wall.bricks[index].hp > power);

  if (stands) {
    const hp = kind === 'steel' ? brick.hp : wall.bricks[index].hp - power;
    wall.bricks[index] = { ...wall.bricks[index], hp };
    wall.idle += kind === 'steel' ? 1 : 0;
    // A tough brick worn down is progress; steel that rang is not.
    wall.quiet = kind === 'steel' ? wall.quiet : 0;
    events.push({ type: 'brick-hit', kind, row, x: center.x, y: center.y, hp });
    return;
  }

  const rules = rulesOf(config);
  wall.bricks.splice(index, 1);
  wall.combo += 1;
  wall.idle = 0;
  wall.quiet = 0;
  session.broken += 1;

  const points = rules.pointsPerBrick * WORTH[kind] * Math.min(wall.combo, rules.maxCombo);
  wall.points += points;
  events.push({ type: 'brick-break', kind, row, x: center.x, y: center.y, w, h, by, vx: impulse.vx, vy: impulse.vy, combo: wall.combo, points });
  letFall(session, center, config, events);

  if (kind === 'bomb') {
    blast(session, center, config, events);
  }
}

/**
 * The brick a ball flying from one point to another meets first, if any.
 *
 * @param {BricksState} wall
 * @param {Point} from
 * @param {Point} to
 * @param {number} radius
 */
function firstBrick(wall, from, to, radius) {
  const reach = {
    left: Math.min(from.x, to.x) - radius,
    right: Math.max(from.x, to.x) + radius,
    top: Math.min(from.y, to.y) - radius,
    bottom: Math.max(from.y, to.y) + radius,
  };
  let first = null;

  for (const brick of wall.bricks) {
    const left = brick.x + wall.drift;

    if (reach.left > left + brick.w || reach.right < left || reach.top > brick.y + brick.h || reach.bottom < brick.y) {
      continue;
    }

    const contact = findBoxContact(from, to, { left, right: left + brick.w, top: brick.y, bottom: brick.y + brick.h }, radius);

    if (contact && (first === null || contact.time < first.contact.time)) {
      first = { brick, contact };
    }
  }

  return first;
}

/**
 * Thunder takes the column it lands in, top to bottom; a zigzag takes the row.
 *
 * @param {Session} session
 * @param {SuperKind} kind
 * @param {Brick} brick the brick the ball met
 * @param {Point} at where the ball met it
 * @param {Impulse} impulse
 * @param {GameConfig} config
 * @param {GameEvent[]} events
 */
function strikeLine(session, kind, brick, at, impulse, config, events) {
  const { wall } = session;
  const reach = rulesOf(config).strikeWidth;
  const column = kind === 'thunder';

  events.push({ type: 'strike', kind, x: at.x, y: column ? at.y : brick.y + brick.h / 2 });

  for (const other of [...wall.bricks]) {
    const left = other.x + wall.drift;
    const caught = column ? left <= at.x + reach && left + other.w >= at.x - reach : other.row === brick.row;

    if (caught) {
      strike(session, other, LETHAL, 'super', impulse, config, events);
    }
  }
}

/**
 * Carries a ball through the wall for one step: it bounces off what it meets, face or corner,
 * and what it meets takes the hit. A fireball goes through bricks instead, breaking each, for
 * as many as it has left; thunder and a zigzag spend themselves on the first brick they meet,
 * and take its column or its row. A super that is spent flies on at the rally's own pace.
 *
 * @param {GameState} state
 * @param {Point} from where the ball began the step
 * @param {Ball} ball where it ends the step if it meets nothing
 * @param {GameConfig} config
 * @param {GameEvent[]} events
 * @param {boolean} main whether this is the ball, which alone carries a super
 * @returns {{ state: GameState, ball: Ball, from: Point }} `from` is where the ball last
 *   changed course in the step, or where it began
 */
export function flyThroughBricks(state, from, ball, config, events, main) {
  const { radius } = config.ball;
  /** @type {Session | null} */
  let session = null;
  let shot = main ? state.superShot : null;
  let origin = from;
  let flying = ball;

  for (let contacts = 0; contacts < MAX_CONTACTS; contacts += 1) {
    const met = firstBrick(session ? session.wall : wallOf(state), origin, flying, radius);

    if (!met) {
      break;
    }

    session ??= begin(state);
    const { brick, contact } = met;
    const impulse = { vx: flying.vx, vy: flying.vy };

    if (shot && shot.kind === 'fireball' && session.wall.pierce > 0) {
      // Through it, on the same line.
      strike(session, brick, LETHAL, 'super', impulse, config, events);
      session.wall.pierce -= 1;
      continue;
    }

    if (shot && shot.kind !== 'fireball') {
      strikeLine(session, shot.kind, brick, contact, impulse, config, events);
    } else {
      strike(session, brick, 1, 'ball', impulse, config, events);
    }

    if (shot) {
      // Spent: a fireball out of bricks to pass through, or a strike that has landed.
      flying = withSpeed(flying, shot.speed);
      shot = null;
    }

    // The rest of the step is flown from the touch, on the reflected course.
    const rest = 1 - contact.time;
    let restX = (flying.x - origin.x) * rest;
    let restY = (flying.y - origin.y) * rest;
    let { vx, vy } = flying;

    if (contact.approaching) {
      const into = vx * contact.normalX + vy * contact.normalY;
      const along = restX * contact.normalX + restY * contact.normalY;
      vx -= 2 * into * contact.normalX;
      vy -= 2 * into * contact.normalY;
      restX -= 2 * along * contact.normalX;
      restY -= 2 * along * contact.normalY;
    }

    const sideways = Math.abs(contact.normalX) > Math.abs(contact.normalY);
    origin = { x: contact.x, y: contact.y };
    flying = steady({
      ...flying,
      x: contact.x + restX,
      y: contact.y + restY,
      vx,
      vy,
      spin: flying.spin * (sideways ? -SPIN_RETENTION : SPIN_RETENTION),
    }, config);
  }

  if (!session) {
    return { state, ball, from };
  }

  const next = commit(session, config, events);
  return { state: main && shot !== state.superShot ? { ...next, superShot: shot } : next, ball: flying, from: origin };
}

/**
 * The court's top wall, which in this game returns the ball. A super ends against it: nothing
 * above is left to break.
 *
 * @param {GameState} state
 * @param {Ball} ball
 * @param {GameConfig} config
 * @param {GameEvent[]} events
 * @param {boolean} main
 * @returns {{ state: GameState, ball: Ball }}
 */
export function bounceOffCeiling(state, ball, config, events, main) {
  const { radius } = config.ball;

  if (ball.y - radius >= 0 || ball.vy >= 0) {
    return { state, ball };
  }

  const shot = main ? state.superShot : null;
  const bounced = { ...ball, y: radius, vy: -ball.vy, spin: ball.spin * SPIN_RETENTION };
  events.push({ type: 'wall-bounce', x: bounced.x, y: bounced.y, speed: Math.hypot(bounced.vx, bounced.vy) });

  return shot
    ? { state: { ...state, superShot: null, bricks: { ...wallOf(state), pierce: 0 } }, ball: withSpeed(bounced, shot.speed) }
    : { state, ball: bounced };
}

/**
 * The safety net under the paddle: a ball that gets past the paddle bounces off it, once for
 * each save the net has.
 *
 * @param {GameState} state
 * @param {Ball} ball
 * @param {GameConfig} config
 * @param {GameEvent[]} events
 * @returns {{ state: GameState, ball: Ball }}
 */
export function bounceOffNet(state, ball, config, events) {
  const wall = wallOf(state);
  const floor = netLine(config) - config.ball.radius;

  if (wall.shield <= 0 || ball.vy <= 0 || ball.y < floor) {
    return { state, ball };
  }

  events.push({ type: 'shield-save', x: ball.x, y: floor });
  return { state: { ...state, bricks: { ...wall, shield: wall.shield - 1 } }, ball: { ...ball, y: floor, vy: -ball.vy } };
}

/**
 * Where the safety net is strung, below the paddle.
 *
 * @param {GameConfig} config
 */
export function netLine(config) {
  return config.height - config.paddle.inset / 4;
}

/**
 * A ball that has bounced off walls and steel too long without breaking anything is turned a
 * little off its course, so that it cannot circle forever between them.
 *
 * @param {GameState} state
 * @param {Ball} ball
 * @param {number} bounces wall bounces the ball made this step
 * @param {GameConfig} config
 * @returns {{ state: GameState, ball: Ball }}
 */
export function unstall(state, ball, bounces, config) {
  const wall = wallOf(state);
  const idle = wall.idle + bounces;

  if (idle < rulesOf(config).stallBounces) {
    return { state: bounces > 0 ? { ...state, bricks: { ...wall, idle } } : state, ball };
  }

  const roll = nextRandom(state.seed);
  const angle = (NUDGE_MIN + Math.abs(roll.value - 0.5) * NUDGE_RANGE) * (roll.value < 0.5 ? -1 : 1);

  return { state: { ...state, seed: roll.seed, bricks: { ...wall, idle: 0 } }, ball: steady(turned(ball, angle), config) };
}

/**
 * @param {Ball} ball
 * @param {number} id
 * @param {GameConfig} config
 * @returns {ExtraBall}
 */
function asExtra(ball, id, config) {
  return { ...ball, id, ttl: config.powerUps.duration };
}

/**
 * The ball and every other ball in play, in one list; the first is the ball.
 *
 * @param {GameState} state
 * @returns {Ball[]}
 */
export function ballsInPlay(state) {
  return [state.ball, ...state.extraBalls];
}

/**
 * Puts the balls still in play back into a state: the first is the ball, the rest fly beside it.
 *
 * @param {GameState} state
 * @param {readonly Ball[]} balls at least one
 * @param {GameConfig} config
 * @returns {GameState}
 */
export function withBalls(state, balls, config) {
  const wall = wallOf(state);
  const [first, ...rest] = balls;
  const { x, y, vx, vy, spin } = first;
  let { nextId } = wall;
  const extraBalls = rest.map((ball) => ('id' in ball ? /** @type {ExtraBall} */ (ball) : asExtra(ball, nextId++, config)));

  return {
    ...state,
    ball: { x, y, vx, vy, spin },
    extraBalls: extraBalls.length > 0 ? extraBalls : NO_EXTRA_BALLS,
    bricks: nextId === wall.nextId ? wall : { ...wall, nextId },
  };
}

/**
 * What a caught bonus does: Wide enlarges the paddle; Multi splits a ball off every ball in
 * play, up to the most the game allows; Laser arms the paddle; Shield strings the safety net;
 * Slow takes the pace off every ball, though never below a serve's; Life adds one.
 *
 * @param {GameState} state
 * @param {Drop} drop
 * @param {GameConfig} config
 * @param {GameEvent[]} events
 * @returns {GameState}
 */
function applyDrop(state, drop, config, events) {
  const rules = rulesOf(config);
  const wall = wallOf(state);
  events.push({ type: 'drop', kind: drop.kind, x: drop.x, y: drop.y });

  switch (drop.kind) {
    case 'wide':
      return { ...state, modifiers: { ...state.modifiers, player: { ...state.modifiers.player, wide: rules.wideSeconds } } };
    case 'multi': {
      const balls = ballsInPlay(state);
      const room = Math.max(0, rules.maxBalls - balls.length);
      const split = balls.slice(0, room).map((ball, index) => splitBall(ball, wall.nextId + index, config));
      return withBalls({ ...state, bricks: { ...wall, nextId: wall.nextId + split.length } }, [...balls, ...split], config);
    }
    case 'laser':
      return { ...state, bricks: { ...wall, laser: rules.laserSeconds, laserIn: 0 } };
    case 'shield':
      return { ...state, bricks: { ...wall, shield: 1 } };
    case 'slow': {
      /** @param {Ball} ball */
      const slowed = (ball) => withSpeed(ball, Math.max(config.ball.initialSpeed, Math.hypot(ball.vx, ball.vy) * rules.slowScale));
      return { ...state, ball: slowed(state.ball), extraBalls: state.extraBalls.map((extra) => ({ ...extra, ...slowed(extra) })) };
    }
    case 'life':
    default:
      return { ...state, lives: Math.min(state.lives + 1, rules.maxLives) };
  }
}

/**
 * Runs the wall for one step, apart from the balls: a drifting formation sways, lit bombs burn
 * down and go off, bonuses fall and are caught by the paddle or lost, and an armed paddle fires
 * its laser, whose bolts fly up and hit the first brick above them.
 *
 * @param {GameState} state
 * @param {number} deltaSeconds
 * @param {GameConfig} config
 * @param {GameEvent[]} events
 * @returns {GameState}
 */
export function tickBricks(state, deltaSeconds, config, events) {
  const rules = rulesOf(config);
  const before = wallOf(state);
  const { drift: sway } = rules.levels[before.level];
  const time = before.time + deltaSeconds;
  const drift = sway ? sway.span * Math.sin((2 * Math.PI * time) / sway.period) : 0;
  // The ball waiting to be served is not play.
  const quiet = state.serveCountdown > 0 ? 0 : before.quiet + deltaSeconds;
  const mercy = quiet >= rules.mercyAfter;

  if (!mercy && before.drops.length === 0 && before.bolts.length === 0 && before.laser === 0 && !before.bricks.some((brick) => brick.fuse > 0)) {
    return { ...state, bricks: { ...before, time, drift, quiet } };
  }

  const session = begin(state);
  const { wall } = session;
  wall.time = time;
  wall.drift = drift;
  wall.quiet = quiet;

  if (mercy) {
    // Nothing has broken for so long that the brick nearest the ball gives way by itself.
    const nearest = wall.bricks
      .filter((brick) => brick.kind !== 'steel')
      .map((brick) => ({ brick, at: centerOf(brick, drift) }))
      .sort((a, b) => Math.hypot(a.at.x - state.ball.x, a.at.y - state.ball.y) - Math.hypot(b.at.x - state.ball.x, b.at.y - state.ball.y))[0];

    wall.quiet = 0;

    if (nearest) {
      strike(session, nearest.brick, LETHAL, 'blast', { vx: 0, vy: 0 }, config, events);
    }
  }

  // Lit bombs burn down, and go off.
  for (const brick of [...wall.bricks]) {
    if (brick.fuse > 0) {
      const fuse = brick.fuse - deltaSeconds;

      if (fuse > 0) {
        wall.bricks[wall.bricks.indexOf(brick)] = { ...brick, fuse };
      } else {
        strike(session, brick, LETHAL, 'blast', { vx: 0, vy: 0 }, config, events);
      }
    }
  }

  // The laser fires from both ends of the paddle.
  const paddleTop = config.height - config.paddle.inset - config.paddle.height;
  const width = paddleWidth(state, 'player', config);

  if (wall.laser > 0) {
    wall.laser = Math.max(0, wall.laser - deltaSeconds);
    wall.laserIn -= deltaSeconds;

    if (wall.laserIn <= 0) {
      wall.laserIn += rules.laserEvery;

      for (const side of [-1, 1]) {
        const x = state.player.x + side * width * 0.36;
        wall.bolts.push({ id: wall.nextId, x, y: paddleTop });
        wall.nextId += 1;
        events.push({ type: 'bolt-fire', x, y: paddleTop });
      }
    }
  }

  // Bolts fly up, and stop at the first brick above them.
  const flown = wall.bolts;
  wall.bolts = [];

  for (const bolt of flown) {
    const y = bolt.y - rules.boltSpeed * deltaSeconds;
    /** @type {Brick | null} */
    let hit = null;

    for (const brick of wall.bricks) {
      const left = brick.x + wall.drift;

      if (bolt.x >= left && bolt.x <= left + brick.w && brick.y <= bolt.y && brick.y + brick.h >= y && (hit === null || brick.y > hit.y)) {
        hit = brick;
      }
    }

    if (hit) {
      strike(session, hit, 1, 'bolt', { vx: 0, vy: -rules.boltSpeed * 0.3 }, config, events);
    } else if (y > 0) {
      wall.bolts.push({ ...bolt, y });
    }
  }

  // Bonuses fall, and the paddle catches what lands on it.
  const reach = width / 2 + rules.dropRadius;
  const falling = wall.drops;
  /** @type {Drop[]} */
  const caught = [];
  wall.drops = [];

  for (const drop of falling) {
    const vy = Math.min(drop.vy + rules.dropGravity * deltaSeconds, rules.dropMaxSpeed);
    const y = drop.y + vy * deltaSeconds;
    const level = y + rules.dropRadius >= paddleTop && y - rules.dropRadius <= paddleTop + config.paddle.height;

    if (level && Math.abs(drop.x - state.player.x) <= reach) {
      caught.push({ ...drop, y });
    } else if (y - rules.dropRadius <= config.height) {
      wall.drops.push({ ...drop, y, vy });
    }
  }

  return caught.reduce((next, drop) => applyDrop(next, drop, config, events), commit(session, config, events));
}

/**
 * A return sent straight at the nearest brick that play can break and that a straight shot
 * reaches, with no steel in the way, as far as the paddle's steepest angle allows. This is the
 * help a player gets when nothing has broken for a while. With no such brick in reach, the
 * return goes as it was struck.
 *
 * @param {Ball} ball the ball as it leaves the paddle
 * @param {BricksState} wall
 * @param {GameConfig} config
 * @returns {Ball}
 */
function aimedAtWall(ball, wall, config) {
  const limit = config.ball.maxBounceAngleRadians;
  const speed = Math.hypot(ball.vx, ball.vy);
  const { drift: sway } = rulesOf(config).levels[wall.level];
  const targets = wall.bricks
    .filter((brick) => brick.kind !== 'steel')
    .map((brick) => centerOf(brick, wall.drift))
    .sort((a, b) => Math.hypot(a.x - ball.x, a.y - ball.y) - Math.hypot(b.x - ball.x, b.y - ball.y));

  for (const target of targets) {
    const angle = Math.atan2(target.x - ball.x, ball.y - target.y);
    const met = Math.abs(angle) <= limit ? firstBrick(wall, ball, target, config.ball.radius) : null;

    if (met && met.brick.kind !== 'steel') {
      // A formation that sways will have moved on by the time the ball arrives: aim where the
      // brick will be then.
      const flight = Math.hypot(target.x - ball.x, target.y - ball.y) / speed;
      const lead = sway ? sway.span * Math.sin((2 * Math.PI * (wall.time + flight)) / sway.period) - wall.drift : 0;
      const led = clamp(Math.atan2(target.x + lead - ball.x, ball.y - target.y), -limit, limit);

      return { ...ball, vx: Math.sin(led) * speed, vy: -Math.cos(led) * speed, spin: 0 };
    }
  }

  return ball;
}

/**
 * The paddle returns a ball. The combo ends; the return counts as in a rally; and with supers
 * on it charges the meter, or, with the meter full and a flick of the paddle, fires the super:
 * a fireball that goes through bricks, thunder or a zigzag that will take a column or a row,
 * or a phantom, which splits the ball in three.
 *
 * @param {GameState} state
 * @param {Ball} ball the ball as it leaves the paddle
 * @param {number} offset how far from the paddle's center it was struck, from -1 to 1
 * @param {GameConfig} config
 * @param {GameEvent[]} events
 * @param {boolean} main whether this is the ball, which alone carries a super
 * @returns {{ state: GameState, ball: Ball, split: Ball[] }} `split` holds the balls a phantom
 *   split off
 *
 * When nothing has broken for a while, the return is sent straight at the nearest brick.
 */
export function returnInBricks(state, ball, offset, config, events, main) {
  const rules = rulesOf(config);
  const flying = main ? state.superShot : null;
  const rally = state.rally + 1;
  // A super the wall never stopped comes back as a ball, at the rally's pace.
  const paced = flying ? withSpeed(ball, Math.min(flying.speed * config.ball.speedIncrease, config.ball.maxSpeed)) : ball;
  const leaving = wallOf(state).quiet >= rules.helpAfter ? aimedAtWall(paced, wallOf(state), config) : paced;
  const speed = Math.hypot(leaving.vx, leaving.vy);
  /** @type {GameState} */
  const next = {
    ...state,
    rally,
    longestRally: Math.max(state.longestRally, rally),
    hits: { ...state.hits, player: state.hits.player + 1 },
    superShot: main ? null : state.superShot,
    bricks: { ...wallOf(state), combo: 0, idle: 0, pierce: main ? 0 : wallOf(state).pierce },
  };
  /** @type {Extract<GameEvent, { type: 'paddle-hit' }>} */
  const hit = { type: 'paddle-hit', side: 'player', x: leaving.x, y: leaving.y, speed, spin: leaving.spin, offset, rally };
  const meter = next.meters.player;
  const fires = main && config.supers.enabled && isLoaded(meter) && Math.abs(state.player.vx) >= config.supers.flickSpeed;

  if (!fires) {
    events.push(hit);

    if (!config.supers.enabled) {
      return { state: next, ball: leaving, split: [] };
    }

    const { perHit, perSkill } = config.supers;
    const skill = (Math.abs(offset) >= EDGE_OFFSET ? perSkill : 0) + (Math.abs(leaving.spin) >= CURVE_SPIN ? perSkill : 0);
    return { state: chargeMeter(next, 'player', perHit + skill, events), ball: leaving, split: [] };
  }

  const kind = /** @type {SuperKind} */ (meter.kind);
  const fired = { ...next, meters: { ...next.meters, player: { charge: 0, kind } } };

  if (kind === 'phantom') {
    const room = Math.max(0, rules.maxBalls - 1 - state.extraBalls.length);
    const split = [PHANTOM_FAN, -PHANTOM_FAN].slice(0, room).map((angle) => steady(turned({ ...leaving, spin: 0 }, angle), config));
    events.push({ ...hit, super: kind });
    return { state: fired, ball: leaving, split };
  }

  const share = kind === 'fireball' ? 1 : STRIKE_SPEED_SHARE;
  const launched = withSpeed({ ...leaving, spin: 0 }, Math.max(speed, config.ball.maxSpeed * share));
  events.push({ ...hit, speed: Math.hypot(launched.vx, launched.vy), spin: 0, super: kind });

  return {
    state: {
      ...fired,
      superShot: { kind, side: 'player', speed },
      bricks: { ...wallOf(fired), pierce: kind === 'fireball' ? rules.pierce : 0 },
    },
    ball: launched,
    split: [],
  };
}

/**
 * The wall after a ball is lost: nothing falling, nothing fired, no laser, and the combo over.
 * The paddle's bonuses go with the ball.
 *
 * @param {GameState} state
 * @returns {GameState}
 */
export function afterMiss(state) {
  const wall = wallOf(state);

  return {
    ...state,
    modifiers: { ...state.modifiers, player: NO_MODIFIERS },
    bricks: { ...wall, drops: [], bolts: [], laser: 0, laserIn: 0, combo: 0, pierce: 0, idle: 0, quiet: 0 },
  };
}
