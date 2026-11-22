import { flowOf, WARP_ABILITIES } from '../../domain/warp.js';
import { WARP_STORY } from '../../domain/warp-story.js';
import { FONT, roundedRect, THEME } from './theme.js';

/**
 * What is written over a Warp race: the place, with the worst place that goes through, and
 * under it what the craft has to fight with (the nitro in its tank, the rockets aboard, the
 * shields up); how far along the course everyone is; the speed; and the flow, once tricks
 * multiply. Before a race the course's name and the start lights; after it, the order everyone
 * came in and whether the player goes through. Nothing here is the pure white kept for the ball.
 *
 * @import { GameConfig, GameState, WarpConfig, WarpState } from '../../domain/types.js'
 */

/** Displayed speed, a share of the meters a second. */
const KMH = 16;
/** How wide the place figure stands, P and a digit, at its size. */
const PLACE_WIDTH = 54;
const PAPER = 'rgba(248, 250, 252, 0.95)';
const NITRO = '125, 211, 252';
const ROCKET = '251, 146, 60';
const SHIELD = '96, 165, 250';

/**
 * @param {number} place
 * @returns {string} 1ST, 2ND, 3RD, 4TH
 */
export function ordinal(place) {
  return `${place}${place === 1 ? 'ST' : place === 2 ? 'ND' : place === 3 ? 'RD' : 'TH'}`;
}

/**
 * @param {number} value
 * @param {number} min
 * @param {number} max
 */
function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

/**
 * @param {CanvasRenderingContext2D} ctx
 * @param {GameState} state
 * @param {GameConfig} config
 * @param {number} pop 1 right after a change of place, settling to 0
 */
export function drawWarpHud(ctx, state, config, pop) {
  const race = state.warp;
  const rules = config.warp;

  if (!race || !rules) {
    return;
  }

  const layout = rules.courses[race.race];
  const through = race.place <= layout.qualify;
  const placeRgb = race.place === 1 ? THEME.amber : through ? THEME.side.player.rgb : THEME.rose;

  // The place.
  ctx.save();
  ctx.textBaseline = 'alphabetic';
  ctx.textAlign = 'left';
  ctx.translate(18, 60);
  ctx.scale(1 + pop * 0.25, 1 + pop * 0.25);
  ctx.fillStyle = `rgb(${placeRgb})`;
  ctx.font = `900 40px ${FONT}`;
  ctx.fillText(`P${race.place}`, 0, 0);
  ctx.font = `800 14px ${FONT}`;
  ctx.fillStyle = `rgba(${THEME.text}, 0.8)`;
  ctx.fillText(`/${race.rivals.length + 1}`, PLACE_WIDTH, 0);
  ctx.restore();

  ctx.save();
  ctx.font = `800 10px ${FONT}`;
  ctx.textAlign = 'left';
  ctx.fillStyle = `rgba(${THEME.text}, 0.75)`;
  ctx.fillText(layout.qualify === 1 ? 'WIN TO GO THROUGH' : `TOP ${layout.qualify} GO THROUGH`, 18, 76);

  // The speed.
  ctx.textAlign = 'right';
  ctx.font = `900 30px ${FONT}`;
  ctx.fillStyle = race.speed > rules.topSpeed + 1 ? `rgb(${THEME.amber})` : `rgba(${THEME.side.player.rgb}, 0.95)`;
  ctx.fillText(String(Math.round(race.speed * KMH)), config.width - 18, 52);
  ctx.font = `800 10px ${FONT}`;
  ctx.fillStyle = `rgba(${THEME.text}, 0.75)`;
  ctx.fillText('KM/H', config.width - 18, 66);

  drawFlow(ctx, race, rules, config);
  drawProgress(ctx, race, rules, config);
  drawArsenal(ctx, race, rules);
  ctx.restore();

  if (state.serveCountdown > 0 && state.serveNumber === 0) {
    drawStartLights(ctx, state, config, layout.name, layout.qualify, race.race);
  } else if (race.finished && race.calm > 0) {
    drawResults(ctx, race, rules, config);
  }
}

