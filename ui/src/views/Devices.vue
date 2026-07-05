<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import {
  NSpace,
  NInput,
  NSelect,
  NCheckboxGroup,
  NCheckbox,
  NRadioGroup,
  NRadio,
  NButton,
  NAlert,
  NSpin,
  NEmpty,
  NSwitch,
  useMessage,
} from 'naive-ui';
import { useI18n } from 'vue-i18n';
import { useRoute } from 'vue-router';
import DeviceCard from '../components/DeviceCard.vue';
import SelectionPanel, { type Changes } from '../components/SelectionPanel.vue';
import { api } from '../api/client';
import { useRuleActions } from '../composables/useRuleActions';
import type { Device, AppliedRule } from '../api/types';

const { t } = useI18n();

const devices = ref<Device[]>([]);
const loading = ref(true);
const error = ref<string | null>(null);
const message = useMessage();

// Selection
const selectedIeees = ref<Set<string>>(new Set());
const selectedDevices = computed(() => devices.value.filter((d) => selectedIeees.value.has(d.ieee)));

// Filters
const filterText = ref('');
const filterVendor = ref<string | null>(null);
const filterCapabilities = ref<string[]>([]);
const filterMode = ref<'and' | 'or'>('and');
const filterModifiedOnly = ref(false);
// On by default: devices with no capabilities (the Coordinator, or entries
// only seen via bridge/devices) aren't actionable here, so hide them.
const filterHideNoCaps = ref(true);

// Pre-filter from the URL query — set when arriving from a Dashboard
// breakdown bar (e.g. /#/?vendor=Innr or /#/?capability=color_temp).
const route = useRoute();
if (typeof route.query.vendor === 'string') {
  filterVendor.value = route.query.vendor;
}
if (typeof route.query.capability === 'string') {
  filterCapabilities.value = [route.query.capability];
  filterMode.value = 'and';
}

// Apply state
const applying = ref(false);

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

// Dynamic options computed from the fleet
const vendorOptions = computed(() => {
  const set = new Set<string>();
  for (const d of devices.value) if (d.vendor) set.add(d.vendor);
  return Array.from(set)
    .sort()
    .map((v) => ({ label: v, value: v }));
});

const capabilityOptions = computed(() => {
  const set = new Set<string>();
  for (const d of devices.value) for (const c of d.capabilities) set.add(c);
  return Array.from(set).sort();
});

function hasSpecificRule(d: Device): boolean {
  return d.applied_rules.some((r) =>
    r.targets.some((t) => t.toLowerCase() === d.ieee.toLowerCase()),
  );
}

const filtered = computed(() => {
  const txt = filterText.value.trim().toLowerCase();
  return devices.value.filter((d) => {
    if (filterHideNoCaps.value && d.capabilities.length === 0) return false;
    if (filterModifiedOnly.value && !hasSpecificRule(d)) return false;
    if (filterVendor.value && d.vendor !== filterVendor.value) return false;
    if (txt) {
      const hay = `${d.friendly_name} ${d.ieee} ${d.model_id} ${d.model}`.toLowerCase();
      if (!hay.includes(txt)) return false;
    }
    if (filterCapabilities.value.length > 0) {
      if (filterMode.value === 'and') {
        if (!filterCapabilities.value.every((c) => d.capabilities.includes(c))) return false;
      } else {
        if (!filterCapabilities.value.some((c) => d.capabilities.includes(c))) return false;
      }
    }
    return true;
  });
});

const modifiedCount = computed(() => devices.value.filter(hasSpecificRule).length);

// Anchor for Shift+Click: last device clicked WITHOUT Shift.
// Shift+Click selects the range from this anchor to the current device,
// in the visual order of the filtered grid.
const lastAnchorIeee = ref<string | null>(null);

