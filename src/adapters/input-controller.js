import { GAME_COMMAND } from '../application/ports.js';

/**
 * @import { InputSnapshot } from '../domain/types.js'
 * @import { CommandHandler, InputPort } from '../application/ports.js'
 */

// Physical key codes rather than characters, so A/D also work on Cyrillic, AZERTY and other layouts.
const PLAYER_KEYS = Object.freeze({ left: new Set(['ArrowLeft', 'KeyA']), right: new Set(['ArrowRight', 'KeyD']) });
// A second person on the same keyboard uses the far side of it.
const OPPONENT_KEYS = Object.freeze({ left: new Set(['KeyJ', 'Numpad4']), right: new Set(['KeyL', 'Numpad6']) });
// The player's extra, where a game has one: a bar of nitro in Warp. A key, a click of the mouse,
// or a swipe up: a finger that has risen this far on the screen, more than it moved sideways.
const ACTION_KEYS = new Set(['ArrowUp', 'KeyW', 'KeyN']);
const BRIDGE_KEYS = Object.freeze(new Map([
  ['KeyG', GAME_COMMAND.WARP_GUNS],
  ['KeyR', GAME_COMMAND.WARP_ROCKETS],
  ['KeyF', GAME_COMMAND.WARP_SHIELD],
]));
const ABILITY_KEYS = new Set(['KeyE']);
const SWIPE_UP_PIXELS = 34;
const STICK_DEAD_ZONE = 0.12;
const STICK_RADIUS_MIN = 45;
const STICK_RADIUS_MAX = 88;

/**
 * Expo-style relative flight stick: a forgiving neutral zone avoids jitter,
 * a progressive response curve offers precision near center and full steering
 * at the edge. The flight remains horizontally constrained, like an arcade racer.
 * @param {number} travel horizontal thumb displacement in CSS pixels
 * @param {number} radius maximum displacement for full lock in CSS pixels
 */
export function analogFlightAxis(travel, radius) {
  if (!Number.isFinite(travel) || !Number.isFinite(radius) || radius <= 0) return 0;
  const magnitude = Math.min(1, Math.abs(travel) / radius);
  if (magnitude <= STICK_DEAD_ZONE) return 0;
  const t = (magnitude - STICK_DEAD_ZONE) / (1 - STICK_DEAD_ZONE);
  return Math.sign(travel) * (0.15 * t + 0.85 * Math.pow(t, 1.55));
}

/** @param {PointerEvent} event */
const touchPointer = (event) => event.pointerType === 'touch' || event.pointerType === 'pen';
const INTERACTIVE_TAGS = ['A', 'BUTTON', 'INPUT', 'SELECT', 'TEXTAREA'];
const INTERACTIVE_SELECTOR = INTERACTIVE_TAGS.join(',').toLowerCase();

/**
 * Whether the event came from a control (or something inside one, like an icon), which keeps
 * its own meaning for Space and taps.
 *
 * @param {EventTarget | null} target
 */
function isInteractiveTarget(target) {
  const element = /** @type {{ tagName?: string, closest?: (selector: string) => unknown } | null} */ (target);

  if (!element) {
    return false;
  }

  if (typeof element.closest === 'function') {
    return element.closest(INTERACTIVE_SELECTOR) !== null;
  }

  return element.tagName !== undefined && INTERACTIVE_TAGS.includes(element.tagName);
}

/**
 * One paddle's steering: held keys and the pointer that last steered it.
 */
class PaddleInput {
  constructor() {
    this.leftPressed = false;
    this.rightPressed = false;
    /** @type {number | null} Board x of the pointer while it steers; null while the keyboard does. */
    this.pointerX = null;
    /** @type {number | null} */
    this.lastClientX = null;
    /** @type {number | null} The pointer this paddle follows, so two fingers stay with their own paddles. */
    this.pointerId = null;
    /** @type {{ x: number, y: number } | null} The lowest point of the finger's stroke, which a swipe up rises from. */
    this.low = null;
  }

  release() {
    this.leftPressed = false;
    this.rightPressed = false;
    this.pointerX = null;
    this.pointerId = null;
    this.low = null;
  }

  get axis() {
    return Number(this.rightPressed) - Number(this.leftPressed);
  }
}

