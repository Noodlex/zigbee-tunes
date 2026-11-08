// The anti-loop cache answers "did I already publish this?". After a
// reconnection the honest answer is "no idea" — a broker that died brutally
// rolls its retained messages back to its last autosave while this process
// keeps running and keeps remembering. These tests pin both halves: the cache
// must suppress a genuine repeat, and must NOT suppress one across a
// reconnection.

import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { openDatabase, type Db } from '../../src/db/connection.js';
import { DeviceRepository } from '../../src/db/repositories/devices.js';
import { DeviceCatalog } from '../../src/devices/catalog.js';
import { TransformerRuntime } from '../../src/transformers/runtime.js';
import { ConnectionStatusTracker } from '../../src/services/connection-status.js';
import { Proxy } from '../../src/proxy.js';
import { createLogger } from '../../src/logger.js';
import type { Config } from '../../src/config.js';
import type { ZigbeeTunesMqttClient } from '../../src/mqtt/client.js';

const logger = createLogger('error');

const SOURCE_TOPIC = 'z2m_discovery/light/0xaaa/light/config';
const TARGET_TOPIC = 'homeassistant/light/0xaaa/light/config';

const discoveryPayload = JSON.stringify({
  name: null,
  min_mireds: 250,
  max_mireds: 454,
  supported_color_modes: ['color_temp'],
  device: { name: 'Lamp', manufacturer: 'Innr', model_id: 'RS 227 T' },
});

/**
 * Stands in for the real client: records what the proxy publishes and lets a
 * test fire the two events the proxy listens to.
 */
class FakeMqttClient {
  readonly published: string[] = [];
  private onMessageHandler: ((topic: string, payload: Buffer) => void) | null = null;
  private onReconnectHandler: (() => void) | null = null;

  onMessage(handler: (topic: string, payload: Buffer) => void): void {
    this.onMessageHandler = handler;
  }

  onReconnect(handler: () => void): void {
    this.onReconnectHandler = handler;
  }

  subscribe(): void {
    /* the proxy subscribes on start; nothing to record */
  }

  publish(topic: string): void {
    this.published.push(topic);
  }

  /** Simulates Z2M publishing a discovery payload. */
  deliver(topic: string, payload: string): void {
    this.onMessageHandler?.(topic, Buffer.from(payload));
  }

  /** Simulates the client re-establishing a dropped connection. */
  reconnect(): void {
    this.onReconnectHandler?.();
  }
}

const config = {
  topics: { source: 'z2m_discovery', target: 'homeassistant', z2m_base: 'zigbee2mqtt' },
} as Config;

describe('anti-loop cache across a reconnection', () => {
  let dir: string;
  let db: Db;
  let mqtt: FakeMqttClient;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'zt-reconnect-'));
    db = openDatabase(join(dir, 'test.db'));
    const repo = new DeviceRepository(db);
    const catalog = new DeviceCatalog(repo, logger);
    mqtt = new FakeMqttClient();
    const proxy = new Proxy(
      config,
      mqtt as unknown as ZigbeeTunesMqttClient,
      catalog,
      repo,
      new TransformerRuntime([]),
      new ConnectionStatusTracker(),
      logger,
    );
    proxy.start();
  });

  afterEach(() => {
    db.close();
    rmSync(dir, { recursive: true, force: true });
  });

  it('suppresses a repeat of the same payload', () => {
    // The control. Without this the next test would pass even if the cache
    // had simply stopped working.
    mqtt.deliver(SOURCE_TOPIC, discoveryPayload);
    mqtt.deliver(SOURCE_TOPIC, discoveryPayload);

    expect(mqtt.published.filter((t) => t === TARGET_TOPIC)).toHaveLength(1);
  });

  it('republishes an identical payload after a reconnection', () => {
    mqtt.deliver(SOURCE_TOPIC, discoveryPayload);
    expect(mqtt.published.filter((t) => t === TARGET_TOPIC)).toHaveLength(1);

    mqtt.reconnect();
    mqtt.deliver(SOURCE_TOPIC, discoveryPayload);

    expect(
      mqtt.published.filter((t) => t === TARGET_TOPIC),
      'After a reconnection the broker may have lost retained messages this ' +
        'process still believes it published. Suppressing the repeat leaves the ' +
        'target topic empty, and Home Assistant only notices at its next restart.',
    ).toHaveLength(2);
  });

  it('does not clear the cache on the first connect', () => {
    // Only reconnections are suspect. Clearing on every connect would be
    // harmless but would hide a regression in the hook's wiring.
    mqtt.deliver(SOURCE_TOPIC, discoveryPayload);
    mqtt.deliver(SOURCE_TOPIC, discoveryPayload);

    expect(mqtt.published.filter((t) => t === TARGET_TOPIC)).toHaveLength(1);
  });
});
