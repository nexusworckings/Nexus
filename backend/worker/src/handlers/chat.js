import { createClient } from "@supabase/supabase-js";
import { chat } from "../services/openrouter.js";
import { query, insert } from "../services/supabase.js";
import { webSearch, formatSearchResults } from "../services/websearch.js";
import {
  buildContext,
  buildMessages,
  resolveBusinessContext,
} from "../services/context.js";
import { errorResponse } from "../middleware/error.js";
import { createSession } from "../services/conversation/session.js";
import { defaultLogger } from "../services/logger.js";
import {
  getSession,
  saveSession,
  deleteSession,
} from "../services/session-store.js";

const log = defaultLogger;
const RATE_LIMIT_MAP = new Map();
const RATE_LIMIT_WINDOW = 60 * 1000;
const RATE_LIMIT_MAX = 40;
let RATE_LIMIT_CLEANUP_INTERVAL = null;

const IN_FLIGHT = new Set();
const LAST_MESSAGE = new Map();
const SPAM_WINDOW = 5000;
let LAST_MESSAGE_CLEANUP = null;

function cleanupLastMessageMap() {
  const cutoff = Date.now() - SPAM_WINDOW * 10;
  for (const [ip, entry] of LAST_MESSAGE) {
    if (entry.time < cutoff) LAST_MESSAGE.delete(ip);
  }
  LAST_MESSAGE_CLEANUP = null;
}

function cleanupRateLimitMap() {
  const cutoff = Date.now() - RATE_LIMIT_WINDOW * 2;
  for (const [ip, timestamps] of RATE_LIMIT_MAP.entries()) {
    const filtered = timestamps.filter((t) => t > cutoff);
    if (filtered.length === 0) {
      RATE_LIMIT_MAP.delete(ip);
    } else {
      RATE_LIMIT_MAP.set(ip, filtered);
    }
  }
}

function checkRateLimit(clientIp) {
  if (!RATE_LIMIT_CLEANUP_INTERVAL) {
    RATE_LIMIT_CLEANUP_INTERVAL = setTimeout(() => {
      cleanupRateLimitMap();
      RATE_LIMIT_CLEANUP_INTERVAL = null;
    }, RATE_LIMIT_WINDOW);
  }

  const now = Date.now();
  const windowStart = now - RATE_LIMIT_WINDOW;

  if (!RATE_LIMIT_MAP.has(clientIp)) {
    RATE_LIMIT_MAP.set(clientIp, []);
  }

  const timestamps = RATE_LIMIT_MAP.get(clientIp).filter(
    (t) => t > windowStart,
  );
  timestamps.push(now);
  RATE_LIMIT_MAP.set(clientIp, timestamps);

  return timestamps.length <= RATE_LIMIT_MAX;
}

function detectSpam(clientIp, message) {
  if (IN_FLIGHT.has(clientIp)) {
    return "Ya tenés una consulta en proceso. Esperá la respuesta.";
  }

  if (!LAST_MESSAGE_CLEANUP) {
    LAST_MESSAGE_CLEANUP = setTimeout(cleanupLastMessageMap, SPAM_WINDOW * 10);
  }

  const last = LAST_MESSAGE.get(clientIp);
  if (
    last &&
    last.message === message &&
    Date.now() - last.time < SPAM_WINDOW
  ) {
    return "Ese mensaje ya lo enviaste hace segundos. Esperá la respuesta.";
  }

  LAST_MESSAGE.set(clientIp, { message, time: Date.now() });
  return null;
}

function hydrateContextManager(contextManager, sessionId, data) {
  if (!contextManager || !sessionId || !data) return;
  if (contextManager.hasSession(sessionId)) return;
  contextManager.createSession(sessionId, {});
  contextManager.updateSession(sessionId, {
    conversationHistory: Array.isArray(data.conversationHistory)
      ? data.conversationHistory
      : [],
    toolHistory: Array.isArray(data.toolHistory) ? data.toolHistory : [],
  });
}