/**
 * What the craft has to fight with, under its place: a bar for each bar of nitro its tank
 * holds, as full as it is, and a line under them that runs down while one burns; then a rocket
 * for each it can carry, lit if it is aboard; and a diamond for each shield still up.
 *
 * @param {CanvasRenderingContext2D} ctx
 * @param {WarpState} race
 * @param {WarpConfig} rules
 */
function drawArsenal(ctx, race, rules) {
  const { loadout } = rules;
  const left = 18;
  const top = 88;
  const ready = race.nitro >= 1;

  ctx.textAlign = 'left';
  ctx.font = `800 9px ${FONT}`;
  ctx.fillStyle = `rgba(${NITRO}, ${ready ? 1 : 0.6})`;
  ctx.fillText('NITRO', left, top + 7);

  for (let bar = 0; bar < loadout.nitroBars; bar += 1) {
    const x = left + 36 + bar * 17;
    const full = clamp(race.nitro - bar, 0, 1);

    ctx.fillStyle = `rgba(${NITRO}, 0.2)`;
    ctx.fillRect(x, top, 14, 7);
    ctx.fillStyle = `rgba(${NITRO}, ${full >= 1 ? 1 : 0.55})`;
    ctx.fillRect(x, top, 14 * full, 7);
  }

  if (race.nitroBurn > 0) {
    ctx.fillStyle = `rgb(${THEME.amber})`;
    ctx.fillRect(left + 36, top + 9, (loadout.nitroBars * 17 - 3) * clamp(race.nitroBurn / loadout.nitroSeconds, 0, 1), 2);
  }

  // The rockets: a body and a nose each.
  for (let rocket = 0; rocket < loadout.rockets; rocket += 1) {
    const x = left + rocket * 13;
    const aboard = rocket < race.rockets;

    ctx.fillStyle = aboard ? `rgb(${ROCKET})` : `rgba(${ROCKET}, 0.22)`;
    ctx.beginPath();
    ctx.moveTo(x, top + 30);
    ctx.lineTo(x, top + 21);
    ctx.lineTo(x + 3.5, top + 16);
    ctx.lineTo(x + 7, top + 21);
    ctx.lineTo(x + 7, top + 30);
    ctx.closePath();
    ctx.fill();
  }

  for (let shield = 0; shield < race.shield; shield += 1) {
    const x = left + loadout.rockets * 13 + 10 + shield * 14;

    ctx.fillStyle = `rgb(${SHIELD})`;
    ctx.beginPath();
    ctx.moveTo(x + 5, top + 16);
    ctx.lineTo(x + 10, top + 23);
    ctx.lineTo(x + 5, top + 30);
    ctx.lineTo(x, top + 23);
    ctx.closePath();
    ctx.fill();
  }

  // One cockpit indicator for the craft's signature system, independent of nitro.
  const signature = WARP_ABILITIES[loadout.kind];
  const seconds = Math.max(0, race.abilityCooldown);
  const charged = seconds === 0;
  ctx.font = `800 9px ${FONT}`;
  ctx.textAlign = 'left';
  ctx.fillStyle = race.abilityTime > 0 ? `rgb(${THEME.lime})`
    : charged ? `rgb(${THEME.side.player.rgb})` : `rgba(${THEME.text}, 0.63)`;
  ctx.fillText(`${signature.name} · ${race.abilityTime > 0 ? 'ACTIVE' : charged ? 'READY' : Math.ceil(seconds) + 's'}`, left, top + 47);
  ctx.fillStyle = 'rgba(125, 211, 252, 0.16)';
  ctx.fillRect(left, top + 51, 112, 3);
  ctx.fillStyle = `rgba(125, 211, 252, ${charged ? 0.96 : 0.55})`;
  ctx.fillRect(left, top + 51, 112 * (1 - Math.min(1, seconds / signature.cooldown)), 3);
}

/**
 * The flow: what a trick now scores times, once it is more than one, and how near the next
 * step is. It turns amber at its highest.
 *
 * @param {CanvasRenderingContext2D} ctx
 * @param {WarpState} race
 * @param {WarpConfig} rules
 * @param {GameConfig} config
 */
