export class PlanningEngine {
  #chatFn;

  constructor(options = {}) {
    this.#chatFn = options.chatFn;
    if (!this.#chatFn) throw new Error("PlanningEngine: chatFn is required");
  }

  async createPlan(userInput, context = {}) {
    const tools = context.availableTools || [];
    const systemPrompt =
      context.systemPrompt ||
      "Sos un asistente de planificación. Dada una solicitud del usuario y las herramientas disponibles, producí una lista de llamadas a herramientas en secuencia.";

    const toolDescriptions = tools
      .map((t) => {
        const schema = t.inputSchema || {};
        const params = Object.entries(schema)
          .map(
            ([k, r]) =>
              `${k}${r.required ? " (required)" : ""}: ${r.type || "any"}`,
          )
          .join(", ");
        return `${t.name}: ${t.description || "No description"}${params ? ` [${params}]` : ""}`;
      })
      .join("\n");

    const historyText = (context.conversationHistory || [])
      .map((msg) => `${msg.role.toUpperCase()}: ${msg.content}`)
      .join("\n");

    const planningPrompt = `${systemPrompt}

AVAILABLE TOOLS:
${toolDescriptions || "No tools available"}

CURRENT CONTEXT:
${JSON.stringify(
  {
    clientId: context.clientId || null,
    currentIntent: context.currentIntent || null,
    workingMemory: context.workingMemory || {},
  },
  null,
  2,
)}

CONVERSATION HISTORY:
${historyText || "No previous conversation"}

User request: "${userInput}"

Produce a JSON plan. Each step must be a valid tool call.

IMPORTANT - COMPOSITE PLANS:
A single user request may require ZERO, ONE, or MULTIPLE tool calls:
- If the request is purely conversational (no tools needed), respond with an empty steps array.
- If the request asks for a single piece of information, use ONE step.
- If the request asks for MULTIPLE INDEPENDENT pieces of information (e.g. price AND delivery time, or price AND warranty), use ONE step per tool, set "parallel": true, and leave "dependsOn": [].
- If a later step needs an earlier step to finish first, list that earlier step's "id" in "dependsOn" and set "parallel": false.

Each step uses this schema:
{"id": "unique-id", "tool": "toolName", "input": {"key": "value"}, "dependsOn": ["id-of-an-earlier-step"], "parallel": true}

Rules:
- Give every step a short, unique "id" (e.g. "price", "info", "appointment").
- "parallel": true means the step is independent and MAY run at the same time as other steps.
- "parallel": false (or any step with "dependsOn") runs only after its dependencies have finished.
- A step must never depend on itself or on a step that does not exist.

REFERENCES BETWEEN STEPS:
A later step MAY reuse a value produced by an earlier step by referencing it inside "input". References are plain strings of the form "$<step-id>.result.<path>" (e.g. "$price.result.results.0.service", "$client.result.id"). Only reference steps listed in that step's "dependsOn" so the dependency runs first. The executor resolves every reference before running the step; an unresolvable reference fails only that step.

WHEN TO USE EACH TOOL (DISTINCT CONTRACTS — do not confuse them):
- "searchProduct": use when the customer asks about a PRODUCT from the catalog (filaments, PLA, SSDs, memory, a device brand, etc.): whether it exists, its attributes, its PRICE, or its stock/availability. Returns {id, name, brand, category, price, currency, stock, available}. ONE call covers existence + price + stock of a product. Do NOT use it for repair-service prices (use "searchPrice") or business data like hours/address (use "searchBusinessInfo").
- "searchStock": use ONLY when the customer explicitly asks about STOCK LEVELS or remaining units of a product (e.g. "cuántos pla quedan", "qué stock hay de ssd", "cuántas unidades hay"). Returns {id, product, stock, available}. It is NOT for product prices or full catalog data (use "searchProduct") and NOT for repair-service prices (use "searchPrice").
- "searchPrice": use ONLY for REPAIR/SERVICE prices (e.g. "cambiar la pantalla", "batería", "cambio de módulo") by device/brand/model. Returns {service, label, amount, currency}. It is NEVER for product prices: for "¿cuánto cuesta el PLA?" (a product) use "searchProduct", which already returns the product price.
- "searchBusinessInfo": use for business data (hours, address, phone, payment methods, warranty, shipping, brands, repair times). Returns {topic, value}.

Format (preferred):
{"steps": [{"id": "price", "tool": "searchPrice", "input": {"query": "pantalla motorola g32"}, "dependsOn": [], "parallel": true}, {"id": "info", "tool": "searchBusinessInfo", "input": {"query": "tiempo de reparacion"}, "dependsOn": [], "parallel": true}, {"id": "appointment", "tool": "createAppointment", "input": {"client": "..."}, "dependsOn": ["price", "info"], "parallel": false}]}

Legacy format (still accepted; steps run in order, no dependencies):
{"plan": [{"tool": "toolName", "params": {"key": "value"}}]}

The "explanation" field is OPTIONAL and is an INTERNAL note for the plan. It is NOT the message shown to the user. The final user-facing message is written in a separate step AFTER the tools execute and return their real results. Do NOT compose the final user message here.

Respond ONLY with valid JSON.`;

    try {
      const raw = await this.#chatFn(planningPrompt);
      const parsed = this.#parseJSON(raw);
      if (!parsed || (!parsed.plan && !parsed.steps)) {
        return {
          plan: [],
          steps: [],
          explanation: raw || "Could not create plan",
        };
      }
      const rawSteps = Array.isArray(parsed.steps)
        ? parsed.steps
        : Array.isArray(parsed.plan)
          ? parsed.plan
          : [];
      const normalized = this.#normalizeSteps(rawSteps);
      return {
        plan: normalized.plan,
        steps: normalized.steps,
        explanation: parsed.explanation || "Plan created",
      };
    } catch (err) {
      return {
        plan: [],
        steps: [],
        explanation: `Planning error: ${err.message}`,
      };
    }
  }

  #normalizeSteps(rawSteps) {
    const plan = [];
    const steps = [];
    rawSteps.forEach((s, index) => {
      if (!s || typeof s !== "object" || !s.tool) return;
      const params = s.params || s.input || {};
      plan.push({ tool: s.tool, params });
      steps.push({
        id: s.id || `step-${index}`,
        tool: s.tool,
        input: params,
        dependsOn: Array.isArray(s.dependsOn) ? s.dependsOn.slice() : [],
        parallel: s.parallel === true,
      });
    });
    return { plan, steps };
  }

  #parseJSON(text) {
    const match = text.match(/\{[\s\S]*\}/);
    if (!match) return null;
    try {
      return JSON.parse(match[0]);
    } catch {
      return null;
    }
  }
}
