// Resolves the target patterns used by transformation rules.
//
// Supported patterns:
//   "*"                       -> any device
//   "<ieee>"                  -> device by exact IEEE address (e.g. 0x18fc26...)
//   "@vendor:<name>"          -> any device of a vendor (case-insensitive)
//   "@group:<name>"           -> any device in a Z2M group (case-insensitive)
//   "@model:<model_id>"       -> any device with an exact model_id
//   "@friendlyname:<pattern>" -> match by friendly_name (case-insensitive)
//                                 - ending with "*": prefix match
//                                 - otherwise: exact equality
//                               e.g. "@friendlyname:Living*" matches "Living", "Living 1", "Living 2"

import type { Device } from '../types.js';

export function matchesTarget(device: Device, pattern: string): boolean {
  if (pattern === '*') return true;

  if (pattern.startsWith('@vendor:')) {
    const wanted = pattern.slice('@vendor:'.length).toLowerCase();
    return device.vendor.toLowerCase() === wanted;
  }

  if (pattern.startsWith('@group:')) {
    const wanted = pattern.slice('@group:'.length).toLowerCase();
    return device.groups.some((g) => g.toLowerCase() === wanted);
  }

  if (pattern.startsWith('@model:')) {
    const wanted = pattern.slice('@model:'.length);
    return device.model_id === wanted;
  }

  if (pattern.startsWith('@friendlyname:')) {
    const needle = pattern.slice('@friendlyname:'.length);
    const fnLower = device.friendly_name.toLowerCase();
    if (needle.endsWith('*')) {
      return fnLower.startsWith(needle.slice(0, -1).toLowerCase());
    }
    return fnLower === needle.toLowerCase();
  }

  // Otherwise, treat as a literal IEEE address (case-insensitive exact match)
  return device.ieee.toLowerCase() === pattern.toLowerCase();
}

export function matchesAnyTarget(device: Device, patterns: string[]): boolean {
  return patterns.some((p) => matchesTarget(device, p));
}
