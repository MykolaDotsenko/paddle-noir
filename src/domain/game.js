import {
  bounceFromPaddle,
  clamp,
  clampPaddleCenter,
  contactOffset,
  curveBall,
  findPaddleContact,
  glanceOffPaddle,
  movePaddle,
  reflectFromSideWalls,
} from './physics.js';
import {
  afterMiss,
  ballsInPlay,
  bounceOffCeiling,
  bounceOffNet,
  brickServeBall,
  flyThroughBricks,
  initialBricksState,
  levelCleared,
  levelState,
  returnInBricks,
  tickBricks,
  unstall,
  withBalls,
} from './bricks.js';
import { bossPhase, initialHazardState, NO_HAZARDS, tickHazards } from './hazards.js';
import { advanceNova, initialNovaState } from './nova.js';
import { advanceWarp, initialWarpState } from './warp.js';
import { moveOpponent } from './opponent.js';
import { collectPowerUps, initialPowerUpState, NO_EXTRA_BALLS, otherSide, paddleWidth, tickEffects, tickPowerUps } from './power-ups.js';
import { chargeMeter, initialSuperState, returnCharge, scoringSuper, steerSuper, strikeBack } from './supers.js';

/**
 * @import { Ball, BricksConfig, BricksState, ExtraBall, GameConfig, GameEvent, GameState, InputSnapshot, NovaState, Side, SuperKind, WarpState } from './types.js'
 * @import { PaddleContact } from './physics.js'
 *
 * @typedef {object} Collision what a ball met during one step
 * @property {GameState} state the state, with any paddle the ball stopped
 * @property {Ball} ball where the ball ends the step
 * @property {{ side: Side, offset: number } | null} hit the paddle that returned it, and how
 *   far from that paddle's center it struck, from -1 to 1
 */

export const GAME_PHASE = Object.freeze({
  READY: 'ready',
  RUNNING: 'running',
  PAUSED: 'paused',
  GAME_OVER: 'game-over',
});

/** Shared by every transition that produced no events, so quiet steps allocate nothing. */
export const NO_EVENTS = Object.freeze(/** @type {GameEvent[]} */ ([]));

/**
 * @param {GameConfig} config
 * @param {1 | -1} [verticalDirection]
 * @param {1 | -1} [horizontalDirection]
 * @returns {Ball}
 */
function createServeBall(config, verticalDirection = 1, horizontalDirection = 1) {
  const speed = config.ball.initialSpeed;
  const horizontalSpeed = speed * 0.34 * horizontalDirection;
  const verticalSpeed = Math.sqrt(speed ** 2 - horizontalSpeed ** 2) * verticalDirection;

  return {
    x: config.width / 2,
    y: config.height / 2,
    vx: horizontalSpeed,
    vy: verticalSpeed,
    spin: 0,
  };
}

/**
 * @param {GameConfig} config
 * @param {number} [seed] for the deterministic random source; the same seed replays the same match
 * @returns {GameState}
 */
export function createInitialState(config, seed = 1) {
  const powerUps = initialPowerUpState(seed, config);

  return {
    phase: GAME_PHASE.READY,
    player: { x: config.width / 2, vx: 0 },
    opponent: { x: config.width / 2, vx: 0 },
    // In Nova and Warp there is no ball: it waits, still, at the center, where the countdown is drawn.
    ball: config.bricks ? brickServeBall(config, 0, 0) : config.nova || config.warp ? { x: config.width / 2, y: config.height / 2, vx: 0, vy: 0, spin: 0 } : createServeBall(config, 1, 1),
    score: { player: 0, opponent: 0 },
    hits: { player: 0, opponent: 0 },
    lives: config.rules.kind === 'match' ? 0 : config.rules.lives,
    lastPoint: null,
    serveNumber: 0,
    serveCountdown: config.startDelaySeconds,
    rally: 0,
    longestRally: 0,
    ...powerUps,
    ...initialHazardState(powerUps.seed, config),
    ...initialSuperState(),
    bricks: initialBricksState(config),
    nova: initialNovaState(config),
    warp: initialWarpState(config),
    events: NO_EVENTS,
  };
}

