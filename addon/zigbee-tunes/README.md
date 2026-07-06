# Zigbee Tunes — Home Assistant App

Z2M Discovery Manager packaged as a Home Assistant app.

## Install (HA OS / Supervised)

1. Open **Settings → Apps** in Home Assistant.
2. Top-right **⋮** menu → **Repositories** → paste the repo URL:
   `https://github.com/Noodlex/zigbee-tunes`
3. Refresh the store. The **Zigbee Tunes** section appears.
4. Click **Zigbee Tunes** → **Install**.

Requirements:

- An MQTT broker app (e.g. **Mosquitto broker**) installed and started.
- Zigbee2MQTT configured with `homeassistant.discovery_topic: z2m_discovery`
  (so Zigbee Tunes intercepts payloads before HA sees them on `homeassistant/...`).

## Configuration

Default options:

| Key | Default | Notes |
| --- | --- | --- |
| `log_level` | `info` | `debug` is verbose, useful when wiring things up |
| `topics_source` | `z2m_discovery` | Where Z2M publishes (must match Z2M config) |
| `topics_target` | `homeassistant` | Where HA listens (don't change unless you know why) |
| `topics_z2m_base` | `zigbee2mqtt` | Z2M's base topic for `bridge/devices` |

Transformation rules (color-temp ranges, area assignments, renames, etc.)
are managed through the **Zigbee Tunes UI**, reachable from the HA sidebar
(panel icon: sliders / `mdi:tune`).

## Storage

- `/data/zigbee-tunes.db` — SQLite database (rules, applied logs). Persisted
  across app restarts/upgrades.

## Update Z2M config

Add this to your Zigbee2MQTT configuration (`/share/zigbee2mqtt/configuration.yaml`):

```yaml
homeassistant:
  discovery_topic: z2m_discovery
```

Restart Z2M. Now Zigbee Tunes receives everything on `z2m_discovery/*` and
republishes the transformed payload on `homeassistant/*`.

## Architecture map

```
Zigbee mesh
   │
   ▼
Zigbee2MQTT  ──publish──►  MQTT broker  (topic: z2m_discovery/*)
                                │
                                ▼
                          Zigbee Tunes  ──republish──►  MQTT broker (topic: homeassistant/*)
                                                          │
                                                          ▼
                                                  Home Assistant
```
