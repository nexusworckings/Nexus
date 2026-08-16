import { ToolRegistry } from "./tool-registry.js";
import { ToolExecutor } from "./tool-executor.js";
import { ProfileManager } from "./profile-manager.js";
import { ContextManager } from "./context-manager.js";
import { PlanningEngine } from "./planning-engine.js";
import { MetricsCollector } from "./observability.js";
import { ConversationContextOrchestrator } from "./conversation-context-orchestrator.js";
import { composePlannerContext } from "./business-context.js";

export class NexusAIEngine {
  #toolRegistry;
  #toolExecutor;
  #profileManager;
  #contextManager;
  #planningEngine;
  #chatFn;
  #metrics;
  #ctxOrchestrator;
  #respondFn;
  #policyContext;
  #commercialGate;

  constructor(options = {}) {
    this.#metrics = options.metricsCollector || new MetricsCollector();
    this.#toolRegistry = options.toolRegistry || new ToolRegistry();
    this.#toolExecutor =
      options.toolExecutor ||
      new ToolExecutor({
        toolRegistry: this.#toolRegistry,
        metricsCollector: this.#metrics,
      });
    this.#profileManager = options.profileManager || new ProfileManager();
    this.#contextManager = options.contextManager || new ContextManager();
    this.#chatFn = options.chatFn;
    this.#planningEngine =
      options.planningEngine ||
      (this.#chatFn ? new PlanningEngine({ chatFn: this.#chatFn }) : null);
    this.#ctxOrchestrator =
      options.conversationContextOrchestrator ||
      new ConversationContextOrchestrator();
    this.#respondFn = options.respondFn || null;
    this.#policyContext = options.policyContext || null;
    this.#commercialGate = options.commercialGate || null;

    if (!this.#chatFn) throw new Error("NexusAIEngine: chatFn is required");
  }

  get toolRegistry() {
    return this.#toolRegistry;
  }
  get toolExecutor() {
    return this.#toolExecutor;
  }
  get profileManager() {
    return this.#profileManager;
  }
  get contextManager() {
    return this.#contextManager;
  }
  get planningEngine() {
    return this.#planningEngine;
  }
  get metrics() {
    return this.#metrics;
  }
  get conversationContextOrchestrator() {
    return this.#ctxOrchestrator;
  }

  async process(input, options = {}) {
    const profileId = options.profile || "customer";
    const sessionId = options.sessionId || `session-${Date.now()}`;
    const profile = this.#profileManager.get(profileId);
    if (!profile) {
      this.#metrics.recordError(
        profileId,
        new Error(`Profile "${profileId}" not found`),
      );
      return { type: "error", error: `Profile "${profileId}" not found` };
    }

    this.#metrics.recordEngineCall(profileId, sessionId);

    if (!this.#contextManager.hasSession(sessionId)) {
      this.#contextManager.createSession(sessionId, {
        profile: profileId,
        clientId: options.clientId || null,
        conversationId: options.conversationId || null,
        repairId: options.repairId || null,
        budgetId: options.budgetId || null,
        printOrderId: options.printOrderId || null,
        currentIntent: options.currentIntent || null,
        entities: options.entities || {},
        workingMemory: options.workingMemory || {},
      });
    }

    this.#contextManager.addMessage(sessionId, "user", input);

    const allowedTools = this.#getAllowedTools(profile);
    const context = this.#contextManager.getSession(sessionId);

    const resolvedContext = this.#ctxOrchestrator
      ? this.#resolveConversationContext(input, sessionId, context)
      : null;

    if (this.#planningEngine) {
      try {
        const planResult = await this.#planningEngine.createPlan(input, {
          availableTools: allowedTools,
          systemPrompt: this.#buildPlannerSystemPrompt(profile.systemPrompt),
          sessionId,
          clientId: context?.clientId || null,
          currentIntent: context?.currentIntent || null,
          workingMemory: {
            ...(context?.workingMemory || {}),
            ...(resolvedContext || {}),
          },
          conversationHistory: context?.conversationHistory || [],
        });

