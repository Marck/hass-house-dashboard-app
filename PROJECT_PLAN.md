# Home Assistant Dashboard: Project Plan

**Status:** Planning  
**Delivery model:** Approval-gated. No implementation phase begins without explicit approval.  
**Repository visibility:** Public from day one. Treat every committed byte, Git history entry, build log, artifact, issue, screenshot, and test fixture as public.

## 1. Objective

Build a lightweight, responsive Home Assistant dashboard that reproduces the four supplied reference screens:

1. Room detail: climate, lights, occupancy/motion, power and device status.
2. Network: topology, connectivity, online/offline devices and WAN diagnostics.
3. Energy/property overview: solar production, battery, energy balance and consumption.
4. Whole-home overview: interactive isometric floor plan, room states and quick controls.

Target hardware is an Apple iPad Air 2, iPhone 13, and current desktop browsers. The dashboard must be local-first; remote access is permitted only through VPN.

### Delivery phases

- **Phase 0: Preparation:** verify reference assets, architecture, compatibility and security baseline.
- **Phase 1: Design and artwork (mocked):** static prototype with synthetic data; no live Home Assistant calls.
- **Phase 2: Functional local web application:** implement backend API adapter and live Home Assistant REST/WebSocket integration; run locally on a PC.
- **Phase 3: Cluster deployment:** containerize and deploy to Kubernetes/k3s with CI and strict in-cluster API access.

## 2. Non-negotiable requirements

These apply across every phase, branch, tool, artifact, test, screenshot, CI job and deployment.

### 2.1 Privacy and public-repository safety

- Never include, expose, collect, persist, log, screenshot, commit or otherwise record usernames, passwords, tokens, API keys, cookies, personally identifiable information, or identifying information about the owner, household or household members.
- Assume the repository is public from its first commit. No temporary secrets or private household data may ever be committed.
- Do not put sensitive values in source code, Git history, sample configuration, `.env` files, fixtures, documentation, issue reports, commit messages, CI output, container layers, image metadata or test recordings.
- Use only generic display labels and synthetic IDs in public fixtures, examples, screenshots and documentation.
- If `ha-mcp` is used to inspect the current Home Assistant setup, inspect only what is necessary to understand the minimalist layout and device/entity categories. Do not export raw inventories, entity IDs, room labels, names, device identifiers, addresses, coordinates, network details or history into the public repository.
- Keep any real mapping between generic UI IDs and Home Assistant entity IDs in private runtime configuration or a secure server-side store, never in public source.
- Do not request or print credentials in chat, commands, source files or logs. Runtime secrets, if required, must be provisioned out-of-band through an approved secret mechanism.
- Maintain `.gitignore`, secret scanning, dependency scanning, safe logging and a pre-publication privacy checklist. These are safeguards, not permission to store sensitive data.
- CI must not echo environment variables or secrets. Avoid shell tracing in secret-bearing steps.
- Before every push, release, screenshot publication or artifact upload, perform a privacy review. If uncertain whether content identifies the household, exclude it.

### 2.2 Approval-gated implementation

- Work in small, reviewable increments and only on the currently approved phase.
- At each phase end, report deliverables, acceptance tests, privacy/security review, limitations and proposed next steps.
- Stop and wait for explicit approval before starting the next phase.
- Silence, a request for a plan, or approval of an unrelated item is not approval.
- Obtain explicit approval before inspecting live household data, connecting to live Home Assistant, changing cluster resources, modifying Helm configuration, publishing images or deploying.
- Phase 2 requires explicit Phase 1 approval. Phase 3 requires explicit Phase 2 approval.
- Cluster changes, Helm changes, CI publication and production deployment each require a described change plan and explicit approval.

### 2.3 Device compatibility and responsive behavior

- Target: Apple iPad Air 2, iPhone 13 and desktop.
- On iPhone/narrow layouts, **hide the large 3D/isometric artwork and interactive floor plan entirely**. Do not scale it down to a tiny, unreadable or untappable size. Replace it with a purpose-built compact room/status interface.
- On iPad and desktop, display the artwork at a useful size with legible labels and practical touch targets.
- Use responsive breakpoints based on available layout width, not device-name detection alone.
- Prefer progressive enhancement and browser features supported by older Safari. Avoid unnecessary dependencies, heavy animation, excessive DOM/SVG complexity and unsupported modern APIs.
- Ensure touch controls work without hover; use readable typography, comfortable touch targets and visible focus states.
- Test portrait and landscape where applicable on the actual target devices, not only emulation.

### 2.4 English and Dutch language switching

- Support English and Dutch only. Do not retain German text from the screenshots.
- Provide a visible language control:
  - English UI: button label **Language**.
  - Dutch UI: button label **Taal**.
  - Choices must be displayed as flag icon + `EN` and flag icon + `NL`.
- Switching language must update all dashboard text immediately without page reload or visible loading state.
- Translate navigation, room/device/entity labels, statuses, messages, accessibility labels, errors, tooltips, date/time labels and controls.
- Use central translation dictionaries and stable translation keys; avoid scattered inline language conditionals.
- If preference persistence is implemented, store only the language preference and no identifying information.

### 2.5 Theme and dark mode

Provide exactly these three user-selectable modes:

