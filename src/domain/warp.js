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
 * a crash multiply what the next ones score, charge the super meter and fill the tank of
 * nitro, which burns a bar at a time when the player asks. The craft is armed: its guns fire
 * by themselves at a rival lined up ahead, its rockets lock on to one and launch, and at the
 * speed of nitro it rams a rival out of its way; a shield, if it has one, takes a crash in its
 * place. How fast, how tough and how well armed it is comes from its loadout. A course must be
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
 *   Missile,
 *   Racer,
 *   SuperKind,
 *   TrackItem,
 *   TrackItemKind,
 *   WarpConfig,
 *   WarpState,
 * } from './types.js'
 *
 * @typedef {WarpState & { rivals: Racer[], drops: TrackItem[], missiles: Missile[] }} Race
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
export const ITEM_RADIUS = Object.freeze({ ring: 0, pad: 0, ramp: 0, gate: 0, crate: 0, cell: 0, mine: 0.12, debris: 0.16, cargo: 0.3 });

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
// A rival behind pushes harder than one ahead eases off: being shot down is not the end of its race.
const CHASE = 0.14;
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
// What only the player takes from the course: rivals fly through these as if they were not there.
/** @type {ReadonlySet<TrackItemKind>} */
const PLAYERS_OWN = new Set(['ring', 'crate', 'cell']);
// The guns do not bear on a rival right under the craft's nose, nor a rocket lock on to one;
// the guns' fire is told of this often; and a rocket turns across the lane this fast.
const GUN_NEAR = 3;
const ROCKET_NEAR = 8;
const GUN_EVERY = 0.11;
const MISSILE_TURN = 2.2;
// A rocket that has lost its rival flies on this far ahead of the craft, then is gone.
const MISSILE_REACH = 200;

/**
 * Every airframe has an activatable subsystem with its own tactical purpose.
 * Cooldowns are measured in simulated race seconds, not wall-clock time, so
 * pause, replay, and deterministic fixed-step tests all behave identically.
 *
 * @type {Readonly<Record<import('./types.js').CraftKind, { name: string, cooldown: number, duration: number }>>}
 */
export const WARP_ABILITIES = Object.freeze({
  jet: Object.freeze({ name: 'TARGET LINK', cooldown: 16, duration: 4 }),
  dart: Object.freeze({ name: 'VECTOR DODGE', cooldown: 18, duration: 2 }),
  wing: Object.freeze({ name: 'AERO SURGE', cooldown: 20, duration: 3 }),
  heavy: Object.freeze({ name: 'FORTRESS', cooldown: 22, duration: 3.5 }),
  saucer: Object.freeze({ name: 'FLUX DRIVE', cooldown: 19, duration: 2.5 }),
});

/**
 * Activate one signature ability. The cockpit key or touch button calls this
 * transition once; all subsequent effects are simulated by advanceWarp. A
 * disabled or cooling-down ability must never consume a charge or emit events.
 *
 * @param {GameState} state
 * @param {GameConfig} config
 * @returns {GameState}
 */
export function activateWarpAbility(state, config) {
  const current = state.warp;
  const rules = config.warp;

  if (state.phase !== 'running' || !current || !rules || state.serveCountdown > 0
      || current.finished || current.calm > 0 || current.spin > 0 || current.abilityCooldown > 0) {
    return state;
  }

  const { kind } = rules.loadout;
  const system = WARP_ABILITIES[kind];
  const race = {
    ...current,
    abilityTime: system.duration,
    abilityCooldown: system.cooldown,
  };

  switch (kind) {
    case 'jet':
      // Target Link narrows the targeting geometry and accelerates the rocket lock
      // while the pilot holds a rival in the forward arc.
      break;
    case 'dart':
      // Side thrusters briefly phase the light interceptor through track hazards.
      race.ghost = Math.max(race.ghost, system.duration);
      race.boost = Math.max(race.boost, 0.75);
      break;
    case 'wing':
      // Extended aerofoils turn a straight into a prolonged high-speed run.
      race.boost = Math.max(race.boost, system.duration);
      break;
    case 'heavy':
      // Deploy one emergency armour plate (two maximum) while the turrets overdrive.
      race.shield = Math.min(2, race.shield + 1);
      break;
    case 'saucer':
      // The flux chamber harvests energy for one additional nitro bar.
      race.nitro = Math.min(rules.loadout.nitroBars, race.nitro + 1);
      race.ghost = Math.max(race.ghost, 0.8);
      break;
  }

  return {
    ...state,
    warp: race,
    events: [{ type: 'craft-ability', kind, z: race.z, x: laneX(state, config) }],
  };
}

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
 * its rings, pads, ramps, gates, crates, cells and hazards spread along it, each a little nearer or farther
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
  const kinds = [['ring', every.rings, 0.6, 0], ['pad', every.pads, 0.7, 0], ['mine', every.mines, 0.8, 0], ['debris', every.debris, 0.7, 0.3], ['cargo', every.cargo, 0.55, 0], ['ramp', every.ramps, 0.5, 0], ['gate', every.gates, 0.45, 0], ['crate', every.crates, 0.6, 0], ['cell', every.cells, 0.6, 0]];

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
 * @param {number} [lost] points of races flown again so far
 * @returns {WarpState}
 */
