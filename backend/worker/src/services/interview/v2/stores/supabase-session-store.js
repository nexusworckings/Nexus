import { SessionStore } from '../session-store.js';
import { StateKeeper } from '../state-keeper.js';
import { deepClone, deepFreeze } from '../utils.js';

const DEFAULT_TABLE = 'interview_sessions';

export class StoreError extends Error {
  constructor(code, message, details = null) {
    super(message);
    this.name = 'StoreError';
    this.code = code;
    this.details = details;
  }
}

export class SupabaseSessionStore extends SessionStore {
  #supabase;
  #tableName;
  #cache;

  constructor(supabase, options = {}) {
    super();
    if (!supabase) {
      throw new StoreError('INVALID_CONFIG', 'Supabase client is required');
    }
    this.#supabase = supabase;
    this.#tableName = options.tableName || DEFAULT_TABLE;
    this.#cache = new Map();
  }

  async create(sessionId, data) {
    const stateJson = data.state.toJSON();
    const schema = data.schema;

    const dbRow = {
      id: sessionId,
      schema_id: schema.serviceId || 'unknown',
      status: 'active',
      state: stateJson,
      schema: deepClone(schema),
    };

    const { error } = await this.#supabase
      .from(this.#tableName)
      .insert(dbRow);

    if (error) {
      throw new StoreError('DATABASE_ERROR', `Failed to create session: ${error.message}`, { cause: error });
    }

    this.#cache.set(sessionId, {
      state: data.state,
      schema: deepClone(schema),
      status: 'active',
    });

    return deepFreeze({
      sessionId,
      state: deepClone(stateJson),
      schema: deepFreeze(deepClone(schema)),
      status: 'active',
    });
  }

  async get(sessionId) {
    if (this.#cache.has(sessionId)) {
      const cached = this.#cache.get(sessionId);
      return {
        sessionId,
        state: cached.state,
        schema: deepFreeze(deepClone(cached.schema)),
        status: cached.status,
      };
    }

    const { data, error } = await this.#supabase
      .from(this.#tableName)
      .select('*')
      .eq('id', sessionId)
      .maybeSingle();

    if (error) {
      throw new StoreError('DATABASE_ERROR', `Failed to get session: ${error.message}`, { cause: error });
    }

    if (!data) return null;

    const state = StateKeeper.fromJSON(data.state);
    const schema = data.schema;
    const status = data.status || 'active';

    this.#cache.set(sessionId, { state, schema, status });

    return {
      sessionId,
      state,
      schema: deepFreeze(deepClone(schema)),
      status,
    };
  }

  async markCompleted(sessionId) {
    const { data, error } = await this.#supabase
      .from(this.#tableName)
      .update({ status: 'completed' })
      .eq('id', sessionId)
      .select()
      .maybeSingle();

    if (error) {
      throw new StoreError('DATABASE_ERROR', `Failed to mark session completed: ${error.message}`, { cause: error });
    }

    if (!data) return null;

    if (this.#cache.has(sessionId)) {
      this.#cache.get(sessionId).status = 'completed';
    }

    return {
      sessionId,
      status: data.status,
    };
  }

  async update(sessionId, data) {
    const updates = {};

    if (data.state !== undefined) {
      updates.state = data.state.toJSON();
    }
    if (data.schema !== undefined) {
      updates.schema = deepClone(data.schema);
    }

    if (Object.keys(updates).length === 0) {
      if (this.#cache.has(sessionId)) {
        const cached = this.#cache.get(sessionId);
        return deepFreeze({
          state: cached.state.toJSON(),
          schema: deepFreeze(deepClone(cached.schema)),
        });
      }
      return null;
    }

    const { data: result, error } = await this.#supabase
      .from(this.#tableName)
      .update(updates)
      .eq('id', sessionId)
      .select()
      .maybeSingle();

    if (error) {
      throw new StoreError('DATABASE_ERROR', `Failed to update session: ${error.message}`, { cause: error });
    }

    if (!result) return null;

    if (this.#cache.has(sessionId)) {
      const cached = this.#cache.get(sessionId);
      if (data.state !== undefined) {
        cached.state = StateKeeper.fromJSON(result.state);
      }
      if (data.schema !== undefined) {
        cached.schema = deepClone(result.schema);
      }
    }

    const updatedState = data.state !== undefined
      ? StateKeeper.fromJSON(result.state)
      : (this.#cache.get(sessionId)?.state || StateKeeper.fromJSON(result.state));

    return deepFreeze({
      state: updatedState,
      schema: deepFreeze(deepClone(data.schema !== undefined ? result.schema : (this.#cache.get(sessionId)?.schema || result.schema))),
    });
  }

  async delete(sessionId) {
    this.#cache.delete(sessionId);

    const { error } = await this.#supabase
      .from(this.#tableName)
      .delete()
      .eq('id', sessionId);

    if (error) {
      throw new StoreError('DATABASE_ERROR', `Failed to delete session: ${error.message}`, { cause: error });
    }

    return true;
  }

  async exists(sessionId) {
    if (this.#cache.has(sessionId)) return true;

    const { data, error } = await this.#supabase
      .from(this.#tableName)
      .select('id')
      .eq('id', sessionId)
      .maybeSingle();

    if (error) {
      throw new StoreError('DATABASE_ERROR', `Failed to check session existence: ${error.message}`, { cause: error });
    }

    return data !== null;
  }
}
