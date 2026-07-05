import type { FastifyInstance } from 'fastify';
import type { ApiDeps } from '../server.js';
import type { TransformerRule } from '../../transformers/types.js';
import type { StoredTransformer } from '../../db/repositories/transformers.js';
import { parseTransformerRule } from '../../transformers/parse.js';
import { ruleConfigFields } from '../../transformers/project.js';

interface TransformerJson {
  id?: number;
  type: string;
  targets: string[];
  priority: number;
  enabled?: boolean;
  // type-specific
  min_mireds?: number;
  max_mireds?: number;
  area?: string;
  device_name?: string;
  max_scale?: number;
  // read-only fields
  created_at?: number;
  updated_at?: number;
}

function storedToJson(s: StoredTransformer): TransformerJson {
  return {
    id: s.id,
    type: s.rule.type,
    targets: s.rule.targets,
    priority: s.rule.priority,
    enabled: s.enabled,
    created_at: s.created_at,
    updated_at: s.updated_at,
    ...ruleConfigFields(s.rule),
  };
}

/**
 * Parses an API body into a TransformerRule (strict validation via the
 * shared parser) and extracts the enabled flag (defaults to true).
 */
function bodyToRule(body: unknown): { rule: TransformerRule; enabled: boolean } {
  const rule = parseTransformerRule(body, 'body');
  const b = body as Record<string, unknown>;
  const enabled = typeof b.enabled === 'boolean' ? b.enabled : true;
  return { rule, enabled };
}

export function registerTransformerRoutes(fastify: FastifyInstance, deps: ApiDeps): void {
  /** Rebuild the runtime from the DB and trigger a republish refresh. */
  function applyChangesAndRefresh(): { devices: number; republished: number } {
    deps.runtime.replace(deps.transformerRepo.findEnabledRules());
    return deps.proxy.refresh();
  }

  fastify.get('/api/transformers', async () => {
    return deps.transformerRepo.findAll().map(storedToJson);
  });

  fastify.get<{ Params: { id: string } }>('/api/transformers/:id', async (req, reply) => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) {
      reply.code(400);
      return { error: 'id must be an integer' };
    }
    const stored = deps.transformerRepo.findById(id);
    if (!stored) {
      reply.code(404);
      return { error: 'transformer not found' };
    }
    return storedToJson(stored);
  });

  fastify.post('/api/transformers', async (req, reply) => {
    let parsed: { rule: TransformerRule; enabled: boolean };
    try {
      parsed = bodyToRule(req.body);
    } catch (err) {
      reply.code(400);
      return { error: (err as Error).message };
    }
    const stored = deps.transformerRepo.insert(parsed.rule, parsed.enabled);
    const refresh = applyChangesAndRefresh();
    reply.code(201);
    return { ...storedToJson(stored), refresh };
  });

  fastify.put<{ Params: { id: string } }>('/api/transformers/:id', async (req, reply) => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) {
      reply.code(400);
      return { error: 'id must be an integer' };
    }
    let parsed: { rule: TransformerRule; enabled: boolean };
    try {
      parsed = bodyToRule(req.body);
    } catch (err) {
      reply.code(400);
      return { error: (err as Error).message };
    }
    const updated = deps.transformerRepo.update(id, parsed.rule, parsed.enabled);
    if (!updated) {
      reply.code(404);
      return { error: 'transformer not found' };
    }
    const refresh = applyChangesAndRefresh();
    return { ...storedToJson(updated), refresh };
  });

  fastify.delete<{ Params: { id: string } }>('/api/transformers/:id', async (req, reply) => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) {
      reply.code(400);
      return { error: 'id must be an integer' };
    }
    const ok = deps.transformerRepo.delete(id);
    if (!ok) {
      reply.code(404);
      return { error: 'transformer not found' };
    }
    const refresh = applyChangesAndRefresh();
    reply.code(200);
    return { deleted: id, refresh };
  });
}
