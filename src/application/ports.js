/**
 * Contracts between the application core and its adapters. Adapters implement these
 * shapes and receive them at the composition root; the core never imports an adapter.
 *
 * @import { GameConfig, GameEvent, GamePhase, GameState, InputSnapshot, Modifiers, Rules, Side } from '../domain/types.js'
 */

/** The commands adapters may send to the application. */
export const GAME_COMMAND = Object.freeze({
  /** Start a new match when idle, or resume a paused one. */
  START: 'start',
  /** Abandon the current match and start a new one right away. */
  RESTART: 'restart',
  TOGGLE_PAUSE: 'toggle-pause',
  /** Pause only if running; sent when the page loses focus. */
  PAUSE: 'pause',
  /** Back to the menu. */
  RESET: 'reset',
  /** Space: start a new match when idle, otherwise toggle pause. */
  PRIMARY: 'primary',
  /** Show the screen again as it is: a preference it draws on has changed, such as the player's initials. */
  REFRESH: 'refresh',
});

/** @type {readonly Difficulty[]} */
export const DIFFICULTIES = Object.freeze(['easy', 'normal', 'hard']);

/** @type {readonly Mode[]} */
export const MODES = Object.freeze(['solo', 'rush', 'duo', 'career']);

/**
 * The backing tracks, in the order the track button cycles through them.
 * @type {readonly TrackId[]}
 */
export const TRACK_IDS = Object.freeze(['neon', 'arena', 'anthem', 'contender', 'iron', 'eurodance', 'rave', 'trance', 'rondo', 'cancan']);

