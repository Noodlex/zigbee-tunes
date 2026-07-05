import type { Config } from './config.js';
import type { Logger } from './logger.js';
import type { ZigbeeTunesMqttClient } from './mqtt/client.js';
import type { DeviceCatalog, Z2MBridgeDeviceEntry, Z2MBridgeGroupEntry } from './devices/catalog.js';
import type { DeviceRepository } from './db/repositories/devices.js';
import type { TransformerRuntime } from './transformers/runtime.js';
import type { ConnectionStatusTracker } from './services/connection-status.js';
import { parseDiscoveryTopic, retargetTopic } from './mqtt/topics.js';
import { cleanupRemovedDevice } from './devices/cleanup.js';
import type { DiscoveryPayload } from './types.js';

/**
 * Main orchestrator: wires the MQTT / catalog / pipeline pieces together.
 *
 * Flow:
 *   - Subscribes to <source>/+/+/+/config        (discovery payloads to transform)
 *   - Subscribes to <z2m_base>/bridge/devices    (catalog + removal detection)
 *   - On each discovery message: update catalog, run pipeline, republish
 *   - On each bridge/devices update: sync groups + clean up removed devices
 *
 * The pipeline is fetched via runtime.current() on each message, which allows
 * hot-swapping rules via the API without restarting Zigbee Tunes.
 */
export class Proxy {
  private readonly discoverySub: string;
  private readonly bridgeDevicesSub: string;
  private readonly bridgeGroupsSub: string;
  private readonly z2mStateSub: string;
  private readonly haStatusSub: string;
  private readonly lastPublishedByTopic = new Map<string, string>(); // anti-loop

  constructor(
    private readonly cfg: Config,
    private readonly mqtt: ZigbeeTunesMqttClient,
    private readonly catalog: DeviceCatalog,
    private readonly repo: DeviceRepository,
    private readonly runtime: TransformerRuntime,
    private readonly connectionStatus: ConnectionStatusTracker,
    private readonly logger: Logger,
  ) {
    this.discoverySub = `${cfg.topics.source}/+/+/+/config`;
    this.bridgeDevicesSub = `${cfg.topics.z2m_base}/bridge/devices`;
    this.bridgeGroupsSub = `${cfg.topics.z2m_base}/bridge/groups`;
    this.z2mStateSub = `${cfg.topics.z2m_base}/bridge/state`;
    this.haStatusSub = `${cfg.topics.target}/status`;
  }

  start(): void {
    this.mqtt.onMessage((topic, payload) => this.handleMessage(topic, payload));
    this.mqtt.subscribe(this.bridgeDevicesSub);
    this.mqtt.subscribe(this.bridgeGroupsSub);
    this.mqtt.subscribe(this.discoverySub);
    this.mqtt.subscribe(this.z2mStateSub);
    this.mqtt.subscribe(this.haStatusSub);
    this.logger.info('proxy started', {
      source: this.cfg.topics.source,
      target: this.cfg.topics.target,
    });
  }

  /**
   * Replays all cached payloads through the current pipeline and republishes.
   * Called by the API after a rule change to propagate updates without waiting
   * for Z2M to publish again.
   */
  refresh(): { devices: number; republished: number } {
    const cached = this.catalog.allWithCachedPayloads();
    const seenDevices = new Set<string>();
    let republished = 0;
    for (const { device, topic, payload } of cached) {
      seenDevices.add(device.ieee);
      const transformed = this.runtime.current().apply(payload, { device, topic });
      const newTopic = retargetTopic(topic, this.cfg.topics.source, this.cfg.topics.target);
      const serialized = JSON.stringify(transformed);
      if (this.lastPublishedByTopic.get(newTopic) === serialized) continue;
      this.lastPublishedByTopic.set(newTopic, serialized);
      this.mqtt.publish(newTopic, serialized, { retain: true, qos: 1 });
      // Only log when the pipeline actually changed something — otherwise
      // the activity table fills up with no-op rows.
      if (serialized !== JSON.stringify(payload)) {
        this.repo.logTransformation(device.ieee, topic, payload, transformed);
      }
      republished++;
    }
    this.logger.info('refresh completed', { devices: seenDevices.size, topics: cached.length, republished });
    return { devices: seenDevices.size, republished };
  }

  private handleMessage(topic: string, payload: Buffer): void {
    if (topic === this.z2mStateSub) {
      this.connectionStatus.updateZ2m(payload);
      return;
    }
    if (topic === this.haStatusSub) {
      this.connectionStatus.updateHa(payload);
      return;
    }
    if (topic === this.bridgeDevicesSub) {
      this.handleBridgeDevices(payload);
      return;
    }
    if (topic === this.bridgeGroupsSub) {
      this.handleBridgeGroups(payload);
      return;
    }
    if (topic.startsWith(`${this.cfg.topics.source}/`) && topic.endsWith('/config')) {
      this.handleDiscovery(topic, payload);
      return;
    }
  }