/**
 * Resumes a paused match, or starts a fresh one from any idle state.
 *
 * @param {GameState} state
 * @param {GameConfig} config
 * @returns {GameState}
 */
export function startGame(state, config) {
  if (state.phase === GAME_PHASE.PAUSED) {
    return { ...state, phase: GAME_PHASE.RUNNING, events: [{ type: 'resumed' }] };
  }

  if (state.phase === GAME_PHASE.RUNNING) {
    return state;
  }

  return {
    ...createInitialState(config, state.seed),
    phase: GAME_PHASE.RUNNING,
    events: [{ type: 'match-start' }],
  };
}

/**
 * Back to the menu.
 *
 * @param {GameConfig} config
 * @param {number} [seed] for the next match
 * @returns {GameState}
 */
export function resetGame(config, seed = 1) {
  return { ...createInitialState(config, seed), events: [{ type: 'menu' }] };
}

/**
 * Pauses a running match and leaves every other phase untouched, so it is safe to
 * request repeatedly, for example whenever the page loses focus.
 *
 * @param {GameState} state
 * @returns {GameState}
 */
export function pauseGame(state) {
  if (state.phase === GAME_PHASE.RUNNING) {
    return { ...state, phase: GAME_PHASE.PAUSED, events: [{ type: 'paused' }] };
  }

  return state;
}

/**
 * @param {GameState} state
 * @returns {GameState}
 */
export function togglePause(state) {
  if (state.phase === GAME_PHASE.PAUSED) {
    return { ...state, phase: GAME_PHASE.RUNNING, events: [{ type: 'resumed' }] };
  }

  return pauseGame(state);
}

/**
 * @param {GameState} state
 * @returns {Side | null} the match winner, or null while the match is not over
 */
export function getWinner(state) {
  if (state.phase !== GAME_PHASE.GAME_OVER) {
    return null;
  }

  // A Bricks, Nova or Warp game is not won on points: the player wins by clearing the last
  // wall, or the last sector, or by going through the last race.
  if (state.bricks || state.nova || state.warp) {
    return state.lastPoint;
  }

  return state.score.player > state.score.opponent ? 'player' : 'opponent';
}

/**
 * The side at match point: one point from winning. Null when nobody is, or in Rush.
 *
 * @param {GameState} state
 * @param {GameConfig} config
 * @returns {Side | null}
 */
export function matchPointSide(state, config) {
  if (config.rules.kind !== 'match' || state.phase === GAME_PHASE.GAME_OVER) {
    return null;
  }

  const target = config.rules.winningScore - 1;

  if (state.score.player >= target) {
    return 'player';
  }

  return state.score.opponent >= target ? 'opponent' : null;
}

/**
 * Moves a paddle toward a pointer, or along an axis at keyboard speed, and records how fast
 * it moved, which a hit turns into spin.
 *
 * @param {GameState} state
 * @param {Side} side
 * @param {number | null} pointerX
 * @param {number} axis
 * @param {number} deltaSeconds
 * @param {GameConfig} config
 * @returns {GameState}
 */
function steerPaddle(state, side, pointerX, axis, deltaSeconds, config) {
  const paddle = state[side];
  let target = paddle.x;

  if (Number.isFinite(pointerX)) {
    target = /** @type {number} */ (pointerX);
  } else if (axis) {
    target = paddle.x + axis * config.paddle.keyboardSpeed * deltaSeconds;
  }

  const x = clampPaddleCenter(target, config, paddleWidth(state, side, config));

  return { ...state, [side]: movePaddle(paddle, x, deltaSeconds, config) };
}

/**
 * @param {GameState} state
 * @param {Side} scorer
 * @param {GameConfig} config
 */
function nextServeBall(state, scorer, config) {
  const serveNumber = state.serveNumber + 1;
  const horizontalDirection = serveNumber % 2 === 0 ? 1 : -1;
  const verticalDirection = scorer === 'player' ? 1 : -1;

  return {
    ball: createServeBall(config, verticalDirection, horizontalDirection),
    serveNumber,
  };
}

