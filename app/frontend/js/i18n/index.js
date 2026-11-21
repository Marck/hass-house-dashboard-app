import en from './en.js';
import nl from './nl.js';
import { esc } from '../util.js';

export const LANGS = ['en', 'nl'];
export const dictionaries = { en, nl };

const LOCALES = { en: 'en-GB', nl: 'nl-NL' };

/** Keys that were requested but not found. Tests assert this stays empty. */
export const missing = new Set();

function lookup(lang, key) {
  const value = dictionaries[lang][key];
  if (value === undefined) {
    missing.add(`${lang}:${key}`);
    return `[${key}]`;
  }
  return value;
}

const fill = (text, params, wrap) => text.replace(/\{(\w+)\}/g, (match, name) => (name in params ? wrap(params[name]) : match));

/**
 * Build the translation and formatting helpers for one language.
 * t and tn return HTML-escaped text, tx returns raw text for use as a
 * parameter of another call, rich wraps parameters in <b>.
 */
export function createI18n(lang) {
  const locale = LOCALES[lang];
  const formats = {};
  const num = (value, digits = 0) => {
    if (!formats[digits]) {
      formats[digits] = new Intl.NumberFormat(locale, { minimumFractionDigits: digits, maximumFractionDigits: digits });
    }
    return formats[digits].format(value);
  };
  const plural = new Intl.PluralRules(locale);
  const clock = new Intl.DateTimeFormat(locale, { hour: '2-digit', minute: '2-digit', hour12: false });
  const day = new Intl.DateTimeFormat(locale, { weekday: 'short' });

  // A key can also be a literal name from Home Assistant ({ text }), shown as is.
  const tx = (key, params = {}) => (key && typeof key === 'object' ? String(key.text) : fill(lookup(lang, key), params, String));
  const t = (key, params = {}) => esc(tx(key, params));
  const tn = (key, count, params = {}) => t(`${key}.${plural.select(count)}`, { n: num(count), ...params });
  const rich = (key, params = {}) => fill(esc(lookup(lang, key)), params, (value) => `<b>${esc(value)}</b>`);

  return {
    lang,
    locale,
    t,
    tx,
    tn,
    rich,
    num,
    temp: (value, digits = 1) => `${num(value, digits)}°`,
    unit: (value, unit, digits = 0) => `${num(value, digits)}\u00a0${unit}`,
    pct: (value, digits = 0) => `${num(value, digits)}%`,
    /** An amount in the currency the entity reports; never a fixed currency. */
    money: (value, currency) => {
      try {
        return new Intl.NumberFormat(locale, { style: 'currency', currency }).format(value);
      } catch (err) {
        return currency ? `${num(value, 2)} ${currency}` : num(value, 2);
      }
    },
    // 4 January 2026 is a Sunday, which makes weekday(0) Sunday.
    time: (hours, minutes) => clock.format(new Date(2026, 0, 4, hours, minutes)),
    weekday: (index) => day.format(new Date(2026, 0, 4 + index)),
  };
}
