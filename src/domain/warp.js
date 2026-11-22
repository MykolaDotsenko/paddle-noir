import { clamp } from './physics.js';
import { nextRandom } from './random.js';
import { chargeMeter, isLoaded } from './supers.js';

/**
 * The Warp game: a cup of five races, the paddle a racing craft. It flies on by itself, so the
 * player only steers, as in every other mode: through rings and the gaps of gates, over boost
 * pads, off ramps into the air, round mines, debris and slow cargo craft, and past the five
 * rivals of each race, who steer, take pads and ramps, and crash as well. The course bends,
 * and rolls over hills that speed a craft up on the way down. Flying close behind a rival
 * builds a slipstream that slings the craft past; holding the inside of a bend charges a drift
 * that boosts it out; a flick as the lights go green is a rocket start. Tricks landed without
 * a crash multiply what the next ones score, and charge the super meter. A course must be
 * finished well enough to go through, or a credit is spent on flying it again, and the last
 * race must be won.
 *
 * Everything here is where it is along the course, `z` in meters, and across the lane, `x`
 * from -1 to 1. The player's place across the lane is the paddle's place across the court.
 * `game.js` runs the start lights and the end of the game around it.
 *
 * @import {
 *   Course,
 *   CourseLayout,
 *   GameConfig,
 *   GameEvent,
 *   GameState,
 *   Racer,
 *   SuperKind,
 *   TrackItem,
 *   TrackItemKind,
 *   WarpConfig,
 *   WarpState,
 * } from './types.js'
 *
 * @typedef {WarpState & { rivals: Racer[], drops: TrackItem[] }} Race
 *
 * @typedef {object} Lap one step's changes to a race, gathered before they become a state
 * @property {GameState} state the state the step began with, the craft already steered
 * @property {Race} race
 * @property {number} seed
 * @property {number} lives
 * @property {number} charge the super meter's charge the step earned
 * @property {GameConfig} config
 * @property {GameEvent[]} events
 */

/** How wide each hazard on the course is across the lane, as it is hit. */
/** @type {Readonly<Record<TrackItemKind, number>>} */
export const ITEM_RADIUS = Object.freeze({ ring: 0, pad: 0, ramp: 0, gate: 0, mine: 0.12, debris: 0.16, cargo: 0.3 });

/** Points for what the player does on the course, besides the places at the finish. */
export const TRICK_POINTS = Object.freeze({ perfect: 50, good: 20, nearMiss: 40, overtake: 50, slingshot: 80, takedown: 150, smash: 60, gate: 40, air: 60, drift: 40, start: 100 });

// A course begins and ends clear of everything, so the start and the finish are a straight race,
// and level, so the grid and the line stand on flat ground.
const CLEAR_START = 90;
const CLEAR_END = 70;
const FLAT_ENDS = 150;
// A ramp throws a craft over this much of the course: rings hang in the air along it, and no
// gate stands in it, or just before the ramp. Nothing else stands at a gate or a ramp.
const AIR_RINGS = Object.freeze([16, 30]);
const AIR_ROOM = 50;
const GATE_ROOM = 16;
const RAMP_ROOM = 8;
// A rival looks this far ahead for what to steer round, farther for a gate, and turns across
// the lane this fast.
const LOOK_AHEAD = 36;
const GATE_LOOK = 70;
const RIVAL_TURN = 1.1;
// A rival far ahead of the player eases off, and one far behind pushes, so a race stays a race.
const PULL_AHEAD = 70;
const PUSH_BEHIND = 45;
const BAND = 0.1;
// Racers touch within this distance along the course and across it.
const CONTACT_Z = 2.2;
const CONTACT_X = 0.24;
const BUMP_SECONDS = 0.6;
const CRUISE = 0.6;
// The lane's very edge is its rumble strips: a craft on them is slowed, so hugging the edge,
// clear of everything, is no way to win.
const RUMBLE_FROM = 0.95;
const RUMBLE_SPEED = 0.88;
// A slope changes a craft's speed by no more than this share.
const MAX_GRADE = 0.06;
// A miner drops its mines only for a player this far behind: near enough to meet them, and far
// enough to see them coming.
const MINE_FROM = 20;
const MINE_TO = 70;
const DROP_IDS = 9000;
/** Where the last stretch begins, as a share of the course. */
export const FINAL_STRETCH = 0.85;

/**
 * @param {GameConfig} config
 * @returns {WarpConfig}
 */
function rulesOf(config) {
  return /** @type {WarpConfig} */ (config.warp);
}

/**
 * A number from 0 to 1, always the same for the same two numbers.
 *
 * @param {number} a
 * @param {number} b
 */
