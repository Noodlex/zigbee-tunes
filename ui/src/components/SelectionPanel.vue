<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import {
  NCard,
  NSpace,
  NButton,
  NInputNumber,
  NInput,
  NTag,
  NAlert,
} from 'naive-ui';
import { useI18n } from 'vue-i18n';
import type { Device, TransformerType } from '../api/types';
import { miredsToKelvin, brightnessPercent } from '../utils/rules';

const { t } = useI18n();

const props = defineProps<{
  selected: Device[];
  loading: boolean;
}>();

const emit = defineEmits<{
  (e: 'clear'): void;
  (e: 'apply', changes: Changes): void;
}>();

export interface Changes {
  colorTempRange?: { min_mireds: number | null; max_mireds: number | null };
  brightnessRange?: { max_scale: number };
  suggestedArea?: { area: string };
  entityRename?: { device_name: string };
}

const colorTempMin = ref<number | null>(null);
const colorTempMax = ref<number | null>(null);
const brightnessMaxScale = ref<number | null>(null);
const area = ref<string>('');
const deviceName = ref<string>('');

watch(
  () => props.selected.length,
  (n) => {
    if (n === 0) reset();
  },
);

function reset() {
  colorTempMin.value = null;
  colorTempMax.value = null;
  brightnessMaxScale.value = null;
  area.value = '';
  deviceName.value = '';
}

function kelvin(m: number | null): string {
  if (m == null || m === 0) return t('common.unknown');
  return `${miredsToKelvin(m)}K`;
}

function brightnessPercentLabel(scale: number | null): string {
  if (scale == null || scale === 0) return t('common.unknown');
  return `${brightnessPercent(scale)}%`;
}

/**
 * Native CCT range stats across the current selection.
 * For each input (min, max) we expose the [low, high] of the device-native
 * values, plus the count of devices missing data (haven't published a CCT
 * discovery yet — typically the case when Z2M still publishes on the HA
 * default topic and Zigbee Tunes hasn't seen their `light` payload).
 *
 * - safeMin = max(all native mins) -> the lowest value every device can honor.
 * - safeMax = min(all native maxs) -> the highest value every device can honor.
 * Together (safeMin, safeMax) is the intersection — pick anything inside
 * and no device will be asked to do more than it physically can.
 */
const cctStats = computed(() => {
  const mins: number[] = [];
  const maxs: number[] = [];
  let missing = 0;
  for (const d of props.selected) {
    if (!d.capabilities.includes('color_temp')) continue;
    if (d.native_min_mireds === null || d.native_max_mireds === null) {
      missing += 1;
      continue;
    }
    mins.push(d.native_min_mireds);
    maxs.push(d.native_max_mireds);
  }
  if (mins.length === 0) {
    return { hasData: false, missing, minLow: null, minHigh: null, maxLow: null, maxHigh: null, safeMin: null, safeMax: null };
  }
  return {
    hasData: true,
    missing,
    minLow: Math.min(...mins),
    minHigh: Math.max(...mins),
    maxLow: Math.min(...maxs),
    maxHigh: Math.max(...maxs),
    safeMin: Math.max(...mins), // safe min-mireds = strictest of all
    safeMax: Math.min(...maxs), // safe max-mireds = strictest of all
  };
});

const hasColorTempChange = computed(() => colorTempMin.value !== null || colorTempMax.value !== null);
const hasBrightnessChange = computed(() => brightnessMaxScale.value !== null);
const hasAreaChange = computed(() => area.value.trim().length > 0);
const hasRenameChange = computed(() => deviceName.value.trim().length > 0);
const hasAnyChange = computed(
  () => hasColorTempChange.value || hasBrightnessChange.value || hasAreaChange.value || hasRenameChange.value,
);

const conflicts = computed(() => {
  const result: Array<{ device: Device; type: TransformerType }> = [];
  const typesToApply = new Set<TransformerType>();
  if (hasColorTempChange.value) typesToApply.add('color-temp-range');
  if (hasBrightnessChange.value) typesToApply.add('brightness-range');
  if (hasAreaChange.value) typesToApply.add('suggested-area');
  if (hasRenameChange.value) typesToApply.add('entity-rename');

  for (const d of props.selected) {
    for (const r of d.applied_rules) {
      if (typesToApply.has(r.type)) result.push({ device: d, type: r.type });
    }
  }
  return result;
});

