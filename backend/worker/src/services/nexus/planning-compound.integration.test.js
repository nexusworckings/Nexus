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

function makeEngine({ chatFn, onQuery } = {}) {
  const registry = new ToolRegistry();
  const metrics = new MetricsCollector();
  const executor = new ToolExecutor({
    toolRegistry: registry,
    metricsCollector: metrics,
  });
  const pm = new ProfileManager();
  const cm = new ContextManager();
  const pe = new PlanningEngine({ chatFn });

  const queryFn =
    onQuery ||
    vi.fn(async (table) => {
      if (table === "prices") {
        return [
          {
            id: "p1",
            service_id: "s1",
            label: "Cambio de pantalla Motorola G32",
            amount: 45000,
            currency: "ARS",
            is_active: "true",
          },
        ];
      }
      if (table === "services") {
        return [{ id: "s1", name: "Cambio de pantalla" }];
      }
      if (table === "faqs") {
        return [
          {
            question: "¿Cuánto tarda una reparación?",
            answer: "Depende del repuesto, suele ser de 2 a 5 días hábiles.",
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

  return { engine, queryFn };
}

describe("PlanningEngine compound (multi-tool) plans", () => {
  it("executes a composite plan emitted with steps/input format", async () => {
    const chatFn = vi.fn().mockResolvedValue(
      JSON.stringify({
        steps: [
          { tool: "searchPrice", input: { query: "pantalla motorola g32" } },
          {
            tool: "searchBusinessInfo",
            input: { query: "tiempo de reparacion" },
          },
        ],
        explanation: "Te paso el precio y el tiempo de reparación.",
      }),
    );
    const { engine } = makeEngine({ chatFn });

    const result = await engine.process(
      "¿Cuánto cuesta cambiar la pantalla y cuánto tarda?",
      {
        sessionId: "compound-1",
      },
    );

    expect(result.type).toBe("execution");
    expect(result.steps).toHaveLength(2);
    expect(result.plan).toHaveLength(2);
    expect(result.results).toHaveLength(2);
    expect(result.results[0].toolName).toBe("searchPrice");
    expect(result.results[0].success).toBe(true);
    expect(result.results[0].data.results[0].amount).toBe(45000);
    expect(result.results[1].toolName).toBe("searchBusinessInfo");
    expect(result.results[1].success).toBe(true);
    expect(result.results[1].data.results.topic).toBe("repair_time");
    expect(result.errors).toEqual([]);
  });

  it("runs both tools and records both in context", async () => {
    const chatFn = vi.fn().mockResolvedValue(
      JSON.stringify({
        steps: [
          { tool: "searchPrice", input: { query: "pantalla motorola g32" } },
          { tool: "searchBusinessInfo", input: { query: "horarios" } },
        ],
        explanation: "Consultando precio y horarios.",
      }),
    );
    const { engine } = makeEngine({ chatFn });

    await engine.process("precio y horarios", { sessionId: "compound-ctx" });
    const session = engine.contextManager.getSession("compound-ctx");

    expect(session.toolHistory).toHaveLength(2);
    expect(session.toolHistory[0].toolName).toBe("searchPrice");
    expect(session.toolHistory[1].toolName).toBe("searchBusinessInfo");
  });

  it("still executes the legacy plan/params format end to end", async () => {
    const chatFn = vi.fn().mockResolvedValue(
      JSON.stringify({
        plan: [
          { tool: "searchPrice", params: { query: "pantalla motorola g32" } },
          { tool: "searchBusinessInfo", params: { query: "horarios" } },
        ],
        explanation: "Consultando.",
      }),
    );
    const { engine } = makeEngine({ chatFn });

    const result = await engine.process("precio y horarios", {
      sessionId: "compound-legacy",
    });

    expect(result.type).toBe("execution");
    expect(result.steps).toHaveLength(2);
    expect(result.results).toHaveLength(2);
    expect(result.results[0].success).toBe(true);
    expect(result.results[1].success).toBe(true);
  });

  it("returns conversational response when the plan is empty", async () => {
    const chatFn = vi.fn().mockResolvedValue(
      JSON.stringify({
        steps: [],
        explanation: "¡Hola! ¿En qué puedo ayudarte?",
      }),
    );
    const { engine } = makeEngine({ chatFn });

    const result = await engine.process("Hola", {
      sessionId: "compound-empty",
    });

    expect(result.type).toBe("conversation");
    expect(result.message).toBe("¡Hola! ¿En qué puedo ayudarte?");
  });

  it("blocks a disallowed step but still runs the allowed one", async () => {
    const chatFn = vi.fn().mockResolvedValue(
      JSON.stringify({
        steps: [
          { tool: "searchPrice", input: { query: "pantalla motorola g32" } },
          { tool: "searchBusinessInfo", input: { query: "horarios" } },
        ],
        explanation: "Consultando.",
      }),
    );
    const { engine } = makeEngine({ chatFn });
    engine.profileManager.get("customer").allowedTools = ["searchPrice"];

    const result = await engine.process("precio y horarios", {
      sessionId: "compound-blocked",
    });

    expect(result.type).toBe("execution");
    expect(result.results[0].success).toBe(true);
    expect(result.results[1].success).toBe(false);
    expect(result.results[1].error).toContain("not allowed");
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0].toolName).toBe("searchBusinessInfo");
  });

  it("surfaces per-step errors in the response without aborting", async () => {
    const chatFn = vi.fn().mockResolvedValue(
      JSON.stringify({
        steps: [
          { tool: "searchBusinessInfo", input: { query: "horarios" } },
          { tool: "searchPrice", input: { query: "pantalla motorola g32" } },
        ],
        explanation: "Consultando.",
      }),
    );
    const onQuery = vi.fn(async (table) => {
      if (table === "prices" || table === "services")
        throw new Error("db down");
      return [];
    });
    const { engine } = makeEngine({ chatFn, onQuery });

    const result = await engine.process("precio y horarios", {
      sessionId: "compound-errors",
    });

    expect(result.type).toBe("execution");
    expect(result.results[0].success).toBe(true);
    expect(result.results[1].success).toBe(false);
    expect(result.results[1].error).toBe("db down");
    expect(result.errors).toHaveLength(1);
  });

  it("executes a dependent plan in dependency order", async () => {
    const callOrder = [];
    const onQuery = vi.fn(async (table) => {
      callOrder.push(table);
      if (table === "prices") {
        return [
          {
            id: "p1",
            service_id: "s1",
            label: "Cambio de pantalla Motorola G32",
            amount: 45000,
            currency: "ARS",
            is_active: "true",
          },
        ];
      }
      if (table === "services")
        return [{ id: "s1", name: "Cambio de pantalla" }];
      if (table === "hours") return [];
      return [];
    });
    const chatFn = vi.fn().mockResolvedValue(
      JSON.stringify({
        steps: [
          {
            id: "price",
            tool: "searchPrice",
            input: { query: "pantalla motorola g32" },
            dependsOn: [],
            parallel: true,
          },
          {
            id: "info",
            tool: "searchBusinessInfo",
            input: { query: "horarios" },
            dependsOn: ["price"],
            parallel: false,
          },
        ],
        explanation: "Consultando.",
      }),
    );
    const { engine } = makeEngine({ chatFn, onQuery });

    const result = await engine.process("precio y horarios", {
      sessionId: "compound-dep",
    });

    expect(result.type).toBe("execution");
    expect(result.results[0].toolName).toBe("searchPrice");
    expect(result.results[1].toolName).toBe("searchBusinessInfo");
    expect(callOrder[callOrder.length - 1]).toBe("hours");
    expect(callOrder.indexOf("hours")).toBeGreaterThan(
      callOrder.indexOf("prices"),
    );
  });

  it("executes parallel independent steps declared with parallel:true", async () => {
    const chatFn = vi.fn().mockResolvedValue(
      JSON.stringify({
        steps: [
          {
            id: "price",
            tool: "searchPrice",
            input: { query: "pantalla motorola g32" },
            dependsOn: [],
            parallel: true,
          },
          {
            id: "info",
            tool: "searchBusinessInfo",
            input: { query: "horarios" },
            dependsOn: [],
            parallel: true,
          },
        ],
        explanation: "Te paso precio y horarios.",
      }),
    );
    const { engine } = makeEngine({ chatFn });

    const result = await engine.process("precio y horarios", {
      sessionId: "compound-parallel",
    });

    expect(result.type).toBe("execution");
    expect(result.steps).toHaveLength(2);
    expect(result.results[0].success).toBe(true);
    expect(result.results[1].success).toBe(true);
    expect(result.errors).toEqual([]);
  });

  it("surfaces an unknown-dependency error and keeps the rest of the plan", async () => {
    const chatFn = vi.fn().mockResolvedValue(
      JSON.stringify({
        steps: [
          {
            id: "price",
            tool: "searchPrice",
            input: { query: "pantalla motorola g32" },
            dependsOn: [],
            parallel: true,
          },
          {
            id: "info",
            tool: "searchBusinessInfo",
            input: { query: "horarios" },
            dependsOn: ["ghost"],
            parallel: false,
          },
        ],
        explanation: "Consultando.",
      }),
    );
    const { engine } = makeEngine({ chatFn });

    const result = await engine.process("precio y horarios", {
      sessionId: "compound-ghost",
    });

    expect(result.type).toBe("execution");
    expect(result.results[0].success).toBe(true);
    expect(result.results[1].success).toBe(false);
    expect(result.results[1].error).toContain("unresolved step");
    expect(result.errors).toHaveLength(1);
  });
});
