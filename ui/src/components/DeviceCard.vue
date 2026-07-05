<script setup lang="ts">
import { computed, ref } from 'vue';
import { NCard, NTag, NSpace, NIcon, NButton, NPopover, NEllipsis } from 'naive-ui';
import { useI18n } from 'vue-i18n';
import type { Device, AppliedRule } from '../api/types';
import { describeRule } from '../utils/rules';
import { isZ2mGroup } from '../utils/devices';

const { t } = useI18n();

const props = defineProps<{
  device: Device;
  selected: boolean;
}>();

const emit = defineEmits<{
  (e: 'toggle', event: MouseEvent | KeyboardEvent): void;
  (e: 'reset-rule', rule: AppliedRule): void;
}>();

const imageLoaded = ref(true);

// Standard Z2M image URL. On 404, we fall back to a per-component emoji
// (light -> 💡, switch -> 🔌, etc.)
const imageUrl = computed(() => {
  if (!props.device.model_id) return null;
  return `https://www.zigbee2mqtt.io/images/devices/${encodeURIComponent(props.device.model_id)}.jpg`;
});

const fallbackEmoji = computed(() => {
  const comps = props.device.components;
  if (comps.includes('light')) return '💡';
  if (comps.includes('switch')) return '🔌';
  if (comps.includes('binary_sensor')) return '📡';
  if (comps.includes('sensor')) return '📊';
  if (comps.includes('cover')) return '🪟';
  if (comps.includes('climate')) return '🌡️';
  if (props.device.vendor === 'Zigbee2MQTT') return '🧩'; // Z2M groups
  if (props.device.friendly_name === 'Coordinator' || props.device.ieee.startsWith('0x00124b')) return '📶';
  return '❓';
});

/**
 * A rule is considered "specific" to this device if at least one of its
 * targets matches its IEEE EXPLICITLY (not via *, @vendor, etc.).
 * The orange badge is only shown for specific rules — global rules are
 * "default behavior" for the fleet and don't deserve flagging each
 * device individually.
 */
const specificRules = computed(() =>
  props.device.applied_rules.filter((r) =>
    r.targets.some((t) => t.toLowerCase() === props.device.ieee.toLowerCase()),
  ),
);
const hasSpecificRule = computed(() => specificRules.value.length > 0);

/**
 * Maps each rule type to the capability it visibly affects on the card.
 * Used to highlight tags whose value is being clamped/overridden by a
 * rule — much faster to scan than the popover.
 *
 * - color-temp-range -> color_temp
 * - brightness-range -> brightness
 * - suggested-area  -> n/a (HA metadata, no matching capability tag)
 * - entity-rename   -> n/a (changes the display name, not a capability)
 */
const RULE_TO_CAPABILITY: Record<string, string> = {
  'color-temp-range': 'color_temp',
  'brightness-range': 'brightness',
};

const modifiedCapabilities = computed(() => {
  const set = new Set<string>();
  for (const r of props.device.applied_rules) {
    const cap = RULE_TO_CAPABILITY[r.type];
    if (cap) set.add(cap);
  }
  return set;
});

const isGroup = computed(() => isZ2mGroup(props.device));

/**
 * Keyboard activation for the card (it's a role="button"). We:
 *  - ignore keys bubbling up from a focusable child (only the card itself
 *    toggles), so we never swallow Space/Enter meant for nested controls;
 *  - preventDefault so Space doesn't scroll the page;
 *  - skip auto-repeat (holding the key must not flap the selection).
 */
function onActivate(e: KeyboardEvent) {
  if (e.target !== e.currentTarget) return;
  e.preventDefault();
  if (e.repeat) return;
  emit('toggle', e);
}

</script>

<template>
  <div
    class="device-card"
    :class="{ selected, group: isGroup }"
    role="button"
    tabindex="0"
    :aria-pressed="selected"
    :aria-label="device.friendly_name"
    @click="(e) => emit('toggle', e)"
    @keydown.enter="onActivate"
    @keydown.space="onActivate"
  >
    <NCard size="small" :bordered="false" :content-style="{ padding: '12px' }">
      <div class="card-top">
        <div class="image-wrap">
          <img
            v-if="imageUrl && imageLoaded"
            :src="imageUrl"
            :alt="device.model_id"
            @error="imageLoaded = false"
            loading="lazy"
          />
          <div v-else class="emoji-fallback">{{ fallbackEmoji }}</div>
        </div>

        <div class="card-meta">
          <div class="card-name">
            <NEllipsis :line-clamp="1">{{ device.friendly_name }}</NEllipsis>
          </div>
          <div class="card-subtitle">
            <span
              v-if="isGroup"
              class="group-badge"
              :title="t('common.group_badge_title')"
            >{{ t('common.group_badge') }}</span>
            <NEllipsis v-else :line-clamp="1">{{ device.vendor || t('common.unknown') }} · {{ device.model_id || device.model || t('common.unknown') }}</NEllipsis>
          </div>
        </div>

        <div class="card-badges">
          <NPopover v-if="hasSpecificRule" trigger="click" placement="left-start">
            <template #trigger>
              <div class="modified-badge" :title="t('card.badge_title')" @click.stop>
                <NIcon size="14">
                  <svg viewBox="0 0 24 24" fill="currentColor"><path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04a1 1 0 0 0 0-1.41l-2.34-2.34a1 1 0 0 0-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z"/></svg>
                </NIcon>
              </div>
            </template>
            <div class="popover-content" @click.stop>
              <div class="popover-title">{{ t('card.popover_title') }}</div>
              <div v-for="r in specificRules" :key="r.id" class="popover-rule">
                <NTag size="small" type="info">{{ r.type }}</NTag>
                <span class="popover-rule-config">{{ describeRule(r, t) }}</span>
                <NButton
                  size="tiny"
                  type="error"
                  ghost
                  :title="t('card.popover_remove_title', { type: r.type })"
                  @click.stop="emit('reset-rule', r)"
                >
                  ✕
                </NButton>
              </div>
              <div class="popover-hint">{{ t('card.popover_hint') }}</div>
            </div>
          </NPopover>
          <div v-if="selected" class="selection-check">
            <NIcon size="16">
              <svg viewBox="0 0 24 24" fill="currentColor"><path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/></svg>
            </NIcon>
          </div>
        </div>
      </div>

      <div v-if="device.capabilities.length > 0" class="card-caps">
        <NTag
          v-for="c in device.capabilities"
          :key="c"
          size="small"
          :bordered="false"
          :type="modifiedCapabilities.has(c) ? 'warning' : 'default'"
          :title="modifiedCapabilities.has(c) ? t('card.capability_modified_title', { capability: c }) : undefined"
        >
          {{ c }}
        </NTag>
      </div>
      <div v-else class="card-no-caps">{{ t('common.unknown') }}</div>
    </NCard>
  </div>
