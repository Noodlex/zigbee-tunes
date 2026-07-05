// Sanity tests on the UI i18n locale files. These guard against:
// - Adding a key in one language and forgetting the other.
// - Changing the interpolation params on one side without syncing the other.
//
// The locale JSONs live under ui/src/i18n/locales/. We load them as raw
// JSON and walk the nested structure ourselves to avoid pulling vue-i18n
// (and the entire UI bundle) into the backend test runtime.

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { describe, it, expect } from 'vitest';

const here = dirname(fileURLToPath(import.meta.url));
const localesDir = join(here, '..', 'ui', 'src', 'i18n', 'locales');

function loadLocale(name: string): Record<string, unknown> {
  return JSON.parse(readFileSync(join(localesDir, `${name}.json`), 'utf-8')) as Record<string, unknown>;
}

const en = loadLocale('en');
const fr = loadLocale('fr');

function flatten(obj: Record<string, unknown>, prefix = ''): Map<string, string> {
  const out = new Map<string, string>();
  for (const [k, v] of Object.entries(obj)) {
    const path = prefix ? `${prefix}.${k}` : k;
    if (typeof v === 'string') {
      out.set(path, v);
    } else if (v !== null && typeof v === 'object') {
      for (const [subK, subV] of flatten(v as Record<string, unknown>, path)) {
        out.set(subK, subV);
      }
    }
  }
  return out;
}

function paramsOf(s: string): Set<string> {
  return new Set(Array.from(s.matchAll(/\{(\w+)\}/g), (m) => m[1] as string));
}

describe('i18n locales', () => {
  const enFlat = flatten(en);
  const frFlat = flatten(fr);

  it('en and fr have identical key sets', () => {
    const enKeys = [...enFlat.keys()].sort();
    const frKeys = [...frFlat.keys()].sort();
    expect(frKeys).toEqual(enKeys);
  });

  it('each key has identical interpolation parameters in en and fr', () => {
    const mismatches: string[] = [];
    for (const [key, enVal] of enFlat) {
      const frVal = frFlat.get(key);
      if (frVal === undefined) continue; // handled by the previous test
      const enParams = [...paramsOf(enVal)].sort();
      const frParams = [...paramsOf(frVal)].sort();
      if (JSON.stringify(enParams) !== JSON.stringify(frParams)) {
        mismatches.push(`${key}: en=${JSON.stringify(enParams)} fr=${JSON.stringify(frParams)}`);
      }
    }
    expect(mismatches).toEqual([]);
  });

  it('no string is empty in either locale', () => {
    const emptyEn = [...enFlat.entries()].filter(([, v]) => v.length === 0).map(([k]) => k);
    const emptyFr = [...frFlat.entries()].filter(([, v]) => v.length === 0).map(([k]) => k);
    expect({ en: emptyEn, fr: emptyFr }).toEqual({ en: [], fr: [] });
  });
});
