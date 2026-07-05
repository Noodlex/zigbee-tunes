// Types shared across the project.

export interface Device {
  ieee: string;
  friendly_name: string;
  vendor: string;
  model: string;
  model_id: string;
  groups: string[]; // friendly_names of Z2M groups
  /**
   * Union of capabilities observed across ALL discovery topics seen for this
   * device (a device often has several HA entities, e.g. a NOUS plug publishes
   * switch + sensor power + sensor voltage, etc.).
   */
  capabilities: string[];
  /** Union of HA components seen for this device (light, sensor, switch...). */
  components: string[];
  /**
   * Native color-temperature range as advertised by the device's `light`
   * discovery payload (in mireds). `null` if the device is not CCT, or if
   * we haven't seen its discovery payload yet (e.g. it only appeared in
   * `bridge/devices` so far). Used by the UI to display "safe / permissive
   * bounds" hints when applying a color-temp-range rule.
   */
  native_min_mireds: number | null;
  native_max_mireds: number | null;
  last_topic: string; // last discovery topic seen for this device
  last_seen: number; // epoch ms
  first_seen: number; // epoch ms
}

// MQTT discovery payload. Treated as a flat object; a few fields are typed
// but the rest is passed through as-is.
export interface DiscoveryPayload {
  name?: string | null;
  unique_id?: string;
  state_topic?: string;
  command_topic?: string;
  min_mireds?: number;
  max_mireds?: number;
  brightness?: boolean;
  brightness_scale?: number;
  effect?: boolean;
  supported_color_modes?: string[];
  device?: {
    identifiers?: string[];
    manufacturer?: string;
    model?: string;
    model_id?: string;
    name?: string;
    sw_version?: string;
    hw_version?: number;
    via_device?: string;
    suggested_area?: string;
    // We allow extra fields so we don't break if HA or Z2M add new fields
    // to the device payload.
    [key: string]: unknown;
  };
  [key: string]: unknown;
}

export interface TransformContext {
  device: Device | null; // null if the device is not yet in the catalog
  topic: string;
}
