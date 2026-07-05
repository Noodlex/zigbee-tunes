import type { DiscoveryPayload, Device } from '../types.js';
import type { DeviceRepository } from '../db/repositories/devices.js';
import type { Logger } from '../logger.js';
import { extractCapabilities, unionCapabilities } from './capabilities.js';
import { parseDiscoveryTopic } from '../mqtt/topics.js';

/**
 * Simplified representation of one entry of the zigbee2mqtt/bridge/devices array.
 * Unused fields are omitted (the Z2M payload contains many more).
 */
export interface Z2MBridgeDeviceEntry {
  ieee_address: string;
  friendly_name: string;
  manufacturer?: string;
  model_id?: string;
  definition?: {
    vendor?: string;
    model?: string;
  };
  groups?: Array<{ id?: number; friendly_name?: string }> | undefined;
}

/** Simplified entry of the zigbee2mqtt/bridge/groups array. */
export interface Z2MBridgeGroupEntry {
  id: number;
  friendly_name?: string;
}

/**
 * Z2M encodes the discovery topic id of a group as the concatenated char
 * codes of the base topic, followed by `_<group id>`. Example with base
 * topic "zigbee2mqtt" and group 4:
 *   "1221051039810110150109113116116_4"
 * (122='z', 105='i', 103='g', ...). This is how we map a bridge/groups
 * entry to its catalog key.
 */
export function encodeGroupDiscoveryId(baseTopic: string, groupId: number): string {
  const encoded = Array.from(baseTopic, (c) => c.charCodeAt(0)).join('');
  return `${encoded}_${groupId}`;
}

/**
 * The catalog keeps known devices in memory and syncs them to the DB.
 * Source of metadata for the targets matcher.
 */
export class DeviceCatalog {
  private readonly inMemory = new Map<string, Device>();

  /**
   * Devices we have actually seen at least once in a `bridge/devices`
   * payload. Only these can be considered "removed" when they disappear
   * from a later payload. Avoids falsely flagging as removed devices
   * reloaded from the DB but not yet seen in the current bridge/devices
   * (case of a partial Z2M startup).
   */
  private readonly everSeenInBridge = new Set<string>();

  constructor(private readonly repo: DeviceRepository, private readonly logger: Logger) {
    // Load from the DB on startup (state preserved across restarts).
    // We DO NOT populate everSeenInBridge here: until we confirm a device
    // is in the current bridge/devices, we cannot know whether it is
    // still around or was removed while we were down.
    for (const d of repo.findAll()) {
      this.inMemory.set(d.ieee, d);
    }
    this.logger.info('device catalog loaded from db', { count: this.inMemory.size });
  }

  get(ieee: string): Device | null {
    return this.inMemory.get(ieee) ?? null;
  }

  /**
   * Updates the catalog from an observed discovery payload.
   * The payload contains device.manufacturer and device.model_id which we
   * can extract without waiting for bridge/devices.
   */
  upsertFromDiscovery(ieee: string, topic: string, payload: DiscoveryPayload, rawPayload: string): Device {
    const now = Date.now();
    const existing = this.inMemory.get(ieee);

    const friendly_name =
      typeof payload.device?.name === 'string' && payload.device.name.length > 0
        ? payload.device.name
        : existing?.friendly_name ?? ieee;

    // Extract capabilities from this payload, union with the ones already
    // observed (a device often has several HA entities — light + sensor
    // power + sensor voltage, etc. — each publishing its own discovery).
    const parsedTopic = parseDiscoveryTopic(topic);
    const component = parsedTopic?.component ?? '';
    const newCaps = extractCapabilities(component, payload);
    const allCaps = unionCapabilities(existing?.capabilities ?? [], newCaps);
    const allComponents = component
      ? unionCapabilities(existing?.components ?? [], [component])
      : (existing?.components ?? []);

    // Native CCT range: keep what we already know unless the new payload
    // contains explicit values. A non-CCT discovery (e.g. a sensor entity
    // of the same device) must not erase the range learned earlier from
    // the `light` entity.
    const newMin = typeof payload.min_mireds === 'number' ? payload.min_mireds : null;
    const newMax = typeof payload.max_mireds === 'number' ? payload.max_mireds : null;
    const native_min_mireds = newMin ?? existing?.native_min_mireds ?? null;
    const native_max_mireds = newMax ?? existing?.native_max_mireds ?? null;

    const device: Device = {
      ieee,
      friendly_name,
      vendor: payload.device?.manufacturer ?? existing?.vendor ?? '',
      model: payload.device?.model ?? existing?.model ?? '',
      model_id: payload.device?.model_id ?? existing?.model_id ?? '',
      groups: existing?.groups ?? [], // groups come from bridge/devices
      capabilities: allCaps,
      components: allComponents,
      native_min_mireds,
      native_max_mireds,
      last_topic: topic,
      last_seen: now,
      first_seen: existing?.first_seen ?? now,
    };

    this.inMemory.set(ieee, device);
    this.repo.upsert(device, rawPayload);
    // Per-topic cache: refresh() replays EVERY topic of a device, so a
    // rule change reaches the light config even when a sensor entity of
    // the same device arrived last.
    this.repo.upsertPayload(ieee, topic, rawPayload);
    return device;
  }

