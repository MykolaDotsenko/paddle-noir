import { buyCraft, flyCraft, hangarView, paintCraft, TOP_RATING, tuneCraft } from '../application/hangar.js';

/**
 * @import { Loadout } from '../domain/types.js'
 * @import { CraftView, Wallet } from '../application/hangar.js'
 * @import { CraftSetup, CraftSystem, HangarCatalog, PreferencesPort } from '../application/ports.js'
 */

/** @typedef {'tune' | 'paint' | 'glow'} Bench */

/** @type {readonly Bench[]} */
const BENCHES = ['tune', 'paint', 'glow'];

/**
 * The hangar of the Warp game: a dialog that opens from the menu. One craft stands on show at
 * a time, with how its systems are rated; the arrows bring the next. A craft the player owns
 * is flown as soon as it is on show, so choosing one is just stopping on it; one they do not
 * own shows its price. On the tuning bench each system has a button for its next level; on
 * the paint bench the craft takes a paint and a decal, and on the third the light under it.
 *
 * Every purchase and choice is saved at once, and the game is told, so the menu behind the
 * dialog and the next cup already fly the craft as it now is.
 */
export class DomHangar {
  /**
   * @param {object} options
   * @param {HTMLElement} options.root element containing the whole game UI
   * @param {HangarCatalog} options.catalog
   * @param {PreferencesPort} options.preferences
   * @param {(canvas: HTMLCanvasElement, loadout: Loadout) => void} options.portrait draws a craft on the dialog's canvas
   * @param {() => void} options.onChange called once the player's hangar has changed
   */
  constructor({ root, catalog, preferences, portrait, onChange }) {
    this.root = root;
    this.catalog = catalog;
    this.preferences = preferences;
    this.portrait = portrait;
    this.onChange = onChange;
    /** The craft on show, by its place in the catalog. */
    this.shown = 0;
    /** @type {Bench} */
    this.bench = 'tune';
    this.dialog = /** @type {HTMLDialogElement} */ (this.find('[data-overlay="hangar"]'));
    this.canvas = /** @type {HTMLCanvasElement} */ (this.find('[data-hangar-canvas]'));
    /** @type {Array<[HTMLElement, string, EventListener]>} */
    this.listeners = [];
    /** @type {Map<CraftSystem, { name: HTMLElement, bar: HTMLElement, pips: HTMLElement[], button: HTMLElement }>} */
    this.rows = new Map();
    /** @type {Record<'paint' | 'decal' | 'glow', Map<string, HTMLElement>>} */
    this.looks = { paint: new Map(), decal: new Map(), glow: new Map() };
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

  /** @param {string} selector */
  findAll(selector) {
    return /** @type {HTMLElement[]} */ ([...this.root.querySelectorAll(selector)]);
  }

  /**
   * @param {HTMLElement} target
   * @param {EventListener} listener
   */
  listen(target, listener) {
    target.addEventListener('click', listener);
    this.listeners.push([target, 'click', listener]);
  }

  connect() {
    this.buildTuning();
    this.buildLooks();

    for (const button of this.findAll('[data-show-hangar]')) {
      this.listen(button, () => this.show(true));
    }

    for (const button of this.findAll('[data-dismiss-hangar]')) {
      this.listen(button, () => this.show(false));
    }

    for (const button of this.findAll('[data-hangar-step]')) {
      const step = Number(button.dataset.hangarStep);
      this.listen(button, () => this.step(step));
    }

    for (const button of this.findAll('[data-hangar-tab]')) {
      const bench = BENCHES.find((candidate) => candidate === button.dataset.hangarTab) ?? 'tune';
      this.listen(button, () => {
        this.bench = bench;
        this.render();
      });
    }

    this.listen(this.find('[data-hangar-buy]'), () => this.buy());
    this.show(false);
  }

  disconnect() {
    for (const [target, type, listener] of this.listeners) {
      target.removeEventListener(type, listener);
    }

    this.listeners = [];
  }

  /**
   * A row for each system: its name, a bar as long as the best a system can be, and the
   * button that tunes it a level up.
   */
  buildTuning() {
    const list = this.find('[data-hangar-systems]');
    const document = list.ownerDocument;
    /** @type {HTMLElement[]} */
    const rows = [];

    for (const system of /** @type {CraftSystem[]} */ (Object.keys(this.catalog.systems))) {
      const row = document.createElement('div');
      const name = document.createElement('span');
      const bar = document.createElement('span');
      const button = document.createElement('button');
      const pips = Array.from({ length: TOP_RATING }, () => document.createElement('i'));

      row.className = 'tune';
      name.className = 'tune__name';
      name.textContent = this.catalog.systems[system];
      bar.className = 'tune__bar';
      bar.setAttribute('role', 'img');
      bar.replaceChildren(...pips);
      button.className = 'tune__up';
      button.setAttribute('type', 'button');
      button.dataset.hangarTune = system;
      row.replaceChildren(name, bar, button);
      this.listen(button, () => this.tune(system));
      this.rows.set(system, { name, bar, pips, button });
      rows.push(row);
    }

    list.replaceChildren(...rows);
  }

  /** The paint benches: a chip for each paint, once for the hull and once for the light, and the decals. */
  buildLooks() {
    for (const part of /** @type {const} */ (['paint', 'decal', 'glow'])) {
      const list = this.find(`[data-hangar-${part}s]`);
      const document = list.ownerDocument;
      const offered = part === 'decal' ? this.catalog.decals : this.catalog.paints;
      /** @type {HTMLElement[]} */
      const buttons = [];

      for (const entry of offered) {
        const button = document.createElement('button');

        button.setAttribute('type', 'button');
        button.setAttribute('aria-pressed', 'false');
        button.dataset[part === 'paint' ? 'hangarPaint' : part === 'decal' ? 'hangarDecal' : 'hangarGlow'] = entry.id;

        if ('rgb' in entry && typeof entry.rgb === 'string') {
          button.className = 'swatch';
          button.setAttribute('aria-label', entry.name);
          button.setAttribute('title', entry.name);
          button.style.setProperty('--swatch', entry.rgb);
        } else {
          button.textContent = entry.name;
        }

        this.listen(button, () => this.paint({ [part]: entry.id }));
        this.looks[part].set(entry.id, button);
        buttons.push(button);
      }

      list.replaceChildren(...buttons);
    }
  }

  /** @returns {Wallet} */
  wallet() {
    const { tickets, hangar } = this.preferences.get();
    return { tickets, hangar };
  }

  /** @returns {CraftView[]} */
  crafts() {
    return hangarView(this.catalog, this.wallet());
  }

  /**
   * Saves a change to the player's hangar, tells the game, and shows it.
   *
   * @param {Wallet | null} wallet null when the change could not be made
   */
  keep(wallet) {
    if (wallet) {
      this.preferences.set({ tickets: wallet.tickets, hangar: wallet.hangar });
      this.onChange();
    }

    this.render();
  }

  /**
   * Opens the hangar on the craft the player flies, or closes it.
   *
   * @param {boolean} visible
   */
  show(visible) {
    const open = this.dialog.hasAttribute('open');

    if (visible && !open) {
      this.shown = Math.max(0, this.crafts().findIndex((craft) => craft.chosen));
      this.bench = 'tune';
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

  /**
   * Brings the previous or the next craft on show, round and round. One the player owns is
   * the craft they fly from then on.
   *
   * @param {number} step
   */
  step(step) {
    const crafts = this.crafts();

    this.shown = (this.shown + step + crafts.length) % crafts.length;
    const craft = crafts[this.shown];

    this.keep(craft.owned && !craft.chosen ? flyCraft(this.catalog, this.wallet(), craft.spec.id) : null);
  }

  buy() {
    this.keep(buyCraft(this.catalog, this.wallet(), this.crafts()[this.shown].spec.id));
  }

  /** @param {CraftSystem} system */
  tune(system) {
    this.keep(tuneCraft(this.catalog, this.wallet(), this.crafts()[this.shown].spec.id, system));
  }

  /** @param {Partial<Pick<CraftSetup, 'paint' | 'decal' | 'glow'>>} look */
  paint(look) {
    this.keep(paintCraft(this.catalog, this.wallet(), this.crafts()[this.shown].spec.id, look));
  }

  /** Shows the craft on show as it stands: its portrait, its systems, its paint, and what it costs. */
  render() {
    const { tickets } = this.wallet();
    const craft = this.crafts()[this.shown];
    const { spec, owned } = craft;
    const buy = this.find('[data-hangar-buy]');
    const short = spec.price - tickets;

    this.find('[data-hangar-wallet]').textContent = String(tickets);
    this.find('[data-hangar-name]').textContent = spec.name;
    this.find('[data-hangar-blurb]').textContent = spec.blurb;
    this.find('[data-hangar-tag]').textContent = owned ? 'Flying' : `${spec.price} tickets`;
    this.find('[data-hangar-tag]').classList.toggle('is-owned', owned);
    this.find('[data-hangar-place]').textContent = `${this.shown + 1}/${this.catalog.crafts.length}`;
    this.portrait(this.canvas, craft.loadout);

    buy.hidden = owned;
    buy.toggleAttribute('disabled', !craft.affordable);
    buy.textContent = craft.affordable ? `Buy · ${spec.price}` : `${short} tickets short`;

    for (const button of this.findAll('[data-hangar-tab]')) {
      button.setAttribute('aria-pressed', String(button.dataset.hangarTab === this.bench));
    }

    for (const bench of BENCHES) {
      this.find(`[data-hangar-bench="${bench}"]`).hidden = this.bench !== bench;
    }

    this.find('[data-hangar-locked]').hidden = owned || this.bench === 'tune';

    for (const entry of craft.systems) {
      const row = this.rows.get(entry.system);

      if (!row) {
        continue;
      }

      const { bar, pips, button } = row;

      bar.setAttribute('aria-label', `${entry.name} ${entry.rating} of ${TOP_RATING}`);
      pips.forEach((pip, index) => {
        // What the craft comes with, what tuning has added, and what is still to have.
        pip.className = index >= entry.rating ? '' : index >= entry.rating - entry.level ? 'is-tuned' : 'is-on';
      });

      button.hidden = !owned;
      button.toggleAttribute('disabled', !entry.affordable);
      button.textContent = entry.price === null ? 'Max' : `+ ${entry.price}`;
      button.setAttribute('aria-label', entry.price === null
        ? `${entry.name} is tuned all the way`
        : `Tune ${entry.name.toLowerCase()} to level ${entry.level + 1} of ${entry.levels} for ${entry.price} tickets`);
    }

    for (const part of /** @type {const} */ (['paint', 'decal', 'glow'])) {
      for (const [id, button] of this.looks[part]) {
        button.setAttribute('aria-pressed', String(craft.setup[part] === id));
        button.toggleAttribute('disabled', !owned);
      }
    }
  }
}
