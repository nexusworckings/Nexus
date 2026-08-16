import { describe, it, expect, vi } from "vitest";
import { ToolExecutor } from "./tool-executor.js";
import { ToolRegistry } from "./tool-registry.js";
import { MetricsCollector } from "./observability.js";

describe("ToolExecutor.executePlan", () => {
  function createExecutor() {
    const registry = new ToolRegistry();
    const executor = new ToolExecutor({ toolRegistry: registry });
    return { registry, executor };
  }

  it("returns empty results/errors for an empty plan", async () => {
    const { executor } = createExecutor();
    const result = await executor.executePlan([]);
    expect(result.results).toEqual([]);
    expect(result.errors).toEqual([]);
  });

  it("executes a single step using the input format", async () => {
    const { registry, executor } = createExecutor();
    const executeFn = vi.fn().mockResolvedValue("ok");
    registry.register({ name: "tool", execute: executeFn });

    const result = await executor.executePlan([
      { tool: "tool", input: { query: "x" } },
    ]);

    expect(executeFn).toHaveBeenCalledWith({ query: "x" }, {});
    expect(result.results).toHaveLength(1);
    expect(result.results[0].success).toBe(true);
    expect(result.errors).toEqual([]);
  });

  it("executes a single step using the legacy params format", async () => {
    const { registry, executor } = createExecutor();
    const executeFn = vi.fn().mockResolvedValue("ok");
    registry.register({ name: "tool", execute: executeFn });

    const result = await executor.executePlan([
      { tool: "tool", params: { a: 1 } },
    ]);

    expect(executeFn).toHaveBeenCalledWith({ a: 1 }, {});
    expect(result.results[0].success).toBe(true);
  });

  it("executes multiple tools in order", async () => {
    const { registry, executor } = createExecutor();
    const order = [];
    registry.register({
      name: "a",
      execute: async () => {
        order.push("a");
        return "a";
      },
    });
    registry.register({
      name: "b",
      execute: async () => {
        order.push("b");
        return "b";
      },
    });
    registry.register({
      name: "c",
      execute: async () => {
        order.push("c");
        return "c";
      },
    });

    const result = await executor.executePlan([
      { tool: "a", input: {} },
      { tool: "b", input: {} },
      { tool: "c", input: {} },
    ]);

    expect(order).toEqual(["a", "b", "c"]);
    expect(result.results.map((r) => r.toolName)).toEqual(["a", "b", "c"]);
  });

  it("isolates a failing tool without aborting the plan", async () => {
    const { registry, executor } = createExecutor();
    registry.register({ name: "good", execute: async () => "ok" });
    registry.register({
      name: "bad",
      execute: async () => {
        throw new Error("boom");
      },
    });
    registry.register({ name: "last", execute: async () => "last" });

    const result = await executor.executePlan([
      { tool: "good", input: {} },
      { tool: "bad", input: {} },
      { tool: "last", input: {} },
    ]);

    expect(result.results[0].success).toBe(true);
    expect(result.results[1].success).toBe(false);
    expect(result.results[1].error).toBe("boom");
    expect(result.results[2].success).toBe(true);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0].toolName).toBe("bad");
  });

  it("denies tools not in allowedTools without executing them", async () => {
    const { registry, executor } = createExecutor();
    const executeFn = vi.fn().mockResolvedValue("secret");
    registry.register({ name: "secret", execute: executeFn });
    registry.register({ name: "open", execute: async () => "ok" });

    const result = await executor.executePlan(
      [
        { tool: "secret", input: {} },
        { tool: "open", input: {} },
      ],
      {},
      { allowedTools: ["open"] },
    );

    expect(executeFn).not.toHaveBeenCalled();
    expect(result.results[0].success).toBe(false);
    expect(result.results[0].error).toContain("not allowed");
    expect(result.results[1].success).toBe(true);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0].toolName).toBe("secret");
  });

  it("reports unknown tools as errors and continues", async () => {
    const { registry, executor } = createExecutor();
    registry.register({ name: "real", execute: async () => "ok" });

    const result = await executor.executePlan([
      { tool: "ghost", input: {} },
      { tool: "real", input: {} },
    ]);

    expect(result.results[0].success).toBe(false);
    expect(result.results[0].error).toContain("not found");
    expect(result.results[1].success).toBe(true);
    expect(result.errors).toHaveLength(1);
  });

  it("enforces timeoutMs per step", async () => {
    const { registry, executor } = createExecutor();
    registry.register({
      name: "slow",
      execute: async () => {
        await new Promise((r) => setTimeout(r, 300));
        return "done";
      },
    });
    registry.register({ name: "fast", execute: async () => "fast" });

    const result = await executor.executePlan(
      [
        { tool: "slow", input: {} },
        { tool: "fast", input: {} },
      ],
      {},
      { timeoutMs: 30 },
    );

    expect(result.results[0].success).toBe(false);
    expect(result.results[0].error).toContain("timed out");
    expect(result.results[1].success).toBe(true);
    expect(result.errors).toHaveLength(1);
  });

  it("passes context through to every step", async () => {
    const { registry, executor } = createExecutor();
    const executeFn = vi.fn().mockResolvedValue("ok");
    registry.register({ name: "t", execute: executeFn });

    await executor.executePlan([{ tool: "t", input: { q: 1 } }], {
      sessionId: "s1",
    });

    expect(executeFn).toHaveBeenCalledWith({ q: 1 }, { sessionId: "s1" });
  });

  it("accumulates metrics through execute", async () => {
    const registry = new ToolRegistry();
    const mc = new MetricsCollector();
    const executor = new ToolExecutor({
      toolRegistry: registry,
      metricsCollector: mc,
    });
    registry.register({ name: "a", execute: async () => "a" });
    registry.register({ name: "b", execute: async () => "b" });

    const result = await executor.executePlan([
      { tool: "a", input: {} },
      { tool: "b", input: {} },
    ]);

    expect(executor.getMetrics().executed).toBe(2);
    expect(mc.snapshot().engine.tools).toBe(2);
    expect(result.errors).toEqual([]);
  });
});