function toggle(ieee: string, event?: MouseEvent | KeyboardEvent) {
  const shift = event?.shiftKey ?? false;

  // Range select with Shift+Click: ADD the devices between the anchor and
  // the clicked device to the existing selection (nothing is deselected).
  // The anchor stays fixed -> you can grow/shrink the range by
  // shift-clicking again.
  if (shift && lastAnchorIeee.value && lastAnchorIeee.value !== ieee) {
    const arr = filtered.value;
    const fromIdx = arr.findIndex((d) => d.ieee === lastAnchorIeee.value);
    const toIdx = arr.findIndex((d) => d.ieee === ieee);
    if (fromIdx !== -1 && toIdx !== -1) {
      const [start, end] = fromIdx < toIdx ? [fromIdx, toIdx] : [toIdx, fromIdx];
      const next = new Set(selectedIeees.value);
      for (let i = start; i <= end; i++) {
        const item = arr[i];
        if (item) next.add(item.ieee);
      }
      selectedIeees.value = next;
      return; // do not update the anchor
    }
  }

  // Standard click: toggle
  const wasEmpty = selectedIeees.value.size === 0;
  const next = new Set(selectedIeees.value);
  if (next.has(ieee)) next.delete(ieee);
  else next.add(ieee);
  selectedIeees.value = next;
  lastAnchorIeee.value = ieee;

  // Auto-suggest capability filters when the first device is selected.
  // Conditions:
  //   - we go from 0 to 1 selected device (first click)
  //   - no capability filter is already active (we do NOT want to
  //     overwrite filters the user set manually before)
  // -> check every capability of the selected device in AND mode, which
  // reveals only "similar" devices in the grid.
  if (wasEmpty && next.size === 1 && filterCapabilities.value.length === 0) {
    const d = devices.value.find((dev) => dev.ieee === ieee);
    if (d && d.capabilities.length > 0) {
      filterCapabilities.value = [...d.capabilities];
      filterMode.value = 'and';
    }
  }
}

function clearSelection() {
  selectedIeees.value = new Set();
}

function selectAllFiltered() {
  const next = new Set(selectedIeees.value);
  for (const d of filtered.value) next.add(d.ieee);
  selectedIeees.value = next;
}

/** "Show all" button: clears the filters that hide devices. */
function showAllDevices() {
  filterCapabilities.value = [];
  filterVendor.value = null;
}

/**
 * Smart apply via /api/devices/apply: for each provided transformer,
 * the backend first removes the ieees from existing rules of the same
 * type (avoids duplicates), then creates the new rule. A single atomic
 * refresh on the server side, no intermediate MQTT states.
 */
async function onApply(changes: Changes) {
  applying.value = true;
  try {
    const ieees = Array.from(selectedIeees.value);
    if (ieees.length === 0) return;

    const transformers: Array<Record<string, unknown>> = [];
    if (changes.colorTempRange) {
      transformers.push({
        type: 'color-temp-range',
        min_mireds: changes.colorTempRange.min_mireds ?? undefined,
        max_mireds: changes.colorTempRange.max_mireds ?? undefined,
      });
    }
    if (changes.brightnessRange) {
      transformers.push({ type: 'brightness-range', max_scale: changes.brightnessRange.max_scale });
    }
    if (changes.suggestedArea) {
      transformers.push({ type: 'suggested-area', area: changes.suggestedArea.area });
    }
    if (changes.entityRename) {
      transformers.push({ type: 'entity-rename', device_name: changes.entityRename.device_name });
    }

    if (transformers.length === 0) return;

    const result = await api.applyToDevices(ieees, transformers);
    message.success(
      t('devices.apply_success', {
        count: result.created.length,
        devices: ieees.length,
        republished: result.refresh.republished,
      }),
    );
    clearSelection();
    await refresh();
  } catch (e) {
    message.error(t('common.failure_prefix', { message: (e as Error).message }));
  } finally {
    applying.value = false;
  }
}

/**
 * Removes a device from a specific rule (= "Reset this config for this
 * device"). If after the removal the rule has no targets left, delete it
 * entirely.
 */
const { resetRuleForDevice } = useRuleActions();

