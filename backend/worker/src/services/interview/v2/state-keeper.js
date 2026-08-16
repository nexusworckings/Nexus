import crypto from 'node:crypto';

import { STATE } from './constants.js';
import { deepClone, deepFreeze, nowISO } from './utils.js';
import { StateError } from './errors.js';

function generateId() {
  return crypto.randomUUID();
}

export class StateKeeper {
  #state;

  constructor(state) {
    this.#state = state;
  }

  static create(serviceId, schemaVersion, options = {}) {
    const interviewId = options.interviewId || generateId();
    const timestamp = nowISO();

    const state = {
      stateVersion: STATE.VERSION,
      interviewId,
      serviceId,
      schemaVersion,
      createdAt: timestamp,
      updatedAt: timestamp,
      version: 1,
      completedFields: {},
      history: [
        { type: 'state_created', timestamp, version: 1 },
      ],
      metadata: { ...(options.metadata || {}) },
    };

    return new StateKeeper(state);
  }

  static fromJSON(json) {
    if (!json || typeof json !== 'object') {
      throw new StateError(
        'STATE_INVALID_JSON',
        'State must be a non-null object'
      );
    }

    const required = ['interviewId', 'serviceId', 'schemaVersion', 'createdAt', 'updatedAt'];
    for (const key of required) {
      if (typeof json[key] !== 'string' || json[key].length === 0) {
        throw new StateError(
          'STATE_MISSING_FIELD',
          `Missing or empty required field: ${key}`,
          { key }
        );
      }
    }

    if (typeof json.version !== 'number' || json.version < 1 || !Number.isInteger(json.version)) {
      throw new StateError(
        'STATE_INVALID_VERSION',
        `Version must be a positive integer, got ${json.version}`,
        { version: json.version }
      );
    }

    if (!Array.isArray(json.history)) {
      throw new StateError(
        'STATE_INVALID_HISTORY',
        'History must be an array'
      );
    }

    const state = deepClone(json);
    return new StateKeeper(state);
  }

  // ── Identity getters ──────────────────────────────────────────

  getInterviewId() {
    return this.#state.interviewId;
  }

  getServiceId() {
    return this.#state.serviceId;
  }

  getSchemaVersion() {
    return this.#state.schemaVersion;
  }

  getCreatedAt() {
    return this.#state.createdAt;
  }

  getUpdatedAt() {
    return this.#state.updatedAt;
  }

  getVersion() {
    return this.#state.version;
  }

  // ── Immutable state snapshot ──────────────────────────────────

