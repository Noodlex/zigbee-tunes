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
  NInputNumber,
  NEllipsis,
  NEmpty,
  NPopconfirm,
  useMessage,
} from 'naive-ui';
import { api } from '../api/client';
import { useRuleActions } from '../composables/useRuleActions';
import {
  describeRule,
  ruleSignature,
  signatureStyle,
  neutralTagStyle,
  miredsToKelvin,
  brightnessPercent,
  type TagStyle,
} from '../utils/rules';
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

interface LegendEntry {
  sig: string;
  index: number;
  rule: AppliedRule; // representative, for describeRule()
  count: number; // how many devices share this exact configuration
}

/**
 * Distinct rule signatures across the WHOLE list (not the filtered view) so
 * a colour keeps its meaning while the user types in the search box.
 * Sorted with a numeric-aware comparator so "min 90" lands before "min 153"
 * instead of string-sorting; the index drives the colour assignment.
 */
const signatures = computed(() => {
  const seen = new Map<string, { rule: AppliedRule; count: number }>();
  for (const g of allGroups.value) {
    for (const r of g.rules) {
      const sig = ruleSignature(r);
      if (sig === null) continue;
      const entry = seen.get(sig);
      if (entry) entry.count += 1;
      else seen.set(sig, { rule: r, count: 1 });
    }
  }
  const ordered = [...seen.keys()].sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
  const index = new Map<string, number>();
  const legend: LegendEntry[] = ordered.map((sig, i) => {
    index.set(sig, i);
    const e = seen.get(sig)!;
    return { sig, index: i, rule: e.rule, count: e.count };
  });
  return { index, legend };
});

/** Tag colour for a rule: same values -> same colour, different -> different. */
function tagStyle(rule: AppliedRule): TagStyle {
  const sig = ruleSignature(rule);
  if (sig === null) return neutralTagStyle();
  const index = signatures.value.index.get(sig);
  return index === undefined ? neutralTagStyle() : signatureStyle(index);
}

// --- Inline edit -----------------------------------------------------------
// The same rule id can appear under several devices (a rule targeting many
// devices renders one row per device), so the edit key pairs both.
const editingKey = ref<string | null>(null);
const editingRule = ref<AppliedRule | null>(null);
const editMin = ref<number | null>(null);
const editMax = ref<number | null>(null);
const editScale = ref<number | null>(null);
const editText = ref('');
const saving = ref(false);

function editKey(ieee: string, rule: AppliedRule): string {
  return `${ieee}:${rule.id}`;
}

function isEditing(ieee: string, rule: AppliedRule): boolean {
  return editingKey.value === editKey(ieee, rule);
}

function startEdit(ieee: string, rule: AppliedRule) {
  editingKey.value = editKey(ieee, rule);
  editingRule.value = rule;
  editMin.value = rule.min_mireds ?? null;
  editMax.value = rule.max_mireds ?? null;
  editScale.value = rule.max_scale ?? null;
  editText.value =
    rule.type === 'suggested-area'
      ? (rule.area ?? '')
      : rule.type === 'entity-rename'
        ? (rule.device_name ?? '')
        : '';
}

function cancelEdit() {
  editingKey.value = null;
  editingRule.value = null;
}

const editValid = computed(() => {
  const rule = editingRule.value;
  if (!rule) return false;
  switch (rule.type) {
    case 'color-temp-range':
      return editMin.value !== null || editMax.value !== null;
    case 'brightness-range':
      return editScale.value !== null;
    default:
      return editText.value.trim().length > 0;
  }
});

function kelvinLabel(mireds: number | null): string {
  if (mireds === null || mireds === 0) return '';
  return `${miredsToKelvin(mireds)}K`;
}

function scaleLabel(scale: number | null): string {
  if (scale === null || scale === 0) return '';
  return `${brightnessPercent(scale)}%`;
}

/**
 * Saves the edited values through the same smart-apply endpoint the Devices
 * view uses: the backend drops this device from the existing rule of that
 * type (deleting the rule if it targeted nobody else) and recreates it with
 * the new values, in a single atomic refresh. Other devices that shared the
 * original rule keep it untouched — same semantics as the ✕ button.
 */
