<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import {
  NSpace,
  NButton,
  NAlert,
  NSpin,
  NTag,
  NInput,
  NEllipsis,
  NEmpty,
  NPopconfirm,
  NIcon,
  useMessage,
} from 'naive-ui';
import { IconPencil, IconTrash } from '../components/icons';
import { api } from '../api/client';
import { useRuleActions } from '../composables/useRuleActions';
import { useConfigurations, type ConfigEntry } from '../composables/useConfigurations';
import { useRuleEditDialog } from '../composables/useRuleEditDialog';
import RuleEditModal from '../components/RuleEditModal.vue';
import { describeRule, ruleSignature, specificRulesFor } from '../utils/rules';
import { isZ2mGroup } from '../utils/devices';
import type { Device, AppliedRule } from '../api/types';

interface DeviceGroup {
  device: Device;
  rules: AppliedRule[];
  searchHay: string; // pre-computed for full-text search
}

const { t } = useI18n();
const devices = ref<Device[]>([]);
const loading = ref(true);
const error = ref<string | null>(null);
const search = ref('');

const message = useMessage();
const { resetRuleForDevice, removeDevicesFromRule } = useRuleActions();

async function refresh() {
  loading.value = true;
  error.value = null;
  try {
    devices.value = await api.devices();
  } catch (e) {
    error.value = (e as Error).message;
  } finally {
    loading.value = false;
  }
}

/** Groups each modified device with the rules that specifically target it. */
const allGroups = computed<DeviceGroup[]>(() => {
  const result: DeviceGroup[] = [];
  for (const d of devices.value) {
    const specificRules = specificRulesFor(d);
    if (specificRules.length === 0) continue;
    const rulesText = specificRules.map((r) => `${r.type} ${describeRule(r, t)}`).join(' ');
    result.push({
      device: d,
      rules: specificRules,
      searchHay:
        `${d.friendly_name} ${d.ieee} ${d.vendor} ${d.model_id} ${d.model} ${rulesText}`.toLowerCase(),
    });
  }
  return result.sort((a, b) => a.device.friendly_name.localeCompare(b.device.friendly_name));
});

const filtered = computed<DeviceGroup[]>(() => {
  const q = search.value.trim().toLowerCase();
  if (!q) return allGroups.value;
  return allGroups.value.filter((g) => g.searchHay.includes(q));
});

const { list: configurations, tagStyle, sharedDevicesFor } = useConfigurations(devices);

// A configuration (a signature: type + values) can be shared by several
// devices, so editing one from a device row is ambiguous: change it for that
// device alone, or for everyone using it? The dialog asks before showing the
// values. Opening it from the Configurations list is always the whole set, so
// no question is asked there.
const edit = useRuleEditDialog(refresh);

function openDeviceEdit(device: Device, rule: AppliedRule) {
  edit.openForDevice(device, rule, sharedDevicesFor(rule));
}

function openConfigEdit(entry: ConfigEntry) {
  edit.openForConfiguration(entry.rule, entry.devices);
}

/** Any write in flight — every row action is disabled while one runs. */
const deleting = ref(false);
const busy = computed(() => deleting.value || edit.saving.value);

/**
 * Removes a whole configuration: every device using it loses the rule.
 *
 * Devices are grouped by rule id first, because one rule can cover several of
 * them — removing them device by device would send target lists computed from
 * the same stale rule and put back what the previous call removed.
 */
async function deleteConfiguration(entry: ConfigEntry) {
  if (busy.value) return;
  const byRule = new Map<number, { rule: AppliedRule; ieees: string[] }>();
  for (const g of allGroups.value) {
    for (const r of g.rules) {
      if (ruleSignature(r) !== entry.sig) continue;
      const found = byRule.get(r.id);
      if (found) found.ieees.push(g.device.ieee);
      else byRule.set(r.id, { rule: r, ieees: [g.device.ieee] });
    }
  }
  deleting.value = true;
  let republished = 0;
  try {
    for (const { rule, ieees } of byRule.values()) {
      const res = await removeDevicesFromRule(ieees, rule);
      republished += res.refresh.republished;
    }
    message.success(
      t('customizations.delete_config_success', { count: entry.devices.length, republished }),
    );
    await refresh();
  } catch (e) {
    message.error(t('common.failure_prefix', { message: (e as Error).message }));
    await refresh();
  } finally {
    deleting.value = false;
  }
}

async function onResetRule(deviceIeee: string, rule: AppliedRule) {
  try {
    const { refresh: r, deleted } = await resetRuleForDevice(deviceIeee, rule);
    message.success(
      deleted
        ? t('devices.reset_success_deleted', { type: rule.type, republished: r.republished })
        : t('devices.reset_success_partial', { republished: r.republished }),
    );
    await refresh();
  } catch (e) {
    message.error(t('common.failure_prefix', { message: (e as Error).message }));
  }
}