export function roll(a, b) {
  return nextRandom(Math.imul(a + 1, 73856093) ^ Math.imul(b + 1, 19349663)).value;
}

/**
 * @param {number} x a place across the lane
 * @returns {boolean} whether it is on the rumble strips at the lane's edge, which slow a craft
 */
export function onRumble(x) {
  return Math.abs(x) >= RUMBLE_FROM;
}

/**
 * The player's place across the lane: the paddle's place across the court.
 *
 * @param {GameState} state
 * @param {GameConfig} config
 */
export function laneX(state, config) {
  const reach = (config.width - config.paddle.width) / 2;
  return clamp((state.player.x - config.width / 2) / reach, -1, 1);
}

/** @param {number} share */
function ease(share) {
  const within = clamp(share, 0, 1);
  return within * within * (3 - 2 * within);
}

/**
 * How high the lane is at a place along the course, in heights of the eye above the lane: the
 * sum of the course's waves, level at the start and at the finish, and beyond them.
 *
 * @param {Course} course
 * @param {number} z
 */
export function heightAt(course, z) {
  const ends = ease(z / FLAT_ENDS) * ease((course.length - z) / FLAT_ENDS);

  if (ends === 0) {
    return 0;
  }

  let height = 0;

  for (const [high, long, phase] of course.hills) {
    height += high * Math.sin((z / long + phase) * Math.PI * 2);
  }

  return height * ends;
}

/**
 * How a slope changes a craft's speed there: a share faster downhill, a share slower up.
 *
 * @param {Course} course
 * @param {number} z
 * @param {WarpConfig} rules
 */
export function gradeAt(course, z, rules) {
  const slope = (heightAt(course, z + 1) - heightAt(course, z - 1)) / 2;
  return clamp(1 - slope * rules.gravity, 1 - MAX_GRADE, 1 + MAX_GRADE);
}

/**
 * How hard the course bends at a place along it: negative to the left, 0 on a straight.
 *
 * @param {Course} course
 * @param {number} z
 * @param {WarpConfig} rules
 */
export function curveAt(course, z, rules) {
  return course.curves[Math.floor(z / rules.segment)] ?? 0;
}

/**
 * What a trick scores times: one more for every few tricks landed since the last crash.
 *
 * @param {Pick<WarpState, 'flow'>} race
 * @param {WarpConfig} rules
 */
export function flowOf(race, rules) {
  return Math.min(rules.maxFlow, 1 + Math.floor(race.flow / rules.flowStep));
}

/** @type {WeakMap<CourseLayout, Course>} */
const BUILT = new WeakMap();

/**
 * A course as it is flown, laid out from how it is written: its bends a stretch at a time, and
 * its rings, pads, ramps, gates and hazards spread along it, each a little nearer or farther
 * than the even spacing, from a random source seeded by the course, so a course is the same
 * every time. Rings hang in the air past every ramp; nothing stands at a gate or on a ramp,
 * and no gate where a jump comes down.
 *
 * @param {GameConfig} config
 * @param {number} race
 * @returns {Course}
 */
export function buildCourse(config, race) {
  const rules = rulesOf(config);
  const layout = rules.courses[race];
  const built = BUILT.get(layout);

  if (built) {
    return built;
  }

  /** @type {number[]} */
  const curves = [];

  for (const [length, bend] of layout.bends) {
    for (let meters = 0; meters < length; meters += rules.segment) {
      curves.push(bend);
    }
  }

  let seed = 7919 * (race + 1);
  /** @param {number} min @param {number} max */
  const draw = (min, max) => {
    const next = nextRandom(seed);
    seed = next.seed;
    return min + next.value * (max - min);
  };
  /** @type {TrackItem[]} */
  const laid = [];
  const { every } = layout;
  /** @type {[TrackItemKind, number, number, number][]} what, how far apart, how far across, how far it drifts */
  const kinds = [['ring', every.rings, 0.6, 0], ['pad', every.pads, 0.7, 0], ['mine', every.mines, 0.8, 0], ['debris', every.debris, 0.7, 0.3], ['cargo', every.cargo, 0.55, 0], ['ramp', every.ramps, 0.5, 0], ['gate', every.gates, 0.45, 0]];

  for (const [kind, apart, across, sway] of kinds) {
    if (apart <= 0) {
      continue;
    }

    for (let z = CLEAR_START + apart * draw(0.2, 0.8); z < layout.length - CLEAR_END; z += apart * draw(0.75, 1.25)) {
      const x = draw(-across, across);
      laid.push({ id: laid.length + 1, kind, z, x, sway: sway * draw(0.5, 1), air: false });

      if (kind === 'ramp') {
        // Rings in the air along the jump: the first straight ahead, the next a little aside.
        AIR_RINGS.forEach((ahead, index) => {
          laid.push({ id: laid.length + 1, kind: 'ring', z: z + ahead, x: clamp(x + index * draw(-0.3, 0.3), -0.8, 0.8), sway: 0, air: true });
        });
      }
    }
  }

  const ramps = laid.filter((item) => item.kind === 'ramp');
  const gates = laid.filter((item) => item.kind === 'gate' && !ramps.some((ramp) => item.z > ramp.z - GATE_ROOM && item.z < ramp.z + AIR_ROOM));
  const items = laid.filter((item) => item.air
    || item.kind === 'ramp'
    || (item.kind === 'gate'
      ? gates.includes(item)
      : !gates.some((gate) => Math.abs(item.z - gate.z) < GATE_ROOM) && !ramps.some((ramp) => Math.abs(item.z - ramp.z) < RAMP_ROOM)));

  const course = Object.freeze({
    length: layout.length,
    curves: Object.freeze(curves),
    hills: layout.hills,
    items: Object.freeze(items.sort((a, b) => a.z - b.z)),
  });
  BUILT.set(layout, course);
  return course;
}

