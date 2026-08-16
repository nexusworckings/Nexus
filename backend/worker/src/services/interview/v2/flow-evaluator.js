import { ConditionEvaluator } from './condition-evaluator.js';
import { FIELD_STATES, FIELD_STATE_ORDER } from './constants.js';
import { buildContext, getFieldMap } from './utils.js';
import { FlowError } from './errors.js';

function getFieldIdsByOrder(schema) {
  if (schema.fieldOrder) {
    return schema.fieldOrder;
  }
  return schema.fields.map(f => f.id);
}

function getFieldRequired(field) {
  if (field.validation && typeof field.validation.required === 'boolean') {
    return field.validation.required;
  }
  return field.required !== false;
}

export class FlowEvaluator {
  static evaluate(schema, state) {
    if (!schema || typeof schema !== 'object') {
      throw new FlowError(
        'FLOW_INVALID_SCHEMA',
        'Schema must be a non-null object'
      );
    }
    if (!state || typeof state !== 'object' || typeof state.getCompletedFields !== 'function') {
      throw new FlowError(
        'FLOW_INVALID_STATE',
        'State must be a StateKeeper instance'
      );
    }

    const fieldMap = getFieldMap(schema);
    const fieldIds = getFieldIdsByOrder(schema);
    const context = buildContext(state);
    const completedStateFields = state.getCompletedFields();

    const statuses = Object.create(null);
    const pending = [];
    const blocked = [];
    const skipped = [];
    const completed = [];

    for (const fieldId of fieldIds) {
      const field = fieldMap[fieldId];
      if (!field) {
        throw new FlowError(
          'FLOW_UNKNOWN_FIELD',
          `fieldOrder references unknown field '${fieldId}'`,
          { fieldId }
        );
      }

      const isCompleted = fieldId in completedStateFields;

      if (isCompleted) {
        statuses[fieldId] = FIELD_STATES.COMPLETED;
        completed.push(fieldId);
        continue;
      }

      let evaluateSkipIfResult = false;
      if (field.skipIf !== undefined) {
        try {
          evaluateSkipIfResult = ConditionEvaluator.evaluate(field.skipIf, context);
        } catch (err) {
          throw new FlowError(
            'FLOW_SKIPIF_ERROR',
            `Error evaluating skipIf for field '${fieldId}': ${err.message}`,
            { fieldId, originalError: err.message }
          );
        }
      }

      if (evaluateSkipIfResult) {
        statuses[fieldId] = FIELD_STATES.SKIPPED;
        skipped.push(fieldId);
        continue;
      }

      let dependsOnResult = true;
      if (field.dependsOn !== undefined) {
        try {
          dependsOnResult = FlowEvaluator.#evaluateDependsOn(field.dependsOn, context);
        } catch (err) {
          throw new FlowError(
            'FLOW_DEPENDSON_ERROR',
            `Error evaluating dependsOn for field '${fieldId}': ${err.message}`,
            { fieldId, originalError: err.message }
          );
        }
      }

      if (!dependsOnResult) {
        statuses[fieldId] = FIELD_STATES.BLOCKED;
        blocked.push(fieldId);
        continue;
      }

      statuses[fieldId] = FIELD_STATES.PENDING;
      pending.push(fieldId);
    }

    let totalRequired = 0;
    let completedRequired = 0;
    for (const fieldId of fieldIds) {
      const field = fieldMap[fieldId];
      const status = statuses[fieldId];
      if (getFieldRequired(field) && status !== FIELD_STATES.SKIPPED) {
        totalRequired++;
        if (status === FIELD_STATES.COMPLETED) {
          completedRequired++;
        }
      }
    }

    const complete = FlowEvaluator.#isComplete(completedRequired, totalRequired, schema.minimumRequired);

    const deadlocked = FlowEvaluator.#isDeadlocked(
      pending, blocked, completed, completedRequired, totalRequired, context, fieldMap
    );

    const deadlockReason = deadlocked
      ? FlowEvaluator.#buildDeadlockReason(blocked, fieldMap, context)
      : null;

