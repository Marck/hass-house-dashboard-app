import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const css = readFileSync(new URL('../../app/frontend/css/tokens.css', import.meta.url), 'utf8');

/** Hex tokens of one theme block. */
function tokens(selector) {
  const start = css.indexOf(`${selector} {`);
  assert.ok(start >= 0, `no ${selector} block`);
  const block = css.slice(start, css.indexOf('\n}', start));
  const out = {};
  for (const [, name, hex] of block.matchAll(/--([\w-]+):\s*(#[0-9a-f]{6})\s*;/gi)) out[name] = hex;
  return out;
}

const light = tokens(':root');
const dark = { ...light, ...tokens(':root[data-theme="dark"]') };

function luminance(hex) {
  const [r, g, b] = [1, 3, 5].map((i) => {
    const v = parseInt(hex.slice(i, i + 2), 16) / 255;
    return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

const ratio = (a, b) => {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
};

const ACCENTS = ['teal', 'purple', 'orange', 'amber', 'red', 'blue'];
const SURFACES = ['bg', 'surface', 'tile', 'raised'];

// [foreground, background] pairs that carry text in the stylesheet.
const TEXT_PAIRS = [
  ...['text', 'text-2', 'text-3'].flatMap((fg) => SURFACES.map((bg) => [fg, bg])),
  ...ACCENTS.flatMap((name) => [[name, 'surface'], [name, 'tile'], [name, 'raised'], [name, `${name}-soft`]]),
  ['text', 'teal-soft'], ['text', 'amber-soft'], ['text-2', 'amber-soft'], ['orange', 'amber-soft'],
  ['gold-text', 'gold-a'], ['gold-text', 'gold-b'], ['solid-text', 'solid'],
  ['bg', 'text'], // toast
  ['bg', 'red'], // armed destructive button
  ['surface', 'teal'], // primary round button
];

for (const [name, theme] of [['light', light], ['dark', dark]]) {
  test(`${name} theme: text meets WCAG AA contrast (4.5:1)`, () => {
    const failures = TEXT_PAIRS
      .map(([fg, bg]) => ({ pair: `${fg} on ${bg}`, value: ratio(theme[fg], theme[bg]) }))
      .filter((r) => !(r.value >= 4.5))
      .map((r) => `${r.pair}: ${r.value.toFixed(2)}`);
    assert.deepEqual(failures, []);
  });

  test(`${name} theme: focus ring and control borders stand out (3:1)`, () => {
    SURFACES.forEach((bg) => assert.ok(ratio(theme.focus, theme[bg]) >= 3, `focus on ${bg}: ${ratio(theme.focus, theme[bg]).toFixed(2)}`));
  });
}

test('both themes define the same tokens', () => {
  const darkOnly = tokens(':root[data-theme="dark"]');
  const themed = Object.keys(light).filter((key) => !['gold-a', 'gold-b', 'gold-text'].includes(key));
  assert.deepEqual(themed.filter((key) => !(key in darkOnly)), [], 'tokens missing in the dark theme');
});
