/** @import { WarpStoryState } from './warp-story.js' */

/**
 * Shapes shared by the game domain. This module is type-only: it exports no runtime values.
 *
 * @typedef {'ready' | 'running' | 'paused' | 'game-over'} GamePhase
 * @typedef {'player' | 'opponent'} Side
 * @typedef {'wide' | 'shrink' | 'turbo' | 'ghost' | 'multi'} PowerUpKind
 *
 * @typedef {object} Ball
 * @property {number} x
 * @property {number} y
 * @property {number} vx
 * @property {number} vy
 * @property {number} spin Curve rate in radians per second; positive spin bends the ball toward +x.
 *
 * @typedef {Ball & { id: number, ttl: number }} ExtraBall A ball Multiball split off the ball.
 *   It bounces, is returned and scores like the ball, but its returns do not count toward the
 *   rally; it fades after `ttl` seconds, and the next point clears it.
 *
 * @typedef {object} Paddle
 * @property {number} x
 * @property {number} vx Smoothed horizontal velocity, which a hit turns into spin.
 *
 * @typedef {object} Pickup A power-up waiting on the court.
 * @property {number} id
 * @property {PowerUpKind} kind
 * @property {number} x
 * @property {number} y
 * @property {number} ttl Seconds before it vanishes.
 *
 * @typedef {object} Modifiers Seconds left on the power-up effects a side is under.
 * @property {number} wide This side's paddle is enlarged.
 * @property {number} tiny This side's paddle is shrunk, by the other side's Shrink or a boss's attack.
 * @property {number} ghost This side cannot see the ball in its own half, by the other side's Ghost.
 * @property {number} lag This side sees the balls move in fits and starts, by the Lag boss's attack.
 *
 * @typedef {'drip' | 'beam' | 'lag'} HazardKind
 *
 * @typedef {object} Hazard A boss's attack on the player, announced before it strikes.
 * @property {HazardKind} kind a drip falls toward the player's paddle; a beam strikes a column
 *   of the player's half; lag makes the player see the balls in fits and starts
 * @property {number} x center
 * @property {number} y a drip's center; a beam and lag have no height
 * @property {number} warn seconds of warning left before it strikes
 * @property {number} ttl seconds a beam stays dangerous once it strikes
 *
 * @typedef {'fireball' | 'zigzag' | 'phantom' | 'thunder'} SuperKind
 *
 * @typedef {object} SuperMeter A side's super meter, which returns and lost points fill.
 * @property {number} charge from 0 to 1; a full meter holds a super, which a flick at a return fires
 * @property {SuperKind | null} kind the super a full meter holds, drawn as it fills; after it is
 *   fired, the last one, which the next draw avoids
 *
 * @typedef {object} SuperShot A super in flight, until it is returned or a point is scored.
 * @property {SuperKind} kind
 * @property {Side} side who fired it
 * @property {number} speed the speed an ordinary return would have had; the return that answers
 *   the super goes on from it, so the rally keeps its pace
 *
 * @typedef {'plain' | 'tough' | 'steel' | 'bomb'} BrickKind
 *
 * @typedef {object} Brick A brick of the Bricks game's wall.
 * @property {number} id
 * @property {number} row its row in the level's layout, from 0 at the top; the board colors it by row
 * @property {number} x its left edge where the formation rests; a drifting formation adds its drift
 * @property {number} y its top edge
 * @property {number} w
 * @property {number} h
 * @property {BrickKind} kind plain breaks at a touch; tough takes several; steel only breaks to a
 *   blast or a super; a bomb blasts its neighbors as it goes
 * @property {number} hp hits it still takes
 * @property {number} fuse seconds until a bomb caught in a blast goes off itself; 0 while unlit
 *
 * @typedef {'wide' | 'multi' | 'laser' | 'shield' | 'slow' | 'life'} DropKind
 *
 * @typedef {object} Drop A bonus falling from a broken brick, for the paddle to catch.
 * @property {number} id
 * @property {DropKind} kind
 * @property {number} x
 * @property {number} y
 * @property {number} vy it falls under gravity, up to a top speed
 *
 * @typedef {object} Bolt A laser bolt the paddle fired, flying up.
 * @property {number} id
 * @property {number} x
 * @property {number} y
 *
 * @typedef {object} BricksState The wall and everything around it in the Bricks game.
 * @property {number} level the level being played, from 0
 * @property {readonly Brick[]} bricks
 * @property {number} time seconds played on this level, which a drifting formation moves by
 * @property {number} drift how far the formation has drifted sideways from where it rests
 * @property {readonly Drop[]} drops
 * @property {readonly Bolt[]} bolts
 * @property {number} laser seconds of laser left
 * @property {number} laserIn seconds until the laser fires again
 * @property {number} shield saves the safety net under the paddle still has
 * @property {number} combo bricks broken since the paddle last touched a ball
 * @property {number} points
 * @property {number} pierce bricks a fireball in flight still passes through
 * @property {number} idle wall and steel bounces since anything broke or the paddle played
 * @property {number} quiet seconds of play since a brick last broke, or a tough one took a hit
 * @property {number} nextId
 *
 * @typedef {'ball' | 'bolt' | 'blast' | 'super'} BreakCause
 *
 * @typedef {'rock' | 'pebble' | 'drone' | 'gunship' | 'boss'} EnemyKind
 *
 * @typedef {object} Enemy Something the ship of the Nova game shoots at.
 * @property {number} id
 * @property {EnemyKind} kind a rock splits in two pebbles; a drone weaves down and fires at the
 *   ship; a gunship comes to a stop near the top and strafes; the boss is the last sector's
 * @property {number} x center
 * @property {number} y
 * @property {number} vx
 * @property {number} vy
 * @property {number} rx half its width, as it is hit
 * @property {number} ry half its height
 * @property {number} hp
 * @property {number} maxHp
 * @property {number} age seconds since it appeared
 * @property {number} home a drone's line it weaves about, a gunship's stop
 * @property {number} sway how far a drone weaves to each side
 * @property {number} phase where in its weave a drone started
 * @property {number} angle a rock's turn, in radians
 * @property {number} spin a rock's turning, in radians a second
 * @property {number} fireIn seconds until it fires
 * @property {number} altIn seconds until the boss fires its second pattern
 *
 * @typedef {'bolt' | 'spread' | 'fireball'} ShotKind
 *
 * @typedef {object} Shot A shot the ship fired, flying up.
 * @property {number} id
 * @property {ShotKind} kind
 * @property {number} x
 * @property {number} y
 * @property {number} vx
 * @property {number} vy
 * @property {number} power damage it does
 * @property {number} radius
 * @property {readonly number[]} hits enemies a fireball has gone through; it hits each once
 *
 * @typedef {object} EnemyShot A shot an enemy fired at the ship.
 * @property {number} id
 * @property {number} x
 * @property {number} y
 * @property {number} vx
 * @property {number} vy
 *
 * @typedef {'rapid' | 'triple' | 'shield' | 'life'} LootKind
 *
 * @typedef {object} Loot A bonus falling from a downed enemy, for the ship to catch.
 * @property {number} id
 * @property {LootKind} kind
 * @property {number} x
 * @property {number} y
 *
 * @typedef {object} NovaState Space and everything in it in the Nova game.
 * @property {number} sector the sector being played, from 0
 * @property {number} time seconds played in this sector
 * @property {number} wave the wave of the sector being sent in, from 0
 * @property {number} spawned enemies of that wave sent in so far
 * @property {number} spawnIn seconds until the next one is
 * @property {number} sinceSpawn seconds since the last one was
 * @property {boolean} bossSent whether the sector's boss has come
 * @property {readonly Enemy[]} enemies
 * @property {readonly Shot[]} shots the ship's
 * @property {readonly EnemyShot[]} fire the enemies'
 * @property {readonly Loot[]} loot
 * @property {number} fireIn seconds until the ship fires again
 * @property {number} rapid seconds of rapid fire left
 * @property {number} triple seconds of the triple shot left
 * @property {number} shield hits the ship's shield still takes
 * @property {number} cloak seconds the ship is a phantom: nothing can hit it
 * @property {number} invulnerable seconds the ship is safe after it was hit
 * @property {number} calm seconds before the sector's first wave comes in
 * @property {number} chain enemies downed since the ship was last hit
 * @property {number} points
 * @property {number} nextId
 *
 * @typedef {'bolt' | 'super' | 'ram'} DownCause
 *
 * @typedef {'ring' | 'pad' | 'ramp' | 'gate' | 'crate' | 'cell' | 'mine' | 'debris' | 'cargo'} TrackItemKind
 *
 * @typedef {object} TrackItem Something on a Warp course, where it stands.
 * @property {number} id
 * @property {TrackItemKind} kind a ring to fly through, a boost pad to fly over, a ramp to jump
 *   from, a gate, which is a barrier across the lane with a gap to thread, a crate with a
 *   rocket in it or a cell of nitro to pick up, or something to fly round: a mine, a drifting
 *   piece of debris, or a slow cargo craft
 * @property {number} z how far along the course, in meters
 * @property {number} x across the lane, from -1 at its left edge to 1 at its right; a gate's gap
 * @property {number} sway how far it drifts to either side, across the lane, as time goes
 * @property {boolean} air whether it hangs in the air, where only a craft off a ramp reaches it
 *
 * @typedef {object} Course A Warp course as it is flown: its bends, its hills and what is on it.
 * @property {number} length in meters, from the start to the finish line
 * @property {readonly number[]} curves the bend of each stretch of the course, a stretch a segment
 * @property {readonly (readonly [number, number, number])[]} hills the waves its height is the sum
 *   of: how high each is, how long, and where along itself it begins, from 0 to 1
 * @property {readonly TrackItem[]} items in the order they come
 *
 * @typedef {object} Racer A rival in a Warp race.
 * @property {number} id
 * @property {number} pilot who flies it: a place in the course's list of pilots
 * @property {number} z how far along the course, in meters
 * @property {number} x across the lane, from -1 to 1
 * @property {number} speed meters a second
 * @property {number} line where across the lane it means to be
 * @property {number} lineIn seconds until it picks a new line
 * @property {number} boost seconds of boost left
 * @property {number} spin seconds it is still spinning after a hit
 * @property {number} bumped seconds before it can be bumped again
 * @property {number} air seconds it is still in the air after a ramp
 * @property {number} mineIn seconds until a pilot who drops mines may drop the next
 * @property {number} hull how much more the player's guns must do to it to take it down
 * @property {number} finish seconds the race had run when it crossed the line; 0 until then
 *
 * @typedef {object} Missile A rocket the player has launched, on its way to a rival.
 * @property {number} id
 * @property {number} z
 * @property {number} x
 * @property {number} target the rival it homes on, by its id
 *
 * @typedef {object} WarpState A Warp race and the cup it is part of.
 * @property {number} race the race being flown, from 0
 * @property {WarpStoryState} story the optional chapter mission, transmissions and prior recovered signal fragments
 * @property {Course} course
 * @property {number} time seconds since the start lights went green
 * @property {number} z how far the player has flown, in meters
 * @property {number} speed meters a second
 * @property {number} cursor the next item on the course the player has yet to reach
 * @property {readonly Racer[]} rivals
 * @property {readonly TrackItem[]} drops mines a rival has dropped ahead of the player, nearest first
 * @property {number} dropped mines dropped so far in the race
 * @property {number} place the player's place in the race, from 1
 * @property {number} boost seconds of boost left
 * @property {number} spin seconds the player is still spinning after a hit
 * @property {number} safe seconds the player cannot be hit again after one
 * @property {number} burn seconds of a fireball's afterburner left
 * @property {number} ghost seconds of a phantom left
 * @property {number} air seconds the player is still in the air after a ramp
 * @property {number} nitro bars of nitro in the tank
 * @property {number} nitroBurn seconds of the bar being burned left
 * @property {number} gunTime seconds of manual rapid-fire overdrive
 * @property {number} gunCooldown seconds until the gun overdrive can fire again
 * @property {number} shieldTime seconds left of the emergency energy shield
 * @property {number} shieldCooldown seconds until the emergency field can deploy again
 * @property {number} abilityCooldown seconds before the signature craft system can be fired again
 * @property {number} abilityTime remaining seconds of the active signature system
 * @property {number} shield hits the craft's shield still takes in its place
 * @property {number} rockets rockets aboard
 * @property {number} lock how far the rockets have locked on to a rival, from 0 to 1
 * @property {number} lockOn the rival being locked on to, by its id; 0 for none
 * @property {number} aim the rival the guns are firing at, by its id; 0 for none
 * @property {number} gunIn seconds until the guns' fire is next told of
 * @property {readonly Missile[]} missiles rockets in flight
 * @property {number} fired rockets launched so far in the race
 * @property {number} slip slipstream built up behind a rival, from 0 to 1
 * @property {number} drift drift charged on the inside of a bend, from 0 to 1
 * @property {number} chain rings flown dead center in a row
 * @property {number} flow tricks landed since the last crash, which multiply what a trick scores
 * @property {boolean} launched whether the start is behind: the moment for a rocket start is over
 * @property {number} points the cup's points: every race counts once, as it was last flown
 * @property {number} banked the cup's points as this race started: what a race flown again goes back to
 * @property {number} lost points of races flown again, which the cup does not count
 * @property {number} calm seconds of the pause after a race, before the next one's start lights
 * @property {boolean} retry whether the race after the pause is this one again
 * @property {boolean} finished whether the player has crossed the line
 * @property {number} finishTime seconds the race had run when the player crossed the line
 *
 * @typedef {{ type: 'match-start' }
 *   | { type: 'menu' }
 *   | { type: 'paused' }
 *   | { type: 'resumed' }
 *   | { type: 'countdown', value: number }
 *   | { type: 'serve', x: number, y: number }
 *   | { type: 'paddle-hit', side: Side, x: number, y: number, speed: number, spin: number, offset: number, rally: number, extra?: boolean, super?: SuperKind, saved?: SuperKind }
 *   | { type: 'paddle-graze', side: Side, x: number, y: number, speed: number }
 *   | { type: 'wall-bounce', x: number, y: number, speed: number }
 *   | { type: 'pickup-spawn', kind: PowerUpKind, x: number, y: number }
 *   | { type: 'pickup', kind: PowerUpKind, side: Side, x: number, y: number }
 *   | { type: 'point', scorer: Side, x: number, y: number, super?: SuperKind }
 *   | { type: 'match-point', side: Side }
 *   | { type: 'life-lost', lives: number }
 *   | { type: 'hazard-warn', kind: HazardKind, x: number }
 *   | { type: 'hazard-hit', kind: HazardKind, x: number, y: number }
 *   | { type: 'super-ready', side: Side, kind: SuperKind }
 *   | { type: 'super-swerve', x: number, y: number }
 *   | { type: 'boss-phase', phase: number }
 *   | { type: 'brick-hit', kind: BrickKind, row: number, x: number, y: number, hp: number }
 *   | { type: 'brick-break', kind: BrickKind, row: number, x: number, y: number, w: number, h: number, by: BreakCause, vx: number, vy: number, combo: number, points: number }
 *   | { type: 'blast', x: number, y: number, radius: number }
 *   | { type: 'strike', kind: SuperKind, x: number, y: number }
 *   | { type: 'drop-spawn', kind: DropKind, x: number, y: number }
 *   | { type: 'drop', kind: DropKind, x: number, y: number }
 *   | { type: 'bolt-fire', x: number, y: number }
 *   | { type: 'shield-save', x: number, y: number }
 *   | { type: 'level-clear', level: number, bonus: number, last: boolean }
 *   | { type: 'ship-fire', x: number, y: number }
 *   | { type: 'enemy-arrive', kind: EnemyKind, x: number, y: number }
 *   | { type: 'enemy-hit', kind: EnemyKind, x: number, y: number, hp: number }
 *   | { type: 'enemy-down', kind: EnemyKind, x: number, y: number, rx: number, by: DownCause, points: number, multiplier: number }
 *   | { type: 'enemy-fire', kind: EnemyKind, x: number, y: number, count: number }
 *   | { type: 'ship-hit', x: number, y: number }
 *   | { type: 'loot-spawn', kind: LootKind, x: number, y: number }
 *   | { type: 'loot', kind: LootKind, x: number, y: number }
 *   | { type: 'super-fire', kind: SuperKind, x: number, y: number }
 *   | { type: 'chain', x: number, y: number, targets: readonly { x: number, y: number }[] }
 *   | { type: 'boss-rage', phase: number, x: number, y: number }
 *   | { type: 'sector-clear', sector: number, bonus: number, last: boolean }
 *   | { type: 'ring', grade: 'perfect' | 'good' | 'miss', chain: number, air: boolean, z: number, x: number, points: number }
 *   | { type: 'boost', z: number, x: number, by: 'pad' | 'slingshot' | 'super' | 'drift' | 'start' }
 *   | { type: 'crash', z: number, x: number, kind: TrackItemKind, pilot?: number }
 *   | { type: 'jump', z: number, x: number, pilot?: number }
 *   | { type: 'land', z: number, x: number, points: number }
 *   | { type: 'gate', grade: 'perfect' | 'good', z: number, x: number, points: number }
 *   | { type: 'drift-ready', z: number, x: number }
 *   | { type: 'flow', multiplier: number }
 *   | { type: 'mine-drop', pilot: number, z: number, x: number }
 *   | { type: 'near-miss', z: number, x: number, points: number }
 *   | { type: 'bump', z: number, x: number }
 *   | { type: 'takedown', pilot: number, z: number, x: number, points: number, by: 'guns' | 'rocket' | 'ram' | 'super' }
 *   | { type: 'nitro', z: number, x: number }
 *   | { type: 'warp-system', system: 'guns' | 'shield', z: number, x: number }
 *   | { type: 'craft-ability', kind: CraftKind, z: number, x: number }
 *   | { type: 'story-complete', race: number, points: number, reward: 'nitro' | 'shield' | 'rocket' }
 *   | { type: 'gun-fire', z: number, x: number }
 *   | { type: 'rocket-launch', pilot: number, z: number, x: number }
 *   | { type: 'explosion', z: number, x: number }
 *   | { type: 'ammo', kind: 'rocket' | 'nitro', z: number, x: number }
 *   | { type: 'shield-hit', z: number, x: number, left: number }
 *   | { type: 'smash', kind: TrackItemKind, z: number, x: number, points: number }
 *   | { type: 'overtake', place: number, pilot: number, points: number }
 *   | { type: 'overtaken', place: number, pilot: number }
 *   | { type: 'slipstream', z: number, x: number }
 *   | { type: 'lightning', targets: readonly { z: number, x: number }[] }
 *   | { type: 'shockwave', z: number, x: number }
 *   | { type: 'final-stretch' }
 *   | { type: 'race-finish', race: number, place: number, points: number, qualified: boolean, last: boolean, margin: number }
 *   | { type: 'game-over', winner: Side, super?: SuperKind }} GameEvent
 *   A paddle-hit's `super` is the super that return fired and `saved` the one it answered; a
 *   point's and a game-over's `super` is the super that scored it. A boss-phase is a final boss
 *   moving on to its next phase, counted from 0, as the player closes in on winning. In the
 *   Bricks game, a brick-hit is a brick that took a hit and stands, at its center; a brick-break
 *   one that went, with what broke it, the velocity of what struck it, and the combo and points
 *   it made; a strike is thunder taking a column or a zigzag a row; a level-clear's bonus is in
 *   points, and its `last` says the game is won. In the Nova game a shield that takes a hit is a
 *   shield-save, an enemy-arrive is the boss coming in, a chain is thunder jumping from the ship
 *   to the enemies it strikes, and a boss-rage the boss moving on to its next pattern of fire.
 *   In Warp the course's things are where they are along it, `z`, and across the lane, `x`,
 *   which the board projects; a crash or a jump with a `pilot` is a rival's, one without the
 *   player's; a flow is the trick multiplier going up; a mine-drop is a rival dropping a mine;
 *   a gun-fire is where the player's guns are hitting, told a few times a second while they
 *   fire; an ammo is a rocket or a bar of nitro picked up; a shield-hit is a crash the shield took;
 *   and a race-finish's `margin` is the seconds between the player and the racer next to them
 *   in the order.
 *
 * @typedef {object} GameState
 * @property {GamePhase} phase
 * @property {Paddle} player
 * @property {Paddle} opponent
 * @property {Ball} ball
 * @property {readonly ExtraBall[]} extraBalls Balls a Multiball split off, until they fade or a point is scored.
 * @property {Record<Side, number>} score
 * @property {Record<Side, number>} hits Paddle hits over the whole match; the Rush score.
 * @property {number} lives Misses left in Rush; unused in a match.
 * @property {Side | null} lastPoint
 * @property {number} serveNumber
 * @property {number} serveCountdown Seconds the ball still waits at the center before it is served.
 * @property {number} rally Paddle hits since the last serve.
 * @property {number} longestRally Longest rally of the current match.
 * @property {readonly Pickup[]} pickups
 * @property {number} nextPickupIn Seconds until the next power-up may appear.
 * @property {Record<Side, Modifiers>} modifiers
 * @property {number} turbo Seconds left of the Turbo shot in flight; the next return ends it early.
 * @property {readonly Hazard[]} hazards A boss's attacks under way.
 * @property {number} attackIn Seconds of play until a boss attacks again; unused without a boss.
 * @property {Record<Side, SuperMeter>} meters The super meters; they stay empty with supers off.
 * @property {SuperShot | null} superShot The super in flight, if any.
 * @property {BricksState | null} bricks The Bricks game's wall; null in every other mode.
 * @property {NovaState | null} nova The Nova game's space; null in every other mode.
 * @property {WarpState | null} warp The Warp game's race; null in every other mode.
 * @property {number} seed State of the deterministic random source.
 * @property {readonly GameEvent[]} events What happened in the transition that produced this state.
 *
 * @typedef {object} InputSnapshot Device-neutral movement intent for one simulation step.
 * @property {number} horizontalAxis -1 (left), 0 (idle) or 1 (right) for the player's paddle.
 * @property {number | null} pointerX Absolute paddle target in board coordinates while a pointer steers.
 * @property {number} opponentAxis The same for a second human on the top paddle.
 * @property {number | null} opponentPointerX
 * @property {boolean} [action] Whether the player has just asked for their craft's extra: in
 *   Warp, a bar of nitro. A press, not a hold: true for one step.
 *
 * @typedef {{ kind: 'match', winningScore: number } | { kind: 'rush', lives: number } | { kind: 'bricks', lives: number } | { kind: 'nova', lives: number } | { kind: 'warp', lives: number }} Rules
 *
 * @typedef {'line' | 'snake' | 'left' | 'right' | 'scatter'} Formation
 *
 * @typedef {object} Wave A wave of a Nova sector: enemies of one kind, sent in one after another.
 * @property {'rock' | 'pebble' | 'drone' | 'gunship'} kind
 * @property {number} count
 * @property {number} every seconds between one and the next
 * @property {Formation} formation how drones come in: abreast, in a snake down the middle, down
 *   one side, or anywhere; rocks and gunships come in anywhere
 *
 * @typedef {object} SectorLayout A sector of the Nova game.
 * @property {string} name
 * @property {readonly Wave[]} waves
 * @property {boolean} boss whether the boss comes once its waves are down
 *
 * @typedef {'sunset' | 'canyon' | 'clouds' | 'orbit' | 'tunnel'} CourseTheme
 *
 * @typedef {'none' | 'blocker' | 'weaver' | 'miner'} PilotTrait How a pilot races: a blocker
 *   covers the player's line while they are close behind, a weaver changes its line all the
 *   time, and a miner drops mines for whoever follows.
 *
 * @typedef {'jet' | 'wing' | 'saucer' | 'dart' | 'heavy'} CraftKind
 *
 * @typedef {object} Loadout The player's craft as chosen and tuned: what it can do, and how it
 *   is painted.
 * @property {string} name
 * @property {CraftKind} kind
 * @property {string} paint "r, g, b"
 * @property {string} decal how its paint is marked: none, stripes, chevrons or flames
 * @property {string} glow "r, g, b" of the light under it and of its engines
 * @property {number} speed its top and boost speeds, as a share of the game's
 * @property {number} nitroBars bars its tank holds
 * @property {number} nitroSeconds how long a bar burns
 * @property {number} drift how long a drift takes to charge, as a share of the game's
 * @property {number} spin how long a crash spins it, as a share of the game's
 * @property {number} shields hits its shield takes in its place, a race
 * @property {number} damage what its guns do to a rival's hull, a second
 * @property {number} rockets rockets it carries at most
 *
 * @typedef {object} Pilot A racer of the Warp game, as the board names and paints it.
 * @property {string} name
 * @property {string} rgb "r, g, b"
 * @property {CraftKind} craft
 * @property {number} pace top speed, as a share of the player's
 * @property {number} skill chance of steering round what is in its way, from 0 to 1
 * @property {PilotTrait} trait
 *
 * @typedef {object} CourseLayout A Warp course, as it is written.
 * @property {string} name
 * @property {CourseTheme} theme how the board paints it
 * @property {number} length in meters
 * @property {readonly (readonly [number, number])[]} bends the course's bends: how long each is, in
 *   meters, and how hard it turns, negative to the left; a straight is a bend of 0
 * @property {readonly (readonly [number, number, number])[]} hills the waves its height is the sum
 *   of: how high each is, in heights of the eye above the lane, how long, in meters, and where
 *   along itself it begins, from 0 to 1
 * @property {{ rings: number, pads: number, mines: number, debris: number, cargo: number, ramps: number, gates: number, crates: number, cells: number }} every
 *   meters between one ring, pad, mine, piece of debris, cargo craft, ramp, gate, rocket crate or
 *   nitro cell and the next; 0 for none
 * @property {readonly Pilot[]} pilots the field the player races, slowest first
 * @property {number} qualify the worst place that goes through to the next race
 *
 * @typedef {object} WarpConfig How the Warp game plays.
 * @property {readonly CourseLayout[]} courses flown in order, the cup
 * @property {Loadout} loadout the craft the player flies
 * @property {number} segment meters in a stretch of the course
 * @property {number} topSpeed the player's speed with nothing helping or hindering it
 * @property {number} boostSpeed
 * @property {number} accel how quickly speed comes to what it should be, a share a second
 * @property {number} gravity how much a slope changes speed: faster downhill, slower up
 * @property {number} spinSeconds
 * @property {number} spinSpeed share of its speed a racer keeps when it is hit
 * @property {number} safeSeconds how long a racer that was hit cannot be hit again
 * @property {number} craftRadius the player's craft across the lane, as it is hit
 * @property {number} ringCenter how near a ring's middle counts as dead center
 * @property {number} ringRadius how near counts as through it
 * @property {number} padWidth half a boost pad's width
 * @property {number} padSeconds
 * @property {number} rampWidth half a ramp's width
 * @property {number} airSeconds how long a jump lasts
 * @property {number} gateGap half the width of a gate's gap
 * @property {number} gateCenter how near the gap's middle counts as threading it
 * @property {number} nearMiss how much nearer than a hit counts as a near miss
 * @property {number} draft how far behind a rival, in meters, its slipstream reaches
 * @property {number} slipSeconds how long a slipstream takes to build to a slingshot
 * @property {number} slingSeconds
 * @property {number} driftBend how hard a bend must turn for a drift to charge in it
 * @property {number} driftFrom how far toward the inside of the bend the craft must fly
 * @property {number} driftSeconds how long a drift takes to charge in a bend of 1
 * @property {number} driftBoostSeconds
 * @property {number} startWindow seconds after the lights go green in which a flick is a rocket start
 * @property {number} startBoostSeconds
 * @property {number} flowStep tricks that raise the trick multiplier by one
 * @property {number} maxFlow the highest the trick multiplier goes
 * @property {readonly number[]} placePoints points for each place at the finish
 * @property {number} chargePerTrick charge a trick adds to the super meter
 * @property {number} burnSeconds a fireball's afterburner
 * @property {number} ghostSeconds a phantom
 * @property {number} shockRange how far a zigzag's shockwave reaches, in meters
 * @property {number} pickupWidth half the width within which a crate or a cell is picked up
 * @property {number} nitroSpeed the speed a bar of nitro gives, for a craft of speed 1
 * @property {number} nitroPerTrick bars of nitro a trick adds to the tank
 * @property {number} gunRange how far ahead the guns reach, in meters
 * @property {number} gunAim how nearly in line a rival must be for the guns to bear
 * @property {number} rivalHull what the guns must do to a rival to take it down
 * @property {number} rocketRange how far ahead a rocket locks on, in meters
 * @property {number} rocketAim how nearly in line a rival must be to be locked on to
 * @property {number} lockSeconds how long a lock takes
 * @property {number} missileSpeed how much faster than the craft a rocket flies
 * @property {number} blastRange how far along the course a rocket's blast reaches, in meters
 * @property {number} overdriveSeconds how long the guns' overdrive fires, once pressed
 * @property {number} overdriveRecharge seconds before the overdrive can be pressed again
 * @property {number} overdriveDamage what the overdrive multiplies the guns' damage by
 * @property {number} shieldSeconds how long the emergency shield, once pressed, stays up
 * @property {number} shieldRecharge seconds before the emergency shield can be pressed again
 * @property {number} takedownSlow the share of its speed a rival keeps as it is taken down
 * @property {number} takedownSpin seconds a rival taken down by guns or a ram spins
 * @property {number} blastSpin seconds a rival caught in a rocket's blast spins
 * @property {number} spunPace the share of its top speed a spinning rival flies at
 * @property {number} mineEvery seconds between the mines a miner drops
 * @property {number} maxDrops mines a miner may have lying ahead of the player at once
 * @property {number} calmSeconds the pause after a race before the next one's start lights
 *
 * @typedef {object} NovaConfig How the Nova game plays.
 * @property {readonly SectorLayout[]} sectors
 * @property {number} shipRadius the ship as it is hit, smaller than it is drawn, as in an arcade
 * @property {number} fireEvery seconds between the ship's shots
 * @property {number} rapidEvery the same, with rapid fire
 * @property {number} shotSpeed
 * @property {number} tripleSpread radians between the triple shot's bolts
 * @property {number} enemyShotSpeed
 * @property {number} enemyShotRadius
 * @property {number} speedPerSector share by which each sector's enemies are faster than the last's
 * @property {number} waveGap seconds after a wave is all in before the next comes, even if some of it is still about
 * @property {number} calmSeconds the pause before a sector's first wave
 * @property {number} invulnerableSeconds how long the ship is safe after it was hit
 * @property {number} lootChance chance that a downed enemy lets a bonus fall
 * @property {number} lootSpeed
 * @property {number} lootRadius
 * @property {number} powerSeconds how long rapid fire and the triple shot last
 * @property {number} maxLives
 * @property {Readonly<Record<EnemyKind, number>>} worth points a downed enemy scores, before the multiplier
 * @property {number} chainStep enemies downed without a hit that raise the multiplier by one
 * @property {number} maxMultiplier
 * @property {number} sectorBonus points for clearing a sector, times the sector's number
 * @property {number} chargePerKill charge a downed enemy adds to the super meter
 * @property {number} bossHp
 * @property {number} fireballPower
 * @property {number} spreadCount bolts in a zigzag's fan
 * @property {number} chainTargets enemies thunder strikes
 * @property {number} chainPower
 * @property {number} cloakSeconds how long a phantom keeps the ship out of harm's way
 *
 * @typedef {object} LevelLayout A level of the Bricks game, as it is drawn.
 * @property {string} name
 * @property {readonly string[]} rows one string a row, a character a column: `.` nothing,
 *   `o` a plain brick, `O` a tough one, `#` steel, `*` a bomb
 * @property {{ span: number, period: number } | null} drift a formation that sways: how far to
 *   each side, in board units, and the seconds a full sway takes
 *
 * @typedef {object} BricksConfig How the Bricks game plays.
 * @property {readonly LevelLayout[]} levels
 * @property {number} columns bricks across the court
 * @property {number} top where the first row begins
 * @property {number} margin between the formation and each wall, where it rests
 * @property {number} gap between bricks
 * @property {number} rowHeight a brick's height
 * @property {number} serveY where the ball waits before it is served, down toward the paddle
 * @property {number} speedPerLevel share by which each level's serve is faster than the last
 * @property {number} toughHits hits a tough brick takes
 * @property {number} blastRadius how far from a bomb's center a brick's center is caught
 * @property {number} fuseSeconds how long a bomb caught in a blast waits before going off
 * @property {number} dropChance chance that a broken brick lets a bonus fall
 * @property {number} dropGravity
 * @property {number} dropMaxSpeed
 * @property {number} dropRadius
 * @property {number} maxDrops bonuses falling at once
 * @property {number} maxBalls balls in play at once
 * @property {number} laserSeconds
 * @property {number} laserEvery seconds between the laser's shots
 * @property {number} boltSpeed
 * @property {number} wideSeconds
 * @property {number} slowScale share of its speed a ball keeps when Slow is caught
 * @property {number} maxLives
 * @property {number} pointsPerBrick
 * @property {number} maxCombo the highest multiplier a combo reaches
 * @property {number} clearBonus points for clearing a level, times the level's number
 * @property {number} chargePerBrick charge a broken brick adds to the super meter
 * @property {number} pierce bricks a fireball passes through
 * @property {number} strikeWidth half the width of the column thunder takes
 * @property {number} stallBounces bounces off walls and steel, with nothing broken, before a
 *   ball is nudged off its course so that it cannot circle forever
 * @property {number} maxLean the furthest from straight up or down, in radians, that a ball
 *   leaves a brick
 * @property {number} clearSeconds the pause before the next level's serve
 * @property {number} helpAfter seconds of play with nothing broken after which the paddle's
 *   next return is sent straight at the nearest brick, so that the last bricks of a wall do
 *   not take forever to find
 * @property {number} mercyAfter seconds of play with nothing broken after which the brick
 *   nearest the ball gives way by itself, so that no wall can hold a game up for good
 *
 * @typedef {object} PowerUpConfig
 * @property {boolean} enabled
 * @property {[number, number]} spawnDelay Seconds between power-ups, chosen at random in this range.
 * @property {number} lifetime Seconds a power-up stays on the court.
 * @property {number} radius
 * @property {number} minRally Hits into a rally before a power-up may appear.
 * @property {number} duration Seconds an effect lasts.
 * @property {number} wideScale
 * @property {number} shrinkScale
 * @property {number} turboSpeed
 * @property {number} splitAngle Radians between the ball and the ball Multiball splits off it.
 * @property {number} maxExtraBalls Most balls in play besides the ball itself.
 *
 * @typedef {object} BossConfig How a career boss attacks the player.
 * @property {HazardKind} attack
 * @property {readonly (readonly HazardKind[])[]} [phases] A final boss's phases, which it moves
 *   through as the player closes in on winning, each an even share of the points needed: the
 *   attacks of each, drawn one at a time from a phase that has several. The first phase is the
 *   boss's `attack`; a boss without phases always attacks with it.
 * @property {[number, number]} every Seconds of play between attacks, chosen at random in this range.
 * @property {number} warning Seconds a beam or lag is announced before it strikes.
 * @property {number} shrinkSeconds How long a drip or a beam that hits shrinks the player's paddle.
 * @property {number} lagSeconds How long lag lasts.
 *
 * @typedef {object} SuperConfig How the super meters fill and fire.
 * @property {boolean} enabled
 * @property {number} perHit Charge a return of the ball adds to the meter of the side that made it.
 * @property {number} perSkill Extra charge for a return off the paddle's edge, and again for one with curve.
 * @property {number} perSave Extra charge for returning a super.
 * @property {number} perConceded Charge a lost point adds.
 * @property {number} flickSpeed Paddle speed at a return that fires the super a full meter holds.
 * @property {number} cpuChance Chance that the computer, its meter full, fires its super at a return.
 *
 * @typedef {object} GameConfig
 * @property {number} width
 * @property {number} height
 * @property {Rules} rules
 * @property {number} startDelaySeconds Countdown before the first serve of a match.
 * @property {number} serveDelaySeconds
 * @property {number} fixedStepSeconds
 * @property {number} maxFrameSeconds
 * @property {{
 *   width: number,
 *   height: number,
 *   inset: number,
 *   keyboardSpeed: number,
 *   velocityResponse: number,
 * }} paddle
 * @property {{
 *   radius: number,
 *   initialSpeed: number,
 *   maxSpeed: number,
 *   speedIncrease: number,
 *   maxBounceAngleRadians: number,
 *   spinPerPaddleSpeed: number,
 *   maxSpin: number,
 *   spinDecay: number,
 * }} ball
 * @property {{
 *   controller: 'cpu' | 'human',
 *   maxSpeed: number,
 *   reach: number,
 *   trackingDeadZone: number,
 *   predictionWeight: number,
 *   error: number,
 *   aim: number,
 *   curve: number,
 *   widthScale: number,
 * }} opponent `reach` is the share of the court, measured from its own paddle, within which it
 *   reacts; `error` scales how far it misjudges fast balls, in board units; `curve` is spin the
 *   computer adds to its returns, bending them away from the player; `widthScale` sizes its paddle.
 * @property {PowerUpConfig} powerUps
 * @property {SuperConfig} supers
 * @property {BossConfig | null} boss A career boss's attacks, or null for an opponent that only plays.
 * @property {BricksConfig | null} bricks The Bricks game's wall and rules; null in every other mode.
 * @property {NovaConfig | null} nova The Nova game's sectors and rules; null in every other mode.
 * @property {WarpConfig | null} warp The Warp game's cup and rules; null in every other mode.
 */

export {};
