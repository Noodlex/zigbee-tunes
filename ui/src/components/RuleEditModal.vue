<script setup lang="ts">
// Edit dialog for one configuration, opened either from a device row or from
// the Configurations list. The scope question comes FIRST, before the values:
// deciding whether you are changing this device or the whole group changes
// what you are about to type, so it shouldn't be an afterthought at save time.

import { computed, ref, watch } from 'vue';
import { NModal, NRadioButton, NRadioGroup, NButton, NSpace } from 'naive-ui';
import { useI18n } from 'vue-i18n';
import RuleEditFields from './RuleEditFields.vue';
import type { AppliedRule, Device } from '../api/types';

const props = defineProps<{
  rule: AppliedRule | null;
  /** The device the edit was started from; null when editing the whole
      configuration from the Configurations list. */
  device: Device | null;
  /** Every device currently using this configuration. */
  sharedDevices: Device[];
  saving: boolean;
}>();

const show = defineModel<boolean>('show', { required: true });

const emit = defineEmits<{
  save: [payload: { targets: string[]; values: Record<string, unknown> }];
}>();

const { t } = useI18n();

type EditScope = 'device' | 'all';

const scope = ref<EditScope>('device');
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
const singleTargetName = computed(
  () => props.device?.friendly_name ?? props.sharedDevices[0]?.friendly_name ?? '',
);

// Prime the fields every time the dialog opens, so a cancelled edit never
// leaks its values into the next one.
watch(show, (open) => {
  if (!open) return;
  const rule = props.rule;
  if (!rule) return;
  scope.value = props.device === null ? 'all' : 'device';
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

const valid = computed(() => {
  const rule = props.rule;
  if (!rule) return false;
  switch (rule.type) {
    case 'color-temp-range':
      return min.value !== null || max.value !== null;
    case 'brightness-range':
      return scale.value !== null;
    default:
      return text.value.trim().length > 0;
  }
});

/**
 * Devices the save will hit. Also feeds the editor, so the slider bounds and
 * the native-range hints follow the chosen scope: one device shows its own
 * range, the whole group shows the envelope and the safe intersection.
 */
const targetDevices = computed<Device[]>(() => {
  if (scope.value === 'all') return props.sharedDevices;
  return props.device ? [props.device] : [];
});

const targets = computed<string[]>(() => targetDevices.value.map((d) => d.ieee));

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
  if (!valid.value || props.saving || targets.value.length === 0) return;
  emit('save', { targets: targets.value, values: buildValues() });
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
    </div>

    <template #footer>
      <div class="modal-footer">
        <!-- Spells out the blast radius right next to the Save button, and
             stands out as soon as more than one device is about to change. -->
        <span class="targets-recap" :class="{ 'targets-recap-many': targets.length > 1 }">
          <template v-if="targets.length > 1">
            {{ t('customizations.modal_targets_many', { count: targets.length }) }}
          </template>
          <template v-else>
            {{ t('customizations.modal_targets_one', { device: singleTargetName }) }}
          </template>
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

.targets-recap-many {
  font-weight: 600;
  color: var(--zt-text-warning, #f0a020);
}
</style>