export function raceState(config, race, points = 0, lost = 0) {
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
      hull: rules.rivalHull,
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
    // A race starts with a bar in the tank and a rocket aboard, if the craft carries any.
    nitro: Math.min(1, rules.loadout.nitroBars),
    nitroBurn: 0,
    abilityCooldown: 0,
    abilityTime: 0,
    shield: rules.loadout.shields,
    rockets: Math.min(1, rules.loadout.rockets),
    lock: 0,
    lockOn: 0,
    aim: 0,
    gunIn: 0,
    missiles: [],
    fired: 0,
    slip: 0,
    drift: 0,
    chain: 0,
    flow: 0,
    launched: false,
    points,
    banked: points,
    lost,
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
 * The player lands a trick: it scores times the flow, adds to the flow, charges the super
 * meter and puts a little nitro in the tank. The flow going up a step is an event of its own.
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
  race.nitro = Math.min(rules.loadout.nitroBars, race.nitro + rules.nitroPerTrick);
  lap.charge += rules.chargePerTrick;

  if (flowOf(race, rules) > times) {
    lap.events.push({ type: 'flow', multiplier: flowOf(race, rules) });
  }

  return points;
}

/**
 * The player flies past something on the course: through a ring or not, over a pad or not, off
 * a ramp, through a gate's gap or into the gate, over a crate or a cell to pick it up, into a
 * hazard or close by it. From the air only
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

  if (item.kind === 'crate' || item.kind === 'cell') {
    if (off <= rules.pickupWidth) {
      if (item.kind === 'crate') {
        race.rockets = Math.min(rules.loadout.rockets, race.rockets + 1);
      } else {
        race.nitro = Math.min(rules.loadout.nitroBars, race.nitro + 1);
      }

      events.push({ type: 'ammo', kind: item.kind === 'crate' ? 'rocket' : 'nitro', z: item.z, x: across });
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
 * slipstream and its drift, and cannot be hit again for a moment. A shield takes the hit in
 * the craft's place, and the craft flies on.
 *
 * @param {Lap} lap
 * @param {TrackItemKind} kind
 * @param {number} z
 * @param {number} x
 */
function crash(lap, kind, z, x) {
  const { race } = lap;
  const rules = rulesOf(lap.config);

  if (race.shield > 0) {
    race.shield -= 1;
    race.safe = rules.safeSeconds;
    lap.events.push({ type: 'shield-hit', z, x, left: race.shield });
    return;
  }

  race.spin = rules.spinSeconds * rules.loadout.spin;
  race.safe = rules.safeSeconds;
  race.speed *= rules.spinSpeed;
  race.boost = 0;
  race.chain = 0;
  race.flow = 0;
  race.slip = 0;
  race.drift = 0;
  race.nitroBurn = 0;
  lap.events.push({ type: 'crash', z, x, kind });
}

/**
 * A rival is taken down: it spins and loses most of its speed, and its hull is whole again
 * when it flies on.
 *
 * @param {Lap} lap
 * @param {Racer} rival
 * @param {number} seconds
 * @param {'guns' | 'rocket' | 'ram' | 'super'} by
 */
