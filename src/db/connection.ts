// Uses node:sqlite, built into Node.js 22.5+ (no native dependency).
// API very close to better-sqlite3: prepare/run/get/all/exec.

import { DatabaseSync } from 'node:sqlite';
import { readFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));

export type Db = DatabaseSync;

export function openDatabase(path: string): Db {
  // Create the parent folder if needed (./data/zigbee-tunes.db -> ./data/)
  mkdirSync(dirname(path), { recursive: true });

  const db = new DatabaseSync(path);
  // WAL mode + foreign keys
  db.exec('PRAGMA journal_mode = WAL');
  db.exec('PRAGMA foreign_keys = ON');

  const schema = readFileSync(join(__dirname, 'schema.sql'), 'utf-8');
  db.exec(schema);

  // Lightweight migrations: ALTER TABLE to add columns introduced after
  // the first release, on existing DBs (CREATE IF NOT EXISTS in schema.sql
  // doesn't add them when the table already exists).
  runMigrations(db);

  return db;
}

function runMigrations(db: DatabaseSync): void {
  // PRAGMA table_info returns the list of columns of a table.
  const colsRows = db.prepare('PRAGMA table_info(devices)').all() as unknown as Array<{ name: string }>;
  const colNames = new Set(colsRows.map((c) => c.name));

  if (!colNames.has('capabilities')) {
    db.exec("ALTER TABLE devices ADD COLUMN capabilities TEXT NOT NULL DEFAULT '[]'");
  }
  if (!colNames.has('components')) {
    db.exec("ALTER TABLE devices ADD COLUMN components TEXT NOT NULL DEFAULT '[]'");
  }
  if (!colNames.has('native_min_mireds')) {
    db.exec('ALTER TABLE devices ADD COLUMN native_min_mireds INTEGER');
  }
  if (!colNames.has('native_max_mireds')) {
    db.exec('ALTER TABLE devices ADD COLUMN native_max_mireds INTEGER');
  }

  // payload_cache seed: DBs created before the per-topic cache only have
  // devices.last_topic / last_payload (ONE topic per device). Seed the new
  // table from it so refresh() has something to replay before Z2M
  // republishes everything. Skipped when payload_cache already has rows.
  const cacheCount = db.prepare('SELECT COUNT(*) AS n FROM payload_cache').get() as unknown as {
    n: number;
  };
  if (cacheCount.n === 0) {
    db.exec(
      `INSERT OR IGNORE INTO payload_cache (topic, ieee, payload, updated_at)
       SELECT last_topic, ieee, last_payload, last_seen FROM devices
       WHERE last_topic != '' AND last_payload != '' AND last_payload != '{}'`,
    );
  }
}
