import type { DiscoveryPayload, TransformContext } from '../types.js';

// Common interface for all transformers.
// A transformer receives the incoming payload and returns a modified
// version (or the same object if it changed nothing).
export interface DiscoveryTransformer {
  readonly type: string;
  readonly priority: number;
  /**
   * Whether this transformer applies to the current device.
   * Avoids calling `apply` unnecessarily and lets the pipeline pick the
   * winning rule per type.
   */
  appliesTo(ctx: TransformContext): boolean;
  apply(payload: DiscoveryPayload, ctx: TransformContext): DiscoveryPayload;
}

// Raw YAML representation of a transformation rule.
export interface BaseTransformerRule {
  type: string;
  targets: string[];
  priority: number;
}

export interface ColorTempRangeRule extends BaseTransformerRule {
  type: 'color-temp-range';
  min_mireds?: number;
  max_mireds?: number;
}

export interface SuggestedAreaRule extends BaseTransformerRule {
  type: 'suggested-area';
  area: string;
}

export interface EntityRenameRule extends BaseTransformerRule {
  type: 'entity-rename';
  /** Override of `device.name` (HA display name, does not break entity_id). */
  device_name?: string;
}

export interface BrightnessRangeRule extends BaseTransformerRule {
  type: 'brightness-range';
  /**
   * Cap on `brightness_scale`. Z2M typically publishes 254 (native Zigbee
   * range). Lowering this value makes HA send brightness commands within
   * a tighter range (e.g. 127 = effective max 50%). No effect on devices
   * without `brightness_scale` in the payload.
   */
  max_scale?: number;
}

export type TransformerRule = ColorTempRangeRule | SuggestedAreaRule | EntityRenameRule | BrightnessRangeRule;
