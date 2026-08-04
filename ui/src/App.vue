<script setup lang="ts">
import { h, computed, ref, onMounted, onUnmounted } from 'vue';
import { RouterView, RouterLink, useRoute } from 'vue-router';
import { useI18n } from 'vue-i18n';
import {
  NConfigProvider,
  NLayout,
  NLayoutSider,
  NLayoutContent,
  NMenu,
  NSpace,
  NText,
  NMessageProvider,
  NDropdown,
  NButton,
  NIcon,
  type MenuOption,
  type DropdownOption,
} from 'naive-ui';
import { useTheme, type ThemePref } from './composables/useTheme';
import { useHealthPolling } from './composables/useHealthPolling';
import { setLocale, type SupportedLocale } from './i18n';
import type { ServiceStatus } from './api/types';

const route = useRoute();
const { t, locale } = useI18n();

const activeKey = computed(() => (route.name as string) ?? 'devices');

// Responsive sidebar: auto-collapse to an icon rail below the desktop
// breakpoint so the content stays usable on tablets/phones. Initialised
// from the current width (client-only SPA, window is available at setup) to
// avoid a first-paint flash, then re-synced when the viewport CROSSES the
// breakpoint. A manual expand/collapse is preserved only until the next
// crossing, which re-asserts the width-appropriate default.
const initialNarrow = window.innerWidth < 1024;
const collapsed = ref(initialNarrow);
const viewportWidth = ref(window.innerWidth);
let wasNarrow = initialNarrow;
function syncSidebar() {
  viewportWidth.value = window.innerWidth;
  const narrow = window.innerWidth < 1024;
  if (narrow !== wasNarrow) {
    collapsed.value = narrow;
    wasNarrow = narrow;
  }
}
const contentStyle = computed(() => ({ padding: viewportWidth.value < 640 ? '12px' : '24px' }));
onMounted(() => {
  syncSidebar();
  window.addEventListener('resize', syncSidebar);
});
onUnmounted(() => window.removeEventListener('resize', syncSidebar));

// Menu icons (inline SVGs, no extra dep)
const iconDevices = () =>
  h('svg', { viewBox: '0 0 24 24', width: '18', height: '18', fill: 'currentColor' }, [
    h('path', {
      d: 'M3 5h18a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1H13l1 2h3a1 1 0 0 1 0 2H7a1 1 0 0 1 0-2h3l1-2H3a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1zm1 2v8h16V7H4z',
    }),
  ]);
const iconCustomizations = () =>
  h('svg', { viewBox: '0 0 24 24', width: '18', height: '18', fill: 'currentColor' }, [
    h('path', {
      d: 'M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04a1 1 0 0 0 0-1.41l-2.34-2.34a1 1 0 0 0-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z',
    }),
  ]);
const iconDashboard = () =>
  h('svg', { viewBox: '0 0 24 24', width: '18', height: '18', fill: 'currentColor' }, [
    h('path', {
      d: 'M3 13h8V3H3v10zm0 8h8v-6H3v6zm10 0h8V11h-8v10zm0-18v6h8V3h-8z',
    }),
  ]);

const menuOptions = computed<MenuOption[]>(() => [
  {
    label: () => h(RouterLink, { to: '/dashboard' }, () => t('nav.dashboard')),
    key: 'dashboard',
    icon: () => h(NIcon, null, { default: iconDashboard }),
  },
  {
    label: () => h(RouterLink, { to: '/' }, () => t('nav.devices')),
    key: 'devices',
    icon: () => h(NIcon, null, { default: iconDevices }),
  },
  {
    label: () => h(RouterLink, { to: '/customizations' }, () => t('nav.customizations')),
    key: 'customizations',
    icon: () => h(NIcon, null, { default: iconCustomizations }),
  },
]);

const { pref, isDark, theme, setPref } = useTheme();

