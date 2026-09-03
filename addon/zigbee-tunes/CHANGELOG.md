# Changelog

All notable changes to Zigbee Tunes are documented here. The format is
based on [Keep a Changelog](https://keepachangelog.com/), and the project
follows [Semantic Versioning](https://semver.org/).

## 1.4.0 — Take a device off a configuration, and see the rules that do nothing

### Added
- The rule editor's device list now controls **membership**, not just
  additions. Devices already on a configuration arrive ticked; unticking one
  takes it off, with what will happen spelled out on the row and counted
  separately in the footer. Removing and adding are not the same operation, and
  one number cannot carry both.

  Offered when the whole configuration is the subject. Editing a single device
  out of a group leaves the others untouched by definition, so unticking them
  there would promise something the save does not do.

- **Rules affecting no device** are surfaced in their own block, with a
  "0 device" badge and a way to delete them. A rule lands there when its targets
  match nothing — a device removed from Zigbee2MQTT, say — or when a
  higher-priority rule wins everywhere.

  Nothing showed these before, and not by oversight: the configurations list is
  built from devices, so a rule nobody carries is structurally absent from it.

### Fixed
- The page now declares the language it is actually rendering. Only switching
  the language by hand ever set it, so a visitor who never touched the toggle
  got a page announcing itself in the wrong language to screen readers and
  translation tools. Nothing showed this on screen, which is why it lasted.
- Editing a bound no longer scrambles the device list underneath it. Members
  used to drop out of "on this configuration" the moment a value changed and
  reappear as if they were leaving it — while still ticked to be kept.
- A device on a configuration is now always listed, even when it advertises no
  capabilities (a Zigbee2MQTT group, or one whose capabilities were never
  published). It could previously be held on the configuration with no way to
  take it off.
- A failed save no longer leaves the dialog holding rules that may already be
  gone, where retrying would fail forever. It closes when part of the work
  landed, and stays open — edits intact — when nothing did.

## 1.3.0 — Put a device on a configuration without leaving the dialog

### Added
- The rule editor now **lists the fleet**, so another device can join a
  configuration from the dialog that defines it. Before, that meant going to
  the Devices page, finding the device, and re-typing the same values — and
  they had to match exactly, or you silently created a second configuration
  instead of joining the first.

  Devices are grouped by what ticking one would actually do: those already on
  the configuration (folded away, nothing to decide), those on a **different**
  configuration of the same type, and those with none. The middle group spells
  out what a device would leave — applying a rule drops it from its previous
  one of the same type, so an addition costs it its old configuration, and that
  should be a decision rather than a discovery afterwards.

  Devices a rule cannot act on are left out: a colour-temperature range means
  nothing to a contact sensor. So are devices already governed by a broader
  rule that outranks what an assignment would create — those are listed with
  the reason but cannot be ticked, because the tick would save without
  changing anything.

### Changed
- The repository now announces itself as **Zigbee Tunes** in the Home Assistant
  store, and the app calls itself an app throughout — including the message you
  see when no MQTT broker is configured. Home Assistant retired "add-on"; the
  wording here had not caught up.

### Fixed
- The backend no longer logs a Fastify deprecation warning on every start. The
  option it complained about was gating log calls that were already no-ops, and
  Fastify 6 removes it outright.
- `engines.node` said 22.5+, which stopped being true: Vite 8 needs 22.12, and
  vitest 4 supports 22 or 24 but **not 23**. It now says `^22.12.0 || >=24.0.0`,
  matching what CI and both Docker images already run. Only affects building
  from source.

### Under the hood
- A devcontainer runs a real Supervisor and a real Home Assistant against a
  working copy, for the questions reading the source cannot settle — ingress,
  bashio, `/data`, how the store reacts to `config.yaml`. CONTRIBUTING says what
  it does and does not cover.
- A test replays the Supervisor's own app-config scan over the repository, so
  the warnings fixed in 1.2.1 cannot come back unnoticed.

## 1.2.1 — Quieter Supervisor logs

### Fixed
- The Supervisor no longer warns about `config.example.yaml` and
  `config.template.yaml` at every startup. It scans a repository added as an
  app store for files that look like an app config, tried to parse those two,
  and logged `Invalid app config!` for each — one is the standalone Docker
  example, the other the entrypoint's template, and neither describes an app.
  They are now `example-config.yaml` and `options.template.yaml`, outside what
  the Supervisor picks up. Harmless noise, but noise on every boot. A
  regression test now replays the Supervisor's own scan over the repository,
  so a stray file cannot bring the warnings back. Reported in #5.

### Changed
- Dependencies were brought up to date, including several major versions.
  Backend: `@fastify/cors` 10 → 11, `@fastify/static` 9 → 10, TypeScript 7
  (the native compiler), vitest 3 → 4. UI: Vite 6 → 8, vue-router 4 → 5,
  `@vitejs/plugin-vue` 5 → 6, vue-tsc 3. Toolchain: Yarn 4.18. No behaviour
  change is intended — the full suite and both builds pass on the new
  versions — but this is a large toolchain move for a patch release, so it is
  worth knowing about if you build the image yourself.

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
