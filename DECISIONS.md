# DECISIONS — Technical choices and rationale

This file tracks the structural decisions of the project and their "why".
Update it whenever a non-trivial choice is made.

> Other languages: [Français](DECISIONS.fr.md)

---

## D-001 — Node.js + TypeScript stack

**Date:** 2026-05-20
**Status:** Locked in
**Decision:** Backend on Node.js 20 LTS + strict TypeScript.

**Why:**
- Zigbee2MQTT itself is written in Node.js + TypeScript. Staying close
  to the tool we extend simplifies source-code understanding, lets us
  reuse the same libraries (`mqtt.js`), and keeps open the option of
  merging or contributing upstream later.
- The developer already has JS/TS experience.
- Mature MQTT ecosystem: `mqtt.js` is the library Z2M itself uses,
  battle-tested against Mosquitto and all HA-friendly brokers.

**Alternatives ruled out:**
- Java / Spring Boot: heavier Docker image (~250 MB vs ~80 MB), no
  significant HA add-on precedent in Java, lukewarm HA community.
- Python: excellent HA fit but the developer doesn't know it, and
  learning while shipping multiplies risk.
- Go: ultra-light binary but learning curve and a thinner HA-side
  ecosystem than Node.
- Bun / Deno: interesting but less mature for the specific MQTT /
  SQLite libraries we need. Worth reconsidering in 1-2 years.

---

## D-002 — No real Z2M in the Phase 0 docker-compose

**Date:** 2026-05-20
**Status:** Locked in for Phase 0
**Decision:** The docker-compose only contains Mosquitto. The role of
Z2M is played by a Node.js simulator script that publishes discovery
payloads on the source topic.

**Why:**
- Zigbee2MQTT needs a physical USB Zigbee dongle (host passthrough) to
  run. No officially supported software simulator exists.
- Testing in isolation therefore requires simulating Z2M's MQTT output,
  not Z2M itself.
- This decouples tests from hardware and enables fast iteration.

**Follow-up:**
- Once Phase 0 is validated, the next step is to capture real payloads
  via `mosquitto_sub` on the actual Z2M instance, diff them against the
  simulator fixtures, and tune if needed.

---

## D-003 — POC scripts run on the host, not in Docker

**Date:** 2026-05-20
**Status:** Locked in for Phase 0
**Decision:** Mosquitto runs in Docker, but `simulator`, `proxy` and
`verifier` run directly on the dev machine via `tsx`.

**Why:**
- Phase 0 is the fast-iteration phase. Rebuilding a Docker image after
  every proxy edit would needlessly slow down the loop.
- Mosquitto has no reason to run on the host (zero useful host
  dependency), so we containerize it.
- Once the proxy stabilizes (end of Phase 1) we containerize it too for
  the HA add-on distribution.

---

## D-004 — Anti-loop via in-memory payload cache

**Date:** 2026-05-20
**Status:** Locked in for Phase 0
**Decision:** The proxy keeps a `Map<topic, string>` of the last payload
published per topic. If an incoming message would produce the same
serialized payload as the last one we already published, we skip the
republish.

**Why:**
- Avoids an infinite loop if ever the source and target topics overlap
  (misconfiguration, multiple proxy instances, etc.).
- Reduces useless MQTT churn.
- Trivial to implement, sufficient for Phase 0.

**Limitation:** the cache is lost on restart. That's intentional: at
startup the proxy republishes everything retained anyway, so the first
pass is naturally complete.

---

## D-005 — Yarn 4 (Berry) via Corepack, node_modules linker

**Date:** 2026-05-20
**Status:** Locked in
**Decision:** The package manager is **Yarn 4** (a.k.a. Berry),
bootstrapped automatically via **Corepack** (built into Node 16.10+).
The linker is set to `node-modules` (not PnP) in `.yarnrc.yml`.

**Why Yarn 4 over npm:**
- More reliable and faster dependency resolver.
- `yarn dlx` (equivalent of `npx`) without polluting the global registry.
- Native workspaces, clean for the future backend + frontend split.
- The Z2M / Home Assistant ecosystem isn't tied to any package manager,
  so the choice is ours.

**Why Corepack over a global install:**
- The `packageManager` field in `package.json` pins the exact version.
- Anyone who clones the repo automatically gets the right Yarn version
  without installing anything (Corepack fetches it on the fly).
- Perfect reproducibility, zero friction.

**Why `nodeLinker: node-modules` and not PnP:**
- Maximum compatibility with `tsx`, third-party tooling and VS Code
  (no PnP SDK to set up).
- PnP has real benefits (perf, strict isolation) but adds setup for
  no visible gain on a project of this size.
- Revisitable later if perf becomes a bottleneck.

---

## D-006 — The helper offers multiple strategies, never a single value

**Date:** 2026-05-20
**Status:** Locked in — implementation deferred to Phase 2/3 (helper UI),
data model must already accommodate it from Phase 1.
**Decision:** When the user selects a group of bulbs to create a
normalization rule, the helper **never suggests a single value**. It
offers at least three strategies with their explicit trade-offs:

1. **Intersection** — the range every bulb supports physically. Honest
   but conservative. No saturation.
2. **Majority (mode)** — the range of the most represented sub-group in
   the selection. Minorities saturate at the extremes.
3. **Union** — the widest range possible. Several bulbs will saturate
   at both ends. Uniform HA UI but unfaithful.

Plus a **Custom** option where the user enters arbitrary values.

**Why:**
- A bulb fleet is rarely homogeneous. Forcing the intersection
  unfairly penalizes the majority when a few bulbs have wider (or
  narrower) physical capabilities.
- The user has to understand what they're picking — each strategy ships
  with an explicit sentence about the effect on the minorities.
- Avoids the "magic number" effect where the user applies a
  recommendation without grasping why.

**Consequence for the data model:**
- A rule's `targets` field is always an **explicit list** (no implicit
  "all"). Accepted patterns: individual IEEE addresses, `@group:<name>`,
  `@vendor:<name>`, `@model:<name>`, `@friendlyname:<name>`, `*`.
- A numeric `priority` lets multiple rules coexist: the most specific
  one wins.
