import { describe, it, expect, vi } from "vitest";
import { ToolExecutor } from "./tool-executor.js";
import { ToolRegistry } from "./tool-registry.js";
import {
  createSearchPriceTool,
  createSearchBusinessInfoTool,
} from "./tools/index.js";
import { BusinessInfoService } from "../business/business-info-service.js";

const HOURS = [
  {
    day_of_week: 1,
    day_name: "Lunes",
    open_time: "09:00",
    close_time: "19:00",
    is_closed: false,
  },
];

function makeRegistry({ priceSearch, infoQuery }) {
  const registry = new ToolRegistry();

  const priceService = {
    search: priceSearch || vi.fn().mockResolvedValue([]),
  };
  registry.register(createSearchPriceTool({ priceService }));

  const businessInfoService = new BusinessInfoService({
    queryFn:
      infoQuery ||
      vi.fn(async (table) => {
        if (table === "hours") return HOURS;
        return [];
      }),
  });
  registry.register(createSearchBusinessInfoTool({ businessInfoService }));

  const executor = new ToolExecutor({ toolRegistry: registry });
  return { registry, executor, priceService, businessInfoService };
}

describe("ToolExecutor.executePlan — reference integration with real tools", () => {
  it("reuses searchPrice result inside searchBusinessInfo input", async () => {
    const priceSearch = vi
      .fn()
      .mockResolvedValue([
        {
          service: "Cambio de pantalla",
          label: "Motorola G32",
          amount: 4200,
          currency: "ARS",
        },
      ]);
    const { executor, priceService, businessInfoService } = makeRegistry({
      priceSearch,
      infoQuery: vi.fn(async (table) => {
        if (table === "hours") return HOURS;
        return [];
      }),
    });
    const searchSpy = vi.spyOn(businessInfoService, "search");

    const result = await executor.executePlan([
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
        input: { query: "$price.result.results.0.service" },
        dependsOn: ["price"],
        parallel: false,
      },
    ]);

    expect(result.results[0].success).toBe(true);
    expect(result.results[0].data.results).toEqual([
      {
        service: "Cambio de pantalla",
        label: "Motorola G32",
        amount: 4200,
        currency: "ARS",
      },
    ]);
    expect(searchSpy).toHaveBeenCalledWith("Cambio de pantalla");
    expect(result.results[1].success).toBe(true);
    expect(result.errors).toEqual([]);
  });

  it("reuses searchBusinessInfo result inside searchPrice input", async () => {
    const priceSearch = vi
      .fn()
      .mockResolvedValue([
        { service: "X", label: "Y", amount: 1, currency: "ARS" },
      ]);
    const { executor, priceService, businessInfoService } = makeRegistry({
      priceSearch,
      infoQuery: vi.fn(async (table) => {
        if (table === "hours") return HOURS;
        return [];
      }),
    });

    const result = await executor.executePlan([
      {
        id: "info",
        tool: "searchBusinessInfo",
        input: { query: "tiempo de reparacion" },
        dependsOn: [],
        parallel: true,
      },
      {
        id: "price",
        tool: "searchPrice",
        input: { query: "$info.result.results.topic" },
        dependsOn: ["info"],
        parallel: false,
      },
    ]);

    expect(result.results[0].success).toBe(true);
    expect(result.results[0].data.results.topic).toBe("repair_time");
    expect(priceService.search).toHaveBeenCalledWith("repair_time");
    expect(result.results[1].success).toBe(true);
    expect(result.errors).toEqual([]);
  });

  it("chains three tools, each reusing data already obtained", async () => {
    const priceSearch = vi
      .fn()
      .mockResolvedValue([
        {
          service: "Cambio de pantalla",
          label: "Motorola G32",
          amount: 4200,
          currency: "ARS",
        },
      ]);
    const { registry, executor } = makeRegistry({ priceSearch });

    const seen = [];
    registry.register({
      name: "summary",
      inputSchema: { device: { type: "string" }, topic: { type: "string" } },
      execute: async (params) => {
        seen.push(params);
        return "ok";
      },
    });

    const result = await executor.executePlan([
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
        input: { query: "tiempo de reparacion" },
        dependsOn: [],
        parallel: true,
      },
      {
        id: "summary",
        tool: "summary",
        input: {
          device: "$price.result.results.0.label",
          topic: "$info.result.results.topic",
        },
        dependsOn: ["price", "info"],
        parallel: false,
      },
    ]);

    expect(seen).toEqual([{ device: "Motorola G32", topic: "repair_time" }]);
    expect(result.results[2].success).toBe(true);
    expect(result.errors).toEqual([]);
  });

  it("keeps legacy plans (no references) behaving exactly as before", async () => {
    const priceSearch = vi
      .fn()
      .mockResolvedValue([
        {
          service: "Cambio de pantalla",
          label: "Estándar",
          amount: 2500,
          currency: "ARS",
        },
      ]);
    const infoQuery = vi.fn(async (table) => {
      if (table === "hours") return HOURS;
      return [];
    });
    const { executor, businessInfoService } = makeRegistry({
      priceSearch,
      infoQuery,
    });
    const searchSpy = vi.spyOn(businessInfoService, "search");

    const result = await executor.executePlan([
      { tool: "searchPrice", input: { query: "pantalla" } },
      { tool: "searchBusinessInfo", input: { query: "horarios" } },
    ]);

    expect(result.results[0].success).toBe(true);
    expect(result.results[1].success).toBe(true);
    expect(searchSpy).toHaveBeenCalledWith("horarios");
    expect(result.errors).toEqual([]);
  });
});