/**
 * @typedef {(typeof GAME_COMMAND)[keyof typeof GAME_COMMAND]} GameCommand
 * @typedef {(command: GameCommand) => void} CommandHandler
 * @typedef {'easy' | 'normal' | 'hard'} Difficulty
 * @typedef {'solo' | 'rush' | 'duo' | 'career'} Mode Solo against the computer, a Rush survival run,
 *   two people, or the career ladder of rivals.
 * @typedef {'neon' | 'arena' | 'anthem' | 'contender' | 'iron' | 'eurodance' | 'rave' | 'trance' | 'rondo' | 'cancan'} TrackId
 *
 * @typedef {object} MatchStats Solo results, kept across visits.
 * @property {number} matches
 * @property {number} wins
 * @property {number} streak current run of wins
 * @property {number} bestStreak
 *
 * @typedef {object} Preferences Choices that outlive a match.
 * @property {Mode} mode
 * @property {Difficulty} difficulty applied when the next Solo match starts
 * @property {boolean} powerUps whether power-ups appear in Solo and two-player matches
 * @property {boolean} supers whether the super meters fill in Solo, two-player and career matches
 * @property {boolean} sound
 * @property {boolean} music
 * @property {TrackId} track the backing track the next match plays
 * @property {boolean} jokes the fun extras: the computer's nicknames, finishers and the CONTINUE? countdown
 * @property {boolean} vibration
 * @property {boolean} tutorialSeen
 * @property {number} bestRally longest rally ever played
 * @property {number} bestRush most hits in a Rush run
 * @property {string} initials the three letters the player signs the high-score table with, or '' until they do
 * @property {MatchStats} stats
 * @property {number} rival the career rival the next career match is against, as a place on the ladder from 0
 * @property {readonly number[]} careerStars the best stars earned against each career rival, from 0 to 3
 * @property {readonly number[]} careerLosses losses in a row to each career rival since beating it
 *
 * @typedef {object} PreferencesPort
 * @property {() => Preferences} get
 * @property {(changes: Partial<Preferences>) => void} set
 *
 * @typedef {object} Rival A regular of the last arcade, on the career ladder.
 * @property {string} name the full form, in sentences and on the result screen
 * @property {string} short the scoreboard label, nine characters at most
 * @property {string} story one line of who they are, shown before the match
 * @property {string} emblem the neon emblem the interface draws for it, by name
 * @property {{ winning: string, beaten: string }} says its line after a match it won, and after one it lost
 * @property {boolean} boss whether it attacks the player's end of the court
 * @property {GameConfig} config how it plays
 *
 * @typedef {object} HighScore A row of the Rush high-score table.
 * @property {string} initials three letters
 * @property {string} name who holds it
 * @property {number} hits the run's hits
 *
 * @typedef {object} MatchCatalog The tunings a match can be built from.
 * @property {Readonly<Record<Difficulty, GameConfig>>} difficulties
 * @property {GameConfig} rush
 * @property {GameConfig} duo
 * @property {readonly Rival[]} career the career ladder, from the first rival to the last boss
 * @property {readonly HighScore[]} highScores the Rush high-score table as the arcade left it, best first
 *
 * @typedef {object} OpponentName Who the player faces, as the interface names them.
 * @property {string} label the short form on the scoreboard: CPU, P2, a nickname or a rival's
 * @property {string} name the full form in sentences: Computer, Player 2, a nickname or a rival's
 * @property {boolean} proper whether it is a name of its own, a nickname or a career rival's,
 *   which keeps its case in sentences
 *
 * @typedef {object} CareerView Where the player stands on the career ladder.
 * @property {number} index the rival's place on the ladder, from 0
 * @property {number} count rivals on the ladder
 * @property {number} unlocked the furthest rival the player may choose
 * @property {Omit<Rival, 'config'>} rival the rival of this match, or of the next one in the menu
 * @property {number} stars the best stars earned against this rival
 * @property {number} earned the stars the match just finished earned
 * @property {boolean} eased whether this rival plays tired, after beating the player twice in a row
 * @property {string | null} next who the next match is against, when a win has moved the ladder on
 * @property {number} totalStars the best stars earned against every rival, added up
 * @property {number} beaten rivals beaten at least once
 *
 * @typedef {HighScore & { rank: number, own: boolean }} HighScoreRow A row in its place.
 *   `rank` counts from 1, and is 0 for a run that is not on the table; `own` marks the player's.
 *
 * @typedef {object} HighScoresView The Rush high-score table, with the player's best run in its place.
 * @property {readonly HighScoreRow[]} rows the table, best first
 * @property {HighScoreRow} own the player's row: one of `rows`, or off the table with rank 0
 * @property {HighScoreRow | null} target the row to beat next: the one above the player's, or the
 *   table's last row while the player is off it; null once the player holds the record
 * @property {boolean} signed whether the player has entered initials
 * @property {readonly string[]} passed whose rows the run just finished went past, lowest first
 *
 * @typedef {object} Presentation What the view shows around the board.
 * @property {GamePhase} phase
 * @property {Mode} mode
 * @property {Difficulty} difficulty
 * @property {Rules} rules how the match is won, so the view never repeats them from memory
 * @property {OpponentName} opponent
 * @property {string} status
 * @property {Record<Side, number>} score
 * @property {Record<Side, number>} hits
 * @property {number} lives misses left in Rush
 * @property {number} maxLives
 * @property {number} rally
 * @property {number} longestRally
 * @property {number} bestRally
 * @property {boolean} newBest whether this match set a new best rally
 * @property {number} bestRush
 * @property {boolean} newBestRush whether this run set a new Rush record
 * @property {Side | null} matchPoint the side one point from winning
 * @property {Record<Side, Modifiers>} modifiers
 * @property {MatchStats} stats
 * @property {Side | null} winner
 * @property {CareerView | null} career in the career mode
 * @property {HighScoresView | null} highScores in Rush
 *
 * @typedef {object} InputPort
 * @property {(handler: CommandHandler) => void} onCommand
 * @property {(layout: { players: 1 | 2 }) => void} configure how many people steer paddles
 * @property {() => InputSnapshot} snapshot
 * @property {() => void} connect
 * @property {() => void} disconnect
 *
 * @typedef {object} ViewPort
 * @property {(handler: CommandHandler) => void} onCommand
 * @property {(presentation: Presentation) => void} render
 * @property {() => void} connect
 * @property {() => void} disconnect
 *
 * @typedef {object} RendererPort
 * @property {(state: GameState, config: GameConfig) => void} render
 * @property {() => void} connect
 * @property {() => void} disconnect
 *
 * @typedef {object} FeedbackPort Turns game events into sound, vibration or visual effects.
 * @property {(events: readonly GameEvent[], state: GameState, config: GameConfig) => void} handle
 *   the events of one transition, with the state they produced and the match's tuning
 *
 * @typedef {object} FrameScheduler
 * @property {(callback: (timestamp: number) => void) => number} request
 * @property {(frameId: number) => void} cancel
 */
