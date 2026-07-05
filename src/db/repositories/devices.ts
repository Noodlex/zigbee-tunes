import type { Db } from '../connection.js';
import type { Device } from '../../types.js';

interface DeviceRow {
  ieee: string;
  friendly_name: string;
  vendor: string;
  model: string;
  model_id: string;
  groups: string; // JSON
  capabilities: string; // JSON
  components: string; // JSON
  native_min_mireds: number | null;
  native_max_mireds: number | null;
  last_topic: string;
  last_payload: string;
  first_seen: number;
  last_seen: number;
}

function safeJsonArray(s: string | null | undefined): string[] {
  if (!s) return [];
  try {
    const parsed = JSON.parse(s);
    return Array.isArray(parsed) ? (parsed as string[]) : [];
  } catch {
    return [];
  }
}

function rowToDevice(r: DeviceRow): Device {
  return {
    ieee: r.ieee,
    friendly_name: r.friendly_name,
    vendor: r.vendor,
    model: r.model,
    model_id: r.model_id,
    groups: safeJsonArray(r.groups),
    capabilities: safeJsonArray(r.capabilities),
    components: safeJsonArray(r.components),
    native_min_mireds: r.native_min_mireds,
    native_max_mireds: r.native_max_mireds,
    last_topic: r.last_topic,
    first_seen: r.first_seen,
    last_seen: r.last_seen,
  };
}

export class DeviceRepository {
  constructor(private readonly db: Db) {}

  upsert(device: Device, lastPayload: string): void {
    // node:sqlite binds parameters by position (?) or by name (:name).
    // We stick with positional binding to keep things simple.
    //
    // native_min/max_mireds are NOT overwritten on conflict when the new
    // value is null: this protects the value we learned from a previous
    // discovery payload when a later upsert (e.g. from bridge/devices
    // alone) doesn't carry the range.
    this.db
      .prepare(
        `INSERT INTO devices (ieee, friendly_name, vendor, model, model_id, groups, capabilities, components, native_min_mireds, native_max_mireds, last_topic, last_payload, first_seen, last_seen)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(ieee) DO UPDATE SET
           friendly_name = excluded.friendly_name,
           vendor = excluded.vendor,
           model = excluded.model,
           model_id = excluded.model_id,
           groups = excluded.groups,
           capabilities = excluded.capabilities,
           components = excluded.components,
           native_min_mireds = COALESCE(excluded.native_min_mireds, devices.native_min_mireds),
           native_max_mireds = COALESCE(excluded.native_max_mireds, devices.native_max_mireds),
           last_topic = excluded.last_topic,
           last_payload = excluded.last_payload,
           last_seen = excluded.last_seen`,
      )
      .run(
        device.ieee,
        device.friendly_name,
        device.vendor,
        device.model,
        device.model_id,
        JSON.stringify(device.groups),
        JSON.stringify(device.capabilities),
        JSON.stringify(device.components),
        device.native_min_mireds,
        device.native_max_mireds,
        device.last_topic,
        lastPayload,
        device.first_seen,
        device.last_seen,
      );
  }

  findByIeee(ieee: string): Device | null {
    const row = this.db.prepare('SELECT * FROM devices WHERE ieee = ?').get(ieee) as unknown as
      | DeviceRow
      | undefined;
    return row ? rowToDevice(row) : null;
  }

  findAll(): Device[] {
    const rows = this.db.prepare('SELECT * FROM devices').all() as unknown as DeviceRow[];
    return rows.map(rowToDevice);
  }

  /** Returns all devices with their last raw discovery payload (JSON string). */
  findAllWithPayloads(): Array<{ device: Device; lastPayload: string }> {
    const rows = this.db.prepare('SELECT * FROM devices').all() as unknown as DeviceRow[];
    return rows.map((r) => ({ device: rowToDevice(r), lastPayload: r.last_payload }));
  }

  updateGroups(ieee: string, groups: string[]): void {
    this.db.prepare('UPDATE devices SET groups = ? WHERE ieee = ?').run(JSON.stringify(groups), ieee);
  }

