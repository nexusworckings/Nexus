import { NexusAIEngine } from './nexus-ai-engine.js';
import { ToolRegistry } from './tool-registry.js';
import { ToolExecutor } from './tool-executor.js';
import { ProfileManager } from './profile-manager.js';
import { ContextManager } from './context-manager.js';
import { PlanningEngine } from './planning-engine.js';
import { MetricsCollector } from './observability.js';
import { ConversationManager } from './conversation-manager.js';
import { ConversationMemory } from './conversation-memory.js';
import { ConversationSearch } from './conversation-search.js';
import { MessageBuilder } from './message-builder.js';
import { registerConversationTools } from './tools/conversation-tools.js';

export class AdminAssistant {
  constructor(options = {}) {
    const chatFn = options.chatFn;
    if (!chatFn) throw new Error('AdminAssistant: chatFn is required');

    this.#metrics = options.metricsCollector || new MetricsCollector();
    this.#toolRegistry = options.toolRegistry || new ToolRegistry();
    this.#toolExecutor = options.toolExecutor || new ToolExecutor({
      toolRegistry: this.#toolRegistry,
      metricsCollector: this.#metrics,
    });
    this.#profileManager = options.profileManager || new ProfileManager();
    this.#contextManager = options.contextManager || new ContextManager();
    this.#conversationManager = options.conversationManager || new ConversationManager();
    this.#conversationMemory = options.conversationMemory || new ConversationMemory();
    this.#conversationSearch = new ConversationSearch(this.#conversationManager, this.#conversationMemory);
    this.#messageBuilder = options.messageBuilder || new MessageBuilder();

    if (options.registerTools !== false) {
      const deps = options.deps || {};
      registerConversationTools(this.#toolRegistry, {
        conversationManager: this.#conversationManager,
        conversationMemory: this.#conversationMemory,
        conversationSearch: this.#conversationSearch,
        messageBuilder: this.#messageBuilder,
        whatsappChannel: deps.whatsappChannel,
        query: deps.query,
      });
    }

    this.#engine = new NexusAIEngine({
      toolRegistry: this.#toolRegistry,
      toolExecutor: this.#toolExecutor,
      profileManager: this.#profileManager,
      contextManager: this.#contextManager,
      planningEngine: new PlanningEngine({ chatFn }),
      chatFn,
      metricsCollector: this.#metrics,
    });
  }

  #metrics;
  #toolRegistry;
  #toolExecutor;
  #profileManager;
  #contextManager;
  #conversationManager;
  #conversationMemory;
  #conversationSearch;
  #messageBuilder;
  #engine;

  get engine() { return this.#engine; }
  get toolRegistry() { return this.#toolRegistry; }
  get profileManager() { return this.#profileManager; }
  get contextManager() { return this.#contextManager; }
  get conversationManager() { return this.#conversationManager; }
  get conversationMemory() { return this.#conversationMemory; }
  get conversationSearch() { return this.#conversationSearch; }
  get messageBuilder() { return this.#messageBuilder; }
  get metrics() { return this.#metrics; }

  async process(input, options = {}) {
    return this.#engine.process(input, {
      profile: 'admin',
      sessionId: options.sessionId || `admin-${Date.now()}`,
      ...options,
    });
  }

  async getSuggestions(conversationId) {
    const conv = this.#conversationManager.getConversation(conversationId);
    if (!conv) return null;

    const history = conv.history.slice(-10).map(m =>
      `[${m.role}]: ${m.content}`
    ).join('\n');

    const prompt = `Eres un asistente administrativo de ${this.#messageBuilder._businessName || 'Tecno San Juan'}.
Analiza el historial de la conversación y sugiere:
1. Una respuesta recomendada para el administrador.
2. La próxima acción recomendada.
3. Las herramientas de Nexus que consideres necesarias.

Historial:
${history}

Responde SOLO con JSON:
{"suggestedReply": "texto", "suggestedAction": "texto", "suggestedTools": ["tool1", "tool2"]}`;

    try {
      const raw = await this.#engine.process(prompt, {
        profile: 'admin',
        sessionId: `suggest-${conversationId}`,
      });

      const parsed = this.#parseSuggestion(raw);
      if (parsed) {
        conv.setSuggestion(
          parsed.suggestedReply || null,
          parsed.suggestedAction || null,
          parsed.suggestedTools || []
        );
      }
      return {
        conversationId,
        suggestedReply: conv.suggestedReply,
        suggestedAction: conv.suggestedAction,
        suggestedTools: conv.suggestedTools,
      };
    } catch {
      return {
        conversationId,
        suggestedReply: null,
        suggestedAction: 'Revisar conversación manualmente',
        suggestedTools: [],
      };
    }
  }

  async sendMessage(conversationId, message, adminId, confirmed = false) {
    if (!confirmed) {
      return {
        success: false,
        requiresConfirmation: true,
        message: 'Se requiere confirmación del administrador para enviar mensajes.',
      };
    }

    const conv = this.#conversationManager.getConversation(conversationId);
    if (!conv) {
      return { success: false, error: 'Conversación no encontrada' };
    }

    conv.addMessage('admin', message, { adminId });
    if (conv.phone) {
      try {
        const result = await this.#simulateSend(conv.phone, message);
        return { success: true, sent: true, result };
      } catch (err) {
        return { success: false, error: err.message };
      }
    }
    return { success: true, sent: false, message: 'Mensaje guardado (sin número de teléfono)' };
  }

  #parseSuggestion(raw) {
    if (raw.type === 'conversation' && raw.message) {
      try {
        return JSON.parse(raw.message);
      } catch {
        const match = raw.message.match(/\{[\s\S]*\}/);
        if (match) {
          try { return JSON.parse(match[0]); } catch {}
        }
      }
    }
    if (raw.suggestedReply) return raw;
    return null;
  }

  async #simulateSend(phone, message) {
    return { phone, message, sentAt: new Date().toISOString() };
  }
}
