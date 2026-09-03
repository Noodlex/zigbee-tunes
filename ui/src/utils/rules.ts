// Shared formatting helpers for transformer rules.
// Avoids duplicating describeRule / kelvin conversion across views.

import type { AppliedRule, Device } from '../api/types';

/** Minimal `t` shape required by describeRule, so we don't need to import vue-i18n here. */
export type TranslateFn = (key: string, params?: Record<string, unknown>) => string;

/** Convert mireds to kelvin (kelvin = 1_000_000 / mireds). */
export function miredsToKelvin(mireds: number): number {
  return Math.round(1_000_000 / mireds);
}

/** Zigbee brightness scale bounds. 254 is the native maximum, i.e. "no limit". */
export const BRIGHTNESS_SCALE_MIN = 1;
export const BRIGHTNESS_SCALE_MAX = 254;

/** Convert a brightness scale (1..254) to a 0..100 percentage. */
export function brightnessPercent(scale: number): number {
  return Math.round((scale / BRIGHTNESS_SCALE_MAX) * 100);
}

/**
 * A colour-temperature rule must not invert its bounds: min above max leaves
 * Home Assistant with an empty window, so the editors refuse to save it.
 * Either bound alone is fine — a rule can clamp one side only.
 */
export function isRangeOrdered(min: number | null, max: number | null): boolean {
  if (min === null || max === null) return true;
  return min <= max;
}

/**
 * Rules that target this device EXPLICITLY by its IEEE, as opposed to
 * matching it through `*`, `@vendor:` and friends. Those are the ones the UI
 * treats as belonging to the device: a global rule is fleet-wide default
 * behaviour and isn't flagged on each device it happens to cover.
 */
export function specificRulesFor(device: Device): AppliedRule[] {
  const ieee = device.ieee.toLowerCase();
  return device.applied_rules.filter((r) => r.targets.some((t) => t.toLowerCase() === ieee));
}

export interface CctRangeStats {
  /** False when no selected device advertises a native CCT range. */
  hasData: boolean;
  /**
   * False when the devices have no overlap at all (a cool-only bulb next to a
   * warm-only one): `safeMin` then sits ABOVE `safeMax` and no value can
   * satisfy everyone, so callers must not present it as a usable range.
   */
  hasSafeZone: boolean;
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
      hasSafeZone: false,
      missing,
      unionLow: null,
      unionHigh: null,
      safeMin: null,
      safeMax: null,
    };
  }
  const safeMin = Math.max(...mins);
  const safeMax = Math.min(...maxs);
  return {
    hasData: true,
    hasSafeZone: safeMin <= safeMax,
    missing,
    unionLow: Math.min(...mins),
    unionHigh: Math.max(...maxs),
    safeMin,
    safeMax,
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
/**
 * Just the parts a signature is made of. Widened from AppliedRule so an
 * editor can ask "what would these values be a signature for?" before any
 * rule exists to carry them.
 */
export type RuleValues = Pick<
  AppliedRule,
  'type' | 'min_mireds' | 'max_mireds' | 'area' | 'max_scale'
>;

export function ruleSignature(rule: RuleValues): string | null {
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

/**
 * The capability a rule type needs to mean anything on a device, or null when
 * it applies to any of them. Offering to put a contact sensor on a
 * colour-temperature configuration would be offering a no-op.
 */
export function capabilityForRuleType(type: string): string | null {
  switch (type) {
    case 'color-temp-range':
      return 'color_temp';
    case 'brightness-range':
      return 'brightness';
    default:
      return null;
  }
}

/** Priority `/api/devices/apply` gives the rule it creates. */
export const APPLY_PRIORITY = 50;

/** A device that already has a configuration of this type, and which one. */
export interface ElsewhereEntry {
  device: Device;
  /** The rule it would leave — shown so the move is not silent. */
  rule: AppliedRule;
}

export interface AssignmentBuckets {
  /** Already on this exact configuration. */
  assigned: Device[];
  /** On a different configuration of the same type: adding them is a move. */
  elsewhere: ElsewhereEntry[];
  /** Eligible, but with no configuration of this type at all. */
  unassigned: Device[];
  /**
   * Governed by a broader rule (`*`, `@vendor:`…) that outranks what an
   * assignment would create, so assigning them would change nothing. Listed
   * apart rather than offered: a tick that silently does nothing is worse
   * than a device that isn't on the list.
   */
  blocked: ElsewhereEntry[];
}

/**
 * Splits a fleet by its relationship to one configuration, so the editor can
 * say who is already on it, who would be moved onto it, and who is simply
 * available.
 *
 * `sig` is the target configuration's signature (type + values). Devices are
 * matched on their EXPLICIT rules only — see `specificRulesFor`: a device
 * covered by a fleet-wide `*` rule has no configuration of its own, so it
 * belongs in `unassigned` rather than looking as if it were already placed.
 */
export function assignmentBuckets(
  fleet: Device[],
  type: string,
  sig: string,
): AssignmentBuckets {
  const capability = capabilityForRuleType(type);
  const buckets: AssignmentBuckets = {
    assigned: [],
    elsewhere: [],
    unassigned: [],
    blocked: [],
  };

  for (const device of fleet) {
    // A device advertising nothing (the Coordinator, an entry seen only through
    // bridge/devices) cannot be acted on at all — the Devices view hides those
    // for the same reason. This also covers the rule types no capability gates.
    if (device.capabilities.length === 0) continue;
    if (capability !== null && !device.capabilities.includes(capability)) continue;

    const own = specificRulesFor(device).filter((r) => r.type === type);
    // Destructured rather than length-checked: it proves to the compiler that
    // the rule handed to `elsewhere` exists, without an assertion.
    const [first] = own;
    if (first !== undefined) {
      const here = own.find((r) => ruleSignature(r) === sig);
      if (here) buckets.assigned.push(device);
      else buckets.elsewhere.push({ device, rule: first });
      continue;
    }

    /*
     * No rule of its own. It may still be governed by a broader one, and
     * `applied_rules` holds the winner for each type. Assignment creates a
     * rule at APPLY_PRIORITY, and resolution keeps the incumbent on a tie
     * (the comparison is a strict `>`), so it only takes effect against a
     * strictly lower priority. Anything else would be an inert tick.
     */
    const governing = device.applied_rules.find((r) => r.type === type);
    if (governing !== undefined && governing.priority >= APPLY_PRIORITY) {
      buckets.blocked.push({ device, rule: governing });
    } else {
      buckets.unassigned.push(device);
    }
  }

  return buckets;
}
