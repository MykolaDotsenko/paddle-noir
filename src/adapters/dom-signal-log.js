import { fragmentsIn } from '../application/hangar.js';

/**
 * @import { PreferencesPort } from '../application/ports.js'
 */

/**
 * @typedef {object} LogChapter a chapter of the Warp story, as the log shows it
 * @property {string} title
 * @property {string} mission
 * @property {string} fragment its piece of HORIZON's message, decoded
 */

/**
 * The Signal Log of the Warp game: a dialog that opens from the menu and keeps the story
 * between cups. Each chapter's fragment of HORIZON's message, once its mission has been
 * flown in any cup, stays decoded here for good; the rest wait, encrypted, with the mission
 * that recovers them. Recovering every one earns a decal in the hangar.
 */
export class DomSignalLog {
  /**
   * @param {object} options
   * @param {HTMLElement} options.root element containing the whole game UI
   * @param {readonly LogChapter[]} options.story the chapters, in order
   * @param {readonly { fragments?: number }[]} options.decals the hangar's decals, one of them earned from the story
   * @param {PreferencesPort} options.preferences
   */
  constructor({ root, story, decals, preferences }) {
    this.root = root;
    this.story = story;
    /** How many fragments earn the decal. */
    this.reward = decals.find((decal) => decal.fragments !== undefined)?.fragments ?? story.length;
    this.preferences = preferences;
    this.dialog = /** @type {HTMLDialogElement} */ (this.find('[data-overlay="signal"]'));
    /** @type {Array<[HTMLElement, EventListener]>} */
    this.listeners = [];
  }

  /**
   * @param {string} selector
   * @returns {HTMLElement}
   */
  find(selector) {
    const element = this.root.querySelector(selector);

    if (!element) {
      throw new Error(`Paddle Noir could not start because ${selector} is missing from the page.`);
    }

    return /** @type {HTMLElement} */ (element);
  }

  connect() {
    for (const [selector, open] of /** @type {const} */ ([['[data-show-signal]', true], ['[data-dismiss-signal]', false]])) {
      for (const button of /** @type {HTMLElement[]} */ ([...this.root.querySelectorAll(selector)])) {
        const listener = () => this.show(open);
        button.addEventListener('click', listener);
        this.listeners.push([button, listener]);
      }
    }
  }

  disconnect() {
    for (const [button, listener] of this.listeners) {
      button.removeEventListener('click', listener);
    }

    this.listeners = [];
  }

  /** @param {boolean} visible */
  show(visible) {
    const open = this.dialog.hasAttribute('open');

    if (visible && !open) {
      this.render();

      if (typeof this.dialog.showModal === 'function') {
        this.dialog.showModal();
      } else {
        this.dialog.setAttribute('open', '');
      }
    } else if (!visible && open) {
      if (typeof this.dialog.close === 'function') {
        this.dialog.close();
      } else {
        this.dialog.removeAttribute('open');
      }
    }
  }

  /** The log as it stands: read fresh, since a cup may have recovered a fragment since. */
  render() {
    const signal = this.preferences.get().signal ?? 0;
    const found = Math.min(this.story.length, fragmentsIn(signal));
    const list = this.find('[data-signal-entries]');
    const document = list.ownerDocument;
    const reward = this.find('[data-signal-reward]');

    this.find('[data-signal-summary]').textContent = `${found} of ${this.story.length} fragments recovered`;
    list.replaceChildren(...this.story.map((chapter, index) => {
      const recovered = (signal & (1 << index)) !== 0;
      const entry = document.createElement('li');
      const title = document.createElement('span');
      const text = document.createElement('span');

      entry.dataset.recovered = String(recovered);
      title.className = 'signal__title';
      title.textContent = `${recovered ? '◆' : '◇'} ${chapter.title}`;
      text.className = 'signal__text';
      text.textContent = recovered ? `“${chapter.fragment}”` : `Encrypted. Fly its mission to decode it: ${chapter.mission.toLowerCase()}.`;
      entry.replaceChildren(title, text);
      return entry;
    }));

    const earned = found >= this.reward;
    reward.dataset.earned = String(earned);
    reward.textContent = earned
      ? 'HORIZON is home. Its Signal decal waits on the hangar\'s paint bench.'
      : `Recover all ${this.reward} for the Signal decal in the hangar.`;
  }
}
