import { describe, it, expect, vi } from "vitest";
import { BusinessKnowledgeGraph } from "./business-knowledge-graph.js";

const SOURCES = {
  services: [
    { id: 1, name: "Cambio de pantalla" },
    { id: 2, name: "Cambio de batería" },
  ],
  prices: [
    { id: 1, service_id: 1, label: "Motorola G32" },
    { id: 2, service_id: 2, label: "iPhone 13" },
  ],
  products: [
    {
      id: 1,
      name: "Pantalla G32",
      brand: "Motorola",
      category: "Repuestos",
    },
    {
      id: 2,
      name: "Display Original",
      brand: "Motorola",
      category: "Repuestos",
      compatible_with: "Pantalla G32",
    },
    {
      id: 3,
      name: "Filamento PLA",
      brand: "Sunlu",
      category: "Insumos",
    },
  ],
};

function makeGraph(sources = SOURCES) {
  return new BusinessKnowledgeGraph({ sources });
}

function names(entities) {
  return entities.map((e) => e.name);
}

describe("BusinessKnowledgeGraph.resolve", () => {
  it("resolves a brand and returns structured data only", async () => {
    const graph = makeGraph();
    const result = await graph.resolve("motorola");

    expect(result.entities.every((e) => e.type && e.name)).toBe(true);
    expect(
      result.entities.some((e) => e.type === "brand" && e.name === "Motorola"),
    ).toBe(true);
    expect(names(result.entities)).toContain("Motorola G32");
    expect(result.relations).toContainEqual({
      from: "Motorola G32",
      to: "Motorola",
      relation: "has_brand",
    });
  });

  it("resolves a device and its one-hop neighbors", async () => {
    const graph = makeGraph();
    const result = await graph.resolve("motorola g32");

    expect(names(result.entities)).toContain("Motorola G32");
    expect(names(result.entities)).toContain("Motorola");
    expect(names(result.entities)).toContain("Cambio de pantalla");
    expect(result.relations).toContainEqual({
      from: "Motorola G32",
      to: "Cambio de pantalla",
      relation: "supports",
    });
    expect(result.relations).toContainEqual({
      from: "Motorola G32",
      to: "Motorola",
      relation: "has_brand",
    });
  });

  it("resolves a service", async () => {
    const graph = makeGraph();
    const result = await graph.resolve("cambio de pantalla");

    expect(names(result.entities)).toContain("Cambio de pantalla");
    expect(names(result.entities)).toContain("Motorola G32");
    expect(result.relations).toContainEqual({
      from: "Motorola G32",
      to: "Cambio de pantalla",
      relation: "supports",
    });
  });

  it("returns multiple matching entities for a query", async () => {
    const graph = makeGraph();
    const result = await graph.resolve("motorola");

    const types = new Set(result.entities.map((e) => e.type));
    expect(types.has("brand")).toBe(true);
    expect(types.has("device")).toBe(true);
    expect(types.has("product")).toBe(true);
    expect(result.entities.length).toBeGreaterThanOrEqual(4);
  });

  it("resolves aliases (moto -> motorola, iphone -> apple)", async () => {
    const graph = makeGraph();

    const byMoto = await graph.resolve("moto");
    expect(names(byMoto.entities)).toContain("Motorola G32");
    expect(names(byMoto.entities)).toContain("Motorola");

    const byIphone = await graph.resolve("iphone");
    expect(names(byIphone.entities)).toContain("iPhone 13");
    expect(names(byIphone.entities)).toContain("Apple");
  });

  it("resolves aliases (pla -> filamento)", async () => {
    const graph = makeGraph();
    const result = await graph.resolve("pla");
    expect(names(result.entities)).toContain("Filamento PLA");
  });

  it("returns empty results when nothing matches", async () => {
    const graph = makeGraph();
    const result = await graph.resolve("zapatilla maratonista");
    expect(result).toEqual({ entities: [], relations: [] });
  });

  it("returns empty for invalid or stopword-only queries", async () => {
    const graph = makeGraph();
    await expect(graph.resolve("")).resolves.toEqual({
      entities: [],
      relations: [],
    });
    await expect(graph.resolve(null)).resolves.toEqual({
      entities: [],
      relations: [],
    });
    await expect(graph.resolve(undefined)).resolves.toEqual({
      entities: [],
      relations: [],
    });
    await expect(graph.resolve("el la de")).resolves.toEqual({
      entities: [],
      relations: [],
    });
  });

  it("returns only explicit relations within the resolved neighborhood", async () => {
    const graph = makeGraph();
    const result = await graph.resolve("g32");

    const relationEndpoints = result.relations.flatMap((r) => [r.from, r.to]);
    expect(relationEndpoints).toContain("Motorola G32");
    expect(relationEndpoints).toContain("Cambio de pantalla");
    expect(relationEndpoints).not.toContain("iPhone 13");
    expect(relationEndpoints).not.toContain("Cambio de batería");
    expect(result.entities.some((e) => e.name === "iPhone 13")).toBe(false);
  });

  it("keeps the graph consistent: every relation references existing entities", async () => {
    const graph = makeGraph();
    const entities = graph.getEntities();
    const entityNames = new Set(entities.map((e) => e.name));

    for (const rel of graph.getRelations()) {
      expect(entityNames.has(rel.from)).toBe(true);
      expect(entityNames.has(rel.to)).toBe(true);
    }
  });

  it("exposes stats with entity counts by type", async () => {
    const graph = makeGraph();
    const stats = graph.stats();

    expect(stats.entities).toBeGreaterThan(0);
    expect(stats.relations).toBeGreaterThan(0);
    expect(stats.byType.device).toBe(2);
    expect(stats.byType.service).toBe(2);
    expect(stats.byType.brand).toBeGreaterThanOrEqual(3);
  });
});

