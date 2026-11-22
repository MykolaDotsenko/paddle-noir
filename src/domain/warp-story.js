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

/** @typedef {'ring' | 'boost' | 'jump' | 'ammo' | 'warp'} StoryObjective */
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
 * @property {string} warning
 * @property {string} secured
 */

/** @type {readonly WarpChapter[]} */
export const WARP_STORY = Object.freeze(/** @type {WarpChapter[]} */ ([
  {
    title: '01 · THE GHOST SIGNAL',
    mission: 'Fly through 2 signal rings',
    objective: 'ring',
    target: 2,
    reward: 'nitro',
    commander: 'ECHO',
    intro: 'Pilot, the lost ship HORIZON is transmitting from inside the dead zone. Follow those signal rings.',
    reveal: 'These coordinates were erased from every public chart. Somebody wanted Horizon forgotten.',
    warning: 'The signal is moving toward Neon Canyon. We are not the only ones tracking it.',
    secured: 'First fragment decoded. HORIZON says: "We are still here." Nitro restored.',
  },
  {
    title: '02 · DUST & DECOYS',
    mission: 'Hit 1 acceleration pad',
    objective: 'boost',
    target: 1,
    reward: 'shield',
    commander: 'ECHO',
    intro: 'The canyon is full of false beacons. Use a boost pad to slip past the jamming field.',
    reveal: 'A bounty has been placed on anyone following HORIZON. The sender is called LANDLORD.',
    warning: 'Keep your shields close. The real transmission is hidden behind the dust.',
    secured: 'Jammer bypassed. HORIZON did not crash: it was forced to disappear. Shield restored.',
  },
  {
    title: '03 · ABOVE THE STORM',
    mission: 'Launch off 1 jump ramp',
    objective: 'jump',
    target: 1,
    reward: 'nitro',
    commander: 'CAPTAIN LYRA',
    intro: 'If you hear this, our ship is alive. Reach the cloud relay; the lower lanes are being watched.',
    reveal: 'We discovered a reactor that could power an entire city. LANDLORD locked us inside it.',
    warning: 'The relay is breaking up. One clean jump will get you above the interference.',
    secured: 'Cloud relay connected. Lyra sent the reactor schematics. Nitro restored.',
  },
  {
    title: '04 · THE STOLEN MAP',
    mission: 'Collect 1 supply cache',
    objective: 'ammo',
    target: 1,
    reward: 'shield',
    commander: 'ECHO',
    intro: 'The orbital supply pods carry the last piece of Horizon’s flight map. Recover one.',
    reveal: 'LANDLORD sold rescue coordinates to keep the reactor secret. Now he is coming for the core.',
    warning: 'His ships have sealed the outer ring. Stay in the race; we can still reach HORIZON.',
    secured: 'Map decrypted. We have a route through the reactor’s defense grid. Shield restored.',
  },
  {
    title: '05 · HEART OF THE RIFT',
    mission: 'Engage Warp drive 1 time',
    objective: 'warp',
    target: 1,
    reward: 'shield',
    commander: 'CAPTAIN LYRA',
    intro: 'Pilot, I can see your engine flare. LANDLORD is guarding our last escape route.',
    reveal: 'The reactor is destabilizing. Your Warp drive can reopen the corridor, but you must keep racing.',
    warning: 'The gate is almost shut. Reach the finish and get us out of here!',
    secured: 'WARP CORRIDOR OPEN. Horizon’s evacuation route is clear. Shields reinforced.',
  },
]).map((chapter) => Object.freeze(chapter)));

/**
 * @typedef {object} WarpStoryState
 * @property {number} progress actions toward this chapter's optional objective
 * @property {boolean} done objective has been completed and its reward claimed
 * @property {number} recovered completed *previous* chapters in this cup
 * @property {number} beat next unplayed transmission, 0 intro, 1 reveal, 2 warning, 3 exhausted
 * @property {'intro' | 'reveal' | 'warning' | 'secured' | ''} cue the on-screen transmission
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
    case 'ring': return event.type === 'ring' && event.grade !== 'miss';
    case 'boost': return event.type === 'boost' && event.by === 'pad';
    case 'jump': return event.type === 'jump' && event.pilot === undefined;
    case 'ammo': return event.type === 'ammo';
    default: return false;
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
    const gained = chapter.objective === 'warp'
      ? Number(race.abilityTime > 0)
      : events.reduce((count, event) => count + Number(objectiveMatches(chapter.objective, event)), 0);

    if (gained > 0) {
      story.progress = Math.min(chapter.target, story.progress + gained);
      if (story.progress >= chapter.target) {
        story.done = true;
        race.points += 180 + race.race * 40;
        grantReward(race, rules, chapter.reward);
        story.cue = 'secured';
        story.cueTime = 5.8;
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
  if (story.beat === 0) {
    story.cue = 'intro';
    story.cueTime = 6.5;
    story.beat = 1;
  } else if (story.beat === 1 && share >= 0.34) {
    story.cue = 'reveal';
    story.cueTime = 6.2;
    story.beat = 2;
  } else if (story.beat === 2 && share >= 0.69) {
    story.cue = 'warning';
    story.cueTime = 5.4;
    story.beat = 3;
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
    speaker: cue ? chapter.commander : '',
    message: cue ? chapter[cue] : '',
  };
}

/**
 * @param {number} recovered fragments rescued in a successfully finished cup
 */
export function warpStoryEnding(recovered) {
  return recovered >= 4
    ? 'HORIZON RESCUED — Five routes, one brave pilot. Captain Lyra and her crew made it home. The last signal is no longer a distress call; it is a thank-you.'
    : 'THE SIGNAL SURVIVES — You reached HORIZON and opened the way home. Some fragments remain lost among the stars. Fly again to uncover the full story.';
}
