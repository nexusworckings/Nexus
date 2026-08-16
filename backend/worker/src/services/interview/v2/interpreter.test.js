import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Interpreter, INTENTS } from './interpreter.js';
import { InterpreterError } from './errors.js';

// ── Helpers ─────────────────────────────────────────────────────

function createMockState(completedFields = {}) {
  const entries = {};
  for (const [key, value] of Object.entries(completedFields)) {
    entries[key] = { value, source: 'user', timestamp: '2026-07-26T00:00:00.000Z' };
  }
  return {
    getCompletedFields: () => entries,
  };
}

function makeSchema(overrides = {}) {
  return {
    serviceName: 'Test Service',
    description: 'A test service schema',
    fields: [
      { id: 'name', type: 'text', label: 'Name', required: true },
      { id: 'phone', type: 'phone', label: 'Phone', validation: { pattern: '^\\d{10,13}$' } },
      {
        id: 'material',
        type: 'select',
        label: 'Material',
        options: [
          { value: 'PLA', label: 'PLA (económico)' },
          { value: 'ABS', label: 'ABS (resistente al calor)' },
          { value: 'PETG', label: 'PETG (resistente a la intemperie)' },
        ],
      },
      { id: 'quantity', type: 'number', label: 'Quantity', unit: 'unidades', validation: { min: 1, max: 100 } },
      { id: 'color', type: 'select', label: 'Color', options: [{ value: 'rojo', label: 'Rojo' }, { value: 'azul', label: 'Azul' }] },
      { id: 'agree', type: 'boolean', label: 'Agree' },
      { id: 'tags', type: 'multiselect', label: 'Tags', options: [{ value: 'urgente', label: 'Urgente' }, { value: 'normal', label: 'Normal' }] },
    ],
    ...overrides,
  };
}

function makeAiAdapter(mockImpl) {
  return { generate: mockImpl || vi.fn() };
}

function makeValidResponse(fieldOverrides = {}) {
  return JSON.stringify({
    intent: 'ANSWER',
    reasoning: 'User provided name, material, and quantity',
    fields: {
      name: 'Juan',
      material: 'PLA',
      quantity: 5,
      ...fieldOverrides,
    },
    ambiguous: [],
    unknownFragments: [],
  });
}

// ── Tests ───────────────────────────────────────────────────────

