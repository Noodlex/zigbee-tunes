import type { FastifyInstance } from 'fastify';
import type { ApiDeps } from '../server.js';

export function registerHealthRoutes(fastify: FastifyInstance, deps: ApiDeps): void {
  fastify.get('/api/health', async () => {
    const conn = deps.connectionStatus.snapshot();
    return {
      status: deps.mqttClient.isConnected ? 'ok' : 'degraded',
      uptime_sec: Math.round((Date.now() - deps.startedAt) / 1000),
      devices_count: deps.catalog.all().length,
      transformers_count: deps.transformerRepo.count(),
      mqtt: {
        connected: deps.mqttClient.isConnected,
        url: deps.mqttClient.url,
        connected_at: deps.mqttClient.connectedAt,
        last_reconnect_at: deps.mqttClient.lastReconnectAt,
        reconnect_count: deps.mqttClient.reconnectCount,
      },
      z2m: {
        status: conn.z2m,
        last_update: conn.z2m_last_update,
      },
      ha: {
        status: conn.ha,
        last_update: conn.ha_last_update,
      },
    };
  });
}
