const ACTION_PATTERNS = {
  "print-order": [
    /\b(necesito|quiero)\s+(imprimir|una\s+impresi[oó]n)\b/i,
    /\b(imprimime|imprim[ií]s)\s+(una\s+)?(pieza|figura|modelo|dise[ñn]o)\b/i,
    /\b(presupuesto|cotizaci[oó]n)\s+(para\s+)?impresi[oó]n\b/i,
    /\b(necesito|quiero)\s+(un\s+)?dise[ñn]o\s+3d\b/i,
    /\bimpresi[oó]n\s+3d\s+(de|para)\b/i,
    /\b(necesito|quiero)\s+que\s+(me\s+)?(impriman|imprimas|hagan|hagas)\s+(una\s+)?(pieza|figura|modelo|dise[ñn]o)\b/i,
    /\bmodelo\s+impreso\s+3d\b/i,
    /\bme\s+(pod[eé]s|podr[ií]as|podr[ií]an|har[ií]as)\s+(hacer\s+)?(una\s+)?impresi[oó]n\s+3d\b/i,
  ],
  "repair-request": [
    /\b(necesito|quiero|preciso|quisiera|me\s+gustar[ií]a)\s+(arreglar|reparar|cambiar|poner)\b/i,
    /\b(necesito|quiero)\s+que\s+(me\s+)?(arreglen|reparen|cambien|pongan)\b/i,
    /\b(arregl[aá]me|repar[aá]me|cambi[aá]me|poneme)\b/i,
    /\b(arreglarme|repararme|cambiarme|ponerme)\b/i,
    /\bme\s+(pueden|pod[eé]s|podr[ií]as|podr[ií]an)\s+(arreglar|reparar|cambiar|poner)\b/i,
    /\b(necesito|quiero)\s+(llevar|dejar|mandar|enviar)\s+(mi\s+|el\s+|la\s+|un\s+|una\s+)?(celular|tel[ée]fono|celu|notebook|pc|tablet|equipo|pantalla|dispositivo)\s+(a|para)\s+(reparar|arreglar)\b/i,
    /\b(reparaci[oó]n|arreglo|cambio)\s+(de|para)\s+(celular|tel[ée]fono|celu|notebook|pantalla|tablet|pc|equipo|bater[ií]a|vidrio)\b/i,
  ],
  "budget-request": [
    /\b(necesito|quiero|solicito)\s+(un\s+|una\s+)?(presupuesto|cotizaci[oó]n)\b/i,
    /\b(pasame|me\s+pasas|me\s+das|me\s+mand[aá]s)\s+(un\s+|una\s+)?(presupuesto|cotizaci[oó]n)\b/i,
    /\b(me\s+)?(hacen|har[ií]an|podr[ií]an)\s+(un\s+|una\s+)?(presupuesto|cotizaci[oó]n)\b/i,
    /\bpresupuesto\s+(de|para)\b/i,
    /\b(necesito|quiero)\s+que\s+me\s+(hagan|pasen|armen|manden)\s+(un\s+|una\s+)?(presupuesto|cotizaci[oó]n)\b/i,
  ],
};

const CONSULTATION_PATTERNS = {
  price: [
    /\bcu[aá]nto\s+(me|te|nos|le)?\s*(cuesta|vale|cobran|cobra|cobrar[ií]as?|sale|salen|saldr[ií]a)\b/i,
    /\bcu[aá]nto\s+est[aá]\b/i,
    /\bcu[aá]nto\s+es\b/i,
    /\b(qu[ée]|cu[aá]l)\s+(es\s+)?(el\s+)?(precio|costo)\b/i,
    /\bprecio\s+(de|del|para|por)\b/i,
    /\b(cu[aá]nto\s+cuesta|cu[aá]nto\s+vale)\s+(cambiar|arreglar|reparar|poner|hacer)\b/i,
    /\bcosto\s+(de\s+)?(reparaci[oó]n|arreglo|servicio|cambio|reparar|arreglar|cambiar)\b/i,
    /\b(saber|averiguar|enterarme)\s+(de\s+|sobre\s+|cu[aá]l\s+es\s+)?(el\s+)?(precio|costo)\b/i,
    /\binformaci[oó]n\s+(de|sobre)\s+(precios?|presupuestos?|costos?)\b/i,
    /\btarifas?\b/i,
  ],
  business: [
    /\bhorari[os]?\b/i,
    /\b(atienden|atend[eé]s|atendemos|abren|abrimos|abierto|cerramos|cierran)\b/i,
    /\bd[oó]nde\s+(est[aá]n|est[aá]|queda|quedan|est[aá]s)\b/i,
    /\b(direcci[oó]n|ubicaci[oó]n|locales?)\b/i,
    /\bmarcas?\b/i,
    /\btrabajan\s+(con|en)\b/i,
    /\bgarant[ií]a[s]?\b/i,
    /\bservicios?\s+(que\s+)?(ofrecen|tienen|prestan|hacen|brindan)\b/i,
    /\b(qu[ée]|cu[aá]les)\s+servicios?\b/i,
  ],
};

