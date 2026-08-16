import { deepFreeze } from './utils.js';
import { InterpreterError } from './errors.js';

// ── Intent detection patterns ────────────────────────────────────

const FINISH_PATTERNS = [
  /^(?:quiero\s+)?terminar/i,
  /^(?:quiero\s+)?finalizar/i,
  /^listo/i,
  /^\s*ya/i,
  /^(?:no\s+)?(?:tengo\s+)?m[aá]s/i,
  /^(?:eso\s+es\s+)?todo/i,
  /^(?:ya\s+)?termine/i,
  /^(?:ya\s+)?est[aá]\s+(?:bien|ok|listo)/i,
  /^(?:ya\s+(?:est[aá]|termine))/i,
];

const CANCEL_PATTERNS = [
  /^(?:quiero\s+)?cancelar/i,
  /^(?:me\s+)?arrepie?nt/i,
  /^(?:no\s+)?(?:quiero\s+(?:seguir|continuar|hacer))/i,
  /^(?:d[eé]jemos?|olvid[aá])/i,
  /^(?:no\s+,?\s*)?gracias/i,
  /^(?:cancelar|anular)/i,
];

const HELP_PATTERNS = [
  /^ayuda/i,
  /^ayud[aá]me/i,
  /^(?:no\s+)?entiendo/i,
  /^c[oó]mo\s+(?:funciona|es|se)/i,
  /^qu[eé]\s+(?:es|significa)/i,
  /^expl[ií]came/i,
  /^(?:qu[eé]\s+)?puedo\s+(?:hacer|decir)/i,
];

// ── INTENTS ──────────────────────────────────────────────────────

export const INTENTS = Object.freeze({
  ANSWER: 'ANSWER',
  FINISH: 'FINISH',
  CANCEL: 'CANCEL',
  HELP: 'HELP',
  UNKNOWN: 'UNKNOWN',
});

// ── InterpreterResult ───────────────────────────────────────────

class InterpreterResult {
  #data;

