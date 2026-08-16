import { ATOMIC_OPERATORS } from './constants.js';

function getFieldValue(field, context) {
  if (!(field in context)) return undefined;
  return context[field];
}

function existsValue(field, context) {
  const value = getFieldValue(field, context);
  if (value === null || value === undefined) return false;
  if (typeof value === 'string') return value.trim().length > 0;
  if (typeof value === 'number') return !Number.isNaN(value);
  if (typeof value === 'boolean') return true;
  if (Array.isArray(value)) return value.length > 0;
  if (typeof value === 'object') return Object.keys(value).length > 0;
  return true;
}

export class ConditionEvaluator {
  static evaluate(condition, context) {
    if (!condition || typeof condition !== 'object' || Array.isArray(condition)) {
      return false;
    }

    const entries = Object.entries(condition);
    if (entries.length === 0) return false;

    const [operator, params] = entries[0];

    switch (operator) {
      case 'exists': return ConditionEvaluator.#opExists(params, context);
      case 'eq': return ConditionEvaluator.#opEq(params, context);
      case 'neq': return ConditionEvaluator.#opNeq(params, context);
      case 'gt': return ConditionEvaluator.#opGt(params, context);
      case 'gte': return ConditionEvaluator.#opGte(params, context);
      case 'lt': return ConditionEvaluator.#opLt(params, context);
      case 'lte': return ConditionEvaluator.#opLte(params, context);
      case 'in': return ConditionEvaluator.#opIn(params, context);
      case 'contains': return ConditionEvaluator.#opContains(params, context);
      case 'matches': return ConditionEvaluator.#opMatches(params, context);
      case 'not': return ConditionEvaluator.#opNot(params, context);
      case 'and': return ConditionEvaluator.#opAnd(params, context);
      case 'or': return ConditionEvaluator.#opOr(params, context);
      default: return false;
    }
  }

  static collectFieldIds(condition) {
    const ids = [];
    if (!condition || typeof condition !== 'object') return ids;

    for (const [operator, params] of Object.entries(condition)) {
      if (ATOMIC_OPERATORS.includes(operator)) {
        if (params && typeof params === 'object' && typeof params.field === 'string') {
          ids.push(params.field);
        }
      } else if (operator === 'not') {
        ids.push(...ConditionEvaluator.collectFieldIds(params));
      } else if (['and', 'or'].includes(operator) && Array.isArray(params)) {
        for (const sub of params) {
          ids.push(...ConditionEvaluator.collectFieldIds(sub));
        }
      }
    }

    return ids;
  }

  static exists(field, context) {
    return existsValue(field, context);
  }

  static collectDepFieldIds(dependsOn) {
    if (Array.isArray(dependsOn)) {
      return dependsOn;
    }
    return ConditionEvaluator.collectFieldIds(dependsOn);
  }

  static #getFieldValue(field, context) {
    return getFieldValue(field, context);
  }

  static #exists(field, context) {
    return existsValue(field, context);
  }

  static #opExists(params, context) {
    if (!params || typeof params !== 'object' || typeof params.field !== 'string') {
      return false;
    }
    return ConditionEvaluator.#exists(params.field, context);
  }

  static #opEq(params, context) {
    if (!params || typeof params !== 'object' || typeof params.field !== 'string') {
      return false;
    }
    const value = ConditionEvaluator.#getFieldValue(params.field, context);
    if (value === undefined) return false;
    if (Array.isArray(value) && Array.isArray(params.value)) {
      if (value.length !== params.value.length) return false;
      for (let i = 0; i < value.length; i++) {
        if (value[i] !== params.value[i]) return false;
      }
      return true;
    }
    return value === params.value;
  }

  static #opNeq(params, context) {
    if (!params || typeof params !== 'object' || typeof params.field !== 'string') {
      return false;
    }
    const value = ConditionEvaluator.#getFieldValue(params.field, context);
    if (value === undefined) return false;
    return value !== params.value;
  }

  static #opGt(params, context) {
    if (!params || typeof params !== 'object' || typeof params.field !== 'string') {
      return false;
    }
    const value = ConditionEvaluator.#getFieldValue(params.field, context);
    if (typeof value !== 'number' || typeof params.value !== 'number') return false;
    return value > params.value;
  }

  static #opGte(params, context) {
    if (!params || typeof params !== 'object' || typeof params.field !== 'string') {
      return false;
    }
    const value = ConditionEvaluator.#getFieldValue(params.field, context);
    if (typeof value !== 'number' || typeof params.value !== 'number') return false;
    return value >= params.value;
  }

  static #opLt(params, context) {
    if (!params || typeof params !== 'object' || typeof params.field !== 'string') {
      return false;
    }
    const value = ConditionEvaluator.#getFieldValue(params.field, context);
    if (typeof value !== 'number' || typeof params.value !== 'number') return false;
    return value < params.value;
  }

  static #opLte(params, context) {
    if (!params || typeof params !== 'object' || typeof params.field !== 'string') {
      return false;
    }
    const value = ConditionEvaluator.#getFieldValue(params.field, context);
    if (typeof value !== 'number' || typeof params.value !== 'number') return false;
    return value <= params.value;
  }

  static #opIn(params, context) {
    if (!params || typeof params !== 'object' || typeof params.field !== 'string') {
      return false;
    }
    const value = ConditionEvaluator.#getFieldValue(params.field, context);
    if (value === undefined) return false;
    if (!Array.isArray(params.values) || params.values.length === 0) return false;
    return params.values.includes(value);
  }

  static #opContains(params, context) {
    if (!params || typeof params !== 'object' || typeof params.field !== 'string') {
      return false;
    }
    const value = ConditionEvaluator.#getFieldValue(params.field, context);
    if (typeof value !== 'string') return false;
    return value.includes(params.value);
  }

  static #opMatches(params, context) {
    if (!params || typeof params !== 'object' || typeof params.field !== 'string') {
      return false;
    }
    const value = ConditionEvaluator.#getFieldValue(params.field, context);
    if (typeof value !== 'string') return false;
    try {
      return new RegExp(params.pattern).test(value);
    } catch {
      return false;
    }
  }

  static #opNot(params, context) {
    if (params === undefined || params === null) return false;
    return !ConditionEvaluator.evaluate(params, context);
  }

  static #opAnd(params, context) {
    if (!Array.isArray(params) || params.length === 0) return false;
    for (const sub of params) {
      if (!ConditionEvaluator.evaluate(sub, context)) {
        return false;
      }
    }
    return true;
  }

  static #opOr(params, context) {
    if (!Array.isArray(params) || params.length === 0) return false;
    for (const sub of params) {
      if (ConditionEvaluator.evaluate(sub, context)) {
        return true;
      }
    }
    return false;
  }
}
