const ENTITIES = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };

/** Escape a value for safe use in HTML text and attribute values. */
export const esc = (value) => String(value).replace(/[&<>"']/g, (ch) => ENTITIES[ch]);

export const clamp = (value, lo, hi) => Math.min(hi, Math.max(lo, value));

/** Small deterministic PRNG (mulberry32) so demo series are stable between runs. */
export function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Format a list of [x, y] points for an SVG points attribute. */
export const pts = (list) => list.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(' ');