/**
 * @param {GameState} state
 * @param {GameEvent[]} events
 * @returns {GameState}
 */
function withEvents(state, events) {
  return { ...state, events: events.length > 0 ? events : NO_EVENTS };
}

/**
 * @param {SuperKind | null} superKind
 * @returns {{ super?: SuperKind }} the tag an event carries for a super, or nothing
 */
function superTag(superKind) {
  return superKind ? { super: superKind } : {};
}

/**
 * @param {GameState} state
 * @param {Side} winner
 * @param {GameEvent[]} events
 * @param {SuperKind | null} superKind the super that won the last point
 * @returns {GameState}
 */
function endMatch(state, winner, events, superKind) {
  events.push({ type: 'game-over', winner, ...superTag(superKind) });

  return withEvents({
    ...state,
    phase: GAME_PHASE.GAME_OVER,
    lastPoint: winner,
    ball: { ...state.ball, vx: 0, vy: 0, spin: 0 },
    extraBalls: NO_EXTRA_BALLS,
    serveCountdown: 0,
    rally: 0,
    pickups: [],
    turbo: 0,
    hazards: NO_HAZARDS,
    superShot: null,
  }, events);
}

/**
 * @param {GameState} state
 * @param {Side} scorer
 * @param {number} x where the scoring ball crossed the goal line; the walls keep it on the court
 * @param {GameConfig} config
 * @param {GameEvent[]} events
 * @param {SuperKind | null} [superKind] the super that scored the point
 * @returns {GameState}
 */
function awardPoint(state, scorer, x, config, events, superKind = null) {
  const score = { ...state.score, [scorer]: state.score[scorer] + 1 };
  const { rules } = config;
  let { lives } = state;

  events.push({ type: 'point', scorer, x, y: scorer === 'player' ? 0 : config.height, ...superTag(superKind) });

  if (rules.kind === 'rush') {
    // Only the player's misses count: each one costs a life, and the last one ends the run.
    if (scorer === 'opponent') {
      lives -= 1;
      events.push({ type: 'life-lost', lives });

      if (lives === 0) {
        return endMatch({ ...state, score, lives }, 'opponent', events, superKind);
      }
    }
  } else if (rules.kind === 'match') {
    if (score[scorer] >= rules.winningScore) {
      return endMatch({ ...state, score }, scorer, events, superKind);
    }

    if (score[scorer] === rules.winningScore - 1) {
      events.push({ type: 'match-point', side: scorer });
    }

    // A final boss changes its attacks as the player closes in on winning.
    const phase = bossPhase(score, config);

    if (phase !== bossPhase(state.score, config)) {
      events.push({ type: 'boss-phase', phase });
    }
  }

  const nextServe = nextServeBall(state, scorer, config);
  const next = {
    ...state,
    score,
    lives,
    lastPoint: scorer,
    ball: nextServe.ball,
    extraBalls: NO_EXTRA_BALLS,
    serveNumber: nextServe.serveNumber,
    serveCountdown: config.serveDelaySeconds,
    rally: 0,
    pickups: [],
    turbo: 0,
    // A point ends a boss's attack under way; the next one comes on schedule.
    hazards: NO_HAZARDS,
    superShot: null,
  };

  // A lost point charges the loser's meter, which helps whoever is behind to come back.
  return withEvents(config.supers.enabled ? chargeMeter(next, otherSide(scorer), config.supers.perConceded, events) : next, events);
}

/**
 * @param {Ball} ball
 * @param {number} deltaSeconds
 * @returns {Ball}
 */
function moveBall(ball, deltaSeconds) {
  return {
    ...ball,
    x: ball.x + ball.vx * deltaSeconds,
    y: ball.y + ball.vy * deltaSeconds,
  };
}

/**
 * @param {Side} side
 * @param {GameConfig} config
 */
function paddleTop(side, config) {
  return side === 'player' ? config.height - config.paddle.inset - config.paddle.height : config.paddle.inset;
}