1. **Manual:** user chooses Light or Dark.
2. **Automatic:** switch between light and dark depending on whether the sun is down at the configured Home Assistant location. Once connected, prefer Home Assistant sun state (for example, `sun.sun`).
3. **Off:** disable dark mode and keep the light theme regardless of sun state.

Additional requirements:

- Make the setting discoverable and understandable in English and Dutch.
- In Automatic mode, update the theme when sun state changes without reloading the dashboard.
- In Manual mode, automatic sun changes must not override the user's choice.
- In Off mode, always use the light theme.
- The entire layout must remain visible and usable in both themes. Every card, label, chart, status, border, control and overlay must remain readable with sufficient contrast.
- Do not communicate status using color alone; retain text, icon or shape cues.
- Check focus, hover, disabled, warning, offline and selected states in both themes.
- If sun state is unavailable, use a documented safe fallback and keep the interface readable.
- Never put real location coordinates or identifying location data in public fixtures or repository configuration.
- Phase 1 uses a mock sun state to demonstrate Automatic mode; Phase 2 connects it to Home Assistant.

### 2.6 Architecture and integrations

- Home Assistant runs in Kubernetes/k3s.
- Dashboard access is local-first. External access is allowed **only through VPN**. Do not expose the dashboard or Home Assistant API publicly.
- Required supported categories: Zigbee, Shelly, ESPHome, Wi-Fi devices, solar/inverter/battery/energy, and UniFi.
- Device communication uses Home Assistant:
  - **REST API:** retrieve information, send commands and call services.
  - **WebSocket API:** live updates, subscriptions and event monitoring.
- Follow `dashboard-architecture.png`. Confirm its trust boundaries and traffic paths before implementation. If the diagram is unavailable, stop and request it rather than inventing a conflicting architecture.
- The browser must never receive a Home Assistant long-lived access token or other HA credential.
- In Phase 3, HA API traffic must remain inside the Kubernetes namespace:
  - Browser → dashboard service only.
  - Dashboard backend → Home Assistant service over cluster-internal networking.
  - No browser-to-HA API calls that leave the pod/namespace boundary.
  - Do not expose the HA API through Ingress, NodePort, LoadBalancer or a public route for this application.
- Use namespace-scoped service DNS and internal service networking. Apply NetworkPolicies where supported and verify enforcement.
- Restrict the dashboard route to LAN and VPN paths at the network/ingress layer. VPN is the only permitted remote path.
- Do not assume a second container in the Home Assistant pod is automatically the best design. Inspect the supplied architecture and Helm chart first. Prefer a separate dashboard Deployment/Service in the same namespace unless the approved architecture explicitly requires a sidecar. Document the trade-off.
- Do not modify the Home Assistant Helm release or cluster resources without an approved change plan.
- Decision 2026-11-15: a separate dashboard Deployment in the Home Assistant namespace, no sidecar (a sidecar shares the pod network namespace and lifecycle). Authentication through the existing identity provider with forward auth at the ingress. A NetworkPolicy lets only the ingress controller reach the dashboard and lets the dashboard reach only the Home Assistant API port. The backend ignores and never logs identity headers.

### 2.7 Configurable layout and controls (added 2026-11-15)

- Heating has the same temperature control as the AC: on/off plus a target temperature with the same scale, step buttons and current-versus-target display. A heating source without a settable target shows on/off only and says why; never a fake setpoint.
- Rooms can be reordered within a floor and moved to another floor from the UI, with no code or config-file change (example: after a house move the office is on another floor).
- Floors can be added, renamed and removed from the UI and accept free-text labels (example: "Attic"). A floor can only be removed once it is empty, and one floor always remains; rooms are never deleted with a floor. Removing a room asks for a second tap.
- The floor plan is generated from the configured floors and rooms, so it stays correct after a change. It is a schematic, not a to-scale drawing.
- Floor and room editing opens from an "Edit" button to the right of the floor plan, in the same style and layout as the adjacent controls.
- Dashboard cards (music, weather and the others) can be reordered, removed and restored. An "Edit layout" button sits directly left of the language button. Removed cards stay available in edit mode and a reset restores the default layout.
- Every reorder or move works with buttons by touch, keyboard and screen reader. Drag and drop is optional and never the only way.
- User-entered labels are shown as typed in both languages, escaped on output, and never committed, logged or included in fixtures, screenshots or documentation.
- Phase 1 stores this configuration in the browser only. Phase 2 stores it in the dashboard backend so all devices share it. The dashboard does not write to the Home Assistant floor or area registry.

### 2.8 Rooms linked to Home Assistant areas (core, added 2026-11-15)

