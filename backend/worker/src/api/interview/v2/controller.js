import { validateStartInput, validateAnswerInput, validateSessionId } from './validators.js';
import { SchemaError, InterviewError, InterpreterError } from '../../../services/interview/v2/errors.js';

function ok(body) {
  return { body: { success: true, ...body }, httpStatus: 200 };
}

function fail(code, message, httpStatus = 400) {
  return { body: { success: false, error: { code, message } }, httpStatus };
}

function formatQuestion(question) {
  if (!question || question.question === null) {
    return null;
  }
  return {
    question: question.question,
    fieldId: question.fieldId,
    questionType: question.questionType,
    choices: question.choices,
    placeholder: question.placeholder,
    validation: question.validation,
    explanation: question.explanation,
  };
}

function formatSession(session) {
  const completedFields = session.state.completedFields || {};
  const totalCompleted = Object.keys(completedFields).length;
  const sessionStatus = totalCompleted > 0 ? 'active' : 'pending';

  const answers = {};
  for (const [fieldId, entry] of Object.entries(completedFields)) {
    answers[fieldId] = entry.value;
  }

  return {
    sessionId: session.sessionId,
    status: sessionStatus,
    currentField: null,
    answers,
  };
}

export function createInterviewApi({ schemaRegistry, interviewController }) {
  if (!schemaRegistry) {
    throw new Error('schemaRegistry is required');
  }
  if (!interviewController) {
    throw new Error('interviewController is required');
  }

  async function start(body) {
    const validationError = validateStartInput(body);
    if (validationError) {
      return fail(validationError.code, validationError.message, 400);
    }

    let schema;
    try {
      schema = await schemaRegistry.load(body.schemaId);
    } catch (err) {
      if (err instanceof SchemaError) {
        return fail(err.code, err.message, 404);
      }
      throw err;
    }

    try {
      const result = await interviewController.start(schema);
      return ok({
        sessionId: result.sessionId,
        completed: result.interviewComplete,
        question: formatQuestion(result.question),
        summary: result.summary || null,
      });
    } catch (err) {
      if (err instanceof InterviewError) {
        return fail(err.code, err.message, 400);
      }
      throw err;
    }
  }

  async function answer(sessionId, body) {
    const sessionError = validateSessionId(sessionId);
    if (sessionError) {
      return fail(sessionError.code, sessionError.message, 400);
    }

    const validationError = validateAnswerInput(body);
    if (validationError) {
      return fail(validationError.code, validationError.message, 400);
    }

    let raw;
    try {
      raw = await interviewController.answer(sessionId, {
        fieldId: body.fieldId,
        value: body.value,
      });
    } catch (err) {
      if (err instanceof InterpreterError) {
        return fail(err.code, err.message, 404);
      }
      if (err instanceof InterviewError) {
        return fail(err.code, err.message, 400);
      }
      throw err;
    }

    if (!raw.saved) {
      return ok({
        sessionId: raw.sessionId,
        retry: true,
        question: formatQuestion(raw.question),
        validationError: raw.validationError,
      });
    }

    return ok({
      sessionId: raw.sessionId,
      completed: raw.interviewComplete,
      question: formatQuestion(raw.question),
      summary: raw.summary || null,
    });
  }

  async function getSession(sessionId) {
    const sessionError = validateSessionId(sessionId);
    if (sessionError) {
      return fail(sessionError.code, sessionError.message, 400);
    }

    const hasSession = await interviewController.hasSession(sessionId);
    if (!hasSession) {
      return fail('SESSION_NOT_FOUND', `Sesión '${sessionId}' no encontrada.`, 404);
    }

    const session = await interviewController.getSession(sessionId);
    return ok(formatSession(session));
  }

  async function clearSession(sessionId) {
    const sessionError = validateSessionId(sessionId);
    if (sessionError) {
      return fail(sessionError.code, sessionError.message, 400);
    }

    await interviewController.clearSession(sessionId);
    return ok({});
  }

  return {
    start,
    answer,
    getSession,
    clearSession,
  };
}
