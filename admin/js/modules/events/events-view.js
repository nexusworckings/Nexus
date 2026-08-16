import { adminGetAll, getDlq, replayDlq, replayAllDlq } from '../../api.js';

export default async function renderEvents(container) {
  container.innerHTML = `
    <div style="display:flex;gap:12px;margin-bottom:16px;flex-wrap:wrap;align-items:center">
      <div style="flex:1;min-width:200px">
        <span style="font-size:0.85rem;font-weight:600;margin-right:8px;color:#64748b">Filtrar:</span>
        <select id="eventStatusFilter" style="padding:6px 10px;border:1px solid #e2e8f0;border-radius:6px;font-size:0.85rem">
          <option value="">Todos</option>
          <option value="pending">Pendientes</option>
          <option value="processing">Procesando</option>
          <option value="completed">Completados</option>
          <option value="failed">Fallidos</option>
        </select>
      </div>
      <div style="display:flex;gap:8px">
        <button id="showEventsTab" class="tab-btn active" style="padding:6px 14px;border:1px solid #e2e8f0;border-radius:6px;background:#fff;cursor:pointer;font-size:0.85rem">Eventos</button>
        <button id="showDlqTab" class="tab-btn" style="padding:6px 14px;border:1px solid #e2e8f0;border-radius:6px;background:#fff;cursor:pointer;font-size:0.85rem">DLQ (Fallos)</button>
      </div>
    </div>
    <div id="eventsContent"><p class="text-muted">Cargando eventos...</p></div>
    <style>
      .ev-table { width:100%; border-collapse:collapse; font-size:0.85rem; }
      .ev-table th { text-align:left; padding:10px 12px; border-bottom:2px solid #e2e8f0; font-weight:600; color:#64748b; font-size:0.7rem; text-transform:uppercase; }
      .ev-table td { padding:10px 12px; border-bottom:1px solid #f1f5f9; }
      .ev-table tr:hover { background:#f8fafc; }
      .text-muted { color:#94a3b8; }
      .ev-status { display:inline-block; padding:2px 8px; border-radius:10px; font-size:0.7rem; font-weight:600; }
      .ev-status.pending { background:#fef3c7; color:#92400e; }
      .ev-status.processing { background:#dbeafe; color:#1e40af; }
      .ev-status.completed { background:#dcfce7; color:#166534; }
      .ev-status.failed { background:#fee2e2; color:#991b1b; }
      .ev-status.replayed { background:#e0e7ff; color:#3730a3; }
      .tab-btn.active { background:#1e40af; color:#fff; border-color:#1e40af; }
      .btn-retry { padding:4px 10px; border:none; border-radius:4px; background:#f59e0b; color:#fff; cursor:pointer; font-size:0.75rem; }
      .btn-retry:hover { background:#d97706; }
      .btn-retry-all { padding:6px 14px; border:none; border-radius:6px; background:#dc2626; color:#fff; cursor:pointer; font-size:0.8rem; }
      .btn-retry-all:hover { background:#b91c1c; }
      .dlq-badge { display:inline-block; padding:2px 8px; border-radius:10px; font-size:0.65rem; font-weight:600; background:#fef3c7; color:#92400e; margin-left:6px; }
    </style>
  `;

  let eventData = [];
  let dlqData = [];

  function esc(s) {
    const d = document.createElement('div');
    d.textContent = s || '';
    return d.innerHTML;
  }

  async function loadEvents() {
    try {
      eventData = await adminGetAll('events');
      renderEventsTab();
    } catch (err) {
      document.getElementById('eventsContent').innerHTML = `<div class="empty-state">Error: ${err.message}</div>`;
    }
  }

  async function loadDlq() {
    try {
      dlqData = await getDlq();
      renderDlqTab();
    } catch (err) {
      document.getElementById('eventsContent').innerHTML = `<div class="empty-state">Error: ${err.message}</div>`;
    }
  }

  function renderEventsTab() {
    const filter = document.getElementById('eventStatusFilter').value;
    let filtered = eventData.filter(item => {
      if (filter && item.status !== filter) return false;
      return true;
    });

    const el = document.getElementById('eventsContent');
    if (filtered.length === 0) {
      el.innerHTML = '<div class="empty-state">No hay eventos</div>';
      return;
    }

    el.innerHTML = `
      <div class="table-container"><table class="ev-table">
        <thead><tr>
          <th>Tipo</th>
          <th>Estado</th>
          <th>Intentos</th>
          <th>Entidad</th>
          <th>Error</th>
          <th>Fecha</th>
        </tr></thead>
        <tbody>${filtered.map(item => `
          <tr>
            <td><strong>${esc(item.type)}</strong></td>
            <td><span class="ev-status ${item.status}">${item.status}</span></td>
            <td>${item.attempts || 0}</td>
            <td style="font-size:0.75rem">${esc((item.entity_id || '').substring(0, 12))}...</td>
            <td style="max-width:200px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;color:#991b1b">${esc(item.error_message || '-')}</td>
            <td>${item.created_at ? new Date(item.created_at).toLocaleDateString('es-AR', { day:'2-digit', month:'2-digit', year:'numeric', hour:'2-digit', minute:'2-digit' }) : '-'}</td>
          </tr>
        `).join('')}</tbody>
      </table></div>
    `;
  }

  function renderDlqTab() {
    const el = document.getElementById('eventsContent');
    if (dlqData.length === 0) {
      el.innerHTML = '<div class="empty-state">No hay eventos fallidos en DLQ</div>';
      return;
    }

    el.innerHTML = `
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px">
        <span style="font-size:0.85rem;color:#64748b"><strong>${dlqData.length}</strong> evento(s) fallido(s)</span>
        <button class="btn-retry-all" id="retryAllBtn">Reintentar Todos</button>
      </div>
      <div class="table-container"><table class="ev-table">
        <thead><tr>
          <th>Tipo</th>
          <th>Estado</th>
          <th>Intentos</th>
          <th>Error</th>
          <th>Falló</th>
          <th>Acción</th>
        </tr></thead>
        <tbody>${dlqData.map(item => `
          <tr>
            <td><strong>${esc(item.type)}</strong></td>
            <td><span class="ev-status ${item.status}">${item.status}</span></td>
            <td>${item.attempts || 0}</td>
            <td style="max-width:250px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;color:#991b1b" title="${esc(item.error_message || '')}">${esc(item.error_message || '-')}</td>
            <td>${item.failed_at ? new Date(item.failed_at).toLocaleDateString('es-AR', { day:'2-digit', month:'2-digit', year:'numeric', hour:'2-digit', minute:'2-digit' }) : '-'}</td>
            <td><button class="btn-retry" data-dlq-id="${item.id}">Reintentar</button></td>
          </tr>
        `).join('')}</tbody>
      </table></div>
    `;

    el.querySelectorAll('.btn-retry').forEach(btn => {
      btn.addEventListener('click', async () => {
        const dlqId = btn.dataset.dlqId;
        btn.disabled = true;
        btn.textContent = 'Reintentando...';
        try {
          await replayDlq(dlqId);
          btn.textContent = 'Re-enviado';
          btn.style.background = '#22c55e';
          await loadDlq();
        } catch (err) {
          btn.textContent = 'Error';
          btn.style.background = '#ef4444';
        }
      });
    });

    const retryAllBtn = el.querySelector('#retryAllBtn');
    if (retryAllBtn) {
      retryAllBtn.addEventListener('click', async () => {
        retryAllBtn.disabled = true;
        retryAllBtn.textContent = 'Reintentando todos...';
        try {
          const result = await replayAllDlq();
          retryAllBtn.textContent = `OK: ${result.total} re-enviados`;
          retryAllBtn.style.background = '#22c55e';
          await loadDlq();
        } catch (err) {
          retryAllBtn.textContent = 'Error';
          retryAllBtn.style.background = '#ef4444';
        }
      });
    }
  }

  document.getElementById('eventStatusFilter').addEventListener('change', renderEventsTab);

  document.getElementById('showEventsTab').addEventListener('click', () => {
    document.getElementById('showEventsTab').classList.add('active');
    document.getElementById('showDlqTab').classList.remove('active');
    renderEventsTab();
  });

  document.getElementById('showDlqTab').addEventListener('click', () => {
    document.getElementById('showDlqTab').classList.add('active');
    document.getElementById('showEventsTab').classList.remove('active');
    loadDlq();
  });

  await loadEvents();
}