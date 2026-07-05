import { describe, it, expect } from 'vitest';
import { extractCapabilities, unionCapabilities } from '../../src/devices/capabilities.js';

describe('extractCapabilities', () => {
  it('extracts color_temp and brightness from a CCT light payload', () => {
    const caps = extractCapabilities('light', {
      brightness: true,
      min_mireds: 200,
      max_mireds: 454,
      supported_color_modes: ['color_temp'],
    });
    expect(caps).toContain('on_off');
    expect(caps).toContain('brightness');
    expect(caps).toContain('color_temp');
    expect(caps).not.toContain('color');
  });

  it('extracts color when xy or rgb in supported_color_modes', () => {
    const caps = extractCapabilities('light', {
      brightness: true,
      supported_color_modes: ['xy', 'color_temp'],
    });
    expect(caps).toContain('color');
    expect(caps).toContain('color_temp');
  });

  it('detects effect from payload', () => {
    const caps = extractCapabilities('light', { effect: true });
    expect(caps).toContain('effect');
  });

  it('detects binary_state for binary_sensor', () => {
    const caps = extractCapabilities('binary_sensor', { name: 'Window' });
    expect(caps).toContain('binary_state');
  });

  it('detects sensor for sensor component', () => {
    const caps = extractCapabilities('sensor', { name: 'Temp' });
    expect(caps).toContain('sensor');
  });

  it('detects on_off + switch for switch component', () => {
    const caps = extractCapabilities('switch', {});
    expect(caps).toContain('on_off');
    expect(caps).toContain('switch');
  });

  it('returns empty for unknown component with no detectable fields', () => {
    const caps = extractCapabilities('cover', {});
    expect(caps).toEqual(['cover']);
  });

  it('does not duplicate color_temp when both fields and supported_color_modes', () => {
    const caps = extractCapabilities('light', {
      min_mireds: 200,
      supported_color_modes: ['color_temp', 'xy'],
    });
    expect(caps.filter((c) => c === 'color_temp')).toHaveLength(1);
  });
});

describe('unionCapabilities', () => {
  it('returns sorted union without duplicates', () => {
    expect(unionCapabilities(['b', 'a'], ['a', 'c'])).toEqual(['a', 'b', 'c']);
  });
  it('handles empty arrays', () => {
    expect(unionCapabilities([], ['a'])).toEqual(['a']);
    expect(unionCapabilities(['a'], [])).toEqual(['a']);
    expect(unionCapabilities([], [])).toEqual([]);
  });
});
