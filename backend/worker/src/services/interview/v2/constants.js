export const FIELD_STATES = Object.freeze({
  COMPLETED: 'COMPLETED',
  PENDING: 'PENDING',
  BLOCKED: 'BLOCKED',
  SKIPPED: 'SKIPPED',
  INVALID: 'INVALID',
  UNASKED: 'UNASKED',
  ASKED: 'ASKED',
});

export const FIELD_STATE_ORDER = Object.freeze([
  FIELD_STATES.COMPLETED,
  FIELD_STATES.PENDING,
  FIELD_STATES.BLOCKED,
  FIELD_STATES.SKIPPED,
]);

export const INFERENCE = Object.freeze({
  MAX_ITERATIONS: 20,
});

export const CACHE = Object.freeze({
  TTL: 60000,
  MAX_SIZE: 100,
});

export const AI = Object.freeze({
  DEFAULT_TIMEOUT: 30000,
  DEFAULT_MAX_RETRIES: 3,
  DEFAULT_BASE_URL: 'https://openrouter.ai/api/v1',
  DEFAULT_MODEL: 'openai/gpt-4o',
  HEALTH_TIMEOUT: 5000,
  BACKOFF_BASE_MS: 1000,
  BACKOFF_MAX_MS: 30000,
  BACKOFF_JITTER_MS: 500,
});

export const STATE = Object.freeze({
  VERSION: 1,
});

export const ATOMIC_OPERATORS = Object.freeze([
  'exists', 'eq', 'neq', 'gt', 'gte', 'lt', 'lte', 'in', 'contains', 'matches',
]);

export const ALL_OPERATORS = Object.freeze([
  'exists', 'eq', 'neq', 'gt', 'gte', 'lt', 'lte', 'in', 'contains', 'matches',
  'not', 'and', 'or',
]);

export const PLACEHOLDER_RE = /\{\{(\w+)(?::(\w+))?\}\}/g;

export const SPECIAL_PLACEHOLDERS = Object.freeze([
  'serviceName', 'interviewId', 'timestamp', 'now', 'label', 'value',
]);

export const VALID_TEMPLATE_SUFFIXES = Object.freeze(['label', 'unit']);

export const REFERRER_URL = 'https://tecno-san-juan.com';
export const APP_TITLE = 'Tecno San Juan';
