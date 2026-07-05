// Shared projection of a TransformerRule's type-specific fields.
// Used by API routes (JSON projection) and DB repository (config column
// serialization). Single source of truth for which fields belong to which
// transformer type — adding a new transformer type only requires updating
// here, parse.ts, and types.ts.

import type { TransformerRule } from './types.js';

/**
 * Returns only the type-specific fields of a rule (everything that's NOT
 * targets, priority, or type). For DB persistence (JSON.stringify) and
 * API JSON projection.
 */
export function ruleConfigFields(rule: TransformerRule): Record<string, unknown> {
  switch (rule.type) {
    case 'color-temp-range':
      return { min_mireds: rule.min_mireds, max_mireds: rule.max_mireds };
    case 'suggested-area':
      return { area: rule.area };
    case 'entity-rename':
      return { device_name: rule.device_name };
    case 'brightness-range':
      return { max_scale: rule.max_scale };
  }
}
