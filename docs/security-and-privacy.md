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

- It makes no requests to anything but its own backend. The page's Content-Security-Policy sets `connect-src 'self'` (`'none'` until Phase 2), allows scripts and styles from the same origin only, and forbids inline styles and scripts.
- All data is synthetic and lives in `app/frontend/js/fixtures/synthetic.js`.
- It stores two things in the browser's `localStorage`: the language and theme preference, and the dashboard configuration. The configuration holds the names you typed and the ids you linked. Without sign-in it stays in that browser and is sent nowhere. With sign-in (OIDC) the backend keeps the household's copy in `DATA_DIR/config.json` (mode 600) and the browser a cache; only a signed-in person may change it, a paired device reads it, and a save based on an older version is refused.
- It also stores the child lock settings of that device, separately. They are never part of an export. The PIN is kept as a short fingerprint, not as digits.
- The child lock is an accident guard for a wall tablet, not a security control: it runs in the browser and anyone who can open the browser's settings can remove it. Access control is the job of the login in front of the dashboard (Phase 3).
- `scripts/serve.py` can make the demo reachable on the internal network for device testing. Never serve a live backend that way.
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

## Audit 2026-11-23

Checked without reproducing any value. This summary follows the rule of plan section 7.4: it says what was checked and the result, not how a weakness worked. The detailed notes are kept outside the repository.

| Check | Result |
|---|---|
| Token in frontend code | Verified: no frontend file handles a token or the Home Assistant address |
| Token in API responses and the live stream | Verified after a fix on 2026-11-23 (#35): credential-bearing attributes are filtered, with a test |
| Logs | Verified: the code logs error names and codes only; the running pod's log holds connection events only |
| Sessions and pairing | Verified: random ids stored hashed, `__Host-` cookies with `HttpOnly`, `Secure`, `SameSite=Lax`, short-lived pairing codes with a guess limit. A removed device's open stream ends at once since #35 |
| Public images | Verified: all 19 published versions scanned for credential files and token patterns (with a planted control); none found. Their environment sets demo mode only |
| Export and import | Verified: no credentials; the child lock is left out. An export identifies the household, so keep it private |
| Error messages | Verified: generic errors; startup errors name a setting, never its value |
| Git history, pull requests, CI | Verified: every commit on every branch, all pull request texts and comments, and all CI logs scanned; no credential. Two deliberate test values only (a labelled test token, a documentation address) |
| Personal and account references | Removed from the current documentation on 2026-11-23. Older commits and two pull request descriptions mentioned a private application's name; no credential, so history is not rewritten |
| Exposed credential to rotate | None found |

## Demo isolation

The demo cannot read Home Assistant. Verified 2026-11-23 with the public image, and kept true by a test (`tests/backend/demo.test.js`):

- With any `HASS_` or `HOME_ASSISTANT_` setting the backend refuses to start, before it opens any connection, even when a Home Assistant is reachable and the token is valid.
- In demo mode every Home Assistant path of the API answers 404 and `/api/info` says `demo`.
- The page may only connect to its own backend (`connect-src 'self'`), so a browser cannot reach Home Assistant either.
- There is no hosted public demo. The only deployment is the private, sign-in protected preview.

## Reporting a problem

If you find private data in this repository, do not open a public issue that repeats it. Contact the repository owner privately through GitHub.
