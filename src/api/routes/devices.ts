import type { FastifyInstance } from 'fastify';
import type { ApiDeps } from '../server.js';
import type { Device } from '../../types.js';
import type { StoredTransformer } from '../../db/repositories/transformers.js';
import type { TransformerRule } from '../../transformers/types.js';
import { matchesAnyTarget } from '../../targets/matcher.js';
import { parseTransformerRule } from '../../transformers/parse.js';
import { ruleConfigFields } from '../../transformers/project.js';

/**
 * For a given device, compute the winning rule per transformer type
 * (highest priority that matches, among enabled rules).
 * Used to expose the per-device "diff" to the UI.
 */
function appliedRulesForDevice(device: Device, rules: StoredTransformer[]) {
  const winning = new Map<string, StoredTransformer>();
  for (const stored of rules) {
    if (!stored.enabled) continue;
    if (!matchesAnyTarget(device, stored.rule.targets)) continue;
    const current = winning.get(stored.rule.type);
    if (!current || stored.rule.priority > current.rule.priority) {
      winning.set(stored.rule.type, stored);
    }
  }
  return Array.from(winning.values()).map((s) => ({
    id: s.id,
    type: s.rule.type,
    priority: s.rule.priority,
    targets: s.rule.targets,
    ...ruleConfigFields(s.rule),
  }));
}

function deviceToJson(d: Device, rules: StoredTransformer[]) {
  return {
    ieee: d.ieee,
    friendly_name: d.friendly_name,
    vendor: d.vendor,
    model: d.model,
    model_id: d.model_id,
    groups: d.groups,
    capabilities: d.capabilities,
    components: d.components,
    native_min_mireds: d.native_min_mireds,
    native_max_mireds: d.native_max_mireds,
    last_topic: d.last_topic,
    last_seen: d.last_seen,
    first_seen: d.first_seen,
    applied_rules: appliedRulesForDevice(d, rules),
  };
}

export function registerDeviceRoutes(fastify: FastifyInstance, deps: ApiDeps): void {
  fastify.get('/api/devices', async () => {
    const rules = deps.transformerRepo.findAll();
    return deps.catalog.all().map((d) => deviceToJson(d, rules));
  });

  fastify.get<{ Params: { ieee: string } }>('/api/devices/:ieee', async (req, reply) => {
    const device = deps.catalog.get(req.params.ieee);
    if (!device) {
      reply.code(404);
      return { error: 'device not found' };
    }
    const rules = deps.transformerRepo.findAll();
    return deviceToJson(device, rules);
  });

  /**
   * POST /api/devices/apply
   * Body: { ieees: [...], transformers: [{type, ...config}] }
   * (transformers come without `targets`; they will be targeted on `ieees`)
   *
   * Atomic smart apply:
   * 1. For each transformer type provided, remove the targeted ieees from
   *    existing rules of that type (avoids duplicates, enforces "last rule
   *    wins" on each type x device pair).
   * 2. If an existing rule ends up with no targets, delete it.
   * 3. Create the new rule with targets = ieees, priority 50.
   * 4. ONE single refresh at the end -> MQTT only sees the final state,
   *    not intermediate ones.
   */
  fastify.post('/api/devices/apply', async (req, reply) => {
    const body = req.body as { ieees?: unknown; transformers?: unknown };

    if (!Array.isArray(body.ieees) || body.ieees.length === 0) {
      reply.code(400);
      return { error: 'ieees must be a non-empty list' };
    }
    for (const [i, ieee] of body.ieees.entries()) {
      if (typeof ieee !== 'string' || ieee.length === 0) {
        reply.code(400);
        return { error: `ieees[${i}] must be a non-empty string` };
      }
    }
    if (!Array.isArray(body.transformers) || body.transformers.length === 0) {
      reply.code(400);
      return { error: 'transformers must be a non-empty list' };
    }

    const ieees = body.ieees as string[];

    // Validate transformers via the shared parser. We inject targets =
    // ieees (and a default priority of 50) before validation.
    const newRules: TransformerRule[] = [];
    for (const [i, t] of body.transformers.entries()) {
      if (t === null || typeof t !== 'object') {
        reply.code(400);
        return { error: `transformers[${i}] must be an object` };
      }
      const enriched = { ...(t as Record<string, unknown>), targets: ieees };
      if ((enriched as Record<string, unknown>).priority === undefined) {
        (enriched as Record<string, unknown>).priority = 50;
      }
      try {
        newRules.push(parseTransformerRule(enriched, `transformers[${i}]`));
      } catch (err) {
        reply.code(400);
        return { error: (err as Error).message };
      }
    }

    // Cleanup: remove the ieees from existing rules of the same types
    const ieeesLower = new Set(ieees.map((i) => i.toLowerCase()));
    const existing = deps.transformerRepo.findAll();
    const newTypes = new Set(newRules.map((r) => r.type));

    for (const stored of existing) {
      if (!newTypes.has(stored.rule.type)) continue;
      const filteredTargets = stored.rule.targets.filter((t) => !ieeesLower.has(t.toLowerCase()));
      if (filteredTargets.length === stored.rule.targets.length) continue; // no overlap
      if (filteredTargets.length === 0) {
        deps.transformerRepo.delete(stored.id);
      } else {
        deps.transformerRepo.update(
          stored.id,
          { ...stored.rule, targets: filteredTargets },
          stored.enabled,
        );
      }
    }

    // Create the new rules
    const created = newRules.map((r) => deps.transformerRepo.insert(r, true));

    // Single refresh at the end
    deps.runtime.replace(deps.transformerRepo.findEnabledRules());
    const refreshResult = deps.proxy.refresh();

    reply.code(201);
    return {
      created: created.map((s) => ({ id: s.id, type: s.rule.type, targets: s.rule.targets })),
      refresh: refreshResult,
    };
  });
}
