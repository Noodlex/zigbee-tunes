<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import {
  NCard,
  NGrid,
  NGi,
  NSpace,
  NButton,
  NAlert,
  NSpin,
  NTag,
  NEmpty,
  NEllipsis,
} from 'naive-ui';
import { useI18n } from 'vue-i18n';
import { useRouter } from 'vue-router';
import { api } from '../api/client';
import type { Health, ActivityEntry, FleetStats } from '../api/types';

const { t } = useI18n();
const router = useRouter();

// Click a breakdown bar -> jump to Devices pre-filtered. "(unknown)" vendor
// has no matching filter option, so it stays non-interactive.
function goToVendor(vendor: string) {
  if (vendor === '(unknown)') return;
  router.push({ name: 'devices', query: { vendor } });
}
function goToCapability(capability: string) {
  router.push({ name: 'devices', query: { capability } });
}

const health = ref<Health | null>(null);
const activity = ref<ActivityEntry[]>([]);
const stats = ref<FleetStats | null>(null);
const loading = ref(true);
const error = ref<string | null>(null);

async function refreshAll() {
  loading.value = true;
  error.value = null;
  try {
    const [h, a, s] = await Promise.all([api.health(), api.activity(20), api.stats()]);
    health.value = h;
    activity.value = a.entries;
    stats.value = s;
  } catch (e) {
    error.value = (e as Error).message;
  } finally {
    loading.value = false;
  }
}

function fmtUptime(sec: number): string {
  const days = Math.floor(sec / 86400);
  const hours = Math.floor((sec % 86400) / 3600);
  const minutes = Math.floor((sec % 3600) / 60);
  if (days > 0) return t('time.uptime_days', { days, hours });
  if (hours > 0) return t('time.uptime_hours', { hours, minutes });
  return t('time.uptime_minutes', { minutes, seconds: sec % 60 });
}

function fmtRelative(epochMs: number): string {
  const diff = Date.now() - epochMs;
  const sec = Math.floor(diff / 1000);
  if (sec < 60) return t('time.relative_seconds', { seconds: sec });
  if (sec < 3600) return t('time.relative_minutes', { minutes: Math.floor(sec / 60) });
  if (sec < 86400) return t('time.relative_hours', { hours: Math.floor(sec / 3600) });
  return t('time.relative_days', { days: Math.floor(sec / 86400) });
}

function fmtChange(c: { field: string; before: unknown; after: unknown }): string {
  const unknown = t('common.unknown');
  const b = c.before === undefined || c.before === null ? unknown : String(c.before);
  const a = c.after === undefined || c.after === null ? unknown : String(c.after);
  let suffix = '';
  if (c.field === 'min_mireds' || c.field === 'max_mireds') {
    const ka = typeof c.after === 'number' ? `${Math.round(1_000_000 / c.after)}K` : '';
    if (ka) suffix = ` (${ka})`;
  }
  return `${c.field}: ${b} → ${a}${suffix}`;
}

const mqttStatusColor = computed(() => (health.value?.mqtt.connected ? '#18a058' : '#d03050'));
const mqttStatusLabel = computed(() =>
  health.value?.mqtt.connected
    ? t('dashboard.status.connected')
    : t('dashboard.status.disconnected'),
);

/** Maximum of a count map, used to normalize the bars. */
const vendorMax = computed(() => {
  if (!stats.value) return 1;
  const vals = Object.values(stats.value.by_vendor);
  return vals.length > 0 ? Math.max(...vals) : 1;
});
const capMax = computed(() => {
  if (!stats.value) return 1;
  const vals = Object.values(stats.value.by_capability);
  return vals.length > 0 ? Math.max(...vals) : 1;
});

onMounted(refreshAll);
</script>

