// The set of distinct configurations in use across a fleet, and the colour
// each one gets. Shared by the Customizations page (which lists them) and the
// Devices page (whose cards show a device's rules), so the same configuration
// is described identically wherever it shows up.

import { computed, type ComputedRef, type Ref } from 'vue';
import {
  ruleSignature,
  signatureStyle,
  neutralTagStyle,
  specificRulesFor,
  type TagStyle,
} from '../utils/rules';
import { useTheme } from './useTheme';
import type { AppliedRule, Device } from '../api/types';

export interface ConfigEntry {
  sig: string;
  index: number;
  rule: AppliedRule; // representative, for describeRule() and the type
  devices: Device[]; // every device using this exact configuration
}

interface ConfigurationsApi {
  /** One entry per distinct configuration, ordered stably. */
  list: ComputedRef<ConfigEntry[]>;
  /** Colour for a rule's tag: same values -> same colour. */
  tagStyle: (rule: AppliedRule) => TagStyle;
  /** Devices using a given signature. */
  devicesForSignature: (sig: string) => Device[];
  /** Devices sharing a rule's configuration, the rule's own device included. */
  sharedDevicesFor: (rule: AppliedRule) => Device[];
}

export function useConfigurations(devices: Ref<Device[]>): ConfigurationsApi {
  const { isDark } = useTheme();

  /**
   * Distinct signatures across the WHOLE fleet, not a filtered view, so a
   * colour keeps its meaning while a search box narrows the list. Sorted with
   * a numeric-aware comparator so "min 90" lands before "min 153" instead of
   * string-sorting; the resulting index drives the colour assignment.
   */
  const list = computed<ConfigEntry[]>(() => {
    const seen = new Map<string, { rule: AppliedRule; devices: Device[] }>();
    for (const device of devices.value) {
      for (const rule of specificRulesFor(device)) {
        const sig = ruleSignature(rule);
        if (sig === null) continue;
        const entry = seen.get(sig);
        if (entry) entry.devices.push(device);
        else seen.set(sig, { rule, devices: [device] });
      }
    }
    return [...seen.keys()]
      .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }))
      .map((sig, index) => {
        const entry = seen.get(sig)!;
        return { sig, index, rule: entry.rule, devices: entry.devices };
      });
  });

  const indexBySig = computed(() => {
    const map = new Map<string, number>();
    for (const entry of list.value) map.set(entry.sig, entry.index);
    return map;
  });

  function tagStyle(rule: AppliedRule): TagStyle {
    const sig = ruleSignature(rule);
    if (sig === null) return neutralTagStyle(isDark.value);
    const index = indexBySig.value.get(sig);
    return index === undefined ? neutralTagStyle(isDark.value) : signatureStyle(index, isDark.value);
  }

  function devicesForSignature(sig: string): Device[] {
    return list.value.find((e) => e.sig === sig)?.devices ?? [];
  }

  function sharedDevicesFor(rule: AppliedRule): Device[] {
    const sig = ruleSignature(rule);
    if (sig === null) return [];
    return devicesForSignature(sig);
  }

  return { list, tagStyle, devicesForSignature, sharedDevicesFor };
}
