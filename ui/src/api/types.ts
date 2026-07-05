// Mirror types of the API responses (backend side in src/api/).

export type ServiceStatus = 'online' | 'offline' | 'unknown';

export interface Health {
  status: string;
  uptime_sec: number;
  devices_count: number;
  transformers_count: number;
  mqtt: {
    connected: boolean;
    url: string;
    connected_at: number | null;
    last_reconnect_at: number | null;
    reconnect_count: number;
  };
  z2m: {
    status: ServiceStatus;
    last_update: number | null;
  };
  ha: {
    status: ServiceStatus;
    last_update: number | null;
  };
}

export interface ActivityChange {
  field: string;
  before: unknown;
  after: unknown;
}

export interface ActivityEntry {
  id: number;
  ieee: string;
  friendly_name: string;
  applied_at: number;
  changes: ActivityChange[];
}

export interface FleetStats {
  total_devices: number;
  by_vendor: Record<string, number>;
  by_capability: Record<string, number>;
  modified: number;
  rules_total: number;
}

export interface AppliedRule {
  id: number;
  type: TransformerType;
  priority: number;
  targets: string[];
  // type-specific
  min_mireds?: number;
  max_mireds?: number;
  area?: string;
  device_name?: string;
  max_scale?: number;
}

export interface Device {
  ieee: string;
  friendly_name: string;
  vendor: string;
  model: string;
  model_id: string;
  groups: string[];
  capabilities: string[];
  components: string[];
  /** Native CCT range as advertised by the device (mireds). Null = unknown. */
  native_min_mireds: number | null;
  native_max_mireds: number | null;
  last_topic: string;
  last_seen: number;
  first_seen: number;
  applied_rules: AppliedRule[];
}

export type TransformerType =
  | 'color-temp-range'
  | 'suggested-area'
  | 'entity-rename'
  | 'brightness-range';

export interface Transformer {
  id?: number;
  type: TransformerType;
  targets: string[];
  priority: number;
  enabled: boolean;
  // type-specific
  min_mireds?: number;
  max_mireds?: number;
  area?: string;
  device_name?: string;
  max_scale?: number;
  // metadata
  created_at?: number;
  updated_at?: number;
}

export interface RefreshResult {
  devices: number;
  republished: number;
}
