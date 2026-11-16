// Interactive isometric floor plan. The geometry is generated from the
// configured rooms (see planlayout.js); it is a schematic, not a real home layout.
import { pts } from '../util.js';
import { icon } from '../icons.js';
import { act, roomName, floorNameRaw } from '../views/parts.js';
import { roomSummary, lightState } from '../model.js';
import { playingRooms } from '../music.js';
import { iso, groundEllipse, percent } from './iso.js';

const W = 1000;
const H = 600;
const MAX_UNIT = 62;
const THICK = 0.32;

/** Parts of an edge that no neighbouring room covers, as [from, to] runs. */
function exposedRuns(from, to, covered) {
  const runs = [];
  let start = null;
  for (let v = from; v < to - 1e-6; v += 0.2) {
    const open = !covered(v + 0.1);
    if (open && start === null) start = v;
    if (!open && start !== null) {
      runs.push([start, v]);
      start = null;
    }
  }
  if (start !== null) runs.push([start, to]);
  return runs;
}

export function roomStatusText(c, id) {
  const { d, t, tn } = c;
  const room = d.rooms[id];
  const sum = roomSummary(d, id);
  const parts = [];
  if (room.motion === 'now') parts.push(t('room.motion.now'));
  if (sum.doorOpen) parts.push(t('room.door.open'));
  if (playingRooms(d, c.cfg).includes(id)) parts.push(t('room.music'));
  if (sum.on) parts.push(tn('room.lightsOn', sum.on));
  if (sum.unavailable) parts.push(tn('room.unreachable', sum.unavailable));
  if (sum.missing) parts.push(tn('room.configWarn', sum.missing));
  return parts;
}

export function floorplan(c, floor) {
  const { d, s, t, f } = c;
  const rooms = floor.rooms.map((id) => ({ id, ...d.rooms[id] }));
  if (!rooms.length) return `<p class="plan-empty">${t('plan.empty')}</p>`;
  const maxX = Math.max(...rooms.map((r) => r.geom[0] + r.geom[2]));
  const maxY = Math.max(...rooms.map((r) => r.geom[1] + r.geom[3]));
  // Shrink the grid unit for large floors so the whole plan stays inside the view box.
  const unit = Math.min(MAX_UNIT, 880 / ((maxX + maxY) * Math.cos(Math.PI / 6)), 470 / ((maxX + maxY) * 0.5));
  const P = iso(unit, W / 2 - ((maxX - maxY) * unit * Math.cos(Math.PI / 6)) / 2, (H - (maxX + maxY) * unit * 0.5) / 2 + 18);
  const inside = (x, y) => rooms.some((r) => x > r.geom[0] && x < r.geom[0] + r.geom[2] && y > r.geom[1] && y < r.geom[1] + r.geom[3]);
  const side = (a, b) => `<polygon points="${pts([P(...a), P(...b), P(b[0], b[1], -THICK), P(a[0], a[1], -THICK)])}"/>`;

  const shadow = `<polygon class="plan-shadow" points="${pts([P(0, 0, -0.9), P(maxX, 0, -0.9), P(maxX, maxY, -0.9), P(0, maxY, -0.9)])}"/>`;
  let shapes = '';
  let outlines = '';
  let pins = '';

  [...rooms].sort((a, b) => (a.geom[0] + a.geom[1]) - (b.geom[0] + b.geom[1])).forEach((room) => {
    const [x, y, w, depth] = room.geom;
    const small = w * unit < 110 || depth * unit < 90;
    const sum = roomSummary(d, room.id);
    const top = pts([P(x, y), P(x + w, y), P(x + w, y + depth), P(x, y + depth)]);
    const [cx, cy] = P(x + w / 2, y + depth / 2);
    const classes = ['plan-room'];
    if (room.outdoor) classes.push('is-outdoor');
    if (sum.on) classes.push('is-lit');
    if (s.room === room.id) classes.push('is-selected');

    const left = exposedRuns(x, x + w, (v) => inside(v, y + depth + 0.05)).map(([a, b]) => side([a, y + depth], [b, y + depth])).join('');
    const right = exposedRuns(y, y + depth, (v) => inside(x + w + 0.05, v)).map(([a, b]) => side([x + w, a], [x + w, b])).join('');

    let marks = '';
    if (room.motion) {
      const [rx, ry] = groundEllipse(Math.min(w, depth) * 0.36, unit);
      marks += room.motion === 'now'
        ? `<ellipse class="plan-motion" cx="${cx.toFixed(1)}" cy="${cy.toFixed(1)}" rx="${rx.toFixed(1)}" ry="${ry.toFixed(1)}"/><ellipse class="plan-motion is-inner" cx="${cx.toFixed(1)}" cy="${cy.toFixed(1)}" rx="${(rx * 0.55).toFixed(1)}" ry="${(ry * 0.55).toFixed(1)}"/>`
        : `<ellipse class="plan-motion is-faded" cx="${cx.toFixed(1)}" cy="${cy.toFixed(1)}" rx="${rx.toFixed(1)}" ry="${ry.toFixed(1)}"/>`;
    }
    if (sum.doorOpen) {
      const hx = x + w * 0.3;
      marks += `<polygon class="plan-door" points="${pts([P(hx, y + depth), P(hx + 0.55, y + depth + 0.55), P(hx + 0.55, y + depth + 0.55, 0.9), P(hx, y + depth, 0.9)])}"/>`;
    }
    room.lights.forEach((lid, i, all) => {
      if (lightState(d, lid) !== 'on') return;
      const [lx, ly] = P(x + (w * (i + 1)) / (all.length + 1), y + depth * 0.78);
      marks += `<circle class="plan-lamp" cx="${lx.toFixed(1)}" cy="${ly.toFixed(1)}" r="5"/>`;
    });

    shapes += `<g class="${classes.join(' ')}" data-action="room" data-arg="${room.id}">
      <g class="plan-side-l">${left}</g><g class="plan-side-r">${right}</g>
      <polygon class="plan-top" points="${top}"/>${marks}</g>`;
    if (sum.attention) outlines += `<polygon class="plan-attn" points="${top}"/>`;

    const name = roomName(c, room.id);
    const temp = room.temp === undefined ? '' : f.temp(room.temp, 0);
    const status = roomStatusText(c, room.id);
    const label = [name, temp, ...status].filter(Boolean).join(', ');
    const dot = small ? '' : `<span class="pin-dot">${icon(room.icon)}${sum.attention ? '<i class="pin-badge is-attn"></i>' : ''}${room.motion === 'now' ? `<i class="pin-badge is-motion">${icon('walk')}</i>` : ''}</span><span class="pin-stem"></span>`;
    pins += `<button type="button" class="pin${small ? ' pin-small' : ''}${sum.attention ? ' is-attn' : ''}" data-style="left:${percent(cx, W)};top:${percent(cy, H)}" aria-label="${label}" ${act('room', room.id)}>
      ${dot}<span class="pin-label"><b>${name}</b>${temp ? ` <span>${temp}</span>` : ''}${room.motion === 'now' ? `<em>${t('room.motion.now')}</em>` : ''}</span></button>`;
  });

  return `<div class="plan-art">
    <svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${t('plan.artLabel', { floor: floorNameRaw(c, floor) })}">${shadow}${shapes}${outlines}</svg>
    ${pins}
  </div>`;
}
