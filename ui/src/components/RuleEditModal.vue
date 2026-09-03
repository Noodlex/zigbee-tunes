<script setup lang="ts">
// Edit dialog for one configuration, opened either from a device row or from
// the Configurations list. The scope question comes FIRST, before the values:
// deciding whether you are changing this device or the whole group changes
// what you are about to type, so it shouldn't be an afterthought at save time.

import { computed, ref, watch } from 'vue';
import { NModal, NRadioButton, NRadioGroup, NButton, NSpace } from 'naive-ui';
import { useI18n } from 'vue-i18n';
import RuleEditFields from './RuleEditFields.vue';
import DeviceAssignPicker from './DeviceAssignPicker.vue';
import {
  isRangeOrdered,
  ruleSignature,
  specificRulesFor,
  type RuleValues,
} from '../utils/rules';
import type { AppliedRule, Device } from '../api/types';

const props = defineProps<{
  rule: AppliedRule | null;
  /** The device the edit was started from; null when editing the whole
      configuration from the Configurations list. */
  device: Device | null;
  /** Every device currently using this configuration. */
  sharedDevices: Device[];
  /** The whole fleet, so the dialog can offer to put more devices on this
      configuration. Empty disables that section entirely. */
  fleet?: Device[];
  saving: boolean;
}>();

const show = defineModel<boolean>('show', { required: true });

const emit = defineEmits<{
  save: [
    payload: {
      targets: string[];
      values: Record<string, unknown>;
      /** Devices to take OFF this configuration, grouped by the rule holding them. */
      removals: { rule: AppliedRule; ieees: string[] }[];
    },
  ];
}>();

const { t } = useI18n();

type EditScope = 'device' | 'all';

const scope = ref<EditScope>('device');
/**
 * Ticked in the picker. When the whole configuration is the subject this is its
 * membership — seeded with the devices already on it, so unticking one is a
 * removal. When one device is the subject it holds additions only.
 */
const picked = ref<string[]>([]);

/** Unticking an assigned device only means something when the group is the subject. */
const canRemove = computed(() => scope.value === 'all');

function seedPicked() {
  picked.value = canRemove.value ? props.sharedDevices.map((d) => d.ieee) : [];
}
const min = ref<number | null>(null);
const max = ref<number | null>(null);
const scale = ref<number | null>(null);
const text = ref('');

/** Only a device-row edit on a shared configuration leaves a choice open. */
const scopeChoosable = computed(
  () => props.device !== null && props.sharedDevices.length > 1,
);

const sharedNames = computed(() => props.sharedDevices.map((d) => d.friendly_name).join(', '));

/**
 * Name to show when a single device is affected. Opening from the
 * Configurations list leaves `device` null, so fall back to the only device
 * using that configuration — otherwise the recap would name nobody.
 */
/**
 * Name to show when exactly one device is affected.
 *
 * Reads the resolved target, not the configuration's first device: once a
 * device can be UNTICKED, those differ. Unticking one of two devices left the
 * footer announcing the one being taken off as the one being changed.
 */
const singleTargetName = computed(
  () =>
    targetDevices.value[0]?.friendly_name ??
    props.device?.friendly_name ??
    props.sharedDevices[0]?.friendly_name ??
    '',
);

// Prime the fields every time the dialog opens, so a cancelled edit never
// leaks its values into the next one.
watch(show, (open) => {
  if (!open) return;
  const rule = props.rule;
  if (!rule) return;
  scope.value = props.device === null ? 'all' : 'device';
  seedPicked();
  min.value = rule.min_mireds ?? null;
  max.value = rule.max_mireds ?? null;
  scale.value = rule.max_scale ?? null;
  text.value =
    rule.type === 'suggested-area'
      ? (rule.area ?? '')
      : rule.type === 'entity-rename'
        ? (rule.device_name ?? '')
        : '';
});

// Flipping the scope changes what a tick means, so start from the state that
// matches the new meaning rather than carrying the old one across.
watch(scope, seedPicked);

const valid = computed(() => {
  const rule = props.rule;
  if (!rule) return false;
  switch (rule.type) {
    case 'color-temp-range':
      // An inverted range would hand Home Assistant an empty window.
      return (min.value !== null || max.value !== null) && isRangeOrdered(min.value, max.value);
    case 'brightness-range':
      return scale.value !== null;
    default:
      return text.value.trim().length > 0;
  }
});

/** Devices the chosen scope covers, before anything is picked. */
const scopeDevices = computed<Device[]>(() => {
  if (scope.value === 'all') return props.sharedDevices;
  return props.device ? [props.device] : [];
});

