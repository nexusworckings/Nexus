import { describe, it, expect, vi } from "vitest";
import { NexusAIEngine } from "./nexus-ai-engine.js";
import { evaluateCommercialGate, CLAIM_TYPES } from "./commercial-gate.js";

function buildEngine({ steps, resultsData }) {
  const respondFn = vi.fn(async () => ({ message: "RESPONDED" }));
  const planningEngine = {
    createPlan: vi.fn(async () => ({
      plan: steps.map((s) => ({ tool: s.tool, params: s.input })),
      steps,
      explanation: "plan",
    })),
  };
  const engine = new NexusAIEngine({
    chatFn: vi.fn(async () => "ok"),
    planningEngine,
    respondFn,
    commercialGate: evaluateCommercialGate,
  });
  engine.toolRegistry.register({
    name: "searchProduct",
    description: "test",
    inputSchema: { query: { type: "string", required: true } },
    async execute() {
      return resultsData;
    },
  });
  engine.profileManager.get("customer").allowedTools.push("searchProduct");
  return { engine, respondFn };
}

describe("NexusAIEngine + commercial gate (P2)", () => {
  it("plan vacío + consulta de precio -> bloquea sin llamar al respondFn", async () => {
    const respondFn = vi.fn(async () => ({ message: "RESPONDED" }));
    const planningEngine = {
      createPlan: vi.fn(async () => ({
        plan: [],
        steps: [],
        explanation: "no plan",
      })),
    };
    const engine = new NexusAIEngine({
      chatFn: vi.fn(async () => "ok"),
      planningEngine,
      respondFn,
      commercialGate: evaluateCommercialGate,
    });

    const result = await engine.process("¿Cuánto sale el PLA?", {
      profile: "customer",
      sessionId: "s-price-empty",
    });

    expect(result.type).toBe("conversation");
    expect(result.message).toContain("precio");
    expect(respondFn).not.toHaveBeenCalled();
  });

  it("searchProduct con precio -> permite y entrega la política comercial al respondFn", async () => {
    const { engine, respondFn } = buildEngine({
      steps: [
        {
          id: "s1",
          tool: "searchProduct",
          input: { query: "pla" },
          dependsOn: [],
          parallel: true,
        },
      ],
      resultsData: {
        results: [
          { id: "p1", name: "PLA", price: 8500, currency: "ARS", stock: 4 },
        ],
      },
    });

    const result = await engine.process("¿Cuánto sale el PLA?", {
      profile: "customer",
      sessionId: "s-price-ok",
    });

    expect(result.type).toBe("execution");
    expect(result.explanation).toBe("RESPONDED");
    expect(respondFn).toHaveBeenCalledTimes(1);
    const args = respondFn.mock.calls[0][0];
    expect(args.commercialPolicy).toBeTruthy();
    expect(args.commercialPolicy).toContain(CLAIM_TYPES.PRICE);
  });

  it("searchProduct sin resultados -> bloquea (no hay evidencia)", async () => {
    const { engine, respondFn } = buildEngine({
      steps: [
        {
          id: "s1",
          tool: "searchProduct",
          input: { query: "pla" },
          dependsOn: [],
          parallel: true,
        },
      ],
      resultsData: { results: [] },
    });

    const result = await engine.process("¿Cuánto sale el PLA?", {
      profile: "customer",
      sessionId: "s-price-empty-results",
    });

    expect(result.explanation).toContain("precio");
    expect(respondFn).not.toHaveBeenCalled();
  });

  it("caso mixto: producto sin precio -> permite generar pero la política no otorga PRICE", async () => {
    const { engine, respondFn } = buildEngine({
      steps: [
        {
          id: "s1",
          tool: "searchProduct",
          input: { query: "pla" },
          dependsOn: [],
          parallel: true,
        },
      ],
      resultsData: {
        results: [
          { id: "p1", name: "PLA", description: "material termopl\u00e1stico" },
        ],
      },
    });

    await engine.process("¿Qué es el PLA y cuánto sale?", {
      profile: "customer",
      sessionId: "s-mixed",
    });

    expect(respondFn).toHaveBeenCalledTimes(1);
    const args = respondFn.mock.calls[0][0];
    expect(args.commercialPolicy).toBeTruthy();
    expect(args.commercialPolicy).not.toContain(CLAIM_TYPES.PRICE);
    expect(args.commercialPolicy).toContain(CLAIM_TYPES.PRODUCT_EXISTENCE);
  });

  it("sin gate configurado, el comportamiento queda intacto", async () => {
    const respondFn = vi.fn(async () => ({ message: "HOLA" }));
    const planningEngine = {
      createPlan: vi.fn(async () => ({
        plan: [],
        steps: [],
        explanation: "plan",
      })),
    };
    const engine = new NexusAIEngine({
      chatFn: vi.fn(async () => "ok"),
      planningEngine,
      respondFn,
    });

    const result = await engine.process("¿Cuánto sale el PLA?", {
      profile: "customer",
      sessionId: "s-no-gate",
    });

    expect(result.type).toBe("conversation");
    expect(result.message).toBe("HOLA");
    expect(respondFn).toHaveBeenCalledTimes(1);
  });
});
