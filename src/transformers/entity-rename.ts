import type { DiscoveryPayload, TransformContext } from '../types.js';
import { matchesAnyTarget } from '../targets/matcher.js';
import type { DiscoveryTransformer, EntityRenameRule } from './types.js';

/**
 * Override `device.name` (the name displayed in the HA UI).
 *
 * IMPORTANT: we do NOT touch `default_entity_id` or `object_id` so we
 * don't break existing automations referencing `light.dining_room_4`
 * etc. Only the display name changes.
 *
 * If you really want to rename the entity_id, do it on the Z2M side
 * (rename the device in Z2M) — it is the source of truth.
 */
export class EntityRenameTransformer implements DiscoveryTransformer {
  readonly type = 'entity-rename';
  readonly priority: number;

  constructor(private readonly rule: EntityRenameRule) {
    this.priority = rule.priority;
  }

  appliesTo(ctx: TransformContext): boolean {
    if (!ctx.device) return false;
    return matchesAnyTarget(ctx.device, this.rule.targets);
  }

  apply(payload: DiscoveryPayload, _ctx: TransformContext): DiscoveryPayload {
    if (this.rule.device_name === undefined) return payload;

    const currentDevice = (payload.device ?? {}) as Record<string, unknown>;
    if (currentDevice.name === this.rule.device_name) return payload;

    return {
      ...payload,
      device: {
        ...currentDevice,
        name: this.rule.device_name,
      },
    };
  }
}