- Dashboard rooms are the dashboard's own grouping. Each room links to zero or more Home Assistant areas. Home Assistant stays the source of truth for area, device and entity organization; the dashboard only decides how it is grouped and presented.
- Links store the Home Assistant area ID, never the area name. A renamed area keeps working and shows its new name.
- A room shows the entities of its linked areas: entities assigned to the area directly, plus entities that inherit the area from their device. An entity's own area assignment wins over its device's.
- By default only primary, enabled, visible entities of supported domains are shown. Diagnostic, configuration, hidden and disabled entities are left out.
- Individual entities can be included manually (from any area or none) or excluded, per room.
- An area may be linked to more than one room.
- A deleted area leaves the link in place, marked as missing with a configuration warning, until the user removes it. Nothing else in the room breaks.
- The backend uses the WebSocket API for area, floor, device and entity discovery and for live updates, and REST where appropriate for states and service calls. The browser receives normalized data only.
- Area and entity IDs can reveal household details. They live only in the backend's stored configuration, never in the repository, fixtures, logs or screenshots.
- Everything is configured in the dashboard UI (room editor).
- Every entity the dashboard uses is visible and changeable there, so one entity can be swapped for another.
- Not configured means hidden: an element without an entity is simply not shown, with no error.
- Configured but missing means an error: when a configured entity does not exist in Home Assistant, the dashboard shows "entity not found" with the entity ID in place of the element, and in the configuration.

### 2.9 Optional EV charging statistics (added 2026-11-15)

- Optional and disabled by default, independent of the home battery component and in the same visual style.
- No hardcoded entity IDs. In the UI the user picks a Home Assistant entity per statistic: charging status, charging power, session energy, vehicle battery level, session duration and charging cost. Every mapping is optional.
- Pickers list entities from Home Assistant, filtered by fitting domain, device class and unit. Manual entry is not the default.
- Only statistics with a valid mapping are shown, and the user can hide individual statistics. Unavailable or unknown states show as unavailable, never as zero.
- Units come from the entity (W or kW, Wh or kWh, the currency) and are normalized for display. No fixed currency.
- History over selectable periods uses Home Assistant statistics or history where the entity supports it; otherwise the history view is hidden.
- No assumption about a vehicle, charger or integration.
- All configuration happens in the dashboard UI. Any YAML or JSON in planning documents is conceptual; users never edit files.
- The same entity-mapping mechanism serves the other energy components (battery, solar, grid) in Phase 2.

### 2.10 Network views: All, UniFi and Zigbee (added 2026-11-15)

- The existing network screen gets three views: All, UniFi and Zigbee.
- UniFi and Zigbee are independent, optional sources, switched on and configured in the dashboard UI, each with a status (connected and providing data, or not).
- View visibility: both sources give All, UniFi and Zigbee. One source gives that view plus All. No source hides the network screen and its navigation entry. An empty map is never shown.
- All combines the configured sources. Two entries are merged only when Home Assistant itself identifies them as one device; never by name.
- Each device shows its source (badge, colour and text) and its name, status and type where available. Missing fields are omitted, not guessed.
- Home Assistant is the integration layer: no direct calls to a network controller or Zigbee coordinator.
- iPad and desktop show the map. iPhone shows a readable device list instead.

### 2.11 Application settings, child lock and build information (added 2026-11-16)

- A gear button in the top bar opens the application settings: child lock, data sources, backup, diagnostics and about.
- Child lock, because the wall tablet hangs where small children can reach it:
  - Per device. It is stored on the device and never in the shared configuration, so the wall tablet can be locked while a phone is not.
  - While locked, looking and switching screens stays possible. Three levels, chosen in the settings: all controls (default), all controls except lights, or settings and editing only. Settings, editing, language and theme are blocked at every level.
  - Unlocking, chosen in the settings: press and hold the lock for 3 seconds (default), or a 4-digit PIN. Wrong PIN tries are delayed. A PIN method without a PIN falls back to hold.
  - It locks again after a set time without touch (1, 2, 5 or 10 minutes, default 2) and then returns to the home screen with sheets and edit modes closed. A "lock now" button exists.
  - A blocked touch says that the dashboard is locked and how to unlock it. Nothing else happens.
  - Actions the lock does not know are blocked while locked (fail closed).
  - It is an accident guard, not a security boundary: it runs in the browser. The documentation recommends the tablet's own app pinning (Guided Access) to keep a child inside the dashboard. A read-only device mode enforced by the backend is a possible later hardening.
- Diagnostics: browser, screen size, layout in use, and a pass or fail for each browser feature the application relies on. Script errors are shown on screen, because a tablet has no console.
- About: version, the commit it was built from (with a note when the build had uncommitted changes), whether that commit is a tagged release, and the build date. The version is written in one place. The values are recorded when the image is built; a copy served from a checkout reads them from git.

## 3. Proposed technical approach

Validate this proposal against the architecture diagram and older-device compatibility before selecting final technologies.

### 3.1 Frontend

- Use a lightweight frontend with a small dependency footprint; prefer semantic HTML, CSS and progressively enhanced JavaScript/TypeScript.
- Phase 1 is static and mock-driven; it must not make live API calls.
- Componentize room cards, device/status chips, climate controls, energy cards, network nodes, charts and floor-plan layers.
- Use SVG/CSS for diagrams and artwork where practical, with a performance budget. Avoid a heavy 3D engine unless requirements prove it necessary.
- Make floor-plan hotspots touch-friendly and accessible, with text alternatives and a non-artwork navigation path.
- Implement a dedicated compact phone layout rather than scaling down a desktop canvas.

### 3.2 Backend / Home Assistant adapter

