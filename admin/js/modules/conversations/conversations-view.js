export default function renderConversations(container) {
  container.innerHTML = `
    <div class="conversations-layout">
      <div class="conv-sidebar">
        <div class="conv-sidebar-header">
          <input type="text" id="convSearch" placeholder="Buscar conversaciones..." class="conv-search-input" />
          <div class="conv-filters">
            <button class="conv-filter active" data-filter="all">Todas</button>
            <button class="conv-filter" data-filter="unread">No leídas</button>
            <button class="conv-filter" data-filter="pending">Pendientes</button>
            <button class="conv-filter" data-filter="resolved">Resueltas</button>
          </div>
        </div>
        <div class="conv-list" id="convList">
          <div class="conv-loading">Cargando conversaciones...</div>
        </div>
      </div>
      <div class="conv-main" id="convMain">
        <div class="conv-empty">
          <div class="conv-empty-icon">💬</div>
          <h3>Seleccioná una conversación</h3>
          <p>Elegí una conversación de la lista para ver su historial y responder.</p>
        </div>
      </div>
    </div>
  `;

  let conversations = [];
  let activeConvId = null;
  let currentFilter = 'all';

  const convList = document.getElementById('convList');
  const convMain = document.getElementById('convMain');
  const convSearch = document.getElementById('convSearch');

  function getFilteredConversations() {
    let list = [...conversations];
    const searchTerm = convSearch.value.toLowerCase().trim();
    if (searchTerm) {
      list = list.filter(c =>
        (c.clientName && c.clientName.toLowerCase().includes(searchTerm)) ||
        (c.phone && c.phone.includes(searchTerm)) ||
        (c.lastMessage && c.lastMessage.toLowerCase().includes(searchTerm))
      );
    }
    switch (currentFilter) {
      case 'unread': list = list.filter(c => c.unreadCount > 0); break;
      case 'pending': list = list.filter(c => c.status === 'active' && c.unreadCount > 0); break;
      case 'resolved': list = list.filter(c => c.status === 'resolved'); break;
    }
    return list.sort((a, b) => new Date(b.lastInteraction) - new Date(a.lastInteraction));
  }

  function renderConversationList() {
    const filtered = getFilteredConversations();
    if (filtered.length === 0) {
      convList.innerHTML = '<div class="conv-empty-list">No hay conversaciones</div>';
      return;
    }
    convList.innerHTML = filtered.map(c => `
      <div class="conv-item ${c.conversationId === activeConvId ? 'active' : ''} ${c.unreadCount > 0 ? 'unread' : ''}"
           data-id="${c.conversationId}">
        <div class="conv-item-avatar">${(c.clientName || '?')[0]}</div>
        <div class="conv-item-content">
          <div class="conv-item-header">
            <span class="conv-item-name">${c.clientName || 'Sin nombre'}</span>
            <span class="conv-item-time">${formatTime(c.lastInteraction)}</span>
          </div>
          <div class="conv-item-preview">${c.lastMessage || 'Sin mensajes'}</div>
          <div class="conv-item-meta">
            <span class="conv-item-channel">${c.channel || 'whatsapp'}</span>
            ${c.assignedAdmin ? `<span class="conv-item-admin">${c.assignedAdmin}</span>` : ''}
          </div>
        </div>
        ${c.unreadCount > 0 ? `<div class="conv-item-badge">${c.unreadCount}</div>` : ''}
      </div>
    `).join('');

    convList.querySelectorAll('.conv-item').forEach(el => {
      el.addEventListener('click', () => {
        selectConversation(el.dataset.id);
      });
    });
  }

  async function selectConversation(convId) {
    activeConvId = convId;
    const conv = conversations.find(c => c.conversationId === convId);
    if (!conv) return;

    renderConversationList();
    renderConversationDetail(conv);

    try {
      const suggestions = await getAiSuggestions(convId, conv.history || []);
      renderSuggestions(suggestions, conv);
    } catch {
      // suggestions are optional
    }
  }

  function renderConversationDetail(conv) {
    const history = conv.history || [];
    convMain.innerHTML = `
      <div class="conv-detail">
        <div class="conv-detail-header">
          <div class="conv-detail-info">
            <h2>${conv.clientName || 'Sin nombre'}</h2>
            <span class="conv-detail-phone">${conv.phone || 'Sin teléfono'}</span>
            <span class="conv-detail-status status-${conv.status}">${conv.status}</span>
          </div>
          <div class="conv-detail-actions">
            <button class="btn btn-sm btn-outline" id="markResolvedBtn" ${conv.status === 'resolved' ? 'disabled' : ''}>
              ${conv.status === 'resolved' ? '✓ Resuelta' : 'Marcar resuelta'}
            </button>
          </div>
        </div>
        <div class="conv-messages" id="convMessages">
          ${history.length === 0 ? '<div class="conv-empty-msg">No hay mensajes en esta conversación</div>' :
            history.map(msg => `
              <div class="conv-msg ${msg.role === 'admin' ? 'msg-admin' : 'msg-client'}">
                <div class="msg-bubble">
                  <div class="msg-text">${escapeHtml(msg.content)}</div>
                  <div class="msg-time">${formatTime(msg.timestamp)}</div>
                </div>
              </div>
            `).join('')
          }
        </div>
        <div class="conv-suggestions" id="convSuggestions">
          <div class="suggestions-loading">Generando sugerencias...</div>
        </div>
        <div class="conv-composer">
          <textarea id="convMessageInput" class="conv-input" placeholder="Escribí un mensaje..." rows="2"></textarea>
          <div class="conv-composer-actions">
            <button class="btn btn-primary" id="sendMsgBtn" disabled>Enviar</button>
          </div>
        </div>
      </div>
    `;

    document.getElementById('convMessages').scrollTop = document.getElementById('convMessages').scrollHeight;

    const input = document.getElementById('convMessageInput');
    const sendBtn = document.getElementById('sendMsgBtn');

    input.addEventListener('input', () => {
      sendBtn.disabled = !input.value.trim();
    });

    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        if (input.value.trim()) sendMessage(conv);
      }
    });

    sendBtn.addEventListener('click', () => sendMessage(conv));

    const markBtn = document.getElementById('markResolvedBtn');
    if (markBtn && !markBtn.disabled) {
      markBtn.addEventListener('click', async () => {
        conv.status = 'resolved';
        renderConversationDetail(conv);
        renderConversationList();
      });
    }
  }

  function renderSuggestions(suggestions, conv) {
    const el = document.getElementById('convSuggestions');
    if (!el) return;

    if (!suggestions || (!suggestions.suggestedReply && !suggestions.suggestedAction)) {
      el.innerHTML = '';
      return;
    }

    el.innerHTML = `
      <div class="suggestions-panel">
        <div class="suggestions-header">💡 Sugerencias de IA</div>
        ${suggestions.suggestedReply ? `
          <div class="suggestion-item">
            <div class="suggestion-label">Respuesta sugerida:</div>
            <div class="suggestion-text">${escapeHtml(suggestions.suggestedReply)}</div>
            <button class="btn btn-sm btn-outline suggestion-use-btn">Usar esta respuesta</button>
          </div>
        ` : ''}
        ${suggestions.suggestedAction ? `
          <div class="suggestion-item">
            <div class="suggestion-label">Próxima acción:</div>
            <div class="suggestion-text">${escapeHtml(suggestions.suggestedAction)}</div>
          </div>
        ` : ''}
        ${suggestions.suggestedTools && suggestions.suggestedTools.length > 0 ? `
          <div class="suggestion-item">
            <div class="suggestion-label">Herramientas necesarias:</div>
            <div class="suggestion-tools">${suggestions.suggestedTools.map(t => `<span class="tool-tag">${t}</span>`).join('')}</div>
          </div>
        ` : ''}
      </div>
    `;

    const useBtn = el.querySelector('.suggestion-use-btn');
    if (useBtn) {
      useBtn.addEventListener('click', () => {
        const input = document.getElementById('convMessageInput');
        if (input) {
          input.value = suggestions.suggestedReply;
          document.getElementById('sendMsgBtn').disabled = false;
          input.focus();
        }
      });
    }
  }

  function sendMessage(conv) {
    const input = document.getElementById('convMessageInput');
    const msg = input.value.trim();
    if (!msg) return;

    if (!conv.history) conv.history = [];
    conv.history.push({ role: 'admin', content: msg, timestamp: new Date().toISOString() });
    conv.lastMessage = msg;
    conv.lastInteraction = new Date().toISOString();
    conv.unreadCount = 0;

    input.value = '';
    document.getElementById('sendMsgBtn').disabled = true;

    renderConversationDetail(conv);
    renderConversationList();
  }

  function formatTime(iso) {
    if (!iso) return '';
    const d = new Date(iso);
    const now = new Date();
    const diff = (now - d) / (1000 * 60);
    if (diff < 1) return 'ahora';
    if (diff < 60) return `${Math.floor(diff)}m`;
    if (diff < 1440) return `${Math.floor(diff / 60)}h`;
    return d.toLocaleDateString('es-AR', { day: 'numeric', month: 'short' });
  }

  function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  async function getAiSuggestions(convId, history) {
    try {
      const resp = await fetch('/api/admin/ai-suggestions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${sessionStorage.getItem('token')}` },
        body: JSON.stringify({ conversationId: convId, history: history.slice(-10) }),
      });
      if (!resp.ok) return null;
      return await resp.json();
    } catch {
      return null;
    }
  }

  async function loadConversations() {
    try {
      const resp = await fetch('/api/admin/conversations', {
        headers: { 'Authorization': `Bearer ${sessionStorage.getItem('token')}` },
      });
      if (resp.ok) {
        conversations = await resp.json();
      }
    } catch {
      conversations = [];
    }
    renderConversationList();

    if (conversations.length === 0) {
      convList.innerHTML = `
        <div class="conv-empty-list">
          <p>No hay conversaciones activas.</p>
          <p style="font-size:13px;color:var(--text-light);margin-top:8px;">
            Las conversaciones aparecerán aquí cuando los clientes interactúen con Nexus.
          </p>
        </div>`;
    }
  }

  document.querySelectorAll('.conv-filter').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.conv-filter').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      currentFilter = btn.dataset.filter;
      renderConversationList();
    });
  });

  convSearch.addEventListener('input', () => renderConversationList());

  loadConversations();
}