async function onResetAllForDevice(deviceIeee: string, rules: AppliedRule[]) {
  let republished = 0;
  try {
    for (const rule of rules) {
      const { refresh: r } = await resetRuleForDevice(deviceIeee, rule);
      republished += r.republished;
    }
    message.success(t('devices.reset_success_partial', { republished }));
    await refresh();
  } catch (e) {
    message.error(t('common.failure_prefix', { message: (e as Error).message }));
    await refresh();
  }
}

onMounted(refresh);
</script>

<template>
  <NSpace vertical :size="16">
    <NSpace align="center" justify="space-between">
      <h2 style="margin: 0">
        {{ t('customizations.title') }}
        <span style="color: var(--zt-text-hint, #888); font-size: 13px; font-weight: normal">
          ({{ filtered.length }}{{ filtered.length !== allGroups.length ? ` / ${allGroups.length}` : '' }})
        </span>
      </h2>
      <NButton @click="refresh" :loading="loading" size="small">{{ t('common.refresh') }}</NButton>
    </NSpace>

    <p
      style="color: var(--zt-text-hint, #888); font-size: 13px; margin: 0"
      v-html="t('customizations.description', { targetsAll: '<code>targets: [&quot;*&quot;]</code>' })"
    />

    <!-- Configurations: one line per distinct configuration in use. Devices
         on the same line are normalized identically; editing one device's
         values moves it to its own line (and its own colour). -->
    <div v-if="configurations.length > 0" class="configs">
      <div class="configs-title">
        {{ t('customizations.configs_title', { count: configurations.length }) }}
      </div>
      <div class="configs-list">
        <div v-for="e in configurations" :key="e.sig" class="config-row">
          <div class="config-type">
            <NTag size="small" :bordered="false" :color="tagStyle(e.rule)">
              {{ e.rule.type }}
            </NTag>
          </div>
          <div class="config-values">{{ describeRule(e.rule, t) }}</div>
          <div class="config-devices" :title="e.devices.map((d) => d.friendly_name).join(', ')">
            {{ t('customizations.configs_devices', { count: e.devices.length }) }}
          </div>
          <div class="row-actions">
            <NButton
              size="small"
              quaternary
              circle
              :disabled="busy"
              :aria-label="t('customizations.legend_edit_title', { count: e.devices.length })"
              :title="t('customizations.legend_edit_title', { count: e.devices.length })"
              @click="openConfigEdit(e)"
            >
              <template #icon><NIcon><component :is="IconPencil" /></NIcon></template>
            </NButton>
            <NPopconfirm
              :on-positive-click="() => deleteConfiguration(e)"
              :positive-text="t('common.remove')"
              :negative-text="t('common.cancel')"
            >
              <template #trigger>
                <NButton
                  size="small"
                  quaternary
                  circle
                  type="error"
                  :disabled="busy"
                  :aria-label="t('customizations.legend_delete_title', { count: e.devices.length })"
                  :title="t('customizations.legend_delete_title', { count: e.devices.length })"
                >
                  <template #icon><NIcon><component :is="IconTrash" /></NIcon></template>
                </NButton>
              </template>
              {{ t('customizations.legend_delete_confirm', { count: e.devices.length }) }}
            </NPopconfirm>
          </div>
        </div>
      </div>
    </div>

    <NInput
      v-model:value="search"
      :placeholder="t('customizations.search_placeholder')"
      clearable
      style="max-width: 480px"
    />

    <NAlert v-if="error" type="error" :title="t('common.error_prefix', { message: error })" />

    <NSpin :show="loading && devices.length === 0">
      <NEmpty
        v-if="!loading && filtered.length === 0"
        :description="t('customizations.empty')"
        size="small"
      />

      <div v-else class="device-blocks">
        <div
          v-for="group in filtered"
          :key="group.device.ieee"
          class="device-block"
          :class="{ 'device-block-group': isZ2mGroup(group.device) }"
        >
          <!-- Grid keeps friendly_name / vendor / model / ieee in fixed columns
               across rows so the eye can scan a single field vertically (all
               IKEA bulbs in a column, all RS 227 T model_ids stacked, etc.). -->
          <div class="device-header">
            <span class="cell device-name">
              <NEllipsis :line-clamp="1">{{ group.device.friendly_name }}</NEllipsis>
            </span>
            <span class="cell device-vendor">
              <span
                v-if="isZ2mGroup(group.device)"
                class="group-badge"
                :title="t('common.group_badge_title')"
              >{{ t('common.group_badge') }}</span>
              <template v-else>{{ group.device.vendor || t('common.unknown') }}</template>
            </span>
            <span
              class="cell device-model"
              :class="{ 'device-model-empty': isZ2mGroup(group.device) }"
            >
              {{ isZ2mGroup(group.device) ? '' : (group.device.model_id || t('common.unknown')) }}
            </span>
            <code class="cell device-ieee">{{ group.device.ieee }}</code>
            <div class="device-actions">
              <NPopconfirm
                v-if="group.rules.length > 1"
                :on-positive-click="() => onResetAllForDevice(group.device.ieee, group.rules)"
                :positive-text="t('common.remove')"
                :negative-text="t('common.cancel')"
              >
                <template #trigger>
                  <NButton
                    size="small"
                    quaternary
                    type="error"
                    :disabled="busy"
                    :aria-label="t('customizations.remove_all_title', { count: group.rules.length, device: group.device.friendly_name })"
                    :title="t('customizations.remove_all_title', { count: group.rules.length, device: group.device.friendly_name })"
                  >
                    <template #icon><NIcon><component :is="IconTrash" /></NIcon></template>
                    {{ group.rules.length }}
                  </NButton>
                </template>
                {{ t('customizations.remove_title', { type: '*', device: group.device.friendly_name }) }}
              </NPopconfirm>
            </div>
          </div>

          <!-- Header-less sub-table of rules for this device -->
          <div class="rules-grid">
            <div v-for="r in group.rules" :key="r.id" class="rule-row">
              <div class="rule-type">
                <NTag size="small" :bordered="false" :color="tagStyle(r)">{{ r.type }}</NTag>
                <!-- Shared configuration: say so here, so you know before
                     clicking Edit that other devices are on the same one. -->
                <span
                  v-if="sharedDevicesFor(r).length > 1"
                  class="shared-badge"
                  :title="t('customizations.shared_badge_title', {
                    count: sharedDevicesFor(r).length,
                    devices: sharedDevicesFor(r).map((d) => d.friendly_name).join(', '),
                  })"
                >
                  ×{{ sharedDevicesFor(r).length }}
                </span>
              </div>

              <div class="rule-config">
                <span class="rule-config-text">{{ describeRule(r, t) }}</span>
              </div>

              <div class="row-actions">
                <NButton
                  size="small"
                  quaternary
                  circle
                  :disabled="busy"
                  :aria-label="t('customizations.edit_title', { type: r.type, device: group.device.friendly_name })"
                  :title="t('customizations.edit_title', { type: r.type, device: group.device.friendly_name })"
                  @click="openDeviceEdit(group.device, r)"
                >
                  <template #icon><NIcon><component :is="IconPencil" /></NIcon></template>
                </NButton>
                <NPopconfirm
                  :on-positive-click="() => onResetRule(group.device.ieee, r)"
                  :positive-text="t('common.remove')"
                  :negative-text="t('common.cancel')"
                >
                  <template #trigger>
                    <NButton
                      size="small"
                      quaternary
                      circle
                      type="error"
                      :disabled="busy"
                      :aria-label="t('customizations.remove_title', { type: r.type, device: group.device.friendly_name })"
                      :title="t('customizations.remove_title', { type: r.type, device: group.device.friendly_name })"
                    >
                      <template #icon><NIcon><component :is="IconTrash" /></NIcon></template>
                    </NButton>
                  </template>
                  {{ t('customizations.remove_title', { type: r.type, device: group.device.friendly_name }) }}
                </NPopconfirm>
              </div>
            </div>
          </div>
        </div>
      </div>
    </NSpin>

    <RuleEditModal
      v-model:show="edit.open.value"
      :rule="edit.rule.value"
      :device="edit.device.value"
      :shared-devices="edit.sharedDevices.value"
      :saving="edit.saving.value"
      @save="edit.onSave"
    />
  </NSpace>
