import { describe, it, expect, vi, beforeEach } from "vitest";

const { mockChat, sessionStoreMock, defaultLogger } = vi.hoisted(() => ({
  mockChat: vi.fn(),
  sessionStoreMock: {
    sessions: new Map(),
    getCalls: [],
    getCounts: {},
    throwFor: new Set(),
    throwAfterFirst: new Set(),
    returnOnce: new Set(),
    failMarkCompleted: false,
    async get(sessionId) {
      sessionStoreMock.getCalls.push(sessionId);
      const count = (sessionStoreMock.getCounts[sessionId] =
        (sessionStoreMock.getCounts[sessionId] || 0) + 1);
      if (sessionStoreMock.throwAfterFirst.has(sessionId) && count > 1) {
        throw new Error(`store boom: ${sessionId}`);
      }
      if (sessionStoreMock.returnOnce.has(sessionId) && count > 1) {
        return null;
      }
      if (sessionStoreMock.throwFor.has(sessionId)) {
        throw new Error(`store boom: ${sessionId}`);
      }
      return sessionStoreMock.sessions.get(sessionId) || null;
    },
    async exists() {
      return false;
    },
    async create() {
      return {};
    },
    async update() {
      return {};
    },
    async delete() {
      return true;
    },
    async markCompleted() {
      if (sessionStoreMock.failMarkCompleted) {
        throw new Error("mark boom");
      }
      return true;
    },
  },
  defaultLogger: {
    error: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
    trace: vi.fn(),
  },
}));

vi.mock("../services/openrouter.js", () => ({
  chat: (...args) => mockChat(...args),
}));

vi.mock("../services/supabase.js", () => ({
  query: vi.fn(),
  insert: vi.fn(),
  update: vi.fn(),
  remove: vi.fn(),
  getById: vi.fn(),
  rpc: vi.fn(),
}));

vi.mock("../services/websearch.js", () => ({
  webSearch: vi.fn(),
  formatSearchResults: vi.fn(),
}));

vi.mock("../services/interview/v2/stores/supabase-session-store.js", () => ({
  SupabaseSessionStore: class {
    async exists(sessionId) {
      return sessionStoreMock.exists(sessionId);
    }
    async get(sessionId) {
      return sessionStoreMock.get(sessionId);
    }
    async create(data) {
      return sessionStoreMock.create(data);
    }
    async update(sessionId, data) {
      return sessionStoreMock.update(sessionId, data);
    }
    async delete(sessionId) {
      return sessionStoreMock.delete(sessionId);
    }
    async markCompleted(sessionId) {
      return sessionStoreMock.markCompleted(sessionId);
    }
  },
}));

vi.mock("../services/logger.js", () => ({
  defaultLogger,
}));

import { handleChat } from "./chat.js";
import { query, rpc } from "../services/supabase.js";
import { webSearch, formatSearchResults } from "../services/websearch.js";
import { StateKeeper } from "../services/interview/v2/state-keeper.js";

const BASE = "https://test.tecnosanjuan.com";

function makeRequest(body, options = {}) {
  const headers = { "Content-Type": "application/json" };
  if (options.ip) headers["CF-Connecting-IP"] = options.ip;
  return new Request(BASE + "/chat", {
    method: options.method || "POST",
    headers,
    body: JSON.stringify(body),
  });
}

function makeEnv(kvMap) {
  return {
    SUPABASE_URL: "https://xyz.supabase.co",
    SUPABASE_SERVICE_ROLE_KEY: "svc-key",
    OPENROUTER_API_KEY: "test-key",
    OPENROUTER_BASE_URL: "https://openrouter.ai/api/v1",
    OPENROUTER_MODEL: "test-model",
    ENVIRONMENT: "development",
    SESSION_KV: kvMap
      ? {
          get: async (key) => (kvMap.has(key) ? JSON.parse(kvMap.get(key)) : null),
          put: async (key, value) => {
            kvMap.set(key, value);
          },
          delete: async (key) => {
            kvMap.delete(key);
          },
        }
      : null,
  };
}

const STATUS_PLAN = JSON.stringify({
  plan: [
    {
      tool: "interviewController",
      params: { action: "status", data: { sessionId: "int-x" } },
    },
  ],
  explanation: "Consultando estado de la entrevista",
});

