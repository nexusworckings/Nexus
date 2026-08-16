import { NexusAIEngine } from "../services/nexus/nexus-ai-engine.js";
import { ToolRegistry } from "../services/nexus/tool-registry.js";
import { ToolExecutor } from "../services/nexus/tool-executor.js";
import { ProfileManager } from "../services/nexus/profile-manager.js";
import { ContextManager } from "../services/nexus/context-manager.js";
import { PlanningEngine } from "../services/nexus/planning-engine.js";
import { AdminAssistant } from "../services/nexus/admin-assistant.js";
import { ConversationManager } from "../services/nexus/conversation-manager.js";
import { ConversationMemory } from "../services/nexus/conversation-memory.js";
import { MessageBuilder } from "../services/nexus/message-builder.js";
import { registerTools } from "../services/nexus/tools/index.js";
import { registerAdminTools } from "../services/nexus/tools/admin-tools.js";
import { registerConversationTools } from "../services/nexus/tools/conversation-tools.js";
import { sharedConversationContextOrchestrator } from "../services/nexus/conversation-context-orchestrator.js";
import { chat } from "../services/openrouter.js";
import { query, update, insert } from "../services/supabase.js";
import { webSearch, formatSearchResults } from "../services/websearch.js";
import { errorResponse } from "../middleware/error.js";
import { PriceService } from "../services/business/price-service.js";
import { BusinessInfoService } from "../services/business/business-info-service.js";
import { ProductService } from "../services/business/product-service.js";
import { ProductRepository } from "../services/business/product-repository.js";
import { StockService } from "../services/business/stock-service.js";
import { StockRepository } from "../services/business/stock-repository.js";
import { BusinessKnowledgeGraph } from "../services/business/business-knowledge-graph.js";

function createAdminEngine(env) {
  const registry = new ToolRegistry();
  const metricsCollector = null;
  const toolExecutor = new ToolExecutor({
    toolRegistry: registry,
    metricsCollector,
  });
  const profileManager = new ProfileManager();
  const contextManager = new ContextManager();

  const deps = {
    query: (table, opts, raw) => query(env, table, opts, raw),
    update: (table, id, data, raw) => update(env, table, id, data, raw),
    insert: (table, data, raw) => insert(env, table, data, raw),
    delete: (table, id) => query(env, table, { id, limit: "1" }).then(() => {}),
    webSearch: (q) => webSearch(q),
    formatSearchResults: (r) => formatSearchResults(r),
  };

  deps.knowledgeGraph = new BusinessKnowledgeGraph({ queryFn: deps.query });
  deps.priceService = new PriceService({
    queryFn: deps.query,
    knowledgeGraph: deps.knowledgeGraph,
  });
  deps.businessInfoService = new BusinessInfoService({
    queryFn: deps.query,
    knowledgeGraph: deps.knowledgeGraph,
  });
  deps.productService = new ProductService({
    repository: new ProductRepository({ queryFn: deps.query }),
    knowledgeGraph: deps.knowledgeGraph,
  });
  deps.stockService = new StockService({
    repository: new StockRepository({ queryFn: deps.query }),
    knowledgeGraph: deps.knowledgeGraph,
  });

  registerTools(registry, deps);
  registerAdminTools(registry, deps);

  const chatFn = async (prompt) => {
    const systemPrompt = profileManager.get("admin")?.systemPrompt || "";
    const messages = [
      { role: "system", content: systemPrompt },
      { role: "user", content: prompt },
    ];
    return chat(env, messages);
  };

  const planningEngine = new PlanningEngine({ chatFn });

  return new NexusAIEngine({
    toolRegistry: registry,
    toolExecutor,
    profileManager,
    contextManager,
    planningEngine,
    chatFn,
    conversationContextOrchestrator: sharedConversationContextOrchestrator,
  });
}

let globalConversationManager = null;

function getConversationManager() {
  if (!globalConversationManager) {
    globalConversationManager = new ConversationManager();
  }
  return globalConversationManager;
}

let globalConversationMemory = null;

function getConversationMemory() {
  if (!globalConversationMemory) {
    globalConversationMemory = new ConversationMemory();
  }
  return globalConversationMemory;
}