</template>

<style scoped>
.device-blocks {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.device-block {
  border: 1px solid var(--zt-divider, rgba(127, 127, 127, 0.15));
  border-radius: 8px;
  overflow: hidden;
  background-color: var(--zt-card-bg, transparent);
}

/* Z2M groups: dashed border + faint blue tint so it's obvious at a
   glance they aren't physical devices. */
.device-block-group {
  border-style: dashed;
  border-color: var(--zt-card-group-border, rgba(96, 168, 255, 0.35));
}
.device-block-group .device-header {
  background-color: var(--zt-card-group-bg, rgba(96, 168, 255, 0.06));
}

.group-badge {
  display: inline-block;
  padding: 1px 6px;
  border-radius: 4px;
  background: rgba(96, 168, 255, 0.18);
  color: var(--zt-text-group, #4a8fdc);
  font-size: 10px;
  font-weight: 600;
  letter-spacing: 0.04em;
  text-transform: uppercase;
}

/* Five-column grid, all cells baseline-aligned. Widths are tuned for a
   typical Zigbee fleet: friendly_name takes the slack, vendor / model
   are intentionally narrow so all 4 metadata columns finish on the
   left half and the eye doesn't have to traverse the whole row. */
.device-header {
  display: grid;
  grid-template-columns: minmax(160px, 1.6fr) 110px 140px minmax(180px, 1fr) auto;
  gap: 16px;
  align-items: baseline;
  padding: 12px 16px;
  border-bottom: 1px solid var(--zt-divider, rgba(127, 127, 127, 0.10));
  background-color: var(--zt-image-bg, rgba(127, 127, 127, 0.04));
}

.cell {
  min-width: 0; /* let NEllipsis / overflow:ellipsis kick in */
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.device-name {
  font-weight: 600;
  font-size: 15px;
}

.device-vendor {
  font-size: 13px;
  color: var(--zt-text-secondary, #555);
}

.device-model {
  font-size: 12px;
  color: var(--zt-text-secondary, #777);
}

.device-ieee {
  font-family: 'Consolas', 'Monaco', monospace;
  font-size: 11px;
  color: var(--zt-text-hint, #888);
}

.device-actions {
  justify-self: end;
}

.rules-grid {
  display: flex;
  flex-direction: column;
}

.rule-row {
  display: grid;
  grid-template-columns: 180px 1fr auto;
  gap: 16px;
  align-items: center;
  padding: 10px 16px 10px 32px;
  border-bottom: 1px solid var(--zt-divider-subtle, rgba(127, 127, 127, 0.05));
}

.rule-row:last-child {
  border-bottom: none;
}

.rule-type {
  display: flex;
  align-items: center;
  gap: 6px;
}

/* "×3" on a rule row: this configuration is shared, editing it will ask. */
.shared-badge {
  font-size: 10px;
  font-weight: 600;
  padding: 1px 5px;
  border-radius: 4px;
  background: var(--zt-image-bg, rgba(127, 127, 127, 0.10));
  color: var(--zt-text-secondary, #555);
  cursor: default;
}

/* Monospace lives on the read-only text only — the edit fields keep the
   regular UI font for their labels. */
.rule-config-text {
  font-family: 'Consolas', 'Monaco', monospace;
  font-size: 12px;
  color: var(--zt-text-secondary, #555);
}


/* Configurations: one line per distinct configuration, so a fleet with a
   dozen of them stays scannable and the colours map to actual values.
   Same column rhythm as .rule-row below. */
.configs {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.configs-title {
  font-size: 12px;
  color: var(--zt-text-hint, #888);
}

.configs-list {
  border: 1px solid var(--zt-divider, rgba(127, 127, 127, 0.15));
  border-radius: 8px;
  overflow: hidden;
  background-color: var(--zt-card-bg, transparent);
}

.config-row {
  display: grid;
  grid-template-columns: 180px 1fr 110px auto;
  gap: 16px;
  align-items: center;
  padding: 8px 16px;
  border-bottom: 1px solid var(--zt-divider-subtle, rgba(127, 127, 127, 0.05));
}

.config-row:last-child {
  border-bottom: none;
}

.config-values {
  font-family: 'Consolas', 'Monaco', monospace;
  font-size: 12px;
  color: var(--zt-text-secondary, #555);
}

.config-devices {
  font-size: 11px;
  color: var(--zt-text-hint, #888);
  cursor: default;
}

/* Same action pair everywhere: pencil to edit, bin to remove, identical
   size and variant in the configuration list and on the device rows. */
.row-actions {
  display: flex;
  justify-content: flex-end;
  gap: 4px;
}

@media (max-width: 720px) {
  .config-row {
    grid-template-columns: 1fr auto;
    gap: 6px 12px;
  }
  .config-values {
    grid-column: 1 / -1;
    grid-row: 2;
  }
}

/* Stack the 5-column header and the rule rows on small screens instead of
   squeezing them (the IEEE + actions used to overflow). */
@media (max-width: 720px) {
  .device-header {
    grid-template-columns: 1fr auto;
    align-items: start;
    gap: 4px 12px;
  }
  .device-name,
  .device-vendor,
  .device-model,
  .device-ieee {
    grid-column: 1;
  }
  /* Let the IEEE wrap when stacked instead of ellipsis-truncating an
     address the user may want to copy. */
  .device-ieee {
    white-space: normal;
    word-break: break-all;
  }
  /* Groups have no model — drop the empty cell on mobile so it doesn't
     leave a blank row in the stacked metadata. */
  .device-model-empty {
    display: none;
  }
  .device-actions {
    grid-column: 2;
    grid-row: 1 / span 4;
    align-self: start;
  }

  .rule-row {
    grid-template-columns: 1fr auto;
    gap: 6px 12px;
    padding: 10px 16px;
  }
  .rule-config {
    grid-column: 1 / -1;
    grid-row: 2;
  }
}
</style>
