import { createClient } from "@supabase/supabase-js";
import { WhatsAppService } from "../services/whatsapp/whatsapp-service.js";
import { ConversationManager } from "../services/nexus/conversation-manager.js";
import { ConversationMemory } from "../services/nexus/conversation-memory.js";
import { NexusAIEngine } from "../services/nexus/nexus-ai-engine.js";
import { ToolRegistry } from "../services/nexus/tool-registry.js";
import { ToolExecutor } from "../services/nexus/tool-executor.js";
import { ProfileManager } from "../services/nexus/profile-manager.js";
import { PlanningEngine } from "../services/nexus/planning-engine.js";
import { ChatRuntime } from "../services/nexus/chat-runtime.js";
import { registerTools } from "../services/nexus/tools/index.js";
import { registerConversationTools } from "../services/nexus/tools/conversation-tools.js";
import { registerInterviewTools } from "../services/nexus/tools/interview-tools.js";
import { registerWhatsAppRealTools } from "../services/whatsapp/whatsapp-real-tools.js";
import { chat } from "../services/openrouter.js";
import { query, update, insert } from "../services/supabase.js";
import { resolveBusinessContext } from "../services/context.js";
import { composePlannerContext } from "../services/nexus/business-context.js";
import { ContactResolver } from "../services/whatsapp/contact-resolver.js";
import { InterviewRouter } from "../services/nexus/interview-router.js";
import { InterviewController } from "../services/interview/v2/interview-controller.js";
import { SchemaRegistry } from "../services/interview/v2/schema-registry.js";
import { SupabaseSessionStore } from "../services/interview/v2/stores/supabase-session-store.js";
import { AIAdapter } from "../services/interview/v2/ai-adapter.js";
import { PriceService } from "../services/business/price-service.js";
import { BusinessInfoService } from "../services/business/business-info-service.js";
import { ProductService } from "../services/business/product-service.js";
import { ProductRepository } from "../services/business/product-repository.js";
import { StockService } from "../services/business/stock-service.js";
import { StockRepository } from "../services/business/stock-repository.js";
import { BusinessKnowledgeGraph } from "../services/business/business-knowledge-graph.js";
import { sharedConversationContextOrchestrator } from "../services/nexus/conversation-context-orchestrator.js";
import { evaluateCommercialGate } from "../services/nexus/commercial-gate.js";

let globalService = null;

async function getService(env) {
  if (globalService) return globalService;

  const cm = new ConversationManager();
  const mem = new ConversationMemory();
  const registry = new ToolRegistry();
  const profileManager = new ProfileManager();
  const contextManager = null;
  const businessPolicy = await resolveBusinessContext(env);

  const deps = {
    query: (table, opts, raw) => query(env, table, opts, raw),
    update: (table, id, data, raw) => update(env, table, id, data, raw),
    insert: (table, data, raw) => insert(env, table, data, raw),
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
  registerConversationTools(registry, {
    conversationManager: cm,
    conversationMemory: mem,
  });

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

  const chatFn = async (prompt) => {
    const messages = [
      {
        role: "system",
        content: composePlannerContext(
          businessPolicy.policy,
          profileManager.get("customer")?.systemPrompt || "",
        ),
      },
      { role: "user", content: prompt },
    ];
    return chat(env, messages);
  };

  const engine = new NexusAIEngine({
    toolRegistry: registry,
    profileManager,
    planningEngine: new PlanningEngine({ chatFn }),
    chatFn,
    conversationContextOrchestrator: sharedConversationContextOrchestrator,
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

  const runtime = new ChatRuntime({ engine, interviewRouter });

  registerWhatsAppRealTools(registry, { conversationManager: cm });

  const contactResolver = new ContactResolver({
    query: (t, o) => query(env, t, o),
    insert: (t, d) => insert(env, t, d),
  });

  globalService = new WhatsAppService({
    config: {
      WHATSAPP_TOKEN: env.WHATSAPP_TOKEN,
      WHATSAPP_PHONE_NUMBER_ID: env.WHATSAPP_PHONE_NUMBER_ID,
      WHATSAPP_API_VERSION: env.WHATSAPP_API_VERSION || "v22.0",
      WHATSAPP_APP_SECRET: env.WHATSAPP_APP_SECRET,
      WEBHOOK_VERIFY_TOKEN: env.WEBHOOK_VERIFY_TOKEN || "nexus_verify_token",
      WHATSAPP_DEFAULT_COUNTRY: env.WHATSAPP_DEFAULT_COUNTRY || "AR",
    },
    conversationManager: cm,
    conversationMemory: mem,
    runtime,
    contactResolver,
  });

  return globalService;
}

export async function handleWebhookGet(request, env) {
  try {
    const service = await getService(env);
    return service.handleWebhookGet(request, env);
  } catch (err) {
    return new Response(`Error: ${err.message}`, { status: 500 });
  }
}

export async function handleWebhookPost(request, env) {
  try {
    const service = await getService(env);
    return service.handleWebhookPost(request, env);
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
}
