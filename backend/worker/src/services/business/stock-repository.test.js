import { describe, it, expect, vi } from "vitest";
import { StockRepository } from "./stock-repository.js";

describe("StockRepository", () => {
  it("throws when queryFn is required", () => {
    expect(() => new StockRepository()).toThrow("queryFn is required");
    expect(() => new StockRepository({ queryFn: null })).toThrow(
      "queryFn is required",
    );
  });

  it("queries the products table with the canonical select and active filter", async () => {
    const queryFn = vi.fn().mockResolvedValue([{ id: "p1" }]);
    const repo = new StockRepository({ queryFn });

    const rows = await repo.findAll();

    expect(queryFn).toHaveBeenCalledWith("products", {
      select: "id,name,stock,is_active",
      eq: { is_active: "true" },
    });
    expect(rows).toEqual([{ id: "p1" }]);
  });

  it("returns an empty array when the table returns nothing", async () => {
    const queryFn = vi.fn().mockResolvedValue(null);
    const repo = new StockRepository({ queryFn });

    await expect(repo.findAll()).resolves.toEqual([]);
  });

  it("tolerates errors (missing table) and returns an empty array", async () => {
    const queryFn = vi
      .fn()
      .mockRejectedValue(new Error("relation does not exist"));
    const repo = new StockRepository({ queryFn });

    await expect(repo.findAll()).resolves.toEqual([]);
  });
});
