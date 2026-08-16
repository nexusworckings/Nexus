import { describe, it, expect, vi } from "vitest";
import { WhatsAppService } from "./whatsapp-service.js";
import { ConversationManager } from "../nexus/conversation-manager.js";
import { ConversationMemory } from "../nexus/conversation-memory.js";

function isActionIntent(message) {
  return /\b(reparar|presupuesto|cotizar|arreglar)\b/i.test(message);
}

function createRuntimeStub({ turnsToComplete = 3 } = {}) {
  const activeSessions = new Set();
  let idCounter = 0;
  const received = [];

  const answerCounts = new Map();

  function startInterview() {
    const sessionId = `interview-${++idCounter}`;
    activeSessions.add(sessionId);
    answerCounts.set(sessionId, 1);
    return {
      type: "interview",
      sessionId,
      schemaId: "repair-request",
      question: "¿Qué equipo necesitas reparar?",
      fieldId: "device",
    };
  }

  const handleMessage = async ({ message, interviewSessionId }) => {
    const active = interviewSessionId && activeSessions.has(interviewSessionId);

    if (active) {
      const answerCount = (answerCounts.get(interviewSessionId) || 1) + 1;
      answerCounts.set(interviewSessionId, answerCount);
      if (message.toLowerCase().startsWith("cancel")) {
        activeSessions.delete(interviewSessionId);
        return {
          type: "chat",
          message: "Entrevista cancelada. ¿En qué más puedo ayudarte?",
        };
      }
      if (answerCount >= turnsToComplete) {
        activeSessions.delete(interviewSessionId);
        return {
          type: "completed",
          sessionId: interviewSessionId,
          schemaId: "repair-request",
          message: "Solicitud procesada correctamente.",
          data: { complete: true },
        };
      }
      return {
        type: "interview",
        sessionId: interviewSessionId,
        schemaId: "repair-request",
        question: "¿Algo más?",
        fieldId: "problem",
      };
    }

    if (isActionIntent(message)) {
      return startInterview();
    }

    return { type: "chat", message: "En qué puedo ayudarte?" };
  };

  const runtime = {
    received,
    answerCounts,
    activeSessions,
    handleMessage: vi.fn(async (args) => {
      const { message, sessionId, interviewSessionId, conversationId } = args;
      received.push({ message, sessionId, interviewSessionId, conversationId });
      return handleMessage({ message, interviewSessionId });
    }),
  };

  return runtime;
}

function createService({ runtime, memory, cm } = {}) {
  const manager = cm || new ConversationManager();
  const mem = memory || new ConversationMemory();
  const channel = {
    send: vi.fn().mockResolvedValue({ success: true }),
    markAsRead: vi.fn(),
  };
  const ws = new WhatsAppService({
    channel,
    runtime,
    conversationManager: manager,
    conversationMemory: mem,
    config: { WEBHOOK_VERIFY_TOKEN: "test" },
  });
  return { ws, channel, manager, mem };
}

async function postMessage(ws, { id, phone, text, name = "Juan" }) {
  const payload = {
    entry: [
      {
        changes: [
          {
            field: "messages",
            value: {
              messages: [
                {
                  id,
                  from: phone,
                  timestamp: "1700000000",
                  type: "text",
                  text: { body: text },
                },
              ],
              contacts: [{ profile: { name } }],
            },
          },
        ],
      },
    ],
  };
  const request = new Request("http://example.com/webhook", {
    method: "POST",
    body: JSON.stringify(payload),
    headers: { "Content-Type": "application/json" },
  });
  return ws.handleWebhookPost(request, {});
}

function conversationIdOf(cm, phone) {
  return cm.getConversationsByPhone(phone)[0]?.conversationId;
}

