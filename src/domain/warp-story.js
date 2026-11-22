/**
 * THE LAST SIGNAL — Warp's original five-chapter story.
 *
 * Missions are optional, approachable flight feats that reuse the existing
 * rings, boosters, launch ramps, caches and Warp drive. The story never pauses
 * an arcade race, takes away credits or introduces an unavoidable hazard.
 *
 * All progress is deterministic simulation state. No clocks, timers, local
 * storage, random calls or DOM dependencies live in the domain layer.
 *
 * @import { GameEvent, WarpConfig, WarpState } from './types.js'
 */

/** @typedef {'perfect' | 'boost' | 'air' | 'ammo' | 'takedown'} StoryObjective */
/** @typedef {'nitro' | 'shield' | 'rocket'} StoryReward */

/**
 * @typedef {object} WarpChapter
 * @property {string} title
 * @property {string} mission
 * @property {StoryObjective} objective
 * @property {number} target
 * @property {StoryReward} reward
 * @property {string} commander
 * @property {string} intro
 * @property {string} reveal
 * @property {string} intercept what the Landlord breaks in to say, halfway through the race
 * @property {string} warning
 * @property {string} secured
 * @property {string} fragment the chapter's piece of HORIZON's message, as the Signal Log decodes it
 */

/**
 * Each chapter's mission is a feat of the race it is set in: rings dead center on the first,
 * boost pads through the canyon's jamming, the rings that hang past the ramps of Cloud Nine,
 * the supply caches round the station, and the Landlord's escorts in the Warp Core. Flying
 * well completes most of them; flying past everything completes none. The radio's lines are
 * short, so they can be read at a glance without taking the eyes off the lane for long.
 *
 * @type {readonly WarpChapter[]}
 */
export const WARP_STORY = Object.freeze(/** @type {WarpChapter[]} */ ([
  {
    title: '01 · THE GHOST SIGNAL',
    mission: 'Fly 12 rings dead center',
    objective: 'perfect',
    target: 12,
    reward: 'nitro',
    commander: 'ECHO',
    intro: 'HORIZON is calling from the dead zone. Fly the rings dead center.',
    reveal: 'Those coordinates were wiped from every chart. Someone wants it gone.',
    intercept: 'This sky is my property, pilot. Turn back before I bill you for it.',
    warning: 'The signal is moving toward Neon Canyon. We are not alone.',
    secured: 'Fragment decoded: “We are still here.” Nitro restored.',
    fragment: 'This is HORIZON. We are still here, and still listening.',
  },
  {
    title: '02 · DUST & DECOYS',
    mission: 'Hit 9 boost pads',
    objective: 'boost',
    target: 9,
    reward: 'shield',
    commander: 'ECHO',
    intro: 'False beacons everywhere. Boost pads punch through the jamming.',
    reveal: 'A bounty on anyone tracking HORIZON. The sender: LANDLORD.',
    intercept: 'Every beacon out here pays me rent. Yours is overdue.',
    warning: 'Keep your shields close. The real signal hides in the dust.',
    secured: 'Jammer down. HORIZON did not crash: it was hidden. Shield restored.',
    fragment: 'We did not crash. Someone wiped us from every chart on purpose.',
  },
  {
    title: '03 · ABOVE THE STORM',
    mission: 'Fly through 5 air rings',
    objective: 'air',
    target: 5,
    reward: 'nitro',
    commander: 'CAPTAIN LYRA',
    intro: 'This is Lyra, HORIZON. Climb to the relay: take the rings in the air.',
    reveal: 'We found a reactor that could power a city. LANDLORD locked us in.',
    intercept: 'Lyra signed my lease. Nobody leaves the storm without my say.',
    warning: 'The relay is fading. Stay high, pilot.',
    secured: 'Relay linked. Reactor schematics received. Nitro restored.',
    fragment: 'Our reactor could light a city. The Landlord wants it dark, and his.',
  },
  {
    title: '04 · THE STOLEN MAP',
    mission: 'Collect 3 supply caches',
    objective: 'ammo',
    target: 3,
    reward: 'shield',
    commander: 'ECHO',
    intro: 'The supply pods carry HORIZON’s flight map. Grab every cache.',
    reveal: 'LANDLORD sold the rescue coordinates. Now he wants the core.',
    intercept: 'That map is mine. Keep flying and I keep your craft as a deposit.',
    warning: 'His ships have sealed the outer ring. Keep racing.',
    secured: 'Map decrypted: a route through the reactor grid. Shield restored.',
    fragment: 'The way home runs through the reactor grid. Follow the rings.',
  },
  {
    title: '05 · HEART OF THE RIFT',
    mission: 'Take down 8 rivals',
    objective: 'takedown',
    target: 8,
    reward: 'shield',
    commander: 'CAPTAIN LYRA',
    intro: 'I see your engine flare! LANDLORD’s escorts block the way out.',
    reveal: 'The reactor is failing. Break the blockade: fire, ram, warp!',
    intercept: 'My escorts hold the gate. The reactor, the crew, the core: all mine.',
    warning: 'The gate is almost shut. Reach the finish!',
    secured: 'Blockade broken. HORIZON’s way home is open. Shields reinforced.',
    fragment: 'Thank you, pilot. Whoever you are, HORIZON is coming home.',
  },
]).map((chapter) => Object.freeze(chapter)));

/** How long each line of the radio stays up, in seconds of the race. */
const CUE_SECONDS = Object.freeze({ intro: 4.5, reveal: 4.5, intercept: 4, warning: 4, secured: 4.5 });

