import { MAX_STARS } from '../application/career.js';
import { hitsToPass, INITIALS_LENGTH, standing, validInitials } from '../application/high-scores.js';
import { DIFFICULTIES, GAME_COMMAND, MODES } from '../application/ports.js';
import { GAME_PHASE } from '../domain/game.js';
import { finisherApplies, FINISHER_SECONDS } from './finisher.js';

/**
 * @import { GamePhase, Side } from '../domain/types.js'
 * @import {
 *   CareerView,
 *   CommandHandler,
 *   Difficulty,
 *   GameCommand,
 *   HighScoreRow,
 *   HighScoresView,
 *   Mode,
 *   Presentation,
 *   PreferencesPort,
 *   TrackId,
 *   ViewPort,
 *   WarpView,
 * } from '../application/ports.js'
 */

/** @type {readonly string[]} */
const COMMANDS = Object.values(GAME_COMMAND);
const DIFFICULTY_LABELS = Object.freeze({ easy: 'Easy', normal: 'Normal', hard: 'Hard' });
const PLAYER_LABELS = Object.freeze({ solo: 'You', rush: 'Hits', duo: 'P1', career: 'You', bricks: 'Score', nova: 'Score', warp: 'Score' });
/** The modes in which the scoreboard names the player, by their initials once they have signed. */
const NAMES_PLAYER = Object.freeze({ solo: true, rush: false, duo: false, career: true, bricks: false, nova: false, warp: false });
const TOGGLE_SETTINGS = /** @type {const} */ (['sound', 'music', 'vibration', 'powerUps', 'supers', 'jokes']);
/** Where the arcade's "Continue?" countdown starts, a second a step, after a loss. */
const CONTINUE_FROM = 9;
/**
 * How long the versus card stays up as a career match starts. It rides the countdown, which
 * waits for nothing, and is gone half-way through it, so the court is clear well before the serve.
 */
const VERSUS_SECONDS = 1.5;

/**
 * @typedef {typeof TOGGLE_SETTINGS[number]} ToggleSetting
 * @typedef {object} Device
 * @property {boolean} canShare
 * @property {boolean} canFullscreen
 * @property {(text: string) => Promise<'shared' | 'copied' | 'cancelled' | 'failed'>} share
 * @property {() => Promise<void>} toggleFullscreen
 */

/**
 * The HTML around the board: the HUD, the menu with its modes, the tutorial, settings and
 * high-score dialogs, the versus card, and the pause and result overlays. Controls declare
 * what they do with data attributes: data-command sends a game command, data-mode and
 * data-difficulty pick the next match, data-setting toggles a preference such as sound, and
 * data-track picks the next music track.
 *
 * @implements {ViewPort}
 */
