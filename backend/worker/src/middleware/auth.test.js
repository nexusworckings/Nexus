import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../utils/jwt.js', () => ({
  verifyAuth: vi.fn(),
}));

import { requireAdmin } from './auth.js';
import { verifyAuth } from '../utils/jwt.js';

function makeRequest(token) {
  const headers = {};
  if (token) headers['Authorization'] = `Bearer ${token}`;
  return { headers: { get: (k) => headers[k] || null } };
}

const env = {
  SUPABASE_URL: 'https://test.supabase.co',
  ADMIN_ALLOWED_EMAILS: 'admin@test.com,admin2@test.com',
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe('requireAdmin', () => {
  it('returns 401 when no Authorization header', async () => {
    const result = await requireAdmin(makeRequest(null), env);
    expect(result.authenticated).toBe(false);
    expect(result.status).toBe(401);
  });

  it('returns 401 when header is not Bearer', async () => {
    const req = { headers: { get: () => 'Basic abc123' } };
    const result = await requireAdmin(req, env);
    expect(result.authenticated).toBe(false);
    expect(result.status).toBe(401);
  });

  it('returns 401 when token is invalid', async () => {
    verifyAuth.mockResolvedValue({ authenticated: false, error: 'Token inválido' });
    const result = await requireAdmin(makeRequest('bad-token'), env);
    expect(result.authenticated).toBe(false);
    expect(result.status).toBe(401);
  });

  it('returns 403 when email is not in allowed list', async () => {
    verifyAuth.mockResolvedValue({ authenticated: true, userId: 'u1', email: 'hacker@evil.com' });
    const result = await requireAdmin(makeRequest('valid-token'), env);
    expect(result.authenticated).toBe(false);
    expect(result.status).toBe(403);
  });

  it('returns authenticated when email is in allowed list', async () => {
    verifyAuth.mockResolvedValue({ authenticated: true, userId: 'u1', email: 'admin@test.com' });
    const result = await requireAdmin(makeRequest('valid-token'), env);
    expect(result.authenticated).toBe(true);
    expect(result.user.email).toBe('admin@test.com');
  });

  it('passes when ADMIN_ALLOWED_EMAILS is empty (no restriction)', async () => {
    verifyAuth.mockResolvedValue({ authenticated: true, userId: 'u1', email: 'anyone@test.com' });
    const envNoRestrict = { ...env, ADMIN_ALLOWED_EMAILS: '' };
    const result = await requireAdmin(makeRequest('valid-token'), envNoRestrict);
    expect(result.authenticated).toBe(true);
  });

  it('handles email case insensitivity', async () => {
    verifyAuth.mockResolvedValue({ authenticated: true, userId: 'u1', email: 'Admin@Test.Com' });
    const result = await requireAdmin(makeRequest('valid-token'), env);
    expect(result.authenticated).toBe(true);
  });
});
