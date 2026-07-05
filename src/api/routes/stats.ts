import type { FastifyInstance } from 'fastify';
import type { ApiDeps } from '../server.js';
import { matchesAnyTarget } from '../../targets/matcher.js';

/**
 * GET /api/stats
 * Aggregated stats for the Dashboard:
 * - breakdown by vendor
 * - breakdown by capability (color_temp, brightness, etc.)
 * - number of devices with custom configuration (at least one rule whose
 *   targets contain their IEEE explicitly — not via *, @vendor, etc.)
 */
export function registerStatsRoutes(fastify: FastifyInstance, deps: ApiDeps): void {
  fastify.get('/api/stats', async () => {
    const devices = deps.catalog.all();
    const enabledRules = deps.transformerRepo.findAll().filter((s) => s.enabled);

    const by_vendor: Record<string, number> = {};
    const by_capability: Record<string, number> = {};
    let modified = 0;

    for (const d of devices) {
      const vendor = d.vendor || '(unknown)';
      by_vendor[vendor] = (by_vendor[vendor] ?? 0) + 1;
      for (const c of d.capabilities) {
        by_capability[c] = (by_capability[c] ?? 0) + 1;
      }

      // "Modified" = at least one rule targeting this device by explicit
      // IEEE, not via a broad pattern (*, @vendor:, @group:, etc.). This
      // is the most useful definition for the user: "have I customized
      // this device?" vs "have I applied a global rule to the whole
      // fleet?".
      const hasExplicitRule = enabledRules.some((s) => {
        if (!matchesAnyTarget(d, s.rule.targets)) return false;
        return s.rule.targets.some((t) => t.toLowerCase() === d.ieee.toLowerCase());
      });
      if (hasExplicitRule) modified++;
    }

    // Sort to make UI charts deterministic
    const sortedVendors = Object.fromEntries(
      Object.entries(by_vendor).sort(([, a], [, b]) => b - a),
    );
    const sortedCaps = Object.fromEntries(
      Object.entries(by_capability).sort(([, a], [, b]) => b - a),
    );

    return {
      total_devices: devices.length,
      by_vendor: sortedVendors,
      by_capability: sortedCaps,
      modified,
      rules_total: enabledRules.length,
    };
  });
}
