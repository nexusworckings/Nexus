import { describe, it, expect, vi } from "vitest";
import { PlanningEngine } from "./planning-engine.js";

describe("PlanningEngine", () => {
  it("throws without chatFn", () => {
    expect(() => new PlanningEngine()).toThrow("chatFn is required");
  });

  it("creates a plan with tools", async () => {
    const chatFn = vi.fn().mockResolvedValue(
      JSON.stringify({
        plan: [{ tool: "searchClient", params: { query: "Juan" } }],
        explanation: "Search for Juan",
      }),
    );
    const engine = new PlanningEngine({ chatFn });
    const result = await engine.createPlan("Find Juan", {
      availableTools: [
        {
          name: "searchClient",
          description: "Search clients",
          inputSchema: { query: { type: "string", required: true } },
        },
      ],
    });
    expect(result.plan).toHaveLength(1);
    expect(result.plan[0].tool).toBe("searchClient");
    expect(result.explanation).toBe("Search for Juan");
  });

  it("returns conversational response when no tools needed", async () => {
    const chatFn = vi.fn().mockResolvedValue(
      JSON.stringify({
        plan: [],
        explanation: "Hello! How can I help you today?",
      }),
    );
    const engine = new PlanningEngine({ chatFn });
    const result = await engine.createPlan("Hi", { availableTools: [] });
    expect(result.plan).toHaveLength(0);
    expect(result.explanation).toContain("Hello");
  });

  it("handles invalid JSON response gracefully", async () => {
    const chatFn = vi.fn().mockResolvedValue("this is not json");
    const engine = new PlanningEngine({ chatFn });
    const result = await engine.createPlan("hello");
    expect(result.plan).toHaveLength(0);
  });

  it("passes available tools to chatFn context", async () => {
    const chatFn = vi
      .fn()
      .mockResolvedValue(JSON.stringify({ plan: [], explanation: "ok" }));
    const engine = new PlanningEngine({ chatFn });
    await engine.createPlan("test", {
      availableTools: [{ name: "tool1", description: "desc" }],
    });
    const prompt = chatFn.mock.calls[0][0];
    expect(prompt).toContain("tool1");
    expect(prompt).toContain("desc");
  });

  it("uses systemPrompt in context", async () => {
    const chatFn = vi
      .fn()
      .mockResolvedValue(JSON.stringify({ plan: [], explanation: "ok" }));
    const engine = new PlanningEngine({ chatFn });
    await engine.createPlan("test", { systemPrompt: "Custom prompt" });
    expect(chatFn.mock.calls[0][0]).toContain("Custom prompt");
  });

  it("includes clientId in context", async () => {
    const chatFn = vi
      .fn()
      .mockResolvedValue(JSON.stringify({ plan: [], explanation: "ok" }));
    const engine = new PlanningEngine({ chatFn });
    await engine.createPlan("test", { clientId: "c123" });
    expect(chatFn.mock.calls[0][0]).toContain("c123");
  });

  it("includes workingMemory in context", async () => {
    const chatFn = vi
      .fn()
      .mockResolvedValue(JSON.stringify({ plan: [], explanation: "ok" }));
    const engine = new PlanningEngine({ chatFn });
    await engine.createPlan("test", { workingMemory: { device: "iPhone" } });
    expect(chatFn.mock.calls[0][0]).toContain("iPhone");
  });

  it("handles malformed JSON with partial match", async () => {
    const chatFn = vi
      .fn()
      .mockResolvedValue('Some text { "plan": [] } more text');
    const engine = new PlanningEngine({ chatFn });
    const result = await engine.createPlan("test");
    expect(result.plan).toEqual([]);
  });

  it("returns empty plan on chat error", async () => {
    const chatFn = vi.fn().mockRejectedValue(new Error("API down"));
    const engine = new PlanningEngine({ chatFn });
    const result = await engine.createPlan("test");
    expect(result.plan).toHaveLength(0);
    expect(result.explanation).toContain("API down");
  });

  it("creates multi-tool plan", async () => {
    const chatFn = vi.fn().mockResolvedValue(
      JSON.stringify({
        plan: [
          { tool: "searchClient", params: { query: "Juan" } },
          { tool: "sendWhatsApp", params: { phone: "123", message: "Hola" } },
        ],
        explanation: "Find and message Juan",
      }),
    );
    const engine = new PlanningEngine({ chatFn });
    const result = await engine.createPlan("Send WhatsApp to Juan");
    expect(result.plan).toHaveLength(2);
  });

  it("passes tool params correctly", async () => {
    const chatFn = vi.fn().mockResolvedValue(
      JSON.stringify({
        plan: [{ tool: "search", params: { query: "test", limit: 5 } }],
        explanation: "",
      }),
    );
    const engine = new PlanningEngine({ chatFn });
    const result = await engine.createPlan("test");
    expect(result.plan[0].params.query).toBe("test");
    expect(result.plan[0].params.limit).toBe(5);
  });

  it("returns explanation from plan", async () => {
    const chatFn = vi.fn().mockResolvedValue(
      JSON.stringify({
        plan: [],
        explanation: "Detailed explanation here",
      }),
    );
    const engine = new PlanningEngine({ chatFn });
    const result = await engine.createPlan("test");
    expect(result.explanation).toBe("Detailed explanation here");
  });

  it("works with empty tool list", async () => {
    const chatFn = vi
      .fn()
      .mockResolvedValue(JSON.stringify({ plan: [], explanation: "No tools" }));
    const engine = new PlanningEngine({ chatFn });
    const result = await engine.createPlan("test", { availableTools: [] });
    expect(result.plan).toEqual([]);
  });

  it("emits id, dependsOn and parallel in the steps contract", async () => {
    const chatFn = vi.fn().mockResolvedValue(
      JSON.stringify({
        steps: [
          {
            id: "price",
            tool: "searchPrice",
            input: { query: "x" },
            dependsOn: [],
            parallel: true,
          },
          {
            id: "info",
            tool: "searchBusinessInfo",
            input: { query: "y" },
            dependsOn: [],
            parallel: true,
          },
          {
            id: "appt",
            tool: "createAppointment",
            input: { client: "z" },
            dependsOn: ["price", "info"],
            parallel: false,
          },
        ],
        explanation: "ok",
      }),
    );
    const engine = new PlanningEngine({ chatFn });
    const result = await engine.createPlan("test");

    expect(result.steps[0].id).toBe("price");
    expect(result.steps[0].parallel).toBe(true);
    expect(result.steps[1].dependsOn).toEqual([]);
    expect(result.steps[2].dependsOn).toEqual(["price", "info"]);
    expect(result.steps[2].parallel).toBe(false);
    expect(result.plan[0].params.query).toBe("x");
  });

  it("applies defaults to legacy steps (id, empty dependsOn, parallel false)", async () => {
    const chatFn = vi.fn().mockResolvedValue(
      JSON.stringify({
        steps: [{ tool: "searchPrice", input: { query: "x" } }],
        explanation: "ok",
      }),
    );
    const engine = new PlanningEngine({ chatFn });
    const result = await engine.createPlan("test");

    expect(result.steps[0].id).toBe("step-0");
    expect(result.steps[0].dependsOn).toEqual([]);
    expect(result.steps[0].parallel).toBe(false);
  });

  it("instructs the LLM about dependencies and parallelism", async () => {
    const chatFn = vi
      .fn()
      .mockResolvedValue(JSON.stringify({ steps: [], explanation: "ok" }));
    const engine = new PlanningEngine({ chatFn });
    await engine.createPlan("test");

    const prompt = chatFn.mock.calls[0][0];
    expect(prompt).toContain("dependsOn");
    expect(prompt).toContain('"parallel"');
    expect(prompt).toContain("createAppointment");
  });

  it("does not instruct the LLM to write the final user message", async () => {
    const chatFn = vi
      .fn()
      .mockResolvedValue(JSON.stringify({ plan: [], explanation: "ok" }));
    const engine = new PlanningEngine({ chatFn });
    await engine.createPlan("test");

    const prompt = chatFn.mock.calls[0][0];
    expect(prompt).not.toContain(
      "MUST be the actual message shown to the user",
    );
    expect(prompt).toContain(
      "final user-facing message is written in a separate step",
    );
  });

  it("gives distinct contracts for the commercial tools", async () => {
    const chatFn = vi
      .fn()
      .mockResolvedValue(JSON.stringify({ steps: [], explanation: "ok" }));
    const engine = new PlanningEngine({ chatFn });
    await engine.createPlan("test");

    const prompt = chatFn.mock.calls[0][0];
    expect(prompt).toContain("DISTINCT CONTRACTS");
    for (const tool of [
      "searchProduct",
      "searchStock",
      "searchPrice",
      "searchBusinessInfo",
    ]) {
      expect(prompt).toContain(`"${tool}"`);
    }
  });

  it("steers product-price queries to searchProduct (not searchPrice)", async () => {
    const chatFn = vi
      .fn()
      .mockResolvedValue(JSON.stringify({ steps: [], explanation: "ok" }));
    const engine = new PlanningEngine({ chatFn });
    await engine.createPlan("test");

    const prompt = chatFn.mock.calls[0][0];
    expect(prompt).toContain("NEVER for product prices");
    expect(prompt).toContain("¿cuánto cuesta el PLA?");
    expect(prompt).toContain('use "searchProduct"');
  });

  it("steers service-price queries to searchPrice and NOT searchProduct", async () => {
    const chatFn = vi
      .fn()
      .mockResolvedValue(JSON.stringify({ steps: [], explanation: "ok" }));
    const engine = new PlanningEngine({ chatFn });
    await engine.createPlan("test");

    const prompt = chatFn.mock.calls[0][0];
    expect(prompt).toContain("cambiar la pantalla");
    expect(prompt).toContain('use "searchPrice"');
    expect(prompt).toContain("REPAIR/SERVICE prices");
  });

  it("steers explicit stock queries to searchStock and not price", async () => {
    const chatFn = vi
      .fn()
      .mockResolvedValue(JSON.stringify({ steps: [], explanation: "ok" }));
    const engine = new PlanningEngine({ chatFn });
    await engine.createPlan("test");

    const prompt = chatFn.mock.calls[0][0];
    expect(prompt).toContain('"searchStock": use ONLY');
    expect(prompt).toContain("cuántos pla quedan");
    expect(prompt).toContain("NOT for product prices");
  });
});
