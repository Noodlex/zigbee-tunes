// Shared formatting helpers for transformer rules.
// Avoids duplicating describeRule / kelvin conversion across views.

import type { AppliedRule } from '../api/types';

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