- In Phase 2, build a small server-side adapter that owns Home Assistant API communication. Keep credentials out of the browser.
- REST: initial state snapshot, required entity metadata, service calls and command results.
- WebSocket: subscribe to state changes/events and forward only minimal normalized updates required by the UI.
- Reconnect with bounded backoff; handle stale connections, HA restarts, unavailable entities and partial integration outages.
- Validate and allowlist commands, entity access and services. Do not expose an unrestricted generic proxy to the browser.
- Normalize API responses. Never return upstream headers, tokens, internal stack traces or secret-bearing error payloads.
- Use a normalized internal data model so the UI is not coupled to raw HA payloads.
- Keep local runtime configuration out of Git; provide a secret-free example configuration.

### 3.3 Data model and `ha-mcp` discovery

- After explicit permission, use `ha-mcp` to inspect the current minimalist dashboard and relevant device/entity categories.
- Convert findings into a sanitized design inventory. Do not copy raw names, IDs, identifiers, network details or personal information into public files.
- Model rooms, devices, entities, capabilities and relationships separately.
- Use generic public fixture names and synthetic IDs, such as `room_01`, `light_01` and `climate_01`.
- Keep the real UI-ID-to-HA-entity mapping in private runtime configuration or secure server-side storage.
- Represent online, offline, unavailable, unknown, stale and error states explicitly.
- Do not assume every integration exposes identical capabilities.

## 4. Phase 0: Preparation and discovery

Planning/discovery only. This phase does not authorize implementation or live-system changes.

### Tasks

- [ ] Confirm all four design screenshots are available to Claude Code as local reference assets.
- [ ] Confirm `dashboard-architecture.png` is available and review it.
- [ ] Review repository contents and Git history for accidental secrets before use.
- [ ] Define public-repository safety baseline: `.gitignore`, secret scanning, dependency scanning, safe logging and sanitized fixtures.
- [ ] Select a lightweight stack after checking iPad Air 2 browser compatibility.
- [ ] Review current HA Helm chart and namespace layout read-only; do not modify.
- [ ] Prepare a sanitized `ha-mcp` discovery checklist; do not export raw inventory.
- [ ] Define measurable performance budgets and repeatable test procedures.
- [ ] Agree how explicit approvals will be recorded.

### Exit criteria

- Architecture diagram and reference assets are available and understood.
- Compatibility and security approach is documented.
- No secrets or household-identifying data have entered the repository.
- User explicitly approves starting Phase 1.

## 5. Phase 1: Design and artwork (mocked)

**Goal:** reproduce the four reference screens as closely as practical using synthetic data. No live Home Assistant calls or controls.

### 5.1 Discovery and visual specification

- [ ] Extract layout, hierarchy, spacing, typography, color tokens, card styles, shadows, borders and interaction patterns from all four screenshots.
- [ ] Review architecture diagram for context, without implementing the live architecture.
- [ ] After explicit permission, use `ha-mcp` to inspect only the current minimalist dashboard's relevant room/device/entity categories.
- [ ] Create a sanitized design inventory; exclude raw names, IDs, device identifiers, network details and personal data.
- [ ] Map sanitized categories to generic room/device/entity fixture IDs.
- [ ] Define floor-plan geometry only after the home layout is separately provided and approved. Use abstract/generic geometry in public assets.

### 5.2 Reproduce all four screens

- [ ] **Screen A: Room detail:** room header, temperature/occupancy, status chips, climate/heating controls, lighting availability, motion timeline and power/switch card.
- [ ] **Screen B: Network:** network summary, topology map, node/device cards, connectivity status, active traffic and synthetic WAN diagnostics.
- [ ] **Screen C: Energy/property overview:** isometric property artwork, solar production, battery state, energy balance, consumption and energy insight cards.
- [ ] **Screen D: Whole-home overview:** floor-plan artwork, room states, occupancy/movement, door/window status, light/climate summaries, irrigation and approved dashboard categories.
- [ ] Match the visual character of the screenshots while replacing all German text with English/Dutch.
- [ ] Use synthetic values and generic labels. Do not embed real home imagery, maps, coordinates, personal names or unique device identifiers in public mock assets.

### 5.3 Interactive floor plan

- [ ] Build a layered/isometric floor plan matching the approved home layout once supplied.
- [ ] Make room regions and device markers selectable with practical touch targets.
- [ ] Show selected, active, warning, offline and unavailable states.
- [ ] Provide equivalent list/card navigation for accessibility and phone use.
- [ ] Keep proportions and labels crisp on iPad/desktop.
- [ ] On iPhone-width layouts, hide the large artwork entirely and show compact room cards/navigation. Never show a tiny scaled floor plan.

### 5.4 Language and theme

- [ ] Implement English and Dutch translation dictionaries.
- [ ] Add Language/Taal control with flag + EN and flag + NL choices.
- [ ] Verify every visible string changes instantly without reload/loading state.
- [ ] Implement Manual, Automatic (mock sun state) and Off theme modes.
- [ ] Provide Light/Dark choice when Manual is selected.
- [ ] Demonstrate Automatic switching with mock sun-up/sun-down states.
- [ ] Audit contrast and readability of cards, charts, borders, controls and status states in both themes.

### 5.5 Responsive and performance

- [ ] Define tablet/desktop and narrow-phone layouts.
- [ ] Test iPad Air 2 logical viewport sizes and iPhone 13 viewport sizes.
- [ ] Test iPad portrait/landscape and iPhone portrait.
- [ ] Avoid unnecessary animation and respect reduced-motion preferences.
- [ ] Keep charts/artwork lightweight and avoid large runtime bundles.
- [ ] Check keyboard navigation, visible focus, accessible names and touch targets.

