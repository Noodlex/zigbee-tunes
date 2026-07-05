// Detect capabilities (= what a device can do) from MQTT Discovery
// payloads. Used:
//   - for UI filtering (chips "color_temp", "brightness", etc.)
//   - to render chips on each card
//
// Extraction is kept simple: we don't build an exhaustive ontology, just
// the ~10 capabilities useful right now.
// Adding a capability = adding a line here + a chip on the UI side.

import type { DiscoveryPayload } from '../types.js';

export type Capability =
  | 'on_off'
  | 'brightness'
  | 'color_temp'
  | 'color'
  | 'effect'
  | 'binary_state'
  | 'sensor'
  | 'switch'
  | 'cover'
  | 'climate';

/**
 * Extracts capabilities from a discovery payload, taking the HA component
 * (`light`, `switch`, `binary_sensor`, `sensor`, ...) into account.
 */
export function extractCapabilities(component: string, payload: DiscoveryPayload): Capability[] {
  const caps = new Set<Capability>();

  // Capabilities derived from explicit payload fields
  if (payload.brightness === true) caps.add('brightness');
  if (typeof payload.min_mireds === 'number' || typeof payload.max_mireds === 'number') {
    caps.add('color_temp');
  }
  if (Array.isArray(payload.supported_color_modes)) {
    for (const mode of payload.supported_color_modes) {
      if (mode === 'color_temp') caps.add('color_temp');
      if (mode === 'xy' || mode === 'rgb' || mode === 'hs' || mode === 'rgbw' || mode === 'rgbww') {
        caps.add('color');
      }
    }
  }
  if (payload.effect === true) caps.add('effect');

  // Capabilities inferred from the HA component
  switch (component) {
    case 'light':
      caps.add('on_off');
      break;
    case 'switch':
      caps.add('on_off');
      caps.add('switch');
      break;
    case 'binary_sensor':
      caps.add('binary_state');
      break;
    case 'sensor':
      caps.add('sensor');
      break;
    case 'cover':
      caps.add('cover');
      break;
    case 'climate':
      caps.add('climate');
      break;
  }

  return Array.from(caps).sort();
}

/** Union of two capability lists (no duplicates, sorted). */
export function unionCapabilities(a: readonly string[], b: readonly string[]): string[] {
  return Array.from(new Set([...a, ...b])).sort();
}