/**
 * Where something on the course is across the lane at a time: drifting debris sways.
 *
 * @param {TrackItem} item
 * @param {number} time
 */
export function itemX(item, time) {
  return item.sway === 0 ? item.x : clamp(item.x + item.sway * Math.sin(time * 1.3 + item.id), -0.9, 0.9);
}

/**
 * A race on its start line: the player at the back, the rivals ahead of them on the grid, the
 * fastest at the front, alternately left and right.
 *
 * @param {GameConfig} config
 * @param {number} race
 * @param {number} [points] the cup's points so far
 * @returns {WarpState}
 */
export function raceState(config, race, points = 0) {
  const rules = rulesOf(config);
  const layout = rules.courses[race];

  return {
    race,
    course: buildCourse(config, race),
    time: 0,
    z: 0,
    speed: 0,
    cursor: 0,
    rivals: layout.pilots.map((_, pilot) => ({
      id: pilot + 1,
      pilot,
      z: 7 * (pilot + 1),
      x: pilot % 2 === 0 ? -0.42 : 0.42,
      speed: 0,
      line: pilot % 2 === 0 ? -0.42 : 0.42,
      lineIn: 1 + pilot * 0.4,
      boost: 0,
      spin: 0,
      bumped: 0,
      air: 0,
      mineIn: rules.mineEvery,
      finish: 0,
    })),
    drops: [],
    dropped: 0,
    place: layout.pilots.length + 1,
    boost: 0,
    spin: 0,
    safe: 0,
    burn: 0,
    ghost: 0,
    air: 0,
    slip: 0,
    drift: 0,
    chain: 0,
    flow: 0,
    launched: false,
    points,
    calm: 0,
    retry: false,
    finished: false,
    finishTime: 0,
  };
}

/**
 * @param {GameConfig} config
 * @returns {WarpState | null} the first race, or null in any other game
 */
export function initialWarpState(config) {
  return config.warp ? raceState(config, 0) : null;
}

/**
 * @param {WarpState} race
 * @returns {number} the player's place: one more than the rivals ahead, or over the line first
 */
export function placeOf(race) {
  return 1 + race.rivals.filter((rival) => (rival.finish > 0 && !race.finished) || (rival.finish === 0 && rival.z > race.z)).length;
}

/**
 * The index of the first item at or past a distance.
 *
 * @param {readonly TrackItem[]} items
 * @param {number} z
 */
function firstFrom(items, z) {
  let low = 0;
  let high = items.length;

  while (low < high) {
    const middle = (low + high) >> 1;

    if (items[middle].z < z) {
      low = middle + 1;
    } else {
      high = middle;
    }
  }

  return low;
}

/**
 * The player lands a trick: it scores times the flow, adds to the flow and charges the super
 * meter. The flow going up a step is an event of its own.
 *
 * @param {Lap} lap
 * @param {number} worth
 * @returns {number} the points it scored
 */
function trick(lap, worth) {
  const { race } = lap;
  const rules = rulesOf(lap.config);
  const times = flowOf(race, rules);
  const points = worth * times;

  race.flow += 1;
  race.points += points;
  lap.charge += rules.chargePerTrick;

  if (flowOf(race, rules) > times) {
    lap.events.push({ type: 'flow', multiplier: flowOf(race, rules) });
  }

  return points;
}