async function saveEdit(ieee: string, rule: AppliedRule) {
  if (!editValid.value || saving.value) return;
  const payload: Record<string, unknown> = { type: rule.type };
  switch (rule.type) {
    case 'color-temp-range':
      if (editMin.value !== null) payload.min_mireds = editMin.value;
      if (editMax.value !== null) payload.max_mireds = editMax.value;
      break;
    case 'brightness-range':
      payload.max_scale = editScale.value;
      break;
    case 'suggested-area':
      payload.area = editText.value.trim();
      break;
    case 'entity-rename':
      payload.device_name = editText.value.trim();
      break;
  }
  saving.value = true;
  try {
    const res = await api.applyToDevices([ieee], [payload]);
    message.success(t('customizations.edit_success', { republished: res.refresh.republished }));
    cancelEdit();
    await refresh();
  } catch (e) {
    message.error(t('common.failure_prefix', { message: (e as Error).message }));
  } finally {
    saving.value = false;
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

    <!-- Colour legend: one entry per distinct rule configuration in use.
         Devices sharing an entry are normalized identically; editing one
         device's values moves it to a new entry (and a new colour). -->
    <div v-if="signatures.legend.length > 0" class="legend">
      <span class="legend-title">{{ t('customizations.legend_title') }}</span>
      <span v-for="e in signatures.legend" :key="e.sig" class="legend-item">
        <NTag size="small" :bordered="false" :color="signatureStyle(e.index)">
          {{ e.rule.type }}
        </NTag>
        <span class="legend-config">{{ describeRule(e.rule, t) }}</span>
        <span class="legend-count">×{{ e.count }}</span>
      </span>
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
                <NTag size="small" :bordered="false" :color="tagStyle(r)">{{ r.type }}</NTag>
              </div>

              <div class="rule-config">
                <span v-if="!isEditing(group.device.ieee, r)" class="rule-config-text">
                  {{ describeRule(r, t) }}
                </span>

                <div v-else class="edit-fields">
                  <template v-if="r.type === 'color-temp-range'">
                    <span class="field-label">{{ t('panel.field_min') }}</span>
                    <NInputNumber
                      v-model:value="editMin"
                      :min="100"
                      :max="700"
                      :placeholder="t('panel.mireds_placeholder')"
                      size="small"
                      clearable
                      :show-button="false"
                      style="width: 88px"
                    />
                    <span class="field-hint">{{ kelvinLabel(editMin) }}</span>
                    <span class="field-sep">·</span>
                    <span class="field-label">{{ t('panel.field_max') }}</span>
                    <NInputNumber
                      v-model:value="editMax"
                      :min="100"
                      :max="700"
                      :placeholder="t('panel.mireds_placeholder')"
                      size="small"
                      clearable
                      :show-button="false"
                      style="width: 88px"
                    />
                    <span class="field-hint">{{ kelvinLabel(editMax) }}</span>
                    <span
                      v-if="group.device.native_min_mireds !== null && group.device.native_max_mireds !== null"
                      class="field-native"
                    >
                      {{ t('panel.cct_native_range', {
                        low: group.device.native_min_mireds,
                        high: group.device.native_max_mireds,
                      }) }}
                    </span>
                  </template>

                  <template v-else-if="r.type === 'brightness-range'">
                    <span class="field-label">{{ t('panel.field_max_scale') }}</span>
                    <NInputNumber
                      v-model:value="editScale"
                      :min="1"
                      :max="254"
                      :placeholder="t('panel.scale_placeholder')"
                      size="small"
                      clearable
                      :show-button="false"
                      style="width: 88px"
                    />
                    <span class="field-hint">{{ scaleLabel(editScale) }}</span>
                    <span class="field-native">{{ t('panel.field_brightness_hint') }}</span>
                  </template>

                  <NInput
                    v-else
                    v-model:value="editText"
                    :placeholder="r.type === 'suggested-area'
                      ? t('panel.area_placeholder')
                      : t('panel.device_name_placeholder')"
                    size="small"
                    clearable
                    style="max-width: 280px"
                  />
                </div>
              </div>

              <div class="rule-action">
                <template v-if="!isEditing(group.device.ieee, r)">
                  <NButton
                    size="small"
                    quaternary
                    :title="t('customizations.edit_title', { type: r.type, device: group.device.friendly_name })"
                    @click="startEdit(group.device.ieee, r)"
                  >
                    {{ t('common.edit') }}
                  </NButton>
                  <NButton
                    size="small"
                    type="error"
                    ghost
                    :title="t('customizations.remove_title', { type: r.type, device: group.device.friendly_name })"
                    @click="onResetRule(group.device.ieee, r)"
                  >
                    {{ t('customizations.remove_button') }}
                  </NButton>
                </template>
                <template v-else>
                  <NButton
                    size="small"
                    type="primary"
                    :disabled="!editValid"
                    :loading="saving"
                    @click="saveEdit(group.device.ieee, r)"
                  >
                    {{ t('common.save') }}
                  </NButton>
                  <NButton size="small" quaternary :disabled="saving" @click="cancelEdit">
                    {{ t('common.cancel') }}
                  </NButton>
                </template>
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

/* Monospace lives on the read-only text only — the edit fields keep the
   regular UI font for their labels. */
.rule-config-text {
  font-family: 'Consolas', 'Monaco', monospace;
  font-size: 12px;
  color: var(--zt-text-secondary, #555);
}

.rule-action {
  display: flex;
  justify-content: flex-end;
  gap: 6px;
}

/* Colour legend: recaps every distinct rule configuration in use, so a tag
   colour can be traced back to actual values. */
.legend {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px 16px;
}

.legend-title {
  font-size: 12px;
  color: var(--zt-text-hint, #888);
}

.legend-item {
  display: inline-flex;
  align-items: center;
  gap: 6px;
}

.legend-config {
  font-family: 'Consolas', 'Monaco', monospace;
  font-size: 11px;
  color: var(--zt-text-secondary, #555);
}

.legend-count {
  font-size: 11px;
  color: var(--zt-text-hint, #888);
}

.edit-fields {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}

.field-label {
  font-size: 11px;
  color: var(--zt-text-hint, #888);
}

.field-hint {
  font-size: 11px;
  color: var(--zt-text-hint, #888);
  min-width: 44px;
}

.field-sep {
  color: var(--zt-text-info, #666);
}

.field-native {
  font-size: 10px;
  font-style: italic;
  color: var(--zt-text-hint, #888);
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
