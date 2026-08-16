import { defaultLogger } from '../logger.js';
import { eventBus, Events } from './event-bus.js';
import { validateField, validateRequired } from './validation.js';

const log = defaultLogger;

function containsProhibitedWord(text, forbiddenList) {
  if (!forbiddenList || forbiddenList.length === 0) return null;
  const lower = text.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  for (const word of forbiddenList) {
    const normalized = word.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    if (lower.includes(normalized)) return word;
  }
  return null;
}

export function resolveEntities(entities, schema, state, forbidden) {
  const resolved = [];
  const rejected = [];

  for (const entity of entities) {
    const { field, value } = entity;

    if (field === 'tipo_trabajo') {
      if (state.tipo_trabajo === null) {
        resolved.push({ field, value, confidence: 1 });
      }
      continue;
    }

    const question = schema.questions.find(q => q.id === field);
    if (!question) {
      log.info('[RESOLVER]', `Campo "${field}" no existe en el schema`);
      rejected.push({ field, value, reason: 'not_in_schema' });
      continue;
    }

    if (state[field] !== null && state[field] !== undefined) {
      log.info('[RESOLVER]', `"${field}" ya tiene valor: ${state[field]}`);
      continue;
    }

    if (question.type === 'select' && question.options) {
      if (!question.options.includes(value)) {
        log.info('[RESOLVER]', `"${value}" no es válido para "${field}"`);
        rejected.push({ field, value, reason: 'invalid_option' });
        continue;
      }
    }

    if (question.required && value !== false && (!value || String(value).trim() === '')) {
      log.info('[RESOLVER]', `"${field}" requerido pero valor vacío`);
      rejected.push({ field, value, reason: 'required' });
      continue;
    }

    if (typeof value === 'string' && forbidden.length > 0) {
      const blocked = containsProhibitedWord(value, forbidden);
      if (blocked) {
        log.info('[RESOLVER]', `Valor bloqueado para "${field}": contiene "${blocked}"`);
        rejected.push({ field, value, reason: 'prohibited_word', detail: blocked });
        continue;
      }
    }

    const validationErrors = validateField(value, question);
    if (validationErrors.length > 0) {
      log.info('[RESOLVER]', `Validación falló para "${field}": ${validationErrors.map(e => e.message).join(', ')}`);
      rejected.push({ field, value, reason: 'validation_error', errors: validationErrors });
      continue;
    }

    const resolvedValue = question.type === 'boolean' ? resolveBoolean(value) : value;
    if (question.type === 'boolean' && typeof resolvedValue !== 'boolean') {
      log.info('[RESOLVER]', `"${field}" se esperaba boolean pero se recibió "${resolvedValue}"`);
      rejected.push({ field, value, reason: 'invalid_boolean' });
      continue;
    }

    resolved.push({ field, value: resolvedValue, confidence: entity.confidence || 0.9 });
    eventBus.emit(Events.FieldUpdated, { field, value: resolvedValue, confidence: entity.confidence });
  }

  return { resolved, rejected };
}

export function resolveBoolean(val) {
  if (val === true || val === 'si' || val === 'sí' || val === 'true') return true;
  if (val === false || val === 'no' || val === 'false') return false;
  return val;
}
