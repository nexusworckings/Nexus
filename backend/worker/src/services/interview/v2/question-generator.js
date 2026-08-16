import { deepFreeze } from './utils.js';
import { InterpreterError } from './errors.js';

// ── QuestionResult ─────────────────────────────────────────────

class QuestionResult {
  #data;

  constructor(data) {
    this.#data = deepFreeze({
      question: 'question' in data ? data.question : null,
      fieldId: 'fieldId' in data ? data.fieldId : null,
      questionType: data.questionType || null,
      choices: data.choices ? Object.freeze(data.choices.map(c => deepFreeze({ ...c }))) : null,
      placeholder: 'placeholder' in data ? data.placeholder : null,
      validation: data.validation ? deepFreeze({ ...data.validation }) : null,
      explanation: 'explanation' in data ? data.explanation : null,
      retry: data.retry === true,
      confidence: data.confidence ?? 1,
      aiUsed: data.aiUsed === true,
      latency: data.latency ?? 0,
    });

    Object.freeze(this);
  }

  get question() { return this.#data.question; }
  get fieldId() { return this.#data.fieldId; }
  get questionType() { return this.#data.questionType; }
  get choices() { return this.#data.choices; }
  get placeholder() { return this.#data.placeholder; }
  get validation() { return this.#data.validation; }
  get explanation() { return this.#data.explanation; }
  get retry() { return this.#data.retry; }
  get confidence() { return this.#data.confidence; }
  get aiUsed() { return this.#data.aiUsed; }
  get latency() { return this.#data.latency; }

  toJSON() {
    return {
      question: this.#data.question,
      fieldId: this.#data.fieldId,
      questionType: this.#data.questionType,
      choices: this.#data.choices ? this.#data.choices.map(c => ({ ...c })) : null,
      placeholder: this.#data.placeholder,
      validation: this.#data.validation ? { ...this.#data.validation } : null,
      explanation: this.#data.explanation,
      retry: this.#data.retry,
      confidence: this.#data.confidence,
      aiUsed: this.#data.aiUsed,
      latency: this.#data.latency,
    };
  }
}

// ── QuestionGenerator ─────────────────────────────────────────

export class QuestionGenerator {
  #aiAdapter;

  constructor(options = {}) {
    this.#aiAdapter = options.aiAdapter || null;
  }

  async generate(schema, state, flowResult, interpreterResult) {
    const startTime = Date.now();

    // ── Stage 1: Validation ───────────────────────────────────

    if (!schema || typeof schema !== 'object') {
      throw new InterpreterError('QG_INVALID_SCHEMA', 'Schema must be a non-null object');
    }
    if (!Array.isArray(schema.fields)) {
      throw new InterpreterError('QG_INVALID_SCHEMA', 'Schema must have a fields array');
    }
    if (!state || typeof state !== 'object' || typeof state.getCompletedFields !== 'function') {
      throw new InterpreterError('QG_INVALID_STATE', 'State must be a StateKeeper instance');
    }
    if (!flowResult || typeof flowResult !== 'object') {
      throw new InterpreterError('QG_INVALID_FLOW_RESULT', 'FlowResult must be a non-null object');
    }
    if (!interpreterResult || typeof interpreterResult !== 'object') {
      throw new InterpreterError('QG_INVALID_INTERPRETER_RESULT', 'InterpreterResult must be a non-null object');
    }

    const nextField = flowResult.nextField;

    // ── Stage 2: Complete interview ─────────────────────────

    if (nextField === null || nextField === undefined) {
      const latency = Date.now() - startTime;
      return new QuestionResult({
        question: null,
        fieldId: null,
        questionType: 'message',
        choices: null,
        placeholder: null,
        validation: null,
        explanation: null,
        retry: false,
        confidence: 1,
        aiUsed: false,
        latency,
      });
    }

    // ── Stage 3: Find field ─────────────────────────────────

    const field = schema.fields.find(f => f.id === nextField);
    if (!field) {
      throw new InterpreterError(
        'QG_FIELD_NOT_FOUND',
        `Field '${nextField}' referenced by flowResult.nextField not found in schema`
      );
    }

    // ── Stage 4: Determine retry ────────────────────────────

    const wasExtracted = nextField in (interpreterResult.extractedFields || {});
    const isAmbiguous = (interpreterResult.ambiguousFields || [])
      .some(a => a.fieldId === nextField);
    const hasValidation = this.#fieldHasValidation(field);
    const retry = (wasExtracted || isAmbiguous) && hasValidation;

    // ── Stage 5: Generate question ──────────────────────────

    let question;
    let aiUsed = false;
    let explanation = null;

    if (retry) {
      const result = await this.#generateRetryQuestion(field, interpreterResult, startTime);
      question = result.question;
      aiUsed = result.aiUsed;
    } else {
      question = field.question || `¿${field.label}?`;
    }

    // ── Stage 6: Generate explanation ───────────────────────

    const needsExplanation = (interpreterResult.ambiguousFields || []).length > 0
      || (isAmbiguous && retry);

    if (needsExplanation && !explanation) {
      explanation = this.#generateExplanation(field, schema);
    }

    // ── Stage 7: Build choices ──────────────────────────────

    let choices = null;
    if (field.type === 'select' || field.type === 'multiselect') {
      if (field.options && Array.isArray(field.options) && field.options.length > 0) {
        choices = field.options.map(o => ({
          value: o.value,
          label: o.label || o.value,
        }));
      }
    }

    // ── Stage 8: Build placeholder ──────────────────────────

    let placeholder = field.placeholder || null;
    if (!placeholder) {
      placeholder = this.#generatePlaceholder(field);
    }

    // ── Stage 9: Build validation ───────────────────────────

    const validation = this.#buildValidation(field);

    // ── Stage 10: Calculate confidence ──────────────────────

    const confidence = this.#calculateConfidence(field, retry, aiUsed, needsExplanation);
    const latency = Date.now() - startTime;

    return new QuestionResult({
      question,
      fieldId: nextField,
      questionType: field.type,
      choices,
      placeholder,
      validation,
      explanation,
      retry,
      confidence,
      aiUsed,
      latency,
    });
  }

  // ── Private: field helpers ─────────────────────────────────

  #fieldHasValidation(field) {
    if (field.validation && typeof field.validation === 'object') {
      const v = field.validation;
      if (v.required === true) return true;
      if (typeof v.min === 'number') return true;
      if (typeof v.max === 'number') return true;
      if (typeof v.minLength === 'number') return true;
      if (typeof v.maxLength === 'number') return true;
      if (typeof v.pattern === 'string' && v.pattern.length > 0) return true;
    }
    return false;
  }

  #buildValidation(field) {
    const v = (field.validation && typeof field.validation === 'object')
      ? field.validation
      : {};

    const result = {};

    const isRequired = field.required !== false;
    if (isRequired) result.required = true;

    if (typeof v.min === 'number') result.min = v.min;
    if (typeof v.max === 'number') result.max = v.max;
    if (typeof v.minLength === 'number') result.minLength = v.minLength;
    if (typeof v.maxLength === 'number') result.maxLength = v.maxLength;
    if (typeof v.pattern === 'string' && v.pattern.length > 0) result.pattern = v.pattern;

    return Object.keys(result).length > 0 ? result : null;
  }

  // ── Private: question generation ──────────────────────────

  async #generateRetryQuestion(field, interpreterResult, startTime) {
    const schemaQuestion = field.question || `¿${field.label}?`;

    if (field.errorMessage) {
      return {
        question: `${field.errorMessage} ¿Podrías intentarlo de nuevo?`,
        aiUsed: false,
      };
    }

    if (this.#aiAdapter && typeof this.#aiAdapter.generate === 'function') {
      try {
        const elapsed = Date.now() - startTime;
        const remaining = Math.max(0, 8000 - elapsed);
        if (remaining > 1000) {
          const prompt = this.#buildRetryPrompt(field, schemaQuestion, interpreterResult);
          const result = await this.#aiAdapter.generate(
            'Eres un asistente de atención al cliente. Reescribe la pregunta manteniendo el significado exacto.',
            prompt,
            { temperature: 0, maxTokens: 200 }
          );

          const rewritten = this.#parseRetryResponse(result.text);
          if (rewritten) {
            return { question: rewritten, aiUsed: true };
          }
        }
      } catch {
        // fall through to fallback
      }
    }

    return {
      question: `El valor ingresado no es válido. ${schemaQuestion}`,
      aiUsed: false,
    };
  }

  #buildRetryPrompt(field, schemaQuestion, interpreterResult) {
    const lines = ['Reescribe la siguiente pregunta para preguntar nuevamente al usuario porque su respuesta anterior no fue válida.'];
    lines.push('');
    lines.push(`Campo: ${field.label} (${field.id})`);
    lines.push(`Tipo: ${field.type}`);
    lines.push(`Pregunta original: ${schemaQuestion}`);

    if (field.validation) {
      const parts = [];
      if (field.validation.min !== undefined) parts.push(`mín: ${field.validation.min}`);
      if (field.validation.max !== undefined) parts.push(`máx: ${field.validation.max}`);
      if (field.validation.pattern) parts.push(`patrón: ${field.validation.pattern}`);
      if (field.validation.minLength !== undefined) parts.push(`longitud mín: ${field.validation.minLength}`);
      if (field.validation.maxLength !== undefined) parts.push(`longitud máx: ${field.validation.maxLength}`);
      if (parts.length > 0) {
        lines.push(`Validación: ${parts.join(', ')}`);
      }
    }

    if (field.options) {
      const opts = field.options.map(o => o.label || o.value);
      lines.push(`Opciones: ${opts.join(', ')}`);
    }

    const extracted = interpreterResult.extractedFields || {};
    if (field.id in extracted) {
      lines.push(`Respuesta del usuario: ${JSON.stringify(extracted[field.id])}`);
    }

    lines.push('');
    lines.push('Reglas:');
    lines.push('- Mantené el mismo significado');
    lines.push('- No agregues información nueva');
    lines.push('- No elimines restricciones existentes');
    lines.push('- Una sola pregunta');
    lines.push('- Lenguaje claro y profesional');
    lines.push('- No inventes opciones');
    lines.push('- Respondé SOLO con la pregunta, sin explicaciones adicionales');

    return lines.join('\n');
  }

  #parseRetryResponse(text) {
    if (typeof text !== 'string') return null;
    const cleaned = text.trim();
    if (cleaned.length === 0) return null;

    const jsonMatch = cleaned.match(/```(?:json)?\s*\n?([\s\S]*?)```/);
    const target = jsonMatch ? jsonMatch[1].trim() : cleaned;

    try {
      const parsed = JSON.parse(target);
      if (parsed && typeof parsed === 'object' && typeof parsed.question === 'string') {
        return parsed.question.trim();
      }
    } catch {
      // not JSON, use raw text
    }

    const lines = cleaned.split('\n').filter(l => l.trim().length > 0);
    const last = lines[lines.length - 1].trim();
    if (last.endsWith('?') || last.endsWith('¿')) return last;
    return cleaned;
  }

  // ── Private: explanation generation ────────────────────────

  #generateExplanation(field, schema) {
    const reason = schema.description
      ? `para ${schema.description.toLowerCase()}`
      : 'para continuar';

    if (field.options && field.options.length > 0) {
      const opts = field.options.map(o => o.label || o.value).join(', ');
      return `Necesito conocer ${field.label.toLowerCase()} (${opts}) ${reason}.`;
    }

    return `Necesito conocer ${field.label.toLowerCase()} ${reason}.`;
  }

  // ── Private: placeholder generation ────────────────────────

  #generatePlaceholder(field) {
    switch (field.type) {
      case 'number':
        if (field.unit) return `Ej: 25 ${field.unit}`;
        return 'Ej: 25';

      case 'phone':
        return 'Ej: 11551234567';

      case 'email':
        return 'Ej: usuario@correo.com';

      case 'select':
      case 'multiselect':
        if (field.options && field.options.length > 0) {
          const first = field.options[0].label || field.options[0].value;
          return `Ej: ${first}`;
        }
        return null;

      case 'boolean':
        return 'Ej: sí / no';

      default:
        if (field.unit) return `Ej: texto ${field.unit}`;
        return null;
    }
  }

  // ── Private: confidence calculation ────────────────────────

  #calculateConfidence(field, retry, aiUsed, needsExplanation) {
    if (!retry && !aiUsed && !needsExplanation) return 1.0;

    let score = 1.0;

    if (retry && !aiUsed) score = 0.85;
    if (retry && aiUsed) score = 0.75;
    if (aiUsed && !retry) score = 0.8;
    if (needsExplanation) score -= 0.1;
    if (retry && !field.question) score -= 0.1;

    return Math.max(0, Math.min(1, Math.round(score * 100) / 100));
  }
}
