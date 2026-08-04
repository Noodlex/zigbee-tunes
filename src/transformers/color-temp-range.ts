import type { DiscoveryPayload, TransformContext } from '../types.js';
import { matchesAnyTarget } from '../targets/matcher.js';
import type { ColorTempRangeRule, DiscoveryTransformer } from './types.js';

// Clamps min_mireds and max_mireds inside the range configured by the rule.
// If the rule has no min_mireds (resp. max_mireds), that side is left as-is.
export class ColorTempRangeTransformer implements DiscoveryTransformer {
  readonly type = 'color-temp-range';
  readonly priority: number;

  constructor(private readonly rule: ColorTempRangeRule) {
    this.priority = rule.priority;
  }

  appliesTo(ctx: TransformContext): boolean {
    if (!ctx.device) return false;
    return matchesAnyTarget(ctx.device, this.rule.targets);
  }

  apply(payload: DiscoveryPayload, _ctx: TransformContext): DiscoveryPayload {
    // Only modify the payload if it actually contains those fields.
    const hasMin = typeof payload.min_mireds === 'number';
    const hasMax = typeof payload.max_mireds === 'number';
    if (!hasMin && !hasMax) return payload;

    const out = { ...payload };
    if (this.rule.min_mireds !== undefined && hasMin) {
      out.min_mireds = Math.max(payload.min_mireds!, this.rule.min_mireds);
    }
    if (this.rule.max_mireds !== undefined && hasMax) {
      out.max_mireds = Math.min(payload.max_mireds!, this.rule.max_mireds);
    }

    // The rule and the device may not overlap at all — a rule asking for
    // "no cooler than 500" against a bulb that stops at 454 would otherwise
    // emit min_mireds 500 / max_mireds 454. Home Assistant would get an empty
    // window and show a broken slider, so leave such a device alone: the
    // range it advertises is the only one it can honour.
    if (
      typeof out.min_mireds === 'number' &&
      typeof out.max_mireds === 'number' &&
      out.min_mireds > out.max_mireds
    ) {
      return payload;
    }
    return out;
  }
}
