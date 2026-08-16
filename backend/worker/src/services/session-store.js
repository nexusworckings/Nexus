import { defaultLogger } from "./logger.js";

const log = defaultLogger;

const SESSION_TTL = 86400;
const KV_PREFIX = "session:";

function getKvNamespace(env) {
  return env.SESSION_KV || null;
}

export async function getSession(env, sessionId) {
  const kv = getKvNamespace(env);
  if (!kv) {
    log.info("[SESSION]", "KV no disponible, omitiendo lectura");
    return null;
  }
  if (!sessionId) return null;

  try {
    const raw = await kv.get(`${KV_PREFIX}${sessionId}`, "json");
    if (!raw) return null;
    log.info("[SESSION]", `Sesión "${sessionId}" cargada desde KV`);
    return raw;
  } catch (err) {
    log.warn(
      "[SESSION]",
      `Error leyendo sesión "${sessionId}": ${err.message}`,
    );
    return null;
  }
}

export async function saveSession(env, sessionId, data, ttl) {
  const kv = getKvNamespace(env);
  if (!kv) {
    log.info("[SESSION]", "KV no disponible, omitiendo escritura");
    return false;
  }
  if (!sessionId) return false;

  try {
    await kv.put(`${KV_PREFIX}${sessionId}`, JSON.stringify(data), {
      expirationTtl: ttl || SESSION_TTL,
    });
    log.info(
      "[SESSION]",
      `Sesión "${sessionId}" guardada en KV (TTL: ${ttl || SESSION_TTL}s)`,
    );
    return true;
  } catch (err) {
    log.warn(
      "[SESSION]",
      `Error guardando sesión "${sessionId}": ${err.message}`,
    );
    return false;
  }
}

export async function deleteSession(env, sessionId) {
  const kv = getKvNamespace(env);
  if (!kv) return false;
  if (!sessionId) return false;

  try {
    await kv.delete(`${KV_PREFIX}${sessionId}`);
    log.info("[SESSION]", `Sesión "${sessionId}" eliminada de KV`);
    return true;
  } catch (err) {
    log.warn(
      "[SESSION]",
      `Error eliminando sesión "${sessionId}": ${err.message}`,
    );
    return false;
  }
}
