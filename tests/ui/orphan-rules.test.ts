import { describe, it, expect } from 'vitest';
import { rulesAffectingNoDevice } from '../../ui/src/utils/rules';
import type { AppliedRule, Device, Transformer } from '../../ui/src/api/types';

function stored(id: number, over: Partial<Transformer> = {}): Transformer {
  return {
    id,
    type: 'color-temp-range',
    targets: ['0xdead'],
    priority: 50,
    enabled: true,
    ...over,
  };
}

function device(ieee: string, applied: AppliedRule[]): Device {
  return {
    ieee,
    friendly_name: ieee,
    vendor: '',
    model: '',
    model_id: '',
    groups: [],
    capabilities: ['color_temp'],
    components: [],
    native_min_mireds: null,
    native_max_mireds: null,
    last_topic: '',
    last_seen: 0,
    first_seen: 0,
    applied_rules: applied,
  };
}

function applied(id: number): AppliedRule {
  return { id, type: 'color-temp-range', targets: ['0xa'], priority: 50 } as AppliedRule;
}

describe('rulesAffectingNoDevice', () => {
  it('finds the rule no device carries', () => {
    const rules = [stored(1), stored(2)];
    const devices = [device('0xa', [applied(1)])];
    expect(rulesAffectingNoDevice(rules, devices).map((r) => r.id)).toEqual([2]);
  });

  it('returns nothing when every rule is in use', () => {
    const rules = [stored(1), stored(2)];
    const devices = [device('0xa', [applied(1)]), device('0xb', [applied(2)])];
    expect(rulesAffectingNoDevice(rules, devices)).toEqual([]);
  });

  it('ignores disabled rules — inert on purpose, not by accident', () => {
    const rules = [stored(1, { enabled: false }), stored(2)];
    const devices: Device[] = [];
    expect(rulesAffectingNoDevice(rules, devices).map((r) => r.id)).toEqual([2]);
  });

  it('flags a rule shadowed everywhere by a higher priority one', () => {
    // applied_rules only carries the winner, so a rule that loses on every
    // device it targets affects nobody — true even though its targets exist.
    const rules = [stored(1, { priority: 10 }), stored(2, { priority: 50 })];
    const devices = [device('0xa', [applied(2)])];
    expect(rulesAffectingNoDevice(rules, devices).map((r) => r.id)).toEqual([1]);
  });

  it('treats a whole fleet with no rules as leaving every rule orphaned', () => {
    expect(rulesAffectingNoDevice([stored(1)], [device('0xa', [])]).map((r) => r.id)).toEqual([1]);
  });
});
