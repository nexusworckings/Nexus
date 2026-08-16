import { describe, it, expect, vi } from 'vitest';
import * as validators from './validators.js';
import { createInterviewApi } from './controller.js';
import { createInterviewRouter } from './routes.js';
import { InterviewController } from '../../../services/interview/v2/interview-controller.js';
import { SchemaError } from '../../../services/interview/v2/errors.js';

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

const TEST_SCHEMA = makeSchema();

function makeMockRegistry() {
  return {
    load: vi.fn(async (id) => {
      if (id === 'test_service') return TEST_SCHEMA;
      throw new SchemaError('SCHEMA_NOT_FOUND', `Schema not found for service: '${id}'`, id);
    }),
    list: vi.fn(async () => ['test_service']),
    clear: vi.fn(),
  };
}

function makeApiController(overrides = {}) {
  const registry = overrides.registry || makeMockRegistry();
  const interviewController = overrides.interviewController || new InterviewController();
  return createInterviewApi({ schemaRegistry: registry, interviewController });
}

function makeMockRequest(method, body = null, pathRemainder = '') {
  return {
    method,
    json: vi.fn(async () => body),
  };
}

// ── Validators ──────────────────────────────────────────────────

describe('validators', () => {
  describe('validateStartInput', () => {
    it('rejects null body', () => {
      const err = validators.validateStartInput(null);
      expect(err).not.toBeNull();
      expect(err.code).toBe('INVALID_INPUT');
    });

    it('rejects undefined body', () => {
      const err = validators.validateStartInput(undefined);
      expect(err).not.toBeNull();
      expect(err.code).toBe('INVALID_INPUT');
    });

    it('rejects array body', () => {
      const err = validators.validateStartInput([]);
      expect(err).not.toBeNull();
      expect(err.code).toBe('INVALID_INPUT');
    });

    it('rejects missing schemaId', () => {
      const err = validators.validateStartInput({});
      expect(err).not.toBeNull();
      expect(err.code).toBe('MISSING_SCHEMA_ID');
    });

    it('rejects empty schemaId', () => {
      const err = validators.validateStartInput({ schemaId: '' });
      expect(err).not.toBeNull();
      expect(err.code).toBe('MISSING_SCHEMA_ID');
    });

    it('rejects non-string schemaId', () => {
      const err = validators.validateStartInput({ schemaId: 123 });
      expect(err).not.toBeNull();
      expect(err.code).toBe('MISSING_SCHEMA_ID');
    });

    it('accepts valid input', () => {
      const err = validators.validateStartInput({ schemaId: 'repair_request' });
      expect(err).toBeNull();
    });
  });

  describe('validateAnswerInput', () => {
    it('rejects null body', () => {
      const err = validators.validateAnswerInput(null);
      expect(err).not.toBeNull();
      expect(err.code).toBe('INVALID_INPUT');
    });

    it('rejects missing fieldId', () => {
      const err = validators.validateAnswerInput({ value: 'test' });
      expect(err).not.toBeNull();
      expect(err.code).toBe('MISSING_FIELD_ID');
    });

    it('rejects empty fieldId', () => {
      const err = validators.validateAnswerInput({ fieldId: '', value: 'test' });
      expect(err).not.toBeNull();
      expect(err.code).toBe('MISSING_FIELD_ID');
    });

    it('rejects non-string fieldId', () => {
      const err = validators.validateAnswerInput({ fieldId: 123, value: 'test' });
      expect(err).not.toBeNull();
      expect(err.code).toBe('MISSING_FIELD_ID');
    });

    it('accepts valid input with string value', () => {
      const err = validators.validateAnswerInput({ fieldId: 'name', value: 'Juan' });
      expect(err).toBeNull();
    });

    it('accepts valid input with number value', () => {
      const err = validators.validateAnswerInput({ fieldId: 'quantity', value: 5 });
      expect(err).toBeNull();
    });

    it('accepts valid input with boolean value', () => {
      const err = validators.validateAnswerInput({ fieldId: 'agree', value: true });
      expect(err).toBeNull();
    });

    it('accepts valid input with array value', () => {
      const err = validators.validateAnswerInput({ fieldId: 'tags', value: ['a', 'b'] });
      expect(err).toBeNull();
    });
  });

  describe('validateSessionId', () => {
    it('rejects null', () => {
      const err = validators.validateSessionId(null);
      expect(err).not.toBeNull();
      expect(err.code).toBe('INVALID_SESSION_ID');
    });

    it('rejects empty string', () => {
      const err = validators.validateSessionId('');
      expect(err).not.toBeNull();
      expect(err.code).toBe('INVALID_SESSION_ID');
    });

    it('rejects non-string', () => {
      const err = validators.validateSessionId(123);
      expect(err).not.toBeNull();
      expect(err.code).toBe('INVALID_SESSION_ID');
    });

    it('accepts valid sessionId', () => {
      const err = validators.validateSessionId('abc123');
      expect(err).toBeNull();
    });
  });
});