        if (planResult.plan.length === 0) {
          const message = await this.#generateResponse({
            userMessage: input,
            toolResults: [],
            conversationContext: resolvedContext,
            history: [...(context?.conversationHistory || [])],
            plan: [],
            steps: [],
            fallback: planResult.explanation,
          });
          this.#contextManager.addMessage(sessionId, "assistant", message);
          return {
            type: "conversation",
            sessionId,
            message,
            explanation: message,
            ...(resolvedContext
              ? { conversationContext: resolvedContext }
              : {}),
          };
        }

        this.#metrics.recordPlan(profileId, planResult.plan);

        const planSteps =
          planResult.steps ||
          planResult.plan.map((s) => ({ tool: s.tool, input: s.params || {} }));
        const { results, errors } = await this.#toolExecutor.executePlan(
          planSteps,
          context,
          {
            allowedTools: profile.allowedTools,
          },
        );

        for (let i = 0; i < planSteps.length; i++) {
          const step = planSteps[i];
          const result = results[i] || null;
          if (result && result.error === "Tool not allowed by profile")
            continue;
          this.#contextManager.addToolCall(
            sessionId,
            step.tool,
            step.params || step.input || {},
            result,
          );
        }

        const explanation = await this.#generateResponse({
          userMessage: input,
          toolResults: results,
          conversationContext: resolvedContext,
          history: [...(context?.conversationHistory || [])],
          plan: planResult.plan,
          steps: planSteps,
          fallback: planResult.explanation || this.#buildExplanation(results),
        });
        this.#contextManager.addMessage(sessionId, "assistant", explanation);

        return {
          type: "execution",
          sessionId,
          plan: planResult.plan,
          steps: planSteps,
          results,
          errors,
          explanation,
          conversationId: context?.conversationId,
          clientId: context?.clientId,
          workingMemory: context?.workingMemory,
          ...(resolvedContext ? { conversationContext: resolvedContext } : {}),
          metrics: this.#toolExecutor.getMetrics(),
        };
      } catch (err) {
        this.#metrics.recordError(profileId, err);
        return {
          type: "error",
          sessionId,
          error: err.message,
        };
      }
    }

    return {
      type: "conversation",
      sessionId,
      message: "Planning engine not available",
    };
  }

  resetMetrics() {
    this.#metrics.reset();
    this.#toolExecutor.resetMetrics();
  }

  #buildExplanation(results) {
    const succeeded = results.filter((r) => r.success);
    const failed = results.filter((r) => !r.success);
    const parts = [];
    if (succeeded.length)
      parts.push(`${succeeded.length} tool(s) executed successfully`);
    if (failed.length)
      parts.push(
        `${failed.length} tool(s) failed: ${failed.map((f) => f.toolName).join(", ")}`,
      );
    return parts.join(". ") || "Execution completed";
  }

  #getAllowedTools(profile) {
    return profile.allowedTools
      .map((name) => this.#toolRegistry.get(name))
      .filter(Boolean);
  }

  #buildPlannerSystemPrompt(persona) {
    if (!this.#policyContext || !this.#policyContext.policy) return persona;
    return composePlannerContext(this.#policyContext.policy, persona);
  }

  async #generateResponse({
    userMessage,
    toolResults,
    conversationContext,
    history,
    plan,
    steps,
    fallback,
  }) {
    if (this.#commercialGate) {
      const decision = this.#commercialGate({
        userMessage,
        plan,
        steps,
        results: toolResults,
      });
      if (decision.status === "block") return decision.fallback;
      if (decision.status === "allow" && decision.commercialPolicy) {
        fallback = decision.fallback || fallback;
        const result = this.#runResponder({
          userMessage,
          toolResults,
          conversationContext,
          history,
          plan,
          steps,
          commercialPolicy: decision.commercialPolicy,
          fallback,
        });
        return result;
      }
    }
    if (!this.#respondFn) return fallback;
    try {
      const result = await this.#respondFn({
        userMessage,
        toolResults,
        conversationContext,
        history,
        plan,
        steps,
      });
      return result && typeof result.message === "string"
        ? result.message
        : fallback;
    } catch {
      return fallback;
    }
  }

  async #runResponder({
    userMessage,
    toolResults,
    conversationContext,
    history,
    plan,
    steps,
    commercialPolicy,
    fallback,
  }) {
    if (!this.#respondFn) return fallback;
    try {
      const result = await this.#respondFn({
        userMessage,
        toolResults,
        conversationContext,
        history,
        plan,
        steps,
        commercialPolicy,
      });
      return result && typeof result.message === "string"
        ? result.message
        : fallback;
    } catch {
      return fallback;
    }
  }

  #resolveConversationContext(input, sessionId, session) {
    try {
      const resolved = this.#ctxOrchestrator.resolve(input, sessionId);
      const context = resolved?.context || null;
      if (context && Object.keys(context).length > 0 && session) {
        session.conversationContext = context;
      }
      return context && Object.keys(context).length > 0 ? context : null;
    } catch {
      return null;
    }
  }
}