    const nextField = !complete && !deadlocked && pending.length > 0
      ? pending[0]
      : null;

    const progress = {
      total: fieldIds.length,
      completed: completed.length,
      pending: pending.length,
      blocked: blocked.length,
      skipped: skipped.length,
      requiredCompleted: completedRequired,
      requiredTotal: totalRequired,
      completionPercent: totalRequired > 0
        ? Math.round((completedRequired / totalRequired) * 100)
        : 100,
    };

    return Object.freeze({
      nextField,
      pendingFields: Object.freeze(pending),
      blockedFields: Object.freeze(blocked),
      skippedFields: Object.freeze(skipped),
      completedFields: Object.freeze(completed),
      fieldStatuses: Object.freeze(Object.assign(Object.create(null), statuses)),
      isComplete: complete,
      isDeadlocked: deadlocked,
      deadlockReason,
      progress: Object.freeze(progress),
    });
  }

  static evaluateField(schema, state, fieldId) {
    const result = FlowEvaluator.evaluate(schema, state);
    const status = result.fieldStatuses[fieldId];
    if (!status) {
      throw new FlowError(
        'FLOW_FIELD_NOT_FOUND',
        `Field '${fieldId}' not found in schema`,
        { fieldId }
      );
    }
    return status;
  }

  static getNextField(schema, state) {
    return FlowEvaluator.evaluate(schema, state).nextField;
  }

  static isComplete(schema, state) {
    return FlowEvaluator.evaluate(schema, state).isComplete;
  }

  static isDeadlocked(schema, state) {
    return FlowEvaluator.evaluate(schema, state).isDeadlocked;
  }

  static getDeadlockReason(schema, state) {
    return FlowEvaluator.evaluate(schema, state).deadlockReason;
  }

  static getProgress(schema, state) {
    return FlowEvaluator.evaluate(schema, state).progress;
  }

  static #isComplete(completedRequired, totalRequired, minimumRequired) {
    if (minimumRequired !== undefined) {
      return completedRequired >= minimumRequired;
    }
    return completedRequired >= totalRequired;
  }

  static #isDeadlocked(pending, blocked, completed, completedRequired, totalRequired, context, fieldMap) {
    if (pending.length > 0) return false;
    if (completedRequired >= totalRequired) return false;

    if (blocked.length === 0) {
      if (completed.length < totalRequired) {
        return true;
      }
      return false;
    }

    for (const fieldId of blocked) {
      const field = fieldMap[fieldId];
      if (!field || !field.dependsOn) continue;
      const deps = ConditionEvaluator.collectDepFieldIds(field.dependsOn);
      for (const depId of deps) {
        if (!(depId in context)) {
          return true;
        }
      }
    }

    return false;
  }

  static #buildDeadlockReason(blockedFields, fieldMap, context) {
    const unsatisfied = [];
    for (const fieldId of blockedFields) {
      const field = fieldMap[fieldId];
      if (!field || !field.dependsOn) continue;
      const deps = ConditionEvaluator.collectDepFieldIds(field.dependsOn);
      const missing = [];
      for (const depId of deps) {
        if (!(depId in context)) {
          const depField = fieldMap[depId];
          missing.push(depField ? depField.label || depId : depId);
        }
      }
      if (missing.length > 0) {
        unsatisfied.push({
          field: field.label || fieldId,
          dependsOn: missing,
        });
      }
    }

    if (unsatisfied.length === 0) return null;

    const parts = unsatisfied.map(u =>
      `'${u.field}' requires: ${u.dependsOn.map(d => `'${d}'`).join(', ')}`
    );
    return `The interview is blocked. ${parts.join('. ')}.`;
  }

  static #evaluateDependsOn(dependsOn, context) {
    if (Array.isArray(dependsOn)) {
      if (dependsOn.length === 0) return true;
      for (const depId of dependsOn) {
        if (!ConditionEvaluator.exists(depId, context)) {
          return false;
        }
      }
      return true;
    }
    return ConditionEvaluator.evaluate(dependsOn, context);
  }
}
