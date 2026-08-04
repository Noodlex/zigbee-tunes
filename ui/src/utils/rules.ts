// Shared formatting helpers for transformer rules.
// Avoids duplicating describeRule / kelvin conversion across views.

import type { AppliedRule, Device } from '../api/types';

/** Minimal `t` shape required by describeRule, so we don't need to import vue-i18n here. */
export type TranslateFn = (key: string, params?: Record<string, unknown>) => string;

/** Convert mireds to kelvin (kelvin = 1_000_000 / mireds). */
export function miredsToKelvin(mireds: number): number {
  return Math.round(1_000_000 / mireds);
}

/** Convert a brightness scale (1..254) to a 0..100 percentage. */
export function brightnessPercent(scale: number): number {
  return Math.round((scale / 254) * 100);
}

export interface CctRangeStats {
  /** False when no selected device advertises a native CCT range. */
  hasData: boolean;
  /** Devices with color_temp that haven't published their range yet. */
  missing: number;
  /** Widest span any device can reach: [min of mins, max of maxs]. */
  unionLow: number | null;
  unionHigh: number | null;
  /** Lowest min EVERY device can honour (the strictest of all mins). */
  safeMin: number | null;
  /** Highest max EVERY device can honour (the strictest of all maxs). */
  safeMax: number | null;
}

/**
 * Native colour-temperature range statistics across a set of devices.
 *
 * [safeMin, safeMax] is the intersection: pick anything inside and no device
 * is asked for more than it physically supports. [unionLow, unionHigh] is the
 * envelope, useful to bound a slider without clipping a value that is already
 * outside the intersection.
 *
 * Shared by the bulk-edit panel and the rule editor so both describe a
 * selection the same way.
 */
export function cctRangeStats(devices: Device[]): CctRangeStats {
  const mins: number[] = [];
  const maxs: number[] = [];
  let missing = 0;
  for (const d of devices) {
    if (!d.capabilities.includes('color_temp')) continue;
    if (d.native_min_mireds === null || d.native_max_mireds === null) {
      missing += 1;
      continue;
    }
    mins.push(d.native_min_mireds);
    maxs.push(d.native_max_mireds);
  }
  if (mins.length === 0) {
    return {
      hasData: false,
      missing,
      unionLow: null,
      unionHigh: null,
      safeMin: null,
      safeMax: null,
    };
  }
  return {
    hasData: true,
    missing,
    unionLow: Math.min(...mins),
    unionHigh: Math.max(...maxs),
    safeMin: Math.max(...mins),
    safeMax: Math.min(...maxs),
  };
}

/**
 * Identity of a rule as the user perceives it: its type AND its values.
 * Two rules with the same signature normalize their devices the exact same
 * way, so the UI paints them with the same colour; changing one value
 * produces a new signature — and a new colour — which is the point: the
 * edited device visually leaves its group.
 *
 * Returns null for `entity-rename`: its value is unique per device by
 * nature, so colouring it would yield one colour per row and group nothing.
 */
export function ruleSignature(rule: AppliedRule): string | null {
  switch (rule.type) {
    case 'color-temp-range':
      return `color-temp-range|${rule.min_mireds ?? ''}|${rule.max_mireds ?? ''}`;
    case 'brightness-range':
      return `brightness-range|${rule.max_scale ?? ''}`;
    case 'suggested-area':
      return `suggested-area|${rule.area ?? ''}`;
    default:
      return null;
  }
}

/** naive-ui NTag `color` prop shape. */
export interface TagStyle {
  color: string;
  textColor: string;
}

/**
 * Hues far enough apart to read as distinct at tag size. Signatures beyond
 * this count wrap around and reuse a hue — the legend always spells out the
 * values, so a reused colour stays disambiguable.
 */
const SIGNATURE_HUES = [172, 38, 265, 330, 205, 140, 12, 295];

/**
 * Colour for the Nth distinct rule signature, tuned per theme for contrast.
 *
 * The values must be concrete colours: naive-ui forwards them into an inline
 * custom property, and a `var()` pointing at a theme variable would be
 * substituted once and never re-resolve when the theme class changes.
 */
export function signatureStyle(index: number, dark: boolean): TagStyle {
  const hue = SIGNATURE_HUES[index % SIGNATURE_HUES.length]!;
  return dark
    ? { color: `hsl(${hue} 45% 22%)`, textColor: `hsl(${hue} 70% 78%)` }
    : { color: `hsl(${hue} 65% 91%)`, textColor: `hsl(${hue} 75% 29%)` };
}

/** Colour for rules that carry no groupable value (entity-rename). */
export function neutralTagStyle(dark: boolean): TagStyle {
  return dark
    ? { color: 'rgba(255, 255, 255, 0.10)', textColor: '#aaa' }
    : { color: 'rgba(0, 0, 0, 0.06)', textColor: '#666' };
}

/**
 * Render a rule's type-specific config as a human-readable string.
 * Labels are localized via the passed-in `t` function (callers typically
 * pass `t` from `useI18n()`).
 *
 * Example output (EN): "min 250 (4000K) · max 454 (2203K)"
 * Example output (FR): "min 250 (4000K) · max 454 (2203K)"  (min/max same)
 *
 * For suggested-area and entity-rename, the label prefix is localized
 * (EN "area: Salon" vs FR "zone : Salon").
 */
export function describeRule(rule: AppliedRule, t: TranslateFn): string {
  switch (rule.type) {
    case 'color-temp-range': {
      const parts: string[] = [];
      if (rule.min_mireds !== undefined) {
        parts.push(`${t('rules.label_min')} ${rule.min_mireds} (${miredsToKelvin(rule.min_mireds)}K)`);
      }
      if (rule.max_mireds !== undefined) {
        parts.push(`${t('rules.label_max')} ${rule.max_mireds} (${miredsToKelvin(rule.max_mireds)}K)`);
      }
      return parts.join(' · ');
    }
    case 'suggested-area':
      return `${t('rules.label_area')}: ${rule.area ?? ''}`;
    case 'entity-rename':
      return `${t('rules.label_name')}: ${rule.device_name ?? ''}`;
    case 'brightness-range':
      if (rule.max_scale === undefined) return '';
      return `${t('rules.label_max_scale')}: ${rule.max_scale} (${brightnessPercent(rule.max_scale)}%)`;
    default:
      return '';
  }
}