/** @implements {InputPort} */
export class InputController {
  /**
   * @param {object} options
   * @param {HTMLElement} options.surface area that listens for pointers, which may extend
   *   beyond the board so a thumb can steer from below it without covering the play
   * @param {HTMLElement} options.board element whose width maps pointer positions onto the court
   * @param {Window} options.window
   * @param {Document} options.document
   * @param {{ width: number }} options.config
   */
  constructor({ surface, board, window, document, config }) {
    this.surface = surface;
    this.board = board;
    this.window = window;
    this.document = document;
    this.config = config;
    this.players = 1;
    /** @type {import('../application/ports.js').WarpSteeringMode} */
    this.warpSteering = 'drag';
    /** @type {Map<number, -1 | 1>} Independent left and right touch-button fingers. */
    this.turnTouches = new Map();
    /** @type {{ pointerId: number, x: number, y: number, radius: number } | null} */
    this.stick = null;
    this.stickAxis = 0;
    /** @type {HTMLElement | null} */
    this.stickIndicator = this.surface.querySelector?.('[data-flight-stick]') ?? null;
    /** @type {HTMLElement | null} */
    this.stickKnob = this.stickIndicator?.querySelector?.('[data-flight-knob]') ?? null;
    this.player = new PaddleInput();
    this.opponent = new PaddleInput();
    /** Whether the player has asked for their extra since the last snapshot. */
    this.action = false;
    /** @type {Array<[EventTarget, string, EventListener]>} */
    this.listeners = [];
    /** @type {CommandHandler} */
    this.commandHandler = () => {};
  }

  /** @param {CommandHandler} handler */
  onCommand(handler) {
    this.commandHandler = handler;
  }

  /**
   * With two players, touches on the top half of the board steer the top paddle and the
   * rest steer the bottom one; with one, every touch steers the bottom paddle.
   *
   * @param {{ players: 1 | 2, warpSteering?: import('../application/ports.js').WarpSteeringMode }} layout
   */
  configure({ players, warpSteering = 'drag' }) {
    if (players !== this.players || warpSteering !== this.warpSteering) {
      this.player.release();
      this.clearFlightTouch();
    }
    this.players = players;
    this.warpSteering = warpSteering;
    this.opponent.release();
  }

  clearFlightTouch() {
    this.turnTouches.clear();
    this.stick = null;
    this.stickAxis = 0;
    if (this.stickIndicator) this.stickIndicator.hidden = true;
    if (this.stickKnob) this.stickKnob.style.transform = '';
  }

  connect() {
    this.listen(this.window, 'keydown', (event) => this.handleKeyDown(/** @type {KeyboardEvent} */ (event)));
    this.listen(this.window, 'keyup', (event) => this.handleKeyUp(/** @type {KeyboardEvent} */ (event)));
    this.listen(this.window, 'blur', () => this.handleFocusLoss());
    this.listen(this.document, 'visibilitychange', () => {
      if (this.document.visibilityState === 'hidden') {
        this.handleFocusLoss();
      }
    });
    this.listen(this.surface, 'pointerdown', (event) => this.handlePointer(/** @type {PointerEvent} */ (event), true));
    this.listen(this.surface, 'pointermove', (event) => this.handlePointer(/** @type {PointerEvent} */ (event), false));
    this.listen(this.surface, 'pointerup', (event) => this.releasePointer(/** @type {PointerEvent} */ (event)));
    this.listen(this.surface, 'pointercancel', (event) => this.releasePointer(/** @type {PointerEvent} */ (event)));
  }

  disconnect() {
    for (const [target, type, listener] of this.listeners) {
      target.removeEventListener(type, listener);
    }
    this.listeners = [];
    this.clearFlightTouch();
  }

  /**
   * @param {EventTarget} target
   * @param {string} type
   * @param {EventListener} listener
   */
  listen(target, type, listener) {
    target.addEventListener(type, listener);
    this.listeners.push([target, type, listener]);
  }

  /**
   * @param {KeyboardEvent} event
   * @param {boolean} pressed
   * @returns {boolean} whether the key steers a paddle
   */
  steerByKey(event, pressed) {
    const sides = /** @type {const} */ ([
      [this.player, PLAYER_KEYS],
      [this.opponent, this.players === 2 ? OPPONENT_KEYS : null],
    ]);

    for (const [paddle, keys] of sides) {
      if (!keys) {
        continue;
      }

      const isLeft = keys.left.has(event.code);

      if (!isLeft && !keys.right.has(event.code)) {
        continue;
      }

      if (isLeft) {
        paddle.leftPressed = pressed;
      } else {
        paddle.rightPressed = pressed;
      }

      if (pressed && !event.repeat) {
        paddle.pointerX = null; // The most recently used device steers.
        paddle.pointerId = null;
      }

      return true;
    }

    return false;
  }

