export class MetricsCollector {
  #metrics;
  #listeners;

  constructor() {
    this.#metrics = this.#empty();
    this.#listeners = [];
  }

  #empty() {
    return {
      engine: { calls: 0, plans: 0, tools: 0, errors: 0, tokens: 0 },
      profile: {},
      byTool: {},
      byPlan: [],
      history: [],
    };
  }

  onEvent(listener) {
    this.#listeners.push(listener);
  }

  #emit(name, data) {
    for (const fn of this.#listeners) {
      try {
        fn(name, data);
      } catch {}
    }
  }

  recordEngineCall(profile, sessionId) {
    this.#metrics.engine.calls++;
    if (!this.#metrics.profile[profile]) this.#metrics.profile[profile] = { calls: 0, tools: 0, errors: 0 };
    this.#metrics.profile[profile].calls++;
    this.#emit('engine.call', { profile, sessionId });
  }

  recordPlan(profile, plan) {
    this.#metrics.engine.plans++;
    this.#metrics.byPlan.push({ profile, plan: plan.map(s => s.tool), timestamp: Date.now() });
    this.#emit('engine.plan', { profile, plan });
  }

  recordToolExecution(toolName, durationMs, success, error) {
    this.#metrics.engine.tools++;
    if (!this.#metrics.byTool[toolName]) {
      this.#metrics.byTool[toolName] = { calls: 0, errors: 0, totalDuration: 0 };
    }
    this.#metrics.byTool[toolName].calls++;
    this.#metrics.byTool[toolName].totalDuration += durationMs;
    if (!success) {
      this.#metrics.byTool[toolName].errors++;
      this.#metrics.engine.errors++;
      if (this.#metrics.profile) {
        for (const p of Object.keys(this.#metrics.profile)) {
          this.#metrics.profile[p].errors = (this.#metrics.profile[p].errors || 0) + 1;
        }
      }
    }
    this.#emit('tool.execution', { toolName, durationMs, success, error });
  }

  recordTokens(count) {
    this.#metrics.engine.tokens += count;
    this.#emit('engine.tokens', { count });
  }

  recordError(profile, error) {
    this.#metrics.engine.errors++;
    if (this.#metrics.profile[profile]) this.#metrics.profile[profile].errors++;
    this.#metrics.history.push({
      type: 'error', profile, error: error.message || String(error), timestamp: Date.now(),
    });
    this.#emit('engine.error', { profile, error });
  }

  snapshot() {
    return {
      ...this.#metrics,
      byPlan: [...this.#metrics.byPlan],
      history: [...this.#metrics.history],
    };
  }

  summary() {
    const m = this.#metrics;
    const byTool = Object.entries(m.byTool).map(([n, d]) => ({
      tool: n, calls: d.calls, errors: d.errors, avgMs: d.calls ? Math.round(d.totalDuration / d.calls) : 0,
    }));
    return {
      totalCalls: m.engine.calls,
      totalPlans: m.engine.plans,
      totalTools: m.engine.tools,
      totalErrors: m.engine.errors,
      totalTokens: m.engine.tokens,
      byProfile: m.profile,
      byTool,
    };
  }

  reset() {
    this.#metrics = this.#empty();
  }
}
