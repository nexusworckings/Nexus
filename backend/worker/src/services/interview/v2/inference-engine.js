import { ConditionEvaluator } from './condition-evaluator.js';
import { INFERENCE } from './constants.js';
import { buildContext, buildSources, deepClone, deepEqual, deepFreeze, getFieldMap } from './utils.js';
import { InferenceError } from './errors.js';

export class InferenceResult {
  #data;

  constructor(data) { this.#data = data; }

  get inferredValues() { return this.#data.inferredValues; }
  get appliedRules() { return this.#data.appliedRules; }
  get rejectedRules() { return this.#data.rejectedRules; }
  get conflicts() { return this.#data.conflicts; }
  get iterations() { return this.#data.iterations; }
  get reachedFixedPoint() { return this.#data.reachedFixedPoint; }
  get stoppedByIterationLimit() { return this.#data.stoppedByIterationLimit; }

  hasConflicts() { return this.#data.conflicts.length > 0; }

  explain(fieldId) {
    const applied = this.#data.appliedRules.filter(r => r.fieldId === fieldId);
    const rejected = this.#data.rejectedRules.filter(r => r.fieldId === fieldId);
    const conflicts = this.#data.conflicts.filter(c => c.field === fieldId);
    const lines = [];

    for (const r of applied) {
      lines.push(`Applied: inference[${r.ruleIndex}] → '${fieldId}' = ${JSON.stringify(r.value)} (priority=${r.priority}, overridable=${r.overridable})`);
      if (r.reason) lines.push(`  Reason: ${r.reason}`);
    }
    for (const r of rejected) {
      lines.push(`Rejected: inference[${r.ruleIndex}] → '${fieldId}' = ${JSON.stringify(r.value)} (${r.reason})`);
    }
    for (const c of conflicts) {
      lines.push(`Conflict: inference[${c.ruleA}] vs inference[${c.ruleB}] — ${c.reason}`);
    }
    if (lines.length === 0) {
      lines.push(fieldId in this.#data.inferredValues
        ? `'${fieldId}' = ${JSON.stringify(this.#data.inferredValues[fieldId])}`
        : `No inference produced for '${fieldId}'`);
    }
    return lines.join('\n');
  }

  toJSON() {
    return deepClone({
      inferredValues: this.#data.inferredValues,
      appliedRules: this.#data.appliedRules,
      rejectedRules: this.#data.rejectedRules,
      conflicts: this.#data.conflicts,
      iterations: this.#data.iterations,
      reachedFixedPoint: this.#data.reachedFixedPoint,
      stoppedByIterationLimit: this.#data.stoppedByIterationLimit,
    });
  }
}

export class InferenceEngine {
  static infer(schema, state) {
    if (!schema || typeof schema !== 'object') {
      throw new InferenceError('INF_INVALID_SCHEMA', 'Schema must be a non-null object');
    }
    if (!state || typeof state !== 'object' || typeof state.getCompletedFields !== 'function') {
      throw new InferenceError('INF_INVALID_STATE', 'State must be a StateKeeper instance');
    }

    const inferences = schema.inferences;
    if (!inferences || !Array.isArray(inferences) || inferences.length === 0) {
      return new InferenceResult(deepFreeze({
        inferredValues: Object.freeze(Object.create(null)),
        appliedRules: Object.freeze([]),
        rejectedRules: Object.freeze([]),
        conflicts: Object.freeze([]),
        iterations: 0,
        reachedFixedPoint: true,
        stoppedByIterationLimit: false,
      }));
    }

    const fieldMap = getFieldMap(schema);
    const sortedIndices = inferences
      .map((rule, i) => ({ rule, index: i }))
      .sort((a, b) => {
        const pa = a.rule.priority || 0;
        const pb = b.rule.priority || 0;
        if (pa !== pb) return pb - pa;
        return a.index - b.index;
      });

    let context = buildContext(state);
    const sources = buildSources(state);
    const appliedRules = [];
    const rejectedRules = [];
    const conflicts = [];
    const tempInferred = Object.create(null);
    const lockedFields = new Set();
    let iterations = 0;
    let reachedFixedPoint = false;
    let stoppedByIterationLimit = false;

    while (iterations < INFERENCE.MAX_ITERATIONS) {
      iterations++;
      let newValues = false;
      const beforeCount = Object.keys(tempInferred).length;

      for (const { rule, index } of sortedIndices) {
        let whenTrue;
        try {
          whenTrue = ConditionEvaluator.evaluate(rule.when, context);
        } catch (err) {
          rejectedRules.push(InferenceEngine.#makeRejected(index, null, null,
            `Error evaluating condition: ${err.message}`, rule));
          continue;
        }

        if (!whenTrue) {
          rejectedRules.push(InferenceEngine.#makeRejected(index, null, null,
            'Condition not met', rule));
          continue;
        }

        for (const [targetId, thenEntry] of Object.entries(rule.then || {})) {
          if (!fieldMap[targetId]) {
            rejectedRules.push(InferenceEngine.#makeRejected(index, targetId, null,
              `Target field '${targetId}' not found in schema`, rule));
            continue;
          }

          const inferredValue = thenEntry.value;
          const isOverridable = rule.overridable !== false;
          const rulePriority = rule.priority || 0;

          // Skip if this exact inference already set in a previous iteration
          if (targetId in tempInferred && deepEqual(tempInferred[targetId], inferredValue)) {
            continue;
          }

          // User ALWAYS wins. Inferences never overwrite user values.
          if (sources[targetId] === 'user') {
            rejectedRules.push(InferenceEngine.#makeRejected(index, targetId, inferredValue,
              'User already has a value for this field — user wins', rule));
            continue;
          }

          // Another inference already set for this target
          if (targetId in tempInferred) {
            const existingValue = tempInferred[targetId];
            const existingLocked = lockedFields.has(targetId);
            const existing = InferenceEngine.#findLastApplied(appliedRules, targetId);
            const existingPrio = existing?.priority ?? 0;

            if (existingLocked && rulePriority < existingPrio) {
              conflicts.push(InferenceEngine.#makeConflict(targetId, existing?.ruleIndex ?? index,
                index, existingValue, inferredValue, existingPrio, rulePriority,
                'Cannot override locked inference with lower priority'));
              rejectedRules.push(InferenceEngine.#makeRejected(index, targetId, inferredValue,
                'Target field has a locked inference with higher priority', rule));
              continue;
            }

            if (rulePriority < existingPrio) {
              rejectedRules.push(InferenceEngine.#makeRejected(index, targetId, inferredValue,
                `Existing inference has higher priority (${existingPrio} > ${rulePriority})`, rule));
              continue;
            }

            if (rulePriority === existingPrio) {
              if (index > existing.ruleIndex) {
                conflicts.push(InferenceEngine.#makeConflict(targetId, existing.ruleIndex,
                  index, existingValue, inferredValue, existingPrio, rulePriority,
                  'Equal priority tie — later rule wins'));
                InferenceEngine.#recordApplied(appliedRules, index, targetId, inferredValue,
                  rulePriority, isOverridable, rule.reason);
                newValues = true;
                InferenceEngine.#setTemp(tempInferred, lockedFields, targetId, inferredValue, isOverridable);
                continue;
              }
              conflicts.push(InferenceEngine.#makeConflict(targetId, existing.ruleIndex,
                index, existingValue, inferredValue, existingPrio, rulePriority,
                'Equal priority tie — earlier rule wins'));
              rejectedRules.push(InferenceEngine.#makeRejected(index, targetId, inferredValue,
                'Earlier rule wins at equal priority', rule));
              continue;
            }

            // rulePriority > existingPrio: override
            conflicts.push(InferenceEngine.#makeConflict(targetId, existing.ruleIndex,
              index, existingValue, inferredValue, existingPrio, rulePriority,
              'Overridden by higher priority rule'));
            InferenceEngine.#recordApplied(appliedRules, index, targetId, inferredValue,
              rulePriority, isOverridable, rule.reason);
            newValues = true;
            InferenceEngine.#setTemp(tempInferred, lockedFields, targetId, inferredValue, isOverridable);
            continue;
          }

