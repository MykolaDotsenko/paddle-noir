/**
 * OUTLAW LEAGUE — arcade race-side service, one-off rival bounties and live commentary.
 * Pure simulation: no browser APIs, timers, randomness, or new mandatory controls.
 * @import { GameEvent, WarpConfig, WarpState } from './types.js'
 */
const SERVICE_RELAYS = Object.freeze([1 / 3, 2 / 3]);
const BOUNTY_POINTS = 300;

/** @param {WarpState} race @param {WarpConfig} rules */
function resupply(race, rules) {
  race.rockets = Math.min(rules.loadout.rockets, race.rockets + 1);
  race.nitro = Math.min(rules.loadout.nitroBars, race.nitro + 1);
}

/**
 * Called after the plot update, once per simulation step. Story transmissions have
 * presentation priority; commentary remains queued briefly rather than cutting them off.
 * Distances are monotonic within a race, so crossing a relay cannot be farmed.
 * @param {WarpState} race
 * @param {WarpConfig} rules
 * @param {readonly GameEvent[]} events
 * @param {number} from distance at the start of this step
 * @param {number} seconds elapsed simulation time
 */
export function advanceWarpLeague(race, rules, events, from, seconds) {
  const story = race.story;
  if (race.finished) return;
  story.leagueTime = Math.max(0, story.leagueTime - seconds);
  const pilots = rules.courses[race.race].pilots;
  const target = pilots.length - 1;
  const bounty = pilots[target].name;
  let call = '';
  for (const fraction of SERVICE_RELAYS) {
    const relay = race.course.length * fraction;
    if (from < relay && race.z >= relay) {
      resupply(race, rules);
      call = 'SERVICE RELAY! Rockets and nitro topped up within capacity.';
    }
  }

  if (!story.bountyClaimed && events.some((event) => event.type === 'takedown' && event.pilot === target)) {
    story.bountyClaimed = true;
    race.points += BOUNTY_POINTS;
    resupply(race, rules);
    call = `BOUNTY CLAIMED: ${bounty}! +300 points and a supply refill.`;
  }

  if (!call && story.leagueTime === 0) {
    const marker = race.course.length * 0.12;
    if (from < marker && race.z >= marker && !story.bountyClaimed) {
      call = `OUTLAW BOUNTY: take down ${bounty} for 300 points and supplies!`;
    } else if (events.some((event) => event.type === 'final-stretch')) {
      call = 'FINAL STRETCH! Burn that fuel. Make the finish yours!';
    } else if (events.some((event) => event.type === 'takedown')) {
      call = 'RIVAL DOWN! That is how the Outlaw League races!';
    } else if (events.some((event) => event.type === 'overtake')) {
      call = `Up to P${race.place}! Keep the pressure on!`;
    } else if (events.some((event) => event.type === 'crash' && event.pilot === undefined)) {
      call = 'Still flying, rookie. Shields up and back into the fight!';
    }
  }
  if (call) {
    story.leagueCall = call;
    story.leagueTime = 6;
  }
}
