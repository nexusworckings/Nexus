export class ProfileManager {
  #profiles;

  constructor() {
    this.#profiles = new Map();
    this.#registerDefaults();
  }

  #registerDefaults() {
    this.register({
      id: "customer",
      systemPrompt:
        "You are Nexus, a helpful assistant for Tecno San Juan. Help customers with their queries about repairs, budgets, print orders, and general information. Be friendly and professional.",
      allowedTools: [
        "searchClient",
        "searchRepair",
        "searchBudget",
        "searchPrintOrder",
        "getConversation",
        "searchNotifications",
        "searchPrice",
        "searchBusinessInfo",
        "searchProduct",
        "searchStock",
      ],
      temperature: 0.7,
      maxIterations: 5,
      permissions: { canModify: false, canCreate: false, canDelete: false },
    });

    this.register({
      id: "admin",
      systemPrompt:
        "You are Nexus, the energetic AI assistant for Tecno San Juan administration. You speak Argentine Spanish with enthusiasm. You can modify business data, search information, and manage the system. You have full access to all tools.",
      allowedTools: [
        "searchClient",
        "searchRepair",
        "searchBudget",
        "searchPrintOrder",
        "updateRepairStatus",
        "updateBudgetStatus",
        "updatePrintOrderStatus",
        "sendWhatsApp",
        "searchInternet",
        "createBudget",
        "createRepair",
        "createPrintOrder",
        "createClient",
        "getConversation",
        "searchNotifications",
        "queryTable",
        "updateSingle",
        "updateAll",
        "findAndUpdate",
        "createRecord",
        "deleteRecord",
        "searchConversation",
        "getConversationHistory",
        "listUnreadMessages",
        "listInactiveClients",
        "buildWhatsAppMessage",
        "sendBulkWhatsApp",
        "markConversationResolved",
        "assignConversation",
        "searchRecentMessages",
        "searchPendingReplies",
        "receiveWhatsApp",
        "sendWhatsAppReal",
        "downloadMedia",
        "markAsRead",
        "typingIndicator",
        "searchConversationByPhone",
        "createConversation",
        "closeConversation",
      ],
      temperature: 0.8,
      maxIterations: 10,
      permissions: { canModify: true, canCreate: true, canDelete: true },
    });

    this.register({
      id: "interview",
      systemPrompt:
        "You are Nexus Interviewer. Your role is to conduct structured interviews to gather information from customers. Use interview schemas and questionnaire tools.",
      allowedTools: [
        "questionGenerator",
        "interpreter",
        "interviewController",
        "searchClient",
        "createClient",
        "createRepair",
        "createBudget",
        "createPrintOrder",
      ],
      temperature: 0.5,
      maxIterations: 15,
      permissions: { canModify: false, canCreate: true, canDelete: false },
    });
  }

  register(profile) {
    if (!profile || !profile.id)
      throw new Error("ProfileManager: profile must have an id");
    if (this.#profiles.has(profile.id))
      throw new Error(
        `ProfileManager: profile "${profile.id}" already registered`,
      );
    this.#profiles.set(profile.id, {
      systemPrompt: profile.systemPrompt || "",
      allowedTools: profile.allowedTools || [],
      temperature: profile.temperature ?? 0.7,
      maxIterations: profile.maxIterations ?? 5,
      permissions: profile.permissions || {},
    });
    return this;
  }

  get(profileId) {
    return this.#profiles.get(profileId) || null;
  }

  exists(profileId) {
    return this.#profiles.has(profileId);
  }

  list() {
    return Array.from(this.#profiles.entries()).map(([id, config]) => ({
      id,
      allowedTools: config.allowedTools,
      temperature: config.temperature,
      maxIterations: config.maxIterations,
    }));
  }

  ids() {
    return Array.from(this.#profiles.keys());
  }

  count() {
    return this.#profiles.size;
  }
}
