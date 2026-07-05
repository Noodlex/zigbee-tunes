import { describe, it, expect } from 'vitest';
import { BrightnessRangeTransformer } from '../../src/transformers/brightness-range.js';
import type { Device, DiscoveryPayload } from '../../src/types.js';

const device: Device = {
  ieee: '0xbbb',
  friendly_name: 'test',
  vendor: 'Innr',
  model: '',
  model_id: 'RS 227 T',
  groups: [],
  capabilities: ['brightness', 'on_off'],
  components: ['light'],
  native_min_mireds: null,
  native_max_mireds: null,
  last_topic: '',
  last_seen: 0,
  first_seen: 0,
};

const ctx = { device, topic: '' };

describe('BrightnessRangeTransformer', () => {
  it('caps brightness_scale to max_scale', () => {
    const t = new BrightnessRangeTransformer({
      type: 'brightness-range',
      targets: ['*'],
      priority: 10,
      max_scale: 127,
    });
    const payload: DiscoveryPayload = { brightness: true, brightness_scale: 254 };
    const out = t.apply(payload, ctx);
    expect(out.brightness_scale).toBe(127);
  });

  it('does not raise brightness_scale (only caps)', () => {
    const t = new BrightnessRangeTransformer({
      type: 'brightness-range',
      targets: ['*'],
      priority: 10,
      max_scale: 254,
    });
    const payload: DiscoveryPayload = { brightness: true, brightness_scale: 100 };
    const out = t.apply(payload, ctx);
    expect(out.brightness_scale).toBe(100);
  });

  it('is no-op on payload without brightness_scale', () => {
    const t = new BrightnessRangeTransformer({
      type: 'brightness-range',
      targets: ['*'],
      priority: 10,
      max_scale: 127,
    });
    const payload: DiscoveryPayload = { name: 'sensor' };
    const out = t.apply(payload, ctx);
    expect(out).toBe(payload);
  });

  it('is no-op when max_scale missing', () => {
    const t = new BrightnessRangeTransformer({
      type: 'brightness-range',
      targets: ['*'],
      priority: 10,
    });
    const payload: DiscoveryPayload = { brightness_scale: 254 };
    const out = t.apply(payload, ctx);
    expect(out).toBe(payload);
  });

  it('respects target matching', () => {
    const t = new BrightnessRangeTransformer({
      type: 'brightness-range',
      targets: ['@vendor:IKEA'],
      priority: 10,
      max_scale: 127,
    });
    expect(t.appliesTo(ctx)).toBe(false); // Innr != IKEA
  });
});