  private handleBridgeDevices(payload: Buffer): void {
    let entries: Z2MBridgeDeviceEntry[];
    try {
      const parsed = JSON.parse(payload.toString());
      if (!Array.isArray(parsed)) throw new Error('bridge/devices payload is not an array');
      entries = parsed as Z2MBridgeDeviceEntry[];
    } catch (err) {
      this.logger.error('bridge/devices parse error', { err: (err as Error).message });
      return;
    }

    const { added, removed } = this.catalog.syncFromBridgeDevices(entries);
    if (added.length > 0) this.logger.info('devices added', { count: added.length, ieees: added });
    if (removed.length > 0) {
      this.logger.info('devices removed', { count: removed.length, ieees: removed });
      for (const ieee of removed) {
        const r = this.catalog.remove(ieee);
        if (r) this.clearRetainedTopics(r.topics);
      }
    }
  }

  /**
   * bridge/groups is the authoritative (retained) list of Z2M groups.
   * Groups never appear in bridge/devices, so without this their catalog
   * entries would survive group deletion forever.
   */
  private handleBridgeGroups(payload: Buffer): void {
    let entries: Z2MBridgeGroupEntry[];
    try {
      const parsed = JSON.parse(payload.toString());
      if (!Array.isArray(parsed)) throw new Error('bridge/groups payload is not an array');
      entries = parsed as Z2MBridgeGroupEntry[];
    } catch (err) {
      this.logger.error('bridge/groups parse error', { err: (err as Error).message });
      return;
    }

    const removed = this.catalog.syncFromBridgeGroups(entries, this.cfg.topics.z2m_base);
    for (const { ieee, topics } of removed) {
      this.logger.info('group removed', { id: ieee });
      this.clearRetainedTopics(topics);
    }
  }

  /** Publishes empty retained payloads on the target side and drops the anti-loop entries. */
  private clearRetainedTopics(sourceTopics: string[]): void {
    const cleared = cleanupRemovedDevice(
      sourceTopics,
      this.cfg.topics.source,
      this.cfg.topics.target,
      this.mqtt,
      this.logger,
    );
    for (const t of cleared) this.lastPublishedByTopic.delete(t);
  }

  private handleDiscovery(topic: string, payloadBuf: Buffer): void {
    if (payloadBuf.length === 0) {
      const targetTopic = retargetTopic(topic, this.cfg.topics.source, this.cfg.topics.target);
      this.mqtt.publish(targetTopic, '', { retain: true, qos: 1 });
      this.lastPublishedByTopic.delete(targetTopic);
      // Drop the cached payload and recompute the device's capabilities —
      // an entity that no longer exists must stop contributing tags.
      this.catalog.handleTopicCleared(topic);
      this.logger.debug('discovery cleanup relayed', { topic: targetTopic });
      return;
    }

    let payload: DiscoveryPayload;
    try {
      payload = JSON.parse(payloadBuf.toString()) as DiscoveryPayload;
    } catch (err) {
      this.logger.warn('discovery payload not JSON', { topic, err: (err as Error).message });
      return;
    }

    const parsed = parseDiscoveryTopic(topic);
    if (!parsed) {
      this.logger.warn('discovery topic structure unexpected', { topic });
      return;
    }
    const ieee = parsed.id;

    const device = this.catalog.upsertFromDiscovery(ieee, topic, payload, payloadBuf.toString());

    const transformed = this.runtime.current().apply(payload, { device, topic });
    const serialized = JSON.stringify(transformed);

    const targetTopic = retargetTopic(topic, this.cfg.topics.source, this.cfg.topics.target);

    if (this.lastPublishedByTopic.get(targetTopic) === serialized) return;
    this.lastPublishedByTopic.set(targetTopic, serialized);

    this.mqtt.publish(targetTopic, serialized, { retain: true, qos: 1 });
    // Only log real changes: an untouched relay would fill the activity
    // table with no-op rows (one per entity on every Z2M restart).
    if (serialized !== JSON.stringify(payload)) {
      this.repo.logTransformation(ieee, topic, payload, transformed);
    }

    if (
      this.logger.level === 'debug' ||
      payload.min_mireds !== transformed.min_mireds ||
      payload.max_mireds !== transformed.max_mireds
    ) {
      this.logger.info('discovery transformed', {
        device: device.friendly_name,
        mireds_before: `${payload.min_mireds}-${payload.max_mireds}`,
        mireds_after: `${transformed.min_mireds}-${transformed.max_mireds}`,
      });
    }
  }
}