<template>
  <NSpace vertical :size="16">
    <NSpace align="center" justify="space-between">
      <h2 style="margin: 0">{{ t('dashboard.title') }}</h2>
      <NButton @click="refreshAll" :loading="loading" size="small">{{ t('common.refresh') }}</NButton>
    </NSpace>

    <NAlert v-if="error" type="error" :title="t('common.error_prefix', { message: error })" />

    <NSpin :show="loading && health === null">
      <!-- Row 1: 3 status cards -->
      <NGrid cols="1 s:2 m:3" responsive="screen" :x-gap="12" :y-gap="12" v-if="health">
        <NGi>
          <NCard size="small">
            <div class="stat-label">{{ t('dashboard.status.mqtt') }}</div>
            <div class="stat-value" :style="{ color: mqttStatusColor }">
              <span class="status-dot" :style="{ background: mqttStatusColor }"></span>
              {{ mqttStatusLabel }}
            </div>
            <div class="stat-sub">
              <NEllipsis :line-clamp="1">{{ health.mqtt.url }}</NEllipsis>
              <span v-if="health.mqtt.reconnect_count > 0">
                · {{ t('dashboard.status.reconnects', { count: health.mqtt.reconnect_count }) }}
              </span>
            </div>
          </NCard>
        </NGi>
        <NGi>
          <NCard size="small">
            <div class="stat-label">{{ t('dashboard.status.devices_label') }}</div>
            <div class="stat-value">{{ health.devices_count }}</div>
            <div class="stat-sub" v-if="stats">
              {{ t('dashboard.status.devices_with_custom', { count: stats.modified }) }}
            </div>
          </NCard>
        </NGi>
        <NGi>
          <NCard size="small">
            <div class="stat-label">{{ t('dashboard.status.uptime_label') }}</div>
            <div class="stat-value">{{ fmtUptime(health.uptime_sec) }}</div>
            <div class="stat-sub" v-if="health.mqtt.last_reconnect_at">
              {{ t('dashboard.status.last_reconnect', { when: fmtRelative(health.mqtt.last_reconnect_at) }) }}
            </div>
            <div class="stat-sub" v-else>{{ t('dashboard.status.no_reconnect') }}</div>
          </NCard>
        </NGi>
      </NGrid>

      <div style="height: 16px" />

      <!-- Row 2: Recent activity -->
      <NCard size="small" :title="t('dashboard.activity.title')">
        <NEmpty
          v-if="activity.length === 0"
          :description="t('dashboard.activity.empty')"
          size="small"
        />
        <div v-else class="activity-list">
          <div v-for="e in activity" :key="e.id" class="activity-row">
            <div class="activity-time">{{ fmtRelative(e.applied_at) }}</div>
            <div class="activity-device">
              <NEllipsis :line-clamp="1">{{ e.friendly_name }}</NEllipsis>
            </div>
            <div class="activity-changes">
              <NTag v-for="(c, i) in e.changes" :key="i" size="small" :bordered="false" type="info">
                {{ fmtChange(c) }}
              </NTag>
            </div>
          </div>
        </div>
      </NCard>

      <div style="height: 16px" />

      <!-- Row 3: vendor + capability breakdowns -->
      <NGrid cols="1 m:2" responsive="screen" :x-gap="12" :y-gap="12" v-if="stats">
        <NGi>
          <NCard size="small" :title="t('dashboard.breakdown.vendor_title')">
            <div v-if="Object.keys(stats.by_vendor).length === 0" class="empty-hint">{{ t('common.unknown') }}</div>
            <div v-else class="bars">
              <div
                v-for="(count, vendor) in stats.by_vendor"
                :key="vendor"
                class="bar-row"
                :class="{ 'bar-row-clickable': vendor !== '(unknown)' }"
                :role="vendor !== '(unknown)' ? 'button' : undefined"
                :tabindex="vendor !== '(unknown)' ? 0 : undefined"
                :title="vendor !== '(unknown)' ? t('dashboard.breakdown.filter_hint', { value: vendor }) : undefined"
                :aria-label="vendor !== '(unknown)' ? t('dashboard.breakdown.filter_hint', { value: vendor }) : undefined"
                @click="goToVendor(String(vendor))"
                @keydown.enter="goToVendor(String(vendor))"
                @keydown.space.prevent="goToVendor(String(vendor))"
              >
                <div class="bar-label">
                  <NEllipsis :line-clamp="1">{{ vendor }}</NEllipsis>
                </div>
                <div class="bar-track">
                  <div class="bar-fill" :style="{ width: ((count / vendorMax) * 100) + '%' }" />
                </div>
                <div class="bar-count">{{ count }}</div>
              </div>
            </div>
          </NCard>
        </NGi>
        <NGi>
          <NCard size="small" :title="t('dashboard.breakdown.capability_title')">
            <div v-if="Object.keys(stats.by_capability).length === 0" class="empty-hint">{{ t('common.unknown') }}</div>
            <div v-else class="bars">
              <div
                v-for="(count, cap) in stats.by_capability"
                :key="cap"
                class="bar-row bar-row-clickable"
                role="button"
                tabindex="0"
                :title="t('dashboard.breakdown.filter_hint', { value: cap })"
                :aria-label="t('dashboard.breakdown.filter_hint', { value: cap })"
                @click="goToCapability(String(cap))"
                @keydown.enter="goToCapability(String(cap))"
                @keydown.space.prevent="goToCapability(String(cap))"
              >
                <div class="bar-label"><code>{{ cap }}</code></div>
                <div class="bar-track">
                  <div class="bar-fill" :style="{ width: ((count / capMax) * 100) + '%' }" />
                </div>
                <div class="bar-count">{{ count }}</div>
              </div>
            </div>
          </NCard>
        </NGi>
      </NGrid>
    </NSpin>
  </NSpace>
