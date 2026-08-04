<script setup lang="ts">
// Input fields for one transformer's config, shared by the two places that
// edit a rule in Customizations: a single device's row, and a configuration
// line (which edits every device using it at once).

import { computed, ref } from 'vue';
import { NInput, NInputNumber, NSlider, NRadioGroup, NRadioButton } from 'naive-ui';
import { useI18n } from 'vue-i18n';
import { miredsToKelvin, brightnessPercent, cctRangeStats } from '../utils/rules';
import type { Device, TransformerType } from '../api/types';

const props = defineProps<{
  type: TransformerType;
  /** Devices the edit will actually be applied to. Drives the slider bounds
      and the native-range hints, so they follow the chosen scope. */
  devices: Device[];
}>();

// Optional: a caller only binds the models its transformer type uses (the
// creation panel drives one row per type, the edit dialog one type at a time).
const min = defineModel<number | null>('min', { default: null });
const max = defineModel<number | null>('max', { default: null });
const scale = defineModel<number | null>('scale', { default: null });
const text = defineModel<string>('text', { default: '' });

const { t } = useI18n();

/** Widest range the parser accepts, used when no native data is known. */
const FALLBACK_MIN = 100;
const FALLBACK_MAX = 700;

const cct = computed(() => cctRangeStats(props.devices));

// Values the editor opened with. The dialog unmounts its body when it closes
// (NModal's displayDirective defaults to 'if'), so this is captured afresh on
// every open. The bounds widen to fit these but NOT to fit the live values:
// deriving the axis from what the user is currently typing would rescale it
// under them — and would make the percentages below mean something different
// with every keystroke.
const openedWithMin = min.value;
const openedWithMax = max.value;

/**
 * Slider bounds: the envelope of what the targeted devices can do, widened if
 * needed to cover the values the rule already had. Clamping to the
 * intersection would silently rewrite a rule that sits outside it — the
 * intersection is shown as marks instead, so the safe zone stays visible
 * without trapping the handles.
 *
 * Still reactive to `devices`, so switching scope in the dialog rescales.
 */
const bounds = computed<[number, number]>(() => {
  const low = cct.value.unionLow ?? FALLBACK_MIN;
  const high = cct.value.unionHigh ?? FALLBACK_MAX;
  const candidates = [low, high, openedWithMin, openedWithMax].filter(
    (v): v is number => v !== null && v !== undefined,
  );
  return [Math.min(...candidates), Math.max(...candidates)] as [number, number];
});

/**
 * The span every targeted device can honour, drawn as a band over the track.
 * Showing it is only worth it when it doesn't cover the whole axis — which
 * happens when devices disagree, or when the rule reaches past what they can
 * do. Null hides the band and its caption.
 */
const safeBandStyle = computed<Record<string, string> | null>(() => {
  const { hasData, safeMin, safeMax } = cct.value;
  if (!hasData || safeMin === null || safeMax === null) return null;
  const [low, high] = bounds.value;
  if (high === low) return null;
  if (safeMin <= low && safeMax >= high) return null; // covers everything
  return {
    left: `${Math.max(0, ((safeMin - low) / (high - low)) * 100)}%`,
    right: `${Math.max(0, ((high - safeMax) / (high - low)) * 100)}%`,
  };
});

/**
 * A cleared bound falls back to the matching end of the slider, so dragging
 * always yields a usable range. Only the handle that actually moved is
 * written back: assigning both would give a min-only rule a max it never had,
 * changing which configuration it belongs to.
 */
const rangeValue = computed<[number, number]>({
  get: (): [number, number] => [min.value ?? bounds.value[0], max.value ?? bounds.value[1]],
  set: ([low, high]: [number, number]) => {
    const [currentLow, currentHigh] = rangeValue.value;
    if (low !== currentLow) min.value = low;
    if (high !== currentHigh) max.value = high;
  },
});

/**
 * Where a value sits on the slider, as a percentage of the span currently
 * shown: 0% is the low bound, 100% the high one. Reads as "how far into what
 * these devices can do", which is easier to judge than a raw mired count.
 */