// Theme + language icons
const iconSun = () =>
  h('svg', { viewBox: '0 0 24 24', width: '18', height: '18', fill: 'currentColor' }, [
    h('path', {
      d: 'M12 7a5 5 0 1 0 0 10 5 5 0 0 0 0-10zm-9 5a1 1 0 0 1 1-1h2a1 1 0 1 1 0 2H4a1 1 0 0 1-1-1zm17 0a1 1 0 0 1 1-1h2a1 1 0 1 1 0 2h-2a1 1 0 0 1-1-1zM12 1a1 1 0 0 1 1 1v2a1 1 0 1 1-2 0V2a1 1 0 0 1 1-1zm0 18a1 1 0 0 1 1 1v2a1 1 0 1 1-2 0v-2a1 1 0 0 1 1-1zM4.22 4.22a1 1 0 0 1 1.42 0l1.41 1.41a1 1 0 1 1-1.41 1.42L4.22 5.64a1 1 0 0 1 0-1.42zm12.73 12.73a1 1 0 0 1 1.41 0l1.42 1.41a1 1 0 0 1-1.42 1.42l-1.41-1.42a1 1 0 0 1 0-1.41zm-12.73 2.83a1 1 0 0 1 0-1.42l1.41-1.41a1 1 0 1 1 1.42 1.41l-1.42 1.42a1 1 0 0 1-1.41 0zm12.73-12.73a1 1 0 0 1 0-1.42l1.42-1.41a1 1 0 0 1 1.41 1.42l-1.41 1.41a1 1 0 0 1-1.42 0z',
    }),
  ]);
const iconMoon = () =>
  h('svg', { viewBox: '0 0 24 24', width: '18', height: '18', fill: 'currentColor' }, [
    h('path', {
      d: 'M21.64 13a1 1 0 0 0-1.05-.14 8.05 8.05 0 0 1-3.37.73 8.15 8.15 0 0 1-8.14-8.1 8.59 8.59 0 0 1 .25-2 1 1 0 0 0-.31-1 1 1 0 0 0-1-.25A10.14 10.14 0 1 0 22 14.05a1 1 0 0 0-.36-1.05z',
    }),
  ]);
const iconAuto = () =>
  h('svg', { viewBox: '0 0 24 24', width: '18', height: '18', fill: 'currentColor' }, [
    h('path', {
      d: 'M4 6a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2h-5v2h3v2H8v-2h3v-2H6a2 2 0 0 1-2-2V6zm2 0v9h12V6H6z',
    }),
  ]);
const iconGlobe = () =>
  h('svg', { viewBox: '0 0 24 24', width: '18', height: '18', fill: 'currentColor' }, [
    h('path', {
      d: 'M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 17.93c-3.94-.49-7-3.85-7-7.93 0-.62.08-1.21.21-1.79L9 15v1c0 1.1.9 2 2 2v1.93zm6.9-2.54c-.26-.81-1-1.39-1.9-1.39h-1v-3c0-.55-.45-1-1-1H8v-2h2c.55 0 1-.45 1-1V7h2c1.1 0 2-.9 2-2v-.41c2.93 1.19 5 4.06 5 7.41 0 2.08-.8 3.97-2.1 5.39z',
    }),
  ]);

const currentThemeIcon = computed(() => {
  if (pref.value === 'auto') return iconAuto;
  return isDark.value ? iconMoon : iconSun;
});

const themeOptions = computed<DropdownOption[]>(() => [
  { label: t('theme.dark'), key: 'dark', icon: iconMoon },
  { label: t('theme.light'), key: 'light', icon: iconSun },
  { label: t('theme.auto'), key: 'auto', icon: iconAuto },
]);

const languageOptions = computed<DropdownOption[]>(() => [
  { label: t('language.en'), key: 'en' },
  { label: t('language.fr'), key: 'fr' },
]);

function onThemeSelect(key: string) {
  setPref(key as ThemePref);
}

function onLanguageSelect(key: string) {
  setLocale(key as SupportedLocale);
}

// Short Git SHA injected by Vite at build (vite.config.ts)
const commitSha = __COMMIT_SHA__;

// Live polling of /api/health every 5s — drives the connection indicators
// shown at the bottom of the sidebar.
const { health } = useHealthPolling();

/**
 * Maps a service state to a UI dot color:
 *   online  -> green
 *   offline -> red
 *   unknown -> orange (e.g. we never received a status message)
 */
function statusColor(status: ServiceStatus | 'connected' | 'disconnected' | undefined): string {
  if (status === 'online' || status === 'connected') return '#18a058';
  if (status === 'offline' || status === 'disconnected') return '#d03050';
  return '#f0a020';
}

/** Maps MQTT boolean to a ServiceStatus for indicator rendering consistency. */
const mqttStatus = computed<ServiceStatus>(() => {
  if (!health.value) return 'unknown';
  return health.value.mqtt.connected ? 'online' : 'offline';
});

function statusLabel(s: ServiceStatus): string {
  if (s === 'online') return t('connection.status_online');
  if (s === 'offline') return t('connection.status_offline');
  return t('connection.status_unknown');
}

