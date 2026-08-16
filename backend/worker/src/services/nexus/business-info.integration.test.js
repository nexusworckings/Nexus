import { describe, it, expect, vi } from "vitest";
import { NexusAIEngine } from "./nexus-ai-engine.js";
import { ToolRegistry } from "./tool-registry.js";
import { ToolExecutor } from "./tool-executor.js";
import { ProfileManager } from "./profile-manager.js";
import { ContextManager } from "./context-manager.js";
import { PlanningEngine } from "./planning-engine.js";
import { MetricsCollector } from "./observability.js";
import { createSearchBusinessInfoTool } from "./tools/index.js";
import { BusinessInfoService } from "../business/business-info-service.js";

const HOURS = [
  {
    day_of_week: 0,
    day_name: "Domingo",
    open_time: null,
    close_time: null,
    is_closed: true,
  },
  {
    day_of_week: 1,
    day_name: "Lunes",
    open_time: "09:00",
    close_time: "19:00",
    is_closed: false,
  },
  {
    day_of_week: 2,
    day_name: "Martes",
    open_time: "09:00",
    close_time: "19:00",
    is_closed: false,
  },
  {
    day_of_week: 3,
    day_name: "Miércoles",
    open_time: "09:00",
    close_time: "19:00",
    is_closed: false,
  },
  {
    day_of_week: 4,
    day_name: "Jueves",
    open_time: "09:00",
    close_time: "19:00",
    is_closed: false,
  },
  {
    day_of_week: 5,
    day_name: "Viernes",
    open_time: "09:00",
    close_time: "19:00",
    is_closed: false,
  },
  {
    day_of_week: 6,
    day_name: "Sábado",
    open_time: "10:00",
    close_time: "14:00",
    is_closed: false,
  },
];

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
      if (table === "hours") return HOURS;
      if (table === "address") return [];
      if (table === "phones") return [];
      if (table === "emails") return [];
      if (table === "social_media") return [];
      if (table === "warranties") return [];
      if (table === "faqs") return [];
      return [];
    });

  const businessInfoService = new BusinessInfoService({ queryFn });
  registry.register(createSearchBusinessInfoTool({ businessInfoService }));
  pm.get("customer").allowedTools.push("searchBusinessInfo");

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

describe("searchBusinessInfo end-to-end flow", () => {
  it("PlanningEngine selects searchBusinessInfo and tool returns structured business info", async () => {
    const chatFn = vi.fn().mockImplementation(async (prompt) => {
      expect(prompt).toContain("searchBusinessInfo");
      return JSON.stringify({
        plan: [{ tool: "searchBusinessInfo", params: { query: "horarios" } }],
        explanation: "Déjame consultar los horarios.",
      });
    });
    const { engine } = makeEngine({ chatFn });

    const result = await engine.process("¿Cuáles son sus horarios?", {
      sessionId: "business-flow",
    });

    expect(result.type).toBe("execution");
    expect(result.results[0].success).toBe(true);
    expect(result.results[0].data.results).toEqual({
      topic: "business_hours",
      value: [
        { day: "Domingo", open: null, close: null, closed: true },
        { day: "Lunes", open: "09:00", close: "19:00", closed: false },
        { day: "Martes", open: "09:00", close: "19:00", closed: false },
        { day: "Miércoles", open: "09:00", close: "19:00", closed: false },
        { day: "Jueves", open: "09:00", close: "19:00", closed: false },
        { day: "Viernes", open: "09:00", close: "19:00", closed: false },
        { day: "Sábado", open: "10:00", close: "14:00", closed: false },
      ],
    });
  });

  it("returns structured data for address query", async () => {
    const onQuery = vi.fn(async (table) => {
      if (table === "address")
        return [
          {
            street: "Av. General Acha",
            number: "123",
            city: "San Juan",
            province: "San Juan",
            postal_code: "J5400",
            country: "Argentina",
            maps_url: "https://goo.gl/maps/test",
            additional_info: "",
          },
        ];
      if (table === "faqs") return [];
      return [];
    });
    const chatFn = vi.fn().mockResolvedValue(
      JSON.stringify({
        plan: [{ tool: "searchBusinessInfo", params: { query: "dirección" } }],
        explanation: "Consultando dirección.",
      }),
    );
    const { engine } = makeEngine({ chatFn, onQuery });

    const result = await engine.process("¿Dónde están?", {
      sessionId: "addr-flow",
    });

    expect(result.results[0].data.results.topic).toBe("address");
    expect(result.results[0].data.results.value.street).toBe(
      "Av. General Acha",
    );
  });

  it("returns empty results when nothing matches (never invents)", async () => {
    const chatFn = vi.fn().mockResolvedValue(
      JSON.stringify({
        plan: [{ tool: "searchBusinessInfo", params: { query: "horarios" } }],
        explanation: "Buscando información.",
      }),
    );
    const onQuery = vi.fn().mockResolvedValue([]);
    const { engine } = makeEngine({ chatFn, onQuery });

    const result = await engine.process("horarios", { sessionId: "empty-biz" });

    expect(result.results[0].success).toBe(true);
    expect(result.results[0].data.results).toEqual({
      topic: "business_hours",
      value: [],
    });
  });

  it("customer profile allows searchBusinessInfo but not admin tools", () => {
    const pm = new ProfileManager();
    const profile = pm.get("customer");
    expect(profile.allowedTools).toContain("searchBusinessInfo");
    expect(profile.allowedTools).not.toContain("queryTable");
    expect(profile.allowedTools).not.toContain("deleteRecord");
    expect(profile.allowedTools).not.toContain("updateSingle");
  });

  it("rejects searchBusinessInfo when tool not in profile", async () => {
    const chatFn = vi.fn().mockResolvedValue(
      JSON.stringify({
        plan: [{ tool: "searchBusinessInfo", params: { query: "horarios" } }],
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
    const businessInfoService = new BusinessInfoService({
      queryFn: vi.fn().mockResolvedValue([]),
    });
    registry.register(createSearchBusinessInfoTool({ businessInfoService }));

    const result = await engine.process("horarios", {
      profile: "limited",
      sessionId: "blocked-biz",
    });

    expect(result.results[0].success).toBe(false);
    expect(result.results[0].error).toContain("not allowed");
  });
});