          // No existing inference: first application
          InferenceEngine.#recordApplied(appliedRules, index, targetId, inferredValue,
            rulePriority, isOverridable, rule.reason);
          newValues = true;
          InferenceEngine.#setTemp(tempInferred, lockedFields, targetId, inferredValue, isOverridable);
        }
      }

      const afterCount = Object.keys(tempInferred).length;
      newValues = newValues || (afterCount > beforeCount);
      context = Object.assign(Object.create(null), buildContext(state), deepClone(tempInferred));

      if (!newValues) { reachedFixedPoint = true; break; }
    }

    if (!reachedFixedPoint) stoppedByIterationLimit = true;

    const inferredValues = Object.create(null);
    for (const [fieldId, value] of Object.entries(tempInferred)) {
      if (!(fieldId in sources)) inferredValues[fieldId] = deepClone(value);
    }

    return new InferenceResult(deepFreeze({
      inferredValues: deepFreeze(Object.assign(Object.create(null), inferredValues)),
      appliedRules: deepFreeze(appliedRules.map(r => deepFreeze(r))),
      rejectedRules: deepFreeze(rejectedRules.map(r => deepFreeze(r))),
      conflicts: deepFreeze(conflicts.map(c => deepFreeze(c))),
      iterations,
      reachedFixedPoint,
      stoppedByIterationLimit,
    }));
  }

  static inferField(schema, state, fieldId) {
    const result = InferenceEngine.infer(schema, state);
    if (fieldId in result.inferredValues) return deepClone(result.inferredValues[fieldId]);
    return undefined;
  }

  // ── Private helpers ──────────────────────────────────────

  static #makeRejected(ruleIndex, fieldId, value, reason, rule) {
    return { ruleIndex, fieldId, value: value !== null ? deepClone(value) : null,
      reason, priority: (rule?.priority || 0), overridable: (rule?.overridable !== false) };
  }

  static #makeConflict(field, ruleA, ruleB, valueA, valueB, priorityA, priorityB, reason) {
    return { field, ruleA, ruleB, valueA: deepClone(valueA), valueB: deepClone(valueB),
      priorityA, priorityB, reason };
  }

  static #recordApplied(appliedRules, ruleIndex, targetId, value, priority, overridable, reason) {
    appliedRules.push({ ruleIndex, fieldId: targetId, value: deepClone(value),
      priority, overridable, reason: reason || null });
  }

  static #setTemp(tempInferred, lockedFields, targetId, value, isOverridable) {
    tempInferred[targetId] = deepClone(value);
    if (!isOverridable) lockedFields.add(targetId);
  }

  static #findLastApplied(appliedRules, targetId) {
    for (let i = appliedRules.length - 1; i >= 0; i--) {
      if (appliedRules[i].fieldId === targetId) return appliedRules[i];
    }
    return null;
  }
}
