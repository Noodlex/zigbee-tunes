import { loadConfig } from './config.js';
import { createLogger } from './logger.js';
import { ZigbeeTunesMqttClient } from './mqtt/client.js';
import { openDatabase } from './db/connection.js';
import { DeviceRepository } from './db/repositories/devices.js';
import { TransformerRepository } from './db/repositories/transformers.js';
import { DeviceCatalog } from './devices/catalog.js';
import { TransformerRuntime } from './transformers/runtime.js';
import { ConnectionStatusTracker } from './services/connection-status.js';
import { Proxy } from './proxy.js';
import { startApiServer } from './api/server.js';

const CONFIG_PATH = process.env.ZIGBEE_TUNES_CONFIG ?? './config.yaml';

async function main(): Promise<void> {
  const startedAt = Date.now();
  const cfg = loadConfig(CONFIG_PATH);
  const logger = createLogger(cfg.log_level);

  logger.info('zigbee-tunes starting', { config_path: CONFIG_PATH, log_level: cfg.log_level });

  // DB + repositories
  const db = openDatabase(cfg.database.path);
  const deviceRepo = new DeviceRepository(db);
  const transformerRepo = new TransformerRepository(db);

  // Retention: purge transformation logs older than 7 days to keep the
  // table from growing indefinitely. Runs at startup AND once a day —
  // an add-on can run for months without restarting.
  const LOG_RETENTION_MS = 7 * 24 * 60 * 60 * 1000;
  const purgeOldLogs = () => {
    const purged = deviceRepo.deleteLogsBefore(Date.now() - LOG_RETENTION_MS);
    if (purged > 0) logger.info('purged old transformation logs', { deleted: purged });
  };
  purgeOldLogs();
  setInterval(purgeOldLogs, 24 * 60 * 60 * 1000).unref();

  // Bootstrap rules from YAML if the table is empty
  const bootstrapped = transformerRepo.bootstrapFromYaml(cfg.transformers);
  if (bootstrapped > 0) {
    logger.info('transformers bootstrapped from yaml', { count: bootstrapped });
  } else {
    logger.info('transformers loaded from db', { count: transformerRepo.count() });
  }

  // Runtime + catalog + connection status tracker
  const runtime = new TransformerRuntime(transformerRepo.findEnabledRules());
  const catalog = new DeviceCatalog(deviceRepo, logger);
  const connectionStatus = new ConnectionStatusTracker();

  // MQTT
  const mqtt = new ZigbeeTunesMqttClient(cfg.broker, logger);
  await mqtt.connect();

  // Proxy
  const proxy = new Proxy(cfg, mqtt, catalog, deviceRepo, runtime, connectionStatus, logger);
  proxy.start();

  // API server
  const apiServer = await startApiServer(
    {
      catalog,
      deviceRepo,
      transformerRepo,
      runtime,
      proxy,
      mqttClient: mqtt,
      connectionStatus,
      logger,
      startedAt,
    },
    cfg.api,
  );

  const shutdown = async (signal: string) => {
    logger.info('shutting down', { signal });
    try {
      await apiServer.close();
    } catch (err) {
      logger.error('api server close error', { err: (err as Error).message });
    }
    try {
      await mqtt.end();
    } catch (err) {
      logger.error('mqtt end error', { err: (err as Error).message });
    }
    db.close();
    process.exit(0);
  };

  process.on('SIGINT', () => void shutdown('SIGINT'));
  process.on('SIGTERM', () => void shutdown('SIGTERM'));
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error('fatal error', err);
  process.exit(1);
});