/**
 * Where the ball rests one radius in front of a paddle's face.
 *
 * @param {Side} side
 * @param {GameConfig} config
 */
function inFrontOfPaddleY(side, config) {
  const top = paddleTop(side, config);
  return side === 'player' ? top - config.ball.radius : top + config.paddle.height + config.ball.radius;
}

/**
 * A return: the ball met the paddle's face, or one of its front corners. It leaves from where
 * it was struck, which for a paddle that moved fast is not where the paddle ends the step.
 *
 * @param {GameState} state
 * @param {Ball} ball
 * @param {Side} side
 * @param {PaddleContact} contact
 * @param {number} paddleX where the paddle's center was at the moment of contact
 * @param {GameConfig} config
 * @returns {Collision}
 */
function returnFromPaddle(state, ball, side, contact, paddleX, config) {
  const width = paddleWidth(state, side, config);
  const struck = paddleX + contact.x;
  const bounced = bounceFromPaddle({ ...ball, x: struck }, paddleX, side === 'player' ? -1 : 1, config, state[side].vx, width);
  // A rival with a curve bends every return away from the player's side of the court.
  const curve = side === 'opponent' && config.opponent.controller === 'cpu' ? config.opponent.curve : 0;
  const spin = curve > 0
    ? clamp(bounced.spin + (state.player.x < config.width / 2 ? curve : -curve), -config.ball.maxSpin, config.ball.maxSpin)
    : bounced.spin;

  return {
    state,
    // The return leaves from the face: level with it, a paddle sliding sideways cannot catch
    // the ball again, even after a corner hit. Where it was struck lies on its path, so on the court.
    ball: { ...bounced, x: struck, y: inFrontOfPaddleY(side, config), spin },
    hit: { side, offset: contactOffset(struck, paddleX, width) },
  };
}

/**
 * A touch that saves nothing: the ball met the paddle's side or back corner. A paddle that
 * runs into the ball side-on stops against it and never shoves it along, so a missed ball
 * keeps its course however the player moves; a ball that flies into the side bounces off it.
 * Either way it never shows through the paddle, and carries on toward the goal line.
 *
 * @param {GameState} state
 * @param {GameState} before the state the step began with
 * @param {Ball} ball
 * @param {Side} side
 * @param {PaddleContact} contact
 * @param {number} paddleX where the paddle's center was at the moment of contact
 * @param {number} deltaSeconds
 * @param {GameConfig} config
 * @param {GameEvent[]} events
 * @returns {Collision}
 */
function glanceOffSide(state, before, ball, side, contact, paddleX, deltaSeconds, config, events) {
  const normal = { x: contact.normalX, y: contact.normalY };
  const flyingIn = ball.vx * normal.x + ball.vy * normal.y < 0;
  const moved = flyingIn ? glanceOffPaddle(ball, normal) : ball;
  const touch = { x: paddleX + contact.x, y: contact.y };

  if (flyingIn) {
    events.push({ type: 'paddle-graze', side, x: touch.x, y: touch.y, speed: Math.hypot(moved.vx, moved.vy) });
  }

  // From the touch, the ball travels on for the rest of the step, away from or along the side.
  const travelled = moveBall({ ...moved, ...touch }, (1 - contact.time) * deltaSeconds);
  const deflected = reflectFromSideWalls(travelled, config);

  if (deflected !== travelled) {
    events.push({ type: 'wall-bounce', x: deflected.x, y: deflected.y, speed: Math.hypot(deflected.vx, deflected.vy) });
  }

  const paddle = paddleX === state[side].x ? state[side] : movePaddle(before[side], paddleX, deltaSeconds, config);
  return { state: { ...state, [side]: paddle }, ball: deflected, hit: null };
}

/**
 * Carries a ball through what it meets during the step: a side wall, then the paddle it is
 * heading for, which returns it from the face or deflects it off a side.
 *
 * @param {GameState} state
 * @param {GameState} before the state the step began with
 * @param {Ball} ball where the ball ends the step if it meets nothing
 * @param {{ x: number, y: number }} previousBall where it began the step
 * @param {number} deltaSeconds
 * @param {GameConfig} config
 * @param {GameEvent[]} events
 * @returns {Collision}
 */
