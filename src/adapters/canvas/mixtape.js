import { FINISH, ROAD } from '../../domain/mixtape.js';

/** @typedef {CanvasRenderingContext2D} Brush */
/** @typedef {import('../../domain/mixtape.js').Ride} Ride */
const WIDTH = 384;
const GROUND = [162, 229];
const BIKE_X = [94, 64];
const TEAM = ['#96fbea', '#ffad58'];
const STAGES = [
  ['#56578f', '#fda388', '#ffe2a1', '#8b7496', '#655775', '#443952'],
  ['#454981', '#bc86b2', '#ffcca6', '#7b749e', '#5e577a', '#343950'],
  ['#202b58', '#85629b', '#ffc5a3', '#61577f', '#46476b', '#282e4f'],
];

/** @param {Brush} c @param {string} ink @param {number} x @param {number} y @param {number} w @param {number} h */
function rect(c, ink, x, y, w, h) {
  c.fillStyle = ink;
  c.fillRect(Math.round(x), Math.round(y), w, h);
}

/** @param {Brush} c @param {string} ink @param {number} weight @param {number[]} points */
function line(c, ink, weight, points) {
  c.strokeStyle = ink;
  c.lineWidth = weight;
  c.beginPath();
  c.moveTo(points[0], points[1]);
  for (let i = 2; i < points.length; i += 2) c.lineTo(points[i], points[i + 1]);
  c.stroke();
}

/** @param {Brush} c @param {string} ink @param {number} x @param {number} y @param {number} radius */
function disc(c, ink, x, y, radius) {
  c.fillStyle = ink;
  c.beginPath();
  c.arc(x, y, radius, 0, Math.PI * 2);
  c.fill();
}

/** @param {Brush} c @param {string} ink @param {number} x @param {number} y @param {string} word @param {number} size */
function label(c, ink, x, y, word, size) {
  c.fillStyle = ink;
  c.font = 'bold ' + size + 'px monospace';
  c.fillText(word, x, y);
}

/** @param {Brush} c @param {number} x @param {string} sign @param {string[]} p */
function shop(c, x, sign, p) {
  rect(c, p[5], x, 93, 84, 37);
  rect(c, p[4], x - 2, 91, 88, 5);
  rect(c, '#f9c291', x + 4, 98, 76, 11);
  label(c, '#413550', x + 9, 106, sign, 8);
  for (let n = 0; n < 5; n++) {
    rect(c, n === 2 ? '#493e59' : '#ac8295', x + 5 + n * 15, 113, 12, 15);
    rect(c, '#ecbaaa', x + 6 + n * 15, 114, 8, 2);
  }
  if (sign === 'ARCADE') {
    for (let lamp = 0; lamp < 10; lamp++) rect(c, '#ffdfa7', x + 5 + lamp * 8, 95, 3, 2);
    for (const offset of [9, 55]) {
      rect(c, '#493451', x + offset, 116, 8, 12);
      rect(c, '#99e9db', x + offset + 1, 117, 6, 4);
      rect(c, '#e2838d', x + offset - 1, 122, 10, 2);
    }
  }
}

/** @param {Brush} c @param {Ride} ride @param {boolean} reduced */
function neighborhood(c, ride, reduced) {
  const p = STAGES[ride.block];
  const travel = reduced ? 0 : ride.distance;
  const sky = c.createLinearGradient(0, 0, 0, 131);
  sky.addColorStop(0, p[0]);
  sky.addColorStop(1, p[1]);
  c.fillStyle = sky;
  c.fillRect(0, 0, WIDTH, 137);
  const sunY = 49 + ride.block * 14;
  disc(c, p[2], 293, sunY, 25);
  for (let n = 0; n < 4; n++) rect(c, p[1], 267, sunY + 6 + n * 5, 52, 1 + Math.floor(n / 2));
  for (let n = 0; n < 20; n++) {
    const x = ((n * 73 + 17 - travel * 0.026) % 402 + 402) % 402 - 9;
    rect(c, p[2], x, (n * 19 + 7) % 63, n % 5 === 0 ? 12 : 2, 1);
  }
  for (let n = 0; n < 16; n++) {
    const x = n * 32 - (travel * 0.1 % 96) - 32;
    const top = [74, 59, 82][n % 3];
    rect(c, p[3], x, top, 28, 129 - top);
    rect(c, p[3], x + 5, top - 5, 9, 5);
    for (let w = 0; w < 6; w++) rect(c, p[2], x + 4 + w % 3 * 7, top + 7 + Math.floor(w / 3) * 9, 3, 4);
  }
  const scroll = travel * 0.35;
  for (let n = Math.floor(scroll / 128); n <= Math.floor(scroll / 128) + 3; n++) {
    const x = n * 128 - scroll;
    if (ride.block === 1) {
      rect(c, '#657c98', x, 113, 128, 17);
      for (let ripple = 0; ripple < 6; ripple++) {
        rect(c, '#aac1c7', x + (ripple * 19) % 114, 115 + ripple % 3 * 5, 8, 1);
      }
      line(c, p[5], 3, [x, 122, x + 32, 88, x + 64, 122, x + 96, 88, x + 128, 122]);
      rect(c, p[5], x, 123, 128, 4);
    } else {
      shop(c, x, (ride.block === 2 ? ['ARCADE', 'OPEN LATE', 'HI-FI'] : ['RECORDS', 'VIDEO CLUB', 'CORNER SHOP'])[n % 3], p);
    }
    rect(c, p[5], x + 106, 77, 3, 54);
    line(c, p[5], 1, [x - 20, 79, x + 42, 85, x + 107, 78]);
    rect(c, p[5], x + 101, 76, 13, 2);
  }
  rect(c, '#353547', 0, 130, WIDTH, 112);
  rect(c, '#eec1a2', 0, 131, WIDTH, 2);
  rect(c, '#3f4053', 0, 174, WIDTH, 66);
  for (let x = -ride.distance % 44; x < WIDTH; x += 44) {
    rect(c, '#998395', x, 178, 23, 2);
    rect(c, '#524e62', x + 13, 154, 8, 1);
    rect(c, '#5b5363', x + 21, 221, 13, 1);
  }
  rect(c, '#c5a49a', 0, 238, WIDTH, 2);
}

