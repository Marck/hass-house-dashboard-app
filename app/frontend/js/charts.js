// Lightweight SVG chart builders. They return markup strings and use CSS
// classes for colour, so both themes and a strict CSP work without inline styles.
import { clamp } from './util.js';

function scale(values, w, h, pad, lo, hi) {
  const min = lo ?? Math.min(...values);
  const max = hi ?? Math.max(...values);
  const span = max - min || 1;
  const step = (w - pad * 2) / Math.max(1, values.length - 1);
  return values.map((v, i) => [pad + i * step, h - pad - ((v - min) / span) * (h - pad * 2)]);
}

const toPath = (points) => points.map(([x, y], i) => `${i ? 'L' : 'M'}${x.toFixed(1)},${y.toFixed(1)}`).join('');

export function sparkline(values, { w = 300, h = 80, lo, hi, cls = '', label = '' } = {}) {
  const points = scale(values, w, h, 8, lo, hi);
  const [lx, ly] = points[points.length - 1];
  return `<svg class="chart ${cls}" viewBox="0 0 ${w} ${h}" role="img" aria-label="${label}">
    <path class="chart-line" d="${toPath(points)}"/>
    <circle class="chart-halo" cx="${lx.toFixed(1)}" cy="${ly.toFixed(1)}" r="12"/>
    <circle class="chart-dot" cx="${lx.toFixed(1)}" cy="${ly.toFixed(1)}" r="4"/>
  </svg>`;
}

/** Ping history with a dashed reference line. */
export function pingChart(values, limit, { label = '', limitLabel = '' } = {}) {
  const w = 900;
  const h = 150;
  const hi = Math.max(limit * 1.3, ...values);
  const points = scale(values, w, h, 6, 0, hi);
  const ly = h - 6 - (limit / hi) * (h - 12);
  return `<svg class="chart chart-wide" viewBox="0 0 ${w} ${h}" preserveAspectRatio="none" role="img" aria-label="${label}">
    <path class="chart-ref" d="M0,${ly.toFixed(1)}H${w}" vector-effect="non-scaling-stroke"/>
    <path class="chart-line" d="${toPath(points)}" vector-effect="non-scaling-stroke"/>
  </svg><span class="chart-ref-label">${limitLabel}</span>`;
}

/** State of charge over a day: area up to "now" plus a dashed threshold. */
export function socChart(values, until, threshold, { label = '' } = {}) {
  const w = 720;
  const h = 130;
  const y = (v) => h - 6 - (v / 100) * (h - 12);
  const xEnd = (until / 24) * w;
  const points = values.map((v, i) => [(i / (values.length - 1)) * xEnd, y(v)]);
  const [lx, ly] = points[points.length - 1];
  const line = toPath(points);
  return `<svg class="chart chart-soc" viewBox="0 0 ${w} ${h}" role="img" aria-label="${label}">
    <defs><linearGradient id="soc-fill" x1="0" y1="0" x2="0" y2="1"><stop class="stop-teal-a" offset="0"/><stop class="stop-teal-b" offset="1"/></linearGradient></defs>
    <path class="chart-area" fill="url(#soc-fill)" d="${line}L${lx.toFixed(1)},${h}L0,${h}Z"/>
    <path class="chart-threshold" d="M0,${y(threshold).toFixed(1)}H${w}"/>
    <path class="chart-line" d="${line}"/>
    <circle class="chart-halo" cx="${lx.toFixed(1)}" cy="${ly.toFixed(1)}" r="16"/>
    <circle class="chart-dot" cx="${lx.toFixed(1)}" cy="${ly.toFixed(1)}" r="5"/>
  </svg>`;
}

/** Concentric progress rings. rings: [{ value 0..100, cls }]. */
export function rings(rings, { label = '' } = {}) {
  const size = 220;
  const c = size / 2;
  const body = rings.map((ring, i) => {
    const r = 96 - i * 24;
    const len = 2 * Math.PI * r;
    const part = (clamp(ring.value, 0, 100) / 100) * len;
    return `<circle class="ring-track" cx="${c}" cy="${c}" r="${r}"/>
      <circle class="ring-value ${ring.cls}" cx="${c}" cy="${c}" r="${r}" stroke-dasharray="${part.toFixed(1)} ${len.toFixed(1)}" transform="rotate(-90 ${c} ${c})"/>`;
  }).join('');
  return `<svg class="rings" viewBox="0 0 ${size} ${size}" role="img" aria-label="${label}">${body}</svg>`;
}

/** Weekly outage bars. A day without outages gets a short dash instead of a bar. */
export function outageBars(values, labels) {
  const w = 420;
  const h = 96;
  const max = Math.max(1, ...values);
  const slot = w / values.length;
  const bars = values.map((v, i) => {
    const x = i * slot + slot / 2;
    if (!v) return `<rect class="bar-none" x="${(x - 16).toFixed(1)}" y="${h - 24}" width="32" height="4" rx="2"/>`;
    const bh = 14 + (v / max) * 44;
    return `<rect class="bar-out" x="${(x - 16).toFixed(1)}" y="${(h - 20 - bh).toFixed(1)}" width="32" height="${bh.toFixed(1)}" rx="8"/>`;
  }).join('');
  const text = labels.map((l, i) => `<text class="chart-text" x="${(i * slot + slot / 2).toFixed(1)}" y="${h - 2}" text-anchor="middle">${l}</text>`).join('');
  return `<svg class="chart chart-bars" viewBox="0 0 ${w} ${h}" aria-hidden="true" focusable="false">${bars}${text}</svg>`;
}

