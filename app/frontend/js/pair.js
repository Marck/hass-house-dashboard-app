// The two pages a visitor sees before signing in: the choice between signing in
// and pairing (welcome.html), and the pairing screen of a wall tablet
// (pair.html). Standalone: it loads nothing from the dashboard, which needs a
// session.

const TEXT = {
  en: {
    title: 'Home dashboard', choose: 'How do you want to sign in?',
    person: 'Sign in', personHelp: 'With your own account. For phones and computers.',
    pair: 'Pair this device', pairHelp: 'For a wall tablet: someone who is signed in approves it once.',
    steps: 'On a phone or computer where you are signed in, open Settings, Devices, and enter this code:',
    waiting: 'Waiting for approval. The code is valid for {min} more minutes.',
    expired: 'The code has expired.', again: 'New code', back: 'Back',
    failed: 'No code could be made. Check the connection and try again.', done: 'Approved. Opening the dashboard…',
  },
  nl: {
    title: 'Thuisdashboard', choose: 'Hoe wil je inloggen?',
    person: 'Inloggen', personHelp: 'Met je eigen account. Voor telefoons en computers.',
    pair: 'Dit apparaat koppelen', pairHelp: 'Voor een tablet aan de muur: iemand die is ingelogd keurt het één keer goed.',
    steps: 'Open op een telefoon of computer waarop je bent ingelogd Instellingen, Apparaten, en vul deze code in:',
    waiting: 'Wacht op goedkeuring. De code is nog {min} minuten geldig.',
    expired: 'De code is verlopen.', again: 'Nieuwe code', back: 'Terug',
    failed: 'Er kon geen code worden gemaakt. Controleer de verbinding en probeer het opnieuw.', done: 'Goedgekeurd. Het dashboard wordt geopend…',
  },
};

const lang = /^nl\b/i.test(navigator.language || '') ? 'nl' : 'en';
const t = (key, vars = {}) => TEXT[lang][key].replace(/\{(\w+)\}/g, (_, k) => String(vars[k]));
document.documentElement.lang = lang;
if (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) document.documentElement.dataset.theme = 'dark';
document.querySelectorAll('[data-t]').forEach((el) => { el.textContent = t(el.dataset.t); });
if (document.querySelector('[data-pair]')) document.title = t('pair');

const POLL_MS = 3000;
const $ = (id) => document.getElementById(id);
let timer = null;

/** "ABCDEFGH" shown as "ABCD EFGH", easier to read off a wall. */
export const formatCode = (code) => `${code.slice(0, 4)} ${code.slice(4)}`;

function show(status, code) {
  $('status').textContent = status;
  if (code !== undefined) $('code').textContent = code || ' ';
}

async function start() {
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
    show(t('failed'), '');
    $('again').hidden = false;
    return;
  }
  const until = Date.now() + reply.expiresIn * 1000;
  show(t('waiting', { min: Math.ceil(reply.expiresIn / 60) }), formatCode(reply.code));
  poll(until);
}

async function poll(until) {
  let status = 'pending';
  try {
    const res = await window.fetch('/auth/pair/poll', { credentials: 'same-origin', cache: 'no-store' });
    status = res.ok ? (await res.json()).status : 'pending';
  } catch {
    // A dropped connection is retried at the next poll.
  }
  if (status === 'approved') {
    show(t('done'));
    window.location.replace('/');
    return;
  }
  if (status === 'expired' || Date.now() >= until) {
    show(t('expired'), '');
    $('again').hidden = false;
    return;
  }
  show(t('waiting', { min: Math.max(1, Math.ceil((until - Date.now()) / 60000)) }));
  timer = setTimeout(() => poll(until), POLL_MS);
}

if (document.querySelector('[data-pair]')) {
  $('again').addEventListener('click', start);
  start();
}
