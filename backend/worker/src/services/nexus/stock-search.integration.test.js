import { describe, it, expect, vi } from "vitest";
import { NexusAIEngine } from "./nexus-ai-engine.js";
import { ToolRegistry } from "./tool-registry.js";
import { ToolExecutor } from "./tool-executor.js";
import { ProfileManager } from "./profile-manager.js";
import { ContextManager } from "./context-manager.js";
import { PlanningEngine } from "./planning-engine.js";
import { MetricsCollector } from "./observability.js";
import { createSearchStockTool } from "./tools/index.js";
import { StockService } from "../business/stock-service.js";
import { BusinessKnowledgeGraph } from "../business/business-knowledge-graph.js";

const PRODUCTS = [
  { id: "p1", name: "Filamento PLA 1.75mm", stock: 8, is_active: true },
  { id: "p2", name: "Disco Solido SSD 500GB", stock: 3, is_active: true },
  { id: "p3", name: "Memoria RAM 8GB", stock: 0, is_active: true },
];

function makeEngine({ chatFn, products = PRODUCTS }) {
  const registry = new ToolRegistry();
  const metrics = new MetricsCollector();
  const executor = new ToolExecutor({
    toolRegistry: registry,
    metricsCollector: metrics,
  });
  const pm = new ProfileManager();
  const cm = new ContextManager();
  const pe = new PlanningEngine({ chatFn });

  const stockService = new StockService({
    repository: { findAll: vi.fn().mockResolvedValue(products) },
    knowledgeGraph: new BusinessKnowledgeGraph({
      sources: { services: [], prices: [], products },
    }),
  });

  registry.register(createSearchStockTool({ stockService }));
  pm.get("customer").allowedTools.push("searchStock");

  const engine = new NexusAIEngine({
    toolRegistry: registry,
    toolExecutor: executor,
    profileManager: pm,
    contextManager: cm,
    planningEngine: pe,
    chatFn,
    metricsCollector: metrics,
  });

  return { engine, stockService };
}

describe("searchStock end-to-end flow", () => {
  it("PlanningEngine selects searchStock and the tool returns structured data", async () => {
    const chatFn = vi.fn().mockImplementation(async (prompt) => {
      expect(prompt).toContain("searchStock");
      return JSON.stringify({
        plan: [{ tool: "searchStock", params: { query: "ssd" } }],
        explanation: "Déjame revisar el stock.",
      });
    });
    const { engine } = makeEngine({ chatFn });

    const result = await engine.process("¿Tienen SSDs en stock?", {
      sessionId: "stock-flow",
    });

    expect(result.type).toBe("execution");
    expect(result.results[0].success).toBe(true);
    expect(result.results[0].data.results).toEqual([
      {
        id: "p2",
        product: "Disco Solido SSD 500GB",
        stock: 3,
        available: true,
      },
    ]);
  });

  it("resolves an alias (pla -> filamento) through the whole flow", async () => {
    const chatFn = vi.fn().mockResolvedValue(
      JSON.stringify({
        plan: [{ tool: "searchStock", params: { query: "pla" } }],
        explanation: "Encontré esto.",
      }),
    );
    const { engine } = makeEngine({ chatFn });

    const result = await engine.process("¿Queda filamento?", {
      sessionId: "stock-alias",
    });

    expect(result.results[0].success).toBe(true);
    expect(result.results[0].data.results[0].id).toBe("p1");
  });

  it("returns structured empty results when nothing matches (never invents)", async () => {
    const chatFn = vi.fn().mockResolvedValue(
      JSON.stringify({
        plan: [{ tool: "searchStock", params: { query: "zapatilla" } }],
        explanation: "No encontré nada.",
      }),
    );
    const { engine } = makeEngine({ chatFn });

    const result = await engine.process("¿Hay zapatillas?", {
      sessionId: "stock-none",
    });

    expect(result.results[0].success).toBe(true);
    expect(result.results[0].data.results).toEqual([]);
  });

  it("reports out-of-stock products with available false but still returns them", async () => {
    const chatFn = vi.fn().mockResolvedValue(
      JSON.stringify({
        plan: [{ tool: "searchStock", params: { query: "memoria ram 8gb" } }],
        explanation: "Ese producto no tiene stock.",
      }),
    );
    const { engine } = makeEngine({ chatFn });

    const result = await engine.process("¿Quedan memorias ram?", {
      sessionId: "stock-zero",
    });

    expect(result.results[0].success).toBe(true);
    expect(result.results[0].data.results[0]).toEqual({
      id: "p3",
      product: "Memoria RAM 8GB",
      stock: 0,
      available: false,
    });
  });

  it("customer profile allows searchStock but not admin tools", () => {
    const pm = new ProfileManager();
    const profile = pm.get("customer");
    expect(profile.allowedTools).toContain("searchStock");
    expect(profile.allowedTools).not.toContain("queryTable");
    expect(profile.allowedTools).not.toContain("deleteRecord");
  });

  it("rejects searchStock when tool not in profile", async () => {
    const chatFn = vi.fn().mockResolvedValue(
      JSON.stringify({
        plan: [{ tool: "searchStock", params: { query: "pla" } }],
        explanation: "x",
      }),
    );
    const registry = new ToolRegistry();
    const pm = new ProfileManager();
    pm.register({
      id: "limited",
      systemPrompt: "limited",
      allowedTools: ["searchClient"],
      permissions: { canModify: false, canCreate: false, canDelete: false },
    });
    const engine = new NexusAIEngine({
      toolRegistry: registry,
      profileManager: pm,
      chatFn,
    });
    registry.register(
      createSearchStockTool({
        stockService: { search: vi.fn() },
      }),
    );

    const result = await engine.process("producto", {
      profile: "limited",
      sessionId: "blocked-stock",
    });

    expect(result.results[0].success).toBe(false);
    expect(result.results[0].error).toContain("not allowed");
  });
});
