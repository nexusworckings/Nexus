import { adminGetAll, adminGetOne, updateStatus } from '../../api.js';
import { Modal } from '../../components/Modal.js';

const STATUS_FLOW = ['pending', 'printing', 'completed', 'cancelled'];
const STATUS_LABELS = { pending: 'Pendiente', printing: 'Imprimiendo', completed: 'Completado', cancelled: 'Cancelado' };

export default async function renderPrintOrders(container) {
  container.innerHTML = `
    <div style="display:flex;gap:12px;margin-bottom:16px;flex-wrap:wrap;align-items:end">
      <div class="search-box" style="flex:1;min-width:200px">
        <label style="font-size:0.7rem;color:#64748b;text-transform:uppercase;font-weight:600">Buscar</label>
        <input type="text" id="printSearch" placeholder="Modelo, material, cliente..." style="width:100%;margin-top:4px" />
      </div>
      <div>
        <label style="font-size:0.7rem;color:#64748b;text-transform:uppercase;font-weight:600">Estado</label>
        <select id="printStatusFilter" style="display:block;margin-top:4px;padding:8px 12px;border:1px solid #e2e8f0;border-radius:8px;font-size:0.9rem">
          <option value="">Todos los estados</option>
          ${STATUS_FLOW.map(s => `<option value="${s}">${STATUS_LABELS[s]}</option>`).join('')}
        </select>
      </div>
      <div>
        <label style="font-size:0.7rem;color:#64748b;text-transform:uppercase;font-weight:600">Material</label>
        <select id="printMaterialFilter" style="display:block;margin-top:4px;padding:8px 12px;border:1px solid #e2e8f0;border-radius:8px;font-size:0.9rem">
          <option value="">Todos</option>
          <option value="PLA">PLA</option>
          <option value="ABS">ABS</option>
          <option value="PETG">PETG</option>
          <option value="TPU">TPU</option>
          <option value="Nylon">Nylon</option>
        </select>
      </div>
      <div>
        <label style="font-size:0.7rem;color:#64748b;text-transform:uppercase;font-weight:600">Desde</label>
        <input type="date" id="printFrom" style="display:block;margin-top:4px;padding:8px;border:1px solid #e2e8f0;border-radius:8px;font-size:0.9rem" />
      </div>
      <div>
        <label style="font-size:0.7rem;color:#64748b;text-transform:uppercase;font-weight:600">Hasta</label>
        <input type="date" id="printTo" style="display:block;margin-top:4px;padding:8px;border:1px solid #e2e8f0;border-radius:8px;font-size:0.9rem" />
      </div>
      <div>
        <label style="font-size:0.7rem;color:#64748b;text-transform:uppercase;font-weight:600">Orden</label>
        <select id="printSort" style="display:block;margin-top:4px;padding:8px 12px;border:1px solid #e2e8f0;border-radius:8px;font-size:0.9rem">
          <option value="created_at">Fecha</option>
          <option value="object_description">Modelo</option>
          <option value="material">Material</option>
          <option value="status">Estado</option>
          <option value="client_name">Cliente</option>
        </select>
      </div>
      <div>
        <label style="font-size:0.7rem;color:#64748b;text-transform:uppercase;font-weight:600">Dirección</label>
        <button id="printSortDir" style="display:block;margin-top:4px;padding:8px 12px;border:1px solid #e2e8f0;border-radius:8px;font-size:0.9rem;cursor:pointer;background:#fff">↓ Desc</button>
      </div>
    </div>
    <div id="printOrdersTable"><p class="text-muted">Cargando órdenes de impresión...</p></div>
    <style>
      .print-table { width:100%; border-collapse:collapse; font-size:0.85rem; }
      .print-table th { text-align:left; padding:10px 12px; border-bottom:2px solid #e2e8f0; font-weight:600; color:#64748b; font-size:0.7rem; text-transform:uppercase; cursor:pointer; user-select:none; }
      .print-table th:hover { color:#1e293b; }
      .print-table th .sort-arrow { margin-left:4px; opacity:0.5; }
      .print-table th.sorted .sort-arrow { opacity:1; }
      .print-table td { padding:10px 12px; border-bottom:1px solid #f1f5f9; }
      .print-table tr { cursor:pointer; }
      .print-table tr:hover { background:#f8fafc; }
      .status-badge { display:inline-block; padding:2px 10px; border-radius:10px; font-size:0.7rem; font-weight:600; }
      .status-badge.pending { background:#fef3c7; color:#92400e; }
      .status-badge.printing { background:#e0e7ff; color:#3730a3; }
      .status-badge.completed { background:#dcfce7; color:#166534; }
      .status-badge.cancelled { background:#fee2e2; color:#991b1b; }
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
      search: document.getElementById('printSearch').value || '',
      status: document.getElementById('printStatusFilter').value || '',
      from: document.getElementById('printFrom').value || '',
      to: document.getElementById('printTo').value || '',
      sort: currentSort,
      order: currentOrder,
    };
  }

  async function loadData() {
    try {
      const result = await adminGetAll('print-orders', getParams());
      let data = Array.isArray(result) ? result : (result.items || []);

      const materialFilter = document.getElementById('printMaterialFilter').value;
      if (materialFilter) {
        data = data.filter(item => item.material === materialFilter);
      }

      renderTable(data);
    } catch (err) {
      document.getElementById('printOrdersTable').innerHTML = `<div class="empty-state">Error: ${err.message}</div>`;
    }
  }

  function renderTable(data) {
    const table = document.getElementById('printOrdersTable');

    if (data.length === 0) {
      table.innerHTML = '<div class="empty-state">No hay órdenes de impresión registradas</div>';
      return;
    }

    const sortArrow = (field) => field === currentSort ? (currentOrder === 'asc' ? ' ↑' : ' ↓') : ' ↕';
    const sortedClass = (field) => field === currentSort ? ' class="sorted"' : '';

    table.innerHTML = `
      <div class="table-container"><table class="print-table">
        <thead><tr>
          <th${sortedClass('object_description')} data-sort="object_description">Modelo<span class="sort-arrow">${sortArrow('object_description')}</span></th>
          <th${sortedClass('material')} data-sort="material">Material<span class="sort-arrow">${sortArrow('material')}</span></th>
          <th${sortedClass('status')} data-sort="status">Estado<span class="sort-arrow">${sortArrow('status')}</span></th>
          <th${sortedClass('client_name')} data-sort="client_name">Cliente<span class="sort-arrow">${sortArrow('client_name')}</span></th>
          <th${sortedClass('created_at')} data-sort="created_at">Fecha<span class="sort-arrow">${sortArrow('created_at')}</span></th>
          <th>Acciones</th>
        </tr></thead>
        <tbody>${data.map(item => `
          <tr data-id="${item.id}">
            <td><strong>${esc(item.object_description || item.description || '').substring(0, 50)}</strong></td>
            <td>${esc(item.material || '-')}</td>
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
          await updateStatus('print-orders', id, newStatus);
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
      const item = await adminGetOne('print-orders', id);
      modal.show({
        title: `Impresión 3D — ${esc(item.object_description || item.id)}`,
        body: `
          <div class="detail-field"><strong>ID:</strong> ${esc(item.id)}</div>
          <div class="detail-field"><strong>Modelo:</strong> ${esc(item.object_description || '-')}</div>
          <div class="detail-field"><strong>Material:</strong> ${esc(item.material || '-')}</div>
          <div class="detail-field"><strong>Cantidad:</strong> ${item.quantity || 1}</div>
          <div class="detail-field"><strong>Colores:</strong> ${esc(Array.isArray(item.colors) ? item.colors.join(', ') : (item.colors || '-'))}</div>
          <div class="detail-field"><strong>Estado:</strong> <span class="status-badge ${item.status}">${STATUS_LABELS[item.status] || item.status}</span></div>
          <div class="detail-field"><strong>Cliente:</strong> ${esc(item.client_name || item.clientId || '-')}</div>
          <div class="detail-field"><strong>Fecha:</strong> ${item.created_at ? new Date(item.created_at).toLocaleString('es-AR') : '-'}</div>
          ${item.notes ? `<div class="detail-field"><strong>Notas:</strong> ${esc(item.notes)}</div>` : ''}
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
  document.getElementById('printSearch').addEventListener('input', debouncedLoad);
  document.getElementById('printStatusFilter').addEventListener('change', loadData);
  document.getElementById('printMaterialFilter').addEventListener('change', loadData);
  document.getElementById('printFrom').addEventListener('change', loadData);
  document.getElementById('printTo').addEventListener('change', loadData);
  document.getElementById('printSort').addEventListener('change', (e) => { currentSort = e.target.value; loadData(); });
  document.getElementById('printSortDir').addEventListener('click', () => {
    currentOrder = currentOrder === 'asc' ? 'desc' : 'asc';
    document.getElementById('printSortDir').textContent = currentOrder === 'asc' ? '↑ Asc' : '↓ Desc';
    loadData();
  });

  await loadData();
}

function esc(s) {
  const d = document.createElement('div');
  d.textContent = s || '';
  return d.innerHTML;
}