function build(): Changes {
  const c: Changes = {};
  if (hasColorTempChange.value) {
    c.colorTempRange = { min_mireds: colorTempMin.value, max_mireds: colorTempMax.value };
  }
  if (hasBrightnessChange.value && brightnessMaxScale.value !== null) {
    c.brightnessRange = { max_scale: brightnessMaxScale.value };
  }
  if (hasAreaChange.value) c.suggestedArea = { area: area.value.trim() };
  if (hasRenameChange.value) c.entityRename = { device_name: deviceName.value.trim() };
  return c;
}

function onApply() {
  if (!hasAnyChange.value || props.loading) return;
  emit('apply', build());
}
</script>

<template>
  <NCard
    :bordered="false"
    style="background: rgba(99, 226, 183, 0.04); border-left: 3px solid #63e2b7"
    size="small"
  >
    <div class="panel-root">
      <!-- Line 1: header with count + clear -->
      <div class="panel-header">
        <div class="panel-title">
          <strong>{{ t('panel.selected', { count: selected.length }) }}</strong>
        </div>
        <NButton size="tiny" quaternary @click="emit('clear')" :disabled="loading">{{ t('panel.deselect_all') }}</NButton>
      </div>

      <!-- Tags of the selected devices -->
      <div class="selected-tags">
        <NTag v-for="d in selected" :key="d.ieee" size="small" type="success" :bordered="false">
          {{ d.friendly_name }}
        </NTag>
      </div>

      <!-- Compact table: 1 row per transformer -->
      <div class="rules-table">
        <div class="rule-row rule-row-cct">
          <span class="rule-label">{{ t('panel.rule_color_temp_range') }}</span>
          <div class="rule-fields">
            <div class="cct-input-group">
              <div class="cct-input-row">
                <span class="field-label">{{ t('panel.field_min') }}</span>
                <NInputNumber v-model:value="colorTempMin" :min="100" :max="700" :placeholder="t('panel.mireds_placeholder')" size="small" clearable :show-button="false" style="width: 90px" />
                <span class="field-hint">{{ kelvin(colorTempMin) }}</span>
              </div>
              <div v-if="cctStats.hasData" class="cct-native-line">
                {{ t('panel.cct_native_range', { low: cctStats.minLow, high: cctStats.minHigh }) }}
              </div>
            </div>

            <span class="field-sep">·</span>

            <div class="cct-input-group">
              <div class="cct-input-row">
                <span class="field-label">{{ t('panel.field_max') }}</span>
                <NInputNumber v-model:value="colorTempMax" :min="100" :max="700" :placeholder="t('panel.mireds_placeholder')" size="small" clearable :show-button="false" style="width: 90px" />
                <span class="field-hint">{{ kelvin(colorTempMax) }}</span>
              </div>
              <div v-if="cctStats.hasData" class="cct-native-line">
                {{ t('panel.cct_native_range', { low: cctStats.maxLow, high: cctStats.maxHigh }) }}
              </div>
            </div>
          </div>
          <!-- Footer row: intersection + missing-data warning -->
          <div v-if="cctStats.hasData || cctStats.missing > 0" class="cct-footer">
            <span v-if="cctStats.hasData" class="cct-safe">
              {{ t('panel.cct_safe_intersection', { min: cctStats.safeMin, max: cctStats.safeMax }) }}
            </span>
            <span v-if="cctStats.missing > 0" class="cct-missing">
              {{ t('panel.cct_missing_data', { count: cctStats.missing }) }}
            </span>
          </div>
        </div>

        <div class="rule-row">
          <span class="rule-label">{{ t('panel.rule_brightness_range') }}</span>
          <div class="rule-fields">
            <span class="field-label">{{ t('panel.field_max_scale') }}</span>
            <NInputNumber v-model:value="brightnessMaxScale" :min="1" :max="254" :placeholder="t('panel.scale_placeholder')" size="small" clearable :show-button="false" style="width: 90px" />
            <span class="field-hint">{{ t('panel.field_brightness_max', { value: brightnessPercentLabel(brightnessMaxScale) }) }}</span>
            <span class="field-info">{{ t('panel.field_brightness_hint') }}</span>
          </div>
        </div>

        <div class="rule-row">
          <span class="rule-label">{{ t('panel.rule_suggested_area') }}</span>
          <div class="rule-fields">
            <NInput v-model:value="area" :placeholder="t('panel.area_placeholder')" size="small" clearable style="max-width: 280px" />
          </div>
        </div>

        <div class="rule-row">
          <span class="rule-label">{{ t('panel.rule_entity_rename') }}</span>
          <div class="rule-fields">
            <NInput v-model:value="deviceName" :placeholder="t('panel.device_name_placeholder')" size="small" clearable style="max-width: 280px" />
          </div>
        </div>
      </div>

      <!-- Conflicts + apply button -->
      <div class="panel-footer">
        <div class="conflicts-zone">
          <NAlert v-if="conflicts.length > 0" type="warning" :show-icon="false" size="small">
            <template #header>
              <span style="font-weight: 600; font-size: 12px">{{ t('panel.conflicts_header', { count: conflicts.length }) }}</span>
            </template>
            <div style="font-size: 11px; max-height: 80px; overflow-y: auto">
              <div v-for="(c, i) in conflicts" :key="i">
                <strong>{{ c.device.friendly_name }}</strong> · <code>{{ c.type }}</code>
              </div>
            </div>
          </NAlert>
        </div>
        <NButton
          type="primary"
          :disabled="!hasAnyChange || loading"
          :loading="loading"
          @click="onApply"
          size="small"
        >
          {{ t('panel.apply_button', { count: selected.length }) }}
        </NButton>
      </div>
    </div>
  </NCard>