function collide(state, before, ball, previousBall, deltaSeconds, config, events) {
  const walled = reflectFromSideWalls(ball, config);

  if (walled !== ball) {
    events.push({ type: 'wall-bounce', x: walled.x, y: walled.y, speed: Math.hypot(walled.vx, walled.vy) });
  }

  // Only the paddle the ball is heading for can meet it.
  const side = walled.vy > 0 ? 'player' : 'opponent';

  // Against a wall of bricks there is no paddle at the far end.
  if (side === 'opponent' && state.bricks) {
    return { state, ball: walled, hit: null };
  }

  const contact = findPaddleContact({
    from: previousBall,
    to: walled,
    paddleFrom: before[side].x,
    paddleTo: state[side].x,
    paddleTop: paddleTop(side, config),
    paddleWidth: paddleWidth(state, side, config),
    config,
  });

  if (!contact) {
    return { state, ball: walled, hit: null };
  }

  // The face the ball should meet points into the court: up for the player, down for the opponent.
  const facesBall = contact.normalY * (side === 'player' ? -1 : 1) > 0;

  // Where the paddle was when they touched: a paddle moved by a tap may end the step far away.
  const paddleX = before[side].x + contact.time * (state[side].x - before[side].x);

  if (facesBall && contact.approaching) {
    return returnFromPaddle(state, walled, side, contact, paddleX, config);
  }

  return glanceOffSide(state, before, walled, side, contact, paddleX, deltaSeconds, config, events);
}

/**
 * @param {Side} side
 * @param {Ball} ball the returned ball
 * @param {number} offset
 * @param {number} rally
 * @returns {Extract<GameEvent, { type: 'paddle-hit' }>}
 */
function paddleHit(side, ball, offset, rally) {
  return { type: 'paddle-hit', side, x: ball.x, y: ball.y, speed: Math.hypot(ball.vx, ball.vy), spin: ball.spin, offset, rally };
}

/**
 * @param {GameState} state
 * @param {GameState} before the state the step began with
 * @param {Ball} previousBall
 * @param {number} deltaSeconds
 * @param {GameConfig} config
 * @param {GameEvent[]} events
 * @returns {GameState}
 */
function resolveCollisions(state, before, previousBall, deltaSeconds, config, events) {
  const { state: next, ball, hit } = collide(state, before, state.ball, previousBall, deltaSeconds, config, events);

  if (!hit) {
    return { ...next, ball };
  }

  const rally = state.rally + 1;
  const returned = {
    ...next,
    ball,
    rally,
    longestRally: Math.max(state.longestRally, rally),
    hits: { ...state.hits, [hit.side]: state.hits[hit.side] + 1 },
    // Turbo is one blistering shot: the return comes back at normal speed, so it ends here.
    turbo: 0,
  };

  if (!config.supers.enabled) {
    events.push(paddleHit(hit.side, ball, hit.offset, rally));
    return returned;
  }

  const strike = strikeBack(returned, hit.side, config);
  events.push({
    ...paddleHit(hit.side, strike.state.ball, hit.offset, rally),
    ...superTag(strike.fired),
    ...(strike.saved ? { saved: strike.saved } : {}),
  });

  return chargeMeter(strike.state, hit.side, returnCharge(strike, hit.offset, config), events);
}

/**
 * Moves the balls a Multiball split off. Like the ball, they curve, bounce off the walls and
 * are returned or deflected by the paddles; but their returns are not counted in the rally or
 * the hits, so records stay those of the ball, and each fades when its time runs out.
 *
 * @param {GameState} state
 * @param {GameState} before the state the step began with
 * @param {number} deltaSeconds
 * @param {GameConfig} config
 * @param {GameEvent[]} events
 * @returns {GameState}
 */
