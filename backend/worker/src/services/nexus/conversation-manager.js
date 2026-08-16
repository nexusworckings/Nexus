import { ConversationSession } from './conversation-session.js';

export class ConversationManager {
  constructor() {
    this.#conversations = new Map();
  }

  #conversations;

  createConversation(data = {}) {
    const session = new ConversationSession(data);
    this.#conversations.set(session.conversationId, session);
    return session;
  }

  getConversation(conversationId) {
    return this.#conversations.get(conversationId) || null;
  }

  hasConversation(conversationId) {
    return this.#conversations.has(conversationId);
  }

  deleteConversation(conversationId) {
    this.#conversations.delete(conversationId);
  }

  listConversations(filters = {}) {
    let list = Array.from(this.#conversations.values());
    if (filters.status) list = list.filter(c => c.status === filters.status);
    if (filters.assignedAdmin) list = list.filter(c => c.assignedAdmin === filters.assignedAdmin);
    if (filters.channel) list = list.filter(c => c.channel === filters.channel);
    if (filters.clientId) list = list.filter(c => c.clientId === filters.clientId);
    if (filters.search) {
      const q = filters.search.toLowerCase();
      list = list.filter(c =>
        (c.clientName && c.clientName.toLowerCase().includes(q)) ||
        (c.phone && c.phone.includes(q)) ||
        (c.lastMessage && c.lastMessage.toLowerCase().includes(q))
      );
    }
    if (filters.unread) list = list.filter(c => c.unreadCount > 0);
    return list.sort((a, b) => new Date(b.lastInteraction) - new Date(a.lastInteraction));
  }

  count(filters = {}) {
    return this.listConversations(filters).length;
  }

  getInactiveClients(daysThreshold = 30) {
    const now = new Date();
    return Array.from(this.#conversations.values()).filter(c => {
      const diff = (now - new Date(c.lastInteraction)) / (1000 * 60 * 60 * 24);
      return diff >= daysThreshold;
    });
  }

  getConversationsByPhone(phone) {
    return Array.from(this.#conversations.values()).filter(c => c.phone === phone);
  }

  getUnreadConversations() {
    return this.listConversations({ unread: true });
  }

  searchMessages(query) {
    const q = query.toLowerCase();
    const results = [];
    for (const conv of this.#conversations.values()) {
      for (const msg of conv.history) {
        if (msg.content && msg.content.toLowerCase().includes(q)) {
          results.push({
            conversationId: conv.conversationId,
            clientName: conv.clientName,
            phone: conv.phone,
            message: msg,
          });
        }
      }
    }
    return results.sort((a, b) => new Date(b.message.timestamp) - new Date(a.message.timestamp));
  }

  getPendingReplies() {
    return Array.from(this.#conversations.values()).filter(c =>
      c.status === 'active' &&
      c.history.length > 0 &&
      c.history[c.history.length - 1].role === 'client'
    );
  }

  clear() {
    this.#conversations.clear();
  }

  get allConversations() {
    return Array.from(this.#conversations.values());
  }
}