/** @param {Brush} c @param {number} x @param {number} floor @param {number} height @param {number} lane @param {number} distance @param {boolean} down */
function bicycle(c, x, floor, height, lane, distance, down) {
  const ink = '#211e31';
  const color = TEAM[lane];
  const y = Math.round(floor - height);
  rect(c, '#2c293b', x - 16, floor + 1, 32, 2);
  if (down) {
    line(c, color, 3, [x - 14, floor - 2, x - 2, floor - 6, x + 12, floor - 2]);
    label(c, color, x - 19, floor - 14, 'CHAIN!', 9);
    return;
  }
  for (const offset of [-11, 12]) {
    disc(c, ink, x + offset, y - 7, 8);
    disc(c, '#b3b3c2', x + offset, y - 7, 6);
    disc(c, '#383649', x + offset, y - 7, 4.7);
    rect(c, '#d5ded8', x + offset - 1, y - 8, 2, 2);
  }
  line(c, color, 2.5, [x - 11, y - 7, x - 4, y - 18, x, y - 7, x + 8, y - 17, x - 4, y - 17, x - 11, y - 7, x, y - 7]);
  line(c, '#dadce1', 2, [x + 12, y - 7, x + 7, y - 23, x + 2, y - 23]);
  const kick = Math.round(Math.sin(distance / 10) * 3);
  line(c, '#192335', 4, [x - 5, y - 22, x + 2, y - 18, x - 1 + kick, y - 9]);
  line(c, '#ede6bc', 2, [x - 1 + kick, y - 9, x + 3 + kick, y - 9]);
  line(c, color, 6, [x - 6, y - 22, x - 3, y - 31]);
  rect(c, lane ? '#ce777e' : '#7080b1', x - 11, y - 32, 6, 9);
  const skin = lane ? '#a96b51' : '#e5a978';
  line(c, skin, 2, [x - 2, y - 29, x + 1, y - 24, x + 7, y - 23]);
  rect(c, skin, x - 3, y - 38, 7, 8);
  rect(c, ink, x - 5, y - 39, 7, 6);
  rect(c, color, x - 5, y - 40, 9, 3);
  rect(c, color, x + 3, y - 38, 4, 2);
}

/** @param {Brush} c @param {number} x @param {number} y @param {import('../../domain/mixtape.js').RoadItem['kind']} kind */
function itemArt(c, x, y, kind) {
  if (kind === 'tape') {
    rect(c, '#262135', x - 9, y - 37, 18, 12);
    rect(c, '#ffdb92', x - 8, y - 36, 16, 10);
    rect(c, '#bc637c', x - 6, y - 34, 12, 4);
    rect(c, '#fff2cd', x - 5, y - 33, 2, 2);
    rect(c, '#fff2cd', x + 3, y - 33, 2, 2);
    rect(c, '#986278', x - 4, y - 28, 8, 2);
  } else if (kind === 'cone') {
    for (let row = 0; row < 5; row++) rect(c, row === 2 ? '#fff0c9' : '#fa875b', x - row - 1, y - 15 + 3 * row, row * 2 + 2, 3);
    rect(c, '#d26a50', x - 8, y - 2, 16, 3);
  } else {
    rect(c, '#483544', x - 8, y - 14, 16, 15);
    rect(c, '#cf9268', x - 7, y - 13, 14, 12);
    line(c, '#885c53', 2, [x - 6, y - 3, x + 6, y - 12]);
    rect(c, '#f3c38b', x - 7, y - 13, 14, 2);
  }
}

/** @param {Brush} c @param {Ride} ride @param {boolean} reduced */
export function drawRide(c, ride, reduced) {
  neighborhood(c, ride, reduced);
  for (let lane = 0; lane < 2; lane++) {
    const floor = GROUND[lane];
    for (let i = Math.max(0, ride.cursor - 4); i < ROAD.length; i++) {
      const item = ROAD[i];
      const x = Math.round(BIKE_X[lane] + item.at - ride.distance);
      if (x > WIDTH + 12) break;
      if (item.lane === lane && x > -12 && (item.kind !== 'tape' || i >= ride.cursor)) itemArt(c, x, floor, item.kind);
    }
    const finishX = BIKE_X[lane] + FINISH - ride.distance;
    if (finishX < WIDTH) {
      for (let n = 0; n < 6; n++) rect(c, n % 2 ? '#302e44' : '#ffdfb1', finishX, floor - 18 + 4 * n, 6, 4);
    }
    const cyclist = ride.riders[lane];
    bicycle(c, BIKE_X[lane], floor, cyclist.height, lane, ride.distance, cyclist.down);
  }
}
