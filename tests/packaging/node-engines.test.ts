import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import semver from 'semver';
import { describe, expect, it } from 'vitest';

/**
 * Guards `engines.node` against the dependencies that actually constrain it.
 *
 * A declared range is a promise: "this project runs on these Node versions".
 * Nothing enforced it, and it drifted twice — both times caught by a human
 * reading a diff rather than by anything automatic:
 *
 *   - it said `>=22.5.0` long after Vite 8 had raised the floor to 22.12;
 *   - it said `>=24.0.0`, which admits Node 25, while vitest 5 supports
 *     `^22.12.0 || ^24.0.0 || >=26.0.0` — it skips 23 AND 25.
 *
 * Neither drift breaks a build here: CI and the images run one fixed Node.
 * They break for whoever trusts the range, on a version nobody tested.
 *
 * Only DIRECT dependencies are checked. Those are the ones chosen on purpose;
 * a transitive package's requirements are the resolver's business, and folding
 * them in would report constraints nobody here can act on.
 */

const REPO_ROOT = path.resolve(fileURLToPath(new URL('../..', import.meta.url)));

interface PackageUnderTest {
  label: string;
  /** Directory holding both the package.json and its node_modules. */
  root: string;
}

/**
 * Both packages, because they carry the same range on purpose: CI and the
 * Docker images build the repo as a unit, so what matters to a contributor is
 * the intersection of everything the repository installs.
 */
const PACKAGES: PackageUnderTest[] = [
  { label: 'backend', root: REPO_ROOT },
  { label: 'ui', root: path.join(REPO_ROOT, 'ui') },
];

function readJson(file: string): Record<string, unknown> {
  return JSON.parse(fs.readFileSync(file, 'utf8')) as Record<string, unknown>;
}

/** The range a dependency declares, or null when it declares none. */
function declaredNodeRange(root: string, dependency: string): string | null {
  // Read the file directly rather than through require.resolve: a package with
  // a restrictive `exports` map refuses to hand over its own package.json.
  const manifest = path.join(root, 'node_modules', ...dependency.split('/'), 'package.json');
  if (!fs.existsSync(manifest)) return null;
  const engines = readJson(manifest).engines as { node?: string } | undefined;
  return engines?.node ?? null;
}

function directDependencies(pkg: Record<string, unknown>): string[] {
  const deps = (pkg.dependencies ?? {}) as Record<string, string>;
  const dev = (pkg.devDependencies ?? {}) as Record<string, string>;
  return [...Object.keys(deps), ...Object.keys(dev)].sort();
}

describe.each(PACKAGES)('$label — engines.node', ({ root }) => {
  const pkg = readJson(path.join(root, 'package.json'));
  const ours = (pkg.engines as { node?: string } | undefined)?.node ?? null;

  it('is declared at all', () => {
    // Without it, nothing below can mean anything — and npm/yarn stop warning
    // a contributor on an unsupported runtime.
    expect(ours).not.toBeNull();
  });

  it('promises no Node version a direct dependency rejects', () => {
    const tooBroad = directDependencies(pkg)
      .map((name) => ({ name, theirs: declaredNodeRange(root, name) }))
      .filter(
        (d): d is { name: string; theirs: string } =>
          d.theirs !== null && !semver.subset(ours!, d.theirs),
      );

    expect(
      tooBroad.map((d) => `${d.name} requires ${d.theirs}`),
      `engines.node is "${ours}", which admits versions these dependencies do not. ` +
        `Narrow it to the intersection — someone installing on a version listed here ` +
        `gets a dependency that refuses to run, and the range told them it was fine.`,
    ).toEqual([]);
  });
});
