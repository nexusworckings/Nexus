const DASHBOARD_ICON = 'data:image/svg+xml;base64,' + btoa('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/></svg>');

function makeViewModule(id, label, icon, viewPath) {
  return {
    id,
    label,
    icon,
    custom: true,
    render: async (container) => {
      const mod = await import(viewPath);
      mod.default(container);
    },
  };
}

export const MODULES = [
  makeViewModule('dashboard', 'Dashboard', DASHBOARD_ICON, './modules/dashboard/dashboard-view.js'),
  makeViewModule('clients', 'Clientes', '👤', './modules/clients/clients-view.js'),
  makeViewModule('notifications', 'Notificaciones', '🔔', './modules/notifications/notifications-view.js'),
  makeViewModule('events', 'Eventos', '⚡', './modules/events/events-view.js'),
  makeViewModule('repairs', 'Reparaciones', '🔧', './modules/repairs/repairs-view.js'),
  makeViewModule('budgets', 'Presupuestos', '📋', './modules/budgets/budgets-view.js'),
  makeViewModule('print-orders', 'Impresión 3D', '🖨️', './modules/print-orders/print-view.js'),
  {
    id: 'business-info',
    label: 'Información del Negocio',
    icon: '🏪',
    single: true,
    fields: [
      { key: 'name', label: 'Nombre', type: 'text', required: true },
      { key: 'slogan', label: 'Slogan', type: 'text' },
      { key: 'description', label: 'Descripción', type: 'textarea' },
      { key: 'phone', label: 'WhatsApp', type: 'text', placeholder: '+54 9 340 5480010' },
      { key: 'website', label: 'Sitio Web', type: 'url' },
      { key: 'logo_url', label: 'Logo', type: 'file' },
      { key: 'primary_color', label: 'Color Primario', type: 'color' },
      { key: 'secondary_color', label: 'Color Secundario', type: 'color' },
    ],
  },
  {
    id: 'categories',
    label: 'Categorías',
    icon: '📂',
    fields: [
      { key: 'name', label: 'Nombre', type: 'text', required: true },
      { key: 'description', label: 'Descripción', type: 'text' },
      { key: 'icon', label: 'Icono', type: 'text' },
      { key: 'sort_order', label: 'Orden', type: 'number' },
      { key: 'image_url', label: 'Imagen', type: 'file' },
    ],
  },
  {
    id: 'services',
    label: 'Servicios',
    icon: '🔧',
    fields: [
      { key: 'category_id', label: 'Categoría', type: 'select', reference: 'categories' },
      { key: 'name', label: 'Nombre', type: 'text', required: true },
      { key: 'description', label: 'Descripción', type: 'textarea' },
      { key: 'price', label: 'Precio', type: 'number', step: '0.01' },
      { key: 'image_url', label: 'Imagen', type: 'file' },
    ],
  },
  {
    id: 'prices',
    label: 'Precios',
    icon: '💰',
    fields: [
      { key: 'service_id', label: 'Servicio', type: 'select', reference: 'services' },
      { key: 'label', label: 'Etiqueta', type: 'text' },
      { key: 'amount', label: 'Monto', type: 'number', required: true, step: '0.01' },
      { key: 'currency', label: 'Moneda', type: 'select', options: ['ARS', 'USD'] },
      { key: 'image_url', label: 'Imagen', type: 'file' },
    ],
  },
  {
    id: 'promotions',
    label: 'Promociones',
    icon: '🏷️',
    fields: [
      { key: 'title', label: 'Título', type: 'text', required: true },
      { key: 'description', label: 'Descripción', type: 'textarea' },
      {
        key: 'discount_type', label: 'Tipo de Descuento', type: 'select',
        options: ['percentage', 'fixed'],
      },
      { key: 'discount_value', label: 'Valor de Descuento', type: 'number', step: '0.01' },
      { key: 'valid_from', label: 'Válido Desde', type: 'date' },
      { key: 'valid_until', label: 'Válido Hasta', type: 'date' },
      { key: 'image_url', label: 'Imagen', type: 'file' },
    ],
  },
  {
    id: 'warranties',
    label: 'Garantías',
    icon: '🛡️',
    fields: [
      { key: 'title', label: 'Título', type: 'text', required: true },
      { key: 'description', label: 'Descripción', type: 'textarea' },
      { key: 'duration', label: 'Duración', type: 'text' },
      { key: 'terms', label: 'Términos', type: 'textarea' },
    ],
  },
  {
    id: 'print3d',
    label: 'Impresión 3D',
    icon: '🖨️',
    fields: [
      { key: 'material', label: 'Material', type: 'text', required: true },
      { key: 'description', label: 'Descripción', type: 'textarea' },
      { key: 'price_per_gram', label: 'Precio por Gramo', type: 'number', step: '0.01' },
      { key: 'colors', label: 'Colores (separados por coma)', type: 'text' },
      { key: 'max_dimensions', label: 'Dimensiones Máximas', type: 'text' },
      { key: 'lead_time', label: 'Tiempo de Entrega', type: 'text' },
      { key: 'image_url', label: 'Imagen', type: 'file' },
    ],
  },
  {
    id: 'faqs',
    label: 'Preguntas Frecuentes',
    icon: '❓',
    fields: [
      { key: 'question', label: 'Pregunta', type: 'textarea', required: true },
      { key: 'answer', label: 'Respuesta', type: 'textarea', required: true },
      { key: 'category', label: 'Categoría', type: 'text' },
      { key: 'sort_order', label: 'Orden', type: 'number' },
      { key: 'image_url', label: 'Imagen', type: 'file' },
    ],
  },
  {
    id: 'hours',
    label: 'Horarios',
    icon: '🕐',
    fields: [
      { key: 'day_of_week', label: 'Día (0-6)', type: 'number', required: true },
      { key: 'day_name', label: 'Nombre del Día', type: 'text', required: true },
      { key: 'open_time', label: 'Apertura', type: 'time' },
      { key: 'close_time', label: 'Cierre', type: 'time' },
      { key: 'is_closed', label: 'Cerrado', type: 'checkbox' },
    ],
  },
  {
    id: 'social-media',
    label: 'Redes Sociales',
    icon: '📱',
    fields: [
      { key: 'platform', label: 'Plataforma', type: 'text', required: true },
      { key: 'url', label: 'URL', type: 'url', required: true },
      { key: 'icon', label: 'Icono', type: 'text' },
      { key: 'sort_order', label: 'Orden', type: 'number' },
    ],
  },
  {
    id: 'phones',
    label: 'Teléfonos',
    icon: '📞',
    fields: [
      { key: 'label', label: 'Etiqueta', type: 'text' },
      { key: 'number', label: 'Número', type: 'text', required: true },
      { key: 'image_url', label: 'Imagen', type: 'file' },
    ],
  },
  {
    id: 'address',
    label: 'Dirección',
    icon: '📍',
    single: true,
    fields: [
      { key: 'street', label: 'Calle', type: 'text', required: true },
      { key: 'number', label: 'Número', type: 'text' },
      { key: 'city', label: 'Ciudad', type: 'text', required: true },
      { key: 'province', label: 'Provincia', type: 'text', required: true },
      { key: 'postal_code', label: 'Código Postal', type: 'text' },
      { key: 'latitude', label: 'Latitud', type: 'number', step: '0.0000001' },
      { key: 'longitude', label: 'Longitud', type: 'number', step: '0.0000001' },
      { key: 'maps_url', label: 'URL de Google Maps', type: 'url' },
      { key: 'notes', label: 'Notas', type: 'textarea' },
    ],
  },
  {
    id: 'featured-messages',
    label: 'Mensajes Destacados',
    icon: '📢',
    fields: [
      { key: 'message', label: 'Mensaje', type: 'textarea', required: true },
      {
        key: 'type', label: 'Tipo', type: 'select',
        options: ['info', 'warning', 'promo', 'alert'],
      },
      { key: 'sort_order', label: 'Orden', type: 'number' },
    ],
  },
  {
    id: 'emails',
    label: 'Correos Electrónicos',
    icon: '📧',
    fields: [
      { key: 'label', label: 'Etiqueta', type: 'text' },
      { key: 'email', label: 'Correo', type: 'email', required: true },
      { key: 'sort_order', label: 'Orden', type: 'number' },
      { key: 'image_url', label: 'Imagen', type: 'file' },
    ],
  },
  {
    id: 'products',
    label: 'Productos',
    icon: '📦',
    fields: [
      { key: 'name', label: 'Nombre', type: 'text', required: true },
      { key: 'description', label: 'Descripción', type: 'textarea' },
      { key: 'price', label: 'Precio', type: 'number', step: '0.01' },
      { key: 'category', label: 'Categoría', type: 'text' },
      { key: 'features', label: 'Características (una por línea)', type: 'textarea' },
      { key: 'image_url', label: 'Imagen', type: 'file' },
    ],
  },
  makeViewModule('conversations', 'Conversaciones', '💬', './modules/conversations/conversations-view.js'),
  {
    id: 'ai-assistant',
    label: 'Asistente IA',
    icon: '🤖',
    custom: true,
    render: async (container) => {
      const { renderAiAssistant } = await import('./ai-assistant.js');
      renderAiAssistant(container);
    },
  },
  {
    id: 'chatbot-config',
    label: 'Configuración del Chatbot',
    icon: '🤖',
    single: true,
    fields: [
      { key: 'welcome_message', label: 'Mensaje de Bienvenida', type: 'textarea' },
      { key: 'system_prompt', label: 'Prompt del Sistema', type: 'textarea' },
      { key: 'fallback_message', label: 'Mensaje por Defecto', type: 'textarea' },
      { key: 'temperature', label: 'Temperatura (0-2)', type: 'number', step: '0.01' },
      { key: 'max_tokens', label: 'Máximo de Tokens', type: 'number' },
    ],
  },
];
