export class ConversationSearch {
  constructor(conversationManager, conversationMemory) {
    this.#conversationManager = conversationManager;
    this.#conversationMemory = conversationMemory;
  }

  #conversationManager;
  #conversationMemory;

  searchConversations(query, filters = {}) {
    const q = query.toLowerCase();
    return this.#conversationManager.listConversations(filters).filter(c => {
      if (c.clientName && c.clientName.toLowerCase().includes(q)) return true;
      if (c.phone && c.phone.includes(q)) return true;
      if (c.lastMessage && c.lastMessage.toLowerCase().includes(q)) return true;
      if (c.conversationId && c.conversationId.toLowerCase().includes(q)) return true;
      return false;
    });
  }

  getConversationHistory(conversationId, limit = 50) {
    const conv = this.#conversationManager.getConversation(conversationId);
    if (!conv) return [];
    return conv.history.slice(-limit);
  }

  listUnreadMessages() {
    return this.#conversationManager.getUnreadConversations().map(c => ({
      conversationId: c.conversationId,
      clientName: c.clientName,
      phone: c.phone,
      lastMessage: c.lastMessage,
      unreadCount: c.unreadCount,
      lastInteraction: c.lastInteraction,
    }));
  }

  listInactiveClients(daysThreshold = 30) {
    return this.#conversationManager.getInactiveClients(daysThreshold).map(c => ({
      conversationId: c.conversationId,
      clientName: c.clientName,
      phone: c.phone,
      lastInteraction: c.lastInteraction,
      daysInactive: Math.floor((Date.now() - new Date(c.lastInteraction)) / (1000 * 60 * 60 * 24)),
    }));
  }

  searchRecentMessages(query, limit = 20) {
    const results = this.#conversationManager.searchMessages(query);
    return results.slice(0, limit);
  }

  searchPendingReplies() {
    return this.#conversationManager.getPendingReplies().map(c => ({
      conversationId: c.conversationId,
      clientName: c.clientName,
      phone: c.phone,
      lastMessage: c.lastMessage,
      lastInteraction: c.lastInteraction,
    }));
  }

  getMemorySummary(conversationId) {
    const memory = this.#conversationMemory.getConversationMemory(conversationId);
    const summary = this.#conversationMemory.getSummary(conversationId);
    return { memory, summary };
  }
}
