export const BUSINESS_CONTEXT_VERSION = "1.0.0";

export const CONVERSATION_CONTEXT_RULE =
  "REGLA: El contexto de conversaci\u00f3n es una fuente de referencias " +
  "(an\u00e1foras) y del tono de la charla. NO es una fuente de datos " +
  "comerciales. Los datos comerciales (precio, stock, disponibilidad, " +
  "productos, tiempos) solo pueden afirmarse si provienen de la " +
  "INFORMACI\u00d3N DISPONIBLE o de resultados reales de herramientas. " +
  "Si el dato no est\u00e1 disponible, decilo y nunca lo inventes.";

/**
 * Compose el system prompt del Planner a partir del Business/Policy
 * Context (canonical) y de la persona del perfil. Si no hay policy,
 * devuelve solo la persona (comportamiento previo).
 */
export function composePlannerContext(policy, persona) {
  const parts = [];
  if (policy && typeof policy === "string" && policy.trim()) {
    parts.push(policy.trim());
  }
  if (persona && typeof persona === "string" && persona.trim()) {
    parts.push(persona.trim());
  }
  return parts.join("\n\n");
}

/**
 * Envuelve las entidades resueltas por el Orchestrator en el formato
 * estructurado compartido `{ entities, references, state }`.
 *
 * CONTRATO DEL CONVERSATION CONTEXT
 * ------------------------------
 * `entities`   — Sustantivos/identificadores resueltos del turno, agrupados por
 *                naturaleza (estructura plana; `device` es el nombre compuesto):
 *                - Identidad: device, brand, model, clientName, repairId, budgetId.
 *                - Producto/pedido: product, quantity, color, material.
 *                - Servicio: service, urgency, date.
 *                - Personalizaci\u00f3n: logo.
 *                Solo representan lo que entendimos del usuario; NUNCA valores
 *                comerciales.
 * `references` — (reservado) an\u00e1foras: "el precio", "eso", "ese equipo"
 *                apuntando a una entidad previa. A\u00fan sin poblado.
 * `state`      — (reservado) estado conversacional transitorio del turno
 *                (flags, pendientes de confirmaci\u00f3n). A\u00fan sin poblado.
 *
 * REGLA DE FUENTE: el Conversation Context es fuente de referencias y de
 * tono, NO una segunda base de datos comercial. Precio, stock,
 * disponibilidad, tiempos y productos s\u00f3lo pueden afirmarse si provienen
 * de la INFORMACI\u00d3N DISPONIBLE o de resultados reales de herramientas.
 * (Reforzado en runtime con `CONVERSATION_CONTEXT_RULE`.)
 */
export function buildConversationContextData(conversationContext) {
  const entities =
    conversationContext &&
    typeof conversationContext === "object" &&
    Object.keys(conversationContext).length > 0
      ? { ...conversationContext }
      : {};
  return {
    entities,
    references: {},
    state: {},
  };
}

/**
 * Serializa el contexto conversacional a JSON legible para inyectar en
 * el prompt del Responder como datos estructurados (no texto suelto).
 */
export function serializeConversationContext(conversationContext) {
  return JSON.stringify(
    buildConversationContextData(conversationContext),
    null,
    2,
  );
}
