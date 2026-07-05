// Tracks the connection state of external services (Z2M, HA) by listening
// to their public availability topics:
//   - Z2M:                zigbee2mqtt/bridge/state
//                         payload is either the raw string "online"/"offline"
//                         (Z2M <2.x) or JSON {"state": "online"|"offline"}
//                         (Z2M 2.x+). We handle both.
//   - Home Assistant:     homeassistant/status
//                         payload is the raw string "online"/"offline".
//
// Retention differs between the two:
//   - Z2M's bridge/state is RETAINED (+ LWT) — we learn the current state
//     as soon as we subscribe.
//   - HA's status is NOT retained: HA only publishes on startup/shutdown.
//     If we start while HA is already up we stay "unknown" until HA's next
//     restart. The UI tooltip explains this to the user.

export type ServiceStatus = 'online' | 'offline' | 'unknown';

export interface ConnectionStatusSnapshot {
  z2m: ServiceStatus;
  z2m_last_update: number | null;
  ha: ServiceStatus;
  ha_last_update: number | null;
}

export class ConnectionStatusTracker {
  private z2m: ServiceStatus = 'unknown';
  private z2mLastUpdate: number | null = null;
  private ha: ServiceStatus = 'unknown';
  private haLastUpdate: number | null = null;

  /** Z2M payload is JSON {"state":"online"} in 2.x, plain string in 1.x. */
  updateZ2m(payload: Buffer): void {
    const text = payload.toString().trim();
    let state: string | undefined;
    try {
      const parsed = JSON.parse(text) as { state?: unknown };
      state = typeof parsed.state === 'string' ? parsed.state : undefined;
    } catch {
      state = text;
    }
    if (state === 'online' || state === 'offline') {
      this.z2m = state;
      this.z2mLastUpdate = Date.now();
    }
  }

  /** HA payload is just "online" / "offline" as a plain string. */
  updateHa(payload: Buffer): void {
    const text = payload.toString().trim();
    if (text === 'online' || text === 'offline') {
      this.ha = text;
      this.haLastUpdate = Date.now();
    }
  }

  snapshot(): ConnectionStatusSnapshot {
    return {
      z2m: this.z2m,
      z2m_last_update: this.z2mLastUpdate,
      ha: this.ha,
      ha_last_update: this.haLastUpdate,
    };
  }
}
