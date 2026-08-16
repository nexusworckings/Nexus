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

import {
  handleAdminGetAll,
  handleAdminGetOne,
  handleAdminCreate,
  handleAdminUpdate,
  handleAdminDelete,
  handleAdminDashboard,
  handleAdminGetNotifications,
  handleAdminGetEvents,
} from './admin.js';

import { query, getById, insert, update, remove } from '../services/supabase.js';

const BASE = 'https://test.tecnosanjuan.com';

function makeRequest(method, path, body = null) {
  const opts = { method, headers: { 'Content-Type': 'application/json' } };
  if (body) opts.body = JSON.stringify(body);
  return new Request(BASE + path, opts);
}

function getJson(response) {
  return response.json();
}

describe('handleAdminGetAll', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('returns 404 for unknown resource', async () => {
    const res = await handleAdminGetAll(makeRequest('GET', '/api/admin/unknown'), {}, 'unknown');
    expect(res.status).toBe(404);
    const data = await getJson(res);
    expect(data.message).toContain('no encontrado');
  });

  it('queries supabase and returns data', async () => {
    query.mockResolvedValue([{ id: 1, name: 'Test' }]);
    const res = await handleAdminGetAll(makeRequest('GET', '/api/admin/repairs'), {}, 'repairs');
    expect(res.status).toBe(200);
    const data = await getJson(res);
    expect(data).toEqual([{ id: 1, name: 'Test' }]);
    expect(query).toHaveBeenCalledWith(expect.anything(), 'repairs', expect.any(Object), true);
  });

  it('returns 500 on supabase error', async () => {
    query.mockRejectedValue(new Error('DB error'));
    const res = await handleAdminGetAll(makeRequest('GET', '/api/admin/repairs'), {}, 'repairs');
    expect(res.status).toBe(500);
  });
});

describe('handleAdminGetOne', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('returns 404 for unknown resource', async () => {
    const res = await handleAdminGetOne(makeRequest('GET', '/api/admin/unknown/1'), {}, 'unknown', '1');
    expect(res.status).toBe(404);
  });

  it('returns 404 when record not found', async () => {
    getById.mockResolvedValue(null);
    const res = await handleAdminGetOne(makeRequest('GET', '/api/admin/repairs/abc'), {}, 'repairs', 'abc');
    expect(res.status).toBe(404);
  });

  it('returns record when found', async () => {
    getById.mockResolvedValue({ id: 'abc', device: 'Phone' });
    const res = await handleAdminGetOne(makeRequest('GET', '/api/admin/repairs/abc'), {}, 'repairs', 'abc');
    expect(res.status).toBe(200);
    const data = await getJson(res);
    expect(data.device).toBe('Phone');
  });
});

describe('handleAdminCreate', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('returns 404 for unknown resource', async () => {
    const res = await handleAdminCreate(makeRequest('POST', '/api/admin/unknown'), {}, 'unknown');
    expect(res.status).toBe(404);
  });

  it('creates record and returns 201', async () => {
    insert.mockResolvedValue({ id: 'new-id', device: 'Phone' });
    const req = makeRequest('POST', '/api/admin/repairs', { device: 'Phone', problem: 'Broken' });
    const res = await handleAdminCreate(req, {}, 'repairs');
    expect(res.status).toBe(201);
    const data = await getJson(res);
    expect(data.device).toBe('Phone');
    expect(insert).toHaveBeenCalled();
  });

  it('strips id/created_at/updated_at from body', async () => {
    insert.mockResolvedValue({ id: 'new-id' });
    const req = makeRequest('POST', '/api/admin/repairs', {
      id: 'should-ignore',
      created_at: 'should-ignore',
      device: 'Phone',
      problem: 'Broken',
    });
    await handleAdminCreate(req, {}, 'repairs');
    const insertArg = insert.mock.calls[0][2];
    expect(insertArg.id).toBeUndefined();
    expect(insertArg.created_at).toBeUndefined();
    expect(insertArg.device).toBe('Phone');
  });
});