  getState() {
    return deepFreeze(deepClone(this.#state));
  }

  toJSON() {
    return deepClone(this.#state);
  }

  // ── Completed fields getters ──────────────────────────────────

  getCompletedFields() {
    return deepFreeze(deepClone(this.#state.completedFields));
  }

  getFieldValue(fieldId) {
    const entry = this.#state.completedFields[fieldId];
    return entry ? deepClone(entry.value) : undefined;
  }

  getFieldSource(fieldId) {
    const entry = this.#state.completedFields[fieldId];
    return entry ? entry.source : null;
  }

  isFieldCompleted(fieldId) {
    return fieldId in this.#state.completedFields;
  }

  isFieldInferred(fieldId) {
    const entry = this.#state.completedFields[fieldId];
    return entry ? entry.source === 'inferred' : false;
  }

  isFieldUserProvided(fieldId) {
    const entry = this.#state.completedFields[fieldId];
    return entry ? entry.source === 'user' : false;
  }

  getFieldInferenceId(fieldId) {
    const entry = this.#state.completedFields[fieldId];
    return entry ? entry.inferenceId || null : null;
  }

  // ── History ───────────────────────────────────────────────────

  getHistory() {
    return deepFreeze(deepClone(this.#state.history));
  }

  // ── Metadata ──────────────────────────────────────────────────

  getMetadata() {
    return deepFreeze(deepClone(this.#state.metadata));
  }

  setMetadata(key, value) {
    if (typeof key !== 'string' || key.length === 0) {
      throw new StateError(
        'STATE_INVALID_METADATA_KEY',
        'Metadata key must be a non-empty string'
      );
    }

    this.#state.metadata[key] = deepClone(value);
  }

  // ── Mutators: user values ─────────────────────────────────────

  setUserValue(fieldId, value) {
    this.#validateFieldId(fieldId);

    const previous = this.#state.completedFields[fieldId];
    const timestamp = nowISO();
    this.#state.version++;
    this.#state.updatedAt = timestamp;

    const entry = {
      type: previous ? 'user_value_changed' : 'user_value_set',
      fieldId,
      value: deepClone(value),
      timestamp,
      version: this.#state.version,
      source: 'user',
    };

    if (previous) {
      entry.previousValue = deepClone(previous.value);
      entry.previousSource = previous.source;
      if (previous.inferenceId) {
        entry.previousInferenceId = previous.inferenceId;
      }
    }

    this.#state.history.push(entry);

    this.#state.completedFields[fieldId] = {
      value: deepClone(value),
      source: 'user',
      timestamp,
      inferenceId: null,
    };

    return {
      changed: true,
      previousSource: previous ? previous.source : null,
    };
  }

  // ── Mutators: inferred values ─────────────────────────────────

  setInferredValue(fieldId, value, inferenceId = null) {
    this.#validateFieldId(fieldId);

    const previous = this.#state.completedFields[fieldId];
    const timestamp = nowISO();
    this.#state.version++;
    this.#state.updatedAt = timestamp;

    const entry = {
      type: 'inferred_value_set',
      fieldId,
      value: deepClone(value),
      timestamp,
      version: this.#state.version,
      source: 'inferred',
    };

    if (inferenceId) {
      entry.inferenceId = inferenceId;
    }

    if (previous) {
      entry.previousValue = deepClone(previous.value);
      entry.previousSource = previous.source;
      if (previous.inferenceId) {
        entry.previousInferenceId = previous.inferenceId;
      }
    }

    this.#state.history.push(entry);

    this.#state.completedFields[fieldId] = {
      value: deepClone(value),
      source: 'inferred',
      timestamp,
      inferenceId,
    };

    return {
      changed: true,
      previousSource: previous ? previous.source : null,
    };
  }

  retractInference(fieldId) {
    this.#validateFieldId(fieldId);

    const entry = this.#state.completedFields[fieldId];
    if (!entry) {
      throw new StateError(
        'STATE_FIELD_NOT_FOUND',
        `Cannot retract: field '${fieldId}' is not completed`,
        { fieldId }
      );
    }

    if (entry.source !== 'inferred') {
      throw new StateError(
        'STATE_FIELD_NOT_INFERRED',
        `Cannot retract: field '${fieldId}' value was provided by user, not inferred`,
        { fieldId, source: entry.source }
      );
    }

    const timestamp = nowISO();
    this.#state.version++;
    this.#state.updatedAt = timestamp;

    this.#state.history.push({
      type: 'inference_retracted',
      fieldId,
      value: deepClone(entry.value),
      inferenceId: entry.inferenceId,
      timestamp,
      version: this.#state.version,
    });

    delete this.#state.completedFields[fieldId];

    return { retracted: true, fieldId };
  }

  retractAllInferences() {
    const retracted = [];

    for (const [fieldId, entry] of Object.entries(this.#state.completedFields)) {
      if (entry.source === 'inferred') {
        const timestamp = nowISO();
        this.#state.version++;
        this.#state.updatedAt = timestamp;

        this.#state.history.push({
          type: 'inference_retracted',
          fieldId,
          value: deepClone(entry.value),
          inferenceId: entry.inferenceId,
          timestamp,
          version: this.#state.version,
        });

        delete this.#state.completedFields[fieldId];
        retracted.push(fieldId);
      }
    }

    return retracted;
  }

  retractInferencesByRule(inferenceId) {
    if (!inferenceId || typeof inferenceId !== 'string') {
      throw new StateError(
        'STATE_INVALID_INFERENCE_ID',
        'inferenceId must be a non-empty string'
      );
    }

    const retracted = [];

    for (const [fieldId, entry] of Object.entries(this.#state.completedFields)) {
      if (entry.source === 'inferred' && entry.inferenceId === inferenceId) {
        const timestamp = nowISO();
        this.#state.version++;
        this.#state.updatedAt = timestamp;

        this.#state.history.push({
          type: 'inference_retracted',
          fieldId,
          value: deepClone(entry.value),
          inferenceId,
          timestamp,
          version: this.#state.version,
        });

        delete this.#state.completedFields[fieldId];
        retracted.push(fieldId);
      }
    }

    return retracted;
  }

  // ── Response change ───────────────────────────────────────────

  changeResponse(fieldId, newValue) {
    this.#validateFieldId(fieldId);

    const previous = this.#state.completedFields[fieldId];
    if (!previous) {
      throw new StateError(
        'STATE_FIELD_NOT_FOUND',
        `Cannot change response: field '${fieldId}' has no value to change`,
        { fieldId }
      );
    }

    const timestamp = nowISO();
    this.#state.version++;
    this.#state.updatedAt = timestamp;

    this.#state.history.push({
      type: 'response_changed',
      fieldId,
      value: deepClone(newValue),
      previousValue: deepClone(previous.value),
      previousSource: previous.source,
      previousInferenceId: previous.inferenceId || undefined,
      timestamp,
      version: this.#state.version,
      source: 'user',
    });

    this.#state.completedFields[fieldId] = {
      value: deepClone(newValue),
      source: 'user',
      timestamp,
      inferenceId: null,
    };

    return {
      changed: true,
      previousValue: deepClone(previous.value),
      previousSource: previous.source,
    };
  }

  // ── Reset ─────────────────────────────────────────────────────

  reset() {
    const timestamp = nowISO();
    this.#state.version++;
    this.#state.updatedAt = timestamp;

    const previousFields = deepClone(this.#state.completedFields);

    this.#state.history.push({
      type: 'state_reset',
      timestamp,
      version: this.#state.version,
      previousCompletedFields: previousFields,
    });

    this.#state.completedFields = {};

    return { reset: true, clearedFields: Object.keys(previousFields) };
  }

  // ── Internal helpers ──────────────────────────────────────────

  #validateFieldId(fieldId) {
    if (typeof fieldId !== 'string' || fieldId.length === 0) {
      throw new StateError(
        'STATE_INVALID_FIELD_ID',
        'Field ID must be a non-empty string',
        { fieldId }
      );
    }
  }
}
