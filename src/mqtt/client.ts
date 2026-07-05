import mqtt, { type MqttClient, type IClientOptions, type IClientPublishOptions } from 'mqtt';
import type { BrokerConfig } from '../config.js';
import type { Logger } from '../logger.js';

export type MessageHandler = (topic: string, payload: Buffer) => void;

export class ZigbeeTunesMqttClient {
  private client: MqttClient | null = null;
  private readonly handlers: MessageHandler[] = [];
  private readonly subscriptions = new Set<string>();
  private _connectedAt: number | null = null;
  private _lastReconnectAt: number | null = null;
  private _reconnectCount = 0;

  constructor(private readonly cfg: BrokerConfig, private readonly logger: Logger) {}

  /** Whether the MQTT client is currently connected to the broker. */
  get isConnected(): boolean {
    return this.client?.connected ?? false;
  }

  /** Timestamp (ms) of the FIRST successful connection (null if never connected). */
  get connectedAt(): number | null {
    return this._connectedAt;
  }

  /** Timestamp (ms) of the last reconnection (null if never reconnected). */
  get lastReconnectAt(): number | null {
    return this._lastReconnectAt;
  }

  /** Number of reconnections since startup (excluding the initial connection). */
  get reconnectCount(): number {
    return this._reconnectCount;
  }

  /** Broker URL (for UI display). */
  get url(): string {
    return this.cfg.url;
  }

  async connect(): Promise<void> {
    const opts: IClientOptions = {
      clientId: this.cfg.client_id ?? `zigbee-tunes-${Date.now()}`,
      username: this.cfg.username,
      password: this.cfg.password,
      reconnectPeriod: 5000,
      connectTimeout: 30_000,
      clean: true,
    };

    return new Promise((resolve, reject) => {
      const client = mqtt.connect(this.cfg.url, opts);

      // Flag to ensure the initial Promise is resolved/rejected only once.
      // 'connect' and 'error' can fire several times during the client
      // lifecycle (auto reconnects, intermittent network errors).
      let firstResolved = false;

      // We listen for EVERY 'connect' event (not .once). On each
      // (re)connect we replay the subscriptions because with `clean: true`
      // the broker does not preserve the session.
      client.on('connect', () => {
        for (const topic of this.subscriptions) {
          client.subscribe(topic, { qos: 1 }, (err) => {
            if (err) this.logger.error('mqtt subscribe error on (re)connect', { topic, err: err.message });
          });
        }
        if (!firstResolved) {
          firstResolved = true;
          this._connectedAt = Date.now();
          this.logger.info('mqtt connected', { url: this.cfg.url });
          resolve();
        } else {
          this._lastReconnectAt = Date.now();
          this._reconnectCount++;
          this.logger.info('mqtt reconnected', { url: this.cfg.url, resubscribed: this.subscriptions.size });
        }
      });

      client.on('reconnect', () => {
        this.logger.warn('mqtt reconnecting');
      });

      client.on('error', (err) => {
        this.logger.error('mqtt error', { err: err.message });
        // If we never managed to connect, this is a fatal error (typically
        // bad credentials or an invalid URL) -> reject once.
        if (!firstResolved) {
          firstResolved = true;
          reject(err);
        }
      });

      client.on('close', () => {
        this.logger.warn('mqtt connection closed');
      });

      client.on('message', (topic, payload) => {
        for (const h of this.handlers) {
          try {
            h(topic, payload);
          } catch (err) {
            this.logger.error('handler threw', { topic, err: (err as Error).message });
          }
        }
      });

      this.client = client;
    });
  }

  subscribe(topic: string): void {
    this.subscriptions.add(topic);
    if (!this.client) throw new Error('mqtt client not connected');
    this.client.subscribe(topic, { qos: 1 }, (err) => {
      if (err) this.logger.error('mqtt subscribe error', { topic, err: err.message });
      else this.logger.info('mqtt subscribed', { topic });
    });
  }

  publish(topic: string, payload: string | Buffer, opts: IClientPublishOptions = {}): void {
    if (!this.client) throw new Error('mqtt client not connected');
    this.client.publish(topic, payload, { qos: 1, retain: false, ...opts }, (err) => {
      if (err) this.logger.error('mqtt publish error', { topic, err: err.message });
    });
  }

  onMessage(handler: MessageHandler): void {
    this.handlers.push(handler);
  }

  async end(): Promise<void> {
    if (!this.client) return;
    return new Promise((resolve) => {
      this.client!.end(false, {}, () => resolve());
    });
  }
}
