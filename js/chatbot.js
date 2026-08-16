import { $, createElement } from './utils.js';
import { fetchChat, fetchPublic } from './api.js';
import { createWhatsAppButton, validatePhone } from './whatsapp.js';

let initialized = false;
let currentContext = '';
let interviewState = null;
let sessionState = null;
let phoneNumber = '';
let chatbotApi = null;

export function getChatbot() {
  return chatbotApi;
}

export async function initChatbot() {
  if (initialized) return;
  initialized = true;

  const toggle = $('#chatbotToggle');
  const panel = $('#chatbotPanel');
  const close = $('#chatbotClose');
  const input = $('#chatbotInput');
  const send = $('#chatbotSend');
  const messages = $('#chatbotMessages');
  const progressContainer = $('#chatbotProgress');

  if (!toggle || !panel) return;

  let isOpen = false;

  function togglePanel(open) {
    isOpen = open;
    panel.classList.toggle('hidden', !isOpen);
    toggle.style.display = isOpen ? 'none' : 'flex';
    document.getElementById('chatbot').classList.toggle('chatbot-panel-open', isOpen);
    if (!open) { currentContext = ''; interviewState = null; sessionState = null; input.disabled = false; }
    if (isOpen) input.focus();
  }

  toggle.addEventListener('click', () => togglePanel(true));
  close.addEventListener('click', () => togglePanel(false));

  function updateProgress(progress) {
    if (!progress) return;
    const bar = $('#chatbotProgressBar');
    const label = $('#chatbotProgressLabel');
    if (bar) bar.style.width = `${progress.percent}%`;
    if (label) label.textContent = `${progress.completed}/${progress.total}`;
    if (progressContainer) progressContainer.style.display = 'flex';
  }

  function renderWhatsAppSection(summary, structuredSummary, phone) {
    const effectivePhone = phone || phoneNumber;
    const validated = validatePhone(effectivePhone);
    if (!validated) {
      console.log('[CHAT] ERROR: No se puede generar botón WhatsApp - número inválido');
      addMessage('No pudimos obtener el número de WhatsApp. Contactanos manualmente al WhatsApp de Tecno San Juan.', 'bot');
      return;
    }

    const whatsappText = structuredSummary || summary;
    console.log('[CHAT] resumen estructurado disponible:', !!structuredSummary);

    const btn = createWhatsAppButton(validated, whatsappText);
    if (btn) {
      messages.appendChild(btn);
      messages.scrollTop = messages.scrollHeight;
    }
    input.disabled = true;
  }

  async function sendMessage() {
    const text = input.value.trim();
    if (!text || text.length > 2000) return;
    console.log('[CHAT] pregunta respondida:', text.substring(0, 60));

    input.value = '';
    send.disabled = true;

    addMessage(text, 'user');

    const typing = addTypingIndicator();

    try {
      const data = await fetchChat(text, currentContext, interviewState, sessionState);
      typing.remove();
      if (data.session) sessionState = data.session;
      if (data.interview) {
        interviewState = data.interview;
      }
      if (interviewState && interviewState.active === false) {
        interviewState = null;
      }

      if (interviewState) {
        addMessage(data.response, 'bot', 'ai');
        if (data.progress) updateProgress(data.progress);
        if (data.interview && data.interview.complete) {
          console.log('[CHAT] entrevista completa, estado: presupuesto_completo');
          if (data.phone) phoneNumber = data.phone;
          renderWhatsAppSection(data.summary, data.structuredSummary, data.phone || phoneNumber);
          const bar = $('#chatbotProgressBar');
          if (bar) bar.style.width = '100%';
          const label = $('#chatbotProgressLabel');
          if (label) label.textContent = 'Completo';
        }
      } else {
        addMessage(data.response, 'bot', data.source);
      }
    } catch (err) {
      typing.remove();
      addMessage(err.message || 'Error de conexión', 'bot');
    } finally {
      send.disabled = false;
      if (!input.disabled) input.focus();
    }
  }

  send.addEventListener('click', sendMessage);
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  });

  const resetBtn = $('#chatbotReset');
  if (resetBtn) {
    resetBtn.addEventListener('click', async () => {
      resetBtn.disabled = true;
      try {
        const data = await fetchChat('', null, null, sessionState, 'reset');
        currentContext = '';
        interviewState = null;
        sessionState = null;
        messages.innerHTML = '';
        if (progressContainer) progressContainer.style.display = 'none';
        addMessage(data.response || 'Bien, empecemos de nuevo. Decime qué necesitás y te ayudo.', 'bot');
        input.disabled = false;
        input.focus();
      } catch {
        addMessage('No se pudo reiniciar. Intentá de nuevo.', 'bot');
      } finally {
        resetBtn.disabled = false;
      }
    });
  }

  function addMessage(text, type, source) {
    const msg = createElement('div', { className: `message ${type}` });
    msg.textContent = text;
    if (source) {
      const tag = createElement('span', {
        className: 'message-source',
        textContent: source === 'database' ? 'BD' : 'IA',
      });
      msg.appendChild(tag);
    }
    messages.appendChild(msg);
    messages.scrollTop = messages.scrollHeight;
    return msg;
  }

  function addTypingIndicator() {
    const indicator = createElement('div', { className: 'typing-indicator' });
    for (let i = 0; i < 3; i++) {
      indicator.appendChild(createElement('span'));
    }
    messages.appendChild(indicator);
    messages.scrollTop = messages.scrollHeight;
    return indicator;
  }

  try {
    const [config, biz] = await Promise.all([
      fetchPublic('chatbot-config'),
      fetchPublic('business-info').catch(() => null),
    ]);
    const welcome = config?.welcome_message || '¡Hola! Soy el asistente virtual de Tecno San Juan. Consultame sobre servicios, precios, horarios y más.';
    addMessage(welcome, 'bot');
    if (biz?.phone) phoneNumber = biz.phone.replace(/[^0-9]/g, '');
  } catch {
    addMessage('¡Hola! Soy el asistente virtual de Tecno San Juan. Consultame sobre servicios, precios, horarios y más.', 'bot');
  }

  chatbotApi = {
    async startChat(context) {
      currentContext = context;
      interviewState = null;
      sessionState = null;
      messages.innerHTML = '';
      if (progressContainer) progressContainer.style.display = 'none';
      togglePanel(true);

      if (context === '3d_quote') {
        input.value = '.';
        send.disabled = false;
        await sendMessage();
      } else {
        addMessage('Decime que necesitas y te ayudo con todo.', 'bot');
        send.disabled = false;
        input.focus();
      }
    },
  };
}
