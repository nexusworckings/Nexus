import { describe, it, expect, vi } from "vitest";
import { ToolExecutor } from "./tool-executor.js";
import { ToolRegistry } from "./tool-registry.js";

describe("ToolExecutor.executePlan — dependencies & parallelism", () => {
  function createExecutor() {
    const registry = new ToolRegistry();
    const executor = new ToolExecutor({ toolRegistry: registry });
    return { registry, executor };
  }

  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  it("runs independent parallel steps concurrently", async () => {
    const { registry, executor } = createExecutor();
    registry.register({
      name: "a",
      execute: async () => {
        await sleep(50);
        return "a";
      },
    });
    registry.register({
      name: "b",
      execute: async () => {
        await sleep(50);
        return "b";
      },
    });

    const start = Date.now();
    const result = await executor.executePlan([
      { id: "a", tool: "a", input: {}, dependsOn: [], parallel: true },
      { id: "b", tool: "b", input: {}, dependsOn: [], parallel: true },
    ]);
    const elapsed = Date.now() - start;

    expect(elapsed).toBeLessThan(90);
    expect(result.results.map((r) => r.data)).toEqual(["a", "b"]);
    expect(result.errors).toEqual([]);
  });

  it("keeps legacy steps sequential in order (backward compat)", async () => {
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

    await executor.executePlan([
      { tool: "a", input: {} },
      { tool: "b", input: {} },
      { tool: "c", input: {} },
    ]);

    expect(order).toEqual(["a", "b", "c"]);
  });

  it("executes a chain: dependent step waits for its dependency", async () => {
    const { registry, executor } = createExecutor();
    const events = [];
    registry.register({
      name: "fetch",
      execute: async () => {
        events.push("fetch-start");
        events.push("fetch-end");
        return "data";
      },
    });
    registry.register({
      name: "use",
      execute: async () => {
        events.push("use-start");
        events.push("use-end");
        return "used";
      },
    });

    await executor.executePlan([
      { id: "f", tool: "fetch", input: {}, dependsOn: [], parallel: true },
      { id: "u", tool: "use", input: {}, dependsOn: ["f"], parallel: false },
    ]);

    expect(events.indexOf("use-start")).toBeGreaterThan(
      events.indexOf("fetch-end"),
    );
  });

  it("runs both dependencies in parallel, then the dependent step", async () => {
    const { registry, executor } = createExecutor();
    const events = [];
    registry.register({
      name: "price",
      execute: async () => {
        await sleep(40);
        events.push("price-end");
        return "p";
      },
    });
    registry.register({
      name: "info",
      execute: async () => {
        await sleep(40);
        events.push("info-end");
        return "i";
      },
    });
    registry.register({
      name: "appt",
      execute: async () => {
        events.push("appt-start");
        return "a";
      },
    });

    await executor.executePlan([
      { id: "price", tool: "price", input: {}, dependsOn: [], parallel: true },
      { id: "info", tool: "info", input: {}, dependsOn: [], parallel: true },
      {
        id: "appt",
        tool: "appt",
        input: {},
        dependsOn: ["price", "info"],
        parallel: false,
      },
    ]);

    expect(events[2]).toBe("appt-start");
    expect(events.slice(0, 2).sort()).toEqual(["info-end", "price-end"]);
  });

  it("serializes a parallel:false step after concurrent steps in its wave", async () => {
    const { registry, executor } = createExecutor();
    const events = [];
    registry.register({
      name: "p",
      execute: async () => {
        await sleep(30);
        events.push("p");
        return "p";
      },
    });
    registry.register({
      name: "s",
      execute: async () => {
        events.push("s");
        return "s";
      },
    });

    await executor.executePlan([
      { id: "s", tool: "s", input: {}, dependsOn: [], parallel: false },
      { id: "p", tool: "p", input: {}, dependsOn: [], parallel: true },
    ]);

    expect(events).toEqual(["p", "s"]);
  });

  it("does not abort the plan when a dependency fails", async () => {
    const { registry, executor } = createExecutor();
    registry.register({
      name: "boom",
      execute: async () => {
        throw new Error("x");
      },
    });
    registry.register({ name: "after", execute: async () => "ok" });

    const result = await executor.executePlan([
      { id: "b", tool: "boom", input: {}, dependsOn: [], parallel: true },
      { id: "a", tool: "after", input: {}, dependsOn: ["b"], parallel: false },
    ]);

    expect(result.results[0].success).toBe(false);
    expect(result.results[0].error).toBe("x");
    expect(result.results[1].success).toBe(true);
    expect(result.errors).toHaveLength(1);
  });

  it("errors on unknown dependencies but runs the rest of the plan", async () => {
    const { registry, executor } = createExecutor();
    registry.register({ name: "real", execute: async () => "ok" });
    registry.register({ name: "other", execute: async () => "ok2" });

    const result = await executor.executePlan([
      {
        id: "x",
        tool: "real",
        input: {},
        dependsOn: ["ghost"],
        parallel: false,
      },
      { id: "y", tool: "other", input: {}, dependsOn: [], parallel: true },
    ]);

    expect(result.results[0].success).toBe(false);
    expect(result.results[0].error).toContain('unresolved step "ghost"');
    expect(result.results[1].success).toBe(true);
    expect(result.errors).toHaveLength(1);
  });

  it("detects dependency cycles without hanging", async () => {
    const { registry, executor } = createExecutor();
    registry.register({ name: "ta", execute: async () => "a" });
    registry.register({ name: "tb", execute: async () => "b" });

    const result = await executor.executePlan([
      { id: "a", tool: "ta", input: {}, dependsOn: ["b"], parallel: false },
      { id: "b", tool: "tb", input: {}, dependsOn: ["a"], parallel: false },
    ]);

    expect(result.results[0].success).toBe(false);
    expect(result.results[1].success).toBe(false);
    expect(result.errors).toHaveLength(2);
    expect(result.results[0].error).toContain("unresolved step");
  });

  it("counts a profile-denied step as resolved so dependents still run", async () => {
    const { registry, executor } = createExecutor();
    const executeFn = vi.fn().mockResolvedValue("secret");
    registry.register({ name: "secret", execute: executeFn });
    registry.register({ name: "consume", execute: async () => "c" });

    const result = await executor.executePlan(
      [
        { id: "s", tool: "secret", input: {}, dependsOn: [], parallel: true },
        {
          id: "c",
          tool: "consume",
          input: {},
          dependsOn: ["s"],
          parallel: false,
        },
      ],
      {},
      { allowedTools: ["consume"] },
    );

    expect(executeFn).not.toHaveBeenCalled();
    expect(result.results[0].success).toBe(false);
    expect(result.results[0].error).toContain("not allowed");
    expect(result.results[1].success).toBe(true);
    expect(result.errors).toHaveLength(1);
  });

  it("applies timeoutMs to dependency steps and continues", async () => {
    const { registry, executor } = createExecutor();
    registry.register({
      name: "slow",
      execute: async () => {
        await sleep(200);
        return "done";
      },
    });
    registry.register({ name: "next", execute: async () => "next" });

    const result = await executor.executePlan(
      [
        { id: "s", tool: "slow", input: {}, dependsOn: [], parallel: false },
        { id: "n", tool: "next", input: {}, dependsOn: ["s"], parallel: false },
      ],
      {},
      { timeoutMs: 30 },
    );

    expect(result.results[0].success).toBe(false);
    expect(result.results[0].error).toContain("timed out");
    expect(result.results[1].success).toBe(true);
    expect(result.errors).toHaveLength(1);
  });

  it("aligns results with input order even when steps run in parallel", async () => {
    const { registry, executor } = createExecutor();
    registry.register({ name: "z", execute: async () => "z" });
    registry.register({ name: "a", execute: async () => "a" });
    registry.register({ name: "m", execute: async () => "m" });

    const result = await executor.executePlan([
      { id: "z", tool: "z", input: {}, dependsOn: [], parallel: true },
      { id: "a", tool: "a", input: {}, dependsOn: [], parallel: true },
      { id: "m", tool: "m", input: {}, dependsOn: ["z"], parallel: false },
    ]);

    expect(result.results.map((r) => r.toolName)).toEqual(["z", "a", "m"]);
  });

  it("passes context through unchanged to every tool", async () => {
    const { registry, executor } = createExecutor();
    const executeFn = vi.fn().mockResolvedValue("ok");
    registry.register({ name: "t", execute: executeFn });

    await executor.executePlan(
      [{ id: "t", tool: "t", input: { q: 1 }, dependsOn: [], parallel: true }],
      { sessionId: "s1" },
    );

    expect(executeFn).toHaveBeenCalledWith({ q: 1 }, { sessionId: "s1" });
  });

  it("works with legacy steps that have no id (auto-generated)", async () => {
    const { registry, executor } = createExecutor();
    registry.register({ name: "t", execute: async () => "ok" });

    const result = await executor.executePlan([{ tool: "t", input: {} }]);

    expect(result.results[0].success).toBe(true);
    expect(result.errors).toEqual([]);
  });
});
