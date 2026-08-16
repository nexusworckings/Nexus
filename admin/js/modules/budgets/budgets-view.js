import { adminGetAll, adminGetOne, updateStatus } from '../../api.js';
import { Modal } from '../../components/Modal.js';

const STATUS_FLOW = ['pending', 'approved', 'rejected', 'completed'];
const STATUS_LABELS = { pending: 'Pendiente', approved: 'Aprobado', rejected: 'Rechazado', completed: 'Completado' };

export default async function renderBudgets(container) {
  container.innerHTML = `
    <div style="display:flex;gap:12px;margin-bottom:16px;flex-wrap:wrap;align-items:end">
      <div class="search-box" style="flex:1;min-width:200px">
        <label style="font-size:0.7rem;color:#64748b;text-transform:uppercase;font-weight:600">Buscar</label>
        <input type="text" id="budgetSearch" placeholder="Servicio, descripción, cliente..." style="width:100%;margin-top:4px" />
      </div>
      <div>
        <label style="font-size:0.7rem;color:#64748b;text-transform:uppercase;font-weight:600">Estado</label>
        <select id="budgetStatusFilter" style="display:block;margin-top:4px;padding:8px 12px;border:1px solid #e2e8f0;border-radius:8px;font-size:0.9rem">
          <option value="">Todos los estados</option>
          ${STATUS_FLOW.map(s => `<option value="${s}">${STATUS_LABELS[s]}</option>`).join('')}
        </select>
      </div>
      <div>
        <label style="font-size:0.7rem;color:#64748b;text-transform:uppercase;font-weight:600">Desde</label>
        <input type="date" id="budgetFrom" style="display:block;margin-top:4px;padding:8px;border:1px solid #e2e8f0;border-radius:8px;font-size:0.9rem" />
      </div>
      <div>
        <label style="font-size:0.7rem;color:#64748b;text-transform:uppercase;font-weight:600">Hasta</label>
        <input type="date" id="budgetTo" style="display:block;margin-top:4px;padding:8px;border:1px solid #e2e8f0;border-radius:8px;font-size:0.9rem" />
      </div>
      <div>
        <label style="font-size:0.7rem;color:#64748b;text-transform:uppercase;font-weight:600">Orden</label>
        <select id="budgetSort" style="display:block;margin-top:4px;padding:8px 12px;border:1px solid #e2e8f0;border-radius:8px;font-size:0.9rem">
          <option value="created_at">Fecha</option>
          <option value="service_type">Servicio</option>
          <option value="status">Estado</option>
          <option value="client_name">Cliente</option>
        </select>
      </div>
      <div>
        <label style="font-size:0.7rem;color:#64748b;text-transform:uppercase;font-weight:600">Dirección</label>
        <button id="budgetSortDir" style="display:block;margin-top:4px;padding:8px 12px;border:1px solid #e2e8f0;border-radius:8px;font-size:0.9rem;cursor:pointer;background:#fff">↓ Desc</button>
      </div>
    </div>
    <div id="budgetsTable"><p class="text-muted">Cargando presupuestos...</p></div>
    <style>
      .budget-table { width:100%; border-collapse:collapse; font-size:0.85rem; }
      .budget-table th { text-align:left; padding:10px 12px; border-bottom:2px solid #e2e8f0; font-weight:600; color:#64748b; font-size:0.7rem; text-transform:uppercase; cursor:pointer; user-select:none; }
      .budget-table th:hover { color:#1e293b; }
      .budget-table th .sort-arrow { margin-left:4px; opacity:0.5; }
      .budget-table th.sorted .sort-arrow { opacity:1; }
      .budget-table td { padding:10px 12px; border-bottom:1px solid #f1f5f9; }
      .budget-table tr { cursor:pointer; }
      .budget-table tr:hover { background:#f8fafc; }
      .status-badge { display:inline-block; padding:2px 10px; border-radius:10px; font-size:0.7rem; font-weight:600; }
      .status-badge.pending { background:#fef3c7; color:#92400e; }
      .status-badge.approved { background:#dcfce7; color:#166534; }
      .status-badge.rejected { background:#fee2e2; color:#991b1b; }
      .status-badge.completed { background:#e0e7ff; color:#3730a3; }
      .status-select { padding:4px 8px; border:1px solid #e2e8f0; border-radius:6px; font-size:0.75rem; cursor:pointer; }
      .text-muted { color:#94a3b8; }
      .detail-field { margin:6px 0; font-size:0.9rem; }
      .detail-field strong { display:inline-block; min-width:120px; color:#64748b; }
    </style>
  `;

  let currentSort = 'created_at';
  let currentOrder = 'desc';
  const modal = new Modal();

  function getParams() {
    return {
      search: document.getElementById('budgetSearch').value || '',
      status: document.getElementById('budgetStatusFilter').value || '',
      from: document.getElementById('budgetFrom').value || '',
      to: document.getElementById('budgetTo').value || '',
      sort: currentSort,
      order: currentOrder,
    };
  }

  async function loadData() {
    try {
      const result = await adminGetAll('budgets', getParams());
      const data = Array.isArray(result) ? result : (result.items || []);
      renderTable(data);
    } catch (err) {
      document.getElementById('budgetsTable').innerHTML = `<div class="empty-state">Error: ${err.message}</div>`;
    }
  }

  function renderTable(data) {
    const table = document.getElementById('budgetsTable');

    if (data.length === 0) {
      table.innerHTML = '<div class="empty-state">No hay presupuestos registrados</div>';
      return;
    }

    const sortArrow = (field) => field === currentSort ? (currentOrder === 'asc' ? ' ↑' : ' ↓') : ' ↕';
    const sortedClass = (field) => field === currentSort ? ' class="sorted"' : '';

    table.innerHTML = `
      <div class="table-container"><table class="budget-table">
        <thead><tr>
          <th${sortedClass('service_type')} data-sort="service_type">Descripción<span class="sort-arrow">${sortArrow('service_type')}</span></th>
          <th${sortedClass('status')} data-sort="status">Estado<span class="sort-arrow">${sortArrow('status')}</span></th>
          <th${sortedClass('client_name')} data-sort="client_name">Cliente<span class="sort-arrow">${sortArrow('client_name')}</span></th>
          <th${sortedClass('created_at')} data-sort="created_at">Fecha<span class="sort-arrow">${sortArrow('created_at')}</span></th>
          <th>Acciones</th>
        </tr></thead>
        <tbody>${data.map(item => `
          <tr data-id="${item.id}">
            <td><strong>${esc(item.service_type || '')}</strong> — ${esc(item.description || '').substring(0, 50)}</td>
            <td><span class="status-badge ${item.status}">${STATUS_LABELS[item.status] || item.status}</span></td>
            <td>${esc(item.client_name || item.clientId || '-')}</td>
            <td>${item.created_at ? new Date(item.created_at).toLocaleDateString('es-AR') : '-'}</td>
            <td onclick="event.stopPropagation()">
              <select class="status-select" data-id="${item.id}" data-current="${item.status}">
                ${STATUS_FLOW.map(s =>
                  `<option value="${s}" ${s === item.status ? 'selected' : ''}>${STATUS_LABELS[s]}</option>`
                ).join('')}
              </select>
            </td>
          </tr>
        `).join('')}</tbody>
      </table></div>
    `;

    table.querySelectorAll('th[data-sort]').forEach(th => {
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

    table.querySelectorAll('tbody tr').forEach(row => {
      row.addEventListener('click', () => showDetail(row.dataset.id));
    });

    table.querySelectorAll('.status-select').forEach(sel => {
      sel.addEventListener('change', async () => {
        const id = sel.dataset.id;
        const newStatus = sel.value;
        try {
          await updateStatus('budgets', id, newStatus);
          sel.dataset.current = newStatus;
          loadData();
        } catch (err) {
          alert('Error al actualizar estado: ' + err.message);
          sel.value = sel.dataset.current;
        }
      });
    });
  }

  async function showDetail(id) {
    modal.show({ title: 'Cargando...', body: '<p>Cargando datos...</p>', footer: '<button class="btn btn-outline" id="closeDetail">Cerrar</button>' });

    try {
      const item = await adminGetOne('budgets', id);
      modal.show({
        title: `Presupuesto — ${esc(item.service_type || item.id)}`,
        body: `
          <div class="detail-field"><strong>ID:</strong> ${esc(item.id)}</div>
          <div class="detail-field"><strong>Servicio:</strong> ${esc(item.service_type || '-')}</div>
          <div class="detail-field"><strong>Descripción:</strong> ${esc(item.description || '-')}</div>
          <div class="detail-field"><strong>Contacto:</strong> ${esc(item.contact || '-')}</div>
          <div class="detail-field"><strong>Estado:</strong> <span class="status-badge ${item.status}">${STATUS_LABELS[item.status] || item.status}</span></div>
          <div class="detail-field"><strong>Cliente:</strong> ${esc(item.client_name || item.clientId || '-')}</div>
          <div class="detail-field"><strong>Fecha:</strong> ${item.created_at ? new Date(item.created_at).toLocaleString('es-AR') : '-'}</div>
        `,
        footer: '<button class="btn btn-outline" id="closeDetail">Cerrar</button>',
      });
    } catch (err) {
      modal.show({ title: 'Error', body: `<p>Error al cargar: ${err.message}</p>`, footer: '<button class="btn btn-outline" id="closeDetail">Cerrar</button>' });
    }

    setTimeout(() => {
      const btn = document.getElementById('closeDetail');
      if (btn) btn.addEventListener('click', () => modal.hide());
    }, 50);
  }

  let debounceTimer;
  const debounce = (fn, ms = 300) => (...args) => { clearTimeout(debounceTimer); debounceTimer = setTimeout(() => fn(...args), ms); };

  const debouncedLoad = debounce(loadData);
  document.getElementById('budgetSearch').addEventListener('input', debouncedLoad);
  document.getElementById('budgetStatusFilter').addEventListener('change', loadData);
  document.getElementById('budgetFrom').addEventListener('change', loadData);
  document.getElementById('budgetTo').addEventListener('change', loadData);
  document.getElementById('budgetSort').addEventListener('change', (e) => { currentSort = e.target.value; loadData(); });
  document.getElementById('budgetSortDir').addEventListener('click', () => {
    currentOrder = currentOrder === 'asc' ? 'desc' : 'asc';
    document.getElementById('budgetSortDir').textContent = currentOrder === 'asc' ? '↑ Asc' : '↓ Desc';
    loadData();
  });

  await loadData();
}

function esc(s) {
  const d = document.createElement('div');
  d.textContent = s || '';
  return d.innerHTML;
}
