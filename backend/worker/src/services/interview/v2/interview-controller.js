import { StateKeeper } from './state-keeper.js';
import { FlowEvaluator } from './flow-evaluator.js';
import { QuestionGenerator } from './question-generator.js';
import { Interpreter, INTENTS } from './interpreter.js';
import { InferenceEngine } from './inference-engine.js';
import { MemorySessionStore } from './stores/memory-session-store.js';
import { deepFreeze } from './utils.js';
import { InterpreterError } from './errors.js';

// ── Validation helpers ─────────────────────────────────────────

const OPTION_TYPES = new Set(['select', 'multiselect']);

function validateFieldValue(field, value) {
  const errors = [];

  const isRequired = field.required !== false;
  if (isRequired && (value === null || value === undefined || value === '')) {
    errors.push(field.errorMessage || `El campo ${field.label} es obligatorio.`);
    return errors;
  }

  if (value === null || value === undefined || value === '') {
    return errors;
  }

  const v = field.validation || {};

  switch (field.type) {
    case 'number': {
      const num = typeof value === 'number' ? value : Number(value);
      if (Number.isNaN(num)) {
        errors.push('El valor debe ser un número válido.');
      } else {
        if (v.min !== undefined && num < v.min) {
          errors.push(`El valor mínimo es ${v.min}.`);
        }
        if (v.max !== undefined && num > v.max) {
          errors.push(`El valor máximo es ${v.max}.`);
        }
      }
      break;
    }

    case 'text':
    case 'phone':
    case 'email': {
      if (typeof value !== 'string') {
        errors.push('El valor debe ser texto.');
      } else {
        if (typeof v.minLength === 'number' && value.length < v.minLength) {
          errors.push(`La longitud mínima es ${v.minLength} caracteres.`);
        }
        if (typeof v.maxLength === 'number' && value.length > v.maxLength) {
          errors.push(`La longitud máxima es ${v.maxLength} caracteres.`);
        }
        if (v.pattern) {
          try {
            const regex = new RegExp(v.pattern);
            if (!regex.test(value)) {
              errors.push(field.errorMessage || 'El formato ingresado no es válido.');
            }
          } catch {
            errors.push('Error en la validación del formato.');
          }
        }
      }
      break;
    }

    case 'select': {
      if (field.options) {
        const valid = field.options.some(o => o.value === value);
        if (!valid) {
          errors.push('Seleccioná una opción válida.');
        }
      }
      break;
    }

    case 'multiselect': {
      if (!Array.isArray(value)) {
        errors.push('El valor debe ser una lista de opciones.');
      } else if (field.options) {
        const validValues = new Set(field.options.map(o => o.value));
        const invalid = value.filter(v => !validValues.has(v));
        if (invalid.length > 0) {
          errors.push('Algunas opciones seleccionadas no son válidas.');
        }
      }
      break;
    }

    case 'boolean': {
      if (typeof value !== 'boolean') {
        errors.push('El valor debe ser sí o no.');
      }
      break;
    }
  }

  return errors;
}

// ── Synthetic interpreter result for retry ─────────────────────

function makeRetryInterpreterResult(fieldId, value) {
  return deepFreeze({
    extractedFields: { [fieldId]: value },
    ignoredFields: [],
    ambiguousFields: [],
    confidence: 0,
    detectedIntent: 'ANSWER',
    reasoning: '',
    unknownFragments: [],
    aiUsed: false,
    latency: 0,
  });
}

function makeEmptyInterpreterResult() {
  return deepFreeze({
    extractedFields: {},
    ignoredFields: [],
    ambiguousFields: [],
    confidence: 1,
    detectedIntent: 'ANSWER',
    reasoning: '',
    unknownFragments: [],
    aiUsed: false,
    latency: 0,
  });
}

// ── InterviewController ───────────────────────────────────────

export class InterviewController {
  sessionStore;
  #questionGenerator;
  #interpreter;
  #aiAdapter;