/**
 * The player flies past something on the course: through a ring or not, over a pad or not, off
 * a ramp, through a gate's gap or into the gate, into a hazard or close by it. From the air only
 * the rings that hang there are in reach, and nothing on the ground is in the way; from the
 * ground the rings in the air are out of reach.
 *
 * @param {Lap} lap
 * @param {TrackItem} item
 * @param {number} x the player's place across the lane
 */
function pass(lap, item, x) {
  const { race, events } = lap;
  const rules = rulesOf(lap.config);
  const across = itemX(item, race.time);
  const off = Math.abs(across - x);
  const airborne = race.air > 0;

  if (item.kind === 'ring') {
    if (item.air !== airborne) {
      return;
    }

    const grade = off <= rules.ringCenter ? 'perfect' : off <= rules.ringRadius ? 'good' : 'miss';
    let points = grade === 'good' ? TRICK_POINTS.good : 0;
    race.chain = grade === 'perfect' ? race.chain + 1 : 0;

    if (grade === 'perfect') {
      // A ring in the air is worth two on the ground.
      points = trick(lap, TRICK_POINTS.perfect * (item.air ? 2 : 1));
      race.boost = Math.max(race.boost, 0.5);
    } else {
      race.points += points;
    }

    events.push({ type: 'ring', grade, chain: race.chain, air: item.air, z: item.z, x: across, points });
    return;
  }

  if (airborne) {
    return;
  }

  if (item.kind === 'pad') {
    if (off <= rules.padWidth) {
      race.boost = Math.max(race.boost, rules.padSeconds);
      events.push({ type: 'boost', z: item.z, x: across, by: 'pad' });
    }
    return;
  }

  if (item.kind === 'ramp') {
    if (off <= rules.rampWidth) {
      race.air = rules.airSeconds;
      events.push({ type: 'jump', z: item.z, x: across });
    }
    return;
  }

  if (item.kind === 'gate') {
    if (off <= rules.gateCenter) {
      events.push({ type: 'gate', grade: 'perfect', z: item.z, x: across, points: trick(lap, TRICK_POINTS.gate) });
    } else if (off <= rules.gateGap - rules.craftRadius) {
      events.push({ type: 'gate', grade: 'good', z: item.z, x: across, points: 0 });
    } else if (race.burn > 0) {
      events.push({ type: 'smash', kind: 'gate', z: item.z, x, points: trick(lap, TRICK_POINTS.smash) });
    } else if (race.ghost === 0 && race.safe === 0) {
      crash(lap, 'gate', item.z, x);
    }
    return;
  }

  const reach = ITEM_RADIUS[item.kind] + rules.craftRadius;

  if (off <= reach) {
    if (race.burn > 0) {
      events.push({ type: 'smash', kind: item.kind, z: item.z, x: across, points: trick(lap, TRICK_POINTS.smash) });
    } else if (race.ghost === 0 && race.safe === 0) {
      crash(lap, item.kind, item.z, across);
    }
  } else if (off <= reach + rules.nearMiss && race.spin === 0) {
    events.push({ type: 'near-miss', z: item.z, x: across, points: trick(lap, TRICK_POINTS.nearMiss) });
  }
}

/**
 * The player is hit: the craft spins, loses most of its speed, its flow, its ring chain, its
 * slipstream and its drift, and cannot be hit again for a moment.
 *
 * @param {Lap} lap
 * @param {TrackItemKind} kind
 * @param {number} z
 * @param {number} x
 */
function crash(lap, kind, z, x) {
  const { race } = lap;
  const rules = rulesOf(lap.config);

  race.spin = rules.spinSeconds;
  race.safe = rules.safeSeconds;
  race.speed *= rules.spinSpeed;
  race.boost = 0;
  race.chain = 0;
  race.flow = 0;
  race.slip = 0;
  race.drift = 0;
  lap.events.push({ type: 'crash', z, x, kind });
}

/**
 * A rival is taken down: it spins and loses most of its speed.
 *
 * @param {Lap} lap
 * @param {Racer} rival
 * @param {number} seconds
 */
function takeDown(lap, rival, seconds) {
  rival.spin = seconds;
  rival.speed *= 0.4;
  rival.boost = 0;
  lap.events.push({ type: 'takedown', pilot: rival.pilot, z: rival.z, x: rival.x, points: trick(lap, TRICK_POINTS.takedown) });
}

/**
 * A super on the course, fired with a flick of the craft while the meter is full: a fireball's
 * afterburner, which is faster than any boost and smashes what it meets; a zigzag's shockwave,
 * which takes down every rival near; thunder, which strikes the two rivals just ahead; or a
 * phantom, which flies through everything a while.
 *
 * @param {Lap} lap
 * @param {SuperKind} kind
 * @param {number} x
 */
