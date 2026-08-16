import { describe, it, expect, vi } from "vitest";
import { NexusAIEngine } from "./nexus-ai-engine.js";
import { ToolRegistry } from "./tool-registry.js";
import { ToolExecutor } from "./tool-executor.js";
import { ProfileManager } from "./profile-manager.js";
import { ContextManager } from "./context-manager.js";
import { PlanningEngine } from "./planning-engine.js";
import { MetricsCollector } from "./observability.js";
import {
  createSearchPriceTool,
  createSearchBusinessInfoTool,
} from "./tools/index.js";
import { PriceService } from "../business/price-service.js";
import { BusinessInfoService } from "../business/business-info-service.js";

function makeEngine({ chatFn } = {}) {
  const registry = new ToolRegistry();
  const metrics = new MetricsCollector();
  const executor = new ToolExecutor({
    toolRegistry: registry,
    metricsCollector: metrics,
  });
  const pm = new ProfileManager();
  const cm = new ContextManager();
  const pe = new PlanningEngine({ chatFn });

  const queryFn = vi.fn(async (table) => {
    if (table === "prices") {
      return [
        {
          id: "p1",
          service_id: "s1",
          label: "Cambio de pantalla Motorola G32",
          amount: 4200,
          currency: "ARS",
          is_active: "true",
        },
      ];
    }
    if (table === "services") {
      return [{ id: "s1", name: "Cambio de pantalla" }];
    }
    if (table === "hours") {
      return [
        {
          day_of_week: 1,
          day_name: "Lunes",
          open_time: "09:00",
          close_time: "19:00",
          is_closed: false,
        },
      ];
    }
    if (table === "faqs") {
      return [
        {
          question: "¿Cuánto tarda una reparación?",
          answer: "De 2 a 5 días hábiles.",
          category: "reparacion",
          is_active: "true",
          sort_order: 1,
        },
      ];
    }
    return [];
  });

  const priceService = new PriceService({ queryFn });
  const businessInfoService = new BusinessInfoService({ queryFn });
  registry.register(createSearchPriceTool({ priceService }));
  registry.register(createSearchBusinessInfoTool({ businessInfoService }));
  pm.get("customer").allowedTools.push("searchPrice", "searchBusinessInfo");

  const engine = new NexusAIEngine({
    toolRegistry: registry,
    toolExecutor: executor,
    profileManager: pm,
    contextManager: cm,
    planningEngine: pe,
    chatFn,
    metricsCollector: metrics,
  });

  return { engine };
}

