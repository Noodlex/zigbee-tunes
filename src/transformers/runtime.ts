import type { TransformerRule } from './types.js';
import { TransformerPipeline } from './pipeline.js';

/**
 * Wraps the transformation pipeline to allow hot-swapping rules.
 *
 * The proxy keeps a stable reference to the runtime and calls `current()`
 * on each message — no rewiring needed when rules are updated via the
 * API. New rules apply from the next received MQTT discovery message (or
 * immediately via refresh).
 */
export class TransformerRuntime {
  private pipeline: TransformerPipeline;

  constructor(initialRules: TransformerRule[]) {
    this.pipeline = new TransformerPipeline(initialRules);
  }

  current(): TransformerPipeline {
    return this.pipeline;
  }

  /** Rebuilds the pipeline from a new rule list. */
  replace(rules: TransformerRule[]): void {
    this.pipeline = new TransformerPipeline(rules);
  }
}
