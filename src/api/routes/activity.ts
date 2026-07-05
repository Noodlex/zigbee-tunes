import type { FastifyInstance } from 'fastify';
import type { ApiDeps } from '../server.js';

/**
 * GET /api/activity?limit=N
 * Returns the N most recently applied transformations (max 100).
 * Feeds the Dashboard timeline.
 *
 * Includes a server-side computed diff to limit work on the UI: for each
 * entry, we only return the fields that actually differ between `before`
 * and `after`. If the diff is empty (no-op), we omit the entry from the
 * response — no point showing rows without changes.
 */
export function registerActivityRoutes(fastify: FastifyInstance, deps: ApiDeps): void {
  fastify.get<{ Querystring: { limit?: string } }>('/api/activity', async (req) => {
    const raw = Number(req.query.limit);
    const limit = Number.isInteger(raw) && raw > 0 && raw <= 100 ? raw : 20;

    // Fetch a few more to have margin after filtering out no-ops
    const rows = deps.deviceRepo.getRecentTransformations(limit * 3);
    const entries: Array<{
      id: number;
      ieee: string;
      friendly_name: string;
      applied_at: number;
      changes: Array<{ field: string; before: unknown; after: unknown }>;
    }> = [];

    for (const r of rows) {
      let before: Record<string, unknown>;
      let after: Record<string, unknown>;
      try {
        before = JSON.parse(r.before) as Record<string, unknown>;
        after = JSON.parse(r.after) as Record<string, unknown>;
      } catch {
        continue;
      }

      const changes = diffPayload(before, after);
      if (changes.length === 0) continue;

      entries.push({
        id: r.id,
        ieee: r.ieee,
        friendly_name: r.friendly_name ?? r.ieee,
        applied_at: r.applied_at,
        changes,
      });

      if (entries.length >= limit) break;
    }

    return { entries };
  });
}

/**
 * Shallow diff: compares top-level keys + `device` sub-keys.
 * These are the only levels our current transformers touch.
 */
function diffPayload(
  before: Record<string, unknown>,
  after: Record<string, unknown>,
): Array<{ field: string; before: unknown; after: unknown }> {
  const out: Array<{ field: string; before: unknown; after: unknown }> = [];
  const watched = ['min_mireds', 'max_mireds', 'brightness_scale'];
  for (const k of watched) {
    if (before[k] !== after[k]) {
      out.push({ field: k, before: before[k], after: after[k] });
    }
  }
  const bDev = (before.device ?? {}) as Record<string, unknown>;
  const aDev = (after.device ?? {}) as Record<string, unknown>;
  for (const k of ['name', 'suggested_area']) {
    if (bDev[k] !== aDev[k]) {
      out.push({ field: `device.${k}`, before: bDev[k], after: aDev[k] });
    }
  }
  return out;
}
