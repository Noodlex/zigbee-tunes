import { describe, it, expect } from 'vitest';
import { matchesTarget, matchesAnyTarget } from '../../src/targets/matcher.js';
import type { Device } from '../../src/types.js';

const innrDevice: Device = {
  ieee: '0x18fc260000b3e0e2',
  friendly_name: 'Salle à manger 4',
  vendor: 'Innr',
  model: 'GU10 spot 420 lm',
  model_id: 'RS 227 T',
  groups: ['Salle à manger'],
  capabilities: ['brightness', 'color_temp', 'on_off'],
  components: ['light'],
  native_min_mireds: null,
  native_max_mireds: null,
  last_topic: 'z2m_discovery/light/0x18fc260000b3e0e2/light/config',
  last_seen: 0,
  first_seen: 0,
};

describe('matchesTarget', () => {
  it('matches wildcard', () => {
    expect(matchesTarget(innrDevice, '*')).toBe(true);
  });

  it('matches exact ieee (case-insensitive)', () => {
    expect(matchesTarget(innrDevice, '0x18fc260000b3e0e2')).toBe(true);
    expect(matchesTarget(innrDevice, '0X18FC260000B3E0E2')).toBe(true);
    expect(matchesTarget(innrDevice, '0xdeadbeef')).toBe(false);
  });

  it('matches @vendor case-insensitive', () => {
    expect(matchesTarget(innrDevice, '@vendor:Innr')).toBe(true);
    expect(matchesTarget(innrDevice, '@vendor:innr')).toBe(true);
    expect(matchesTarget(innrDevice, '@vendor:IKEA')).toBe(false);
  });

  it('matches @group case-insensitive', () => {
    expect(matchesTarget(innrDevice, '@group:Salle à manger')).toBe(true);
    expect(matchesTarget(innrDevice, '@group:salle à manger')).toBe(true);
    expect(matchesTarget(innrDevice, '@group:Cuisine')).toBe(false);
  });

  it('matches @model exact only', () => {
    expect(matchesTarget(innrDevice, '@model:RS 227 T')).toBe(true);
    expect(matchesTarget(innrDevice, '@model:rs 227 t')).toBe(false); // exact, not case-insensitive
    expect(matchesTarget(innrDevice, '@model:RS 228 T')).toBe(false);
  });

  it('matches @friendlyname exact (case-insensitive)', () => {
    expect(matchesTarget(innrDevice, '@friendlyname:Salle à manger 4')).toBe(true);
    expect(matchesTarget(innrDevice, '@friendlyname:SALLE À MANGER 4')).toBe(true);
    expect(matchesTarget(innrDevice, '@friendlyname:Salon 4')).toBe(false);
  });

  it('matches @friendlyname prefix with trailing *', () => {
    expect(matchesTarget(innrDevice, '@friendlyname:Salle à manger*')).toBe(true);
    expect(matchesTarget(innrDevice, '@friendlyname:salle*')).toBe(true); // case-insensitive
    expect(matchesTarget(innrDevice, '@friendlyname:Salon*')).toBe(false);
    expect(matchesTarget(innrDevice, '@friendlyname:Cuisine*')).toBe(false);
  });
});

describe('matchesAnyTarget', () => {
  it('returns true if any pattern matches', () => {
    expect(matchesAnyTarget(innrDevice, ['@vendor:IKEA', '@vendor:Innr'])).toBe(true);
  });
  it('returns false if no pattern matches', () => {
    expect(matchesAnyTarget(innrDevice, ['@vendor:IKEA', '@group:Salon'])).toBe(false);
  });
  it('handles empty list', () => {
    expect(matchesAnyTarget(innrDevice, [])).toBe(false);
  });
});
