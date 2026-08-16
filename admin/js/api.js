import { getSession, setSession, clearSession, doRefreshToken } from './auth.js';

const API_BASE = 'https://nexus.cuatrinismaelabrahan.workers.dev';

let refreshing = null;

function getToken() {
  const session = getSession();
  return session?.access_token || null;
}

function isTokenExpiringSoon(session) {
  if (!session?.expires_at) return false;
  return Date.now() > (session.expires_at - 300) * 1000;
}

async function ensureFreshToken() {
  const session = getSession();
  if (!session?.access_token) return null;

  if (isTokenExpiringSoon(session) && session.refresh_token) {
    if (!refreshing) {
      refreshing = doRefreshToken(session.refresh_token)
        .then(newSession => { setSession(newSession); return newSession; })
        .catch(() => { clearSession(); return null; })
        .finally(() => { refreshing = null; });
    }
    const result = await refreshing;
    return result?.access_token || null;
  }

  return session.access_token;
}

async function apiRequest(method, path, body = null) {
  let token = await ensureFreshToken();
  if (!token) {
    clearSession();
    window.location.href = 'login.html';
    throw new Error('Sesión no válida');
  }

  const options = {
    method,
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
    },
  };

  if (body) {
    options.body = JSON.stringify(body);
  }

  const res = await fetch(`${API_BASE}${path}`, options);

  if (res.status === 401) {
    clearSession();
    window.location.href = 'login.html';
    throw new Error('Sesión expirada');
  }

  if (!res.ok) {
    const err = await res.json().catch(() => ({ message: 'Error de conexión' }));
    throw new Error(err.message || `Error: ${res.status}`);
  }

  return res.json();
}

export function adminGetAll(resource, { search = '', status = '', from = '', to = '', sort = 'created_at', order = 'desc' } = {}) {
  const params = new URLSearchParams();
  if (search) params.set('search', search);
  if (status) params.set('status', status);
  if (from) params.set('from', from);
  if (to) params.set('to', to);
  if (sort) params.set('sort', sort);
  if (order) params.set('order', order);
  const qs = params.toString();
  return apiRequest('GET', `/api/admin/${resource}${qs ? '?' + qs : ''}`);
}

export function adminGetOne(resource, id) {
  return apiRequest('GET', `/api/admin/${resource}/${id}`);
}

export function adminCreate(resource, data) {
  return apiRequest('POST', `/api/admin/${resource}`, data);
}

export function adminUpdate(resource, id, data) {
  return apiRequest('PUT', `/api/admin/${resource}/${id}`, data);
}

export function adminDelete(resource, id) {
  return apiRequest('DELETE', `/api/admin/${resource}/${id}`);
}

export function updateStatus(resource, id, status) {
  return apiRequest('PATCH', `/api/admin/${resource}/${id}/status`, { status });
}

export function adminGetList(resource, { limit = 20, offset = 0, search = '', status = '', from = '', to = '', sort = 'created_at', order = 'desc' } = {}) {
  const params = new URLSearchParams();
  params.set('limit', String(limit));
  params.set('offset', String(offset));
  if (search) params.set('search', search);
  if (status) params.set('status', status);
  if (from) params.set('from', from);
  if (to) params.set('to', to);
  if (sort) params.set('sort', sort);
  if (order) params.set('order', order);
  return apiRequest('GET', `/api/admin/${resource}?${params.toString()}`);
}

export function getDashboardStats() {
  return apiRequest('GET', '/api/admin/dashboard');
}

export function getDlq() {
  return apiRequest('GET', '/api/admin/events/dlq');
}

export function replayDlq(dlqId) {
  return apiRequest('POST', `/api/admin/events/dlq/replay/${dlqId}`);
}

export function replayAllDlq() {
  return apiRequest('POST', '/api/admin/events/dlq/replay-all');
}