function fireSuper(lap, kind, x) {
  const { race, config, events, state } = lap;
  const rules = rulesOf(config);

  events.push({ type: 'super-fire', kind, x: state.player.x, y: config.height - config.paddle.inset - config.paddle.height / 2 });

  switch (kind) {
    case 'fireball':
      race.burn = rules.burnSeconds;
      race.spin = 0;
      events.push({ type: 'boost', z: race.z, x, by: 'super' });
      return;
    case 'zigzag':
      events.push({ type: 'shockwave', z: race.z, x });

      for (const rival of race.rivals) {
        if (rival.finish === 0 && rival.spin === 0 && Math.abs(rival.z - race.z) <= rules.shockRange) {
          takeDown(lap, rival, 1.4);
        }
      }

      race.boost = Math.max(race.boost, 1);
      return;
    case 'thunder': {
      const ahead = race.rivals
        .filter((rival) => rival.finish === 0 && rival.z > race.z)
        .sort((a, b) => a.z - b.z)
        .slice(0, 2);

      events.push({ type: 'lightning', targets: ahead.map((rival) => ({ z: rival.z, x: rival.x })) });

      for (const rival of ahead) {
        takeDown(lap, rival, 1.6);
      }
      return;
    }
    case 'phantom':
    default:
      race.ghost = rules.ghostSeconds;
  }
}

/**
 * A rival flies on for a step. It eases off when far ahead of the player and pushes when far
 * behind; the hills speed it up and slow it down; it picks a line across the lane now and then,
 * a weaver all the time, and a blocker the player's own while they are close behind; it steers
 * for the gap of a gate and round what is in its way as well as its skill allows, takes boost
 * pads and ramps it can reach, and crashes into what it fails to miss. A miner drops a mine
 * now and then for a player who follows.
 *
 * @param {Lap} lap
 * @param {Racer} rival
 * @param {number} deltaSeconds
 * @param {number} x the player's place across the lane
 */
