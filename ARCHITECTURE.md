# Architecture

## Goal

This repository is intentionally small enough that its architecture can be understood in minutes.

The objective is not to imitate an enterprise backend in the browser. The objective is to make the important change boundaries explicit so game rules can evolve independently from DOM, Canvas, audio, physical input devices, and browser frame scheduling, and to show that those boundaries leave room for a polished, juicy game rather than getting in its way.

## Dependency direction

```text
index.html
   |
script.js  ← composition root; the only module that touches browser globals
   |
   +--> adapters/input-controller.js
   +--> adapters/dom-game-view.js
   +--> adapters/dom-hangar.js ──> application/hangar.js
   +--> adapters/canvas-renderer.js ──> adapters/canvas/*, adapters/effects.js
   +--> adapters/sound-board.js ──┐
   +--> adapters/music-player.js ─┴──> adapters/audio-output.js
   |        └──> adapters/music-tracks.js
   +--> adapters/haptics.js
   +--> adapters/wake-lock.js
   +--> adapters/browser-device.js
   +--> adapters/local-preferences.js
   +--> adapters/browser-frame-scheduler.js
   |
   +--> catalog.js ──> config.js, hangar.js   the choosable matches, the career ladder, the high-score table and the hangar included
   |
   +--> application/game-controller.js
                 |
                 +--> application/ports.js
                 +--> application/game-loop.js
                 +--> application/interpolation.js
                 +--> application/career.js, application/nicknames.js, application/high-scores.js, application/hangar.js
                 +--> domain/game.js
                           |
                           +--> domain/physics.js
                           +--> domain/opponent.js
                           +--> domain/power-ups.js ──> domain/random.js
                           +--> domain/supers.js
                           +--> domain/hazards.js
```

Dependencies point inward.

- adapters may depend on the core
- application may depend on domain
- domain depends on nothing outside `src/domain/`
- domain and application see no browser or Node globals, no clock, and no `Math.random`
- the core never imports adapters
- adapters receive `window`, `document` and `navigator` from the composition root instead of reading globals

These rules are enforced by ESLint per directory (`eslint.config.js`). `tests/architecture-rules.test.js` lints deliberate violations to prove the rules keep rejecting them.

## 1. Domain layer

`src/domain/` owns the rules that define the game:

- phases: `ready`, `running`, `paused`, `game-over`
- the rules of a match (first to a score, with match point) and of a Rush run (lives that the player's misses spend; the computer never wins a point)
- score transitions, win condition, and winner
- the serve countdown: three seconds counted aloud before the first serve, a short pause before every later one, while the paddles can already move
- rallies: hits since the serve, the longest rally of the match, and every side's total hits
- power-ups: when one appears, what it does to whom, and how long it lasts; Multiball's split-off balls, which bounce, are returned and score like the ball, but stay out of the rally and the hits, so records remain those of the ball
- a second human on the top paddle, when the rules say the opponent is human
- paddle bounds and smoothed paddle velocity
- ball movement, wall reflection, swept contact between the ball and a paddle's face, corners and sides, bounce angles and speed progression
- spin, and the curve it puts on the ball
- the computer opponent, and the tunings a career rival may add: returns that curve away from the player, and a paddle of its own size
- supers (`supers.js`): returns charge each side's meter, more off the paddle's edge, with curve, or when they answer a super, and a lost point helps the side behind. A full meter holds a super drawn from the seeded random source, never the one that side fired last, and fires with the next flick at a return, or, for the computer, when chance says so. A fireball flies faster than any ordinary ball, wide of the receiver; a zigzag swerves at each third of the court; a phantom hides halfway across; thunder heads straight for the receiver and breaks late, with a spin that grows as it comes, computed to land a set distance wide whatever its speed. A super ends when it is returned, and the return goes on from the pace an ordinary rally would have had; a point it wins, and a match, carry its name
- the Bricks game (`bricks.js`): a wall of bricks in place of the far paddle. A level is laid out from its drawing; a ball flies through the wall by swept contact with each brick's faces and rounded corners, several in one step if it must, and never leaves one flying flatter than a set angle; plain bricks break, tough ones take two hits, steel gives way only to a blast or a super, and a bomb breaks everything near it and lights the bombs among them, which go off a moment later, one after another. Bricks broken without the paddle touching a ball build a combo that multiplies their points. A broken brick may let a bonus fall under gravity for the paddle to catch: Wide, Multi, Laser, whose bolts fly up from both ends of the paddle, Shield, a safety net that returns one ball, Slow and Life. With supers on, bricks and returns charge the player's meter: a fireball goes through bricks, thunder takes the column it lands in and a zigzag the row, and a phantom splits the ball in three. Losing the last ball in play costs a life; breaking the last brick that play can break raises the next wall, some of which sway from side to side; the last wall wins the game. Three things keep a wall from holding a game up: a ball bouncing between walls and steel is nudged off its course, after some seconds with nothing broken the paddle's next return goes straight at the nearest brick a shot can reach, and after longer still the brick nearest the ball gives way by itself
- the Nova game (`nova.js`): the paddle is a starship, which fires a bolt every fifth of a second by itself, so the player only steers. Each sector sends its waves in one enemy after another, the next wave once the court has all but cleared or after a while regardless: rocks that drift down, turn, come off the side walls and split in two pebbles that fly apart more than they fall; drones that weave down about their line in formation and fire at the ship, never from close by; and gunships that stop near the top, strafe and fire in threes. The last sector ends with the boss, which fires fans at the ship, then rings with single shots between them, then both faster with drones called in, as its health goes in thirds. The ship is hit as a small circle, smaller than it is drawn; a shield takes a hit in its place; a ship lost restarts the multiplier, clears the enemies' fire and leaves the next ship safe a moment. An enemy that flies into the ship goes down with the blow, for no points. Downed enemies score times a multiplier that grows while the ship is not hit, may let a bonus fall (rapid fire, a triple shot, a shield, a spare ship), and with supers on charge the meter; a flick of the ship fires the super: a fireball that goes through everything in its way, a zigzag's fan of bolts, thunder that strikes the six nearest enemies, or a phantom that keeps the ship out of harm's way a while and fires fast. Losing the last ship ends the game, and downing the boss wins it
- the Warp game (`warp.js`): the paddle is a racing craft, and its place across the lane is the paddle's place across the court. It flies on by itself at the speed that boosts, spins, slopes and supers give it. A course is laid out from how it is written, the same every time: its bends a stretch at a time, its height the sum of a few waves, level at the start and the finish, and its rings, boost pads, ramps, gates, mines, drifting debris and cargo haulers spread along it from a random source seeded by the course, with rings hung in the air past every ramp, nothing standing at a gate or on a ramp, and no gate where a jump comes down. The craft flies past each in turn: through a ring, dead center or not, over a pad, off a ramp into the air, through a gate's gap or into the gate, into a hazard, which spins it and costs it most of its speed, or close by it, a near miss. In the air only the rings that hang there are in reach, and nothing on the ground or racing on it is in the way. Holding the inside of a bend, off the rumble strips, charges a drift, which boosts the craft as it leaves the line; a flick as the lights go green is a rocket start. Every trick (a ring dead center, a gate threaded, a near miss, a landing, a drift, a slingshot, an overtake, a takedown) scores times the flow, which goes up a step every few tricks and back to one at a crash, and with supers on charges the meter. Five rivals race it, each picking a line now and then, steering for a gate's gap and round what is in its way as well as its skill allows, taking pads and ramps it can reach and crashing into the rest; a blocker covers the player's line while they are close behind, a weaver changes its line all the time, and a miner drops mines for a player who follows; a rival far ahead eases off and one far behind pushes, so a race stays a race. A rival close ahead and in line builds a slipstream that slings the craft past it; one flown into is bumped aside, the one behind losing speed. A flick with a full meter fires the super: a fireball's afterburner, faster than any boost, smashing what it meets; a zigzag's shockwave, which takes down every rival near; thunder, which strikes the two just ahead; or a phantom, which flies through everything a while. The craft is armed, and what it can do is its loadout, a part of the rules: how fast it flies, how much nitro its tank holds and for how long a bar burns, how soon its drift charges, how long a crash spins it, the shields it starts a race with, what its guns do to a hull, and the rockets it can carry. Nitro is the one thing a player asks for, through the `action` of an input snapshot: a full bar burns, faster than any boost, and at that speed a rival flown into is rammed and taken down; tricks and the cells on the course fill the tank. The guns fire by themselves at the nearest rival lined up ahead within their range and wear its hull down until it is taken down. A rocket, from a crate, locks on to the nearest rival roughly in line, launches when the lock is whole and homes on it; its blast takes down whoever is near. A shield takes a crash in the craft's place. Rivals fly through crates and cells as if they were not there. The bridge gives the player five systems to press, through `activateWarpControl`, a transition of its own like starting or pausing, which does nothing outside a running race, during the start lights, past the line or while the craft spins: nitro; the guns' overdrive, which for a moment fires faster, reaches further and wears a hull down quicker, then recharges; a rocket fired by hand at the nearest rival ahead; an emergency shield that takes the next crash and then recharges; and the craft's warp, a system of its own for each kind of craft (a sharper aim and a quicker lock for the jet, a phase through hazards for the dart, a long boost for the wing, an armor plate and turret overdrive for the gunship, a bar of nitro and a brief phase for the saucer), with a speed surge for every one. Every cooldown counts seconds of the race, so a pause pauses them all, and `warpControlStatus` says of each system whether it can be pressed, what it is doing and how far it has recharged. The numbers of all of it are in the course rules, beside the rest of the tuning At the line the place scores, and a place too low to go through spends a credit on flying the course again, for its points anew: a race counts once, as it was last flown, so a low place is never a way to score a course twice, and what the attempts flown again scored is kept apart. With no credit left the game is over, and going through the last race wins the cup
- a career boss's attacks on the player's end of the court (`hazards.js`): drips, one aimed at the player, a beam announced a second before it strikes a column, and lag, which makes the player see the balls in fits and starts. A hit only shrinks the paddle for a few seconds; attacks come in live play only, never overlap, and stop at a point. The final boss has phases instead of one attack: its phase follows the player's score, an even share of the points needed each, so it borrows the other bosses' attacks one after another as the player closes in and, in the last phase, draws each attack from all three. The point that moves it on announces the new phase; only a phase with several attacks draws from the random source, so every other boss plays exactly as before

The domain accepts plain data and returns new state. It does not draw, play sounds, register listeners, query the DOM, schedule frames, read the clock, or know which device produced an input command. The shapes it works with (`GameState`, `GameConfig`, `InputSnapshot`, `GameEvent`, `Rules`, `Pickup`) are declared once in `src/domain/types.js`.

That makes the highest-value behavior directly testable with Node's built-in test runner, and fully deterministic: the same inputs always produce the same match.

### Randomness without losing determinism

Power-ups need chance: what kind appears, where, and when. The core is forbidden `Math.random`, so `domain/random.js` is a small seeded generator whose state lives in `GameState.seed`. Every draw returns the value and the next seed, and the composition root hands each match a fresh seed. The result is the best of both: matches differ, yet any match replays exactly from its seed and inputs, and a test can pin a specific outcome.

### Rules as data

`GameConfig.rules` is `{ kind: 'match', winningScore }`, `{ kind: 'rush', lives }`, `{ kind: 'bricks', lives }`, `{ kind: 'nova', lives }` or `{ kind: 'warp', lives }`. The simulation is the same for a match and a run; only `awardPoint` consults the rules to decide whether a point ends the match, costs a life, or announces match point. Adding a mode of that kind means adding a rules variant, not a second game.

Bricks is the one mode that is a second game, and it is still the same state and the same step: `GameState.bricks` holds the wall, which is `null` everywhere else, and `advanceGame` hands a state with a wall to `advanceBricks`, which runs the wall's own business and then carries every ball through the bricks, off the ceiling, and through the very `collide` a match uses for the side walls and the paddle. The paddle, its spin, the serve countdown, the super meters, pause and the end of the game are the match's own code. The walls are data too: `src/levels.js` draws each as text, a character a brick, and `config.js` holds the rest of the tuning.

Nova is the third game, built the same way: `GameState.nova` holds space, `null` elsewhere, and `advanceGame` hands a state with space in it to `advanceNovaGame`, which runs the countdown as before a match, then `advanceNova`, and ends the game on the last ship or the last sector. The ship is the player's paddle, steered by the same code, so every input works as it does in a match; there is no ball in play. The sectors are data in `src/sectors.js`: each a list of waves, a kind of enemy, how many, how often and in what formation.

Warp is the fourth, built the same way again: `GameState.warp` holds the race, `null` elsewhere, and `advanceGame` hands a state with a race in it to `advanceWarpGame`, which runs the countdown, then `advanceWarp`, and ends the game on the last credit or the last race won. Between races `advanceWarp` cruises the field on past the line a moment, then lines up the next grid and sets the countdown again, so the same start lights run before every race. The craft is the player's paddle, steered by the same code. The courses are data in `src/courses.js`: each a list of bends, the waves of its hills, how far apart its rings, pads, ramps, gates and hazards come, its field of pilots, each with a pace, a skill and a way of racing, and the worst place that goes through. The story, *The Last Signal*, is `warp-story.js`: a chapter a course, each with a mission that is a feat of that course (rings flown dead center, boost pads, rings in the air, supply caches, the Landlord's escorts taken down), counted from the race's own events and rewarded once with points and a bar of nitro or a shield, and short radio lines at the start, a third of the way and two thirds of the way along, timed in seconds of the race. A race flown again flies its chapter again; the fragments a cup has recovered carry to the next race, and a cup won ends rescued with all five or with how many were found. The craft the cup is tuned for is `WARP_LOADOUT` in `config.js`; the crafts a player can fly instead, what tuning them costs and the paints are data in `src/hangar.js`.

### Game events