function fmtRelative(epochMs: number): string {
  const diff = Date.now() - epochMs;
  const sec = Math.floor(diff / 1000);
  if (sec < 60) return t('time.relative_seconds', { seconds: sec });
  if (sec < 3600) return t('time.relative_minutes', { minutes: Math.floor(sec / 60) });
  if (sec < 86400) return t('time.relative_hours', { hours: Math.floor(sec / 3600) });
  return t('time.relative_days', { days: Math.floor(sec / 86400) });
}

function tooltipFor(
  label: string,
  status: ServiceStatus,
  lastUpdate: number | null,
  isHeartbeat: boolean,
): string {
  const parts = [`${label}: ${statusLabel(status)}`];
  if (lastUpdate !== null) parts.push(t('connection.last_update', { when: fmtRelative(lastUpdate) }));
  // For services that don't publish periodically (HA, Z2M), add a hint so
  // the user doesn't worry about an old timestamp.
  if (!isHeartbeat) parts.push(t('connection.no_heartbeat_hint'));
  return parts.join('\n');
}
</script>

<template>
  <NConfigProvider :theme="theme">
    <NMessageProvider>
      <NLayout has-sider :class="isDark ? 'zt-dark' : 'zt-light'" style="height: 100vh">
        <NLayoutSider
          bordered
          v-model:collapsed="collapsed"
          :width="220"
          :collapsed-width="64"
          collapse-mode="width"
          :native-scrollbar="false"
          show-trigger="arrow-circle"
          style="background: transparent"
          content-style="display: flex; flex-direction: column; height: 100%;"
        >
          <div class="brand">
            <span class="brand-icon" aria-hidden="true">
              <!-- mdi:tune — same glyph as the HA sidebar panel_icon, so the
                   two icons are pixel-identical (was an emoji before, which
                   rendered differently per OS). -->
              <svg viewBox="0 0 24 24" fill="currentColor"><path d="M3,17V19H9V17H3M3,5V7H13V5H3M13,21V19H21V17H13V15H11V21H13M7,9V11H3V13H7V15H9V9H7M21,13V11H11V13H21M15,9H17V7H21V5H17V3H15V9Z"/></svg>
            </span>
            <span class="brand-name">Zigbee Tunes</span>
          </div>

          <NMenu
            :value="activeKey"
            :options="menuOptions"
            :indent="20"
            :collapsed-width="64"
            :collapsed-icon-size="20"
          />

          <!-- Pushes the footer to the bottom of the sidebar -->
          <div class="sidebar-spacer" />

          <div class="sidebar-footer">
            <!-- Live service-connection indicators (green / orange / red dot) -->
            <div class="connection-status">
              <div
                class="status-row"
                :title="tooltipFor(t('connection.mqtt_broker'), mqttStatus, health?.mqtt.connected_at ?? null, true)"
              >
                <span class="status-dot" :style="{ background: statusColor(mqttStatus) }"></span>
                <span class="status-label">{{ t('connection.mqtt_broker') }}</span>
              </div>
              <div
                class="status-row"
                :title="tooltipFor(t('connection.zigbee2mqtt'), health?.z2m.status ?? 'unknown', health?.z2m.last_update ?? null, false)"
              >
                <span class="status-dot" :style="{ background: statusColor(health?.z2m.status) }"></span>
                <span class="status-label">{{ t('connection.zigbee2mqtt') }}</span>
              </div>
              <div
                class="status-row"
                :title="tooltipFor(t('connection.home_assistant'), health?.ha.status ?? 'unknown', health?.ha.last_update ?? null, false)"
              >
                <span class="status-dot" :style="{ background: statusColor(health?.ha.status) }"></span>
                <span class="status-label">{{ t('connection.home_assistant') }}</span>
              </div>
            </div>

            <div class="sidebar-info">
              <div class="subtitle">{{ t('app.subtitle') }}</div>
              <div class="sha-pill" :title="`Build commit: ${commitSha}`">{{ commitSha }}</div>
            </div>
            <NSpace :size="6" align="center" class="sidebar-controls">
              <NDropdown :options="languageOptions" trigger="click" placement="top-end" @select="onLanguageSelect">
                <NButton circle quaternary :title="t('language.tooltip', { locale })">
                  <template #icon>
                    <NIcon><component :is="iconGlobe" /></NIcon>
                  </template>
                </NButton>
              </NDropdown>
              <NDropdown :options="themeOptions" trigger="click" placement="top-end" @select="onThemeSelect">
                <NButton circle quaternary :title="t('theme.tooltip', { pref })">
                  <template #icon>
                    <NIcon><component :is="currentThemeIcon" /></NIcon>
                  </template>
                </NButton>
              </NDropdown>
            </NSpace>
          </div>
        </NLayoutSider>

        <NLayout>
          <NLayoutContent :content-style="contentStyle">
            <RouterView />
          </NLayoutContent>
        </NLayout>
      </NLayout>
    </NMessageProvider>
  </NConfigProvider>
