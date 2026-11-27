# Testing on a real tablet or phone

The targets are an iPad Air 2 (Safari 15, the oldest browser supported) and an iPhone 13. An emulated viewport on a desktop is not a substitute: it uses a different browser engine and has no touch.

## Get the dashboard on the device

**From a checkout, on the internal network:**

```bash
uv run --no-project scripts/serve.py
```

It prints an address to open on the device. Both must be on the same network. On macOS, allow incoming connections for Python when the firewall asks. Responses are never cached, so a reload always shows the current files. Add `--local` to listen on the development machine only.

This serves the demo, which holds synthetic data only.

**Do not serve a live backend this way.** Without a login in front of it, anyone on the network could control the house. The live application reaches a tablet through the cluster deployment behind the identity provider, described in [deployment.md](deployment.md).

**From the cluster:** open the preview's address and sign in, or pair the device. The preview shows live data, read-only.

## What the dashboard tells you

An iPad has no console, so the dashboard reports on itself:

- **A red bar at the top** means a script error. It shows the message and the file. On a blank page this is the first thing to look for.
- **Settings (gear), Diagnostics** lists the browser, the screen size, the layout in use, and a pass or fail per browser feature the dashboard needs.
- **Settings, About** shows the version and the commit. Compare the commit with the repository to be sure the device runs what you think it runs.

## Checklist

Do this in portrait and landscape, in the light and the dark theme, in English and Dutch. Do it on the iPad Air 2 and the iPhone 13 themselves: a desktop browser or an emulator never counts as a pass.

| Screen | Check |
|---|---|
| Home | The floor plan is sharp and every room can be tapped. No sideways scrolling. The top bar fits. |
| Room sheet | Opens and closes. The temperature slider follows the finger for AC and heating. Lights and switches toggle on the first tap. |
| Pull to close | Pull a sheet down by its handle: it follows the finger, closes when let go far enough or with a flick, and springs back after a short slow pull. In a sheet scrolled down, pulling scrolls first. The setup and the PIN pad cannot be pulled away. |
| Energy | Illustration and callouts do not overlap. Charts are sharp. |
| Network | The map is readable without zooming. All, UniFi and Zigbee switch at once. |
| Settings | Opens from the gear. Selects and text fields do not zoom the page. All diagnostics pass. |
| Editing | Add a floor, move a room, reorder a card. Everything works with taps, nothing needs dragging. |
| Child lock | Lock now. Controls answer with "Locked" and nothing switches. Hold for 3 seconds unlocks; letting go early does not. With a PIN, a wrong PIN is refused. It locks again by itself after the set time. |
| Phone | No floor plan, illustration or map; lists instead. The navigation sits at the bottom. |
| Endurance | Leave it open for an hour. It still responds and has not drifted. |
| Sign-in | Sign in with OIDC. Close Safari, reopen: still signed in within the session time. |
| Pairing | Pair the tablet. Close Safari, restart the tablet: still paired. Again after more than 7 days. Remove it under Settings on a phone: the tablet is out at once, including the live view. |
| Live updates | Switch a light by hand or in Home Assistant: the dashboard follows within seconds. Lock and wake the tablet, switch Wi-Fi off and on: the live view recovers without a reload. |
| Floor plan | Every room responds to the first tap; no tap lands on a neighbour. Pinch and scroll do not move the page sideways. |
| Sheets and scrolling | Long sheets scroll inside; the page behind does not. Pull to close as above. |
| Themes | Light, Dark and Automatic in the settings; the choice survives a reload and a Safari restart. Floor plan labels, error bar, dialogs and settings are readable in both themes. |
| Performance | Over the hour, Safari never reloads the tab by itself and taps answer without delay. |
| Automatic theme | In live mode, Automatic follows Home Assistant's sun: it turns dark when the sun sets and light when it rises, without a reload. With the sun entity unavailable it stays light. A manual Light or Dark is never changed by the sun; Off is always light. |
| Theme readability | In both themes: charts, the network map, person pictures, overlays, dialogs, warnings and disabled controls stay readable. |
| Live screens | Energy and the network show the house's real values; parts Home Assistant does not have are left out, never shown as 0, NaN or a dash where a value belongs. |
| People | Each person shows their zone and, where Home Assistant has one, their picture; no coordinates or addresses anywhere. |
| iPhone 13 | Compact layout, navigation, room sheets, settings and configuration editing, theme and language switching, live updates and touch response. |

A failure is anything that needs a second tap, anything cut off or overlapping, text below roughly 13 px, a red bar, or a failed diagnostic.

## A wall tablet

- Switch on the child lock in Settings. It belongs to the device, so other devices are not affected.
- The lock keeps small hands off the controls. It does not stop a child from leaving the dashboard. For that, use the tablet's own app pinning: on an iPad, Guided Access (Settings, Accessibility), started with a triple click of the home button.
- If the PIN is lost: clear the website data for the dashboard in the browser settings. In Phase 1 that also removes the configuration stored in that browser, so export it first when you can.

## Record the result

Note the device, the system version, the commit from Settings, About, whether it was a real device or an emulator, and what failed, in the test report in [testing.md](testing.md). Do not add screenshots that show names you typed.
