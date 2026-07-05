# FINDINGS

Production validation notes captured during Phase 0 (POC) and Phase 1
(real-fleet rollout).

> Other languages: [Français](FINDINGS.fr.md)

---

## Phase 0 — POC validation (2026-05-20)

### Z2M discovery payload format (captured from production)

**Environment:** Z2M 2.10.1, HA Core 2026.5.3, HA OS 17.3 (aarch64 /
Raspberry Pi 4).

**Topic structure:** `homeassistant/light/<ieee>/light/config`. The
`+/+/+/config` wildcard captures correctly. Mosquitto accepts accented
characters and spaces in derived topics (e.g.
`zigbee2mqtt/Salle à manger 4`).

**Fields present in a Z2M 2.10.1 CCT light payload:**

```jsonc
{
  "availability": [                          // array of objects (not a string!)
    { "topic": "zigbee2mqtt/bridge/state",
      "value_template": "{{ value_json.state }}" }
  ],
  "brightness": true,
  "brightness_scale": 254,
  "command_topic": "zigbee2mqtt/<friendly>/set",
  "default_entity_id": "light.<object_id>",  // used by HA for the entity_id
  "device": {
    "hw_version": <int>,
    "identifiers": ["zigbee2mqtt_<ieee>"],
    "manufacturer": "Innr|IKEA|YSRSAI|...",
    "model": "<full marketing name>",
    "model_id": "<short ref>",               // e.g. "RS 227 T"
    "name": "<friendly_name>",
    "sw_version": "<x.y.z>",
    "via_device": "zigbee2mqtt_bridge_<bridge_ieee>"
  },
  "effect": true,
  "effect_list": [...],
  "max_mireds": <int>,                       // PRESENT at top-level ✓
  "min_mireds": <int>,                       // PRESENT at top-level ✓
  "name": null,                              // null -> HA falls back on device.name
  "object_id": "<friendly>",
  "origin": { "name": "Zigbee2MQTT", "sw": "2.10.1", "url": "..." },
  "schema": "json",
  "state_topic": "zigbee2mqtt/<friendly>",
  "supported_color_modes": ["color_temp"] | ["xy", "color_temp"],
  "unique_id": "<ieee>_light_zigbee2mqtt"
}
```

**No `color_temp_kelvin`** in Z2M 2.10.1 — mireds remain the source of
truth. Worth keeping an eye on in future Z2M versions.

**Groups:** Z2M also publishes discovery payloads for groups (e.g.
`Cuisine`, `Salon`). Same payload shape with `device.model: "Group"` and
`device.manufacturer: "Zigbee2MQTT"`. The topic id is an encoded number
like `1221051039810110150109113116116_<group_id>`. **The proxy clamps
groups as well**, which is exactly the target use case.

**QoS:** Z2M publishes with QoS 0. The proxy publishes with QoS 1, the
simulator was aligned to QoS 0 for fidelity. No functional difference
for retained messages.

**Ranges observed in the real fleet** (24 lights):

| Vendor | Model                 | Mireds range | Kelvin range |
|--------|-----------------------|--------------|--------------|
| Innr   | RS 227 / 228 / 229 T  | 200-454      | 2200-5000K   |
| IKEA   | LED1545G12, LED1732G11| 250-454      | 2200-4000K   |
| YSRSAI | YSR-MINI-01_wwcw      | 153-500      | 2000-6535K   |

- **Honest intersection:** 250-454 (2200-4000K).
- Typical Zigbee Tunes use case: harmonize the whole fleet to a common range
  chosen by the user, without reconfiguring each bulb individually.

### Verified Phase 0 behaviors

- **Mireds transformation:** the proxy correctly clamps `min_mireds`
  and `max_mireds` within the target interval.
- **Anti-loop:** exactly N log lines (one per device) on startup, then
  silence. No re-processing loop. The distinct source/target topic
  structure guarantees no MQTT loop.
- **Retained persistence across restarts:** the verifier receives the
  3 `homeassistant/...` messages even before the proxy is restarted —
  Mosquitto retained them from a previous proxy run. Restarting the
  proxy does not introduce visible duplication broker-side.
- **Subscribe re-fetches retained:** at startup, the proxy immediately
  receives the retained source-topic messages and retransforms them.
  Expected MQTT behavior for QoS 1 with retain.

### Pitfalls hit

- **PowerShell execution policy** blocks `yarn.ps1` initially. Resolved
  with `Set-ExecutionPolicy -Scope CurrentUser RemoteSigned`. Worth
  flagging in the README for future Windows contributors.
- **Yarn version guesses are unreliable** — never trust a "latest"
  version number quoted from memory. Always check via
  `npm view yarn version` or the GitHub releases API.

### Phase 0 recommendation

- [x] **GO** — the concept holds, move to Phase 1.

The proxy intercepts, transforms and republishes as expected. The only
remaining uncertainty (exact shape of Z2M 2.x payloads) is removed by
capturing real payloads from the user's actual Z2M before writing the
Phase 1 code.

---

## Phase 1 — Production validation (2026-05-24)

Zigbee Tunes launched against a real Mosquitto add-on broker on the LAN,
authenticated with a dedicated MQTT user. Z2M was reconfigured with
`homeassistant.discovery_topic: z2m_discovery` via the Z2M frontend and
restarted.

### Step 1 — Zigbee Tunes idle, Z2M still on `homeassistant`

- Broker connection + auth OK
- `bridge/devices` received: **40 devices** catalogued (lights, sensors,
  smart plugs, switches, coordinator)
- No message on `z2m_discovery/...` (expected — Z2M not switched yet)
- HA strictly unchanged

### Step 2 — Z2M switches to `z2m_discovery`

- **22 transformations applied** in ~15 seconds:
  - Innr 200-454 -> 250-454 (min clamped)
  - YSRSAI 153-500 -> 250-454 (both ends clamped)
  - Z2M groups (Salle à manger, Plan de travail, Salon) **also clamped**
    — primary use case validated
- No-op detection confirmed: IKEA (already 250-454), Cuisine 1/2, group
  Cuisine -> zero unnecessary republish
- Non-light devices pass through untouched
- HA UI: the color-temperature sliders now correctly show 2200K-4000K
  for all clamped lights
- Risk window during the Z2M restart: **invisible HA-side** (<1s between
  Z2M publishing and Zigbee Tunes republishing)

### MQTT persistence

As long as Zigbee Tunes is running, the retained payloads on `homeassistant/...`
are kept fresh. If Zigbee Tunes stops, HA keeps the last clamped state (the
retained messages stay in the broker) but stops receiving updates until
Zigbee Tunes restarts. For long-term production use, the HA add-on packaging
(Phase 4) remains necessary.

### Phase 1 recommendation

- [x] **VALIDATED IN PRODUCTION** — move to Phase 2 (REST API + Web UI)
      or Phase 4 (HA add-on packaging) based on user priority.
