const DEVICE_BRANDS = [
  "motorola",
  "samsung",
  "iphone",
  "apple",
  "xiaomi",
  "redmi",
  "poco",
  "huawei",
  "honor",
  "lg",
  "lenovo",
  "nokia",
  "oppo",
  "realme",
  "oneplus",
  "sony",
  "htc",
  "alcatel",
  "zte",
  "blackview",
  "infinix",
  "google pixel",
  "pixel",
];

const DEVICE_BRAND_RE = new RegExp(
  `\\b(${DEVICE_BRANDS.slice()
    .sort((a, b) => b.length - a.length)
    .join("|")})\\b`,
  "i",
);
const IPHONE_RE = /\biphone\b/i;
const MODEL_TOKEN_RE = /^[a-z0-9][a-z0-9.\-]*$/;

const MODEL_STOP_WORDS = new Set([
  "a",
  "al",
  "ante",
  "arreglar",
  "arreglo",
  "anda",
  "andando",
  "auriculares",
  "bajo",
  "bateria",
  "cable",
  "cai",
  "cambio",
  "cambiar",
  "camera",
  "carga",
  "cargador",
  "cargando",
  "casi",
  "cayo",
  "celular",
  "comprar",
  "con",
  "conector",
  "cuando",
  "cuanto",
  "cuesta",
  "cuestan",
  "cuyo",
  "de",
  "dejar",
  "dejarlo",
  "dejo",
  "del",
  "desde",
  "display",
  "donde",
  "dura",
  "el",
  "en",
  "enciende",
  "entre",
  "equipo",
  "era",
  "es",
  "esta",
  "estaba",
  "estado",
  "estan",
  "estas",
  "estoy",
  "flex",
  "fue",
  "funciona",
  "funcionando",
  "funda",
  "golpe",
  "golpeo",
  "gustaria",
  "hace",
  "hacemos",
  "hacen",
  "hacer",
  "hago",
  "haria",
  "hasta",
  "hay",
  "hoy",
  "imprimir",
  "imprimirlo",
  "imprimirlos",
  "imprimirme",
  "impresion",
  "instalar",
  "la",
  "las",
  "lenovo",
  "llevar",
  "llevarlo",
  "llevo",
  "lo",
  "los",
  "mandar",
  "mando",
  "mantenimiento",
  "me",
  "mi",
  "microfono",
  "mis",
  "mojo",
  "movil",
  "necesito",
  "no",
  "nuevo",
  "nueva",
  "o",
  "otro",
  "otra",
  "para",
  "parlante",
  "pantalla",
  "pasar",
  "pero",
  "podes",
  "puede",
  "pueden",
  "puedo",
  "por",
  "porque",
  "precio",
  "precios",
  "preciso",
  "prende",
  "puerto",
  "quebrada",
  "quiero",
  "quiere",
  "quisiera",
  "que",
  "reparacion",
  "reparar",
  "repuesto",
  "rota",
  "rotas",
  "roto",
  "rotos",
  "rompio",
  "se",
  "ser",
  "seria",
  "si",
  "sin",
  "son",
  "su",
  "sus",
  "tambien",
  "telefono",
  "tengo",
  "tenes",
  "tiene",
  "tienen",
  "tu",
  "tus",
  "un",
  "una",
  "unos",
  "unas",
  "usada",
  "usado",
  "vale",
  "valen",
  "vende",
  "venden",
  "vidrio",
  "y",
  "ya",
]);

const SERVICE_KEYWORDS = [
  {
    keywords: [
      "cambio de pantalla",
      "cambiar la pantalla",
      "cambiar pantalla",
      "cambio pantalla",
    ],
    name: "Cambio de pantalla",
  },
  {
    keywords: [
      "cambio de bateria",
      "cambiar la bateria",
      "cambio bateria",
      "cambiar bateria",
    ],
    name: "Cambio de batería",
  },
  {
    keywords: [
      "cambio de vidrio",
      "cambiar el vidrio",
      "vidrio templado",
      "vidrio",
    ],
    name: "Cambio de vidrio",
  },
  {
    keywords: [
      "cambio de conector",
      "conector de carga",
      "pin de carga",
      "puerto de carga",
    ],
    name: "Cambio de conector de carga",
  },
  { keywords: ["mantenimiento"], name: "Mantenimiento" },
  { keywords: ["formateo", "formatear"], name: "Formateo" },
  {
    keywords: ["reparacion", "reparar", "arreglar", "arreglo"],
    name: "Reparación",
  },
  {
    keywords: ["actualizacion", "actualizar", "actualizacion de software"],
    name: "Actualización de software",
  },
  { keywords: ["microfono", "micrófono"], name: "Cambio de micrófono" },
  {
    keywords: ["parlante", "altavoz", "speaker"],
    name: "Cambio de parlante",
  },
  { keywords: ["camara", "cámara"], name: "Cambio de cámara" },
  { keywords: ["flex"], name: "Cambio de flex" },
  { keywords: ["display"], name: "Cambio de display" },
  { keywords: ["pantalla"], name: "Cambio de pantalla" },
  { keywords: ["bateria", "batería"], name: "Cambio de batería" },
];

