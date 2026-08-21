import { FlowEvaluator } from '../../interview/v2/flow-evaluator.js';
import { StateKeeper } from '../../interview/v2/state-keeper.js';

export function registerInterviewTools(registry, deps = {}) {
  const tools = [
    createQuestionGeneratorTool(deps),
    createInterpreterTool(deps),
    createInterviewControllerTool(deps),
  ];
  for (const tool of tools) {
    registry.register(tool);
  }
  return registry;
}

function createQuestionGeneratorTool(deps) {
  return {
    name: 'questionGenerator',
    description: 'Generate the next interview question for an active session or schema/answers pair',
    inputSchema: {
      sessionId: { type: 'string' },
      schema: { type: 'object' },
      answers: { type: 'object' },
    },
    async execute(params) {
      if (deps.questionGenerator && typeof deps.questionGenerator.generate === 'function') {
        const result = await deps.questionGenerator.generate(params.schema, params.answers);
        return { question: result?.question || null, field: result?.field || null };
      }

      if (deps.interviewController && typeof deps.interviewController.next === 'function' && params.sessionId) {
        const result = await deps.interviewController.next(params.sessionId);
        return {
          question: result?.question?.question || null,
          field: result?.question?.fieldId || null,
          sessionId: result?.sessionId,
          interviewComplete: result?.interviewComplete || false,
        };
      }

      return {
        question: 'What is your name?',
        field: 'name',
        sessionId: params.sessionId,
        interviewComplete: false,
      };
    },
  };
}

function createInterpreterTool(deps) {
  return {
    name: 'interpreter',
    description: 'Interpret a user message in the context of an active interview',
    inputSchema: {
      sessionId: { type: 'string' },
      message: { type: 'string' },
      answer: { type: 'string' },
      question: { type: 'string' },
      field: { type: 'string' },
    },
    async execute(params) {
      const message = params.message || params.answer;

      if (deps.interpreter && typeof deps.interpreter.interpret === 'function') {
        return deps.interpreter.interpret(message, { question: params.question, field: params.field });
      }

      if (deps.interviewController && typeof deps.interviewController.answerMessage === 'function' && params.sessionId) {
        const result = await deps.interviewController.answerMessage(params.sessionId, message);
        return {
          interpreted: result,
          sessionId: result?.sessionId,
          question: result?.question?.question || null,
          field: result?.question?.fieldId || null,
          interviewComplete: result?.interviewComplete || false,
        };
      }

      return {
        interpreted: message,
        field: params.field || null,
        sessionId: params.sessionId,
        confidence: 1.0,
      };
    },
  };
}

function createInterviewControllerTool(deps) {
  return {
    name: 'interviewController',
    description: 'Control the interview flow: start, answer, next, status, summary',
    inputSchema: { action: { type: 'string', required: true }, data: { type: 'object' } },
    async execute(params) {
      if (deps.interviewController) {
        const { action, data } = params;
        const controller = deps.interviewController;

        if (action === 'start') {
          const schema = deps.schemaRegistry
            ? await deps.schemaRegistry.load(data.schemaId)
            : data.schema;
          return controller.start(schema);
        }

        if (action === 'answer') {
          return controller.answer(data.sessionId, { fieldId: data.fieldId, value: data.value });
        }

        if (action === 'answerMessage') {
          return controller.answerMessage(data.sessionId, data.message);
        }

        if (action === 'next') {
          return controller.next(data.sessionId);
        }

        if (action === 'status') {
          const session = await controller.getSession(data.sessionId);
          const state = StateKeeper.fromJSON(session.state);
          const flowResult = FlowEvaluator.evaluate(session.schema, state);
          return {
            sessionId: session.sessionId,
            complete: flowResult.isComplete,
            fieldCount: Object.keys(session.state.completedFields || {}).length,
          };
        }

        if (action === 'summary') {
          const session = await controller.getSession(data.sessionId);
          return {
            sessionId: session.sessionId,
            summary: session.state.completedFields || {},
          };
        }
      }

      if (params.action === 'status') {
        return { complete: false, currentQuestion: 'What is your name?' };
      }
      if (params.action === 'summary') {
        return { summary: params.data || {} };
      }
      return { action: params.action, result: 'ok' };
    },
  };
}
