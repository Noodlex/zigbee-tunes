import { describe, it, expect } from 'vitest';
import { TransformerPipeline } from '../../src/transformers/pipeline.js';
import type { Device, DiscoveryPayload } from '../../src/types.js';
import type { TransformerRule } from '../../src/transformers/types.js';

const innr: Device = {
  ieee: '0xinnr',
  friendly_name: 'Innr lamp',
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

const ikea: Device = { ...innr, ieee: '0xikea', vendor: 'IKEA', friendly_name: 'IKEA lamp', model_id: 'LED1545G12' };

const wildcardRule: TransformerRule = {
  type: 'color-temp-range',
  targets: ['*'],
  priority: 10,
  min_mireds: 250,
  max_mireds: 454,
};

const innrSpecificRule: TransformerRule = {
  type: 'color-temp-range',
  targets: ['@vendor:Innr'],
  priority: 20,
  min_mireds: 200, // Innr can go cooler
  max_mireds: 454,
};

describe('TransformerPipeline', () => {
  it('applies wildcard rule when nothing more specific', () => {
    const p = new TransformerPipeline([wildcardRule]);
    const out = p.apply({ min_mireds: 153, max_mireds: 500 } as DiscoveryPayload, { device: ikea, topic: '' });
    expect(out.min_mireds).toBe(250);
    expect(out.max_mireds).toBe(454);
  });

  it('higher-priority specific rule wins over wildcard for matching device', () => {
    const p = new TransformerPipeline([wildcardRule, innrSpecificRule]);
    const out = p.apply({ min_mireds: 153, max_mireds: 500 } as DiscoveryPayload, { device: innr, topic: '' });
    expect(out.min_mireds).toBe(200); // Innr rule
    expect(out.max_mireds).toBe(454);
  });

  it('non-matching specific rule falls back to wildcard', () => {
    const p = new TransformerPipeline([wildcardRule, innrSpecificRule]);
    const out = p.apply({ min_mireds: 153, max_mireds: 500 } as DiscoveryPayload, { device: ikea, topic: '' });
    expect(out.min_mireds).toBe(250); // wildcard applied
    expect(out.max_mireds).toBe(454);
  });

  it('order of rules in YAML does not matter — priority decides', () => {
    const reversed = new TransformerPipeline([innrSpecificRule, wildcardRule]);
    const forwards = new TransformerPipeline([wildcardRule, innrSpecificRule]);
    const payload = { min_mireds: 153, max_mireds: 500 } as DiscoveryPayload;
    expect(reversed.apply(payload, { device: innr, topic: '' })).toEqual(
      forwards.apply(payload, { device: innr, topic: '' }),
    );
  });

  it('returns payload unchanged if device is null and rules require device', () => {
    const p = new TransformerPipeline([wildcardRule]);
    const payload = { min_mireds: 153, max_mireds: 500 } as DiscoveryPayload;
    const out = p.apply(payload, { device: null, topic: '' });
    expect(out).toBe(payload);
  });
});
