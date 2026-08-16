import { describe, it, expect } from "vitest";
import { ReferenceResolver, isReference } from "./reference-resolver.js";

describe("ReferenceResolver", () => {
  function memoryWith(entries) {
    const memory = new Map();
    for (const [id, entry] of Object.entries(entries)) {
      memory.set(id, entry);
    }
    return memory;
  }

  const PRICE_MEMORY = memoryWith({
    "step-1": {
      tool: "searchPrice",
      result: {
        results: [
          { service: "Cambio de pantalla", amount: 4200, tags: ["rapido"] },
        ],
      },
    },
  });

  it("recognizes reference strings only", () => {
    expect(isReference("$step-1.result.device")).toBe(true);
    expect(isReference("$step-1.result.options.0.name")).toBe(true);
    expect(isReference("$step-1.result.options[0].name")).toBe(true);
    expect(isReference("$step-1")).toBe(true);
    expect(isReference("cuesta $500")).toBe(false);
    expect(isReference("$500 pesos")).toBe(false);
    expect(isReference("plain")).toBe(false);
    expect(isReference(42)).toBe(false);
  });

  it("resolves a simple reference to a result field", () => {
    const resolver = new ReferenceResolver();
    const resolved = resolver.resolveInput(
      { query: "$step-1.result.results.0.service" },
      { memory: PRICE_MEMORY },
    );
    expect(resolved).toEqual({ query: "Cambio de pantalla" });
  });

  it("resolves nested object references", () => {
    const resolver = new ReferenceResolver();
    const memory = memoryWith({
      client: {
        tool: "searchClient",
        result: { id: 7, contact: { phone: "123" } },
      },
    });
    const resolved = resolver.resolveInput(
      {
        client: {
          id: "$client.result.id",
          phone: "$client.result.contact.phone",
        },
      },
      { memory },
    );
    expect(resolved).toEqual({ client: { id: 7, phone: "123" } });
  });

  it("resolves multiple references in a single input", () => {
    const resolver = new ReferenceResolver();
    const memory = memoryWith({
      a: { tool: "ta", result: { x: 1 } },
      b: { tool: "tb", result: { y: 2 } },
    });
    const resolved = resolver.resolveInput(
      { x: "$a.result.x", y: "$b.result.y", sum: "$a.result.x", literal: "hi" },
      { memory },
    );
    expect(resolved).toEqual({ x: 1, y: 2, sum: 1, literal: "hi" });
  });

  it("resolves references inside arrays, with dot and bracket indexes", () => {
    const resolver = new ReferenceResolver();
    const memory = memoryWith({
      p: {
        tool: "searchPrice",
        result: { results: [{ label: "Estándar" }, { label: "Premium" }] },
      },
    });
    const dot = resolver.resolveInput(["$p.result.results.0.label"], {
      memory,
    });
    expect(dot).toEqual(["Estándar"]);
    const bracket = resolver.resolveInput(
      { query: "$p.result.results[1].label" },
      { memory },
    );
    expect(bracket).toEqual({ query: "Premium" });
  });

  it("returns the whole working-memory entry for a bare step reference", () => {
    const resolver = new ReferenceResolver();
    const resolved = resolver.resolveInput(
      { entry: "$step-1" },
      { memory: PRICE_MEMORY },
    );
    expect(resolved).toEqual({
      entry: {
        tool: "searchPrice",
        result: {
          results: [
            { service: "Cambio de pantalla", amount: 4200, tags: ["rapido"] },
          ],
        },
      },
    });
  });

  it("passes through non-reference values unchanged", () => {
    const resolver = new ReferenceResolver();
    const input = { a: "hola", b: ["x", 1], c: { d: "$500 pesos" }, e: 5 };
    const resolved = resolver.resolveInput(input, {
      memory: PRICE_MEMORY,
    });
    expect(resolved).toEqual(input);
  });

  it("throws a controlled error on a reference to an unknown step", () => {
    const resolver = new ReferenceResolver();
    expect(() =>
      resolver.resolveInput(
        { q: "$ghost.result.id" },
        { memory: PRICE_MEMORY },
      ),
    ).toThrow(/could not be resolved/);
  });

  it("throws a controlled error when a referenced path does not exist", () => {
    const resolver = new ReferenceResolver();
    expect(() =>
      resolver.resolveInput(
        { q: "$step-1.result.results.0.missing" },
        { memory: PRICE_MEMORY },
      ),
    ).toThrow(/path segment "missing" not found/);
  });

  it("throws a controlled error on a self (circular) reference", () => {
    const resolver = new ReferenceResolver();
    expect(() =>
      resolver.resolveInput(
        { q: "$me.result.x" },
        { memory: PRICE_MEMORY, currentStepId: "me" },
      ),
    ).toThrow(/Circular reference detected/);
  });

  it("throws when memory is not a Map", () => {
    const resolver = new ReferenceResolver();
    expect(() =>
      resolver.resolveInput({ q: "$a.result.x" }, { memory: {} }),
    ).toThrow(/Map of successful step results is required/);
  });

  it("does not re-resolve strings found inside resolved data", () => {
    const resolver = new ReferenceResolver();
    const memory = memoryWith({
      a: { tool: "ta", result: { note: "$b.result.x" } },
      b: { tool: "tb", result: { x: 5 } },
    });
    const resolved = resolver.resolveInput({ q: "$a.result.note" }, { memory });
    expect(resolved).toEqual({ q: "$b.result.x" });
  });
});
