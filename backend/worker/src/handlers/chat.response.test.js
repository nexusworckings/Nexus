import { describe, it, expect } from "vitest";
import { buildChatResponse } from "./chat.js";

describe("buildChatResponse", () => {
  const session = { id: "s1" };

  it("prefers message over question and explanation", () => {
    const data = buildChatResponse(
      {
        type: "chat",
        message: "hola",
        question: "?",
        explanation: "exp",
      },
      session,
      "ctx",
    );
    expect(data).toEqual({
      response: "hola",
      session,
      context: "ctx",
      source: "ai",
    });
  });

  it("uses question when message is absent", () => {
    const data = buildChatResponse(
      {
        type: "interview",
        question: "¿Qué equipo?",
        fieldId: "device",
        sessionId: "i1",
        schemaId: "repair-request",
      },
      session,
      "",
    );
    expect(data.response).toBe("¿Qué equipo?");
  });

  it("falls back to explanation and then to empty string", () => {
    const withExp = buildChatResponse({ type: "chat", explanation: "exp" }, session, "");
    expect(withExp.response).toBe("exp");

    const empty = buildChatResponse({ type: "chat" }, session, "");
    expect(empty.response).toBe("");
  });

  it("adds interview metadata only for interview/completed types", () => {
    const interview = buildChatResponse(
      {
        type: "interview",
        sessionId: "i1",
        schemaId: "repair-request",
        fieldId: "device",
      },
      session,
      "",
    );
    expect(interview.interview).toEqual({
      sessionId: "i1",
      active: true,
      complete: false,
      schemaId: "repair-request",
      currentField: "device",
    });

    const completed = buildChatResponse(
      { type: "completed", sessionId: "i2", schemaId: "budget-request" },
      session,
      "",
    );
    expect(completed.interview).toEqual({
      sessionId: "i2",
      active: false,
      complete: true,
      schemaId: "budget-request",
      currentField: null,
    });

    const chat = buildChatResponse({ type: "chat", message: "x" }, session, "");
    expect(chat.interview).toBeUndefined();
  });

  it("coerces missing schemaId/fieldId to null", () => {
    const interview = buildChatResponse(
      { type: "interview", sessionId: null, fieldId: null },
      session,
      "",
    );
    expect(interview.interview).toEqual({
      sessionId: null,
      active: true,
      complete: false,
      schemaId: null,
      currentField: null,
    });
  });
});