describe("Conversation Context Orchestrator — integration", () => {
  it("carries device/service into the planner on the follow-up message", async () => {
    const prompts = [];
    const chatFn = vi.fn().mockImplementation(async (prompt) => {
      prompts.push(prompt);
      if (prompts.length === 1) {
        return JSON.stringify({
          plan: [
            { tool: "searchPrice", params: { query: "pantalla motorola g32" } },
          ],
          explanation: "Te paso el precio.",
        });
      }
      const normalized = prompt.toLowerCase();
      expect(normalized).toContain("motorola g32");
      expect(normalized).toContain("cambio de pantalla");
      return JSON.stringify({
        plan: [
          {
            tool: "searchBusinessInfo",
            params: { query: "tiempo de reparacion" },
          },
        ],
        explanation: "Te paso el tiempo de reparación.",
      });
    });
    const { engine } = makeEngine({ chatFn });

    const first = await engine.process(
      "¿Cuánto cuesta cambiar la pantalla del Motorola G32?",
      { sessionId: "ctx-flow" },
    );
    expect(first.type).toBe("execution");
    expect(first.conversationContext).toEqual({
      device: "Motorola G32",
      brand: "Motorola",
      model: "G32",
      service: "Cambio de pantalla",
    });
    expect(first.results[0].data.results[0].amount).toBe(4200);

    const second = await engine.process("¿Y cuánto demora?", {
      sessionId: "ctx-flow",
    });
    expect(second.type).toBe("execution");
    expect(second.results[0].toolName).toBe("searchBusinessInfo");
    expect(second.results[0].data.results.topic).toBe("repair_time");
    expect(second.conversationContext.device).toBe("Motorola G32");
    expect(second.conversationContext.service).toBe("Cambio de pantalla");
    expect(chatFn).toHaveBeenCalledTimes(2);
  });

  it("resolves a reference message without re-extraction", async () => {
    const chatFn = vi.fn().mockResolvedValue(
      JSON.stringify({
        plan: [{ tool: "searchBusinessInfo", params: { query: "garantia" } }],
        explanation: "Consultando.",
      }),
    );
    const { engine } = makeEngine({ chatFn });

    await engine.process(
      "¿Cuánto cuesta cambiar la pantalla del Motorola G32?",
      {
        sessionId: "ctx-ref",
      },
    );
    const result = await engine.process("¿Y eso tiene garantía?", {
      sessionId: "ctx-ref",
    });

    expect(result.conversationContext.device).toBe("Motorola G32");
    expect(result.conversationContext.service).toBe("Cambio de pantalla");
  });

  it("delivers extracted entities to the planner on the first message", async () => {
    const chatFn = vi.fn().mockImplementation(async (prompt) => {
      expect(prompt.toLowerCase()).toContain("motorola g32");
      return JSON.stringify({
        plan: [
          { tool: "searchPrice", params: { query: "pantalla motorola g32" } },
        ],
        explanation: "Te paso el precio.",
      });
    });
    const { engine } = makeEngine({ chatFn });

    const result = await engine.process(
      "¿Cuánto cuesta cambiar la pantalla del Motorola G32?",
      { sessionId: "ctx-first" },
    );

    expect(result.type).toBe("execution");
    expect(result.conversationContext.device).toBe("Motorola G32");
  });

  it("stays identical to today when no entities are present", async () => {
    const chatFn = vi.fn().mockResolvedValue(
      JSON.stringify({
        plan: [],
        explanation: "¡Hola! ¿En qué puedo ayudarte?",
      }),
    );
    const { engine } = makeEngine({ chatFn });

    const result = await engine.process("Hola", { sessionId: "ctx-plain" });

    expect(result.type).toBe("conversation");
    expect(result.message).toBe("¡Hola! ¿En qué puedo ayudarte?");
    expect(result.conversationContext).toBeUndefined();
    expect(result.workingMemory).toBeUndefined();
  });

  it("does not leak context across sessions in the same engine", async () => {
    const chatFn = vi.fn().mockResolvedValue(
      JSON.stringify({
        plan: [{ tool: "searchBusinessInfo", params: { query: "horarios" } }],
        explanation: "Consultando.",
      }),
    );
    const { engine } = makeEngine({ chatFn });

    await engine.process(
      "¿Cuánto cuesta cambiar la pantalla del Motorola G32?",
      {
        sessionId: "ctx-a",
      },
    );
    const result = await engine.process("¿Cuánto cuesta el iPhone 15?", {
      sessionId: "ctx-b",
    });

    expect(result.conversationContext).toEqual({
      device: "iPhone 15",
      brand: "iPhone",
      model: "15",
    });
    expect(result.conversationContext.service).toBeUndefined();
  });

  it("delivers quantity/color/material to the planner", async () => {
    const chatFn = vi.fn().mockImplementation(async (prompt) => {
      const normalized = prompt.toLowerCase();
      expect(normalized).toContain("quantity");
      expect(normalized).toContain("llavero");
      expect(normalized).toContain("negro");
      expect(normalized).toContain("pla");
      return JSON.stringify({
        plan: [],
        explanation: "Perfecto.",
      });
    });
    const { engine } = makeEngine({ chatFn });

    const result = await engine.process("Necesito 30 llaveros negros de PLA", {
      sessionId: "ctx-order",
    });

    expect(result.conversationContext.quantity).toBe(30);
    expect(result.conversationContext.color).toBe("negro");
    expect(result.conversationContext.material).toBe("PLA");
    expect(result.conversationContext.product).toBe("Llavero");
  });

  it("carries entities injected from a completed interview into the follow-up turn (P11)", async () => {
    const prompts = [];
    const chatFn = vi.fn().mockImplementation(async (prompt) => {
      prompts.push(prompt);
      const normalized = prompt.toLowerCase();
      expect(normalized).toContain("motorola g32");
      expect(normalized).toContain("reparación");
      expect(normalized).toContain("no enciende");
      return JSON.stringify({
        plan: [
          { tool: "searchPrice", params: { query: "reparacion motorola g32" } },
        ],
        explanation: "Te paso el precio.",
      });
    });
    const { engine } = makeEngine({ chatFn });

    engine.conversationContextOrchestrator.resolveEntities(
      {
        device: "Motorola G32",
        problem: "no enciende",
        clientName: "Juan",
        service: "Reparación",
      },
      "ctx-interview",
    );

    const result = await engine.process("¿Cuánto cuesta?", {
      sessionId: "ctx-interview",
    });

    expect(result.type).toBe("execution");
    expect(result.conversationContext.device).toBe("Motorola G32");
    expect(result.conversationContext.problem).toBe("no enciende");
    expect(result.conversationContext.service).toBe("Reparación");
    expect(result.conversationContext.clientName).toBe("Juan");
    expect(chatFn).toHaveBeenCalledTimes(1);
  });
});
