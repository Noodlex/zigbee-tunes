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
  useMessage,
} from 'naive-ui';
import { api } from '../api/client';
import { useRuleActions } from '../composables/useRuleActions';
import { describeRule } from '../utils/rules';
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
const { resetRuleForDevice } = useRuleActions();

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
    const specificRules = d.applied_rules.filter((r) =>
      r.targets.some((tg) => tg.toLowerCase() === d.ieee.toLowerCase()),
    );
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
                  <NButton size="small" quaternary type="error">
                    ✕ {{ group.rules.length }}
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
                <NTag size="small" type="info" :bordered="false">{{ r.type }}</NTag>
              </div>
              <div class="rule-config">{{ describeRule(r, t) }}</div>
              <div class="rule-action">
                <NButton
                  size="small"
                  type="error"
                  ghost
                  :title="t('customizations.remove_title', { type: r.type, device: group.device.friendly_name })"
                  @click="onResetRule(group.device.ieee, r)"
                >
                  {{ t('customizations.remove_button') }}
                </NButton>
              </div>
            </div>
          </div>
        </div>
      </div>
    </NSpin>
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

.rule-config {
  font-family: 'Consolas', 'Monaco', monospace;
  font-size: 12px;
  color: var(--zt-text-secondary, #555);
}

.rule-action {
  display: flex;
  justify-content: flex-end;
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
