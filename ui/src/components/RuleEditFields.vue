<script setup lang="ts">
// Input fields for one transformer's config, shared by the two places that
// edit a rule in Customizations: a single device's row, and a legend entry
// (which edits every device using that configuration at once).

import { NInput, NInputNumber } from 'naive-ui';
import { useI18n } from 'vue-i18n';
import { miredsToKelvin, brightnessPercent } from '../utils/rules';
import type { TransformerType } from '../api/types';

defineProps<{
  type: TransformerType;
  /** Device-native CCT bounds, shown as a hint. Omitted for a bulk edit,
      where the selected devices don't share a single native range. */
  nativeMinMireds?: number | null;
  nativeMaxMireds?: number | null;
}>();

const min = defineModel<number | null>('min', { required: true });
const max = defineModel<number | null>('max', { required: true });
const scale = defineModel<number | null>('scale', { required: true });
const text = defineModel<string>('text', { required: true });

const { t } = useI18n();

function kelvinLabel(mireds: number | null): string {
  if (mireds === null || mireds === 0) return '';
  return `${miredsToKelvin(mireds)}K`;
}

function scaleLabel(value: number | null): string {
  if (value === null || value === 0) return '';
  return `${brightnessPercent(value)}%`;
}
</script>

<template>
  <div class="edit-fields">
    <template v-if="type === 'color-temp-range'">
      <span class="field-label">{{ t('panel.field_min') }}</span>
      <NInputNumber
        v-model:value="min"
        :min="100"
        :max="700"
        :placeholder="t('panel.mireds_placeholder')"
        size="small"
        clearable
        :show-button="false"
        style="width: 88px"
      />
      <span class="field-hint">{{ kelvinLabel(min) }}</span>

      <span class="field-sep">·</span>

      <span class="field-label">{{ t('panel.field_max') }}</span>
      <NInputNumber
        v-model:value="max"
        :min="100"
        :max="700"
        :placeholder="t('panel.mireds_placeholder')"
        size="small"
        clearable
        :show-button="false"
        style="width: 88px"
      />
      <span class="field-hint">{{ kelvinLabel(max) }}</span>

      <span
        v-if="nativeMinMireds !== null && nativeMinMireds !== undefined
          && nativeMaxMireds !== null && nativeMaxMireds !== undefined"
        class="field-native"
      >
        {{ t('panel.cct_native_range', { low: nativeMinMireds, high: nativeMaxMireds }) }}
      </span>
    </template>

    <template v-else-if="type === 'brightness-range'">
      <span class="field-label">{{ t('panel.field_max_scale') }}</span>
      <NInputNumber
        v-model:value="scale"
        :min="1"
        :max="254"
        :placeholder="t('panel.scale_placeholder')"
        size="small"
        clearable
        :show-button="false"
        style="width: 88px"
      />
      <span class="field-hint">{{ scaleLabel(scale) }}</span>
      <span class="field-native">{{ t('panel.field_brightness_hint') }}</span>
    </template>

    <NInput
      v-else
      v-model:value="text"
      :placeholder="type === 'suggested-area'
        ? t('panel.area_placeholder')
        : t('panel.device_name_placeholder')"
      size="small"
      clearable
      style="max-width: 280px"
    />
  </div>
</template>

<style scoped>
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
</style>