  /**
   * Whether a dialog is open over the game, such as the tutorial. The page behind a modal
   * dialog takes no input, and its keys (Space, Escape, Enter) belong to the dialog.
   */
  dialogOpen() {
    return Boolean(this.document.querySelector?.('dialog[open]'));
  }

  /** @param {KeyboardEvent} event */
  handleKeyDown(event) {
    if (event.ctrlKey || event.metaKey || event.altKey) {
      return; // Leave browser and system shortcuts such as Ctrl+A or Alt+← alone.
    }

    if (this.dialogOpen()) {
      return;
    }

    if (this.steerByKey(event, true)) {
      event.preventDefault();
      return;
    }

    if (ACTION_KEYS.has(event.code)) {
      // Held down, it asks once.
      this.action ||= !event.repeat;
      event.preventDefault();
      return;
    }

    if (BRIDGE_KEYS.has(event.code)) {
      if (!event.repeat && !isInteractiveTarget(event.target)) {
        this.commandHandler(/** @type {import('../application/ports.js').GameCommand} */ (BRIDGE_KEYS.get(event.code)));
      }
      event.preventDefault();
      return;
    }

    if (ABILITY_KEYS.has(event.code)) {
      if (!event.repeat && !isInteractiveTarget(event.target)) {
        this.commandHandler(GAME_COMMAND.ABILITY);
      }
      event.preventDefault();
      return;
    }

    if (event.repeat) {
      return;
    }

    if (event.code === 'Space' && !isInteractiveTarget(event.target)) {
      this.commandHandler(GAME_COMMAND.PRIMARY);
      event.preventDefault();
    } else if (event.code === 'Escape') {
      this.commandHandler(GAME_COMMAND.TOGGLE_PAUSE);
    }
  }

  /** @param {KeyboardEvent} event */
  handleKeyUp(event) {
    // Releases are honored even while a modifier is held, so no key can get stuck.
    this.steerByKey(event, false);
  }

  // Key-up events are lost while the page is unfocused, so release everything and pause.
  handleFocusLoss() {
    this.player.release();
    this.opponent.release();
    this.action = false;
    this.clearFlightTouch();
    this.commandHandler(GAME_COMMAND.PAUSE);
  }

  /**
   * Which paddle a pointer belongs to: the one already following it, else the one for the
   * half of the board it touched.
   *
   * @param {PointerEvent} event
   * @param {DOMRect} rect
   */
  paddleFor(event, rect) {
    if (this.players !== 2) {
      return this.player;
    }

    if (this.player.pointerId === event.pointerId) {
      return this.player;
    }

    if (this.opponent.pointerId === event.pointerId) {
      return this.opponent;
    }

    return event.clientY < rect.top + rect.height / 2 ? this.opponent : this.player;
  }

  /**
   * @param {PointerEvent} event
   * @param {boolean} isPress a press (click or tap) always takes over steering
   */
  handlePointer(event, isPress) {
    // Touch modes are reserved for Warp. The rest of the cabinet retains its
    // original absolute drag, hover-mouse and keyboard controls.
    if (this.warpSteering !== 'drag' && this.players === 1) {
      const target = /** @type {{ closest?: (selector: string) => Element | null, dataset?: DOMStringMap } | null} */ (event.target);
      const turnButton = target?.closest?.('[data-warp-steer]')
        ?? (target?.dataset?.warpSteer ? /** @type {unknown} */ (target) : null);
      if (turnButton) {
        if (isPress && this.warpSteering === 'buttons') {
          const side = /** @type {{ dataset: { warpSteer?: string }, setPointerCapture?: (id: number) => void }} */ (turnButton);
          this.turnTouches.set(event.pointerId, side.dataset.warpSteer === 'left' ? -1 : 1);
          side.setPointerCapture?.(event.pointerId);
          event.preventDefault?.();
        }
        return;
      }
      if (touchPointer(event)) {
        if (this.warpSteering === 'stick') this.handleFlightStick(event, isPress);
        // In buttons mode touch on empty road never accidentally shifts the ship.
        return;
      }
    }

    if (isInteractiveTarget(event.target) || this.dialogOpen()) {
      return; // Buttons on the surface, and any open dialog, keep their own meaning.
    }

    const rect = this.board.getBoundingClientRect();
    const paddle = this.paddleFor(event, rect);

    if (paddle === this.player) {
      this.readAction(event, isPress);
    }

    // Moves without horizontal travel (vertical or synthetic) must not take over from the keyboard.
    if (!isPress && event.clientX === paddle.lastClientX) {
      return;
    }

    // In a two-player match a finger or mouse commits to a paddle only by pressing, so a
    // hovering mouse steers nothing and cannot claim the other player's paddle.
    if (this.players === 2 && !isPress && paddle.pointerId !== event.pointerId) {
      return;
    }

    if (isPress || paddle.pointerId === null) {
      paddle.pointerId = event.pointerId;
    }

    paddle.lastClientX = event.clientX;
    paddle.pointerX = ((event.clientX - rect.left) / rect.width) * this.config.width;
  }

