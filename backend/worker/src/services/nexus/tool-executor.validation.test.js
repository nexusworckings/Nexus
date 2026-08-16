import { describe, it, expect, vi } from "vitest";
import { ToolExecutor } from "./tool-executor.js";
import { ToolRegistry } from "./tool-registry.js";

function makeRegistry(tools = []) {
  const r = new ToolRegistry();
  for (const t of tools) r.register(t);
  return r;
}

function makeExecutor(tool) {
  const exec = new ToolExecutor({
    toolRegistry: makeRegistry(tool ? [tool] : []),
  });
  return exec;
}

describe("ToolExecutor argument validation contract", () => {
  it("returns TOOL_NOT_FOUND for an unknown tool", async () => {
    const exec = makeExecutor();
    const result = await exec.execute("ghost");
    expect(result.success).toBe(false);
    expect(result.errorCode).toBe("TOOL_NOT_FOUND");
    expect(result.error).toContain("not found");
    expect(result.toolName).toBe("ghost");
  });

  it("accepts all required params present with the right types", async () => {
    const tool = {
      name: "t",
      inputSchema: {
        name: { type: "string", required: true },
        age: { type: "number", required: true },
      },
      execute: vi.fn().mockResolvedValue("ok"),
    };
    const exec = makeExecutor(tool);
    const result = await exec.execute("t", { name: "Juan", age: 30 });
    expect(result.success).toBe(true);
    expect(tool.execute).toHaveBeenCalledWith({ name: "Juan", age: 30 }, {});
  });

  it("rejects a required param that is undefined", async () => {
    const tool = {
      name: "t",
      inputSchema: { name: { type: "string", required: true } },
      execute: vi.fn().mockResolvedValue("ok"),
    };
    const exec = makeExecutor(tool);
    const result = await exec.execute("t", {});
    expect(result.success).toBe(false);
    expect(result.errorCode).toBe("INVALID_ARGUMENTS");
    expect(result.error).toBe("Missing required parameter: name");
    expect(result.issues).toHaveLength(1);
    expect(result.issues[0]).toEqual({
      path: "name",
      code: "MISSING_REQUIRED",
      message: "Missing required parameter: name",
    });
    expect(tool.execute).not.toHaveBeenCalled();
  });

  it("rejects a required param that is null", async () => {
    const tool = {
      name: "t",
      inputSchema: { query: { type: "string", required: true } },
      execute: vi.fn().mockResolvedValue("ok"),
    };
    const exec = makeExecutor(tool);
    const result = await exec.execute("t", { query: null });
    expect(result.success).toBe(false);
    expect(result.errorCode).toBe("INVALID_ARGUMENTS");
    expect(result.error).toContain("Missing required");
  });

  it("treats undefined and null on optional params as absent", async () => {
    const tool = {
      name: "t",
      inputSchema: { status: { type: "string" } },
      execute: vi.fn().mockResolvedValue("ok"),
    };
    const exec = makeExecutor(tool);
    const ok1 = await exec.execute("t", {});
    const ok2 = await exec.execute("t", { status: null });
    expect(ok1.success).toBe(true);
    expect(ok2.success).toBe(true);
  });

  it("rejects a required string param that is empty", async () => {
    const tool = {
      name: "t",
      inputSchema: { query: { type: "string", required: true } },
      execute: vi.fn().mockResolvedValue("ok"),
    };
    const exec = makeExecutor(tool);
    const result = await exec.execute("t", { query: "" });
    expect(result.success).toBe(false);
    expect(result.errorCode).toBe("INVALID_ARGUMENTS");
    expect(result.issues[0].code).toBe("EMPTY_REQUIRED");
    expect(tool.execute).not.toHaveBeenCalled();
  });

  it("rejects a type mismatch for string", async () => {
    const tool = {
      name: "t",
      inputSchema: { q: { type: "string", required: true } },
      execute: vi.fn().mockResolvedValue("ok"),
    };
    const exec = makeExecutor(tool);
    const result = await exec.execute("t", { q: 42 });
    expect(result.success).toBe(false);
    expect(result.errorCode).toBe("INVALID_ARGUMENTS");
    expect(result.error).toContain("expected string, got number");
    expect(tool.execute).not.toHaveBeenCalled();
  });

  it("rejects a type mismatch for number", async () => {
    const tool = {
      name: "t",
      inputSchema: { limit: { type: "number", required: true } },
      execute: vi.fn().mockResolvedValue("ok"),
    };
    const exec = makeExecutor(tool);
    const result = await exec.execute("t", { limit: "10" });
    expect(result.success).toBe(false);
    expect(result.errorCode).toBe("INVALID_ARGUMENTS");
    expect(result.error).toContain("expected number, got string");
  });

  it("rejects a type mismatch for boolean", async () => {
    const tool = {
      name: "t",
      inputSchema: { confirmed: { type: "boolean", required: true } },
      execute: vi.fn().mockResolvedValue("ok"),
    };
    const exec = makeExecutor(tool);
    const result = await exec.execute("t", { confirmed: "true" });
    expect(result.success).toBe(false);
    expect(result.errorCode).toBe("INVALID_ARGUMENTS");
    expect(result.error).toContain("expected boolean, got string");
  });

  it("accepts a valid array param", async () => {
    const tool = {
      name: "t",
      inputSchema: { phones: { type: "array", required: true } },
      execute: vi.fn().mockResolvedValue("ok"),
    };
    const exec = makeExecutor(tool);
    const result = await exec.execute("t", { phones: ["5492645555"] });
    expect(result.success).toBe(true);
    expect(tool.execute).toHaveBeenCalledWith({ phones: ["5492645555"] }, {});
  });

  it("rejects an array param that is not an array", async () => {
    const tool = {
      name: "t",
      inputSchema: { phones: { type: "array", required: true } },
      execute: vi.fn().mockResolvedValue("ok"),
    };
    const exec = makeExecutor(tool);
    const result = await exec.execute("t", { phones: "5492645555" });
    expect(result.success).toBe(false);
    expect(result.errorCode).toBe("INVALID_ARGUMENTS");
    expect(result.error).toContain("expected array, got string");
  });

  it("accepts a plain object but rejects an array for object params", async () => {
    const objectTool = {
      name: "obj",
      inputSchema: { data: { type: "object", required: true } },
      execute: vi.fn().mockResolvedValue("ok"),
    };
    const exec = makeExecutor(objectTool);
    const ok = await exec.execute("obj", { data: { name: "Juan" } });
    expect(ok.success).toBe(true);

    const bad = await exec.execute("obj", { data: ["a", "b"] });
    expect(bad.success).toBe(false);
    expect(bad.errorCode).toBe("INVALID_ARGUMENTS");
    expect(bad.error).toContain("expected object, got array");
  });

  it("rejects values outside the declared enum", async () => {
    const tool = {
      name: "t",
      inputSchema: {
        status: {
          type: "string",
          required: true,
          enum: ["Pendiente", "Finalizado"],
        },
      },
      execute: vi.fn().mockResolvedValue("ok"),
    };
    const exec = makeExecutor(tool);
    const ok = await exec.execute("t", { status: "Finalizado" });
    expect(ok.success).toBe(true);

    const bad = await exec.execute("t", { status: "Invisible" });
    expect(bad.success).toBe(false);
    expect(bad.errorCode).toBe("INVALID_ARGUMENTS");
    expect(bad.issues[0].code).toBe("INVALID_ENUM");
    expect(tool.execute).toHaveBeenCalledTimes(1);
  });

  it("ignores unknown extra args but still validates the declared ones", async () => {
    const tool = {
      name: "t",
      inputSchema: { query: { type: "string", required: true } },
      execute: vi.fn().mockResolvedValue("ok"),
    };
    const exec = makeExecutor(tool);
    const result = await exec.execute("t", {
      query: "pla",
      extra: "ignored",
      other: 42,
    });
    expect(result.success).toBe(true);
    expect(tool.execute).toHaveBeenCalledWith(
      { query: "pla", extra: "ignored", other: 42 },
      {},
    );
  });

  it("reports all validation issues, not only the first one", async () => {
    const tool = {
      name: "t",
      inputSchema: {
        a: { type: "string", required: true },
        b: { type: "number", required: true },
      },
      execute: vi.fn().mockResolvedValue("ok"),
    };
    const exec = makeExecutor(tool);
    const result = await exec.execute("t", {});
    expect(result.success).toBe(false);
    expect(result.issues).toHaveLength(2);
    expect(result.issues.map((i) => i.path)).toEqual(["a", "b"]);
    expect(result.error).toBe(result.issues[0].message);
  });

  it("returns EMPTY_RESULT (success true + empty flag) for empty data.results", async () => {
    const tool = {
      name: "empty",
      execute: vi.fn().mockResolvedValue({ results: [] }),
    };
    const exec = makeExecutor(tool);
    const result = await exec.execute("empty");
    expect(result.success).toBe(true);
    expect(result.empty).toBe(true);
    expect(result.data).toEqual({ results: [] });
  });

  it("does not mark non-empty results or non-array data as empty", async () => {
    const nonEmpty = {
      name: "nonEmpty",
      execute: vi.fn().mockResolvedValue({ results: [1] }),
    };
    const nonArray = {
      name: "nonArray",
      execute: vi.fn().mockResolvedValue({ results: { topic: "x" } }),
    };
    const registry = new ToolRegistry();
    registry.register(nonEmpty);
    registry.register(nonArray);
    const e2 = new ToolExecutor({ toolRegistry: registry });
    const r1 = await e2.execute("nonEmpty");
    const r2 = await e2.execute("nonArray");
    expect(r1.success).toBe(true);
    expect(r1.empty).toBeUndefined();
    expect(r2.success).toBe(true);
    expect(r2.empty).toBeUndefined();
  });

  it("returns TOOL_ERROR with structured code when execution throws", async () => {
    const tool = {
      name: "boom",
      inputSchema: { q: { type: "string", required: true } },
      execute: vi.fn().mockRejectedValue(new Error("DB down")),
    };
    const exec = makeExecutor(tool);
    const result = await exec.execute("boom", { q: "x" });
    expect(result.success).toBe(false);
    expect(result.errorCode).toBe("TOOL_ERROR");
    expect(result.error).toBe("DB down");
    expect(tool.execute).toHaveBeenCalledTimes(1);
  });

  it("returns NOT_ALLOWED through executePlan without executing", async () => {
    const tool = {
      name: "secret",
      inputSchema: { q: { type: "string", required: true } },
      execute: vi.fn().mockResolvedValue("secret"),
    };
    const exec = makeExecutor(tool);
    const result = await exec.executePlan(
      [{ id: "s1", tool: "secret", params: { q: "x" } }],
      {},
      { allowedTools: ["other"] },
    );
    expect(result.results[0].success).toBe(false);
    expect(result.results[0].errorCode).toBe("NOT_ALLOWED");
    expect(result.results[0].error).toContain("not allowed");
    expect(tool.execute).not.toHaveBeenCalled();
  });

  it("skips validation when the tool declares no inputSchema", async () => {
    const tool = { name: "free", execute: vi.fn().mockResolvedValue("ok") };
    const exec = makeExecutor(tool);
    const result = await exec.execute("free", { anything: "goes" });
    expect(result.success).toBe(true);
  });
});
