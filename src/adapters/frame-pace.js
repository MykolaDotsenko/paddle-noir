/**
 * Watches how often frames arrive while a game runs, to tell when a device cannot keep up
 * with the board at full sharpness. A device that can shows a frame every refresh, whatever
 * its refresh rate; one that cannot falls to a frame every other refresh, or worse, and stays
 * there. A gap long enough to be a pause, a hidden tab or a one-off hitch starts the count
 * over, so only a steady shortfall counts.
 */
export class FramePace {
  /**
   * @param {object} [options]
   * @param {number} [options.frames] how many frames make a verdict
   * @param {number} [options.slowMs] the average gap between frames that is too slow
   * @param {number} [options.gapMs] a gap at least this long is not a frame but a break
   */
  constructor({ frames = 90, slowMs = 1000 / 45, gapMs = 250 } = {}) {
    this.frames = frames;
    this.slowMs = slowMs;
    this.gapMs = gapMs;
    /** @type {number | null} */
    this.last = null;
    this.total = 0;
    this.count = 0;
  }

  /**
   * A frame has come.
   *
   * @param {number} now milliseconds
   * @returns {boolean} whether the frames, counted to here, came too slowly
   */
  slow(now) {
    if (this.last !== null) {
      const gap = now - this.last;

      if (gap >= this.gapMs || gap < 0) {
        this.total = 0;
        this.count = 0;
      } else {
        this.total += gap;
        this.count += 1;
      }
    }

    this.last = now;

    if (this.count < this.frames) {
      return false;
    }

    const slow = this.total / this.count > this.slowMs;
    this.total = 0;
    this.count = 0;
    return slow;
  }

  /** Frames have stopped coming for now, as in a pause or between matches. */
  rest() {
    this.last = null;
    this.total = 0;
    this.count = 0;
  }
}
