import { query, getById, insert, update, remove } from '../services/supabase.js';
import { errorResponse } from '../middleware/error.js';
import { sanitize } from '../utils/validate.js';
import { eventBus } from '../services/events/event-bus.js';
import { EventDispatcher } from '../services/events/event-dispatcher.js';
import { EventQueue } from '../services/events/event-queue.js';
import { EventRepository } from '../services/events/event-repository.js';
import {
  REPAIR_STATUS_CHANGED,
  BUDGET_APPROVED,
  BUDGET_REJECTED,
  PRINT_ORDER_STATUS_CHANGED,
} from '../services/events/event-types.js';

const RESOURCE_MAP = {
  'business-info': 'business_info',
  'services': 'services',
  'categories': 'categories',
  'prices': 'prices',
  'promotions': 'promotions',
  'warranties': 'warranties',
  'print3d': 'print3d',
  'faqs': 'faqs',
  'social-media': 'social_media',
  'phones': 'phones',
  'address': 'address',
  'featured-messages': 'featured_messages',
  'hours': 'hours',
  'emails': 'emails',
  'products': 'products',
  'chatbot-config': 'chatbot_config',
  'repairs': 'repairs',
  'budgets': 'budgets',
  'print-orders': 'print_orders',
  'clients': 'clients',
  'notifications': 'notifications',
  'events': 'events',
};