describe('handleAdminUpdate', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('returns 404 for unknown resource', async () => {
    const res = await handleAdminUpdate(makeRequest('PUT', '/api/admin/unknown/1'), {}, 'unknown', '1');
    expect(res.status).toBe(404);
  });

  it('updates record and returns it', async () => {
    update.mockResolvedValue({ id: 'abc', status: 'diagnosing' });
    getById.mockResolvedValue({ id: 'abc', status: 'received' });
    const req = makeRequest('PUT', '/api/admin/repairs/abc', { status: 'diagnosing' });
    const res = await handleAdminUpdate(req, {}, 'repairs', 'abc', { user: { sub: 'user-1' } });
    expect(res.status).toBe(200);
    const data = await getJson(res);
    expect(data.status).toBe('diagnosing');
  });

  it('logs activity when status changes', async () => {
    update.mockResolvedValue({ id: 'abc', status: 'diagnosing' });
    getById.mockResolvedValue({ id: 'abc', status: 'received' });
    const req = makeRequest('PUT', '/api/admin/repairs/abc', { status: 'diagnosing' });
    await handleAdminUpdate(req, {}, 'repairs', 'abc', { user: { sub: 'user-1' } });
    expect(insert).toHaveBeenCalledWith(expect.anything(), 'admin_activity_log', expect.objectContaining({
      user_id: 'user-1',
      action: 'status_changed',
      entity: 'repairs',
      entity_id: 'abc',
    }), true);
  });

  it('does not log activity when status is unchanged', async () => {
    update.mockResolvedValue({ id: 'abc', status: 'received' });
    getById.mockResolvedValue({ id: 'abc', status: 'received' });
    const req = makeRequest('PUT', '/api/admin/repairs/abc', { status: 'received' });
    await handleAdminUpdate(req, {}, 'repairs', 'abc', { user: { sub: 'user-1' } });
    const insertCalls = insert.mock.calls.filter(c => c[1] === 'admin_activity_log');
    expect(insertCalls).toHaveLength(0);
  });

  it('does not log activity when status not in body', async () => {
    update.mockResolvedValue({ id: 'abc', device: 'New Device' });
    getById.mockResolvedValue({ id: 'abc', device: 'Old Device' });
    const req = makeRequest('PUT', '/api/admin/repairs/abc', { device: 'New Device' });
    await handleAdminUpdate(req, {}, 'repairs', 'abc', { user: { sub: 'user-1' } });
    const insertCalls = insert.mock.calls.filter(c => c[1] === 'admin_activity_log');
    expect(insertCalls).toHaveLength(0);
  });

  it('returns 404 when record not found after update', async () => {
    update.mockResolvedValue(null);
    const req = makeRequest('PUT', '/api/admin/repairs/nonexistent', { device: 'X' });
    const res = await handleAdminUpdate(req, {}, 'repairs', 'nonexistent', { user: { sub: 'user-1' } });
    expect(res.status).toBe(404);
  });

  it('dispatches REPAIR_STATUS_CHANGED when repair status changes', async () => {
    update.mockResolvedValue({ id: 'abc', status: 'repairing' });
    getById.mockResolvedValue({ id: 'abc', status: 'received', client_id: 'client-1' });
    const req = makeRequest('PUT', '/api/admin/repairs/abc', { status: 'repairing' });
    await handleAdminUpdate(req, {}, 'repairs', 'abc', { user: { sub: 'user-1' } });
    expect(mockDispatch).toHaveBeenCalledWith({
      type: 'REPAIR_STATUS_CHANGED',
      entityId: 'abc',
      clientId: 'client-1',
      metadata: { oldStatus: 'received', newStatus: 'repairing' },
    });
  });

  it('dispatches BUDGET_APPROVED when budget approved', async () => {
    update.mockResolvedValue({ id: 'b1', status: 'approved' });
    getById.mockResolvedValue({ id: 'b1', status: 'pending', client_id: 'c1' });
    const req = makeRequest('PUT', '/api/admin/budgets/b1', { status: 'approved' });
    await handleAdminUpdate(req, {}, 'budgets', 'b1', { user: { sub: 'u1' } });
    expect(mockDispatch).toHaveBeenCalledWith({
      type: 'BUDGET_APPROVED',
      entityId: 'b1',
      clientId: 'c1',
      metadata: { oldStatus: 'pending', newStatus: 'approved' },
    });
  });

  it('dispatches BUDGET_REJECTED when budget rejected', async () => {
    update.mockResolvedValue({ id: 'b1', status: 'rejected' });
    getById.mockResolvedValue({ id: 'b1', status: 'pending', client_id: 'c1' });
    const req = makeRequest('PUT', '/api/admin/budgets/b1', { status: 'rejected' });
    await handleAdminUpdate(req, {}, 'budgets', 'b1', { user: { sub: 'u1' } });
    expect(mockDispatch).toHaveBeenCalledWith({
      type: 'BUDGET_REJECTED',
      entityId: 'b1',
      clientId: 'c1',
      metadata: { oldStatus: 'pending', newStatus: 'rejected' },
    });
  });

  it('does not dispatch for budget status changes that are not approved/rejected', async () => {
    update.mockResolvedValue({ id: 'b1', status: 'completed' });
    getById.mockResolvedValue({ id: 'b1', status: 'approved', client_id: 'c1' });
    const req = makeRequest('PUT', '/api/admin/budgets/b1', { status: 'completed' });
    await handleAdminUpdate(req, {}, 'budgets', 'b1', { user: { sub: 'u1' } });
    expect(mockDispatch).not.toHaveBeenCalled();
  });

  it('dispatches PRINT_ORDER_STATUS_CHANGED when print order status changes', async () => {
    update.mockResolvedValue({ id: 'p1', status: 'printing' });
    getById.mockResolvedValue({ id: 'p1', status: 'pending', client_id: 'c1' });
    const req = makeRequest('PUT', '/api/admin/print-orders/p1', { status: 'printing' });
    await handleAdminUpdate(req, {}, 'print-orders', 'p1', { user: { sub: 'u1' } });
    expect(mockDispatch).toHaveBeenCalledWith({
      type: 'PRINT_ORDER_STATUS_CHANGED',
      entityId: 'p1',
      clientId: 'c1',
      metadata: { oldStatus: 'pending', newStatus: 'printing' },
    });
  });

  it('does not dispatch event when status is unchanged', async () => {
    update.mockResolvedValue({ id: 'abc', status: 'received' });
    getById.mockResolvedValue({ id: 'abc', status: 'received', client_id: 'c1' });
    const req = makeRequest('PUT', '/api/admin/repairs/abc', { status: 'received' });
    await handleAdminUpdate(req, {}, 'repairs', 'abc', { user: { sub: 'u1' } });
    expect(mockDispatch).not.toHaveBeenCalled();
  });

  it('dispatches with null clientId when current record has no client_id', async () => {
    update.mockResolvedValue({ id: 'abc', status: 'repairing' });
    getById.mockResolvedValue({ id: 'abc', status: 'received', client_id: null });
    const req = makeRequest('PUT', '/api/admin/repairs/abc', { status: 'repairing' });
    await handleAdminUpdate(req, {}, 'repairs', 'abc', { user: { sub: 'u1' } });
    expect(mockDispatch).toHaveBeenCalledWith(expect.objectContaining({
      clientId: null,
    }));
  });
});

