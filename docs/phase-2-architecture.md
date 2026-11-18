# Phase 2 architecture and breakdown

Status: approved 2026-11-17. The owner gave the go for Phase 2 and decided: OIDC sign-in (A5), a Node backend (A1), device sessions of 30 days (A7), and the Home Assistant account as the local sign-in instead of the dashboard's own accounts (A6). Steps 1 to 4 are built.

## Decisions

| # | Decision | Proposal | Why |
|---|---|---|---|
| A1 | Backend | One small Node service, one replica, as few dependencies as possible (step 1 has none) | Home Assistant's official WebSocket client supports Node; the backend reuses the frontend's configuration checks instead of a second copy; one toolchain for code and tests |
| A2 | Frontend | Stays the zero-dependency ES2021 frontend, served by the backend | Safari 15 already works; no build step to break it |
| A3 | Home Assistant access | A long-lived token of a dedicated, non-admin Home Assistant user, read by the backend from a Secret. Never sent to the browser | Requirement 2.1 |
| A4 | What may be controlled | An allow-list in the backend: per entity domain, the services the dashboard offers. Everything else is refused before it reaches Home Assistant | Home Assistant gives a non-admin user the same service access as an admin; it has no per-entity permissions in its UI (to verify against the running version). So the backend is the only place to limit commands |
| A5 | Sign-in | OIDC against authentik, done by the backend, instead of forward-auth at the ingress | See "Authentication" below: with forward-auth in front, a paired tablet would still need an authentik session, which is the problem pairing exists to solve |
| A6 | Second sign-in mode | Home Assistant account, for installations without an identity provider | The first-run setup offers it; no password store of our own |
| A7 | Tablet | Device pairing, with its own session of 30 days | Safari 15 login and session length, seen 2026-11-16 |
| A8 | Namespace | Its own namespace, as the preview | Verified: Home Assistant does not use host networking, so a policy on its namespace protects it; the cluster enforces NetworkPolicy (checked 2026-11-01, connection refused without an allow rule); the Home Assistant chart already admits named namespaces one by one |
| A9 | Speaker groups | Members configured by the user, as in the mock | Home Assistant does not expose Cast group members; inferring them would be a guess |
| A10 | Storage | JSON files with atomic replace on a small volume, single replica | A configuration, a few sessions and paired devices; no database needed. SQLite on the cluster's NFS volumes is avoided (file locking) |

## Environments

| | Mock / demo | Development | Production |
|---|---|---|---|
| Data | Synthetic, built into the image | Live Home Assistant | Live Home Assistant |
| Home Assistant credential | None. The build refuses one | Token of a dedicated dev user, local `.env` outside the repo | Token in a sealed Secret |
| Commands | Simulated | Off by default; a switch, only with the owner present | On, limited by the allow-list (A4) |
| Sign-in | OIDC by the backend (the preview, since 2026-11-17) | Local only, or proxy headers from a test proxy | OIDC or Home Assistant account, plus pairing |
| Where | Preview image in the cluster | The developer's machine, loopback only | Cluster |

The mode is fixed at startup and shown under Settings, About. A demo image contains no backend code that could talk to Home Assistant.

## Authentication

Until 2026-11-17 the dashboard was behind authentik forward-auth: Traefik asked authentik before every request. That suits a browser, but a tablet with a pairing session would still be stopped at Traefik when its authentik session ends (when Safari closes, by default). Pairing only helps if the dashboard decides who gets in.

Proposal:

- **People:** the backend sends them to authentik with OIDC (authorization code with PKCE), then sets its own session cookie. authentik's login on Safari 15 works through the simplified page that is already live. The chart's SSO mode becomes `oidc` with a blueprint, a pattern the helm-charts repo already supports.
- **Tablet:** the tablet shows a code valid for 5 minutes. A signed-in person approves it, naming the device. The tablet gets a device session (30 days, counted from its last use, so a tablet in daily use stays signed in), listed and revocable under Settings.
- **Cookies:** `HttpOnly`, `Secure`, `SameSite=Lax`, set by the server with `Max-Age`. Session ids are random, stored hashed. A device session can control what the allow-list permits, not change settings or approve other devices.
- **Lifetimes are separate:** authentik's session, the dashboard's person session (12 hours) and the device session are independent; ending one does not end the others, except that revoking a device ends its session at once.
- **Home Assistant account mode:** the backend uses Home Assistant's own login flow and keeps nothing but the user id.

