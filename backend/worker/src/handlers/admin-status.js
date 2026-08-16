import { getById, update } from '../services/supabase.js';
import { errorResponse } from '../middleware/error.js';

const VALID_STATUSES = {
  'repairs': ['received', 'diagnosing', 'repairing', 'completed', 'cancelled'],
  'budgets': ['pending', 'approved', 'rejected', 'completed'],
  'print-orders': ['pending', 'printing', 'completed', 'cancelled'],
};

const TABLES = {
  'repairs': 'repairs',
  'budgets': 'budgets',
  'print-orders': 'print_orders',
};

export async function handleAdminUpdateStatus(request, env, resource, id) {
  const table = TABLES[resource];
  if (!table) return errorResponse(request, 404, 'Recurso no encontrado');

  const allowed = VALID_STATUSES[resource];
  if (!allowed) return errorResponse(request, 404, 'Recurso no encontrado');

  let body;
  try {
    body = await request.json();
  } catch {
    return errorResponse(request, 400, 'Body inválido: se esperaba JSON');
  }

  if (!body || typeof body.status !== 'string' || body.status.trim() === '') {
    return errorResponse(request, 400, 'El campo "status" es requerido y debe ser una cadena no vacía');
  }

  const newStatus = body.status.trim();
  if (!allowed.includes(newStatus)) {
    return errorResponse(request, 400, `Estado inválido: "${newStatus}". Estados permitidos: ${allowed.join(', ')}`);
  }

  try {
    const current = await getById(env, table, id, true);
    if (!current) return errorResponse(request, 404, 'Registro no encontrado');

    if (current.status === newStatus) {
      return new Response(JSON.stringify(current), {
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const result = await update(env, table, id, { status: newStatus }, true);
    if (!result) return errorResponse(request, 404, 'Registro no encontrado');

    return new Response(JSON.stringify(result), {
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err) {
    return errorResponse(request, 500, err.message);
  }
}
