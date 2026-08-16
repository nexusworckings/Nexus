/**
 * Commercial Gate (P2) — gating determinístico contra alucinaciones comerciales.
 *
 * Garantía arquitectónica: el LLM nunca debe poder afirmar un dato comercial
 * dinámico (precio, stock, disponibilidad, existencia de producto, características
 * comerciales, estado de reparación, presupuesto, hechos del negocio) si no existe
 * evidencia verificable en el turno actual.
 *
 * La evidencia SOLO proviene de herramientas autorizadas (fuentes comerciales):
 * searchProduct, searchPrice, searchStock, searchBusinessInfo, searchRepair,
 * searchBudget. `searchInternet` (web general) NO es evidencia comercial del negocio.
 *
 * El Conversation Context (entities) sirve para identificar el sujeto de la
 * consulta; NO constituye evidencia comercial.
 *
 * El gate es puro y sin estado: decide ANTES de que el LLM genere la respuesta final.
 */

export const CLAIM_TYPES = Object.freeze({
  PRICE: "PRICE",
  STOCK: "STOCK",
  AVAILABILITY: "AVAILABILITY",
  PRODUCT_EXISTENCE: "PRODUCT_EXISTENCE",
  PRODUCT_ATTRIBUTE: "PRODUCT_ATTRIBUTE",
  REPAIR_STATUS: "REPAIR_STATUS",
  BUDGET: "BUDGET",
  SERVICE_FACT: "SERVICE_FACT",
});

/**
 * Fuentes comerciales autorizadas: tool -> claim types que puede evidenciar.
 * Una tool NO listada aquí nunca cuenta como evidencia comercial.
 */
const COMMERCIAL_TOOL_CLAIMS = Object.freeze({
  searchProduct: [
    CLAIM_TYPES.PRODUCT_EXISTENCE,
    CLAIM_TYPES.PRODUCT_ATTRIBUTE,
    CLAIM_TYPES.PRICE,
    CLAIM_TYPES.STOCK,
    CLAIM_TYPES.AVAILABILITY,
  ],
  searchPrice: [CLAIM_TYPES.PRICE],
  searchStock: [CLAIM_TYPES.STOCK, CLAIM_TYPES.AVAILABILITY],
  searchBusinessInfo: [CLAIM_TYPES.SERVICE_FACT],
  searchRepair: [CLAIM_TYPES.REPAIR_STATUS],
  searchBudget: [CLAIM_TYPES.BUDGET],
});

/**
 * Clasificador mínimo y explícito (safety net) para consultas comerciales cuando
 * el planner no produjo tools comerciales (plan vacío / tool no planeada).
 * Intencionalmente PEQUEÑO; no es una lista gigante de regex. La señal primaria
 * es la información estructurada (tools planeadas, args, resultados).
 */
const CLASSIFIER = Object.freeze([
  {
    claim: CLAIM_TYPES.PRICE,
    phrases: [
      "precio",
      "precios",
      "cuanto sale",
      "cuanto vale",
      "cuanto cuesta",
      "cuanto piden",
      "cuanto cobran",
      "a cuanto",
      "que precio",
    ],
  },
  {
    claim: CLAIM_TYPES.STOCK,
    phrases: [
      "stock",
      "queda",
      "quedan",
      "cuantas unidades",
      "cuantos hay",
      "unidades",
      "hay en stock",
    ],
  },
  {
    claim: CLAIM_TYPES.AVAILABILITY,
    phrases: ["disponible", "disponibilidad", "tenes", "tienen", "hay"],
  },
  {
    claim: CLAIM_TYPES.REPAIR_STATUS,
    phrases: [
      "estado de mi reparacion",
      "estado de la reparacion",
      "estado de mi arreglo",
      "como va mi reparacion",
      "como sigue mi reparacion",
      "va mi reparacion",
      "mi reparacion",
      "mi arreglo",
    ],
  },
  {
    claim: CLAIM_TYPES.BUDGET,
    phrases: ["presupuesto", "presupuestos"],
  },
]);

/** Herramientas de "seguimiento por identificador": requieren un id/cliente para ser evidencia. */
const ID_ANCHORED_TOOLS = new Set(["searchRepair", "searchBudget"]);

