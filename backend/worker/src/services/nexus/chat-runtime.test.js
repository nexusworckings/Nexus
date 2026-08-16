import { describe, it, expect, vi } from "vitest";
import { ChatRuntime } from "./chat-runtime.js";
import { NexusAIEngine } from "./nexus-ai-engine.js";

function createMockEngine(chatFn) {
  return new NexusAIEngine({
    chatFn:
      chatFn ||
      vi
        .fn()
        .mockResolvedValue(JSON.stringify({ plan: [], explanation: "Hello!" })),
  });
}

function createMockRouter() {
  return {
    classify: vi.fn().mockReturnValue({ type: "none" }),
    hasActiveInterview: vi.fn().mockResolvedValue(false),
    answerMessage: vi.fn().mockResolvedValue({
      sessionId: null,
      question: null,
      interviewComplete: false,
      saved: false,
      validationError: null,
    }),
  };
}

function createInterviewRouterOverrides() {
  return {
    getInterviewSession: vi.fn().mockResolvedValue({
      sessionId: "interview-1",
      schemaId: "repair-request",
      state: {
        completedFields: {
          clientName: { value: "Juan", source: "user" },
          device: { value: "Motorola G32", source: "user" },
          problem: { value: "no enciende", source: "user" },
        },
      },
      schema: { serviceId: "repair-request" },
    }),
  };
}