describe('handleAdminDelete', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('returns 404 for unknown resource', async () => {
    const res = await handleAdminDelete(makeRequest('DELETE', '/api/admin/unknown/1'), {}, 'unknown', '1');
    expect(res.status).toBe(404);
  });

  it('deletes record and returns success', async () => {
    remove.mockResolvedValue({ success: true });
    const res = await handleAdminDelete(makeRequest('DELETE', '/api/admin/repairs/abc'), {}, 'repairs', 'abc');
    expect(res.status).toBe(200);
    const data = await getJson(res);
    expect(data.success).toBe(true);
    expect(remove).toHaveBeenCalledWith(expect.anything(), 'repairs', 'abc', true);
  });
});

describe('handleAdminDashboard', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('returns dashboard stats', async () => {
    const mockResults = {
      'repairs|status': [
        { status: 'received' },
        { status: 'received' },
        { status: 'diagnosing' },
        { status: 'repairing' },
        { status: 'completed' },
      ],
      'budgets|status': [
        { status: 'pending' },
        { status: 'approved' },
      ],
      'print_orders|status': [
        { status: 'pending' },
        { status: 'printing' },
      ],
    };
    query.mockImplementation((env, table, opts) => {
      const key = table + '|' + (opts?.select || '');
      if (mockResults[key]) return Promise.resolve(mockResults[key]);
      return Promise.resolve([]);
    });

    const res = await handleAdminDashboard(makeRequest('GET', '/api/admin/dashboard'), {});
    expect(res.status).toBe(200);
    const data = await getJson(res);
    expect(data.repairs.total).toBe(5);
    expect(data.repairs.received).toBe(2);
    expect(data.repairs.diagnosing).toBe(1);
    expect(data.repairs.repairing).toBe(1);
    expect(data.repairs.completed).toBe(1);
    expect(data.budgets.total).toBe(2);
    expect(data.budgets.pending).toBe(1);
    expect(data.budgets.approved).toBe(1);
    expect(data.printOrders.total).toBe(2);
    expect(data.printOrders.printing).toBe(1);
  });

  it('returns empty stats when queries fail', async () => {
    query.mockRejectedValue(new Error('DB error'));
    const res = await handleAdminDashboard(makeRequest('GET', '/api/admin/dashboard'), {});
    expect(res.status).toBe(200);
    const data = await getJson(res);
    expect(data.repairs.total).toBe(0);
    expect(data.budgets.total).toBe(0);
    expect(data.printOrders.total).toBe(0);
  });
});

describe('RESOURCE_MAP coverage', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  const resources = ['repairs', 'budgets', 'print-orders'];

  for (const resource of resources) {
    it(`${resource} resolves to a valid table`, async () => {
      query.mockResolvedValue([]);
      const res = await handleAdminGetAll(makeRequest('GET', `/api/admin/${resource}`), {}, resource);
      expect(res.status).toBe(200);
      expect(query).toHaveBeenCalled();
    });
  }
});
