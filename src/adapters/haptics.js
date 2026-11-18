/**
 * @import { GameEvent } from '../domain/types.js'
 * @import { FeedbackPort, PreferencesPort } from '../application/ports.js'
 */

/**
 * @param {GameEvent} event
 * @returns {number | number[] | null} a vibration pattern in milliseconds
 */
function patternFor(event) {
  switch (event.type) {
    case 'paddle-hit':
      if (event.side !== 'player') {
        return null;
      }

      // Firing a super thumps; answering one knocks harder than a plain return.
      return event.super ? [25, 30, 45] : event.saved ? 30 : 12;
    case 'super-ready':
      return event.side === 'player' ? [12, 40, 24] : null;
    case 'paddle-graze':
      return event.side === 'player' ? 6 : null;
    case 'point':
      return event.scorer === 'player' ? [18, 40, 18] : 45;
    case 'hazard-hit':
      return 35;
    // In Bricks a brick breaks several times a second, so only what stands out is felt.
    case 'blast':
      return 40;
    case 'strike':
      return [20, 30, 40];
    case 'drop':
      return 15;
    case 'shield-save':
      return 30;
    case 'level-clear':
    case 'sector-clear':
      return [30, 50, 30];
    // In Nova the ship fires and enemies go down several times a second: only the big ones are felt.
    case 'ship-hit':
      return 70;
    case 'enemy-down':
      return event.kind === 'boss' ? [40, 40, 80, 40, 120] : event.kind === 'gunship' ? 20 : null;
    case 'loot':
      return 15;
    case 'super-fire':
      return [25, 30, 45];
    case 'enemy-arrive':
      return [20, 60, 20, 60, 20];
    case 'game-over':
      return event.winner === 'player' ? [30, 60, 30, 60, 120] : [160];
    default:
      return null;
  }
}

/**
 * Short vibrations for the player's own hits and for points, where the device supports it.
 *
 * @implements {FeedbackPort}
 */
export class Haptics {
  /**
   * @param {object} options
   * @param {{ vibrate?: (pattern: number | number[]) => boolean }} options.navigator
   * @param {PreferencesPort} options.preferences
   */
  constructor({ navigator, preferences }) {
    this.navigator = navigator;
    this.preferences = preferences;
  }

  get supported() {
    return typeof this.navigator.vibrate === 'function';
  }

  /** @param {readonly GameEvent[]} events */
  handle(events) {
    if (!this.supported || !this.preferences.get().vibration) {
      return;
    }

    for (const event of events) {
      const pattern = patternFor(event);

      if (pattern !== null) {
        this.navigator.vibrate?.(pattern);
      }
    }
  }
}
