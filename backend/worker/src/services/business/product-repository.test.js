import { describe, it, expect, vi } from "vitest";
import { ProductRepository } from "./product-repository.js";

describe("ProductRepository", () => {
  it("throws when queryFn is required", () => {
    expect(() => new ProductRepository()).toThrow("queryFn is required");
    expect(() => new ProductRepository({ queryFn: null })).toThrow(
      "queryFn is required",
    );
  });

  it("queries the products table with the canonical select and active filter", async () => {
    const queryFn = vi.fn().mockResolvedValue([{ id: "p1" }]);
    const repo = new ProductRepository({ queryFn });

    const rows = await repo.findAll();

    expect(queryFn).toHaveBeenCalledWith("products", {
      select: "id,name,brand,category,price,currency,stock,is_active",
      eq: { is_active: "true" },
    });
    expect(rows).toEqual([{ id: "p1" }]);
  });

  it("returns an empty array when the table returns nothing", async () => {
    const queryFn = vi.fn().mockResolvedValue(null);
    const repo = new ProductRepository({ queryFn });

    await expect(repo.findAll()).resolves.toEqual([]);
  });

  it("passes extra options through (integration point for future consumers)", async () => {
    const queryFn = vi.fn().mockResolvedValue([]);
    const repo = new ProductRepository({ queryFn });

    await repo.findAll({ order: "price.asc" });

    expect(queryFn).toHaveBeenCalledWith("products", {
      select: "id,name,brand,category,price,currency,stock,is_active",
      eq: { is_active: "true" },
      order: "price.asc",
    });
  });
});
