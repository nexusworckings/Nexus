import { describe, it, expect, vi } from "vitest";
import { NexusAIEngine } from "./nexus-ai-engine.js";
import { ToolRegistry } from "./tool-registry.js";
import { ToolExecutor } from "./tool-executor.js";
import { ProfileManager } from "./profile-manager.js";
import { ContextManager } from "./context-manager.js";
import { PlanningEngine } from "./planning-engine.js";
import { MetricsCollector } from "./observability.js";
import { createSearchProductTool } from "./tools/index.js";
import { ProductService } from "../business/product-service.js";
import { BusinessKnowledgeGraph } from "../business/business-knowledge-graph.js";

const PRODUCTS = [
  {
    id: "p1",
    name: "Filamento PLA 1.75mm",
    brand: "Sunlu",
    category: "Impresión 3D",
    price: 15000,
    currency: "ARS",
    stock: 8,
    is_active: true,
  },
  {
    id: "p2",
    name: "Disco Sólido SSD 500GB",
    brand: "Kingston",
    category: "Almacenamiento",
    price: 68000,
    currency: "ARS",
    stock: 3,
    is_active: true,
  },
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

  const productService = new ProductService({
    repository: { findAll: vi.fn().mockResolvedValue(products) },
    knowledgeGraph: new BusinessKnowledgeGraph({
      sources: { services: [], prices: [], products },
    }),
  });

  registry.register(createSearchProductTool({ productService }));
  pm.get("customer").allowedTools.push("searchProduct");

  const engine = new NexusAIEngine({
    toolRegistry: registry,
    toolExecutor: executor,
    profileManager: pm,
    contextManager: cm,
    planningEngine: pe,
    chatFn,
    metricsCollector: metrics,
  });

  return { engine, productService };
}

describe("searchProduct end-to-end flow", () => {
  it("PlanningEngine selects searchProduct and the tool returns structured data", async () => {
    const chatFn = vi.fn().mockImplementation(async (prompt) => {
      expect(prompt).toContain("searchProduct");
      return JSON.stringify({
        plan: [{ tool: "searchProduct", params: { query: "ssd" } }],
        explanation: "Déjame buscar ese producto.",
      });
    });
    const { engine } = makeEngine({ chatFn });

    const result = await engine.process("¿Tenés SSDs en stock?", {
      sessionId: "product-flow",
    });

    expect(result.type).toBe("execution");
    expect(result.results[0].success).toBe(true);
    expect(result.results[0].data.results).toEqual([
      {
        id: "p2",
        name: "Disco Sólido SSD 500GB",
        brand: "Kingston",
        category: "Almacenamiento",
        price: 68000,
        currency: "ARS",
        stock: 3,
        available: true,
      },
    ]);
  });

  it("resolves an alias (pla -> filamento) through the whole flow", async () => {
    const chatFn = vi.fn().mockResolvedValue(
      JSON.stringify({
        plan: [{ tool: "searchProduct", params: { query: "pla" } }],
        explanation: "Encontré esto.",
      }),
    );
    const { engine } = makeEngine({ chatFn });

    const result = await engine.process("¿Venden filamento?", {
      sessionId: "product-alias",
    });

    expect(result.results[0].success).toBe(true);
    expect(result.results[0].data.results[0].id).toBe("p1");
  });

  it("returns structured empty results when nothing matches (never invents)", async () => {
    const chatFn = vi.fn().mockResolvedValue(
      JSON.stringify({
        plan: [{ tool: "searchProduct", params: { query: "zapatilla" } }],
        explanation: "No encontré nada.",
      }),
    );
    const { engine } = makeEngine({ chatFn });

    const result = await engine.process("¿Tenés zapatillas?", {
      sessionId: "product-none",
    });

    expect(result.results[0].success).toBe(true);
    expect(result.results[0].data.results).toEqual([]);
  });

  it("customer profile allows searchProduct but not admin tools", () => {
    const pm = new ProfileManager();
    const profile = pm.get("customer");
    expect(profile.allowedTools).toContain("searchProduct");
    expect(profile.allowedTools).not.toContain("queryTable");
    expect(profile.allowedTools).not.toContain("deleteRecord");
  });

  it("rejects searchProduct when tool not in profile", async () => {
    const chatFn = vi.fn().mockResolvedValue(
      JSON.stringify({
        plan: [{ tool: "searchProduct", params: { query: "pla" } }],
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
      createSearchProductTool({
        productService: { search: vi.fn() },
      }),
    );

    const result = await engine.process("producto", {
      profile: "limited",
      sessionId: "blocked-product",
    });

    expect(result.results[0].success).toBe(false);
    expect(result.results[0].error).toContain("not allowed");
  });
});
