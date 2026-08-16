import { describe, it, expect, vi } from "vitest";
import { NexusAIEngine } from "./nexus-ai-engine.js";

describe("NexusAIEngine", () => {
  it("throws without chatFn", () => {
    expect(() => new NexusAIEngine()).toThrow("chatFn is required");
  });

  it("processes with valid profile", async () => {
    const chatFn = vi
      .fn()
      .mockResolvedValue(JSON.stringify({ plan: [], explanation: "Hello!" }));
    const engine = new NexusAIEngine({ chatFn });
    const result = await engine.process("Hi");
    expect(result.type).toBe("conversation");
    expect(result.message).toBe("Hello!");
  });

  it("returns error for invalid profile", async () => {
    const chatFn = vi.fn().mockResolvedValue("ok");
    const engine = new NexusAIEngine({ chatFn });
    const result = await engine.process("Hi", { profile: "ghost" });
    expect(result.type).toBe("error");
    expect(result.error).toContain("not found");
  });

  it("creates session on first message", async () => {
    const chatFn = vi
      .fn()
      .mockResolvedValue(JSON.stringify({ plan: [], explanation: "ok" }));
    const engine = new NexusAIEngine({ chatFn });
    await engine.process("Hi", { sessionId: "custom-session" });
    expect(engine.contextManager.hasSession("custom-session")).toBe(true);
  });

  it("uses customer profile by default", async () => {
    const chatFn = vi
      .fn()
      .mockResolvedValue(JSON.stringify({ plan: [], explanation: "ok" }));
    const engine = new NexusAIEngine({ chatFn });
    await engine.process("Hi");
    expect(engine.profileManager.get("customer")).toBeDefined();
  });

  it("executes tool plan and returns results", async () => {
    const chatFn = vi.fn().mockResolvedValue(
      JSON.stringify({
        plan: [{ tool: "hello", params: {} }],
        explanation: "Using tool",
      }),
    );
    const engine = new NexusAIEngine({ chatFn });
    engine.toolRegistry.register({
      name: "hello",
      description: "A test tool",
      execute: async () => "world",
    });
    engine.profileManager.get("customer").allowedTools.push("hello");
    const result = await engine.process("Do something");
    expect(result.type).toBe("execution");
    expect(result.results).toHaveLength(1);
    expect(result.results[0].data).toBe("world");
    expect(result.metrics.succeeded).toBe(1);
  });

  it("rejects tools not in profile", async () => {
    const chatFn = vi.fn().mockResolvedValue(
      JSON.stringify({
        plan: [{ tool: "restrictedTool", params: {} }],
        explanation: "",
      }),
    );
    const engine = new NexusAIEngine({ chatFn });
    engine.toolRegistry.register({
      name: "restrictedTool",
      execute: async () => "ok",
    });
    const result = await engine.process("test", { profile: "customer" });
    expect(result.results[0].success).toBe(false);
    expect(result.results[0].error).toContain("not allowed");
  });

  it("preserves sessionId across calls", async () => {
    const chatFn = vi
      .fn()
      .mockResolvedValue(JSON.stringify({ plan: [], explanation: "ok" }));
    const engine = new NexusAIEngine({ chatFn });
    await engine.process("First", { sessionId: "same" });
    await engine.process("Second", { sessionId: "same" });
    const session = engine.contextManager.getSession("same");
    expect(session.conversationHistory).toHaveLength(4);
  });

  it("adds user message to history", async () => {
    const chatFn = vi
      .fn()
      .mockResolvedValue(JSON.stringify({ plan: [], explanation: "ok" }));
    const engine = new NexusAIEngine({ chatFn });
    await engine.process("User message", { sessionId: "s1" });
    const s = engine.contextManager.getSession("s1");
    expect(s.conversationHistory[0].role).toBe("user");
    expect(s.conversationHistory[0].content).toBe("User message");
  });

  it("adds assistant message to history", async () => {
    const chatFn = vi
      .fn()
      .mockResolvedValue(
        JSON.stringify({ plan: [], explanation: "Bot reply" }),
      );
    const engine = new NexusAIEngine({ chatFn });
    await engine.process("Hi", { sessionId: "s1" });
    const s = engine.contextManager.getSession("s1");
    expect(s.conversationHistory[1].role).toBe("assistant");
  });

  it("records tool calls in context", async () => {
    const chatFn = vi.fn().mockResolvedValue(
      JSON.stringify({
        plan: [{ tool: "myTool", params: { x: 1 } }],
        explanation: "",
      }),
    );
    const engine = new NexusAIEngine({ chatFn });
    engine.toolRegistry.register({ name: "myTool", execute: async () => "ok" });
    engine.profileManager.get("customer").allowedTools.push("myTool");
    await engine.process("test", { sessionId: "s-tools" });
    const s = engine.contextManager.getSession("s-tools");
    expect(s.toolHistory).toHaveLength(1);
    expect(s.toolHistory[0].toolName).toBe("myTool");
  });

  it("exposes toolRegistry", () => {
    const engine = new NexusAIEngine({ chatFn: async () => "{}" });
    expect(engine.toolRegistry).toBeDefined();
  });

  it("exposes toolExecutor", () => {
    const engine = new NexusAIEngine({ chatFn: async () => "{}" });
    expect(engine.toolExecutor).toBeDefined();
  });

  it("exposes profileManager", () => {
    const engine = new NexusAIEngine({ chatFn: async () => "{}" });
    expect(engine.profileManager).toBeDefined();
  });

  it("exposes contextManager", () => {
    const engine = new NexusAIEngine({ chatFn: async () => "{}" });
    expect(engine.contextManager).toBeDefined();
  });

  it("exposes planningEngine", () => {
    const engine = new NexusAIEngine({ chatFn: async () => "{}" });
    expect(engine.planningEngine).toBeDefined();
  });

  it("allows custom injection of all components", async () => {
    const { ToolRegistry } = await import("./tool-registry.js");
    const { ToolExecutor } = await import("./tool-executor.js");
    const { ProfileManager } = await import("./profile-manager.js");
    const { ContextManager } = await import("./context-manager.js");
    const { PlanningEngine } = await import("./planning-engine.js");

    const registry = new ToolRegistry();
    const executor = new ToolExecutor({ toolRegistry: registry });
    const pm = new ProfileManager();
    const cm = new ContextManager();
    const pe = new PlanningEngine({ chatFn: async () => "{}" });

    const engine = new NexusAIEngine({
      toolRegistry: registry,
      toolExecutor: executor,
      profileManager: pm,
      contextManager: cm,
      planningEngine: pe,
      chatFn: async () => "{}",
    });
    expect(engine.toolRegistry).toBe(registry);
  });

  it("handles planning engine error gracefully", async () => {
    const chatFn = vi.fn().mockRejectedValue(new Error("planning failed"));
    const engine = new NexusAIEngine({ chatFn });
    const result = await engine.process("test");
    expect(result.type).toBe("conversation");
  });

  it("accepts custom initial session data", async () => {
    const chatFn = vi
      .fn()
      .mockResolvedValue(JSON.stringify({ plan: [], explanation: "ok" }));
    const engine = new NexusAIEngine({ chatFn });
    await engine.process("test", {
      sessionId: "init-session",
      clientId: "c-init",
      conversationId: "conv-init",
    });
    const s = engine.contextManager.getSession("init-session");
    expect(s.clientId).toBe("c-init");
    expect(s.conversationId).toBe("conv-init");
  });
});

