/**
 * The cameo: when a person fires a super, the arcade's sound man leans in from the side of the
 * court, headphones on, and whoops, a parody of a fighting game's best-known easter egg. It is
 * one of the fun extras, so it needs the `jokes` preference. It comes once a match, with the
 * first super a person fires, and never for the computer's: a surprise wears thin when it
 * keeps happening. The renderer and the sound board decide from this one place, each keeping
 * its own count of the match, so they agree.
 *
 * @import { GameConfig, GameEvent, Side } from '../domain/types.js'
 */

/** How long he stays; like a finisher, it is over in little more than a second. */
export const CAMEO_SECONDS = 1.1;

/** What he says. */
export const CAMEO_WORD = 'WHOOPEE!';

/**
 * @param {GameEvent} event
 * @param {GameConfig} config
 * @param {boolean} jokes the fun extras preference
 * @returns {Side | null} whose super brings the cameo, if this event is one fired by a person
 */
export function cameoSide(event, config, jokes) {
  // In Nova the ship fires its super on its own, with no paddle-hit to carry it.
  if (jokes && event.type === 'super-fire') {
    return 'player';
  }

  if (!jokes || event.type !== 'paddle-hit' || !event.super) {
    return null;
  }

  return event.side === 'player' || config.opponent.controller === 'human' ? event.side : null;
}

/** Follows a match's events and lets the cameo through once, on the first super a person fires. */
export class CameoCue {
  constructor() {
    this.shown = false;
  }

  /**
   * @param {GameEvent} event
   * @param {GameConfig} config
   * @param {boolean} jokes
   * @returns {Side | null} the side the cameo comes for with this event, or null
   */
  take(event, config, jokes) {
    if (event.type === 'match-start') {
      this.shown = false;
      return null;
    }

    const side = this.shown ? null : cameoSide(event, config, jokes);
    this.shown ||= side !== null;
    return side;
  }
}