To verify on the iPad Air 2 before relying on it: that a server-set cookie survives closing Safari and restarting the tablet, and still works after more than 7 days (Safari's tracking prevention limits some storage to 7 days; it should not apply to a first-party `HttpOnly` cookie, but that is to be measured, not assumed). Whether Home Assistant's login page renders on Safari 15 is also unverified.

## Network permissions (cluster)

| Direction | Allowed | Everything else |
|---|---|---|
| Inbound | Ingress controller to the backend port; Gatus to `/healthz` | Denied |
| Outbound | DNS; the Home Assistant Service on its API port; authentik for OIDC | Denied |
| Home Assistant side | Its namespace admits the dashboard namespace on the API port, like the existing allow rules for other apps | Unchanged |

The backend never takes a URL from a request to connect to. It has no proxy endpoint, so it cannot be used as a way into the internal network. Trust boundaries: the browser trusts nothing it is sent beyond display data; the backend trusts the browser only after a valid session; Home Assistant trusts the backend's token, limited by A4.

## Breakdown

Each step is one or a few small pull requests, merged only with green checks, and ends with something the owner can try.

1. **Backend skeleton** (done): serves the frontend with the same headers nginx did, `/healthz`, `/api/info`, the mode fixed at startup (demo only; it refuses to start with any Home Assistant setting). It replaces nginx in the image. The configuration store moved to step 5, where it is first used.
2. **Sign-in and sessions** (done): OIDC with PKCE, state and nonce (`oauth4webapi`, no further dependencies); person sessions of 12 hours kept in memory, so a restart signs people out until pairing (step 3) brings a store; logout; tests against a fake identity provider for every refusal. Still demo data.
3. **Pairing** (done): without a session a visitor chooses between signing in and pairing. The tablet shows an 8-character code (5 minutes) bound to it by a cookie; a signed-in person types it under Settings, Devices, names the device and confirms. The device session lasts 30 days from its last use and is kept (hashed) in `DATA_DIR/devices.json`, so restarts keep tablets in. A device cannot pair or remove devices; five wrong codes block a person for five minutes. Still to do: the Safari 15 cookie test on the tablet.
4. **Home Assistant connection, read-only** (built): `DASHBOARD_MODE=live`, token from a mounted file, WebSocket connect, reconnect with backoff and a keep-alive, registry discovery (floors, areas, devices, entities) refreshed on every connect and every 15 minutes. Only the commands in `READ` can be sent; tested against a fake Home Assistant. A non-admin user suffices (checked in the 2026.11.1 source). Live since 2026-11-18, with the non-admin token Mira also uses, resealed for the dashboard's namespace.
5. **Configuration in the backend** (built): `DATA_DIR/config.json`, replaced atomically (A10), at `/api/config` with a revision, so a save based on an older one is refused (409) and the newer version shown. A person saves, a paired device only reads and shows no edit buttons; the browser keeps a cache and checks for changes every minute. The first person to sign in brings their browser's configuration along. A device that finds a configuration skips the setup. Export and import stay as they were. Not yet: per-device setup steps and a migration between configuration versions (there is one version so far).
6. **Live states** (backend built): `subscribe_entities` (no admin needed, checked in the 2026.11.1 source), states kept in memory, cleaned of context and credential-bearing attributes, at `/api/ha/states` and as server-sent events at `/api/ha/stream` (batched every 0.5 s, every state again after a reconnect, at most 20 streams). Tested against the fake Home Assistant. Still to do (6b): the frontend shows these states instead of the demo data, with unavailable and missing entities.
7. **Energy and climate, read-only.**
8. **Network sources** (UniFi, Zigbee), after checking which fields they really expose.
9. **Music**, read-only first.
10. **Commands:** allow-list, audit of what is offered, confirmation for anything that affects more than one device; tested with the owner present, never by automated tests on real devices.

Then Phase 3: chart for the backend, network policies as above, sealed Secret.

### Parked: a "Connect" button

Discussed and parked on 2026-11-18. The idea: someone signs in at Home Assistant as the dedicated user and the backend keeps its own token, so nobody copies or seals one.

- For: installs without GitOps or sealed secrets; a credential of its own that Home Assistant lists and revokes separately; rotation without a change in git.
- Against: no gain where the token comes from a Secret; signing in as yourself would give the dashboard admin rights; the browser needs Home Assistant's own address next to the internal one; the token lives on the volume, outside git; two ways in to test and document.
- If it is ever built: the Home Assistant address comes from the server configuration only, never from a request; admin users are refused; a token from the Secret always wins; only a signed-in person may use it, never a paired device. First verify how long a token obtained this way lasts.

## Tests

Deterministic, with a fake Home Assistant (a small WebSocket and REST server in the test suite), never the real one.

- Sign-in: missing, expired and forged sessions; wrong OIDC state; logout.
- Pairing: expired code, reused code, approval by a device session (refused), revoked device.
- API: every endpoint without a session, with a device session where a person is required.
- Home Assistant: connection refused, bad token, disconnect mid-subscription, reconnect with state resync.
- Data: missing and unavailable entities, attributes absent, configuration from an older version.
- Commands: outside the allow-list, unsupported by the entity, Home Assistant error.
- Privacy: no token, session or Home Assistant address in any response, log line or export.

Device checklists stay separate for the iPad Air 2 and the iPhone 13 (`docs/device-testing.md`).

## Compatibility baseline

Safari 15 on iPadOS 15 (iPad Air 2) is a first-class target, then current Safari on iPhone, then current desktop browsers. ES2021 syntax ceiling, checked by lint; no dependency that needs a newer browser.

## Decided by the owner (2026-11-17)

1. Go for Phase 2, starting at step 1.
2. A5: OIDC instead of forward-auth. Live in the preview since 2026-11-17.
3. A1: Node, not Python.
4. A7: device sessions of 30 days.

## Where this differs from the review of 2026-11-17

- The review asks not to publish or deploy without explicit approval. The owner has given standing permission to merge this project's pull requests, which deploys the preview; that stands. Anything that gives the cluster a Home Assistant credential still needs the owner's explicit approval.
- The review proposes a development environment "with restricted permissions" in Home Assistant. Home Assistant offers no such restriction for service calls, so the restriction lives in the backend (A4), in development too.
