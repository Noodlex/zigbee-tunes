// State and save handler for the rule edit dialog. Both the Devices grid and
// the Customizations page open the same dialog, so they share this instead of
// each keeping its own copy of the refs and of the apply/refresh sequence.

import { ref, type Ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { useMessage } from 'naive-ui';
import { api } from '../api/client';
import { useRuleActions } from './useRuleActions';
import type { AppliedRule, Device } from '../api/types';

interface RuleEditDialogApi {
  open: Ref<boolean>;
  rule: Ref<AppliedRule | null>;
  device: Ref<Device | null>;
  sharedDevices: Ref<Device[]>;
  saving: Ref<boolean>;
  /** Opens on one device's rule; the dialog offers a scope when it's shared. */
  openForDevice: (device: Device, rule: AppliedRule, shared: Device[]) => void;
  /** Opens on a whole configuration; no scope question, it targets them all. */
  openForConfiguration: (rule: AppliedRule, devices: Device[]) => void;
  onSave: (payload: {
    targets: string[];
    values: Record<string, unknown>;
    removals: { rule: AppliedRule; ieees: string[] }[];
  }) => Promise<void>;
}

/**
 * @param refresh reloads the caller's device list once a save lands.
 */
export function useRuleEditDialog(refresh: () => Promise<void>): RuleEditDialogApi {
  const { t } = useI18n();
  const message = useMessage();
  const { removeDevicesFromRule } = useRuleActions();

  const open = ref(false);
  const rule = ref<AppliedRule | null>(null);
  const device = ref<Device | null>(null);
  const sharedDevices = ref<Device[]>([]);
  const saving = ref(false);

  function openForDevice(target: Device, targetRule: AppliedRule, shared: Device[]) {
    rule.value = targetRule;
    device.value = target;
    // entity-rename has no signature (its value is unique per device), so it
    // is never shared and the dialog won't offer a scope.
    sharedDevices.value = shared.length > 0 ? shared : [target];
    open.value = true;
  }

  function openForConfiguration(targetRule: AppliedRule, devices: Device[]) {
    rule.value = targetRule;
    device.value = null;
    sharedDevices.value = devices;
    open.value = true;
  }

  /**
   * Removals first, then the apply.
   *
   * The order is not cosmetic. Smart-apply strips the targeted devices from
   * existing rules of that type and deletes a rule left without targets, so
   * applying first can destroy the very rule a removal was about to edit —
   * leaving a stale id. Removing first only ever shrinks rules the apply would
   * have rewritten anyway.
   *
   * Removals are pre-grouped by rule id by the dialog: one configuration can
   * span several rules, and successive single-device calls would each compute
   * their target list from the same stale rule, putting back what the previous
   * one removed.
   */
  async function onSave(payload: {
    targets: string[];
    values: Record<string, unknown>;
    removals: { rule: AppliedRule; ieees: string[] }[];
  }) {
    if (saving.value) return;
    saving.value = true;
    try {
      let republished = 0;
      let removed = 0;
      for (const group of payload.removals) {
        const res = await removeDevicesFromRule(group.ieees, group.rule);
        republished += res.refresh.republished;
        removed += group.ieees.length;
      }
      if (payload.targets.length > 0) {
        const res = await api.applyToDevices(payload.targets, [payload.values]);
        republished += res.refresh.republished;
      }
      message.success(
        removed > 0
          ? t('customizations.edit_success_with_removals', {
              count: payload.targets.length,
              removed,
              republished,
            })
          : t('customizations.edit_success', { count: payload.targets.length, republished }),
      );
      open.value = false;
      await refresh();
    } catch (e) {
      message.error(t('common.failure_prefix', { message: (e as Error).message }));
      // A removal may have landed before the failure, so the view is stale
      // either way: reload rather than leave it showing the old membership.
      await refresh();
    } finally {
      saving.value = false;
    }
  }

  return {
    open,
    rule,
    device,
    sharedDevices,
    saving,
    openForDevice,
    openForConfiguration,
    onSave,
  };
}