function percentOfBounds(value: number): number | null {
  const [low, high] = bounds.value;
  if (high === low) return null; // degenerate span, a percentage means nothing
  return Math.round(((value - low) / (high - low)) * 100);
}

/** Inverse of percentOfBounds: mireds are what actually gets stored. */
function percentToMireds(percent: number): number {
  const [low, high] = bounds.value;
  const clamped = Math.min(100, Math.max(0, percent));
  return Math.round(low + (clamped / 100) * (high - low));
}

/**
 * The percentages are editable and resolve to mireds straight away, so the
 * rule keeps storing absolute values — the percentage is a way to enter them,
 * not a second unit to persist.
 */
const minPercent = computed<number | null>({
  get: () => (min.value === null ? null : percentOfBounds(min.value)),
  set: (percent) => {
    min.value = percent === null ? null : percentToMireds(percent);
  },
});

const maxPercent = computed<number | null>({
  get: () => (max.value === null ? null : percentOfBounds(max.value)),
  set: (percent) => {
    max.value = percent === null ? null : percentToMireds(percent);
  },
});

/**
 * Which unit the two fields accept. One field per bound instead of one per
 * unit: with both on screen it was never obvious which one to fill in.
 */
type Unit = 'mireds' | 'percent';
const unit = ref<Unit>('mireds');

const minField = computed<number | null>({
  get: () => (unit.value === 'mireds' ? min.value : minPercent.value),
  set: (v) => {
    if (unit.value === 'mireds') min.value = v;
    else minPercent.value = v;
  },
});

const maxField = computed<number | null>({
  get: () => (unit.value === 'mireds' ? max.value : maxPercent.value),
  set: (v) => {
    if (unit.value === 'mireds') max.value = v;
    else maxPercent.value = v;
  },
});

// In mireds the field accepts exactly what the axis shows, so typing can't
// produce a value the slider is unable to represent.
const fieldMin = computed(() => (unit.value === 'mireds' ? bounds.value[0] : 0));
const fieldMax = computed(() => (unit.value === 'mireds' ? bounds.value[1] : 100));

function kelvinLabel(mireds: number | null): string {
  if (mireds === null || mireds === 0) return '';
  return `${miredsToKelvin(mireds)}K`;
}

function scaleLabel(value: number | null): string {
  if (value === null || value === 0) return '';
  return `${brightnessPercent(value)}%`;
}

/** Mireds are the inverse of kelvin, so the tooltip shows both, plus the
    position on the slider as a percentage. */
function formatMireds(value: number): string {
  const pct = percentOfBounds(value);
  const base = `${value} · ${miredsToKelvin(value)}K`;
  return pct === null ? base : `${base} · ${pct}%`;
}

function formatScale(value: number): string {
  return `${value} · ${brightnessPercent(value)}%`;
}
</script>

