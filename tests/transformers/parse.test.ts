import { describe, it, expect } from 'vitest';
import { parseTransformerRule } from '../../src/transformers/parse.js';

describe('parseTransformerRule', () => {
  it('parses a valid color-temp-range rule', () => {
    const r = parseTransformerRule(
      { type: 'color-temp-range', targets: ['*'], priority: 10, min_mireds: 250, max_mireds: 454 },
      'test',
    );
    expect(r).toEqual({
      type: 'color-temp-range',
      targets: ['*'],
      priority: 10,
      min_mireds: 250,
      max_mireds: 454,
    });
  });

  it('parses a valid suggested-area rule', () => {
    const r = parseTransformerRule(
      { type: 'suggested-area', targets: ['@vendor:Innr'], priority: 5, area: 'Salon' },
      'test',
    );
    expect(r).toEqual({
      type: 'suggested-area',
      targets: ['@vendor:Innr'],
      priority: 5,
      area: 'Salon',
    });
  });

  it('parses entity-rename with device_name', () => {
    const r = parseTransformerRule(
      { type: 'entity-rename', targets: ['0xabc'], priority: 1, device_name: 'New name' },
      'test',
    );
    expect(r).toMatchObject({ type: 'entity-rename', device_name: 'New name' });
  });

  it('default priority to 0 if missing', () => {
    const r = parseTransformerRule({ type: 'color-temp-range', targets: ['*'], min_mireds: 250 }, 'test');
    expect(r.priority).toBe(0);
  });

  it('throws on missing type', () => {
    expect(() => parseTransformerRule({ targets: ['*'], priority: 1 }, 'test')).toThrow(/type/);
  });

  it('throws on unknown type', () => {
    expect(() => parseTransformerRule({ type: 'unknown-type', targets: ['*'] }, 'test')).toThrow(/unknown/);
  });

  it('throws on empty targets', () => {
    expect(() => parseTransformerRule({ type: 'color-temp-range', targets: [], min_mireds: 250 }, 'test')).toThrow(/targets/);
  });

  it('throws on target with empty string', () => {
    expect(() =>
      parseTransformerRule({ type: 'color-temp-range', targets: ['', '*'], min_mireds: 250 }, 'test'),
    ).toThrow(/non-empty/);
  });

  it('throws on NaN priority', () => {
    expect(() =>
      parseTransformerRule({ type: 'color-temp-range', targets: ['*'], priority: NaN, min_mireds: 250 }, 'test'),
    ).toThrow(/integer/);
  });

  it('throws on Infinity priority', () => {
    expect(() =>
      parseTransformerRule(
        { type: 'color-temp-range', targets: ['*'], priority: Infinity, min_mireds: 250 },
        'test',
      ),
    ).toThrow(/integer/);
  });

  it('throws on negative priority', () => {
    expect(() =>
      parseTransformerRule({ type: 'color-temp-range', targets: ['*'], priority: -1, min_mireds: 250 }, 'test'),
    ).toThrow(/integer/);
  });

  it('throws on non-integer priority', () => {
    expect(() =>
      parseTransformerRule({ type: 'color-temp-range', targets: ['*'], priority: 1.5, min_mireds: 250 }, 'test'),
    ).toThrow(/integer/);
  });

  it('throws on mireds out of bounds (too low)', () => {
    expect(() =>
      parseTransformerRule({ type: 'color-temp-range', targets: ['*'], min_mireds: 10 }, 'test'),
    ).toThrow(/mireds/);
  });

  it('throws on mireds out of bounds (too high)', () => {
    expect(() =>
      parseTransformerRule({ type: 'color-temp-range', targets: ['*'], min_mireds: 9999 }, 'test'),
    ).toThrow(/mireds/);
  });

  it('throws on NaN mireds', () => {
    expect(() =>
      parseTransformerRule({ type: 'color-temp-range', targets: ['*'], min_mireds: NaN }, 'test'),
    ).toThrow(/finite/);
  });

  it('throws on suggested-area without area', () => {
    expect(() => parseTransformerRule({ type: 'suggested-area', targets: ['*'] }, 'test')).toThrow(/area/);
  });

  it('throws on suggested-area with empty area', () => {
    expect(() =>
      parseTransformerRule({ type: 'suggested-area', targets: ['*'], area: '' }, 'test'),
    ).toThrow(/area/);
  });

  it('allows entity-rename without device_name (no-op rule)', () => {
    const r = parseTransformerRule({ type: 'entity-rename', targets: ['*'] }, 'test');
    expect(r).toMatchObject({ type: 'entity-rename', device_name: undefined });
  });

  it('parses valid brightness-range', () => {
    const r = parseTransformerRule(
      { type: 'brightness-range', targets: ['*'], priority: 10, max_scale: 127 },
      'test',
    );
    expect(r).toEqual({
      type: 'brightness-range',
      targets: ['*'],
      priority: 10,
      max_scale: 127,
    });
  });

  it('throws on brightness-range max_scale out of bounds', () => {
    expect(() =>
      parseTransformerRule({ type: 'brightness-range', targets: ['*'], max_scale: 0 }, 'test'),
    ).toThrow(/scale/);
    expect(() =>
      parseTransformerRule({ type: 'brightness-range', targets: ['*'], max_scale: 256 }, 'test'),
    ).toThrow(/scale/);
  });

  it('throws on brightness-range non-integer max_scale', () => {
    expect(() =>
      parseTransformerRule({ type: 'brightness-range', targets: ['*'], max_scale: 1.5 }, 'test'),
    ).toThrow(/integer/);
  });

  it('throws on null root', () => {
    expect(() => parseTransformerRule(null, 'test')).toThrow();
  });

  it('throws on array root', () => {
    expect(() => parseTransformerRule([], 'test')).toThrow();
  });

  // --- target pattern validation ---

  it('accepts every known pattern shape, including a Z2M group encoded id', () => {
    const targets = [
      '*',
      '0x18fc260000b3e0e2',
      '1221051039810110150109113116116_4', // group: encoded base topic + _id
      '@vendor:Innr',
      '@group:Salon',
      '@model:RS 227 T',
      '@friendlyname:Salon*',
    ];
    const r = parseTransformerRule({ type: 'color-temp-range', targets, min_mireds: 250 }, 'test');
    expect(r.targets).toEqual(targets);
  });

  it('rejects a typo in an @ prefix instead of silently never matching', () => {
    expect(() =>
      parseTransformerRule({ type: 'color-temp-range', targets: ['@vendr:Innr'], min_mireds: 250 }, 'test'),
    ).toThrow(/unknown target prefix/);
  });

  it('rejects an @ prefix without a value', () => {
    expect(() =>
      parseTransformerRule({ type: 'color-temp-range', targets: ['@vendor:'], min_mireds: 250 }, 'test'),
    ).toThrow(/missing a value/);
  });

  // --- brightness 254 boundary (native Zigbee maximum) ---

  it('accepts max_scale 254 and rejects 255', () => {
    const ok = parseTransformerRule({ type: 'brightness-range', targets: ['*'], max_scale: 254 }, 'test');
    expect(ok).toMatchObject({ max_scale: 254 });
    expect(() =>
      parseTransformerRule({ type: 'brightness-range', targets: ['*'], max_scale: 255 }, 'test'),
    ).toThrow(/between 1 and 254/);
  });
});