describe("NexusAIEngine response generation (Planner → Executor → Response)", () => {
  it("uses respondFn output for a conversation without tools", async () => {
    const chatFn = vi
      .fn()
      .mockResolvedValue(JSON.stringify({ plan: [], explanation: "ignored" }));
    const respondFn = vi
      .fn()
      .mockResolvedValue({ message: "Generado sin tools" });
    const engine = new NexusAIEngine({ chatFn, respondFn });
    const result = await engine.process("Hola", { sessionId: "rg-conv" });

    expect(respondFn).toHaveBeenCalledTimes(1);
    expect(respondFn.mock.calls[0][0]).toMatchObject({
      userMessage: "Hola",
      toolResults: [],
      plan: [],
      steps: [],
    });
    expect(result.type).toBe("conversation");
    expect(result.message).toBe("Generado sin tools");
  });

  it("generates the response AFTER tools execute, using real results", async () => {
    const chatFn = vi.fn().mockResolvedValue(
      JSON.stringify({
        plan: [{ tool: "hello", params: {} }],
        explanation: "escrito antes de ejecutar (se ignora)",
      }),
    );
    const respondFn = vi
      .fn()
      .mockResolvedValue({ message: "El precio es 42000" });
    const engine = new NexusAIEngine({ chatFn, respondFn });
    engine.toolRegistry.register({
      name: "hello",
      description: "test",
      execute: async () => ({ price: 42000 }),
    });
    engine.profileManager.get("customer").allowedTools.push("hello");

    const result = await engine.process("¿cuánto cuesta?", {
      sessionId: "rg-tools",
    });

    expect(respondFn).toHaveBeenCalledTimes(1);
    const arg = respondFn.mock.calls[0][0];
    expect(arg.toolResults).toHaveLength(1);
    expect(arg.toolResults[0].data).toEqual({ price: 42000 });
    expect(result.type).toBe("execution");
    expect(result.explanation).toBe("El precio es 42000");
  });

  it("passes conversationContext and history to respondFn", async () => {
    const chatFn = vi
      .fn()
      .mockResolvedValue(JSON.stringify({ plan: [], explanation: "ok" }));
    const respondFn = vi.fn().mockResolvedValue({ message: "ok" });
    const engine = new NexusAIEngine({ chatFn, respondFn });
    await engine.process("¿cuánto?", { sessionId: "rg-history" });

    const arg = respondFn.mock.calls[0][0];
    expect(arg.history).toHaveLength(1);
    expect(arg.history[0].role).toBe("user");
    expect(arg.history[0].content).toBe("¿cuánto?");
    expect(arg).toHaveProperty("conversationContext");
  });

  it("falls back to plan explanation when respondFn throws", async () => {
    const chatFn = vi
      .fn()
      .mockResolvedValue(
        JSON.stringify({ plan: [], explanation: "fallback ok" }),
      );
    const respondFn = vi
      .fn()
      .mockRejectedValue(new Error("response generation failed"));
    const engine = new NexusAIEngine({ chatFn, respondFn });
    const result = await engine.process("Hola", { sessionId: "rg-fallback" });

    expect(result.type).toBe("conversation");
    expect(result.message).toBe("fallback ok");
  });

  it("behaves as before when no respondFn is provided", async () => {
    const chatFn = vi
      .fn()
      .mockResolvedValue(JSON.stringify({ plan: [], explanation: "Hello!" }));
    const engine = new NexusAIEngine({ chatFn });
    const result = await engine.process("Hi");
    expect(result.type).toBe("conversation");
    expect(result.message).toBe("Hello!");
  });
});