/**
 * Devices the save will hit. Also feeds the editor, so the slider bounds, the
 * native-range hints and the safe intersection follow what is actually about
 * to change: one device shows its own range, a group shows the envelope.
 *
 * Picked devices belong here, not only in the footer count. Leaving them out
 * would let a warm-only bulb be added to a cool configuration with the editor
 * still drawing a safe zone that no longer holds for everyone.
 */
const targetDevices = computed<Device[]>(() => {
  const pool = [...(props.fleet ?? []), ...props.sharedDevices];
  const byIeee = new Map<string, Device>();
  // Membership mode: the ticks ARE the list, so an unticked device must not
  // sneak back in through the scope.
  if (!canRemove.value) for (const d of scopeDevices.value) byIeee.set(d.ieee, d);
  for (const ieee of picked.value) {
    const found = pool.find((d) => d.ieee === ieee);
    if (found) byIeee.set(found.ieee, found);
  }
  return [...byIeee.values()];
});

/**
 * Devices leaving the configuration, grouped by the rule that holds them: one
 * configuration can span several rules, and removing device by device would
 * send target lists computed from the same stale rule.
 */
const removals = computed<{ rule: AppliedRule; ieees: string[] }[]>(() => {
  if (!canRemove.value || !props.rule) return [];
  const keep = new Set(picked.value.map((i) => i.toLowerCase()));
  // The rule to take them OFF is the one they actually hold — the
  // configuration as it was opened. `sig` follows the fields being edited and
  // would name a configuration these devices are not on.
  const held = ruleSignature(props.rule);
  const byRule = new Map<number, { rule: AppliedRule; ieees: string[] }>();
  for (const device of props.sharedDevices) {
    if (keep.has(device.ieee.toLowerCase())) continue;
    for (const r of specificRulesFor(device)) {
      if (r.type !== props.rule.type || ruleSignature(r) !== held) continue;
      const found = byRule.get(r.id);
      if (found) found.ieees.push(device.ieee);
      else byRule.set(r.id, { rule: r, ieees: [device.ieee] });
    }
  }
  return [...byRule.values()];
});

/**
 * A configuration is identified by its VALUES, so the buckets have to follow
 * the fields as they are edited, not the rule the dialog opened on. Otherwise
 * changing a bound leaves every group describing the previous configuration:
 * devices on the old values still counted as "already here", devices already
 * on the new ones offered as moves that would cost them nothing.
 *
 * A type whose value is unique per device (entity-rename) has no signature and
 * nothing to assign.
 */
const sig = computed(() => {
  const rule = props.rule;
  if (!rule) return null;
  const draft: RuleValues = { type: rule.type };
  switch (rule.type) {
    case 'color-temp-range':
      if (min.value !== null) draft.min_mireds = min.value;
      if (max.value !== null) draft.max_mireds = max.value;
      break;
    case 'brightness-range':
      if (scale.value !== null) draft.max_scale = scale.value;
      break;
    case 'suggested-area':
      draft.area = text.value.trim();
      break;
  }
  return ruleSignature(draft);
});

const canAssign = computed(
  () => sig.value !== null && (props.fleet?.length ?? 0) > 0,
);

/** targetDevices already merges scope and picks, deduplicated by IEEE. */
const targets = computed<string[]>(() => targetDevices.value.map((d) => d.ieee));

const removedCount = computed(() =>
  removals.value.reduce((n, g) => n + g.ieees.length, 0),
);

function buildValues(): Record<string, unknown> {
  const rule = props.rule!;
  const values: Record<string, unknown> = { type: rule.type };
  switch (rule.type) {
    case 'color-temp-range':
      if (min.value !== null) values.min_mireds = min.value;
      if (max.value !== null) values.max_mireds = max.value;
      break;
    case 'brightness-range':
      values.max_scale = scale.value;
      break;
    case 'suggested-area':
      values.area = text.value.trim();
      break;
    case 'entity-rename':
      values.device_name = text.value.trim();
      break;
  }
  return values;
}

function onSave() {
  // A save that only removes devices is legitimate: the target list is then
  // empty and there is nothing to apply, but there is still work to do.
  const nothingToDo = targets.value.length === 0 && removals.value.length === 0;
  if (!valid.value || props.saving || nothingToDo) return;
  emit('save', {
    targets: targets.value,
    values: buildValues(),
    removals: removals.value,
  });
}
</script>