### 5.6 Configurable layout and controls (mocked)

- [ ] Heating target temperature control matching the AC control.
- [ ] Reorder rooms within a floor and move rooms between floors.
- [ ] Add, rename and remove floors, from an "Edit" button right of the floor plan.
- [ ] Generate the floor plan from the configured floors and rooms.
- [ ] "Edit layout" button left of the language button: reorder, remove and restore cards, reset to default.
- [ ] Persist the configuration in browser storage, with no network calls.

### 5.7 Area links, EV charging and network views (mocked)

- [ ] Room editor: link synthetic areas to a room (several per room), list the discovered entities, include and exclude entities, show a missing-area warning.
- [ ] Optional EV charging card with mock data, off by default, with entity pickers over synthetic entities and per-statistic visibility.
- [ ] Network views All, UniFi and Zigbee with mock devices, and settings to switch each source on or off (both, one, neither).

### 5.8 Wall tablet readiness (added 2026-11-16)

- [x] Application settings behind a gear button, replacing the separate data sources sheet.
- [x] Child lock as in 2.11, per device. (Unit tests and browser check; not yet on the real tablet.)
- [x] About with version and commit, diagnostics, and an on-screen error display.
- [x] A test server for the internal network (`scripts/serve.py`) and a device checklist (`docs/device-testing.md`).

Accepted when: with the lock on, no control at the chosen level reacts while every screen can still be viewed; hold and PIN both unlock; the lock returns after the idle time; the lock is not part of the exported configuration; and the about section shows the commit of the build.

### Phase 1 deliverables

- Static mockup/prototype with no live HA calls.
- Four reproduced dashboard screens.
- English/Dutch instant language switching.
- Manual/Automatic/Off theme setting with readable light/dark themes.
- Responsive phone layout that hides the large artwork.
- Sanitized mock data and generic assets only.
- Design notes, component inventory and Phase 1 test report.

### Phase 1 acceptance criteria

