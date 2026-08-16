import { describe, it, expect, vi, beforeEach } from 'vitest';
import { InterviewController } from './interview-controller.js';
import { InterpreterError } from './errors.js';
import { SessionStore } from './session-store.js';
import { MemorySessionStore } from './stores/memory-session-store.js';
import { SupabaseSessionStore, StoreError } from './stores/supabase-session-store.js';
import { BUILT_IN_SCHEMAS } from './schema-index.js';
import { CompletionPipeline } from '../../completion/completion-pipeline.js';
import { CompletionHandler } from '../../nexus/interview/completion-handler.js';
import { ClientResolver } from '../../nexus/client-resolver.js';

// ── Helpers ─────────────────────────────────────────────────────

function makeSchema(overrides = {}) {
  return {
    serviceId: 'test_service',
    serviceVersion: '1.0.0',
    serviceName: 'Test Service',
    description: 'A test service',
    fields: [
      { id: 'name', type: 'text', label: 'Nombre', question: '¿Cuál es tu nombre?', required: true },
      {
        id: 'phone', type: 'phone', label: 'Teléfono', question: '¿Cuál es tu teléfono?',
        required: true, validation: { pattern: '^\\d{7,}$' },
        errorMessage: 'Ingresá un teléfono válido.',
      },
      {
        id: 'color', type: 'select', label: 'Color', question: '¿Qué color?',
        options: [{ value: 'rojo', label: 'Rojo' }, { value: 'azul', label: 'Azul' }],
      },
      {
        id: 'quantity', type: 'number', label: 'Cantidad', question: '¿Cuántos?',
        validation: { min: 1, max: 100 },
      },
      {
        id: 'agree', type: 'boolean', label: 'Acuerdo', question: '¿Aceptás?',
      },
      {
        id: 'tags', type: 'multiselect', label: 'Tags', question: '¿Tags?',
        options: [{ value: 'a', label: 'A' }, { value: 'b', label: 'B' }],
      },
      { id: 'comment', type: 'text', label: 'Comentario', question: '¿Comentarios?', required: false },
    ],
    ...overrides,
  };
}

// ── Tests ───────────────────────────────────────────────────────