describe("BusinessKnowledgeGraph.resolveEntities", () => {
  it("returns directly matched entities without neighborhood expansion", async () => {
    const graph = makeGraph();
    const entities = await graph.resolveEntities("motorola");

    expect(entities.every((e) => e.type && e.name)).toBe(true);
    expect(
      entities.some((e) => e.type === "brand" && e.name === "Motorola"),
    ).toBe(true);
    expect(
      entities.some((e) => e.type === "device" && e.name === "Motorola G32"),
    ).toBe(true);
    expect(entities.some((e) => e.type === "service")).toBe(false);
  });

  it("returns empty for empty input, stopwords-only or no matches", async () => {
    const graph = makeGraph();
    await expect(graph.resolveEntities("")).resolves.toEqual([]);
    await expect(graph.resolveEntities(null)).resolves.toEqual([]);
    await expect(graph.resolveEntities("el la de")).resolves.toEqual([]);
    await expect(
      graph.resolveEntities("zapatilla maratonista"),
    ).resolves.toEqual([]);
  });
});

describe("BusinessKnowledgeGraph.expand", () => {
  it("returns the one-hop neighborhood of an entity", async () => {
    const graph = makeGraph();
    const result = await graph.expand({ type: "device", name: "Motorola G32" });

    expect(names(result.entities)).toContain("Motorola G32");
    expect(names(result.entities)).toContain("Motorola");
    expect(names(result.entities)).toContain("Cambio de pantalla");
    expect(result.relations).toContainEqual({
      from: "Motorola G32",
      to: "Cambio de pantalla",
      relation: "supports",
    });
    expect(result.relations).toContainEqual({
      from: "Motorola G32",
      to: "Motorola",
      relation: "has_brand",
    });
  });

  it("accepts a plain name and returns empty for unknown entities", async () => {
    const graph = makeGraph();
    const result = await graph.expand("Motorola G32");
    expect(result.entities.length).toBeGreaterThan(0);

    await expect(graph.expand("No existe")).resolves.toEqual({
      entities: [],
      relations: [],
    });
    await expect(graph.expand("")).resolves.toEqual({
      entities: [],
      relations: [],
    });
    await expect(graph.expand(null)).resolves.toEqual({
      entities: [],
      relations: [],
    });
  });
});

describe("BusinessKnowledgeGraph.expandTokens", () => {
  it("expands tokens through the shared alias map", () => {
    const graph = makeGraph();
    const expanded = graph.expandTokens(new Set(["moto", "pla"]));

    expect(expanded.has("moto")).toBe(true);
    expect(expanded.has("motorola")).toBe(true);
    expect(expanded.has("pla")).toBe(true);
    expect(expanded.has("filamento")).toBe(true);
  });

  it("is idempotent and preserves unknown tokens", () => {
    const graph = makeGraph();
    const expanded = graph.expandTokens(new Set(["zapatilla", "g32"]));
    expect(expanded.has("zapatilla")).toBe(true);
    expect(expanded.has("g32")).toBe(true);
  });
});

describe("BusinessKnowledgeGraph built from queryFn", () => {
  it("builds from services and prices and tolerates a missing products table", async () => {
    const queryFn = vi.fn(async (table) => {
      if (table === "services") return [{ id: 1, name: "Cambio de pantalla" }];
      if (table === "prices")
        return [{ id: 1, service_id: 1, label: "Samsung A54" }];
      return null;
    });
    const graph = new BusinessKnowledgeGraph({ queryFn });

    const result = await graph.resolve("samsung a54");

    expect(names(result.entities)).toContain("Samsung A54");
    expect(names(result.entities)).toContain("Cambio de pantalla");
    expect(result.relations).toContainEqual({
      from: "Samsung A54",
      to: "Cambio de pantalla",
      relation: "supports",
    });
  });

  it("tolerates a queryFn that throws on an uncreated source", async () => {
    const queryFn = vi.fn(async (table) => {
      if (table === "products") throw new Error("relation does not exist");
      return [];
    });
    const graph = new BusinessKnowledgeGraph({ queryFn });
    await expect(graph.resolve("algo")).resolves.toEqual({
      entities: [],
      relations: [],
    });
  });

  it("throws when neither queryFn nor sources are provided", async () => {
    const graph = new BusinessKnowledgeGraph({});
    await expect(graph.resolve("motorola")).rejects.toThrow(
      "queryFn or sources is required",
    );
  });

  it("load() returns stats and is idempotent", async () => {
    const graph = makeGraph();
    const first = await graph.load();
    const second = await graph.load();
    expect(first).toEqual(second);
    expect(second.entities).toBeGreaterThan(0);
  });
});