  constructor(options = {}) {
    this.sessionStore = options.sessionStore || new MemorySessionStore();
    this.#aiAdapter = options.aiAdapter || null;
    this.#questionGenerator = options.questionGenerator
      || new QuestionGenerator({ aiAdapter: this.#aiAdapter });
    this.#interpreter = options.interpreter
      || (this.#aiAdapter ? new Interpreter({ aiAdapter: this.#aiAdapter }) : null);
  }

  // ── Private: persist and evaluate ─────────────────────────────

  async #persistAndGenerate(session) {
    await this.sessionStore.update(session.sessionId, { state: session.state });

    const flowResult = FlowEvaluator.evaluate(session.schema, session.state);
    const interpreterResult = makeEmptyInterpreterResult();
    const question = await this.#questionGenerator.generate(
      session.schema, session.state, flowResult, interpreterResult
    );

    const interviewComplete = flowResult.isComplete || question.question === null;
    return { flowResult, question, interviewComplete };
  }

  #applyExtractedFields(session, extractedFields) {
    let savedCount = 0;
    let validationError = null;
    let firstInvalidField = null;

    for (const [fieldId, value] of Object.entries(extractedFields || {})) {
      if (session.state.isFieldCompleted(fieldId)) continue;

      const field = session.schema.fields.find(f => f.id === fieldId);
      if (!field) continue;

      const errors = validateFieldValue(field, value);
      if (errors.length > 0) {
        if (!validationError) {
          validationError = errors.join(' ');
          firstInvalidField = fieldId;
        }
        continue;
      }

      session.state.setUserValue(fieldId, value);
      savedCount++;
    }

    return { savedCount, validationError, firstInvalidField };
  }

