import mqtt, { type MqttClient, type IClientOptions, type IClientPublishOptions } from 'mqtt';
import type { BrokerConfig } from '../config.js';
import type { Logger } from '../logger.js';

export type MessageHandler = (topic: string, payload: Buffer) => void;

/**
 * Called after a RECONNECTION, never after the first connect. Anything a
 * listener cached about what the broker holds may be stale: the broker can
 * have died brutally and rolled its retained messages back to its last
 * autosave, while this process kept running and remembers publishing them.
 */
export type ReconnectHandler = () => void;

export class ZigbeeTunesMqttClient {
  private client: MqttClient | null = null;
  private readonly handlers: MessageHandler[] = [];
  private readonly reconnectHandlers: ReconnectHandler[] = [];
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

  /**
   * Starts the client and returns once it is wired — NOT once it is connected.
   *
   * It used to reject when the first connection attempt failed, and the caller
   * let that end the process. That is wrong on the one occasion it happens: a
   * host reboot, where the broker and this add-on start together and the
   * broker is simply not listening yet. `services: mqtt:need` guarantees a
   * broker is configured, not that it answers. Nothing restarts us, so the
   * add-on stayed down until someone noticed.
   *
   * Every later disconnection was already handled correctly — reconnectPeriod
   * retries every 5s forever. The first attempt was the lone exception; now it
   * follows the same loop.
   *
   * Returning early is also what makes a watchdog possible: the API server
   * starts after this call, and a watchdog that probes an HTTP port which
   * never opens would restart the add-on in a loop. /api/health reports
   * `degraded` while MQTT is down, which is the honest answer.
   */
  async connect(): Promise<void> {
    const opts: IClientOptions = {
      clientId: this.cfg.client_id ?? `zigbee-tunes-${Date.now()}`,
      username: this.cfg.username,
      password: this.cfg.password,
      reconnectPeriod: 5000,
      connectTimeout: 30_000,
      clean: true,
    };

    const client = mqtt.connect(this.cfg.url, opts);

    // Tells the first successful connection from the ones that follow: the
    // 'connect' event fires on every reconnect and the two mean different
    // things to anyone listening.
    let connectedOnce = false;

    // We listen for EVERY 'connect' event (not .once). On each (re)connect we
    // replay the subscriptions because with `clean: true` the broker does not
    // preserve the session.
    client.on('connect', () => {
      for (const topic of this.subscriptions) {
        client.subscribe(topic, { qos: 1 }, (err) => {
          if (err) this.logger.error('mqtt subscribe error on (re)connect', { topic, err: err.message });
        });
      }
      if (!connectedOnce) {
        connectedOnce = true;
        this._connectedAt = Date.now();
        this.logger.info('mqtt connected', { url: this.cfg.url });
      } else {
        this._lastReconnectAt = Date.now();
        this._reconnectCount++;
        this.logger.info('mqtt reconnected', { url: this.cfg.url, resubscribed: this.subscriptions.size });
        for (const h of this.reconnectHandlers) {
          try {
            h();
          } catch (err) {
            // Same contract as the message handlers: one listener throwing
            // must not take the connection down with it.
            this.logger.error('reconnect handler threw', { err: (err as Error).message });
          }
        }
      }
    });

    client.on('reconnect', () => {
      this.logger.warn('mqtt reconnecting');
    });

    // Never fatal. Bad credentials and an absent broker look the same here,
    // and both are better reported through /api/health than by exiting: one
    // is fixed in the add-on options, the other fixes itself.
    client.on('error', (err) => {
      this.logger.error('mqtt error', { err: err.message });
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

  /** Registers a listener for reconnections only — see ReconnectHandler. */
  onReconnect(handler: ReconnectHandler): void {
    this.reconnectHandlers.push(handler);
  }

  /**
   * Closes the connection, gracefully if it can and forcibly if it must.
   *
   * A graceful close waits for queued packets to reach the broker. With no
   * broker they never do, and the callback never fires — shutdown would then
   * hang before `db.close()`, waiting for a SIGKILL. That is exactly the
   * situation this client is now built to survive, so it must not be the one
   * that stops it from stopping.
   *
   * Anything dropped by a forced close is a discovery republication, rebuilt
   * from `payload_cache` on the next start.
   */
  async end(): Promise<void> {
    const client = this.client;
    if (!client) return;

    const GRACE_MS = 2000;
    await new Promise<void>((resolve) => {
      let settled = false;
      const done = () => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        resolve();
      };
      const timer = setTimeout(() => {
        this.logger.warn('mqtt did not close gracefully, forcing', { after_ms: GRACE_MS });
        client.end(true, {}, done);
        // A forced close can keep its callback to itself; do not wait on it.
        done();
      }, GRACE_MS);
      timer.unref?.();
      client.end(false, {}, done);
    });
  }
}
