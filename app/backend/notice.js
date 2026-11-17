// The page for anything the server answers itself to a browser: signed out,
// sign-in failed, not found, an error. It looks like the welcome page (same
// card, stylesheet and EN/NL switch) so no page of the site is unstyled.
// English is rendered here and pair.js translates. The keys are fixed strings
// from the backend; nothing from the request goes in.
import { TEXT } from '../frontend/js/pair.js';

export const NOTICE_CSP = "default-src 'none'; script-src 'self'; style-src 'self'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'";

/** title and body are TEXT keys; the button goes to href with the text of the link key. */
export function notice(title, body, { link = 'signInAgain', href = '/welcome.html' } = {}) {
  for (const key of [title, body, link]) if (!TEXT.en[key]) throw new Error(`notice: unknown text ${key}`);
  return `<!doctype html>
<html lang="en" data-theme="light">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
  <meta name="robots" content="noindex, nofollow">
  <title>${TEXT.en[title]}</title>
  <link rel="stylesheet" href="/css/tokens.css">
  <link rel="stylesheet" href="/css/pair.css">
</head>
<body>
  <main class="card">
    <div class="langs" id="langs" role="group" aria-label="Language">
      <button type="button" data-lang="en" aria-pressed="false">EN</button>
      <button type="button" data-lang="nl" aria-pressed="false">NL</button>
    </div>
    <h1 data-t="${title}">${TEXT.en[title]}</h1>
    <p class="muted" data-t="${body}">${TEXT.en[body]}</p>
    <a class="btn primary" href="${href}"><b data-t="${link}">${TEXT.en[link]}</b></a>
  </main>
  <script type="module" src="/js/pair.js"></script>
</body>
</html>`;
}
