import type { Device } from '../api/types';

/**
 * Tells apart Zigbee2MQTT groups (virtual entities aggregating N real
 * lights) from physical devices. Z2M sets `vendor: "Zigbee2MQTT"` for
 * every group it publishes a discovery payload for; that's the only
 * reliable signal we can rely on without inspecting the IEEE format.
 *
 * Knowing a device is a group matters because a group's targets are not
 * really "one device" — applying a per-device rule to a group affects
 * the virtual entity, not the physical bulbs underneath.
 */
export function isZ2mGroup(device: Pick<Device, 'vendor'>): boolean {
  return device.vendor === 'Zigbee2MQTT';
}
