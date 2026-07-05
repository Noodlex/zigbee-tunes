// Validation shared between YAML loading (config.ts) and the API routes
// (api/routes/transformers.ts). Single source of truth for the expected
// shape of a transformation rule.

import type { TransformerRule } from './types.js';

function fail(context: string, msg: string): never {
  throw new Error(`${context}: ${msg}`);
}

function nonEmptyString(v: unknown, ctx: string): string {
  if (typeof v !== 'string' || v.length === 0) fail(ctx, 'must be a non-empty string');
  return v as string;
}

/** Validates a finite non-negative number. undefined passes through. */
function finiteNonNegativeNumber(v: unknown, ctx: string): number | undefined {
  if (v === undefined || v === null) return undefined;
  if (typeof v !== 'number' || !Number.isFinite(v) || v < 0) {
    fail(ctx, 'must be a finite non-negative number');
  }
  return v as number;
}

/** Validates a non-negative integer (NaN/Infinity/negative/decimal -> throw). */
function nonNegativeInteger(v: unknown, ctx: string): number {
  if (typeof v !== 'number' || !Number.isInteger(v) || v < 0) {
    fail(ctx, 'must be a non-negative integer');
  }
  return v as number;
}

/** Validates the mireds range (HA typical: 100-1000; we allow 50-2000 to be safe). */
function miredsBound(v: unknown, ctx: string): number | undefined {
  const n = finiteNonNegativeNumber(v, ctx);
  if (n === undefined) return undefined;
  if (n < 50 || n > 2000) fail(ctx, 'mireds must be between 50 and 2000');
  return n;
}

const KNOWN_TARGET_PREFIXES = ['@vendor:', '@group:', '@model:', '@friendlyname:'];

/**
 * Validates one target pattern. Anything that doesn't start with "@" is a
 * literal device id (IEEE, or a Z2M group's encoded id) — but a typo'd
 * "@vendr:Innr" would otherwise silently fall through to the literal-id
 * branch of the matcher and never match anything, so unknown "@" prefixes
 * are rejected here with a clear message.
 */
function targetPattern(v: unknown, ctx: string): string {
  const s = nonEmptyString(v, ctx);
  if (s === '*') return s;
  if (s.startsWith('@')) {
    const prefix = KNOWN_TARGET_PREFIXES.find((p) => s.startsWith(p));
    if (!prefix) {
      fail(ctx, `unknown target prefix in "${s}" (expected one of: ${KNOWN_TARGET_PREFIXES.join(', ')})`);
    }
    if (s.length === prefix!.length) fail(ctx, `"${s}" is missing a value after the prefix`);
  }
  return s;
}

function targetArray(v: unknown, ctx: string): string[] {
  if (!Array.isArray(v) || v.length === 0) fail(ctx, 'must be a non-empty list');
  return v.map((item, i) => targetPattern(item, `${ctx}[${i}]`));
}

/**
 * Parses and validates a transformation rule from a raw source (YAML or
 * API JSON body). Throws with a clear message on error.
 */
export function parseTransformerRule(raw: unknown, context: string): TransformerRule {
  if (raw === null || typeof raw !== 'object') {
    fail(context, 'must be an object');
  }
  const r = raw as Record<string, unknown>;
  const type = nonEmptyString(r.type, `${context}.type`);
  const targets = targetArray(r.targets, `${context}.targets`);
  const priority = r.priority === undefined ? 0 : nonNegativeInteger(r.priority, `${context}.priority`);

  switch (type) {
    case 'color-temp-range':
      return {
        type: 'color-temp-range',
        targets,
        priority,
        min_mireds: miredsBound(r.min_mireds, `${context}.min_mireds`),
        max_mireds: miredsBound(r.max_mireds, `${context}.max_mireds`),
      };
    case 'suggested-area':
      return {
        type: 'suggested-area',
        targets,
        priority,
        area: nonEmptyString(r.area, `${context}.area`),
      };
    case 'entity-rename':
      return {
        type: 'entity-rename',
        targets,
        priority,
        device_name:
          r.device_name === undefined || r.device_name === null
            ? undefined
            : nonEmptyString(r.device_name, `${context}.device_name`),
      };
    case 'brightness-range':
      return {
        type: 'brightness-range',
        targets,
        priority,
        max_scale: brightnessScaleBound(r.max_scale, `${context}.max_scale`),
      };
    default:
      fail(`${context}.type`, `unknown value: ${type}`);
  }
}

/**
 * brightness_scale cap: integer between 1 and 254. 254 is the native
 * Zigbee maximum (and what Z2M publishes), so 254 = "no limit"; allowing
 * 255 would just be a confusing no-op.
 */
function brightnessScaleBound(v: unknown, ctx: string): number | undefined {
  if (v === undefined || v === null) return undefined;
  if (typeof v !== 'number' || !Number.isInteger(v) || v < 1 || v > 254) {
    fail(ctx, 'brightness scale must be an integer between 1 and 254');
  }
  return v as number;
}
