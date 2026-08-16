import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../services/supabase.js', () => ({
  query: vi.fn(),
  getById: vi.fn(),
  insert: vi.fn(),
  update: vi.fn(),
  remove: vi.fn(),
}));

import { handleAdminGetAll, handleAdminGetClientDetail, handleAdminCreate, handleAdminUpdate } from './admin.js';
import { query, getById, insert } from '../services/supabase.js';

const BASE = 'https://test.tecnosanjuan.com';

function req(method, path, body = null) {
  const opts = { method, headers: { 'Content-Type': 'application/json' } };
  if (body) opts.body = JSON.stringify(body);
  return new Request(BASE + path, opts);
}

describe('Admin Clients API', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  describe('GET /api/admin/clients', () => {
    it('returns all clients', async () => {
      query.mockResolvedValue([{ id: '1', name: 'Juan', phone: '2645123456' }]);
      const res = await handleAdminGetAll(req('GET', '/api/admin/clients'), {}, 'clients');
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data).toHaveLength(1);
      expect(data[0].name).toBe('Juan');
    });
  });

  describe('GET /api/admin/clients/:id (detail with history)', () => {
    it('returns client with history', async () => {
      getById.mockResolvedValue({ id: 'client-1', name: 'Juan', phone: '2645123456' });
      query.mockImplementation((env, table, opts) => {
        if (table === 'repairs') return Promise.resolve([{ id: 'r1', device: 'Samsung', status: 'received' }]);
        if (table === 'budgets') return Promise.resolve([{ id: 'b1', service_type: 'reparacion', status: 'pending' }]);
        if (table === 'print_orders') return Promise.resolve([{ id: 'p1', description: 'soporte', status: 'pending' }]);
        return Promise.resolve([]);
      });

      const res = await handleAdminGetClientDetail(req('GET', '/api/admin/clients/client-1'), {}, 'client-1');
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.id).toBe('client-1');
      expect(data.history.repairs).toHaveLength(1);
      expect(data.history.budgets).toHaveLength(1);
      expect(data.history.printOrders).toHaveLength(1);
      expect(data.history.repairs[0].device).toBe('Samsung');
    });

    it('returns 404 for unknown client', async () => {
      getById.mockResolvedValue(null);
      const res = await handleAdminGetClientDetail(req('GET', '/api/admin/clients/nonexistent'), {}, 'nonexistent');
      expect(res.status).toBe(404);
      const data = await res.json();
      expect(data.message).toContain('no encontrado');
    });

    it('handles empty history gracefully', async () => {
      getById.mockResolvedValue({ id: 'client-1', name: 'Juan', phone: '2645123456' });
      query.mockResolvedValue([]);

      const res = await handleAdminGetClientDetail(req('GET', '/api/admin/clients/client-1'), {}, 'client-1');
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.history.repairs).toEqual([]);
      expect(data.history.budgets).toEqual([]);
      expect(data.history.printOrders).toEqual([]);
    });
  });

  describe('POST /api/admin/clients', () => {
    it('creates a new client', async () => {
      insert.mockResolvedValue({ id: 'new-id', name: 'Ana', phone: '2645987654' });
      const res = await handleAdminCreate(req('POST', '/api/admin/clients', { name: 'Ana', phone: '2645987654' }), {}, 'clients');
      expect(res.status).toBe(201);
      const data = await res.json();
      expect(data.name).toBe('Ana');
    });
  });

  describe('clients in RESOURCE_MAP', () => {
    it('resolves clients resource', async () => {
      query.mockResolvedValue([]);
      const res = await handleAdminGetAll(req('GET', '/api/admin/clients'), {}, 'clients');
      expect(res.status).toBe(200);
    });
  });
});
