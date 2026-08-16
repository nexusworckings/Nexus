export class ContextManager {
  #store;
  #_lastTs;

  constructor() {
    this.#store = new Map();
  }

  #now() {
    const ts = Date.now();
    this.#_lastTs = this.#_lastTs || 0;
    if (ts <= this.#_lastTs) {
      this.#_lastTs++;
      return this.#_lastTs;
    }
    this.#_lastTs = ts;
    return ts;
  }

  createSession(sessionId, initial = {}) {
    if (this.#store.has(sessionId)) {
      throw new Error(`ContextManager: session "${sessionId}" already exists`);
    }
    const now = this.#now();
    const session = {
      sessionId,
      conversationId: initial.conversationId || null,
      clientId: initial.clientId || null,
      repairId: initial.repairId || null,
      budgetId: initial.budgetId || null,
      printOrderId: initial.printOrderId || null,
      currentIntent: initial.currentIntent || null,
      entities: initial.entities || {},
      toolHistory: [],
      conversationHistory: [],
      workingMemory: initial.workingMemory || {},
      profile: initial.profile || null,
      createdAt: now,
      updatedAt: now,
    };
    this.#store.set(sessionId, session);
    return session;
  }

  getSession(sessionId) {
    return this.#store.get(sessionId) || null;
  }

  hasSession(sessionId) {
    return this.#store.has(sessionId);
  }

  updateSession(sessionId, updates) {
    const session = this.#store.get(sessionId);
    if (!session) return null;
    Object.assign(session, updates, { updatedAt: this.#now() });
    return session;
  }

  addToolCall(sessionId, toolName, params, result) {
    const session = this.#store.get(sessionId);
    if (!session) return;
    session.toolHistory.push({ toolName, params, result, timestamp: new Date().toISOString() });
    session.updatedAt = this.#now();
  }

  addMessage(sessionId, role, content) {
    const session = this.#store.get(sessionId);
    if (!session) return;
    session.conversationHistory.push({ role, content, timestamp: new Date().toISOString() });
    session.updatedAt = this.#now();
  }

  setWorkingMemory(sessionId, key, value) {
    const session = this.#store.get(sessionId);
    if (!session) return;
    session.workingMemory[key] = value;
    session.updatedAt = this.#now();
  }

  getWorkingMemory(sessionId, key) {
    const session = this.#store.get(sessionId);
    if (!session) return undefined;
    return key ? session.workingMemory[key] : { ...session.workingMemory };
  }

  deleteSession(sessionId) {
    return this.#store.delete(sessionId);
  }

  listSessions() {
    return Array.from(this.#store.keys());
  }

  count() {
    return this.#store.size;
  }

  clear() {
    this.#store.clear();
  }
}