function drawFlow(ctx, race, rules, config) {
  const times = flowOf(race, rules);

  if (times < 2) {
    return;
  }

  const top = times >= rules.maxFlow;
  const rgb = top ? THEME.amber : THEME.lime;
  const right = config.width - 18;

  ctx.textAlign = 'right';
  ctx.font = `900 20px ${FONT}`;
  ctx.fillStyle = `rgb(${rgb})`;
  ctx.fillText(`FLOW ×${times}`, right, 94);

  // A pip for each trick toward the next step.
  for (let pip = 0; pip < rules.flowStep; pip += 1) {
    ctx.fillStyle = top || pip < race.flow % rules.flowStep ? `rgb(${rgb})` : `rgba(${rgb}, 0.25)`;
    ctx.fillRect(right - (rules.flowStep - pip) * 11 + 3, 100, 8, 3);
  }
}

/**
 * How far along the course everyone is: a dot a rival, in its color, and the player's marker.
 *
 * @param {CanvasRenderingContext2D} ctx
 * @param {WarpState} race
 * @param {WarpConfig} rules
 * @param {GameConfig} config
 */
function drawProgress(ctx, race, rules, config) {
  const layout = rules.courses[race.race];
  const left = 120;
  const width = config.width - 240;
  const top = 34;
  /** @param {number} z */
  const along = (z) => left + clamp(z / race.course.length, 0, 1) * width;

  ctx.fillStyle = 'rgba(165, 180, 252, 0.18)';
  roundedRect(ctx, left, top - 2, width, 4, 2);
  ctx.fill();
  ctx.fillStyle = `rgba(${THEME.side.player.rgb}, 0.5)`;
  roundedRect(ctx, left, top - 2, Math.max(4, along(race.z) - left), 4, 2);
  ctx.fill();

  for (const rival of race.rivals) {
    ctx.fillStyle = `rgb(${layout.pilots[rival.pilot].rgb})`;
    ctx.beginPath();
    ctx.arc(along(rival.z), top, 3.5, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.fillStyle = THEME.side.player.core;
  ctx.beginPath();
  ctx.moveTo(along(race.z), top - 8);
  ctx.lineTo(along(race.z) + 5, top + 3);
  ctx.lineTo(along(race.z) - 5, top + 3);
  ctx.closePath();
  ctx.fill();

  ctx.font = `800 10px ${FONT}`;
  ctx.textAlign = 'center';
  ctx.fillStyle = `rgba(${THEME.text}, 0.8)`;
  ctx.fillText(`RACE ${race.race + 1}/${rules.courses.length} · ${layout.name.toUpperCase()}`, config.width / 2, top + 20);
}

/**
 * Before a race: its name, how well to place, and three lights that come on one a second.
 *
 * @param {CanvasRenderingContext2D} ctx
 * @param {GameState} state
 * @param {GameConfig} config
 * @param {string} name
 * @param {number} qualify
 */
function drawStartLights(ctx, state, config, name, qualify, raceIndex = 0) {
  const lit = Math.min(3, Math.floor(config.startDelaySeconds - state.serveCountdown) + 1);
  const x = config.width / 2;
  const y = 150;

  ctx.save();
  ctx.textAlign = 'center';
  ctx.font = `900 30px ${FONT}`;
  ctx.fillStyle = PAPER;
  ctx.fillText(name.toUpperCase(), x, y - 36);
  ctx.font = `800 12px ${FONT}`;
  ctx.fillStyle = `rgba(${THEME.amber}, 0.95)`;
  ctx.fillText(qualify === 1 ? 'WIN IT TO TAKE THE CUP' : `FINISH IN THE TOP ${qualify} TO GO THROUGH`, x, y - 16);
  ctx.fillStyle = 'rgba(5, 6, 15, 0.85)';
  roundedRect(ctx, x - 66, y, 132, 40, 10);
  ctx.fill();

  for (let light = 0; light < 3; light += 1) {
    ctx.fillStyle = light < lit ? `rgb(${THEME.red})` : 'rgba(239, 68, 68, 0.15)';
    ctx.beginPath();
    ctx.arc(x - 40 + light * 40, y + 20, 13, 0, Math.PI * 2);
    ctx.fill();
  }

  const chapter = WARP_STORY[raceIndex];
  if (chapter) {
    ctx.font = `900 11px ${FONT}`;
    ctx.fillStyle = `rgba(${THEME.side.player.rgb}, 0.95)`;
    ctx.fillText(chapter.title, x, y + 67);
    ctx.font = `750 10px ${FONT}`;
    ctx.fillStyle = PAPER;
    ctx.fillText(`OPTIONAL: ${chapter.mission.toUpperCase()}`, x, y + 84);
  }

  ctx.restore();
}

/**
 * The order of a race as it stands once the player is over the line: those who have finished
 * by their times, then the rest by how far along they are.
 *
 * @param {WarpState} race
 * @param {WarpConfig} rules
 * @returns {{ name: string, rgb: string, time: number, own: boolean }[]}
 */
export function standings(race, rules) {
  const { pilots } = rules.courses[race.race];
  const racers = [
    { name: 'YOU', rgb: THEME.side.player.rgb, time: race.finishTime, z: race.z, own: true },
    ...race.rivals.map((rival) => ({ name: pilots[rival.pilot].name.toUpperCase(), rgb: pilots[rival.pilot].rgb, time: rival.finish, z: rival.z, own: false })),
  ];

  return racers.sort((a, b) => (a.time || Infinity) - (b.time || Infinity) || b.z - a.z);
}

/**
 * After the line: the place and what it earned, the order everyone came in with how far behind
 * the winner each was, and whether the player goes through.
 *
 * @param {CanvasRenderingContext2D} ctx
 * @param {WarpState} race
 * @param {WarpConfig} rules
 * @param {GameConfig} config
 */
function drawResults(ctx, race, rules, config) {
  const x = config.width / 2;
  const top = 112;
  const qualified = !race.retry;
  const next = rules.courses[race.race + 1];
  const rgb = race.place === 1 ? THEME.amber : qualified ? THEME.side.player.rgb : THEME.rose;
  const order = standings(race, rules);
  const best = order[0].time;

  ctx.save();
  ctx.fillStyle = 'rgba(5, 6, 15, 0.8)';
  roundedRect(ctx, x - 150, top, 300, 232, 16);
  ctx.fill();
  ctx.strokeStyle = `rgba(${rgb}, 0.7)`;
  ctx.lineWidth = 1.5;
  ctx.stroke();
  ctx.textAlign = 'center';
  ctx.font = `900 40px ${FONT}`;
  ctx.fillStyle = `rgb(${rgb})`;
  ctx.fillText(ordinal(race.place), x, top + 44);
  ctx.font = `800 12px ${FONT}`;
  ctx.fillStyle = PAPER;
  ctx.fillText(`+${rules.placePoints[race.place - 1] ?? 0} POINTS`, x, top + 62);

  order.forEach((racer, index) => {
    const y = top + 86 + index * 19;

    if (racer.own) {
      ctx.fillStyle = `rgba(${THEME.side.player.rgb}, 0.16)`;
      roundedRect(ctx, x - 132, y - 13, 264, 18, 6);
      ctx.fill();
    }

    ctx.font = `800 12px ${FONT}`;
    ctx.textAlign = 'left';
    ctx.fillStyle = `rgba(${THEME.text}, 0.8)`;
    ctx.fillText(String(index + 1), x - 122, y);
    ctx.fillStyle = `rgb(${racer.rgb})`;
    ctx.fillText(racer.name, x - 100, y);
    ctx.textAlign = 'right';
    ctx.fillStyle = `rgba(${THEME.text}, 0.9)`;
    ctx.fillText(racer.time === 0 ? '…' : index === 0 ? `${racer.time.toFixed(1)}s` : `+${(racer.time - best).toFixed(2)}`, x + 122, y);
  });

  ctx.textAlign = 'center';
  ctx.font = `800 12px ${FONT}`;
  ctx.fillStyle = `rgba(${rgb}, 0.95)`;
  ctx.fillText(qualified ? (next ? `THROUGH · NEXT: ${next.name.toUpperCase()}` : 'CUP WON!') : 'NOT THROUGH · ONE MORE GO', x, top + 216);
  ctx.restore();
}
