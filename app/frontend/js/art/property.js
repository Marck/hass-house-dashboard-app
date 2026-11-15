// Generic isometric property illustration for the energy screen.
// Drawn from primitives; it does not depict a real building or site.
import { pts } from '../util.js';
import { iso, percent } from './iso.js';

const W = 960;
const H = 660;
const UNIT = 42;
const P = iso(UNIT, 445, 92);

const poly = (cls, points) => `<polygon class="${cls}" points="${pts(points)}"/>`;

/** Box with the two camera-facing walls and a flat top. */
function box(x0, y0, x1, y1, h, cls) {
  return poly(`${cls} wall-l`, [P(x0, y1), P(x1, y1), P(x1, y1, h), P(x0, y1, h)])
    + poly(`${cls} wall-r`, [P(x1, y0), P(x1, y1), P(x1, y1, h), P(x1, y0, h)])
    + poly(`${cls} top`, [P(x0, y0, h), P(x1, y0, h), P(x1, y1, h), P(x0, y1, h)]);
}

/** Window or door on a wall that faces +y. */
const openingL = (x0, x1, y, z0, z1, cls) => poly(cls, [P(x0, y, z0), P(x1, y, z0), P(x1, y, z1), P(x0, y, z1)]);
/** Window or door on a wall that faces +x. */
const openingR = (x, y0, y1, z0, z1, cls) => poly(cls, [P(x, y0, z0), P(x, y1, z0), P(x, y1, z1), P(x, y0, z1)]);

function tree(x, y, kind) {
  const [bx, by] = P(x, y);
  if (kind === 'bush') return `<ellipse class="art-bush" cx="${bx.toFixed(1)}" cy="${(by - 8).toFixed(1)}" rx="17" ry="12"/>`;
  const tall = kind === 'tall';
  return `<path class="art-trunk" d="M${bx.toFixed(1)},${by.toFixed(1)}v-22"/>
    <ellipse class="art-tree" cx="${bx.toFixed(1)}" cy="${(by - (tall ? 46 : 36)).toFixed(1)}" rx="${tall ? 10 : 20}" ry="${tall ? 32 : 22}"/>`;
}

const dotted = (cls, points) => `<polyline class="${cls}" points="${pts(points)}"/>`;

/** Anchor points (in view box units) that callout chips attach to. */
export const ANCHORS = {
  house: { at: P(4.5, 3, 3.7), chip: [470, 60] },
  solar: { at: P(11, 7.9, 1.6), chip: [810, 474] },
  battery: { at: P(9.45, 8.6, 0.4), chip: [650, 612] },
  generator: { at: P(8.6, 8.6, 0.3), chip: [410, 612] },
  zone_01: { at: P(2.6, 8.4), chip: [130, 400] },
  zone_02: { at: P(6.8, 6.8), chip: [250, 502] },
};

