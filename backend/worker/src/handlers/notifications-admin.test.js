import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../services/supabase.js', () => ({
  query: vi.fn(),
  getById: vi.fn(),
}));
vi.mock('../services/events/event-bus.js', () => ({
  eventBus: { publish: vi.fn(), subscribe: vi.fn() },
}));
vi.mock('../services/events/event-dispatcher.js', () => ({
  EventDispatcher: function () { return { dispatch: vi.fn() }; },
}));

import { handleAdminGetNotifications } from './admin.js';
import { query, getById } from '../services/supabase.js';

const BASE = 'https://test.tecnosanjuan.com';

function makeRequest(method, path) {
  const opts = { method, headers: { 'Content-Type': 'application/json' } };
  return new Request(BASE + path, opts);
}

function getJson(response) {
  return response.json();
}

describe('handleAdminGetNotifications', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('returns enriched notifications with client names', async () => {
    query.mockResolvedValue([
      { id: 'n1', client_id: 'c1', type: 'REPAIR_CREATED', channel: 'email', status: 'sent', message: 'Hola Juan', created_at: '2026-01-01T00:00:00Z' },
      { id: 'n2', client_id: null, type: 'TEST', channel: 'email', status: 'pending', message: 'Test', created_at: '2026-01-02T00:00:00Z' },
    ]);
    getById.mockResolvedValue({ id: 'c1', name: 'Juan Pérez' });

    const res = await handleAdminGetNotifications(makeRequest('GET', '/api/admin/notifications'), {});
    expect(res.status).toBe(200);
    const data = await getJson(res);
    expect(data.length).toBe(2);
    expect(data[0].client_name).toBe('Juan Pérez');
    expect(data[1].client_name).toBeNull();
  });

  it('returns empty array when no notifications', async () => {
    query.mockResolvedValue([]);
    const res = await handleAdminGetNotifications(makeRequest('GET', '/api/admin/notifications'), {});
    expect(res.status).toBe(200);
    const data = await getJson(res);
    expect(data).toEqual([]);
  });

  it('returns 500 on query error', async () => {
    query.mockRejectedValue(new Error('DB error'));
    const res = await handleAdminGetNotifications(makeRequest('GET', '/api/admin/notifications'), {});
    expect(res.status).toBe(500);
  });

  it('handles missing client gracefully', async () => {
    query.mockResolvedValue([
      { id: 'n1', client_id: 'nonexistent', type: 'TEST', channel: 'email', status: 'pending', message: 'Msg', created_at: '2026-01-01T00:00:00Z' },
    ]);
    getById.mockRejectedValue(new Error('Not found'));

    const res = await handleAdminGetNotifications(makeRequest('GET', '/api/admin/notifications'), {});
    expect(res.status).toBe(200);
    const data = await getJson(res);
    expect(data[0].client_name).toBeNull();
  });
});
