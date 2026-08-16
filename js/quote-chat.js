import { fetchChat, fetchPublic } from './api.js';
import { $, createElement } from './utils.js';

const FIN_MARKER = '[FIN_QUOTE]';

const MODAL_STYLES = `
  .quote-overlay {
    position: fixed;
    top: 0; left: 0; right: 0; bottom: 0;
    background: rgba(0,0,0,0.6);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 2000;
    padding: 16px;
    opacity: 0;
    transition: opacity 0.25s ease;
  }
  .quote-overlay.open { opacity: 1; }
  .quote-overlay.closing { opacity: 0; }
  .quote-modal {
    background: #fff;
    border-radius: 16px;
    width: 100%;
    max-width: 520px;
    max-height: 85vh;
    display: flex;
    flex-direction: column;
    box-shadow: 0 16px 48px rgba(0,0,0,0.25);
    overflow: hidden;
    transform: scale(0.95) translateY(12px);
    transition: transform 0.25s ease;
  }
  .quote-overlay.open .quote-modal { transform: scale(1) translateY(0); }
  .quote-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 16px 20px;
    background: linear-gradient(135deg, var(--primary) 0%, #7c3aed 100%);
    color: #fff;
  }
  .quote-header h3 { font-size: 1rem; margin: 0; font-weight: 600; }
  .quote-header-actions { display: flex; gap: 8px; }
  .quote-header-actions button {
    background: rgba(255,255,255,0.2);
    border: none;
    color: #fff;
    width: 32px; height: 32px;
    border-radius: 50%;
    cursor: pointer;
    font-size: 1.1rem;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: background 0.2s;
  }
  .quote-header-actions button:hover { background: rgba(255,255,255,0.35); }
  .quote-messages {
    flex: 1;
    padding: 16px 20px;
    overflow-y: auto;
    display: flex;
    flex-direction: column;
    gap: 10px;
    min-height: 280px;
    max-height: 45vh;
  }
  .quote-msg {
    padding: 10px 14px;
    border-radius: 14px;
    max-width: 88%;
    word-wrap: break-word;
    line-height: 1.5;
    font-size: 0.9rem;
  }
  .quote-msg.user {
    background: var(--primary);
    color: #fff;
    align-self: flex-end;
    border-bottom-right-radius: 4px;
  }
  .quote-msg.bot {
    background: #f1f5f9;
    color: var(--text);
    align-self: flex-start;
    border-bottom-left-radius: 4px;
  }
  .quote-msg.bot strong { color: var(--primary); }
  .quote-input-area {
    display: flex;
    gap: 8px;
    padding: 12px 16px;
    border-top: 1px solid var(--border);
  }
  .quote-input-area input {
    flex: 1;
    border: 1px solid var(--border);
    border-radius: 10px;
    padding: 10px 14px;
    font-size: 0.9rem;
    outline: none;
    font-family: inherit;
  }
  .quote-input-area input:focus { border-color: var(--primary); }
  .quote-input-area button {
    background: var(--primary);
    color: #fff;
    border: none;
    border-radius: 10px;
    padding: 10px 18px;
    font-weight: 600;
    cursor: pointer;
    font-size: 0.85rem;
    transition: background 0.2s;
    white-space: nowrap;
  }
  .quote-input-area button:hover { background: var(--primary-dark); }
  .quote-input-area button:disabled { opacity: 0.5; cursor: not-allowed; }
  .quote-typing {
    display: flex;
    gap: 4px;
    padding: 10px 14px;
    background: #f1f5f9;
    border-radius: 14px;
    border-bottom-left-radius: 4px;
    width: fit-content;
  }
  .quote-typing span {
    width: 8px; height: 8px;
    border-radius: 50%;
    background: #94a3b8;
    animation: quote-bounce 1.4s infinite ease-in-out;
  }
  .quote-typing span:nth-child(2) { animation-delay: 0.2s; }
  .quote-typing span:nth-child(3) { animation-delay: 0.4s; }
  @keyframes quote-bounce {
    0%, 60%, 100% { opacity: 0.3; transform: scale(0.8); }
    30% { opacity: 1; transform: scale(1); }
  }
  .quote-summary {
    padding: 16px 20px;
    background: #f8fafc;
    border-top: 1px solid var(--border);
  }
  .quote-summary pre {
    font-family: inherit;
    white-space: pre-wrap;
    font-size: 0.85rem;
    line-height: 1.6;
    background: #fff;
    padding: 14px;
    border-radius: 10px;
    border: 1px solid var(--border);
    max-height: 280px;
    overflow-y: auto;
  }
  .quote-summary-actions {
    display: flex;
    gap: 8px;
    margin-top: 12px;
    flex-wrap: wrap;
  }
  .quote-summary-actions .btn {
    flex: 1;
    text-align: center;
    font-size: 0.85rem;
  }
  .btn-success {
    background: #22c55e;
    color: #fff;
    border: none;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 6px;
    padding: 10px 16px;
    border-radius: 8px;
    font-weight: 600;
    cursor: pointer;
    text-decoration: none;
    transition: opacity 0.2s;
  }
  .btn-success:hover { opacity: 0.9; }
  .quote-empty {
    text-align: center;
    padding: 40px 20px;
    color: #94a3b8;
    flex: 1;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    font-size: 0.9rem;
  }

  @media (max-width: 600px) {
    .quote-overlay { padding: 0; }
    .quote-modal { max-width: 100%; max-height: 100vh; border-radius: 0; }
    .quote-messages { max-height: none; min-height: 55vh; }
  }
`;