function takeDown(lap, rival, seconds, by) {
  rival.spin = seconds;
  rival.speed *= 0.55;
  rival.boost = 0;
  rival.hull = rulesOf(lap.config).rivalHull;
  lap.events.push({ type: 'takedown', pilot: rival.pilot, z: rival.z, x: rival.x, points: trick(lap, TRICK_POINTS.takedown), by });
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
          takeDown(lap, rival, 1.4, 'super');
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
        takeDown(lap, rival, 1.6, 'super');
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
  const band = gap > PULL_AHEAD ? 1 - BAND : gap < -PUSH_BEHIND ? 1 + CHASE : gap > 0 ? 1 - (BAND * gap) / PULL_AHEAD : 1 - (CHASE * gap) / PUSH_BEHIND;
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

    if (item.air || PLAYERS_OWN.has(item.kind) || (!near && item.kind !== 'gate')) {
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

    if (item.air || PLAYERS_OWN.has(item.kind) || rival.air > 0) {
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
 * The player and a rival meet: at the speed of nitro, or of an afterburner, the craft rams the
 * rival out of its way; a phantom flies through it; and otherwise they bump apart, the one
 * behind losing speed. A rival close ahead and in line
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
    if (race.burn > 0 || race.nitroBurn > 0) {
      takeDown(lap, rival, 1.6, 'ram');
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
 * The craft's weapons, for a step. The guns fire by themselves at the nearest rival lined up
 * ahead within their range, wearing its hull down until it is taken down. A rocket locks on to
 * the nearest rival ahead that is roughly in line, launches when the lock is whole, and homes
 * on it; its blast takes down whoever is near. Nothing fires from the air, or while the craft
 * spins.
 *
 * @param {Lap} lap
 * @param {number} x the player's place across the lane
 * @param {number} deltaSeconds
 */
function fight(lap, x, deltaSeconds) {
  const { race, events } = lap;
  const rules = rulesOf(lap.config);
  const armed = race.air === 0 && race.spin === 0 && !race.finished;
  const ahead = armed
    ? race.rivals.filter((rival) => rival.finish === 0 && rival.air === 0 && rival.spin === 0 && rival.z - race.z > GUN_NEAR).sort((a, b) => a.z - b.z)
    : [];

  // The guns.
  const targeting = rules.loadout.kind === 'jet' && race.abilityTime > 0;
  const fortress = rules.loadout.kind === 'heavy' && race.abilityTime > 0;
  const mark = ahead.find((rival) => rival.z - race.z <= rules.gunRange * (targeting ? 1.3 : 1)
    && Math.abs(rival.x - x) <= rules.gunAim * (targeting ? 1.65 : 1));
  race.aim = mark ? mark.id : 0;
  race.gunIn = Math.max(0, race.gunIn - deltaSeconds);

  if (mark) {
    mark.hull -= rules.loadout.damage * (fortress ? 1.55 : 1) * deltaSeconds;

    if (race.gunIn === 0) {
      race.gunIn = GUN_EVERY;
      events.push({ type: 'gun-fire', z: mark.z, x: mark.x });
    }

    if (mark.hull <= 0) {
      takeDown(lap, mark, 1.6, 'guns');
    }
  }

  // The rockets: a lock on a rival no rocket is on its way to already.
  const prey = race.rockets > 0
    ? ahead.find((rival) => rival.spin === 0 && rival.z - race.z > ROCKET_NEAR && rival.z - race.z <= rules.rocketRange * (targeting ? 1.25 : 1) && Math.abs(rival.x - x) <= rules.rocketAim * (targeting ? 1.45 : 1) && !race.missiles.some((missile) => missile.target === rival.id))
    : undefined;

  if (prey) {
    race.lock = (race.lockOn === prey.id ? race.lock : 0) + deltaSeconds / (rules.lockSeconds * (targeting ? 0.5 : 1));
    race.lockOn = prey.id;

    if (race.lock >= 1) {
      race.rockets -= 1;
      race.fired += 1;
      race.lock = 0;
      race.lockOn = 0;
      race.missiles.push({ id: race.fired, z: race.z + 2, x, target: prey.id });
      events.push({ type: 'rocket-launch', pilot: prey.pilot, z: race.z, x });
    }
  } else {
    race.lock = 0;
    race.lockOn = 0;
  }

  // The rockets in flight.
  race.missiles = race.missiles.filter((missile) => {
    const target = race.rivals.find((rival) => rival.id === missile.target && rival.finish === 0);
    missile.z += (Math.max(race.speed, rules.topSpeed) + rules.missileSpeed) * deltaSeconds;

    if (!target) {
      return missile.z < race.z + MISSILE_REACH;
    }

    const turn = MISSILE_TURN * deltaSeconds;
    missile.x += clamp(target.x - missile.x, -turn, turn);

    if (missile.z < target.z - 1) {
      return true;
    }

    events.push({ type: 'explosion', z: target.z, x: target.x });

    for (const rival of race.rivals) {
      if (rival.finish === 0 && rival.spin === 0 && Math.abs(rival.z - target.z) <= rules.blastRange && Math.abs(rival.x - target.x) <= 0.45) {
        takeDown(lap, rival, 2, 'rocket');
      }
    }

    return false;
  });
}

/**
 * The race is over for the player: they take the points of their place, and go through to the
 * next race if they placed well enough. A player who did not spends a credit and flies the race
 * again, for its points anew; with no credit left the game is over. The racers fly on a moment past the line.
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
 * @param {boolean} [action] whether the player has just asked for a bar of nitro
 * @returns {GameState}
 */
export function advanceWarp(state, deltaSeconds, config, events, action = false) {
  const rules = rulesOf(config);
  const before = /** @type {WarpState} */ (state.warp);

  if (before.calm > 0) {
    return afterTheLine(state, deltaSeconds, config);
  }

  /** @type {Lap} */
  const lap = {
    state,
    race: { ...before, rivals: before.rivals.map((rival) => ({ ...rival })), drops: [...before.drops], missiles: before.missiles.map((missile) => ({ ...missile })) },
    seed: state.seed,
    lives: state.lives,
    charge: 0,
    config,
    events,
  };
  const { race } = lap;
  const { loadout } = rules;
  const x = laneX(state, config);
  const flicked = Math.abs(state.player.vx) >= config.supers.flickSpeed;
  let { meters } = state;

  race.time += deltaSeconds;
  race.boost = Math.max(0, race.boost - deltaSeconds);
  race.spin = Math.max(0, race.spin - deltaSeconds);
  race.safe = Math.max(0, race.safe - deltaSeconds);
  race.burn = Math.max(0, race.burn - deltaSeconds);
  race.ghost = Math.max(0, race.ghost - deltaSeconds);
  race.nitroBurn = Math.max(0, race.nitroBurn - deltaSeconds);
  race.abilityCooldown = Math.max(0, (race.abilityCooldown ?? 0) - deltaSeconds);
  race.abilityTime = Math.max(0, (race.abilityTime ?? 0) - deltaSeconds);

  // A bar of nitro, when the player asks and there is one.
  if (action && race.nitro >= 1 && race.nitroBurn === 0 && race.spin === 0) {
    race.nitro -= 1;
    race.nitroBurn = loadout.nitroSeconds;
    events.push({ type: 'nitro', z: race.z, x });
  }

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
    race.drift = Math.min(1, race.drift + (deltaSeconds / (rules.driftSeconds * loadout.drift)) * Math.min(1.5, Math.abs(bend)));

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
    const top = rules.topSpeed * loadout.speed;
    const boost = rules.boostSpeed * loadout.speed;
    const target = race.spin > 0 ? top * 0.35
      : race.burn > 0 ? boost * 1.15
        : race.nitroBurn > 0 ? rules.nitroSpeed * loadout.speed * hill
          : race.boost > 0 ? boost * rumble * hill
            : race.ghost > 0 ? top * 1.06 * hill
              : top * rumble * hill;
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

  fight(lap, x, deltaSeconds);

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
        nitroBurn: 0,
        lock: 0,
        lockOn: 0,
        aim: 0,
        missiles: [],
        speed: race.speed + (cruise - race.speed) * Math.min(1, deltaSeconds),
        z: race.z + race.speed * deltaSeconds,
        rivals: race.rivals.map((rival) => ({ ...rival, air: 0, z: rival.z + rival.speed * deltaSeconds, finish: rival.finish || (rival.z >= race.course.length ? race.time : 0) })),
      },
    };
  }

  // A race flown again starts from the points the cup had before it: a race counts once, so a
  // place too low is never a way to score a course twice.
  return {
    ...state,
    serveNumber: 0,
    serveCountdown: config.startDelaySeconds,
    warp: race.retry
      ? raceState(config, race.race, race.banked, race.lost + race.points - race.banked)
      : raceState(config, race.race + 1, race.points, race.lost),
  };
}
