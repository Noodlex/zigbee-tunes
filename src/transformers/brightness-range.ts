import type { DiscoveryPayload, TransformContext } from '../types.js';
import { matchesAnyTarget } from '../targets/matcher.js';
import type { BrightnessRangeRule, DiscoveryTransformer } from './types.js';

/**
 * Cap on `brightness_scale`. Z2M typically publishes 254 (native Zigbee
 * range 0-254). Lowering this cap restricts the brightness range that HA
 * sends over MQTT, which effectively caps the physical max reachable from
 * the HA UI.
 *
 * No floor (`min_brightness`) because HA has no standard field for that
 * in the light JSON schema — it would require a template, which adds
 * complexity for little benefit.
 *
 * Devices without `brightness_scale` in their payload (sensors, non-dim
 * plugs, etc.): silent no-op.
 */
export class BrightnessRangeTransformer implements DiscoveryTransformer {
  readonly type = 'brightness-range';
  readonly priority: number;

  constructor(private readonly rule: BrightnessRangeRule) {
    this.priority = rule.priority;
  }

  appliesTo(ctx: TransformContext): boolean {
    if (!ctx.device) return false;
    return matchesAnyTarget(ctx.device, this.rule.targets);
  }

  apply(payload: DiscoveryPayload, _ctx: TransformContext): DiscoveryPayload {
    if (this.rule.max_scale === undefined) return payload;
    if (typeof payload.brightness_scale !== 'number') return payload;
    const newScale = Math.min(payload.brightness_scale, this.rule.max_scale);
    if (newScale === payload.brightness_scale) return payload;
    return { ...payload, brightness_scale: newScale };
  }
}
