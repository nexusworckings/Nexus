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

function makeRequest(body, options = {}) {
  const headers = { "Content-Type": "application/json" };
  if (options.ip) headers["CF-Connecting-IP"] = options.ip;
  const method = options.method || "POST";
  return new Request(BASE + "/chat", {
    method,
    headers,
    body:
      method === "POST" ? (typeof body === "string" ? body : JSON.stringify(body)) : undefined,
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

describe("handleChat request validation", () => {
  let env;

  beforeEach(() => {
    vi.clearAllMocks();
    env = makeEnv(new Map());
    query.mockResolvedValue(undefined);
    rpc.mockResolvedValue(null);
    webSearch.mockResolvedValue([]);
    formatSearchResults.mockReturnValue("");
  });

  it("returns 405 for non-POST methods", async () => {
    const res = await handleChat(
      makeRequest({ message: "hola" }, { method: "GET" }),
      env,
    );
    expect(res.status).toBe(405);
    const body = await res.json();
    expect(body.error).toBe(true);
    expect(body.message).toBe("Método no permitido");
  });

  it("returns 500 for an invalid JSON body", async () => {
    const res = await handleChat(makeRequest("not-json", { ip: "ip-json" }), env);
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error).toBe(true);
    expect(typeof body.message).toBe("string");
  });

  it("returns 400 for an empty message", async () => {
    const res = await handleChat(
      makeRequest({ message: "   " }, { ip: "ip-empty" }),
      env,
    );
    expect(res.status).toBe(400);
    expect((await res.json()).message).toBe("El mensaje no puede estar vacío");
  });

  it("returns 400 for messages longer than 2000 characters", async () => {
    const res = await handleChat(
      makeRequest({ message: "a".repeat(2001) }, { ip: "ip-long" }),
      env,
    );
    expect(res.status).toBe(400);
    expect((await res.json()).message).toBe("El mensaje es demasiado largo");
  });

  it("allows a message of exactly 2000 characters", async () => {
    mockChat
      .mockResolvedValueOnce(JSON.stringify({ plan: [], explanation: "ok" }))
      .mockResolvedValueOnce("ok");

    const res = await handleChat(
      makeRequest({ message: "a".repeat(2000) }, { ip: "ip-boundary" }),
      env,
    );
    expect(res.status).toBe(200);
  });

  it("returns 429 when the rate limit is exceeded", async () => {
    const ip = "ip-rate";
    for (let i = 0; i < 40; i++) {
      const res = await handleChat(makeRequest({}, { ip }), env);
      expect(res.status).toBe(400);
    }

    const res = await handleChat(makeRequest({}, { ip }), env);
    expect(res.status).toBe(429);
    expect((await res.json()).message).toBe(
      "Demasiadas solicitudes. Intentá de nuevo en un minuto.",
    );
  });

  it("returns 429 for duplicate messages within the spam window", async () => {
    mockChat
      .mockResolvedValueOnce(JSON.stringify({ plan: [], explanation: "ok" }))
      .mockResolvedValueOnce("ok");

    const ip = "ip-spam";
    const req = () => makeRequest({ message: "hola spam" }, { ip });

    const first = await handleChat(req(), env);
    expect(first.status).toBe(200);

    const second = await handleChat(req(), env);
    expect(second.status).toBe(429);
    expect((await second.json()).message).toBe(
      "Ese mensaje ya lo enviaste hace segundos. Esperá la respuesta.",
    );
  });

  it("returns 429 when a request is already in flight for the IP", async () => {
    let release;
    const gate = new Promise((resolve) => {
      release = resolve;
    });
    mockChat.mockImplementation(() =>
      gate.then(() => JSON.stringify({ plan: [], explanation: "ok" })),
    );

    const ip = "ip-inflight";
    const first = handleChat(makeRequest({ message: "primero" }, { ip }), env);
    const second = await handleChat(makeRequest({ message: "segundo" }, { ip }), env);

    expect(second.status).toBe(429);
    expect((await second.json()).message).toBe(
      "Ya tenés una consulta en proceso. Esperá la respuesta.",
    );

    release();
    const firstRes = await first;
    expect(firstRes.status).toBe(200);
  });

  it("returns the reset response and deletes the stored session", async () => {
    const kvMap = new Map();
    kvMap.set("session:reset-id", JSON.stringify({ conversationHistory: [], toolHistory: [] }));
    const envWithKv = makeEnv(kvMap);

    const res = await handleChat(
      makeRequest({ action: "reset", session: { id: "reset-id" } }, { ip: "ip-reset" }),
      envWithKv,
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.response).toBe(
      "Bien, empecemos de nuevo. Decime qué necesitás y te ayudo.",
    );
    expect(body.session).toBeNull();
    expect(body.source).toBe("ai");
    expect(kvMap.has("session:reset-id")).toBe(false);
  });
});