// ── API Controller ─────────────────────────────────────────────

describe('createInterviewApi', () => {
  it('throws if schemaRegistry is missing', () => {
    expect(() => createInterviewApi({ interviewController: {} })).toThrow('schemaRegistry');
  });

  it('throws if interviewController is missing', () => {
    expect(() => createInterviewApi({ schemaRegistry: {} })).toThrow('interviewController');
  });

  describe('start', () => {
    it('starts an interview successfully', async () => {
      const api = makeApiController();
      const { body, httpStatus } = await api.start({ schemaId: 'test_service' });

      expect(httpStatus).toBe(200);
      expect(body.success).toBe(true);
      expect(body.sessionId).toBeTruthy();
      expect(typeof body.sessionId).toBe('string');
      expect(body.question).toBeTruthy();
      expect(body.question.question).toBe('¿Cuál es tu nombre?');
      expect(body.question.fieldId).toBe('name');
    });

    it('returns 400 for invalid input', async () => {
      const api = makeApiController();
      const { body, httpStatus } = await api.start(null);

      expect(httpStatus).toBe(400);
      expect(body.success).toBe(false);
      expect(body.error).toBeTruthy();
    });

    it('returns 404 for unknown schema', async () => {
      const api = makeApiController();
      const { body, httpStatus } = await api.start({ schemaId: 'unknown_schema' });

      expect(httpStatus).toBe(404);
      expect(body.success).toBe(false);
      expect(body.error.code).toBe('SCHEMA_NOT_FOUND');
    });

    it('returns 400 when InterviewController rejects', async () => {
      const registry = makeMockRegistry();
      registry.load = vi.fn(async () => ({ fields: [] }));
      const api = makeApiController({ registry });
      const { body, httpStatus } = await api.start({ schemaId: 'test_service' });

      expect(httpStatus).toBe(400);
      expect(body.success).toBe(false);
    });

    it('propagates non-SchemaError from schemaRegistry.load', async () => {
      const registry = makeMockRegistry();
      registry.load = vi.fn(async () => { throw new Error('Unexpected DB error'); });
      const api = makeApiController({ registry });

      await expect(api.start({ schemaId: 'test_service' })).rejects.toThrow('Unexpected DB error');
    });

    it('propagates non-InterviewError from interviewController.start', async () => {
      const interviewController = new InterviewController();
      const origStart = interviewController.start.bind(interviewController);
      interviewController.start = vi.fn(async () => { throw new Error('Unexpected controller error'); });
      const api = makeApiController({ interviewController });

      await expect(api.start({ schemaId: 'test_service' })).rejects.toThrow('Unexpected controller error');
    });

  describe('answer', () => {
    it('saves a valid answer and returns next question', async () => {
      const api = makeApiController();
      const startResult = await api.start({ schemaId: 'test_service' });
      const sessionId = startResult.body.sessionId;

      const { body, httpStatus } = await api.answer(sessionId, { fieldId: 'name', value: 'Juan' });

      expect(httpStatus).toBe(200);
      expect(body.success).toBe(true);
      expect(body.sessionId).toBe(sessionId);
      expect(body.completed).toBe(false);
      expect(body.question).toBeTruthy();
      expect(body.question.fieldId).toBe('phone');
      expect(body.retry).toBeUndefined();
    });

    it('returns 404 for non-existent session', async () => {
      const api = makeApiController();
      const { body, httpStatus } = await api.answer('bad-session', { fieldId: 'name', value: 'Juan' });

      expect(httpStatus).toBe(404);
      expect(body.success).toBe(false);
      expect(body.error.code).toBe('IC_SESSION_NOT_FOUND');
    });

    it('returns 400 for invalid sessionId', async () => {
      const api = makeApiController();
      const { body, httpStatus } = await api.answer('', { fieldId: 'name', value: 'Juan' });

      expect(httpStatus).toBe(400);
      expect(body.success).toBe(false);
    });

    it('returns 400 for invalid body', async () => {
      const api = makeApiController();
      const startResult = await api.start({ schemaId: 'test_service' });
      const sessionId = startResult.body.sessionId;

      const { body, httpStatus } = await api.answer(sessionId, null);

      expect(httpStatus).toBe(400);
      expect(body.success).toBe(false);
    });

    it('returns 400 for missing fieldId', async () => {
      const api = makeApiController();
      const startResult = await api.start({ schemaId: 'test_service' });
      const sessionId = startResult.body.sessionId;

      const { body, httpStatus } = await api.answer(sessionId, { value: 'test' });

      expect(httpStatus).toBe(400);
      expect(body.success).toBe(false);
    });

    it('returns retry when validation fails', async () => {
      const api = makeApiController();
      const startResult = await api.start({ schemaId: 'test_service' });
      const sessionId = startResult.body.sessionId;

      const { body, httpStatus } = await api.answer(sessionId, { fieldId: 'name', value: '' });

      expect(httpStatus).toBe(200);
      expect(body.success).toBe(true);
      expect(body.retry).toBe(true);
      expect(body.validationError).toBeTruthy();
    });

    it('handles error from InterviewController for already completed field', async () => {
      const api = makeApiController();
      const startResult = await api.start({ schemaId: 'test_service' });
      const sessionId = startResult.body.sessionId;

      await api.answer(sessionId, { fieldId: 'name', value: 'Juan' });
      const { body, httpStatus } = await api.answer(sessionId, { fieldId: 'name', value: 'Pedro' });

      expect(httpStatus).toBe(404);
      expect(body.success).toBe(false);
      expect(body.error.code).toBe('IC_FIELD_ALREADY_COMPLETED');
    });

    it('propagates non-InterpreterError from interviewController.answer', async () => {
      const interviewController = new InterviewController();
      interviewController.answer = vi.fn(async () => { throw new Error('Unexpected answer error'); });
      const api = makeApiController({ interviewController });
      const startResult = await api.start({ schemaId: 'test_service' });
      const sessionId = startResult.body.sessionId;

      await expect(api.answer(sessionId, { fieldId: 'name', value: 'Juan' })).rejects.toThrow('Unexpected answer error');
    });

    it('returns 400 for non-InterpreterError InterviewError in answer', async () => {
      const { StateError } = await import('../../../services/interview/v2/errors.js');
      const interviewController = new InterviewController();
      interviewController.answer = vi.fn(async () => { throw new StateError('STATE_BAD', 'State error test'); });
      const api = makeApiController({ interviewController });
      const startResult = await api.start({ schemaId: 'test_service' });
      const sessionId = startResult.body.sessionId;

      const { body, httpStatus } = await api.answer(sessionId, { fieldId: 'name', value: 'Juan' });

      expect(httpStatus).toBe(400);
      expect(body.success).toBe(false);
      expect(body.error.code).toBe('STATE_BAD');
    });

    it('completes interview after answering all required fields', async () => {
      const api = makeApiController();
      const startResult = await api.start({ schemaId: 'test_service' });
      const sessionId = startResult.body.sessionId;

      await api.answer(sessionId, { fieldId: 'name', value: 'Juan' });
      await api.answer(sessionId, { fieldId: 'phone', value: '123456789' });
      await api.answer(sessionId, { fieldId: 'color', value: 'rojo' });
      await api.answer(sessionId, { fieldId: 'quantity', value: 5 });
      await api.answer(sessionId, { fieldId: 'agree', value: true });
      const { body, httpStatus } = await api.answer(sessionId, { fieldId: 'tags', value: ['a'] });

      expect(httpStatus).toBe(200);
      expect(body.success).toBe(true);
      expect(body.completed).toBe(true);
      expect(body.question).toBeNull();
    });
  });

  describe('getSession', () => {
    it('returns session data for pending session', async () => {
      const api = makeApiController();
      const startResult = await api.start({ schemaId: 'test_service' });
      const sessionId = startResult.body.sessionId;

      const { body, httpStatus } = await api.getSession(sessionId);

      expect(httpStatus).toBe(200);
      expect(body.success).toBe(true);
      expect(body.sessionId).toBe(sessionId);
      expect(body.status).toBe('pending');
      expect(body.answers).toEqual({});
    });

    it('returns session data for active session with answers', async () => {
      const api = makeApiController();
      const startResult = await api.start({ schemaId: 'test_service' });
      const sessionId = startResult.body.sessionId;

      await api.answer(sessionId, { fieldId: 'name', value: 'Juan' });
      const { body, httpStatus } = await api.getSession(sessionId);

      expect(httpStatus).toBe(200);
      expect(body.success).toBe(true);
      expect(body.status).toBe('active');
      expect(body.answers).toEqual({ name: 'Juan' });
    });

    it('returns 404 for non-existent session', async () => {
      const api = makeApiController();
      const { body, httpStatus } = await api.getSession('nonexistent');

      expect(httpStatus).toBe(404);
      expect(body.success).toBe(false);
      expect(body.error.code).toBe('SESSION_NOT_FOUND');
    });

    it('returns 400 for invalid sessionId', async () => {
      const api = makeApiController();
      const { body, httpStatus } = await api.getSession('');

      expect(httpStatus).toBe(400);
      expect(body.success).toBe(false);
    });
  });

  describe('clearSession', () => {
    it('clears an existing session', async () => {
      const api = makeApiController();
      const startResult = await api.start({ schemaId: 'test_service' });
      const sessionId = startResult.body.sessionId;

      const { body, httpStatus } = await api.clearSession(sessionId);

      expect(httpStatus).toBe(200);
      expect(body.success).toBe(true);

      const getResult = await api.getSession(sessionId);
      expect(getResult.httpStatus).toBe(404);
    });

    it('clears non-existent session without error', async () => {
      const api = makeApiController();
      const { body, httpStatus } = await api.clearSession('nonexistent');

      expect(httpStatus).toBe(200);
      expect(body.success).toBe(true);
    });

    it('returns 400 for invalid sessionId', async () => {
      const api = makeApiController();
      const { body, httpStatus } = await api.clearSession('');

      expect(httpStatus).toBe(400);
      expect(body.success).toBe(false);
    });
  });
  });
});