export async function handleHealth(env) {
  try {
    await query(env, "business_info", { limit: "1" }, true);
    return new Response(
      JSON.stringify({
        status: "ok",
        service: "nexus-worker",
        timestamp: new Date().toISOString(),
        supabase: "connected",
        engineVersion: "3.0.0",
        commit: "44e7d6c5-fix-kv-preference",
      }),
      {
        headers: { "Content-Type": "application/json" },
      },
    );
  } catch (err) {
    return new Response(
      JSON.stringify({
        status: "degraded",
        service: "nexus-worker",
        timestamp: new Date().toISOString(),
        supabase: "disconnected",
        error: err.message,
      }),
      {
        status: 503,
        headers: { "Content-Type": "application/json" },
      },
    );
  }
}

async function validateChatRequest(request) {
  if (request.method !== "POST") {
    return {
      ok: false,
      response: errorResponse(request, 405, "Método no permitido"),
    };
  }

  const clientIp = request.headers.get("CF-Connecting-IP") || "anonymous";
  if (!checkRateLimit(clientIp)) {
    return {
      ok: false,
      response: errorResponse(
        request,
        429,
        "Demasiadas solicitudes. Intentá de nuevo en un minuto.",
      ),
    };
  }

  const body = await request.json();

  return {
    ok: true,
    payload: {
      body,
      userMessage: (body.message || "").trim(),
      chatContext: (body.context || "").trim(),
      clientIp,
    },
  };
}

async function handleCompletedInterview(completionPipeline, sessionId) {
  try {
    const pipelineResult = await completionPipeline.execute({ sessionId });
    if (
      !pipelineResult.success &&
      pipelineResult.error !== "SESSION_NOT_FOUND"
    ) {
      return "No pudimos registrar tu solicitud. Intentá nuevamente.";
    }
    return null;
  } catch (err) {
    log.error("[CHAT]", `CompletionPipeline error: ${err.message}`);
    return "No pudimos registrar tu solicitud. Intentá nuevamente.";
  }
}

export async function handleChat(request, env) {
  try {
    const validation = await validateChatRequest(request);
    if (!validation.ok) return validation.response;

    const { body, userMessage, chatContext, clientIp } = validation.payload;

    if (body.action === "reset") {
      const session = body.session || {};
      const sessionId = session.id || session.session_id || clientIp;
      await deleteSession(env, sessionId);
      return new Response(
        JSON.stringify({
          response:
            "Bien, empecemos de nuevo. Decime qué necesitás y te ayudo.",
          session: null,
          source: "ai",
        }),
        {
          headers: { "Content-Type": "application/json" },
        },
      );
    }

    if (!userMessage) {
      return errorResponse(request, 400, "El mensaje no puede estar vacío");
    }

    if (userMessage.length > 2000) {
      return errorResponse(request, 400, "El mensaje es demasiado largo");
    }

    const spamError = detectSpam(clientIp, userMessage);
    if (spamError) {
      return errorResponse(request, 429, spamError);
    }

    IN_FLIGHT.add(clientIp);

    try {
      const { runtime, completionPipeline } = await createChatRuntime(
        env,
        chatContext,
      );
      const session = body.session || createSession();
      const conversationSessionId =
        session.id || session.session_id || crypto.randomUUID();
      session.id = conversationSessionId;

      const interviewSessionId = body.interview?.sessionId;
      const sessionId = conversationSessionId;

      const stored = await getSession(env, conversationSessionId);
      if (stored) {
        hydrateContextManager(
          runtime.engine.contextManager,
          conversationSessionId,
          stored,
        );
      }

      const result = await runtime.handleMessage({
        message: userMessage,
        sessionId,
        interviewSessionId,
      });

      const responseData = buildChatResponse(result, session, chatContext);

      if (result.type === "completed" && result.sessionId) {
        const fallbackMessage = await handleCompletedInterview(
          completionPipeline,
          result.sessionId,
        );
        if (fallbackMessage) {
          responseData.response = fallbackMessage;
        }
      }

      const sessionState = runtime.engine.contextManager.getSession(
        conversationSessionId,
      );
      if (sessionState) {
        await saveSession(env, conversationSessionId, {
          conversationHistory: sessionState.conversationHistory || [],
          toolHistory: sessionState.toolHistory || [],
        });
      }

      return new Response(JSON.stringify(responseData), {
        headers: { "Content-Type": "application/json" },
      });
    } finally {
      IN_FLIGHT.delete(clientIp);
    }
  } catch (err) {
    log.error("[CHAT]", `Error: ${err.message}`);
    return errorResponse(request, 500, err.message);
  }
}