async function resetRule(deviceIeee: string, rule: AppliedRule) {
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

onMounted(refresh);
</script>

<template>
  <NSpace vertical :size="16">
    <!-- Header -->
    <NSpace align="center" justify="space-between">
      <h2 style="margin: 0">{{ t('devices.title', { filtered: filtered.length, total: devices.length }) }}</h2>
      <NSpace>
        <NButton @click="refresh" :loading="loading" size="small">{{ t('common.refresh') }}</NButton>
        <NButton
          v-if="selectedIeees.size === 0"
          size="small"
          quaternary
          :disabled="filtered.length === 0"
          @click="selectAllFiltered"
        >{{ t('devices.select_all_filtered') }}</NButton>
      </NSpace>
    </NSpace>

    <NAlert v-if="error" type="error" :title="t('common.error_prefix', { message: error })" />

    <!-- Sticky edit panel at the top when selection > 0 -->
    <SelectionPanel
      v-if="selectedDevices.length > 0"
      :selected="selectedDevices"
      :loading="applying"
      @clear="clearSelection"
      @apply="onApply"
    />

    <!-- Filters bar -->
    <NSpace vertical :size="10">
      <div class="filter-row">
        <NInput v-model:value="filterText" :placeholder="t('devices.filter.search_placeholder')" class="filter-search" clearable />
        <NSelect
          v-model:value="filterVendor"
          :options="vendorOptions"
          :placeholder="t('devices.filter.vendor_placeholder')"
          clearable
          class="filter-vendor"
        />
        <div class="filter-modified">
          <NSwitch v-model:value="filterModifiedOnly" size="small" />
          <span style="font-size: 12px">
            {{ t('devices.filter.modified_only') }}
            <span style="color: var(--zt-text-hint, #888)">({{ modifiedCount }})</span>
          </span>
        </div>
        <div class="filter-modified">
          <NSwitch v-model:value="filterHideNoCaps" size="small" />
          <span style="font-size: 12px">{{ t('devices.filter.hide_no_caps') }}</span>
        </div>
      </div>

      <NSpace v-if="capabilityOptions.length > 0" :size="10" align="center">
        <span style="color: #888; font-size: 12px">{{ t('devices.filter.capabilities_label') }}</span>
        <NCheckboxGroup v-model:value="filterCapabilities">
          <NSpace :size="6" :wrap="true">
            <NCheckbox v-for="c in capabilityOptions" :key="c" :value="c" :label="c" />
          </NSpace>
        </NCheckboxGroup>
        <span v-if="filterCapabilities.length > 1" style="margin-left: 12px">
          <NRadioGroup v-model:value="filterMode" size="small">
            <NRadio value="and">{{ t('devices.filter.and') }}</NRadio>
            <NRadio value="or">{{ t('devices.filter.or') }}</NRadio>
          </NRadioGroup>
        </span>
        <NButton
          v-if="filterCapabilities.length > 0 || filterVendor !== null"
          size="tiny"
          quaternary
          @click="showAllDevices"
          style="margin-left: 12px"
        >
          {{ t('devices.filter.show_all') }}
        </NButton>
      </NSpace>
    </NSpace>

    <!-- Cards grid -->
    <NSpin :show="loading && devices.length === 0">
      <NEmpty v-if="!loading && filtered.length === 0" :description="t('devices.empty_filtered')" />
      <div v-else class="cards-grid">
        <DeviceCard
          v-for="d in filtered"
          :key="d.ieee"
          :device="d"
          :selected="selectedIeees.has(d.ieee)"
          @toggle="(e: MouseEvent | KeyboardEvent) => toggle(d.ieee, e)"
          @reset-rule="(rule: AppliedRule) => resetRule(d.ieee, rule)"
        />
      </div>
    </NSpin>
  </NSpace>
</template>

<style scoped>
.cards-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(260px, 1fr));
  gap: 12px;
}

/* Fluid filter bar: inputs shrink and wrap instead of overflowing on
   narrow screens (was fixed 280/200px). */
.filter-row {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  align-items: center;
}
.filter-search {
  flex: 1 1 240px;
  min-width: 0;
  max-width: 360px;
}
.filter-vendor {
  flex: 1 1 180px;
  min-width: 0;
  max-width: 240px;
}
.filter-modified {
  display: flex;
  align-items: center;
  gap: 6px;
}
</style>