function advanceExtraBalls(state, before, deltaSeconds, config, events) {
  if (state.extraBalls.length === 0) {
    return state;
  }

  let next = state;
  /** @type {ExtraBall[]} */
  const extraBalls = [];

  for (const extra of state.extraBalls) {
    const ttl = extra.ttl - deltaSeconds;

    if (ttl <= 0) {
      continue;
    }

    const moved = moveBall(curveBall(extra, deltaSeconds, config), deltaSeconds);
    const collision = collide(next, before, moved, extra, deltaSeconds, config, events);

    if (collision.hit) {
      events.push({ ...paddleHit(collision.hit.side, collision.ball, collision.hit.offset, next.rally), extra: true });
    }

    next = collision.state;
    extraBalls.push({ ...collision.ball, id: extra.id, ttl });
  }

  return { ...next, extraBalls: extraBalls.length > 0 ? extraBalls : NO_EXTRA_BALLS };
}

/**
 * A split-off ball past a goal line scores like the ball.
 *
 * @param {GameState} state
 * @param {GameConfig} config
 * @returns {{ scorer: Side, x: number } | null}
 */
function extraBallGoal(state, config) {
  const { radius } = config.ball;

  for (const extra of state.extraBalls) {
    if (extra.y - radius > config.height) {
      return { scorer: 'opponent', x: extra.x };
    }

    if (extra.y + radius < 0) {
      return { scorer: 'player', x: extra.x };
    }
  }

  return null;
}

/**
 * Runs the pre-serve wait. The first serve of a match counts down aloud from three.
 *
 * @param {GameState} state
 * @param {number} deltaSeconds
 * @param {GameConfig} config
 * @param {GameEvent[]} events
 * @returns {GameState}
 */
function waitForServe(state, deltaSeconds, config, events) {
  const remaining = state.serveCountdown;
  const serveCountdown = Math.max(0, remaining - deltaSeconds);

  if (state.serveNumber === 0) {
    const started = remaining === config.startDelaySeconds;

    if ((started || Math.ceil(serveCountdown) < Math.ceil(remaining)) && serveCountdown > 0) {
      events.push({ type: 'countdown', value: Math.ceil(serveCountdown) });
    }
  }

  if (serveCountdown === 0) {
    events.push({ type: 'serve', x: state.ball.x, y: state.ball.y });
  }

  return withEvents({ ...state, serveCountdown }, events);
}

/**
 * The player lost the last ball in play of a Bricks game: a life goes, and with the last life
 * the game. Otherwise the ball is served again, to a paddle without its bonuses.
 *
 * @param {GameState} state
 * @param {number} x where the ball left the court
 * @param {GameConfig} config
 * @param {GameEvent[]} events
 * @returns {GameState}
 */
function missInBricks(state, x, config, events) {
  const lives = state.lives - 1;
  events.push({ type: 'point', scorer: 'opponent', x, y: config.height }, { type: 'life-lost', lives });

  if (lives === 0) {
    return endMatch({ ...afterMiss(state), lives }, 'opponent', events, null);
  }

  const serveNumber = state.serveNumber + 1;

  return withEvents({
    ...afterMiss(state),
    lives,
    lastPoint: 'opponent',
    ball: brickServeBall(config, /** @type {BricksState} */ (state.bricks).level, serveNumber),
    extraBalls: NO_EXTRA_BALLS,
    serveNumber,
    serveCountdown: config.serveDelaySeconds,
    rally: 0,
    superShot: null,
  }, events);
}

/**
 * The wall is down. After the last level the game is won; otherwise the next wall goes up and
 * the ball is served to it, after a pause. Clearing a level earns a bonus, larger each level;
 * the paddle keeps its width and its safety net.
 *
 * @param {GameState} state
 * @param {GameConfig} config
 * @param {GameEvent[]} events
 * @returns {GameState}
 */