  constructor(data) {
    this.#data = deepFreeze({
      extractedFields: deepFreeze({ ...data.extractedFields }),
      ignoredFields: Object.freeze([...data.ignoredFields]),
      ambiguousFields: Object.freeze(data.ambiguousFields.map(a => deepFreeze({ ...a }))),
      confidence: data.confidence,
      detectedIntent: data.detectedIntent,
      reasoning: data.reasoning,
      unknownFragments: Object.freeze([...data.unknownFragments]),
      aiUsed: data.aiUsed,
      latency: data.latency,
    });

    Object.freeze(this);
  }

  get extractedFields() { return this.#data.extractedFields; }
  get ignoredFields() { return this.#data.ignoredFields; }
  get ambiguousFields() { return this.#data.ambiguousFields; }
  get confidence() { return this.#data.confidence; }
  get detectedIntent() { return this.#data.detectedIntent; }
  get reasoning() { return this.#data.reasoning; }
  get unknownFragments() { return this.#data.unknownFragments; }
  get aiUsed() { return this.#data.aiUsed; }
  get latency() { return this.#data.latency; }

  toJSON() {
    return {
      extractedFields: { ...this.#data.extractedFields },
      ignoredFields: [...this.#data.ignoredFields],
      ambiguousFields: this.#data.ambiguousFields.map(a => ({ ...a })),
      confidence: this.#data.confidence,
      detectedIntent: this.#data.detectedIntent,
      reasoning: this.#data.reasoning,
      unknownFragments: [...this.#data.unknownFragments],
      aiUsed: this.#data.aiUsed,
      latency: this.#data.latency,
    };
  }
}

// ── Interpreter ─────────────────────────────────────────────────

export class Interpreter {
  #aiAdapter;

  constructor(options = {}) {
    this.#aiAdapter = options.aiAdapter;
    if (!this.#aiAdapter || typeof this.#aiAdapter.generate !== 'function') {
      throw new InterpreterError(
        'INT_CONFIGURATION_ERROR',
        'AIAdapter with generate() method is required'
      );
    }
  }

  async interpret(schema, state, message) {
    const startTime = Date.now();

    // ── Stage 1: Validation ───────────────────────────────────

    if (!schema || typeof schema !== 'object') {
      throw new InterpreterError('INT_INVALID_SCHEMA', 'Schema must be a non-null object');
    }
    if (!Array.isArray(schema.fields)) {
      throw new InterpreterError('INT_INVALID_SCHEMA', 'Schema must have a fields array');
    }
    if (!state || typeof state !== 'object' || typeof state.getCompletedFields !== 'function') {
      throw new InterpreterError('INT_INVALID_STATE', 'State must be a StateKeeper instance');
    }
    if (typeof message !== 'string') {
      throw new InterpreterError('INT_INVALID_MESSAGE', 'Message must be a string');
    }
    if (message.trim().length === 0) {
      throw new InterpreterError('INT_EMPTY_MESSAGE', 'Message cannot be empty');
    }

    // ── Stage 2: Build context ────────────────────────────────

    const completedFields = this.#getCompletedFieldMap(state);
    const fieldMap = this.#buildFieldMap(schema);
    const pendingFields = schema.fields.filter(f => !(f.id in completedFields));
    const ignoredFields = schema.fields
      .filter(f => !(f.id in completedFields))
      .map(f => f.id);

    // ── Stage 3: Simple intent detection ──────────────────────

    const simpleIntent = this.#detectSimpleIntent(message);

    if (simpleIntent === INTENTS.HELP || simpleIntent === INTENTS.CANCEL || simpleIntent === INTENTS.FINISH) {
      const latency = Date.now() - startTime;
      return new InterpreterResult({
        extractedFields: {},
        ignoredFields,
        ambiguousFields: [],
        confidence: 1.0,
        detectedIntent: simpleIntent,
        reasoning: simpleIntent === INTENTS.HELP ? 'User requested help' : simpleIntent === INTENTS.FINISH ? 'User wants to finish' : 'User wants to cancel',
        unknownFragments: [],
        aiUsed: false,
        latency,
      });
    }

    // ── Stage 4: Build prompt ─────────────────────────────────

    const contextStr = this.#buildContextString(schema, completedFields, fieldMap, pendingFields);
    const systemPrompt = this.#buildSystemPrompt(schema);
    const userPrompt = this.#buildUserPrompt(contextStr, message);

    // ── Stage 5: Call AIAdapter ───────────────────────────────

    let raw;
    try {
      raw = await this.#aiAdapter.generate(systemPrompt, userPrompt, { temperature: 0 });
    } catch (err) {
      const latency = Date.now() - startTime;
      return this.#handleAIError(err, simpleIntent, ignoredFields, latency);
    }

    const latency = Date.now() - startTime;

    // ── Stage 6: Parse AI response ────────────────────────────

    let parsed;
    try {
      parsed = this.#parseResponse(raw.text);
    } catch (err) {
      return new InterpreterResult({
        extractedFields: {},
        ignoredFields,
        ambiguousFields: [],
        confidence: 0,
        detectedIntent: simpleIntent || INTENTS.UNKNOWN,
        reasoning: `Invalid AI response: ${err.message}`,
        unknownFragments: [],
        aiUsed: true,
        latency,
      });
    }

    // ── Stage 7: Validate and normalize ───────────────────────

    const intent = simpleIntent || parsed.intent || INTENTS.UNKNOWN;
    const extracted = this.#validateAndNormalizeFields(parsed.fields, fieldMap, completedFields);
    const unknownFragments = this.#validateUnknownFragments(parsed.unknownFragments);
    const ambiguousFields = this.#validateAmbiguousFields(parsed.ambiguous, fieldMap);

    // ── Stage 8: Compute confidence ───────────────────────────

    const confidence = this.#computeConfidence(
      extracted, ambiguousFields, unknownFragments, ignoredFields, fieldMap, completedFields
    );

    // ── Stage 9: Reconcile ignored fields ─────────────────────

    const finalIgnored = ignoredFields.filter(id => !(id in extracted));
    const reasoning = typeof parsed.reasoning === 'string' ? parsed.reasoning.trim() : '';

    return new InterpreterResult({
      extractedFields: extracted,
      ignoredFields: finalIgnored,
      ambiguousFields,
      confidence,
      detectedIntent: intent,
      reasoning,
      unknownFragments,
      aiUsed: true,
      latency,
    });
  }

  // ── Private: context building ──────────────────────────────────

  #getCompletedFieldMap(state) {
    const map = Object.create(null);
    const completedFields = state.getCompletedFields();
    for (const [fieldId, entry] of Object.entries(completedFields)) {
      if (entry && 'value' in entry) {
        map[fieldId] = entry.value;
      }
    }
    return map;
  }

  #buildFieldMap(schema) {
    const map = Object.create(null);
    for (const field of schema.fields) {
      map[field.id] = field;
    }
    return map;
  }

  #buildContextString(schema, completedFields, fieldMap, pendingFields) {
    const lines = [];

    if (schema.serviceName) lines.push(`Service: ${schema.serviceName}`);
    if (schema.description) lines.push(`Description: ${schema.description}`);
    lines.push('');

    if (Object.keys(completedFields).length > 0) {
      lines.push('Already answered:');
      for (const [id, value] of Object.entries(completedFields)) {
        const label = fieldMap[id]?.label || id;
        lines.push(`  ${label} (${id}): ${JSON.stringify(value)}`);
      }
      lines.push('');
    }

    if (pendingFields.length > 0) {
      lines.push('Fields to fill:');
      for (const field of pendingFields) {
        const parts = [`  ${field.label} (${field.id})`];
        parts.push(`type: ${field.type}`);

        if (field.options) {
          const opts = field.options.map(o => `${o.value}${o.label !== o.value ? ` (${o.label})` : ''}`);
          parts.push(`options: [${opts.join(', ')}]`);
        }

        if (field.unit) parts.push(`unit: ${field.unit}`);

        const validation = [];
        if (field.validation) {
          if (field.validation.min !== undefined) validation.push(`min: ${field.validation.min}`);
          if (field.validation.max !== undefined) validation.push(`max: ${field.validation.max}`);
          if (field.validation.pattern) validation.push(`pattern: ${field.validation.pattern}`);
          if (field.validation.required !== undefined) validation.push(`required: ${field.validation.required}`);
        }
        if (validation.length > 0) parts.push(`validation: {${validation.join(', ')}}`);

        if (field.default !== undefined) parts.push(`default: ${JSON.stringify(field.default)}`);

        lines.push(parts.join(' | '));
      }
      lines.push('');
    }

    return lines.join('\n');
  }

  // ── Private: simple intent detection ───────────────────────────

  #detectSimpleIntent(message) {
    const trimmed = message.trim();

    for (const pattern of CANCEL_PATTERNS) {
      if (pattern.test(trimmed)) return INTENTS.CANCEL;
    }

    for (const pattern of HELP_PATTERNS) {
      if (pattern.test(trimmed)) return INTENTS.HELP;
    }

    for (const pattern of FINISH_PATTERNS) {
      if (pattern.test(trimmed)) return INTENTS.FINISH;
    }

    return null;
  }

  // ── Private: prompt building ──────────────────────────────────

  #buildSystemPrompt(schema) {
    return `You are a data extraction assistant. Extract structured information from user messages according to the provided service schema.

RULES:
- ONLY extract values that the user EXPLICITLY mentions.
- NEVER invent, guess, or infer values not stated by the user.
- NEVER modify or override already-completed values.
- If the user wants help, set intent to HELP.
- If the user wants to cancel, set intent to CANCEL.
- If the user wants to finish, set intent to FINISH.
- If the user provides information, set intent to ANSWER.
- If the intent is unclear, set intent to UNKNOWN.
- Return ONLY valid JSON. No markdown, no code fences, no extra text.
- The keys in the "fields" object MUST be the EXACT \\\"field.id\\\" values shown in the schema context (e.g. \\\"clientName\\\", \\\"clientPhone\\\", \\\"device\\\", \\\"problem\\\").
- DO NOT use generic labels such as \\\"name\\\", \\\"phone\\\", \\\"equipment\\\", \\\"issue\\\" or any other synonym as field keys. Only the schema IDs are valid.

CORRECT example:
{
  "intent": "ANSWER",
  "reasoning": "User provided name, phone, device and problem",
  "fields": {
    "clientName": "Juan",
    "clientPhone": "3405123456",
    "device": "Samsung S23",
    "problem": "se cayó al agua"
  },
  "ambiguous": [],
  "unknownFragments": []
}

INCORRECT example (never do this):
{
  "fields": {
    "name": "Juan",
    "phone": "3405123456",
    "equipment": "Samsung S23",
    "issue": "se cayó al agua"
  }
}

JSON format:
{
  "intent": "ANSWER|FINISH|CANCEL|HELP|UNKNOWN",
  "reasoning": "Brief explanation of what was extracted",
  "fields": { "exact_field_id_from_schema": "extracted_value" },
  "ambiguous": [
    { "fieldId": "exact_field_id_from_schema", "possibleValues": ["val1", "val2"], "originalText": "what user said" }
  ],
  "unknownFragments": ["text not matching any field"]
}`;
  }

  #buildUserPrompt(contextStr, message) {
    return `${contextStr}\nUser message: ${message}`;
  }

  // ── Private: response parsing ─────────────────────────────────

  #parseResponse(text) {
    if (typeof text !== 'string' || text.trim().length === 0) {
      throw new InterpreterError('INT_EMPTY_RESPONSE', 'AI returned empty response');
    }

    let cleaned = text.trim();

    const jsonMatch = cleaned.match(/```(?:json)?\s*\n?([\s\S]*?)```/);
    if (jsonMatch) {
      cleaned = jsonMatch[1].trim();
    }

    let parsed;
    try {
      parsed = JSON.parse(cleaned);
    } catch {
      throw new InterpreterError('INT_INVALID_JSON', 'Response is not valid JSON');
    }

    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      throw new InterpreterError('INT_INVALID_RESPONSE', 'Response must be a JSON object');
    }

    return {
      intent: typeof parsed.intent === 'string' ? parsed.intent : null,
      reasoning: typeof parsed.reasoning === 'string' ? parsed.reasoning : '',
      fields: parsed.fields && typeof parsed.fields === 'object' && !Array.isArray(parsed.fields)
        ? parsed.fields
        : {},
      ambiguous: Array.isArray(parsed.ambiguous) ? parsed.ambiguous : [],
      unknownFragments: Array.isArray(parsed.unknownFragments) ? parsed.unknownFragments : [],
    };
  }

  // ── Private: field validation and normalization ────────────────

  #validateAndNormalizeFields(fields, fieldMap, completedFields) {
    const result = Object.create(null);

    for (const [fieldId, rawValue] of Object.entries(fields)) {
      if (fieldId in completedFields) continue;

      const field = fieldMap[fieldId];
      if (!field) continue;

      const normalized = this.#normalizeFieldValue(field, rawValue);
      if (normalized !== undefined && normalized !== null) {
        result[fieldId] = normalized;
      }
    }

    return result;
  }

  #normalizeFieldValue(field, value) {
    switch (field.type) {
      case 'text':
      case 'phone':
      case 'email':
        if (typeof value === 'string' && value.trim().length > 0) return value.trim();
        return undefined;

      case 'number':
        if (typeof value === 'number' && !Number.isNaN(value)) return value;
        if (typeof value === 'string') {
          const parsed = Number(value.trim());
          if (!Number.isNaN(parsed)) return parsed;
        }
        return undefined;

      case 'boolean':
        if (value === true || value === false) return value;
        if (typeof value === 'string') {
          const lower = value.trim().toLowerCase();
          if (lower === 'true' || lower === 'sí' || lower === 'si' || lower === 'yes') return true;
          if (lower === 'false' || lower === 'no') return false;
        }
        return undefined;

      case 'select':
        if (typeof value !== 'string') return undefined;
        return this.#matchOption(value, field.options);

      case 'multiselect':
        if (!Array.isArray(value)) {
          if (typeof value === 'string') {
            return this.#matchOption(value, field.options)
              ? [this.#matchOption(value, field.options)]
              : undefined;
          }
          return undefined;
        }
        const normalized = [];
        for (const item of value) {
          if (typeof item === 'string') {
            const match = this.#matchOption(item, field.options);
            if (match) normalized.push(match);
          }
        }
        return normalized.length > 0 ? normalized : undefined;

      default:
        return value;
    }
  }

  #matchOption(value, options) {
    if (!options || !Array.isArray(options)) return null;

    const trimmed = value.trim();

    const exact = options.find(o => o.value === trimmed);
    if (exact) return exact.value;

    const lowerValue = trimmed.toLowerCase();
    const byLabel = options.find(o =>
      o.label && o.label.toLowerCase() === lowerValue
    );
    if (byLabel) return byLabel.value;

    const byPartial = options.find(o =>
      o.value.toLowerCase().includes(lowerValue) ||
      (o.label && o.label.toLowerCase().includes(lowerValue))
    );
    if (byPartial) return byPartial.value;

    return null;
  }

  // ── Private: validation helpers ────────────────────────────────

  #validateUnknownFragments(fragments) {
    if (!Array.isArray(fragments)) return [];
    return fragments.filter(f => typeof f === 'string' && f.trim().length > 0).map(f => f.trim());
  }

  #validateAmbiguousFields(ambiguous, fieldMap) {
    if (!Array.isArray(ambiguous)) return [];
    return ambiguous
      .filter(a => {
        if (!a || typeof a !== 'object') return false;
        const fieldId = a.fieldId || a.field;
        if (typeof fieldId !== 'string') return false;
        if (!fieldMap[fieldId]) return false;
        return true;
      })
      .map(a => ({
        fieldId: a.fieldId || a.field,
        possibleValues: Array.isArray(a.possibleValues) ? a.possibleValues : [],
        originalText: typeof a.originalText === 'string' ? a.originalText : '',
      }));
  }

  // ── Private: confidence calculation ────────────────────────────

  #computeConfidence(extracted, ambiguousFields, unknownFragments, ignoredFields, fieldMap, completedFields) {
    const totalExtractable = Object.keys(fieldMap).length - Object.keys(completedFields).length;
    if (totalExtractable === 0) return 1.0;

    const extractedCount = Object.keys(extracted).length;
    const ambiguousCount = ambiguousFields.length;
    const unknownCount = unknownFragments.length;

    let score = extractedCount / totalExtractable;
    score -= ambiguousCount * 0.15;
    score -= unknownCount * 0.1;

    let bonus = 0;
    for (const [fieldId, value] of Object.entries(extracted)) {
      const field = fieldMap[fieldId];
      if (!field) continue;
      if (field.options) {
        const match = field.options.find(o => o.value === value);
        if (match) bonus += 0.05;
      }
      if (field.type === 'number' && typeof value === 'number') bonus += 0.05;
    }
    score += bonus;

    return Math.max(0, Math.min(1, Math.round(score * 100) / 100));
  }

  // ── Private: error handling ────────────────────────────────────

  #handleAIError(err, simpleIntent, ignoredFields, latency) {
    const intent = simpleIntent || INTENTS.UNKNOWN;
    let reasoning = '';

    if (err.code === 'AI_TIMEOUT') {
      reasoning = 'AI request timed out';
    } else if (err.code === 'AI_RATE_LIMIT') {
      reasoning = 'Rate limited by AI provider';
    } else if (err.code === 'AI_NETWORK_ERROR') {
      reasoning = 'Network error during AI request';
    } else if (err.code === 'AI_AUTH_ERROR' || err.code === 'AI_CONFIGURATION_ERROR') {
      reasoning = 'AI configuration error';
    } else {
      reasoning = `AI request failed: ${err.message}`;
    }

    return new InterpreterResult({
      extractedFields: {},
      ignoredFields,
      ambiguousFields: [],
      confidence: 0,
      detectedIntent: intent,
      reasoning,
      unknownFragments: [],
      aiUsed: true,
      latency,
    });
  }
}