// ── HTTP Routes ────────────────────────────────────────────────

describe('handleInterviewV2', () => {
  function makeTestRouter(overrides = {}) {
    const registry = overrides.registry || {
      load: vi.fn(async (id) => {
        if (id === 'test_service') return TEST_SCHEMA;
        throw new SchemaError('SCHEMA_NOT_FOUND', `Schema not found for service: '${id}'`, id);
      }),
    };
    const interviewController = overrides.interviewController || new InterviewController();
    return createInterviewRouter({ schemaRegistry: registry, interviewController });
  }

  it('POST /start creates interview', async () => {
    const router = makeTestRouter();
    const req = makeMockRequest('POST', { schemaId: 'test_service' });
    const res = await router(req, {}, 'start');
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.success).toBe(true);
    expect(data.sessionId).toBeTruthy();
    expect(data.question).toBeTruthy();
  });

  it('POST /start returns 400 for invalid body', async () => {
    const router = makeTestRouter();
    const req = makeMockRequest('POST', null);
    const res = await router(req, {}, 'start');
    const data = await res.json();

    expect(res.status).toBe(400);
    expect(data.success).toBe(false);
    expect(data.error).toBeTruthy();
  });

  it('POST /start returns 404 for unknown schema', async () => {
    const router = makeTestRouter();
    const req = makeMockRequest('POST', { schemaId: 'unknown' });
    const res = await router(req, {}, 'start');
    const data = await res.json();

    expect(res.status).toBe(404);
    expect(data.success).toBe(false);
    expect(data.error.code).toBe('SCHEMA_NOT_FOUND');
  });

  it('POST /:sessionId/answer saves answer', async () => {
    const router = makeTestRouter();
    const startReq = makeMockRequest('POST', { schemaId: 'test_service' });
    const startRes = await router(startReq, {}, 'start');
    const { sessionId } = await startRes.json();

    const ansReq = makeMockRequest('POST', { fieldId: 'name', value: 'Juan' });
    const ansRes = await router(ansReq, {}, `${sessionId}/answer`);
    const data = await ansRes.json();

    expect(ansRes.status).toBe(200);
    expect(data.success).toBe(true);
    expect(data.sessionId).toBe(sessionId);
    expect(data.completed).toBe(false);
    expect(data.question).toBeTruthy();
  });

  it('POST /:sessionId/answer returns 404 for bad session', async () => {
    const router = makeTestRouter();
    const req = makeMockRequest('POST', { fieldId: 'name', value: 'Juan' });
    const res = await router(req, {}, 'bad-id/answer');
    const data = await res.json();

    expect(res.status).toBe(404);
    expect(data.success).toBe(false);
  });

  it('POST /:sessionId/answer returns retry on validation error', async () => {
    const router = makeTestRouter();
    const startReq = makeMockRequest('POST', { schemaId: 'test_service' });
    const startRes = await router(startReq, {}, 'start');
    const { sessionId } = await startRes.json();

    const ansReq = makeMockRequest('POST', { fieldId: 'name', value: '' });
    const ansRes = await router(ansReq, {}, `${sessionId}/answer`);
    const data = await ansRes.json();

    expect(ansRes.status).toBe(200);
    expect(data.success).toBe(true);
    expect(data.retry).toBe(true);
    expect(data.validationError).toBeTruthy();
  });

  it('GET /:sessionId returns session', async () => {
    const router = makeTestRouter();
    const startReq = makeMockRequest('POST', { schemaId: 'test_service' });
    const startRes = await router(startReq, {}, 'start');
    const { sessionId } = await startRes.json();

    const getRes = await router({ method: 'GET' }, {}, sessionId);
    const data = await getRes.json();

    expect(getRes.status).toBe(200);
    expect(data.success).toBe(true);
    expect(data.sessionId).toBe(sessionId);
  });

  it('GET /:sessionId returns 404 for unknown session', async () => {
    const router = makeTestRouter();
    const res = await router({ method: 'GET' }, {}, 'nonexistent');
    const data = await res.json();

    expect(res.status).toBe(404);
    expect(data.success).toBe(false);
    expect(data.error.code).toBe('SESSION_NOT_FOUND');
  });

  it('DELETE /:sessionId clears session', async () => {
    const router = makeTestRouter();
    const startReq = makeMockRequest('POST', { schemaId: 'test_service' });
    const startRes = await router(startReq, {}, 'start');
    const { sessionId } = await startRes.json();

    const delRes = await router({ method: 'DELETE' }, {}, sessionId);
    const data = await delRes.json();

    expect(delRes.status).toBe(200);
    expect(data.success).toBe(true);

    const getRes = await router({ method: 'GET' }, {}, sessionId);
    expect(getRes.status).toBe(404);
  });

  it('returns 404 for unknown path', async () => {
    const router = makeTestRouter();
    const req = makeMockRequest('GET');
    const res = await router(req, {}, 'unknown/path');
    const data = await res.json();

    expect(res.status).toBe(404);
    expect(data.success).toBe(false);
  });

  it('returns 404 for empty path remainder', async () => {
    const router = makeTestRouter();
    const req = makeMockRequest('GET');
    const res = await router(req, {}, '');
    const data = await res.json();

    expect(res.status).toBe(404);
    expect(data.success).toBe(false);
  });

  it('returns 404 for wrong method on existing path', async () => {
    const router = makeTestRouter();
    const req = makeMockRequest('GET');
    const res = await router(req, {}, 'start');
    const data = await res.json();

    expect(res.status).toBe(404);
    expect(data.success).toBe(false);
  });

  it('handles non-JSON body in start', async () => {
    const router = makeTestRouter();
    const req = {
      method: 'POST',
      json: vi.fn(async () => { throw new Error('Invalid JSON'); }),
    };
    const res = await router(req, {}, 'start');
    const data = await res.json();

    expect(res.status).toBe(400);
    expect(data.success).toBe(false);
  });

  it('handles non-JSON body in answer', async () => {
    const router = makeTestRouter();
    const startReq = makeMockRequest('POST', { schemaId: 'test_service' });
    const startRes = await router(startReq, {}, 'start');
    const { sessionId } = await startRes.json();

    const req = {
      method: 'POST',
      json: vi.fn(async () => { throw new Error('Invalid JSON'); }),
    };
    const res = await router(req, {}, `${sessionId}/answer`);
    const data = await res.json();

    expect(res.status).toBe(400);
    expect(data.success).toBe(false);
  });
});
