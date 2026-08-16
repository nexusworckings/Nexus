const API_BASE = 'https://nexus.cuatrinismaelabrahan.workers.dev';

export async function fetchPublic(resource) {
  const res = await fetch(`${API_BASE}/api/public/${resource}`);

  if (!res.ok) {
    throw new Error(`Error al obtener ${resource}: ${res.status}`);
  }

  return res.json();
}

export async function fetchChat(message, context = '', interview = null, session = null, action = null) {
  const body = { message };
  if (context) body.context = context;
  body.interview = interview;
  body.session = session;
  if (action) body.action = action;

  const res = await fetch(`${API_BASE}/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({ message: 'Error de conexión' }));
    throw new Error(err.message || `Error: ${res.status}`);
  }

  return res.json();
}

export async function fetchAllPublicData() {
  const endpoints = [
    'business-info',
    'categories',
    'services',
    'prices',
    'promotions',
    'warranties',
    'print3d',
    'faqs',
    'social-media',
    'phones',
    'address',
    'featured-messages',
    'hours',
    'products',
  ];

  const results = await Promise.allSettled(
    endpoints.map(async name => ({
      name,
      data: await fetchPublic(name),
    }))
  );

  const data = {};
  for (const result of results) {
    if (result.status === 'fulfilled') {
      data[result.value.name] = result.value.data;
    } else {
      console.warn(`Error fetching data:`, result.reason);
    }
  }

  return data;
}
