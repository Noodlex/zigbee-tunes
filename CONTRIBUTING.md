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

## Testing against a real Supervisor

Most questions do not need one. `yarn test` covers the application logic, and
Supervisor behaviour is often settled faster by reading
[the Supervisor source](https://github.com/home-assistant/supervisor) than by
booting anything — `tests/packaging/supervisor-store-scan.test.ts` is that
approach made permanent.

When you do need one — ingress, bashio, `/data` permissions, how the store
reacts to `config.yaml` — `.devcontainer/` runs a real Supervisor and a real
Home Assistant with this repository mounted as a local app store. Docker is
required, and the first run pulls several GB.

- **VS Code** — reopen in container, then run the task **Start Home Assistant**.
- **Any editor** — `npx @devcontainers/cli up --workspace-folder .`, then
  `devcontainer exec --workspace-folder . supervisor_run`.
- **JetBrains IDEs** read `.devcontainer/devcontainer.json` natively. The
  shared `tasks.json` is VS Code-only, so start it with `supervisor_run` from
  a terminal in the container.

Home Assistant comes up on <http://localhost:7123/>. Inside the container, `ha`
drives the Supervisor:

```bash
ha store reload                    # re-scan the repository after editing config.yaml
ha supervisor logs                 # what the Supervisor makes of our files
ha apps info local_zigbee-tunes    # our app, as the store sees it
```

To reproduce something reported against the published repository rather than
the working copy, add it as a store: `ha store repositories add
https://github.com/Noodlex/zigbee-tunes`.

### What it does not test

The app's Dockerfile clones its source from GitHub (`ARG
ZIGBEE_TUNES_REF=main`), because the Supervisor sets the build context to
`addon/zigbee-tunes/` and cannot reach the repository root from there. The
image is therefore built from `main`, **not from your working tree** — changes
to `src/` and `ui/` will not be in it. Change that `ARG` default temporarily to
build a branch.

Files that live in the build context — `run.sh`, `options.template.yaml`,
`config.yaml`, `repository.yaml` — *are* read from your working tree, so the
packaging and startup glue is genuinely covered. Application logic is covered
by `yarn test`. Between the two, nothing is left untested.

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
