import { describe, it, expect } from 'vitest';
import { EntityRenameTransformer } from '../../src/transformers/entity-rename.js';
import type { Device, DiscoveryPayload } from '../../src/types.js';

const dev: Device = {
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

const ctx = { device: dev, topic: '' };

describe('EntityRenameTransformer', () => {
  it('overrides device.name when device_name is set', () => {
    const t = new EntityRenameTransformer({
      type: 'entity-rename',
      targets: ['*'],
      priority: 10,
      device_name: 'Salon principal',
    });
    const payload: DiscoveryPayload = { device: { name: 'Salon 1', manufacturer: 'Innr' } };
    const out = t.apply(payload, ctx);
    expect((out.device as Record<string, unknown>).name).toBe('Salon principal');
    expect((out.device as Record<string, unknown>).manufacturer).toBe('Innr');
  });

  it('does not touch object_id or default_entity_id (safety)', () => {
    const t = new EntityRenameTransformer({
      type: 'entity-rename',
      targets: ['*'],
      priority: 10,
      device_name: 'New name',
    });
    const payload: DiscoveryPayload = {
      object_id: 'salon_1',
      default_entity_id: 'light.salon_1',
      device: { name: 'Salon 1' },
    } as DiscoveryPayload;
    const out = t.apply(payload, ctx);
    expect(out.object_id).toBe('salon_1');
    expect(out.default_entity_id).toBe('light.salon_1');
  });

  it('no-op when device_name not set in rule', () => {
    const t = new EntityRenameTransformer({
      type: 'entity-rename',
      targets: ['*'],
      priority: 10,
    });
    const payload: DiscoveryPayload = { device: { name: 'Salon 1' } };
    const out = t.apply(payload, ctx);
    expect(out).toBe(payload);
  });

  it('no-op when device.name already equals device_name', () => {
    const t = new EntityRenameTransformer({
      type: 'entity-rename',
      targets: ['*'],
      priority: 10,
      device_name: 'Salon 1',
    });
    const payload: DiscoveryPayload = { device: { name: 'Salon 1' } };
    const out = t.apply(payload, ctx);
    expect(out).toBe(payload);
  });
});
