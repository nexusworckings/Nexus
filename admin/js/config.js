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

function makeGroup(label, icon, modules) {
  return {
    label,
    icon,
    isGroup: true,
    modules,
  };
}

// All modules (flat list for easy lookup by ID)
export const MODULES = [
  // INICIO
  { id: 'dashboard', label: 'Dashboard', icon: '📊', viewPath: './modules/dashboard/dashboard-view.js', custom: true },

  // CLIENTES
  { id: 'clients', label: 'Clientes', icon: '👤', viewPath: './modules/clients/clients-view.js' },
  { id: 'notifications', label: 'Notificaciones', icon: '🔔', viewPath: './modules/notifications/notifications-view.js' },
  { id: 'events', label: 'Eventos', icon: '⚡', viewPath: './modules/events/events-view.js' },

  // REPARACIONES
  { id: 'repairs', label: 'Reparaciones', icon: '🔧', viewPath: './modules/repairs/repairs-view.js' },
  { id: 'budgets', label: 'Presupuestos', icon: '📋', viewPath: './modules/budgets/budgets-view.js' },
  { id: 'warranties', label: 'Garantías', icon: '🛡️', viewPath: './modules/warranties/warranties-view.js' },

  // CATÁLOGO
  { id: 'categories', label: 'Categorías', icon: '📂', viewPath: './modules/categories/categories-view.js' },
  { id: 'services', label: 'Servicios', icon: '🔧', viewPath: './modules/services/services-view.js' },
  { id: 'prices', label: 'Precios', icon: '💰', viewPath: './modules/prices/prices-view.js' },
  { id: 'promotions', label: 'Promociones', icon: '🏷️', viewPath: './modules/promotions/promotions-view.js' },
  { id: 'products', label: 'Productos', icon: '📦', viewPath: './modules/products/products-view.js' },
  { id: 'print-orders', label: 'Impresión 3D', icon: '🖨️', viewPath: './modules/print-orders/print-view.js' },

  // CONTENIDO
  { id: 'faqs', label: 'Preguntas Frecuentes', icon: '❓', viewPath: './modules/faqs/faqs-view.js' },

  // NEGOCIO
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
  { id: 'hours', label: 'Horarios', icon: '🕐', viewPath: './modules/hours/hours-view.js' },
  { id: 'social-media', label: 'Redes Sociales', icon: '📱', viewPath: './modules/social-media/social-media-view.js' },
  { id: 'phones', label: 'Teléfonos', icon: '📞', viewPath: './modules/phones/phones-view.js' },
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

  // EXTRAS (maintained for compatibility, not shown in sidebar by default)
  { id: 'conversations', label: 'Conversaciones', icon: '💬', viewPath: './modules/conversations/conversations-view.js' },
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
  { id: 'featured-messages', label: 'Mensajes Destacados', icon: '📢', viewPath: './modules/featured-messages/featured-messages-view.js' },
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
  { id: 'print-orders', label: 'Impresión 3D', icon: '🖨️', viewPath: './modules/print-orders/print-view.js' },
];

// Sidebar group definitions for rendering
export const SIDEBAR_GROUPS = [
  {
    id: 'inicio',
    label: 'Inicio',
    icon: '🏠',
    modules: ['dashboard'],
  },
  {
    id: 'clientes',
    label: 'Clientes',
    icon: '👥',
    modules: ['clients', 'notifications', 'events'],
  },
  {
    id: 'reparaciones',
    label: 'Reparaciones',
    icon: '🔧',
    modules: ['repairs', 'budgets', 'warranties'],
  },
  {
    id: 'catalogo',
    label: 'Catálogo',
    icon: '📦',
    modules: ['categories', 'services', 'prices', 'promotions', 'products', 'print-orders'],
  },
  {
    id: 'contenido',
    label: 'Contenido',
    icon: '📄',
    modules: ['faqs'],
  },
  {
    id: 'negocio',
    label: 'Negocio',
    icon: '🏢',
    modules: ['business-info', 'hours', 'social-media', 'phones', 'address'],
  },
];