import { adminGetAll } from '../../api.js';

export default async function renderNotifications(container) {
  container.innerHTML = `
    <div style="display:flex;gap:12px;margin-bottom:16px;flex-wrap:wrap;align-items:center">
      <div style="flex:1;min-width:200px">
        <span style="font-size:0.85rem;font-weight:600;margin-right:8px;color:#64748b">Filtrar:</span>
        <select id="notificationStatusFilter" style="padding:6px 10px;border:1px solid #e2e8f0;border-radius:6px;font-size:0.85rem">
          <option value="">Todos</option>
          <option value="pending">Pendientes</option>
          <option value="sent">Enviadas</option>
          <option value="failed">Fallidas</option>
        </select>
      </div>
    </div>
    <div id="notificationsTable"><p class="text-muted">Cargando notificaciones...</p></div>
    <style>
      .notification-table { width:100%; border-collapse:collapse; font-size:0.85rem; }
      .notification-table th { text-align:left; padding:10px 12px; border-bottom:2px solid #e2e8f0; font-weight:600; color:#64748b; font-size:0.7rem; text-transform:uppercase; }
      .notification-table td { padding:10px 12px; border-bottom:1px solid #f1f5f9; }
      .notification-table tr:hover { background:#f8fafc; }
      .text-muted { color:#94a3b8; }
      .notif-status { display:inline-block; padding:2px 8px; border-radius:10px; font-size:0.7rem; font-weight:600; }
      .notif-status.pending { background:#fef3c7; color:#92400e; }
      .notif-status.sent { background:#dcfce7; color:#166534; }
      .notif-status.failed { background:#fee2e2; color:#991b1b; }
    </style>
  `;

  let data = [];

  async function loadData() {
    try {
      data = await adminGetAll('notifications');
      renderTable();
    } catch (err) {
      document.getElementById('notificationsTable').innerHTML = `<div class="empty-state">Error: ${err.message}</div>`;
    }
  }

  function renderTable() {
    const filter = document.getElementById('notificationStatusFilter').value;
    let filtered = data.filter(item => {
      if (filter && item.status !== filter) return false;
      return true;
    });

    const el = document.getElementById('notificationsTable');
    if (filtered.length === 0) {
      el.innerHTML = '<div class="empty-state">No hay notificaciones</div>';
      return;
    }

    el.innerHTML = `
      <div class="table-container"><table class="notification-table">
        <thead><tr>
          <th>Cliente</th>
          <th>Tipo</th>
          <th>Mensaje</th>
          <th>Canal</th>
          <th>Estado</th>
          <th>Fecha</th>
        </tr></thead>
        <tbody>${filtered.map(item => `
          <tr>
            <td>${esc(item.client_name || item.client_id || '-')}</td>
            <td><strong>${esc(item.type)}</strong></td>
            <td style="max-width:300px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc(item.message)}</td>
            <td>${esc(item.channel)}</td>
            <td><span class="notif-status ${item.status}">${item.status}</span></td>
            <td>${item.created_at ? new Date(item.created_at).toLocaleDateString('es-AR', { day:'2-digit', month:'2-digit', year:'numeric', hour:'2-digit', minute:'2-digit' }) : '-'}</td>
          </tr>
        `).join('')}</tbody>
      </table></div>
    `;
  }

  document.getElementById('notificationStatusFilter').addEventListener('change', renderTable);
  await loadData();
}

function esc(s) {
  const d = document.createElement('div');
  d.textContent = s || '';
  return d.innerHTML;
}
