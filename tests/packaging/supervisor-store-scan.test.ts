import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/**
 * Guards the fix for issue #5.
 *
 * When a repository is added as an app store, the Supervisor walks the
 * whole clone looking for app configs and logs a warning for every candidate it
 * cannot parse as one. Two of our files matched that pattern without being app
 * configs — the standalone Docker example and the entrypoint's options template
 * — so every Supervisor start produced two warnings a user could do nothing
 * about.
 *
 * This mirrors `_find_app_configs` in supervisor/store/data.py:
 *
 *     for app in path.glob("**\/config.*")
 *         if not [part for part in app.parts
 *                 if part.startswith(".") or part == "rootfs"]
 *         and app.suffix in FILE_SUFFIX_CONFIGURATION
 *
 * Keep it in sync if upstream changes; it is deliberately a transcription
 * rather than an approximation, so a rename that "looks fine" cannot slip
 * through again.
 */

const REPO_ROOT = path.resolve(fileURLToPath(new URL('../..', import.meta.url)));

/** supervisor/const.py::FILE_SUFFIX_CONFIGURATION */
const FILE_SUFFIX_CONFIGURATION = ['.yaml', '.yml', '.json'];

/** The one real app config — this must stay discoverable. */
const APP_CONFIG = 'addon/zigbee-tunes/config.yaml';

/** What the Supervisor clones is what git tracks. */
function trackedFiles(): string[] {
  return execFileSync('git', ['ls-files'], {
    cwd: REPO_ROOT,
    encoding: 'utf8',
    maxBuffer: 32 * 1024 * 1024,
  })
    .split('\n')
    .filter(Boolean);
}

function isScannedBySupervisor(file: string): boolean {
  const parts = file.split('/');

  // `part.startswith(".") or part == "rootfs"` — dotted paths and the
  // conventional image-payload folder are skipped outright.
  if (parts.some((part) => part.startsWith('.') || part === 'rootfs')) return false;

  // glob("**/config.*") — the name must literally begin with "config."
  const name = parts[parts.length - 1];
  if (!name.startsWith('config.')) return false;

  // `app.suffix in FILE_SUFFIX_CONFIGURATION`
  return FILE_SUFFIX_CONFIGURATION.some((suffix) => name.endsWith(suffix));
}

/**
 * Only git can tell us what a clone would contain, so the scan can only be
 * replayed inside a work tree. CI always checks one out, so this never skips
 * there — it skips for someone running the suite from a downloaded tarball,
 * where the question is unanswerable rather than failing.
 *
 * Deliberately not called at module scope: a throw there fails collection of
 * the whole file, which reads as a broken test suite rather than an
 * inapplicable check.
 */
function inGitWorkTree(): boolean {
  try {
    execFileSync('git', ['rev-parse', '--is-inside-work-tree'], {
      cwd: REPO_ROOT,
      stdio: 'pipe',
    });
    return true;
  } catch {
    return false;
  }
}

let cached: string[] | null = null;

/** Resolved on first use, so nothing runs before the suite is known to apply. */
function scannedFiles(): string[] {
  if (cached === null) cached = trackedFiles().filter(isScannedBySupervisor);
  return cached;
}

describe.skipIf(!inGitWorkTree())('Supervisor app-store scan', () => {
  it('still finds the app config', () => {
    // If this breaks, the app disappears from the store entirely.
    expect(scannedFiles()).toContain(APP_CONFIG);
  });

  it('offers the Supervisor nothing else to choke on', () => {
    const strays = scannedFiles().filter((file) => file !== APP_CONFIG);

    expect(
      strays,
      `These files match the Supervisor's app-config scan but are not app configs. ` +
        `It will try to parse each one and log "Can't read ..." on every start ` +
        `(issue #5). Rename them so the name does not begin with "config.", or ` +
        `move them under a "rootfs/" folder, which the scan skips.`,
    ).toEqual([]);
  });
});