const PRODUCT_KEYWORDS = [
  { keywords: ["cargador", "cargadores"], name: "Cargador" },
  {
    keywords: ["auriculares", "audifonos", "auricular", "audífonos"],
    name: "Auriculares",
  },
  {
    keywords: ["parlante bluetooth", "parlante bt"],
    name: "Parlante Bluetooth",
  },
  {
    keywords: ["smartwatch", "reloj inteligente", "smart watch", "smartband"],
    name: "Smartwatch",
  },
  { keywords: ["funda", "case", "estuche"], name: "Funda" },
  {
    keywords: ["protector de pantalla", "vidrio templado"],
    name: "Vidrio templado",
  },
  { keywords: ["cable", "cables"], name: "Cable" },
  { keywords: ["memoria sd", "micro sd", "tarjeta sd"], name: "Memoria SD" },
  { keywords: ["bateria externa", "batería externa"], name: "Batería externa" },
  { keywords: ["llavero", "llaveros"], name: "Llavero" },
  { keywords: ["figura", "figuras"], name: "Figura" },
  { keywords: ["escudo", "escudos"], name: "Escudo" },
  { keywords: ["taza", "tazas"], name: "Taza" },
  { keywords: ["mate", "mates"], name: "Mate" },
  { keywords: ["pieza", "piezas"], name: "Pieza" },
  { keywords: ["medalla", "medallas"], name: "Medalla" },
  { keywords: ["placa", "placas"], name: "Placa" },
  { keywords: ["sticker", "stickers", "calco", "calcos"], name: "Sticker" },
  { keywords: ["soporte", "soportes"], name: "Soporte" },
  { keywords: ["pla"], name: "PLA" },
  { keywords: ["abs"], name: "ABS" },
  { keywords: ["petg"], name: "PETG" },
  { keywords: ["tpu"], name: "TPU" },
  { keywords: ["resina"], name: "Resina" },
  { keywords: ["filamento", "filamentos"], name: "Filamento" },
];

const COLOR_RULES = [
  { re: /\bnegros?\b/, value: "negro" },
  { re: /\bblancos?\b/, value: "blanco" },
  { re: /\brojos?\b/, value: "rojo" },
  { re: /\bazules?\b/, value: "azul" },
  { re: /\bverdes?\b/, value: "verde" },
  { re: /\bamarillos?\b/, value: "amarillo" },
  { re: /\bnaranjas?\b/, value: "naranja" },
  { re: /\bvioletas?\b/, value: "violeta" },
  { re: /\brosas?\b/, value: "rosa" },
  { re: /\bgrises?\b/, value: "gris" },
  { re: /\bcelestes?\b/, value: "celeste" },
  { re: /\bmarrones?\b/, value: "marrón" },
  { re: /\bplateados?\b/, value: "plateado" },
  { re: /\bdorados?\b/, value: "dorado" },
  { re: /\btransparentes?\b/, value: "transparente" },
  { re: /\bbeiges?\b/, value: "beige" },
  { re: /\bfucsias?\b/, value: "fucsia" },
  { re: /\blilas?\b/, value: "lila" },
  { re: /\bbordos?\b/, value: "bordo" },
  { re: /\bturquesas?\b/, value: "turquesa" },
];

const MATERIAL_RULES = [
  { re: /\bpla\b/, value: "PLA" },
  { re: /\babs\b/, value: "ABS" },
  { re: /\bpetg\b/, value: "PETG" },
  { re: /\btpu\b/, value: "TPU" },
  { re: /\bresinas?\b/, value: "Resina" },
  { re: /\bfilamentos?\b/, value: "Filamento" },
  { re: /\bnylon\b/, value: "Nylon" },
  { re: /\bsiliconas?\b/, value: "Silicona" },
  { re: /\bmaderas?\b/, value: "Madera" },
  { re: /\bacrilicos?\b/, value: "Acrílico" },
];

