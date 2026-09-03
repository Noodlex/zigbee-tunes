<script setup lang="ts">
// Who else could be on this configuration. Three groups, because the three
// answers carry different consequences: devices already on it (nothing to
// decide), devices on a DIFFERENT configuration of the same type (ticking one
// moves it, and it loses what it had), and devices with none at all (ticking
// one simply assigns it).
//
// The middle group is why this exists: the save endpoint drops a device from
// its previous rule of the same type, so an addition silently costs the
// device its old configuration. Showing what it would leave makes that a
// decision rather than a surprise.
//
// Add-only by design. Unticking a device already on the configuration is NOT
// offered here: removing means editing or deleting the rules it belongs to —
// a configuration can span several — which is a different request the row and
// legend bin buttons already handle.

import { computed, ref } from 'vue';
import { NCheckbox } from 'naive-ui';
import { useI18n } from 'vue-i18n';
import { assignmentBuckets, describeRule } from '../utils/rules';
import type { Device } from '../api/types';

const props = defineProps<{
  /** Every device known, not just the ones on this configuration. */
  fleet: Device[];
  type: string;
  /** Signature of the configuration being edited. */
  sig: string;
}>();

/** IEEEs picked to be added, owned by the parent so it can build its targets. */
const picked = defineModel<string[]>('picked', { required: true });

const { t } = useI18n();

const buckets = computed(() => assignmentBuckets(props.fleet, props.type, props.sig));

/** The assigned list is context, not a decision — keep it folded by default. */
const showAssigned = ref(false);

function toggle(ieee: string, on: boolean) {
  const next = new Set(picked.value);
  if (on) next.add(ieee);
  else next.delete(ieee);
  picked.value = [...next];
}

function isPicked(ieee: string): boolean {
  return picked.value.includes(ieee);
}
</script>

<template>
  <div class="picker">
    <!-- Already here: folded, because there is nothing to decide about them. -->
    <div v-if="buckets.assigned.length" class="group">
      <button type="button" class="group-head is-button" @click="showAssigned = !showAssigned">
        <span class="caret">{{ showAssigned ? '▾' : '▸' }}</span>
        {{ t('picker.assigned', { count: buckets.assigned.length }) }}
      </button>
      <ul v-if="showAssigned" class="names">
        <li v-for="d in buckets.assigned" :key="d.ieee">{{ d.friendly_name }}</li>
      </ul>
    </div>

    <!-- On another configuration: ticking one is a move, so say what it costs. -->
    <div v-if="buckets.elsewhere.length" class="group">
      <span class="group-head">{{ t('picker.elsewhere', { count: buckets.elsewhere.length }) }}</span>
      <!-- Content goes in the checkbox's own slot, not beside it in a <label>:
           NCheckbox renders no native input to associate with, so a wrapping
           label leaves the text inert and the only target is the 14px box. -->
      <NCheckbox
        v-for="e in buckets.elsewhere"
        :key="e.device.ieee"
        class="row"
        :checked="isPicked(e.device.ieee)"
        @update:checked="(v: boolean) => toggle(e.device.ieee, v)"
      >
        <span class="row-name">{{ e.device.friendly_name }}</span>
        <span class="row-leaving">{{ t('picker.leaving', { config: describeRule(e.rule, t) }) }}</span>
      </NCheckbox>
    </div>

    <!-- No configuration of this type: a plain assignment. -->
    <div v-if="buckets.unassigned.length" class="group">
      <span class="group-head">{{ t('picker.unassigned', { count: buckets.unassigned.length }) }}</span>
      <NCheckbox
        v-for="d in buckets.unassigned"
        :key="d.ieee"
        class="row"
        :checked="isPicked(d.ieee)"
        @update:checked="(v: boolean) => toggle(d.ieee, v)"
      >
        <span class="row-name">{{ d.friendly_name }}</span>
        <span class="row-model">{{ d.model_id }}</span>
      </NCheckbox>
    </div>

    <p v-if="!buckets.elsewhere.length && !buckets.unassigned.length" class="none-left">
      {{ t('picker.none_left') }}
    </p>
  </div>
</template>

<style scoped>
.picker {
  display: flex;
  flex-direction: column;
  gap: 10px;
  max-height: 220px;
  overflow-y: auto;
  padding: 10px 12px;
  border-radius: 6px;
  background: var(--zt-image-bg, rgba(127, 127, 127, 0.04));
  border: 1px solid var(--zt-divider, rgba(127, 127, 127, 0.15));
}

.group {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.group-head {
  font-size: 12px;
  font-weight: 600;
  color: var(--zt-text-secondary, #555);
}

.is-button {
  display: flex;
  align-items: center;
  gap: 5px;
  padding: 0;
  border: none;
  background: none;
  cursor: pointer;
  text-align: left;
  font: inherit;
  font-size: 12px;
  font-weight: 600;
  color: var(--zt-text-secondary, #555);
}

.caret {
  font-size: 10px;
  opacity: 0.7;
}

.names {
  margin: 0;
  padding-left: 18px;
  font-size: 11px;
  color: var(--zt-text-hint, #888);
}

.row {
  font-size: 12px;
}

/* The slot content is the click target, so give it room to breathe. */
.row :deep(.n-checkbox__label) {
  display: inline-flex;
  align-items: baseline;
  gap: 8px;
  padding-right: 4px;
}

.row-name {
  flex: 0 1 auto;
}

.row-leaving {
  font-size: 11px;
  font-style: italic;
  color: var(--zt-text-warning, #f0a020);
}

.row-model,
.none-left {
  font-size: 11px;
  color: var(--zt-text-hint, #888);
}

.none-left {
  margin: 0;
}
</style>
