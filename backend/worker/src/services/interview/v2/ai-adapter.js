import { AI, CACHE, REFERRER_URL, APP_TITLE } from './constants.js';
import { deepFreeze, sleep } from './utils.js';
import {
  AIAdapterError,
  AITimeoutError,
  AINetworkError,
  AIBadResponseError,
  AIInvalidJSONError,
  AIRateLimitError,
  AIAuthError,
  AIConfigurationError,
} from './errors.js';

// ── Cache entry ─────────────────────────────────────────────────

class CacheEntry {
  #createdAt;
  #value;

  constructor(value) {
    this.#value = value;
    this.#createdAt = Date.now();
  }

  isExpired(ttl) {
    return Date.now() - this.#createdAt > ttl;
  }

  get value() {
    return this.#value;
  }
}

// ── AIAdapter ───────────────────────────────────────────────────

export class AIAdapter {
  #apiKey;
  #baseUrl;
  #defaultModel;
  #timeout;
  #maxRetries;
  #cache;
  #cacheTtl;
  #cacheEnabled;
  #fetch;

  constructor(options = {}) {
    this.#apiKey = options.apiKey || process.env.OPENROUTER_API_KEY;
    this.#baseUrl = options.baseUrl || process.env.OPENROUTER_BASE_URL || AI.DEFAULT_BASE_URL;
    this.#defaultModel = options.defaultModel || process.env.OPENROUTER_MODEL || AI.DEFAULT_MODEL;
    this.#timeout = options.timeout || parseInt(process.env.OPENROUTER_TIMEOUT, 10) || AI.DEFAULT_TIMEOUT;
    this.#maxRetries = options.maxRetries || parseInt(process.env.OPENROUTER_MAX_RETRIES, 10) || AI.DEFAULT_MAX_RETRIES;
    this.#cacheTtl = options.cacheTtl || CACHE.TTL;
    this.#cacheEnabled = options.cacheEnabled !== false;
    this.#fetch = options.fetch || globalThis.fetch.bind(globalThis);
    this.#cache = new Map();

    if (!this.#apiKey) {
      throw new AIConfigurationError('OPENROUTER_API_KEY is not configured');
    }
  }

  // ── Public API ────────────────────────────────────────────────

  async generate(systemPrompt, userPrompt, options = {}) {
    if (typeof systemPrompt !== 'string' || systemPrompt.length === 0) {
      throw new AIBadResponseError('systemPrompt must be a non-empty string');
    }
    if (typeof userPrompt !== 'string' || userPrompt.length === 0) {
      throw new AIBadResponseError('userPrompt must be a non-empty string');
    }

    const model = options.model || this.#defaultModel;
    const temperature = options.temperature ?? 0;
    const maxTokens = options.maxTokens;

    const cacheKey = this.#buildCacheKey(model, systemPrompt, userPrompt, temperature);

    if (this.#cacheEnabled) {
      const cached = this.#cache.get(cacheKey);
      if (cached && !cached.isExpired(this.#cacheTtl)) {
        const result = deepFreeze({ ...cached.value, cached: true });
        return result;
      }
    }

    const result = await this.#requestWithRetry(model, systemPrompt, userPrompt, temperature, maxTokens);

    if (this.#cacheEnabled) {
      this.#cache.set(cacheKey, new CacheEntry(result));
      this.#evictStale();
    }

    return result;
  }

  async health() {
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), AI.HEALTH_TIMEOUT);

