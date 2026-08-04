<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { NCard, NSpace, NButton, NTag, NAlert } from 'naive-ui';
import { useI18n } from 'vue-i18n';
import RuleEditFields from './RuleEditFields.vue';
import { isRangeOrdered } from '../utils/rules';
import type { Device, TransformerType } from '../api/types';

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

const hasColorTempChange = computed(() => colorTempMin.value !== null || colorTempMax.value !== null);
/** Refuse to create a rule whose bounds are inverted (empty clamp window). */
const colorTempOrdered = computed(() => isRangeOrdered(colorTempMin.value, colorTempMax.value));
const hasBrightnessChange = computed(() => brightnessMaxScale.value !== null);
const hasAreaChange = computed(() => area.value.trim().length > 0);
const hasRenameChange = computed(() => deviceName.value.trim().length > 0);
const hasAnyChange = computed(
  () => hasColorTempChange.value || hasBrightnessChange.value || hasAreaChange.value || hasRenameChange.value,
);

const canApply = computed(() => hasAnyChange.value && colorTempOrdered.value);

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
  if (!canApply.value || props.loading) return;
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

      <!-- Compact table: 1 row per transformer. Each row uses the same editor
           as the Customizations dialog, so creating a rule and changing one
           later look and behave alike. -->
      <div class="rules-table">
        <div class="rule-row">
          <span class="rule-label">{{ t('panel.rule_color_temp_range') }}</span>
          <RuleEditFields
            type="color-temp-range"
            :devices="selected"
            v-model:min="colorTempMin"
            v-model:max="colorTempMax"
          />
        </div>

        <div class="rule-row">
          <span class="rule-label">{{ t('panel.rule_brightness_range') }}</span>
          <RuleEditFields
            type="brightness-range"
            :devices="selected"
            v-model:scale="brightnessMaxScale"
          />
        </div>

        <div class="rule-row">
          <span class="rule-label">{{ t('panel.rule_suggested_area') }}</span>
          <RuleEditFields type="suggested-area" :devices="selected" v-model:text="area" />
        </div>

        <div class="rule-row">
          <span class="rule-label">{{ t('panel.rule_entity_rename') }}</span>
          <RuleEditFields type="entity-rename" :devices="selected" v-model:text="deviceName" />
        </div>
      </div>

      <!-- Conflicts + apply button -->
      <div class="panel-footer">
        <div class="conflicts-zone">
          <NAlert v-if="!colorTempOrdered" type="error" :show-icon="false" size="small">
            <span style="font-size: 12px">{{ t('panel.range_inverted') }}</span>
          </NAlert>
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
          :disabled="!canApply || loading"
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

/* Rows are top-aligned: the editor is taller than one line (slider, axis
   ends, unit switch) and the label should sit level with its first line. */
.rule-row {
  display: grid;
  grid-template-columns: 170px 1fr;
  align-items: start;
  padding: 10px 0;
  border-bottom: 1px solid var(--zt-divider-subtle, rgba(255, 255, 255, 0.04));
}
.rule-row:last-child {
  border-bottom: none;
}

.rule-label {
  font-family: 'Consolas', 'Monaco', monospace;
  font-size: 12px;
  color: var(--zt-text-secondary, #aaa);
  padding-top: 4px;
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
   the Apply button go full-width instead of cramming everything on one line. */
@media (max-width: 640px) {
  .rule-row {
    grid-template-columns: 1fr;
    gap: 4px;
    padding: 8px 0;
  }
  .rule-label {
    padding-top: 0;
  }
  .panel-footer {
    flex-direction: column;
    align-items: stretch;
  }
}
</style>
