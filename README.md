# Paddle Noir

[![Quality](https://github.com/MykolaDotsenko/paddle-noir/actions/workflows/quality.yml/badge.svg)](https://github.com/MykolaDotsenko/paddle-noir/actions/workflows/quality.yml)

**A neon arcade ping-pong game for phones and desktops, with a brick-breaking game and a space shooter beside it, built with Vanilla JavaScript, Canvas and Web Audio.**

[**Play Paddle Noir →**](https://paddle-noir.vercel.app/)

It began as a one-script Pong exercise in 2024. The current version keeps the same small game at the center but rebuilds it around a deterministic simulation, explicit dependency boundaries and independently testable browser adapters.

![The Paddle Noir title screen beside a live match](./docs/preview.png)

## The game

Paddle Noir is meant to feel like the last surviving arcade cabinet in town, not a dashboard with a canvas in the middle.

### Modes

- **Solo** — first to 7 against the computer.
- **Rush** — three-life survival where the ball keeps getting faster, with an arcade high-score table to climb: the regulars' best runs under a record nobody signed, and yours once you put three initials to it.
- **2P** — two people sharing one phone or keyboard.
- **Career: The Last Arcade** — a ladder of nine opponents with different rules, ending with **The Landlord**, who wants to replace the arcade with a parking lot. Each is announced on a versus card under a neon emblem of its own, and has something to say when the match is over.

- **Bricks** — the cabinet's second game: the same paddle and ball against eight walls of bricks instead of an opponent. Tough bricks take two hits, steel only gives way to a blast or a super, and a bomb takes its neighbors with it, one bomb setting off the next. Bonuses fall for the paddle to catch (a wider paddle, more balls, a laser, a safety net, a slower ball, a spare ball), bricks broken without the paddle touching a ball build a combo, and the supers work on the wall: a fireball goes through bricks, thunder takes a column, a zigzag a row, a phantom splits the ball in three.

- **Nova** — the cabinet's third game: the paddle is a starship. It fires by itself, so the player only steers, as in every other mode: out of the way of rocks and enemy fire, and under what is to be shot down. Five sectors of rocks that split in two, drones that weave down in formation and fire at the ship, and gunships that strafe and fire in threes, then the Dreadnought, a boss that fights in three patterns as its health goes. Bonuses fall (rapid fire, a triple shot, a shield, a spare ship), a multiplier grows while the ship is not hit, and the supers work out here too: a fireball goes through everything in its way, a zigzag fans bolts across the court, thunder jumps from the ship to the six nearest enemies, and a phantom keeps the ship out of harm's way a while.

- **Warp** — the cabinet's fourth game: a racing cup in neon, seen from just behind the craft, as the arcade racers drew it. The paddle is the craft, and it flies by itself, so the player only steers, as in every other mode. Five courses bend left and right and roll over hills that hide what is behind a crest and speed a craft up on the way down: a synthwave sunset with its striped sun, palms and a city of lit towers; a canyon between rock walls under an aurora; a skyway above the clouds; the ribs and masts of a station round a ringed planet; and a tunnel of light into the warp core. Five rivals race each, each in a craft and a color of their own: the arcade's regulars, faster course by course, some with a way of their own (a blocker covers your line, a weaver never holds one), and the Landlord in the last race, who drops mines for whoever follows. Rings flown dead center, gates threaded through their gap, ramps that throw the craft over everything to the rings that hang in the air, a drift charged on the inside of a bend, a slipstream's slingshot, a rocket start with a flick as the lights go green: every trick landed without a crash raises the flow, which multiplies what the next one scores. Mines, drifting debris, slow cargo haulers and a gate missed spin the craft out and end the flow. Finish in the places a course asks for to go through, or spend a credit flying it again, and win the last race to take the cup. The supers work on the course too: a fireball is an afterburner that smashes through everything, a zigzag a shockwave that takes down every rival near, thunder strikes the two just ahead, and a phantom flies through it all. And the craft is armed. Nitro is the one thing the player asks for (a swipe up, a click, or ↑): a bar of it burns faster than any boost, and at that speed the craft rams rivals out of its way; tricks and the blue cells on the course fill the tank. The guns fire by themselves at a rival lined up ahead and wear its hull down; a rocket from an orange crate locks on to a rival roughly in line, launches itself and homes; a shield takes a crash in the craft's place. A cup, won or lost, pays out tickets, and the **Hangar** in the Warp menu takes them: five craft, each good at something (the Kestrel everyone starts in, the nimble Hornet, the fast Manta, the armored Bulwark gunship, the Halo saucer with its tank of nitro), each with an engine, nitro, grip, armor and guns to tune three levels up, and a paint, a decal and a light under it, which cost nothing. Two consoles beside the lane make a bridge: nitro, an overdrive for the guns, a rocket fired by hand, an emergency shield, and each craft's own warp system (a sharper aim, a phase through hazards, a long boost, an armor plate, a bar of nitro), each with a fill for how far it has recharged and, with a keyboard, its key (N, G, R, F, E). On a phone the craft steers with two buttons under the track, a floating stick or the classic drag, whichever the player picks. And the cup tells a story, *The Last Signal*: a chapter a race, each with a mission to fly (rings dead center, boost pads, rings in the air, supply caches, the Landlord's escorts) and short radio lines that never cover the lane, the Landlord himself breaking in halfway. The board after each race says whether its fragment of the signal was recovered, and the **Signal Log** in the Warp menu keeps every fragment ever decoded, between cups; recover all five and HORIZON's own Signal decal waits in the hangar. Each course keeps the player's best time: the record to beat shows on the grid, and the board after the race says whether it fell. Rivals ahead trail their light on the lane, exactly where their slipstream is, and it lights up while the player sits in it; flat out, the view stretches out ahead.

Career opponents change the same underlying simulation rather than loading separate game implementations. Boss attacks, difficulty and scoring differences are data/rules layered on top of the core match.

### Supers and arcade mechanics

Returns charge a super meter. A full meter can fire **Fireball, Zigzag, Phantom or Thunder**.

Optional power-ups add Wide, Shrink, Turbo, Ghost and Multiball. Curve shots come from paddle movement at impact rather than a separate button.

The game also includes match-point drama, long-rally escalation, synthesized music/sound, vibration, small arcade jokes — a coin drops and CREDIT 01 shows as a match starts, and the arcade's sound man leans in to whoop at your first super of a match — and over-the-top finishing animations. Those effects are driven by domain events rather than mixed into the physics loop.

## Engineering

### Deterministic core

The match state contains its own random source. Given the same initial state and seed, the simulation can replay the same match exactly.

Core rules do not read the wall clock, browser globals or uncontrolled randomness.

### Domain events instead of browser side effects

The simulation emits events such as:

`paddle-hit` · `point` · `match-point` · `pickup` · `super-ready` · `game-over`

Independent adapters turn those events into rendering, sound, music, vibration and UI effects.

### Physics that stays stable at speed

The ball uses swept contact against a moving paddle in the paddle's frame of reference, avoiding high-speed tunnelling through the paddle.

Contact position controls bounce angle; paddle motion adds curve without changing speed.

Property-style simulation checks cover more than 100,000 steps without unresolved paddle overlap.

Bricks get the same swept contact: a ball meets a brick's face or its rounded corner where it really would, leaves a corner at the angle a real corner sends it, and can meet several bricks in one step. Broken bricks fly apart the way the ball was going, and fall.

### Fixed-step simulation

Gameplay advances at a fixed timestep and rendering interpolates between simulation states.

Slow motion and hit-stop change time scale/hold behaviour without changing the simulation step itself.

### Rules and content as data

**Warp: Outlaw League.** Two service relays, at one-third and two-thirds of each race, top up one rocket and one nitro bar within the craft's capacity. Each race posts a one-off bounty on its last grid rival: take them down for 300 points and a refill. VOLT FM broadcasts the bounty, service stops, overtakes, takedowns and recovery calls between story transmissions. The Last Signal now follows an underground racing league hiding HORIZON's stolen reactor; the original five missions and persistent Signal Log remain intact. No licensed music or characters are used.

**Warp rock radio.** Three original synthesized hard-rock tracks — Outlaw Rock, Redline Riot and Rift Thunder — bring power chords, galloping bass riffs, and backbeat drums to the cup. With the default Neon setting, Warp automatically picks a track for each course; any other selected track overrides the rotation. All three are also available through the existing track selector, preview and music toggle. The original music uses no samples or recordings from commercial games.

**Warp precision airframes.** Close ships and hangar portraits feature layered, bank-lit intake nacelles, machined nozzle collars with actuator petals, cooling louvers, warning stencils and damage-dependent fine scratches. Halo uses radial heat-exchanger cassettes. Near-field track shoulders use perspective-projected recessed deck modules and bevels. Distant craft retain their cheaper rendering path; no textures, external assets or new GPU dependencies are required.

Solo, 2P, Rush and Career all use the same simulation, and Bricks runs on the same paddle, ball, walls, spin and supers, with a wall of its own in place of the far paddle. Nova keeps the paddle, its steering, the countdown, the super meter and the end of the game, and puts space in place of the ball. Warp keeps them too, and puts a course in place of the court: the countdown becomes the start lights, before every race.

A rules object decides how a point counts, while the Career catalogue defines opponents and boss behaviour, the Bricks levels are drawn as text, a character a brick, the Nova sectors are lists of waves, and the Warp courses are lists of bends and hills with how often rings, pads, ramps, gates and hazards come, without duplicating the engine.

## Architecture

```text
browser input ─┐
storage ───────┤
audio ─────────┤
view/canvas ───┤
               ▼
        application layer
               ↓
        deterministic domain
        match · physics · AI
               ↓
          domain events
               │
        ┌──────┴──────┐
        ▼             ▼
     render         effects
```

Browser globals are passed into adapters rather than imported into the domain.

JSDoc contracts are checked by TypeScript without compiling the JavaScript that ships.

More detail: [engineering notes](docs/engineering.md).

## What this repo demonstrates

- explicit dependency direction without a framework;
- deterministic simulation and replayable seeded randomness;
- state-machine lifecycle: `ready → running ↔ paused → game-over`;
- testable adapters for input, storage, audio and vibration;
- fixed-step physics + render interpolation;
- rules-as-data and content-as-data;
- architecture boundaries enforced by ESLint;
- recorded reference matches that catch unintended gameplay drift;
- Canvas rendering tuned for phones;
- accessible dialogs, focus handling and reduced-motion support;
- desktop/mobile Playwright tests that assert against the rendered game.

There are **no runtime dependencies, bundler, React layer or game engine**.

## Stack

- semantic HTML
- modern CSS
- Vanilla JavaScript + native ES modules
- Canvas 2D
- Web Audio
- Web App Manifest
- Node built-in test runner/coverage
- ESLint
- TypeScript type-checking over JSDoc
- Playwright
- GitHub Actions + Vercel

## Deployment

The live game is available at [paddle-noir.vercel.app](https://paddle-noir.vercel.app/).

Vercel deploys the `main` branch from the **private** GitHub repository. The `vercel.json` build assembles only the static browser runtime files into `site/`; tests, documentation, and development tooling are not part of the published output. GitHub Actions continues to run the quality and browser test suites independently.

## Controls

- **Touch:** drag on the court or thumb rail.
- **Mouse:** move over the court.
- **Keyboard:** arrows or A/D; Space starts/pauses; Esc pauses.
- **Player 2:** J/L or numpad 4/6.
- **Curve / super:** flick the paddle as it meets the ball.

The active input method owns the paddle; the game pauses when the tab/window loses focus.

## Run locally

The game has no runtime install step. Serve the ES modules over HTTP:

```bash
python3 -m http.server 8000
```

Open `http://localhost:8000`.

Quality tooling:

```bash
npm ci
npm run check
npx playwright install chromium
npm run test:e2e
```

## Recruiter walkthrough

For a quick technical review:

1. [`script.js`](./script.js) — composition root
2. [`src/application/ports.js`](./src/application/ports.js) — adapter contracts
3. [`src/domain/game.js`](./src/domain/game.js) — match state/events
4. [`src/domain/physics.js`](./src/domain/physics.js) — collision model
5. [`src/domain/opponent.js`](./src/domain/opponent.js) — computer opponent
6. [`eslint.config.js`](./eslint.config.js) — architecture constraints
7. [`.github/workflows/quality.yml`](./.github/workflows/quality.yml) — automated quality and browser tests

## License

[MIT](./LICENSE)

## Author

Mykola Dotsenko
