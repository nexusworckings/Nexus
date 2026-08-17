const ALLOWED_ORIGINS = [
  'https://tecnosanjuan.com',
  'https://www.tecnosanjuan.com',
  'https://ismabrahan.github.io',
  'https://ismabrahn.github.io',
  'https://nexusworckings.github.io',
  'https://nexus.cuatrinismaelabrahan.workers.dev',
  'http://localhost:8787',
  'http://localhost:5500',
  'http://127.0.0.1:5500',
  'http://localhost:3000',
];

export function getCorsHeaders(request) {
  const origin = request.headers.get('Origin') || '';
  const allowed = ALLOWED_ORIGINS.includes(origin) ? origin : 'https://tecnosanjuan.com';

  return {
    'Access-Control-Allow-Origin': allowed,
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Admin-Mode',
    'Access-Control-Max-Age': '86400',
    'Vary': 'Origin',
  };
}

export function handleOptions(request) {
  if (request.method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: getCorsHeaders(request),
    });
  }
  return null;
}
