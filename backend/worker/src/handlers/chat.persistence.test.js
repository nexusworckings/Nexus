import { describe, it, expect, vi, beforeEach } from "vitest";

const { mockChat } = vi.hoisted(() => ({ mockChat: vi.fn() }));

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
    async exists() {
      return false;
    }
    async get() {
      return null;
    }
    async create() {
      return {};
    }
    async update() {
      return {};
    }
    async delete() {
      return true;
    }
  },
}));

import { handleChat } from "./chat.js";
import { query, rpc } from "../services/supabase.js";
import { webSearch, formatSearchResults } from "../services/websearch.js";

const BASE = "https://test.tecnosanjuan.com";

function makeRequest(body) {
  return new Request(BASE + "/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
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
    SESSION_KV: {
      get: async (key) => (kvMap.has(key) ? JSON.parse(kvMap.get(key)) : null),
      put: async (key, value) => {
        kvMap.set(key, value);
      },
      delete: async (key) => {
        kvMap.delete(key);
      },
    },
  };
}

describe("handleChat session persistence", () => {
  let kvMap;
  let env;

  beforeEach(() => {
    vi.clearAllMocks();
    kvMap = new Map();
    env = makeEnv(kvMap);
    query.mockResolvedValue(undefined);
    rpc.mockResolvedValue(null);
    webSearch.mockResolvedValue([]);
    formatSearchResults.mockReturnValue("");
  });

  it("persists conversation history across requests with the same session", async () => {
    mockChat
      .mockResolvedValueOnce(JSON.stringify({ plan: [], explanation: "ok" }))
      .mockResolvedValueOnce("Hola, en qué te ayudo?")
      .mockResolvedValueOnce(JSON.stringify({ plan: [], explanation: "ok" }));

    const session = { id: "conv-test-1" };

    const r1 = await handleChat(
      makeRequest({ message: "hola primero", session }),
      env,
    );
    expect(r1.status).toBe(200);
    const d1 = await r1.json();
    expect(d1.response).toBe("Hola, en qué te ayudo?");

    const r2 = await handleChat(
      makeRequest({ message: "cuanto sale un cargador", session }),
      env,
    );
    expect(r2.status).toBe(200);

    const stored = JSON.parse(kvMap.get("session:conv-test-1"));
    expect(stored.conversationHistory.map((m) => m.role)).toEqual([
      "user",
      "assistant",
      "user",
      "assistant",
    ]);
  });

  it("includes prior history in the final LLM call", async () => {
    mockChat
      .mockResolvedValueOnce(JSON.stringify({ plan: [], explanation: "ok" }))
      .mockResolvedValueOnce("Primera respuesta")
      .mockResolvedValueOnce(JSON.stringify({ plan: [], explanation: "ok" }))
      .mockResolvedValueOnce("Segunda respuesta");

    const session = { id: "conv-test-2" };
    await handleChat(makeRequest({ message: "primero", session }), env);
    await handleChat(makeRequest({ message: "segundo", session }), env);

    const respondFnCall = mockChat.mock.calls[3][1];
    expect(respondFnCall.map((m) => m.role)).toEqual([
      "system",
      "user",
      "assistant",
      "user",
    ]);
    expect(respondFnCall[1].content).toBe("primero");
    expect(respondFnCall[2].content).toBe("Primera respuesta");
    expect(respondFnCall[3].content).toBe("segundo");
  });

  it("keeps conversationSessionId as the history key", async () => {
    mockChat
      .mockResolvedValueOnce(JSON.stringify({ plan: [], explanation: "ok" }))
      .mockResolvedValueOnce("ok")
      .mockResolvedValueOnce(JSON.stringify({ plan: [], explanation: "ok" }))
      .mockResolvedValueOnce("ok");

    const session = { id: "conv-key" };
    const interview = { sessionId: "interview-xyz", active: true };
    await handleChat(
      makeRequest({ message: "hola clave", session, interview }),
      env,
    );

    expect(kvMap.has("session:conv-key")).toBe(true);
    expect(kvMap.has("session:interview-xyz")).toBe(false);
  });

  it("does not fail when no SESSION_KV is bound", async () => {
    mockChat
      .mockResolvedValueOnce(JSON.stringify({ plan: [], explanation: "ok" }))
      .mockResolvedValueOnce("Sin kv");

    const noKv = { ...env, SESSION_KV: null };
    const res = await handleChat(
      makeRequest({ message: "hola sin kv", session: { id: "x1" } }),
      noKv,
    );
    expect(res.status).toBe(200);
  });

  it("reset deletes the persisted session", async () => {
    mockChat
      .mockResolvedValueOnce(JSON.stringify({ plan: [], explanation: "ok" }))
      .mockResolvedValueOnce("ok");

    const session = { id: "conv-reset" };
    await handleChat(makeRequest({ message: "hola reset", session }), env);
    expect(kvMap.has("session:conv-reset")).toBe(true);

    const r2 = await handleChat(
      makeRequest({ message: "", session, action: "reset" }),
      env,
    );
    expect(r2.status).toBe(200);
    expect(kvMap.has("session:conv-reset")).toBe(false);
  });
});