const URGENCY_RULES = [
  { re: /\burgentes?\b/, value: "urgente" },
  { re: /\burgencia\b/, value: "urgente" },
  { re: /\blo antes posible\b/, value: "urgente" },
  { re: /\blo mas rapido posible\b/, value: "urgente" },
  { re: /\blo mas pronto posible\b/, value: "urgente" },
  { re: /\bya mismo\b/, value: "urgente" },
  { re: /\bcuanto antes\b/, value: "urgente" },
];

const DATE_RULES = [
  { re: /\bpasado manana\b/, value: "pasado mañana" },
  { re: /\bla semana que viene\b/, value: "la semana que viene" },
  { re: /\besta semana\b/, value: "esta semana" },
  { re: /\bpara hoy\b/, value: "hoy" },
  { re: /\bmanana\b/, value: "mañana" },
  { re: /\bhoy\b/, value: "hoy" },
  {
    re: /\bel (\d{1,2}) de (enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|octubre|noviembre|diciembre)\b/,
    value: (m) => `${m[1]} de ${m[2]}`,
  },
  {
    re: /\b(para |el |los |en |del )(lunes|martes|miercoles|jueves|viernes|sabado|domingo)\b/,
    value: (m) => m[2],
  },
];

const QUANTITY_RE =
  /\b(\d{1,4})\s+(llaveros?|figuras?|escudos?|tazas?|mates?|piezas?|medallas?|placas?|stickers?|unidades?|cargadores?|cables?|fundas?|auriculares?|protectores?|soportes?|copias?|ejemplares?|kilos|kg)\b/;

const CLIENT_NAME_RE =
  /(?:mi nombre es|me llamo|soy|del cliente|el cliente|nombre del cliente)\s+([A-ZÁÉÍÓÚÑ][a-záéíóúñ]+(?:\s+[A-ZÁÉÍÓÚÑ][a-záéíóúñ]+)?)/i;