export async function handleAdminGetAll(request, env, resource) {
  const table = RESOURCE_MAP[resource];
  if (!table) return errorResponse(request, 404, 'Recurso no encontrado');

  try {
    const url = new URL(request.url);
    const search = url.searchParams.get('search') || '';
    const options = { order: 'id.asc' };

    if (search && resource !== 'business-info' && resource !== 'address') {
      options.search = search;
    }

    const data = await query(env, table, options, true);
    return new Response(JSON.stringify(data), {
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err) {
    return errorResponse(request, 500, err.message);
  }
}

export async function handleAdminGetOne(request, env, resource, id) {
  const table = RESOURCE_MAP[resource];
  if (!table) return errorResponse(request, 404, 'Recurso no encontrado');

  try {
    const data = await getById(env, table, id, true);
    if (!data) return errorResponse(request, 404, 'Registro no encontrado');
    return new Response(JSON.stringify(data), {
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err) {
    return errorResponse(request, 500, err.message);
  }
}

export async function handleAdminCreate(request, env, resource) {
  const table = RESOURCE_MAP[resource];
  if (!table) return errorResponse(request, 404, 'Recurso no encontrado');

  try {
    const body = await request.json();
    const sanitized = sanitizeObject(body);
    const result = await insert(env, table, sanitized, true);
    return new Response(JSON.stringify(result), {
      status: 201,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err) {
    return errorResponse(request, 400, err.message);
  }
}

export async function handleAdminUpdate(request, env, resource, id, auth) {
  const table = RESOURCE_MAP[resource];
  if (!table) return errorResponse(request, 404, 'Recurso no encontrado');

  try {
    const body = await request.json();
    const sanitized = sanitizeObject(body);

    const hasStatus = sanitized.status !== undefined;
    if (hasStatus) {
      const current = await getById(env, table, id, true);
      if (current && current.status !== sanitized.status) {
        await logActivity(env, auth?.user?.sub || auth?.user?.id, 'status_changed', resource, id, {
          from: current.status,
          to: sanitized.status,
        });

        const eventType = getStatusEventType(resource, current.status, sanitized.status);
        if (eventType) {
          const repo = new EventRepository({
            insertFn: (table, data) => insert(env, table, data, true),
            queryFn: (table, opts) => query(env, table, opts, true),
            updateFn: (table, id, data) => update(env, table, id, data, true),
          });
          const queue = new EventQueue({ eventRepository: repo });
          const dispatcher = new EventDispatcher({ eventBus, eventQueue: queue });
          dispatcher.dispatch({
            type: eventType,
            entityId: id,
            clientId: current.client_id || null,
            metadata: { oldStatus: current.status, newStatus: sanitized.status },
          });
        }
      }
    }

    const result = await update(env, table, id, sanitized, true);
    if (!result) return errorResponse(request, 404, 'Registro no encontrado');
    return new Response(JSON.stringify(result), {
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err) {
    return errorResponse(request, 400, err.message);
  }
}

function getStatusEventType(resource, oldStatus, newStatus) {
  switch (resource) {
    case 'repairs':
      return REPAIR_STATUS_CHANGED;
    case 'print-orders':
      return PRINT_ORDER_STATUS_CHANGED;
    case 'budgets':
      if (newStatus === 'approved') return BUDGET_APPROVED;
      if (newStatus === 'rejected') return BUDGET_REJECTED;
      return null;
    default:
      return null;
  }
}

export async function handleAdminDelete(request, env, resource, id) {
  const table = RESOURCE_MAP[resource];
  if (!table) return errorResponse(request, 404, 'Recurso no encontrado');

  try {
    const deleted = await remove(env, table, id, true);
    return new Response(JSON.stringify(deleted), {
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err) {
    return errorResponse(request, 500, err.message);
  }
}

export async function handleUpdatePassword(request, env, auth) {
  try {
    const body = await request.json();
    const newPassword = body.password;
    if (!newPassword || newPassword.length < 8) {
      return new Response(JSON.stringify({ error: 'La contraseña debe tener al menos 8 caracteres' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const userEmail = auth.user?.email;
    if (!userEmail) {
      return new Response(JSON.stringify({ error: 'Email no encontrado en el token' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const supabaseUrl = env.SUPABASE_URL;
    const svcKey = env.SUPABASE_SERVICE_ROLE_KEY;

    const listRes = await fetch(`${supabaseUrl}/auth/v1/admin/users?email=${encodeURIComponent(userEmail)}`, {
      headers: {
        'Authorization': `Bearer ${svcKey}`,
        'apikey': svcKey,
      },
    });

    if (!listRes.ok) {
      const errText = await listRes.text();
      return new Response(JSON.stringify({ error: `Error al buscar usuario: ${errText}` }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const users = await listRes.json();
    const user = Array.isArray(users) ? users[0] : users?.users?.[0];

    if (!user || !user.id) {
      return new Response(JSON.stringify({ error: 'Usuario no encontrado' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const updateRes = await fetch(`${supabaseUrl}/auth/v1/admin/users/${user.id}`, {
      method: 'PUT',
      headers: {
        'Authorization': `Bearer ${svcKey}`,
        'apikey': svcKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ password: newPassword }),
    });

    if (!updateRes.ok) {
      const errText = await updateRes.text();
      return new Response(JSON.stringify({ error: `Error al actualizar contraseña: ${errText}` }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    return new Response(JSON.stringify({ success: true, message: 'Contraseña actualizada correctamente' }), {
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}

export async function handleAdminDashboard(request, env) {
  try {
    const [repairs, budgets, printOrders, interviews] = await Promise.all([
      query(env, 'repairs', { order: 'created_at.desc', limit: 5 }, true).catch(() => []),
      query(env, 'budgets', { order: 'created_at.desc', limit: 5 }, true).catch(() => []),
      query(env, 'print_orders', { order: 'created_at.desc', limit: 5 }, true).catch(() => []),
      query(env, 'interview_sessions', { order: 'created_at.desc', limit: 5 }, true).catch(() => []),
    ]);

    const count = (arr) => Array.isArray(arr) ? arr.length : 0;
    const statusCount = (arr, status) => Array.isArray(arr) ? arr.filter(i => i.status === status).length : 0;

    const allRepairs = await query(env, 'repairs', { select: 'status' }, true).catch(() => []);
    const allBudgets = await query(env, 'budgets', { select: 'status' }, true).catch(() => []);
    const allPrint = await query(env, 'print_orders', { select: 'status' }, true).catch(() => []);

    return new Response(JSON.stringify({
      repairs: {
        total: count(allRepairs),
        received: statusCount(allRepairs, 'received'),
        diagnosing: statusCount(allRepairs, 'diagnosing'),
        repairing: statusCount(allRepairs, 'repairing'),
        completed: statusCount(allRepairs, 'completed'),
        cancelled: statusCount(allRepairs, 'cancelled'),
        recent: repairs,
      },
      budgets: {
        total: count(allBudgets),
        pending: statusCount(allBudgets, 'pending'),
        approved: statusCount(allBudgets, 'approved'),
        rejected: statusCount(allBudgets, 'rejected'),
        completed: statusCount(allBudgets, 'completed'),
        recent: budgets,
      },
      printOrders: {
        total: count(allPrint),
        pending: statusCount(allPrint, 'pending'),
        printing: statusCount(allPrint, 'printing'),
        completed: statusCount(allPrint, 'completed'),
        cancelled: statusCount(allPrint, 'cancelled'),
        recent: printOrders,
      },
      interviews: {
        total: count(interviews),
        recent: interviews,
      },
    }), { headers: { 'Content-Type': 'application/json' } });
  } catch (err) {
    return errorResponse(request, 500, err.message);
  }
}

export async function handleAdminGetClientDetail(request, env, id) {
  try {
    const client = await getById(env, 'clients', id, true);
    if (!client) return errorResponse(request, 404, 'Cliente no encontrado');

    const [repairs, budgets, printOrders] = await Promise.all([
      query(env, 'repairs', { eq: { client_id: id }, order: 'created_at.desc' }, true).catch(() => []),
      query(env, 'budgets', { eq: { client_id: id }, order: 'created_at.desc' }, true).catch(() => []),
      query(env, 'print_orders', { eq: { client_id: id }, order: 'created_at.desc' }, true).catch(() => []),
    ]);

    return new Response(JSON.stringify({
      ...client,
      history: {
        repairs: Array.isArray(repairs) ? repairs : [],
        budgets: Array.isArray(budgets) ? budgets : [],
        printOrders: Array.isArray(printOrders) ? printOrders : [],
      },
    }), { headers: { 'Content-Type': 'application/json' } });
  } catch (err) {
    return errorResponse(request, 500, err.message);
  }
}

export async function handleAdminGetNotifications(request, env) {
  try {
    const results = await query(env, 'notifications', { order: 'created_at.desc' }, true);
    const list = Array.isArray(results) ? results : [];

    const enriched = await Promise.all(list.map(async (n) => {
      if (n.client_id) {
        try {
          const client = await getById(env, 'clients', n.client_id, true);
          return { ...n, client_name: client?.name || null };
        } catch {
          return { ...n, client_name: null };
        }
      }
      return { ...n, client_name: null };
    }));

    return new Response(JSON.stringify(enriched), {
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err) {
    return errorResponse(request, 500, err.message);
  }
}

export async function handleAdminGetEvents(request, env) {
  try {
    const results = await query(env, 'events', { order: 'created_at.desc' }, true);
    const list = Array.isArray(results) ? results : [];
    return new Response(JSON.stringify(list), {
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err) {
    return errorResponse(request, 500, err.message);
  }
}

export async function handleAdminGetDlq(request, env) {
  try {
    const results = await query(env, 'event_dlq', {
      eq: { status: 'failed' },
      order: 'failed_at.desc',
    }, true);
    const list = Array.isArray(results) ? results : [];
    return new Response(JSON.stringify(list), {
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err) {
    return errorResponse(request, 500, err.message);
  }
}

export async function handleAdminReplayDlq(request, env, dlqId) {
  try {
    const repo = new EventRepository({
      insertFn: (table, data) => insert(env, table, data, true),
      queryFn: (table, opts) => query(env, table, opts, true),
      updateFn: (table, id, data) => update(env, table, id, data, true),
    });
    const queue = new EventQueue({ eventRepository: repo });

    const dlqEntry = await queue.getDlqById(dlqId);
    if (!dlqEntry) {
      return errorResponse(request, 404, 'Entrada no encontrada en DLQ');
    }

    const result = await queue.replayFromDlq(dlqEntry);
    return new Response(JSON.stringify({ success: true, replayed: result }), {
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err) {
    return errorResponse(request, 500, err.message);
  }
}

export async function handleAdminReplayAllDlq(request, env) {
  try {
    const repo = new EventRepository({
      insertFn: (table, data) => insert(env, table, data, true),
      queryFn: (table, opts) => query(env, table, opts, true),
      updateFn: (table, id, data) => update(env, table, id, data, true),
    });
    const queue = new EventQueue({ eventRepository: repo });

    const dlqEntries = await queue.getDlq();
    const results = [];
    for (const entry of dlqEntries) {
      try {
        const result = await queue.replayFromDlq(entry);
        results.push({ dlqId: entry.id, success: true, replayed: result });
      } catch (err) {
        results.push({ dlqId: entry.id, success: false, error: err.message });
      }
    }
    return new Response(JSON.stringify({ success: true, total: results.length, results }), {
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err) {
    return errorResponse(request, 500, err.message);
  }
}

async function logActivity(env, userId, action, entity, entityId, details) {
  if (!userId) return;
  try {
    await insert(env, 'admin_activity_log', {
      id: crypto.randomUUID(),
      user_id: userId,
      action,
      entity,
      entity_id: entityId,
      details: JSON.stringify(details),
    }, true);
  } catch {
    // fail silently
  }
}

function sanitizeObject(obj) {
  if (typeof obj !== 'object' || obj === null) return obj;
  const result = {};
  for (const [key, value] of Object.entries(obj)) {
    if (key === 'id' || key === 'created_at' || key === 'updated_at') continue;
    if (value === null || value === undefined || value === '') continue;
    if (typeof value === 'string') {
      result[key] = sanitize(value);
    } else {
      result[key] = value;
    }
  }
  return result;
}
