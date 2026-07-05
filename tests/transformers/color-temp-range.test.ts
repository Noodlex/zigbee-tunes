import { describe, it, expect } from 'vitest';
import { ColorTempRangeTransformer } from '../../src/transformers/color-temp-range.js';
import type { Device, DiscoveryPayload } from '../../src/types.js';

const device: Device = {
  ieee: '0xaaa',
  friendly_name: 'test',
  vendor: 'Innr',
  model: '',
  model_id: 'RS 227 T',
  groups: ['Living'],
  capabilities: ['color_temp'],
  components: ['light'],
  native_min_mireds: null,
  native_max_mireds: null,
  last_topic: '',
  last_seen: 0,
  first_seen: 0,
};

const ctx = { device, topic: 'z2m_discovery/light/0xaaa/light/config' };

describe('ColorTempRangeTransformer', () => {
  it('clamps both min and max when payload is outside range', () => {
    const t = new ColorTempRangeTransformer({
      type: 'color-temp-range',
      targets: ['*'],
      priority: 10,
      min_mireds: 250,
      max_mireds: 454,
    });
    const payload: DiscoveryPayload = { min_mireds: 153, max_mireds: 500 };
    const out = t.apply(payload, ctx);
    expect(out.min_mireds).toBe(250);
    expect(out.max_mireds).toBe(454);
  });

  it('does not loosen tighter native ranges', () => {
    const t = new ColorTempRangeTransformer({
      type: 'color-temp-range',
      targets: ['*'],
      priority: 10,
      min_mireds: 200,
      max_mireds: 500,
    });
    // Bulb is physically tighter than the rule: keep its actual values
    const payload: DiscoveryPayload = { min_mireds: 250, max_mireds: 454 };
    const out = t.apply(payload, ctx);
    expect(out.min_mireds).toBe(250);
    expect(out.max_mireds).toBe(454);
  });

  it('respects appliesTo by target pattern', () => {
    const t = new ColorTempRangeTransformer({
      type: 'color-temp-range',
      targets: ['@vendor:IKEA'],
      priority: 10,
      min_mireds: 250,
      max_mireds: 454,
    });
    // Device is Innr, the rule targets IKEA
    expect(t.appliesTo(ctx)).toBe(false);
  });

  it('handles partial config (only min_mireds set)', () => {
    const t = new ColorTempRangeTransformer({
      type: 'color-temp-range',
      targets: ['*'],
      priority: 10,
      min_mireds: 250,
    });
    const payload: DiscoveryPayload = { min_mireds: 153, max_mireds: 500 };
    const out = t.apply(payload, ctx);
    expect(out.min_mireds).toBe(250);
    expect(out.max_mireds).toBe(500); // untouched
  });

  it('does not touch payload without mireds fields', () => {
    const t = new ColorTempRangeTransformer({
      type: 'color-temp-range',
      targets: ['*'],
      priority: 10,
      min_mireds: 250,
      max_mireds: 454,
    });
    const payload: DiscoveryPayload = { name: 'test' };
    const out = t.apply(payload, ctx);
    expect(out).toBe(payload); // same reference, no-op
  });

  it('does not modify original payload', () => {
    const t = new ColorTempRangeTransformer({
      type: 'color-temp-range',
      targets: ['*'],
      priority: 10,
      min_mireds: 250,
      max_mireds: 454,
    });
    const payload: DiscoveryPayload = { min_mireds: 153, max_mireds: 500 };
    const original = { ...payload };
    t.apply(payload, ctx);
    expect(payload).toEqual(original); // immutable
  });
});