describe('InterviewController', () => {
  describe('constructor', () => {
    it('creates controller without options', () => {
      const ctrl = new InterviewController();
      expect(ctrl).toBeInstanceOf(InterviewController);
    });

    it('accepts aiAdapter option', () => {
      const ctrl = new InterviewController({ aiAdapter: { generate: vi.fn() } });
      expect(ctrl).toBeInstanceOf(InterviewController);
    });
  });

  describe('start', () => {
    it('creates a new interview session and returns first question', async () => {
      const ctrl = new InterviewController();
      const result = await ctrl.start(makeSchema());

      expect(result.sessionId).toBeTruthy();
      expect(typeof result.sessionId).toBe('string');
      expect(result.question).toBeTruthy();
      expect(result.question.question).toBe('¿Cuál es tu nombre?');
      expect(result.question.fieldId).toBe('name');
      expect(result.interviewComplete).toBe(false);
    });

    it('rejects schema without serviceId', async () => {
      const ctrl = new InterviewController();
      const schema = makeSchema();
      delete schema.serviceId;
      await expect(ctrl.start(schema)).rejects.toThrow(InterpreterError);
    });

    it('rejects schema without serviceVersion', async () => {
      const ctrl = new InterviewController();
      const schema = makeSchema();
      delete schema.serviceVersion;
      await expect(ctrl.start(schema)).rejects.toThrow(InterpreterError);
    });

    it('rejects null schema', async () => {
      const ctrl = new InterviewController();
      await expect(ctrl.start(null)).rejects.toThrow(InterpreterError);
    });

    it('rejects schema without fields', async () => {
      const ctrl = new InterviewController();
      await expect(ctrl.start({ serviceId: 'x', serviceVersion: '1.0.0' })).rejects.toThrow(InterpreterError);
    });

    it('stores initial message in metadata and seeds valid extracted fields', async () => {
      const interpreter = {
        interpret: vi.fn().mockResolvedValue({
          extractedFields: { name: 'Juan', phone: '123456789' },
          ignoredFields: [],
          ambiguousFields: [],
          confidence: 0.9,
          detectedIntent: 'ANSWER',
          reasoning: '',
          unknownFragments: [],
          aiUsed: false,
          latency: 0,
        }),
      };
      const ctrl = new InterviewController({ interpreter });
      const message = 'Hola, soy Juan, mi teléfono es 123456789';
      const result = await ctrl.start(makeSchema(), message);

      const session = await ctrl.sessionStore.get(result.sessionId);
      expect(session.state.getMetadata().initialMessage).toBe(message);
      expect(result.question.fieldId).toBe('color');
      expect(session.state.isFieldCompleted('name')).toBe(true);
      expect(session.state.isFieldCompleted('phone')).toBe(true);
    });

    it('seeds first user message fields on start', async () => {
      const interpreter = {
        interpret: vi.fn().mockResolvedValue({
          extractedFields: {
            clientName: 'Juan',
            clientPhone: '3415555555',
            device: 'Samsung A54',
            problem: 'no prende',
          },
          ignoredFields: [],
          ambiguousFields: [],
          confidence: 0.95,
          detectedIntent: 'ANSWER',
          reasoning: 'User provided name, phone, device and problem',
          unknownFragments: [],
          aiUsed: true,
          latency: 0,
        }),
      };
      const ctrl = new InterviewController({ interpreter });
      const schema = BUILT_IN_SCHEMAS['repair-request'];
      const message = 'Hola, soy Juan, quiero reparar mi Samsung A54 porque no prende. Mi teléfono es 3415555555';
      const result = await ctrl.start(schema, message);

      const session = await ctrl.sessionStore.get(result.sessionId);
      expect(session.state.getMetadata().initialMessage).toBe(message);
      expect(session.state.isFieldCompleted('clientName')).toBe(true);
      expect(session.state.getFieldValue('clientName')).toBe('Juan');
      expect(session.state.isFieldCompleted('clientPhone')).toBe(true);
      expect(session.state.getFieldValue('clientPhone')).toBe('3415555555');
      expect(session.state.isFieldCompleted('device')).toBe(true);
      expect(session.state.getFieldValue('device')).toBe('Samsung A54');
      expect(session.state.isFieldCompleted('problem')).toBe(true);
      expect(session.state.getFieldValue('problem')).toBe('no prende');
      expect(result.interviewComplete).toBe(true);
      expect(result.question.question).toBeNull();
    });

    it('skips invalid extracted fields from initial message and continues', async () => {
      const interpreter = {
        interpret: vi.fn().mockResolvedValue({
          extractedFields: { name: 'Juan', phone: '12' },
          ignoredFields: [],
          ambiguousFields: [],
          confidence: 0.9,
          detectedIntent: 'ANSWER',
          reasoning: '',
          unknownFragments: [],
          aiUsed: false,
          latency: 0,
        }),
      };
      const ctrl = new InterviewController({ interpreter });
      const result = await ctrl.start(makeSchema(), 'Hola, soy Juan, teléfono 12');

      const session = await ctrl.sessionStore.get(result.sessionId);
      expect(session.state.isFieldCompleted('name')).toBe(true);
      expect(session.state.isFieldCompleted('phone')).toBe(false);
      expect(result.question.fieldId).toBe('phone');
    });

    it('does not seed when initial message is provided but interpreter is null', async () => {
      const ctrl = new InterviewController();
      const message = 'Hola, soy Juan';
      const result = await ctrl.start(makeSchema(), message);

      const session = await ctrl.sessionStore.get(result.sessionId);
      expect(session.state.getMetadata().initialMessage).toBe(message);
      expect(result.question.fieldId).toBe('name');
      expect(session.state.isFieldCompleted('name')).toBe(false);
    });
  });

  describe('answer', () => {
    it('saves a valid answer and advances to next field', async () => {
      const ctrl = new InterviewController();
      const { sessionId } = await ctrl.start(makeSchema());

      const result = await ctrl.answer(sessionId, { fieldId: 'name', value: 'Juan' });

      expect(result.saved).toBe(true);
      expect(result.validationError).toBeNull();
      expect(result.sessionId).toBe(sessionId);
      expect(result.question).toBeTruthy();
    });

    it('returns retry question for invalid phone pattern', async () => {
      const ctrl = new InterviewController();
      const { sessionId } = await ctrl.start(makeSchema());

      // Answer name first
      await ctrl.answer(sessionId, { fieldId: 'name', value: 'Juan' });

      // Answer phone with invalid value
      const result = await ctrl.answer(sessionId, { fieldId: 'phone', value: '12' });

      expect(result.saved).toBe(false);
      expect(result.validationError).toBeTruthy();
      expect(result.question).toBeTruthy();
      expect(result.question.retry).toBe(true);
    });

    it('accepts valid phone', async () => {
      const ctrl = new InterviewController();
      const { sessionId } = await ctrl.start(makeSchema());

      await ctrl.answer(sessionId, { fieldId: 'name', value: 'Juan' });
      const result = await ctrl.answer(sessionId, { fieldId: 'phone', value: '123456789' });

      expect(result.saved).toBe(true);
      expect(result.validationError).toBeNull();
    });

    it('returns validation error for empty required field', async () => {
      const ctrl = new InterviewController();
      const { sessionId } = await ctrl.start(makeSchema());

      const result = await ctrl.answer(sessionId, { fieldId: 'name', value: '' });

      expect(result.saved).toBe(false);
      expect(result.validationError).toContain('obligatorio');
    });

    it('returns validation error for null required field', async () => {
      const ctrl = new InterviewController();
      const { sessionId } = await ctrl.start(makeSchema());

      const result = await ctrl.answer(sessionId, { fieldId: 'name', value: null });

      expect(result.saved).toBe(false);
    });

    it('accepts optional field as empty', async () => {
      const ctrl = new InterviewController();
      const { sessionId } = await ctrl.start(makeSchema());

      const result = await ctrl.answer(sessionId, { fieldId: 'comment', value: '' });

      expect(result.saved).toBe(true);
      // Empty string for non-required field is saved (it's allowed by flow)
    });

    it('rejects answer for non-existent field', async () => {
      const ctrl = new InterviewController();
      const { sessionId } = await ctrl.start(makeSchema());

      await expect(
        ctrl.answer(sessionId, { fieldId: 'nonexistent', value: 'x' })
      ).rejects.toThrow(InterpreterError);
    });

    it('rejects answer for already completed field', async () => {
      const ctrl = new InterviewController();
      const { sessionId } = await ctrl.start(makeSchema());

      await ctrl.answer(sessionId, { fieldId: 'name', value: 'Juan' });

      await expect(
        ctrl.answer(sessionId, { fieldId: 'name', value: 'Pedro' })
      ).rejects.toThrow(InterpreterError);
    });

    it('rejects answer without sessionId', async () => {
      const ctrl = new InterviewController();
      await expect(ctrl.answer(null, { fieldId: 'name', value: 'Juan' })).rejects.toThrow(InterpreterError);
    });

    it('rejects answer for non-existent session', async () => {
      const ctrl = new InterviewController();
      await expect(ctrl.answer('bad-session', { fieldId: 'name', value: 'Juan' })).rejects.toThrow(InterpreterError);
    });

    it('rejects answer without fieldId', async () => {
      const ctrl = new InterviewController();
      const { sessionId } = await ctrl.start(makeSchema());
      await expect(ctrl.answer(sessionId, { value: 'Juan' })).rejects.toThrow(InterpreterError);
    });

    it('rejects answer with invalid input type', async () => {
      const ctrl = new InterviewController();
      const { sessionId } = await ctrl.start(makeSchema());
      await expect(ctrl.answer(sessionId, null)).rejects.toThrow(InterpreterError);
    });
  });

  describe('validation rules', () => {
    it('validates number min', async () => {
      const ctrl = new InterviewController();
      const { sessionId } = await ctrl.start(makeSchema());

      await ctrl.answer(sessionId, { fieldId: 'name', value: 'Juan' });
      const result = await ctrl.answer(sessionId, { fieldId: 'quantity', value: 0 });

      expect(result.saved).toBe(false);
      expect(result.validationError).toContain('mínimo');
    });

    it('validates number max', async () => {
      const ctrl = new InterviewController();
      const { sessionId } = await ctrl.start(makeSchema());

      await ctrl.answer(sessionId, { fieldId: 'name', value: 'Juan' });
      const result = await ctrl.answer(sessionId, { fieldId: 'quantity', value: 200 });

      expect(result.saved).toBe(false);
      expect(result.validationError).toContain('máximo');
    });

    it('accepts valid number', async () => {
      const ctrl = new InterviewController();
      const { sessionId } = await ctrl.start(makeSchema());

      await ctrl.answer(sessionId, { fieldId: 'name', value: 'Juan' });
      const result = await ctrl.answer(sessionId, { fieldId: 'quantity', value: 5 });

      expect(result.saved).toBe(true);
    });

    it('validates select options', async () => {
      const ctrl = new InterviewController();
      const { sessionId } = await ctrl.start(makeSchema());

      await ctrl.answer(sessionId, { fieldId: 'name', value: 'Juan' });
      await ctrl.answer(sessionId, { fieldId: 'phone', value: '123456789' });

      const result = await ctrl.answer(sessionId, { fieldId: 'color', value: 'invalid' });

      expect(result.saved).toBe(false);
      expect(result.validationError).toContain('válida');
    });

    it('accepts valid select value', async () => {
      const ctrl = new InterviewController();
      const { sessionId } = await ctrl.start(makeSchema());

      await ctrl.answer(sessionId, { fieldId: 'name', value: 'Juan' });
      await ctrl.answer(sessionId, { fieldId: 'phone', value: '123456789' });
      const result = await ctrl.answer(sessionId, { fieldId: 'color', value: 'rojo' });

      expect(result.saved).toBe(true);
    });

    it('validates boolean type', async () => {
      const ctrl = new InterviewController();
      const { sessionId } = await ctrl.start(makeSchema());

      await ctrl.answer(sessionId, { fieldId: 'name', value: 'Juan' });
      await ctrl.answer(sessionId, { fieldId: 'phone', value: '123456789' });
      await ctrl.answer(sessionId, { fieldId: 'color', value: 'rojo' });
      await ctrl.answer(sessionId, { fieldId: 'quantity', value: 5 });

      const result = await ctrl.answer(sessionId, { fieldId: 'agree', value: 'not boolean' });

      expect(result.saved).toBe(false);
    });

    it('accepts valid boolean', async () => {
      const ctrl = new InterviewController();
      const { sessionId } = await ctrl.start(makeSchema());

      await ctrl.answer(sessionId, { fieldId: 'name', value: 'Juan' });
      await ctrl.answer(sessionId, { fieldId: 'phone', value: '123456789' });
      await ctrl.answer(sessionId, { fieldId: 'color', value: 'rojo' });
      await ctrl.answer(sessionId, { fieldId: 'quantity', value: 5 });

      const result = await ctrl.answer(sessionId, { fieldId: 'agree', value: true });

      expect(result.saved).toBe(true);
    });

    it('validates multiselect values', async () => {
      const ctrl = new InterviewController();
      const { sessionId } = await ctrl.start(makeSchema());

      await ctrl.answer(sessionId, { fieldId: 'name', value: 'Juan' });
      await ctrl.answer(sessionId, { fieldId: 'phone', value: '123456789' });
      await ctrl.answer(sessionId, { fieldId: 'color', value: 'rojo' });
      await ctrl.answer(sessionId, { fieldId: 'quantity', value: 5 });
      await ctrl.answer(sessionId, { fieldId: 'agree', value: true });

      const result = await ctrl.answer(sessionId, { fieldId: 'tags', value: ['a', 'invalid'] });

      expect(result.saved).toBe(false);
    });

    it('accepts valid multiselect', async () => {
      const ctrl = new InterviewController();
      const { sessionId } = await ctrl.start(makeSchema());

      await ctrl.answer(sessionId, { fieldId: 'name', value: 'Juan' });
      await ctrl.answer(sessionId, { fieldId: 'phone', value: '123456789' });
      await ctrl.answer(sessionId, { fieldId: 'color', value: 'rojo' });
      await ctrl.answer(sessionId, { fieldId: 'quantity', value: 5 });
      await ctrl.answer(sessionId, { fieldId: 'agree', value: true });

      const result = await ctrl.answer(sessionId, { fieldId: 'tags', value: ['a', 'b'] });

      expect(result.saved).toBe(true);
    });

    it('validates number NaN', async () => {
      const ctrl = new InterviewController();
      const { sessionId } = await ctrl.start(makeSchema());

      await ctrl.answer(sessionId, { fieldId: 'name', value: 'Juan' });
      const result = await ctrl.answer(sessionId, { fieldId: 'quantity', value: 'abc' });

      expect(result.saved).toBe(false);
    });

    it('rejects non-string value for text field', async () => {
      const ctrl = new InterviewController();
      const { sessionId } = await ctrl.start(makeSchema());

      const result = await ctrl.answer(sessionId, { fieldId: 'name', value: 42 });

      expect(result.saved).toBe(false);
      expect(result.validationError).toContain('texto');
    });

    it('rejects non-matching pattern without errorMessage', async () => {
      const ctrl = new InterviewController();
      const schema = makeSchema();
      schema.fields[0].validation = { pattern: '^[A-Z]+$' };
      const { sessionId } = await ctrl.start(schema);

      const result = await ctrl.answer(sessionId, { fieldId: 'name', value: 'abc' });

      expect(result.saved).toBe(false);
      expect(result.validationError).toBe('El formato ingresado no es válido.');
    });

    it('accepts select without options list', async () => {
      const ctrl = new InterviewController();
      const schema = makeSchema();
      schema.fields[2].options = null;
      const { sessionId } = await ctrl.start(schema);

      await ctrl.answer(sessionId, { fieldId: 'name', value: 'Juan' });
      await ctrl.answer(sessionId, { fieldId: 'phone', value: '123456789' });
      const result = await ctrl.answer(sessionId, { fieldId: 'color', value: 'anything' });

      expect(result.saved).toBe(true);
    });

    it('accepts multiselect without options list', async () => {
      const ctrl = new InterviewController();
      const schema = makeSchema();
      schema.fields[5].options = null;
      const { sessionId } = await ctrl.start(schema);

      await ctrl.answer(sessionId, { fieldId: 'name', value: 'Juan' });
      await ctrl.answer(sessionId, { fieldId: 'phone', value: '123456789' });
      await ctrl.answer(sessionId, { fieldId: 'color', value: 'rojo' });
      await ctrl.answer(sessionId, { fieldId: 'quantity', value: 5 });
      await ctrl.answer(sessionId, { fieldId: 'agree', value: true });
      const result = await ctrl.answer(sessionId, { fieldId: 'tags', value: ['x', 'y'] });

      expect(result.saved).toBe(true);
    });

    it('validates text minLength', async () => {
      const ctrl = new InterviewController();
      const schema = makeSchema();
      schema.fields[0].validation = { minLength: 3 };
      const { sessionId } = await ctrl.start(schema);

      const result = await ctrl.answer(sessionId, { fieldId: 'name', value: 'ab' });

      expect(result.saved).toBe(false);
      expect(result.validationError).toContain('mínima');
    });

    it('validates text maxLength', async () => {
      const ctrl = new InterviewController();
      const schema = makeSchema();
      schema.fields[0].validation = { maxLength: 10 };
      const { sessionId } = await ctrl.start(schema);

      const result = await ctrl.answer(sessionId, { fieldId: 'name', value: 'a'.repeat(11) });

      expect(result.saved).toBe(false);
      expect(result.validationError).toContain('máxima');
    });

    it('handles invalid regex pattern', async () => {
      const ctrl = new InterviewController();
      const schema = makeSchema();
      schema.fields[0].validation = { pattern: '[' };
      const { sessionId } = await ctrl.start(schema);

      const result = await ctrl.answer(sessionId, { fieldId: 'name', value: 'test' });

      expect(result.saved).toBe(false);
      expect(result.validationError).toContain('Error en la validación');
    });

    it('rejects non-array value for multiselect', async () => {
      const ctrl = new InterviewController();
      const { sessionId } = await ctrl.start(makeSchema());

      await ctrl.answer(sessionId, { fieldId: 'name', value: 'Juan' });
      await ctrl.answer(sessionId, { fieldId: 'phone', value: '123456789' });
      await ctrl.answer(sessionId, { fieldId: 'color', value: 'rojo' });
      await ctrl.answer(sessionId, { fieldId: 'quantity', value: 5 });
      await ctrl.answer(sessionId, { fieldId: 'agree', value: true });

      const result = await ctrl.answer(sessionId, { fieldId: 'tags', value: 'not-an-array' });

      expect(result.saved).toBe(false);
      expect(result.validationError).toContain('lista');
    });
  });

  describe('interview flow', () => {
    it('completes a full interview answering all fields', async () => {
      const ctrl = new InterviewController();
      const { sessionId } = await ctrl.start(makeSchema());

      await ctrl.answer(sessionId, { fieldId: 'name', value: 'Juan' });
      await ctrl.answer(sessionId, { fieldId: 'phone', value: '123456789' });
      await ctrl.answer(sessionId, { fieldId: 'color', value: 'rojo' });
      await ctrl.answer(sessionId, { fieldId: 'quantity', value: 5 });
      await ctrl.answer(sessionId, { fieldId: 'agree', value: true });
      await ctrl.answer(sessionId, { fieldId: 'tags', value: ['a'] });

      const last = await ctrl.answer(sessionId, { fieldId: 'comment', value: 'Todo bien' });

      expect(last.question.question).toBeNull();
      expect(last.interviewComplete).toBe(true);
      expect(last.saved).toBe(true);
    });

    it('returns null question when next() is called after completion', async () => {
      const ctrl = new InterviewController();
      const { sessionId } = await ctrl.start(makeSchema());

      await ctrl.answer(sessionId, { fieldId: 'name', value: 'Juan' });
      await ctrl.answer(sessionId, { fieldId: 'phone', value: '123456789' });
      await ctrl.answer(sessionId, { fieldId: 'color', value: 'rojo' });
      await ctrl.answer(sessionId, { fieldId: 'quantity', value: 5 });
      await ctrl.answer(sessionId, { fieldId: 'agree', value: true });
      await ctrl.answer(sessionId, { fieldId: 'tags', value: ['a'] });
      await ctrl.answer(sessionId, { fieldId: 'comment', value: 'Todo bien' });

      const result = await ctrl.next(sessionId);
      expect(result.question.question).toBeNull();
      expect(result.interviewComplete).toBe(true);
    });
  });

  describe('next', () => {
    it('advances without answering', async () => {
      const ctrl = new InterviewController();
      const { sessionId } = await ctrl.start(makeSchema());

      const result = await ctrl.next(sessionId);

      expect(result.sessionId).toBe(sessionId);
      expect(result.question).toBeTruthy();
      expect(result.question.fieldId).toBe('name');
    });

    it('rejects non-existent session', async () => {
      const ctrl = new InterviewController();
      await expect(ctrl.next('bad-session')).rejects.toThrow(InterpreterError);
    });

    it('rejects null sessionId', async () => {
      const ctrl = new InterviewController();
      await expect(ctrl.next(null)).rejects.toThrow(InterpreterError);
    });
  });

  describe('session management', () => {
    it('getSession returns session data', async () => {
      const ctrl = new InterviewController();
      const { sessionId } = await ctrl.start(makeSchema());

      const session = await ctrl.getSession(sessionId);
      expect(session.sessionId).toBe(sessionId);
      expect(session.schema).toBeTruthy();
      expect(session.state).toBeTruthy();
    });

    it('getSession throws for non-existent session', async () => {
      const ctrl = new InterviewController();
      await expect(ctrl.getSession('nonexistent')).rejects.toThrow(InterpreterError);
    });

    it('getSession throws for null sessionId', async () => {
      const ctrl = new InterviewController();
      await expect(ctrl.getSession(null)).rejects.toThrow(InterpreterError);
    });

    it('hasSession returns true for active session', async () => {
      const ctrl = new InterviewController();
      const { sessionId } = await ctrl.start(makeSchema());
      expect(await ctrl.hasSession(sessionId)).toBe(true);
    });

    it('hasSession returns false for unknown session', async () => {
      const ctrl = new InterviewController();
      expect(await ctrl.hasSession('nonexistent')).toBe(false);
    });

    it('clearSession removes session', async () => {
      const ctrl = new InterviewController();
      const { sessionId } = await ctrl.start(makeSchema());
      expect(await ctrl.hasSession(sessionId)).toBe(true);

      await ctrl.clearSession(sessionId);
      expect(await ctrl.hasSession(sessionId)).toBe(false);
    });
  });

  describe('immutability', () => {
    it('start returns frozen result', async () => {
      const ctrl = new InterviewController();
      const result = await ctrl.start(makeSchema());
      expect(Object.isFrozen(result)).toBe(true);
    });

    it('answer returns frozen result', async () => {
      const ctrl = new InterviewController();
      const { sessionId } = await ctrl.start(makeSchema());
      const result = await ctrl.answer(sessionId, { fieldId: 'name', value: 'Juan' });
      expect(Object.isFrozen(result)).toBe(true);
    });

    it('next returns frozen result', async () => {
      const ctrl = new InterviewController();
      const { sessionId } = await ctrl.start(makeSchema());
      const result = await ctrl.next(sessionId);
      expect(Object.isFrozen(result)).toBe(true);
    });

    it('getSession returns frozen result', async () => {
      const ctrl = new InterviewController();
      const { sessionId } = await ctrl.start(makeSchema());
      const session = await ctrl.getSession(sessionId);
      expect(Object.isFrozen(session)).toBe(true);
    });

    it('state from getSession is frozen', async () => {
      const ctrl = new InterviewController();
      const { sessionId } = await ctrl.start(makeSchema());
      const session = await ctrl.getSession(sessionId);
      expect(Object.isFrozen(session.state)).toBe(true);
    });
  });

  describe('sessionStore integration', () => {
    it('constructor accepts custom sessionStore', () => {
      const customStore = new MemorySessionStore();
      const ctrl = new InterviewController({ sessionStore: customStore });
      expect(ctrl.sessionStore).toBe(customStore);
    });

    it('defaults to MemorySessionStore when no store provided', () => {
      const ctrl = new InterviewController();
      expect(ctrl.sessionStore).toBeInstanceOf(MemorySessionStore);
    });

    it('sessionStore is public', () => {
      const ctrl = new InterviewController();
      expect(ctrl.sessionStore).toBeDefined();
    });

    it('start stores session via sessionStore', async () => {
      const store = new MemorySessionStore();
      const ctrl = new InterviewController({ sessionStore: store });
      const { sessionId } = await ctrl.start(makeSchema());
      expect(store.exists(sessionId)).toBe(true);
    });

    it('start stores correct data in sessionStore', async () => {
      const store = new MemorySessionStore();
      const ctrl = new InterviewController({ sessionStore: store });
      const { sessionId } = await ctrl.start(makeSchema());
      const session = store.get(sessionId);
      expect(session.schema.serviceId).toBe('test_service');
      expect(session.state).toBeDefined();
    });

    it('answer retrieves session from sessionStore', async () => {
      const store = new MemorySessionStore();
      const ctrl = new InterviewController({ sessionStore: store });
      const { sessionId } = await ctrl.start(makeSchema());
      const result = await ctrl.answer(sessionId, { fieldId: 'name', value: 'Juan' });
      expect(result.saved).toBe(true);
      const session = store.get(sessionId);
      expect(session.state.getFieldValue('name')).toBe('Juan');
    });

    it('hasSession delegates to sessionStore.exists', async () => {
      const store = new MemorySessionStore();
      const ctrl = new InterviewController({ sessionStore: store });
      expect(await ctrl.hasSession('any')).toBe(false);
      const { sessionId } = await ctrl.start(makeSchema());
      expect(await ctrl.hasSession(sessionId)).toBe(true);
    });

    it('clearSession delegates to sessionStore.delete', async () => {
      const store = new MemorySessionStore();
      const ctrl = new InterviewController({ sessionStore: store });
      const { sessionId } = await ctrl.start(makeSchema());
      expect(await ctrl.hasSession(sessionId)).toBe(true);
      await ctrl.clearSession(sessionId);
      expect(await ctrl.hasSession(sessionId)).toBe(false);
      expect(store.exists(sessionId)).toBe(false);
    });

    it('getSession retrieves via sessionStore', async () => {
      const store = new MemorySessionStore();
      const ctrl = new InterviewController({ sessionStore: store });
      const { sessionId } = await ctrl.start(makeSchema());
      const session = await ctrl.getSession(sessionId);
      expect(session.sessionId).toBe(sessionId);
      expect(store.exists(sessionId)).toBe(true);
    });

    it('full flow with explicit MemorySessionStore', async () => {
      const store = new MemorySessionStore();
      const ctrl = new InterviewController({ sessionStore: store });
      const { sessionId } = await ctrl.start(makeSchema());
      const r1 = await ctrl.answer(sessionId, { fieldId: 'name', value: 'Juan' });
      expect(r1.saved).toBe(true);
      const session = await ctrl.getSession(sessionId);
      expect(session.state.completedFields.name.value).toBe('Juan');
    });

    it('custom store can be a SessionStore subclass', () => {
      class CustomStore extends SessionStore {
        constructor() { super(); this.data = new Map(); }
        create(id, d) { this.data.set(id, d); }
        get(id) { return this.data.get(id); }
        update(id, d) { if (this.data.has(id)) { Object.assign(this.data.get(id), d); return true; } return false; }
        delete(id) { return this.data.delete(id); }
        exists(id) { return this.data.has(id); }
      }
      const store = new CustomStore();
      const ctrl = new InterviewController({ sessionStore: store });
      expect(ctrl.sessionStore).toBe(store);
    });

    it('custom store works end-to-end for start and answer', async () => {
      const store = new MemorySessionStore();
      const spyCreate = vi.spyOn(store, 'create');
      const spyGet = vi.spyOn(store, 'get');
      const ctrl = new InterviewController({ sessionStore: store });
      const { sessionId } = await ctrl.start(makeSchema());
      expect(spyCreate).toHaveBeenCalledWith(sessionId, expect.any(Object));
      await ctrl.answer(sessionId, { fieldId: 'name', value: 'Juan' });
      expect(spyGet).toHaveBeenCalledWith(sessionId);
    });

    it('next uses sessionStore.get', async () => {
      const store = new MemorySessionStore();
      const spyGet = vi.spyOn(store, 'get');
      const ctrl = new InterviewController({ sessionStore: store });
      const { sessionId } = await ctrl.start(makeSchema());
      spyGet.mockClear();
      await ctrl.next(sessionId);
      expect(spyGet).toHaveBeenCalledWith(sessionId);
    });

    it('getSession throws if session removed from store externally', async () => {
      const store = new MemorySessionStore();
      const ctrl = new InterviewController({ sessionStore: store });
      await expect(ctrl.getSession('ghost')).rejects.toThrow(InterpreterError);
    });

    it('answer throws if session removed from store externally', async () => {
      const store = new MemorySessionStore();
      const ctrl = new InterviewController({ sessionStore: store });
      const { sessionId } = await ctrl.start(makeSchema());
      store.delete(sessionId);
      await expect(ctrl.answer(sessionId, { fieldId: 'name', value: 'x' })).rejects.toThrow(InterpreterError);
    });
  });

  describe('SupabaseSessionStore integration', () => {
    function makeMockSupabaseClient() {
      const stored = new Map();
      return {
        from: vi.fn(() => ({
          insert: vi.fn((data) => {
            const items = Array.isArray(data) ? data : [data];
            for (const item of items) stored.set(item.id, { ...item });
            return { error: null };
          }),
          select: vi.fn(() => ({
            eq: vi.fn((col, val) => {
              const entry = stored.get(val) || null;
              return {
                maybeSingle: vi.fn(() => ({ data: entry ? { ...entry } : null, error: null })),
              };
            }),
          })),
          update: vi.fn((updates) => ({
            eq: vi.fn((col, val) => {
              const entry = stored.get(val);
              if (entry) Object.assign(entry, updates);
              return {
                select: vi.fn(() => ({
                  maybeSingle: vi.fn(() => ({ data: stored.get(val) ? { ...stored.get(val) } : null, error: null })),
                })),
              };
            }),
          })),
          delete: vi.fn(() => ({
            eq: vi.fn((col, val) => {
              stored.delete(val);
              return { error: null };
            }),
          })),
        })),
        _stored: stored,
      };
    }

    it('answers with SupabaseSessionStore succeed', async () => {
      const supabase = makeMockSupabaseClient();
      const store = new SupabaseSessionStore(supabase);
      const ctrl = new InterviewController({ sessionStore: store });
      const { sessionId } = await ctrl.start(makeSchema());
      const result = await ctrl.answer(sessionId, { fieldId: 'name', value: 'Juan' });
      expect(result.saved).toBe(true);
    });

    it('start creates session via supabase store', async () => {
      const supabase = makeMockSupabaseClient();
      const store = new SupabaseSessionStore(supabase);
      const ctrl = new InterviewController({ sessionStore: store });
      const { sessionId } = await ctrl.start(makeSchema());
      expect(await ctrl.hasSession(sessionId)).toBe(true);
    });

    it('hasSession works with supabase store', async () => {
      const supabase = makeMockSupabaseClient();
      const store = new SupabaseSessionStore(supabase);
      const ctrl = new InterviewController({ sessionStore: store });
      expect(await ctrl.hasSession('nonexistent')).toBe(false);
      const { sessionId } = await ctrl.start(makeSchema());
      expect(await ctrl.hasSession(sessionId)).toBe(true);
    });

    it('getSession retrieves via supabase store', async () => {
      const supabase = makeMockSupabaseClient();
      const store = new SupabaseSessionStore(supabase);
      const ctrl = new InterviewController({ sessionStore: store });
      const { sessionId } = await ctrl.start(makeSchema());
      const session = await ctrl.getSession(sessionId);
      expect(session.sessionId).toBe(sessionId);
      expect(session.schema.serviceId).toBe('test_service');
    });

    it('clearSession works with supabase store', async () => {
      const supabase = makeMockSupabaseClient();
      const store = new SupabaseSessionStore(supabase);
      const ctrl = new InterviewController({ sessionStore: store });
      const { sessionId } = await ctrl.start(makeSchema());
      expect(await ctrl.hasSession(sessionId)).toBe(true);
      await ctrl.clearSession(sessionId);
      expect(await ctrl.hasSession(sessionId)).toBe(false);
    });

    it('next works with supabase store', async () => {
      const supabase = makeMockSupabaseClient();
      const store = new SupabaseSessionStore(supabase);
      const ctrl = new InterviewController({ sessionStore: store });
      const { sessionId } = await ctrl.start(makeSchema());
      const result = await ctrl.next(sessionId);
      expect(result.sessionId).toBe(sessionId);
    });

    it('full flow completes with supabase store', async () => {
      const supabase = makeMockSupabaseClient();
      const store = new SupabaseSessionStore(supabase);
      const ctrl = new InterviewController({ sessionStore: store });
      const { sessionId } = await ctrl.start(makeSchema());
      await ctrl.answer(sessionId, { fieldId: 'name', value: 'Juan' });
      await ctrl.answer(sessionId, { fieldId: 'phone', value: '123456789' });
      await ctrl.answer(sessionId, { fieldId: 'color', value: 'rojo' });
      await ctrl.answer(sessionId, { fieldId: 'quantity', value: 5 });
      await ctrl.answer(sessionId, { fieldId: 'agree', value: true });
      await ctrl.answer(sessionId, { fieldId: 'tags', value: ['a'] });
      const last = await ctrl.answer(sessionId, { fieldId: 'comment', value: 'Todo bien' });
      expect(last.interviewComplete).toBe(true);
    });

    it('controller works without MemorySessionStore dependency', () => {
      const supabase = makeMockSupabaseClient();
      const store = new SupabaseSessionStore(supabase);
      const ctrl = new InterviewController({ sessionStore: store });
      expect(ctrl.sessionStore).toBe(store);
      expect(ctrl.sessionStore).not.toBeInstanceOf(MemorySessionStore);
    });

    it('insert error propagates from store', async () => {
      const supabase = makeMockSupabaseClient();
      supabase.from = vi.fn(() => ({
        insert: vi.fn(() => ({ error: { message: 'db error' } })),
      }));
      const store = new SupabaseSessionStore(supabase);
      const ctrl = new InterviewController({ sessionStore: store });
      await expect(ctrl.start(makeSchema())).rejects.toThrow(StoreError);
    });

    it('select error propagates from store', async () => {
      const supabase = makeMockSupabaseClient();
      supabase.from = vi.fn(() => ({
        insert: vi.fn((data) => {
          const items = Array.isArray(data) ? data : [data];
          return { data: items, error: null };
        }),
        select: vi.fn(() => ({
          eq: vi.fn(() => ({
            maybeSingle: vi.fn(() => ({ data: null, error: { message: 'db error' } })),
          })),
        })),
        update: vi.fn(() => ({
          eq: vi.fn(() => ({
            select: vi.fn(() => ({
              maybeSingle: vi.fn(() => ({ data: null, error: { message: 'db error' } })),
            })),
          })),
        })),
      }));
      const store = new SupabaseSessionStore(supabase);
      const ctrl = new InterviewController({ sessionStore: store });
      const schema = makeSchema();
      schema.serviceId = 'test';
      await ctrl.start(schema);
      await expect(ctrl.answer('other-id', { fieldId: 'name', value: 'Juan' })).rejects.toThrow(StoreError);
    });
  });
});

