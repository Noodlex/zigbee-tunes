# Zigbee Tunes

Z2M Discovery Manager — intercepts Zigbee2MQTT MQTT Discovery payloads,
applies user-defined transformations, and republishes them to Home
Assistant.

Common use cases:

- Clamp color-temperature ranges so the HA UI matches what bulbs actually
  emit (e.g. 250–454 mireds instead of the optimistic 153–500).
- Cap brightness scales for bulbs that misreport their max.
- Bulk-assign devices to HA areas based on friendly-name patterns.
- Rename devices for HA display without breaking entity_ids.

## First-time setup

1. Make sure an MQTT broker add-on is running.
2. Configure Z2M to use a separate discovery topic:
   ```yaml
   # /share/zigbee2mqtt/configuration.yaml
   homeassistant:
     discovery_topic: z2m_discovery
   ```
3. Restart Z2M.
4. Start Zigbee Tunes. The sidebar gains a **Zigbee Tunes** entry — that's the UI.

## Adding rules

Open the **Zigbee Tunes** panel from the sidebar:

- **Devices**: pick one or several, set the transformation in the floating
  panel, click *Apply*.
- **Customizations**: see every device-specific rule, remove individual
  rules or all rules for a device.
- **Dashboard**: fleet stats, MQTT/Z2M/HA connection status, recent
  transformation activity.

Rules are stored in `/data/zigbee-tunes.db` and survive add-on restarts and
upgrades.

## Logs

Set `log_level: debug` in the add-on options to see every payload Zigbee Tunes
processes (heavy — usually only useful during initial setup).
