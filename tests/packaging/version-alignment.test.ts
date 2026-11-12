import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse } from 'yaml';
import { describe, expect, it } from 'vitest';

/**
 * Guards the version against being bumped in some places and not others.
 *
 * A release declares its version four times, and nothing tied them together:
 * the list lived in a checklist. Each one is read by something different, so a
 * missed one fails differently — and none of them fails loudly:
 *
 *   - `addon/zigbee-tunes/config.yaml` is the one the Supervisor compares. If
 *     it stays behind, Home Assistant never offers the update, and the release
 *     exists without reaching anyone;
 *   - the `io.hass.version` label is stamped on the image the Supervisor
 *     builds, which then describes itself as a version it is not;
 *   - the two `package.json` are what the app and the UI report about
 *     themselves.
 *
 * The changelog is held to the same version because the release notes are cut
 * from its top entry: a bump without one publishes the previous release's
 * notes under the new tag.
 */

const REPO_ROOT = path.resolve(fileURLToPath(new URL('../..', import.meta.url)));

function read(relative: string): string {
  return fs.readFileSync(path.join(REPO_ROOT, relative), 'utf8');
}

function packageVersion(relative: string): string | null {
  const version = (JSON.parse(read(relative)) as { version?: unknown }).version;
  return typeof version === 'string' ? version : null;
}

function addonConfigVersion(): string | null {
  const version = (parse(read('addon/zigbee-tunes/config.yaml')) as { version?: unknown }).version;
  // Quoted in the file on purpose: unquoted, YAML would read `1.10` as a number
  // and silently turn it into 1.1.
  return typeof version === 'string' ? version : null;
}

function imageLabelVersion(): string | null {
  return /io\.hass\.version="([^"]+)"/.exec(read('addon/zigbee-tunes/Dockerfile'))?.[1] ?? null;
}

function latestChangelogVersion(): string | null {
  // The first `## x.y.z` heading is the most recent entry.
  return /^## (\d+\.\d+\.\d+)/m.exec(read('addon/zigbee-tunes/CHANGELOG.md'))?.[1] ?? null;
}

describe('release version', () => {
  const reference = packageVersion('package.json');

  it('is declared in the backend package', () => {
    // Everything below is compared against this one.
    expect(reference).toMatch(/^\d+\.\d+\.\d+$/);
  });

  it('is the same in all four declarations', () => {
    expect({
      'ui/package.json': packageVersion('ui/package.json'),
      'addon/zigbee-tunes/config.yaml': addonConfigVersion(),
      'addon/zigbee-tunes/Dockerfile (io.hass.version)': imageLabelVersion(),
    }).toEqual({
      'ui/package.json': reference,
      'addon/zigbee-tunes/config.yaml': reference,
      'addon/zigbee-tunes/Dockerfile (io.hass.version)': reference,
    });
  });

  it('has its changelog entry at the top', () => {
    expect(
      latestChangelogVersion(),
      'The release notes are cut from the first entry of the changelog. ' +
        'Bumping the version without adding one publishes the previous notes.',
    ).toBe(reference);
  });
});