describe("WhatsApp interview session persistence (P10)", () => {
  it("associates the interviewSessionId after an interview starts", async () => {
    const cm = new ConversationManager();
    const mem = new ConversationMemory();
    const runtime = createRuntimeStub();
    const { ws } = createService({ runtime, memory: mem, cm });

    await postMessage(ws, {
      id: "p10-1",
      phone: "54911",
      text: "quiero reparar un celular",
    });

    const conversationId = conversationIdOf(cm, "54911");
    expect(mem.recall(conversationId, "interviewSessionId")).toBe(
      "interview-1",
    );
    expect(runtime.received[0].interviewSessionId).toBeUndefined();
  });

  it("recalls the interviewSessionId on the next message (continuity)", async () => {
    const cm = new ConversationManager();
    const mem = new ConversationMemory();
    const runtime = createRuntimeStub();
    const { ws } = createService({ runtime, memory: mem, cm });

    await postMessage(ws, {
      id: "p10-10",
      phone: "54911",
      text: "quiero reparar un celular",
    });
    await postMessage(ws, {
      id: "p10-11",
      phone: "54911",
      text: "mi Motorola G32 no enciende",
    });

    const conversationId = conversationIdOf(cm, "54911");
    expect(runtime.received[1].interviewSessionId).toBe("interview-1");
    expect(mem.recall(conversationId, "interviewSessionId")).toBe(
      "interview-1",
    );
    expect(runtime.answerCounts.get("interview-1")).toBe(2);
  });

  it("routes multi-turn to the same interview", async () => {
    const cm = new ConversationManager();
    const mem = new ConversationMemory();
    const runtime = createRuntimeStub({ turnsToComplete: 3 });
    const { ws } = createService({ runtime, memory: mem, cm });

    await postMessage(ws, {
      id: "p10-20",
      phone: "54911",
      text: "quiero reparar un celular",
    });
    await postMessage(ws, {
      id: "p10-21",
      phone: "54911",
      text: "Motorola G32",
    });
    await postMessage(ws, {
      id: "p10-22",
      phone: "54911",
      text: "no enciende",
    });

    expect(runtime.received.map((r) => r.interviewSessionId)).toEqual([
      undefined,
      "interview-1",
      "interview-1",
    ]);
  });

  it("clears the interviewSessionId when the interview completes", async () => {
    const cm = new ConversationManager();
    const mem = new ConversationMemory();
    const runtime = createRuntimeStub({ turnsToComplete: 2 });
    const { ws } = createService({ runtime, memory: mem, cm });

    await postMessage(ws, {
      id: "p10-30",
      phone: "54911",
      text: "quiero reparar un celular",
    });
    const conversationId = conversationIdOf(cm, "54911");
    await postMessage(ws, {
      id: "p10-31",
      phone: "54911",
      text: "mi Motorola no enciende",
    });

    expect(runtime.received[1]).not.toBeUndefined();
    expect(mem.recall(conversationId, "interviewSessionId")).toBeUndefined();
  });

  it("clears the interviewSessionId when the interview is cancelled", async () => {
    const cm = new ConversationManager();
    const mem = new ConversationMemory();
    const runtime = createRuntimeStub();
    const { ws } = createService({ runtime, memory: mem, cm });

    await postMessage(ws, {
      id: "p10-40",
      phone: "54911",
      text: "quiero reparar un celular",
    });
    const conversationId = conversationIdOf(cm, "54911");
    expect(mem.recall(conversationId, "interviewSessionId")).toBe(
      "interview-1",
    );

    await postMessage(ws, {
      id: "p10-41",
      phone: "54911",
      text: "cancelar por favor",
    });

    expect(mem.recall(conversationId, "interviewSessionId")).toBeUndefined();
  });

  it("starts a fresh interview with a different id after completion", async () => {
    const cm = new ConversationManager();
    const mem = new ConversationMemory();
    const runtime = createRuntimeStub({ turnsToComplete: 2 });
    const { ws } = createService({ runtime, memory: mem, cm });

    await postMessage(ws, {
      id: "p10-50",
      phone: "54911",
      text: "quiero reparar un celular",
    });
    await postMessage(ws, {
      id: "p10-51",
      phone: "54911",
      text: "Motorola G32 no enciende",
    });
    await postMessage(ws, {
      id: "p10-52",
      phone: "54911",
      text: "quiero otro presupuesto",
    });

    const conversationId = conversationIdOf(cm, "54911");
    expect(mem.recall(conversationId, "interviewSessionId")).toBe(
      "interview-2",
    );
    expect(runtime.received[2].interviewSessionId).toBeUndefined();
  });

  it("isolates interview sessions between conversations", async () => {
    const cm = new ConversationManager();
    const mem = new ConversationMemory();
    const runtime = createRuntimeStub();
    const { ws } = createService({ runtime, memory: mem, cm });

    await postMessage(ws, {
      id: "p10-60",
      phone: "549100",
      text: "quiero un presupuesto",
    });
    await postMessage(ws, {
      id: "p10-61",
      phone: "549200",
      text: "necesito reparar mi tablet",
    });

    const convA = conversationIdOf(cm, "549100");
    const convB = conversationIdOf(cm, "549200");
    const idA = mem.recall(convA, "interviewSessionId");
    const idB = mem.recall(convB, "interviewSessionId");

    expect(idA).toBe("interview-1");
    expect(idB).toBe("interview-2");
    expect(idA).not.toBe(idB);

    await postMessage(ws, {
      id: "p10-62",
      phone: "549200",
      text: "es una iPad",
    });
    expect(runtime.received[2].interviewSessionId).toBe("interview-2");
  });

  it("keeps normal chat working without creating an interview session", async () => {
    const cm = new ConversationManager();
    const mem = new ConversationMemory();
    const runtime = createRuntimeStub();
    const { ws } = createService({ runtime, memory: mem, cm });

    await postMessage(ws, { id: "p10-70", phone: "54911", text: "hola" });

    const conversationId = conversationIdOf(cm, "54911");
    expect(runtime.received[0].interviewSessionId).toBeUndefined();
    expect(mem.recall(conversationId, "interviewSessionId")).toBeUndefined();
  });

  it("forgets a stale interviewSessionId when the runtime no longer continues it", async () => {
    const cm = new ConversationManager();
    const mem = new ConversationMemory();
    cm.createConversation({
      conversationId: "stale-conv",
      phone: "54911",
      channel: "whatsapp",
    });
    mem.remember("stale-conv", "interviewSessionId", "interview-0");

    const runtime = createRuntimeStub();
    const { ws } = createService({ runtime, memory: mem, cm });

    await postMessage(ws, { id: "p10-80", phone: "54911", text: "gracias" });

    expect(runtime.received[0].interviewSessionId).toBe("interview-0");
    expect(mem.recall("stale-conv", "interviewSessionId")).toBeUndefined();
  });

  it("passes sessionId and conversationId through so P9 context persistence still works", async () => {
    const cm = new ConversationManager();
    const mem = new ConversationMemory();
    const runtime = createRuntimeStub();
    const { ws } = createService({ runtime, memory: mem, cm });

    await postMessage(ws, { id: "p10-90", phone: "54911", text: "hola" });

    const conversationId = conversationIdOf(cm, "54911");
    expect(runtime.received[0].sessionId).toBe(conversationId);
    expect(runtime.received[0].conversationId).toBe(conversationId);
  });

  it("does not break when conversationMemory is not configured", async () => {
    const cm = new ConversationManager();
    const runtime = createRuntimeStub();
    const { ws } = createService({ runtime, cm });

    const response = await postMessage(ws, {
      id: "p10-95",
      phone: "54911",
      text: "hola",
    });
    expect(response.status).toBe(200);
    expect(runtime.received[0].interviewSessionId).toBeUndefined();
  });
});