describe("ChatRuntime", () => {
  describe("constructor", () => {
    it("rejects missing engine", () => {
      expect(() => new ChatRuntime({ interviewRouter: {} })).toThrow(
        "engine is required",
      );
    });

    it("rejects missing interviewRouter", () => {
      const engine = createMockEngine();
      expect(() => new ChatRuntime({ engine })).toThrow(
        "interviewRouter is required",
      );
    });

    it("accepts valid options", () => {
      const engine = createMockEngine();
      const router = createMockRouter();
      const runtime = new ChatRuntime({ engine, interviewRouter: router });
      expect(runtime).toBeInstanceOf(ChatRuntime);
    });
  });

  describe("handleMessage", () => {
    it("returns error when message is missing", async () => {
      const engine = createMockEngine();
      const runtime = new ChatRuntime({
        engine,
        interviewRouter: createMockRouter(),
      });
      const result = await runtime.handleMessage({});
      expect(result.type).toBe("error");
      expect(result.error).toBe("message is required");
    });

    it("returns error when message is empty", async () => {
      const runtime = new ChatRuntime({
        engine: createMockEngine(),
        interviewRouter: createMockRouter(),
      });
      const result = await runtime.handleMessage({ message: "" });
      expect(result.type).toBe("error");
      expect(result.error).toBe("message is required");
    });

    it("returns error when message is null", async () => {
      const runtime = new ChatRuntime({
        engine: createMockEngine(),
        interviewRouter: createMockRouter(),
      });
      const result = await runtime.handleMessage({ message: null });
      expect(result.type).toBe("error");
    });
  });

  describe("chat routing (no sessionId)", () => {
    it("routes to chat when no intent detected", async () => {
      const chatFn = vi
        .fn()
        .mockResolvedValue(
          JSON.stringify({ plan: [], explanation: "Echo: hola" }),
        );
      const engine = createMockEngine(chatFn);
      const runtime = new ChatRuntime({
        engine,
        interviewRouter: createMockRouter(),
      });

      const result = await runtime.handleMessage({ message: "hola" });

      expect(result.type).toBe("chat");
      expect(result.message).toBe("Echo: hola");
    });

    it("routes to chat when engine returns conversation", async () => {
      const chatFn = vi
        .fn()
        .mockResolvedValue(
          JSON.stringify({ plan: [], explanation: "Respuesta genérica" }),
        );
      const engine = createMockEngine(chatFn);
      const runtime = new ChatRuntime({
        engine,
        interviewRouter: createMockRouter(),
      });

      const result = await runtime.handleMessage({ message: "cuánto cuesta" });

      expect(result.type).toBe("chat");
      expect(chatFn).toHaveBeenCalled();
    });
  });

  describe("interview start flow", () => {
    it("starts interview when intent detected", async () => {
      const chatFn = vi.fn().mockResolvedValue(
        JSON.stringify({
          plan: [{ tool: "questionGenerator", params: { fieldId: "device" } }],
          explanation: "Iniciando entrevista de reparación",
        }),
      );
      const engine = createMockEngine(chatFn);
      engine.toolRegistry.register({
        name: "questionGenerator",
        description: "Generate interview question",
        inputSchema: {},
        execute: async () => ({
          question: "¿Qué equipo necesita reparación?",
          fieldId: "device",
        }),
      });
      engine.profileManager
        .get("customer")
        .allowedTools.push("questionGenerator");

      const runtime = new ChatRuntime({
        engine,
        interviewRouter: createMockRouter(),
      });

      const result = await runtime.handleMessage({
        message: "mi celular no prende",
      });

      expect(result.type).toBe("interview");
      expect(result.question).toBeTruthy();
    });
  });

  describe("active session continuation", () => {
    it("routes to chat when session does not exist", async () => {
      const chatFn = vi
        .fn()
        .mockResolvedValue(JSON.stringify({ plan: [], explanation: "Hola!" }));
      const engine = createMockEngine(chatFn);
      const runtime = new ChatRuntime({
        engine,
        interviewRouter: createMockRouter(),
      });

      const result = await runtime.handleMessage({
        message: "hola",
        sessionId: "nonexistent",
      });

      expect(result.type).toBe("chat");
      expect(chatFn).toHaveBeenCalled();
    });
  });

  describe("full flow integration", () => {
    it("returns completed when tool returns complete:true", async () => {
      const chatFn = vi.fn().mockResolvedValue(
        JSON.stringify({
          plan: [{ tool: "completeTool", params: {} }],
          explanation: "Completando",
        }),
      );
      const engine = createMockEngine(chatFn);
      engine.toolRegistry.register({
        name: "completeTool",
        description: "Complete tool",
        inputSchema: {},
        execute: async () => ({ id: "r1", complete: true }),
      });
      engine.profileManager.get("customer").allowedTools.push("completeTool");

      const runtime = new ChatRuntime({
        engine,
        interviewRouter: createMockRouter(),
      });
      const result = await runtime.handleMessage({
        message: "finalizar",
        sessionId: "s",
      });

      expect(result.type).toBe("completed");
    });
  });

  describe("interview → conversation context persistence", () => {
    it("injects entities into the orchestrator when an answer completes the interview", async () => {
      const engine = createMockEngine();
      const router = {
        classify: vi.fn().mockReturnValue({ type: "none" }),
        hasActiveInterview: vi.fn().mockResolvedValue(true),
        answerMessage: vi.fn().mockResolvedValue({
          sessionId: "interview-1",
          question: null,
          interviewComplete: true,
          saved: true,
          validationError: null,
          summary: "Listo",
        }),
        ...createInterviewRouterOverrides(),
      };
      const runtime = new ChatRuntime({ engine, interviewRouter: router });

      const result = await runtime.handleMessage({
        message: "si",
        sessionId: "conversation-1",
        interviewSessionId: "interview-1",
      });

      expect(result.type).toBe("completed");
      expect(router.getInterviewSession).toHaveBeenCalledWith("interview-1");
      const context =
        engine.conversationContextOrchestrator.getContext("conversation-1");
      expect(context.device).toBe("Motorola G32");
      expect(context.brand).toBe("Motorola");
      expect(context.model).toBe("G32");
      expect(context.problem).toBe("no enciende");
      expect(context.clientName).toBe("Juan");
      expect(context.service).toBe("Reparación");
    });

    it("injects entities when the interview completes on the start message", async () => {
      const engine = createMockEngine();
      const router = {
        classify: vi.fn().mockReturnValue({
          type: "action",
          interview: "repair-request",
          query: null,
        }),
        hasActiveInterview: vi.fn().mockResolvedValue(false),
        selectSchema: vi.fn().mockReturnValue("repair-request"),
        startInterview: vi.fn().mockResolvedValue({
          sessionId: "interview-1",
          schemaId: "repair-request",
          question: null,
          interviewComplete: true,
          summary: "Listo",
        }),
        ...createInterviewRouterOverrides(),
      };
      const runtime = new ChatRuntime({ engine, interviewRouter: router });

      const result = await runtime.handleMessage({
        message: "Quiero reparar mi Motorola G32",
        sessionId: "conversation-1",
      });

      expect(result.type).toBe("completed");
      const context =
        engine.conversationContextOrchestrator.getContext("conversation-1");
      expect(context.device).toBe("Motorola G32");
      expect(context.problem).toBe("no enciende");
    });

    it("does not inject context when the interview answer does not complete", async () => {
      const engine = createMockEngine();
      const router = {
        classify: vi.fn().mockReturnValue({ type: "none" }),
        hasActiveInterview: vi.fn().mockResolvedValue(true),
        answerMessage: vi.fn().mockResolvedValue({
          sessionId: "interview-1",
          question: { question: "¿Tu nombre?", fieldId: "clientName" },
          interviewComplete: false,
          saved: false,
          validationError: null,
        }),
        ...createInterviewRouterOverrides(),
      };
      const runtime = new ChatRuntime({ engine, interviewRouter: router });

      const result = await runtime.handleMessage({
        message: "Juan",
        sessionId: "conversation-1",
        interviewSessionId: "interview-1",
      });

      expect(result.type).toBe("interview");
      expect(router.getInterviewSession).not.toHaveBeenCalled();
      expect(
        engine.conversationContextOrchestrator.getContext("conversation-1"),
      ).toBeNull();
    });

    it("does not inject context on cancellation", async () => {
      const engine = createMockEngine();
      const router = {
        classify: vi.fn().mockReturnValue({ type: "none" }),
        hasActiveInterview: vi.fn().mockResolvedValue(true),
        answerMessage: vi.fn().mockResolvedValue({
          sessionId: "interview-1",
          question: null,
          interviewComplete: false,
          saved: false,
          cancelled: true,
          validationError: null,
        }),
        ...createInterviewRouterOverrides(),
      };
      const runtime = new ChatRuntime({ engine, interviewRouter: router });

      const result = await runtime.handleMessage({
        message: "cancelar",
        sessionId: "conversation-1",
        interviewSessionId: "interview-1",
      });

      expect(result.type).toBe("chat");
      expect(router.getInterviewSession).not.toHaveBeenCalled();
      expect(
        engine.conversationContextOrchestrator.getContext("conversation-1"),
      ).toBeNull();
    });

    it("tolerates a failed getInterviewSession without breaking the flow", async () => {
      const engine = createMockEngine();
      const router = {
        classify: vi.fn().mockReturnValue({ type: "none" }),
        hasActiveInterview: vi.fn().mockResolvedValue(true),
        answerMessage: vi.fn().mockResolvedValue({
          sessionId: "interview-1",
          question: null,
          interviewComplete: true,
          saved: true,
          validationError: null,
          summary: "Listo",
        }),
        getInterviewSession: vi.fn().mockRejectedValue(new Error("boom")),
      };
      const runtime = new ChatRuntime({ engine, interviewRouter: router });

      const result = await runtime.handleMessage({
        message: "si",
        sessionId: "conversation-1",
        interviewSessionId: "interview-1",
      });

      expect(result.type).toBe("completed");
      expect(result.message).toBe("Listo");
    });
  });
});
