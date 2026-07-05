// Tests for the per-topic payload cache — the core of refresh()
// correctness. A device publishes several discovery topics (light +
// update sensor + ...); the cache must keep them ALL so a rule change
// reaches the right entity regardless of which topic arrived last.

import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { openDatabase, type Db } from '../../src/db/connection.js';
import { DeviceRepository } from '../../src/db/repositories/devices.js';
import { DeviceCatalog, encodeGroupDiscoveryId } from '../../src/devices/catalog.js';
import { createLogger } from '../../src/logger.js';

const logger = createLogger('error');

const LIGHT_TOPIC = 'z2m_discovery/light/0xaaa/light/config';
const SENSOR_TOPIC = 'z2m_discovery/sensor/0xaaa/update/config';

const lightPayload = JSON.stringify({
  name: null,
  min_mireds: 250,
  max_mireds: 454,
  brightness: true,
  supported_color_modes: ['color_temp'],
  device: { name: 'Lamp', manufacturer: 'Innr', model_id: 'RS 227 T' },
});
const sensorPayload = JSON.stringify({
  name: 'Update',
  device: { name: 'Lamp', manufacturer: 'Innr', model_id: 'RS 227 T' },
});

describe('per-topic payload cache', () => {
  let dir: string;
  let db: Db;
  let repo: DeviceRepository;
  let catalog: DeviceCatalog;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'zigbee-tunes-test-'));
    db = openDatabase(join(dir, 'test.db'));
    repo = new DeviceRepository(db);
    catalog = new DeviceCatalog(repo, logger);
  });

  afterEach(() => {
    db.close();
    rmSync(dir, { recursive: true, force: true });
  });

  it('keeps one cached payload PER TOPIC, not per device', () => {
    catalog.upsertFromDiscovery('0xaaa', LIGHT_TOPIC, JSON.parse(lightPayload), lightPayload);
    catalog.upsertFromDiscovery('0xaaa', SENSOR_TOPIC, JSON.parse(sensorPayload), sensorPayload);

    const cached = catalog.allWithCachedPayloads();
    expect(cached).toHaveLength(2);
    const topics = cached.map((c) => c.topic).sort();
    expect(topics).toEqual([SENSOR_TOPIC, LIGHT_TOPIC].sort());
    // The regression we are guarding against: the light payload must
    // survive even though the sensor topic arrived last.
    const light = cached.find((c) => c.topic === LIGHT_TOPIC);
    expect(light?.payload.min_mireds).toBe(250);
  });

  it('remove() returns every cached topic for retained-config cleanup', () => {
    catalog.upsertFromDiscovery('0xaaa', LIGHT_TOPIC, JSON.parse(lightPayload), lightPayload);
    catalog.upsertFromDiscovery('0xaaa', SENSOR_TOPIC, JSON.parse(sensorPayload), sensorPayload);

    const r = catalog.remove('0xaaa');
    expect(r).not.toBeNull();
    expect(r!.topics.sort()).toEqual([SENSOR_TOPIC, LIGHT_TOPIC].sort());
    expect(catalog.allWithCachedPayloads()).toHaveLength(0);
    expect(catalog.get('0xaaa')).toBeNull();
  });

  it('handleTopicCleared drops the topic and recomputes capabilities', () => {
    catalog.upsertFromDiscovery('0xaaa', LIGHT_TOPIC, JSON.parse(lightPayload), lightPayload);
    catalog.upsertFromDiscovery('0xaaa', SENSOR_TOPIC, JSON.parse(sensorPayload), sensorPayload);
    expect(catalog.get('0xaaa')!.components).toContain('sensor');

    catalog.handleTopicCleared(SENSOR_TOPIC);

    const device = catalog.get('0xaaa')!;
    expect(device.components).not.toContain('sensor');
    expect(device.components).toContain('light');
    expect(device.capabilities).toContain('color_temp');
    expect(catalog.allWithCachedPayloads()).toHaveLength(1);
  });

  it('seeds payload_cache from legacy devices.last_payload on reopen', () => {
    catalog.upsertFromDiscovery('0xaaa', LIGHT_TOPIC, JSON.parse(lightPayload), lightPayload);
    // Simulate a legacy DB: per-topic rows absent, only devices.last_payload.
    db.exec('DELETE FROM payload_cache');
    db.close();

    db = openDatabase(join(dir, 'test.db')); // reopen -> migration seed runs
    repo = new DeviceRepository(db);
    const rows = repo.findAllPayloads();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ ieee: '0xaaa', topic: LIGHT_TOPIC });
  });
});

describe('Z2M group lifecycle', () => {
  let dir: string;
  let db: Db;
  let catalog: DeviceCatalog;

  const GROUP_ID = encodeGroupDiscoveryId('zigbee2mqtt', 4);
  const GROUP_TOPIC = `z2m_discovery/light/${GROUP_ID}/light/config`;
  const groupPayload = JSON.stringify({
    name: null,
    brightness: true,
    device: { name: 'Cuisine', manufacturer: 'Zigbee2MQTT', model_id: 'Group' },
  });

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'zigbee-tunes-test-'));
    db = openDatabase(join(dir, 'test.db'));
    catalog = new DeviceCatalog(new DeviceRepository(db), logger);
  });

  afterEach(() => {
    db.close();
    rmSync(dir, { recursive: true, force: true });
  });

  it('encodes the discovery id the way Z2M does (char codes + _id)', () => {
    expect(encodeGroupDiscoveryId('zigbee2mqtt', 4)).toBe('1221051039810110150109113116116_4');
  });

  it('removes a catalog group that disappeared from bridge/groups', () => {
    catalog.upsertFromDiscovery(GROUP_ID, GROUP_TOPIC, JSON.parse(groupPayload), groupPayload);
    expect(catalog.get(GROUP_ID)).not.toBeNull();

    // Group 4 no longer listed -> stale, must be removed with its topics.
    const removed = catalog.syncFromBridgeGroups([{ id: 7, friendly_name: 'Salon' }], 'zigbee2mqtt');
    expect(removed).toHaveLength(1);
    expect(removed[0]).toMatchObject({ ieee: GROUP_ID });
    expect(removed[0]!.topics).toContain(GROUP_TOPIC);
    expect(catalog.get(GROUP_ID)).toBeNull();
  });

  it('keeps groups that are still listed and never touches real devices', () => {
    catalog.upsertFromDiscovery(GROUP_ID, GROUP_TOPIC, JSON.parse(groupPayload), groupPayload);
    catalog.upsertFromDiscovery('0xaaa', LIGHT_TOPIC, JSON.parse(lightPayload), lightPayload);

    const removed = catalog.syncFromBridgeGroups([{ id: 4, friendly_name: 'Cuisine' }], 'zigbee2mqtt');
    expect(removed).toHaveLength(0);
    expect(catalog.get(GROUP_ID)).not.toBeNull();
    expect(catalog.get('0xaaa')).not.toBeNull();
  });
});
