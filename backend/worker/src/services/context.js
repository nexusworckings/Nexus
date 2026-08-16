import { rpc, query } from "./supabase.js";
import { CONVERSATION_CONTEXT_RULE } from "./nexus/business-context.js";

const DEFAULT_SYSTEM_PROMPT = `Eres el asistente virtual de Tecno San Juan, un negocio de reparaci\u00f3n y servicios tecnol\u00f3gicos en San Juan, Argentina.

MISI\u00d3N PRINCIPAL - Responder sobre Tecno San Juan:
Us\u00e1 la informaci\u00f3n del negocio para responder sobre servicios, productos, precios, horarios, promociones y todo lo relacionado con Tecno San Juan. Sos un experto en esto.

B\u00daSQUEDA WEB:
Ten\u00e9s acceso a b\u00fasqueda web en tiempo real. Cuando te pregunten sobre temas que requieran informaci\u00f3n actualizada (fechas de lanzamiento, precios de mercado, noticias, especificaciones t\u00e9cnicas, comparativas), US\u00c1 la b\u00fasqueda web autom\u00e1ticamente para responder con informaci\u00f3n precisa y actual. No te limites a decir que no sab\u00e9s, busc\u00e1 en la web.

REGLAS:
- Si es sobre Tecno San Juan, prioriz\u00e1 SIEMPRE la informaci\u00f3n del negocio.
- Para preguntas generales de tecnolog\u00eda, us\u00e1 la b\u00fasqueda web.
- No inventes datos sobre Tecno San Juan. Si no est\u00e1 en el contexto, no lo afirmes.
- S\u00e9 amable, profesional, conciso y en argentino.
- Si alguien pregunta por objetos personalizados (llaveros, figuras, escudos, piezas \u00fanicas, etc.) asum\u00ed que lo hacemos en 3D y ofrecelo.
- REGLA DE CAT\u00c1LOGO COMERCIAL: Solo ofrec\u00e9 productos, caracter\u00edsticas y opciones que Tecno San Juan realmente comercializa. No inventes caracter\u00edsticas bas\u00e1ndote en conocimiento general. Antes de sugerir una opci\u00f3n, asegurate de que el negocio la ofrece.`;

async function getSystemPrompt(env) {
  try {
    const config = await query(
      env,
      "chatbot_config",
      { eq: { is_active: "true" } },
      false,
    );
    const row = Array.isArray(config) ? config[0] : config;
    const fallback =
      row && row.fallback_message
        ? row.fallback_message
        : "No dispongo de esa información en este momento.";
    if (row && row.system_prompt && row.system_prompt.trim()) {
      return { system: row.system_prompt, fallback, source: "db" };
    }
    return { system: DEFAULT_SYSTEM_PROMPT, fallback, source: "default" };
  } catch (err) {
    console.error("Error loading chatbot config:", err);
    return {
      system: DEFAULT_SYSTEM_PROMPT,
      fallback: "No dispongo de esa información en este momento.",
      source: "default",
    };
  }
}

/**
 * Fuente can\u00f3nica y estructurada del Business/Policy Context.
 * Consumida por el Planner, el Responder y el webhook de WhatsApp.
 */
export async function resolveBusinessContext(env) {
  const prompt = await getSystemPrompt(env);
  return Object.freeze({
    policy: prompt.system,
    fallback: prompt.fallback,
    source: prompt.source || "default",
    version: "1.0.0",
  });
}

export async function buildContext(env, userMessage) {
  try {
    let contexto = "";

    try {
      const resumen = await rpc(env, "get_business_context", {});
      if (resumen) contexto += resumen + "\n\n";
    } catch (e) {
      console.warn("Error fetching business context:", e);
    }

    try {
      const results = await rpc(env, "search_all_tables", {
        search_query: userMessage,
      });

      if (results && results.length > 0) {
        const searchParts = results.map((row, index) => {
          return `[${index + 1}] ${row.content} (Fuente: ${row.table_name})`;
        });
        contexto += "Resultados de búsqueda:\n" + searchParts.join("\n\n");
      }
    } catch (e) {
      console.warn("Error searching tables:", e);
    }

    return contexto || "";
  } catch (err) {
    console.error("Error building context:", err);
    return "";
  }
}

export async function buildMessages(
  env,
  context,
  userMessage,
  chatContext,
  session = null,
  options = {},
) {
  const { system, fallback } = options.policy
    ? { system: options.policy.policy, fallback: options.policy.fallback }
    : await getSystemPrompt(env);

  let systemContent = system;

  if (options.conversationContext) {
    systemContent += `\n\nCONTEXTO DE CONVERSACIÓN (datos estructurados del turno):\n${options.conversationContext}`;
    systemContent += `\n\n${CONVERSATION_CONTEXT_RULE}`;
  }

  if (options.commercialPolicy) {
    systemContent += `\n\n${options.commercialPolicy}`;
  }

  if (session) {
    if (session.nombre_cliente) {
      systemContent += `\n\nDATOS DEL CLIENTE: El cliente se llama "${session.nombre_cliente}". Dirigite a él/ella por su nombre de forma natural y cordial.`;
    }
    if (session.estado_actual === "waiting_name") {
      systemContent += `\n\nCONTEXTO: Estabas esperando que el cliente te dé su nombre. Si el mensaje del cliente no parece un nombre, respondé de forma natural sin insistir.`;
    }
    if (session.estado_actual === "esperando_necesidad") {
      systemContent += `\n\nCONTEXTO: El cliente ya dijo su nombre pero todavía no especificó qué servicio necesita. Ayudalo a identificar qué necesita: podés preguntar si busca impresión 3D, cartelería LED, servicio técnico u otro servicio. No inventes servicios que no existen.`;
    }
    systemContent += `\n\nREGLA DE DATOS PERSONALES:
Si Nexus está esperando un dato solicitado previamente:
- La respuesta del usuario debe tratarse como información del cliente.
- No debe interpretarse como una pregunta.
- No debe buscarse en la base de conocimiento.
- Debe almacenarse en la sesión.
`;
  }

  if (chatContext) {
    systemContent += `\n\nContexto actual: ${chatContext}`;
  }
  if (context && context.trim()) {
    systemContent += "\n\nINFORMACIÓN DISPONIBLE:\n" + context;
  }

  const messages = [
    { role: "system", content: systemContent },
    { role: "user", content: userMessage },
  ];

  return messages;
}
