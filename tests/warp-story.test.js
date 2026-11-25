import test from 'node:test';
import assert from 'node:assert/strict';

import { WARP_CONFIG } from '../src/config.js';
import { advanceGame, createInitialState, GAME_PHASE, startGame } from '../src/domain/game.js';
import { advanceWarpStory, startWarpStory, VILLAIN, WARP_STORY, warpStoryEnding, warpStoryView } from '../src/domain/warp-story.js';
import { raceState } from '../src/domain/warp.js';

const rules = WARP_CONFIG.warp;
const input = { horizontalAxis: 0, pointerX: null, opponentAxis: 0, opponentPointerX: null };

const ring = (grade = 'perfect', air = false) => ({ type: 'ring', grade, chain: 1, air, z: 110, x: 0, points: 50 });
const boost = (by = 'pad') => ({ type: 'boost', z: 110, x: 0, by });
const ammo = (kind = 'nitro') => ({ type: 'ammo', kind, z: 110, x: 0 });
const takedown = (by = 'guns') => ({ type: 'takedown', pilot: 1, z: 110, x: 0, points: 150, by });

test('THE LAST SIGNAL provides eight original chapters and different attainable optional goals', () => {
  assert.equal(WARP_STORY.length, rules.courses.length);
  assert.deepEqual(WARP_STORY.map((chapter) => chapter.objective), ['perfect', 'boost', 'air', 'ammo', 'takedown', 'air', 'ammo', 'takedown']);
  assert.ok(WARP_STORY.every((chapter) => chapter.title && chapter.intro && chapter.reveal && chapter.intercept && chapter.warning && chapter.secured && chapter.fragment));
  assert.equal(new Set(WARP_STORY.map((chapter) => chapter.title)).size, 8);
  assert.ok(WARP_STORY.every((chapter) => chapter.target > 1 && chapter.mission.length < 32), 'a feat, said in a few words');
  // Read at a glance, in flight.
  for (const chapter of WARP_STORY) {
    for (const line of [chapter.intro, chapter.reveal, chapter.intercept, chapter.warning, chapter.secured, chapter.fragment]) {
      assert.ok(line.length <= 72, `${chapter.title}: ${line}`);
    }
  }
  assert.equal(startWarpStory(2).recovered, 2);
  assert.equal(startWarpStory().progress, 0);
});

const times = (count, make) => Array.from({ length: count }, make);

test('the first chapter counts rings flown dead center, not merely through, then rewards once', () => {
  const race = raceState(WARP_CONFIG, 0);
  const { target } = WARP_STORY[0];
  const beginning = race.points;
  race.nitro = 0;
  advanceWarpStory(race, rules, [ring('miss'), ring('good'), ring('good', true)], 0.1);
  assert.equal(race.story.progress, 0, 'a ring off its middle is not a signal locked on');

  advanceWarpStory(race, rules, [ring()], 0.1);
  assert.equal(race.story.progress, 1);
  advanceWarpStory(race, rules, times(target - 2, () => ring()), 0.1);
  assert.equal(race.story.progress, target - 1);
  assert.equal(race.story.done, false);

  const last = [ring('perfect', true)];
  advanceWarpStory(race, rules, last, 0.1);
  assert.equal(race.story.progress, target);
  assert.equal(race.story.done, true);
  assert.equal(race.nitro, 1);
  assert.equal(race.points, beginning + 180);
  assert.deepEqual(last.filter((event) => event.type === 'story-complete').map((e) => e.reward), ['nitro']);

  const again = [ring()];
  advanceWarpStory(race, rules, again, 0.1);
  assert.equal(race.points, beginning + 180, 'objectives cannot be farmed repeatedly');
  assert.equal(again.filter((event) => event.type === 'story-complete').length, 0);
});

test('every later chapter counts its own feat, and only that', () => {
  // What counts, and what looks like it but does not.
  const feats = [
    [() => boost(), [boost('drift'), boost('slingshot'), boost('start')]],
    [(_, index) => ring(index % 2 ? 'good' : 'perfect', true), [ring('perfect'), ring('miss', true)]],
    [(_, index) => ammo(index % 2 ? 'rocket' : 'nitro'), [boost(), ring()]],
    [(_, index) => takedown(['guns', 'rocket', 'ram', 'super'][index % 4]), [{ type: 'crash', z: 110, x: 0, kind: 'mine', pilot: 2 }, { type: 'bump', z: 110, x: 0 }]],
    [() => ring('good', true), [ring('perfect')]],
    [() => ammo(), [boost()]],
    [() => takedown(), [ring()]],
  ];

  feats.forEach(([make, ignored], index) => {
    const chapter = index + 1;
    const { target } = WARP_STORY[chapter];
    const race = raceState(WARP_CONFIG, chapter, 0, 0, chapter);
    race.nitro = 0;
    race.shield = 0;

    advanceWarpStory(race, rules, ignored, 0.02);
    assert.equal(race.story.progress, 0, `${WARP_STORY[chapter].title}: ${ignored.map((event) => event.type).join(', ')} do not count`);

    advanceWarpStory(race, rules, times(target - 1, make), 0.02);
    assert.equal(race.story.done, false, 'one short');

    const events = [make(null, target - 1)];
    advanceWarpStory(race, rules, events, 0.02);
    assert.equal(race.story.done, true, WARP_STORY[chapter].title);
    assert.equal(race.story.progress, target);
    assert.equal(race.story.recovered, chapter);
    assert.equal(events.filter((event) => event.type === 'story-complete').length, 1);
    assert.equal(race.points, 180 + chapter * 40);
    assert.equal(race.story.cue, 'secured');
    assert.ok(warpStoryView(race).message.includes('restored') || warpStoryView(race).message.includes('reinforced'));
    if (WARP_STORY[chapter].reward === 'shield') assert.equal(race.shield, 1);
    if (WARP_STORY[chapter].reward === 'nitro') assert.equal(race.nitro, 1);
  });
});

