import test from 'node:test';
import assert from 'node:assert/strict';
import { pullCloses, pullOffset } from '../../app/frontend/js/pull.js';

const H = 800;

test('a sheet closes when pulled far enough, whatever the speed', () => {
  assert.equal(pullCloses({ dy: 140, ms: 500, moved: 1, height: H }), true, 'the cap: 140 px on a tall sheet');
  assert.equal(pullCloses({ dy: 100, ms: 500, moved: 1, height: 400 }), true, 'a quarter of a short sheet');
  assert.equal(pullCloses({ dy: 139, ms: 500, moved: 1, height: H }), false, 'just short of it springs back');
});

test('a quick flick closes it after a short pull; a slow short pull does not', () => {
  assert.equal(pullCloses({ dy: 40, ms: 16, moved: 15, height: H }), true);
  assert.equal(pullCloses({ dy: 40, ms: 100, moved: 15, height: H }), false);
  assert.equal(pullCloses({ dy: 20, ms: 16, moved: 15, height: H }), false, 'a flick that barely moved is a tap');
});

test('pulling up or not at all never closes, and the sheet never moves up', () => {
  for (const dy of [0, -50, NaN]) assert.equal(pullCloses({ dy, ms: 16, moved: 30, height: H }), false, String(dy));
  assert.equal(pullOffset(-30), 0);
  assert.equal(pullOffset(55), 55);
});