export async function handleAdminAiAction(request, env) {
  try {
    const body = await request.json();
    const instruction = (body.instruction || "").trim();
    if (!instruction) {
      return errorResponse(request, 400, "La instruccion no puede estar vacia");
    }

    const sessionId = `admin-${body.session || Date.now()}`;
    const engine = createAdminEngine(env);

    const result = await engine.process(instruction, {
      profile: "admin",
      sessionId,
    });

    if (result.type === "error") {
      return new Response(
        JSON.stringify({
          success: false,
          error: result.error,
        }),
        { status: 500, headers: { "Content-Type": "application/json" } },
      );
    }

    if (result.type === "conversation") {
      return new Response(
        JSON.stringify({
          success: true,
          type: "consulta",
          explanation: result.message,
          summary: result.message,
          response: result.message,
          changes: [],
          webSearchUsed: false,
        }),
        { headers: { "Content-Type": "application/json" } },
      );
    }

    const changes = (result.results || [])
      .filter((r) => r.success)
      .map((r) => ({
        toolName: r.toolName,
        data: r.data,
        success: true,
      }));
    const errors = (result.results || [])
      .filter((r) => !r.success)
      .map((r) => ({
        toolName: r.toolName,
        error: r.error,
        success: false,
      }));
    const allChanges = [...changes, ...errors];

    return new Response(
      JSON.stringify({
        success: true,
        type: allChanges.length > 0 ? "accion" : "consulta",
        explanation: result.explanation,
        summary: result.explanation,
        response: result.explanation,
        changes: allChanges,
        webSearchUsed: false,
        plan: result.plan,
        metrics: result.metrics,
      }),
      { headers: { "Content-Type": "application/json" } },
    );
  } catch (err) {
    return errorResponse(request, 500, err.message);
  }
}

export async function handleAdminConversations(request, env) {
  try {
    const cm = getConversationManager();
    const url = new URL(request.url);

    if (
      url.pathname === "/api/admin/conversations" &&
      request.method === "GET"
    ) {
      const conversations = cm.listConversations().map((c) => c.toJSON());
      return new Response(JSON.stringify(conversations), {
        headers: { "Content-Type": "application/json" },
      });
    }

    if (
      url.pathname === "/api/admin/conversations" &&
      request.method === "POST"
    ) {
      const body = await request.json();
      const conv = cm.createConversation(body);
      return new Response(JSON.stringify(conv.toJSON()), {
        status: 201,
        headers: { "Content-Type": "application/json" },
      });
    }

    return errorResponse(request, 404, "Endpoint no encontrado");
  } catch (err) {
    return errorResponse(request, 500, err.message);
  }
}

export async function handleAdminAiSuggestions(request, env) {
  try {
    const body = await request.json();
    const { conversationId, history } = body;
    if (!conversationId) {
      return errorResponse(request, 400, "conversationId es requerido");
    }

    const cm = getConversationManager();
    const mem = getConversationMemory();

    let conv = cm.getConversation(conversationId);
    if (!conv) {
      conv = cm.createConversation({ conversationId });
    }

    if (history && Array.isArray(history)) {
      for (const msg of history) {
        if (
          !conv.history.find(
            (h) => h.content === msg.content && h.role === msg.role,
          )
        ) {
          conv.addMessage(msg.role, msg.content);
        }
      }
    }

    const prompt = `Eres un asistente administrativo de Tecno San Juan.
Analiza el historial de la conversación y sugiere:
1. Una respuesta recomendada para el administrador.
2. La próxima acción recomendada.
3. Las herramientas de Nexus que consideres necesarias.

Historial:
${conv.history
  .slice(-10)
  .map((m) => `[${m.role}]: ${m.content}`)
  .join("\n")}

Responde SOLO con JSON:
{"suggestedReply": "texto", "suggestedAction": "texto", "suggestedTools": ["tool1", "tool2"]}`;

    const raw = await chat(env, [
      {
        role: "system",
        content:
          "Eres un asistente que sugiere respuestas para conversaciones de atención al cliente.",
      },
      { role: "user", content: prompt },
    ]);

    let suggestions;
    try {
      suggestions = JSON.parse(raw);
    } catch {
      const match = raw.match(/\{[\s\S]*\}/);
      suggestions = match
        ? JSON.parse(match[0])
        : { suggestedAction: "Revisar conversación manualmente" };
    }

    if (suggestions) {
      conv.setSuggestion(
        suggestions.suggestedReply || null,
        suggestions.suggestedAction || null,
        suggestions.suggestedTools || [],
      );
    }

    return new Response(
      JSON.stringify({
        conversationId,
        suggestedReply: conv.suggestedReply,
        suggestedAction: conv.suggestedAction,
        suggestedTools: conv.suggestedTools,
      }),
      { headers: { "Content-Type": "application/json" } },
    );
  } catch (err) {
    return new Response(
      JSON.stringify({
        conversationId: body?.conversationId || null,
        suggestedReply: null,
        suggestedAction: "Revisar conversación manualmente",
        suggestedTools: [],
      }),
      { headers: { "Content-Type": "application/json" } },
    );
  }
}
