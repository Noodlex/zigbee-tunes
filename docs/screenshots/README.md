# Screenshots

The images referenced by `README.md` and `README.fr.md`. Both languages share
the same files, so the UI is captured **in English**.

- `devices.png` — the Devices grid with a selection open, showing the bulk
  editor bounded by the selection's native range. Note that picking the first
  device auto-filters the grid to similar ones; that is deliberate, and worth
  showing.
- `edit.png` — the configuration dialog: the slider with its native bounds and
  safe intersection, the mireds/percent switch, and the fleet listed for
  assignment.
- `customizations.png` — the configurations in use, colour-coded, with the
  devices on each.
- `dashboard.png` — connection status, recent activity, fleet breakdown.

Recommended: PNG, ~1200–1600px wide, light **or** dark theme (be consistent).
Crop out the browser chrome.

## Before publishing one

**The Dashboard shows the broker URL.** An earlier version of this file claimed
it did not — it does, under the MQTT tile. Capture against a local broker so it
reads `mqtt://localhost:1883` rather than a LAN address.

Device friendly names are visible throughout and describe a home's layout.
IEEE addresses are harmless. Neither is secret, but both are yours: decide
deliberately rather than by default.

## Reproducing the environment

Screenshots taken against an empty broker show a fleet with no native colour
temperature ranges, which hides the safe-intersection hint — the very thing
`edit.png` exists to show. Replay the stored discovery payloads to the local
broker first so the ranges populate.
