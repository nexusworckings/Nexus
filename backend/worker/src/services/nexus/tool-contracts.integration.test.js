import { describe, it, expect, vi } from "vitest";
import { NexusAIEngine } from "./nexus-ai-engine.js";
import { ToolRegistry } from "./tool-registry.js";
import { ProfileManager } from "./profile-manager.js";
import { evaluateCommercialGate, CLAIM_TYPES } from "./commercial-gate.js";
import {
  createSearchProductTool,
  createSearchStockTool,
  createSearchPriceTool,
} from "./tools/index.js";
import { ProductService } from "../business/product-service.js";
import { StockService } from "../business/stock-service.js";
import { PriceService } from "../business/price-service.js";
import { BusinessKnowledgeGraph } from "../business/business-knowledge-graph.js";

const PRODUCTS = [
  {
    id: "p1",
    name: "Filamento PLA negro 1KG",
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

const SERVICES = [{ id: 10, name: "Cambio de pantalla" }];
const PRICES = [
  {
    id: 1,
    service_id: 10,
    label: "Motorola G32",
    amount: 42000,
    currency: "ARS",
  },
];

function buildEngine({ planFor }) {
  const registry = new ToolRegistry();
  const pm = new ProfileManager();
  const respondFn = vi.fn(async () => ({ message: "RESPONDED" }));
  const chatFn = vi.fn(async () => "ok");
  const planningEngine = {
    createPlan: vi.fn(async (input) => {
      const { tool, input: toolInput } = planFor(input);
      const steps = [
        { id: "s1", tool, input: toolInput, dependsOn: [], parallel: true },
      ];
      return { plan: steps, steps, explanation: "plan" };
    }),
  };

  const knowledgeGraph = new BusinessKnowledgeGraph({
    sources: { services: SERVICES, prices: PRICES, products: PRODUCTS },
  });

  const productService = new ProductService({
    repository: { findAll: vi.fn().mockResolvedValue(PRODUCTS) },
    knowledgeGraph,
  });
  const stockService = new StockService({
    repository: { findAll: vi.fn().mockResolvedValue(PRODUCTS) },
    knowledgeGraph,
  });
  const priceService = new PriceService({
    queryFn: vi.fn(async (table) => {
      if (table === "prices") return PRICES;
      if (table === "services") return SERVICES;
      return [];
    }),
    knowledgeGraph,
  });

  registry.register(createSearchProductTool({ productService }));
  registry.register(createSearchStockTool({ stockService }));
  registry.register(createSearchPriceTool({ priceService }));
  for (const t of ["searchProduct", "searchStock", "searchPrice"]) {
    pm.get("customer").allowedTools.push(t);
  }

  const engine = new NexusAIEngine({
    toolRegistry: registry,
    profileManager: pm,
    planningEngine,
    chatFn,
    respondFn,
    commercialGate: evaluateCommercialGate,
  });

  return { engine, respondFn };
}

describe("P6 — tool contracts end-to-end (producto vs servicio vs stock)", () => {
  it("'¿Cuánto cuesta el PLA?' (producto) -> searchProduct con PRICE", async () => {
    const { engine, respondFn } = buildEngine({
      planFor: () => ({ tool: "searchProduct", input: { query: "pla negro" } }),
    });

    const result = await engine.process("¿Cuánto cuesta el PLA?", {
      profile: "customer",
      sessionId: "p6-product-price",
    });

    expect(result.type).toBe("execution");
    expect(result.results[0].data.results[0].id).toBe("p1");
    expect(respondFn).toHaveBeenCalledTimes(1);
    const args = respondFn.mock.calls[0][0];
    expect(args.commercialPolicy).toContain(CLAIM_TYPES.PRICE);
    expect(args.commercialPolicy).toContain(CLAIM_TYPES.PRODUCT_EXISTENCE);
  });

  it("'¿Cuántos PLA negros quedan?' (stock) -> searchStock con STOCK y sin PRICE", async () => {
    const { engine, respondFn } = buildEngine({
      planFor: () => ({ tool: "searchStock", input: { query: "pla negro" } }),
    });

    const result = await engine.process("¿Cuántos PLA negros quedan?", {
      profile: "customer",
      sessionId: "p6-stock",
    });

    expect(result.results[0].data.results[0]).toEqual({
      id: "p1",
      product: "Filamento PLA negro 1KG",
      stock: 8,
      available: true,
    });
    expect(respondFn).toHaveBeenCalledTimes(1);
    const args = respondFn.mock.calls[0][0];
    expect(args.commercialPolicy).toContain(CLAIM_TYPES.STOCK);
    expect(args.commercialPolicy).not.toContain(CLAIM_TYPES.PRICE);
  });

  it("'¿Cuánto sale cambiar la pantalla?' (servicio) -> searchPrice, NO es producto", async () => {
    const { engine, respondFn } = buildEngine({
      planFor: () => ({
        tool: "searchPrice",
        input: { query: "pantalla motorola g32" },
      }),
    });

    const result = await engine.process("¿Cuánto sale cambiar la pantalla?", {
      profile: "customer",
      sessionId: "p6-service-price",
    });

    expect(result.results[0].data.results[0]).toEqual({
      service: "Cambio de pantalla",
      label: "Motorola G32",
      amount: 42000,
      currency: "ARS",
    });
    expect(respondFn).toHaveBeenCalledTimes(1);
    const args = respondFn.mock.calls[0][0];
    expect(args.commercialPolicy).toContain(CLAIM_TYPES.PRICE);
    expect(args.commercialPolicy).not.toContain(CLAIM_TYPES.PRODUCT_EXISTENCE);
  });

  it("'¿Tenés PLA negro y cuánto sale?' (mixto) -> UNA sola searchProduct basta", async () => {
    const { engine, respondFn } = buildEngine({
      planFor: () => ({ tool: "searchProduct", input: { query: "pla negro" } }),
    });

    const result = await engine.process("¿Tenés PLA negro y cuánto sale?", {
      profile: "customer",
      sessionId: "p6-mixed",
    });

    expect(result.results[0].data.results[0]).toEqual({
      id: "p1",
      name: "Filamento PLA negro 1KG",
      brand: "Sunlu",
      category: "Impresión 3D",
      price: 15000,
      currency: "ARS",
      stock: 8,
      available: true,
    });
    expect(respondFn).toHaveBeenCalledTimes(1);
    const args = respondFn.mock.calls[0][0];
    expect(args.commercialPolicy).toContain(CLAIM_TYPES.PRICE);
    expect(args.commercialPolicy).toContain(CLAIM_TYPES.STOCK);
    expect(args.commercialPolicy).toContain(CLAIM_TYPES.AVAILABILITY);
  });

  it("searchProduct sin resultados -> block (no se inventa evidencia)", async () => {
    const { engine, respondFn } = buildEngine({
      planFor: () => ({ tool: "searchProduct", input: { query: "zapatilla" } }),
    });

    const result = await engine.process("¿Cuánto cuesta la zapatilla?", {
      profile: "customer",
      sessionId: "p6-empty",
    });

    expect(result.explanation).toContain("precio");
    expect(respondFn).not.toHaveBeenCalled();
  });

  it("'¿Cuánto cuesta reparar mi Samsung?' -> searchPrice de servicio, NO producto", async () => {
    const { engine, respondFn } = buildEngine({
      planFor: () => ({
        tool: "searchPrice",
        input: { query: "reparar samsung" },
      }),
    });

    const result = await engine.process("¿Cuánto cuesta reparar mi Samsung?", {
      profile: "customer",
      sessionId: "p6-repair-price",
    });

    expect(result.results[0].data.results).toEqual([]);
    expect(result.explanation).toContain("precio");
    expect(respondFn).not.toHaveBeenCalled();
  });
});
