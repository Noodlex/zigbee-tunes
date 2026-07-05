// Polls /api/health on a fixed interval and exposes the latest snapshot
// as a reactive ref. Used by the sidebar to live-update the connection
// status indicators (MQTT, Z2M, HA).

import { onMounted, onUnmounted, ref } from 'vue';
import { api } from '../api/client';
import type { Health } from '../api/types';

const DEFAULT_INTERVAL_MS = 5000;

export function useHealthPolling(intervalMs: number = DEFAULT_INTERVAL_MS) {
  const health = ref<Health | null>(null);
  const error = ref<string | null>(null);
  let timer: ReturnType<typeof setInterval> | null = null;
  let inFlight = false;

  async function tick() {
    // Skip if a previous tick is still pending — avoids piling up requests
    // on a slow backend. Also skip while the tab is hidden: no point
    // polling a status nobody is looking at (we catch up on focus).
    if (inFlight || document.hidden) return;
    inFlight = true;
    try {
      health.value = await api.health();
      error.value = null;
    } catch (e) {
      error.value = (e as Error).message;
    } finally {
      inFlight = false;
    }
  }

  function onVisibilityChange() {
    // Immediate refresh when the tab becomes visible again, so the dots
    // don't show up to `intervalMs` of stale state.
    if (!document.hidden) void tick();
  }

  onMounted(() => {
    void tick(); // immediate first fetch
    timer = setInterval(() => void tick(), intervalMs);
    document.addEventListener('visibilitychange', onVisibilityChange);
  });

  onUnmounted(() => {
    if (timer !== null) clearInterval(timer);
    document.removeEventListener('visibilitychange', onVisibilityChange);
  });

  return { health, error };
}