<template>
  <NModal
    v-model:show="show"
    preset="card"
    :title="rule ? t('customizations.modal_title', { type: rule.type }) : ''"
    :mask-closable="!saving"
    :closable="!saving"
    style="max-width: 560px"
  >
    <div v-if="rule" class="modal-body">
      <p class="modal-subtitle">
        <template v-if="device">{{ device.friendly_name }}</template>
        <!-- Opened from the Configurations list: name the device when only
             one uses it, rather than calling it "shared by 1 device". -->
        <template v-else-if="sharedDevices.length === 1">{{ singleTargetName }}</template>
        <template v-else>{{ t('customizations.modal_shared', { count: sharedDevices.length }) }}</template>
      </p>

      <!-- Scope first: it frames what the values below will mean. -->
      <div v-if="scopeChoosable" class="scope-block">
        <span class="scope-label">{{ t('customizations.scope_label') }}</span>
        <NRadioGroup v-model:value="scope" size="small">
          <NRadioButton value="device">{{ device?.friendly_name }}</NRadioButton>
          <NRadioButton value="all">
            {{ t('customizations.scope_all', { count: sharedDevices.length }) }}
          </NRadioButton>
        </NRadioGroup>
        <!-- One line, about the choice actually made. -->
        <span class="scope-hint" :title="scope === 'all' ? sharedNames : ''">
          {{ scope === 'device' ? t('customizations.scope_device_hint') : sharedNames }}
        </span>
      </div>

      <div class="fields-block">
        <RuleEditFields
          :type="rule.type"
          :devices="targetDevices"
          v-model:min="min"
          v-model:max="max"
          v-model:scale="scale"
          v-model:text="text"
        />
      </div>

      <!-- Assignment comes AFTER the values: you decide what a configuration
           is before deciding who else gets it. -->
      <div v-if="canAssign" class="assign-block">
        <span class="assign-label">{{ t('picker.title') }}</span>
        <DeviceAssignPicker
          :fleet="fleet ?? []"
          :type="rule.type"
          :sig="sig!"
          :can-remove="canRemove"
          v-model:picked="picked"
        />
      </div>
    </div>

    <template #footer>
      <div class="modal-footer">
        <!-- Spells out the blast radius right next to the Save button, and
             stands out as soon as more than one device is about to change.
             It stays visible while an inverted range is being fixed — that is
             exactly when knowing the scope matters. -->
        <span class="footer-status">
          <span v-if="!isRangeOrdered(min, max)" class="range-error">
            {{ t('panel.range_inverted') }} ·
          </span>
          <span class="targets-recap" :class="{ 'targets-recap-many': targets.length > 1 }">
            <template v-if="targets.length > 1">
              {{ t('customizations.modal_targets_many', { count: targets.length }) }}
            </template>
            <template v-else-if="targets.length === 1">
              {{ t('customizations.modal_targets_one', { device: singleTargetName }) }}
            </template>
          </span>
          <!-- Removals are counted separately: they are the half of the save
               that takes something away, and the target count cannot show it. -->
          <span v-if="removedCount > 0" class="removals-recap">
            · {{ t('customizations.modal_removals', { count: removedCount }) }}
          </span>
        </span>
        <NSpace :size="8">
          <NButton size="small" quaternary :disabled="saving" @click="show = false">
            {{ t('common.cancel') }}
          </NButton>
          <NButton
            size="small"
            type="primary"
            :disabled="!valid"
            :loading="saving"
            @click="onSave"
          >
            {{ t('common.save') }}
          </NButton>
        </NSpace>
      </div>
    </template>
  </NModal>
</template>

<style scoped>
.modal-body {
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.modal-subtitle {
  margin: 0;
  font-size: 13px;
  color: var(--zt-text-secondary, #555);
}

.scope-block {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 10px 12px;
  border-radius: 6px;
  background: var(--zt-image-bg, rgba(127, 127, 127, 0.04));
  border: 1px solid var(--zt-divider, rgba(127, 127, 127, 0.15));
}

.scope-label {
  font-size: 12px;
  font-weight: 600;
  color: var(--zt-text-secondary, #555);
}

.scope-hint {
  font-size: 11px;
  font-style: italic;
  color: var(--zt-text-hint, #888);
}

.fields-block {
  padding-top: 2px;
}

.assign-block {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.assign-label {
  font-size: 12px;
  font-weight: 600;
  color: var(--zt-text-secondary, #555);
}

.modal-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.targets-recap {
  font-size: 11px;
  color: var(--zt-text-hint, #888);
}

.removals-recap {
  font-size: 11px;
  font-weight: 600;
  color: var(--zt-text-error, #d03050);
}

.targets-recap-many {
  font-weight: 600;
  color: var(--zt-text-warning, #f0a020);
}

.footer-status {
  display: flex;
  align-items: center;
  gap: 4px;
  flex-wrap: wrap;
}

.range-error {
  font-size: 11px;
  font-weight: 600;
  color: var(--zt-text-error, #d03050);
}
</style>
