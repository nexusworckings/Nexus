export function registerConversationTools(registry, deps = {}) {
  const cm = deps.conversationManager;
  const mem = deps.conversationMemory;
  const cs = deps.conversationSearch;
  const mb = deps.messageBuilder;
  const wc = deps.whatsappChannel;
  const query = deps.query;

  registry.register({
    name: 'searchConversation',
    description: 'Search conversations by client name, phone, or message content',
    inputSchema: {
      query: { type: 'string', required: true },
      status: { type: 'string' },
    },
    async execute(params) {
      if (!cm) return { error: 'ConversationManager not available' };
      const filters = {};
      if (params.status) filters.status = params.status;
      return cs ? cs.searchConversations(params.query, filters) : cm.listConversations(filters)
        .filter(c =>
          (c.clientName && c.clientName.toLowerCase().includes(params.query.toLowerCase())) ||
          (c.phone && c.phone.includes(params.query))
        );
    },
  });

  registry.register({
    name: 'getConversationHistory',
    description: 'Retrieve full conversation history for a conversation',
    inputSchema: {
      conversationId: { type: 'string', required: true },
      limit: { type: 'number' },
    },
    async execute(params) {
      if (!cm) return { error: 'ConversationManager not available' };
      const conv = cm.getConversation(params.conversationId);
      if (!conv) return { error: 'Conversation not found' };
      const limit = params.limit || 50;
      return {
        conversationId: conv.conversationId,
        clientName: conv.clientName,
        phone: conv.phone,
        status: conv.status,
        history: conv.history.slice(-limit),
      };
    },
  });

  registry.register({
    name: 'listUnreadMessages',
    description: 'List all conversations with unread messages',
    inputSchema: {},
    async execute() {
      if (!cm) return { error: 'ConversationManager not available' };
      return cm.getUnreadConversations().map(c => ({
        conversationId: c.conversationId,
        clientName: c.clientName,
        phone: c.phone,
        lastMessage: c.lastMessage,
        unreadCount: c.unreadCount,
        lastInteraction: c.lastInteraction,
      }));
    },
  });

  registry.register({
    name: 'listInactiveClients',
    description: 'List clients who have been inactive for a given number of days',
    inputSchema: {
      days: { type: 'number' },
    },
    async execute(params) {
      if (!cm) return { error: 'ConversationManager not available' };
      const days = params.days || 30;
      return cm.getInactiveClients(days).map(c => ({
        conversationId: c.conversationId,
        clientName: c.clientName,
        phone: c.phone,
        lastInteraction: c.lastInteraction,
        daysInactive: Math.floor((Date.now() - new Date(c.lastInteraction)) / (1000 * 60 * 60 * 24)),
      }));
    },
  });

  registry.register({
    name: 'buildWhatsAppMessage',
    description: 'Build a professional WhatsApp message using a template',
    inputSchema: {
      template: { type: 'string', required: true },
      data: { type: 'object', required: true },
    },
    async execute(params) {
      if (!mb) return { error: 'MessageBuilder not available' };
      const template = params.template;
      const data = params.data;
      let message;
      switch (template) {
        case 'repairReady': message = mb.repairReady(data); break;
        case 'repairInProgress': message = mb.repairInProgress(data); break;
        case 'budgetReady': message = mb.budgetReady(data); break;
        case 'budgetApproved': message = mb.budgetApproved(data); break;
        case 'printOrderReady': message = mb.printOrderReady(data); break;
        case 'appointmentReminder': message = mb.appointmentReminder(data); break;
        case 'paymentReminder': message = mb.paymentReminder(data); break;
        case 'generalNotification': message = mb.generalNotification(data); break;
        case 'replyToClient': message = mb.replyToClient(data); break;
        case 'bulkNotification': message = mb.bulkNotification(data); break;
        case 'customMessage': message = mb.customMessage(data); break;
        default: return { error: `Unknown template: ${template}` };
      }
      return { template, message };
    },
  });

  registry.register({
    name: 'sendBulkWhatsApp',
    description: 'Send a WhatsApp message to multiple clients (requires admin confirmation)',
    inputSchema: {
      phones: { type: 'array', required: true },
      message: { type: 'string', required: true },
      confirmed: { type: 'boolean' },
    },
    async execute(params) {
      if (!params.confirmed) {
        return {
          requiresConfirmation: true,
          message: 'Se requiere confirmación para enviar mensajes masivos.',
          recipients: params.phones.length,
          preview: params.message.slice(0, 100),
        };
      }
      if (!wc) return { error: 'WhatsApp channel not available' };
      const results = [];
      for (const phone of params.phones) {
        try {
          const sent = await wc.send(phone, params.message);
          results.push({ phone, success: true, sent });
        } catch (err) {
          results.push({ phone, success: false, error: err.message });
        }
      }
      const succeeded = results.filter(r => r.success).length;
      return {
        sent: succeeded,
        failed: results.length - succeeded,
        total: results.length,
        results,
      };
    },
  });

  registry.register({
    name: 'sendWhatsApp',
    description: 'Send a WhatsApp message to a single client (requires admin confirmation)',
    inputSchema: {
      phone: { type: 'string', required: true },
      message: { type: 'string', required: true },
      confirmed: { type: 'boolean' },
    },
    async execute(params) {
      if (!params.confirmed) {
        return {
          requiresConfirmation: true,
          message: 'Se requiere confirmación del administrador para enviar mensajes.',
          preview: params.message.slice(0, 100),
        };
      }
      if (!wc) {
        return { success: true, simulated: true, phone: params.phone, message: params.message };
      }
      try {
        const result = await wc.send(params.phone, params.message);
        return { success: true, phone: params.phone, result };
      } catch (err) {
        return { success: false, error: err.message };
      }
    },
  });

  registry.register({
    name: 'markConversationResolved',
    description: 'Mark a conversation as resolved',
    inputSchema: {
      conversationId: { type: 'string', required: true },
    },
    async execute(params) {
      if (!cm) return { error: 'ConversationManager not available' };
      const conv = cm.getConversation(params.conversationId);
      if (!conv) return { error: 'Conversation not found' };
      conv.resolve();
      return { success: true, conversationId: params.conversationId, status: 'resolved' };
    },
  });

  registry.register({
    name: 'assignConversation',
    description: 'Assign a conversation to an admin',
    inputSchema: {
      conversationId: { type: 'string', required: true },
      adminId: { type: 'string', required: true },
    },
    async execute(params) {
      if (!cm) return { error: 'ConversationManager not available' };
      const conv = cm.getConversation(params.conversationId);
      if (!conv) return { error: 'Conversation not found' };
      conv.assignAdmin(params.adminId);
      return { success: true, conversationId: params.conversationId, assignedAdmin: params.adminId };
    },
  });

  registry.register({
    name: 'searchRecentMessages',
    description: 'Search recent messages across all conversations by content',
    inputSchema: {
      query: { type: 'string', required: true },
      limit: { type: 'number' },
    },
    async execute(params) {
      if (!cm) return { error: 'ConversationManager not available' };
      const limit = params.limit || 20;
      return cm.searchMessages(params.query).slice(0, limit);
    },
  });

  registry.register({
    name: 'searchPendingReplies',
    description: 'List conversations where the client is waiting for a reply',
    inputSchema: {},
    async execute() {
      if (!cm) return { error: 'ConversationManager not available' };
      return cm.getPendingReplies().map(c => ({
        conversationId: c.conversationId,
        clientName: c.clientName,
        phone: c.phone,
        lastMessage: c.lastMessage,
        lastInteraction: c.lastInteraction,
      }));
    },
  });

  return registry;
}
