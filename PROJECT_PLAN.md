# Home Assistant Dashboard: Project Plan

**Status:** Phase 2 in progress. Read-only live integration built; device commands not started. Details in section 11.  
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
- Decision 2026-11-15: a separate dashboard Deployment, no sidecar (a sidecar shares the pod network namespace and lifecycle). The backend ignores and never logs identity headers.
- Namespace: the 2026-11-15 text said the Home Assistant namespace. Phase 2 decision A8 (2026-11-17) chose the dashboard's own namespace, and that is what runs since 2026-11-18. Proposed as authoritative on 2026-11-23, awaiting the owner's confirmation; the full decision is in [docs/phase-2-architecture.md](docs/phase-2-architecture.md#network-architecture). Forward auth was replaced by the backend's own OIDC sign-in (A5, 2026-11-17).

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

### 2.12 Music: several speakers, speaker groups and rooms (added 2026-11-16)

An extension of the existing music card, not a separate music application.

- The card adapts to what is playing:
  - Nothing active: the normal idle card, no tabs.
  - One active speaker or group: shown directly, no tabs.
  - Several active: one tab per active speaker or group. Switching tabs never interrupts playback. Tabs follow playback as it starts and stops.
- A compact overview lists every active speaker and group: name, room, status, title, artist and small artwork where available. An item opens its controls. It takes the place of the tabs when switched on in the settings; tabs are the default. Decision 2026-11-16, after the owner saw both on one card: they named the same targets twice.
- Speakers and groups are told apart by icon and text. A member of an active group is not shown as a session of its own while it plays what the group plays.
- Controls for the selected target: play and pause, previous and next, volume, stop casting, status, title, artist, artwork. Only controls the selected player supports are shown.
- Stop casting names its target and affects that speaker or group only. An unavailable speaker or a failed call gives a message, never a broken card.
- Temporary groups: pick several speakers (one by one or a whole room), start playback on them as one target, see the members, change the group volume, dissolve the group. Offered only for speakers that report the grouping capability. Permanent groups are never changed.
- Rooms: a speaker belongs to the dashboard room that shows its entity, through the existing area links and entity rules of section 2.8. There is no second room configuration. A room may hold several speakers and a group may span rooms.
- Settings, in the dashboard only: multi-speaker support on or off, which speakers and groups are managed, display names, a preferred speaker or group, which playback details are shown, and the overview on or off. No entity IDs in code and no manufacturer assumed.
- A managed speaker that no longer exists is reported on the card and in the settings; a speaker that is not managed is simply not shown (same rule as 2.8).
- Home Assistant is the integration layer: entity discovery, live state over WebSocket, media player services for control. No credentials in the browser.

Checked against the Home Assistant source (`cast/media_player.py` and `media_player/const.py` on the `dev` branch, 2026-11-16), because it limits what can be built:

- Google Cast players do not report the grouping capability and have no `join`. Home Assistant cannot create a temporary group of Cast speakers; those groups are made in the Google Home app and appear as their own media player. Temporary grouping therefore works only for integrations that do report it.
- A playing Cast group makes its members report the group's media, and Home Assistant does not expose which speakers belong to a group. The dashboard has to learn the membership: chosen by the user in the settings, or inferred by the backend. Decide in Phase 2.
- For a Cast player `turn_off` quits the casting app, which is what "stop casting" means; `media_stop` only stops the media. Other integrations may differ, so the backend picks the service per player.

### 2.13 First-run setup, sign-in and device pairing (added 2026-11-16)

- A first-run setup walks through: language and theme, the Home Assistant connection, how people sign in, rooms taken from Home Assistant areas, optional features (several speakers, EV charging, network sources) and the child lock. Every step can be skipped and the setup says so. It runs once: there is no way to run it again, because that reads as wiping everything. Instead every choice it offers is in the settings (decision 2026-11-17).
- When it runs: in Phase 1, on a device with no stored configuration. From Phase 2 the configuration lives in the backend, so the installation is set up once; a new device then gets only the device steps (language, theme, child lock, pairing).
- Sign-in is enforced by the backend, never by the browser alone. A login screen in the frontend only would protect nothing. Two modes, no password store of our own:
  - Behind a sign-in proxy: the backend trusts the identity the proxy passes on, and only from that proxy.
  - Home Assistant account: people sign in at Home Assistant with the account they have.
- Device pairing for a wall tablet: the tablet shows a short-lived code, a signed-in person approves it on another device, and the tablet gets its own long-lived session that can be revoked. Reason: on 2026-11-16 the identity provider's login page did not render on the iPad Air 2 (Safari 15) and its session ends when the browser closes.
- No access token is typed into the dashboard during setup. The connection uses the token from a Secret, set up on the server (a sign-in at Home Assistant from the setup is parked, 2026-11-18). This keeps the rule that the browser never handles a Home Assistant credential.
- Not verified: whether Home Assistant's own sign-in page renders on Safari 15. If it does not, pairing is the only way in for that tablet.

### 2.14 One style for every page (added 2026-11-17)

- Every page a browser can open uses the site's style: the design tokens, light and dark theme and the EN/NL switch. This includes pages the server renders itself: signed out, sign-in failed, not found and errors. None of them is bare HTML or plain text.
- Plain text or JSON is only for responses that are never shown as a page: `/healthz`, the API and requests made by the page's own script.
- A new page or server response for a browser follows this before it ships. Tests check it: every frontend HTML file loads the tokens, and the server's notice pages load the shared stylesheet.

### 2.15 Sheets close with a pull down (added 2026-11-19)

- Every sheet (room, settings, music, setup and the other panels that slide up) shows the iOS-style handle at the top, which suggests that pulling down closes it. That must be true: dragging the sheet down by its handle or header follows the finger, and letting go past a threshold, or with a quick flick, closes it. Otherwise it springs back.
- A pull that starts inside scrolled content scrolls that content; only at its top does a further pull move the sheet, as on iOS.
- Works with touch on Safari 15 (iPad Air 2) and current iPhone Safari, and with a mouse drag on desktop. The close button and Escape stay.
- Respects reduced motion (no spring animation, it simply closes). A sheet that must not be dismissed by accident (an unsaved form, a confirmation, the child lock PIN) asks or ignores the pull instead.

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

### 5.9 Music with several speakers (mocked, added 2026-11-16)

- [x] Music card for no, one and several active speakers, with dynamic tabs.
- [x] Compact overview of active speakers and groups.
- [x] Synthetic speakers with different capabilities, a permanent group and its members, and an unavailable speaker.
- [x] Stop casting for the selected target only.
- [x] Temporary grouping sheet with selection per speaker and per room, offered only where the capability exists.
- [x] Room names from the existing room configuration.
- [x] Settings section for everything in 2.12.
- [x] A room that has music playing says so on the floor plan and in the room list.

Mock decisions: group members are chosen in the settings (Home Assistant does not expose them); a temporary group is led by its first speaker and dissolving it stops the others; with multi-speaker support off the card follows the preferred speaker only; the stop button carries the target's name. (Unit tests and browser check; not on real speakers or the real tablet.)

Accepted when: the tabs and the overview follow playback without a reload; a group hides its members only while they play the same thing; stopping or grouping one target leaves the others untouched; a speaker without a capability shows no control for it; and a managed speaker that does not exist is reported.

### 5.10 First-run setup (mocked, added 2026-11-16)

- [x] Setup on a clean device, with the six steps of 2.13, skippable and resumable after a reload. Everything it offers is also in the settings; a test keeps the two in step.
- [x] Connection, sign-in and pairing steps as designs, each labelled as a demo that connects to nothing and protects nothing.
- [x] Rooms, optional features and child lock steps change the real configuration.

(Unit tests and browser check; not on the real tablet.)

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
- [x] No live HA calls or credentials are present. (At Phase 1: Content-Security-Policy `connect-src 'none'`; privacy check. Since Phase 2 the page allows `connect-src 'self'` to reach its own backend; the demo mode refuses any Home Assistant setting.)
- [x] Public-repository privacy review passes. (`scripts/privacy-check.mjs` and a manual review.)
- [ ] User explicitly approves Phase 1 before Phase 2.

## 6. Phase 2: Functional local web application

**Goal:** connect the approved Phase 1 interface to Home Assistant and operate locally on a PC. No Kubernetes deployment in this phase.

Architecture and breakdown, approved 2026-11-17: [docs/phase-2-architecture.md](docs/phase-2-architecture.md). Step status: the milestone tracker in section 11.

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

### 6.8 Music with several speakers

Not started. Needs the owner's go like the rest of Phase 2.

- [ ] Media player discovery and live state for the managed players, with each player's real capabilities.
- [ ] Group membership: decide between user-chosen members and inference by the backend, then test that members are not listed twice.
- [ ] Controls through media player services, choosing the stop service per player.
- [ ] Temporary grouping through `join` and `unjoin` where the capability is reported; verify with the owner's real speakers which ones qualify.
- [ ] Test combinations of single speakers and groups, missing metadata, and speakers that disconnect.

### 6.9 Sign-in, pairing and setup

Not started. Needs the owner's go like the rest of Phase 2.

- [ ] Backend sessions; proxy mode that accepts identity headers from the configured proxy only.
- [ ] Sign-in with the Home Assistant account. First check that its sign-in page renders on Safari 15.
- [ ] Device pairing: short-lived code, approval by a signed-in person, long-lived revocable device session, list of paired devices in the settings.
- [ ] Setup once per installation in the backend; device steps per device.
- [ ] Threat review of all three before use outside the local network.
- [x] Signed-out, sign-in-failed, not-found and error pages in the site's style with EN/NL (2.14).
- [x] Sheets close with a pull down on the handle (2.15). Checked in a browser at phone size with mouse and touch; still to check on the iPad Air 2 and an iPhone (`docs/device-testing.md`).

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
- Stage 2: the live backend with the Home Assistant token as a sealed secret. Started early, read-only only: the owner approved connecting the preview to the live instance on 2026-11-18 (Phase 2 step 4). Commands stay off until step 10 and its own approval.
- Image: built by a manually dispatched workflow in this repository and published to the GitHub container registry.
- Rollout: a chart in the owner's Helm repository. Nothing changes in the cluster until the owner merges it.
- Until stage 2, the live application is reachable from the development machine only: without a login in front of it, anyone on the network could control the house.
- State 2026-11-23 (checked read-only in the cluster): no demo runs in the cluster any more. The one deployment is the preview in live, read-only mode, behind OIDC, in its own namespace. The public artifacts are the repository and the image, which starts in demo mode by default.
- The preview approval is not an approval for production. Publishing an image, changing the chart or the cluster, and turning on commands each need their own approval (section 11, approval boundaries).

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
- [ ] Music: several speakers and groups on the iPad Air 2 and iPhone 13, including speakers that disconnect, become unavailable or stop, and proof that stopping or grouping one target leaves the others playing.

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

### Status vocabulary

One set of words, used in every table below. Built is not verified, and verified is not approved.

| Status | Meaning |
|---|---|
| Not started | No work yet |
| In progress | Work under way, not yet usable |
| Built, awaiting verification | Merged, but evidence on the target (real Home Assistant, real device) is missing |
| Verified | Automated tests pass and it was observed working where it is meant to run |
| Approved | The owner accepted it, recorded in the approval log |
| Blocked | Cannot continue without an input or approval, named in the notes |

### Current project status

Reconciled 2026-11-23 against the code, the merged pull requests and a read-only look at the cluster.

| Area | Status | Notes |
|---|---|---|
| Phase 0: Preparation | Approved | Stack, repository and privacy baseline in place 2026-11-15 |
| Phase 1: Design/mockup | Approved | The owner moved on to Phase 2 on 2026-11-15. Two acceptance items stay open: fidelity to the references (owner's judgement) and touch on a real device |
| Phase 2: Local application | In progress | Approved 2026-11-17. Read-only steps 1 to 6b built; 7 to 10 not started; see the milestone tracker |
| Phase 3: Cluster deployment | Early preview only | The preview runs in the cluster in live, read-only mode since 2026-11-18. Everything else in Phase 3 is not started and needs its own approval |
| Privacy baseline | Verified | `scripts/privacy-check.mjs` in every verify; history, CI logs and the deployed image checked 2026-11-23 (`docs/security-and-privacy.md`) |
| Target-device testing | Not started | Only "the preview opens on the iPad Air 2 after login" (2026-11-16, reported). The checklist in `docs/device-testing.md` has not been run on any device |

### Phase 2 milestone tracker

| Step | Status | Evidence and what is missing |
|---|---|---|
| 1. Backend skeleton | Verified | Tests pass; runs in the cluster |
| 2. OIDC sign-in | Verified (mocked); device check open | Tests against a fake identity provider; live in the preview. Cookie persistence on Safari 15 not tested |
| 3. Pairing | Built, awaiting verification | Tests pass. Safari 15 cookie test after a restart not done. Gap found 2026-11-23: an open live stream outlives a revoked device |
| 4. Home Assistant, read-only | Verified | Tests against a fake Home Assistant; the preview's log shows it connected to the real instance and reconnecting once |
| 5. Configuration in the backend | Built, awaiting verification | Stale writes refused (tests). Sync between devices checked in browsers only |
| 6. Live states, backend | Built, awaiting verification | Tests pass. Gap found 2026-11-23: one credential-bearing media player attribute is not filtered |
| 6b. Live states, frontend | Built, awaiting verification | Checked against the fake Home Assistant only; not on the devices |
| 7. Energy and climate, read-only | Not started | |
| 8. Network sources | Not started | Needs the field check of the UniFi and Zigbee integrations first |
| 9. Music, read-only | Not started | |
| 10. Commands | Blocked | Needs its own approval; tested only with the owner present |
| 2.14 Styled pages | Verified | Tests |
| 2.15 Pull to close | Built, awaiting verification | Browser only; not on the iPad Air 2 or an iPhone |

### Approval log

| Gate | Approval required to start | Approval recorded |
|---|---|---|
| Phase 1 | Start static design/mockup | Yes, 2026-11-15 (request to build the dashboard following this plan; read as Phase 0 and 1 only) |
| Phase 2 | Start live HA integration/local app | Yes, 2026-11-15 ("proceed with phase 2"); go on the reviewed architecture 2026-11-17 ("Go for phase 2") |
| Early preview | Demo in the cluster for device testing (section 7.0) | Yes, 2026-11-15 ("deploy the early preview version") |
| Live read-only preview | Connect the preview to the live Home Assistant with a token | Yes, 2026-11-18 (go for step 4, "including connecting to the live instance") |
| Device commands | Step 10: any service call to Home Assistant | No |
| Phase 3 | Cluster/container/Helm work beyond the preview | No |
| Production rollout | Deploy approved cluster changes | No |

### Approval boundaries

- Phase 0 and Phase 1: approved and closed.
- Phase 2: approved, being built. Read-only only until step 10 is approved.
- Phase 3: only the preview is approved, read-only. The preview approval is not a production approval.
- Each of these needs the owner's explicit go, even inside an approved phase: publishing an image, changing the chart or anything in the cluster, turning on commands, giving the cluster a new Home Assistant credential.
- Merging a pull request in this repository changes neither the image nor the cluster.

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

## Progress update: 2026-11-17

- Phase: 1 extensions and the early preview (7.0, stage 1).
- Status: preview live on the wall tablet; Phase 2 still waits for the owner's go.
- Completed: settings with child lock, version and commit, diagnostics (2.11, 5.8); multi-speaker music card with tabs or a list, groups, temporary groups and stop casting (2.12, 5.9); first-run setup whose choices are all in the settings (2.13, 5.10); credits for the design inspiration in the README; preview image published by a manual workflow for amd64 and arm64; Helm chart in the owner's repository; the identity provider now sends Safari 15 and older to its simplified login page, so the iPad can log in.
- Tests/evidence: `scripts/verify.sh` passes (lint, 84 unit tests, privacy check); browser checks per feature; the chart's test boots the pinned image as the pod runs it; the login redirect is tested in the cluster's Traefik version and confirmed live; the owner logged in on the iPad.
- Privacy/security review: passed for every change. Images hold demo data only, no token anywhere.
- Blockers: none.
- Approval needed: go for Phase 2. Decisions for it: how speaker group members are learned (2.12), sign-in mode and pairing (2.13), whether the backend lives in the Home Assistant namespace or its own (7.0).
- Later that day: go given. Decided: Node backend, OIDC sign-in, 30-day device sessions. Step 1 done: the image now runs a Node backend (demo only, no Home Assistant code) instead of nginx.

## Progress update: 2026-11-18

- Approval: the owner gave the go for step 4, the read-only Home Assistant connection, including connecting to the live instance.
- Completed: steps 2 and 3 (OIDC sign-in, pairing) are live; every page uses the site's style (2.14); step 4 built: live mode with a read-only WebSocket client, tested against a fake Home Assistant.
- Verified: a non-admin user may list floors, areas, devices and entities (Home Assistant 2026.11.1 source, no admin check on those commands).
- Live: the preview runs in live mode and is connected to Home Assistant (2026.11.1), read-only. Token: the non-admin one Mira uses, resealed for the dashboard (owner's choice); rotating it in Mira means resealing it for the dashboard too.
- Decided: no "Connect" button in step 5. It is parked as an optional feature for installs without GitOps, with its trade-offs in `docs/phase-2-architecture.md`. Step 5 is the backend configuration store.
- A paired tablet has no edit buttons for the household layout; it is changed on a phone (owner's choice).
- Step 6, backend half: live states from Home Assistant, cleaned of credentials and context, served to signed-in sessions as a snapshot and a stream.
- Step 6b (2026-11-22): the frontend shows the live states. Areas are rooms, Home Assistant floors are floors; controls are read-only until step 10; parts that are not live yet say they show demo data. Checked in a browser against the fake Home Assistant: a state change reaches the screen within a second and a control is refused as read-only.
- Step 5 built: the household's configuration is kept by the backend and shared by all devices (details in `docs/phase-2-architecture.md`). Checked in a browser against the real backend: a browser's configuration moves to the backend once, a fresh tablet shows it and skips the setup, a stale save is refused.

## Progress update: 2026-11-23

- Phase: 2 (review, no build work).
- Status: documentation reconciled with the code and the cluster after an external review.
- Completed: one status vocabulary; phase, milestone and approval tables brought in line; environment matrix and network architecture written down (`docs/phase-2-architecture.md`); credential and privacy audit of the code, the full git history, all CI logs and the deployed image (`docs/security-and-privacy.md`); read-only and device acceptance lists split into mocked, real-instance and real-device evidence (`docs/testing.md`).
- Found: a media player attribute that carries a Home Assistant access token passes the backend's filter (none present in the live states at the time of the check); an open live stream is not closed when its device is revoked or its session ends; the registry is refreshed every 15 minutes only; Automatic theme still uses the mock sun state in live mode; several documents still described the preview as a demo without a token.
- Privacy/security review: no secret or household data found in the repository, its history, CI logs or the image.
- Blockers: the namespace decision needs the owner's confirmation; the device checklists need the devices.
- Approval needed: see section 11, approval boundaries, and the review summary.

## 12. Open questions / required inputs

Resolve these at the appropriate gate; do not block the planning document on details that can safely wait.

- [x] Provide `dashboard-architecture.png`. The file no longer exists; the owner supplied an equivalent diagram on 2026-11-15, redrawn as text in `docs/architecture.md`.
- [x] Confirm the four reference screenshots are available as project assets. Supplied in the session; kept out of the repository because they show another household.
- [x] Confirm approved home layout/floor-plan source. Decision 2026-11-15: no real floor plan; the plan is generated from the rooms the user configures (section 2.7).
- [ ] Confirm permission and scope for read-only `ha-mcp` discovery.
- [x] Confirm whether dashboard is a separate service or a sidecar. Decision 2026-11-15: a separate Deployment (section 2.6).
- [ ] Owner: confirm the namespace decision A8 (own namespace, as deployed) as authoritative (section 2.6).
- [ ] Confirm desired LAN/VPN access enforcement point during Phase 3 review. Direction 2026-11-15: forward auth at the ingress. Replaced 2026-11-17: OIDC by the backend (or a Home Assistant account), live in the preview.
- [ ] Confirm minimum browser versions after checking iPad Air 2 installed iOS/Safari version. Assumed Safari 15 (iPadOS 15.8 is the last release for that model); the installed version is not confirmed.
- [ ] Owner: create a second long-lived token for the dashboard's Home Assistant user and seal it for the dashboard, so it no longer shares Mira's token and each can be revoked on its own.
- [ ] Phase 2: confirm which Zigbee integration is in use and which fields the UniFi and Zigbee integrations expose through Home Assistant.
- [ ] Phase 2: which of the owner's speakers report the grouping capability, and how group membership is learned (section 2.12).
- [x] Phase 3: NetworkPolicy is enforced (verified 2026-11-01 in the helm-charts repo) and Home Assistant does not use host networking (checked 2026-11-17, read-only). (Answered 2026-11-16: the identity provider's normal login page does not work in Safari 15; its simplified page does, and the cluster now redirects old Safari there.)

## 13. Definition of done

The project is complete when all three phases pass acceptance criteria and approvals; the dashboard reproduces the four approved views; English/Dutch switching is immediate; theme modes behave correctly and remain readable; the iPhone layout hides large artwork in favor of a usable compact interface; iPad Air 2 and iPhone 13 have been tested; required integrations work through REST and WebSocket; local-first and VPN-only access rules are verified; HA API traffic stays inside the Kubernetes namespace; and public repository, CI, images, logs and documentation contain no secrets or household-identifying information.