  /**
   * Called when an empty retained payload arrives on a discovery topic
   * (Z2M's way of removing an entity). Drops the topic from the cache and
   * recomputes the device's capabilities from the remaining cached
   * payloads, so a removed entity stops contributing capability tags.
   */
  handleTopicCleared(topic: string): void {
    if (!this.repo.deletePayloadByTopic(topic)) return;
    const parsedTopic = parseDiscoveryTopic(topic);
    if (!parsedTopic) return;
    const device = this.inMemory.get(parsedTopic.id);
    if (!device) return;

    let caps: string[] = [];
    let components: string[] = [];
    for (const { topic: t, payload } of this.repo.findPayloadsByIeee(device.ieee)) {
      const p = parseDiscoveryTopic(t);
      if (!p) continue;
      try {
        const parsed = JSON.parse(payload) as DiscoveryPayload;
        caps = unionCapabilities(caps, extractCapabilities(p.component, parsed));
        components = unionCapabilities(components, [p.component]);
      } catch {
        // ignore unparseable cached rows
      }
    }
    device.capabilities = caps;
    device.components = components;
    this.repo.updateCapabilities(device.ieee, caps, components);
  }

  /**
   * Syncs the group lifecycle from bridge/groups (authoritative, retained).
   * Catalog entries that look like groups (id not starting with "0x") and
   * are absent from the current list are stale — typically a group deleted
   * in Z2M, which bridge/devices-based removal can never catch because
   * groups are not listed there. Returns the removed entries with their
   * cached topics so the proxy can clear the retained target configs.
   */
  syncFromBridgeGroups(
    entries: Z2MBridgeGroupEntry[],
    z2mBaseTopic: string,
  ): Array<{ ieee: string; topics: string[] }> {
    const expected = new Set(
      entries.filter((e) => typeof e.id === 'number').map((e) => encodeGroupDiscoveryId(z2mBaseTopic, e.id)),
    );

    const removed: Array<{ ieee: string; topics: string[] }> = [];
    for (const ieee of Array.from(this.inMemory.keys())) {
      if (ieee.startsWith('0x')) continue; // real device, handled via bridge/devices
      if (expected.has(ieee)) continue;
      const r = this.remove(ieee);
      removed.push({ ieee, topics: r?.topics ?? [] });
    }
    return removed;
  }

  /**
   * Syncs group memberships from bridge/devices.
   * Returns IEEEs that appeared (new) and ones that disappeared.
   *
   * For removals: we only flag as `removed` devices we have already seen
   * at least once in a bridge/devices payload (`everSeenInBridge`). This
   * avoids false removals at boot if Z2M publishes a partial
   * bridge/devices during its startup, or if the DB still has devices
   * from an older session.
   */
  syncFromBridgeDevices(entries: Z2MBridgeDeviceEntry[]): { added: string[]; removed: string[] } {
    const seenIeees = new Set<string>();
    const added: string[] = [];

    for (const e of entries) {
      // Skip the coordinator and other entries without a normal ieee_address.
      if (!e.ieee_address || !e.ieee_address.startsWith('0x')) continue;

      seenIeees.add(e.ieee_address);
      this.everSeenInBridge.add(e.ieee_address);

      const groups = (e.groups ?? [])
        .map((g) => g.friendly_name)
        .filter((n): n is string => typeof n === 'string' && n.length > 0);

      const existing = this.inMemory.get(e.ieee_address);
      if (existing) {
        existing.groups = groups;
        this.repo.updateGroups(e.ieee_address, groups);
      } else {
        // Device not yet seen via discovery — pre-register a minimal entry
        // so @group rules can match if a discovery arrives later.
        const now = Date.now();
        const device: Device = {
          ieee: e.ieee_address,
          friendly_name: e.friendly_name ?? e.ieee_address,
          vendor: e.definition?.vendor ?? e.manufacturer ?? '',
          model: e.definition?.model ?? '',
          model_id: e.model_id ?? '',
          groups,
          capabilities: [],
          components: [],
          native_min_mireds: null,
          native_max_mireds: null,
          last_topic: '',
          last_seen: now,
          first_seen: now,
        };
        this.inMemory.set(e.ieee_address, device);
        this.repo.upsert(device, '{}');
        added.push(e.ieee_address);
      }
    }

    // Removal detection: only among devices we have CONFIRMED present in
    // bridge/devices at least once.
    const removed: string[] = [];
    for (const ieee of this.everSeenInBridge) {
      if (!seenIeees.has(ieee)) {
        removed.push(ieee);
      }
    }

    return { added, removed };
  }

  /** Lists all known devices (in-memory snapshot). */
  all(): Device[] {
    return Array.from(this.inMemory.values());
  }

  /**
   * Returns every cached discovery payload, one entry PER TOPIC (a device
   * usually has several discovery topics: light + update sensor + power
   * sensor...). Used by refresh: replays the pipeline on cached payloads
   * without waiting for Z2M to publish again.
   */
  allWithCachedPayloads(): Array<{ device: Device; topic: string; payload: DiscoveryPayload }> {
    const result: Array<{ device: Device; topic: string; payload: DiscoveryPayload }> = [];
    for (const { ieee, topic, payload } of this.repo.findAllPayloads()) {
      const device = this.inMemory.get(ieee);
      if (!device) continue; // stale cache row for a device no longer known
      if (payload === '' || payload === '{}') continue;
      try {
        result.push({ device, topic, payload: JSON.parse(payload) as DiscoveryPayload });
      } catch {
        this.logger.warn('cached payload not JSON, skipping', { ieee, topic });
      }
    }
    return result;
  }

  /**
   * Removes a device from the catalog and returns ALL its cached topics so
   * the caller can clear every retained target config (not just the last
   * seen one).
   */
  remove(ieee: string): { topics: string[] } | null {
    const device = this.inMemory.get(ieee);
    if (!device) return null;
    this.inMemory.delete(ieee);
    this.everSeenInBridge.delete(ieee);
    const topics = new Set(this.repo.deletePayloadsByIeee(ieee));
    const dbResult = this.repo.delete(ieee);
    if (dbResult?.last_topic) topics.add(dbResult.last_topic);
    else if (device.last_topic) topics.add(device.last_topic);
    return { topics: Array.from(topics).filter((t) => t.length > 0) };
  }
}
