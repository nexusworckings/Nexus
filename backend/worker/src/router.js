import { handlePublicGet } from './handlers/public.js';
import {
  handleAdminGetAll,
  handleAdminGetOne,
  handleAdminCreate,
  handleAdminUpdate,
  handleAdminDelete,
  handleAdminDashboard,
  handleAdminGetClientDetail,
  handleAdminGetNotifications,
  handleAdminGetEvents,
  handleAdminGetDlq,
  handleAdminReplayDlq,
  handleAdminReplayAllDlq,
} from './handlers/admin.js';
import { handleUpdatePassword } from './handlers/admin.js';
import { handleAdminList } from './handlers/admin-list.js';
import { handleAdminUpdateStatus } from './handlers/admin-status.js';
import { handleAdminAiAction, handleAdminConversations, handleAdminAiSuggestions } from './handlers/admin-ai.js';
import { handleWebhookGet, handleWebhookPost } from './handlers/whatsapp-webhook.js';
import { handleChat, handleHealth } from './handlers/chat.js';
import { requireAdmin } from './middleware/auth.js';
import { handleOptions, getCorsHeaders } from './middleware/cors.js';
import { errorResponse, handleError } from './middleware/error.js';
import { createInterviewHandler } from './api/interview/v2/routes.js';

const PUBLIC_PREFIX = '/api/public/';
const ADMIN_PREFIX = '/api/admin/';
const CHAT_PATH = '/chat';
const HEALTH_PATH = '/health';

