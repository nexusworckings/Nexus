import { getDashboardStats, adminGetAll } from '../../api.js';

export default async function renderDashboard(container) {
  container.innerHTML = `
    <div class="dashboard-grid">
      <div class="stat-card" data-section="repairs">
        <div class="stat-icon">🔧</div>
        <div class="stat-info">
          <div class="stat-label">Reparaciones</div>
          <div class="stat-value" id="statRepairsTotal">...</div>
          <div class="stat-detail" id="statRepairsDetail"></div>
        </div>
      </div>
      <div class="stat-card" data-section="budgets">
        <div class="stat-icon">📋</div>
        <div class="stat-info">
          <div class="stat-label">Presupuestos</div>
          <div class="stat-value" id="statBudgetsTotal">...</div>
          <div class="stat-detail" id="statBudgetsDetail"></div>
        </div>
      </div>
      <div class="stat-card" data-section="print-orders">
        <div class="stat-icon">🖨️</div>
        <div class="stat-info">
          <div class="stat-label">Impresión 3D</div>
          <div class="stat-value" id="statPrintTotal">...</div>
          <div class="stat-detail" id="statPrintDetail"></div>
        </div>
      </div>
      <div class="stat-card" data-section="interviews">
        <div class="stat-icon">💬</div>
        <div class="stat-info">
          <div class="stat-label">Entrevistas</div>
          <div class="stat-value" id="statInterviewsTotal">...</div>
          <div class="stat-detail">Sesiones recientes</div>
        </div>
      </div>
    </div>
    <div class="dashboard-recent">
      <h3>Actividad Reciente</h3>
      <div id="recentActivity"><p class="text-muted">Cargando...</p></div>
    </div>
    <style>
      .dashboard-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 16px; margin-bottom: 24px; }
      .stat-card { background: #fff; border: 1px solid #e2e8f0; border-radius: 12px; padding: 20px; display: flex; align-items: center; gap: 16px; cursor: pointer; transition: box-shadow 0.2s, transform 0.2s; }
      .stat-card:hover { box-shadow: 0 4px 12px rgba(0,0,0,0.08); transform: translateY(-1px); }
      .stat-icon { font-size: 2rem; width: 48px; height: 48px; display: flex; align-items: center; justify-content: center; background: #f1f5f9; border-radius: 12px; flex-shrink: 0; }
      .stat-info { flex: 1; min-width: 0; }
      .stat-label { font-size: 0.75rem; font-weight: 600; color: #64748b; text-transform: uppercase; letter-spacing: 0.5px; }
      .stat-value { font-size: 1.75rem; font-weight: 700; color: #1e293b; line-height: 1.2; }
      .stat-detail { font-size: 0.75rem; color: #94a3b8; margin-top: 2px; }
      .dashboard-recent { background: #fff; border: 1px solid #e2e8f0; border-radius: 12px; padding: 20px; }
      .dashboard-recent h3 { margin: 0 0 12px; font-size: 1rem; font-weight: 600; }
      .recent-table { width: 100%; border-collapse: collapse; font-size: 0.85rem; }
      .recent-table th { text-align: left; padding: 8px 12px; border-bottom: 2px solid #e2e8f0; font-weight: 600; color: #64748b; font-size: 0.7rem; text-transform: uppercase; }
      .recent-table td { padding: 8px 12px; border-bottom: 1px solid #f1f5f9; }
      .status-badge { display: inline-block; padding: 2px 8px; border-radius: 10px; font-size: 0.7rem; font-weight: 600; }
      .status-badge.received,.status-badge.pending { background: #fef3c7; color: #92400e; }
      .status-badge.diagnosing { background: #dbeafe; color: #1e40af; }
      .status-badge.repairing,.status-badge.printing { background: #e0e7ff; color: #3730a3; }
      .status-badge.completed,.status-badge.approved { background: #dcfce7; color: #166534; }
      .status-badge.cancelled,.status-badge.rejected { background: #fee2e2; color: #991b1b; }
      .text-muted { color: #94a3b8; }
    </style>
  `;

  try {
    const stats = await getDashboardStats();

    document.getElementById('statRepairsTotal').textContent = stats.repairs.total;
    document.getElementById('statRepairsDetail').textContent =
      `📩 ${stats.repairs.received} · 🔍 ${stats.repairs.diagnosing} · 🔧 ${stats.repairs.repairing} · ✅ ${stats.repairs.completed}`;

    document.getElementById('statBudgetsTotal').textContent = stats.budgets.total;
    document.getElementById('statBudgetsDetail').textContent =
      `⏳ ${stats.budgets.pending} · ✅ ${stats.budgets.approved} · ❌ ${stats.budgets.rejected} · ✔️ ${stats.budgets.completed}`;

    document.getElementById('statPrintTotal').textContent = stats.printOrders.total;
    document.getElementById('statPrintDetail').textContent =
      `⏳ ${stats.printOrders.pending} · 🖨️ ${stats.printOrders.printing} · ✅ ${stats.printOrders.completed}`;

    document.getElementById('statInterviewsTotal').textContent = stats.interviews.total;

    const recent = [];
    for (const item of (stats.repairs.recent || [])) recent.push({ type: 'Reparación', id: item.id, status: item.status, created: item.created_at });
    for (const item of (stats.budgets.recent || [])) recent.push({ type: 'Presupuesto', id: item.id, status: item.status, created: item.created_at });
    for (const item of (stats.printOrders.recent || [])) recent.push({ type: 'Impresión 3D', id: item.id, status: item.status, created: item.created_at });

    recent.sort((a, b) => new Date(b.created) - new Date(a.created));
    const top5 = recent.slice(0, 5);

    if (top5.length === 0) {
      document.getElementById('recentActivity').innerHTML = '<p class="text-muted">Sin actividad reciente</p>';
    } else {
      document.getElementById('recentActivity').innerHTML = `
        <table class="recent-table">
          <thead><tr><th>Tipo</th><th>ID</th><th>Estado</th><th>Fecha</th></tr></thead>
          <tbody>${top5.map(item => `
            <tr>
              <td>${item.type}</td>
              <td style="font-family:monospace;font-size:0.7rem">${item.id.slice(0, 8)}...</td>
              <td><span class="status-badge ${item.status}">${item.status}</span></td>
              <td>${new Date(item.created).toLocaleDateString('es-AR')}</td>
            </tr>
          `).join('')}</tbody>
        </table>
      `;
    }

    container.querySelectorAll('.stat-card').forEach(card => {
      card.addEventListener('click', () => {
        const section = card.dataset.section;
        const sidebarLink = document.querySelector(`[data-module="${section}"]`);
        if (sidebarLink) sidebarLink.click();
      });
    });
  } catch (err) {
    container.innerHTML += `<div class="empty-state">Error al cargar dashboard: ${err.message}</div>`;
  }
}