</template>

<style scoped>
.stat-label {
  font-size: 12px;
  color: var(--zt-text-hint, #888);
  margin-bottom: 4px;
}

.stat-value {
  font-size: 26px;
  font-weight: 600;
  display: flex;
  align-items: center;
  gap: 8px;
}

.stat-sub {
  font-size: 11px;
  color: var(--zt-text-hint, #888);
  margin-top: 6px;
}

.status-dot {
  width: 10px;
  height: 10px;
  border-radius: 50%;
  display: inline-block;
}

.activity-list {
  display: flex;
  flex-direction: column;
  max-height: 320px;
  overflow-y: auto;
}

.activity-row {
  display: grid;
  grid-template-columns: 110px 180px 1fr;
  gap: 12px;
  align-items: center;
  padding: 3px 0;
  border-bottom: 1px solid var(--zt-divider-subtle, rgba(255, 255, 255, 0.04));
  font-size: 12px;
}

/* Compact the activity tags so the rows pack tighter vertically. */
.activity-changes :deep(.n-tag) {
  height: 20px;
}
.activity-row:last-child {
  border-bottom: none;
}

/* Stack the activity row on phones instead of overflowing the 3 columns. */
@media (max-width: 640px) {
  .activity-row {
    grid-template-columns: 1fr;
    gap: 4px;
    padding: 8px 0;
  }
}

.activity-time {
  color: var(--zt-text-hint, #888);
  font-size: 11px;
}

.activity-device {
  font-weight: 600;
}

.activity-changes {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
}

.bars {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.bar-row {
  display: grid;
  grid-template-columns: 130px 1fr 40px;
  gap: 10px;
  align-items: center;
  font-size: 12px;
}

/* Breakdown bars that jump to a pre-filtered Devices view. */
.bar-row-clickable {
  cursor: pointer;
  border-radius: 4px;
  transition: background-color 0.12s ease;
}
.bar-row-clickable:hover {
  background-color: var(--zt-image-bg, rgba(127, 127, 127, 0.08));
}
.bar-row-clickable:focus-visible {
  outline: 2px solid #18a058;
  outline-offset: 2px;
}
@media (prefers-reduced-motion: reduce) {
  .bar-row-clickable {
    transition: none;
  }
}

.bar-label code {
  font-family: 'Consolas', 'Monaco', monospace;
  font-size: 11px;
}

.bar-track {
  height: 14px;
  background: var(--zt-divider, rgba(255, 255, 255, 0.06));
  border-radius: 7px;
  overflow: hidden;
}

.bar-fill {
  height: 100%;
  background: linear-gradient(90deg, #18a058, #63e2b7);
  transition: width 0.3s ease;
}

.bar-count {
  text-align: right;
  font-weight: 600;
}

.empty-hint {
  color: var(--zt-text-info, #666);
  font-style: italic;
  font-size: 12px;
}
</style>
