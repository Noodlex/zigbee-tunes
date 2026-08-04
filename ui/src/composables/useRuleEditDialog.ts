// State and save handler for the rule edit dialog. Both the Devices grid and
// the Customizations page open the same dialog, so they share this instead of
// each keeping its own copy of the refs and of the apply/refresh sequence.

import { ref, type Ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { useMessage } from 'naive-ui';
import { api } from '../api/client';
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
  onSave: (payload: { targets: string[]; values: Record<string, unknown> }) => Promise<void>;
}

/**
 * @param refresh reloads the caller's device list once a save lands.
 */
export function useRuleEditDialog(refresh: () => Promise<void>): RuleEditDialogApi {
  const { t } = useI18n();
  const message = useMessage();

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
   * Saves through the smart-apply endpoint: the backend drops the targeted
   * devices from the existing rules of that type (deleting a rule left without
   * targets) and recreates one rule with the new values, in a single atomic
   * refresh.
   */
  async function onSave(payload: { targets: string[]; values: Record<string, unknown> }) {
    if (saving.value) return;
    saving.value = true;
    try {
      const res = await api.applyToDevices(payload.targets, [payload.values]);
      message.success(
        t('customizations.edit_success', {
          count: payload.targets.length,
          republished: res.refresh.republished,
        }),
      );
      open.value = false;
      await refresh();
    } catch (e) {
      message.error(t('common.failure_prefix', { message: (e as Error).message }));
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
