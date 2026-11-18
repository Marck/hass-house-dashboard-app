import { icon, FLAGS } from '../icons.js';
import { LANGS } from '../i18n/index.js';
import { MODES, SUN_STATES } from '../theme.js';
import { netViews } from '../config.js';
import { act, seg, canEditConfig } from './parts.js';
import { editBar } from './editor.js';
import { lockFloat } from './lock.js';

const NAV = [['home', 'home'], ['energy', 'bolt'], ['network', 'network']];

function langMenu({ s, t }) {
  const items = LANGS.map((lang) => {
    const on = s.lang === lang;
    const code = lang.toUpperCase();
    return `<button type="button" class="menu-item${on ? ' is-on' : ''}" aria-pressed="${on}" aria-label="${code}, ${t(`lang.name.${lang}`)}" ${act('lang', lang)}>${FLAGS[lang]}<span>${code}</span>${on ? icon('check') : ''}</button>`;
  }).join('');
  return `<div class="menu" role="group" aria-label="${t('lang.button')}">${items}</div>`;
}

function themeMenu({ s, t }) {
  const { mode, manual } = s.theme;
  const modes = MODES.map((id) => `<button type="button" class="menu-item mode${mode === id ? ' is-on' : ''}" role="radio" aria-checked="${mode === id}" ${act('theme-mode', id)}>
    <span class="radio"></span><span class="mode-text"><b>${t(`theme.mode.${id}`)}</b><small>${t(`theme.desc.${id}`)}</small></span></button>`).join('');
  let extra = '';
  if (mode === 'manual') {
    extra = seg(t('theme.manual.label'), ['light', 'dark'].map((v) => ({ label: t(`theme.${v}`), icon: v === 'light' ? 'sun' : 'moon', on: manual === v, attrs: act('theme-manual', v) })), 'seg-full');
  }
  if (mode === 'auto') {
    extra = `<p class="menu-note">${t('theme.sun.title')}</p>
      ${seg(t('theme.sun.title'), SUN_STATES.map((v) => ({ label: t(`theme.sun.${v}`), on: s.sun === v, attrs: act('sun', v) })), 'seg-full')}
      ${s.sun === 'unavailable' ? `<p class="menu-note is-warn">${t('theme.sun.fallback')}</p>` : ''}`;
  }
  return `<div class="menu menu-wide"><p class="menu-title">${t('theme.title')}</p>
    <div role="radiogroup" aria-label="${t('theme.title')}">${modes}</div>${extra}</div>`;
}

export function shell(c, body, overlay) {
  const { s, cfg, t } = c;
  // The network screen exists only while a network source is configured.
  const nav = NAV.filter(([id]) => id !== 'network' || netViews(cfg).length)
    .map(([id, ic]) => `<a class="seg-item${s.view === id ? ' is-on' : ''}" href="#/${id}"${s.view === id ? ' aria-current="page"' : ''} data-fid="nav:${id}">${icon(ic)}<span>${t(`nav.${id}`)}</span></a>`).join('');
  const hidden = overlay ? ' aria-hidden="true"' : '';
  // While the child lock is on the bar is empty: the lock itself floats (lockFloat).
  const editLayout = canEditConfig(s) ? `<button type="button" class="btn btn-compact${s.edit ? ' is-on' : ''}" aria-pressed="${s.edit}" aria-label="${t('layout.edit')}" ${act('edit-layout')}>${icon('edit')}<span>${t('layout.edit')}</span></button>` : '';
  const actions = s.locked ? '' : `${editLayout}
        <div class="menu-root" data-menu-root>
          <button type="button" class="btn" aria-haspopup="true" aria-expanded="${s.menu === 'lang'}" ${act('menu', 'lang')}>${icon('globe')}<span>${t('lang.button')}</span></button>
          ${s.menu === 'lang' ? langMenu(c) : ''}
        </div>
        <div class="menu-root" data-menu-root>
          <button type="button" class="btn btn-compact" aria-haspopup="true" aria-expanded="${s.menu === 'theme'}" aria-label="${t('theme.button')}" ${act('menu', 'theme')}>${icon('theme')}<span>${t('theme.button')}</span></button>
          ${s.menu === 'theme' ? themeMenu(c) : ''}
        </div>
        <button type="button" class="icon-btn" aria-label="${t('settings.title')}" ${act('settings')}>${icon('gear')}</button>
`;
  return `<div class="page"${hidden}>
    <a class="skip" href="#main">${t('a11y.skip')}</a>
    <header class="top">
      <nav class="seg nav" aria-label="${t('nav.label')}">${nav}</nav>
      <div class="top-actions">
        <span class="chip chip-demo">${t('mock.badge')}</span>
        ${actions}
      </div>
    </header>
    ${s.edit && !s.locked ? editBar(c) : ''}
    <main id="main" tabindex="-1">${body}</main>
  </div>${overlay}${lockFloat(c)}`;
}