export function normalizeText(text) {
  return (text || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/^[\u00a1\u00bf]+/, "");
}

function escapeRegExp(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function hasPhrase(text, phrase) {
  if (phrase.includes(" ")) return text.includes(phrase);
  return new RegExp(
    `(^|[^a-z0-9])${escapeRegExp(phrase)}([^a-z0-9]|$)`,
    "i",
  ).test(text);
}

/**
 * Determina qué claim types comerciales necesita la consulta, usando primero la
 * información estructurada (tools planeadas) y el clasificador mínimo como red.
 */
export function classifyCommercialIntent({ userMessage, plan, steps }) {
  const claimTypes = new Set();
  let viaTools = false;
  let viaClassifier = false;

  const plannedTools = [];
  for (const step of steps || plan || []) {
    if (step && typeof step.tool === "string") plannedTools.push(step.tool);
  }
  for (const tool of plannedTools) {
    const claims = COMMERCIAL_TOOL_CLAIMS[tool];
    if (claims) {
      for (const c of claims) claimTypes.add(c);
      viaTools = true;
    }
  }

  const normalized = normalizeText(userMessage);
  for (const rule of CLASSIFIER) {
    if (rule.phrases.some((p) => hasPhrase(normalized, p))) {
      claimTypes.add(rule.claim);
      viaClassifier = true;
    }
  }

  return {
    claimTypes: [...claimTypes],
    commercial: claimTypes.size > 0,
    viaTools,
    viaClassifier,
  };
}

/**
 * Extrae la evidencia comercial presente en los resultados de tools.
 * Diferencia: tool no planeada / ejecutada sin resultados / con resultado / falló.
 */
export function extractEvidence({ steps, results }) {
  const evidenceClaimTypes = new Set();
  const sources = [];
  const stepInputByTool = {};
  for (const step of steps || []) {
    if (step && step.tool && step.input) {
      stepInputByTool[step.tool] = step.input;
    }
  }

  for (const r of results || []) {
    if (!r || r.success !== true) continue; // falló o no se ejecutó
    const toolClaims = COMMERCIAL_TOOL_CLAIMS[r.toolName];
    if (!toolClaims) continue; // no es fuente comercial autorizada

    const data = r.data;
    const hasResultsArray = Array.isArray(data && data.results);
    const items = hasResultsArray
      ? data.results
      : data && data.results
        ? [data.results]
        : [];
    const nonEmpty = hasResultsArray
      ? items.length > 0
      : data && typeof data === "object" && Object.keys(data).length > 0;

    if (ID_ANCHORED_TOOLS.has(r.toolName)) {
      const input = stepInputByTool[r.toolName] || {};
      const anchored =
        input.clientId || input.id || input.repairId || input.budgetId;
      if (!anchored || !nonEmpty) continue; // sin ancla o sin datos: no es evidencia específica
    } else if (!nonEmpty) {
      continue; // ejecutada sin resultados
    }

    const covered = new Set(toolClaims);
    if (
      (r.toolName === "searchProduct" || r.toolName === "searchStock") &&
      items.length > 0
    ) {
      const hasPrice = items.some(
        (it) => it && it.price !== undefined && it.price !== null,
      );
      const hasStock = items.some(
        (it) =>
          it &&
          ((it.stock !== undefined && it.stock !== null) ||
            (it.available !== undefined && it.available !== null)),
      );
      if (!hasPrice) covered.delete(CLAIM_TYPES.PRICE);
      if (!hasStock) {
        covered.delete(CLAIM_TYPES.STOCK);
        covered.delete(CLAIM_TYPES.AVAILABILITY);
      }
    }

    for (const c of covered) evidenceClaimTypes.add(c);
    sources.push({
      tool: r.toolName,
      claimTypes: [...covered],
      itemCount: items.length,
    });
  }

  return { claimTypes: [...evidenceClaimTypes], sources };
}

/**
 * Fallback seguro, determinístico. Nunca depende de que el LLM "recuerde" no inventar.
 */
export function buildSafeFallback(claimTypes) {
  const set = new Set(claimTypes);
  const reasons = [];
  if (set.has(CLAIM_TYPES.PRICE))
    reasons.push("no dispongo de un precio verificado en este momento");
  if (set.has(CLAIM_TYPES.STOCK) || set.has(CLAIM_TYPES.AVAILABILITY))
    reasons.push(
      "no tengo confirmada la disponibilidad o el stock en este momento",
    );
  if (set.has(CLAIM_TYPES.REPAIR_STATUS))
    reasons.push(
      "no tengo acceso al estado de esa reparación con los datos que me pasaste (necesito el identificador de la orden)",
    );
  if (set.has(CLAIM_TYPES.BUDGET))
    reasons.push("no dispongo del presupuesto en este momento");
  if (
    set.has(CLAIM_TYPES.PRODUCT_EXISTENCE) ||
    set.has(CLAIM_TYPES.PRODUCT_ATTRIBUTE)
  )
    reasons.push(
      "no dispongo de información verificada del catálogo sobre ese producto",
    );
  if (set.has(CLAIM_TYPES.SERVICE_FACT))
    reasons.push(
      "no dispongo de ese dato verificado del negocio en este momento",
    );

  const body = reasons.length
    ? reasons.join("; ")
    : "no dispongo del dato verificado en este momento";
  return `Disculpá, ${body}. Si querés, puedo ayudarte a buscarlo o podés consultarlo directamente con el negocio.`;
}

/**
 * Política de datos comerciales inyectada en el contexto de generación cuando hay
 * evidencia comercial (modo permitido). Restringe el contexto: el LLM solo puede
 * afirmar datos que aparezcan en la evidencia del turno.
 */
export function buildCommercialPolicy(claimTypes, evidence) {
  const evidenceLines = (evidence.sources || [])
    .map(
      (s) =>
        `- ${s.tool}: ${s.claimTypes.join(", ")} (${s.itemCount} resultado(s))`,
    )
    .join("\n");
  return [
    "POL\u00cdTICA DE DATOS COMERCIALES (obligatoria):",
    "S\u00f3lo pod\u00e9s afirmar precios, stock, disponibilidad, existencia de productos, " +
      "caracter\u00edsticas comerciales, estados de reparaci\u00f3n o presupuestos si el dato " +
      "aparece EXPL\u00cdCITAMENTE en la INFORMACI\u00d3N DISPONIBLE o en los RESULTADOS REALES DE " +
      "LAS HERRAMIENTAS de este turno.",
    "Si el dato espec\u00edfico que piden NO aparece en esos resultados, NO lo afirmes ni lo " +
      "deduzcas de tu conocimiento general: respond\u00e9 con honestidad que no dispon\u00e9s de ese " +
      "dato verificado en este momento y ofrec\u00e9 ayuda.",
    "",
    "Evidencia disponible en este turno:",
    evidenceLines || "- (ninguna)",
  ].join("\n");
}

/**
 * Decisión del gate (puro, sin estado).
 *
 * @returns {{ status: 'none'|'allow'|'block', intent, evidence, fallback: string|null, commercialPolicy: string|null }}
 *   - 'none'  : la consulta no requiere afirmaciones comerciales -> responder normal.
 *   - 'block' : requiere afirmaciones comerciales sin evidencia -> fallback determinístico.
 *   - 'allow' : hay evidencia comercial -> generar con la política comercial inyectada.
 */
export function evaluateCommercialGate({ userMessage, plan, steps, results }) {
  const intent = classifyCommercialIntent({ userMessage, plan, steps });
  const evidence = extractEvidence({ steps, results });

  if (!intent.commercial) {
    return {
      status: "none",
      intent,
      evidence,
      fallback: null,
      commercialPolicy: null,
    };
  }

  if (evidence.claimTypes.length === 0) {
    return {
      status: "block",
      intent,
      evidence,
      fallback: buildSafeFallback(intent.claimTypes),
      commercialPolicy: null,
    };
  }

  return {
    status: "allow",
    intent,
    evidence,
    fallback: null,
    commercialPolicy: buildCommercialPolicy(intent.claimTypes, evidence),
  };
}