export function propertyArt(label) {
  const ground = poly('art-ground-l', [P(0, 10), P(13, 10), P(13, 10, -0.5), P(0, 10, -0.5)])
    + poly('art-ground-r', [P(13, 0), P(13, 10), P(13, 10, -0.5), P(13, 0, -0.5)])
    + poly('art-ground', [P(0, 0), P(13, 0), P(13, 10), P(0, 10)])
    + poly('art-paving', [P(1.4, 4.9), P(9.9, 4.9), P(9.9, 6), P(1.4, 6)])
    + poly('art-paving', [P(8.2, 6), P(9.9, 6), P(9.9, 9.4), P(8.2, 9.4)])
    + poly('art-bed', [P(0.8, 7.4), P(4.6, 7.4), P(4.6, 9.3), P(0.8, 9.3)])
    + poly('art-bed', [P(5.4, 6.3), P(7.9, 6.3), P(7.9, 7.4), P(5.4, 7.4)]);

  // Main house with a gable roof, ridge running along x.
  const house = box(2, 1.5, 7, 4.5, 2.4, 'art-house')
    + poly('art-house wall-r', [P(7, 1.5), P(7, 4.5), P(7, 4.5, 2.4), P(7, 3, 3.5), P(7, 1.5, 2.4)])
    + poly('art-roof is-back', [P(1.8, 1.3, 2.3), P(7.2, 1.3, 2.3), P(7.2, 3, 3.55), P(1.8, 3, 3.55)])
    + poly('art-roof', [P(1.8, 4.7, 2.3), P(7.2, 4.7, 2.3), P(7.2, 3, 3.55), P(1.8, 3, 3.55)])
    + openingL(2.6, 3.4, 4.5, 0.9, 1.8, 'art-window')
    + openingL(4.2, 4.9, 4.5, 0, 1.6, 'art-door')
    + openingL(5.7, 6.5, 4.5, 0.9, 1.8, 'art-window');

  // Lower wing with a flat roof.
  const wing = box(7, 2.2, 9.6, 4.5, 1.6, 'art-house')
    + poly('art-flat', [P(7, 2.2, 1.6), P(9.6, 2.2, 1.6), P(9.6, 4.5, 1.6), P(7, 4.5, 1.6)])
    + openingL(7.6, 8.9, 4.5, 0, 1.3, 'art-window')
    + openingR(9.6, 2.8, 3.8, 0.6, 1.3, 'art-window');

  // Shed with a single-pitch roof that carries the solar panels.
  const shed = poly('art-house wall-l', [P(10, 8.8), P(12, 8.8), P(12, 8.8, 1.1), P(10, 8.8, 1.1)])
    + poly('art-house wall-r', [P(12, 7), P(12, 8.8), P(12, 8.8, 1.1), P(12, 7, 1.9)])
    + poly('art-roof', [P(9.9, 8.95, 1.05), P(12.1, 8.95, 1.05), P(12.1, 6.9, 1.95), P(9.9, 6.9, 1.95)])
    + poly('art-panel', [P(10.1, 8.7, 1.2), P(11.9, 8.7, 1.2), P(11.9, 7.1, 1.9), P(10.1, 7.1, 1.9)])
    + `<path class="art-panel-grid" d="M${pts([P(10.7, 8.7, 1.2)])}L${pts([P(10.7, 7.1, 1.9)])}M${pts([P(11.3, 8.7, 1.2)])}L${pts([P(11.3, 7.1, 1.9)])}M${pts([P(10.1, 7.9, 1.55)])}L${pts([P(11.9, 7.9, 1.55)])}"/>`;

  const cabinets = box(9.2, 8.1, 9.7, 8.6, 0.9, 'art-battery') + box(8.3, 8.1, 8.9, 8.6, 0.55, 'art-generator');

  const backTrees = [[0.8, 0.9, 'tall'], [10.6, 1.2, 'round'], [12.1, 2.6, 'tall'], [0.9, 3.2, 'round'], [11.4, 4.4, 'bush']].map((a) => tree(...a)).join('');
  const frontTrees = [[1, 6.4, 'tall'], [12.3, 5.6, 'round'], [5, 9.3, 'bush'], [6.6, 9.4, 'round'], [11.6, 9.6, 'bush'], [2.2, 9.6, 'bush']].map((a) => tree(...a)).join('');

  const water = dotted('art-water', [P(1.2, 8.4), P(4.4, 8.4), P(5.6, 6.9), P(7.8, 6.9)]);
  const [sx, sy] = [850, 96];
  const [px, py] = P(11, 7.9, 1.6);
  const [bx, by] = P(9.45, 8.35, 0.9);
  const sun = `<circle class="art-sun-halo" cx="${sx}" cy="${sy}" r="46"/><circle class="art-sun" cx="${sx}" cy="${sy}" r="22"/>
    <path class="art-sun-rays" d="M${sx},${sy - 34}v-10M${sx},${sy + 34}v10M${sx - 34},${sy}h-10M${sx + 34},${sy}h10M${sx - 24},${sy - 24}l-7,-7M${sx + 24},${sy - 24}l7,-7M${sx - 24},${sy + 24}l-7,7M${sx + 24},${sy + 24}l7,7"/>`;
  const flows = `<path class="art-flow" d="M${sx},${sy + 28}Q${sx - 10},${(sy + py) / 2} ${px.toFixed(1)},${py.toFixed(1)}"/>
    <path class="art-flow is-store" d="M${px.toFixed(1)},${py.toFixed(1)}L${bx.toFixed(1)},${by.toFixed(1)}"/>`;
  const leaders = Object.values(ANCHORS).map(({ at, chip }) => `<path class="art-leader" d="M${at[0].toFixed(1)},${at[1].toFixed(1)}L${chip[0]},${chip[1]}"/><circle class="art-leader-dot" cx="${at[0].toFixed(1)}" cy="${at[1].toFixed(1)}" r="3"/>`).join('');

  return `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${label}">${ground}${water}${backTrees}${house}${wing}${shed}${cabinets}${frontTrees}${flows}${leaders}${sun}</svg>`;
}

export const chipStyle = (key) => `left:${percent(ANCHORS[key].chip[0], W)};top:${percent(ANCHORS[key].chip[1], H)}`;
