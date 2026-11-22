import test from 'node:test';
import assert from 'node:assert/strict';
import { FINISH, ROAD, newRide, queueHop, tickRide } from '../src/domain/mixtape.js';
import { drawRide } from '../src/adapters/canvas/mixtape.js';
import { createRecordingContext } from './support/fake-canvas.js';

function play(ride, steer) {
  for (let step = 0; step < 9000 && ride.phase === 'riding'; step++) {
    steer(ride);
    tickRide(ride);
  }
  return ride;
}

function hopOnTime(ride, lane) {
  const next = ROAD.slice(ride.cursor).find(item => item.lane === lane);
  if (next && next.at - ride.distance < 32 && ride.riders[lane].air === 0) queueHop(ride, lane);
}

test('every lane and duet is reachable solo and with independent co-op inputs', () => {
  for (const duo of [true, false]) {
    const run = play(newRide(duo), ride => {
      hopOnTime(ride, 0);
      if (duo) hopOnTime(ride, 1);
    });
    assert.equal(run.phase, 'home');
    assert.equal(run.tapes, ROAD.filter(item => item.kind === 'tape').length);
    assert.equal(run.mixes, run.tapes / 2);
    assert.equal(run.saves, 0);
    assert.ok(run.score >= 500);
    assert.equal(run.block, 2);
  }
});

test('solo leaves the survivor to the player, a clean hop rescues their friend', () => {
  const run = newRide(false);
  while (!run.riders[0].down) tickRide(run);
  queueHop(run, 0);
  assert.equal(run.riders[0].buffer, 0);
  while (run.saves === 0 && run.phase === 'riding') {
    hopOnTime(run, 1);
    tickRide(run);
  }
  assert.equal(run.saves, 1);
  assert.equal(run.riders[0].down, false);
  assert.ok(run.riders[0].grace > 0);
  assert.match(run.notice, /Back together/);
});

test('two falls end a run, repeated ticks and late inputs cannot change the outcome', () => {
  const run = play(newRide(false), () => {});
  assert.equal(run.phase, 'out');
  const before = structuredClone(run);
  tickRide(run);
  queueHop(run, 1);
  assert.deepEqual(run, before);
});

test('a restored rider has grace, missed tapes give no points and one rider can finish', () => {
  const run = newRide(true);
  run.riders[0].grace = 5;
  while (run.cursor < 1) tickRide(run);
  assert.equal(run.riders[0].down, false);
  run.cursor = ROAD.findIndex(item => item.kind === 'tape');
  run.distance = ROAD[run.cursor].at - .1;
  tickRide(run);
  assert.equal(run.tapes, 0);
  run.riders[1].down = true;
  run.cursor = ROAD.length;
  run.distance = FINISH - .1;
  tickRide(run);
  assert.equal(run.score, 200);
});

test('all three neighborhoods, road objects, finish, and the chain-off signal draw', () => {
  const ctx = createRecordingContext();
  const run = newRide(true);
  for (const block of [0, 1, 2]) {
    run.block = block;
    for (const item of ROAD.slice(0, 6)) {
      run.distance = item.at - 70;
      drawRide(ctx, run, block === 2);
    }
  }
  run.distance = FINISH; run.cursor = ROAD.length; run.riders[0].down = true;
  drawRide(ctx, run, false);
  const words = ctx.calls.filter(call => call.name === 'fillText').map(call => call.args[0]);
  assert.ok(words.includes('CHAIN!') && words.includes('ARCADE') && words.includes('RECORDS'));
});
