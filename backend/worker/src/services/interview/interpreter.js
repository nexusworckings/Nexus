import { chat } from '../openrouter.js';

const SYSTEM_INTERPRETER = `Sos un extractor de datos para presupuestos de Tecno San Juan.
Respondé ÚNICAMENTE con este JSON sin texto adicional:

{
  "entities": [
    {
      "field": "id_del_campo",
      "value": "valor_extraido",
      "confidence": 0.95
    }
  ],
  "intent": "valid_answer" | "partial" | "question" | "ambiguous" | "off_topic"
}

REGLAS ABSOLUTAS:
1. Extraé SOLO datos que el usuario haya dicho EXPLÍCITAMENTE.
2. Cada entidad debe incluir "confidence" (0.0 a 1.0).
3. NO generes preguntas NUNCA.
4. Para campos con "Valores válidos": usá SOLO esos valores exactos.
5. NO inventes datos. NO ofrezcas servicios. NO sugieras opciones.
6. Si el usuario dio información parcial: intent "partial", entities con lo que se pueda extraer.
7. Si el usuario preguntó algo: intent "question", entities vacío.
8. Si el usuario no aportó datos: intent "ambiguous", entities vacío.`;

function parseJsonResponse(text) {
  try {
    const cleaned = text.replace(/```json\s*|\s*```/g, '').trim();
    return JSON.parse(cleaned);
  } catch {
    const match = text.match(/\{[\s\S]*\}/);
    if (match) {
      try { return JSON.parse(match[0]); } catch {}
    }
    return null;
  }
}

export async function interpret(env, state, userMessage, questions) {
  const pending = questions.filter(q => q.question && state[q.id] === null);
  const known = questions.filter(q => state[q.id] !== null && state[q.id] !== '---' && state[q.id] !== undefined);

  const fieldDescriptions = pending.map(q => {
    let desc = `"${q.id}": ${q.question.substring(0, 100)}`;
    if (q.type === 'boolean') desc += ' (true/false)';
    if (q.options) desc += ` | Valores válidos: ${q.options.join(', ')}`;
    return desc;
  }).join('\n');

  const inferredFields = questions
    .filter(q => !q.question && state[q.id] === null)
    .map(q => `"${q.id}": campo inferido (extraer si el usuario lo menciona)`);

  const allFields = fieldDescriptions + (inferredFields.length ? '\n' + inferredFields.join('\n') : '');
  const knownStr = known.map(q => `${q.id}: ${state[q.id]}`).join('\n');

  const msgs = [
    { role: 'system', content: SYSTEM_INTERPRETER },
    {
      role: 'user',
      content: `DATOS YA OBTENIDOS:\n${knownStr || '(ninguno)'}\n\nCAMPOS A EXTRAER:\n${allFields || '(ninguno)'}\n\nMENSAJE DEL USUARIO:\n"${userMessage}"`,
    },
  ];

  const raw = await chat(env, msgs);
  return parseJsonResponse(raw);
}