  #applyInferences(session) {
    const inferenceResult = InferenceEngine.infer(session.schema, session.state);
    for (const [fieldId, value] of Object.entries(inferenceResult.inferredValues)) {
      if (!session.state.isFieldCompleted(fieldId)) {
        const applied = inferenceResult.appliedRules.find(r => r.fieldId === fieldId);
        const inferenceId = applied ? `inference-${applied.ruleIndex}` : null;
        session.state.setInferredValue(fieldId, value, inferenceId);
      }
    }
    return inferenceResult;
  }

  #buildSummary(session) {
    const schema = session.schema;
    const state = session.state;
    const completedFields = state.getCompletedFields();
    const values = {};
    const labels = {};

    for (const field of schema.fields || []) {
      const entry = completedFields[field.id];
      if (entry) {
        values[field.id] = entry.value;
        if (field.options && field.options.length > 0) {
          const match = field.options.find(o => o.value === entry.value);
          labels[field.id] = match ? (match.label || match.value) : entry.value;
        } else {
          labels[field.id] = entry.value;
        }
      } else {
        values[field.id] = '';
        labels[field.id] = '';
      }
    }

    const template = schema.summaryTemplate || 'Solicitud completada. Gracias.';
    const rendered = template
      .replace(/\{\{(\w+):label\}\}/g, (_, key) => String(labels[key] ?? ''))
      .replace(/\{\{(\w+)\}\}/g, (_, key) => {
        if (key === 'interviewId') return state.getInterviewId();
        if (key === 'timestamp') return new Date().toLocaleString('es-AR');
        return String(values[key] ?? '');
      });

    return rendered;
  }

  async start(schema, message = null) {
    if (!schema || typeof schema !== 'object') {
      throw new InterpreterError('IC_INVALID_SCHEMA', 'Schema must be a non-null object');
    }
    if (!Array.isArray(schema.fields)) {
      throw new InterpreterError('IC_INVALID_SCHEMA', 'Schema must have a fields array');
    }
    if (!schema.serviceId) {
      throw new InterpreterError('IC_INVALID_SCHEMA', 'Schema must have a serviceId');
    }
    if (!schema.serviceVersion) {
      throw new InterpreterError('IC_INVALID_SCHEMA', 'Schema must have a serviceVersion');
    }

    const metadata = message ? { initialMessage: message.trim() } : {};
    const state = StateKeeper.create(
      schema.serviceId,
      schema.serviceVersion,
      { metadata }
    );

    const sessionId = state.getInterviewId();
    await this.sessionStore.create(sessionId, { state, schema });

    const session = { sessionId, state, schema };

    if (message && this.#interpreter) {
      const trimmedMessage = message.trim();
      try {
        const interpreted = await this.#interpreter.interpret(schema, state, trimmedMessage);
        if (![INTENTS.CANCEL, INTENTS.FINISH, INTENTS.HELP].includes(interpreted.detectedIntent)) {
          this.#applyExtractedFields(session, interpreted.extractedFields);
          this.#applyInferences(session);
        }
      } catch {
        // Si la extracción del mensaje inicial falla, continuamos con el estado vacío.
      }
    }

    const seededFields = Object.keys(state.getCompletedFields()).length;

    let question;
    let interviewComplete;
    if (seededFields > 0) {
      ({ question, interviewComplete } = await this.#persistAndGenerate(session));
    } else {
      const flowResult = FlowEvaluator.evaluate(schema, state);
      const interpreterResult = makeEmptyInterpreterResult();
      question = await this.#questionGenerator.generate(
        schema, state, flowResult, interpreterResult
      );
      interviewComplete = flowResult.isComplete || question.question === null;
    }

    return deepFreeze({
      sessionId,
      schemaId: schema.serviceId,
      question,
      interviewComplete,
      summary: interviewComplete ? this.#buildSummary(session) : null,
    });
  }

  async answer(sessionId, input) {
    if (!sessionId || typeof sessionId !== 'string') {
      throw new InterpreterError('IC_INVALID_SESSION', 'SessionId must be a non-empty string');
    }

    const session = await this.sessionStore.get(sessionId);
    if (!session) {
      throw new InterpreterError('IC_SESSION_NOT_FOUND', `Session '${sessionId}' not found`);
    }

    if (!input || typeof input !== 'object') {
      throw new InterpreterError('IC_INVALID_INPUT', 'Input must be a non-null object');
    }

    const fieldId = input.fieldId;
    const value = input.value;

    if (typeof fieldId !== 'string' || fieldId.length === 0) {
      throw new InterpreterError('IC_INVALID_FIELD_ID', 'fieldId must be a non-empty string');
    }

    const field = session.schema.fields.find(f => f.id === fieldId);
    if (!field) {
      throw new InterpreterError(
        'IC_FIELD_NOT_FOUND',
        `Field '${fieldId}' not found in schema`
      );
    }

    const isAlreadyCompleted = session.state.isFieldCompleted(fieldId);
    if (isAlreadyCompleted) {
      throw new InterpreterError(
        'IC_FIELD_ALREADY_COMPLETED',
        `Field '${fieldId}' is already answered`
      );
    }

    const errors = validateFieldValue(field, value);

    if (errors.length > 0) {
      const interpreterResult = makeRetryInterpreterResult(fieldId, value);
      const flowResult = FlowEvaluator.evaluate(session.schema, session.state);
      const question = await this.#questionGenerator.generate(
        session.schema, session.state, flowResult, interpreterResult
      );

      return deepFreeze({
        sessionId,
        schemaId: session.schema.serviceId,
        question,
        interviewComplete: false,
        saved: false,
        validationError: errors.join(' '),
      });
    }

    session.state.setUserValue(fieldId, value);
    this.#applyInferences(session);

    const { question, interviewComplete } = await this.#persistAndGenerate(session);

    return deepFreeze({
      sessionId,
      schemaId: session.schema.serviceId,
      question,
      interviewComplete,
      saved: true,
      validationError: null,
      summary: interviewComplete ? this.#buildSummary(session) : null,
    });
  }

  async answerMessage(sessionId, message) {
    if (!sessionId || typeof sessionId !== 'string') {
      throw new InterpreterError('IC_INVALID_SESSION', 'SessionId must be a non-empty string');
    }

    const session = await this.sessionStore.get(sessionId);
    if (!session) {
      throw new InterpreterError('IC_SESSION_NOT_FOUND', `Session '${sessionId}' not found`);
    }

    if (typeof message !== 'string' || message.trim().length === 0) {
      throw new InterpreterError('IC_INVALID_MESSAGE', 'Message must be a non-empty string');
    }

    if (!this.#interpreter) {
      throw new InterpreterError('IC_NO_INTERPRETER', 'Interpreter not available');
    }

    const interpreted = await this.#interpreter.interpret(
      session.schema,
      session.state,
      message.trim()
    );

    if (interpreted.detectedIntent === INTENTS.CANCEL) {
      await this.sessionStore.delete(sessionId);
      return deepFreeze({
        sessionId,
        schemaId: session.schema.serviceId,
        question: null,
        interviewComplete: false,
        saved: false,
        cancelled: true,
        detectedIntent: INTENTS.CANCEL,
        validationError: null,
      });
    }

    if (interpreted.detectedIntent === INTENTS.FINISH) {
      await this.sessionStore.update(sessionId, { state: session.state });
      return deepFreeze({
        sessionId,
        schemaId: session.schema.serviceId,
        question: null,
        interviewComplete: true,
        saved: false,
        finished: true,
        detectedIntent: INTENTS.FINISH,
        validationError: null,
        summary: this.#buildSummary(session),
      });
    }

    if (interpreted.detectedIntent === INTENTS.HELP) {
      const { question } = await this.#persistAndGenerate(session);
      return deepFreeze({
        sessionId,
        schemaId: session.schema.serviceId,
        question,
        interviewComplete: false,
        saved: false,
        help: true,
        detectedIntent: INTENTS.HELP,
        validationError: null,
      });
    }

    let extracted = Object.entries(interpreted.extractedFields || {});

    // Fallback: if the interpreter returned no fields and the user is not using
    // a control intent, treat the message as the answer for the current pending field.
    if (extracted.length === 0 &&
        interpreted.detectedIntent !== INTENTS.CANCEL &&
        interpreted.detectedIntent !== INTENTS.FINISH &&
        interpreted.detectedIntent !== INTENTS.HELP) {
      const nextFieldId = FlowEvaluator.getNextField(session.schema, session.state);
      if (nextFieldId) {
        const nextField = session.schema.fields.find(f => f.id === nextFieldId);
        if (nextField && ['text', 'phone', 'email', 'number'].includes(nextField.type)) {
          extracted = [[nextFieldId, message.trim()]];
        }
      }
    }

    const { savedCount, validationError, firstInvalidField } =
      this.#applyExtractedFields(session, Object.fromEntries(extracted));

    this.#applyInferences(session);
    await this.sessionStore.update(sessionId, { state: session.state });

    const flowResult = FlowEvaluator.evaluate(session.schema, session.state);
    const interpreterResult = validationError
      ? makeRetryInterpreterResult(firstInvalidField, interpreted.extractedFields[firstInvalidField])
      : makeEmptyInterpreterResult();
    const question = await this.#questionGenerator.generate(
      session.schema, session.state, flowResult, interpreterResult
    );
    const interviewComplete = !validationError && (flowResult.isComplete || question.question === null);

    return deepFreeze({
      sessionId,
      schemaId: session.schema.serviceId,
      question,
      interviewComplete,
      saved: savedCount > 0,
      validationError,
      detectedIntent: interpreted.detectedIntent,
      interpretedFields: Object.keys(interpreted.extractedFields || {}),
      summary: interviewComplete ? this.#buildSummary(session) : null,
    });
  }

  async next(sessionId) {
    if (!sessionId || typeof sessionId !== 'string') {
      throw new InterpreterError('IC_INVALID_SESSION', 'SessionId must be a non-empty string');
    }

    const session = await this.sessionStore.get(sessionId);
    if (!session) {
      throw new InterpreterError('IC_SESSION_NOT_FOUND', `Session '${sessionId}' not found`);
    }

    const flowResult = FlowEvaluator.evaluate(session.schema, session.state);
    const interpreterResult = makeEmptyInterpreterResult();
    const question = await this.#questionGenerator.generate(
      session.schema, session.state, flowResult, interpreterResult
    );
    const interviewComplete = flowResult.isComplete || question.question === null;

    return deepFreeze({
      sessionId,
      schemaId: session.schema.serviceId,
      question,
      interviewComplete,
      summary: interviewComplete ? this.#buildSummary(session) : null,
    });
  }

  async getSession(sessionId) {
    if (!sessionId || typeof sessionId !== 'string') {
      throw new InterpreterError('IC_INVALID_SESSION', 'SessionId must be a non-empty string');
    }

    const session = await this.sessionStore.get(sessionId);
    if (!session) {
      throw new InterpreterError('IC_SESSION_NOT_FOUND', `Session '${sessionId}' not found`);
    }

    return deepFreeze({
      sessionId,
      state: session.state.toJSON(),
      schema: session.schema,
    });
  }

  async hasSession(sessionId) {
    return this.sessionStore.exists(sessionId);
  }

  async clearSession(sessionId) {
    await this.sessionStore.delete(sessionId);
  }
}