function storeInterviewSession(overrides = {}) {
  const state = StateKeeper.create("budget-request", "1.0.0");
  state.setUserValue("description", "cambio de pantalla");
  sessionStoreMock.sessions.set("int-x", {
    sessionId: "int-x",
    schema: { serviceId: "budget-request", fields: [] },
    state,
    ...overrides,
  });
}

function mockCompletedFlow() {
  mockChat
    .mockResolvedValueOnce(STATUS_PLAN)
    .mockResolvedValueOnce("Listo");
}

function completionErrorLogCalls() {
  return defaultLogger.error.mock.calls.filter(
    ([tag, message]) =>
      tag === "[CHAT]" &&
      typeof message === "string" &&
      message.includes("CompletionPipeline error"),
  );
}

describe("handleChat interview completion", () => {
  let env;

  beforeEach(() => {
    vi.clearAllMocks();
    sessionStoreMock.sessions.clear();
    sessionStoreMock.getCalls.length = 0;
    sessionStoreMock.getCounts = {};
    sessionStoreMock.throwFor.clear();
    sessionStoreMock.throwAfterFirst.clear();
    sessionStoreMock.returnOnce.clear();
    sessionStoreMock.failMarkCompleted = false;
    env = makeEnv(new Map());
    query.mockResolvedValue(undefined);
    rpc.mockResolvedValue(null);
    webSearch.mockResolvedValue([]);
    formatSearchResults.mockReturnValue("");
  });

  it("runs the completion pipeline on success without replacing the response", async () => {
    storeInterviewSession({ status: "completed" });
    mockCompletedFlow();

    const res = await handleChat(
      makeRequest(
        { message: "hola", session: { id: "conv-1" } },
        { ip: "ip-ok" },
      ),
      env,
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.response).toBe("Solicitud procesada correctamente.");
    expect(body.interview.complete).toBe(true);
    expect(body.interview.sessionId).toBe("int-x");
    expect(
      sessionStoreMock.getCalls.filter((id) => id === "int-x"),
    ).toHaveLength(2);
    expect(completionErrorLogCalls()).toHaveLength(0);
  });

  it("ignores SESSION_NOT_FOUND from the completion pipeline", async () => {
    storeInterviewSession();
    sessionStoreMock.returnOnce.add("int-x");
    mockCompletedFlow();

    const res = await handleChat(
      makeRequest(
        { message: "hola", session: { id: "conv-1" } },
        { ip: "ip-notfound" },
      ),
      env,
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.response).toBe("Solicitud procesada correctamente.");
    expect(completionErrorLogCalls()).toHaveLength(0);
  });

  it("replaces the response when the pipeline fails with another error", async () => {
    storeInterviewSession();
    sessionStoreMock.failMarkCompleted = true;
    mockCompletedFlow();

    const res = await handleChat(
      makeRequest(
        { message: "hola", session: { id: "conv-1" } },
        { ip: "ip-error" },
      ),
      env,
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.response).toBe(
      "No pudimos registrar tu solicitud. Intentá nuevamente.",
    );
    expect(completionErrorLogCalls()).toHaveLength(0);
  });

  it("replaces the response and logs when the pipeline throws", async () => {
    storeInterviewSession();
    sessionStoreMock.throwAfterFirst.add("int-x");
    mockCompletedFlow();

    const res = await handleChat(
      makeRequest(
        { message: "hola", session: { id: "conv-1" } },
        { ip: "ip-throw" },
      ),
      env,
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.response).toBe(
      "No pudimos registrar tu solicitud. Intentá nuevamente.",
    );
    const logs = completionErrorLogCalls();
    expect(logs).toHaveLength(1);
    expect(logs[0][1]).toContain("store boom: int-x");
  });

  it("queries the completion pipeline with the interview sessionId (int-x), not the conversational id", async () => {
    storeInterviewSession({ status: "completed" });
    mockCompletedFlow();

    await handleChat(
      makeRequest(
        { message: "hola", session: { id: "conv-1" } },
        { ip: "ip-id" },
      ),
      env,
    );

    expect(
      sessionStoreMock.getCalls.filter((id) => id === "int-x"),
    ).toHaveLength(2);
    expect(sessionStoreMock.getCalls).not.toContain("conv-1");
  });
});
