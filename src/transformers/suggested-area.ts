import type { DiscoveryPayload, TransformContext } from '../types.js';
import { matchesAnyTarget } from '../targets/matcher.js';
import type { DiscoveryTransformer, SuggestedAreaRule } from './types.js';

/**
 * Adds (or overrides) `device.suggested_area` in the discovery payload.
 *
 * HA note: `suggested_area` is only used on the FIRST creation of the
 * device in HA. Devices already registered are not reassigned. Useful
 * prospectively (new additions) or for users starting fresh on the HA
 * side.
 */
export class SuggestedAreaTransformer implements DiscoveryTransformer {
  readonly type = 'suggested-area';
  readonly priority: number;

  constructor(private readonly rule: SuggestedAreaRule) {
    this.priority = rule.priority;
  }

  appliesTo(ctx: TransformContext): boolean {
    if (!ctx.device) return false;
    return matchesAnyTarget(ctx.device, this.rule.targets);
  }

  apply(payload: DiscoveryPayload, _ctx: TransformContext): DiscoveryPayload {
    const currentDevice = (payload.device ?? {}) as Record<string, unknown>;
    if (currentDevice.suggested_area === this.rule.area) return payload;

    return {
      ...payload,
      device: {
        ...currentDevice,
        suggested_area: this.rule.area,
      },
    };
  }
}
