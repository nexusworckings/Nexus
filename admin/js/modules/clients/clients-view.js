import { adminGetAll, adminGetOne } from '../../api.js';
import { Modal } from '../../components/Modal.js';

export default async function renderClients(container) {
  container.innerHTML = `
    <div style="display:flex;gap:12px;margin-bottom:16px;flex-wrap:wrap;align-items:end">
      <div class="search-box" style="flex:1;min-width:200px">
        <label style="font-size:0.7rem;color:#64748b;text-transform:uppercase;font-weight:600">Buscar</label>
        <input type="text" id="clientSearch" placeholder="Nombre, teléfono, email..." style="width:100%;margin-top:4px" />
      </div>
      <div>
        <label style="font-size:0.7rem;color:#64748b;text-transform:uppercase;font-weight:600">Desde</label>
        <input type="date" id="clientFrom" style="display:block;margin-top:4px;padding:8px;border:1px solid #e2e8f0;border-radius:8px;font-size:0.9rem" />
      </div>
      <div>
        <label style="font-size:0.7rem;color:#64748b;text-transform:uppercase;font-weight:600">Hasta</label>
        <input type="date" id="clientTo" style="display:block;margin-top:4px;padding:8px;border:1px solid #e2e8f0;border-radius:8px;font-size:0.9rem" />
      </div>
      <div>
        <label style="font-size:0.7rem;color:#64748b;text-transform:uppercase;font-weight:600">Orden</label>
        <select id="clientSort" style="display:block;margin-top:4px;padding:8px 12px;border:1px solid #e2e8f0;border-radius:8px;font-size:0.9rem">
          <option value="created_at">Fecha de registro</option>
          <option value="name">Nombre</option>
          <option value="phone">Teléfono</option>
        </select>
      </div>
      <div>
        <label style="font-size:0.7rem;color:#64748b;text-transform:uppercase;font-weight:600">Dirección</label>
        <button id="clientSortDir" style="display:block;margin-top:4px;padding:8px 12px;border:1px solid #e2e8f0;border-radius:8px;font-size:0.9rem;cursor:pointer;background:#fff">↓ Desc</button>
      </div>
    </div>
    <div id="clientsTable"><p class="text-muted">Cargando clientes...</p></div>
    <style>
      .client-table { width:100%; border-collapse:collapse; font-size:0.85rem; }
      .client-table th { text-align:left; padding:10px 12px; border-bottom:2px solid #e2e8f0; font-weight:600; color:#64748b; font-size:0.7rem; text-transform:uppercase; cursor:pointer; user-select:none; }
      .client-table th:hover { color:#1e293b; }
      .client-table th .sort-arrow { margin-left:4px; opacity:0.5; }
      .client-table th.sorted .sort-arrow { opacity:1; }
      .client-table td { padding:10px 12px; border-bottom:1px solid #f1f5f9; }
      .client-table tr { cursor:pointer; }
      .client-table tr:hover { background:#f8fafc; }
      .text-muted { color:#94a3b8; }
      .detail-field { margin:6px 0; font-size:0.9rem; }
      .detail-field strong { display:inline-block; min-width:120px; color:#64748b; }
      .detail-section { margin:16px 0; }
      .detail-section h4 { font-size:0.8rem; font-weight:600; color:#64748b; text-transform:uppercase; letter-spacing:0.5px; margin:0 0 8px; padding-bottom:4px; border-bottom:1px solid #e2e8f0; }
      .history-table { width:100%; border-collapse:collapse; font-size:0.8rem; }
      .history-table th { text-align:left; padding:6px 8px; border-bottom:1px solid #e2e8f0; font-weight:600; color:#64748b; font-size:0.65rem; text-transform:uppercase; }
      .history-table td { padding:6px 8px; border-bottom:1px solid #f1f5f9; }
      .status-badge { display:inline-block; padding:2px 8px; border-radius:10px; font-size:0.7rem; font-weight:600; }
      .status-badge.received,.status-badge.pending { background:#fef3c7; color:#92400e; }
      .status-badge.diagnosing { background:#dbeafe; color:#1e40af; }
      .status-badge.repairing,.status-badge.printing { background:#e0e7ff; color:#3730a3; }
      .status-badge.completed,.status-badge.approved { background:#dcfce7; color:#166534; }
      .status-badge.cancelled,.status-badge.rejected { background:#fee2e2; color:#991b1b; }
    </style>
  `;

  let currentSort = 'created_at';
  let currentOrder = 'desc';
  const modal = new Modal();

  function getParams() {
    return {
      search: document.getElementById('clientSearch').value || '',
      from: document.getElementById('clientFrom').value || '',
      to: document.getElementById('clientTo').value || '',
      sort: currentSort,
      order: currentOrder,
    };
  }

  async function loadData() {
    try {
      const result = await adminGetAll('clients', getParams());
      const data = Array.isArray(result) ? result : (result.items || []);
      renderTable(data);
    } catch (err) {
      document.getElementById('clientsTable').innerHTML = `<div class="empty-state">Error: ${err.message}</div>`;
    }
  }

  function renderTable(data) {
    const el = document.getElementById('clientsTable');

    if (data.length === 0) {
      el.innerHTML = '<div class="empty-state">No hay clientes registrados</div>';
      return;
    }

    const sortArrow = (field) => field === currentSort ? (currentOrder === 'asc' ? ' ↑' : ' ↓') : ' ↕';
    const sortedClass = (field) => field === currentSort ? ' class="sorted"' : '';

    el.innerHTML = `
      <div class="table-container"><table class="client-table">
        <thead><tr>
          <th${sortedClass('name')} data-sort="name">Nombre<span class="sort-arrow">${sortArrow('name')}</span></th>
          <th${sortedClass('phone')} data-sort="phone">Teléfono<span class="sort-arrow">${sortArrow('phone')}</span></th>
          <th>Trabajos</th>
          <th${sortedClass('created_at')} data-sort="created_at">Registro<span class="sort-arrow">${sortArrow('created_at')}</span></th>
        </tr></thead>
        <tbody>${data.map(item => `
          <tr data-id="${item.id}">
            <td><strong>${esc(item.name)}</strong></td>
            <td>${esc(item.phone || '-')}</td>
            <td>${item.total_jobs || '-'}</td>
            <td>${item.created_at ? new Date(item.created_at).toLocaleDateString('es-AR') : '-'}</td>
          </tr>
        `).join('')}</tbody>
      </table></div>
    `;

    el.querySelectorAll('th[data-sort]').forEach(th => {
      th.addEventListener('click', () => {
        const field = th.dataset.sort;
        if (currentSort === field) {
          currentOrder = currentOrder === 'asc' ? 'desc' : 'asc';
        } else {
          currentSort = field;
          currentOrder = 'asc';
        }
        loadData();
      });
    });

    el.querySelectorAll('tbody tr').forEach(row => {
      row.addEventListener('click', () => showClientDetail(row.dataset.id));
    });
  }

  async function showClientDetail(id) {
    modal.show({ title: 'Cargando...', body: '<p>Cargando datos del cliente...</p>', footer: '<button class="btn btn-outline" id="closeDetail">Cerrar</button>' });

    try {
      const client = await adminGetOne('clients', id);

      const repairs = client.history?.repairs || [];
      const budgets = client.history?.budgets || [];
      const printOrders = client.history?.printOrders || [];

      modal.show({
        title: esc(client.name),
        body: `
          <div class="detail-field"><strong>Nombre:</strong> ${esc(client.name)}</div>
          <div class="detail-field"><strong>Teléfono:</strong> ${esc(client.phone || '-')}</div>
          <div class="detail-field"><strong>Email:</strong> ${esc(client.email || '-')}</div>
          <div class="detail-field"><strong>Notas:</strong> ${esc(client.notes || '-')}</div>
          <div class="detail-field"><strong>Registro:</strong> ${client.created_at ? new Date(client.created_at).toLocaleDateString('es-AR') : '-'}</div>

          <div class="detail-section">
            <h4>Reparaciones (${repairs.length})</h4>
            ${repairs.length === 0 ? '<p class="text-muted">Sin reparaciones</p>' : `
              <table class="history-table">
                <thead><tr><th>Dispositivo</th><th>Estado</th><th>Fecha</th></tr></thead>
                <tbody>${repairs.map(r => `
                  <tr>
                    <td>${esc(r.device || '')}</td>
                    <td><span class="status-badge ${r.status}">${r.status}</span></td>
                    <td>${r.created_at ? new Date(r.created_at).toLocaleDateString('es-AR') : '-'}</td>
                  </tr>
                `).join('')}</tbody>
              </table>
            `}
          </div>

          <div class="detail-section">
            <h4>Presupuestos (${budgets.length})</h4>
            ${budgets.length === 0 ? '<p class="text-muted">Sin presupuestos</p>' : `
              <table class="history-table">
                <thead><tr><th>Descripción</th><th>Estado</th><th>Fecha</th></tr></thead>
                <tbody>${budgets.map(b => `
                  <tr>
                    <td>${esc(b.description || b.service_type || '')}</td>
                    <td><span class="status-badge ${b.status}">${b.status}</span></td>
                    <td>${b.created_at ? new Date(b.created_at).toLocaleDateString('es-AR') : '-'}</td>
                  </tr>
                `).join('')}</tbody>
              </table>
            `}
          </div>

          <div class="detail-section">
            <h4>Pedidos 3D (${printOrders.length})</h4>
            ${printOrders.length === 0 ? '<p class="text-muted">Sin pedidos 3D</p>' : `
              <table class="history-table">
                <thead><tr><th>Modelo</th><th>Estado</th><th>Fecha</th></tr></thead>
                <tbody>${printOrders.map(p => `
                  <tr>
                    <td>${esc((p.object_description || p.description || '').substring(0, 40))}</td>
                    <td><span class="status-badge ${p.status}">${p.status}</span></td>
                    <td>${p.created_at ? new Date(p.created_at).toLocaleDateString('es-AR') : '-'}</td>
                  </tr>
                `).join('')}</tbody>
              </table>
            `}
          </div>
        `,
        footer: '<button class="btn btn-outline" id="closeDetail">Cerrar</button>',
      });
    } catch (err) {
      modal.show({ title: 'Error', body: `<p>Error al cargar cliente: ${err.message}</p>`, footer: '<button class="btn btn-outline" id="closeDetail">Cerrar</button>' });
    }

    setTimeout(() => {
      const btn = document.getElementById('closeDetail');
      if (btn) btn.addEventListener('click', () => modal.hide());
    }, 50);
  }

  let debounceTimer;
  const debounce = (fn, ms = 300) => (...args) => { clearTimeout(debounceTimer); debounceTimer = setTimeout(() => fn(...args), ms); };

  const debouncedLoad = debounce(loadData);
  document.getElementById('clientSearch').addEventListener('input', debouncedLoad);
  document.getElementById('clientFrom').addEventListener('change', loadData);
  document.getElementById('clientTo').addEventListener('change', loadData);
  document.getElementById('clientSort').addEventListener('change', (e) => { currentSort = e.target.value; loadData(); });
  document.getElementById('clientSortDir').addEventListener('click', () => {
    currentOrder = currentOrder === 'asc' ? 'desc' : 'asc';
    document.getElementById('clientSortDir').textContent = currentOrder === 'asc' ? '↑ Asc' : '↓ Desc';
    loadData();
  });

  await loadData();
}

function esc(s) {
  const d = document.createElement('div');
  d.textContent = s || '';
  return d.innerHTML;
}