Every transition lists what happened in `state.events`: `match-start`, `menu`, `paused`, `resumed`, `countdown`, `serve`, `paddle-hit`, `paddle-graze`, `wall-bounce`, `pickup-spawn`, `pickup`, `point`, `match-point`, `life-lost`, `hazard-warn`, `hazard-hit`, `super-ready`, `super-swerve`, `boss-phase` and `game-over`, in Bricks `brick-hit`, `brick-break`, `blast`, `strike`, `drop-spawn`, `drop`, `bolt-fire`, `shield-save` and `level-clear`, in Nova `ship-fire`, `enemy-arrive`, `enemy-hit`, `enemy-down`, `enemy-fire`, `ship-hit`, `loot-spawn`, `loot`, `super-fire`, `chain`, `boss-rage` and `sector-clear`, and in Warp `ring`, `boost`, `crash`, `jump`, `land`, `gate`, `drift-ready`, `flow`, `mine-drop`, `near-miss`, `bump`, `takedown`, `nitro`, `gun-fire`, `rocket-launch`, `explosion`, `ammo`, `shield-hit`, `smash`, `overtake`, `overtaken`, `slipstream`, `lightning`, `shockwave`, `final-stretch` and `race-finish`, each with the data an effect needs (where, how fast, which side, the rally count, whether a Multiball ball made the hit, the super a return fired or answered, the super that won a point). Quiet steps share one frozen empty list, so they allocate nothing.

Events are plain data on the state rather than callbacks or an event bus. The domain stays pure, tests assert on events directly, and any number of adapters can react without the domain knowing they exist.

## 2. Application layer

`GameController` owns orchestration:

- start, restart, pause/resume, and back to the menu
- idempotent pause when the page loses focus
- advance one simulation step and hand its events to every feedback adapter
- build the match from the mode, difficulty and options chosen in the preferences when a new match starts, never mid-match (`buildMatchConfig`); supers are off in every preset, so the Supers setting turns them on for the match being built, in every mode but Rush
- tell the input adapter how many people are steering
- drama: a short hit-stop on hard hits, and slow motion while a match-point ball closes on a paddle
- keep the best rally (a Solo record), the best Rush run and the Solo win statistics, and flag a record worth celebrating; records are read fresh from the preferences, which another tab may have raised
- count leaving a Solo match after its first point as a loss, so quitting cannot protect a winning streak
- run the career (`career.js`): a win earns up to three stars and moves the ladder on to the next rival, the ladder is open up to the first rival not yet beaten, and a rival that beats the player twice in a row plays tired, slower and, for a boss, attacking less often. Career matches keep their own record and never touch the Solo ones
- name the opponent: a career rival by its own name, otherwise, with the Fun switch on, the computer under an arcade-club nickname drawn from the match seed
- keep the Rush high-score table (`high-scores.js`): ten rows of three initials and a run's hits, which the catalog hands over filled in by the arcade's regulars. The player's best run takes its place among them, under YOU until they sign it; a run has to beat a row to pass it, so on equal hits the row that was there first stays above. After a run the table also names whose rows that run went past. It is worked out again only when the record or the initials change, so the view can tell by the object alone whether to redraw it
- keep the Warp game's hangar (`hangar.js`): which craft the player flies, what it can do once tuned, and what buying and tuning cost, all worked out from what `src/hangar.js` offers and what the preferences hold. A craft is rated from 1 to 5 in each of five systems and each can be tuned three levels up; the ratings become the loadout the race is flown with, and the craft everyone has, untuned, comes to exactly the loadout the cup is tuned for. A purchase is a change to the player's tickets and hangar, or null when it cannot be made. A finished cup pays out tickets for everything flown in it, races flown again included, so the hangar is never further off for a bad day, while the record counts only the cup's own points
- show the screen again as it is on the `refresh` command, which the view sends after a preference the screen draws on has changed, such as the initials: nothing about the match changes and nothing is announced twice
- run the frame loop only while a match is running
- translate current state into presentation data

It talks to adapters through the ports declared in `src/application/ports.js`:

- `InputPort` — `snapshot()`, `onCommand(...)`
- `ViewPort` — `render(presentation)`, `onCommand(...)`
- `RendererPort` — `render(state, config)`, so the renderer draws the match's own paddle widths and speeds
- `FeedbackPort` — `handle(events, state)`, implemented by the renderer's effects, the sound board, the music player, haptics and the wake lock
- `PreferencesPort` — `get()`, `set(changes)`
- `FrameScheduler` — `request(...)`, `cancel(...)`, injected into `FixedStepLoop`

The input, view, and renderer ports also expose `connect()` / `disconnect()`. The ports are JSDoc type definitions, and `npm run typecheck` uses the TypeScript compiler to verify that every adapter satisfies them and that the controller only uses what they promise. Commands are a closed set (`GAME_COMMAND`), so an unknown command is a type error instead of a silent no-op.

The controller therefore contains application policy without knowing whether the concrete UI is DOM, Canvas, keyboard, touch, speakers, or something else.

## 3. Fixed-timestep loop

`src/application/game-loop.js` owns deterministic simulation timing.

The loop receives a scheduler dependency instead of calling `requestAnimationFrame` directly.

It:

1. measures elapsed real time
2. caps unusually large frame gaps
3. accumulates elapsed time
4. advances simulation in fixed 1/120-second increments
5. renders after the simulation catches up, passing how far time has moved into the next step

The controller uses that fraction to blend the last two simulation states (`interpolateState`), so motion stays smooth on 60, 120 and 144 Hz displays alike. A serve teleports the ball, so states across a serve are never blended.

The loop also owns two knobs for drama, both of which leave the simulation's step size untouched: a **time scale** stretches real time before it is accumulated, so slow motion runs the same fixed steps more slowly, and a **hold** swallows a few real milliseconds without simulating them, for the classic freeze on a hard hit. Rendering keeps going through both.

The loop is stopped whenever the match is not running, including from inside an update when the winning point is scored. Ready and paused screens are drawn once and then cost nothing.

## 4. Adapters

Browser-specific concerns live in `src/adapters/`.

### InputController

Translates pointer, touch, and keyboard input into device-neutral movement snapshots and commands. It listens on the whole game area but maps positions through the board, so the thumb rail below the court steers too. With two players it splits the board: a finger that lands on the top half takes the top paddle, and each finger keeps the paddle it started on until it lifts, so two hands crossing the middle never swap paddles. Its policy:

- keys are matched by physical code (`KeyA`, `KeyD`, arrows, `Space`, `Escape`; `KeyJ`, `KeyL` and the numpad for a second player), so layouts such as Ukrainian or AZERTY work
- combinations with `Ctrl`, `Meta` or `Alt` are left to the browser
- taps on buttons, or icons inside them, keep their meaning and do not move the paddle
- in Warp, the bridge's keys: N (as well as ↑, W, a mouse click or a swipe up, measured from the lowest point of the finger's stroke so that steering along the rail never asks for it) for nitro, G for the guns' overdrive, R for a rocket, F for the shield and E for the craft's warp, each sent as a command once per press
- in Warp on a touch screen, one of three ways to steer, remembered between visits: two buttons to hold, LEFT and RIGHT, which a finger owns for as long as it is down, so a second finger stays free for the bridge; a floating stick, which starts wherever a thumb lands in the lower half of the board and steers by how far it is pushed, with a dead zone and a curve that is gentle near the middle; or the classic drag, the paddle's own. The rest of the cabinet only ever drags
- one extra, which only Warp uses, for nitro: see above. It is told once, in the first snapshot after it was asked for
- the most recently used device steers; a key press takes over from a resting mouse, and a horizontal pointer move or a tap takes over from the keyboard
- losing window focus or hiding the page releases held keys and sends an idempotent pause, because key-up events are lost while the page is unfocused

### DomGameView

