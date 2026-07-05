import { readFileSync } from 'node:fs';
import { parse as parseYaml } from 'yaml';
import type { LogLevel } from './logger.js';
import type { TransformerRule } from './transformers/types.js';
import { parseTransformerRule } from './transformers/parse.js';

export interface BrokerConfig {
  url: string;
  username?: string;
  password?: string;
  client_id?: string;
}

export interface TopicsConfig {
  source: string;
  target: string;
  z2m_base: string;
}

export interface DatabaseConfig {
  path: string;
}

export interface ApiConfig {
  host: string;
  port: number;
}

export interface Config {
  broker: BrokerConfig;
  topics: TopicsConfig;
  database: DatabaseConfig;
  api: ApiConfig;
  log_level: LogLevel;
  transformers: TransformerRule[];
}

/**
 * Expands `${VAR}` or `${VAR:-default}` references in a string following the
 * POSIX shell semantics: variable names can be UPPERCASE, lowercase or mixed
 * (case-sensitive). Throws an error if VAR is absent and no default is given.
 */
function expandEnvVarsInString(value: string): string {
  return value.replace(
    /\$\{([A-Za-z_][A-Za-z0-9_]*)(?::-([^}]*))?\}/g,
    (_, name: string, fallback?: string) => {
      const v = process.env[name];
      if (v !== undefined && v !== '') return v;
      if (fallback !== undefined) return fallback;
      throw new Error(`Required environment variable: ${name}`);
    },
  );
}

function expandEnvVars(value: unknown): unknown {
  if (typeof value === 'string') return expandEnvVarsInString(value);
  if (Array.isArray(value)) return value.map(expandEnvVars);
  if (value !== null && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([k, v]) => [k, expandEnvVars(v)]),
    );
  }
  return value;
}

function assertNonEmptyString(v: unknown, field: string): string {
  if (typeof v !== 'string' || v.length === 0) {
    throw new Error(`Invalid configuration: ${field} must be a non-empty string`);
  }
  return v;
}

function validate(raw: unknown): Config {
  if (raw === null || typeof raw !== 'object') {
    throw new Error('Invalid configuration: root must be an object');
  }
  const r = raw as Record<string, unknown>;

  const broker = (r.broker ?? {}) as Record<string, unknown>;
  const topics = (r.topics ?? {}) as Record<string, unknown>;
  const database = (r.database ?? {}) as Record<string, unknown>;
  const api = (r.api ?? {}) as Record<string, unknown>;
  const transformers = (r.transformers ?? []) as unknown[];

  if (!Array.isArray(transformers)) {
    throw new Error('Invalid configuration: transformers must be a list');
  }

  return {
    broker: {
      url: assertNonEmptyString(broker.url, 'broker.url'),
      username: typeof broker.username === 'string' && broker.username !== '' ? broker.username : undefined,
      password: typeof broker.password === 'string' && broker.password !== '' ? broker.password : undefined,
      client_id: typeof broker.client_id === 'string' ? broker.client_id : undefined,
    },
    topics: {
      source: assertNonEmptyString(topics.source, 'topics.source'),
      target: assertNonEmptyString(topics.target, 'topics.target'),
      z2m_base: assertNonEmptyString(topics.z2m_base, 'topics.z2m_base'),
    },
    database: {
      path: assertNonEmptyString(database.path, 'database.path'),
    },
    api: {
      // Security: by default we bind on loopback. Override explicitly to
      // `0.0.0.0` in config.yaml if you want to reach the UI from another
      // device on the LAN.
      host: typeof api.host === 'string' && api.host.length > 0 ? api.host : '127.0.0.1',
      port: typeof api.port === 'number' ? api.port : 8099,
    },
    log_level: (r.log_level ?? 'info') as LogLevel,
    transformers: transformers.map((t, i) => parseTransformerRule(t, `transformers[${i}]`)),
  };
}

export function loadConfig(path: string): Config {
  const content = readFileSync(path, 'utf-8');
  const raw = parseYaml(content);
  const expanded = expandEnvVars(raw);
  return validate(expanded);
}
