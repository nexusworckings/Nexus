export class ConversationSession {
  constructor(data = {}) {
    this.conversationId = data.conversationId || `conv-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    this.clientId = data.clientId || null;
    this.clientName = data.clientName || null;
    this.phone = data.phone || null;
    this.lastMessage = data.lastMessage || null;
    this.lastInteraction = data.lastInteraction || new Date().toISOString();
    this.status = data.status || 'active';
    this.assignedAdmin = data.assignedAdmin || null;
    this.channel = data.channel || 'whatsapp';
    this.history = data.history || [];
    this.pendingTasks = data.pendingTasks || [];
    this.suggestedReply = data.suggestedReply || null;
    this.suggestedAction = data.suggestedAction || null;
    this.suggestedTools = data.suggestedTools || [];
    this.unreadCount = data.unreadCount || 0;
    this.tags = data.tags || [];
    this.metadata = data.metadata || {};
    this.createdAt = data.createdAt || new Date().toISOString();
    this.updatedAt = data.updatedAt || new Date().toISOString();
  }

  addMessage(role, content, metadata = {}) {
    this.history.push({
      role,
      content,
      timestamp: new Date().toISOString(),
      ...metadata,
    });
    this.lastMessage = content;
    this.lastInteraction = new Date().toISOString();
    this.updatedAt = new Date().toISOString();
    if (role === 'client') this.unreadCount++;
  }

  assignAdmin(adminId) {
    this.assignedAdmin = adminId;
    this.updatedAt = new Date().toISOString();
  }

  resolve() {
    this.status = 'resolved';
    this.updatedAt = new Date().toISOString();
  }

  reopen() {
    this.status = 'active';
    this.updatedAt = new Date().toISOString();
  }

  markRead() {
    this.unreadCount = 0;
  }

  addPendingTask(task) {
    this.pendingTasks.push({
      id: `task-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      ...task,
      createdAt: new Date().toISOString(),
      status: task.status || 'pending',
    });
    this.updatedAt = new Date().toISOString();
  }

  completeTask(taskId) {
    const task = this.pendingTasks.find(t => t.id === taskId);
    if (task) {
      task.status = 'completed';
      task.completedAt = new Date().toISOString();
      this.updatedAt = new Date().toISOString();
    }
  }

  setSuggestion(reply, action, tools = []) {
    this.suggestedReply = reply;
    this.suggestedAction = action;
    this.suggestedTools = tools;
    this.updatedAt = new Date().toISOString();
  }

  toJSON() {
    return {
      conversationId: this.conversationId,
      clientId: this.clientId,
      clientName: this.clientName,
      phone: this.phone,
      lastMessage: this.lastMessage,
      lastInteraction: this.lastInteraction,
      status: this.status,
      assignedAdmin: this.assignedAdmin,
      channel: this.channel,
      history: this.history,
      pendingTasks: this.pendingTasks,
      suggestedReply: this.suggestedReply,
      suggestedAction: this.suggestedAction,
      suggestedTools: this.suggestedTools,
      unreadCount: this.unreadCount,
      tags: this.tags,
      metadata: this.metadata,
      createdAt: this.createdAt,
      updatedAt: this.updatedAt,
    };
  }
}
