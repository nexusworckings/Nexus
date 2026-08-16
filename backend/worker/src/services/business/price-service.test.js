import { describe, it, expect, vi } from "vitest";
import { PriceService } from "./price-service.js";
import { BusinessKnowledgeGraph } from "./business-knowledge-graph.js";

const SERVICES = [
  { id: 1, name: "Cambio de pantalla" },
  { id: 2, name: "Cambio de batería" },
  { id: 3, name: "Cambio de módulo" },
];

function makeService({ prices = [], services = SERVICES } = {}) {
  const queryFn = vi.fn(async (table) => {
    if (table === "prices") return prices;
    if (table === "services") return services;
    return [];
  });
  const knowledgeGraph = new BusinessKnowledgeGraph({
    sources: { services, prices, products: [] },
  });
  return { service: new PriceService({ queryFn, knowledgeGraph }), queryFn };
}

describe("PriceService", () => {
  describe("constructor", () => {
    it("rejects missing queryFn", () => {
      expect(() => new PriceService()).toThrow("queryFn is required");
    });

    it("accepts valid options", () => {
      expect(new PriceService({ queryFn: async () => [] })).toBeInstanceOf(
        PriceService,
      );
    });
  });

  describe("search", () => {
    it("finds a single match by service and model", async () => {
      const prices = [
        {
          id: 1,
          service_id: 1,
          label: "Motorola G32",
          amount: 42000,
          currency: "ARS",
        },
      ];
      const { service } = makeService({ prices });

      const result = await service.search("pantalla motorola g32");

      expect(result).toHaveLength(1);
      expect(result[0]).toEqual({
        service: "Cambio de pantalla",
        label: "Motorola G32",
        amount: 42000,
        currency: "ARS",
      });
    });

    it("returns empty array when there are no results", async () => {
      const { service } = makeService({ prices: [] });

      const result = await service.search("batería samsung a54");

      expect(result).toEqual([]);
    });

    it("returns multiple variants with equal score", async () => {
      const prices = [
        {
          id: 1,
          service_id: 1,
          label: "Estándar",
          amount: 25000,
          currency: "ARS",
        },
        {
          id: 2,
          service_id: 1,
          label: "Premium (vidrio original)",
          amount: 35000,
          currency: "ARS",
        },
      ];
      const { service } = makeService({ prices });

      const result = await service.search("cuánto cuesta cambiar una pantalla");

      expect(result).toHaveLength(2);
    });

    it("normalizes Moto G32 to Motorola G32", async () => {
      const prices = [
        {
          id: 1,
          service_id: 1,
          label: "Motorola G32",
          amount: 42000,
          currency: "ARS",
        },
      ];
      const { service } = makeService({ prices });

      const result = await service.search("moto g32");

      expect(result).toHaveLength(1);
      expect(result[0].label).toBe("Motorola G32");
    });

    it("is accent and case insensitive", async () => {
      const prices = [
        {
          id: 1,
          service_id: 2,
          label: "Batería Samsung A54",
          amount: 12000,
          currency: "ARS",
        },
      ];
      const { service } = makeService({ prices });

      const result = await service.search("BATERÍA SAMSUNG A54");

      expect(result).toHaveLength(1);
      expect(result[0].label).toBe("Batería Samsung A54");
    });

    it("matches partial model tokens", async () => {
      const prices = [
        {
          id: 1,
          service_id: 1,
          label: "Samsung Galaxy A54",
          amount: 30000,
          currency: "ARS",
        },
      ];
      const { service } = makeService({ prices });

      const result = await service.search("pantalla samsung a54");

      expect(result).toHaveLength(1);
    });

    it("does not invent prices when a token does not match", async () => {
      const prices = [
        {
          id: 1,
          service_id: 2,
          label: "Batería estándar",
          amount: 12000,
          currency: "ARS",
        },
      ];
      const { service } = makeService({ prices });

      const result = await service.search("batería samsung a54");

      expect(result).toEqual([]);
    });

    it("returns empty for empty or invalid input", async () => {
      const { service } = makeService();
      await expect(service.search("")).resolves.toEqual([]);
      await expect(service.search(null)).resolves.toEqual([]);
      await expect(service.search(undefined)).resolves.toEqual([]);
      await expect(service.search(42)).resolves.toEqual([]);
    });

    it("filters only active prices via query options", async () => {
      const { service, queryFn } = makeService({ prices: [] });
      await service.search("pantalla");

      expect(queryFn).toHaveBeenCalledWith("prices", {
        select: "id,service_id,label,amount,currency",
        eq: { is_active: "true" },
      });
      expect(queryFn).toHaveBeenCalledWith("services", { select: "id,name" });
    });

    it("never exposes internal fields", async () => {
      const prices = [
        {
          id: 7,
          service_id: 1,
          label: "Motorola G32",
          amount: 42000,
          currency: "ARS",
          is_active: true,
          created_at: "x",
        },
      ];
      const { service } = makeService({ prices });

      const result = await service.search("pantalla motorola g32");

      expect(result[0].id).toBeUndefined();
      expect(result[0].service_id).toBeUndefined();
      expect(result[0].is_active).toBeUndefined();
    });

    it("delegates entity resolution to the knowledge graph", async () => {
      const prices = [
        {
          id: 1,
          service_id: 1,
          label: "Motorola G32",
          amount: 42000,
          currency: "ARS",
        },
      ];
      const { service, queryFn } = makeService({ prices });

      await service.search("pantalla motorola g32");

      expect(queryFn).toHaveBeenCalledTimes(2);
      expect(queryFn).toHaveBeenCalledWith("prices", {
        select: "id,service_id,label,amount,currency",
        eq: { is_active: "true" },
      });
      expect(queryFn).toHaveBeenCalledWith("services", { select: "id,name" });
    });

    it("only returns entries whose device/service is resolved by the graph", async () => {
      const prices = [
        {
          id: 1,
          service_id: 1,
          label: "Motorola G32",
          amount: 42000,
          currency: "ARS",
        },
        {
          id: 2,
          service_id: 1,
          label: "Samsung A54",
          amount: 38000,
          currency: "ARS",
        },
      ];
      const { service } = makeService({ prices });

      const result = await service.search("pantalla moto");

      expect(result).toHaveLength(1);
      expect(result[0].label).toBe("Motorola G32");
    });

    it("falls back to plain token matching when the graph resolve throws", async () => {
      const prices = [
        {
          id: 1,
          service_id: 1,
          label: "Motorola G32",
          amount: 42000,
          currency: "ARS",
        },
      ];
      const queryFn = vi.fn(async (table) => {
        if (table === "prices") return prices;
        if (table === "services") return SERVICES;
        return [];
      });
      const knowledgeGraph = {
        resolve: vi.fn().mockRejectedValue(new Error("boom")),
        expandTokens: (tokens) => tokens,
      };
      const service = new PriceService({ queryFn, knowledgeGraph });

      const result = await service.search("pantalla motorola g32");

      expect(result).toHaveLength(1);
      expect(result[0].label).toBe("Motorola G32");
    });

    it("does not resolve aliases when no knowledge graph is provided", async () => {
      const prices = [
        {
          id: 1,
          service_id: 1,
          label: "Pantalla iPhone 13",
          amount: 50000,
          currency: "ARS",
        },
      ];
      const queryFn = vi.fn(async (table) => {
        if (table === "prices") return prices;
        if (table === "services") return SERVICES;
        return [];
      });
      const service = new PriceService({ queryFn });

      const byApple = await service.search("pantalla apple");
      expect(byApple).toEqual([]);

      const byIphone = await service.search("pantalla iphone");
      expect(byIphone).toHaveLength(1);
    });
  });
});
