# Contributing

Thanks for your interest in Zigbee Tunes. This is a small, focused
project — a Z2M ↔ Home Assistant MQTT Discovery normalizer — so the
guidelines are short.

## Prerequisites

- **Node.js 22.5+** (the DB layer uses the built-in `node:sqlite`, no
  native module to compile)
- **Corepack** enabled once per machine: `corepack enable` (pins the
  Yarn 4 version from `package.json`)
- Docker (optional, for a local Mosquitto broker)

## Setup

```bash
yarn install            # backend deps
cd ui && yarn install   # UI deps (separate package)
```

## Development loop

```bash
docker compose up -d    # local MQTT broker (optional)
yarn dev                # backend with hot reload (:8099)
yarn ui:dev             # Vite dev server (:5173), /api proxied to :8099
```

## Before opening a pull request

Both must be green — CI runs them on every PR:

```bash
yarn typecheck          # strict TypeScript, no errors
yarn test               # the full vitest suite
```

## Code conventions

- **Code and inline documentation in English.** Markdown files may be
  bilingual in separate files (`NAME.md` for English, `NAME.fr.md` for
  French) — keep both in sync.
- **No code duplication.** If the same logic appears in two places,
  extract a shared helper (see `ui/src/utils/`, `src/transformers/`).
- **Strict TypeScript.** No `any` where a real type fits; the typecheck
  must pass.
- **i18n:** every UI string lives in `ui/src/i18n/locales/en.json` *and*
  `fr.json`. The i18n parity test fails the build if a key exists in one
  locale but not the other, or if interpolation params differ.
- **Tests** stay green after each commit. Add tests for new transformer
  types, target patterns, or parser rules.

## Scope

Zigbee Tunes intentionally stays a **one-way discovery normalizer**: it
rewrites what Home Assistant *sees* about devices. It is not an
automation engine and does not control devices. Feature proposals that
cross into runtime device control are likely out of scope — open an
issue to discuss before investing in a PR.