Owns the HUD, the title menu with its mode cards, the career's rival picker, Rush's high-score card and the card of Warp's hangar, the tutorial, settings and high-score dialogs, the versus card, and the pause and result overlays. On the title screen the scoreboard, the pause button and the thumb rail stay hidden in the room kept for them, so a match starts without the court moving; the menu's neon sign is SVG lit by CSS, once a visit. Controls declare their meaning in markup — `data-command`, `data-mode`, `data-difficulty`, `data-setting`, `data-rival-step`, `data-show-scores`, `data-letter` — so the view binds them generically. After a won match with a finisher (`finisher.js`, which the renderer and the sound board consult too), the result screen waits the 1.2 seconds the finisher takes; a tap or a key brings it at once, and that key goes no further, so `Space` cannot also start the next match unseen. After a loss, a decorative CONTINUE? line counts down under the result. A career match starts under a versus card, the rival's neon emblem and name over the player's: it rides the first half of the three-second countdown, which waits for nothing, lets every touch through to the paddle, and is gone a second and a half before the serve. Both are hidden from screen readers, which the status line informs. After a career match the rival has a line to say on the result screen, one of the fun extras. The emblems are SVG symbols drawn once in the page; the catalog names each rival's, and a test checks that the page draws every one.

The seven modes are cards all alike, an icon over a name, in two rows: the three kinds of match across the top and under them the career, Bricks, Nova and Warp, so the arcade's other games cost the menu no height on a small phone. What each is stays in its name for screen readers, and the line under the menu tells the chosen one. In Bricks, Nova and Warp the scoreboard shows the points and the wall, the sector or the race being played, the points set smaller, since they run to five figures, its labels dropped a size earlier to make room for them, and without the pop a point of a match gets, since they tick up all the time. The result is told by the points and the wall, sector or race reached, and How to play swaps its line on power-ups for one on the wall, the ship or the race; in Warp it has a second, on nitro and the weapons, and in Nova and Warp it leaves out the two on curving and angling a ball, there being none. In Warp the menu has the hangar's card where Rush has its high scores, with the craft the cup is flown in and the tickets to spend, and the result says what the cup paid out.

In Rush the menu shows where the player stands on the high-score table and the row to beat next, in the place Solo gives its difficulty and the career its rival; the result of a run shows the rows around the player's and what the run did to them; and a dialog shows the whole table. The same dialog holds the letters to sign it with: three taps, or three keys, and the initials are kept. Nothing asks for them: a run on the table is YOU until the player chooses to sign, and the standing says a tap does it. Once signed, the scoreboard and the versus card name the player by them. It hands sharing and full screen to `BrowserDevice`, hiding those buttons where the browser lacks the feature. It only writes to the DOM when the presentation changes, which keeps the `aria-live` status region from being rewritten every frame, and it never repeats the rules from memory: the menu line is built from the rules in the presentation.

During a Warp race the view also owns the bridge: two consoles of buttons, nitro, the guns' overdrive and a rocket to port, the shield and the craft's warp to starboard, each showing what its system is doing, whether it can be pressed, and a fill along its foot for how far it has recharged; with a keyboard to hand each wears its key. A bridge button acts the moment a finger lands on it, not on the click: a phone makes no click of a second finger's tap, and a thumb on the bridge usually is a second finger, the first one holding a steering button. A click still presses it from the keyboard or assistive technology, which press no pointer. The buttons are written only when what they show changes, since the screen is drawn every frame. Upright, the consoles stand at the sides of the board between the race's display and the craft's row, and the steering buttons over the ends of the rail under the board, either side of the switch between the three ways to steer, so nothing is drawn over the lane; sideways on a phone, where the board takes the screen's height, the consoles and the steering buttons stand beside the board. The story's mission is a short line under the race's name, and its radio a line or two in the sky between the race's display and the horizon, where nothing races; neither takes a touch. A cup won ends with the story's ending, its title alone on a short screen.

Focus is managed deliberately:

- the tutorial, the settings and the high scores are native `<dialog>`s opened with `showModal()`, the tutorial once on a first visit and the others from the menu or the result screen: the page behind is inert, focus starts inside (on the tutorial's button, on the first switch of the settings, on Done under the table, on the slots while signing, so a typed Enter never presses a letter by mistake) and `Escape` closes them; `InputController` ignores game keys and touches while any dialog is open, so `Space` presses the dialog's focused button instead of starting a match behind it
- the pause and result screens are labelled dialogs whose main button takes focus when they appear; play hands focus back to the board, unless the player had moved it elsewhere on the page
- after a command button, focus returns to the board, so `Space` controls the game instead of re-activating the button

### CanvasRenderer and Effects

The renderer converts game state into pixels and implements `FeedbackPort`: game events become sparks, shockwave rings, screen shake, flashes, paddle squash, a grid pulse and victory fireworks, simulated by `Effects`, a small presentation-only particle system with injectable randomness.

`canvas-renderer.js` only owns the canvas, its size and its frames. What a frame contains lives in `src/adapters/canvas/`: `theme.js` (colors and shared helpers), `court.js` (the pre-rendered court and glow sprites), `scene.js` (ball, trail, Multiball balls, paddles, power-ups, a boss's drips and beams, the Ghost fog), `hud.js` (countdown, rally counter, the super meters, callouts), `ball-trail.js` and `event-effects.js` (the visual side of each game event). Each is unit-tested against a recording 2D context. Like Ghost, Lag lives only in the picture: while it lasts, the renderer redraws the balls about seven times a second, with no trail to give them away, and the game underneath runs on smoothly. A phantom is hidden the same way, from the stretch of court the domain reports (`phantomBand`), and shows only as a faint ring that careful eyes can follow.

Three callouts belong to the arcade rather than to the rally. With the fun extras on, a match starts under CREDIT 01, as a cabinet shows when a coin has dropped. During a Rush run the board says whose row of the high-score table the player has just passed (PASSED ROM!), or that the record has fallen: only for rows above the player's best before the run, so it is news each time, and up by the far paddle, where the ball has just been sent and the player need not read it. The renderer is handed the table at the composition root and reads the best run from the preferences, where it is saved only when a run ends.

The cameo is one more of the fun extras (`cameo.js`, which the sound board consults too). When a person fires a super, the arcade's sound man leans in from the wall at their end of the court, a line drawing of a head in headphones, and whoops: WHOOPEE! beside him. He comes once a match, with the first super a person fires, never for the computer's, and is gone in 1.1 seconds; for a second player he is turned to face them. He is drawn over the court but changes nothing in it, uses none of the white kept for the ball, and with reduced motion fades in where he stands instead of sliding.

`finisher.js` decides the finisher once, from the game-over event and the final score, for the board, the sound board and the view alike: the EVICTALITY for beating the final boss, a super's own finisher for a match a super won, otherwise one of seven drawn from the match seed, now and then a comic one instead, and PERFECT! for a win to nil. Every finisher fits in the 1.2 seconds the result screen waits, flashes at most once, and is skipped by a tap.

It is built for phones:

- the court, grid, border glow and vignette are painted once into offscreen layers, and every glow is a pre-rendered sprite, so no frame uses the expensive `shadowBlur`
- light is drawn with additive blending, so overlapping sparks add up like neon
- the backing store matches the displayed size in device pixels, capped at twice the CSS size, and follows layout, zoom and pixel-ratio changes
- a device that steadily shows fewer than about 45 frames a second during a match gets a board with half as many pixels, one and a half to the CSS pixel, once for the visit: `frame-pace.js` counts ninety frames at a time, and a pause, a hidden tab or a one-off hitch starts the count over
- the ball trail and glow take the color of the last hitter and heat toward amber with speed
- pure white is reserved for the ball core and each paddle has a unique core color, so tests can find them in the pixels

While a match runs, the game loop drives every frame. After the match ends, the renderer requests its own frames until the fireworks settle, then stops. Paused screens freeze the effects. `prefers-reduced-motion` removes shake and softens flashes.

Bricks is drawn by two modules of its own. `canvas/bricks.js` draws the wall, a pane of colored glass a brick, colored by row, with a second frame and then a crack on a tough brick, rivets on steel and a pulsing core in a bomb; the bonuses on their way down; the laser's bolts and the muzzles on an armed paddle; the safety net; and the combo where a match shows its rally. A new wall comes down row by row while the ball waits to be served, and behind the menu the first wall already stands. Nothing of it is blurred or blended, since a wall is a hundred bricks drawn every frame, and nothing is the white kept for the ball. `canvas/brick-effects.js` turns the wall's events into effects: a broken brick flies apart in six pieces that keep some of the speed of what struck it, tumble and fall; a bomb is rings, sparks and a shake; thunder is a bolt down the column and a zigzag one along the row; a caught bonus is called out by name. A row of bombs going off a tenth of a second apart would strobe, so these events flash the board through `Effects.flashSparingly`, which skips a flash within four tenths of a second of the last.

Nova has two modules of its own too. `canvas/nova.js` darkens the court and draws stars drifting down past it in three layers, moving with the game's own clock, so they stop when it is paused; the ship, an arrowhead with its cockpit in the paddle's core color on the paddle's line, which blinks a moment after a hit, or is faint with reduced motion; every kind of enemy, a rock jagged and turning, the same shape every frame; the shots, the ship's cyan and the enemies' rose; the bonuses; the boss's health across the top; and the multiplier where a match shows its rally. `canvas/nova-effects.js` turns its events into effects: enemies go down in bursts of their color, rocks and gunships in tumbling pieces, the boss in a string of blasts; thunder jumps from the ship from enemy to enemy; a caught bonus and a super are called out. The ship's own fire, five times a second, leaves nothing on the board, and its sound is the softest of all.

Warp has ten. `canvas/warp.js` projects the course a stretch at a time, as the arcade racers did: each stretch nearer the eye is lower on the board and wider, the lane bends away along a line worked out once for each course from its bends, measured from the line straight ahead of the craft, and rises and falls with the course's hills, measured from the lane under the craft, where the eye rides. So the craft is always where the paddle would be, the lane under it spans the paddle's reach, and the craft is exactly where a finger puts it. Everything is painted from the farthest to the nearest, the lane a piece a stretch among the things on it and beside it, so a hill hides what is behind it and a stretch over a crest, facing away, is not painted at all. The lane lies on banded ground with a grid that follows the hills, or hangs in the air as a slab with its sides showing; its colors fade toward the haze in a few steps mixed once for each look. The camera leans a little into the bend ahead, about the craft, so the craft stays put. Rings, pads, ramps, gates, mines, debris, cargo haulers, rocket crates and nitro cells are drawn where they are, the rings in the air higher and in the player's color; the rivals in five kinds of craft, each over its own light on the lane, named while they are near, higher off a ramp; and the player's craft leans as it steers, spins when hit, rises off a ramp over its shadow, blazes with an afterburner, fades with a phantom, streams the air in a slipstream and throws sparks from its inside wing while a drift charges, the light on its canopy in the paddle's core color on the paddle's line. A boost streaks lines out from where the lane runs out of sight and closes the board's edges in; nitro streaks more of them, faster, in its own blue. `canvas/warp-craft.js` builds the craft themselves, seen from behind and a little above: a jet, a dart, a flying wing, a gunship and a saucer, each of plates shaded in its paint, with a dark glass canopy, nozzles that burn in the color of its light, guns on its wings, the rockets it carries under them, a decal within its own outline, and a red and a green light on its wing tips; far away a craft is drawn plainly. The player's is the one chosen in the hangar, with its light on the lane under it and a bubble round it while a shield is up, and the same code stands a craft on its pad in the hangar's dialog. Its flames are painted over what is under them, never added to it, and no tint of any paint comes near the color of a paddle's core, so the board can still be read for where the player is. `canvas/warp-airframe-details.js` adds what a craft is made of near the eye: shaded wing surfaces and control surfaces that move with it, turbine intakes, the hardware of its warp system and the wear a hull under fire shows. `canvas/warp-lighting.js` lights the course: the light of each course's sky, soft gloss and seams on the lane near the craft, the air off its engines, and its light on the lane during a jump. A race costs a phone far more than a match, so its frames are kept lean: the sky, the top of the ground and the course's light never change during a race, so they are painted once into a kept layer (`GlowSprites.layer`) and copied each frame, slid with the light as the lane turns; the court is not painted under a race, which covers the whole board; and the many faint hairlines, flecks, windows, clouds and stars of the lane's materials, the structures and the far planes are painted a path of like shapes at a time, not a stroke apiece. `canvas/warp-materials.js` gives the lane its surface, a material for each course, and puts structures between the skyline and the horizon; `canvas/warp-backdrop.js` paints the farthest planes of each sky, which slide slower than the skyline. All of them hold still with motion reduced, and draw less the farther and smaller things are. `canvas/warp-combat.js` draws the weapons at work: the crates and cells that hang over the lane, the guns' tracers from the craft's muzzles to the rival they bear on, the reticle closing on the rival a rocket is locking on to, the rockets in flight with each puff of their smoke in its own place on the lane, and how much of its hull a rival under fire has left. `canvas/warp-scenery.js` holds the look of each course and paints what surrounds it: a sky and what stands on its horizon, sliding as the lane turns (a banded sun over ridges and a far city, a moon and an aurora over mesas, a low sun with rays over cloud banks, a nebula and a ringed planet, the warp core where the tunnel runs out of sight), what stands beside the lane or spans it (palms, signs and lit towers; the canyon's walls and arches; pylons and clouds; the ribs, masts and drifting rocks of a station; the six-sided rings and beams of a tunnel, with light running down it), and dust streaming past, placed by the distance flown so it stops with the race. `canvas/warp-hud.js` writes over the race: the place, and under it the nitro in the tank, the rockets aboard and the shields up; the speed, how far along everyone is, the flow once tricks multiply; before a race the course's name and the start lights; after it the order everyone came in, with how far behind the winner each was, and whether the player goes through. `canvas/warp-effects.js` turns its events into effects: at the craft for what it does, and where the board shows a rival for what happens to it. With motion reduced the camera does not lean, nothing streams past and nothing blinks or turns.

### Layout

The page is laid out in CSS only. The stage is a size container, and the court takes the largest 5:8 box that fits it. Everything drawn over the court is sized in `--u`, 1% of the court's width, so the menus scale with it; every control is at least 44 by 44 CSS pixels and no text in a control is under 12px, and container queries tighten spacing and shrink the neon sign on courts under 350px and again under 300px, which is what lets a 320px phone fit the menu. A phone held sideways sets `--u` from the screen's height instead: the HUD becomes a column at the left edge, the court gets the full height, and the menu, pause and result screens open as sheets across the rest of the screen, the menu's two groups side by side. End-to-end tests measure every visible control on both.

### SoundBoard and MusicPlayer

Both implement `FeedbackPort` with Web Audio, and every sound is synthesized at play time from oscillators and generated noise, with no audio files. In Bricks each brick of a combo sounds the next note of a pentatonic scale, so a long combo is heard climbing; a blast that takes eight bricks in one step sounds two of them and its own boom, not a chord of eight. The sound board plays effects: hit pitch climbs with the rally, every fifth hit adds a chime, and the countdown, power-ups, match point, a lost life, a meter filling, each super and each finisher have their own cue. With the fun extras on a match starts with a coin dropping into the cabinet, two clinks and the thud of the coin box, and the opening fanfare waits the fifth of a second it takes; the cameo's whoop, two rising notes, follows the super's own sound. The music player is a step sequencer that plays one of twelve tracks, written as data in `music-tracks.js` (tempo, bar roots, bass, chords, lead and drum patterns). Five are original. Seven are in the dance styles of the nineties and carry melodies everyone knows that are long in the public domain: Korobeiniki, the peddlers' song a generation met in a falling-blocks game, as eurodance; Grieg's In the Hall of the Mountain King as a rave; Pachelbel's Canon as trance; Mozart's Rondo alla Turca as techno; Offenbach's can-can as happy hardcore; Beethoven's Ode to Joy as eurotrance; and Leontovych's Shchedryk, the Carol of the Bells, in its own three beats a bar, a bar there being twelve steps long. The arrangements are the game's own, and no melody is taken from a record; a test spells each tune out by note name, so a wrong note fails the build. Notes are scheduled ahead of the clock, so timing stays exact whatever the frame rate; a track starts with bass and kick alone, adds the chords with snare and hi-hat at three hits and the lead at six, fades on pause, stops at the menu, and starts every match from the bass again. Drums are synthesized too: a falling sine for the kick and high-passed noise for the snare and hi-hat. Choosing a track in the settings or on the pause screen plays a four-second preview with every layer in; it never interrupts a match, and a track changed during a pause plays from its first bar on resume. Every envelope starts silent before its first scheduled value, because a new gain node passes full level until then and a source starting a sample early would click. Both play through one audio context, owned by `AudioOutput`: browsers limit how many a page may open, so it is created once, on the first event, which always follows a click or key press, and resumed whenever the browser suspended it.

### Haptics

Implements `FeedbackPort` with `navigator.vibrate`: short pulses for the player's own hits, patterns for points, the end of a match, a super fired or answered and a meter filling. It is inert where vibration is unsupported, and the view hides the vibration switch there.

### WakeLock and BrowserDevice

`WakeLock` implements `FeedbackPort` with the Screen Wake Lock API: a thumb on a rail sends no key or scroll events, so without it the phone would dim mid-rally. It holds the lock only while a match runs, and keeps at most one request in flight, so a pause and resume during a request cannot leave a second lock unreleased. `BrowserDevice` wraps the Web Share API, with the clipboard as a fallback, and the Fullscreen API. Closing the share sheet is respected rather than turned into a silent copy, and a copy is reported only when it happened.

### DomHangar

The Warp game's hangar, a modal dialog like the settings, opened from its card in the Warp menu. One craft stands on show at a time, drawn on a small canvas by the same code that draws it in a race, between arrows that bring the next; a craft the player owns is flown as soon as it is on show, so choosing one is just stopping on it, and one they do not own shows its price and a button to buy it. Three benches share the space under it: tuning, a row a system with a bar as long as the best a system can be (what the craft comes with, what tuning added, what is still to have) and a button for the next level with its price; paint, a chip a paint and the decals; and the light under the craft. The rows and chips are built from what the hangar offers, so the page cannot drift from it. Every purchase and choice goes through `application/hangar.js`, is saved at once, and the game is told to draw the menu again, so the card behind the dialog and the next cup already have the craft as it now is. Sideways on a phone the craft stands on the left and the bench takes the whole height on the right.

### LocalPreferences

Implements `PreferencesPort` over `localStorage`, validating everything it reads: the player's initials, for one, are three capital letters or nothing, and the hangar is kept only as it is shaped (short plain names, a count for each system), since whether the game still offers a craft or a paint is for the hangar itself to say. Storage that is missing or throws, as in private browsing, falls back to in-memory values, so the game never breaks over storage.

The game may be open in several tabs. Each tab follows the others' saves through the `storage` event, and merges its own changes into what is stored at that moment, so one tab never writes back another's older records. After a save fails, a tab trusts its own newer values over storage.

### BrowserFrameScheduler

Wraps `requestAnimationFrame` / `cancelAnimationFrame` of the injected window. This small adapter keeps browser scheduling out of the application core.

## State ownership

There is one authoritative game state owned by `GameController`.

Adapters do not mutate game state. Domain functions return new state objects, keeping transitions explicit and inspectable. The renderer's effects are presentation state that the game never reads.

## Physics decisions

### Contact-position bounce

Outgoing direction depends on where the ball meets the paddle:

- center → mostly vertical return
- edge → greater horizontal component

Speed increases slightly after paddle contact and is capped so difficulty cannot grow without bound.

### Spin

A paddle's velocity is smoothed over a few steps, so a deliberate flick reads as speed while a single jittery sample does not. At impact, that velocity becomes spin. Spin turns the ball's direction toward its sign each step without changing its speed, fades over time, reverses at a wall so the ball curves away from it, and never leans the ball further from vertical than the steepest bounce angle, so a curve cannot stall a rally.

### Swept paddle contact

A simple overlap check misses a paddle when a fast ball travels past it between simulation samples. An earlier version solved that by testing only the moment the ball's leading edge crossed the paddle's face plane, but then a ball that reached the plane just wide of the paddle and drifted into its corner or side, or a paddle swept sideways into a ball beside it, went straight through: 4 to 6% of missed points in bot simulations.

`findPaddleContact` works in the paddle's frame of reference, where the paddle stands still and the ball's path over one step, the paddle's own motion included, is a straight segment. The ball's center must not enter the paddle rectangle grown by the ball's radius, whose corners are rounded: two crossed rectangles and four corner circles. The earliest entry into any of them is the first touch, and the surface normal there tells face, corner and side apart.

- the face and the front corners return the ball, from the very edge when a corner is clipped, and the return leaves level with the face, so a paddle sliding on cannot catch it twice. The ball leaves from where it was struck: a tap moves the paddle to the finger at once, so the paddle may end the step far from that point
- a ball that flies into a side or back corner bounces off it (`paddle-graze`), keeping its progress toward the goal, and the point still goes to the other side
- a paddle that runs into the ball side-on stops against it and passes on none of its own speed, so a missed ball keeps its course however the player moves. An earlier version placed the ball beside the paddle where the paddle ended the step, and a tap across the court dragged a missed ball up to 360 units in one frame

A property test plays 60 bot matches across every mode, over 100,000 steps with yanked paddles, and asserts that no ball, Multiball's split-off ones included, ever overlaps a paddle. The difficulty balance, measured with the same bots before and after the change, moved only within noise.

Bricks use the same sweep, through `findBoxContact`: a brick stands still, so the ball's path over a step is a straight segment against the brick grown by the ball's radius, and the normal at the first touch reflects the ball, off a face as off a wall and off a rounded corner at the angle the corner sends it. The rest of the step is flown from the touch on the new course, so one step can break several bricks; a brick of a swaying wall that moves into a ball pushes it out instead of swallowing it.

Split-off balls go through the same `collide` step as the ball: a side wall, then the paddle each is heading for. Only what a return counts for differs, so the ball's own path is computed exactly as before; the reference matches below prove it.

## Opponent strategy

The opponent is designed to feel like a person rather than a wall:

- **reach:** it only reacts once the ball comes within a share of the court, and drifts back to the center otherwise
- **prediction:** it folds the ball's straight path at the side walls to find where it will cross its paddle, and trusts that prediction as much as its difficulty allows
- **misjudgement:** its error grows with ball speed and changes with every hit; it is derived from the rally state, so it stays deterministic
- **aim:** it meets the ball off-center so the return angles away from the player
- **no spin prediction:** a curved shot is the player's way past it, and a super's swerve or late break fools it the same way
- **no sight of a phantom:** while one is out of sight it can only guess where it went, and may be well out, whatever its difficulty
- **one ball at a time:** with Multiball balls in play, it keeps its eye on whichever will reach its paddle first, of those still in front of it; with the ball alone, nothing changes

Prediction and physical ability remain separate: prediction chooses a target, and the speed cap limits how fast the paddle can reach it.

Multiball was measured with the same human-like bots before and after it was added: the win rate on every difficulty moved only within noise. It favours whoever collects it, like every power-up; a player who follows both balls breaks about even when the computer collects it.

Supers were tuned with the same bots, and with a second harness that fires each kind of super many times from rally situations: the computer waiting in the middle, as it does, and bots that react a fifth of a second late, as people do. On Normal each super wins about half its points, fewer on Hard; each side fires two or three a match; and a lost point's charge helps the side behind. Turned on, supers make the harder matches more winnable, since the bots answer the computer's supers better than it answers theirs: a decent bot's win rate on Hard rises from about a quarter to about two in five, and a casual one's on Normal from one in twenty to about one in six. The career ladder keeps its order, its last two regulars within a few points of each other either way. The final boss was tuned the same way to be the hardest rival and still beatable: a skilled bot wins almost every match against it but concedes about two points a match, three times what LAG takes; a decent one wins about one match in thirty, and one in three once it plays tired, or about half with supers on. The Supers switch brings back the classic balance, which the reference matches pin. One finding shaped them: a computer that misjudges toward a wall stops there and still covers the corner, so supers that land near a wall are caught, and the fireball, phantom and thunder aim a set distance from the receiver instead of into the corner.

### Difficulty tuning

The three presets in `config.js` were tuned by simulating hundreds of matches against human-like bots of three skill levels. The bots have finger-speed limits, reaction delays, aim errors that grow with ball speed, and occasional flicks. The target was that a casual player wins almost every match on Easy, a confident one about two in three on Normal, and Hard is beaten mostly with curved shots. A unit test pins the ordering of the presets.

The rows of the Rush high-score table were set the same way. Bots of the three levels, matched to those targets (a casual one winning about nine Easy matches in ten, a decent one about six in ten on Normal, a skilled one two in three on Hard), each played a thousand runs. A casual bot's run is 20 hits at the median and a decent one's 27; a skilled one's is 37, and one in ten of its runs reaches 52. So the regulars' rows climb from 8 to 48 in the order of the career ladder, under an unsigned record of 60. Almost every first run lands a casual bot on the table, in eighth place at the median, and twenty runs take it to sixth; a decent one stands sixth after a run and fourth after twenty; a skilled one beats the record on about one run in fifty. These are simulated players, not people.

Nova was tuned with bots that fly as people do: they see a moment late, look a little ahead, move at a hand's speed, now and then freeze, and overlook some of the shots and rocks altogether, a casual one about a third of them and a skilled one one in twenty. They first lost most of their ships to the pebbles a rock splits into, which fell straight at a ship that had just shot the rock above it, so pebbles now fly apart more than they fall. With supers on, a casual bot wins about one game in four, a decent and a skilled one about two in five, and a sector takes forty to fifty seconds; with supers off the game is a good deal harder, since supers are what clears a crowded court.

Warp was tuned with bots that steer as people do: they see a moment late, look a little ahead, steer at a hand's speed, now and then freeze, overlook some hazards, aim for rings, pads, ramps and the gaps of gates only so well, and hold the inside of a bend only if they think of it. The rivals' pace was raised until the races were close: a winner a second or two ahead, often less. With supers off a casual bot takes the cup about three times in ten, a decent one about four in five, with retries in the last races, and a skilled one every time; the first race is won by nearly everyone, and the field gets faster course by course to the Landlord in the last. When the craft was armed the bots learned to burn nitro on a clear stretch, and the rivals were given a hull that takes a moment of gunfire and a little more pace, so that those odds held for the craft everyone starts in. The hangar was priced from the same flights: a cup scores forty to fifty thousand points, races flown again included, and pays about two thousand tickets, which is a few first levels of tuning after a first cup, a second craft after two, and a craft tuned all the way after about ten. Each craft as it comes wins about as often as the first, by its own means (the Bulwark shoots more rivals down, the Manta outruns them); tuned all the way, any of them takes a casual bot to the cup nine times in ten, which is what the tickets are for. A race flown again counts for its points anew, so the record is not helped by failing a race on purpose, which the bots' scores showed it had been. The renderer was timed against the one it replaced: a frame costs about the same, under two milliseconds of drawing on a desktop. When the bridge and the story arrived the bots learned to press the five buttons as people would, and the cup had become too easy: a casual bot that pressed them took it every time, and one that only weaved and mashed them took it more often than not. So the field flies eight per cent faster (`FIELD` in `courses.js`), a takedown slows a rival less, the guns' overdrive and the shield recharge for longer, a rival spun out picks up sooner, the first two races ask for third place again, like the two after them, and the Landlord is a shade slower. Now a casual bot takes the cup about three times in ten without the buttons, as before them, and about two in three with them; a decent one about four in five either way; a skilled one nearly every time, now and then retrying the last race; and neither a pilot who holds still nor one who weaves and mashes every button takes it. Each chapter's mission is a feat of flying the race well, which a casual bot completes about two times in three and a decent one more than four in five. The airframe details, lighting, materials and backdrops first made a race frame about a third dearer to paint; with the kept sky, no court under the race and like shapes painted together it is about a tenth dearer than before them, and a phone that still cannot keep up drops to fewer pixels.

Bricks was tuned with the same bots, steering for whichever ball will land first. With supers on, a casual bot clears the first three or four walls and wins about one game in ten, a decent one about one in three, a skilled one three in four; a wall takes about a minute and a whole game six to eight. Before the three rules that keep a wall from stalling, the longest spell with nothing broken in a game was half a minute at the median and over two minutes at worst; with them it is about twelve seconds at the median and never much over twenty.

## Executable architecture constraints

Documentation can become stale, so the project encodes its rules as checks that fail CI:

- `eslint.config.js` — layer boundaries, no host globals or clock or randomness in the core, browser globals only in the composition root
- `tests/architecture-rules.test.js` — proves those lint rules still catch violations
- `tsconfig.json` + `npm run typecheck` — adapters satisfy the port contracts
- `scripts/coverage-gate.mjs` — coverage over the whole of `src/` and over every file on its own
- `scripts/check-project.mjs` — expected modules and assets exist, `script.js` stays a small composition root, no inline HTML event handlers

## Testing strategy

### Unit tests

The dependency-free unit suite targets deterministic rules and the logic of the adapters:

- domain: the Bricks game, from a level's layout to bricks of every kind, blasts and their chains, the combo, every bonus, the laser, the safety net, supers on the wall, several balls in play, lives, levels and the three rules against a stalled wall; state machine and events, the match and Rush rules, scoring and match point, the countdown and serve pauses, paddle control for one or two people, paddle contact on faces, corners and sides with a no-overlap property test, spin and curves, the speed cap, the opponent, power-ups, supers, the random source, and a full rally
- application: loop lifecycle with time scale and hold, interpolation, commands, the match built per mode, drama, feedback dispatch, the rally, Rush and win-streak records, forfeits, and the high-score table: a run's place among the regulars, ties, the rows a run passes, and the few rows shown around the player's
- adapters: input with two-player halves and dialogs, the view with modes, the modal tutorial and settings, the high-score table and the letters that sign it, the versus card, and focus, the canvas renderer and its modules, effects and callouts, sound and music on one audio context, vibration, the wake lock, sharing and full screen, and preferences across tabs, driven through fake event targets, a recording 2D context, fake audio contexts and fake storage thanks to injected globals
- architecture: the lint rules themselves, and that every module loads without a browser

### Reference matches

New features must not change how a classic match plays. `tests/reference-matches.test.js` replays eleven recorded bot games (Solo on every difficulty, keyboard steering, Rush, two players, Solo with power-ups, Solo with supers, charged faster so one match fires every kind, a long game of Bricks, in which four walls come down, bombs go off, bonuses are caught and every super lands, a flight through three sectors of Nova, and three races of the Warp cup) and compares a SHA-256 digest of every step, the ball, paddles, score, rally, lives, events, any split-off balls and, with supers on, the meters included, with `tests/fixtures/reference-matches.json`. A change meant to alter classic play re-records the fixture with `npm run reference:record` and says why in its commit. So far only the power-up match has been re-recorded, once, when Multiball joined the kinds a power-up is drawn from; before that, the collision code it shares with the ball was reworked and all seven matches replayed identically, and they did again when supers were added, off in every classic preset, and when Bricks was, whose record is the ninth: the eight before it were compared with their recordings entry by entry and are unchanged. Nova's is the tenth, and the nine before it are unchanged too. Warp's is the eleventh, a cup raced through its first races, and the ten before it are unchanged; it was re-recorded once, when hills, ramps, gates, drifts and the flow were added to the game, again when the craft was armed and a race flown again began to count once, and again when the story's missions began to pay out and the cup was balanced for the bridge, and each time the ten others replayed identically.

`tests/modules-load.test.js` loads every module under `src/`, so a file no test exercises counts at 0% instead of being left out. The coverage gate then holds the whole of `src/` to 95% lines and 90% branches and functions, and every file on its own to 90% lines, 85% branches and 80% functions, so no module can hide behind the average.

### Browser tests

Playwright checks the assembled system on desktop and mobile Chromium. Instead of reaching into application state, the tests read the paddle and ball positions from the canvas pixels, and time-sensitive checks run on a paused fake clock. They run with reduced motion, so screen shake does not move the pixels they read; one test opts back into full motion to play a whole match with every effect. They cover:

- application boot without page errors, and state transitions through buttons and the keyboard
- mouse steering, the keyboard taking over from a resting mouse, and layout-independent keys
- the phone layout, the thumb rail, and the court staying in view with scrolling locked during a match
- the three-second countdown before the first serve
- the first-visit tutorial as a modal dialog: `Space` closes it without starting a match, `Escape` closes it too, and either is remembered; the settings dialog, whose keys belong to it too
- the title screen keeping the scoreboard, the pause button and the thumb rail for the match, without moving the court
- Rush lives running out, and two players steering their own halves of the board
- the Rush high-score table: the table the arcade left, signing it with three letters by touch or by keyboard, the standing after a run, and a real run, played by following the ball, that beats the table's last row and is named for it
- the career's versus card, which leaves the paddle steerable and is gone before the serve, and the rival's line after a match
- the heads-up display fitting a 320px-wide phone without sideways scrolling, and every control of its menu, in every mode, and of its pause screen at least 44 by 44 pixels
- a phone held sideways: the HUD beside a full-height court, and a menu sheet that fits, in every mode, with fingertip-sized controls
- preferences surviving a reload, the Supers switch saying where it applies, the super meter on the court only while supers are on, and the result screen after a full match
- auto-pause on focus loss, and an idle render loop outside of a match
- a canvas backing store that matches device pixels, and an installable manifest

The goal is not to duplicate every domain test in a browser. Browser tests cover integration seams; unit tests cover rule permutations.

## Deliberate omissions

The project does not add:

- React or another UI framework
- a game engine, physics engine or audio library
- Redux/global state tooling or an event bus
- a dependency-injection library
- a repository/service abstraction with no external resource
- a bundler or a compile step
- a backend or a service worker

Those tools would increase surface area without solving current requirements.

## Extension points

The boundaries make future changes local:

- tune or add difficulties → `config.js`
- add a mode → a `Rules` variant in `domain/types.js` and a preset in `config.js`
- add a wall to Bricks → a drawing in `levels.js`; a test checks it is ten wide, has bricks to break, clears the serve and sways inside the walls
- add a sector to Nova → its waves in `sectors.js`; a test checks every sector has waves and the boss comes last
- add a craft to the hangar → its entry in `src/hangar.js` (a name, a kind, a price, how its five systems are rated, the paint it comes in), and, for a new kind of craft, its blueprint in `adapters/canvas/warp-craft.js`; tests check every craft is drawn, in every paint, without the white kept for the ball or anything like a paddle's core. A new paint or decal is an entry in the same file (and for a decal, how it is drawn)
- add a course to Warp → its bends, hills, spacing, field and qualifying place in `courses.js`, and its look, skyline and roadside in `adapters/canvas/warp-scenery.js`; a test checks its bends add up to its length and the cup ends with the Landlord
- add a kind of enemy → `domain/nova.js`, its look in `adapters/canvas/nova.js` and its sound in the sound board; the Nova reference game is re-recorded
- add a kind of brick or bonus → `domain/bricks.js`, its look in `adapters/canvas/theme.js` and `adapters/canvas/bricks.js`, its sound in the sound board; the Bricks reference game is re-recorded
- add a power-up → a kind in `domain/power-ups.js`, its look in `adapters/canvas/theme.js`, its sound in the sound board; the power-up reference match is re-recorded, since the kinds are drawn from the seeded random source
- add a super → a kind in `domain/supers.js` with its launch and flight, its look in `adapters/canvas/theme.js`, a finisher in `adapters/finisher.js`, its sound in the sound board; the supers reference match is re-recorded, since the kinds are drawn from the seeded random source
- add a career rival → an entry in `catalog.js` with its tuning, story, lines and emblem, and the emblem's symbol in `index.html`; a test checks the page draws it
- change the opponent's personality → `domain/opponent.js`
- new effects or sounds for an event → `adapters/canvas/event-effects.js` or the sound board, without touching the game
- randomize serves → draw from the seeded random source already in the state, keeping the core deterministic
- replace Canvas → another `RendererPort` adapter
- add gamepad support → another `InputPort` adapter
- add replay/debug snapshots → record the event stream without rewriting physics

The architecture exists to make change predictable, not to maximize the number of files.
