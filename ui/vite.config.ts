import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';
import { execSync } from 'node:child_process';

/**
 * Reads the short SHA of the current Git commit to inject into the bundle.
 * - `ZIGBEE_TUNES_COMMIT_SHA` env var wins (the HA Add-on Dockerfile sets it
 *   because the source is cloned in an earlier stage and `.git` is not
 *   carried over to the UI build stage).
 * - Otherwise we fall back to `git rev-parse --short HEAD` (works in dev
 *   and in the root-context standalone Dockerfile).
 * - 'unknown' if everything fails.
 */
function getCommitSha(): string {
  if (process.env.ZIGBEE_TUNES_COMMIT_SHA) return process.env.ZIGBEE_TUNES_COMMIT_SHA;
  try {
    return execSync('git rev-parse --short HEAD').toString().trim();
  } catch {
    return 'unknown';
  }
}

export default defineConfig({
  plugins: [vue()],
  // Relative asset paths: required for the HA Add-on Ingress, which serves
  // the UI under `/api/hassio_ingress/<token>/`. Absolute `/assets/...`
  // would 404 there. Relative paths also work fine in standalone Docker
  // and Vite dev.
  base: './',
  define: {
    // Constant replaced at build time with the short Git commit SHA.
    __COMMIT_SHA__: JSON.stringify(getCommitSha()),
  },
  server: {
    port: 5173,
    proxy: {
      // During dev (yarn ui:dev), Vite runs on :5173 and proxies /api to
      // Zigbee Tunes (yarn dev) running on :8099.
      '/api': {
        target: 'http://localhost:8099',
        changeOrigin: true,
      },
    },
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
  },
});
