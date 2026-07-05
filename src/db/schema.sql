-- SQLite schema for Zigbee Tunes.
-- Minimal tables: devices seen + transformation history.

CREATE TABLE IF NOT EXISTS devices (
  ieee TEXT PRIMARY KEY,
  friendly_name TEXT NOT NULL,
  vendor TEXT NOT NULL DEFAULT '',
  model TEXT NOT NULL DEFAULT '',
  model_id TEXT NOT NULL DEFAULT '',
  groups TEXT NOT NULL DEFAULT '[]',   -- JSON array of friendly_names
  capabilities TEXT NOT NULL DEFAULT '[]',  -- JSON array of strings
  components TEXT NOT NULL DEFAULT '[]',    -- JSON array of strings
  -- Native CCT range as observed in the device's `light` discovery payload.
  -- Nullable: non-CCT devices, or devices we've only seen via bridge/devices.
  native_min_mireds INTEGER,
  native_max_mireds INTEGER,
  last_topic TEXT NOT NULL,
  last_payload TEXT NOT NULL,          -- raw JSON of the last discovery payload
  first_seen INTEGER NOT NULL,
  last_seen INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_devices_vendor ON devices(vendor);

-- One row per discovery TOPIC (not per device): a single device publishes
-- several discovery configs (light + update sensor + power sensor...).
-- refresh() replays every cached topic so a rule change reaches the right
-- entity even when another entity of the same device arrived last.
CREATE TABLE IF NOT EXISTS payload_cache (
  topic TEXT PRIMARY KEY,
  ieee TEXT NOT NULL,
  payload TEXT NOT NULL,               -- raw JSON of the discovery payload
  updated_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_payload_cache_ieee ON payload_cache(ieee);

CREATE TABLE IF NOT EXISTS transformations_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ieee TEXT NOT NULL,
  topic TEXT NOT NULL,
  before TEXT NOT NULL,                -- JSON
  after TEXT NOT NULL,                 -- JSON
  applied_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_log_ieee ON transformations_log(ieee);
CREATE INDEX IF NOT EXISTS idx_log_applied_at ON transformations_log(applied_at);

-- Transformation rules manageable via the API.
-- On first startup, we bootstrap from YAML if this table is empty.
-- After that, this table is the source of truth.
CREATE TABLE IF NOT EXISTS transformers (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  type TEXT NOT NULL,
  targets TEXT NOT NULL,       -- JSON array of patterns
  priority INTEGER NOT NULL DEFAULT 0,
  enabled INTEGER NOT NULL DEFAULT 1,
  config TEXT NOT NULL,        -- JSON of the type-specific fields
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_transformers_type ON transformers(type);
CREATE INDEX IF NOT EXISTS idx_transformers_enabled ON transformers(enabled);