const REPAIR_ID_RE =
  /(?:reparacion|repair|arreglo)(?:\s*(?:n[°ºo]|#|numero|num|id)\s*[:\-]?\s*([a-z0-9][a-z0-9\-]{2,})|\s+(\d+))/i;

const BUDGET_ID_RE =
  /(?:presupuesto|budget)(?:\s*(?:n[°ºo]|#|numero|num|id)\s*[:\-]?\s*([a-z0-9][a-z0-9\-]{2,})|\s+(\d+))/i;

// Identidad: persiste mientras dure la conversación / el tópico.
const PERSISTENT_ENTITY_KEYS = [
  "device",
  "brand",
  "model",
  "service",
  "product",
  "problem",
  "clientName",
  "repairId",
  "budgetId",
];

// Atributos de pedido: viven mientras el tópico (device/product) no cambie.
const ORDER_ENTITY_KEYS = [
  "quantity",
  "color",
  "material",
  "urgency",
  "date",
  "logo",
];

const ENTITY_KEYS = [...PERSISTENT_ENTITY_KEYS, ...ORDER_ENTITY_KEYS];

const DEFAULT_TTL_MS = 30 * 60 * 1000;
const DEFAULT_MAX_ENTRIES = 500;
const SWEEP_EVERY = 100;

export class ConversationContextOrchestrator {
  #store;
  #ttlMs;
  #maxEntries;
  #ops;

  constructor(options = {}) {
    this.#ttlMs = options.ttlMs ?? DEFAULT_TTL_MS;
    this.#maxEntries = options.maxEntries ?? DEFAULT_MAX_ENTRIES;
    this.#store = new Map();
    this.#ops = 0;
  }

  resolve(message, sessionId) {
    const messageText = String(message || "").trim();
    const entities = messageText ? this.#extract(messageText) : {};

    const prev = this.#load(sessionId) || {};
    const next = {};

    for (const key of ENTITY_KEYS) {
      next[key] = entities[key] ?? prev[key] ?? null;
    }

    const deviceChanged =
      entities.device &&
      this.#normalize(entities.device) !== this.#normalize(prev.device);
    const productChanged =
      entities.product &&
      this.#normalize(entities.product) !== this.#normalize(prev.product);

    if (deviceChanged) {
      next.service = entities.service || null;
      next.product = entities.product || null;
      next.problem = entities.problem || null;
      for (const key of ORDER_ENTITY_KEYS) next[key] = entities[key] ?? null;
    } else if (productChanged) {
      next.service = null;
      next.problem = null;
      for (const key of ORDER_ENTITY_KEYS) next[key] = entities[key] ?? null;
    }

    const context = {};
    for (const key of ENTITY_KEYS) {
      if (next[key]) context[key] = next[key];
    }

    const now = Date.now();
    this.#store.set(sessionId, {
      ...context,
      updatedAt: now,
      expiresAt: now + this.#ttlMs,
    });
    this.#prune();

    const prevContext = {};
    for (const key of ENTITY_KEYS) {
      if (prev[key]) prevContext[key] = prev[key];
    }

    return {
      context,
      entities,
      changed: this.#differs(context, prevContext),
    };
  }

  /**
   * Merge entity values pre-extracted fuera del mensaje (por ejemplo desde
   * una entrevista completada) en el contexto de la sesión.
   *
   * Aplica el mismo ciclo de vida que `resolve()` (deviceChanged /
   * productChanged resetean atributos ligados al tópico) pero sin
   * re-extraer el mensaje. `device` en texto plano (ej: "Samsung A54") se
   * canonicaliza a device/brand/model reutilizando la extracción P8.
   */
  resolveEntities(entities, sessionId) {
    if (!entities || typeof entities !== "object") {
      return { context: {}, entities: {}, changed: false };
    }

    const input = {};
    for (const key of ENTITY_KEYS) {
      if (entities[key] !== undefined && entities[key] !== null) {
        input[key] = entities[key];
      }
    }

    if (typeof input.device === "string" && input.device.trim()) {
      const parsed = this.#extractDevice(this.#normalize(input.device));
      if (parsed) {
        input.device = parsed.device;
        if (parsed.brand !== undefined) input.brand = parsed.brand;
        if (parsed.model !== undefined) input.model = parsed.model;
      } else {
        input.device = this.#capitalizeEach(input.device.trim());
      }
    }

    const prev = this.#load(sessionId) || {};
    const next = {};

    for (const key of ENTITY_KEYS) {
      next[key] = input[key] ?? prev[key] ?? null;
    }

    const deviceChanged =
      input.device !== undefined &&
      this.#normalize(input.device) !== this.#normalize(prev.device);
    const productChanged =
      input.product !== undefined &&
      this.#normalize(input.product) !== this.#normalize(prev.product);

    if (deviceChanged) {
      next.service = input.service ?? null;
      next.product = input.product ?? null;
      next.problem = input.problem ?? null;
      for (const key of ORDER_ENTITY_KEYS) next[key] = input[key] ?? null;
    } else if (productChanged) {
      next.service = null;
      next.problem = null;
      for (const key of ORDER_ENTITY_KEYS) next[key] = input[key] ?? null;
    }

    const context = {};
    for (const key of ENTITY_KEYS) {
      if (next[key]) context[key] = next[key];
    }

    const now = Date.now();
    this.#store.set(sessionId, {
      ...context,
      updatedAt: now,
      expiresAt: now + this.#ttlMs,
    });
    this.#prune();

    const prevContext = {};
    for (const key of ENTITY_KEYS) {
      if (prev[key]) prevContext[key] = prev[key];
    }

    return {
      context,
      entities: input,
      changed: this.#differs(context, prevContext),
    };
  }

  getContext(sessionId) {
    const entry = this.#load(sessionId);
    if (!entry) return null;
    const snapshot = {};
    for (const key of ENTITY_KEYS) {
      if (entry[key]) snapshot[key] = entry[key];
    }
    return Object.keys(snapshot).length > 0 ? snapshot : null;
  }

  clear() {
    this.#store.clear();
  }

  count() {
    return this.#store.size;
  }

  #load(sessionId) {
    const entry = this.#store.get(sessionId);
    if (!entry) return null;
    if (entry.expiresAt < Date.now()) {
      this.#store.delete(sessionId);
      return null;
    }
    return entry;
  }

  #extract(messageText) {
    const normalized = this.#normalize(messageText);
    const entities = {};

    const device = this.#extractDevice(normalized);
    if (device) {
      entities.device = device.device;
      if (device.brand) entities.brand = device.brand;
      if (device.model) entities.model = device.model;
    }

    const service = this.#matchKeyword(normalized, SERVICE_KEYWORDS);
    if (service) entities.service = service;

    const product = this.#matchEarliest(normalized, PRODUCT_KEYWORDS);
    if (product) entities.product = product;

    const quantity = this.#extractQuantity(normalized);
    if (quantity !== null) entities.quantity = quantity;

    const color = this.#matchEarliestRule(normalized, COLOR_RULES);
    if (color) entities.color = color;

    const material = this.#matchEarliestRule(normalized, MATERIAL_RULES);
    if (material) entities.material = material;

    const urgency = this.#matchEarliestRule(normalized, URGENCY_RULES);
    if (urgency) entities.urgency = urgency;

    const date = this.#matchEarliestRule(normalized, DATE_RULES);
    if (date) entities.date = date;

    if (normalized.includes("logo")) entities.logo = true;

    const clientName = this.#extractClientName(messageText);
    if (clientName) entities.clientName = clientName;

    const repairId = this.#extractId(normalized, REPAIR_ID_RE);
    if (repairId) entities.repairId = repairId;

    const budgetId = this.#extractId(normalized, BUDGET_ID_RE);
    if (budgetId) entities.budgetId = budgetId;

    return entities;
  }

  #extractDevice(normalized) {
    const brandMatch = normalized.match(DEVICE_BRAND_RE);
    if (brandMatch) {
      const brand = this.#canonicalBrand(brandMatch[1]);
      const after = normalized
        .slice(brandMatch.index + brandMatch[0].length)
        .trim();
      const tokens = after.split(/\s+/).filter(Boolean);
      const modelTokens = [];
      for (const rawToken of tokens) {
        const token = rawToken.replace(/^[^a-z0-9]+|[^a-z0-9.\-]+$/g, "");
        if (!token) break;
        if (MODEL_STOP_WORDS.has(token)) break;
        if (MODEL_TOKEN_RE.test(token)) {
          modelTokens.push(token);
          if (modelTokens.length >= 3) break;
        } else {
          break;
        }
      }
      const model = modelTokens.length
        ? this.#capitalizeEach(modelTokens.join(" "))
        : null;
      const device = model ? `${brand} ${model}` : brand;
      return { device, brand, model };
    }
    if (IPHONE_RE.test(normalized)) {
      return { device: "iPhone", brand: "iPhone", model: null };
    }
    return null;
  }

  #canonicalBrand(brand) {
    const normalized = this.#normalize(brand);
    if (normalized === "iphone") return "iPhone";
    return this.#capitalizeEach(brand);
  }

  #matchKeyword(normalized, rules) {
    for (const rule of rules) {
      for (const keyword of rule.keywords) {
        if (normalized.includes(keyword)) return rule.name;
      }
    }
    return null;
  }

  #matchEarliest(normalized, rules) {
    let bestIndex = Infinity;
    let bestName = null;
    for (const rule of rules) {
      for (const keyword of rule.keywords) {
        const re = new RegExp(`\\b${this.#escapeRe(keyword)}\\b`, "i");
        const idx = normalized.search(re);
        if (idx !== -1 && idx < bestIndex) {
          bestIndex = idx;
          bestName = rule.name;
        }
      }
    }
    return bestName;
  }

  #matchEarliestRule(normalized, rules) {
    let bestIndex = Infinity;
    let best = null;
    for (const rule of rules) {
      const match = normalized.match(rule.re);
      if (match && match.index < bestIndex) {
        bestIndex = match.index;
        best =
          typeof rule.value === "function" ? rule.value(match) : rule.value;
      }
    }
    return best;
  }

  #extractQuantity(normalized) {
    const match = normalized.match(QUANTITY_RE);
    if (!match) return null;
    return parseInt(match[1], 10);
  }

  #extractClientName(messageText) {
    const match = messageText.match(CLIENT_NAME_RE);
    if (!match) return null;
    return match[1].replace(/\s+/g, " ").trim();
  }

  #extractId(normalized, regex) {
    const match = normalized.match(regex);
    if (!match) return null;
    return (match[1] || match[2] || "").trim();
  }

  #normalize(text) {
    return String(text)
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/\s+/g, " ")
      .trim();
  }

  #capitalize(text) {
    if (!text) return text;
    return text.charAt(0).toUpperCase() + text.slice(1);
  }

  #capitalizeEach(text) {
    return text
      .split(/\s+/)
      .map((token) => this.#capitalize(token))
      .join(" ");
  }

  #escapeRe(text) {
    return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  }

  #differs(next, prev) {
    const a = this.#normalize(JSON.stringify(next));
    const b = this.#normalize(JSON.stringify(prev || {}));
    return a !== b;
  }

  #prune() {
    this.#ops++;
    if (this.#ops % SWEEP_EVERY === 0) {
      const now = Date.now();
      for (const [id, entry] of this.#store) {
        if (entry.expiresAt < now) this.#store.delete(id);
      }
    }
    while (this.#store.size > this.#maxEntries) {
      let oldestId = null;
      let oldestTs = Infinity;
      for (const [id, entry] of this.#store) {
        if (entry.updatedAt < oldestTs) {
          oldestTs = entry.updatedAt;
          oldestId = id;
        }
      }
      if (oldestId === null) break;
      this.#store.delete(oldestId);
    }
  }
}

export const sharedConversationContextOrchestrator =
  new ConversationContextOrchestrator();
