# Changelog

All notable changes to Zigbee Tunes are documented here. The format is
based on [Keep a Changelog](https://keepachangelog.com/), and the project
follows [Semantic Versioning](https://semver.org/).

## 1.2.1 — Quieter Supervisor logs

### Fixed
- The Supervisor no longer warns about `config.example.yaml` and
  `config.template.yaml` at every startup. It scans an add-on repository for
  files that look like an add-on config, tried to parse those two, and logged
  "Invalid Add-on config" for each — one is the standalone Docker example, the
  other the entrypoint's template, and neither describes an add-on. They are
  now `example-config.yaml` and `options.template.yaml`, outside what the
  Supervisor picks up. Harmless noise, but noise on every boot. Reported in #5.

## 1.2.0 — Set a range on a slider, in mireds or in percent

### Added
- Ranges are set with a **slider** bounded by what the targeted devices can
  actually do: dragging shows how much of their capability is being cut
  instead of typing mireds blind. The axis carries its own scale — its ends
  are its bounds — and the span every targeted device can honour is drawn as
  a band on the track. The bounds follow the chosen scope: one device shows
  its own range, a whole group shows the envelope of all of them.
- Each bound can be entered **in mireds or as a percentage** of that range
  (0% = the low end of the axis, 100% = the high end), whichever is easier to
  reason about. Brightness gets the same switch, its percentage relative to
  254 — the native maximum. Percentages resolve to the stored unit
  immediately, so rules keep holding absolute values and a configuration is
  still shared by the devices that use it.
- A device card's rule list can now **edit** as well as remove, opening the
  same dialog with the same scope question — correcting a value no longer
  means switching pages.
- **Creating** a rule from the Devices page uses that same editor, so
  creating and changing a rule look and behave alike.

### Fixed
- A rule that cannot overlap a device's advertised range no longer produces
  an inverted window. Asking for "no cooler than 500 mireds" from a bulb that
  stops at 454 published `min_mireds 500 / max_mireds 454`, which Home
  Assistant shows as a broken colour-temperature slider. Such a device is now
  left with the range it actually advertises. **This affected 1.0.0 and
  1.1.0.**
- The editors refuse to save a range whose min is above its max, and dragging
  a slider handle past the other swaps them instead of producing an empty
  range.
- Devices that share no common colour-temperature range at all are called out
  explicitly, instead of showing a safe zone that doesn't exist.

## 1.1.0 — Edit rules without leaving Customizations

### Added
- Edit a rule in place from the **Customizations** page: the values are
  prefilled and, for `color-temp-range`, the device's native mireds range is
  shown while editing. Previously a change meant going back to Devices,
  re-selecting the device and re-applying.
- Rule tags are coloured by **configuration** (type + values) instead of type,
  so devices normalized identically share a colour and an edited device
  visually leaves its group. `entity-rename` stays neutral — its value is
  unique per device.
- A **Configurations** list above the devices, one line per distinct
  configuration with its colour, values and how many devices use it. Each
  line can be edited for all its devices at once, or removed from all of
  them.
- Editing happens in a dialog, which asks **what to apply the change to**
  before showing the values: that device alone — it becomes a separate
  configuration — or every device using it. The question only appears when
  the configuration is actually shared, and the default never touches other
  devices.

Saving an edit reuses the existing smart-apply path: one atomic refresh.

## 1.0.0 — First public release

Zigbee Tunes normalizes the MQTT Discovery payloads Zigbee2MQTT publishes
before Home Assistant sees them — so a mixed-brand fleet looks consistent
in HA without touching the physical devices.

### Transformers
- `color-temp-range` — clamp `min_mireds` / `max_mireds`
- `brightness-range` — cap `brightness_scale`
- `suggested-area` — auto-assign HA areas on first import
- `entity-rename` — safe display-name override (keeps entity_ids intact)

### Targeting
- Six patterns: `*`, `<ieee>`, `@vendor:`, `@group:`, `@model:`,
  `@friendlyname:` (with `*` prefix match)
- Priority-based resolution — the most specific matching rule wins per type

### Web UI (through HA Ingress)
- Devices grid: multi-select (Shift+Click range), capability filters,
  native color-temp range hints and a "safe intersection" when bulk-editing;
  capability-less devices hidden by default
- Customizations ledger with one-click undo, per rule or per device
- Dashboard: MQTT / Z2M / HA status, uptime, recent activity, and a fleet
  breakdown whose bars jump to a pre-filtered Devices view
- English / French, dark / light / auto, responsive, keyboard-accessible

### Under the hood
- Atomic smart-apply (no duplicate-rule accretion)
- Per-topic discovery cache so a rule change reaches the right entity
  without waiting for a Z2M restart
- Z2M group lifecycle tracking; transformation log pruned daily
- Node.js + TypeScript backend (Fastify, built-in `node:sqlite`), 81 tests

### Packaging
- Home Assistant app (amd64, aarch64) with Ingress
- Standalone Docker image