function clearLevel(state, config, events) {
  const rules = /** @type {BricksConfig} */ (config.bricks);
  const wall = /** @type {BricksState} */ (state.bricks);
  const bonus = rules.clearBonus * (wall.level + 1);
  const last = wall.level + 1 >= rules.levels.length;
  const points = wall.points + bonus;

  events.push({ type: 'level-clear', level: wall.level, bonus, last });

  if (last) {
    return endMatch({ ...state, bricks: { ...wall, points, drops: [], bolts: [], laser: 0 } }, 'player', events, null);
  }

  const serveNumber = state.serveNumber + 1;

  return withEvents({
    ...state,
    lastPoint: 'player',
    ball: brickServeBall(config, wall.level + 1, serveNumber),
    extraBalls: NO_EXTRA_BALLS,
    serveNumber,
    serveCountdown: rules.clearSeconds,
    rally: 0,
    superShot: null,
    bricks: levelState(config, wall.level + 1, points, wall.shield),
  }, events);
}

/**
 * One step of a Bricks game. The wall runs its own business: bombs, bonuses and bolts. Then
 * every ball in play flies: through the bricks, off the ceiling and the side walls, back from
 * the paddle or the safety net, or out of the court. Losing the last ball costs a life;
 * breaking the last brick clears the level.
 *
 * @param {GameState} state the state, with the player's paddle already moved
 * @param {GameState} before the state the step began with
 * @param {number} deltaSeconds
 * @param {GameConfig} config
 * @param {GameEvent[]} events
 * @returns {GameState}
 */
function advanceBricks(state, before, deltaSeconds, config, events) {
  let next = tickBricks(tickEffects(state, deltaSeconds), deltaSeconds, config, events);

  if (next.serveCountdown > 0) {
    return waitForServe(next, deltaSeconds, config, events);
  }

  /** @type {Ball[]} */
  const alive = [];
  let lostAt = next.ball.x;

  ballsInPlay(next).forEach((ball, index) => {
    const main = index === 0;
    const mark = events.length;
    const moved = moveBall(curveBall(ball, deltaSeconds, config), deltaSeconds);
    const flown = flyThroughBricks(next, ball, moved, config, events, main);
    const topped = bounceOffCeiling(flown.state, flown.ball, config, events, main);
    const collision = collide(topped.state, before, topped.ball, flown.from, deltaSeconds, config, events);
    let flying = collision.ball;
    /** @type {Ball[]} */
    let split = [];
    next = collision.state;

    if (collision.hit) {
      const played = returnInBricks(next, flying, collision.hit.offset, config, events, main);
      ({ state: next, ball: flying, split } = played);
    }

    ({ state: next, ball: flying } = bounceOffNet(next, flying, config, events));

    const bounces = events.slice(mark).filter((event) => event.type === 'wall-bounce').length;
    ({ state: next, ball: flying } = unstall(next, flying, bounces, config));

    if (flying.y - config.ball.radius > config.height) {
      lostAt = flying.x;
      // The ball takes its super with it.
      next = main && next.superShot ? { ...next, superShot: null } : next;
      return;
    }

    alive.push('id' in ball ? { ...ball, ...flying } : flying, ...split);
  });

  if (alive.length === 0) {
    return missInBricks(next, lostAt, config, events);
  }

  next = withBalls(next, alive, config);

  return levelCleared(/** @type {BricksState} */ (next.bricks)) ? clearLevel(next, config, events) : withEvents(next, events);
}

/**
 * One step of a Nova game. The countdown runs as before a match; then space runs its business,
 * and the game ends when the last ship is lost, or the last sector is clear.
 *
 * @param {GameState} state the state, with the ship already moved
 * @param {number} deltaSeconds
 * @param {GameConfig} config
 * @param {GameEvent[]} events
 * @returns {GameState}
 */
function advanceNovaGame(state, deltaSeconds, config, events) {
  const next = tickEffects(state, deltaSeconds);

  if (next.serveCountdown > 0) {
    return waitForServe(next, deltaSeconds, config, events);
  }

  const flown = advanceNova(next, deltaSeconds, config, events);
  const space = /** @type {NovaState} */ (flown.nova);

  if (flown.lives === 0) {
    return endMatch({ ...flown, nova: { ...space, shots: [], fire: [], loot: [] } }, 'opponent', events, null);
  }

  if (events.some((event) => event.type === 'sector-clear' && event.last)) {
    return endMatch(flown, 'player', events, null);
  }

  return withEvents(flown, events);
}

