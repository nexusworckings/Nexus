import { describe, it, expect, vi } from "vitest";
import { ProductService } from "./product-service.js";
import { BusinessKnowledgeGraph } from "./business-knowledge-graph.js";

function makeService(rows) {
  const repository = { findAll: vi.fn().mockResolvedValue(rows) };
  const knowledgeGraph = new BusinessKnowledgeGraph({
    sources: { services: [], prices: [], products: rows },
  });
  const service = new ProductService({ repository, knowledgeGraph });
  return { service, repository, knowledgeGraph };
}

const CATALOG = [
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
  {
    id: "p3",
    name: "Memoria RAM 8GB",
    brand: "Kingston",
    category: "Memoria",
    price: 32000,
    currency: "ARS",
    stock: 0,
    is_active: true,
  },
  {
    id: "p4",
    name: "Protector de pantalla",
    brand: "Nilkin",
    category: "Accesorios",
    price: 4000,
    currency: "ARS",
    stock: 20,
    is_active: true,
  },
  {
    id: "p5",
    name: "Motorola G32",
    brand: "Motorola",
    category: "Smartphones",
    price: 240000,
    currency: "ARS",
    stock: 2,
    is_active: true,
  },
  {
    id: "p6",
    name: "Filamento obsoleto",
    brand: "Genérica",
    category: "Impresión 3D",
    price: 100,
    currency: "ARS",
    stock: 1,
    is_active: false,
  },
];