  updateCapabilities(ieee: string, capabilities: string[], components: string[]): void {
    this.db
      .prepare('UPDATE devices SET capabilities = ?, components = ? WHERE ieee = ?')
      .run(JSON.stringify(capabilities), JSON.stringify(components), ieee);
  }

  // ---- payload_cache: one row per discovery topic ----

  upsertPayload(ieee: string, topic: string, payload: string): void {
    this.db
      .prepare(
        `INSERT INTO payload_cache (topic, ieee, payload, updated_at) VALUES (?, ?, ?, ?)
         ON CONFLICT(topic) DO UPDATE SET ieee = excluded.ieee, payload = excluded.payload, updated_at = excluded.updated_at`,
      )
      .run(topic, ieee, payload, Date.now());
  }

  findAllPayloads(): Array<{ ieee: string; topic: string; payload: string }> {
    return this.db
      .prepare('SELECT ieee, topic, payload FROM payload_cache')
      .all() as unknown as Array<{ ieee: string; topic: string; payload: string }>;
  }

  findPayloadsByIeee(ieee: string): Array<{ topic: string; payload: string }> {
    return this.db
      .prepare('SELECT topic, payload FROM payload_cache WHERE ieee = ?')
      .all(ieee) as unknown as Array<{ topic: string; payload: string }>;
  }

  /** Deletes one cached topic (entity removed). Returns true if a row was deleted. */
  deletePayloadByTopic(topic: string): boolean {
    const result = this.db.prepare('DELETE FROM payload_cache WHERE topic = ?').run(topic);
    return Number(result.changes) > 0;
  }

  /** Deletes every cached topic of a device. Returns the deleted topics (for retained-topic cleanup). */
  deletePayloadsByIeee(ieee: string): string[] {
    const rows = this.db
      .prepare('SELECT topic FROM payload_cache WHERE ieee = ?')
      .all(ieee) as unknown as Array<{ topic: string }>;
    this.db.prepare('DELETE FROM payload_cache WHERE ieee = ?').run(ieee);
    return rows.map((r) => r.topic);
  }

  delete(ieee: string): { last_topic: string } | null {
    const row = this.db.prepare('SELECT last_topic FROM devices WHERE ieee = ?').get(ieee) as unknown as
      | { last_topic: string }
      | undefined;
    if (!row) return null;
    this.db.prepare('DELETE FROM devices WHERE ieee = ?').run(ieee);
    return row;
  }

  logTransformation(ieee: string, topic: string, before: unknown, after: unknown): void {
    this.db
      .prepare(
        'INSERT INTO transformations_log (ieee, topic, before, after, applied_at) VALUES (?, ?, ?, ?, ?)',
      )
      .run(ieee, topic, JSON.stringify(before), JSON.stringify(after), Date.now());
  }

  /**
   * Purges transformation log entries older than the given timestamp
   * (in epoch ms). Returns the number of deleted entries.
   * Used to keep the table from growing indefinitely.
   */
  deleteLogsBefore(beforeMs: number): number {
    const result = this.db
      .prepare('DELETE FROM transformations_log WHERE applied_at < ?')
      .run(beforeMs);
    return Number(result.changes);
  }

  /**
   * Returns the last N logged transformations, joined with the device
   * friendly_name (for the Dashboard UI).
   */
  getRecentTransformations(limit: number = 20): Array<{
    id: number;
    ieee: string;
    friendly_name: string | null;
    topic: string;
    before: string;
    after: string;
    applied_at: number;
  }> {
    return this.db
      .prepare(
        `SELECT l.id, l.ieee, d.friendly_name, l.topic, l.before, l.after, l.applied_at
         FROM transformations_log l
         LEFT JOIN devices d ON l.ieee = d.ieee
         ORDER BY l.applied_at DESC
         LIMIT ?`,
      )
      .all(limit) as unknown as Array<{
      id: number;
      ieee: string;
      friendly_name: string | null;
      topic: string;
      before: string;
      after: string;
      applied_at: number;
    }>;
  }
}
