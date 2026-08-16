import { describe, it, expect, vi, beforeEach } from 'vitest';
import { QuestionGenerator } from './question-generator.js';
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
    serviceName: 'Impresión 3D',
    description: 'Cotización de piezas impresas en 3D',
    fields: [
      { id: 'nombre', type: 'text', label: 'Nombre', question: '¿Cuál es tu nombre?', required: true },
      {
        id: 'telefono', type: 'phone', label: 'Teléfono', question: '¿Cuál es tu teléfono?',
        required: true, validation: { pattern: '^\\d{10,13}$' },
        errorMessage: 'Ingresá un número válido de al menos 10 dígitos.',
      },
      {
        id: 'material', type: 'select', label: 'Material', question: '¿Qué material querés?',
        required: true,
        validation: { required: true },
        options: [{ value: 'PLA', label: 'PLA (económico)' }, { value: 'ABS', label: 'ABS' }, { value: 'PETG', label: 'PETG' }],
      },
      {
        id: 'color', type: 'select', label: 'Color', question: '¿Qué color preferís?',
        options: [{ value: 'rojo', label: 'Rojo' }, { value: 'azul', label: 'Azul' }],
      },
      {
        id: 'cantidad', type: 'number', label: 'Cantidad', question: '¿Cuántas unidades?',
        placeholder: 'Ej: 1', unit: 'unidades', validation: { min: 1, max: 100 },
      },
      { id: 'acepto', type: 'boolean', label: 'Acepto términos', question: '¿Aceptás los términos?' },
      {
        id: 'tags', type: 'multiselect', label: 'Tags', question: '¿Qué tags?',
        options: [{ value: 'urgente', label: 'Urgente' }, { value: 'normal', label: 'Normal' }],
      },
    ],
    ...overrides,
  };
}

function makeFlowResult(nextField, overrides = {}) {
  return {
    nextField,
    pendingFields: nextField ? [nextField] : [],
    blockedFields: [],
    skippedFields: [],
    completedFields: [],
    fieldStatuses: {},
    isComplete: !nextField,
    isDeadlocked: false,
    deadlockReason: null,
    progress: { total: 7, completed: 0, pending: 1, blocked: 0, skipped: 0, requiredCompleted: 0, requiredTotal: 7, completionPercent: 0 },
    ...overrides,
  };
}

function makeInterpreterResult(overrides = {}) {
  return {
    extractedFields: {},
    ignoredFields: [],
    ambiguousFields: [],
    confidence: 1,
    detectedIntent: 'ANSWER',
    reasoning: '',
    unknownFragments: [],
    aiUsed: true,
    latency: 100,
    ...overrides,
  };
}

function makeAiAdapter(mockImpl) {
  return { generate: mockImpl || vi.fn() };
}

// ── Tests ───────────────────────────────────────────────────────

