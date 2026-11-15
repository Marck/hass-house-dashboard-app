# Security and privacy

This repository is public. Treat everything in it, including history, issues, pull requests and CI logs, as published.

## Never in the repository

- Names of people, the household or its location.
- Real floor plans, photos, reference screenshots or network layouts.
- IP or MAC addresses, host names, real Home Assistant area or entity ids, raw registry or `ha-mcp` output.
- Tokens, passwords, API keys, cookies, kubeconfigs.
- An exported dashboard configuration (`dashboard-config*.json` is ignored by git).

Use synthetic labels and generated ids such as `room_01`, `area_01` and `dev_01`. If you are unsure whether something identifies the household, leave it out.

## What Phase 1 does

- It makes no network requests. The page's Content-Security-Policy sets `connect-src 'none'`, allows scripts and styles from the same origin only, and forbids inline styles and scripts.
- All data is synthetic and lives in `app/frontend/js/fixtures/synthetic.js`.
- It stores two things in the browser's `localStorage`: the language and theme preference, and the dashboard configuration. The configuration holds the names you typed and the ids you linked. It stays in that browser and is sent nowhere.
- An export is a file with that same configuration. Keep it private.
- Names you type are escaped on output and capped in length. An imported file is validated as a whole before it replaces anything.

## Checks

`npm run privacy` (part of `scripts/verify.sh` and of CI) scans every file for IPv4 and MAC addresses, email addresses, access tokens, private keys, credential assignments, private host names and em dashes. It reports the file and line only, never the matched text.

Before every push:

1. Run `scripts/verify.sh`.
2. Read the diff once with the list above in mind. The script cannot recognize a name.
3. Check that screenshots, if any, show the demo data and no typed names.

CI does not print environment variables and has read-only repository permissions.

## From Phase 2 on

- The Home Assistant token is held by the backend only. The browser never receives it.
- The backend sends the browser normalized data, not raw payloads.
- Commands are allowlisted service calls.
- Logs contain no entity ids, names, tokens or identity headers.

## Reporting a problem

If you find private data in this repository, do not open a public issue that repeats it. Contact the repository owner privately through GitHub.
