import { describe, it, expect } from 'vitest';
import { cctRangeStats, isRangeOrdered } from '../../ui/src/utils/rules';
import type { Device } from '../../ui/src/api/types';

function bulb(nativeMin: number | null, nativeMax: number | null, ieee = '0xa'): Device {
  return {
    ieee,
    friendly_name: ieee,
    vendor: 'Innr',
    model: '',
    model_id: '',
    groups: [],
    capabilities: ['color_temp'],
    components: ['light'],
    native_min_mireds: nativeMin,
    native_max_mireds: nativeMax,
    last_topic: '',
    last_seen: 0,
    first_seen: 0,
    applied_rules: [],
  };
}

describe('cctRangeStats', () => {
  it('reports the envelope and the intersection of overlapping devices', () => {
    const s = cctRangeStats([bulb(153, 454, '0xa'), bulb(250, 500, '0xb')]);
    expect(s.hasData).toBe(true);
    expect(s.hasSafeZone).toBe(true);
    expect([s.unionLow, s.unionHigh]).toEqual([153, 500]);
    expect([s.safeMin, s.safeMax]).toEqual([250, 454]);
  });

  it('flags devices with no common range instead of inventing one', () => {
    // A cool-only bulb beside a warm-only one: max(mins) lands above
    // min(maxs), so there is no value both can honour.
    const s = cctRangeStats([bulb(150, 250, '0xa'), bulb(400, 500, '0xb')]);
    expect(s.hasData).toBe(true);
    expect(s.hasSafeZone).toBe(false);
    expect(s.safeMin!).toBeGreaterThan(s.safeMax!);
  });

  it('counts devices that advertise no native range', () => {
    const s = cctRangeStats([bulb(153, 454, '0xa'), bulb(null, null, '0xb')]);
    expect(s.hasData).toBe(true);
    expect(s.missing).toBe(1);
  });

  it('has no data when nothing advertises a range', () => {
    const s = cctRangeStats([bulb(null, null, '0xa')]);
    expect(s.hasData).toBe(false);
    expect(s.hasSafeZone).toBe(false);
  });
});

describe('isRangeOrdered', () => {
  it('accepts a single-sided rule', () => {
    expect(isRangeOrdered(250, null)).toBe(true);
    expect(isRangeOrdered(null, 454)).toBe(true);
    expect(isRangeOrdered(null, null)).toBe(true);
  });

  it('accepts equal bounds and rejects an inverted pair', () => {
    expect(isRangeOrdered(300, 300)).toBe(true);
    expect(isRangeOrdered(250, 454)).toBe(true);
    expect(isRangeOrdered(450, 400)).toBe(false);
  });
});
