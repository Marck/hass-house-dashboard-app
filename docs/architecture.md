# Architecture

## Target architecture

```text
iPad / iPhone / desktop            local network or VPN
          |
          v
Dashboard application              frontend + controlled backend
          |
          |   internal namespace traffic only
          v
Home Assistant                     REST API + WebSocket API
          |
          v
Home Assistant integrations        Zigbee, Shelly, ESPHome, Wi-Fi, solar, UniFi
```

- The browser talks only to the dashboard. It never receives a Home Assistant credential.
- Only the dashboard backend talks to Home Assistant, over cluster-internal networking.
- Home Assistant is the integration layer and the source of truth for areas, devices and entities. The dashboard decides how they are grouped and shown.

## Phase 1: what exists today

A static frontend in `app/frontend`, with no network calls. Since Phase 2 step 1 it is served by the Node backend in `app/backend` (demo mode: files, `/healthz`, `/api/info`, nothing else).

```text
fixtures/synthetic.js   demo data and a stand-in for the area, device and entity registries
config.js               the user's configuration: floors, rooms, links, card layout, sources
music.js                speakers and groups: sessions, selection, rooms, commands per target
model.js                applyConfig() and pure helpers that turn both into what the views show
views/*.js              string renderers, one per screen or sheet
main.js                 state, routing, event delegation, storage
```

Data flows one way: fixture and configuration go through `applyConfig()`, the views render a string, `main.js` puts it in the page. A click or a change calls one action, which updates state or configuration and renders again.

| Decision | Reason |
|---|---|
| Plain ES modules, no framework, no build | The oldest target is Safari 15 on an iPad Air 2; nothing to transpile, nothing to load |
| Views return strings | The whole UI renders in Node, so every screen is covered by unit tests without a browser |
| Strict Content-Security-Policy, no inline styles | `connect-src 'none'` proves Phase 1 cannot reach Home Assistant; positions go through the CSSOM |
| Generated floor plan | It stays correct when rooms are added or moved, and no real floor plan is ever published |
| Configuration is data, edited in the UI | No file editing; the same document moves to the backend in Phase 2 |
| Fixtures live under `app/frontend/js/fixtures` | The browser loads them without a build step (the plan suggested a top-level folder) |

### Configuration model

```text
floors[]            id, label, ordered room ids
rooms{}             label, linked area ids, entities added by hand, entities switched off
cards{}             visible cards per screen, in order
ev                  entity per statistic, statistics the user hid
net                 which network sources are used
```

A room shows the entities of its linked areas: those assigned to the area directly and those that inherit it from their device. Diagnostic, hidden and disabled entities are left out. A linked area or an added entity that no longer exists is reported, never dropped silently.

## Phase 2: planned

A small backend holds the Home Assistant token, reads the registries and states (WebSocket for discovery and live updates, REST where it fits), and serves the frontend the same normalized shape the fixture has today. It also stores the configuration, so all devices share it. Commands become allowlisted service calls.

Not verified yet, and to be checked against the running Home Assistant before design: which Zigbee integration is in use, and which fields the UniFi and Zigbee integrations expose.

## Phase 3: planned

Decided on 2026-11-15:

- A separate Deployment in the Home Assistant namespace, not a sidecar. A sidecar shares the pod's network namespace and lifecycle, so it isolates less and restarts Home Assistant on every update.
- Authentication by the backend: OIDC against the existing identity provider, or a Home Assistant account (decided 2026-11-17, replacing forward auth at the ingress).
- A NetworkPolicy that lets only the ingress controller reach the dashboard and lets the dashboard reach only the Home Assistant API port. Without it, anything in the cluster could skip the login.
- The backend trusts no identity header; only its own session cookie counts.

Still to verify in the cluster: NetworkPolicy enforcement, whether Home Assistant uses host networking (policies do not protect such a pod), and that the login page works in Safari 15.