</template>

<style scoped>
.device-card {
  cursor: pointer;
  border-radius: 8px;
  /* 3px = clearly visible in light and dark themes without being aggressive */
  border: 3px solid var(--zt-card-border, rgba(255, 255, 255, 0.18));
  transition: border-color 0.15s ease, background-color 0.15s ease, box-shadow 0.15s ease;
  /* EXPLICIT background: we no longer use --n-color, which can be
     redefined elsewhere by naive-ui and leaks through (notably via
     NMessageProvider in light mode). */
  background-color: var(--zt-card-bg, transparent);
  position: relative;
  display: flex;
  flex-direction: column;
  /* Prevents the browser from selecting text on Shift+Click. */
  user-select: none;
}

/* Force the inner NCard to fill the wrapper (otherwise empty space at
   the bottom of cards stretched by CSS Grid). The NCard background is
   neutralized so the wrapper's shows through. */
.device-card :deep(.n-card) {
  background-color: transparent;
  flex: 1;
}

.device-card:hover {
  border-color: var(--zt-card-border-hover, rgba(255, 255, 255, 0.42));
}

/* Keyboard focus ring (cards are keyboard-operable buttons). */
.device-card:focus-visible {
  outline: 2px solid #18a058;
  outline-offset: 2px;
}

@media (prefers-reduced-motion: reduce) {
  .device-card {
    transition: none;
  }
}

.device-card.selected {
  border-color: #18a058;
  background-color: rgba(99, 226, 183, 0.14);
  box-shadow:
    0 0 0 2px rgba(99, 226, 183, 0.35),
    0 6px 18px rgba(24, 160, 88, 0.18);
}

/* Groups: dashed border + faint blue tint so they stand out as
   "virtual entities" without screaming for attention. Combines cleanly
   with .selected (selection wins on color, dashed pattern remains). */
.device-card.group {
  border-style: dashed;
  background-color: var(--zt-card-group-bg, rgba(96, 168, 255, 0.05));
}
.device-card.group:not(.selected) {
  border-color: var(--zt-card-group-border, rgba(96, 168, 255, 0.35));
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

.card-top {
  display: flex;
  gap: 12px;
  align-items: flex-start;
}

.image-wrap {
  width: 56px;
  height: 56px;
  flex-shrink: 0;
  border-radius: 6px;
  background: var(--zt-image-bg, rgba(255, 255, 255, 0.04));
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
}

.image-wrap img {
  width: 100%;
  height: 100%;
  object-fit: contain;
}

.emoji-fallback {
  font-size: 28px;
  line-height: 1;
}

.card-meta {
  flex: 1;
  min-width: 0;
}

.card-name {
  font-weight: 600;
  font-size: 14px;
  margin-bottom: 2px;
}

.card-subtitle {
  font-size: 11px;
  color: var(--zt-text-hint, #888);
}

.card-badges {
  display: flex;
  gap: 6px;
  align-items: center;
}

.modified-badge {
  width: 22px;
  height: 22px;
  border-radius: 11px;
  background: #f0a020;
  color: #1a1a1a;
  display: flex;
  align-items: center;
  justify-content: center;
}

.selection-check {
  width: 22px;
  height: 22px;
  border-radius: 11px;
  background: #63e2b7;
  color: #1a1a1a;
  display: flex;
  align-items: center;
  justify-content: center;
}

.card-caps {
  margin-top: 10px;
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
}

.card-no-caps {
  margin-top: 10px;
  font-size: 11px;
  color: var(--zt-text-placeholder, #555);
  font-style: italic;
}

.popover-content {
  min-width: 280px;
  max-width: 380px;
}
.popover-title {
  font-weight: 600;
  margin-bottom: 8px;
  font-size: 13px;
}
.popover-rule {
  display: grid;
  grid-template-columns: auto 1fr auto;
  gap: 8px;
  align-items: center;
  font-size: 12px;
  padding: 4px 0;
  border-bottom: 1px solid var(--zt-divider-subtle, rgba(255, 255, 255, 0.04));
}
.popover-rule:last-of-type {
  border-bottom: none;
}
.popover-rule-config {
  font-family: 'Consolas', 'Monaco', monospace;
  font-size: 11px;
}
.popover-hint {
  font-size: 10px;
  color: var(--zt-text-info, #666);
  font-style: italic;
  margin-top: 8px;
}
</style>
