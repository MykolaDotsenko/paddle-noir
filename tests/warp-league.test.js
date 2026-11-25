import test from 'node:test';
import assert from 'node:assert/strict';
import { WARP_CONFIG } from '../src/config.js';
import { raceState } from '../src/domain/warp.js';
import { advanceWarpLeague } from '../src/domain/warp-league.js';
import { warpStoryView } from '../src/domain/warp-story.js';

const rules = WARP_CONFIG.warp;
const step = (race, from, events = [], seconds = 0.1) => advanceWarpLeague(race, rules, events, from, seconds);
const down = (pilot) => ({ type: 'takedown', pilot, z: 300, x: 0, points: 150, by: 'rocket' });

test('both service relays refill once per crossing, never beyond the loadout', () => {
  const race = raceState(WARP_CONFIG, 0);
  race.nitro = 0;
  race.rockets = 0;
  race.z = race.course.length / 3 + 1;
  step(race, race.z - 2);
  assert.equal(race.nitro, 1);
  assert.equal(race.rockets, 1);
  assert.match(race.story.leagueCall, /SERVICE RELAY/);
  step(race, race.z);
  assert.equal(race.rockets, 1);
  race.nitro = rules.loadout.nitroBars;
  race.rockets = rules.loadout.rockets;
  race.z = race.course.length * 2 / 3 + 1;
  step(race, race.z - 2);
  assert.equal(race.nitro, rules.loadout.nitroBars);
  assert.equal(race.rockets, rules.loadout.rockets);
});

test('one bounty per race, announced by name and paid only for the target', () => {
  const race = raceState(WARP_CONFIG, 0);
  race.z = race.course.length * 0.12 + 1;
  step(race, race.z - 2);
  assert.match(race.story.leagueCall, /Hryts/);
  step(race, race.z, [down(0)]);
  assert.equal(race.points, 0);
  step(race, race.z, [down(4), down(4)]);
  assert.equal(race.points, 300);
  assert.equal(race.story.bountyClaimed, true);
  assert.match(race.story.leagueCall, /BOUNTY CLAIMED/);
  step(race, race.z, [down(4)]);
  assert.equal(race.points, 300);
  const next = raceState(WARP_CONFIG, 4, race.points);
  assert.equal(next.story.bountyClaimed, false);
  next.z = 400;
  step(next, 399, [down(4)]);
  assert.match(next.story.leagueCall, /Landlord/);
  assert.equal(next.points, 600);
});

test('VOLT FM responds to the race without interrupting the plot or spamming', () => {
  const race = raceState(WARP_CONFIG, 0);
  race.z = 300;
  step(race, 299, [{ type: 'overtake', place: 2, pilot: 1, points: 50 }]);
  assert.match(warpStoryView(race).message, /pressure/);
  assert.equal(warpStoryView(race).speaker, 'VOLT FM');
  step(race, 299, [down(0)]);
  assert.match(race.story.leagueCall, /pressure/);
  race.story.cue = 'intro';
  race.story.cueTime = 2;
  assert.equal(warpStoryView(race).speaker, 'ECHO');
  race.story.cueTime = 0;
  step(race, 299, [down(0)], 7);
  assert.match(race.story.leagueCall, /RIVAL DOWN/);
  step(race, 299, [{ type: 'crash', kind: 'mine', z: 299, x: 0, pilot: 1 }], 7);
  assert.equal(warpStoryView(race).message, '');
  step(race, 299, [{ type: 'crash', kind: 'mine', z: 299, x: 0 }]);
  assert.match(race.story.leagueCall, /Still flying/);
  step(race, 299, [{ type: 'final-stretch' }], 7);
  assert.match(race.story.leagueCall, /FINAL STRETCH/);
  race.finished = true;
  step(race, 299, [], 7);
  assert.match(race.story.leagueCall, /FINAL STRETCH/);
});
