import test from 'node:test';
import assert from 'node:assert/strict';

import { WARP_CONFIG } from '../src/config.js';
import { advanceGame, createInitialState, GAME_PHASE, startGame } from '../src/domain/game.js';
import { advanceWarpStory, startWarpStory, WARP_STORY, warpStoryEnding, warpStoryView } from '../src/domain/warp-story.js';
import { raceState } from '../src/domain/warp.js';

const rules = WARP_CONFIG.warp;
const input = { horizontalAxis: 0, pointerX: null, opponentAxis: 0, opponentPointerX: null };

const ring = () => ({ type: 'ring', grade: 'good', chain: 0, air: false, z: 110, x: 0, points: 20 });
const boost = () => ({ type: 'boost', z: 110, x: 0, by: 'pad' });
const jump = () => ({ type: 'jump', z: 110, x: 0 });
const ammo = () => ({ type: 'ammo', kind: 'nitro', z: 110, x: 0 });

test('THE LAST SIGNAL provides five original chapters and different attainable optional goals', () => {
  assert.equal(WARP_STORY.length, rules.courses.length);
  assert.deepEqual(WARP_STORY.map((chapter) => chapter.objective), ['ring', 'boost', 'jump', 'ammo', 'warp']);
  assert.ok(WARP_STORY.every((chapter) => chapter.title && chapter.intro && chapter.reveal && chapter.warning && chapter.secured));
  assert.equal(new Set(WARP_STORY.map((chapter) => chapter.title)).size, 5);
  assert.ok(WARP_STORY.every((chapter) => chapter.target > 0 && chapter.mission.length < 60));
  assert.equal(startWarpStory(2).recovered, 2);
  assert.equal(startWarpStory().progress, 0);
});

test('Sunset signals require successful ring traversal, reject misses, then reward once', () => {
  const race = raceState(WARP_CONFIG, 0);
  const beginning = race.points;
  race.nitro = 0;
  const failed = [{ ...ring(), grade: 'miss' }];
  advanceWarpStory(race, rules, failed, 0.1);
  assert.equal(race.story.progress, 0, 'flying past a ring is not a rescued signal');

  const first = [ring()];
  advanceWarpStory(race, rules, first, 0.1);
  assert.equal(race.story.progress, 1);
  assert.equal(race.story.done, false);

  const second = [ring(), ring()];
  advanceWarpStory(race, rules, second, 0.1);
  assert.equal(race.story.progress, 2);
  assert.equal(race.story.done, true);
  assert.equal(race.nitro, 1);
  assert.equal(race.points, beginning + 180);
  assert.deepEqual(second.filter((event) => event.type === 'story-complete').map((e) => e.reward), ['nitro']);

  const again = [ring()];
  advanceWarpStory(race, rules, again, 0.1);
  assert.equal(race.points, beginning + 180, 'objectives cannot be farmed repeatedly');
  assert.equal(again.filter((event) => event.type === 'story-complete').length, 0);
});

test('every later chapter tracks an action, protects ammo capacity and delivers its own message', () => {
  const events = [[boost()], [jump()], [ammo()], []];
  for (let chapter = 1; chapter < WARP_STORY.length; chapter += 1) {
    const race = raceState(WARP_CONFIG, chapter, 0, 0, chapter - 1);
    race.nitro = 0;
    race.shield = 0;
    if (chapter === 4) race.abilityTime = 1.8;
    const stepEvents = events[chapter - 1];
    advanceWarpStory(race, rules, stepEvents, 0.02);
    assert.equal(race.story.done, true, WARP_STORY[chapter].title);
    assert.equal(race.story.progress, 1);
    assert.equal(race.story.recovered, chapter - 1);
    assert.equal(stepEvents.filter((event) => event.type === 'story-complete').length, 1);
    assert.ok(race.points >= 180);
    assert.equal(race.story.cue, 'secured');
    assert.ok(warpStoryView(race).message.includes('restored') || warpStoryView(race).message.includes('reinforced'));
    if (WARP_STORY[chapter].reward === 'shield') assert.equal(race.shield, 1);
    if (WARP_STORY[chapter].reward === 'nitro') assert.equal(race.nitro, 1);
  }
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
  const first = race.story.cueTime;
  advanceWarpStory(race, rules, [], 0.2);
  assert.ok(race.story.cueTime < first);
  assert.equal(race.story.beat, 1, 'no repeat intro messages');

  race.z = race.course.length * 0.37;
  advanceWarpStory(race, rules, [], 8);
  assert.equal(race.story.cue, 'reveal');
  race.z = race.course.length * 0.72;
  advanceWarpStory(race, rules, [], 8);
  assert.equal(race.story.cue, 'warning');
  assert.equal(race.story.beat, 3);
  advanceWarpStory(race, rules, [], 8);
  assert.equal(race.story.cue, '');
  assert.equal(warpStoryView(race).message, '', 'the player can see through the track again');

  const ended = { ...race, finished: true, story: { ...race.story } };
  advanceWarpStory(ended, rules, [], 6);
  assert.deepEqual(ended.story, race.story, 'finish suspends radio updates');
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

test('ending honors recovered chapters and never blocks players who skipped side quests', () => {
  assert.match(warpStoryEnding(5), /HORIZON RESCUED/);
  assert.match(warpStoryEnding(3), /SIGNAL SURVIVES/);
  assert.match(warpStoryEnding(0), /Fly again/);
  assert.ok(warpStoryEnding(5).length > 90);
});
