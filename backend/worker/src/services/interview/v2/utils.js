export function deepClone(value) {
  return structuredClone(value);
}

export function deepFreeze(value) {
  if (value === null || typeof value !== 'object') return value;
  if (Object.isFrozen(value)) return value;
  const props = Object.getOwnPropertyNames(value);
  for (const name of props) value[name] = deepFreeze(value[name]);
  return Object.freeze(value);
}

export function deepEqual(a, b) {
  return JSON.stringify(a) === JSON.stringify(b);
}

export function isEmpty(value) {
  if (value === null || value === undefined) return true;
  if (typeof value === 'string') return value.trim().length === 0;
  if (typeof value === 'number') return Number.isNaN(value);
  if (Array.isArray(value)) return value.length === 0;
  if (typeof value === 'object') return Object.keys(value).length === 0;
  return false;
}

export function safeRegex(pattern) {
  try {
    return new RegExp(pattern);
  } catch {
    return null;
  }
}

export function buildContext(state) {
  const completedFields = state.getCompletedFields();
  const ctx = Object.create(null);
  for (const [fieldId, entry] of Object.entries(completedFields)) {
    ctx[fieldId] = entry.value;
  }
  return ctx;
}

export function buildSources(state) {
  const completedFields = state.getCompletedFields();
  const src = Object.create(null);
  for (const [fieldId, entry] of Object.entries(completedFields)) {
    src[fieldId] = entry.source;
  }
  return src;
}

export function getFieldMap(schema) {
  const map = Object.create(null);
  for (const field of schema.fields) {
    map[field.id] = field;
  }
  return map;
}

export function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

export function nowISO() {
  return new Date().toISOString();
}