function fly(lap, rival, deltaSeconds, x) {
  const { race, config, events } = lap;
  const rules = rulesOf(config);
  const pilot = rules.courses[race.race].pilots[rival.pilot];
  const { items } = race.course;
  const gap = rival.z - race.z;
  const band = gap > PULL_AHEAD ? 1 - BAND : gap < -PUSH_BEHIND ? 1 + BAND : 1 - (BAND * gap) / (gap > 0 ? PULL_AHEAD : PUSH_BEHIND);
  const hill = rival.air > 0 ? 1 : gradeAt(race.course, rival.z, rules);
  const top = rules.topSpeed * pilot.pace * hill * (race.finished && rival.finish > 0 ? CRUISE : 1) * (onRumble(rival.x) ? RUMBLE_SPEED : 1);
  const target = rival.spin > 0 ? top * 0.35 : rival.boost > 0 ? rules.boostSpeed * pilot.pace * hill : top * band;

  rival.spin = Math.max(0, rival.spin - deltaSeconds);
  rival.boost = Math.max(0, rival.boost - deltaSeconds);
  rival.bumped = Math.max(0, rival.bumped - deltaSeconds);
  rival.air = Math.max(0, rival.air - deltaSeconds);
  rival.speed += (target - rival.speed) * Math.min(1, rules.accel * deltaSeconds);

  // A new line now and then.
  rival.lineIn -= deltaSeconds;

  if (rival.lineIn <= 0) {
    const next = nextRandom(lap.seed);
    const pause = nextRandom(next.seed);
    lap.seed = pause.seed;
    rival.line = -0.7 + next.value * 1.4;
    rival.lineIn = pilot.trait === 'weaver' ? 0.7 + pause.value * 0.9 : 2 + pause.value * 2;
  }

  if (pilot.trait === 'blocker' && gap > 2 && gap < rules.draft + 4 && race.spin === 0 && race.air === 0) {
    rival.line = clamp(x, -0.8, 0.8);
  }

  // What is ahead: through a gate's gap, round a hazard, onto a pad or a ramp, as well as it can tell.
  for (let index = firstFrom(items, rival.z); index < items.length && items[index].z <= rival.z + GATE_LOOK; index += 1) {
    const item = items[index];
    const near = item.z <= rival.z + LOOK_AHEAD;

    if (item.air || item.kind === 'ring' || (!near && item.kind !== 'gate')) {
      continue;
    }

    const across = itemX(item, race.time);

    if (item.kind === 'gate') {
      if (Math.abs(rival.line - across) > rules.gateGap - 0.14 && roll(rival.id * 17 + race.race, item.id) < 0.45 + pilot.skill / 2) {
        rival.line = across;
      }

      if (near) {
        // Nothing past a gate this near matters until it is behind.
        break;
      }
    } else if (item.kind === 'pad' || item.kind === 'ramp') {
      if (roll(rival.id * 31 + race.race, item.id) < pilot.skill * 0.5) {
        rival.line = across;
      }
    } else if (Math.abs(rival.line - across) < ITEM_RADIUS[item.kind] + 0.2 && roll(rival.id, item.id) < pilot.skill) {
      const side = across > 0 ? -1 : 1;
      rival.line = clamp(across + side * (ITEM_RADIUS[item.kind] + 0.34), -0.9, 0.9);
    }
  }

  const turn = RIVAL_TURN * deltaSeconds;
  rival.x += clamp(rival.line - rival.x, -turn, turn);
  const from = rival.z;
  rival.z += rival.speed * deltaSeconds;

  for (let index = firstFrom(items, from); index < items.length && items[index].z <= rival.z; index += 1) {
    const item = items[index];

    if (item.air || item.kind === 'ring' || rival.air > 0) {
      continue;
    }

    const off = Math.abs(itemX(item, race.time) - rival.x);

    if (item.kind === 'pad') {
      if (off <= rules.padWidth) {
        rival.boost = 1;
      }
    } else if (item.kind === 'ramp') {
      if (off <= rules.rampWidth) {
        rival.air = rules.airSeconds;
        events.push({ type: 'jump', z: item.z, x: rival.x, pilot: rival.pilot });
      }
    } else if (rival.spin === 0 && (item.kind === 'gate' ? off > rules.gateGap - 0.08 : off <= ITEM_RADIUS[item.kind] + 0.1)) {
      rival.spin = 1.2;
      rival.speed *= 0.6;
      events.push({ type: 'crash', z: item.z, x: rival.x, kind: item.kind, pilot: rival.pilot });
    }
  }

  if (pilot.trait === 'miner') {
    rival.mineIn = Math.max(0, rival.mineIn - deltaSeconds);

    if (rival.mineIn === 0 && gap > MINE_FROM && gap < MINE_TO && rival.air === 0 && rival.spin === 0 && rival.finish === 0 && race.drops.length < rules.maxDrops) {
      race.drops.push({ id: DROP_IDS + race.dropped, kind: 'mine', z: rival.z - 1.5, x: rival.x, sway: 0, air: false });
      race.dropped += 1;
      rival.mineIn = rules.mineEvery;
      events.push({ type: 'mine-drop', pilot: rival.pilot, z: rival.z - 1.5, x: rival.x });
    }
  }

  if (rival.finish === 0 && rival.z >= race.course.length) {
    rival.finish = race.time;
  }
}

/**
 * The player and a rival meet: the afterburner takes the rival down, a phantom flies through it,
 * and otherwise they bump apart, the one behind losing speed. A rival close ahead and in line
 * builds a slipstream; one passed close by is a near miss. A craft in the air meets nobody.
 *
 * @param {Lap} lap
 * @param {Racer} rival
 * @param {number} x the player's place across the lane
 * @param {number} before how far ahead of the player the rival was as the step began
 * @returns {boolean} whether the player is in its slipstream
 */
function meet(lap, rival, x, before) {
  const { race, events } = lap;
  const rules = rulesOf(lap.config);
  const ahead = rival.z - race.z;
  const across = Math.abs(rival.x - x);

  if (rival.finish > 0 || rival.spin > 0 || rival.air > 0 || race.air > 0) {
    return false;
  }

  if (Math.abs(ahead) < CONTACT_Z && across < CONTACT_X) {
    if (race.burn > 0) {
      takeDown(lap, rival, 1.6);
    } else if (race.ghost === 0 && rival.bumped === 0 && race.spin === 0) {
      const side = rival.x >= x ? 1 : -1;
      rival.x = clamp(rival.x + side * 0.22, -1, 1);
      rival.line = rival.x;
      rival.bumped = BUMP_SECONDS;

      if (ahead > 0) {
        race.speed *= 0.9;
      } else {
        rival.speed *= 0.85;
      }

      events.push({ type: 'bump', z: (rival.z + race.z) / 2, x: (rival.x + x) / 2 });
    }
    return false;
  }

  // Passed close by, and not touched.
  if (before > 0 && ahead <= 0 && across < CONTACT_X + rules.nearMiss + 0.1) {
    events.push({ type: 'near-miss', z: rival.z, x: rival.x, points: trick(lap, TRICK_POINTS.nearMiss) });
  }

  return ahead > 1.5 && ahead < rules.draft && across < 0.22;
}