      const response = await this.#fetch(`${this.#baseUrl}/models`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${this.#apiKey}`,
          'Content-Type': 'application/json',
        },
        signal: controller.signal,
      });

      clearTimeout(timer);

      if (!response.ok) {
        return { ok: false, status: response.status, message: `API returned ${response.status}` };
      }

      const data = await response.json();
      return {
        ok: true,
        status: response.status,
        modelsAvailable: Array.isArray(data.data) ? data.data.length : 0,
      };
    } catch (err) {
      return { ok: false, message: err.message };
    }
  }

  clearCache() {
    this.#cache.clear();
  }

  // ── Private: request lifecycle ────────────────────────────────

  async #requestWithRetry(model, systemPrompt, userPrompt, temperature, maxTokens) {
    let lastError;

    for (let attempt = 1; attempt <= this.#maxRetries; attempt++) {
      try {
        return await this.#makeRequest(model, systemPrompt, userPrompt, temperature, maxTokens);
      } catch (err) {
        lastError = err;
        if (!this.#isRetryable(err) || attempt >= this.#maxRetries) {
          throw err;
        }
        const delay = this.#calculateBackoff(attempt);
        await sleep(delay);
      }
    }

    throw lastError;
  }

  async #makeRequest(model, systemPrompt, userPrompt, temperature, maxTokens) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.#timeout);

    const startTime = Date.now();

    try {
      const body = {
        model,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        temperature,
      };

      if (maxTokens !== undefined && maxTokens !== null) {
        body.max_tokens = maxTokens;
      }

      const response = await this.#fetch(`${this.#baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.#apiKey}`,
          'Content-Type': 'application/json',
          'HTTP-Referer': REFERRER_URL,
          'X-Title': APP_TITLE,
        },
        body: JSON.stringify(body),
        signal: controller.signal,
      });

      const latency = Date.now() - startTime;

      if (!response.ok) {
        await this.#handleHttpError(response, latency);
      }

      let raw;
      try {
        raw = await response.json();
      } catch (parseErr) {
        throw new AIInvalidJSONError('API response body is not valid JSON', parseErr);
      }

      const result = this.#normalizeResponse(raw, latency, model);

      console.log(
        `[AIAdapter] model=${model} latency=${latency}ms tokens=${result.usage?.totalTokens ?? '?'} finish=${result.finishReason}`
      );

      return result;
    } catch (err) {
      if (err.name === 'AbortError') {
        throw new AITimeoutError(`Request timed out after ${this.#timeout}ms`, err);
      }

      if (err instanceof AIAdapterError) {
        throw err;
      }

      throw new AINetworkError(`Network error: ${err.message}`, err);
    } finally {
      clearTimeout(timer);
    }
  }

  async #handleHttpError(response) {
    let errorBody = {};
    try {
      errorBody = await response.json();
    } catch {
      // swallow parse errors; body may be empty or non-JSON
    }

    const message = errorBody?.error?.message || `HTTP ${response.status}`;

    switch (response.status) {
      case 401:
      case 403:
        throw new AIAuthError(`${message} (status=${response.status})`);
      case 404:
        throw new AIConfigurationError(`Endpoint not found: ${message}`);
      case 429: {
        const retryAfter = parseInt(response.headers.get('retry-after') || '5', 10);
        throw new AIRateLimitError(`Rate limited. Retry after ${retryAfter}s`);
      }
      case 502:
      case 503:
      case 504:
        throw new AINetworkError(`Server error (${response.status}): ${message}`);
      default:
        if (response.status >= 500) {
          throw new AINetworkError(`Server error (${response.status}): ${message}`);
        }
        throw new AIBadResponseError(`Unexpected response (${response.status}): ${message}`);
    }
  }

  // ── Private: response normalization ───────────────────────────

  #normalizeResponse(raw, latency, model) {
    if (!raw || typeof raw !== 'object') {
      throw new AIBadResponseError('Response is not a JSON object');
    }

    if (!raw.choices || !Array.isArray(raw.choices) || raw.choices.length === 0) {
      throw new AIBadResponseError('Response missing choices array');
    }

    const choice = raw.choices[0];
    if (!choice.message || typeof choice.message !== 'object') {
      throw new AIBadResponseError('Choice missing message object');
    }

    const text = choice.message.content;
    if (typeof text !== 'string') {
      throw new AIBadResponseError('Message content must be a string');
    }

    if (text.trim().length === 0) {
      throw new AIBadResponseError('Message content is empty');
    }

    const finishReason = choice.finish_reason || 'unknown';

    const usage = raw.usage
      ? {
          promptTokens: raw.usage.prompt_tokens ?? 0,
          completionTokens: raw.usage.completion_tokens ?? 0,
          totalTokens: raw.usage.total_tokens ?? 0,
        }
      : null;

    return deepFreeze({
      text,
      finishReason,
      model: raw.model || model,
      usage: usage ? deepFreeze(usage) : null,
      latency,
      cached: false,
    });
  }

  // ── Private: helpers ──────────────────────────────────────────

  #buildCacheKey(model, systemPrompt, userPrompt, temperature) {
    return `${model}::${systemPrompt}::${userPrompt}::${temperature}`;
  }

  #isRetryable(err) {
    if (err instanceof AITimeoutError) return true;
    if (err instanceof AIRateLimitError) return true;
    if (err instanceof AINetworkError) return true;
    return false;
  }

  #calculateBackoff(attempt) {
    const delay = Math.min(AI.BACKOFF_BASE_MS * Math.pow(2, attempt - 1), AI.BACKOFF_MAX_MS);
    return delay + Math.random() * AI.BACKOFF_JITTER_MS;
  }

  #evictStale() {
    if (this.#cache.size <= CACHE.MAX_SIZE) return;

    const now = Date.now();
    for (const [key, entry] of this.#cache) {
      if (entry.isExpired(this.#cacheTtl)) {
        this.#cache.delete(key);
      }
    }

    if (this.#cache.size > CACHE.MAX_SIZE) {
      const entries = [...this.#cache.entries()];
      const toDelete = entries.slice(0, this.#cache.size - CACHE.MAX_SIZE);
      for (const [key] of toDelete) {
        this.#cache.delete(key);
      }
    }
  }
}