describe('Interpreter', () => {
  describe('constructor', () => {
    it('requires an aiAdapter with generate method', () => {
      expect(() => new Interpreter()).toThrow(InterpreterError);
      expect(() => new Interpreter({})).toThrow(InterpreterError);
      expect(() => new Interpreter({ aiAdapter: {} })).toThrow(InterpreterError);
      expect(() => new Interpreter({ aiAdapter: { generate: 'not a function' } })).toThrow(InterpreterError);
    });

    it('accepts a valid aiAdapter', () => {
      const adapter = makeAiAdapter();
      const interpreter = new Interpreter({ aiAdapter: adapter });
      expect(interpreter).toBeInstanceOf(Interpreter);
    });
  });

  describe('input validation', () => {
    let interpreter;
    beforeEach(() => {
      interpreter = new Interpreter({ aiAdapter: makeAiAdapter() });
    });

    it('rejects null schema', async () => {
      await expect(interpreter.interpret(null, createMockState(), 'hello')).rejects.toThrow(InterpreterError);
    });

    it('rejects undefined schema', async () => {
      await expect(interpreter.interpret(undefined, createMockState(), 'hello')).rejects.toThrow(InterpreterError);
    });

    it('rejects schema without fields', async () => {
      await expect(interpreter.interpret({}, createMockState(), 'hello')).rejects.toThrow(InterpreterError);
    });

    it('rejects null state', async () => {
      await expect(interpreter.interpret(makeSchema(), null, 'hello')).rejects.toThrow(InterpreterError);
    });

    it('rejects state without getCompletedFields', async () => {
      await expect(interpreter.interpret(makeSchema(), {}, 'hello')).rejects.toThrow(InterpreterError);
    });

    it('rejects non-string message', async () => {
      await expect(interpreter.interpret(makeSchema(), createMockState(), 123)).rejects.toThrow(InterpreterError);
    });

    it('rejects empty message', async () => {
      await expect(interpreter.interpret(makeSchema(), createMockState(), '   ')).rejects.toThrow(InterpreterError);
    });
  });

  describe('simple intent detection (no AI call)', () => {
    let interpreter;
    beforeEach(() => {
      const aiSpy = vi.fn().mockRejectedValue(new Error('Should not be called'));
      interpreter = new Interpreter({ aiAdapter: makeAiAdapter(aiSpy) });
    });

    const testCases = [
      { msg: 'cancelar', intent: INTENTS.CANCEL },
      { msg: 'quiero cancelar', intent: INTENTS.CANCEL },
      { msg: 'me arrepiento', intent: INTENTS.CANCEL },
      { msg: 'no quiero seguir', intent: INTENTS.CANCEL },
      { msg: 'gracias', intent: INTENTS.CANCEL },
      { msg: 'no gracias', intent: INTENTS.CANCEL },
      { msg: 'cancelar pedido', intent: INTENTS.CANCEL },
      { msg: 'ayuda', intent: INTENTS.HELP },
      { msg: 'ayudame', intent: INTENTS.HELP },
      { msg: 'no entiendo', intent: INTENTS.HELP },
      { msg: 'cómo funciona', intent: INTENTS.HELP },
      { msg: 'qué es PLA', intent: INTENTS.HELP },
      { msg: 'explicame', intent: INTENTS.HELP },
      { msg: 'qué puedo hacer', intent: INTENTS.HELP },
      { msg: 'terminar', intent: INTENTS.FINISH },
      { msg: 'quiero terminar', intent: INTENTS.FINISH },
      { msg: 'finalizar', intent: INTENTS.FINISH },
      { msg: 'listo', intent: INTENTS.FINISH },
      { msg: 'ya', intent: INTENTS.FINISH },
      { msg: 'eso es todo', intent: INTENTS.FINISH },
      { msg: 'ya estoy listo', intent: INTENTS.FINISH },
    ];

    for (const { msg, intent } of testCases) {
      it(`detects "${msg}" as ${intent}`, async () => {
        const schema = makeSchema();
        const state = createMockState({ name: 'Juan', phone: '1234567890' });
        const result = await interpreter.interpret(schema, state, msg);
        expect(result.detectedIntent).toBe(intent);
        expect(result.aiUsed).toBe(false);
        expect(result.confidence).toBe(1);
      });
    }
  });

  describe('successful AI extraction', () => {
    it('extracts fields from a user message', async () => {
      const aiAdapter = makeAiAdapter(vi.fn().mockResolvedValue({ text: makeValidResponse() }));
      const interpreter = new Interpreter({ aiAdapter });
      const schema = makeSchema();
      const result = await interpreter.interpret(schema, createMockState(), 'Mi nombre es Juan, quiero PLA y 5 unidades');

      expect(result.extractedFields.name).toBe('Juan');
      expect(result.extractedFields.material).toBe('PLA');
      expect(result.extractedFields.quantity).toBe(5);
      expect(result.detectedIntent).toBe(INTENTS.ANSWER);
      expect(result.aiUsed).toBe(true);
      expect(result.confidence).toBeGreaterThan(0);
    });

    it('handles multiple extracted fields', async () => {
      const aiText = JSON.stringify({
        intent: 'ANSWER',
        reasoning: 'User provided all required info',
        fields: { name: 'María', phone: '15551234567', material: 'ABS', quantity: 3, color: 'rojo', agree: true, tags: ['urgente'] },
        ambiguous: [],
        unknownFragments: [],
      });
      const aiAdapter = makeAiAdapter(vi.fn().mockResolvedValue({ text: aiText }));
      const interpreter = new Interpreter({ aiAdapter });
      const schema = makeSchema();
      const result = await interpreter.interpret(schema, createMockState(), 'María, ABS, 3, rojo, urgente, 15551234567, sí');

      expect(result.extractedFields.name).toBe('María');
      expect(result.extractedFields.phone).toBe('15551234567');
      expect(result.extractedFields.material).toBe('ABS');
      expect(result.extractedFields.quantity).toBe(3);
      expect(result.extractedFields.color).toBe('rojo');
      expect(result.extractedFields.agree).toBe(true);
      expect(result.extractedFields.tags).toEqual(['urgente']);
    });

    it('strips JSON code fences', async () => {
      const aiAdapter = makeAiAdapter(vi.fn().mockResolvedValue({
        text: '```json\n' + makeValidResponse({ name: 'Pedro' }) + '\n```',
      }));
      const interpreter = new Interpreter({ aiAdapter });
      const result = await interpreter.interpret(makeSchema(), createMockState(), 'Pedro');
      expect(result.extractedFields.name).toBe('Pedro');
    });

    it('strips markdown code fences without json tag', async () => {
      const aiAdapter = makeAiAdapter(vi.fn().mockResolvedValue({
        text: '```\n' + makeValidResponse({ name: 'Ana' }) + '\n```',
      }));
      const interpreter = new Interpreter({ aiAdapter });
      const result = await interpreter.interpret(makeSchema(), createMockState(), 'Ana');
      expect(result.extractedFields.name).toBe('Ana');
    });

    it('records ambiguous fields', async () => {
      const aiText = JSON.stringify({
        intent: 'ANSWER',
        reasoning: 'Color is ambiguous',
        fields: { name: 'Luis' },
        ambiguous: [
          { fieldId: 'color', possibleValues: ['rojo', 'azul'], originalText: 'no sé cual' },
        ],
        unknownFragments: [],
      });
      const aiAdapter = makeAiAdapter(vi.fn().mockResolvedValue({ text: aiText }));
      const interpreter = new Interpreter({ aiAdapter });
      const result = await interpreter.interpret(makeSchema(), createMockState(), 'Luis, no sé el color');

      expect(result.ambiguousFields).toHaveLength(1);
      expect(result.ambiguousFields[0].fieldId).toBe('color');
      expect(result.ambiguousFields[0].possibleValues).toEqual(['rojo', 'azul']);
    });

    it('records unknown fragments', async () => {
      const aiText = JSON.stringify({
        intent: 'ANSWER',
        reasoning: 'Some text unrecognized',
        fields: { name: 'Carlos' },
        ambiguous: [],
        unknownFragments: ['quiero algo raro', 'no sé'],
      });
      const aiAdapter = makeAiAdapter(vi.fn().mockResolvedValue({ text: aiText }));
      const interpreter = new Interpreter({ aiAdapter });
      const result = await interpreter.interpret(makeSchema(), createMockState(), 'Carlos, quiero algo raro');

      expect(result.unknownFragments).toContain('quiero algo raro');
      expect(result.unknownFragments).toContain('no sé');
    });

    it('ignores fields already completed in state', async () => {
      const aiAdapter = makeAiAdapter(vi.fn().mockResolvedValue({ text: makeValidResponse({ name: 'Juan' }) }));
      const interpreter = new Interpreter({ aiAdapter });
      const state = createMockState({ name: 'AlreadySetName' });
      const result = await interpreter.interpret(makeSchema(), state, 'Juan');

      expect(result.extractedFields.name).toBeUndefined();
      expect(result.ignoredFields).not.toContain('name');
    });

    it('ignores fields not in schema', async () => {
      const aiText = JSON.stringify({
        intent: 'ANSWER',
        reasoning: '',
        fields: { name: 'Juan', nonexistent_field: 'value' },
        ambiguous: [],
        unknownFragments: [],
      });
      const aiAdapter = makeAiAdapter(vi.fn().mockResolvedValue({ text: aiText }));
      const interpreter = new Interpreter({ aiAdapter });
      const result = await interpreter.interpret(makeSchema(), createMockState(), 'Juan');

      expect(result.extractedFields.name).toBe('Juan');
      expect(result.extractedFields.nonexistent_field).toBeUndefined();
    });
  });

  describe('field normalization and validation', () => {
    let interpreter;
    beforeEach(() => {
      interpreter = new Interpreter({ aiAdapter: makeAiAdapter() });
    });

    it('normalizes text fields', async () => {
      const aiText = JSON.stringify({
        intent: 'ANSWER', reasoning: '', fields: { name: '  Juan Pérez  ' },
        ambiguous: [], unknownFragments: [],
      });
      const adapter = makeAiAdapter(vi.fn().mockResolvedValue({ text: aiText }));
      interpreter = new Interpreter({ aiAdapter: adapter });
      const result = await interpreter.interpret(makeSchema(), createMockState(), 'Juan Pérez');
      expect(result.extractedFields.name).toBe('Juan Pérez');
    });

    it('normalizes number fields', async () => {
      const aiText = JSON.stringify({
        intent: 'ANSWER', reasoning: '', fields: { quantity: '5' },
        ambiguous: [], unknownFragments: [],
      });
      const adapter = makeAiAdapter(vi.fn().mockResolvedValue({ text: aiText }));
      interpreter = new Interpreter({ aiAdapter: adapter });
      const result = await interpreter.interpret(makeSchema(), createMockState(), '5 unidades');
      expect(result.extractedFields.quantity).toBe(5);
    });

    it('rejects NaN numbers', async () => {
      const aiText = JSON.stringify({
        intent: 'ANSWER', reasoning: '', fields: { quantity: 'abc' },
        ambiguous: [], unknownFragments: [],
      });
      const adapter = makeAiAdapter(vi.fn().mockResolvedValue({ text: aiText }));
      interpreter = new Interpreter({ aiAdapter: adapter });
      const result = await interpreter.interpret(makeSchema(), createMockState(), 'abc');
      expect(result.extractedFields.quantity).toBeUndefined();
    });

    it('normalizes boolean true', async () => {
      const aiText = JSON.stringify({
        intent: 'ANSWER', reasoning: '', fields: { agree: true },
        ambiguous: [], unknownFragments: [],
      });
      const adapter = makeAiAdapter(vi.fn().mockResolvedValue({ text: aiText }));
      interpreter = new Interpreter({ aiAdapter: adapter });
      const result = await interpreter.interpret(makeSchema(), createMockState(), 'sí');
      expect(result.extractedFields.agree).toBe(true);
    });

    it('normalizes boolean false', async () => {
      const aiText = JSON.stringify({
        intent: 'ANSWER', reasoning: '', fields: { agree: false },
        ambiguous: [], unknownFragments: [],
      });
      const adapter = makeAiAdapter(vi.fn().mockResolvedValue({ text: aiText }));
      interpreter = new Interpreter({ aiAdapter: adapter });
      const result = await interpreter.interpret(makeSchema(), createMockState(), 'no');
      expect(result.extractedFields.agree).toBe(false);
    });

    it('normalizes string true for boolean', async () => {
      const aiText = JSON.stringify({
        intent: 'ANSWER', reasoning: '', fields: { agree: 'sí' },
        ambiguous: [], unknownFragments: [],
      });
      const adapter = makeAiAdapter(vi.fn().mockResolvedValue({ text: aiText }));
      interpreter = new Interpreter({ aiAdapter: adapter });
      const result = await interpreter.interpret(makeSchema(), createMockState(), 'sí');
      expect(result.extractedFields.agree).toBe(true);
    });

    it('normalizes select fields by value', async () => {
      const aiText = JSON.stringify({
        intent: 'ANSWER', reasoning: '', fields: { material: 'PLA' },
        ambiguous: [], unknownFragments: [],
      });
      const adapter = makeAiAdapter(vi.fn().mockResolvedValue({ text: aiText }));
      interpreter = new Interpreter({ aiAdapter: adapter });
      const result = await interpreter.interpret(makeSchema(), createMockState(), 'PLA');
      expect(result.extractedFields.material).toBe('PLA');
    });

    it('matches select by label', async () => {
      const aiText = JSON.stringify({
        intent: 'ANSWER', reasoning: '', fields: { material: 'PLA (económico)' },
        ambiguous: [], unknownFragments: [],
      });
      const adapter = makeAiAdapter(vi.fn().mockResolvedValue({ text: aiText }));
      interpreter = new Interpreter({ aiAdapter: adapter });
      const result = await interpreter.interpret(makeSchema(), createMockState(), 'PLA económico');
      expect(result.extractedFields.material).toBe('PLA');
    });

    it('rejects invalid select values', async () => {
      const aiText = JSON.stringify({
        intent: 'ANSWER', reasoning: '', fields: { material: 'INVALID_MAT' },
        ambiguous: [], unknownFragments: [],
      });
      const adapter = makeAiAdapter(vi.fn().mockResolvedValue({ text: aiText }));
      interpreter = new Interpreter({ aiAdapter: adapter });
      const result = await interpreter.interpret(makeSchema(), createMockState(), 'material raro');
      expect(result.extractedFields.material).toBeUndefined();
    });

    it('normalizes multiselect fields', async () => {
      const aiText = JSON.stringify({
        intent: 'ANSWER', reasoning: '', fields: { tags: ['urgente'] },
        ambiguous: [], unknownFragments: [],
      });
      const adapter = makeAiAdapter(vi.fn().mockResolvedValue({ text: aiText }));
      interpreter = new Interpreter({ aiAdapter: adapter });
      const result = await interpreter.interpret(makeSchema(), createMockState(), 'urgente');
      expect(result.extractedFields.tags).toEqual(['urgente']);
    });

    it('filters invalid items from multiselect', async () => {
      const aiText = JSON.stringify({
        intent: 'ANSWER', reasoning: '', fields: { tags: ['urgente', 'INVALID'] },
        ambiguous: [], unknownFragments: [],
      });
      const adapter = makeAiAdapter(vi.fn().mockResolvedValue({ text: aiText }));
      interpreter = new Interpreter({ aiAdapter: adapter });
      const result = await interpreter.interpret(makeSchema(), createMockState(), 'urgente e inválido');
      expect(result.extractedFields.tags).toEqual(['urgente']);
    });
  });

  describe('intent detection (with AI)', () => {
    it('uses AI-returned intent when no simple intent matches', async () => {
      const aiText = JSON.stringify({
        intent: 'ANSWER', reasoning: 'User answered', fields: { name: 'Juan' },
        ambiguous: [], unknownFragments: [],
      });
      const aiAdapter = makeAiAdapter(vi.fn().mockResolvedValue({ text: aiText }));
      const interpreter = new Interpreter({ aiAdapter });
      const result = await interpreter.interpret(makeSchema(), createMockState(), 'Juan');
      expect(result.detectedIntent).toBe(INTENTS.ANSWER);
    });

    it('defaults to UNKNOWN when AI provides no intent', async () => {
      const aiText = JSON.stringify({
        fields: { name: 'Juan' },
        ambiguous: [], unknownFragments: [],
      });
      const aiAdapter = makeAiAdapter(vi.fn().mockResolvedValue({ text: aiText }));
      const interpreter = new Interpreter({ aiAdapter });
      const result = await interpreter.interpret(makeSchema(), createMockState(), 'cosas raras');
      expect(result.detectedIntent).toBe(INTENTS.UNKNOWN);
    });

    it('detects FINISH intent', async () => {
      const aiText = JSON.stringify({
        intent: 'FINISH', reasoning: 'User is done', fields: {},
        ambiguous: [], unknownFragments: [],
      });
      const aiAdapter = makeAiAdapter(vi.fn().mockResolvedValue({ text: aiText }));
      const interpreter = new Interpreter({ aiAdapter });
      const result = await interpreter.interpret(makeSchema(), createMockState(), 'terminé');
      expect(result.detectedIntent).toBe(INTENTS.FINISH);
    });
  });

  describe('confidence calculation', () => {
    it('returns 1.0 when all fields extracted', async () => {
      const aiText = JSON.stringify({
        intent: 'ANSWER', reasoning: '',
        fields: { name: 'Juan', phone: '1234567890', material: 'PLA', quantity: 5, color: 'rojo', agree: true, tags: ['urgente'] },
        ambiguous: [], unknownFragments: [],
      });
      const aiAdapter = makeAiAdapter(vi.fn().mockResolvedValue({ text: aiText }));
      const interpreter = new Interpreter({ aiAdapter });
      const result = await interpreter.interpret(makeSchema(), createMockState(), 'all fields');
      expect(result.confidence).toBe(1);
    });

    it('returns 1.0 when no pending fields', async () => {
      const aiAdapter = makeAiAdapter(vi.fn().mockResolvedValue({ text: makeValidResponse() }));
      const interpreter = new Interpreter({ aiAdapter });
      const state = createMockState({
        name: 'Juan', phone: '1234567890', material: 'PLA', quantity: 5, color: 'rojo', agree: true, tags: ['urgente'],
      });
      const result = await interpreter.interpret(makeSchema(), state, 'nada que llenar');
      expect(result.confidence).toBe(1);
    });

    it('penalizes confidence for ambiguous fields', async () => {
      const aiText = JSON.stringify({
        intent: 'ANSWER', reasoning: '',
        fields: { name: 'Juan', material: 'PLA' },
        ambiguous: [{ fieldId: 'color', possibleValues: ['rojo', 'azul'], originalText: 'no sé' }],
        unknownFragments: [],
      });
      const aiAdapter = makeAiAdapter(vi.fn().mockResolvedValue({ text: aiText }));
      const interpreter = new Interpreter({ aiAdapter });
      const result = await interpreter.interpret(makeSchema(), createMockState(), 'Juan, PLA, no sé color');
      expect(result.confidence).toBeLessThan(1);
      expect(result.confidence).toBeGreaterThan(0);
    });

    it('penalizes confidence for unknown fragments', async () => {
      const aiText = JSON.stringify({
        intent: 'ANSWER', reasoning: '',
        fields: { name: 'Juan' },
        ambiguous: [],
        unknownFragments: ['texto extraño 1', 'texto extraño 2'],
      });
      const aiAdapter = makeAiAdapter(vi.fn().mockResolvedValue({ text: aiText }));
      const interpreter = new Interpreter({ aiAdapter });
      const result = await interpreter.interpret(makeSchema(), createMockState(), 'Juan, texto extraño');
      expect(result.confidence).toBeLessThan(1);
    });

    it('never exceeds 1 or goes below 0', async () => {
      const aiText = JSON.stringify({
        intent: 'ANSWER', reasoning: '',
        fields: {},
        ambiguous: [{ fieldId: 'material', possibleValues: ['PLA', 'ABS'], originalText: 'no sé' }],
        unknownFragments: ['a', 'b', 'c', 'd', 'e'],
      });
      const aiAdapter = makeAiAdapter(vi.fn().mockResolvedValue({ text: aiText }));
      const interpreter = new Interpreter({ aiAdapter });
      const result = await interpreter.interpret(makeSchema(), createMockState(), 'nada');
      expect(result.confidence).toBeGreaterThanOrEqual(0);
      expect(result.confidence).toBeLessThanOrEqual(1);
    });
  });

  describe('error handling', () => {
    it('handles AI timeout gracefully', async () => {
      const { AITimeoutError } = await import('./errors.js');
      const aiAdapter = makeAiAdapter(vi.fn().mockRejectedValue(new AITimeoutError('timed out')));
      const interpreter = new Interpreter({ aiAdapter });
      const result = await interpreter.interpret(makeSchema(), createMockState(), 'hola');
      expect(result.confidence).toBe(0);
      expect(result.aiUsed).toBe(true);
      expect(result.detectedIntent).toBe(INTENTS.UNKNOWN);
      expect(result.extractedFields).toEqual({});
    });

    it('handles rate limit gracefully', async () => {
      const { AIRateLimitError } = await import('./errors.js');
      const aiAdapter = makeAiAdapter(vi.fn().mockRejectedValue(new AIRateLimitError('rate limited')));
      const interpreter = new Interpreter({ aiAdapter });
      const result = await interpreter.interpret(makeSchema(), createMockState(), 'hola');
      expect(result.confidence).toBe(0);
      expect(result.reasoning).toContain('Rate limited');
    });

    it('handles network error gracefully', async () => {
      const { AINetworkError } = await import('./errors.js');
      const aiAdapter = makeAiAdapter(vi.fn().mockRejectedValue(new AINetworkError('network down')));
      const interpreter = new Interpreter({ aiAdapter });
      const result = await interpreter.interpret(makeSchema(), createMockState(), 'hola');
      expect(result.confidence).toBe(0);
      expect(result.reasoning).toContain('Network error');
    });

    it('handles auth error gracefully', async () => {
      const { AIAuthError } = await import('./errors.js');
      const aiAdapter = makeAiAdapter(vi.fn().mockRejectedValue(new AIAuthError('bad key')));
      const interpreter = new Interpreter({ aiAdapter });
      const result = await interpreter.interpret(makeSchema(), createMockState(), 'hola');
      expect(result.confidence).toBe(0);
      expect(result.reasoning).toContain('AI configuration');
    });

    it('handles invalid JSON from AI', async () => {
      const aiAdapter = makeAiAdapter(vi.fn().mockResolvedValue({ text: 'not json at all' }));
      const interpreter = new Interpreter({ aiAdapter });
      const result = await interpreter.interpret(makeSchema(), createMockState(), 'hola');
      expect(result.confidence).toBe(0);
      expect(result.aiUsed).toBe(true);
    });

    it('handles empty AI response', async () => {
      const aiAdapter = makeAiAdapter(vi.fn().mockResolvedValue({ text: '' }));
      const interpreter = new Interpreter({ aiAdapter });
      const result = await interpreter.interpret(makeSchema(), createMockState(), 'hola');
      expect(result.confidence).toBe(0);
    });

    it('handles unexpected AI errors', async () => {
      const aiAdapter = makeAiAdapter(vi.fn().mockRejectedValue(new Error('something went wrong')));
      const interpreter = new Interpreter({ aiAdapter });
      const result = await interpreter.interpret(makeSchema(), createMockState(), 'hola');
      expect(result.confidence).toBe(0);
      expect(result.reasoning).toContain('something went wrong');
    });
  });

  describe('immutability', () => {
    it('returns a frozen result', async () => {
      const aiAdapter = makeAiAdapter(vi.fn().mockResolvedValue({ text: makeValidResponse() }));
      const interpreter = new Interpreter({ aiAdapter });
      const result = await interpreter.interpret(makeSchema(), createMockState(), 'Juan');
      expect(Object.isFrozen(result)).toBe(true);
      expect(() => { result.extractedFields = {}; }).toThrow();
    });

    it('extractedFields object is frozen', async () => {
      const aiAdapter = makeAiAdapter(vi.fn().mockResolvedValue({ text: makeValidResponse() }));
      const interpreter = new Interpreter({ aiAdapter });
      const result = await interpreter.interpret(makeSchema(), createMockState(), 'Juan');
      expect(Object.isFrozen(result.extractedFields)).toBe(true);
    });

    it('ambiguousFields array and items are frozen', async () => {
      const aiText = JSON.stringify({
        intent: 'ANSWER', reasoning: '',
        fields: { name: 'Juan' },
        ambiguous: [{ fieldId: 'color', possibleValues: ['rojo', 'azul'], originalText: 'no sé' }],
        unknownFragments: [],
      });
      const aiAdapter = makeAiAdapter(vi.fn().mockResolvedValue({ text: aiText }));
      const interpreter = new Interpreter({ aiAdapter });
      const result = await interpreter.interpret(makeSchema(), createMockState(), 'Juan');
      expect(Object.isFrozen(result.ambiguousFields)).toBe(true);
      expect(Object.isFrozen(result.ambiguousFields[0])).toBe(true);
    });

    it('unknownFragments array is frozen', async () => {
      const aiText = JSON.stringify({
        intent: 'ANSWER', reasoning: '', fields: { name: 'Juan' },
        ambiguous: [], unknownFragments: ['test'],
      });
      const aiAdapter = makeAiAdapter(vi.fn().mockResolvedValue({ text: aiText }));
      const interpreter = new Interpreter({ aiAdapter });
      const result = await interpreter.interpret(makeSchema(), createMockState(), 'Juan');
      expect(Object.isFrozen(result.unknownFragments)).toBe(true);
    });
  });

  describe('determinism (temperature=0)', () => {
    it('calls AIAdapter.generate with temperature=0', async () => {
      const generateMock = vi.fn().mockResolvedValue({ text: makeValidResponse() });
      const aiAdapter = makeAiAdapter(generateMock);
      const interpreter = new Interpreter({ aiAdapter });
      await interpreter.interpret(makeSchema(), createMockState(), 'Juan');
      const callArgs = generateMock.mock.calls[0];
      expect(callArgs[2]).toBeDefined();
      expect(callArgs[2].temperature).toBe(0);
    });
  });

  describe('edge cases', () => {
    let interpreter;
    beforeEach(() => {
      interpreter = new Interpreter({ aiAdapter: makeAiAdapter() });
    });

    it('handles schema with no pending fields', async () => {
      const aiText = JSON.stringify({
        intent: 'ANSWER', reasoning: '', fields: {},
        ambiguous: [], unknownFragments: [],
      });
      const adapter = makeAiAdapter(vi.fn().mockResolvedValue({ text: aiText }));
      interpreter = new Interpreter({ aiAdapter: adapter });
      const state = createMockState({ name: 'Juan' });
      const schema = {
        serviceName: 'Minimal',
        fields: [{ id: 'name', type: 'text', label: 'Name' }],
      };
      const result = await interpreter.interpret(schema, state, 'todo listo');
      expect(result.confidence).toBe(1);
      expect(result.extractedFields).toEqual({});
    });

    it('handles schema with no fields array', async () => {
      const aiText = JSON.stringify({
        intent: 'ANSWER', reasoning: '', fields: {},
        ambiguous: [], unknownFragments: [],
      });
      const adapter = makeAiAdapter(vi.fn().mockResolvedValue({ text: aiText }));
      interpreter = new Interpreter({ aiAdapter: adapter });
      const schema = { serviceName: 'Empty' };
      await expect(interpreter.interpret(schema, createMockState(), 'hola')).rejects.toThrow(InterpreterError);
    });

    it('extracts reasoning from AI response', async () => {
      const aiText = JSON.stringify({
        intent: 'ANSWER', reasoning: 'User clearly provided name and material choice',
        fields: { name: 'Sofía', material: 'PETG' },
        ambiguous: [], unknownFragments: [],
      });
      const adapter = makeAiAdapter(vi.fn().mockResolvedValue({ text: aiText }));
      interpreter = new Interpreter({ aiAdapter: adapter });
      const result = await interpreter.interpret(makeSchema(), createMockState(), 'Sofía, PETG');
      expect(result.reasoning).toBe('User clearly provided name and material choice');
    });

    it('provides latency in result', async () => {
      const adapter = makeAiAdapter(vi.fn().mockResolvedValue({ text: makeValidResponse() }));
      interpreter = new Interpreter({ aiAdapter: adapter });
      const start = Date.now();
      const result = await interpreter.interpret(makeSchema(), createMockState(), 'Juan');
      const elapsed = Date.now() - start;
      expect(result.latency).toBeGreaterThanOrEqual(0);
      expect(result.latency).toBeLessThanOrEqual(elapsed + 100);
    });

    it('provides latency for simple intents (no AI)', async () => {
      interpreter = new Interpreter({ aiAdapter: makeAiAdapter() });
      const result = await interpreter.interpret(makeSchema(), createMockState(), 'ayuda');
      expect(result.latency).toBeGreaterThanOrEqual(0);
    });

    it('toJSON returns a plain object', async () => {
      const adapter = makeAiAdapter(vi.fn().mockResolvedValue({ text: makeValidResponse() }));
      interpreter = new Interpreter({ aiAdapter: adapter });
      const result = await interpreter.interpret(makeSchema(), createMockState(), 'Juan');
      const json = result.toJSON();
      expect(json).toBeInstanceOf(Object);
      expect(json.extractedFields.name).toBe('Juan');
      expect(json.aiUsed).toBe(true);
      expect(json.detectedIntent).toBe(INTENTS.ANSWER);
    });
  });
});
