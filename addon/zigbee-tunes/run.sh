#!/usr/bin/env bashio
# We don't ship s6-overlay (single-process add-on), so we skip the
# `with-contenv` wrapper and rely on Supervisor-provided env vars directly.
# shellcheck shell=bash
# ==============================================================================
# Zigbee Tunes Home Assistant Add-on entrypoint.
# Reads HA options + MQTT service config, materializes
# /tmp/zigbee-tunes.config.yaml from the template, then execs Node.
# ==============================================================================
set -euo pipefail

# ---- 1. Pull MQTT credentials from the HA mqtt service binding ----
# `mqtt:need` in config.yaml guarantees Supervisor injects these. If it
# fails it means the user has no MQTT broker configured in HA — abort with
# a clear message.
if ! bashio::services.available "mqtt"; then
  bashio::exit.nok "No MQTT broker found. Install the 'Mosquitto broker' add-on (or configure an external one) before starting Zigbee Tunes."
fi

mqtt_host=$(bashio::services "mqtt" "host")
mqtt_port=$(bashio::services "mqtt" "port")
mqtt_user=$(bashio::services "mqtt" "username")
mqtt_pass=$(bashio::services "mqtt" "password")
mqtt_ssl=$(bashio::services "mqtt" "ssl")

# Build the broker URL. mqtt:// for plain, mqtts:// over TLS.
if bashio::var.true "${mqtt_ssl}"; then
  scheme="mqtts"
else
  scheme="mqtt"
fi
export MQTT_URL="${scheme}://${mqtt_host}:${mqtt_port}"
export MQTT_USERNAME="${mqtt_user}"
export MQTT_PASSWORD="${mqtt_pass}"

# ---- 2. Pull user options from /data/options.json ----
export LOG_LEVEL="$(bashio::config 'log_level')"
export TOPICS_SOURCE="$(bashio::config 'topics_source')"
export TOPICS_TARGET="$(bashio::config 'topics_target')"
export TOPICS_Z2M_BASE="$(bashio::config 'topics_z2m_base')"

# ---- 3. Materialize the Zigbee Tunes config ----
# Zigbee Tunes itself expands ${VAR} / ${VAR:-default} at load time, so we
# just copy the template — no envsubst needed.
mkdir -p /tmp
cp /etc/zigbee-tunes/config.template.yaml /tmp/zigbee-tunes.config.yaml

bashio::log.info "Starting Zigbee Tunes: broker=${MQTT_URL}, source=${TOPICS_SOURCE}, target=${TOPICS_TARGET}"

# ---- 4. Hand off to Node ----
cd /app
exec node dist/index.js