// ── Integration: Interview → CompletionPipeline ────────────────

function fakeClientService(existingByPhone = new Map()) {
  const created = [];
  return {
    created,
    async getClientByPhone(phone) {
      return existingByPhone.get(phone) || null;
    },
    async createClient(data) {
      const client = { id: `client-${created.length + 1}`, ...data };
      created.push(client);
      existingByPhone.set(data.phone, client);
      return client;
    },
  };
}

function fakeBusinessService(methodName) {
  const created = [];
  return {
    created,
    async [methodName](data) {
      const entity = { id: `${created.length + 1}`, ...data };
      created.push(entity);
      return entity;
    },
  };
}

describe('completion integration', () => {
  const REPAIR_SCHEMA = BUILT_IN_SCHEMAS['repair-request'];
  const BUDGET_SCHEMA = BUILT_IN_SCHEMAS['budget-request'];
  const PRINT_SCHEMA = BUILT_IN_SCHEMAS['print-order'];

  function buildPipeline(sessionStore, clientService, services) {
    const clientResolver = new ClientResolver({ clientService });
    const completionHandler = new CompletionHandler({
      repairService: services.repairService,
      budgetService: services.budgetService,
      printService: services.printService,
      clientResolver,
    });
    return new CompletionPipeline({
      sessionStore,
      clientResolver,
      completionHandler,
    });
  }

  it('seeds → completes → pipeline creates entity → status completed → summary', async () => {
    const sessionStore = new MemorySessionStore();
    const clientService = fakeClientService();
    const services = {
      repairService: fakeBusinessService('createRepair'),
      budgetService: fakeBusinessService('createBudget'),
      printService: fakeBusinessService('createPrintOrder'),
    };
    const pipeline = buildPipeline(sessionStore, clientService, services);
    const eventQueue = { enqueued: [], async enqueue(event) { this.enqueued.push(event); } };
    const eventPipeline = new CompletionPipeline({
      sessionStore,
      clientResolver: new ClientResolver({ clientService }),
      completionHandler: new CompletionHandler({
        repairService: services.repairService,
        budgetService: services.budgetService,
        printService: services.printService,
        clientResolver: new ClientResolver({ clientService }),
      }),
      eventQueue,
    });

    const interpreter = {
      interpret: vi.fn().mockResolvedValue({
        extractedFields: {
          clientName: 'Juan',
          clientPhone: '3415555555',
          device: 'Samsung A54',
          problem: 'no prende',
        },
        ignoredFields: [],
        ambiguousFields: [],
        confidence: 0.95,
        detectedIntent: 'ANSWER',
        reasoning: 'User provided all required fields',
        unknownFragments: [],
        aiUsed: true,
        latency: 0,
      }),
    };

    const ctrl = new InterviewController({ sessionStore, interpreter });
    const message = 'Hola, soy Juan. Mi teléfono es 3415555555. Tengo un Samsung A54 que no prende.';
    const result = await ctrl.start(REPAIR_SCHEMA, message);

    // Interview created with all 4 required fields seeded
    expect(result.sessionId).toBeDefined();
    expect(result.interviewComplete).toBe(true);
    expect(result.summary).toBeTruthy();

    const session = await sessionStore.get(result.sessionId);
    expect(session.state.isFieldCompleted('clientName')).toBe(true);
    expect(session.state.getFieldValue('clientName')).toBe('Juan');
    expect(session.state.isFieldCompleted('clientPhone')).toBe(true);
    expect(session.state.getFieldValue('clientPhone')).toBe('3415555555');
    expect(session.state.isFieldCompleted('device')).toBe(true);
    expect(session.state.getFieldValue('device')).toBe('Samsung A54');
    expect(session.state.isFieldCompleted('problem')).toBe(true);
    expect(session.state.getFieldValue('problem')).toBe('no prende');

    // CompletionPipeline executes
    const pipelineResult = await eventPipeline.execute({ sessionId: result.sessionId });
    expect(pipelineResult.success).toBe(true);
    expect(pipelineResult.entity.type).toBe('repair');
    expect(services.repairService.created).toHaveLength(1);
    expect(services.repairService.created[0].device).toBe('Samsung A54');
    expect(clientService.created).toHaveLength(1);
    expect(clientService.created[0].phone).toBe('3415555555');

    // Status is completed
    const completedSession = await sessionStore.get(result.sessionId);
    expect(completedSession.status).toBe('completed');

    // Events emitted
    const eventTypes = eventQueue.enqueued.map(e => e.type);
    expect(eventTypes).toContain('REPAIR_CREATED');
    expect(eventTypes).toContain('CLIENT_CREATED');
  });

  it('completion via answer flow: multi-step interview → pipeline', async () => {
    const sessionStore = new MemorySessionStore();
    const clientService = fakeClientService();
    const services = {
      repairService: fakeBusinessService('createRepair'),
      budgetService: fakeBusinessService('createBudget'),
      printService: fakeBusinessService('createPrintOrder'),
    };
    const eventQueue = { enqueued: [], async enqueue(event) { this.enqueued.push(event); } };
    const pipeline = new CompletionPipeline({
      sessionStore,
      clientResolver: new ClientResolver({ clientService }),
      completionHandler: new CompletionHandler({
        repairService: services.repairService,
        budgetService: services.budgetService,
        printService: services.printService,
        clientResolver: new ClientResolver({ clientService }),
      }),
      eventQueue,
    });

    const interpreter = {
      interpret: vi.fn()
        .mockResolvedValueOnce({
          extractedFields: { clientName: 'María', clientPhone: '3416666666' },
          ignoredFields: [], ambiguousFields: [], confidence: 0.9,
          detectedIntent: 'ANSWER', reasoning: '', unknownFragments: [], aiUsed: true, latency: 0,
        })
        .mockResolvedValueOnce({
          extractedFields: { device: 'iPhone 13' },
          ignoredFields: [], ambiguousFields: [], confidence: 0.9,
          detectedIntent: 'ANSWER', reasoning: '', unknownFragments: [], aiUsed: true, latency: 0,
        })
        .mockResolvedValueOnce({
          extractedFields: { problem: 'pantalla rota' },
          ignoredFields: [], ambiguousFields: [], confidence: 0.9,
          detectedIntent: 'ANSWER', reasoning: '', unknownFragments: [], aiUsed: true, latency: 0,
        }),
    };

    const ctrl = new InterviewController({ sessionStore, interpreter });
    const startResult = await ctrl.start(REPAIR_SCHEMA);
    expect(startResult.interviewComplete).toBe(false);

    const answer1 = await ctrl.answerMessage(startResult.sessionId, 'Soy María, mi número es 3416666666');
    expect(answer1.interviewComplete).toBe(false);

    const answer2 = await ctrl.answerMessage(startResult.sessionId, 'Es un iPhone 13');
    expect(answer2.interviewComplete).toBe(false);

    const answer3 = await ctrl.answerMessage(startResult.sessionId, 'La pantalla está rota');
    expect(answer3.interviewComplete).toBe(true);

    // Pipeline
    const pipelineResult = await pipeline.execute({ sessionId: startResult.sessionId });
    expect(pipelineResult.success).toBe(true);
    expect(pipelineResult.entity.type).toBe('repair');
    expect(services.repairService.created[0].device).toBe('iPhone 13');

    const session = await sessionStore.get(startResult.sessionId);
    expect(session.status).toBe('completed');
  });

  it('pipeline skips if already completed (idempotent)', async () => {
    const sessionStore = new MemorySessionStore();
    const clientService = fakeClientService();
    const services = {
      repairService: fakeBusinessService('createRepair'),
      budgetService: fakeBusinessService('createBudget'),
      printService: fakeBusinessService('createPrintOrder'),
    };
    const eventQueue = { enqueued: [], async enqueue(event) { this.enqueued.push(event); } };
    const pipeline = new CompletionPipeline({
      sessionStore,
      clientResolver: new ClientResolver({ clientService }),
      completionHandler: new CompletionHandler({
        repairService: services.repairService,
        budgetService: services.budgetService,
        printService: services.printService,
        clientResolver: new ClientResolver({ clientService }),
      }),
      eventQueue,
    });

    const interpreter = {
      interpret: vi.fn().mockResolvedValue({
        extractedFields: {
          clientName: 'Carlos',
          clientPhone: '3417777777',
          device: 'Notebook Dell',
          problem: 'no anda',
        },
        ignoredFields: [], ambiguousFields: [], confidence: 0.9,
        detectedIntent: 'ANSWER', reasoning: '', unknownFragments: [], aiUsed: true, latency: 0,
      }),
    };

    const ctrl = new InterviewController({ sessionStore, interpreter });
    const startResult = await ctrl.start(REPAIR_SCHEMA, 'Soy Carlos, 3417777777, Dell, no anda');
    expect(startResult.interviewComplete).toBe(true);

    const first = await pipeline.execute({ sessionId: startResult.sessionId });
    expect(first.success).toBe(true);
    expect(first.skipped).toBe(false);
    expect(services.repairService.created).toHaveLength(1);

    const second = await pipeline.execute({ sessionId: startResult.sessionId });
    expect(second.success).toBe(true);
    expect(second.skipped).toBe(true);
    expect(services.repairService.created).toHaveLength(1);
    expect(eventQueue.enqueued).toHaveLength(2);
  });
});