export async function handleRequest(request, env) {
  try {
    const options = handleOptions(request);
    if (options) return options;

    const url = new URL(request.url);
    const path = url.pathname;

    const corsHeaders = getCorsHeaders(request);

    if (path === '/api/admin/update-password' && request.method === 'POST') {
      const auth = await requireAdmin(request, env);
      if (!auth.authenticated) {
        return errorResponse(request, auth.status, auth.error);
      }
      const response = await handleUpdatePassword(request, env, auth);
      return addCors(response, corsHeaders);
    }

    if (path === '/api/admin/ai-action' && request.method === 'POST') {
      const auth = await requireAdmin(request, env);
      if (!auth.authenticated) {
        return errorResponse(request, auth.status, auth.error);
      }
      const response = await handleAdminAiAction(request, env);
      return addCors(response, corsHeaders);
    }

    if (path === '/api/admin/conversations' && (request.method === 'GET' || request.method === 'POST')) {
      const auth = await requireAdmin(request, env);
      if (!auth.authenticated) {
        return errorResponse(request, auth.status, auth.error);
      }
      const response = await handleAdminConversations(request, env);
      return addCors(response, corsHeaders);
    }

    if (path === '/api/admin/ai-suggestions' && request.method === 'POST') {
      const auth = await requireAdmin(request, env);
      if (!auth.authenticated) {
        return errorResponse(request, auth.status, auth.error);
      }
      const response = await handleAdminAiSuggestions(request, env);
      return addCors(response, corsHeaders);
    }

    if (path === '/api/admin/whatsapp/metrics' && request.method === 'GET') {
      const auth = await requireAdmin(request, env);
      if (!auth.authenticated) {
        return errorResponse(request, auth.status, auth.error);
      }
      const response = await handleAdminAiAction(request, env);
      return addCors(response, corsHeaders);
    }

    if (path === '/whatsapp/webhook' && request.method === 'GET') {
      const response = await handleWebhookGet(request, env);
      return addCors(response, corsHeaders);
    }

    if (path === '/whatsapp/webhook' && request.method === 'POST') {
      const response = await handleWebhookPost(request, env);
      return addCors(response, corsHeaders);
    }

    if (path === '/api/admin/upload' && request.method === 'POST') {
      const auth = await requireAdmin(request, env);
      if (!auth.authenticated) {
        return errorResponse(request, auth.status, auth.error);
      }
      try {
        const formData = await request.formData();
        const file = formData.get('file');
        if (!file) {
          const errResp = errorResponse(request, 400, 'Falta el archivo');
          return addCors(errResp, corsHeaders);
        }
        const ext = file.name.split('.').pop() || 'png';
        const fileName = `uploads/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
        const svcKey = env.SUPABASE_SERVICE_ROLE_KEY;
        const base = env.SUPABASE_URL;
        const buffer = await file.arrayBuffer();
        const uploadRes = await fetch(`${base}/storage/v1/object/images/${fileName}`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${svcKey}`,
            'apikey': svcKey,
            'Content-Type': file.type,
            'x-upsert': 'true',
          },
          body: buffer,
        });
        if (!uploadRes.ok) {
          const errText = await uploadRes.text();
          const errResp = errorResponse(request, 500, `Error al subir: ${errText}`);
          return addCors(errResp, corsHeaders);
        }
        const publicUrl = `${base}/storage/v1/object/public/images/${fileName}`;
        const uploadResp = new Response(JSON.stringify({ url: publicUrl }), {
          headers: { 'Content-Type': 'application/json' },
        });
        return addCors(uploadResp, corsHeaders);
      } catch (err) {
        const errResp = errorResponse(request, 500, err.message);
        return addCors(errResp, corsHeaders);
      }
    }

    if (path === HEALTH_PATH) {
      const response = await handleHealth(env);
      return addCors(response, corsHeaders);
    }

    if (path === CHAT_PATH) {
      const response = await handleChat(request, env);
      return addCors(response, corsHeaders);
    }

    if (path.startsWith(PUBLIC_PREFIX)) {
      const resource = path.slice(PUBLIC_PREFIX.length);
      const response = await handlePublicGet(request, env, resource);
      return addCors(response, corsHeaders);
    }

    const INTERVIEW_PREFIX = '/api/interview/v2/';
    if (path.startsWith(INTERVIEW_PREFIX)) {
      const remainder = path.slice(INTERVIEW_PREFIX.length);
      const handleInterviewV2 = createInterviewHandler(env);
      const response = await handleInterviewV2(request, env, remainder);
      return addCors(response, corsHeaders);
    }

    if (path.startsWith(ADMIN_PREFIX)) {
      const auth = await requireAdmin(request, env);
      if (!auth.authenticated) {
        return errorResponse(request, auth.status, auth.error);
      }

      const remaining = path.slice(ADMIN_PREFIX.length);
      const parts = remaining.split('/');
      const resource = parts[0];
      const id = parts[1];

      if (path === '/api/admin/dashboard' && request.method === 'GET') {
        const response = await handleAdminDashboard(request, env, auth);
        return addCors(response, corsHeaders);
      }

      if (path === '/api/admin/events/dlq/replay-all' && request.method === 'POST') {
        const response = await handleAdminReplayAllDlq(request, env);
        return addCors(response, corsHeaders);
      }

      if (resource === 'events' && id === 'dlq' && request.method === 'GET') {
        const response = await handleAdminGetDlq(request, env);
        return addCors(response, corsHeaders);
      }

      if (resource === 'events' && parts[2] === 'dlq' && parts[3] === 'replay' && parts[4] && request.method === 'POST') {
        const response = await handleAdminReplayDlq(request, env, parts[4]);
        return addCors(response, corsHeaders);
      }

      if (request.method === 'GET' && !id && ['repairs', 'budgets', 'print-orders', 'clients'].includes(resource)) {
        const response = await handleAdminList(request, env, resource);
        return addCors(response, corsHeaders);
      }
      if (request.method === 'GET' && !id) {
        const response = await handleAdminGetAll(request, env, resource);
        return addCors(response, corsHeaders);
      }
      if (request.method === 'GET' && resource === 'notifications') {
        const response = await handleAdminGetNotifications(request, env);
        return addCors(response, corsHeaders);
      }
      if (request.method === 'GET' && resource === 'events') {
        const response = await handleAdminGetEvents(request, env);
        return addCors(response, corsHeaders);
      }
      if (request.method === 'GET' && id && resource === 'clients') {
        const response = await handleAdminGetClientDetail(request, env, id);
        return addCors(response, corsHeaders);
      }
      if (request.method === 'GET' && id) {
        const response = await handleAdminGetOne(request, env, resource, id);
        return addCors(response, corsHeaders);
      }
      if (request.method === 'POST' && !id) {
        const response = await handleAdminCreate(request, env, resource);
        return addCors(response, corsHeaders);
      }
      if (request.method === 'PATCH' && id && parts[2] === 'status'
        && ['repairs', 'budgets', 'print-orders'].includes(resource)) {
        const response = await handleAdminUpdateStatus(request, env, resource, id);
        return addCors(response, corsHeaders);
      }
      if (request.method === 'PUT' && id) {
        const response = await handleAdminUpdate(request, env, resource, id, auth);
        return addCors(response, corsHeaders);
      }
      if (request.method === 'DELETE' && id) {
        const response = await handleAdminDelete(request, env, resource, id);
        return addCors(response, corsHeaders);
      }

      return errorResponse(request, 405, 'Método no permitido');
    }

    return errorResponse(request, 404, 'Endpoint no encontrado');
  } catch (err) {
    return handleError(request, err);
  }
}

function addCors(response, corsHeaders) {
  const newHeaders = new Headers(response.headers);
  for (const [key, value] of Object.entries(corsHeaders)) {
    newHeaders.set(key, value);
  }
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers: newHeaders,
  });
}