/**
 * One step of a Warp game. The start lights count down as before a match, before every race;
 * then the race runs, and the game ends when the last credit is spent, or the last race is won.
 *
 * @param {GameState} state the state, with the craft already steered
 * @param {number} deltaSeconds
 * @param {GameConfig} config
 * @param {GameEvent[]} events
 * @param {boolean} action whether the player has just asked for nitro
 * @returns {GameState}
 */
function advanceWarpGame(state, deltaSeconds, config, events, action) {
  const next = tickEffects(state, deltaSeconds);

  if (next.serveCountdown > 0) {
    return waitForServe(next, deltaSeconds, config, events);
  }

  const raced = advanceWarp(next, deltaSeconds, config, events, action);
  const finish = events.find((event) => event.type === 'race-finish');

  if (raced.lives === 0) {
    return endMatch(raced, 'opponent', events, null);
  }

  if (finish?.type === 'race-finish' && finish.qualified && finish.last) {
    return endMatch({ ...raced, warp: { .../** @type {WarpState} */ (raced.warp), calm: 0 } }, 'player', events, null);
  }

  return withEvents(raced, events);
}

/**
 * Advances the simulation by one fixed step. Does nothing unless the match is running.
 * The returned state lists the events of this step, such as hits, bounces and points.
 *
 * @param {GameState} state
 * @param {number} deltaSeconds
 * @param {InputSnapshot} input
 * @param {GameConfig} config
 * @returns {GameState}
 */
export function advanceGame(state, deltaSeconds, input, config) {
  if (state.phase !== GAME_PHASE.RUNNING) {
    return state;
  }

  /** @type {GameEvent[]} */
  const events = [];
  let nextState = steerPaddle(state, 'player', input.pointerX, input.horizontalAxis, deltaSeconds, config);

  if (nextState.nova) {
    return advanceNovaGame(nextState, deltaSeconds, config, events);
  }

  if (nextState.warp) {
    return advanceWarpGame(nextState, deltaSeconds, config, events, input.action === true);
  }

  if (nextState.bricks) {
    return advanceBricks(nextState, state, deltaSeconds, config, events);
  }

  nextState = config.opponent.controller === 'human'
    ? steerPaddle(nextState, 'opponent', input.opponentPointerX, input.opponentAxis, deltaSeconds, config)
    : moveOpponent(nextState, deltaSeconds, config);

  if (nextState.serveCountdown > 0) {
    // The ball waits at the center before each serve; both paddles can already move,
    // and any power-up effect keeps wearing off.
    return waitForServe(tickEffects(nextState, deltaSeconds), deltaSeconds, config, events);
  }

  nextState = tickPowerUps(nextState, deltaSeconds, config, events);
  nextState = tickHazards(nextState, deltaSeconds, config, events);

  const previousBall = nextState.ball;
  const movedBall = moveBall(curveBall(previousBall, deltaSeconds, config), deltaSeconds);
  nextState = {
    ...nextState,
    ball: nextState.superShot ? steerSuper(nextState.superShot, previousBall, movedBall, config, events) : movedBall,
  };
  nextState = resolveCollisions(nextState, state, previousBall, deltaSeconds, config, events);
  nextState = advanceExtraBalls(nextState, state, deltaSeconds, config, events);
  nextState = collectPowerUps(nextState, config, events);

  if (nextState.ball.y - config.ball.radius > config.height) {
    return awardPoint(nextState, 'opponent', nextState.ball.x, config, events, scoringSuper(nextState, 'opponent'));
  }

  if (nextState.ball.y + config.ball.radius < 0) {
    return awardPoint(nextState, 'player', nextState.ball.x, config, events, scoringSuper(nextState, 'player'));
  }

  const goal = extraBallGoal(nextState, config);

  if (goal) {
    return awardPoint(nextState, goal.scorer, goal.x, config, events);
  }

  return withEvents(nextState, events);
}