</template>

<style>
.zt-dark {
  --zt-card-bg: #2c2c32;
  --zt-card-border: rgba(255, 255, 255, 0.18);
  --zt-card-border-hover: rgba(255, 255, 255, 0.42);
  --zt-image-bg: rgba(255, 255, 255, 0.06);
  --zt-divider: rgba(255, 255, 255, 0.08);
  --zt-divider-subtle: rgba(255, 255, 255, 0.04);
  --zt-text-secondary: #aaa;
  --zt-text-hint: #888;
  --zt-text-info: #666;
  --zt-text-placeholder: #555;
}

.zt-light {
  --zt-card-bg: #ffffff;
  --zt-card-border: rgba(0, 0, 0, 0.18);
  --zt-card-border-hover: rgba(0, 0, 0, 0.40);
  --zt-image-bg: rgba(0, 0, 0, 0.04);
  --zt-divider: rgba(0, 0, 0, 0.08);
  --zt-divider-subtle: rgba(0, 0, 0, 0.04);
  --zt-text-secondary: #555;
  --zt-text-hint: #777;
  --zt-text-info: #888;
  --zt-text-placeholder: #aaa;
}

.brand {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 16px 20px;
  font-size: 18px;
  font-weight: 700;
  border-bottom: 1px solid var(--zt-divider, rgba(127, 127, 127, 0.15));
  flex-shrink: 0;
}

.brand-icon {
  display: inline-flex;
  width: 22px;
  height: 22px;
  flex-shrink: 0;
}
.brand-icon svg {
  width: 100%;
  height: 100%;
}

.brand-name {
  white-space: nowrap;
  overflow: hidden;
}

.sidebar-spacer {
  flex: 1;
}

.sidebar-footer {
  border-top: 1px solid var(--zt-divider, rgba(127, 127, 127, 0.15));
  padding: 12px 16px;
  display: flex;
  flex-direction: column;
  gap: 8px;
  flex-shrink: 0;
}

.sidebar-info {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.sidebar-info .subtitle {
  font-size: 11px;
  color: var(--zt-text-hint, #888);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.sidebar-info .sha-pill {
  font-size: 10px;
  font-family: 'Consolas', 'Monaco', monospace;
  padding: 2px 6px;
  border-radius: 4px;
  background: rgba(127, 127, 127, 0.15);
  align-self: flex-start;
  color: var(--zt-text-hint, #888);
}

.sidebar-controls {
  align-self: flex-start;
}

/* Connection status indicators (MQTT / Z2M / HA) */
.connection-status {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding-bottom: 8px;
  border-bottom: 1px solid var(--zt-divider-subtle, rgba(127, 127, 127, 0.08));
  margin-bottom: 4px;
}

.status-row {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 12px;
  color: var(--zt-text-secondary, #555);
  cursor: default;
}

.status-dot {
  width: 10px;
  height: 10px;
  border-radius: 50%;
  flex-shrink: 0;
  transition: background-color 0.2s ease;
}

.status-label {
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

/* Collapsed state: hide textual brand and sidebar info, stack controls
   vertically and center them. */
.n-layout-sider--collapsed .brand {
  padding: 16px 0;
  justify-content: center;
}
.n-layout-sider--collapsed .brand-name {
  display: none;
}
.n-layout-sider--collapsed .sidebar-footer {
  padding: 12px 8px;
  align-items: center;
}
.n-layout-sider--collapsed .sidebar-info {
  display: none;
}
.n-layout-sider--collapsed .status-label {
  display: none;
}
.n-layout-sider--collapsed .status-row {
  justify-content: center;
}
.n-layout-sider--collapsed .connection-status {
  align-items: center;
  border-bottom-color: transparent;
}
.n-layout-sider--collapsed .sidebar-controls {
  flex-direction: column;
  align-self: center;
}
.n-layout-sider--collapsed .sidebar-controls > * {
  margin: 0 !important;
}
</style>