/** Horizontal meter, used for data volume and consumer shares. */
export function meter(value, max, cls = '') {
  const pct = clamp((value / max) * 100, 0, 100);
  return `<svg class="meter ${cls}" viewBox="0 0 100 4" preserveAspectRatio="none" aria-hidden="true" focusable="false">
    <rect class="meter-track" width="100" height="4" rx="2"/><rect class="meter-value" width="${pct.toFixed(1)}" height="4" rx="2"/></svg>`;
}

/** Upright battery with a fill level and two dashed markers. */
export function batteryArt(soc, markers, uid = 'home') {
  const top = 26;
  const height = 190;
  const fill = (clamp(soc, 0, 100) / 100) * (height - 16);
  const marks = markers.map((m) => {
    const y = top + 8 + (height - 16) * (1 - m / 100);
    return `<path class="batt-mark" d="M18,${y.toFixed(1)}H102"/><text class="chart-text" x="24" y="${(y - 5).toFixed(1)}">${m}</text>`;
  }).join('');
  return `<svg class="batt-art" viewBox="0 0 120 226" aria-hidden="true" focusable="false">
    <defs><linearGradient id="batt-fill-${uid}" x1="0" y1="0" x2="0" y2="1"><stop class="stop-teal-c" offset="0"/><stop class="stop-teal-d" offset="1"/></linearGradient></defs>
    <rect class="batt-cap" x="44" y="8" width="32" height="20" rx="6"/>
    <rect class="batt-shell" x="8" y="${top - 6}" width="104" height="${height + 12}" rx="30"/>
    <rect class="batt-level" fill="url(#batt-fill-${uid})" x="16" y="${(top + height - 8 - fill).toFixed(1)}" width="88" height="${fill.toFixed(1)}" rx="24"/>
    ${marks}
  </svg>`;
}

/** Sun path arc for the "tonight" card. progress 0..1 along the day. */
export function sunArc(progress) {
  const p = clamp(progress, 0, 1);
  const angle = Math.PI * (1 - p);
  const x = 150 + Math.cos(angle) * 120;
  const y = 78 - Math.sin(angle) * 62;
  return `<svg class="sun-arc" viewBox="0 0 300 86" aria-hidden="true" focusable="false">
    <path class="arc-path" d="M30,78A120,62 0 0 1 270,78"/><path class="arc-base" d="M20,78H280"/>
    <circle class="arc-sun" cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="7"/>
  </svg>`;
}

/**
 * Thermostat scale: tick marks that grow near the target, a baseline that
 * bulges under the handle, and a marker for the current temperature.
 */
export function thermoScale(c, f, nowLabel, uid) {
  const w = 400;
  const x = (v) => 24 + ((v - c.min) / (c.max - c.min)) * 352;
  const xt = x(c.target);
  const base = 84;
  const bump = (px) => base - 26 * Math.exp(-(((px - xt) / 30) ** 2));
  let ticks = '';
  for (let v = c.min; v <= c.max; v += 1) {
    const tall = 6 + 22 * Math.exp(-(((v - c.target) / 1.8) ** 2));
    const y = bump(x(v)) - 8;
    ticks += `<path class="thermo-tick" d="M${x(v).toFixed(1)},${y.toFixed(1)}v${(-tall).toFixed(1)}"/>`;
  }
  let curve = '';
  for (let px = 12; px <= w - 12; px += 4) curve += `${px === 12 ? 'M' : 'L'}${px},${bump(px).toFixed(1)}`;
  let labels = '';
  for (let v = c.min; v <= c.max; v += 2) {
    if (Math.abs(v - c.target) >= 1.5) labels += `<text class="chart-text" x="${x(v).toFixed(1)}" y="14" text-anchor="middle">${f.num(v)}</text>`;
  }
  const xc = x(clamp(c.current, c.min, c.max));
  const anchor = xc < 60 ? 'start' : xc > w - 60 ? 'end' : 'middle';
  return `<svg class="thermo" viewBox="0 0 ${w} 112" aria-hidden="true" focusable="false">
    <defs><linearGradient id="thermo-glow-${uid}" gradientUnits="userSpaceOnUse" x1="${(xt - 90).toFixed(1)}" y1="0" x2="${(xt + 90).toFixed(1)}" y2="0">
      <stop class="stop-accent-0" offset="0"/><stop class="stop-accent-1" offset="0.5"/><stop class="stop-accent-0" offset="1"/></linearGradient></defs>
    ${labels}<text class="thermo-target" x="${xt.toFixed(1)}" y="16" text-anchor="middle">${f.temp(c.target)}</text>
    ${ticks}<path class="thermo-base" d="${curve}"/><path class="thermo-glow" stroke="url(#thermo-glow-${uid})" d="${curve}"/>
    <circle class="thermo-now" cx="${xc.toFixed(1)}" cy="${bump(xc).toFixed(1)}" r="5.5"/>
    <text class="chart-text" x="${xc.toFixed(1)}" y="108" text-anchor="${anchor}">${nowLabel}</text>
    <circle class="thermo-handle" cx="${xt.toFixed(1)}" cy="${(base - 26).toFixed(1)}" r="15"/>
    <path class="thermo-grip" d="M${(xt - 3).toFixed(1)},${base - 31}l-5,5 5,5zM${(xt + 3).toFixed(1)},${base - 31}l5,5 -5,5z"/>
  </svg>`;
}
