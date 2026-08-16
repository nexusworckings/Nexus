const EMAIL_TEMPLATES = {
  CLIENT_CREATED: {
    subject: 'Nuevo cliente registrado',
    message: 'Hola {{name}}, tus datos fueron registrados correctamente.',
  },
  REPAIR_CREATED: {
    subject: 'Reparación recibida',
    message: 'Hola {{name}}, recibimos tu equipo correctamente. Te mantendremos informado sobre el estado de tu reparación.',
  },
  REPAIR_STATUS_CHANGED: {
    subject: 'Estado de reparación actualizado',
    message: 'Hola {{name}}, tu reparación cambió de {{oldStatus}} a {{newStatus}}.',
  },
  BUDGET_CREATED: {
    subject: 'Presupuesto solicitado',
    message: 'Hola {{name}}, recibimos tu solicitud de presupuesto. Pronto te enviaremos una respuesta.',
  },
  BUDGET_APPROVED: {
    subject: 'Presupuesto aprobado',
    message: 'Hola {{name}}, tu presupuesto fue aprobado.',
  },
  BUDGET_REJECTED: {
    subject: 'Presupuesto rechazado',
    message: 'Hola {{name}}, lamentamos informarte que tu presupuesto fue rechazado.',
  },
  PRINT_ORDER_CREATED: {
    subject: 'Pedido 3D recibido',
    message: 'Hola {{name}}, recibimos tu pedido de impresión 3D. Te avisaremos cuando esté listo.',
  },
  PRINT_ORDER_STATUS_CHANGED: {
    subject: 'Estado de pedido 3D actualizado',
    message: 'Hola {{name}}, tu pedido de impresión 3D cambió de {{oldStatus}} a {{newStatus}}.',
  },
};

const WHATSAPP_TEMPLATES = {
  CLIENT_CREATED: {
    message: 'Hola {{name}}.\nTus datos fueron registrados correctamente.\nTecno San Juan.',
  },
  REPAIR_CREATED: {
    message: 'Hola {{name}}.\nRecibimos tu equipo.\nTe avisaremos.\nTecno San Juan.',
  },
  REPAIR_STATUS_CHANGED: {
    message: 'Hola {{name}}.\nTu reparación cambió a: {{newStatus}}.\nTecno San Juan.',
  },
  BUDGET_CREATED: {
    message: 'Hola {{name}}.\nRecibimos tu solicitud de presupuesto.\nPronto te responderemos.\nTecno San Juan.',
  },
  BUDGET_APPROVED: {
    message: 'Hola {{name}}.\nTu presupuesto fue aprobado.\nTecno San Juan.',
  },
  BUDGET_REJECTED: {
    message: 'Hola {{name}}.\nTu presupuesto no fue aprobado.\nContactanos para más información.\nTecno San Juan.',
  },
  PRINT_ORDER_CREATED: {
    message: 'Hola {{name}}.\nRecibimos tu pedido de impresión 3D.\nTe avisamos cuando esté listo.\nTecno San Juan.',
  },
  PRINT_ORDER_STATUS_CHANGED: {
    message: 'Hola {{name}}.\nTu pedido 3D cambió a: {{newStatus}}.\nTecno San Juan.',
  },
};

function getTemplate(eventType, templates) {
  return templates[eventType] || null;
}

function fillTemplate(template, values) {
  if (!template) return { subject: '', message: '' };
  let subject = template.subject || '';
  let message = template.message;
  for (const [key, val] of Object.entries(values)) {
    const placeholder = `{{${key}}}`;
    const replacement = val != null ? String(val) : '';
    subject = subject.split(placeholder).join(replacement);
    message = message.split(placeholder).join(replacement);
  }
  return { subject, message };
}

export function getEmailTemplate(eventType) {
  return getTemplate(eventType, EMAIL_TEMPLATES);
}

export function getWhatsAppTemplate(eventType) {
  return getTemplate(eventType, WHATSAPP_TEMPLATES);
}

export function fillTemplateFn(template, values) {
  return fillTemplate(template, values);
}

export function buildMessage(eventType, clientName, metadata) {
  const template = getEmailTemplate(eventType);
  if (!template) return null;
  const values = { name: clientName || 'Cliente', ...metadata };
  return fillTemplate(template, values);
}

export function buildWhatsAppMessage(eventType, clientName, metadata) {
  const template = getWhatsAppTemplate(eventType);
  if (!template) return null;
  const values = { name: clientName || 'Cliente', ...metadata };
  return fillTemplate(template, values);
}
