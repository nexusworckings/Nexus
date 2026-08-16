const REFERENCE_RE =
  /^\$[A-Za-z0-9_-]+(?:\.(?:result|tool))?(?:(?:\.\w+)|(?:\[\d+\]))*$/;

export function isReference(value) {
  return typeof value === "string" && REFERENCE_RE.test(value);
}

function tokenizePath(path) {
  return path
    .replace(/\[(\d+)\]/g, ".$1")
    .split(".")
    .filter((segment) => segment.length > 0);
}

function parseReference(ref) {
  const body = ref.slice(1);
  const dot = body.indexOf(".");
  if (dot === -1) return { stepId: body, path: [] };
  return {
    stepId: body.slice(0, dot),
    path: tokenizePath(body.slice(dot + 1)),
  };
}

export class ReferenceResolver {
  isReference(value) {
    return isReference(value);
  }

  resolveInput(input, { memory, currentStepId } = {}) {
    if (!(memory instanceof Map)) {
      throw new Error(
        "ReferenceResolver: a Map of successful step results is required",
      );
    }
    const seen = new Set();
    const walk = (value) => {
      if (isReference(value)) {
        return this.#resolve(value, memory, currentStepId, seen);
      }
      if (Array.isArray(value)) return value.map(walk);
      if (value && typeof value === "object") {
        const out = {};
        for (const [key, child] of Object.entries(value)) {
          out[key] = walk(child);
        }
        return out;
      }
      return value;
    };
    return walk(input);
  }

  #resolve(ref, memory, currentStepId, seen) {
    if (seen.has(ref)) {
      throw new Error(`Circular reference detected: "${ref}"`);
    }
    const parsed = parseReference(ref);
    if (parsed.stepId === currentStepId) {
      throw new Error(
        `Circular reference detected: "${ref}" (step "${currentStepId}" cannot reference itself)`,
      );
    }
    const entry = memory.get(parsed.stepId);
    if (!entry) {
      throw new Error(
        `Reference "${ref}" could not be resolved: step "${parsed.stepId}" has no successful result yet`,
      );
    }
    let current = entry;
    for (const segment of parsed.path) {
      if (current == null || !(segment in Object(current))) {
        throw new Error(
          `Reference "${ref}" could not be resolved: path segment "${segment}" not found`,
        );
      }
      current = current[segment];
    }
    return current;
  }
}
