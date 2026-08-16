import { describe, it, expect, vi } from "vitest";
import { ToolRegistry } from "../tool-registry.js";
import { registerTools } from "./index.js";

function makeDeps(overrides = {}) {
  return {
    query: overrides.query || vi.fn().mockResolvedValue([]),
    update: overrides.update || vi.fn().mockResolvedValue(undefined),
    insert: overrides.insert || vi.fn().mockResolvedValue({ id: "new-id" }),
    delete: overrides.delete || vi.fn().mockResolvedValue(undefined),
    webSearch: overrides.webSearch,
    formatSearchResults: overrides.formatSearchResults,
    whatsappChannel: overrides.whatsappChannel,
    contextManager: overrides.contextManager,
    crypto: overrides.crypto,
    priceService: overrides.priceService,
    businessInfoService: overrides.businessInfoService,
    productService: overrides.productService,
    stockService: overrides.stockService,
  };
}

describe("registerTools", () => {
  it("registers all tools", () => {
    const registry = new ToolRegistry();
    registerTools(registry, makeDeps());
    expect(registry.count()).toBe(19);
  });

  it("searchClient tool exists", () => {
    const registry = new ToolRegistry();
    registerTools(registry, makeDeps());
    expect(registry.exists("searchClient")).toBe(true);
  });

  it("searchClient executes query", async () => {
    const query = vi.fn().mockResolvedValue([{ id: 1, name: "Juan" }]);
    const registry = new ToolRegistry();
    registerTools(registry, makeDeps({ query }));
    const tool = registry.get("searchClient");
    const result = await tool.execute({ query: "Juan" });
    expect(query).toHaveBeenCalledWith("clients", { search: "Juan" });
    expect(result.results).toHaveLength(1);
  });

  it("searchClient requires query param", async () => {
    const registry = new ToolRegistry();
    registerTools(registry, makeDeps());
    const tool = registry.get("searchClient");
    await expect(tool.execute({})).rejects.toThrow("query is required");
  });

  it("updateRepairStatus tool exists and executes", async () => {
    const update = vi.fn().mockResolvedValue(undefined);
    const registry = new ToolRegistry();
    registerTools(registry, makeDeps({ update }));
    const tool = registry.get("updateRepairStatus");
    const result = await tool.execute({ id: "r1", status: "completed" });
    expect(update).toHaveBeenCalledWith("repairs", "r1", {
      status: "completed",
    });
    expect(result.status).toBe("completed");
  });

  it("sendWhatsApp tool exists", () => {
    const registry = new ToolRegistry();
    registerTools(registry, makeDeps());
    expect(registry.exists("sendWhatsApp")).toBe(true);
  });

  it("sendWhatsApp simulates when no channel", async () => {
    const registry = new ToolRegistry();
    registerTools(registry, makeDeps());
    const tool = registry.get("sendWhatsApp");
    const result = await tool.execute({ phone: "123", message: "Hola" });
    expect(result.simulated).toBe(true);
  });

  it("sendWhatsApp uses channel when available", async () => {
    const whatsappChannel = {
      send: vi.fn().mockResolvedValue({ success: true }),
    };
    const registry = new ToolRegistry();
    registerTools(registry, makeDeps({ whatsappChannel }));
    const tool = registry.get("sendWhatsApp");
    await tool.execute({ phone: "123", message: "Hola" });
    expect(whatsappChannel.send).toHaveBeenCalledWith({
      phone: "123",
      message: "Hola",
    });
  });

  it("createBudget tool exists and executes", async () => {
    const insert = vi.fn().mockResolvedValue({ id: "b1" });
    const registry = new ToolRegistry();
    registerTools(registry, makeDeps({ insert }));
    const tool = registry.get("createBudget");
    const result = await tool.execute({ clientId: "c1", amount: 500 });
    expect(insert).toHaveBeenCalled();
    expect(result.clientId).toBe("c1");
  });

  it("createClient tool exists and executes", async () => {
    const insert = vi.fn().mockResolvedValue({ id: "c-new" });
    const registry = new ToolRegistry();
    registerTools(registry, makeDeps({ insert }));
    const tool = registry.get("createClient");
    const result = await tool.execute({ name: "Pedro", phone: "264555" });
    expect(insert).toHaveBeenCalled();
    expect(result.name).toBe("Pedro");
  });

  it("getConversation returns history via contextManager", async () => {
    const cm = {
      getSession: vi.fn().mockReturnValue({
        conversationHistory: [{ role: "user", content: "Hi" }],
      }),
    };
    const registry = new ToolRegistry();
    registerTools(registry, makeDeps({ contextManager: cm }));
    const tool = registry.get("getConversation");
    const result = await tool.execute({ sessionId: "s1" });
    expect(result.history).toHaveLength(1);
  });

  it("searchInternet tool uses webSearch when available", async () => {
    const webSearch = vi.fn().mockResolvedValue({ results: [] });
    const registry = new ToolRegistry();
    registerTools(registry, makeDeps({ webSearch }));
    const tool = registry.get("searchInternet");
    await tool.execute({ query: "test" });
    expect(webSearch).toHaveBeenCalledWith("test");
  });

  it("searchNotifications tool exists", () => {
    const registry = new ToolRegistry();
    registerTools(registry, makeDeps());
    expect(registry.exists("searchNotifications")).toBe(true);
  });

  it("createRepair tool exists", () => {
    const registry = new ToolRegistry();
    registerTools(registry, makeDeps());
    expect(registry.exists("createRepair")).toBe(true);
  });

  it("searchPrice tool exists", () => {
    const registry = new ToolRegistry();
    registerTools(registry, makeDeps());
    expect(registry.exists("searchPrice")).toBe(true);
  });

  it("searchPrice executes via priceService only", async () => {
    const priceService = {
      search: vi.fn().mockResolvedValue([
        {
          service: "Cambio de pantalla",
          label: "Motorola G32",
          amount: 42000,
          currency: "ARS",
        },
      ]),
    };
    const registry = new ToolRegistry();
    registerTools(registry, makeDeps({ priceService }));
    const tool = registry.get("searchPrice");
    const result = await tool.execute({ query: "pantalla motorola g32" });

    expect(priceService.search).toHaveBeenCalledWith("pantalla motorola g32");
    expect(result.results).toHaveLength(1);
    expect(result.results[0]).toEqual({
      service: "Cambio de pantalla",
      label: "Motorola G32",
      amount: 42000,
      currency: "ARS",
    });
  });

  it("searchPrice requires query param", async () => {
    const priceService = { search: vi.fn() };
    const registry = new ToolRegistry();
    registerTools(registry, makeDeps({ priceService }));
    await expect(registry.get("searchPrice").execute({})).rejects.toThrow(
      "query is required",
    );
  });

  it("searchPrice requires priceService", async () => {
    const registry = new ToolRegistry();
    registerTools(registry, makeDeps());
    await expect(
      registry.get("searchPrice").execute({ query: "pantalla" }),
    ).rejects.toThrow("priceService is required");
  });

  it("searchBusinessInfo tool exists", () => {
    const registry = new ToolRegistry();
    registerTools(registry, makeDeps());
    expect(registry.exists("searchBusinessInfo")).toBe(true);
  });

  it("searchBusinessInfo executes via businessInfoService", async () => {
    const businessInfoService = {
      search: vi.fn().mockResolvedValue({
        topic: "business_hours",
        value: [{ day: "Lunes", open: "09:00", close: "19:00", closed: false }],
      }),
    };
    const registry = new ToolRegistry();
    registerTools(registry, makeDeps({ businessInfoService }));
    const tool = registry.get("searchBusinessInfo");
    const result = await tool.execute({ query: "horarios" });

    expect(businessInfoService.search).toHaveBeenCalledWith("horarios");
    expect(result.results).toEqual({
      topic: "business_hours",
      value: [{ day: "Lunes", open: "09:00", close: "19:00", closed: false }],
    });
  });

  it("searchBusinessInfo requires query param", async () => {
    const businessInfoService = { search: vi.fn() };
    const registry = new ToolRegistry();
    registerTools(registry, makeDeps({ businessInfoService }));
    await expect(
      registry.get("searchBusinessInfo").execute({}),
    ).rejects.toThrow("query is required");
  });

  it("searchBusinessInfo requires businessInfoService", async () => {
    const registry = new ToolRegistry();
    registerTools(registry, makeDeps());
    await expect(
      registry.get("searchBusinessInfo").execute({ query: "horarios" }),
    ).rejects.toThrow("businessInfoService is required");
  });

  it("searchProduct tool exists", () => {
    const registry = new ToolRegistry();
    registerTools(registry, makeDeps());
    expect(registry.exists("searchProduct")).toBe(true);
  });

  it("searchProduct executes via productService and returns structured results", async () => {
    const productService = {
      search: vi.fn().mockResolvedValue({
        results: [
          {
            id: "p1",
            name: "Filamento PLA 1.75mm",
            brand: "Sunlu",
            category: "Impresión 3D",
            price: 15000,
            currency: "ARS",
            stock: 8,
            available: true,
          },
        ],
      }),
    };
    const registry = new ToolRegistry();
    registerTools(registry, makeDeps({ productService }));
    const tool = registry.get("searchProduct");
    const result = await tool.execute({ query: "pla" });

    expect(productService.search).toHaveBeenCalledWith("pla");
    expect(result.results).toHaveLength(1);
    expect(result.results[0]).toEqual({
      id: "p1",
      name: "Filamento PLA 1.75mm",
      brand: "Sunlu",
      category: "Impresión 3D",
      price: 15000,
      currency: "ARS",
      stock: 8,
      available: true,
    });
  });

  it("searchProduct requires query param", async () => {
    const productService = { search: vi.fn() };
    const registry = new ToolRegistry();
    registerTools(registry, makeDeps({ productService }));
    await expect(registry.get("searchProduct").execute({})).rejects.toThrow(
      "query is required",
    );
  });

  it("searchProduct requires productService", async () => {
    const registry = new ToolRegistry();
    registerTools(registry, makeDeps());
    await expect(
      registry.get("searchProduct").execute({ query: "pla" }),
    ).rejects.toThrow("productService is required");
  });

  it("searchStock tool exists", () => {
    const registry = new ToolRegistry();
    registerTools(registry, makeDeps());
    expect(registry.exists("searchStock")).toBe(true);
  });

  it("searchStock executes via stockService and returns structured results", async () => {
    const stockService = {
      search: vi.fn().mockResolvedValue({
        results: [
          {
            id: "p1",
            product: "Filamento PLA 1.75mm",
            stock: 8,
            available: true,
          },
        ],
      }),
    };
    const registry = new ToolRegistry();
    registerTools(registry, makeDeps({ stockService }));
    const tool = registry.get("searchStock");
    const result = await tool.execute({ query: "tienen pla" });

    expect(stockService.search).toHaveBeenCalledWith("tienen pla");
    expect(result.results).toHaveLength(1);
    expect(result.results[0]).toEqual({
      id: "p1",
      product: "Filamento PLA 1.75mm",
      stock: 8,
      available: true,
    });
  });

  it("searchStock requires query param", async () => {
    const stockService = { search: vi.fn() };
    const registry = new ToolRegistry();
    registerTools(registry, makeDeps({ stockService }));
    await expect(registry.get("searchStock").execute({})).rejects.toThrow(
      "query is required",
    );
  });

  it("searchStock requires stockService", async () => {
    const registry = new ToolRegistry();
    registerTools(registry, makeDeps());
    await expect(
      registry.get("searchStock").execute({ query: "pla" }),
    ).rejects.toThrow("stockService is required");
  });
});

describe("commercial tool contracts (P6) — descriptions disambiguate", () => {
  function tool(name) {
    const registry = new ToolRegistry();
    registerTools(registry, makeDeps());
    return registry.get(name);
  }

  it("searchProduct covers existence, price and stock of products", () => {
    const desc = tool("searchProduct").description;
    expect(desc).toContain("price");
    expect(desc).toContain("stock");
    expect(desc).toContain("available");
    expect(desc).toContain('use "searchPrice"');
  });

  it("searchPrice is explicitly REPAIR-SERVICE only and never product prices", () => {
    const desc = tool("searchPrice").description;
    expect(desc).toContain("REPAIR-SERVICE prices");
    expect(desc).toContain("Do NOT use for product prices");
    expect(desc).toContain('"searchProduct"');
    expect(desc).not.toContain("stock");
  });

  it("searchStock is explicitly stock-only and never price", () => {
    const desc = tool("searchStock").description;
    expect(desc).toContain("STOCK LEVEL");
    expect(desc).toContain("Use ONLY when the intent is stock");
    expect(desc).toContain("does NOT return price");
    expect(desc).toContain('use "searchProduct"');
  });
});
