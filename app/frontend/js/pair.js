// The pages a visitor sees before signing in: the choice between signing in
// and pairing (welcome.html), the pairing screen of a wall tablet (pair.html)
// and the notices the server renders (backend/notice.js: signed out, sign-in
// failed, not found, error). Standalone: it loads nothing from the dashboard, which needs a
// session. The language is shared with the dashboard through its stored
// preferences, so a choice made here is kept after signing in, and back.

export const TEXT = {
  en: {
    title: 'Home dashboard', choose: 'How do you want to sign in?',
    person: 'Sign in', personHelp: 'With your own account. For phones and computers.',
    pair: 'Pair this device', pairHelp: 'For a wall tablet: someone who is signed in approves it once.',
    steps: 'On a phone or computer where you are signed in, open Settings, Devices, and enter this code:',
    waiting: 'Waiting for approval. The code is valid for {min} more minutes.',
    waitingOne: 'Waiting for approval. The code is valid for 1 more minute.',
    expired: 'The code has expired.', again: 'New code', back: 'Back',
    failed: 'No code could be made. Check the connection and try again.', done: 'Approved. Opening the dashboard…',
    language: 'Language',
    signedOutTitle: 'Signed out', signedOutBody: 'You are signed out of the dashboard.',
    failedTitle: 'Sign-in failed', failedBody: 'The sign-in did not complete. Please try again.',
    signInAgain: 'Sign in',
    notFoundTitle: 'Page not found', notFoundBody: 'This page does not exist.',
    errorTitle: 'Something went wrong', errorBody: 'The page could not be loaded. Please try again.',
    toDashboard: 'To the dashboard',
  },
  nl: {
    title: 'Thuisdashboard', choose: 'Hoe wil je inloggen?',
    person: 'Inloggen', personHelp: 'Met je eigen account. Voor telefoons en computers.',
    pair: 'Dit apparaat koppelen', pairHelp: 'Voor een tablet aan de muur: iemand die is ingelogd keurt het één keer goed.',
    steps: 'Open op een telefoon of computer waarop je bent ingelogd Instellingen, Apparaten, en vul deze code in:',
    waiting: 'Wacht op goedkeuring. De code is nog {min} minuten geldig.',
    waitingOne: 'Wacht op goedkeuring. De code is nog 1 minuut geldig.',
    expired: 'De code is verlopen.', again: 'Nieuwe code', back: 'Terug',
    failed: 'Er kon geen code worden gemaakt. Controleer de verbinding en probeer het opnieuw.', done: 'Goedgekeurd. Het dashboard wordt geopend…',
    language: 'Taal',
    signedOutTitle: 'Uitgelogd', signedOutBody: 'Je bent uitgelogd van het dashboard.',
    failedTitle: 'Inloggen mislukt', failedBody: 'Het inloggen is niet gelukt. Probeer het opnieuw.',
    signInAgain: 'Inloggen',
    notFoundTitle: 'Pagina niet gevonden', notFoundBody: 'Deze pagina bestaat niet.',
    errorTitle: 'Er ging iets mis', errorBody: 'De pagina kon niet worden geladen. Probeer het opnieuw.',
    toDashboard: 'Naar het dashboard',
  },
};

const PREFS_KEY = 'hhd.prefs';
const LANGS = ['en', 'nl'];

/** The stored choice of the dashboard first, else the browser's language. */
export const pickLang = (prefs, browser) =>
  LANGS.includes(prefs && prefs.lang) ? prefs.lang : /^nl\b/i.test(browser || '') ? 'nl' : 'en';

export const translate = (lang, key, vars = {}) => TEXT[lang][key].replace(/\{(\w+)\}/g, (_, k) => String(vars[k]));

/** The waiting line with the right singular or plural. */
export const waitingText = (lang, min) => (min === 1 ? translate(lang, 'waitingOne') : translate(lang, 'waiting', { min }));

/** "ABCDEFGH" shown as "ABCD EFGH", easier to read off a wall. */
export const formatCode = (code) => `${code.slice(0, 4)} ${code.slice(4)}`;

function readPrefs() {
  try {
    return JSON.parse(window.localStorage.getItem(PREFS_KEY) || '{}') || {};
  } catch {
    return {};
  }
}

function savePrefs(prefs) {
  try {
    window.localStorage.setItem(PREFS_KEY, JSON.stringify(prefs));
  } catch {
    // Without storage the choice lasts until the page is left.
  }
}

if (typeof document !== 'undefined') {
  let lang = pickLang(readPrefs(), navigator.language);
  // The status line is kept as a function so it follows a change of language.
  let status = () => '';
  const t = (key, vars) => translate(lang, key, vars);
  const $ = (id) => document.getElementById(id);
  const pairing = Boolean(document.querySelector('[data-pair]'));

  const apply = () => {
    document.documentElement.lang = lang;
    document.querySelectorAll('[data-t]').forEach((el) => { el.textContent = t(el.dataset.t); });
    document.querySelectorAll('[data-lang]').forEach((el) => el.setAttribute('aria-pressed', String(el.dataset.lang === lang)));
    $('langs').setAttribute('aria-label', t('language'));
    document.title = t(document.querySelector('h1[data-t]').dataset.t);
    if (pairing) $('status').textContent = status();
  };

  if (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) document.documentElement.dataset.theme = 'dark';
  document.querySelectorAll('[data-lang]').forEach((el) => el.addEventListener('click', () => {
    lang = el.dataset.lang;
    savePrefs({ ...readPrefs(), lang });
    apply();
  }));
  apply();

  if (pairing) {
    const POLL_MS = 3000;
    let timer = null;

    const show = (next, code) => {
      status = next;
      $('status').textContent = status();
      if (code !== undefined) $('code').textContent = code || ' ';
    };

    const poll = async (until) => {
      let state = 'pending';
      try {
        const res = await window.fetch('/auth/pair/poll', { credentials: 'same-origin', cache: 'no-store' });
        state = res.ok ? (await res.json()).status : 'pending';
      } catch {
        // A dropped connection is retried at the next poll.
      }
      if (state === 'approved') {
        show(() => t('done'));
        window.location.replace('/');
        return;
      }
      if (state === 'expired' || Date.now() >= until) {
        show(() => t('expired'), '');
        $('again').hidden = false;
        return;
      }
      const min = Math.max(1, Math.ceil((until - Date.now()) / 60000));
      show(() => waitingText(lang, min));
      timer = setTimeout(() => poll(until), POLL_MS);
    };

    const start = async () => {
      clearTimeout(timer);
      $('again').hidden = true;
      let reply;
      try {
        const res = await window.fetch('/auth/pair/start', { method: 'POST', credentials: 'same-origin' });
        reply = res.ok ? await res.json() : null;
      } catch {
        reply = null;
      }
      if (!reply) {
        show(() => t('failed'), '');
        $('again').hidden = false;
        return;
      }
      const until = Date.now() + reply.expiresIn * 1000;
      const min = Math.ceil(reply.expiresIn / 60);
      show(() => waitingText(lang, min), formatCode(reply.code));
      poll(until);
    };

    $('again').addEventListener('click', start);
    start();
  }
}
