// Lightweight fetch wrapper around the Zigbee Tunes API.
// No axios — native fetch is plenty for JSON CRUD.

import type { Health, Device, Transformer, RefreshResult, ActivityEntry, FleetStats } from './types';

/**
 * Pathname prefix where the SPA is served. Lets the API client follow the
 * deployment base so calls hit the right backend in every mode:
 *  - Dev (Vite on :5173):                     ''        -> /api/health
 *  - Standalone (Fastify serving UI):         ''        -> /api/health
 *  - HA Ingress (/<addon-token>/#/...):       '/<token>' -> /<token>/api/health
 *
 * We can't just do `new URL('./', location.href).pathname` because when HA
 * serves the SPA at `/<token>` without a trailing slash, `./` resolves to
 * the parent (`/`) and we'd send API calls to HA Core by mistake.
 */
function computeBase(): string {
  let p = window.location.pathname;
  p = p.replace(/\/index\.html$/, '');
  p = p.replace(/\/$/, '');
  return p;
}
const BASE = computeBase();
const DEFAULT_TIMEOUT_MS = 15_000;

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), DEFAULT_TIMEOUT_MS);

  try {
    const res = await fetch(`${BASE}${path}`, {
      method,
      headers: body !== undefined ? { 'Content-Type': 'application/json' } : undefined,
      body: body !== undefined ? JSON.stringify(body) : undefined,
      signal: controller.signal,
    });
    const text = await res.text();
    const data: unknown = text.length > 0 ? JSON.parse(text) : null;
    if (!res.ok) {
      const msg =
        (data && typeof data === 'object' && 'error' in data && typeof (data as { error: unknown }).error === 'string'
          ? (data as { error: string }).error
          : null) ?? `HTTP ${res.status}`;
      throw new Error(msg);
    }
    return data as T;
  } catch (err) {
    if ((err as Error).name === 'AbortError') {
      throw new Error(`Timeout after ${DEFAULT_TIMEOUT_MS / 1000}s on ${method} ${path}`);
    }
    throw err;
  } finally {
    clearTimeout(timeoutId);
  }
}

export const api = {
  health: () => request<Health>('GET', '/api/health'),

  devices: () => request<Device[]>('GET', '/api/devices'),
  device: (ieee: string) => request<Device>('GET', `/api/devices/${encodeURIComponent(ieee)}`),

  transformers: () => request<Transformer[]>('GET', '/api/transformers'),
  transformer: (id: number) => request<Transformer>('GET', `/api/transformers/${id}`),
  createTransformer: (t: Omit<Transformer, 'id' | 'created_at' | 'updated_at'>) =>
    request<Transformer & { refresh: RefreshResult }>('POST', '/api/transformers', t),
  updateTransformer: (id: number, t: Omit<Transformer, 'id' | 'created_at' | 'updated_at'>) =>
    request<Transformer & { refresh: RefreshResult }>('PUT', `/api/transformers/${id}`, t),
  deleteTransformer: (id: number) =>
    request<{ deleted: number; refresh: RefreshResult }>('DELETE', `/api/transformers/${id}`),

  refresh: () => request<RefreshResult>('POST', '/api/refresh'),

  /**
   * Smart apply: for each provided transformer, first remove the ieees
   * from existing rules of the same type (avoids duplicates), then create
   * the new rule with targets = ieees. Single refresh at the end.
   */
  applyToDevices: (
    ieees: string[],
    transformers: Array<Partial<Transformer>>,
  ) =>
    request<{
      created: Array<{ id: number; type: string; targets: string[] }>;
      refresh: RefreshResult;
    }>('POST', '/api/devices/apply', { ieees, transformers }),

  activity: (limit = 20) =>
    request<{ entries: ActivityEntry[] }>('GET', `/api/activity?limit=${limit}`),
  stats: () => request<FleetStats>('GET', '/api/stats'),
};
