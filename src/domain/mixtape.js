// Distance is measured at the rider. Both lanes share a clock, even when their
// sprites are staggered in perspective. The course repeats exactly for a rematch.
export const BLOCK_LENGTH = 1800;
export const BLOCKS = ['Corner shop', 'Canal bridge', 'The last arcade'];
export const FINISH = BLOCK_LENGTH * BLOCKS.length;
export const STEP = 1 / 120;
const AIRTIME = 0.84;
const SPEED = [82, 94, 108];

/** @typedef {'crate'|'cone'|'tape'} ItemKind */
/** @typedef {{at:number, lane:number, kind:ItemKind, pair:number}} RoadItem */
/** @typedef {{air:number, height:number, down:boolean, grace:number, buffer:number}} Rider */

// Both parts of a tape belong to the same bar. Later bars stagger the jumps.
const BARS = [
  ['C.', '.C', 'TT', 'CC', '.C', 'Tt', 'C.', 'CC'],
  ['Cc', 'TT', '.C', 'cC', 'Tt', 'CC', 'Cc', 'TT'],
  ['cC', 'Tt', 'Cc', 'CC', 'tT', 'cC', 'Cc', 'TT'],
];

/** @returns {RoadItem[]} */
function buildRoute() {
  /** @type {RoadItem[]} */
  const items = [];
  for (const [block, bars] of BARS.entries()) {
    bars.forEach((bar, beat) => {
      [...bar].forEach((mark, lane) => {
        if (mark === '.') return;
        const at = block * BLOCK_LENGTH + 265 + beat * 190 + (mark === mark.toLowerCase() ? 57 : 0);
        const kind = mark.toUpperCase() === 'T' ? 'tape' : (beat + block + lane) % 2 ? 'cone' : 'crate';
        items.push({ at, lane, kind, pair: block * 8 + beat });
      });
    });
  }
  return items.sort((a, b) => a.at - b.at);
}

export const ROAD = buildRoute();
/** @returns {Rider} */
const rider = () => ({ air: 0, height: 0, down: false, grace: 0, buffer: 0 });

/** @param {boolean} duo */
export function newRide(duo) {
  return {
    duo, distance: 0, cursor: 0, block: 0, score: 0, mixes: 0, saves: 0, tapes: 0,
    phase: 'riding', notice: '', noticeTime: 0, riders: [rider(), rider()],
    /** @type {Set<number>} */ halves: new Set(),
  };
}

/** @typedef {ReturnType<typeof newRide>} Ride */

/** @param {Ride} ride @param {number} lane */
export function queueHop(ride, lane) {
  const cyclist = ride.riders[lane];
  if (ride.phase === 'riding' && !cyclist.down) cyclist.buffer = 0.11;
}

/** @param {Ride} ride @param {string} message */
function announce(ride, message) {
  ride.notice = message;
  ride.noticeTime = 1.9;
}

/** @param {Ride} ride @param {RoadItem} item */
function passItem(ride, item) {
  const cyclist = ride.riders[item.lane];
  if (cyclist.down) return;
  if (item.kind === 'tape') {
    if (cyclist.height < 18) return;
    ride.tapes++;
    ride.score += 50;
    if (ride.halves.has(item.pair)) {
      ride.mixes++;
      ride.score += 150;
      const cue = ride.mixes === 1 ? 'Harmony in!' : ride.mixes === 3 ? 'Drums in!' : 'Both sides!';
      announce(ride, cue + ' +150');
    } else {
      ride.halves.add(item.pair);
      announce(ride, 'Tape caught! +50');
    }
    return;
  }
  if (cyclist.height < 13) {
    if (cyclist.grace > 0) return;
    cyclist.down = true;
    cyclist.buffer = 0;
    announce(ride, 'Chain off! Clear a hurdle to rescue');
    if (ride.riders.every(r => r.down)) ride.phase = 'out';
    return;
  }
  ride.score += 20;
  const friend = ride.riders[1 - item.lane];
  if (friend.down) {
    Object.assign(friend, rider(), { grace: 1.6 });
    ride.saves++;
    ride.score += 75;
    announce(ride, 'Back together! +75');
  }
}

/** Advance exactly one fixed tick. The solo player controls the surviving bike after a fall.
 * @param {Ride} ride */
export function tickRide(ride) {
  if (ride.phase !== 'riding') return;
  const speed = SPEED[ride.block];
  if (!ride.duo && !ride.riders[0].down && !ride.riders[1].down) {
    const next = ROAD.slice(ride.cursor, ride.cursor + 4).find(item => item.lane === 1);
    if (next && next.at - ride.distance <= speed * AIRTIME * 0.5 && next.at > ride.distance) queueHop(ride, 1);
  }
  for (const cyclist of ride.riders) {
    if (cyclist.down) continue;
    if (cyclist.air === 0 && cyclist.buffer > 0) {
      cyclist.air = AIRTIME;
      cyclist.buffer = 0;
    }
    cyclist.grace = Math.max(0, cyclist.grace - STEP);
    cyclist.buffer = Math.max(0, cyclist.buffer - STEP);
    cyclist.air = Math.max(0, cyclist.air - STEP);
    const t = cyclist.air / AIRTIME;
    cyclist.height = 144 * t * (1 - t);
  }
  ride.distance += speed * STEP;
  ride.noticeTime = Math.max(0, ride.noticeTime - STEP);
  while (ride.cursor < ROAD.length && ROAD[ride.cursor].at <= ride.distance) {
    passItem(ride, ROAD[ride.cursor++]);
  }
  ride.block = Math.min(BLOCKS.length - 1, Math.floor(ride.distance / BLOCK_LENGTH));
  if (ride.distance >= FINISH) {
    ride.phase = 'home';
    ride.score += ride.riders.every(r => !r.down) ? 500 : 200;
  }
}
