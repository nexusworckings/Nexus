import { describe, it, expect, vi } from "vitest";
import { StockService } from "./stock-service.js";
import { BusinessKnowledgeGraph } from "./business-knowledge-graph.js";

function makeService(rows) {
  const repository = { findAll: vi.fn().mockResolvedValue(rows) };
  const knowledgeGraph = new BusinessKnowledgeGraph({
    sources: { services: [], prices: [], products: rows },
  });
  const service = new StockService({ repository, knowledgeGraph });
  return { service, repository, knowledgeGraph };
}

const CATALOG = [
  { id: "p1", name: "Filamento PLA 1.75mm", stock: 8, is_active: true },
  { id: "p2", name: "Disco Solido SSD 500GB", stock: 3, is_active: true },
  { id: "p3", name: "Memoria RAM 8GB", stock: 0, is_active: true },
  { id: "p4", name: "Protector de pantalla", stock: 20, is_active: true },
  { id: "p5", name: "Motorola G32", stock: 2, is_active: true },
  { id: "p6", name: "Filamento obsoleto", stock: 1, is_active: false },
];

describe("StockService.search", () => {
  it("returns only structured data (no text, no explanations)", async () => {
    const { service } = makeService([CATALOG[0]]);
    const result = await service.search("pla");

    expect(result).toEqual({
      results: [
        {
          id: "p1",
          product: "Filamento PLA 1.75mm",
          stock: 8,
          available: true,
        },
      ],
    });
  });

  it("matches exact name", async () => {
    const { service } = makeService(CATALOG);
    const result = await service.search("memoria ram 8gb");
    expect(result.results.map((p) => p.id)).toEqual(["p3"]);
  });

  it("matches case-insensitive and accents", async () => {
    const { service } = makeService(CATALOG);
    const result = await service.search("DISCO SÓLIDO SSD");
    expect(result.results.map((p) => p.id)).toEqual(["p2"]);
  });

  it("matches partial tokens (ssd partial on short token set)", async () => {
    const { service } = makeService([{ ...CATALOG[1], name: "SSD 500GB" }]);
    const result = await service.search("ssd");
    expect(result.results.map((p) => p.id)).toEqual(["p2"]);
  });

  it("resolves aliases: ssd -> disco solido", async () => {
    const { service } = makeService([CATALOG[1]]);
    const result = await service.search("ssd");
    expect(result.results.map((p) => p.id)).toEqual(["p2"]);
  });

  it("resolves aliases: moto -> motorola", async () => {
    const { service } = makeService(CATALOG);
    const result = await service.search("moto");
    expect(result.results.map((p) => p.id)).toEqual(["p5"]);
  });

  it("resolves aliases: ram -> memoria", async () => {
    const { service } = makeService(CATALOG);
    const result = await service.search("ram");
    expect(result.results.map((p) => p.id)).toEqual(["p3"]);
  });

  it("resolves aliases: pla -> filamento", async () => {
    const { service } = makeService(CATALOG);
    const result = await service.search("pla");
    expect(result.results.map((p) => p.id)).toEqual(["p1"]);
  });

  it("matches plural/singular", async () => {
    const { service } = makeService(CATALOG);
    const plural = await service.search("filamentos");
    expect(plural.results.map((p) => p.id)).toEqual(["p1"]);
  });

  it("ignores stopwords and keeps meaningful tokens", async () => {
    const { service } = makeService(CATALOG);
    const result = await service.search("tienen filamento");
    expect(result.results.map((p) => p.id)).toEqual(["p1"]);
  });

  it("returns empty results when nothing matches", async () => {
    const { service } = makeService(CATALOG);
    const result = await service.search("zapatilla maratonista");
    expect(result).toEqual({ results: [] });
  });

  it("excludes inactive products", async () => {
    const { service } = makeService(CATALOG);
    const result = await service.search("filamento");
    expect(result.results.map((p) => p.id)).toEqual(["p1"]);
  });

  it("marks out-of-stock products as not available but still returns them", async () => {
    const { service } = makeService(CATALOG);
    const result = await service.search("memoria ram 8gb");
    expect(result.results[0].available).toBe(false);
    expect(result.results[0].stock).toBe(0);
  });

  it("orders results by relevance: exact name match beats partial", async () => {
    const rows = [
      { id: "p7", name: "Roller 3D PLAX", stock: 4, is_active: true },
      { id: "p8", name: "Filamento PLA 1.75mm", stock: 8, is_active: true },
    ];
    const repository = { findAll: vi.fn().mockResolvedValue(rows) };
    const knowledgeGraph = { expandTokens: (tokens) => new Set(tokens) };
    const service = new StockService({ repository, knowledgeGraph });
    const result = await service.search("pla");
    expect(result.results.map((p) => p.id)).toEqual(["p8", "p7"]);
  });

  it("returns empty for invalid queries", async () => {
    const { service } = makeService(CATALOG);
    await expect(service.search("")).resolves.toEqual({ results: [] });
    await expect(service.search(null)).resolves.toEqual({ results: [] });
    await expect(service.search(undefined)).resolves.toEqual({ results: [] });
    await expect(service.search(42)).resolves.toEqual({ results: [] });
  });

  it("returns empty for queries made only of stopwords", async () => {
    const { service } = makeService(CATALOG);
    await expect(service.search("el la de")).resolves.toEqual({
      results: [],
    });
  });

  it("does not touch the repository when there is nothing to search", async () => {
    const repository = { findAll: vi.fn() };
    const service = new StockService({ repository });
    await service.search("");
    expect(repository.findAll).not.toHaveBeenCalled();
  });

  it("delegates alias expansion to the knowledge graph", async () => {
    const repository = { findAll: vi.fn().mockResolvedValue([CATALOG[1]]) };
    const expandTokens = vi
      .fn()
      .mockImplementation((tokens) => new Set(tokens));
    const knowledgeGraph = { expandTokens };
    const service = new StockService({ repository, knowledgeGraph });

    await service.search("ssd");

    expect(expandTokens).toHaveBeenCalled();
  });

  it("does not resolve aliases without a knowledge graph", async () => {
    const rows = [
      { id: "p9", name: "Smartphone 128GB", stock: 5, is_active: true },
    ];
    const repository = { findAll: vi.fn().mockResolvedValue(rows) };
    const service = new StockService({ repository });

    const result = await service.search("redmi");
    expect(result.results).toEqual([]);
  });
});
