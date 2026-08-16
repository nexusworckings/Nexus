import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../services/supabase.js', () => ({
  query: vi.fn(),
  getById: vi.fn(),
  insert: vi.fn(),
  update: vi.fn(),
  remove: vi.fn(),
}));

import { handleAdminUpdateStatus } from './admin-status.js';
import { getById, update } from '../services/supabase.js';

const BASE = 'https://test.tecnosanjuan.com';

function makePatchRequest(path, body) {
  return new Request(BASE + path, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

function makeNonJsonRequest(path) {
  return new Request(BASE + path, {
    method: 'PATCH',
    headers: { 'Content-Type': 'text/plain' },
    body: 'not json',
  });
}

describe('handleAdminUpdateStatus', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('repairs', () => {
    it('updates status successfully', async () => {
      getById.mockResolvedValue({ id: 'r1', status: 'received' });
      update.mockResolvedValue({ id: 'r1', status: 'repairing' });

      const res = await handleAdminUpdateStatus(
        makePatchRequest('/api/admin/repairs/r1/status', { status: 'repairing' }),
        {}, 'repairs', 'r1'
      );
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.status).toBe('repairing');
      expect(update).toHaveBeenCalledWith(expect.anything(), 'repairs', 'r1', { status: 'repairing' }, true);
    });

    it('returns 404 when entity not found', async () => {
      getById.mockResolvedValue(null);
      const res = await handleAdminUpdateStatus(
        makePatchRequest('/api/admin/repairs/none/status', { status: 'repairing' }),
        {}, 'repairs', 'none'
      );
      expect(res.status).toBe(404);
    });

    it('returns current entity when status is unchanged', async () => {
      getById.mockResolvedValue({ id: 'r1', status: 'repairing' });

      const res = await handleAdminUpdateStatus(
        makePatchRequest('/api/admin/repairs/r1/status', { status: 'repairing' }),
        {}, 'repairs', 'r1'
      );
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.status).toBe('repairing');
      expect(update).not.toHaveBeenCalled();
    });

    it('accepts all valid repair statuses', async () => {
      const statuses = ['received', 'diagnosing', 'repairing', 'completed', 'cancelled'];
      for (const status of statuses) {
        vi.clearAllMocks();
        getById.mockResolvedValue({ id: 'r1', status: 'received' });
        update.mockResolvedValue({ id: 'r1', status });

        const res = await handleAdminUpdateStatus(
          makePatchRequest('/api/admin/repairs/r1/status', { status }),
          {}, 'repairs', 'r1'
        );
        expect(res.status).toBe(200);
      }
    });

    it('rejects invalid repair status', async () => {
      const res = await handleAdminUpdateStatus(
        makePatchRequest('/api/admin/repairs/r1/status', { status: 'invalid-status' }),
        {}, 'repairs', 'r1'
      );
      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.message).toContain('inválido');
    });
  });

  describe('budgets', () => {
    it('updates status successfully', async () => {
      getById.mockResolvedValue({ id: 'b1', status: 'pending' });
      update.mockResolvedValue({ id: 'b1', status: 'approved' });

      const res = await handleAdminUpdateStatus(
        makePatchRequest('/api/admin/budgets/b1/status', { status: 'approved' }),
        {}, 'budgets', 'b1'
      );
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.status).toBe('approved');
      expect(update).toHaveBeenCalledWith(expect.anything(), 'budgets', 'b1', { status: 'approved' }, true);
    });

    it('accepts all valid budget statuses', async () => {
      const statuses = ['pending', 'approved', 'rejected', 'completed'];
      for (const status of statuses) {
        vi.clearAllMocks();
        getById.mockResolvedValue({ id: 'b1', status: 'pending' });
        update.mockResolvedValue({ id: 'b1', status });

        const res = await handleAdminUpdateStatus(
          makePatchRequest('/api/admin/budgets/b1/status', { status }),
          {}, 'budgets', 'b1'
        );
        expect(res.status).toBe(200);
      }
    });

    it('rejects invalid budget status', async () => {
      const res = await handleAdminUpdateStatus(
        makePatchRequest('/api/admin/budgets/b1/status', { status: 'diagnosing' }),
        {}, 'budgets', 'b1'
      );
      expect(res.status).toBe(400);
    });
  });

  describe('print-orders', () => {
    it('updates status successfully', async () => {
      getById.mockResolvedValue({ id: 'p1', status: 'pending' });
      update.mockResolvedValue({ id: 'p1', status: 'printing' });

      const res = await handleAdminUpdateStatus(
        makePatchRequest('/api/admin/print-orders/p1/status', { status: 'printing' }),
        {}, 'print-orders', 'p1'
      );
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.status).toBe('printing');
      expect(update).toHaveBeenCalledWith(expect.anything(), 'print_orders', 'p1', { status: 'printing' }, true);
    });

    it('accepts all valid print-order statuses', async () => {
      const statuses = ['pending', 'printing', 'completed', 'cancelled'];
      for (const status of statuses) {
        vi.clearAllMocks();
        getById.mockResolvedValue({ id: 'p1', status: 'pending' });
        update.mockResolvedValue({ id: 'p1', status });

        const res = await handleAdminUpdateStatus(
          makePatchRequest('/api/admin/print-orders/p1/status', { status }),
          {}, 'print-orders', 'p1'
        );
        expect(res.status).toBe(200);
      }
    });

    it('rejects invalid print-order status', async () => {
      const res = await handleAdminUpdateStatus(
        makePatchRequest('/api/admin/print-orders/p1/status', { status: 'approved' }),
        {}, 'print-orders', 'p1'
      );
      expect(res.status).toBe(400);
    });
  });

  describe('validation', () => {
    it('returns 400 when status field is missing', async () => {
      const res = await handleAdminUpdateStatus(
        makePatchRequest('/api/admin/repairs/r1/status', {}),
        {}, 'repairs', 'r1'
      );
      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.message).toContain('status');
    });

    it('returns 400 when status is empty string', async () => {
      const res = await handleAdminUpdateStatus(
        makePatchRequest('/api/admin/repairs/r1/status', { status: '' }),
        {}, 'repairs', 'r1'
      );
      expect(res.status).toBe(400);
    });

    it('returns 400 when status is not a string', async () => {
      const res = await handleAdminUpdateStatus(
        makePatchRequest('/api/admin/repairs/r1/status', { status: 123 }),
        {}, 'repairs', 'r1'
      );
      expect(res.status).toBe(400);
    });

    it('returns 400 on non-JSON body', async () => {
      const res = await handleAdminUpdateStatus(
        makeNonJsonRequest('/api/admin/repairs/r1/status'),
        {}, 'repairs', 'r1'
      );
      expect(res.status).toBe(400);
    });

    it('returns 400 when body is null', async () => {
      const req = new Request(BASE + '/api/admin/repairs/r1/status', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: 'null',
      });
      const res = await handleAdminUpdateStatus(req, {}, 'repairs', 'r1');
      expect(res.status).toBe(400);
    });

    it('returns 404 for unknown resource', async () => {
      const res = await handleAdminUpdateStatus(
        makePatchRequest('/api/admin/unknown/1/status', { status: 'x' }),
        {}, 'unknown', '1'
      );
      expect(res.status).toBe(404);
    });

    it('returns 500 on database error', async () => {
      getById.mockRejectedValue(new Error('DB error'));
      const res = await handleAdminUpdateStatus(
        makePatchRequest('/api/admin/repairs/r1/status', { status: 'repairing' }),
        {}, 'repairs', 'r1'
      );
      expect(res.status).toBe(500);
    });
  });
});
