import { describe, it, expect, vi } from "vitest";
import { ToolExecutor } from "./tool-executor.js";
import { ToolRegistry } from "./tool-registry.js";
import { MetricsCollector } from "./observability.js";

describe("ToolExecutor Integration", () => {
  it("executes tool with metrics collector", async () => {
    const registry = new ToolRegistry();
    const mc = new MetricsCollector();
    const executor = new ToolExecutor({
      toolRegistry: registry,
      metricsCollector: mc,
    });

    registry.register({ name: "test", execute: async () => "result" });
    await executor.execute("test");

    const metrics = mc.snapshot();
    expect(metrics.engine.tools).toBe(1);
  });

  it("tracks duration", async () => {
    const registry = new ToolRegistry();
    const mc = new MetricsCollector();
    const executor = new ToolExecutor({
      toolRegistry: registry,
      metricsCollector: mc,
    });

    registry.register({
      name: "slow",
      execute: async () => {
        await new Promise((r) => setTimeout(r, 30));
        return "done";
      },
    });
    await executor.execute("slow");

    const toolMetrics = mc.snapshot().byTool.slow;
    // Date.now() tiene resolución de 1ms: 30ms de sleep se miden de forma estable.
    expect(toolMetrics.totalDuration).toBeGreaterThanOrEqual(25);
  });

  it("validates required params through executor", async () => {
    const registry = new ToolRegistry();
    const executor = new ToolExecutor({ toolRegistry: registry });

    registry.register({
      name: "strict",
      inputSchema: {
        name: { type: "string", required: true },
        age: { type: "number", required: true },
      },
      execute: async (p) => `${p.name} is ${p.age}`,
    });

    const result = await executor.execute("strict", { name: "Juan" });
    expect(result.success).toBe(false);
    expect(result.error).toContain("Missing required");

    const result2 = await executor.execute("strict", { name: "Juan", age: 30 });
    expect(result2.success).toBe(true);
    expect(result2.data).toBe("Juan is 30");
  });

  it("passes context to tool execution", async () => {
    const registry = new ToolRegistry();
    const executor = new ToolExecutor({ toolRegistry: registry });
    const executeFn = vi.fn().mockResolvedValue("ok");
    registry.register({ name: "ctxTool", execute: executeFn });

    await executor.execute(
      "ctxTool",
      { x: 1 },
      { sessionId: "s1", clientId: "c1" },
    );
    expect(executeFn).toHaveBeenCalledWith(
      { x: 1 },
      { sessionId: "s1", clientId: "c1" },
    );
  });

  it("handles tool that returns undefined", async () => {
    const registry = new ToolRegistry();
    const executor = new ToolExecutor({ toolRegistry: registry });
    registry.register({ name: "void", execute: async () => undefined });

    const result = await executor.execute("void");
    expect(result.success).toBe(true);
    expect(result.data).toBeUndefined();
  });

  it("accumulates metrics across calls", async () => {
    const registry = new ToolRegistry();
    const executor = new ToolExecutor({ toolRegistry: registry });
    registry.register({ name: "counted", execute: async () => "ok" });

    await executor.execute("counted");
    await executor.execute("counted");
    await executor.execute("counted");

    const m = executor.getMetrics();
    expect(m.executed).toBe(3);
    expect(m.succeeded).toBe(3);
  });

  it("tracks per-tool metrics", async () => {
    const registry = new ToolRegistry();
    const executor = new ToolExecutor({ toolRegistry: registry });
    registry.register({ name: "a", execute: async () => "a" });
    registry.register({ name: "b", execute: async () => "b" });

    await executor.execute("a");
    await executor.execute("b");
    await executor.execute("a");

    const m = executor.getMetrics();
    expect(m.byTool.a.executed).toBe(2);
    expect(m.byTool.b.executed).toBe(1);
  });

  it("reset clears metrics", async () => {
    const registry = new ToolRegistry();
    const executor = new ToolExecutor({ toolRegistry: registry });
    registry.register({ name: "r", execute: async () => "r" });
    await executor.execute("r");
    executor.resetMetrics();
    expect(executor.getMetrics().executed).toBe(0);
  });
});
