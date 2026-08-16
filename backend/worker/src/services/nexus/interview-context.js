// Mapea el resultado estructurado de una entrevista completada (v2) hacia
// las entidades del Conversation Context (P8). Es un puente puro: no accede
// a stores ni al orchestrator, solo traduce `completedFields` por schema a
// claves de entidad conocidas por `ConversationContextOrchestrator`.

const SERVICE_TYPE_LABELS = {
  reparacion: "Reparación",
  accesorio: "Compra de accesorio",
  impresion_3d: "Impresión 3D",
};

const URGENCY_LABELS = {
  urgent: "urgente",
  urgente: "urgente",
  normal: "normal",
};

/**
 * Devuelve las entidades P8 a inyectar en el contexto conversacional a
 * partir de los campos completados de una entrevista.
 *
 * @param {Object} params
 * @param {string} params.schemaId  serviceId del schema (repair-request,
 *   budget-request, print-order, impresion_3d).
 * @param {Object} params.completedFields  `{ fieldId: { value, source, ... } }`
 *   tal como lo expone el estado de la sesión de entrevista.
 * @returns {Object} Entidades P8 (device/brand/model, service, problem,
 *   product, quantity, color, material, urgency, clientName).
 */
export function mapInterviewEntitiesToContext({ schemaId, completedFields }) {
  if (!schemaId || !completedFields || typeof completedFields !== "object") {
    return {};
  }

  const value = (fieldId) => {
    const entry = completedFields[fieldId];
    return entry ? entry.value : undefined;
  };

  const entities = {};

  switch (schemaId) {
    case "repair-request": {
      const device = value("device");
      if (device) entities.device = device;
      if (value("problem")) entities.problem = value("problem");
      if (value("clientName")) entities.clientName = value("clientName");
      const urgency = value("urgency");
      if (urgency) entities.urgency = URGENCY_LABELS[urgency] || urgency;
      entities.service = "Reparación";
      break;
    }

    case "budget-request": {
      if (value("clientName")) entities.clientName = value("clientName");
      const serviceType = value("serviceType");
      const service = SERVICE_TYPE_LABELS[serviceType];
      if (service) entities.service = service;
      break;
    }

    case "print-order": {
      if (value("clientName")) entities.clientName = value("clientName");
      const objectDescription = value("objectDescription");
      if (objectDescription) entities.product = objectDescription;
      const material = value("material");
      if (material) entities.material = material;
      const colors = value("colors");
      if (Array.isArray(colors) && colors.length > 0) {
        entities.color = colors[0];
      }
      const quantity = value("quantity");
      if (typeof quantity === "number" || /^\d+$/.test(String(quantity))) {
        entities.quantity = Number(quantity);
      }
      break;
    }

    case "impresion_3d": {
      if (value("nombre")) entities.clientName = value("nombre");
      if (value("material")) entities.material = value("material");
      if (value("color")) entities.color = value("color");
      const cantidad = value("cantidad");
      if (typeof cantidad === "number" || /^\d+$/.test(String(cantidad))) {
        entities.quantity = Number(cantidad);
      }
      break;
    }

    default:
      return {};
  }

  return entities;
}