describe('QuestionGenerator', () => {
  describe('constructor', () => {
    it('accepts optional aiAdapter', () => {
      const gen = new QuestionGenerator();
      expect(gen).toBeInstanceOf(QuestionGenerator);
    });

    it('accepts aiAdapter', () => {
      const gen = new QuestionGenerator({ aiAdapter: makeAiAdapter() });
      expect(gen).toBeInstanceOf(QuestionGenerator);
    });
  });

  describe('input validation', () => {
    let gen;
    beforeEach(() => {
      gen = new QuestionGenerator();
    });

    it('rejects null schema', async () => {
      await expect(gen.generate(null, createMockState(), makeFlowResult('nombre'), makeInterpreterResult()))
        .rejects.toThrow(InterpreterError);
    });

    it('rejects schema without fields', async () => {
      await expect(gen.generate({}, createMockState(), makeFlowResult('nombre'), makeInterpreterResult()))
        .rejects.toThrow(InterpreterError);
    });

    it('rejects null state', async () => {
      await expect(gen.generate(makeSchema(), null, makeFlowResult('nombre'), makeInterpreterResult()))
        .rejects.toThrow(InterpreterError);
    });

    it('rejects state without getCompletedFields', async () => {
      await expect(gen.generate(makeSchema(), {}, makeFlowResult('nombre'), makeInterpreterResult()))
        .rejects.toThrow(InterpreterError);
    });

    it('rejects null flowResult', async () => {
      await expect(gen.generate(makeSchema(), createMockState(), null, makeInterpreterResult()))
        .rejects.toThrow(InterpreterError);
    });

    it('rejects null interpreterResult', async () => {
      await expect(gen.generate(makeSchema(), createMockState(), makeFlowResult('nombre'), null))
        .rejects.toThrow(InterpreterError);
    });
  });

  describe('complete interview (nextField is null)', () => {
    it('returns question null when nextField is null', async () => {
      const gen = new QuestionGenerator();
      const result = await gen.generate(makeSchema(), createMockState(), makeFlowResult(null), makeInterpreterResult());
      expect(result.question).toBeNull();
      expect(result.fieldId).toBeNull();
      expect(result.confidence).toBe(1);
      expect(result.retry).toBe(false);
      expect(result.aiUsed).toBe(false);
    });

    it('returns question null when nextField is undefined', async () => {
      const gen = new QuestionGenerator();
      const result = await gen.generate(makeSchema(), createMockState(), makeFlowResult(undefined), makeInterpreterResult());
      expect(result.question).toBeNull();
    });
  });

  describe('field not found', () => {
    it('throws when nextField does not exist in schema', async () => {
      const gen = new QuestionGenerator();
      await expect(gen.generate(makeSchema(), createMockState(), makeFlowResult('nonexistent'), makeInterpreterResult()))
        .rejects.toThrow(InterpreterError);
    });
  });

  describe('direct schema question (no retry)', () => {
    it('uses schema question directly', async () => {
      const gen = new QuestionGenerator();
      const result = await gen.generate(makeSchema(), createMockState(), makeFlowResult('nombre'), makeInterpreterResult());
      expect(result.question).toBe('¿Cuál es tu nombre?');
      expect(result.fieldId).toBe('nombre');
      expect(result.questionType).toBe('text');
      expect(result.retry).toBe(false);
      expect(result.aiUsed).toBe(false);
      expect(result.confidence).toBe(1);
    });

    it('uses fallback question when field has no question', async () => {
      const schema = {
        fields: [{ id: 'custom', type: 'text', label: 'Campo personalizado' }],
      };
      const gen = new QuestionGenerator();
      const result = await gen.generate(schema, createMockState(), makeFlowResult('custom'), makeInterpreterResult());
      expect(result.question).toBe('¿Campo personalizado?');
    });
  });

  describe('retry detection', () => {
    it('sets retry=true when field was extracted and has validation', async () => {
      const gen = new QuestionGenerator();
      const interpreterResult = makeInterpreterResult({ extractedFields: { telefono: '123' } });
      const result = await gen.generate(makeSchema(), createMockState(), makeFlowResult('telefono'), interpreterResult);
      expect(result.retry).toBe(true);
    });

    it('sets retry=true when field is ambiguous and has validation', async () => {
      const gen = new QuestionGenerator();
      const interpreterResult = makeInterpreterResult({
        ambiguousFields: [{ fieldId: 'telefono', possibleValues: ['123', '456'], originalText: 'no sé' }],
      });
      const result = await gen.generate(makeSchema(), createMockState(), makeFlowResult('telefono'), interpreterResult);
      expect(result.retry).toBe(true);
    });

    it('does not set retry when field has no validation', async () => {
      const gen = new QuestionGenerator();
      const interpreterResult = makeInterpreterResult({ extractedFields: { nombre: 'Juan' } });
      const result = await gen.generate(makeSchema(), createMockState(), makeFlowResult('nombre'), interpreterResult);
      expect(result.retry).toBe(false);
    });

    it('does not set retry when field was not extracted', async () => {
      const gen = new QuestionGenerator();
      const result = await gen.generate(makeSchema(), createMockState(), makeFlowResult('telefono'), makeInterpreterResult());
      expect(result.retry).toBe(false);
    });
  });

  describe('retry question generation', () => {
    it('uses errorMessage for retry when available', async () => {
      const gen = new QuestionGenerator();
      const interpreterResult = makeInterpreterResult({ extractedFields: { telefono: '123' } });
      const result = await gen.generate(makeSchema(), createMockState(), makeFlowResult('telefono'), interpreterResult);
      expect(result.question).toContain('Ingresá un número válido');
      expect(result.question).toContain('intentarlo de nuevo');
      expect(result.aiUsed).toBe(false);
    });

    it('uses AI for retry when no errorMessage', async () => {
      const aiText = '¿Podrías indicarme qué material deseas utilizar?';
      const aiAdapter = makeAiAdapter(vi.fn().mockResolvedValue({ text: aiText }));
      const gen = new QuestionGenerator({ aiAdapter });
      const interpreterResult = makeInterpreterResult({ extractedFields: { material: 'INVALID' } });
      const result = await gen.generate(makeSchema(), createMockState(), makeFlowResult('material'), interpreterResult);
      expect(result.question).toBe(aiText);
      expect(result.aiUsed).toBe(true);
    });

    it('falls back when AI fails for retry', async () => {
      const aiAdapter = makeAiAdapter(vi.fn().mockRejectedValue(new Error('AI down')));
      const gen = new QuestionGenerator({ aiAdapter });
      const interpreterResult = makeInterpreterResult({ extractedFields: { material: 'INVALID' } });
      const result = await gen.generate(makeSchema(), createMockState(), makeFlowResult('material'), interpreterResult);
      expect(result.question).toContain('El valor ingresado no es válido');
      expect(result.question).toContain('¿Qué material querés?');
      expect(result.aiUsed).toBe(false);
    });

    it('parses JSON response from AI for retry', async () => {
      const aiText = JSON.stringify({ question: '¿Qué material prefieres para tu pieza?' });
      const aiAdapter = makeAiAdapter(vi.fn().mockResolvedValue({ text: aiText }));
      const gen = new QuestionGenerator({ aiAdapter });
      const interpreterResult = makeInterpreterResult({ extractedFields: { material: 'INVALID' } });
      const result = await gen.generate(makeSchema(), createMockState(), makeFlowResult('material'), interpreterResult);
      expect(result.question).toBe('¿Qué material prefieres para tu pieza?');
      expect(result.aiUsed).toBe(true);
    });

    it('handles code fences in AI response', async () => {
      const aiText = '```json\n{"question": "¿Qué material deseas?"}\n```';
      const aiAdapter = makeAiAdapter(vi.fn().mockResolvedValue({ text: aiText }));
      const gen = new QuestionGenerator({ aiAdapter });
      const interpreterResult = makeInterpreterResult({ extractedFields: { material: 'INVALID' } });
      const result = await gen.generate(makeSchema(), createMockState(), makeFlowResult('material'), interpreterResult);
      expect(result.question).toBe('¿Qué material deseas?');
    });

    it('calls AI with temperature=0 for retry', async () => {
      const generateMock = vi.fn().mockResolvedValue({ text: '¿Qué material?' });
      const aiAdapter = makeAiAdapter(generateMock);
      const gen = new QuestionGenerator({ aiAdapter });
      const interpreterResult = makeInterpreterResult({ extractedFields: { material: 'INVALID' } });
      await gen.generate(makeSchema(), createMockState(), makeFlowResult('material'), interpreterResult);
      expect(generateMock.mock.calls[0][2].temperature).toBe(0);
    });
  });

  describe('choices', () => {
    it('returns choices for select fields', async () => {
      const gen = new QuestionGenerator();
      const result = await gen.generate(makeSchema(), createMockState(), makeFlowResult('material'), makeInterpreterResult());
      expect(result.choices).toEqual([
        { value: 'PLA', label: 'PLA (económico)' },
        { value: 'ABS', label: 'ABS' },
        { value: 'PETG', label: 'PETG' },
      ]);
    });

    it('returns choices for multiselect fields', async () => {
      const gen = new QuestionGenerator();
      const result = await gen.generate(makeSchema(), createMockState(), makeFlowResult('tags'), makeInterpreterResult());
      expect(result.choices).toEqual([
        { value: 'urgente', label: 'Urgente' },
        { value: 'normal', label: 'Normal' },
      ]);
    });

    it('returns null choices for text fields', async () => {
      const gen = new QuestionGenerator();
      const result = await gen.generate(makeSchema(), createMockState(), makeFlowResult('nombre'), makeInterpreterResult());
      expect(result.choices).toBeNull();
    });

    it('returns null choices for number fields', async () => {
      const gen = new QuestionGenerator();
      const result = await gen.generate(makeSchema(), createMockState(), makeFlowResult('cantidad'), makeInterpreterResult());
      expect(result.choices).toBeNull();
    });

    it('returns null choices for boolean fields', async () => {
      const gen = new QuestionGenerator();
      const result = await gen.generate(makeSchema(), createMockState(), makeFlowResult('acepto'), makeInterpreterResult());
      expect(result.choices).toBeNull();
    });

    it('preserves schema option order', async () => {
      const schema = {
        fields: [{
          id: 'orden', type: 'select', label: 'Orden', question: '?',
          options: [
            { value: 'tercero', label: 'Tercero' },
            { value: 'primero', label: 'Primero' },
            { value: 'segundo', label: 'Segundo' },
          ],
        }],
      };
      const gen = new QuestionGenerator();
      const result = await gen.generate(schema, createMockState(), makeFlowResult('orden'), makeInterpreterResult());
      expect(result.choices.map(c => c.value)).toEqual(['tercero', 'primero', 'segundo']);
    });
  });

  describe('placeholder', () => {
    it('uses schema placeholder when available', async () => {
      const gen = new QuestionGenerator();
      const result = await gen.generate(makeSchema(), createMockState(), makeFlowResult('cantidad'), makeInterpreterResult());
      expect(result.placeholder).toBe('Ej: 1');
    });

    it('generates placeholder for number', async () => {
      const schema = {
        fields: [{ id: 'num', type: 'number', label: 'Número', question: '?' }],
      };
      const gen = new QuestionGenerator();
      const result = await gen.generate(schema, createMockState(), makeFlowResult('num'), makeInterpreterResult());
      expect(result.placeholder).toBe('Ej: 25');
    });

    it('generates placeholder for number with unit', async () => {
      const schema = {
        fields: [{ id: 'num', type: 'number', label: 'Peso', question: '?', unit: 'gramos' }],
      };
      const gen = new QuestionGenerator();
      const result = await gen.generate(schema, createMockState(), makeFlowResult('num'), makeInterpreterResult());
      expect(result.placeholder).toContain('gramos');
    });

    it('generates placeholder for phone', async () => {
      const schema = {
        fields: [{ id: 'tel', type: 'phone', label: 'Tel', question: '?' }],
      };
      const gen = new QuestionGenerator();
      const result = await gen.generate(schema, createMockState(), makeFlowResult('tel'), makeInterpreterResult());
      expect(result.placeholder).toBe('Ej: 11551234567');
    });

    it('generates placeholder for email', async () => {
      const schema = {
        fields: [{ id: 'email', type: 'email', label: 'Email', question: '?' }],
      };
      const gen = new QuestionGenerator();
      const result = await gen.generate(schema, createMockState(), makeFlowResult('email'), makeInterpreterResult());
      expect(result.placeholder).toContain('@');
    });

    it('generates placeholder for select', async () => {
      const schema = {
        fields: [{ id: 'opt', type: 'select', label: 'Opción', question: '?', options: [{ value: 'a', label: 'Opción A' }, { value: 'b', label: 'Opción B' }] }],
      };
      const gen = new QuestionGenerator();
      const result = await gen.generate(schema, createMockState(), makeFlowResult('opt'), makeInterpreterResult());
      expect(result.placeholder).toContain('Opción A');
    });

    it('generates placeholder for multiselect', async () => {
      const schema = {
        fields: [{ id: 'tags', type: 'multiselect', label: 'Tags', question: '?', options: [{ value: 'x' }] }],
      };
      const gen = new QuestionGenerator();
      const result = await gen.generate(schema, createMockState(), makeFlowResult('tags'), makeInterpreterResult());
      expect(result.placeholder).toBe('Ej: x');
    });

    it('generates placeholder for boolean', async () => {
      const schema = {
        fields: [{ id: 'flag', type: 'boolean', label: 'Flag', question: '?' }],
      };
      const gen = new QuestionGenerator();
      const result = await gen.generate(schema, createMockState(), makeFlowResult('flag'), makeInterpreterResult());
      expect(result.placeholder).toBe('Ej: sí / no');
    });

    it('returns null placeholder for text without unit', async () => {
      const schema = {
        fields: [{ id: 'txt', type: 'text', label: 'Texto', question: '?' }],
      };
      const gen = new QuestionGenerator();
      const result = await gen.generate(schema, createMockState(), makeFlowResult('txt'), makeInterpreterResult());
      expect(result.placeholder).toBeNull();
    });
  });

  describe('validation', () => {
    it('extracts validation rules from field', async () => {
      const gen = new QuestionGenerator();
      const result = await gen.generate(makeSchema(), createMockState(), makeFlowResult('cantidad'), makeInterpreterResult());
      expect(result.validation).toEqual({ required: true, min: 1, max: 100 });
    });

    it('includes required=true when field.required is not false', async () => {
      const gen = new QuestionGenerator();
      const result = await gen.generate(makeSchema(), createMockState(), makeFlowResult('nombre'), makeInterpreterResult());
      expect(result.validation.required).toBe(true);
    });

    it('includes pattern validation', async () => {
      const gen = new QuestionGenerator();
      const result = await gen.generate(makeSchema(), createMockState(), makeFlowResult('telefono'), makeInterpreterResult());
      expect(result.validation.pattern).toBe('^\\d{10,13}$');
    });

    it('returns null validation when field has no rules', async () => {
      const schema = {
        fields: [{ id: 'simple', type: 'text', label: 'Simple', question: '?', required: false }],
      };
      const gen = new QuestionGenerator();
      const result = await gen.generate(schema, createMockState(), makeFlowResult('simple'), makeInterpreterResult());
      expect(result.validation).toBeNull();
    });
  });

  describe('explanation', () => {
    it('includes explanation when interpreter has ambiguous fields', async () => {
      const gen = new QuestionGenerator();
      const interpreterResult = makeInterpreterResult({
        ambiguousFields: [{ fieldId: 'material', possibleValues: ['PLA', 'ABS'], originalText: 'no sé' }],
      });
      const result = await gen.generate(makeSchema(), createMockState(), makeFlowResult('material'), interpreterResult);
      expect(result.explanation).toBeTruthy();
      expect(result.explanation).toContain('material');
      expect(result.explanation).toContain('cotización de piezas impresas en 3d');
    });

    it('does not include explanation when no ambiguous fields', async () => {
      const gen = new QuestionGenerator();
      const result = await gen.generate(makeSchema(), createMockState(), makeFlowResult('nombre'), makeInterpreterResult());
      expect(result.explanation).toBeNull();
    });

    it('explanation includes options for select fields', async () => {
      const gen = new QuestionGenerator();
      const interpreterResult = makeInterpreterResult({
        ambiguousFields: [{ fieldId: 'color', possibleValues: ['rojo', 'azul'], originalText: 'rojo o azul' }],
      });
      const result = await gen.generate(makeSchema(), createMockState(), makeFlowResult('color'), interpreterResult);
      expect(result.explanation).toContain('Rojo');
      expect(result.explanation).toContain('Azul');
    });

    it('explanation uses raw value when option has no label', async () => {
      const schema = {
        description: 'Test',
        fields: [{ id: 'opt', type: 'select', label: 'Opción', question: '?', required: false, options: [{ value: 'raw_val' }] }],
      };
      const gen = new QuestionGenerator();
      const interpreterResult = makeInterpreterResult({
        ambiguousFields: [{ fieldId: 'opt', possibleValues: ['raw_val'], originalText: 'val' }],
      });
      const result = await gen.generate(schema, createMockState(), makeFlowResult('opt'), interpreterResult);
      expect(result.explanation).toContain('raw_val');
    });
  });

  describe('confidence', () => {
    it('returns 1.0 for direct schema question', async () => {
      const gen = new QuestionGenerator();
      const result = await gen.generate(makeSchema(), createMockState(), makeFlowResult('nombre'), makeInterpreterResult());
      expect(result.confidence).toBe(1);
    });

    it('returns < 1.0 for retry without AI', async () => {
      const gen = new QuestionGenerator();
      const interpreterResult = makeInterpreterResult({ extractedFields: { telefono: 'invalid' } });
      const result = await gen.generate(makeSchema(), createMockState(), makeFlowResult('telefono'), interpreterResult);
      expect(result.confidence).toBeLessThan(1);
    });

    it('returns < 1.0 for retry with AI', async () => {
      const aiAdapter = makeAiAdapter(vi.fn().mockResolvedValue({ text: '¿Qué material?' }));
      const gen = new QuestionGenerator({ aiAdapter });
      const interpreterResult = makeInterpreterResult({ extractedFields: { material: 'INVALID' } });
      const result = await gen.generate(makeSchema(), createMockState(), makeFlowResult('material'), interpreterResult);
      expect(result.confidence).toBeLessThan(1);
    });

    it('returns lower confidence with explanation', async () => {
      const gen = new QuestionGenerator();
      const interpreterResult = makeInterpreterResult({
        ambiguousFields: [{ fieldId: 'nombre', possibleValues: ['Juan', 'Ana'], originalText: 'confuso' }],
      });
      const result = await gen.generate(makeSchema(), createMockState(), makeFlowResult('nombre'), interpreterResult);
      expect(result.confidence).toBeLessThan(1);
    });

    it('confidence is always between 0 and 1', async () => {
      const gen = new QuestionGenerator();
      const result = await gen.generate(makeSchema(), createMockState(), makeFlowResult('nombre'), makeInterpreterResult());
      expect(result.confidence).toBeGreaterThanOrEqual(0);
      expect(result.confidence).toBeLessThanOrEqual(1);
    });
  });

  describe('immutability', () => {
    it('returns a frozen result', async () => {
      const gen = new QuestionGenerator();
      const result = await gen.generate(makeSchema(), createMockState(), makeFlowResult('nombre'), makeInterpreterResult());
      expect(Object.isFrozen(result)).toBe(true);
    });

    it('choices array is frozen', async () => {
      const gen = new QuestionGenerator();
      const result = await gen.generate(makeSchema(), createMockState(), makeFlowResult('material'), makeInterpreterResult());
      expect(Object.isFrozen(result.choices)).toBe(true);
    });

    it('choices items are frozen', async () => {
      const gen = new QuestionGenerator();
      const result = await gen.generate(makeSchema(), createMockState(), makeFlowResult('material'), makeInterpreterResult());
      expect(Object.isFrozen(result.choices[0])).toBe(true);
    });

    it('validation object is frozen', async () => {
      const gen = new QuestionGenerator();
      const result = await gen.generate(makeSchema(), createMockState(), makeFlowResult('cantidad'), makeInterpreterResult());
      expect(Object.isFrozen(result.validation)).toBe(true);
    });
  });

  describe('aiAdapter integration', () => {
    it('does not call AI when no retry needed', async () => {
      const generateMock = vi.fn();
      const aiAdapter = makeAiAdapter(generateMock);
      const gen = new QuestionGenerator({ aiAdapter });
      await gen.generate(makeSchema(), createMockState(), makeFlowResult('nombre'), makeInterpreterResult());
      expect(generateMock).not.toHaveBeenCalled();
    });

    it('does not call AI when errorMessage exists', async () => {
      const generateMock = vi.fn();
      const aiAdapter = makeAiAdapter(generateMock);
      const gen = new QuestionGenerator({ aiAdapter });
      const interpreterResult = makeInterpreterResult({ extractedFields: { telefono: 'invalid' } });
      await gen.generate(makeSchema(), createMockState(), makeFlowResult('telefono'), interpreterResult);
      expect(generateMock).not.toHaveBeenCalled();
    });

    it('works without aiAdapter (null)', async () => {
      const gen = new QuestionGenerator();
      const interpreterResult = makeInterpreterResult({ extractedFields: { material: 'INVALID' } });
      const result = await gen.generate(makeSchema(), createMockState(), makeFlowResult('material'), interpreterResult);
      expect(result.question).toContain('El valor ingresado no es válido');
      expect(result.aiUsed).toBe(false);
    });

    it('handles AI timeout gracefully', async () => {
      const { AITimeoutError } = await import('./errors.js');
      const aiAdapter = makeAiAdapter(vi.fn().mockRejectedValue(new AITimeoutError('timed out')));
      const gen = new QuestionGenerator({ aiAdapter });
      const interpreterResult = makeInterpreterResult({ extractedFields: { material: 'INVALID' } });
      const result = await gen.generate(makeSchema(), createMockState(), makeFlowResult('material'), interpreterResult);
      expect(result.question).toBeTruthy();
      expect(result.aiUsed).toBe(false);
    });

    it('handles network error gracefully', async () => {
      const { AINetworkError } = await import('./errors.js');
      const aiAdapter = makeAiAdapter(vi.fn().mockRejectedValue(new AINetworkError('network error')));
      const gen = new QuestionGenerator({ aiAdapter });
      const interpreterResult = makeInterpreterResult({ extractedFields: { material: 'INVALID' } });
      const result = await gen.generate(makeSchema(), createMockState(), makeFlowResult('material'), interpreterResult);
      expect(result.question).toBeTruthy();
    });
  });

  describe('questionType', () => {
    it('sets questionType to field type', async () => {
      const gen = new QuestionGenerator();
      const result = await gen.generate(makeSchema(), createMockState(), makeFlowResult('nombre'), makeInterpreterResult());
      expect(result.questionType).toBe('text');
    });

    it('sets questionType to "message" when nextField is null', async () => {
      const gen = new QuestionGenerator();
      const result = await gen.generate(makeSchema(), createMockState(), makeFlowResult(null), makeInterpreterResult());
      expect(result.questionType).toBe('message');
    });
  });

  describe('latency', () => {
    it('includes latency in result', async () => {
      const gen = new QuestionGenerator();
      const start = Date.now();
      const result = await gen.generate(makeSchema(), createMockState(), makeFlowResult('nombre'), makeInterpreterResult());
      const elapsed = Date.now() - start;
      expect(result.latency).toBeGreaterThanOrEqual(0);
      expect(result.latency).toBeLessThanOrEqual(elapsed + 50);
    });
  });

  describe('toJSON', () => {
    it('returns a plain object', async () => {
      const gen = new QuestionGenerator();
      const result = await gen.generate(makeSchema(), createMockState(), makeFlowResult('nombre'), makeInterpreterResult());
      const json = result.toJSON();
      expect(json).toBeInstanceOf(Object);
      expect(json.question).toBe('¿Cuál es tu nombre?');
      expect(json.fieldId).toBe('nombre');
      expect(json.retry).toBe(false);
    });

    it('includes choices in JSON output for select fields', async () => {
      const gen = new QuestionGenerator();
      const result = await gen.generate(makeSchema(), createMockState(), makeFlowResult('material'), makeInterpreterResult());
      const json = result.toJSON();
      expect(json.choices).toBeInstanceOf(Array);
      expect(json.choices[0].value).toBe('PLA');
    });
  });

  describe('explanation edge cases', () => {
    it('generates explanation without schema description', async () => {
      const schema = {
        fields: [{ id: 'field', type: 'text', label: 'Dato', question: '?' }],
      };
      const gen = new QuestionGenerator();
      const interpreterResult = makeInterpreterResult({
        ambiguousFields: [{ fieldId: 'field', possibleValues: ['a', 'b'], originalText: 'a' }],
      });
      const result = await gen.generate(schema, createMockState(), makeFlowResult('field'), interpreterResult);
      expect(result.explanation).toContain('para continuar');
    });

    it('generates explanation when ambiguous on non-validation field', async () => {
      const schema = {
        fields: [{ id: 'color', type: 'select', label: 'Color', question: '?', required: false, options: [{ value: 'rojo', label: 'Rojo' }] }],
      };
      const gen = new QuestionGenerator();
      const interpreterResult = makeInterpreterResult({
        ambiguousFields: [{ fieldId: 'color', possibleValues: ['rojo'], originalText: 'rojo' }],
      });
      const result = await gen.generate(schema, createMockState(), makeFlowResult('color'), interpreterResult);
      expect(result.explanation).toBeTruthy();
      expect(result.retry).toBe(false);
    });
  });

  describe('placeholder edge cases', () => {
    it('generates placeholder for text with unit', async () => {
      const schema = {
        fields: [{ id: 'txt', type: 'text', label: 'Texto', question: '?', unit: 'caracteres' }],
      };
      const gen = new QuestionGenerator();
      const result = await gen.generate(schema, createMockState(), makeFlowResult('txt'), makeInterpreterResult());
      expect(result.placeholder).toContain('caracteres');
    });

    it('returns null placeholder for select without options', async () => {
      const schema = {
        fields: [{ id: 'sel', type: 'select', label: 'Selección', question: '?' }],
      };
      const gen = new QuestionGenerator();
      const result = await gen.generate(schema, createMockState(), makeFlowResult('sel'), makeInterpreterResult());
      expect(result.placeholder).toBeNull();
    });
  });

  describe('validation edge cases', () => {
    it('includes minLength validation', async () => {
      const schema = {
        fields: [{ id: 'pw', type: 'text', label: 'Password', question: '?', required: false, validation: { minLength: 6 } }],
      };
      const gen = new QuestionGenerator();
      const result = await gen.generate(schema, createMockState(), makeFlowResult('pw'), makeInterpreterResult());
      expect(result.validation.minLength).toBe(6);
    });

    it('includes maxLength validation', async () => {
      const schema = {
        fields: [{ id: 'bio', type: 'text', label: 'Bio', question: '?', required: false, validation: { maxLength: 500 } }],
      };
      const gen = new QuestionGenerator();
      const result = await gen.generate(schema, createMockState(), makeFlowResult('bio'), makeInterpreterResult());
      expect(result.validation.maxLength).toBe(500);
    });

    it('does not set required when field.required is false', async () => {
      const schema = {
        fields: [{ id: 'opt', type: 'text', label: 'Opcional', question: '?', required: false }],
      };
      const gen = new QuestionGenerator();
      const result = await gen.generate(schema, createMockState(), makeFlowResult('opt'), makeInterpreterResult());
      expect(result.validation).toBeNull();
    });
  });

  describe('retry without errorMessage and without AI', () => {
    it('uses generic fallback for retry without errorMessage and no aiAdapter', async () => {
      const schema = {
        fields: [{ id: 'campo', type: 'text', label: 'Campo', question: '¿Cuál es el campo?', validation: { pattern: '^\\d+$' } }],
      };
      const gen = new QuestionGenerator();
      const interpreterResult = makeInterpreterResult({ extractedFields: { campo: 'abc' } });
      const result = await gen.generate(schema, createMockState(), makeFlowResult('campo'), interpreterResult);
      expect(result.question).toContain('El valor ingresado no es válido');
      expect(result.question).toContain('¿Cuál es el campo?');
      expect(result.retry).toBe(true);
      expect(result.aiUsed).toBe(false);
    });
  });

  describe('confidence edge cases', () => {
    it('returns 0.85 for retry without AI', async () => {
      const schema = {
        fields: [{ id: 'num', type: 'number', label: 'Número', question: '?', validation: { min: 1 } }],
      };
      const gen = new QuestionGenerator();
      const interpreterResult = makeInterpreterResult({ extractedFields: { num: 0 } });
      const result = await gen.generate(schema, createMockState(), makeFlowResult('num'), interpreterResult);
      expect(result.confidence).toBe(0.85);
    });

    it('returns 0.75 for retry with AI', async () => {
      const aiAdapter = makeAiAdapter(vi.fn().mockResolvedValue({ text: 'Intentá de nuevo' }));
      const schema = {
        fields: [{ id: 'num', type: 'number', label: 'Número', question: '?', validation: { min: 1 } }],
      };
      const gen = new QuestionGenerator({ aiAdapter });
      const interpreterResult = makeInterpreterResult({ extractedFields: { num: 0 } });
      const result = await gen.generate(schema, createMockState(), makeFlowResult('num'), interpreterResult);
      expect(result.confidence).toBe(0.75);
    });

    it('returns 0.7 for retry with AI and explanation', async () => {
      const aiAdapter = makeAiAdapter(vi.fn().mockResolvedValue({ text: 'Intentá de nuevo' }));
      const schema = {
        fields: [{ id: 'num', type: 'number', label: 'Número', question: '?', validation: { min: 1 } }],
      };
      const gen = new QuestionGenerator({ aiAdapter });
      const interpreterResult = makeInterpreterResult({
        extractedFields: { num: 0 },
        ambiguousFields: [{ fieldId: 'num', possibleValues: ['1', '2'], originalText: 'no sé' }],
      });
      const result = await gen.generate(schema, createMockState(), makeFlowResult('num'), interpreterResult);
      expect(result.confidence).toBe(0.65);
    });
  });

  describe('retry with AI and options without labels', () => {
    it('builds retry prompt with options that have no labels', async () => {
      const aiAdapter = makeAiAdapter(vi.fn().mockResolvedValue({ text: '¿Elegí una opción?' }));
      const schema = {
        fields: [{ id: 'opt', type: 'select', label: 'Opción', question: '¿Cuál?', validation: { required: true }, options: [{ value: 'a' }, { value: 'b' }] }],
      };
      const gen = new QuestionGenerator({ aiAdapter });
      const interpreterResult = makeInterpreterResult({ extractedFields: { opt: 'c' } });
      const result = await gen.generate(schema, createMockState(), makeFlowResult('opt'), interpreterResult);
      expect(result.aiUsed).toBe(true);
      expect(result.retry).toBe(true);
    });
  });

  describe('AI parse edge cases', () => {
    it('handles AI returning empty text', async () => {
      const aiAdapter = makeAiAdapter(vi.fn().mockResolvedValue({ text: '' }));
      const gen = new QuestionGenerator({ aiAdapter });
      const interpreterResult = makeInterpreterResult({ extractedFields: { material: 'INVALID' } });
      const result = await gen.generate(makeSchema(), createMockState(), makeFlowResult('material'), interpreterResult);
      expect(result.question).toBeTruthy();
      expect(result.aiUsed).toBe(false);
    });

    it('handles AI returning JSON without question property', async () => {
      const aiText = JSON.stringify({ answer: 'some value' });
      const aiAdapter = makeAiAdapter(vi.fn().mockResolvedValue({ text: aiText }));
      const gen = new QuestionGenerator({ aiAdapter });
      const interpreterResult = makeInterpreterResult({ extractedFields: { material: 'INVALID' } });
      const result = await gen.generate(makeSchema(), createMockState(), makeFlowResult('material'), interpreterResult);
      expect(result.question).toBeTruthy();
      expect(result.aiUsed).toBe(true);
    });

    it('handles AI returning multi-line response', async () => {
      const aiText = 'Alguna explicación.\n¿Podrías indicar el material?';
      const aiAdapter = makeAiAdapter(vi.fn().mockResolvedValue({ text: aiText }));
      const gen = new QuestionGenerator({ aiAdapter });
      const interpreterResult = makeInterpreterResult({ extractedFields: { material: 'INVALID' } });
      const result = await gen.generate(makeSchema(), createMockState(), makeFlowResult('material'), interpreterResult);
      expect(result.question).toBe('¿Podrías indicar el material?');
      expect(result.aiUsed).toBe(true);
    });

    it('handles AI response that is just text without question mark', async () => {
      const aiText = 'Escribe el material';
      const aiAdapter = makeAiAdapter(vi.fn().mockResolvedValue({ text: aiText }));
      const gen = new QuestionGenerator({ aiAdapter });
      const interpreterResult = makeInterpreterResult({ extractedFields: { material: 'INVALID' } });
      const result = await gen.generate(makeSchema(), createMockState(), makeFlowResult('material'), interpreterResult);
      expect(result.question).toBe('Escribe el material');
      expect(result.aiUsed).toBe(true);
    });

    it('handles AI returning whitespace-only response', async () => {
      const aiAdapter = makeAiAdapter(vi.fn().mockResolvedValue({ text: '   \n  \n  ' }));
      const gen = new QuestionGenerator({ aiAdapter });
      const interpreterResult = makeInterpreterResult({ extractedFields: { material: 'INVALID' } });
      const result = await gen.generate(makeSchema(), createMockState(), makeFlowResult('material'), interpreterResult);
      expect(result.question).toBeTruthy();
      expect(result.aiUsed).toBe(false);
    });

    it('handles AI returning null text', async () => {
      const aiAdapter = makeAiAdapter(vi.fn().mockResolvedValue({ text: null }));
      const gen = new QuestionGenerator({ aiAdapter });
      const interpreterResult = makeInterpreterResult({ extractedFields: { material: 'INVALID' } });
      const result = await gen.generate(makeSchema(), createMockState(), makeFlowResult('material'), interpreterResult);
      expect(result.question).toBeTruthy();
      expect(result.aiUsed).toBe(false);
    });
  });

  describe('retry without question', () => {
    it('retry with AI when field has no question property', async () => {
      const aiAdapter = makeAiAdapter(vi.fn().mockResolvedValue({ text: 'Nuevo intento' }));
      const schema = {
        fields: [{ id: 'custom', type: 'text', label: 'Custom', validation: { minLength: 3 } }],
      };
      const gen = new QuestionGenerator({ aiAdapter });
      const interpreterResult = makeInterpreterResult({ extractedFields: { custom: 'ab' } });
      const result = await gen.generate(schema, createMockState(), makeFlowResult('custom'), interpreterResult);
      expect(result.retry).toBe(true);
      expect(result.confidence).toBeGreaterThan(0);
    });
  });

  describe('fieldHasValidation coverage', () => {
    it('detects pattern validation', async () => {
      const schema = {
        fields: [{ id: 'f1', type: 'text', label: 'F1', question: '?', required: false, validation: { pattern: '^\\d+$' } }],
      };
      const gen = new QuestionGenerator();
      const interpreterResult = makeInterpreterResult({ extractedFields: { f1: 'abc' } });
      const result = await gen.generate(schema, createMockState(), makeFlowResult('f1'), interpreterResult);
      expect(result.retry).toBe(true);
    });

    it('detects min validation', async () => {
      const schema = {
        fields: [{ id: 'f2', type: 'number', label: 'F2', question: '?', required: false, validation: { min: 1 } }],
      };
      const gen = new QuestionGenerator();
      const interpreterResult = makeInterpreterResult({ extractedFields: { f2: 0 } });
      const result = await gen.generate(schema, createMockState(), makeFlowResult('f2'), interpreterResult);
      expect(result.retry).toBe(true);
    });

    it('detects max validation', async () => {
      const schema = {
        fields: [{ id: 'f3', type: 'number', label: 'F3', question: '?', required: false, validation: { max: 100 } }],
      };
      const gen = new QuestionGenerator();
      const interpreterResult = makeInterpreterResult({ extractedFields: { f3: 200 } });
      const result = await gen.generate(schema, createMockState(), makeFlowResult('f3'), interpreterResult);
      expect(result.retry).toBe(true);
    });

    it('detects minLength validation', async () => {
      const schema = {
        fields: [{ id: 'f4', type: 'text', label: 'F4', question: '?', required: false, validation: { minLength: 3 } }],
      };
      const gen = new QuestionGenerator();
      const interpreterResult = makeInterpreterResult({ extractedFields: { f4: 'ab' } });
      const result = await gen.generate(schema, createMockState(), makeFlowResult('f4'), interpreterResult);
      expect(result.retry).toBe(true);
    });

    it('detects maxLength validation', async () => {
      const schema = {
        fields: [{ id: 'f5', type: 'text', label: 'F5', question: '?', required: false, validation: { maxLength: 5 } }],
      };
      const gen = new QuestionGenerator();
      const interpreterResult = makeInterpreterResult({ extractedFields: { f5: 'too long' } });
      const result = await gen.generate(schema, createMockState(), makeFlowResult('f5'), interpreterResult);
      expect(result.retry).toBe(true);
    });

    it('does not set retry for field with empty validation object', async () => {
      const schema = {
        fields: [{ id: 'f6', type: 'text', label: 'F6', question: '?', required: false, validation: {} }],
      };
      const gen = new QuestionGenerator();
      const interpreterResult = makeInterpreterResult({ extractedFields: { f6: 'value' } });
      const result = await gen.generate(schema, createMockState(), makeFlowResult('f6'), interpreterResult);
      expect(result.retry).toBe(false);
    });

    it('handles required: true in validation object', async () => {
      const schema = {
        fields: [{ id: 'f7', type: 'text', label: 'F7', question: '?', required: false, validation: { required: true } }],
      };
      const gen = new QuestionGenerator();
      const interpreterResult = makeInterpreterResult({ extractedFields: { f7: 'value' } });
      const result = await gen.generate(schema, createMockState(), makeFlowResult('f7'), interpreterResult);
      expect(result.retry).toBe(true);
    });
  });
});