export class DomGameView {
  /**
   * @param {object} options
   * @param {HTMLElement} options.root element containing the whole game UI
   * @param {HTMLElement} options.board receives focus after a command, so Space and arrows reach the game
   * @param {PreferencesPort} options.preferences
   * @param {boolean} options.canVibrate hides the vibration setting where it would do nothing
   * @param {Device} options.device sharing and full screen, hidden where unsupported
   * @param {readonly { id: TrackId, label: string }[]} options.tracks the music tracks, in the order the track button cycles
   * @param {(track: TrackId) => void} options.previewTrack plays a short sample of the chosen track
   * @param {{ setTimeout: typeof setTimeout, clearTimeout: typeof clearTimeout }} options.timers
   */
  constructor({ root, board, preferences, canVibrate, device, tracks, previewTrack, timers }) {
    this.root = root;
    this.board = board;
    this.preferences = preferences;
    this.canVibrate = canVibrate;
    this.device = device;
    this.tracks = tracks;
    this.previewTrack = previewTrack;
    this.timers = timers;
    /**
     * While the finisher plays, the result screen waits; a tap or key brings it at once.
     * @type {ReturnType<typeof setTimeout> | null}
     */
    this.resultDelay = null;
    /** @type {ReturnType<typeof setTimeout> | null} the next step of the "Continue?" countdown */
    this.continueTimer = null;
    /** @type {ReturnType<typeof setTimeout> | null} when the versus card goes */
    this.versusTimer = null;
    /** The letters typed so far while signing the high-score table. */
    this.typed = '';
    /** The initials the scoreboard was last drawn with. */
    this.shownInitials = '';
    this.status = this.find('[data-game-status]');
    this.scores = { player: this.find('[data-score="player"]'), opponent: this.find('[data-score="opponent"]') };
    this.overlays = {
      menu: this.find('[data-overlay="menu"]'),
      tutorial: this.find('[data-overlay="tutorial"]'),
      settings: this.find('[data-overlay="settings"]'),
      scores: this.find('[data-overlay="scores"]'),
      pause: this.find('[data-overlay="pause"]'),
      over: this.find('[data-overlay="over"]'),
    };
    this.pauseButton = this.find('[data-hud-pause]');
    /** The starship bridge is only present in layouts that support Warp. */
    this.bridgeButtons = /** @type {HTMLButtonElement[]} */ (this.findAll('[data-warp-control]'));
    this.bridgePanels = this.findAll('[data-warp-console]');
    /** Optional in lightweight non-Warp host layouts. */
    this.steeringSwitch = /** @type {HTMLButtonElement | null} */ (this.root.querySelector('[data-warp-steering-switch]'));
    this.steeringButtons = this.findAll('[data-warp-steer]');
    this.flightStickIndicator = /** @type {HTMLElement | null} */ (this.root.querySelector('[data-flight-stick]'));
    this.storyMission = /** @type {HTMLElement | null} */ (this.root.querySelector('[data-warp-mission]'));
    this.storyRadio = /** @type {HTMLElement | null} */ (this.root.querySelector('[data-warp-radio]'));
    this.storyEnding = /** @type {HTMLElement | null} */ (this.root.querySelector('[data-warp-ending]'));
    this.lives = this.find('[data-lives]');
    this.matchPoint = this.find('[data-match-point]');
    this.continueLine = this.find('[data-continue]');
    this.versus = this.find('[data-versus]');
    /** @type {Presentation | null} */
    this.rendered = null;
    /**
     * The presentation being rendered right now, for the phase change it may bring.
     * @type {Presentation | null}
     */
    this.pending = null;
    /** @type {Presentation | null} */
    this.lastResult = null;
    /** @type {Array<[HTMLElement, string, EventListener]>} */
    this.listeners = [];
    /** @type {CommandHandler} */
    this.commandHandler = () => {};
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

  /** @param {CommandHandler} handler */
  onCommand(handler) {
    this.commandHandler = handler;
  }

  connect() {
    for (const button of this.findAll('[data-command]')) {
      const command = button.dataset.command ?? '';

      if (!COMMANDS.includes(command)) {
        continue;
      }

      const send = () => {
        // Bring the whole court into view, since scrolling locks while a match runs.
        this.root.scrollIntoView?.({ block: 'nearest' });
        // Hand focus back to the board. A focused button would otherwise swallow Space
        // (re-activating itself) instead of letting it pause or resume the match.
        this.board.focus({ preventScroll: true });
        this.commandHandler(/** @type {GameCommand} */ (command));
      };

      if (!button.hasAttribute('data-warp-control')) {
        this.listen(button, send);
        continue;
      }

      // A bridge control acts the moment a finger lands on it. A phone makes no click of a
      // second finger's tap, and a thumb on a bridge control usually is a second finger, the
      // first one holding a steering button or the stick. A click still comes from the
      // keyboard and from assistive technology, which press no pointer (its detail is 0);
      // a pointer's own click, after the press already acted, only hands the focus back.
      this.listen(button, (event) => {
        const press = /** @type {PointerEvent} */ (event);

        if (press.button === 0 || press.pointerType === 'touch' || press.pointerType === 'pen') {
          event.preventDefault();
          send();
        }
      }, 'pointerdown');
      this.listen(button, (event) => {
        if (/** @type {MouseEvent} */ (event).detail === 0) {
          send();
        } else {
          this.board.focus({ preventScroll: true });
        }
      });
    }

    for (const button of this.findAll('[data-mode]')) {
      const mode = MODES.find((candidate) => candidate === button.dataset.mode);

      if (mode) {
        this.listen(button, () => {
          this.preferences.set({ mode });
          this.showChoices();
          // The menu's status line and layout depend on the mode, so redraw it right away.
          this.commandHandler(GAME_COMMAND.RESET);
        });
      }
    }

    for (const button of this.findAll('[data-difficulty]')) {
      const level = DIFFICULTIES.find((difficulty) => difficulty === button.dataset.difficulty);

      if (level) {
        this.listen(button, () => {
          this.preferences.set({ difficulty: level });
          this.showChoices();
        });
      }
    }

    for (const button of this.findAll('[data-rival-step]')) {
      const step = Number(button.dataset.rivalStep);
      this.listen(button, () => this.stepRival(step));
    }

    for (const button of this.findAll('[data-setting]')) {
      const setting = TOGGLE_SETTINGS.find((candidate) => candidate === button.dataset.setting);

      if (setting) {
        this.listen(button, () => {
          this.preferences.set({ [setting]: !this.preferences.get()[setting] });
          this.showSettings();
        });
      }
    }

    for (const button of this.findAll('[data-track]')) {
      this.listen(button, () => this.nextTrack());
    }

    // While the finisher plays, a tap anywhere on the court brings the result screen. On the
    // click rather than the press: a press that brought the screen up could land its click
    // on the button that appears under the finger.
    this.listen(this.root, () => this.revealResult());
    this.listen(this.root, (event) => this.skipFinisherByKey(/** @type {KeyboardEvent} */ (event)), 'keydown');

    for (const button of this.findAll('[data-show-tutorial]')) {
      this.listen(button, () => this.showTutorial(true));
    }

    for (const button of this.findAll('[data-dismiss-tutorial]')) {
      this.listen(button, () => this.showTutorial(false));
    }

    // Escape closes the dialog natively, the button through showTutorial; either way the
    // player has seen it. Escape fires 'cancel' at once and 'close' only in a later task, so
    // listening to both saves the choice even if the page is left right away.
    this.listen(this.overlays.tutorial, () => this.markTutorialSeen(), 'cancel');
    this.listen(this.overlays.tutorial, () => this.markTutorialSeen(), 'close');

    for (const button of this.findAll('[data-show-settings]')) {
      this.listen(button, () => this.showSettingsDialog(true));
    }

    for (const button of this.findAll('[data-dismiss-settings]')) {
      this.listen(button, () => this.showSettingsDialog(false));
    }

    // The high-score table opens from its card in the menu and from the standing on the result
    // screen, where a player who has not signed it yet goes straight to the letters.
    for (const button of this.findAll('[data-show-scores]')) {
      this.listen(button, () => this.showScores(true, button.hasAttribute('data-over-scores') && this.canSign()));
    }

    for (const button of this.findAll('[data-dismiss-scores]')) {
      this.listen(button, () => this.showScores(false));
    }

    for (const button of this.findAll('[data-sign-open]')) {
      this.listen(button, () => this.showSigning(true));
    }

    for (const button of this.findAll('[data-sign-cancel]')) {
      this.listen(button, () => this.showSigning(false));
    }

    for (const button of this.findAll('[data-sign-ok]')) {
      this.listen(button, () => this.sign());
    }

    for (const button of this.findAll('[data-letter]')) {
      this.listen(button, () => this.type(this.typed + (button.dataset.letter ?? '')));
    }

    for (const button of this.findAll('[data-letter-delete]')) {
      this.listen(button, () => this.type(this.typed.slice(0, -1)));
    }

    this.listen(this.overlays.scores, (event) => this.typeByKey(/** @type {KeyboardEvent} */ (event)), 'keydown');
    // However the dialog closes, it opens on the table next time.
    this.listen(this.overlays.scores, () => this.showSigning(false), 'close');

    for (const button of this.findAll('[data-share]')) {
      button.hidden = !this.device.canShare;
      this.listen(button, () => this.shareResult());
    }

    for (const button of this.findAll('[data-fullscreen]')) {
      button.hidden = !this.device.canFullscreen;
      this.listen(button, () => {
        this.device.toggleFullscreen();
      });
    }

    for (const element of this.findAll('[data-setting="vibration"]')) {
      element.hidden = !this.canVibrate;
    }

    this.showChoices();
    this.showSettings();

    // First visit: explain the controls before the first match. Otherwise make sure the
    // tutorial is closed, whatever state the markup arrived in.
    this.showTutorial(!this.preferences.get().tutorialSeen);
  }

  disconnect() {
    for (const [target, type, listener] of this.listeners) {
      target.removeEventListener(type, listener);
    }
    this.listeners = [];
    this.cancelResultDelay();
    this.stopContinue();
    this.hideVersus();
  }

  /**
   * @param {HTMLElement} target
   * @param {EventListener} listener
   * @param {string} [type]
   */
  listen(target, listener, type = 'click') {
    target.addEventListener(type, listener);
    this.listeners.push([target, type, listener]);
  }

  /**
   * Picks the previous or the next career rival, within the part of the ladder that is open,
   * and has the menu redrawn for it.
   *
   * @param {number} step
   */
  stepRival(step) {
    const career = this.rendered?.career;

    if (!career) {
      return;
    }

    const rival = Math.min(Math.max(0, career.index + step), career.unlocked);

    if (rival !== career.index) {
      this.preferences.set({ rival });
      this.commandHandler(GAME_COMMAND.RESET);
    }
  }

  /** Reflects the chosen mode and difficulty on their buttons and the menu. */
  showChoices() {
    const { mode, difficulty } = this.preferences.get();

    for (const button of this.findAll('[data-mode]')) {
      button.setAttribute('aria-pressed', String(button.dataset.mode === mode));
    }

    for (const button of this.findAll('[data-difficulty]')) {
      button.setAttribute('aria-pressed', String(button.dataset.difficulty === difficulty));
    }

    for (const element of this.findAll('[data-solo-only]')) {
      element.hidden = mode !== 'solo';
    }

    for (const element of this.findAll('[data-career-only]')) {
      element.hidden = mode !== 'career';
    }

    for (const element of this.findAll('[data-rush-only]')) {
      element.hidden = mode !== 'rush';
    }

    // How to play tells of the game chosen: power-ups in a match, the wall in Bricks, the ship in
    // Nova, the race and its weapons in Warp.
    for (const element of this.findAll('[data-bricks-only]')) {
      element.hidden = mode !== 'bricks';
    }

    for (const element of this.findAll('[data-nova-only]')) {
      element.hidden = mode !== 'nova';
    }

    for (const element of this.findAll('[data-warp-only]')) {
      element.hidden = mode !== 'warp';
    }

    for (const element of this.findAll('[data-match-only]')) {
      element.hidden = mode === 'bricks' || mode === 'nova' || mode === 'warp';
    }

    // Nova and Warp have no ball to curve or to angle.
    for (const element of this.findAll('[data-ball-only]')) {
      element.hidden = mode === 'nova' || mode === 'warp';
    }

    this.root.dataset.mode = mode;
  }

  showSettings() {
    const preferences = this.preferences.get();

    for (const button of this.findAll('[data-setting]')) {
      const setting = TOGGLE_SETTINGS.find((candidate) => candidate === button.dataset.setting);

      if (setting) {
        button.setAttribute('aria-pressed', String(preferences[setting]));
      }
    }

    const track = this.currentTrack();

    for (const button of this.findAll('[data-track]')) {
      button.setAttribute('aria-label', `Music track: ${track.label}`);
    }

    for (const label of this.findAll('[data-track-label]')) {
      label.textContent = track.label;
    }
  }

  currentTrack() {
    const { track } = this.preferences.get();
    return this.tracks.find((candidate) => candidate.id === track) ?? this.tracks[0];
  }

  /** Moves to the next track, turns the music on so it can be heard, and plays a sample. */
  nextTrack() {
    const next = this.tracks[(this.tracks.indexOf(this.currentTrack()) + 1) % this.tracks.length];

    this.preferences.set({ track: next.id, music: true });
    this.showSettings();
    this.previewTrack(next.id);
  }

  /**
   * Opens the tutorial, or closes it; either way out of it counts as having seen it.
   *
   * @param {boolean} visible
   */
  showTutorial(visible) {
    const wasOpen = this.overlays.tutorial.hasAttribute('open');

    showDialog(this.overlays.tutorial, visible);

    if (wasOpen && !visible) {
      this.markTutorialSeen();
    }
  }

  /**
   * Opens the settings, or closes them. The switches apply as they are pressed, so closing
   * has nothing to save.
   *
   * @param {boolean} visible
   */
  showSettingsDialog(visible) {
    showDialog(this.overlays.settings, visible);
  }

  /**
   * Opens the high-score table, on the letters when the player is about to sign it, or closes it.
   *
   * @param {boolean} visible
   * @param {boolean} [signing]
   */
  showScores(visible, signing = false) {
    showDialog(this.overlays.scores, visible);

    if (visible) {
      this.showSigning(signing);
    }
  }

  /** @returns {boolean} whether the player's run is on the table, still unsigned */
  canSign() {
    const table = this.rendered?.highScores;
    return Boolean(table && !table.signed && table.own.rank > 0);
  }

  /**
   * Swaps the table for the letters to sign it with, or back. The letters start from the
   * initials the player already has, so changing one letter is two taps.
   *
   * @param {boolean} signing
   */
  showSigning(signing) {
    this.find('[data-scores-rows]').hidden = signing;
    this.find('[data-scores-about]').textContent = signing ? 'Sign the table with three letters' : 'Rush · most hits in one run';
    this.find('[data-sign]').hidden = !signing;
    this.find('[data-scores-actions]').hidden = signing;
    this.find('[data-sign-actions]').hidden = !signing;
    this.type(signing ? validInitials(this.preferences.get().initials) : '');

    if (signing) {
      // Focus goes to the slots, not to a letter: a typed Enter then never presses a key by mistake.
      this.find('[data-sign-slots]').focus({ preventScroll: true });
    }
  }

  /**
   * Shows the letters typed so far in their three slots, the next one to fill marked, and
   * offers OK once all three are in.
   *
   * @param {string} letters
   */
  type(letters) {
    this.typed = letters.slice(0, INITIALS_LENGTH);

    const slots = this.find('[data-sign-slots]');
    const document = slots.ownerDocument;

    slots.replaceChildren(...Array.from({ length: INITIALS_LENGTH }, (_, index) => {
      const slot = document.createElement('span');
      slot.className = index === this.typed.length ? 'sign__slot is-next' : 'sign__slot';
      slot.textContent = this.typed[index] ?? '_';
      return slot;
    }));
    this.find('[data-sign-ok]').toggleAttribute('disabled', this.typed.length < INITIALS_LENGTH);
  }

  /**
   * A keyboard signs the table too: letters fill the slots, Backspace takes one back, and
   * Enter confirms three. Anything else keeps its usual meaning, as does every key while the
   * table itself is showing, and Enter on Back or OK, which presses that button.
   *
   * @param {KeyboardEvent} event
   */
  typeByKey(event) {
    if (this.find('[data-sign]').hidden || event.ctrlKey || event.metaKey || event.altKey) {
      return;
    }

    const letter = event.key.length === 1 ? event.key.toUpperCase() : '';
    const target = /** @type {Partial<HTMLElement> | null} */ (event.target);
    const onAction = Boolean(target?.hasAttribute?.('data-sign-cancel') || target?.hasAttribute?.('data-sign-ok'));

    if (letter >= 'A' && letter <= 'Z') {
      this.type(this.typed + letter);
    } else if (event.key === 'Backspace') {
      this.type(this.typed.slice(0, -1));
    } else if (event.key === 'Enter' && this.typed.length === INITIALS_LENGTH && !onAction) {
      this.sign();
    } else {
      return;
    }

    event.preventDefault();
  }

  /** Signs the table with the three letters typed, and shows them on it. */
  sign() {
    const initials = validInitials(this.typed);

    if (!initials) {
      return;
    }

    this.preferences.set({ initials });
    this.showSigning(false);
    this.find('[data-dismiss-scores]').focus({ preventScroll: true });
    this.commandHandler(GAME_COMMAND.REFRESH);
  }

  markTutorialSeen() {
    if (!this.preferences.get().tutorialSeen) {
      this.preferences.set({ tutorialSeen: true });
    }
  }

  /**
   * Keeps keyboard focus where the game can use it: on the pause and result screens' main
   * button when they appear, and back on the board when play resumes. Focus elsewhere on the
   * page, such as a link the player moved to, is left alone.
   *
   * @param {GamePhase} phase
   */
  guideFocus(phase) {
    const document = this.root.ownerDocument;
    const active = document?.activeElement;
    const inGame = !active || active === document.body || this.root.contains(active);

    if (!inGame) {
      return;
    }

    if (phase === GAME_PHASE.PAUSED || phase === GAME_PHASE.GAME_OVER) {
      this.find(`[data-focus="${phase === GAME_PHASE.PAUSED ? 'pause' : 'over'}"]`).focus({ preventScroll: true });
    } else if (phase === GAME_PHASE.RUNNING && active !== this.board) {
      this.board.focus({ preventScroll: true });
    }
  }

  async shareResult() {
    const result = this.lastResult;
    const note = this.find('[data-share-note]');

    if (!result) {
      return;
    }

    const { career } = result;
    const won = result.winner === 'player';
    const score = `${result.score.player}:${result.score.opponent}`;
    let text = `I ${won ? 'won' : 'lost'} ${score} on ${DIFFICULTY_LABELS[result.difficulty]} in Paddle Noir. Longest rally: ${result.longestRally}.`;

    if (result.warp) {
      text = won
        ? `I won all ${result.warp.races} races of the Warp cup in Paddle Noir: ${countPoints(result.warp.points)}. Beat that!`
        : `I made ${countPoints(result.warp.points)} in the Warp cup of Paddle Noir, up to race ${result.warp.race} of ${result.warp.races}. Beat that!`;
    } else if (result.nova) {
      text = won
        ? `I flew all ${result.nova.sectors} sectors of Nova in Paddle Noir and downed the Dreadnought: ${countPoints(result.nova.points)}. Beat that!`
        : `I made ${countPoints(result.nova.points)} in Nova mode of Paddle Noir, up to sector ${result.nova.sector} of ${result.nova.sectors}. Beat that!`;
    } else if (result.bricks) {
      text = won
        ? `I broke all ${result.bricks.levels} walls of Bricks in Paddle Noir: ${countPoints(result.bricks.points)}. Beat that!`
        : `I made ${countPoints(result.bricks.points)} in Bricks mode of Paddle Noir, up to wall ${result.bricks.level} of ${result.bricks.levels}. Beat that!`;
    } else if (result.mode === 'rush') {
      const place = result.highScores && result.highScores.own.rank > 0
        ? ` My best run is number ${result.highScores.own.rank} on its high-score table.`
        : '';
      text = `I survived ${countHits(result.hits.player)} in Rush mode of Paddle Noir.${place} Beat that!`;
    } else if (career && won && isFinalRival(career)) {
      text = `I beat ${career.rival.name} ${score} and saved the last arcade in Paddle Noir: ${career.earned} of ${MAX_STARS} stars.`;
    } else if (career) {
      text = won
        ? `I beat ${career.rival.name} ${score} in Paddle Noir career mode: ${career.earned} of ${MAX_STARS} stars.`
        : `${career.rival.name} beat me ${score.split(':').reverse().join(':')} in Paddle Noir career mode. Rematch!`;
    }
    const outcome = await this.device.share(text);

    note.textContent = { shared: '', copied: 'Copied to clipboard', cancelled: '', failed: 'Sharing is not available here' }[outcome];
  }

  /** @param {Presentation} presentation */
  render(presentation) {
    // render() runs every frame during a match. Only touch the DOM when something changed:
    // the status element is an aria-live region, and rewriting it could spam screen readers.
    const previous = this.rendered;
    this.pending = presentation;

    if (presentation.phase !== previous?.phase || presentation.mode !== previous?.mode) {
      this.showPhase(presentation.phase, presentation.mode);
    }

    if (presentation.status !== previous?.status) {
      this.status.textContent = presentation.status;
    }

    if (
      presentation.opponent.label !== previous?.opponent.label
      || presentation.mode !== previous?.mode
      || this.initials() !== this.shownInitials
    ) {
      this.showLabels(presentation);
    }

    for (const side of /** @type {Side[]} */ (['player', 'opponent'])) {
      const value = scoreboardNumbers(presentation)[side];
      const previousValue = previous ? scoreboardNumbers(previous)[side] : null;

      if (value !== previousValue) {
        this.scores[side].textContent = String(value);

        // A point in a match is an occasion; in Bricks, Nova and Warp the points tick up all the time.
        if (previous && previousValue !== null && value > previousValue && !((presentation.bricks || presentation.nova || presentation.warp) && side === 'player')) {
          restartAnimation(this.scores[side], 'is-popping');
        }
      }
    }

    if (presentation.lives !== previous?.lives || presentation.maxLives !== previous?.maxLives) {
      this.showLives(presentation.lives, presentation.maxLives);
    }

    if (presentation.matchPoint !== previous?.matchPoint) {
      this.matchPoint.hidden = presentation.matchPoint === null;
      this.matchPoint.dataset.side = presentation.matchPoint ?? '';
    }

    const careerChanged = presentation.career?.index !== previous?.career?.index
      || presentation.career?.stars !== previous?.career?.stars
      || presentation.career?.unlocked !== previous?.career?.unlocked
      || presentation.career?.eased !== previous?.career?.eased;

    if (
      presentation.bestRally !== previous?.bestRally
      || presentation.bestRush !== previous?.bestRush
      || presentation.bricks?.best !== previous?.bricks?.best
      || presentation.nova?.best !== previous?.nova?.best
      || presentation.warp?.best !== previous?.warp?.best
      || presentation.mode !== previous?.mode
      || presentation.rules !== previous?.rules
      || careerChanged
    ) {
      this.showMenuMeta(presentation);
    }

    if (presentation.warp && (presentation.warp.craft !== previous?.warp?.craft || presentation.warp.tickets !== previous?.warp?.tickets)) {
      this.showHangarCard(presentation.warp);
    }

    if (presentation.warp && (presentation.warp.signal !== previous?.warp?.signal || presentation.warp.chapters !== previous?.warp?.chapters)) {
      this.showSignalCard(presentation.warp);
    }

    if (presentation.stats !== previous?.stats || presentation.mode !== previous?.mode || careerChanged) {
      this.showStats(presentation);
    }

    if (careerChanged) {
      this.showRival(presentation);
    }

    if (presentation.highScores !== previous?.highScores) {
      this.showHighScores(presentation.highScores);
    }

    // The chosen control scheme persists between races. Repaint only when it
    // changes, but keep the selector available while the cockpit is running.
    const steering = presentation.warp?.steering ?? 'drag';
    if (this.root.dataset.warpSteering !== steering) {
      this.root.dataset.warpSteering = steering;
      if (this.steeringSwitch) {
        const names = { drag: 'CLASSIC DRAG', buttons: 'LEFT / RIGHT', stick: 'FLOATING STICK' };
        const label = names[steering];
        const name = this.steeringSwitch.querySelector('[data-warp-steering-name]');

        if (name) {
          name.textContent = label;
        } else {
          this.steeringSwitch.textContent = `STEER ↻ ${label}`;
        }

        this.steeringSwitch.setAttribute('aria-label', `Steering: ${label}. Press to change control mode`);
      }
    }
    const steeringVisible = presentation.mode === 'warp' && presentation.phase === GAME_PHASE.RUNNING;
    if (this.steeringSwitch) this.steeringSwitch.hidden = !steeringVisible;
    for (const button of this.steeringButtons) button.hidden = !steeringVisible || steering !== 'buttons';
    if ((!steeringVisible || steering !== 'stick') && this.flightStickIndicator) this.flightStickIndicator.hidden = true;

    // The bridge's buttons: this runs every frame, so each is written only when what it
    // shows has changed, its recharge in twentieths of a fill along its foot.
    if (presentation.warp) {
      for (const button of this.bridgeButtons) {
        this.showBridgeControl(button, presentation);
      }
    }

    // Five brief, non-modal transmissions: display only the current chapter
    // and only during flight, high above the aircraft. No DOM churn per frame.
    const story = presentation.warp?.story;
    const showMission = presentation.mode === 'warp' && presentation.phase === GAME_PHASE.RUNNING && story?.active === true;
    if (this.storyMission) {
      this.storyMission.hidden = !showMission;
      if (showMission && story) {
        const heading = this.storyMission.querySelector('[data-warp-chapter]');
        const task = this.storyMission.querySelector('[data-warp-objective]');
        const label = story.completed ? '✓ SIGNAL RECOVERED' : story.title;
        const progress = story.completed ? 'INTEL SECURED · BONUS CLAIMED'
          : `${story.mission} · ${story.progress}/${story.target}`;
        if (heading && heading.textContent !== label) heading.textContent = label;
        if (task && task.textContent !== progress) task.textContent = progress;
        this.storyMission.dataset.completed = String(story.completed);
      }
    }
    if (this.storyRadio) {
      this.storyRadio.hidden = !showMission || !story?.message;
      if (showMission && story?.message) {
        const sender = this.storyRadio.querySelector('[data-warp-sender]');
        const message = this.storyRadio.querySelector('[data-warp-message]');
        // The Landlord breaks in on the channel: his lines read as an intercept, in red.
        const title = `${story.speaker} · ${story.hostile ? 'INTERCEPT' : 'INCOMING'}`;
        if (sender && sender.textContent !== title) sender.textContent = title;
        this.storyRadio.dataset.hostile = String(story.hostile === true);
        if (message && message.textContent !== story.message) message.textContent = story.message;
      }
    }

    if (presentation.phase === GAME_PHASE.GAME_OVER && previous?.phase !== GAME_PHASE.GAME_OVER) {
      this.showResult(presentation);
    }

    this.rendered = presentation;
  }

  /**
   * Whether the match that just ended gets a finisher, which the result screen waits for.
   *
   * @param {Presentation} presentation
   */
  finishes({ winner, mode }) {
    return finisherApplies({
      winner,
      twoPlayers: mode === 'duo',
      rush: mode === 'rush' || mode === 'bricks' || mode === 'nova' || mode === 'warp',
      jokes: this.preferences.get().jokes === true,
    });
  }

  /**
   * A key pressed during the finisher only brings the result screen, so Space or Enter
   * cannot also start the next match unseen; the keyboard input listens beyond the court,
   * on the window, so the key stops here. A held key's repeats and shortcuts with a
   * modifier are no request to skip.
   *
   * @param {KeyboardEvent} event
   */
  skipFinisherByKey(event) {
    if (this.resultDelay === null || event.repeat || event.ctrlKey || event.metaKey || event.altKey) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    this.revealResult();
  }

  /** Shows the result screen now, ending any wait for the finisher. */
  revealResult() {
    if (this.resultDelay === null) {
      return;
    }

    this.cancelResultDelay();
    this.overlays.over.hidden = false;
    this.guideFocus(GAME_PHASE.GAME_OVER);
  }

  cancelResultDelay() {
    if (this.resultDelay !== null) {
      this.timers.clearTimeout(this.resultDelay);
      this.resultDelay = null;
    }
  }

  /**
   * @param {GamePhase} phase
   * @param {Mode} mode
   */
  showPhase(phase, mode) {
    const inMatch = phase === GAME_PHASE.RUNNING || phase === GAME_PHASE.PAUSED;
    const phaseChanged = phase !== this.rendered?.phase;

    this.root.dataset.phase = phase;
    this.root.dataset.mode = mode;

    // Once a match has been played, the menu's neon sign is on when the player comes back.
    if (phase !== GAME_PHASE.READY) {
      this.root.dataset.played = 'true';
    }

    // The finisher plays on the board first; the result screen follows, or comes at a tap.
    const finishing = phase === GAME_PHASE.GAME_OVER && phaseChanged && this.rendered !== null
      && this.finishes(/** @type {Presentation} */ (this.pending));

    this.overlays.menu.hidden = phase !== GAME_PHASE.READY;
    this.overlays.pause.hidden = phase !== GAME_PHASE.PAUSED;
    this.overlays.over.hidden = phase !== GAME_PHASE.GAME_OVER || finishing;
    this.cancelResultDelay();
    // A new result starts its own countdown; any other screen ends the last one.
    this.stopContinue();

    // A match that starts from the menu or the result screen, not one resumed, names its rival.
    const previousPhase = this.rendered?.phase;

    if (phase === GAME_PHASE.RUNNING && (previousPhase === GAME_PHASE.READY || previousPhase === GAME_PHASE.GAME_OVER)) {
      this.showVersus(/** @type {Presentation} */ (this.pending));
    } else if (phase !== GAME_PHASE.RUNNING) {
      this.hideVersus();
    }

    if (finishing) {
      this.resultDelay = this.timers.setTimeout(() => this.revealResult(), FINISHER_SECONDS * 1000);
    } else if (phaseChanged && this.rendered !== null) {
      this.guideFocus(phase);
    }
    for (const panel of this.bridgePanels) panel.hidden = mode !== 'warp' || phase !== GAME_PHASE.RUNNING;
    // Hide steering immediately on pause, not after the next simulation frame.
    if (phase !== GAME_PHASE.RUNNING || mode !== 'warp') {
      if (this.steeringSwitch) this.steeringSwitch.hidden = true;
      if (this.flightStickIndicator) this.flightStickIndicator.hidden = true;
      for (const button of this.steeringButtons) button.hidden = true;
    }
    this.pauseButton.toggleAttribute('disabled', !inMatch);
    this.pauseButton.setAttribute('aria-label', phase === GAME_PHASE.PAUSED ? 'Resume' : 'Pause');

    if (phase !== GAME_PHASE.READY) {
      this.find('[data-share-note]').textContent = '';
    }
  }

  /** @returns {string} the player's initials, or '' until they have signed the high-score table */
  initials() {
    return validInitials(this.preferences.get().initials);
  }

  /**
   * The scoreboard's side labels. A nickname is set in its own case and letter-spacing, and
   * clipped with an ellipsis rather than pushing the scoreboard into the buttons. Where the
   * scoreboard names the player, it is by their initials once they have signed the table.
   *
   * @param {Presentation} presentation
   */
  showLabels({ mode, opponent }) {
    const label = this.find('[data-label="opponent"]');

    this.shownInitials = this.initials();
    label.textContent = opponent.label;
    label.classList.toggle('scoreboard__label--nick', opponent.proper);
    this.find('[data-scoreboard]').classList.toggle('scoreboard--nick', opponent.proper);
    this.find('[data-label="player"]').textContent = (NAMES_PLAYER[mode] && this.shownInitials) || PLAYER_LABELS[mode];
  }

  /**
   * @param {number} lives
   * @param {number} maxLives
   */
  showLives(lives, maxLives) {
    this.lives.hidden = maxLives === 0;
    this.lives.textContent = '';

    for (let i = 0; i < maxLives; i += 1) {
      const heart = this.lives.ownerDocument.createElement('span');
      heart.className = i < lives ? 'lives__heart' : 'lives__heart lives__heart--lost';
      heart.textContent = '♥';
      this.lives.appendChild(heart);
    }
  }

  /**
   * The menu's summary line: how this mode is won, and the record that goes with it. The
   * rules come from the match configuration, so the text cannot drift from the game. In the
   * career it tells who the rival is, or why they are tired.
   *
   * @param {Presentation} presentation
   */
  showMenuMeta({ mode, rules, bestRally, bestRush, career, bricks, nova, warp }) {
    const goal = rules.kind === 'match' ? `First to ${rules.winningScore}` : `${rules.lives} lives`;

    for (const element of this.findAll('[data-menu-meta]')) {
      if (warp) {
        const best = element.ownerDocument.createElement('strong');
        best.textContent = String(warp.best);
        element.replaceChildren(`${warp.races} races · Best `, best, warp.best === 1 ? ' point' : ' points');
        continue;
      }

      if (nova) {
        const best = element.ownerDocument.createElement('strong');
        best.textContent = String(nova.best);
        element.replaceChildren(`${nova.sectors} sectors · Best `, best, nova.best === 1 ? ' point' : ' points');
        continue;
      }

      if (bricks) {
        const best = element.ownerDocument.createElement('strong');
        best.textContent = String(bricks.best);
        element.replaceChildren(`${bricks.levels} walls · Best `, best, bricks.best === 1 ? ' point' : ' points');
        continue;
      }

      if (career) {
        element.replaceChildren(career.eased
          ? `After beating you twice, ${career.rival.name} is tired and plays slower.`
          : career.rival.story);
        continue;
      }

      if (mode === 'duo') {
        element.replaceChildren(`${goal} · Two players, one screen`);
        continue;
      }

      const record = element.ownerDocument.createElement('strong');
      record.textContent = String(mode === 'rush' ? bestRush : bestRally);
      element.replaceChildren(...(mode === 'rush'
        ? [`${goal} · Best run `, record, bestRush === 1 ? ' hit' : ' hits']
        : [`${goal} · Best rally `, record]));
    }
  }

  /**
   * One button of the bridge: what its system is doing, whether it can be pressed, and how
   * far it has recharged.
   *
   * @param {HTMLButtonElement} button
   * @param {Presentation} presentation
   */
  showBridgeControl(button, { warp, phase }) {
    const id = /** @type {'nitro' | 'guns' | 'rockets' | 'shield' | 'warp'} */ (button.dataset.warpControl);
    const system = warp?.controls[id];

    if (!system) {
      return;
    }

    const disabled = !system.ready || phase !== GAME_PHASE.RUNNING;
    const charge = String(Math.round(system.charge * 20) / 20);
    const active = String(['BURNING', 'FIRING', 'ONLINE', 'ENGAGED'].includes(system.status));
    const shown = `${system.status}|${disabled}|${charge}|${active}`;

    if (button.dataset.shown === shown) {
      return;
    }

    button.dataset.shown = shown;
    const caption = button.querySelector('[data-warp-status]');

    if (caption) {
      caption.textContent = system.status;
    }

    button.disabled = disabled;
    button.setAttribute('aria-label', `${id.toUpperCase()}: ${system.status}`);
    button.dataset.active = active;
    button.style?.setProperty('--charge', charge);
  }

  /**
   * The Signal Log's card: how many of the story's fragments the player has ever recovered,
   * and which, a diamond a chapter.
   *
   * @param {{ signal: number, chapters: number }} warp
   */
  showSignalCard({ signal, chapters }) {
    const marks = Array.from({ length: chapters }, (_, chapter) => ((signal & (1 << chapter)) !== 0 ? '◆' : '◇'));
    const count = this.root.querySelector('[data-signal-count]');
    const dots = this.root.querySelector('[data-signal-dots]');
    const card = this.root.querySelector('[data-show-signal]');

    if (count) count.textContent = `${marks.filter((mark) => mark === '◆').length}/${chapters}`;
    if (dots) dots.textContent = marks.join('');
    card?.setAttribute('aria-label', `Signal Log: ${marks.filter((mark) => mark === '◆').length} of ${chapters} fragments recovered`);
  }

  /**
   * The hangar's card in the Warp menu: the craft the next cup is flown in, and the tickets
   * there are to spend on it.
   *
   * @param {WarpView} warp
   */
  showHangarCard({ craft, tickets }) {
    this.find('[data-hangar-craft]').textContent = craft;
    this.find('[data-hangar-tickets]').textContent = `${tickets} ${tickets === 1 ? 'ticket' : 'tickets'}`;
  }

  /**
   * Solo win statistics. A streak earns a flame, which is decoration: screen readers skip it.
   *
   * @param {Presentation} presentation
   */
  showStats({ mode, stats, career }) {
    for (const element of this.findAll('[data-stats]')) {
      const show = (mode === 'solo' && stats.matches > 0) || (career !== null && career.beaten > 0);
      element.hidden = !show;

      if (!show) {
        continue;
      }

      if (career) {
        element.replaceChildren(`${career.beaten} of ${career.count} beaten · ${career.totalStars}/${career.count * MAX_STARS} stars`);
        continue;
      }

      const rate = Math.round((stats.wins / stats.matches) * 100);
      const summary = `${stats.wins}/${stats.matches} won (${rate}%)`;

      if (stats.streak >= 2) {
        const flame = element.ownerDocument.createElement('span');
        flame.setAttribute('aria-hidden', 'true');
        flame.textContent = '🔥';
        element.replaceChildren(`${summary} · ${stats.streak} in a row `, flame);
      } else {
        element.replaceChildren(summary);
      }
    }
  }

  /** @param {Presentation} presentation */
  showResult(presentation) {
    const { winner, score, hits, longestRally, newBest, newBestRush, mode, difficulty, opponent, career, highScores, bricks, nova, warp } = presentation;
    const title = this.find('[data-over-title]');
    const rush = mode === 'rush';
    const setting = career ? `Career ${career.index + 1}/${career.count}`
      : warp ? 'Warp' : nova ? 'Nova' : bricks ? 'Bricks' : rush ? 'Rush' : mode === 'duo' ? 'Two players' : DIFFICULTY_LABELS[difficulty];
    // Beating the final boss keeps the last arcade open.
    const champion = career !== null && winner === 'player' && isFinalRival(career);
    const stars = this.find('[data-over-stars]');

    this.lastResult = presentation;
    title.textContent = rush ? 'Run over'
      : warp ? (winner === 'player' ? 'Cup won' : 'Out of credits')
      : nova ? (winner === 'player' ? 'Galaxy saved' : 'Ship lost')
      : bricks ? (winner === 'player' ? 'All clear' : 'Game over')
        : champion ? 'Champion' : winner === 'player' ? 'Victory' : 'Defeat';
    title.dataset.winner = rush ? 'opponent' : (winner ?? '');
    this.find('[data-over-score]').textContent = warp ? String(warp.points) : nova ? String(nova.points) : bricks ? String(bricks.points)
      : rush ? countHits(hits.player) : `${score.player} : ${score.opponent}`;
    this.find('[data-over-rally]').textContent = String(longestRally);
    this.find('[data-over-difficulty]').textContent = opponent.proper ? `${setting} · vs ${opponent.name}` : setting;
    this.find('[data-over-best]').hidden = !newBest;
    this.find('[data-over-best-rush]').hidden = !newBestRush;
    this.find('[data-over-best-bricks]').hidden = !bricks?.newBest;
    this.find('[data-over-best-nova]').hidden = !nova?.newBest;
    this.find('[data-over-best-warp]').hidden = !warp?.newBest;
    this.find('[data-over-champion]').hidden = !champion;
    this.find('[data-over-scores]').hidden = !highScores;
    // A run is told by its hits and its place on the table, a Bricks game by the wall it
    // reached; the longest rally belongs to a match.
    this.find('[data-over-meta]').hidden = Boolean(highScores) || Boolean(bricks) || Boolean(nova) || Boolean(warp);
    this.find('[data-over-wall]').hidden = !bricks && !nova && !warp;
    this.find('[data-over-tickets]').hidden = !warp || warp.earned === 0;

    if (this.storyEnding) {
      this.storyEnding.hidden = !warp || winner !== 'player';

      // A title and the story's last lines; a short screen keeps only the title.
      if (warp && winner === 'player') {
        const title = this.storyEnding.querySelector('[data-warp-ending-title]');
        const text = this.storyEnding.querySelector('[data-warp-ending-text]');

        if (title && text) {
          title.textContent = warp.ending.title;
          text.textContent = warp.ending.text;
        } else {
          this.storyEnding.textContent = `${warp.ending.title} — ${warp.ending.text}`;
        }
      }
    }

    if (warp) {
      const tickets = this.find('[data-over-tickets]');
      const earned = tickets.ownerDocument.createElement('strong');

      this.find('[data-over-wall]').textContent = winner === 'player'
        ? `points · all ${warp.races} races won through`
        : `points · race ${warp.race} of ${warp.races} · ${warp.name}`;
      // What the cabinet paid out for the cup, to spend in the hangar.
      earned.textContent = `+${warp.earned}`;
      tickets.replaceChildren(earned, warp.earned === 1 ? ' ticket for the hangar' : ' tickets for the hangar');
    }

    if (nova) {
      this.find('[data-over-wall]').textContent = winner === 'player'
        ? `points · all ${nova.sectors} sectors flown`
        : `points · sector ${nova.sector} of ${nova.sectors} · ${nova.name}`;
    }

    if (bricks) {
      this.find('[data-over-wall]').textContent = winner === 'player'
        ? `points · all ${bricks.levels} walls down`
        : `points · wall ${bricks.level} of ${bricks.levels} · ${bricks.name}`;
    }

    this.showQuote(presentation);
    stars.hidden = !career || career.earned === 0;
    showStars(stars, career?.earned ?? 0);
    // After a career win, the same button takes on the next rival.
    this.find('[data-focus="over"]').textContent = career?.next ? 'Next rival' : 'Play again';
    this.startContinue(presentation);
  }

  /**
   * The career rival card of the menu: its place on the ladder, its name, a boss tag, which
   * names the final boss as such, and the best stars earned against it, with the steps to the
   * rivals either side, as far as the ladder is open.
   *
   * @param {Presentation} presentation
   */
  showRival({ career }) {
    if (!career) {
      return;
    }

    this.find('[data-rival-place]').textContent = `${career.index + 1}/${career.count}`;
    this.find('[data-rival-name]').textContent = career.rival.name;
    showEmblem(this.find('[data-rival-emblem]'), career.rival.emblem);
    this.find('[data-rival-boss]').hidden = !career.rival.boss;
    this.find('[data-rival-boss]').textContent = bossLabel(career);
    this.find('[data-rival-tired]').hidden = !career.eased;
    showStars(this.find('[data-rival-stars]'), career.stars);

    for (const button of this.findAll('[data-rival-step]')) {
      const target = career.index + Number(button.dataset.rivalStep);
      button.toggleAttribute('disabled', target < 0 || target > career.unlocked);
    }
  }

  /**
   * After a career match the rival has a word to say, whichever way it went. It is one of the
   * fun extras, so the Fun switch decides whether the result screen shows it.
   *
   * @param {Presentation} presentation
   */
  showQuote({ career, winner }) {
    const quote = this.find('[data-over-quote]');
    const line = career && winner && this.preferences.get().jokes === true
      ? career.rival.says[winner === 'player' ? 'beaten' : 'winning']
      : '';

    quote.hidden = line === '';
    this.find('[data-over-quote-text]').textContent = line && `“${line}”`;

    if (career) {
      showEmblem(this.find('[data-over-quote-emblem]'), career.rival.emblem);
    }
  }

  /**
   * The Rush high-score table, wherever it shows: the card in the menu with the player's place
   * and the row to beat next, the standing on the result screen with the rows around the
   * player's, and the whole table in its dialog.
   *
   * @param {HighScoresView | null} table
   */
  showHighScores(table) {
    if (!table) {
      return;
    }

    const { own, target } = table;
    const place = own.rank > 0 ? `#${own.rank} · ${own.initials} · ${countHits(own.hits)}` : `${own.initials} · ${countHits(own.hits)}`;

    const around = this.find('[data-standing-rows]');
    const whole = this.find('[data-scores-rows]');

    this.find('[data-scores-place]').textContent = own.hits > 0 ? place : 'No run yet';
    this.find('[data-scores-next]').textContent = target ? `Next: ${target.initials} · ${countHits(target.hits)}` : 'The record is yours';
    around.replaceChildren(...standing(table).map((row) => scoreRow(around, row, false)));
    whole.replaceChildren(...table.rows.map((row) => scoreRow(whole, row, true)));
    const note = standingNote(table);
    const unsigned = !table.signed && own.rank > 0;

    this.find('[data-standing-note]').textContent = note;
    // A run on the table that nobody has signed yet says how to sign it.
    this.find('[data-standing-hint]').hidden = !unsigned;
    // Read out, the standing is a sentence rather than three rows of cells.
    this.find('[data-over-scores]').setAttribute('aria-label', [
      `High scores: ${own.rank > 0 ? `number ${own.rank} with ${countHits(own.hits)}` : `${countHits(own.hits)}, not on the table yet`}.`,
      note.endsWith('!') ? note : `${note}.`,
      unsigned ? 'Sign your score.' : 'Show the table.',
    ].join(' '));
    this.find('[data-sign-open]').textContent = table.signed ? 'Change initials' : 'Enter initials';
  }

  /**
   * The versus card, as a career match starts: the rival's emblem and name over the player's,
   * in the manner of a fighting game. It is decoration, up for the first half of the countdown
   * and no longer; the status line names the rival for screen readers.
   *
   * @param {Presentation} presentation
   */
  showVersus({ career }) {
    this.hideVersus();

    if (!career) {
      return;
    }

    const tag = this.find('[data-versus-tag]');

    showEmblem(this.find('[data-versus-emblem]'), career.rival.emblem);
    tag.textContent = career.rival.boss ? bossLabel(career) : `Rival ${career.index + 1}/${career.count}`;
    tag.classList.toggle('versus__tag--boss', career.rival.boss);
    this.find('[data-versus-name]').textContent = career.rival.name;
    this.find('[data-versus-you]').textContent = this.initials() || 'You';
    this.versus.hidden = false;
    this.versusTimer = this.timers.setTimeout(() => this.hideVersus(), VERSUS_SECONDS * 1000);
  }

  hideVersus() {
    if (this.versusTimer !== null) {
      this.timers.clearTimeout(this.versusTimer);
      this.versusTimer = null;
    }

    this.versus.hidden = true;
  }

  /**
   * After a loss to the computer, a parody of the arcade's "Continue?" screen counts down
   * under the result, then gives up with "Game over". It is one of the fun extras and pure
   * decoration: Play again works all along, and screen readers skip it.
   *
   * @param {Presentation} presentation
   */
  startContinue({ mode, winner }) {
    const lost = mode === 'rush' || ((mode === 'solo' || mode === 'career' || mode === 'bricks' || mode === 'nova' || mode === 'warp') && winner === 'opponent');

    this.stopContinue();
    this.continueLine.hidden = !lost || this.preferences.get().jokes !== true;

    if (!this.continueLine.hidden) {
      this.tickContinue(CONTINUE_FROM);
    }
  }

  /** @param {number} count seconds left; below zero the countdown has given up */
  tickContinue(count) {
    const over = count < 0;

    this.continueLine.textContent = over ? 'Game over' : `Continue? ${count}`;
    this.continueLine.dataset.state = over ? 'over' : 'counting';
    restartAnimation(this.continueLine, 'is-ticking');
    this.continueTimer = over ? null : this.timers.setTimeout(() => this.tickContinue(count - 1), 1000);
  }

  stopContinue() {
    if (this.continueTimer !== null) {
      this.timers.clearTimeout(this.continueTimer);
      this.continueTimer = null;
    }
  }
}

/**
 * Opens a dialog as a modal, which makes the page behind it inert and moves focus into it, or
 * closes it. Browsers without modal dialogs still show it.
 *
 * @param {HTMLElement} element
 * @param {boolean} visible
 */
function showDialog(element, visible) {
  const dialog = /** @type {HTMLDialogElement} */ (element);
  const open = dialog.hasAttribute('open');

  if (visible && !open) {
    if (typeof dialog.showModal === 'function') {
      dialog.showModal();
    } else {
      dialog.setAttribute('open', '');
    }
  } else if (!visible && open) {
    if (typeof dialog.close === 'function') {
      dialog.close();
    } else {
      dialog.removeAttribute('open');
    }
  }
}

/**
 * Stars as glyphs, which screen readers skip, and as words, which they read.
 *
 * @param {HTMLElement} element
 * @param {number} stars
 */
function showStars(element, stars) {
  const glyphs = element.ownerDocument.createElement('span');
  const words = element.ownerDocument.createElement('span');

  glyphs.setAttribute('aria-hidden', 'true');
  glyphs.textContent = '★'.repeat(stars) + '☆'.repeat(MAX_STARS - stars);
  words.className = 'visually-hidden';
  words.textContent = `${stars} of ${MAX_STARS} stars`;
  element.replaceChildren(glyphs, words);
}

/**
 * @param {CareerView} career
 * @returns {boolean} whether the rival is the final boss, the last one on the ladder
 */
function isFinalRival(career) {
  return career.rival.boss && career.index === career.count - 1;
}

/** @param {CareerView} career */
function bossLabel(career) {
  return isFinalRival(career) ? 'Final boss' : 'Boss';
}

/**
 * Points an emblem's drawing at the one with that name.
 *
 * @param {HTMLElement} use the `<use>` inside the emblem
 * @param {string} emblem
 */
function showEmblem(use, emblem) {
  use.setAttribute('href', `#emblem-${emblem}`);
}

/** @param {number} hits */
function countHits(hits) {
  return hits === 1 ? '1 hit' : `${hits} hits`;
}

/** @param {number} points */
function countPoints(points) {
  return points === 1 ? '1 point' : `${points} points`;
}

/**
 * The two numbers of the scoreboard: the score of a match, the hits of a Rush run, in Bricks
 * the points and the wall being played, in Nova the points and the sector, and in Warp the points
 * and the race.
 *
 * @param {Presentation} presentation
 * @returns {Record<Side, number>}
 */
function scoreboardNumbers({ mode, score, hits, bricks, nova, warp }) {
  if (warp) {
    return { player: warp.points, opponent: warp.race };
  }

  if (nova) {
    return { player: nova.points, opponent: nova.sector };
  }

  if (bricks) {
    return { player: bricks.points, opponent: bricks.level };
  }

  return mode === 'rush' ? hits : score;
}

/**
 * A row of the high-score table: its rank, the initials, in the whole table whose they are, and
 * the hits. A run that is not on the table has a dash for a rank.
 *
 * @param {HTMLElement} list the element the row goes in
 * @param {HighScoreRow} row
 * @param {boolean} named whether to say whose row it is
 * @returns {HTMLElement}
 */
function scoreRow(list, row, named) {
  const document = list.ownerDocument;
  const element = document.createElement(named ? 'li' : 'span');
  /** @param {string} name @param {string} text */
  const cell = (name, text) => {
    const part = document.createElement('span');
    part.className = `score-row__${name}`;
    part.textContent = text;
    return part;
  };

  element.className = row.own ? 'score-row score-row--own' : 'score-row';
  element.replaceChildren(
    cell('rank', row.rank > 0 ? String(row.rank) : '–'),
    cell('initials', row.initials),
    ...(named ? [cell('name', row.name)] : []),
    cell('hits', String(row.hits)),
  );
  return element;
}

/**
 * The line under the standing on the result screen: whom the run went past, or how far the
 * player's best is from the next row.
 *
 * @param {HighScoresView} table
 * @returns {string}
 */
function standingNote(table) {
  const { own, passed, target } = table;

  if (passed.length > 0 && own.rank === 1) {
    return 'The record is yours!';
  }

  if (passed.length > 0 && own.rank > 0) {
    return `You passed ${passed.length === 1 ? passed[0] : `${passed.length} regulars`}!`;
  }

  if (!target) {
    return 'You hold the record';
  }

  return own.rank > 0
    ? `${hitsToPass(table)} more to pass ${target.initials}`
    : `${hitsToPass(table)} more to get on the table`;
}

/**
 * Replays a CSS animation by removing and re-adding its class. Reduced-motion styles can
 * switch the animation off without any script changes.
 *
 * @param {HTMLElement} element
 * @param {string} className
 */
function restartAnimation(element, className) {
  element.classList.remove(className);
  void element.offsetWidth;
  element.classList.add(className);
}
