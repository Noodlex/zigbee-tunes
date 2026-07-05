import type { FastifyInstance } from 'fastify';
import type { ApiDeps } from '../server.js';

export function registerRefreshRoutes(fastify: FastifyInstance, deps: ApiDeps): void {
  fastify.post('/api/refresh', async () => {
    return deps.proxy.refresh();
  });
}
