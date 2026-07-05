import type { DiscoveryPayload, TransformContext } from '../types.js';
import type { DiscoveryTransformer, TransformerRule } from './types.js';
import { ColorTempRangeTransformer } from './color-temp-range.js';
import { SuggestedAreaTransformer } from './suggested-area.js';
import { EntityRenameTransformer } from './entity-rename.js';
import { BrightnessRangeTransformer } from './brightness-range.js';

export function buildTransformer(rule: TransformerRule): DiscoveryTransformer {
  switch (rule.type) {
    case 'color-temp-range':
      return new ColorTempRangeTransformer(rule);
    case 'suggested-area':
      return new SuggestedAreaTransformer(rule);
    case 'entity-rename':
      return new EntityRenameTransformer(rule);
    case 'brightness-range':
      return new BrightnessRangeTransformer(rule);
    default: {
      // If the TransformerRule union is extended later, the compiler will
      // flag any unhandled case here (exhaustiveness check).
      const _exhaustive: never = rule;
      throw new Error(`Unknown transformer type: ${(_exhaustive as { type: string }).type}`);
    }
  }
}

/**
 * Transformation pipeline.
 *
 * For each transformer type present in the rule list, we identify the
 * highest-priority rule that matches the current device and apply it.
 * Other rules of the same type are ignored.
 *
 * Transformers of different types are applied in cascade.
 */
export class TransformerPipeline {
  private readonly byType: Map<string, DiscoveryTransformer[]>;

  constructor(rules: TransformerRule[]) {
    this.byType = new Map();
    for (const rule of rules) {
      const t = buildTransformer(rule);
      const arr = this.byType.get(t.type) ?? [];
      arr.push(t);
      this.byType.set(t.type, arr);
    }
    // Sort by descending priority — first matching wins.
    for (const arr of this.byType.values()) {
      arr.sort((a, b) => b.priority - a.priority);
    }
  }

  apply(payload: DiscoveryPayload, ctx: TransformContext): DiscoveryPayload {
    let result = payload;
    for (const transformers of this.byType.values()) {
      const winner = transformers.find((t) => t.appliesTo(ctx));
      if (winner) {
        result = winner.apply(result, ctx);
      }
    }
    return result;
  }
}
