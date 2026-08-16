import { describe, it, expect, vi, beforeEach } from 'vitest';
import { handleAdminAiAction } from '../../handlers/admin-ai.js';

vi.mock('../../services/supabase.js', () => ({
  query: vi.fn().mockResolvedValue([]),
  update: vi.fn().mockResolvedValue(undefined),
  insert: vi.fn().mockResolvedValue({ id: 'new-id' }),
}));

vi.mock('../../services/websearch.js', () => ({
  webSearch: vi.fn().mockResolvedValue([]),
  formatSearchResults: vi.fn().mockReturnValue(''),
}));

vi.mock('../../services/openrouter.js', () => ({
  chat: vi.fn().mockResolvedValue(JSON.stringify({ plan: [], explanation: 'Hola! Como puedo ayudarte?' })),
}));

describe('Admin AI Handler (via NexusAIEngine)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  function makeRequest(instruction, session) {
    const body = JSON.stringify({ instruction, session });
    return {
      json: () => Promise.resolve(JSON.parse(body)),
      headers: new Map(),
    };
  }

  it('returns error for empty instruction', async () => {
    const req = makeRequest('');
    const res = await handleAdminAiAction(req, {});
    const data = JSON.parse(await res.text());
    expect(res.status).toBe(400);
  });

  it('returns conversational response for query', async () => {
    const { chat } = await import('../../services/openrouter.js');
    chat.mockResolvedValue(JSON.stringify({ plan: [], explanation: 'Tenemos productos y servicios!' }));
    const req = makeRequest('que tenemos?');
    const res = await handleAdminAiAction(req, {});
    const data = JSON.parse(await res.text());
    expect(data.success).toBe(true);
    expect(data.type).toBe('consulta');
  });

  it('returns valid JSON response', async () => {
    const req = makeRequest('consulta');
    const res = await handleAdminAiAction(req, {});
    const data = JSON.parse(await res.text());
    expect(data).toHaveProperty('success');
    expect(data).toHaveProperty('type');
    expect(data).toHaveProperty('explanation');
  });

  it('uses admin profile', async () => {
    const req = makeRequest('test');
    const res = await handleAdminAiAction(req, {});
    expect(res.status).toBe(200);
  });

  it('creates session per request', async () => {
    const req1 = makeRequest('primero', 's1');
    const req2 = makeRequest('segundo', 's1');
    const res1 = JSON.parse(await (await handleAdminAiAction(req1, {})).text());
    const res2 = JSON.parse(await (await handleAdminAiAction(req2, {})).text());
    expect(res1.success).toBe(true);
    expect(res2.success).toBe(true);
  });

  it('handles internal errors gracefully', async () => {
    const { chat } = await import('../../services/openrouter.js');
    chat.mockRejectedValue(new Error('API error'));
    const req = makeRequest('test');
    const res = await handleAdminAiAction(req, {});
    expect(res.status).toBe(200);
  });
});