describe("ProductService.search", () => {
  it("returns only structured data (no text, no explanations)", async () => {
    const { service } = makeService([CATALOG[0]]);
    const result = await service.search("pla");

    expect(result).toEqual({
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
    const { service } = makeService([
      { ...CATALOG[1], name: "SSD 500GB", brand: "Kingston" },
    ]);
    const result = await service.search("ssd");
    expect(result.results.map((p) => p.id)).toEqual(["p2"]);
  });

  it("resolves aliases: ssd -> disco solido", async () => {
    const { service } = makeService([CATALOG[1]]);
    const result = await service.search("ssd");
    expect(result.results.map((p) => p.id)).toEqual(["p2"]);
  });

  it("resolves aliases: moto -> motorola and vice versa", async () => {
    const { service } = makeService(CATALOG);
    const byMoto = await service.search("moto");
    expect(byMoto.results.map((p) => p.id)).toEqual(["p5"]);
    const byMotorola = await service.search("motorola");
    expect(byMotorola.results.map((p) => p.id)).toEqual(["p5"]);
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
    const result = await service.search("cuanto cuesta el filamento");
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

  it("orders results by relevance: exact brand match beats partial", async () => {
    const rows = [
      { ...CATALOG[4], name: "Smartphone 128GB", brand: "Motorola" },
      { ...CATALOG[4], name: "Motorola G32", brand: "Motorola" },
    ];
    const { service } = makeService(rows);
    const result = await service.search("motorola");
    expect(result.results.map((p) => p.name)).toEqual([
      "Motorola G32",
      "Smartphone 128GB",
    ]);
  });

  it("orders results by relevance: name match beats category-only match", async () => {
    const rows = [
      { ...CATALOG[0], name: "Roller 3D", category: "Filamentos" },
      { ...CATALOG[0], name: "Filamento PLA 1.75mm", category: "Impresión 3D" },
    ];
    const { service } = makeService(rows);
    const result = await service.search("pla");
    expect(result.results.map((p) => p.name)).toEqual([
      "Filamento PLA 1.75mm",
      "Roller 3D",
    ]);
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
    const service = new ProductService({ repository });
    await service.search("");
    expect(repository.findAll).not.toHaveBeenCalled();
  });

  it("delegates alias expansion to the knowledge graph", async () => {
    const repository = { findAll: vi.fn().mockResolvedValue([CATALOG[1]]) };
    const expandTokens = vi
      .fn()
      .mockImplementation((tokens) => new Set(tokens));
    const knowledgeGraph = { expandTokens };
    const service = new ProductService({ repository, knowledgeGraph });

    await service.search("ssd");

    expect(expandTokens).toHaveBeenCalled();
  });

  it("does not resolve aliases without a knowledge graph", async () => {
    const rows = [
      {
        id: "p9",
        name: "Smartphone 128GB",
        brand: "Xiaomi",
        category: "Smartphones",
        price: 210000,
        currency: "ARS",
        stock: 5,
        is_active: true,
      },
    ];
    const repository = { findAll: vi.fn().mockResolvedValue(rows) };
    const service = new ProductService({ repository });

    const result = await service.search("redmi");
    expect(result.results).toEqual([]);
  });
});

describe("ProductService.search with color/material attributes", () => {
  const PRINT_CATALOG = [
    {
      id: "f1",
      name: "Filamento PLA negro 1KG",
      brand: "Sunlu",
      category: "Impresión 3D",
      price: 15000,
      currency: "ARS",
      stock: 8,
      is_active: true,
    },
    {
      id: "f2",
      name: "Filamento PLA rojo 1KG",
      brand: "Sunlu",
      category: "Impresión 3D",
      price: 15000,
      currency: "ARS",
      stock: 8,
      is_active: true,
    },
    {
      id: "f3",
      name: "Filamento PETG negro 1KG",
      brand: "Sunlu",
      category: "Impresión 3D",
      price: 20000,
      currency: "ARS",
      stock: 3,
      is_active: true,
    },
  ];

  function makePrintService(rows = PRINT_CATALOG) {
    const repository = { findAll: vi.fn().mockResolvedValue(rows) };
    const knowledgeGraph = new BusinessKnowledgeGraph({
      sources: { services: [], prices: [], products: rows },
    });
    const service = new ProductService({ repository, knowledgeGraph });
    return { service, repository, knowledgeGraph };
  }

  it("ranks identity+color above identity-only and color-only matches", async () => {
    const { service } = makePrintService();
    const result = await service.search("PLA negro");

    expect(result.results.map((p) => p.id)).toEqual(["f1", "f2", "f3"]);
  });

  it("penalizes a conflicting color but keeps the identity match secondary", async () => {
    const { service } = makePrintService();
    const result = await service.search("PLA rojo");

    expect(result.results.map((p) => p.id)).toEqual(["f2", "f1"]);
  });

  it("penalizes a conflicting material (identity-level conflict) harder", async () => {
    const { service } = makePrintService();
    const result = await service.search("PETG negro");

    expect(result.results.map((p) => p.id)).toEqual(["f3", "f1"]);
  });

  it("keeps only material matches for a material-only query", async () => {
    const { service } = makePrintService();
    const result = await service.search("PLA");

    expect(result.results.map((p) => p.id)).toEqual(["f1", "f2"]);
  });

  it("does not invent a non-existent color: conflicting PLA stays secondary", async () => {
    const { service } = makePrintService();
    const result = await service.search("PLA violeta");

    expect(result.results.map((p) => p.id)).toEqual(["f1", "f2"]);
    expect(result.results.some((p) => /violeta/i.test(p.name))).toBe(false);
  });

  it("excludes a product that declares no color when the query asks for one", async () => {
    const rows = [
      { ...PRINT_CATALOG[0] },
      { ...PRINT_CATALOG[0], id: "f-no-color", name: "Filamento PLA 1KG" },
    ];
    const { service } = makePrintService(rows);
    const result = await service.search("PLA negro");

    expect(result.results.map((p) => p.id)).toEqual(["f1"]);
  });

  it("ignores conversational noise around an attribute query", async () => {
    const { service } = makePrintService();
    const result = await service.search("¿Cuánto sale el PLA negro?");

    expect(result.results.map((p) => p.id)).toEqual(["f1", "f2", "f3"]);
  });

  it("ignores quantities: the number does not break the matching", async () => {
    const { service } = makePrintService();
    const result = await service.search("Quiero 30 PLA negros");

    expect(result.results.map((p) => p.id)).toEqual(["f1", "f2", "f3"]);
  });

  it("keeps knowledge graph alias expansion working with attribute scoring", async () => {
    const { service } = makePrintService();
    const byPla = await service.search("filamento");
    expect(byPla.results.map((p) => p.id)).toEqual(["f1", "f2", "f3"]);

    const byAlias = await service.search("moto");
    expect(byAlias.results).toEqual([]);
  });
});
