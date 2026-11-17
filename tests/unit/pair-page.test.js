import { test } from 'node:test';
import assert from 'node:assert/strict';
import { TEXT, pickLang, waitingText, formatCode } from '../../app/frontend/js/pair.js';

test('the sign-in pages use the language stored by the dashboard, else the browser', () => {
  assert.equal(pickLang({ lang: 'en' }, 'nl-NL'), 'en');
  assert.equal(pickLang({ lang: 'nl' }, 'en-US'), 'nl');
  assert.equal(pickLang({}, 'nl-BE'), 'nl');
  assert.equal(pickLang({ lang: 'fr' }, 'en-GB'), 'en');
  assert.equal(pickLang(null, undefined), 'en');
});

test('one minute left reads as singular, more as plural', () => {
  assert.match(waitingText('nl', 1), /1 minuut geldig/);
  assert.match(waitingText('en', 1), /1 more minute\./);
  assert.match(waitingText('nl', 3), /3 minuten geldig/);
  assert.match(waitingText('en', 3), /3 more minutes\./);
});

test('both languages have the same texts', () => {
  assert.deepEqual(Object.keys(TEXT.nl).sort(), Object.keys(TEXT.en).sort());
});

test('the code is split in two halves', () => {
  assert.equal(formatCode('ABCDEFGH'), 'ABCD EFGH');
});
