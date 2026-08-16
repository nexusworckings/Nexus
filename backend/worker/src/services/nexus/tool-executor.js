import { ReferenceResolver } from "./reference-resolver.js";

export class ToolExecutor {
  #registry;
  #metrics;
  #metricsCollector;
  #referenceResolver;

  constructor(options = {}) {
    this.#registry = options.toolRegistry;
    if (!this.#registry)
      throw new Error("ToolExecutor: toolRegistry is required");
    this.#metrics = { executed: 0, succeeded: 0, failed: 0, byTool: {} };
    this.#metricsCollector = options.metricsCollector || null;
    this.#referenceResolver = new ReferenceResolver();
  }

  async execute(toolName, params = {}, context = {}) {
    const start = Date.now();
    const tool = this.#registry.get(toolName);
    if (!tool) {
      this.#track(toolName, start, false, `Tool "${toolName}" not found`);
      return {
        success: false,
        error: `Tool "${toolName}" not found`,
        errorCode: "TOOL_NOT_FOUND",
        toolName,
      };
    }

    const validation = this.#validateParams(tool, params);
    if (!validation.valid) {
      this.#track(toolName, start, false, validation.error);
      return {
        success: false,
        error: validation.error,
        errorCode: "INVALID_ARGUMENTS",
        issues: validation.issues,
        toolName,
      };
    }

    this.#metrics.executed++;
    this.#metrics.byTool[toolName] = this.#metrics.byTool[toolName] || {
      executed: 0,
      succeeded: 0,
      failed: 0,
    };
    this.#metrics.byTool[toolName].executed++;

    try {
      const result = await tool.execute(params, context);
      this.#metrics.succeeded++;
      this.#metrics.byTool[toolName].succeeded++;
      this.#track(toolName, start, true);
      const outcome = { success: true, data: result, toolName };
      if (
        result &&
        typeof result === "object" &&
        Array.isArray(result.results) &&
        result.results.length === 0
      ) {
        outcome.empty = true;
      }
      return outcome;
    } catch (err) {
      this.#metrics.failed++;
      this.#metrics.byTool[toolName].failed++;
      this.#track(toolName, start, false, err.message);
      return {
        success: false,
        error: err.message,
        errorCode: "TOOL_ERROR",
        toolName,
      };
    }
  }

