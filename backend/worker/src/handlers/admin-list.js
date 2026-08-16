import { errorResponse } from '../middleware/error.js';

const TABLES = {
  'repairs': 'repairs',
  'budgets': 'budgets',
  'print-orders': 'print_orders',
  'clients': 'clients',
};

const SEARCH_FIELDS = {
  'repairs': ['device', 'problem', 'client_name', 'phone'],
  'budgets': ['service_type', 'description', 'client_name'],
  'print-orders': ['object_description', 'material', 'client_name'],
  'clients': ['name', 'phone', 'email'],
};

const SORT_FIELDS = {
  'repairs': ['created_at', 'device', 'status', 'client_name'],
  'budgets': ['created_at', 'service_type', 'status', 'client_name'],
  'print-orders': ['created_at', 'object_description', 'material', 'status', 'client_name'],
  'clients': ['created_at', 'name', 'phone'],
};

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;
const DEFAULT_SORT = 'created_at';

function parseListParams(url) {
  const limit = Math.min(
    Math.max(parseInt(url.searchParams.get('limit'), 10) || DEFAULT_LIMIT, 1),
    MAX_LIMIT
  );
  const offset = Math.max(parseInt(url.searchParams.get('offset'), 10) || 0, 0);
  const order = url.searchParams.get('order') || 'created_at.desc';
  const search = url.searchParams.get('search') || '';
  const status = url.searchParams.get('status') || '';
  const from = url.searchParams.get('from') || '';
  const to = url.searchParams.get('to') || '';
  const sort = url.searchParams.get('sort') || DEFAULT_SORT;
  return { limit, offset, order, search, status, from, to, sort };
}

function buildSearchFilter(resource, search) {
  if (!search) return null;
  const fields = SEARCH_FIELDS[resource];
  if (!fields) return null;
  const q = `%${search}%`;
  return fields.map(f => `${f}.ilike.${q}`).join(',');
}

function buildSortOrder(sort, order) {
  const direction = order === 'asc' ? 'asc' : 'desc';
  return `${sort}.${direction}`;
}

function buildDataUrl(supabaseUrl, table, params) {
  const { sort, order, search, status, from, to } = params;
  const sortBy = sort || DEFAULT_SORT;
  const sortOrder = order === 'asc' ? 'asc' : 'desc';

  const urlParams = new URLSearchParams();
  urlParams.set('select', '*');
  urlParams.set('order', `${sortBy}.${sortOrder}`);

  const filters = [];

  if (search) {
    const searchFilter = buildSearchFilter(
      Object.keys(TABLES).find(k => TABLES[k] === table) || 'repairs',
      search
    );
    if (searchFilter) filters.push(`or(${searchFilter})`);
  }

  if (status) {
    filters.push(`status.eq.${status}`);
  }

  if (from) {
    filters.push(`created_at.gte.${from}`);
  }

  if (to) {
    filters.push(`created_at.lte.${to}`);
  }

  if (filters.length > 0) {
    urlParams.set('and', `(${filters.join(',')})`);
  }

  return `${supabaseUrl}/rest/v1/${table}?${urlParams.toString()}`;
}

function adminHeaders(svcKey) {
  return {
    'Content-Type': 'application/json',
    'Accept': 'application/json',
    'Authorization': `Bearer ${svcKey}`,
    'apikey': svcKey,
    'Prefer': 'count=exact',
  };
}

function parseTotalFromContentRange(header) {
  if (!header) return 0;
  const parts = header.split('/');
  if (parts.length === 2) {
    const total = parseInt(parts[1], 10);
    return Number.isNaN(total) ? 0 : total;
  }
  return 0;
}

export async function handleAdminList(request, env, resource) {
  const table = TABLES[resource];
  if (!table) return errorResponse(request, 404, 'Recurso no encontrado');

  try {
    const url = new URL(request.url);
    const params = parseListParams(url);
    const svcKey = env.SUPABASE_SERVICE_ROLE_KEY;
    const supabaseUrl = env.SUPABASE_URL;

    const headers = adminHeaders(svcKey);
    headers['Range'] = `${params.offset}-${params.offset + params.limit - 1}`;
    headers['Range-Unit'] = 'items';

    const dataUrl = buildDataUrl(supabaseUrl, table, params);
    const res = await fetch(dataUrl, { headers });
    if (!res.ok) {
      const errText = await res.text();
      return errorResponse(request, 500, `Supabase error: ${errText}`);
    }

    const items = await res.json();
    const total = parseTotalFromContentRange(res.headers.get('content-range'));

    return new Response(JSON.stringify({
      items,
      total,
      limit: params.limit,
      offset: params.offset,
    }), {
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err) {
    return errorResponse(request, 500, err.message);
  }
}
