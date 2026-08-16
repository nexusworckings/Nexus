import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../services/supabase.js', () => ({
  query: vi.fn(),
  getById: vi.fn(),
  insert: vi.fn(),
  update: vi.fn(),
  remove: vi.fn(),
}));
vi.mock('../services/events/event-bus.js', () => ({
  eventBus: { publish: vi.fn(), subscribe: vi.fn() },
}));
const mockDispatch = vi.fn();
vi.mock('../services/events/event-dispatcher.js', () => ({
  EventDispatcher: function () { return { dispatch: mockDispatch }; },
}));

import { handleAdminGetEvents, handleAdminGetDlq } from './admin.js';
import { query } from '../services/supabase.js';

const BASE = 'https://test.tecnosanjuan.com';

function makeRequest(method, path, body) {
  const opts = { method, headers: { 'Content-Type': 'application/json' } };
  if (body) opts.body = JSON.stringify(body);
  return new Request(BASE + path, opts);
}

function getJson(response) {
  return response.json();
}

describe('handleAdminGetEvents', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('returns events list', async () => {
    query.mockResolvedValue([
      { id: 'e1', event_id: 'uuid-1', type: 'REPAIR_CREATED', status: 'completed', attempts: 0, created_at: '2026-01-01T00:00:00Z' },
      { id: 'e2', event_id: 'uuid-2', type: 'REPAIR_STATUS_CHANGED', status: 'failed', attempts: 3, error_message: 'Timeout', created_at: '2026-01-02T00:00:00Z' },
    ]);

    const res = await handleAdminGetEvents(makeRequest('GET', '/api/admin/events'), {});
    expect(res.status).toBe(200);
    const data = await getJson(res);
    expect(data.length).toBe(2);
    expect(data[0].type).toBe('REPAIR_CREATED');
    expect(data[1].status).toBe('failed');
    expect(data[1].error_message).toBe('Timeout');
  });

  it('returns empty array when no events', async () => {
    query.mockResolvedValue([]);
    const res = await handleAdminGetEvents(makeRequest('GET', '/api/admin/events'), {});
    expect(res.status).toBe(200);
    const data = await getJson(res);
    expect(data).toEqual([]);
  });

  it('returns 500 on query error', async () => {
    query.mockRejectedValue(new Error('DB error'));
    const res = await handleAdminGetEvents(makeRequest('GET', '/api/admin/events'), {});
    expect(res.status).toBe(500);
  });
});

describe('handleAdminGetDlq', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('returns DLQ entries', async () => {
    query.mockResolvedValue([
      { id: 'd1', event_id: 'evt-1', type: 'REPAIR_CREATED', status: 'failed', error_message: 'Timeout', failed_at: '2026-01-01T00:00:00Z' },
    ]);

    const res = await handleAdminGetDlq(makeRequest('GET', '/api/admin/events/dlq'), {});
    expect(res.status).toBe(200);
    const data = await getJson(res);
    expect(data.length).toBe(1);
    expect(data[0].error_message).toBe('Timeout');
  });

  it('returns empty array when no DLQ entries', async () => {
    query.mockResolvedValue([]);
    const res = await handleAdminGetDlq(makeRequest('GET', '/api/admin/events/dlq'), {});
    expect(res.status).toBe(200);
    const data = await getJson(res);
    expect(data).toEqual([]);
  });
});
