import type { Db } from '../connection.js';
import type { TransformerRule } from '../../transformers/types.js';
import { ruleConfigFields } from '../../transformers/project.js';

export interface StoredTransformer {
  id: number;
  rule: TransformerRule;
  enabled: boolean;
  created_at: number;
  updated_at: number;
}

interface Row {
  id: number;
  type: string;
  targets: string;
  priority: number;
  enabled: number;
  config: string;
  created_at: number;
  updated_at: number;
}

function rowToRule(row: Row): TransformerRule {
  const targets = JSON.parse(row.targets) as string[];
  const cfg = JSON.parse(row.config) as Record<string, unknown>;
  switch (row.type) {
    case 'color-temp-range':
      return {
        type: 'color-temp-range',
        targets,
        priority: row.priority,
        min_mireds: typeof cfg.min_mireds === 'number' ? cfg.min_mireds : undefined,
        max_mireds: typeof cfg.max_mireds === 'number' ? cfg.max_mireds : undefined,
      };
    case 'suggested-area':
      return {
        type: 'suggested-area',
        targets,
        priority: row.priority,
        area: String(cfg.area ?? ''),
      };
    case 'entity-rename':
      return {
        type: 'entity-rename',
        targets,
        priority: row.priority,
        device_name: typeof cfg.device_name === 'string' ? cfg.device_name : undefined,
      };
    case 'brightness-range':
      return {
        type: 'brightness-range',
        targets,
        priority: row.priority,
        max_scale: typeof cfg.max_scale === 'number' ? cfg.max_scale : undefined,
      };
    default:
      throw new Error(`Unknown transformer type in DB: ${row.type}`);
  }
}

function ruleToConfigJson(rule: TransformerRule): string {
  return JSON.stringify(ruleConfigFields(rule));
}

function rowToStored(row: Row): StoredTransformer {
  return {
    id: row.id,
    rule: rowToRule(row),
    enabled: row.enabled === 1,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

export class TransformerRepository {
  constructor(private readonly db: Db) {}

  count(): number {
    const row = this.db.prepare('SELECT COUNT(*) as n FROM transformers').get() as unknown as { n: number };
    return row.n;
  }

  findAll(): StoredTransformer[] {
    const rows = this.db
      .prepare('SELECT * FROM transformers ORDER BY priority DESC, id ASC')
      .all() as unknown as Row[];
    return rows.map(rowToStored);
  }

  findEnabledRules(): TransformerRule[] {
    const rows = this.db
      .prepare('SELECT * FROM transformers WHERE enabled = 1 ORDER BY priority DESC, id ASC')
      .all() as unknown as Row[];
    return rows.map(rowToRule);
  }

  findById(id: number): StoredTransformer | null {
    const row = this.db.prepare('SELECT * FROM transformers WHERE id = ?').get(id) as unknown as
      | Row
      | undefined;
    return row ? rowToStored(row) : null;
  }

  insert(rule: TransformerRule, enabled: boolean = true): StoredTransformer {
    const now = Date.now();
    const result = this.db
      .prepare(
        `INSERT INTO transformers (type, targets, priority, enabled, config, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(rule.type, JSON.stringify(rule.targets), rule.priority, enabled ? 1 : 0, ruleToConfigJson(rule), now, now);
    const id = Number(result.lastInsertRowid);
    const stored = this.findById(id);
    if (!stored) throw new Error('insert succeeded but findById returned null');
    return stored;
  }

  update(id: number, rule: TransformerRule, enabled: boolean): StoredTransformer | null {
    const existing = this.findById(id);
    if (!existing) return null;
    this.db
      .prepare(
        `UPDATE transformers SET type=?, targets=?, priority=?, enabled=?, config=?, updated_at=?
         WHERE id=?`,
      )
      .run(
        rule.type,
        JSON.stringify(rule.targets),
        rule.priority,
        enabled ? 1 : 0,
        ruleToConfigJson(rule),
        Date.now(),
        id,
      );
    return this.findById(id);
  }

  delete(id: number): boolean {
    const result = this.db.prepare('DELETE FROM transformers WHERE id = ?').run(id);
    return result.changes > 0;
  }

  /**
   * Bootstrap: if the table is empty and we have YAML rules, insert them.
   * Wrapped in a transaction: if a rule fails midway we rollback to avoid
   * ending up with a partially filled table that would prevent a future
   * bootstrap (because of the `count() > 0` check).
   * Returns the number of inserted rules.
   */
  bootstrapFromYaml(yamlRules: TransformerRule[]): number {
    if (this.count() > 0) return 0;
    if (yamlRules.length === 0) return 0;

    this.db.exec('BEGIN');
    try {
      for (const rule of yamlRules) {
        this.insert(rule, true);
      }
      this.db.exec('COMMIT');
      return yamlRules.length;
    } catch (err) {
      this.db.exec('ROLLBACK');
      throw err;
    }
  }
}
