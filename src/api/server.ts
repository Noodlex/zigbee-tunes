import Fastify, { type FastifyInstance } from 'fastify';
import cors from '@fastify/cors';
import fastifyStatic from '@fastify/static';
import { existsSync, statSync } from 'node:fs';
import { resolve } from 'node:path';
import type { Logger } from '../logger.js';
import type { DeviceCatalog } from '../devices/catalog.js';
import type { DeviceRepository } from '../db/repositories/devices.js';
import type { TransformerRepository } from '../db/repositories/transformers.js';
import type { TransformerRuntime } from '../transformers/runtime.js';
import type { Proxy } from '../proxy.js';
import type { ZigbeeTunesMqttClient } from '../mqtt/client.js';
import type { ConnectionStatusTracker } from '../services/connection-status.js';
import { registerHealthRoutes } from './routes/health.js';
import { registerDeviceRoutes } from './routes/devices.js';
import { registerTransformerRoutes } from './routes/transformers.js';
import { registerRefreshRoutes } from './routes/refresh.js';
import { registerActivityRoutes } from './routes/activity.js';
import { registerStatsRoutes } from './routes/stats.js';

export interface ApiDeps {
  catalog: DeviceCatalog;
  deviceRepo: DeviceRepository;
  transformerRepo: TransformerRepository;
  runtime: TransformerRuntime;
  proxy: Proxy;
  mqttClient: ZigbeeTunesMqttClient;
  connectionStatus: ConnectionStatusTracker;
  logger: Logger;
  startedAt: number;
}

export interface ApiOptions {
  host: string;
  port: number;
}

export async function createApiServer(deps: ApiDeps): Promise<FastifyInstance> {
  const fastify = Fastify({
    logger: false, // we already use winston, no need to double-log
    disableRequestLogging: true,
  });

  // CORS disabled by default: the UI is served by Fastify from the same
  // origin as the API, so no CORS needed in the normal case. This prevents
  // a third-party website opened on a device on the LAN from making
  // mutations against the API (no auth yet). If you serve the UI from a
  // different origin (rare), list the allowed origins explicitly.
  await fastify.register(cors, {
    origin: false,
  });

  // Minimal hook to log requests through winston
  fastify.addHook('onResponse', async (req, reply) => {
    if (req.url.startsWith('/api/')) {
      deps.logger.info('http', {
        method: req.method,
        url: req.url,
        status: reply.statusCode,
        ms: Math.round(reply.elapsedTime),
      });
    }
  });

  registerHealthRoutes(fastify, deps);
  registerDeviceRoutes(fastify, deps);
  registerTransformerRoutes(fastify, deps);
  registerRefreshRoutes(fastify, deps);
  registerActivityRoutes(fastify, deps);
  registerStatsRoutes(fastify, deps);

  // Serves the built UI from ui/dist/ when present. Otherwise, tells the
  // user that the UI is not built (the /api/ routes work either way).
  const uiDist = resolve(process.cwd(), 'ui/dist');
  if (existsSync(uiDist) && statSync(uiDist).isDirectory()) {
    await fastify.register(fastifyStatic, { root: uiDist, prefix: '/' });
    deps.logger.info('ui served from disk', { path: uiDist });
  } else {
    fastify.get('/', async (_req, reply) => {
      reply.type('text/html');
      return `<!DOCTYPE html><html><body style="font-family: system-ui; padding: 40px; max-width: 600px; margin: auto">
        <h1>Zigbee Tunes</h1>
        <p>The REST API is working on <code>/api/*</code> but the UI hasn't been built yet.</p>
        <p>Build the UI with:</p>
        <pre>cd ui && yarn install && yarn build</pre>
        <p>Then restart Zigbee Tunes.</p>
      </body></html>`;
    });
    deps.logger.warn('ui/dist missing — UI will not be served. Build with: cd ui && yarn build');
  }

  return fastify;
}

export async function startApiServer(deps: ApiDeps, opts: ApiOptions): Promise<FastifyInstance> {
  const fastify = await createApiServer(deps);
  await fastify.listen({ host: opts.host, port: opts.port });
  deps.logger.info('api server started', { host: opts.host, port: opts.port });
  return fastify;
}
