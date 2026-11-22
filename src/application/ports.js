/**
 * Contracts between the application core and its adapters. Adapters implement these
 * shapes and receive them at the composition root; the core never imports an adapter.
 *
 * @import { CraftKind, GameConfig, GameEvent, GamePhase, GameState, InputSnapshot, Modifiers, Rules, Side } from '../domain/types.js'
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
  /** Trigger the currently flown Warp craft's signature system. */
  ABILITY: 'ability',
  WARP_NITRO: 'warp-nitro',
  WARP_GUNS: 'warp-guns',
  WARP_ROCKETS: 'warp-rockets',
  WARP_SHIELD: 'warp-shield',
  WARP_STEERING_CYCLE: 'warp-steering-cycle',
});

/** @type {readonly Difficulty[]} */
export const DIFFICULTIES = Object.freeze(['easy', 'normal', 'hard']);

/** The three persistent Warp control schemes, from classic to accessible touch controls. */
export const WARP_STEERING_MODES = Object.freeze(['drag', 'buttons', 'stick']);

/** @type {readonly Mode[]} */
export const MODES = Object.freeze(['solo', 'rush', 'duo', 'career', 'bricks', 'nova', 'warp']);

/**
 * The systems of a Warp craft that the hangar tunes, in the order it lists them.
 * @type {readonly CraftSystem[]}
 */
export const CRAFT_SYSTEMS = Object.freeze(['engine', 'nitro', 'grip', 'armor', 'guns']);

/**
 * The backing tracks, in the order the track button cycles through them.
 * @type {readonly TrackId[]}
 */
export const TRACK_IDS = Object.freeze(['neon', 'arena', 'anthem', 'contender', 'iron', 'eurodance', 'rave', 'trance', 'rondo', 'cancan', 'ode', 'shchedryk']);

/**
 * @typedef {(typeof GAME_COMMAND)[keyof typeof GAME_COMMAND]} GameCommand
 * @typedef {(command: GameCommand) => void} CommandHandler
 * @typedef {'easy' | 'normal' | 'hard'} Difficulty
 * @typedef {'drag' | 'buttons' | 'stick'} WarpSteeringMode
 * @typedef {'solo' | 'rush' | 'duo' | 'career' | 'bricks' | 'nova' | 'warp'} Mode Solo against the computer,
 *   a Rush survival run, two people, the career ladder of rivals, Bricks, the paddle against a
 *   wall, Nova, the paddle as a starship, or Warp, the paddle as a racing craft.
 * @typedef {'neon' | 'arena' | 'anthem' | 'contender' | 'iron' | 'eurodance' | 'rave' | 'trance' | 'rondo' | 'cancan' | 'ode' | 'shchedryk'} TrackId
 *
 * @typedef {'engine' | 'nitro' | 'grip' | 'armor' | 'guns'} CraftSystem
 *
 * @typedef {object} CraftSetup How the player has set up a craft they own.
 * @property {Record<CraftSystem, number>} tune the level each system is tuned to, from 0
 * @property {string} paint the paint it wears, by name; '' for the craft's own
 * @property {string} decal how the paint is marked, by name; '' for none
 * @property {string} glow the light under it, by name; '' for the craft's own
 *
 * @typedef {object} HangarChoices The player's hangar.
 * @property {string} craft the craft they fly, by its id; '' for the first
 * @property {Record<string, CraftSetup>} owned the crafts they have bought or set up, by id
 *
 * @typedef {object} CraftSpec A craft the hangar offers.
 * @property {string} id
 * @property {string} name
 * @property {CraftKind} kind
 * @property {number} price in tickets; 0 for the craft everyone has
 * @property {string} blurb a line on what it is good at
 * @property {Readonly<Record<CraftSystem, number>>} stats how good each system is untuned, from 1 to 5
 * @property {string} paint the paint it comes in, by name
 *
 * @typedef {object} HangarCatalog What the hangar offers.
 * @property {readonly CraftSpec[]} crafts the first is the one everyone has
 * @property {Readonly<Record<CraftSystem, string>>} systems what each system is called
 * @property {readonly number[]} prices what each level of a system costs, the first level first
 * @property {readonly { id: string, name: string, rgb: string }[]} paints
 * @property {readonly { id: string, name: string }[]} decals the first is none
 * @property {number} pointsPerTicket points of a cup that pay out a ticket
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
 * @property {number} bestBricks most points in a Bricks game
 * @property {number} bestNova most points in a Nova game
 * @property {number} bestWarp most points in a Warp cup
 * @property {number} tickets what the cabinet has paid out for Warp cups, to spend in the hangar
 * @property {HangarChoices} hangar the crafts the player owns, how each is set up, and which they fly
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
 * @property {GameConfig} bricks
 * @property {GameConfig} nova
 * @property {GameConfig} warp
 * @property {HangarCatalog} hangar the crafts, tuning and paint the Warp game's hangar offers
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
 * @typedef {object} BricksView How a Bricks game stands.
 * @property {number} level the wall being played, counted from 1
 * @property {number} levels walls in the game
 * @property {string} name the wall's name
 * @property {number} points
 * @property {number} best the most points the player ever made
 * @property {boolean} newBest whether the game just finished set a new record
 *
 * @typedef {object} NovaView How a Nova game stands.
 * @property {number} sector the sector being flown, counted from 1
 * @property {number} sectors sectors in the game
 * @property {string} name the sector's name
 * @property {number} points
 * @property {number} best the most points the player ever made
 * @property {boolean} newBest whether the game just finished set a new record
 *
 * @typedef {object} WarpView How a Warp cup stands.
 * @property {number} race the race being flown, counted from 1
 * @property {number} races races in the cup
 * @property {string} name the course's name
 * @property {number} place the player's place in the race
 * @property {number} points
 * @property {number} best the most points the player ever made
 * @property {boolean} newBest whether the cup just finished set a new record
 * @property {string} craft the craft being flown, by name
 * @property {WarpSteeringMode} steering selected flight control scheme
 * @property {number} abilityCooldown seconds before its signature system can be fired again
 * @property {number} abilityTime seconds remaining of the active signature system
 * @property {Record<'nitro' | 'guns' | 'rockets' | 'shield' | 'warp', { ready: boolean, status: string }>} controls the live readiness of the five bridge buttons
 * @property {number} tickets what the player has to spend in the hangar
 * @property {number} earned the tickets the cup just finished paid out
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
 * @property {number} lives misses left in Rush, balls left in Bricks, ships left in Nova, or credits left in Warp
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
 * @property {BricksView | null} bricks in Bricks
 * @property {NovaView | null} nova in Nova
 * @property {WarpView | null} warp in Warp
 *
 * @typedef {object} InputPort
 * @property {(handler: CommandHandler) => void} onCommand
 * @property {(layout: { players: 1 | 2, warpSteering?: WarpSteeringMode }) => void} configure how many people steer paddles and Warp control mode
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