  /**
   * A virtual stick can start from any free point in the lower half of the
   * canvas, without instantly moving the craft there. Only the owning pointer
   * can move it. A second finger can still operate the bridge's five systems.
   * @param {PointerEvent} event
   * @param {boolean} isPress
   */
  handleFlightStick(event, isPress) {
    if (this.dialogOpen() || isInteractiveTarget(event.target)) return;
    const rect = this.board.getBoundingClientRect();
    if (isPress) {
      if (this.stick || event.clientY < rect.top + rect.height * 0.47) return;
      this.stick = {
        pointerId: event.pointerId,
        x: event.clientX,
        y: event.clientY,
        radius: Math.max(STICK_RADIUS_MIN, Math.min(STICK_RADIUS_MAX, rect.width * 0.24)),
      };
      this.player.pointerX = null;
      this.player.pointerId = null;
      this.stickAxis = 0;
      if (this.stickIndicator) {
        this.stickIndicator.style.left = `${event.clientX - rect.left}px`;
        this.stickIndicator.style.top = `${event.clientY - rect.top}px`;
        this.stickIndicator.hidden = false;
      }
      event.preventDefault?.();
    }
    if (!this.stick || event.pointerId !== this.stick.pointerId) return;
    const dx = Math.max(-this.stick.radius, Math.min(this.stick.radius, event.clientX - this.stick.x));
    const dy = Math.max(-this.stick.radius, Math.min(this.stick.radius, event.clientY - this.stick.y));
    this.stickAxis = analogFlightAxis(dx, this.stick.radius);
    if (this.stickKnob) this.stickKnob.style.transform = `translate3d(${dx * 0.53}px, ${dy * 0.53}px, 0)`;
  }

  /**
   * Whether a pointer asks for the player's extra: a mouse by its click, a finger by a swipe
   * up, measured from the lowest point of its stroke, so steering along the rail never asks.
   *
   * @param {PointerEvent} event
   * @param {boolean} isPress
   */
  readAction(event, isPress) {
    const { player } = this;

    if (event.pointerType === 'mouse') {
      this.action ||= isPress;
      return;
    }

    if (isPress || !player.low || event.clientY > player.low.y) {
      player.low = { x: event.clientX, y: event.clientY };
      return;
    }

    const rise = player.low.y - event.clientY;

    if (rise >= SWIPE_UP_PIXELS && rise > Math.abs(event.clientX - player.low.x)) {
      this.action = true;
      // The next swipe starts from here.
      player.low = { x: event.clientX, y: event.clientY };
    }
  }

  /** @param {PointerEvent} event */
  releasePointer(event) {
    this.turnTouches.delete(event.pointerId);
    if (this.stick?.pointerId === event.pointerId) {
      this.stick = null;
      this.stickAxis = 0;
      if (this.stickIndicator) this.stickIndicator.hidden = true;
      if (this.stickKnob) this.stickKnob.style.transform = '';
    }
    for (const paddle of [this.player, this.opponent]) {
      if (paddle.pointerId === event.pointerId) {
        // The paddle stays where the finger left it; only the binding is dropped.
        paddle.pointerId = null;
        paddle.low = null;
      }
    }
  }

  /**
   * What the players are asking for now. A request for the extra is told once, in the first
   * snapshot after it was made.
   *
   * @returns {InputSnapshot}
   */
  snapshot() {
    const snapshot = {
      horizontalAxis: this.stick ? this.stickAxis
        : Math.max(-1, Math.min(1, this.player.axis + [...this.turnTouches.values()].reduce((a, b) => a + b, 0))),
      pointerX: this.stick || this.turnTouches.size ? null : this.player.pointerX,
      opponentAxis: this.opponent.axis,
      opponentPointerX: this.opponent.pointerX,
    };
    const { action } = this;
    this.action = false;

    return action ? { ...snapshot, action } : snapshot;
  }
}