- [ ] Four screens are recognizably faithful to supplied references. (Built against them; the owner's judgement, pending review.)
- [x] No German UI text remains. (Unit test.)
- [x] English/Dutch switching updates all visible text instantly. (Unit test for key parity and complete rendering; browser check.)
- [x] All three theme modes work; both themes are readable. (Unit tests for the resolver and for WCAG AA contrast; browser check.)
- [x] iPhone layout does not display tiny floor-plan artwork. (Unit test; browser check at 390 x 844.)
- [x] iPad and desktop show usable large artwork. (Browser check at 1024 x 768, 768 x 1024 and 1440 x 1000; not on a real iPad.)
- [x] Heating target temperature can be set the same way as the AC. (Unit tests; browser check.)
- [x] Using only the UI, a floor named "Attic" can be added and a room moved onto it; both survive a reload. (Browser check.)
- [x] Cards can be reordered, removed, restored and reset; the result survives a reload. (Unit test; browser check.)
- [ ] All edit actions work by touch and by keyboard without dragging. (Every control is a button, select or text field and nothing needs dragging; keyboard checked in the browser; not yet checked on a touch device.)
- [x] A room can be linked to two mock areas and its entity list follows; a deleted mock area shows a warning. (Unit tests; browser check.)
- [x] The EV card is off by default; after enabling and mapping entities it shows only the mapped statistics. (Unit tests; browser check.)
- [x] Network views follow the configured sources; with neither source the network screen is hidden. (Unit tests; browser check.)
- [x] No live HA calls or credentials are present. (Content-Security-Policy `connect-src 'none'`; privacy check.)
- [x] Public-repository privacy review passes. (`scripts/privacy-check.mjs` and a manual review.)
- [ ] User explicitly approves Phase 1 before Phase 2.

## 6. Phase 2: Functional local web application

**Goal:** connect the approved Phase 1 interface to Home Assistant and operate locally on a PC. No Kubernetes deployment in this phase.

### 6.1 Integration design

- [ ] Reconfirm architecture diagram and trust boundaries.
- [ ] Finalize backend adapter contract and normalized UI data model.
- [ ] Identify required REST endpoints and service-call patterns.
- [ ] Identify WebSocket subscriptions/events required for live updates.
- [ ] Define allowlist of permitted entity domains, services and command payloads.
- [ ] Define behavior for unavailable, unknown, stale, offline and unauthorized entities.
- [ ] Confirm no HA token/credential is sent to the browser.

### 6.2 REST implementation

- [ ] Retrieve initial dashboard snapshot through backend adapter.
- [ ] Implement allowlisted service calls for approved controls.
- [ ] Validate request bodies and reject unsupported entity/service combinations.
- [ ] Return safe normalized success/error results.
- [ ] Handle HA timeouts, restarts, rate limits and partial failures.
- [ ] Ensure logs redact sensitive headers, payloads and identifiers.

### 6.3 WebSocket implementation

- [ ] Establish backend-owned HA WebSocket connection.
- [ ] Authenticate server-side without exposing credentials to browser.
- [ ] Subscribe only to required state/event updates.
- [ ] Forward minimal normalized updates to frontend.
- [ ] Reconnect safely after network interruption or HA restart.
- [ ] Prevent duplicate subscriptions and stale update races.
- [ ] Verify language/theme changes remain instant and do not reconnect to HA unnecessarily.

### 6.4 Integration coverage

- [ ] Zigbee-backed entities.
- [ ] Shelly entities.
- [ ] ESPHome entities.
- [ ] Wi-Fi device entities.
- [ ] Solar, inverter, battery and energy entities.
- [ ] UniFi/network entities.
- [ ] Missing integrations and unsupported capabilities do not break the UI.

### 6.5 Local operation and testing

- [ ] Provide secret-free sample configuration and private local configuration instructions.
- [ ] Add local run/build/test commands.
- [ ] Run frontend and backend locally on a PC.
- [ ] Test initial state loading, live updates and each approved control/failure path.
- [ ] Test reconnection after HA/WebSocket interruption.
- [ ] Test English/Dutch and all theme modes with live data.
- [ ] Test iPad Air 2 and iPhone 13 on actual devices where possible.
- [ ] Measure load time, memory use, interaction latency and long-session stability.
- [ ] Check browser console, server logs and network traffic for leaked credentials/personal data.
- [ ] Confirm browser traffic goes only to dashboard backend, never directly to HA.

### 6.6 Configurable layout and controls

- [ ] Store the floor, room and card configuration in the backend, shared across devices, validated and size-limited.
- [ ] Export and import the stored configuration as a file, for backup and migration. The UI stays the only way to edit it; there is no YAML editing.
- [ ] Map heating to climate entities with a settable target; show on/off only where none exists.
- [ ] Default floors and rooms from Home Assistant floors and areas; keep overrides in the dashboard, with no writes to the Home Assistant registry.

### 6.7 Area links, EV charging and network views

- [ ] Registry discovery over WebSocket (areas, floors, devices, entities) with update subscriptions; resolve an entity's area through its device.
- [ ] Store room-to-area links, inclusions and exclusions in the backend; warn on area IDs that no longer exist.
- [ ] EV: entity discovery for the pickers, live states, statistics over selectable periods where supported. Test combinations of mapped, unmapped and unavailable entities and of units.
- [ ] Network: read UniFi and Zigbee devices through Home Assistant, with a status per source. Verify which fields each integration really exposes before designing the live map.

### Phase 2 deliverables

- Functional local web application.
- Server-side REST/WebSocket adapter.
- Sanitized configuration and setup documentation.
- Automated tests and manual device test report.
- Performance and privacy review.
- No Kubernetes deployment or Helm modification.

### Phase 2 acceptance criteria

- [ ] Approved controls operate intended HA entities through REST/service calls.
- [ ] Live state changes arrive through WebSocket without page reload.
- [ ] No HA credentials are exposed to browser code, storage or network responses.
- [ ] Required integration categories work or have documented limitations.
- [ ] iPad Air 2 and iPhone 13 usability/performance tests pass.
- [ ] Language and theme behavior pass with live state.
- [ ] Local setup is repeatable without committing secrets.
- [ ] Public-repository privacy review passes.
- [ ] User explicitly approves Phase 2 before Phase 3.

## 7. Phase 3: Kubernetes/k3s cluster deployment

**Goal:** deploy the approved application in the existing cluster with strict internal HA API access.

### 7.0 Early preview deployment (approved 2026-11-15)

The purpose is testing on the real iPad as early as possible. This is the only approved part of Phase 3.

- Stage 1: the demo (synthetic data, no token), behind the existing identity provider. It also checks that the login works in Safari 15.
- Stage 2: the live backend with the Home Assistant token as a sealed secret, after Phase 2 works. Not started.
- Image: built by a manually dispatched workflow in this repository and published to the GitHub container registry.
- Rollout: a chart in the owner's Helm repository. Nothing changes in the cluster until the owner merges it.
- Until stage 2, the live application is reachable from the development machine only: without a login in front of it, anyone on the network could control the house.

### 7.1 Pre-deployment review

- [ ] Inspect cluster and HA Helm release read-only.
- [ ] Confirm namespace, service names, ports, ingress exposure, NetworkPolicy support and storage needs.
- [ ] Review architecture diagram and verify traffic paths.
- [ ] Choose separate Deployment/Service versus sidecar only after documenting the decision.
- [ ] Prepare change plan covering resources, rollback, downtime risk and verification.
- [ ] Obtain explicit approval before cluster/Helm changes.

### 7.2 Container and CI

- [ ] Create minimal reproducible Dockerfile using supported base image.
- [ ] Use multi-stage builds where useful; run as non-root; minimize image contents.
- [ ] Never bake credentials, private config or household data into image layers.
- [ ] Add safe health/readiness endpoints.
- [ ] Add CI for linting, unit/integration tests, build verification, dependency checks and secret scanning.
- [ ] Ensure CI logs/artifacts do not expose secrets or identifying data.
- [ ] Publish image/release to public GitHub repository only after approval.
- [ ] Pin dependencies/base images appropriately and document updates.
- [ ] Generate SBOM and scan built image where practical.

### 7.3 Kubernetes deployment

- [ ] Add dashboard Deployment and ClusterIP Service in HA namespace unless approved architecture specifies otherwise.
- [ ] Keep HA API endpoint cluster-internal and namespace-scoped.
- [ ] Configure backend-to-HA communication using internal service DNS.
- [ ] Keep HA credentials in operator-managed Kubernetes Secret or approved external secret manager; never commit Secret values.
- [ ] Inject secrets only into backend container that requires them.
- [ ] Never pass HA credentials to frontend assets or browser responses.
- [ ] Apply NetworkPolicies to allow only required dashboard-backend → HA traffic and required client → dashboard traffic, where supported.
- [ ] Verify there is no public Ingress, NodePort or LoadBalancer path to HA API.
- [ ] Restrict dashboard access to LAN and VPN paths only.
- [ ] Add resource requests/limits, probes, security context and graceful shutdown.
- [ ] Avoid persistent storage unless a documented requirement justifies it.
- [ ] Do not add a second container to the HA pod or edit the HA Helm chart until architecture review explicitly approves it.

### 7.4 Verification and rollback

- [ ] Deploy to test context first if available.
- [ ] Verify dashboard availability from LAN.
- [ ] Verify remote access works only while connected to VPN.
- [ ] Verify access from outside LAN/VPN is blocked.
- [ ] Verify browser cannot reach HA API directly.
- [ ] Verify HA API traffic stays inside namespace using NetworkPolicy and observed traffic.
- [ ] Verify WebSocket updates and REST commands in-cluster.
- [ ] Verify secrets absent from Git, image layers, logs, browser assets and CI artifacts.
- [ ] Test pod restart, HA restart, node rescheduling and reconnect behavior.
- [ ] Document rollback and test it where practical.
- [ ] Obtain explicit approval before production rollout.

### 7.5 Feature verification in the cluster

- [ ] Room-to-area discovery and live updates work through the in-cluster backend.
- [ ] EV charging and the network views are tested against the deployment on the iPad Air 2 and iPhone 13.

### Phase 3 deliverables

- Dockerfile and build instructions.
- CI workflow and test/security checks.
- Public image/release, if approved.
- Kubernetes manifests or approved Helm changes.
- Network policy and access-control configuration.
- Deployment, verification and rollback documentation.
- Final security/privacy and device compatibility report.

### Phase 3 acceptance criteria

- [ ] Dashboard runs reliably in k3s.
- [ ] Browser accesses only dashboard service.
- [ ] Dashboard backend accesses HA through in-cluster networking only.
- [ ] HA API is not exposed outside namespace or through public ingress.
- [ ] Remote dashboard access is possible only over VPN.
- [ ] No credentials or household-identifying data in public repo, image, logs or CI.
- [ ] CI tests and security checks pass.
- [ ] Rollback procedure is documented and verified.
- [ ] User explicitly approves production deployment.

## 8. Cross-phase quality gates

### Privacy and security

- [ ] No secrets, personal information or household-identifying information in tracked files or Git history.
- [ ] No sensitive values in logs, screenshots, recordings, CI artifacts, container layers or error responses.
- [ ] Secret scanning and dependency scanning pass.
- [ ] Public fixtures/screenshots are synthetic and sanitized.
- [ ] Browser never receives HA credentials.
- [ ] Access boundaries match approved architecture.

### Accessibility and usability

- [ ] Typography and contrast readable in light and dark themes.
- [ ] Touch targets work on iPad and iPhone.
- [ ] Keyboard focus is visible.
- [ ] Status is not conveyed by color alone.
- [ ] English and Dutch labels are complete.
- [ ] Phone layout remains useful with artwork hidden.

### Compatibility and performance

- [ ] iPad Air 2 tested on-device where possible.
- [ ] iPhone 13 tested on-device.
- [ ] Desktop tested.
- [ ] Core functionality does not depend on unsupported browser APIs.
- [ ] No avoidable heavy animation or excessive resource usage.
- [ ] Long-running WebSocket behavior stable from Phase 2 onward.

## 9. Suggested repository structure

Adjust after stack selection. Keep private runtime configuration outside the public repository.

```text
/
├── PROJECT_PLAN.md
├── README.md
├── LICENSE
├── .gitignore
├── .github/
│   └── workflows/
├── docs/
│   ├── architecture.md
│   ├── design-system.md
│   ├── testing.md
│   ├── deployment.md
│   └── security-and-privacy.md
├── app/
│   ├── frontend/
│   └── backend/
├── fixtures/
│   └── synthetic/
├── tests/
│   ├── unit/
│   ├── integration/
│   └── e2e/
├── deploy/
│   ├── docker/
│   └── kubernetes/
└── scripts/
```

Never commit real floor plans, real entity exports, raw `ha-mcp` output, private configuration, credentials or household-specific screenshots.

## 10. Claude Code working instructions

1. Read this plan and approved architecture diagram before proposing implementation.
2. Inspect repository and design assets without copying sensitive information.
3. Report missing inputs and ambiguities; do not guess architecture or home layout.
4. Work only on the currently approved phase.
5. Before editing files, state intended changes and privacy/security implications.
6. Keep changes small and reviewable; run relevant tests after each meaningful change.
7. Never use credentials in commands that may be logged or captured. Never print environment variables.
8. Never commit raw HA inventory or household-specific data.
9. Update the progress tracker and this plan after meaningful completed work.
10. At each phase gate, stop and present a review package. Wait for explicit approval.

### Required phase-gate report

For each phase report: deliverables completed; acceptance criteria passed/failed/not tested; tests and results; iPad/iPhone results where applicable; privacy/security review; known issues/deferred work; changed file paths only; exact next action requiring approval.

## 11. Progress tracking

Mark a task complete only when acceptance evidence exists. Do not mark work complete merely because code was generated. Record dates and evidence without private data, entity IDs, addresses, credentials or household details.

### Current project status

| Area | Status | Notes |
|---|---|---|
| Phase 0: Preparation | Done | Stack chosen, repository and privacy baseline in place; see `docs/` |
| Phase 1: Design/mockup | Done | Merged on 2026-11-15; not yet tested on the real target devices |
| Phase 2: Local application | Approved, waiting for the owner's go | The owner put testing on the iPad first (2026-11-16). Starts with read-only discovery; commands to real devices are tested only with the owner present |
| Phase 3: Cluster deployment | Preview only | The early preview (section 7.0) is approved; everything else is blocked |
| Privacy baseline | In place | `scripts/privacy-check.mjs` runs in every verify; see `docs/security-and-privacy.md` |
| Target-device testing | Not started | Emulated viewports only so far; iPad Air 2 and iPhone 13 still to do |

### Approval log

| Gate | Approval required to start | Approval recorded |
|---|---|---|
| Phase 1 | Start static design/mockup | Yes, 2026-11-15 (request to build the dashboard following this plan; read as Phase 0 and 1 only) |
| Phase 2 | Start live HA integration/local app | Yes, 2026-11-15 ("proceed with phase 2", given after Phase 1 was merged) |
| Early preview | Demo in the cluster for device testing (section 7.0) | Yes, 2026-11-15 ("deploy the early preview version") |
| Phase 3 | Start cluster/container/Helm work | No, apart from the early preview |
| Production rollout | Deploy approved cluster changes | No |

### Progress update template

Append an entry whenever meaningful work is completed:

```text
## Progress update: YYYY-MM-DD
- Phase:
- Status:
- Completed:
- Tests/evidence:
- Privacy/security review:
- Blockers:
- Approval needed:
```

## Progress update: 2026-11-15

- Phase: 0 and 1.
- Status: Phase 1 ready for review.
- Completed: the four mocked screens in English and Dutch with three theme modes; requirements 2.7 to 2.10 as working mocks (heating target control, floors and rooms editor, card layout editing, rooms linked to areas with entity inclusion and exclusion, optional EV charging, network views All, UniFi and Zigbee, export and import of the configuration); tooling, tests, CI and documentation.
- Tests/evidence: `scripts/verify.sh` passes (ESLint, Stylelint, 46 unit tests, privacy check). Browser checks at desktop, tablet landscape and portrait, and phone size in both themes and languages; details in `docs/testing.md`.
- Privacy/security review: passed. Synthetic labels and ids only, no addresses, no credentials, no network calls (`connect-src 'none'`). The reference screenshots and the supplied architecture image are not in the repository.
- Blockers: none for Phase 1. Not tested on a real iPad Air 2 or iPhone 13.
- Approval needed: review of Phase 1, then explicit approval before any Phase 2 work (live Home Assistant, `ha-mcp` discovery).

## 12. Open questions / required inputs

Resolve these at the appropriate gate; do not block the planning document on details that can safely wait.

- [x] Provide `dashboard-architecture.png`. The file no longer exists; the owner supplied an equivalent diagram on 2026-11-15, redrawn as text in `docs/architecture.md`.
- [x] Confirm the four reference screenshots are available as project assets. Supplied in the session; kept out of the repository because they show another household.
- [x] Confirm approved home layout/floor-plan source. Decision 2026-11-15: no real floor plan; the plan is generated from the rooms the user configures (section 2.7).
- [ ] Confirm permission and scope for read-only `ha-mcp` discovery.
- [x] Confirm whether dashboard is a separate in-namespace service or a sidecar. Decision 2026-11-15: separate Deployment in the Home Assistant namespace (section 2.6).
- [ ] Confirm desired LAN/VPN access enforcement point during Phase 3 review. Direction 2026-11-15: forward auth through the existing identity provider at the ingress.
- [ ] Confirm minimum browser versions after checking iPad Air 2 installed iOS/Safari version. Assumed Safari 15 (iPadOS 15.8 is the last release for that model); the installed version is not confirmed.
- [ ] Phase 2: confirm which Zigbee integration is in use and which fields the UniFi and Zigbee integrations expose through Home Assistant.
- [ ] Phase 3: confirm NetworkPolicy enforcement in the cluster, whether Home Assistant uses host networking, and that the identity provider's login page works in Safari 15.

## 13. Definition of done

The project is complete when all three phases pass acceptance criteria and approvals; the dashboard reproduces the four approved views; English/Dutch switching is immediate; theme modes behave correctly and remain readable; the iPhone layout hides large artwork in favor of a usable compact interface; iPad Air 2 and iPhone 13 have been tested; required integrations work through REST and WebSocket; local-first and VPN-only access rules are verified; HA API traffic stays inside the Kubernetes namespace; and public repository, CI, images, logs and documentation contain no secrets or household-identifying information.
