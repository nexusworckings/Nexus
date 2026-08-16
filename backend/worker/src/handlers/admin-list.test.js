import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

import { handleAdminList } from './admin-list.js';

const BASE = 'https://test.tecnosanjuan.com';
const ENV = {
  SUPABASE_URL: 'https://xyz.supabase.co',
  SUPABASE_SERVICE_ROLE_KEY: 'svc-key-123',
};

function makeRequest(path) {
  return new Request(BASE + path);
}

function mockSupabaseResponse(items, total) {
  return {
    ok: true,
    json: () => Promise.resolve(items),
    headers: {
      get(name) {
        if (name === 'content-range') return `0-${items.length - 1}/${total}`;
        return null;
      },
    },
  };
}

describe('handleAdminList', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns 404 for unknown resource', async () => {
    const res = await handleAdminList(makeRequest('/api/admin/unknown'), ENV, 'unknown');
    expect(res.status).toBe(404);
  });

  it('returns empty list when no items exist', async () => {
    mockFetch.mockResolvedValue(mockSupabaseResponse([], 0));
    const res = await handleAdminList(makeRequest('/api/admin/repairs'), ENV, 'repairs');
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.items).toEqual([]);
    expect(data.total).toBe(0);
    expect(data.limit).toBe(20);
    expect(data.offset).toBe(0);
  });

  it('returns items with correct JSON structure', async () => {
    const items = [
      { id: '1', device: 'Samsung A54', status: 'received' },
      { id: '2', device: 'iPhone 13', status: 'repairing' },
    ];
    mockFetch.mockResolvedValue(mockSupabaseResponse(items, 2));
    const res = await handleAdminList(makeRequest('/api/admin/repairs'), ENV, 'repairs');
    const data = await res.json();
    expect(data.items).toHaveLength(2);
    expect(data.items[0].device).toBe('Samsung A54');
    expect(data.items[1].device).toBe('iPhone 13');
    expect(data.total).toBe(2);
  });

  it('supports limit parameter', async () => {
    mockFetch.mockResolvedValue(mockSupabaseResponse([], 0));
    await handleAdminList(makeRequest('/api/admin/repairs?limit=5'), ENV, 'repairs');
    const fetchUrl = mockFetch.mock.calls[0][0];
    const rangeHeader = mockFetch.mock.calls[0][1].headers.Range;
    expect(rangeHeader).toBe('0-4');
  });

  it('caps limit at MAX_LIMIT (100)', async () => {
    mockFetch.mockResolvedValue(mockSupabaseResponse([], 0));
    await handleAdminList(makeRequest('/api/admin/repairs?limit=500'), ENV, 'repairs');
    const rangeHeader = mockFetch.mock.calls[0][1].headers.Range;
    expect(rangeHeader).toBe('0-99');
  });

  it('supports offset parameter', async () => {
    mockFetch.mockResolvedValue(mockSupabaseResponse([], 0));
    await handleAdminList(makeRequest('/api/admin/repairs?offset=10'), ENV, 'repairs');
    const rangeHeader = mockFetch.mock.calls[0][1].headers.Range;
    expect(rangeHeader).toBe('10-29');
  });

  it('supports offset + limit combined', async () => {
    mockFetch.mockResolvedValue(mockSupabaseResponse([], 0));
    await handleAdminList(makeRequest('/api/admin/repairs?offset=20&limit=10'), ENV, 'repairs');
    const rangeHeader = mockFetch.mock.calls[0][1].headers.Range;
    expect(rangeHeader).toBe('20-29');
  });

  it('defaults to created_at.desc order', async () => {
    mockFetch.mockResolvedValue(mockSupabaseResponse([], 0));
    await handleAdminList(makeRequest('/api/admin/repairs'), ENV, 'repairs');
    const fetchUrl = mockFetch.mock.calls[0][0];
    expect(fetchUrl).toContain('order=created_at.desc');
  });

  it('supports custom sort and order parameters', async () => {
    mockFetch.mockResolvedValue(mockSupabaseResponse([], 0));
    await handleAdminList(makeRequest('/api/admin/repairs?sort=id&order=asc'), ENV, 'repairs');
    const fetchUrl = mockFetch.mock.calls[0][0];
    expect(fetchUrl).toContain('order=id.asc');
  });

  it('sends correct Supabase headers', async () => {
    mockFetch.mockResolvedValue(mockSupabaseResponse([], 0));
    await handleAdminList(makeRequest('/api/admin/repairs'), ENV, 'repairs');
    const headers = mockFetch.mock.calls[0][1].headers;
    expect(headers['Authorization']).toBe('Bearer svc-key-123');
    expect(headers['apikey']).toBe('svc-key-123');
    expect(headers['Prefer']).toBe('count=exact');
    expect(headers['Range-Unit']).toBe('items');
  });

  it('returns 500 on Supabase error', async () => {
    mockFetch.mockResolvedValue({ ok: false, text: () => Promise.resolve('db error') });
    const res = await handleAdminList(makeRequest('/api/admin/repairs'), ENV, 'repairs');
    expect(res.status).toBe(500);
  });

  it('works for budgets endpoint', async () => {
    const items = [{ id: 'b1', serviceType: 'reparacion', status: 'pending' }];
    mockFetch.mockResolvedValue(mockSupabaseResponse(items, 1));
    const res = await handleAdminList(makeRequest('/api/admin/budgets'), ENV, 'budgets');
    const data = await res.json();
    expect(data.items).toHaveLength(1);
    expect(data.items[0].serviceType).toBe('reparacion');
    const fetchUrl = mockFetch.mock.calls[0][0];
    expect(fetchUrl).toContain('/rest/v1/budgets?');
  });

  it('works for print-orders endpoint', async () => {
    const items = [{ id: 'p1', objectDescription: 'Soporte', status: 'pending' }];
    mockFetch.mockResolvedValue(mockSupabaseResponse(items, 1));
    const res = await handleAdminList(makeRequest('/api/admin/print-orders'), ENV, 'print-orders');
    const data = await res.json();
    expect(data.items).toHaveLength(1);
    const fetchUrl = mockFetch.mock.calls[0][0];
    expect(fetchUrl).toContain('/rest/v1/print_orders?');
  });

  it('works for clients endpoint', async () => {
    const items = [{ id: 'c1', name: 'Juan', phone: '123456789' }];
    mockFetch.mockResolvedValue(mockSupabaseResponse(items, 1));
    const res = await handleAdminList(makeRequest('/api/admin/clients'), ENV, 'clients');
    const data = await res.json();
    expect(data.items).toHaveLength(1);
    expect(data.items[0].name).toBe('Juan');
    const fetchUrl = mockFetch.mock.calls[0][0];
    expect(fetchUrl).toContain('/rest/v1/clients?');
  });

  it('returns total count from content-range header', async () => {
    mockFetch.mockResolvedValue(mockSupabaseResponse([{ id: '1' }, { id: '2' }], 154));
    const res = await handleAdminList(makeRequest('/api/admin/repairs?limit=2'), ENV, 'repairs');
    const data = await res.json();
    expect(data.total).toBe(154);
    expect(data.items).toHaveLength(2);
  });

  it('defaults total to 0 when content-range header is missing', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve([]),
      headers: { get: () => null },
    });
    const res = await handleAdminList(makeRequest('/api/admin/repairs'), ENV, 'repairs');
    const data = await res.json();
    expect(data.total).toBe(0);
  });

  it('returns valid JSON with Content-Type application/json', async () => {
    mockFetch.mockResolvedValue(mockSupabaseResponse([], 0));
    const res = await handleAdminList(makeRequest('/api/admin/repairs'), ENV, 'repairs');
    expect(res.headers.get('Content-Type')).toBe('application/json');
    const data = await res.json();
    expect(data).toHaveProperty('items');
    expect(data).toHaveProperty('total');
    expect(data).toHaveProperty('limit');
    expect(data).toHaveProperty('offset');
  });

  it('adds search filter for repairs', async () => {
    mockFetch.mockResolvedValue(mockSupabaseResponse([], 0));
    await handleAdminList(makeRequest('/api/admin/repairs?search=samsung'), ENV, 'repairs');
    const fetchUrl = mockFetch.mock.calls[0][0];
    expect(fetchUrl).toContain('and=');
    expect(fetchUrl).toContain('ilike');
    expect(fetchUrl).toContain('device.ilike');
    expect(fetchUrl).toContain('problem.ilike');
    expect(fetchUrl).toContain('client_name.ilike');
  });

  it('adds search filter for budgets', async () => {
    mockFetch.mockResolvedValue(mockSupabaseResponse([], 0));
    await handleAdminList(makeRequest('/api/admin/budgets?search=reparacion'), ENV, 'budgets');
    const fetchUrl = mockFetch.mock.calls[0][0];
    expect(fetchUrl).toContain('service_type.ilike');
    expect(fetchUrl).toContain('description.ilike');
  });

  it('adds search filter for print-orders', async () => {
    mockFetch.mockResolvedValue(mockSupabaseResponse([], 0));
    await handleAdminList(makeRequest('/api/admin/print-orders?search=soporte'), ENV, 'print-orders');
    const fetchUrl = mockFetch.mock.calls[0][0];
    expect(fetchUrl).toContain('object_description.ilike');
    expect(fetchUrl).toContain('material.ilike');
  });

  it('adds search filter for clients', async () => {
    mockFetch.mockResolvedValue(mockSupabaseResponse([], 0));
    await handleAdminList(makeRequest('/api/admin/clients?search=juan'), ENV, 'clients');
    const fetchUrl = mockFetch.mock.calls[0][0];
    expect(fetchUrl).toContain('name.ilike');
    expect(fetchUrl).toContain('phone.ilike');
  });

  it('adds status filter', async () => {
    mockFetch.mockResolvedValue(mockSupabaseResponse([], 0));
    await handleAdminList(makeRequest('/api/admin/repairs?status=receiving'), ENV, 'repairs');
    const fetchUrl = mockFetch.mock.calls[0][0];
    expect(fetchUrl).toContain('status.eq.receiving');
  });

  it('adds date range filter', async () => {
    mockFetch.mockResolvedValue(mockSupabaseResponse([], 0));
    await handleAdminList(makeRequest('/api/admin/repairs?from=2024-01-01&to=2024-12-31'), ENV, 'repairs');
    const fetchUrl = mockFetch.mock.calls[0][0];
    expect(fetchUrl).toContain('created_at.gte.2024-01-01');
    expect(fetchUrl).toContain('created_at.lte.2024-12-31');
  });

  it('combines search, status, and date filters', async () => {
    mockFetch.mockResolvedValue(mockSupabaseResponse([], 0));
    await handleAdminList(makeRequest('/api/admin/repairs?search=samsung&status=received&from=2024-01-01'), ENV, 'repairs');
    const fetchUrl = mockFetch.mock.calls[0][0];
    expect(fetchUrl).toContain('ilike');
    expect(fetchUrl).toContain('status.eq.received');
    expect(fetchUrl).toContain('created_at.gte.2024-01-01');
  });

  it('supports sort parameter with default desc', async () => {
    mockFetch.mockResolvedValue(mockSupabaseResponse([], 0));
    await handleAdminList(makeRequest('/api/admin/repairs?sort=device'), ENV, 'repairs');
    const fetchUrl = mockFetch.mock.calls[0][0];
    expect(fetchUrl).toContain('order=device.desc');
  });

  it('supports sort=asc direction', async () => {
    mockFetch.mockResolvedValue(mockSupabaseResponse([], 0));
    await handleAdminList(makeRequest('/api/admin/repairs?sort=status&order=asc'), ENV, 'repairs');
    const fetchUrl = mockFetch.mock.calls[0][0];
    expect(fetchUrl).toContain('order=status.asc');
  });

  it('sorts by client_name', async () => {
    mockFetch.mockResolvedValue(mockSupabaseResponse([], 0));
    await handleAdminList(makeRequest('/api/admin/repairs?sort=client_name&order=asc'), ENV, 'repairs');
    const fetchUrl = mockFetch.mock.calls[0][0];
    expect(fetchUrl).toContain('order=client_name.asc');
  });

  it('combines pagination with search and filters', async () => {
    mockFetch.mockResolvedValue(mockSupabaseResponse([], 0));
    await handleAdminList(makeRequest('/api/admin/repairs?search=iphone&status=received&limit=5&offset=10'), ENV, 'repairs');
    const fetchUrl = mockFetch.mock.calls[0][0];
    const rangeHeader = mockFetch.mock.calls[0][1].headers.Range;
    expect(fetchUrl).toContain('ilike');
    expect(fetchUrl).toContain('status.eq.received');
    expect(rangeHeader).toBe('10-14');
  });
});
