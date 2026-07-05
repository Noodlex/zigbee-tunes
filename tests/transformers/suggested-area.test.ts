import { describe, it, expect } from 'vitest';
import { SuggestedAreaTransformer } from '../../src/transformers/suggested-area.js';
import type { Device, DiscoveryPayload } from '../../src/types.js';

const innr: Device = {
  ieee: '0xinnr',
  friendly_name: 'Salon 1',
  vendor: 'Innr',
  model: '',
  model_id: 'RS 227 T',
  groups: [],
  capabilities: [],
  components: [],
  native_min_mireds: null,
  native_max_mireds: null,
  last_topic: '',
  last_seen: 0,
  first_seen: 0,
};

const ctx = { device: innr, topic: '' };

describe('SuggestedAreaTransformer', () => {
  it('adds suggested_area to device when missing', () => {
    const t = new SuggestedAreaTransformer({
      type: 'suggested-area',
      targets: ['*'],
      priority: 10,
      area: 'Salon',
    });
    const payload: DiscoveryPayload = { device: { name: 'Salon 1', manufacturer: 'Innr' } };
    const out = t.apply(payload, ctx);
    expect((out.device as Record<string, unknown>).suggested_area).toBe('Salon');
    expect((out.device as Record<string, unknown>).name).toBe('Salon 1');
  });

  it('returns same reference when area is already correct (no-op)', () => {
    const t = new SuggestedAreaTransformer({
      type: 'suggested-area',
      targets: ['*'],
      priority: 10,
      area: 'Salon',
    });
    const payload: DiscoveryPayload = { device: { suggested_area: 'Salon' } };
    const out = t.apply(payload, ctx);
    expect(out).toBe(payload);
  });

  it('overwrites existing suggested_area when different', () => {
    const t = new SuggestedAreaTransformer({
      type: 'suggested-area',
      targets: ['*'],
      priority: 10,
      area: 'Salon',
    });
    const payload: DiscoveryPayload = { device: { suggested_area: 'Cuisine' } };
    const out = t.apply(payload, ctx);
    expect((out.device as Record<string, unknown>).suggested_area).toBe('Salon');
  });

  it('handles payload without device object', () => {
    const t = new SuggestedAreaTransformer({
      type: 'suggested-area',
      targets: ['*'],
      priority: 10,
      area: 'Salon',
    });
    const payload: DiscoveryPayload = {};
    const out = t.apply(payload, ctx);
    expect((out.device as Record<string, unknown>).suggested_area).toBe('Salon');
  });
});
