import { describe, it, expect, vi } from "vitest";
import { ToolExecutor } from "./tool-executor.js";
import { ToolRegistry } from "./tool-registry.js";

describe("ToolExecutor.executePlan — working memory & references", () => {
  function createExecutor() {
    const registry = new ToolRegistry();
    const executor = new ToolExecutor({ toolRegistry: registry });
    return { registry, executor };
  }

  it("resolves a simple reference into the dependent tool input", async () => {
    const { registry, executor } = createExecutor();
    const first = vi
      .fn()
      .mockResolvedValue({ device: "Motorola G32", amount: 4200 });
    const second = vi.fn().mockResolvedValue("ok");
    registry.register({ name: "searchPrice", execute: first });
    registry.register({ name: "searchBusinessInfo", execute: second });

    await executor.executePlan([
      {
        id: "price",
        tool: "searchPrice",
        input: { query: "pantalla g32" },
        dependsOn: [],
        parallel: true,
      },
      {
        id: "info",
        tool: "searchBusinessInfo",
        input: { query: "$price.result.device" },
        dependsOn: ["price"],
        parallel: false,
      },
    ]);

    expect(second).toHaveBeenCalledWith({ query: "Motorola G32" }, {});
  });

  it("supports a full chain where each step consumes the previous result", async () => {
    const { registry, executor } = createExecutor();
    const calls = [];
    registry.register({
      name: "a",
      execute: async () => ({ id: 5, name: "Ana" }),
    });
    registry.register({
      name: "b",
      execute: async (params) => {
        calls.push(["b", params]);
        return { list: [{ status: "en reparacion" }] };
      },
    });
    registry.register({
      name: "c",
      execute: async (params) => {
        calls.push(["c", params]);
        return "done";
      },
    });

    const result = await executor.executePlan([
      { id: "a", tool: "a", input: {}, dependsOn: [], parallel: true },
      {
        id: "b",
        tool: "b",
        input: { clientId: "$a.result.id" },
        dependsOn: ["a"],
        parallel: false,
      },
      {
        id: "c",
        tool: "c",
        input: { clientId: "$a.result.id", status: "$b.result.list.0.status" },
        dependsOn: ["a", "b"],
        parallel: false,
      },
    ]);

    expect(calls).toEqual([
      ["b", { clientId: 5 }],
      ["c", { clientId: 5, status: "en reparacion" }],
    ]);
    expect(result.errors).toEqual([]);
  });

  it("resolves multiple references and nested objects in one input", async () => {
    const { registry, executor } = createExecutor();
    const executeFn = vi.fn().mockResolvedValue("ok");
    registry.register({
      name: "p",
      execute: async () => ({ amount: 4200, device: "G32" }),
    });
    registry.register({
      name: "b",
      execute: async () => ({ topic: "repair_time", value: "2 días" }),
    });
    registry.register({ name: "use", execute: executeFn });

    await executor.executePlan([
      { id: "p", tool: "p", input: {}, dependsOn: [], parallel: true },
      { id: "b", tool: "b", input: {}, dependsOn: [], parallel: true },
      {
        id: "use",
        tool: "use",
        input: {
          summary: { device: "$p.result.device", price: "$p.result.amount" },
          info: ["$b.result.topic", "$b.result.value"],
        },
        dependsOn: ["p", "b"],
        parallel: false,
      },
    ]);

    expect(executeFn).toHaveBeenCalledWith(
      {
        summary: { device: "G32", price: 4200 },
        info: ["repair_time", "2 días"],
      },
      {},
    );
  });

  it("stores the successful result under its step id ({tool, result})", async () => {
    const { registry, executor } = createExecutor();
    const executeFn = vi.fn().mockResolvedValue("ok");
    registry.register({
      name: "p",
      execute: async () => ({ service: "Pantalla" }),
    });
    registry.register({ name: "use", execute: executeFn });

    await executor.executePlan([
      { id: "price", tool: "p", input: {}, dependsOn: [], parallel: true },
      {
        id: "use",
        tool: "use",
        input: { entry: "$price" },
        dependsOn: ["price"],
        parallel: false,
      },
    ]);

    expect(executeFn).toHaveBeenCalledWith(
      { entry: { tool: "p", result: { service: "Pantalla" } } },
      {},
    );
  });

  it("fails a dependent step when its dependency failed (controlled)", async () => {
    const { registry, executor } = createExecutor();
    registry.register({
      name: "boom",
      execute: async () => {
        throw new Error("x");
      },
    });
    registry.register({ name: "use", execute: async () => "never" });
    registry.register({ name: "other", execute: async () => "ok" });

    const result = await executor.executePlan([
      { id: "b", tool: "boom", input: {}, dependsOn: [], parallel: true },
      {
        id: "u",
        tool: "use",
        input: { q: "$b.result.id" },
        dependsOn: ["b"],
        parallel: false,
      },
      { id: "o", tool: "other", input: {}, dependsOn: [], parallel: true },
    ]);

    expect(result.results[0].success).toBe(false);
    expect(result.results[1].success).toBe(false);
    expect(result.results[1].error).toContain(
      'step "b" has no successful result',
    );
    expect(result.results[2].success).toBe(true);
    expect(result.errors).toHaveLength(2);
  });

  it("errors on a reference to an unknown step but keeps the rest of the plan", async () => {
    const { registry, executor } = createExecutor();
    const executeFn = vi.fn().mockResolvedValue("ok");
    registry.register({ name: "t", execute: executeFn });

    const result = await executor.executePlan([
      {
        id: "x",
        tool: "t",
        input: { q: "$ghost.result.id" },
        dependsOn: [],
        parallel: true,
      },
      { id: "y", tool: "t", input: {}, dependsOn: [], parallel: true },
    ]);

    expect(result.results[0].success).toBe(false);
    expect(result.results[0].error).toContain('"ghost"');
    expect(result.results[1].success).toBe(true);
    expect(executeFn).toHaveBeenCalledTimes(1);
  });

  it("errors on a circular self-reference without executing the step", async () => {
    const { registry, executor } = createExecutor();
    const executeFn = vi.fn().mockResolvedValue("ok");
    registry.register({ name: "t", execute: executeFn });

    const result = await executor.executePlan([
      {
        id: "me",
        tool: "t",
        input: { q: "$me.result.id" },
        dependsOn: [],
        parallel: true,
      },
    ]);

    expect(executeFn).not.toHaveBeenCalled();
    expect(result.results[0].success).toBe(false);
    expect(result.results[0].error).toContain("Circular reference");
  });

  it("keeps legacy steps without references working identically", async () => {
    const { registry, executor } = createExecutor();
    const executeFn = vi.fn().mockResolvedValue("ok");
    registry.register({ name: "t", execute: executeFn });

    await executor.executePlan([
      { tool: "t", input: { query: "pantalla" } },
      { tool: "t", input: { query: "horarios" } },
    ]);

    expect(executeFn).toHaveBeenNthCalledWith(1, { query: "pantalla" }, {});
    expect(executeFn).toHaveBeenNthCalledWith(2, { query: "horarios" }, {});
  });

  it("does not leak working memory between executePlan calls", async () => {
    const { registry, executor } = createExecutor();
    const executeFn = vi.fn().mockResolvedValue("ok");
    registry.register({ name: "t", execute: executeFn });

    await executor.executePlan([
      { id: "a", tool: "t", input: { v: 1 }, dependsOn: [], parallel: true },
    ]);
    const result = await executor.executePlan([
      {
        id: "b",
        tool: "t",
        input: { q: "$a.result.v" },
        dependsOn: [],
        parallel: true,
      },
    ]);

    expect(executeFn).toHaveBeenNthCalledWith(1, { v: 1 }, {});
    expect(executeFn).toHaveBeenCalledTimes(1);
    expect(result.results[0].success).toBe(false);
    expect(result.results[0].error).toContain(
      'step "a" has no successful result',
    );
  });
});