/**
 * The radio's lines in the order a race plays them, and how far along the race each comes:
 * the commander at the start, what they have found a third of the way, the Landlord breaking
 * in halfway, and a warning for the last third.
 */
const BEATS = Object.freeze(/** @type {const} */ ([
  ['intro', 0],
  ['reveal', 0.3],
  ['intercept', 0.5],
  ['warning', 0.7],
]));

/** Who breaks in on the radio, the story's villain. */
export const VILLAIN = 'LANDLORD';

/**
 * @typedef {object} WarpStoryState
 * @property {number} progress actions toward this chapter's optional objective
 * @property {boolean} done objective has been completed and its reward claimed
 * @property {number} recovered completed *previous* chapters in this cup
 * @property {number} beat next unplayed transmission, 0 intro, 1 reveal, 2 intercept, 3 warning, 4 exhausted
 * @property {'intro' | 'reveal' | 'intercept' | 'warning' | 'secured' | ''} cue the on-screen transmission
 * @property {number} cueTime seconds before the transmission slips away
 */

/**
 * @param {number} previousRecovered
 * @returns {WarpStoryState}
 */
export function startWarpStory(previousRecovered = 0) {
  return {
    progress: 0,
    done: false,
    recovered: Math.max(0, Math.floor(previousRecovered)),
    beat: 0,
    cue: '',
    cueTime: 0,
  };
}

/**
 * @param {StoryObjective} objective
 * @param {GameEvent} event
 */
function objectiveMatches(objective, event) {
  switch (objective) {
    case 'perfect': return event.type === 'ring' && event.grade === 'perfect';
    case 'boost': return event.type === 'boost' && event.by === 'pad';
    case 'air': return event.type === 'ring' && event.air && event.grade !== 'miss';
    case 'ammo': return event.type === 'ammo';
    default: return event.type === 'takedown';
  }
}

/** @param {WarpState} race @param {WarpConfig} rules @param {StoryReward} reward */
function grantReward(race, rules, reward) {
  if (reward === 'nitro') race.nitro = Math.min(rules.loadout.nitroBars, race.nitro + 1);
  if (reward === 'shield') race.shield = Math.min(2, race.shield + 1);
  if (reward === 'rocket') race.rockets = Math.min(rules.loadout.rockets, race.rockets + 1);
}

/**
 * Called once per fixed simulation step, after physical track collisions but
 * before the finish result. Only player actions earn fragments; pickups and
 * rivals continue to behave exactly as before.
 *
 * @param {WarpState} race mutable copy in the domain transition
 * @param {WarpConfig} rules
 * @param {GameEvent[]} events events from this exact simulation step
 * @param {number} seconds simulation time elapsed
 */
export function advanceWarpStory(race, rules, events, seconds) {
  const chapter = WARP_STORY[race.race];
  if (!chapter || race.finished) return;
  const story = race.story ?? startWarpStory();
  race.story = story;
  story.cueTime = Math.max(0, story.cueTime - seconds);

  if (!story.done) {
    const gained = events.reduce((count, event) => count + Number(objectiveMatches(chapter.objective, event)), 0);

    if (gained > 0) {
      story.progress = Math.min(chapter.target, story.progress + gained);
      if (story.progress >= chapter.target) {
        story.done = true;
        race.points += 180 + race.race * 40;
        grantReward(race, rules, chapter.reward);
        story.cue = 'secured';
        story.cueTime = CUE_SECONDS.secured;
        events.push({
          type: 'story-complete',
          race: race.race,
          points: 180 + race.race * 40,
          reward: chapter.reward,
        });
      }
    }
  }

  // Message scheduling is based on distance and simulated seconds, so it works
  // during slow devices, fixed-step replays and reduced-motion settings alike.
  if (story.cueTime > 0 || !race.launched || race.z < 12) return;
  const share = race.z / race.course.length;
  const next = BEATS[story.beat];
  if (next && share >= next[1]) {
    story.cue = next[0];
    story.cueTime = CUE_SECONDS[next[0]];
    story.beat += 1;
    events.push({ type: 'radio', cue: next[0], hostile: next[0] === 'intercept' });
  } else {
    story.cue = '';
  }
}

/**
 * Present a compact, readable narrative. The UI does not decide rewards or
 * count objectives and must never write story state.
 *
 * @param {WarpState} race
 */
export function warpStoryView(race) {
  const chapter = WARP_STORY[race.race];
  const story = race.story ?? startWarpStory();
  const cue = story.cueTime > 0 ? story.cue : '';
  return {
    chapter: race.race + 1,
    title: chapter.title,
    mission: chapter.mission,
    progress: Math.min(story.progress, chapter.target),
    target: chapter.target,
    completed: story.done,
    recovered: story.recovered + Number(story.done),
    speaker: cue === 'intercept' ? VILLAIN : cue ? chapter.commander : '',
    hostile: cue === 'intercept',
    message: cue ? chapter[cue] : '',
  };
}

/**
 * How the story ends, for a cup won: HORIZON is rescued once every chapter's fragment has
 * been recovered, and otherwise the signal survives, with how many were.
 *
 * @param {number} recovered fragments recovered in a won cup
 * @returns {{ title: string, text: string }}
 */
export function warpStoryEnding(recovered) {
  const all = WARP_STORY.length;
  const found = Math.min(all, Math.max(0, Math.floor(recovered)));

  return found >= all
    ? { title: 'HORIZON RESCUED', text: `All ${all} fragments recovered. Captain Lyra and her crew are home: the last signal is a thank-you.` }
    : { title: 'THE SIGNAL SURVIVES', text: `${found} of ${all} fragments recovered. HORIZON is still out there: fly again to bring it home.` };
}
