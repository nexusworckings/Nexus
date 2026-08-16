export function registerWhatsAppRealTools(registry, deps = {}) {
  const ws = deps.whatsappService;
  const cm = deps.conversationManager;

  registry.register({
    name: 'receiveWhatsApp',
    description: 'Process an incoming WhatsApp message and route it through the system',
    inputSchema: {
      payload: { type: 'object', required: true },
    },
    async execute(params) {
      if (!ws) return { error: 'WhatsAppService not available' };
      const result = await ws.webhookHandler.handlePost(
        new Request('https://internal', {
          method: 'POST',
          body: JSON.stringify(params.payload),
          headers: { 'Content-Type': 'application/json' },
        }),
        {}
      );
      const data = await result.json();
      return data;
    },
  });

  registry.register({
    name: 'sendWhatsAppReal',
    description: 'Send a real WhatsApp message via Meta Cloud API',
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
      if (!ws) return { error: 'WhatsAppService not available' };
      return ws.sendMessage(params.phone, params.message);
    },
  });

  registry.register({
    name: 'downloadMedia',
    description: 'Download media from WhatsApp by media ID',
    inputSchema: {
      mediaId: { type: 'string', required: true },
    },
    async execute(params) {
      if (!ws) return { error: 'WhatsAppService not available' };
      const media = await ws.getMediaUrl(params.mediaId);
      return {
        mediaId: media.mediaId,
        url: media.url,
        mimeType: media.mimeType,
        fileSize: media.fileSize,
        fileName: media.fileName,
      };
    },
  });

  registry.register({
    name: 'markAsRead',
    description: 'Mark a WhatsApp message as read',
    inputSchema: {
      messageId: { type: 'string', required: true },
    },
    async execute(params) {
      if (!ws) return { error: 'WhatsAppService not available' };
      return ws.markAsRead(params.messageId);
    },
  });

  registry.register({
    name: 'typingIndicator',
    description: 'Send a typing indicator to a WhatsApp conversation',
    inputSchema: {
      phone: { type: 'string', required: true },
      action: { type: 'string' },
    },
    async execute(params) {
      if (!ws) return { error: 'WhatsAppService not available' };
      return ws.sendTypingIndicator(params.phone, params.action || 'typing');
    },
  });

  registry.register({
    name: 'searchConversationByPhone',
    description: 'Search for conversations by phone number',
    inputSchema: {
      phone: { type: 'string', required: true },
    },
    async execute(params) {
      if (!cm) return { error: 'ConversationManager not available' };
      const convs = cm.getConversationsByPhone(params.phone);
      return convs.map(c => ({
        conversationId: c.conversationId,
        clientName: c.clientName,
        phone: c.phone,
        status: c.status,
        lastMessage: c.lastMessage,
        lastInteraction: c.lastInteraction,
        unreadCount: c.unreadCount,
      }));
    },
  });

  registry.register({
    name: 'createConversation',
    description: 'Create a new conversation manually',
    inputSchema: {
      clientId: { type: 'string' },
      clientName: { type: 'string' },
      phone: { type: 'string', required: true },
      channel: { type: 'string' },
    },
    async execute(params) {
      if (!cm) return { error: 'ConversationManager not available' };
      const conv = cm.createConversation({
        clientId: params.clientId || null,
        clientName: params.clientName || null,
        phone: params.phone,
        channel: params.channel || 'whatsapp',
        status: 'active',
      });
      return conv.toJSON();
    },
  });

  registry.register({
    name: 'closeConversation',
    description: 'Close a conversation and mark as resolved',
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

  return registry;
}
