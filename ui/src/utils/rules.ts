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
 * Colour for the Nth distinct rule signature.
 *
 * The hue is theme-independent (it encodes *which* configuration this is),
 * while saturation/lightness come from CSS custom properties set by the
 * .zt-dark / .zt-light classes. That way a theme switch is resolved by the
 * cascade — no JS theme state to keep in sync, which would go stale in a
 * component that isn't the one owning the theme preference.
 */
export function signatureStyle(index: number): TagStyle {
  const hue = SIGNATURE_HUES[index % SIGNATURE_HUES.length]!;
  return {
    color: `hsl(${hue} var(--zt-sig-bg-s) var(--zt-sig-bg-l))`,
    textColor: `hsl(${hue} var(--zt-sig-fg-s) var(--zt-sig-fg-l))`,
  };
}

/** Colour for rules that carry no groupable value (entity-rename). */
export function neutralTagStyle(): TagStyle {
  return { color: 'var(--zt-sig-neutral-bg)', textColor: 'var(--zt-sig-neutral-fg)' };
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
