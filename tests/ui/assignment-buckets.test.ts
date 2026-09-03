import { describe, it, expect } from 'vitest';
import {
  APPLY_PRIORITY,
  assignmentBuckets,
  capabilityForRuleType,
  ruleSignature,
} from '../../ui/src/utils/rules';
import type { AppliedRule, Device } from '../../ui/src/api/types';

function rule(over: Partial<AppliedRule> = {}): AppliedRule {
  return {
    id: 1,
    type: 'color-temp-range',
    targets: [],
    priority: 50,
    enabled: true,
    ...over,
  } as AppliedRule;
}

function device(
  ieee: string,
  capabilities: string[],
  applied_rules: AppliedRule[] = [],
): Device {
  return {
    ieee,
    friendly_name: ieee,
    vendor: '',
    model: '',
    model_id: '',
    groups: [],
    capabilities,
    components: [],
    native_min_mireds: null,
    native_max_mireds: null,
    last_topic: '',
    last_seen: 0,
    first_seen: 0,
    applied_rules,
  };
}

/** A rule that explicitly targets the device, as specificRulesFor requires. */
function ownRule(ieee: string, over: Partial<AppliedRule> = {}): AppliedRule {
  return rule({ targets: [ieee], ...over });
}

const HERE = ruleSignature(rule({ min_mireds: 153, max_mireds: 333 }))!;

describe('capabilityForRuleType', () => {
  it('gates the range types on the capability they act on', () => {
    expect(capabilityForRuleType('color-temp-range')).toBe('color_temp');
    expect(capabilityForRuleType('brightness-range')).toBe('brightness');
  });

  it('leaves types that apply to any device ungated', () => {
    expect(capabilityForRuleType('suggested-area')).toBeNull();
    expect(capabilityForRuleType('entity-rename')).toBeNull();
  });
});

describe('assignmentBuckets', () => {
  it('separates devices already on the configuration from those on another', () => {
    const onIt = device('0xa', ['color_temp'], [
      ownRule('0xa', { min_mireds: 153, max_mireds: 333 }),
    ]);
    const elsewhere = device('0xb', ['color_temp'], [
      ownRule('0xb', { min_mireds: 282, max_mireds: 434 }),
    ]);
    const free = device('0xc', ['color_temp']);

    const b = assignmentBuckets([onIt, elsewhere, free], 'color-temp-range', HERE);

    expect(b.assigned.map((d) => d.ieee)).toEqual(['0xa']);
    expect(b.elsewhere.map((e) => e.device.ieee)).toEqual(['0xb']);
    expect(b.unassigned.map((d) => d.ieee)).toEqual(['0xc']);
  });

  it('carries the rule a moved device would leave, so the move can be shown', () => {
    const leaving = ownRule('0xb', { min_mireds: 282, max_mireds: 434 });
    const b = assignmentBuckets(
      [device('0xb', ['color_temp'], [leaving])],
      'color-temp-range',
      HERE,
    );
    expect(b.elsewhere[0].rule.min_mireds).toBe(282);
    expect(b.elsewhere[0].rule.max_mireds).toBe(434);
  });

  it('leaves out devices the rule type cannot act on', () => {
    const sensor = device('0xd', ['contact']);
    const b = assignmentBuckets([sensor], 'color-temp-range', HERE);
    expect([...b.assigned, ...b.unassigned]).toEqual([]);
    expect(b.elsewhere).toEqual([]);
  });

  it('offers a device whose only cover is a LOWER-priority broad rule', () => {
    // Targeted through `*`, not by its own IEEE, and at a priority an
    // assignment would beat — so ticking it genuinely takes effect.
    const covered = device('0xe', ['color_temp'], [
      rule({ targets: ['*'], priority: 10, min_mireds: 153, max_mireds: 333 }),
    ]);
    const b = assignmentBuckets([covered], 'color-temp-range', HERE);
    expect(b.unassigned.map((d) => d.ieee)).toEqual(['0xe']);
    expect(b.assigned).toEqual([]);
  });

  it('does NOT offer one a broad rule outranks — the tick would be inert', () => {
    // Assignment creates its rule at APPLY_PRIORITY and resolution keeps the
    // incumbent on a tie, so an equal or higher broad rule keeps winning.
    // Offering it would mean a save that changes nothing.
    const outranked = device('0xg', ['color_temp'], [
      rule({ targets: ['*'], priority: APPLY_PRIORITY, min_mireds: 153, max_mireds: 333 }),
    ]);
    const b = assignmentBuckets([outranked], 'color-temp-range', HERE);
    expect(b.unassigned).toEqual([]);
    expect(b.blocked.map((e) => e.device.ieee)).toEqual(['0xg']);
    expect(b.blocked[0].rule.priority).toBe(APPLY_PRIORITY);
  });

  it('leaves out devices that advertise nothing, whatever the rule type', () => {
    // The Coordinator and bridge-only entries: the Devices view hides them as
    // non-actionable, and suggested-area gates on no capability at all.
    const coordinator = device('0xh', []);
    const b = assignmentBuckets([coordinator], 'suggested-area', 'suggested-area|Salon');
    expect([...b.assigned, ...b.unassigned]).toEqual([]);
    expect([...b.elsewhere, ...b.blocked]).toEqual([]);
  });

  it('ignores rules of a different type on the same device', () => {
    const d = device('0xf', ['color_temp', 'brightness'], [
      ownRule('0xf', { type: 'brightness-range', max_scale: 200 }),
    ]);
    const b = assignmentBuckets([d], 'color-temp-range', HERE);
    expect(b.unassigned.map((x) => x.ieee)).toEqual(['0xf']);
  });
});
