export class ToolRegistry {
  #tools;

  constructor() {
    this.#tools = new Map();
  }

  register(tool) {
    if (!tool || !tool.name) throw new Error('ToolRegistry: tool must have a name');
    if (typeof tool.execute !== 'function') throw new Error(`ToolRegistry: ${tool.name} must implement execute()`);
    if (this.#tools.has(tool.name)) throw new Error(`ToolRegistry: tool "${tool.name}" already registered`);
    this.#tools.set(tool.name, tool);
    return this;
  }

  get(name) {
    return this.#tools.get(name) || null;
  }

  list() {
    return Array.from(this.#tools.values());
  }

  exists(name) {
    return this.#tools.has(name);
  }

  names() {
    return Array.from(this.#tools.keys());
  }

  count() {
    return this.#tools.size;
  }
}
