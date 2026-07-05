// Rule actions shared between the card popover and the "Custom
// configurations" section of the Dashboard. Avoids duplicating the logic
// that computes new targets / decides update vs delete.

import { api } from '../api/client';
import type { AppliedRule, RefreshResult } from '../api/types';

export function useRuleActions() {
  /**
   * Removes a device from a specific rule.
   * If the rule ends up with no targets, delete it entirely.
   * Otherwise update it with the remaining targets.
   *
   * Returns:
   *   - refresh: number of republished payloads (for the user toast)
   *   - deleted: true if the rule was deleted entirely,
   *              false if only the target was removed
   */
  async function resetRuleForDevice(
    deviceIeee: string,
    rule: AppliedRule,
  ): Promise<{ refresh: RefreshResult; deleted: boolean }> {
    const newTargets = rule.targets.filter((t) => t.toLowerCase() !== deviceIeee.toLowerCase());

    if (newTargets.length === 0) {
      const res = await api.deleteTransformer(rule.id);
      return { refresh: res.refresh, deleted: true };
    }

    const body: Record<string, unknown> = {
      type: rule.type,
      targets: newTargets,
      priority: rule.priority,
      enabled: true,
    };
    if (rule.min_mireds !== undefined) body.min_mireds = rule.min_mireds;
    if (rule.max_mireds !== undefined) body.max_mireds = rule.max_mireds;
    if (rule.area !== undefined) body.area = rule.area;
    if (rule.device_name !== undefined) body.device_name = rule.device_name;
    if (rule.max_scale !== undefined) body.max_scale = rule.max_scale;

    const res = await api.updateTransformer(rule.id, body as never);
    return { refresh: res.refresh, deleted: false };
  }

  return { resetRuleForDevice };
}