let stylesInjected = false;

function injectStyles() {
  if (stylesInjected) return;
  const style = document.createElement('style');
  style.textContent = MODAL_STYLES;
  document.head.appendChild(style);
  stylesInjected = true;
}

export function openQuoteChat({ context, title }) {
  injectStyles();

  const overlay = createElement('div', { className: 'quote-overlay' });
  overlay.innerHTML = `
    <div class="quote-modal">
      <div class="quote-header">
        <h3>${title || 'Solicitar presupuesto'}</h3>
        <div class="quote-header-actions">
          <button class="quote-restart-btn" title="Reiniciar">↻</button>
          <button class="quote-close-btn" title="Cerrar">✕</button>
        </div>
      </div>
      <div class="quote-messages" id="quoteMessages">
        <div class="quote-empty" id="quoteEmpty">
          <p style="margin-bottom:4px">Completá tus datos y la IA te va guiando</p>
          <p style="font-size:0.8rem;opacity:0.7">Escribí tu primera respuesta para empezar</p>
        </div>
      </div>
      <div class="quote-input-area" id="quoteInputArea">
        <input id="quoteInput" placeholder="Escribí tu respuesta..." />
        <button id="quoteSendBtn">Enviar</button>
      </div>
      <div class="quote-summary" id="quoteSummary" style="display:none"></div>
    </div>
  `;

  document.body.appendChild(overlay);
  requestAnimationFrame(() => overlay.classList.add('open'));

  const messagesEl = overlay.querySelector('#quoteMessages');
  const emptyEl = overlay.querySelector('#quoteEmpty');
  const inputEl = overlay.querySelector('#quoteInput');
  const sendBtn = overlay.querySelector('#quoteSendBtn');
  const summaryEl = overlay.querySelector('#quoteSummary');
  const inputArea = overlay.querySelector('#quoteInputArea');

  let finished = false;
  let phoneNumber = '';

  fetchPublic('phones').then(phones => {
    if (phones && phones.length > 0) {
      const whatsapp = phones.find(p => p.is_whatsapp) || phones[0];
      if (whatsapp) phoneNumber = whatsapp.number.replace(/[^0-9]/g, '');
    }
  }).catch(() => {});

  function close() {
    overlay.classList.add('closing');
    setTimeout(() => overlay.remove(), 250);
  }

  function reset() {
    messagesEl.innerHTML = `<div class="quote-empty" id="quoteEmpty">
      <p style="margin-bottom:4px">Completá tus datos y la IA te va guiando</p>
      <p style="font-size:0.8rem;opacity:0.7">Escribí tu primera respuesta para empezar</p>
    </div>`;
    summaryEl.style.display = 'none';
    summaryEl.innerHTML = '';
    inputArea.style.display = 'flex';
    inputEl.disabled = false;
    sendBtn.disabled = false;
    inputEl.value = '';
    finished = false;
    inputEl.focus();
  }

  overlay.querySelector('.quote-close-btn').addEventListener('click', close);
  overlay.querySelector('.quote-restart-btn').addEventListener('click', reset);

  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) close();
  });

  function scrollBottom() {
    messagesEl.scrollTop = messagesEl.scrollHeight;
  }

  function addMsg(text, type) {
    emptyEl.style.display = 'none';
    const div = createElement('div', { className: `quote-msg ${type}` });
    div.innerHTML = text.replace(/\n/g, '<br>').replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
    messagesEl.appendChild(div);
    scrollBottom();
  }

  function showTyping() {
    const div = createElement('div', { className: 'quote-typing' });
    div.innerHTML = '<span></span><span></span><span></span>';
    messagesEl.appendChild(div);
    scrollBottom();
    return div;
  }

  function finish(summaryText) {
    finished = true;
    inputArea.style.display = 'none';
    inputEl.disabled = true;
    sendBtn.disabled = true;

    const cleanSummary = summaryText.replace(FIN_MARKER, '').trim();
    summaryEl.style.display = 'block';
    summaryEl.innerHTML = `
      <strong style="display:block;margin-bottom:8px;font-size:0.9rem">Resumen de tu solicitud</strong>
      <pre>${cleanSummary}</pre>
      <div class="quote-summary-actions">
        <button class="btn btn-primary quote-restart-from-summary" style="flex:1;text-align:center">✏️ Corregir</button>
        <a class="btn-success" id="quoteWhatsAppBtn" target="_blank" style="flex:1;text-align:center">💬 Enviar por WhatsApp</a>
      </div>
    `;

    summaryEl.querySelector('.quote-restart-from-summary').addEventListener('click', reset);

    const waBtn = summaryEl.querySelector('#quoteWhatsAppBtn');
    if (phoneNumber) {
      const msg = encodeURIComponent(
        'SOLICITUD DE IMPRESIÓN 3D\n\n' + cleanSummary
      );
      waBtn.href = `https://wa.me/${phoneNumber}?text=${msg}`;
    } else {
      waBtn.textContent = '💬 WhatsApp (sin número configurado)';
      waBtn.style.opacity = '0.5';
      waBtn.style.pointerEvents = 'none';
    }
  }

  async function sendMessage() {
    const text = inputEl.value.trim();
    if (!text || finished) return;

    inputEl.value = '';
    sendBtn.disabled = true;

    addMsg(text, 'user');

    const typing = showTyping();

    try {
      const data = await fetchChat(text, context);
      typing.remove();
      scrollBottom();

      const response = data.response || '';
      const finIdx = response.indexOf(FIN_MARKER);

      if (finIdx !== -1) {
        const before = response.slice(0, finIdx).trim();
        const after = response.slice(finIdx).trim();
        if (before) addMsg(before, 'bot');
        finish(after);
      } else {
        addMsg(response, 'bot');
      }
    } catch (err) {
      typing.remove();
      addMsg('Error: ' + (err.message || 'Error de conexión'), 'bot');
    } finally {
      if (!finished) {
        sendBtn.disabled = false;
        inputEl.focus();
      }
    }
  }

  sendBtn.addEventListener('click', sendMessage);
  inputEl.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  });

  inputEl.focus();
}
