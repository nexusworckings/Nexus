import { describe, it, expect, vi } from "vitest";
import { ToolExecutor } from "./tool-executor.js";
import { ToolRegistry } from "./tool-registry.js";

describe("ToolExecutor validation integration (plan level)", () => {
  it("blocks a step with invalid args and never executes the tool", async () => {
    const registry = new ToolRegistry();
    const executor = new ToolExecutor({ toolRegistry: registry });
    const executeFn = vi.fn().mockResolvedValue("secret");
    registry.register({
      name: "searchClient",
      inputSchema: { query: { type: "string", required: true } },
      execute: executeFn,
    });

    const result = await executor.executePlan([
      { id: "s1", tool: "searchClient", params: { query: 123 } },
      { id: "s2", tool: "searchClient", params: {} },
    ]);

    expect(executeFn).not.toHaveBeenCalled();
    expect(result.results).toHaveLength(2);
    expect(result.results[0].success).toBe(false);
    expect(result.results[0].errorCode).toBe("INVALID_ARGUMENTS");
    expect(result.results[0].error).toContain("expected string");
    expect(result.results[1].success).toBe(false);
    expect(result.results[1].errorCode).toBe("INVALID_ARGUMENTS");
    expect(result.results[1].error).toContain("Missing required");
    expect(result.errors).toHaveLength(2);
  });

  it("keeps one invalid step from aborting the rest of the plan", async () => {
    const registry = new ToolRegistry();
    const executor = new ToolExecutor({ toolRegistry: registry });
    registry.register({
      name: "searchStock",
      inputSchema: { query: { type: "string", required: true } },
      execute: async () => ({ results: [] }),
    });
    registry.register({
      name: "sendWhatsApp",
      inputSchema: {
        phone: { type: "string", required: true },
        message: { type: "string", required: true },
      },
      execute: async () => ({ success: true }),
    });

    const result = await executor.executePlan([
      { id: "s1", tool: "searchStock", params: { query: "" } },
      { id: "s2", tool: "sendWhatsApp", params: { phone: "549264" } },
      {
        id: "s3",
        tool: "sendWhatsApp",
        params: { phone: "549264", message: "Hola" },
      },
    ]);

    expect(result.results[0].success).toBe(false);
    expect(result.results[0].errorCode).toBe("INVALID_ARGUMENTS");
    expect(result.results[0].issues[0].code).toBe("EMPTY_REQUIRED");
    expect(result.results[1].success).toBe(false);
    expect(result.results[1].errorCode).toBe("INVALID_ARGUMENTS");
    expect(result.results[1].error).toContain("Missing required");
    expect(result.results[2].success).toBe(true);
    expect(result.errors).toHaveLength(2);
  });

  it("distinguishes EMPTY_RESULT, INVALID_ARGUMENTS, TOOL_ERROR and TOOL_NOT_FOUND in one plan", async () => {
    const registry = new ToolRegistry();
    const executor = new ToolExecutor({ toolRegistry: registry });
    registry.register({
      name: "searchProduct",
      inputSchema: { query: { type: "string", required: true } },
      execute: async () => ({ results: [] }),
    });
    registry.register({
      name: "crashing",
      inputSchema: { q: { type: "string", required: true } },
      execute: async () => {
        throw new Error("boom");
      },
    });

    const result = await executor.executePlan([
      { id: "empty", tool: "searchProduct", params: { query: "xx" } },
      { id: "badargs", tool: "searchProduct", params: {} },
      { id: "tlerr", tool: "crashing", params: { q: "x" } },
      { id: "ghost", tool: "nope", params: {} },
    ]);

    expect(result.results).toHaveLength(4);
    expect(result.results[0].success).toBe(true);
    expect(result.results[0].empty).toBe(true);
    expect(result.results[1].success).toBe(false);
    expect(result.results[1].errorCode).toBe("INVALID_ARGUMENTS");
    expect(result.results[2].success).toBe(false);
    expect(result.results[2].errorCode).toBe("TOOL_ERROR");
    expect(result.results[3].success).toBe(false);
    expect(result.results[3].errorCode).toBe("TOOL_NOT_FOUND");
    expect(result.errors).toHaveLength(3);
  });
});
