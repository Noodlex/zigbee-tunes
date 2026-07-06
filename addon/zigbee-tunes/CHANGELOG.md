# Changelog

All notable changes to Zigbee Tunes are documented here. The format is
based on [Keep a Changelog](https://keepachangelog.com/), and the project
follows [Semantic Versioning](https://semver.org/).

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