/**
 * Preguntas de capacidad impersonal ("¿hacen reparaciones?", "¿reparan
 * pantallas?", "¿hacen impresión 3d de figuras?"). No inician entrevista:
 * consultan si el negocio ofrece el servicio, no piden iniciar una acción.
 */
const CAPABILITY_QUESTION_PATTERNS = {
  service: [
    /\b(hacen|hac[eé]s|realizan|prestan|venden)\s+(reparaciones?|arreglos?|impresi[oó]n(es)?\s+3d|dise[ñn]os?\s+3d|presupuestos?|cotizaciones?|servicios?)\b/i,
    /\b(reparan|arreglan|imprimen|hacen)\s+(en\s+)?3d\b/i,
  ],
};

/**
 * Preguntas hipotéticas encabezadas por "qué hago si/con", "qué pasa si",
 * "qué pasaría si", "qué haría si", etc. Ancladas al inicio para no
 * enmascarar solicitudes explícitas compuestas ("quiero reparar, qué hago si...").
 */
const HYPOTHETICAL_QUESTION_PATTERNS = {
  hypothetical: [
    /^\u00bf?\s*qu[ée]\s+(hago|hacer|pasa|pasar[ií]a|har[ií]a|podr[ií]a|se\s+hace)\s+(si|con|cuando)\b/i,
  ],
};

const INTENT_SCHEMA_MAP = {
  "repair-request": "repair-request",
  "budget-request": "budget-request",
  "print-order": "print-order",
};

export class InterviewRouter {
  #schemaRegistry;
  #interviewController;
  #patterns;
  #consultationPatterns;
  #capabilityPatterns;
  #hypotheticalPatterns;
  #schemaMap;

  constructor(options = {}) {
    this.#schemaRegistry = options.schemaRegistry;
    this.#interviewController = options.interviewController;
    this.#patterns = options.patterns || ACTION_PATTERNS;
    this.#consultationPatterns =
      options.consultationPatterns || CONSULTATION_PATTERNS;
    this.#capabilityPatterns =
      options.capabilityPatterns || CAPABILITY_QUESTION_PATTERNS;
    this.#hypotheticalPatterns =
      options.hypotheticalPatterns || HYPOTHETICAL_QUESTION_PATTERNS;
    this.#schemaMap = options.schemaMap || INTENT_SCHEMA_MAP;

    if (!this.#schemaRegistry) {
      throw new Error("InterviewRouter: schemaRegistry is required");
    }
    if (!this.#interviewController) {
      throw new Error("InterviewRouter: interviewController is required");
    }
  }

  classify(message) {
    if (!message || typeof message !== "string") return { type: "none" };

    const normalized = message.trim();
    if (normalized.length === 0) return { type: "none" };

    const interview = this.#matchPattern(this.#patterns, normalized);
    if (interview) {
      const topic = this.#matchPattern(this.#consultationPatterns, normalized);
      if (topic) {
        return { type: "action", interview, query: topic };
      }
      if (this.#matchPattern(this.#hypotheticalPatterns, normalized)) {
        return { type: "none" };
      }
      if (this.#matchPattern(this.#capabilityPatterns, normalized)) {
        return { type: "none" };
      }
      return { type: "action", interview };
    }

    const topic = this.#matchPattern(this.#consultationPatterns, normalized);
    if (topic) return { type: "consultation", topic };

    return { type: "none" };
  }

  #matchPattern(map, message) {
    for (const [key, patterns] of Object.entries(map)) {
      for (const pattern of patterns) {
        if (pattern.test(message)) return key;
      }
    }
    return null;
  }

  selectSchema(intent) {
    const schemaId = this.#schemaMap[intent];
    if (!schemaId) return null;
    return schemaId;
  }

  async startInterview(schemaId, message = null) {
    const schema = await this.#schemaRegistry.load(schemaId);
    const result = await this.#interviewController.start(schema, message);
    return {
      sessionId: result.sessionId,
      schemaId: result.schemaId,
      question: result.question,
      interviewComplete: result.interviewComplete,
      summary: result.summary,
    };
  }

  async hasActiveInterview(sessionId) {
    return this.#interviewController.hasSession(sessionId);
  }

  async answerMessage(sessionId, message) {
    return this.#interviewController.answerMessage(sessionId, message);
  }

  async getInterviewSession(sessionId) {
    return this.#interviewController.getSession(sessionId);
  }
}