/**
 * The race is over for the player: they take the points of their place, and go through to the
 * next race if they placed well enough. A player who did not spends a credit and flies the race
 * again; with no credit left the game is over. The racers fly on a moment past the line.
 *
 * @param {Lap} lap
 */
function finish(lap) {
  const { race, config, events } = lap;
  const rules = rulesOf(config);
  const layout = rules.courses[race.race];
  const place = placeOf(race);
  const points = rules.placePoints[place - 1] ?? 0;
  const qualified = place <= layout.qualify;
  const last = race.race + 1 >= rules.courses.length;
  const times = race.rivals.map((rival) => (rival.finish > 0 ? rival.finish : race.time + (race.course.length - rival.z) / Math.max(rival.speed, 1)));
  const margin = Math.min(...times.map((time) => Math.abs(time - race.time)));

  race.finished = true;
  race.finishTime = race.time;
  race.place = place;
  race.points += points;
  events.push({ type: 'race-finish', race: race.race, place, points, qualified, last, margin });

  if (!qualified) {
    lap.lives -= 1;
    events.push({ type: 'life-lost', lives: lap.lives });
  }

  race.retry = !qualified;
  race.calm = rules.calmSeconds;
}

/**
 * One step of a Warp race, once the craft has been steered: the craft flies on at the speed
 * that boosts, spins, slopes and supers give it, past what is on the course; the rivals fly
 * too; and the finish line ends the race. After the line comes a pause, then the next race's
 * grid, or this one's again; `game.js` runs the start lights and ends the game.
 *
 * @param {GameState} state
 * @param {number} deltaSeconds
 * @param {GameConfig} config
 * @param {GameEvent[]} events
 * @returns {GameState}
 */