export function buildChatResponse(result, session, chatContext) {
  const responseData = {
    response: result.message || result.question || result.explanation || "",
    session,
    context: chatContext,
    source: "ai",
  };

  if (result.type === "interview" || result.type === "completed") {
    responseData.interview = {
      sessionId: result.sessionId,
      active: result.type === "interview",
      complete: result.type === "completed",
      schemaId: result.schemaId || null,
      currentField:
        result.type === "completed" ? null : result.fieldId || null,
    };
  }

  return responseData;
}

async function createChatRuntime(env, chatContext) {
  const { NexusAIEngine } =
    await import("../services/nexus/nexus-ai-engine.js");
  const { PlanningEngine } =
    await import("../services/nexus/planning-engine.js");
  const { ChatRuntime } = await import("../services/nexus/chat-runtime.js");
  const { InterviewRouter } =
    await import("../services/nexus/interview-router.js");
  const { SchemaRegistry } =
    await import("../services/interview/v2/schema-registry.js");
  const { InterviewController } =
    await import("../services/interview/v2/interview-controller.js");
  const { SupabaseSessionStore } =
    await import("../services/interview/v2/stores/supabase-session-store.js");
  const { AIAdapter } = await import("../services/interview/v2/ai-adapter.js");
  const { registerInterviewTools } =
    await import("../services/nexus/tools/interview-tools.js");
  const { CompletionPipeline } =
    await import("../services/completion/completion-pipeline.js");
  const { ClientResolver } =
    await import("../services/nexus/client-resolver.js");
  const { ClientService } =
    await import("../services/business/client-service.js");
  const { RepairService } =
    await import("../services/business/repair-service.js");
  const { BudgetService } =
    await import("../services/business/budget-service.js");
  const { PrintService } =
    await import("../services/business/print-service.js");
  const { PriceService } =
    await import("../services/business/price-service.js");
  const { BusinessInfoService } =
    await import("../services/business/business-info-service.js");
  const { ProductService } =
    await import("../services/business/product-service.js");
  const { ProductRepository } =
    await import("../services/business/product-repository.js");
  const { StockService } =
    await import("../services/business/stock-service.js");
  const { StockRepository } =
    await import("../services/business/stock-repository.js");
  const { BusinessKnowledgeGraph } =
    await import("../services/business/business-knowledge-graph.js");
  const {
    createSearchPriceTool,
    createSearchBusinessInfoTool,
    createSearchProductTool,
    createSearchStockTool,
  } = await import("../services/nexus/tools/index.js");
  const { sharedConversationContextOrchestrator } =
    await import("../services/nexus/conversation-context-orchestrator.js");
  const { serializeConversationContext } =
    await import("../services/nexus/business-context.js");
  const { evaluateCommercialGate } =
    await import("../services/nexus/commercial-gate.js");

  const businessPolicy = await resolveBusinessContext(env);

  const supabase = createClient(
    env.SUPABASE_URL,
    env.SUPABASE_SERVICE_ROLE_KEY,
  );
  const sessionStore = new SupabaseSessionStore(supabase);
  const aiAdapter = new AIAdapter({
    apiKey: env.OPENROUTER_API_KEY,
    baseUrl: env.OPENROUTER_BASE_URL,
    defaultModel: env.OPENROUTER_MODEL,
  });
  const schemaRegistry = new SchemaRegistry({
    skipValidation: env.ENVIRONMENT === "production",
  });
  const interviewController = new InterviewController({
    sessionStore,
    schemaRegistry,
    aiAdapter,
  });
  const interviewRouter = new InterviewRouter({
    schemaRegistry,
    interviewController,
  });

  const clientService = new ClientService({
    insertFn: (table, data) => insert(env, table, data, true),
    queryFn: (table, opts) => query(env, table, opts, true),
  });
  const clientResolver = new ClientResolver({ clientService });
  const completionPipeline = new CompletionPipeline({
    sessionStore,
    clientResolver,
    repairService: new RepairService({
      insertFn: (table, data) => insert(env, table, data, true),
    }),
    budgetService: new BudgetService({
      insertFn: (table, data) => insert(env, table, data, true),
    }),
    printService: new PrintService({
      insertFn: (table, data) => insert(env, table, data, true),
    }),
  });

  const respondFn = async ({
    userMessage,
    toolResults,
    conversationContext,
    history,
    plan,
    steps,
    commercialPolicy,
  }) => {
    const [context, webResults] = await Promise.all([
      buildContext(env, userMessage),
      webSearch(userMessage).catch(() => []),
    ]);
    const webContext = formatSearchResults(webResults);
    const combined = context + (webContext ? "\n\n" + webContext : "");

    const toolData = (toolResults || [])
      .filter((r) => r.success)
      .map((r) => `${r.toolName}: ${JSON.stringify(r.data)}`)
      .join("\n");
    const toolErrors = (toolResults || [])
      .filter((r) => !r.success)
      .map((r) => `${r.toolName}: error ${r.error}`)
      .join("\n");

    let userContent = userMessage;
    if (toolData || toolErrors) {
      const sections = [];
      if (toolData)
        sections.push("RESULTADOS REALES DE LAS HERRAMIENTAS:\n" + toolData);
      if (toolErrors) sections.push("ERRORES DE HERRAMIENTAS:\n" + toolErrors);
      userContent =
        `Mensaje del usuario: "${userMessage}"\n\n${sections.join("\n\n")}\n\n` +
        `Respondé al usuario en español rioplatense, amable y conciso, usando SIEMPRE los resultados reales. ` +
        `Si no hay un dato para lo que pregunta, decilo con honestidad y ofrecé ayuda.`;
    }

    const baseMessages = await buildMessages(
      env,
      combined,
      userContent,
      chatContext,
      null,
      {
        policy: businessPolicy,
        commercialPolicy: commercialPolicy || undefined,
        conversationContext:
          conversationContext && Object.keys(conversationContext).length > 0
            ? serializeConversationContext(conversationContext)
            : undefined,
      },
    );
    const priorMessages = (history || [])
      .filter((m) => m && (m.role === "user" || m.role === "assistant"))
      .map((m) => ({ role: m.role, content: m.content }));
    if (
      priorMessages.length > 0 &&
      priorMessages[priorMessages.length - 1].role === "user"
    ) {
      priorMessages.pop();
    }
    const messages = [
      ...baseMessages.slice(0, 1),
      ...priorMessages,
      ...baseMessages.slice(1),
    ];
    const message = await chat(env, messages);
    return { message };
  };

  const engine = new NexusAIEngine({
    chatFn: async (prompt) => {
      const [context, webResults] = await Promise.all([
        buildContext(env, prompt),
        webSearch(prompt).catch(() => []),
      ]);
      const webContext = formatSearchResults(webResults);
      const combined = context + (webContext ? "\n\n" + webContext : "");
      const messages = await buildMessages(env, combined, prompt, chatContext);
      return chat(env, messages);
    },
    conversationContextOrchestrator: sharedConversationContextOrchestrator,
    respondFn,
    policyContext: businessPolicy,
    commercialGate: evaluateCommercialGate,
  });

  registerInterviewTools(engine.toolRegistry, {
    interviewController,
    schemaRegistry,
  });
  engine.profileManager
    .get("customer")
    .allowedTools.push(
      "questionGenerator",
      "interpreter",
      "interviewController",
    );

  const knowledgeGraph = new BusinessKnowledgeGraph({
    queryFn: (table, opts) => query(env, table, opts, false),
  });

  const priceService = new PriceService({
    queryFn: (table, opts) => query(env, table, opts, false),
    knowledgeGraph,
  });
  engine.toolRegistry.register(createSearchPriceTool({ priceService }));

  const businessInfoService = new BusinessInfoService({
    queryFn: (table, opts) => query(env, table, opts, false),
    knowledgeGraph,
  });
  engine.toolRegistry.register(
    createSearchBusinessInfoTool({ businessInfoService }),
  );

  const productService = new ProductService({
    repository: new ProductRepository({
      queryFn: (table, opts) => query(env, table, opts, false),
    }),
    knowledgeGraph,
  });
  engine.toolRegistry.register(createSearchProductTool({ productService }));

  const stockService = new StockService({
    repository: new StockRepository({
      queryFn: (table, opts) => query(env, table, opts, false),
    }),
    knowledgeGraph,
  });
  engine.toolRegistry.register(createSearchStockTool({ stockService }));

  return {
    runtime: new ChatRuntime({ engine, interviewRouter }),
    completionPipeline,
  };
}
