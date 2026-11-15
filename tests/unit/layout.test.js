import test from 'node:test';
import assert from 'node:assert/strict';
import { layoutFloor, ROW_WIDTH } from '../../app/frontend/js/art/planlayout.js';
import { layoutNetwork } from '../../app/frontend/js/art/netlayout.js';
import { netModel } from '../../app/frontend/js/model.js';
import { rng } from '../../app/frontend/js/util.js';
import { setup } from './helpers.js';

const EPS = 1e-6;
const overlap = (a, b) => a[0] < b[0] + b[2] - EPS && b[0] < a[0] + a[2] - EPS && a[1] < b[1] + b[3] - EPS && b[1] < a[1] + a[3] - EPS;

function assertFloor(rooms) {
  rooms.forEach((r, i) => {
    assert.ok(r.geom[2] > 0 && r.geom[3] > 0);
    assert.ok(r.geom[0] >= -EPS && r.geom[0] + r.geom[2] <= ROW_WIDTH + EPS, 'a room sticks out of the row');
    rooms.slice(i + 1).forEach((other) => assert.ok(!overlap(r.geom, other.geom), 'rooms overlap'));
  });
  // Reading order (row by row, left to right) is the configured order.
  const order = [...rooms].sort((a, b) => a.geom[1] - b.geom[1] || a.geom[0] - b.geom[0]);
  assert.deepEqual(order, rooms);
}

test('the generated floor plan never overlaps and keeps the room order', () => {
  const { d } = setup();
  d.floors.forEach((fl) => assertFloor(fl.rooms.map((id) => d.rooms[id])));

  const rand = rng(42);
  for (let run = 0; run < 200; run += 1) {
    const rooms = Array.from({ length: 1 + Math.floor(rand() * 14) }, () => ({ size: [1 + Math.round(rand() * 60) / 10, 1 + Math.round(rand() * 30) / 10] }));
    layoutFloor(rooms);
    assertFloor(rooms);
  }
  assert.doesNotThrow(() => layoutFloor([]));
});

test('the network map never overlaps device cards, at any width or view', () => {
  const { d, cfg } = setup();
  ['all', 'unifi', 'zigbee'].forEach((view) => {
    ['site_01', 'site_02'].forEach((site) => {
      [600, 720, 900, 1000, 1280, 1600].forEach((width) => {
        const model = netModel(d, cfg, view, site);
        const L = layoutNetwork(model, width);
        const cards = model.devices.map((v) => L.cards[v.id]);
        assert.ok(cards.every(Boolean), 'every device has a card');
        assert.ok(model.nodes.every((n) => L.nodes[n.id]), 'every node has a position');
        cards.forEach((a, i) => {
          assert.ok(a.x >= 0 && a.x + a.w <= L.W + EPS && a.y >= 0 && a.y + a.h <= L.H + EPS, `${view} ${site} ${width}: card outside the map`);
          cards.slice(i + 1).forEach((b) => assert.ok(!overlap([a.x, a.y, a.w, a.h], [b.x, b.y, b.w, b.h]), `${view} ${site} ${width}: cards overlap`));
        });
      });
    });
  });
});
