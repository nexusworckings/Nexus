import { mapInterviewEntitiesToContext } from "./interview-context.js";

export class ChatRuntime {
  #engine;
  #interviewRouter;

  constructor(options = {}) {
    this.#engine = options.engine;
    this.#interviewRouter = options.interviewRouter;

    if (!this.#engine) throw new Error("ChatRuntime: engine is required");
    if (!this.#interviewRouter)
      throw new Error("ChatRuntime: interviewRouter is required");
  }

  get engine() {
    return this.#engine;
  }

  async hasActiveInterview(sessionId) {
    return this.#interviewRouter.hasActiveInterview(sessionId);
  }

  async handleMessage({
    message,
    sessionId,
    interviewSessionId,
    clientId,
    conversationId,
  } = {}) {
    if (!message || typeof message !== "string") {
      return { type: "error", error: "message is required" };
    }

    const trimmedMessage = message.trim();
    if (trimmedMessage.length === 0) {
      return { type: "error", error: "message is required" };
    }

    const classification = this.#interviewRouter.classify(trimmedMessage);
    const activeInterviewId = interviewSessionId || sessionId;
    const hasActiveInterview = activeInterviewId
      ? await this.#interviewRouter.hasActiveInterview(activeInterviewId)
      : false;

    if (activeInterviewId && hasActiveInterview) {
      const answerResult = await this.#interviewRouter.answerMessage(
        activeInterviewId,
        trimmedMessage,
      );
      if (answerResult?.interviewComplete) {
        await this.#persistInterviewEntities(sessionId, activeInterviewId);
      }
      return this.#formatInterviewAnswer(answerResult);
    }

    if (
      classification.type === "action" &&
      classification.interview &&
      !classification.query
    ) {
      const schemaId = this.#interviewRouter.selectSchema(
        classification.interview,
      );
      if (schemaId) {
        const startResult = await this.#interviewRouter.startInterview(
          schemaId,
          trimmedMessage,
        );
        if (startResult?.interviewComplete) {
          await this.#persistInterviewEntities(
            sessionId,
            startResult.sessionId,
          );
        }
        return this.#formatInterviewStart(startResult);
      }
    }

    const profile =
      sessionId && this.#hasInterviewSession(sessionId)
        ? "interview"
        : "customer";

    const result = await this.#engine.process(message, {
      profile,
      sessionId: sessionId || undefined,
      clientId: clientId || undefined,
      conversationId: conversationId || undefined,
    });

    return this.#formatResponse(result, sessionId);
  }

  #hasInterviewSession(sessionId) {
    const context = this.#engine.contextManager.getSession(sessionId);
    if (!context) return false;
    return context.profile === "interview";
  }

  /**
   * Al completar una entrevista, traduce su resultado estructurado a
   * entidades del Conversation Context (P8) y las fusiona en el contexto de
   * la sesión conversacional, de modo que el turno siguiente ("¿cuánto
   * cuesta?") siga disponiendo de device/service/product/problem.
   *
   * Si no hay sessionId conversacional o falla la resolución, no bloquea el
   * flujo: se degrada silenciosamente preservando el comportamiento previo.
   */
  async #persistInterviewEntities(conversationSessionId, interviewSessionId) {
    if (!conversationSessionId || !interviewSessionId) return;
    let session;
    try {
      session =
        await this.#interviewRouter.getInterviewSession(interviewSessionId);
    } catch {
      return;
    }
    if (!session?.state) return;

    const orchestrator = this.#engine.conversationContextOrchestrator;
    if (!orchestrator) return;

    let completedFields;
    try {
      completedFields = session.state.getCompletedFields();
    } catch {
      completedFields = session.state.completedFields || null;
    }
    if (!completedFields) return;

    const schemaId = session.schema?.serviceId || session.schemaId;
    const entities = mapInterviewEntitiesToContext({
      schemaId,
      completedFields,
    });
    if (!entities || Object.keys(entities).length === 0) return;

    const resolved = orchestrator.resolveEntities(
      entities,
      conversationSessionId,
    );
    const context =
      resolved?.context && Object.keys(resolved.context).length > 0
        ? resolved.context
        : {};

    const contextManager = this.#engine.contextManager;
    if (Object.keys(context).length > 0 && contextManager) {
      if (contextManager.hasSession(conversationSessionId)) {
        contextManager.updateSession(conversationSessionId, {
          conversationContext: context,
        });
      }
    }
  }

  #formatInterviewStart(result) {
    if (!result || result.interviewComplete) {
      return {
        type: "completed",
        sessionId: result?.sessionId || null,
        schemaId: result?.schemaId || null,
        message:
          result?.summary ||
          result?.question?.question ||
          "Solicitud procesada correctamente.",
        data: result,
      };
    }

    return {
      type: "interview",
      sessionId: result.sessionId,
      schemaId: result.schemaId || null,
      question: result.question?.question || "",
      fieldId: result.question?.fieldId || null,
      retry: false,
    };
  }

  #formatInterviewAnswer(result) {
    if (result.cancelled) {
      return {
        type: "chat",
        message: "Entrevista cancelada. ¿En qué más puedo ayudarte?",
      };
    }

    if (result.help) {
      return {
        type: "interview",
        sessionId: result.sessionId,
        schemaId: result.schemaId || null,
        question: result.question?.question || "",
        fieldId: result.question?.fieldId || null,
        retry: false,
      };
    }

    if (result.interviewComplete) {
      return {
        type: "completed",
        sessionId: result.sessionId,
        schemaId: result.schemaId || null,
        message: result.summary || "Solicitud procesada correctamente.",
        data: result,
      };
    }

    return {
      type: "interview",
      sessionId: result.sessionId,
      schemaId: result.schemaId || null,
      question: result.question?.question || "",
      fieldId: result.question?.fieldId || null,
      retry:
        result.validationError !== null && result.validationError !== undefined,
    };
  }

  #formatResponse(result, sessionId) {
    if (result.type === "error") {
      if (result.error?.includes("not found")) {
        return { type: "chat", message: result.error };
      }
      return {
        type: "chat",
        message: "Ocurrió un error al procesar tu mensaje.",
      };
    }

    if (result.type === "conversation") {
      return { type: "chat", message: result.message };
    }

    if (result.type === "execution") {
      const executedTools = result.results
        .filter((r) => r.success)
        .map((r) => r.toolName);
      const failedTools = result.results
        .filter((r) => !r.success)
        .map((r) => r.toolName);
      const executedInterview =
        executedTools.includes("interviewController") ||
        executedTools.includes("questionGenerator");
      const completedInterview = result.results.some(
        (r) => r.success && r.data?.complete === true,
      );

      if (executedInterview) {
        const lastResult = result.results[result.results.length - 1];
        if (completedInterview) {
          return {
            type: "completed",
            sessionId: lastResult?.data?.sessionId || sessionId,
            schemaId: lastResult?.data?.schemaId || null,
            message: "Solicitud procesada correctamente.",
            data: lastResult?.data,
          };
        }
        const questionResult = result.results.find(
          (r) => r.toolName === "questionGenerator",
        );
        const interviewStart = result.results.find(
          (r) =>
            r.toolName === "interviewController" &&
            r.success &&
            r.data?.question?.question,
        );
        return {
          type: "interview",
          sessionId: interviewStart?.data?.sessionId || sessionId,
          schemaId:
            interviewStart?.data?.schemaId ||
            questionResult?.data?.schemaId ||
            null,
          question:
            questionResult?.data?.question ||
            interviewStart?.data?.question?.question ||
            result.explanation,
          fieldId:
            questionResult?.data?.field ||
            interviewStart?.data?.question?.fieldId ||
            null,
          retry: failedTools.length > 0,
        };
      }

      if (completedInterview) {
        const lastResult = result.results[result.results.length - 1];
        return {
          type: "completed",
          sessionId,
          message: "Solicitud procesada correctamente.",
          data: lastResult?.data,
        };
      }

      return { type: "chat", message: result.explanation };
    }

    return {
      type: "chat",
      message: result.message || result.explanation || "Respuesta generada.",
    };
  }
}