test('radio messages appear after launch and at plot checkpoints without timers or RNG', () => {
  const race = raceState(WARP_CONFIG, 0);
  race.launched = true;
  race.z = 18;
  advanceWarpStory(race, rules, [], 0.1);
  assert.equal(race.story.cue, 'intro');
  assert.equal(race.story.beat, 1);
  assert.equal(warpStoryView(race).speaker, 'ECHO');
  assert.ok(warpStoryView(race).message.includes('HORIZON'));
  assert.ok(race.story.cueTime <= 4.5, 'a line is up only for a glance');
  const first = race.story.cueTime;
  advanceWarpStory(race, rules, [], 0.2);
  assert.ok(race.story.cueTime < first);
  assert.equal(race.story.beat, 1, 'no repeat intro messages');

  race.z = race.course.length * 0.37;
  advanceWarpStory(race, rules, [], 8);
  assert.equal(race.story.cue, 'reveal');
  assert.equal(warpStoryView(race).hostile, false);

  // Halfway the villain breaks in, on his own channel.
  race.z = race.course.length * 0.55;
  advanceWarpStory(race, rules, [], 8);
  assert.equal(race.story.cue, 'intercept');
  assert.equal(warpStoryView(race).speaker, VILLAIN);
  assert.equal(warpStoryView(race).hostile, true);
  assert.equal(warpStoryView(race).message, WARP_STORY[0].intercept);

  race.z = race.course.length * 0.72;
  advanceWarpStory(race, rules, [], 8);
  assert.equal(race.story.cue, 'warning');
  assert.equal(race.story.beat, 4);
  assert.equal(warpStoryView(race).speaker, 'ECHO');
  advanceWarpStory(race, rules, [], 8);
  assert.equal(race.story.cue, '');
  assert.equal(warpStoryView(race).message, '', 'the player can see through the track again');

  const ended = { ...race, finished: true, story: { ...race.story } };
  advanceWarpStory(ended, rules, [], 6);
  assert.deepEqual(ended.story, race.story, 'finish suspends radio updates');
});

test('a line the race flew past while another was up still plays, in order, never two at once', () => {
  const race = raceState(WARP_CONFIG, 2);
  race.launched = true;
  race.z = 30;
  advanceWarpStory(race, rules, [], 0.1);
  assert.equal(race.story.cue, 'intro');

  race.z = race.course.length * 0.8;
  advanceWarpStory(race, rules, [], 1);
  assert.equal(race.story.cue, 'intro', 'a line is never cut off');
  const heard = [];
  const radio = [];
  for (let step = 0; step < 40; step += 1) {
    const events = [];
    advanceWarpStory(race, rules, events, 0.5);
    radio.push(...events.filter((event) => event.type === 'radio'));
    if (race.story.cue && heard.at(-1) !== race.story.cue) heard.push(race.story.cue);
  }
  assert.deepEqual(heard, ['intro', 'reveal', 'intercept', 'warning']);
  assert.deepEqual(radio.map(({ cue, hostile }) => [cue, hostile]), [['reveal', false], ['intercept', true], ['warning', false]], 'each line opens the channel once, the villain\'s his own way');
});

test('story fragment counts survive race transitions but not a failed retry', () => {
  const state = startGame(createInitialState(WARP_CONFIG, 7), WARP_CONFIG);
  const achieved = { ...state, phase: GAME_PHASE.RUNNING, serveCountdown: 0,
    warp: { ...state.warp, race: 0, story: { ...state.warp.story, done: true }, calm: 0.01, retry: false, finished: true } };
  const progressed = advanceGame(achieved, 0.1, input, WARP_CONFIG);
  assert.equal(progressed.warp.race, 1);
  assert.equal(progressed.warp.story.recovered, 1);
  assert.equal(progressed.warp.story.progress, 0);

  const retry = { ...achieved, warp: { ...achieved.warp, retry: true } };
  const replayed = advanceGame(retry, 0.1, input, WARP_CONFIG);
  assert.equal(replayed.warp.race, 0);
  assert.equal(replayed.warp.story.recovered, 0);
});

test('the ending rescues HORIZON only with every fragment, and otherwise says how many were found', () => {
  assert.equal(warpStoryEnding(8).title, 'HORIZON RESCUED');
  assert.match(warpStoryEnding(8).text, /All 8 fragments/);
  assert.equal(warpStoryEnding(7).title, 'THE SIGNAL SURVIVES', 'seven of eight is not all of them');
  assert.match(warpStoryEnding(7).text, /^7 of 8 fragments recovered/);
  assert.match(warpStoryEnding(0).text, /^0 of 8 .*fly again/);
  assert.match(warpStoryEnding(9).text, /All 8/, 'never more than there are');
  assert.match(warpStoryEnding(-2).text, /^0 of 8/);
});