  async executePlan(steps = [], context = {}, options = {}) {
    const allowedTools = options.allowedTools || null;
    const timeoutMs = options.timeoutMs || 0;

    const normalized = (steps || []).map((step, index) => ({
      id: step?.id || `step-${index}`,
      tool: step?.tool,
      params: step?.params || step?.input || {},
      dependsOn: Array.isArray(step?.dependsOn) ? step.dependsOn.slice() : [],
      parallel: step?.parallel === true,
    }));

    const knownIds = new Set(normalized.map((s) => s.id));
    const resultById = new Map();
    const resolved = new Set();
    let remaining = normalized;
    const workingMemory = new Map();

    while (remaining.length > 0) {
      const ready = remaining.filter((s) =>
        s.dependsOn.every((d) => resolved.has(d)),
      );
      if (ready.length === 0) break;

      const run = async (step) => {
        let outcome;
        try {
          const params = this.#resolveStepInput(
            step.params,
            workingMemory,
            step.id,
          );
          outcome = await this.#runStep({ ...step, params }, context, {
            allowedTools,
            timeoutMs,
          });
        } catch (err) {
          outcome = {
            toolName: step.tool,
            success: false,
            error: err.message,
          };
        }
        resultById.set(step.id, outcome);
        if (outcome.success && outcome.data !== undefined) {
          workingMemory.set(step.id, {
            tool: step.tool,
            result: outcome.data,
          });
        }
        resolved.add(step.id);
      };

      const concurrent = ready.filter((s) => s.parallel);
      const serial = ready.filter((s) => !s.parallel);

      await Promise.all(concurrent.map(run));
      for (const step of serial) await run(step);

      const executedIds = new Set([...concurrent, ...serial].map((s) => s.id));
      remaining = remaining.filter((s) => !executedIds.has(s.id));
    }

    for (const step of remaining) {
      const missing = step.dependsOn.find(
        (d) => !knownIds.has(d) || !resolved.has(d),
      );
      resultById.set(step.id, {
        toolName: step.tool,
        success: false,
        error: missing
          ? `Step "${step.id}" depends on unresolved step "${missing}"`
          : `Plan deadlock at step "${step.id}": dependencies not resolvable`,
      });
    }

    const results = normalized.map(
      (s) =>
        resultById.get(s.id) || {
          toolName: s.tool,
          success: false,
          error: `Step "${s.id}" was not executed`,
        },
    );
    const errors = results.filter((r) => !r.success);
    return { results, errors };
  }

  async #runStep(step, context, { allowedTools, timeoutMs }) {
    const { tool: toolName, params } = step;
    if (allowedTools && !allowedTools.includes(toolName)) {
      return {
        toolName,
        success: false,
        errorCode: "NOT_ALLOWED",
        error: "Tool not allowed by profile",
      };
    }
    if (timeoutMs > 0) {
      return this.#executeWithTimeout(toolName, params, context, timeoutMs);
    }
    return this.execute(toolName, params, context);
  }

  #resolveStepInput(params, workingMemory, stepId) {
    return this.#referenceResolver.resolveInput(params, {
      memory: workingMemory,
      currentStepId: stepId,
    });
  }

  async #executeWithTimeout(toolName, params, context, timeoutMs) {
    let timer;
    try {
      return await Promise.race([
        this.execute(toolName, params, context),
        new Promise((_, reject) => {
          timer = setTimeout(
            () =>
              reject(
                new Error(`Tool "${toolName}" timed out after ${timeoutMs}ms`),
              ),
            timeoutMs,
          );
        }),
      ]);
    } catch (err) {
      return {
        success: false,
        error: err.message,
        errorCode: "TOOL_ERROR",
        toolName,
      };
    } finally {
      if (timer) clearTimeout(timer);
    }
  }

  #track(toolName, start, success, error) {
    const duration = Date.now() - start;
    this.#metricsCollector?.recordToolExecution(
      toolName,
      duration,
      success,
      error,
    );
  }

  getMetrics() {
    return { ...this.#metrics, byTool: { ...this.#metrics.byTool } };
  }

  resetMetrics() {
    this.#metrics = { executed: 0, succeeded: 0, failed: 0, byTool: {} };
  }

  #validateParams(tool, params) {
    if (!tool.inputSchema) return { valid: true };
    const issues = [];
    for (const [key, rule] of Object.entries(tool.inputSchema)) {
      const value = params[key];
      const present = value !== undefined && value !== null;
      if (rule.required && !present) {
        issues.push({
          path: key,
          code: "MISSING_REQUIRED",
          message: `Missing required parameter: ${key}`,
        });
        continue;
      }
      if (!present) continue;
      if (rule.type && !this.#matchesType(value, rule.type)) {
        issues.push({
          path: key,
          code: "INVALID_TYPE",
          message: `Parameter "${key}" expected ${rule.type}, got ${this.#describeType(
            value,
          )}`,
        });
        continue;
      }
      if (rule.type === "string" && rule.required && value === "") {
        issues.push({
          path: key,
          code: "EMPTY_REQUIRED",
          message: `Parameter "${key}" is required and must be non-empty`,
        });
        continue;
      }
      if (Array.isArray(rule.enum) && !rule.enum.includes(value)) {
        issues.push({
          path: key,
          code: "INVALID_ENUM",
          message: `Parameter "${key}" must be one of: ${rule.enum.join(", ")}`,
        });
      }
    }
    if (issues.length === 0) return { valid: true };
    return { valid: false, issues, error: issues[0].message };
  }

  #matchesType(value, type) {
    switch (type) {
      case "string":
        return typeof value === "string";
      case "number":
        return typeof value === "number";
      case "boolean":
        return typeof value === "boolean";
      case "object":
        return (
          value !== null && typeof value === "object" && !Array.isArray(value)
        );
      case "array":
        return Array.isArray(value);
      default:
        return typeof value === type;
    }
  }

  #describeType(value) {
    if (value === null) return "null";
    if (Array.isArray(value)) return "array";
    return typeof value;
  }
}
