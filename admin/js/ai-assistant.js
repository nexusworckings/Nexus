import { getSession, clearSession } from './auth.js';

const API_BASE = 'https://nexus-production.cuatrinismaelabrahan.workers.dev';

function getToken() {
  const session = getSession();
  return session?.access_token || null;
}

async function sendInstruction(instruction) {
  const token = getToken();
  if (!token) {
    clearSession();
    window.location.href = 'login.html';
    throw new Error('Sesion no valida');
  }

  const res = await fetch(`${API_BASE}/api/admin/ai-action`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
    },
    body: JSON.stringify({ instruction }),
  });

  if (res.status === 401) {
    clearSession();
    window.location.href = 'login.html';
    throw new Error('Sesion expirada');
  }

  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'Error de conexion' }));
    throw new Error(err.error || `Error ${res.status}`);
  }

  return res.json();
}

export function renderAiAssistant(container) {
  container.innerHTML = `
    <style>
      .ai-chat { display: flex; flex-direction: column; height: 68vh; max-width: 800px; border: 1px solid #e2e8f0; border-radius: 12px; overflow: hidden; background: #fff; box-shadow: 0 1px 3px rgba(0,0,0,0.1); }
      .ai-header { background: linear-gradient(135deg, #2563eb 0%, #7c3aed 100%); color: white; padding: 14px 20px; display: flex; justify-content: space-between; align-items: center; }
      .ai-header-info h3 { font-size: 1rem; margin: 0; font-weight: 600; }
      .ai-header-info p { font-size: 0.7rem; opacity: 0.85; margin: 2px 0 0; }
      .ai-status { font-size: 0.65rem; background: rgba(255,255,255,0.2); padding: 3px 10px; border-radius: 10px; }
      .ai-messages { flex: 1; padding: 16px; overflow-y: auto; display: flex; flex-direction: column; gap: 8px; }
      .ai-msg { padding: 10px 14px; border-radius: 12px; max-width: 88%; word-wrap: break-word; line-height: 1.55; font-size: 14px; }
      .ai-msg.user { background: #2563eb; color: white; align-self: flex-end; border-bottom-right-radius: 4px; }
      .ai-msg.bot { background: #f1f5f9; color: #1e293b; align-self: flex-start; border-bottom-left-radius: 4px; }
      .ai-msg.error { background: #fef2f2; color: #991b1b; align-self: flex-start; border-left: 3px solid #dc2626; border-radius: 4px; }
      .ai-msg.success { background: #f0fdf4; color: #166534; align-self: flex-start; border-left: 3px solid #16a34a; border-radius: 4px; }
      .ai-msg.bot a { color: #2563eb; text-decoration: underline; }
      .ai-badge { display: inline-block; font-size: 0.6rem; font-weight: 600; padding: 2px 8px; border-radius: 8px; margin-bottom: 4px; }
      .ai-badge.web { background: #dbeafe; color: #1e40af; }
      .ai-badge.accion { background: #dcfce7; color: #166534; }
      .ai-input-area { display: flex; border-top: 1px solid #e2e8f0; padding: 12px; gap: 8px; }
      .ai-input-area input { flex: 1; border: 1px solid #e2e8f0; border-radius: 8px; padding: 10px 14px; font-size: 0.9rem; outline: none; }
      .ai-input-area input:focus { border-color: #7c3aed; }
      .ai-input-area button { background: linear-gradient(135deg, #2563eb 0%, #7c3aed 100%); color: white; border: none; border-radius: 8px; padding: 10px 20px; cursor: pointer; font-weight: 600; white-space: nowrap; }
      .ai-input-area button:hover { opacity: 0.9; }
      .ai-input-area button:disabled { opacity: 0.5; cursor: not-allowed; }
      .ai-thinking { display: flex; gap: 4px; padding: 10px 14px; background: #f1f5f9; border-radius: 12px; border-bottom-left-radius: 4px; width: fit-content; margin-bottom: 4px; }
      .ai-thinking span { width: 8px; height: 8px; border-radius: 50%; background: #7c3aed; animation: ai-bounce 1.4s infinite ease-in-out; }
      .ai-thinking span:nth-child(2) { animation-delay: 0.2s; }
      .ai-thinking span:nth-child(3) { animation-delay: 0.4s; }
      @keyframes ai-bounce { 0%, 60%, 100% { opacity: 0.3; transform: scale(0.8); } 30% { opacity: 1; transform: scale(1); } }
      .ai-details { margin-top: 6px; font-size: 12px; }
      .ai-details summary { cursor: pointer; font-weight: 500; color: #7c3aed; }
      .ai-details pre { margin: 6px 0 0; font-size: 11px; max-height: 150px; overflow-y: auto; white-space: pre-wrap; background: #fff; padding: 8px; border-radius: 4px; border: 1px solid #e2e8f0; }
      .ai-empty { text-align: center; padding: 40px 20px; color: #94a3b8; flex: 1; display: flex; flex-direction: column; align-items: center; justify-content: center; }
      .ai-empty p { margin: 4px 0; }
      .ai-empty .big-icon { font-size: 42px; margin-bottom: 8px; }
      .ai-ejemplos { display: flex; flex-wrap: wrap; gap: 5px; justify-content: center; margin-top: 8px; }
      .ai-ejemplos button { background: #f1f5f9; border: 1px solid #e2e8f0; padding: 3px 10px; border-radius: 12px; font-size: 11px; cursor: pointer; color: #475569; }
      .ai-ejemplos button:hover { background: #e2e8f0; border-color: #94a3b8; }
      .ai-ejemplos .cat-label { width: 100%; font-size: 10px; font-weight: 600; color: #94a3b8; text-transform: uppercase; letter-spacing: 0.5px; margin: 6px 0 2px; }
      @media (max-width: 600px) { .ai-chat { height: 72vh; max-width: 100%; } .ai-msg { max-width: 95%; } }
    </style>

    <div class="ai-chat">
      <div class="ai-header">
        <div class="ai-header-info">
          <h3>&#x2728; Nexus</h3>
          <p>Tu compañera IA con toda la energia positiva! Como vas?</p>
        </div>
        <span class="ai-status">conectada</span>
      </div>

      <div class="ai-messages" id="aiMessages">
        <div class="ai-empty" id="aiEmpty">
          <div class="big-icon">&#x1F916;</div>
          <p><strong>Holis! Soy Nexus &#x2728;</strong></p>
          <p style="font-size:13px">Tu compa IA con re pila! Pregunta, pedi, lo que necesites!</p>
          <div class="ai-ejemplos">
            <div class="cat-label">--- Consultas ---</div>
            <button data-ejemplo="Que productos tenemos en el catalogo?">Que vendemos?</button>
            <button data-ejemplo="Cual es el mejor monitor gamer calidad precio hoy?">Mejor monitor?</button>
            <button data-ejemplo="Que opinas del nuevo i9? vale la pena?">i9 vale la pena?</button>
            <button data-ejemplo="Comparativa RTX 5060 vs RX 9070">RTX 5060 vs RX 9070</button>
            <div class="cat-label">--- Acciones ---</div>
            <button data-ejemplo="Aumentar todos los precios de productos un 15%">+15% productos</button>
            <button data-ejemplo="Cambiar el precio del Monitor 4K a 175000">Precio monitor</button>
            <button data-ejemplo="Agregar un nuevo producto: Teclado inalambrico, 25000">Agregar producto</button>
            <button data-ejemplo="Agregar una categoria nueva llamada Tablets">Agregar categoria</button>
          </div>
        </div>
      </div>

      <div class="ai-input-area">
        <input id="aiInput" placeholder="Dale! Que necesitas? Pasame la data!" />
        <button id="aiSendBtn">Enviar</button>
      </div>
    </div>
  `;

  const messagesEl = document.getElementById('aiMessages');
  const emptyEl = document.getElementById('aiEmpty');
  const inputEl = document.getElementById('aiInput');
  const sendBtn = document.getElementById('aiSendBtn');

  function addMsg(type, html, badge) {
    emptyEl.style.display = 'none';
    const div = document.createElement('div');
    div.className = 'ai-msg ' + type;
    let content = '';
    if (badge) content += '<span class="ai-badge ' + badge + '"></span>';
    content += html;
    div.innerHTML = content;
    messagesEl.appendChild(div);
    messagesEl.scrollTop = messagesEl.scrollHeight;
  }

  function showThinking() {
    emptyEl.style.display = 'none';
    const div = document.createElement('div');
    div.className = 'ai-thinking';
    div.id = 'aiThink';
    div.innerHTML = '<span></span><span></span><span></span>';
    messagesEl.appendChild(div);
    messagesEl.scrollTop = messagesEl.scrollHeight;
    sendBtn.disabled = true;
    inputEl.disabled = true;
  }

  function hideThinking() {
    const el = document.getElementById('aiThink');
    if (el) el.remove();
    sendBtn.disabled = false;
    inputEl.disabled = false;
    inputEl.focus();
  }

  function formatResponse(text) {
    return text
      .replace(/\n/g, '<br>')
      .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
      .replace(/`(.*?)`/g, '<code>$1</code>');
  }

  async function handleSend() {
    const text = inputEl.value.trim();
    if (!text) return;

    addMsg('user', formatResponse(text));
    inputEl.value = '';
    showThinking();

    try {
      const result = await sendInstruction(text);
      hideThinking();

      if (result.success === false) {
        addMsg('error', '<strong>Error:</strong> ' + escapeHtml(result.summary || 'Algo salio mal'));
        return;
      }

      if (result.type === 'accion') {
        const badge = 'accion';
        const badgeLabel = result.changes?.length > 0 ? 'Modificacion aplicada' : '';

        let html = '';
        if (result.explanation) {
          html += '<div>' + formatResponse(result.explanation) + '</div>';
        }
        if (result.response && result.response !== result.explanation) {
          html += '<div style="margin-top:6px">' + formatResponse(result.response) + '</div>';
        }

        if (result.changes && result.changes.length > 0) {
          const json = JSON.stringify(result.changes, null, 2);
          html += '<div class="ai-details"><details><summary>Ver detalle (' + result.changes.length + ' accion(es))</summary><pre>' + escapeHtml(json) + '</pre></details></div>';
        }

        addMsg('success', '<span class="ai-badge accion">Hecho!</span> ' + html);
      } else {
        const badge = result.webSearchUsed ? 'web' : '';
        const badgeLabel = result.webSearchUsed ? 'Busqueda web' : '';

        let html = '';
        if (result.response) {
          html += formatResponse(result.response);
        } else if (result.summary) {
          html += formatResponse(result.summary);
        }

        addMsg('bot', (badge ? '<span class="ai-badge web">Busqueda web</span> ' : '') + html);

        if (result.changes && result.changes.length > 0) {
          const json = JSON.stringify(result.changes, null, 2);
          html += '<div class="ai-details"><details><summary>Ver detalle (' + result.changes.length + ' accion(es))</summary><pre>' + escapeHtml(json) + '</pre></details></div>';
        }
      }
    } catch (err) {
      hideThinking();
      addMsg('error', '<strong>Error:</strong> ' + escapeHtml(err.message));
    }
  }

  function escapeHtml(s) {
    const d = document.createElement('div');
    d.textContent = s;
    return d.innerHTML;
  }

  sendBtn.addEventListener('click', handleSend);
  inputEl.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); }
  });

  messagesEl.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-ejemplo]');
    if (btn) {
      inputEl.value = btn.dataset.ejemplo;
      handleSend();
    }
  });
}