</template>

<style scoped>
.panel-root {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.panel-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.panel-title {
  font-size: 14px;
}

.selected-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  max-height: 60px;
  overflow-y: auto;
  padding: 2px 0;
}

.rules-table {
  border-top: 1px solid var(--zt-divider, rgba(255, 255, 255, 0.08));
  border-bottom: 1px solid var(--zt-divider, rgba(255, 255, 255, 0.08));
}

.rule-row {
  display: grid;
  grid-template-columns: 170px 1fr;
  align-items: center;
  padding: 6px 0;
  border-bottom: 1px solid var(--zt-divider-subtle, rgba(255, 255, 255, 0.04));
}
.rule-row:last-child {
  border-bottom: none;
}

/* CCT row is taller because it adds native-range hints under each input. */
.rule-row-cct {
  align-items: start;
  padding: 10px 0;
}
.rule-row-cct .rule-label {
  padding-top: 8px;
}

.cct-input-group {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.cct-input-row {
  display: flex;
  align-items: center;
  gap: 8px;
}

.cct-native-line {
  font-size: 10px;
  color: var(--zt-text-hint, #888);
  margin-left: 24px; /* aligns under the input (after the label) */
  font-style: italic;
}

.cct-footer {
  grid-column: 2;
  margin-top: 6px;
  display: flex;
  gap: 12px;
  flex-wrap: wrap;
  font-size: 11px;
}
.cct-safe {
  color: var(--zt-text-success, #63e2b7);
}
.cct-missing {
  color: var(--zt-text-warning, #f0a020);
}

.rule-label {
  font-family: 'Consolas', 'Monaco', monospace;
  font-size: 12px;
  color: var(--zt-text-secondary, #aaa);
}

.rule-fields {
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
  min-width: 60px;
}

.field-info {
  font-size: 11px;
  color: var(--zt-text-info, #666);
  font-style: italic;
}

.field-sep {
  color: var(--zt-text-info, #666);
}

.panel-footer {
  display: flex;
  justify-content: space-between;
  align-items: flex-end;
  gap: 12px;
}

.conflicts-zone {
  flex: 1;
}

/* On phones: stack each transformer row (label above its fields) and let
   the Apply button go full-width instead of cramming everything on one
   line. The CCT input groups already wrap via flex-wrap. */
@media (max-width: 640px) {
  .rule-row {
    grid-template-columns: 1fr;
    gap: 4px;
    padding: 8px 0;
  }
  .rule-row-cct .rule-label {
    padding-top: 0;
  }
  /* The CCT footer is placed in grid column 2 for the desktop two-column
     row; reset it to column 1 once the row collapses to a single column,
     otherwise it lands in a phantom implicit column and overflows. */
  .cct-footer {
    grid-column: 1;
    margin-left: 0;
  }
  .cct-native-line {
    margin-left: 0;
  }
  .panel-footer {
    flex-direction: column;
    align-items: stretch;
  }
}
</style>