<template>
  <div class="edit-fields">
    <template v-if="type === 'color-temp-range'">
      <!-- Mireds ascend left to right, which runs cool -> warm: the rail
           gradient follows that direction so it doesn't lie about the axis. -->
      <!-- The axis carries its own scale: its ends are the bounds, which are
           also the 0% and 100% anchors. No need to restate them in text. -->
      <div class="slider-row cct-slider">
        <span class="axis-end">{{ bounds[0] }}</span>
        <div class="slider-holder">
          <div v-if="safeBandStyle" class="safe-band" :style="safeBandStyle" />
          <NSlider
            v-model:value="rangeValue"
            range
            :min="bounds[0]"
            :max="bounds[1]"
            :format-tooltip="formatMireds"
            :step="1"
          />
        </div>
        <span class="axis-end">{{ bounds[1] }}</span>
      </div>

      <div v-if="safeBandStyle" class="band-key">
        <span class="band-swatch" aria-hidden="true" />
        <span v-if="devices.length > 1">
          {{ t('panel.cct_safe_intersection', { min: cct.safeMin, max: cct.safeMax }) }}
        </span>
        <span v-else>
          {{ t('panel.device_capability', { min: cct.safeMin, max: cct.safeMax }) }}
        </span>
      </div>

      <div v-if="cct.missing > 0" class="slider-warning">
        {{ t('panel.cct_missing_data', { count: cct.missing }) }}
      </div>

      <!-- One field per bound. The unit switch decides what it accepts; a
           percentage resolves to mireds straight away, which is what gets
           stored — the kelvin readout stays true either way. -->
      <div class="numeric-grid">
        <span class="field-label">{{ t('panel.field_min') }}</span>
        <NInputNumber
          v-model:value="minField"
          :min="fieldMin"
          :max="fieldMax"
          :placeholder="unit === 'mireds' ? t('panel.mireds_placeholder') : '%'"
          size="small"
          clearable
          :show-button="false"
        />
        <span class="field-hint">{{ kelvinLabel(min) }}</span>

        <span class="field-label">{{ t('panel.field_max') }}</span>
        <NInputNumber
          v-model:value="maxField"
          :min="fieldMin"
          :max="fieldMax"
          :placeholder="unit === 'mireds' ? t('panel.mireds_placeholder') : '%'"
          size="small"
          clearable
          :show-button="false"
        />
        <span class="field-hint">{{ kelvinLabel(max) }}</span>

        <span />
        <NRadioGroup v-model:value="unit" size="small">
          <NRadioButton value="mireds">{{ t('panel.unit_mireds') }}</NRadioButton>
          <NRadioButton value="percent">%</NRadioButton>
        </NRadioGroup>
        <span />
      </div>
    </template>

    <template v-else-if="type === 'brightness-range'">
      <div class="slider-block">
        <NSlider
          :value="scale ?? 254"
          :min="1"
          :max="254"
          :format-tooltip="formatScale"
          :step="1"
          @update:value="(v: number) => (scale = v)"
        />
      </div>

      <div class="numeric-row">
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
      </div>
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
  flex-direction: column;
  gap: 10px;
}

/* The bounds sit at the ends of the axis instead of being restated below. */
.slider-row {
  display: flex;
  align-items: center;
  gap: 10px;
}

.axis-end {
  font-family: 'Consolas', 'Monaco', monospace;
  font-size: 10px;
  color: var(--zt-text-hint, #888);
  flex-shrink: 0;
}

.slider-holder {
  position: relative;
  flex: 1;
  min-width: 0;
}

/* The span every targeted device can honour. Translucent and click-through,
   so it reads over the rail without swallowing drags or hiding a handle. */
.safe-band {
  position: absolute;
  top: 50%;
  transform: translateY(-50%);
  height: 12px;
  border-radius: 2px;
  background: rgba(24, 160, 88, 0.18);
  border-left: 1px solid rgba(24, 160, 88, 0.8);
  border-right: 1px solid rgba(24, 160, 88, 0.8);
  pointer-events: none;
  z-index: 1;
}

.band-key {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 10px;
  color: var(--zt-text-hint, #888);
}

.band-swatch {
  width: 16px;
  height: 8px;
  border-radius: 2px;
  background: rgba(24, 160, 88, 0.18);
  border-left: 1px solid rgba(24, 160, 88, 0.8);
  border-right: 1px solid rgba(24, 160, 88, 0.8);
  flex-shrink: 0;
}

.slider-warning {
  font-size: 10px;
  color: var(--zt-text-warning, #f0a020);
}

/* Cool (low mireds) on the left, warm (high mireds) on the right. The
   selected span keeps naive-ui's fill on top, so the gradient shows what is
   being cut away rather than what is kept. */
.cct-slider :deep(.n-slider-rail) {
  background-image: linear-gradient(to right, #9bd0ea, #f3f0ea, #ffc98a);
}

/* label | value | kelvin — one row per bound, plus the unit switch under the
   value column so it reads as belonging to those fields. */
.numeric-grid {
  display: grid;
  grid-template-columns: auto 110px 1fr;
  gap: 6px 8px;
  align-items: center;
}

.numeric-row {
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
