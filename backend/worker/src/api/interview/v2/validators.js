export function validateStartInput(data) {
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    return { code: 'INVALID_INPUT', message: 'El cuerpo de la solicitud debe ser un objeto JSON válido.' };
  }

  if (typeof data.schemaId !== 'string' || data.schemaId.trim().length === 0) {
    return { code: 'MISSING_SCHEMA_ID', message: 'schemaId es requerido y debe ser un string no vacío.' };
  }

  return null;
}

export function validateAnswerInput(data) {
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    return { code: 'INVALID_INPUT', message: 'El cuerpo de la solicitud debe ser un objeto JSON válido.' };
  }

  if (typeof data.fieldId !== 'string' || data.fieldId.trim().length === 0) {
    return { code: 'MISSING_FIELD_ID', message: 'fieldId es requerido y debe ser un string no vacío.' };
  }

  return null;
}

export function validateSessionId(sessionId) {
  if (typeof sessionId !== 'string' || sessionId.trim().length === 0) {
    return { code: 'INVALID_SESSION_ID', message: 'sessionId debe ser un string no vacío.' };
  }

  return null;
}