export function advanceWarp(state, deltaSeconds, config, events) {
  const rules = rulesOf(config);
  const before = /** @type {WarpState} */ (state.warp);

  if (before.calm > 0) {
    return afterTheLine(state, deltaSeconds, config);
  }

  /** @type {Lap} */
  const lap = {
    state,
    race: { ...before, rivals: before.rivals.map((rival) => ({ ...rival })), drops: [...before.drops] },
    seed: state.seed,
    lives: state.lives,
    charge: 0,
    config,
    events,
  };
  const { race } = lap;
  const x = laneX(state, config);
  const flicked = Math.abs(state.player.vx) >= config.supers.flickSpeed;
  let { meters } = state;

  race.time += deltaSeconds;
  race.boost = Math.max(0, race.boost - deltaSeconds);
  race.spin = Math.max(0, race.spin - deltaSeconds);
  race.safe = Math.max(0, race.safe - deltaSeconds);
  race.burn = Math.max(0, race.burn - deltaSeconds);
  race.ghost = Math.max(0, race.ghost - deltaSeconds);

  // Down from a jump.
  if (race.air > 0) {
    race.air = Math.max(0, race.air - deltaSeconds);

    if (race.air === 0) {
      events.push({ type: 'land', z: race.z, x, points: trick(lap, TRICK_POINTS.air) });
    }
  }

  // A rocket start, with a flick as the lights go green.
  if (!race.launched) {
    race.launched = flicked || race.time > rules.startWindow;

    if (flicked) {
      race.boost = Math.max(race.boost, rules.startBoostSeconds);
      trick(lap, TRICK_POINTS.start);
      events.push({ type: 'boost', z: race.z, x, by: 'start' });
    }
  }

  // A super, with a flick of the craft while the meter is full.
  if (config.supers.enabled && isLoaded(meters.player) && flicked) {
    const kind = /** @type {SuperKind} */ (meters.player.kind);
    meters = { ...meters, player: { charge: 0, kind } };
    fireSuper(lap, kind, x);
  }

  // A drift charges on the inside of a bend, and boosts the craft out of it.
  const bend = curveAt(race.course, race.z, rules);
  const drifting = race.air === 0 && race.spin === 0 && Math.abs(bend) >= rules.driftBend && x * Math.sign(bend) >= rules.driftFrom && !onRumble(x);

  if (drifting) {
    const charged = race.drift >= 1;
    race.drift = Math.min(1, race.drift + (deltaSeconds / rules.driftSeconds) * Math.min(1.5, Math.abs(bend)));

    if (!charged && race.drift >= 1) {
      events.push({ type: 'drift-ready', z: race.z, x });
    }
  } else if (race.drift >= 1) {
    race.drift = 0;
    race.boost = Math.max(race.boost, rules.driftBoostSeconds);
    trick(lap, TRICK_POINTS.drift);
    events.push({ type: 'boost', z: race.z, x, by: 'drift' });
  } else {
    race.drift = Math.max(0, race.drift - deltaSeconds * 1.5);
  }

  // In the air a craft keeps the speed it left the ground with.
  if (race.air === 0) {
    const rumble = onRumble(x) ? RUMBLE_SPEED : 1;
    const hill = gradeAt(race.course, race.z, rules);
    const target = race.spin > 0 ? rules.topSpeed * 0.35
      : race.burn > 0 ? rules.boostSpeed * 1.15
        : race.boost > 0 ? rules.boostSpeed * rumble * hill
          : race.ghost > 0 ? rules.topSpeed * 1.06 * hill
            : rules.topSpeed * rumble * hill;
    race.speed += (target - race.speed) * Math.min(1, rules.accel * deltaSeconds);
  }

  const from = race.z;
  race.z += race.speed * deltaSeconds;

  // Past what is on the course, and the mines dropped on it.
  const { items } = race.course;

  while (race.cursor < items.length && items[race.cursor].z <= race.z) {
    pass(lap, items[race.cursor], x);
    race.cursor += 1;
  }

  while (race.drops.length > 0 && race.drops[0].z <= race.z) {
    pass(lap, /** @type {TrackItem} */ (race.drops.shift()), x);
  }

  // The rivals.
  const gaps = race.rivals.map((rival) => rival.z - from);
  let drafting = false;

  for (const rival of race.rivals) {
    fly(lap, rival, deltaSeconds, x);
  }

  race.rivals.forEach((rival, index) => {
    drafting = meet(lap, rival, x, gaps[index]) || drafting;
  });

  // A slipstream built behind a rival slings the craft past it.
  if (drafting && race.spin === 0) {
    if (race.slip === 0) {
      events.push({ type: 'slipstream', z: race.z, x });
    }

    race.slip = Math.min(1, race.slip + deltaSeconds / rules.slipSeconds);

    if (race.slip >= 1) {
      race.slip = 0;
      race.boost = Math.max(race.boost, rules.slingSeconds);
      trick(lap, TRICK_POINTS.slingshot);
      events.push({ type: 'boost', z: race.z, x, by: 'slingshot' });
    }
  } else {
    race.slip = Math.max(0, race.slip - deltaSeconds);
  }

  // Places.
  const place = placeOf(race);

  if (place !== race.place) {
    const passed = race.rivals.find((rival, index) => gaps[index] > 0 && rival.z <= race.z) ?? race.rivals.find((rival, index) => gaps[index] <= 0 && rival.z > race.z);
    const pilot = passed ? passed.pilot : 0;

    if (place < race.place) {
      events.push({ type: 'overtake', place, pilot, points: trick(lap, TRICK_POINTS.overtake) });
    } else {
      events.push({ type: 'overtaken', place, pilot });
    }

    race.place = place;
  }

  if (from < race.course.length * FINAL_STRETCH && race.z >= race.course.length * FINAL_STRETCH) {
    events.push({ type: 'final-stretch' });
  }

  if (race.z >= race.course.length) {
    finish(lap);
  }

  /** @type {GameState} */
  let next = { ...state, seed: lap.seed, lives: lap.lives, meters, warp: race };

  if (config.supers.enabled && lap.charge > 0) {
    next = chargeMeter(next, 'player', lap.charge, events);
  }

  return next;
}

/**
 * The pause after the finish line: the racers cruise on past it, and when the pause is over
 * the next race's grid lines up, or this race's again, for its start lights.
 *
 * @param {GameState} state
 * @param {number} deltaSeconds
 * @param {GameConfig} config
 * @returns {GameState}
 */
function afterTheLine(state, deltaSeconds, config) {
  const rules = rulesOf(config);
  const race = /** @type {WarpState} */ (state.warp);
  const calm = race.calm - deltaSeconds;

  if (calm > 0) {
    const cruise = rules.topSpeed * CRUISE;

    return {
      ...state,
      warp: {
        ...race,
        calm,
        time: race.time + deltaSeconds,
        air: 0,
        speed: race.speed + (cruise - race.speed) * Math.min(1, deltaSeconds),
        z: race.z + race.speed * deltaSeconds,
        rivals: race.rivals.map((rival) => ({ ...rival, air: 0, z: rival.z + rival.speed * deltaSeconds, finish: rival.finish || (rival.z >= race.course.length ? race.time : 0) })),
      },
    };
  }

  const next = race.retry ? race.race : race.race + 1;

  return {
    ...state,
    serveNumber: 0,
    serveCountdown: config.startDelaySeconds,
    warp: raceState(config, next, race.points),
  };
}
