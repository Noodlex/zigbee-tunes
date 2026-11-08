// A host reboot starts the broker and this add-on together, and the broker is
// not always listening first. `services: mqtt:need` guarantees one is
// configured, not that it answers.
//
// The first connection attempt used to reject, the caller let that end the
// process, and nothing restarts it — so the add-on stayed down until someone
// noticed. Every LATER disconnection was already handled: reconnectPeriod
// retries every 5s forever. These tests pin that the first attempt now follows
// the same loop.

import { afterEach, describe, expect, it } from 'vitest';
import { ZigbeeTunesMqttClient } from '../../src/mqtt/client.js';
import { createLogger } from '../../src/logger.js';
import type { BrokerConfig } from '../../src/config.js';

const logger = createLogger('error');

/**
 * Port 1 is privileged and nothing listens there, so a connection attempt is
 * refused immediately rather than hanging until connectTimeout.
 */
const UNREACHABLE: BrokerConfig = {
  url: 'mqtt://127.0.0.1:1',
  client_id: 'zigbee-tunes-test',
} as BrokerConfig;

describe('a broker that is not listening yet', () => {
  let client: ZigbeeTunesMqttClient | null = null;

  afterEach(async () => {
    // Without this the client keeps retrying every 5s and holds the run open.
    await client?.end();
    client = null;
  });

  it('does not make connect() throw', async () => {
    client = new ZigbeeTunesMqttClient(UNREACHABLE, logger);

    // The whole point: this used to reject, and index.ts turned that into
    // process.exit(1) with nothing to restart it.
    await expect(client.connect()).resolves.toBeUndefined();
  });

  it('reports itself as not connected rather than pretending', async () => {
    client = new ZigbeeTunesMqttClient(UNREACHABLE, logger);
    await client.connect();

    // Returning early must not be mistaken for success: /api/health reads this
    // and answers `degraded`, which is what a watchdog should see.
    expect(client.isConnected).toBe(false);
  });

  it('accepts subscriptions while still offline', async () => {
    client = new ZigbeeTunesMqttClient(UNREACHABLE, logger);
    await client.connect();

    // proxy.start() subscribes immediately after connect() returns. The client
    // is wired by then, and every subscription is replayed on each connect, so
    // this must not throw.
    expect(() => client!.subscribe('zigbee2mqtt/bridge/devices')).not.toThrow();
  });
});
