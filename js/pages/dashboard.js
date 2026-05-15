/**
 * OrdiveX — Dashboard Page
 * v9.2.3 — Cache mémoire pour affichage instantané
 */

// ═══════════════════════════════════════════════════════════════════
// CACHE MÉMOIRE DASHBOARD
// ═══════════════════════════════════════════════════════════════════
const _dashCache = {
  html: null,           // Dernier HTML rendu
  chartData: null,      // Données des graphiques
  ts: 0,                // Timestamp du dernier calcul
  TTL: 30000,           // 30s avant refresh obligatoire
};

async function renderDashboard(container) {
  // ── AFFICHAGE INSTANTANÉ depuis le cache ──
  if (_dashCache.html) {
    container.innerHTML = _dashCache.html;
    _drawCharts(_dashCache.chartData);
    if (window.lucide) lucide.createIcons();
    if (window.animateAllKPIs) setTimeout(animateAllKPIs, 100);

    // Si le cache est frais (< TTL), on s'arrête là
    if (Date.now() - _dashCache.ts < _dashCache.TTL) return;

    // Sinon, refresh silencieux en arrière-plan (pas de skeleton)
    _refreshDashboard(container);
    return;
  }

  // ── PREMIER CHARGEMENT (aucun cache disponible) ──
  UI.loading(container, 'Chargement du tableau de bord...');
  await _refreshDashboard(container);
}

async function _refreshDashboard(container) {
  try {
    const [stockAll, sales, saleItems, alerts, movements, allReturns, productCount] = await Promise.all([
      DB.dbGetAll('stock'),
      DB.dbGetAll('sales'),
      DB.dbGetAll('saleItems'),
      DB.dbGetAll('alerts'),
      DB.dbGetAll('movements'),
      DB.dbGetAll('returns'),
      DB.dbCount('products').catch(() => 0),
    ]);

    // Charger products intelligemment : stock-only si catalogue > 50k pour éviter crash RAM
    let products;
    if (productCount > 50000) {
      products = stockAll.map(s => ({ id: s.productId, name: 'Produit', minStock: 10 }));
    } else {
      products = await DB.dbGetAll('products');
    }

    // Compute KPIs
    const today = new Date();
    const startOfDay = new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime();
    const startOfMonth = new Date(today.getFullYear(), today.getMonth(), 1).getTime();

    const todaySales = sales.filter(s => new Date(s.date).getTime() >= startOfDay && ['completed', 'paid'].includes(s.status));
    const monthSales = sales.filter(s => new Date(s.date).getTime() >= startOfMonth && ['completed', 'paid'].includes(s.status));
    const todayReturns = allReturns.filter(r => new Date(r.date).getTime() >= startOfDay && r.status === 'approved');
    const monthReturns = allReturns.filter(r => new Date(r.date).getTime() >= startOfMonth && r.status === 'approved');

    const todayRevenue = todaySales.reduce((a, s) => a + s.total, 0) - todayReturns.reduce((a, r) => a + (r.refundAmount || 0), 0);
    const monthRevenue = monthSales.reduce((a, s) => a + s.total, 0) - monthReturns.reduce((a, r) => a + (r.refundAmount || 0), 0);

    // Margin
    const monthItems = saleItems.filter(si => monthSales.some(s => s.id === si.saleId));
    const monthCOGS = monthItems.reduce((a, si) => a + (si.purchasePrice || 0) * si.quantity, 0);
    const monthGrossProfit = monthRevenue - monthCOGS;
    const marginPct = monthRevenue > 0 ? (monthGrossProfit / monthRevenue * 100).toFixed(1) : 0;

    // Stock alerts — Map indexé pour éviter un O(n²) sur 100k produits
    const stockMap = new Map();
    stockAll.forEach(s => stockMap.set(s.productId, s.quantity));
    const lowStockProducts = products.filter(p => {
      const qty = stockMap.get(p.id);
      return qty !== undefined && qty <= p.minStock;
    });

    const unreadAlerts = alerts.filter(a => a.status === 'unread');

    // Monthly sales by day (last 15 days)
    const last15 = [];
    const last15Labels = [];
    for (let d = 14; d >= 0; d--) {
      const day = new Date(today.getFullYear(), today.getMonth(), today.getDate() - d);
      const dayStart = day.getTime();
      const dayEnd = dayStart + 86400000;
      const daySales = sales.filter(s => {
        const t = new Date(s.date).getTime();
        return t >= dayStart && t < dayEnd && ['completed', 'paid'].includes(s.status);
      }).reduce((a, s) => a + s.total, 0);

      const dayReturns = allReturns.filter(r => {
        const t = new Date(r.date).getTime();
        return t >= dayStart && t < dayEnd && r.status === 'approved';
      }).reduce((a, r) => a + (r.refundAmount || 0), 0);

      last15.push(daySales - dayReturns);
      last15Labels.push(day.getDate() + '/' + (day.getMonth() + 1));
    }

    // Payment method breakdown
    const payBreakdown = {};
    monthSales.forEach(s => { payBreakdown[s.paymentMethod] = (payBreakdown[s.paymentMethod] || 0) + s.total; });
    monthReturns.forEach(r => {
      const method = r.paymentMethod || 'cash';
      payBreakdown[method] = (payBreakdown[method] || 0) - (r.refundAmount || 0);
    });
    const payLabels = { cash: 'Espèces', orange_money: 'Orange Money', mtn_momo: 'MTN MoMo', credit: 'Crédit', transfer: 'Virement' };

    // Top products this month
    const productRevenue = {};
    monthItems.forEach(si => {
      productRevenue[si.productName] = (productRevenue[si.productName] || 0) + si.total;
    });
    const topProducts = Object.entries(productRevenue).sort((a, b) => b[1] - a[1]).slice(0, 5);

    const html = `
      <div class="page-header">
        <div>
          <h1 class="page-title">Tableau de Bord</h1>
          <p class="page-subtitle">${UI.formatDate(new Date().toISOString())} — ${DB.AppState.currentUser?.name}</p>
        </div>
        <div class="header-actions">
          <button class="btn btn-primary" onclick="Router.navigate('pos')">
            <span class="btn-icon"><i data-lucide="shopping-cart"></i></span> Nouvelle Vente
          </button>
        </div>
      </div>

      <!-- KPI Cards -->
      <div class="kpi-grid">
        <div class="kpi-card kpi-blue">
          <div class="kpi-icon"><i data-lucide="banknote"></i></div>
          <div class="kpi-content">
            <div class="kpi-value" data-animate-value="${todayRevenue}" data-suffix=" ${DB.AppState.settings?.currency || 'GNF'}">0</div>
            <div class="kpi-label">Ventes Aujourd'hui</div>
            <div class="kpi-sub">${todaySales.length} transactions</div>
          </div>
        </div>
        <div class="kpi-card kpi-green">
          <div class="kpi-icon"><i data-lucide="trending-up"></i></div>
          <div class="kpi-content">
            <div class="kpi-value" data-animate-value="${monthRevenue}" data-suffix=" ${DB.AppState.settings?.currency || 'GNF'}">0</div>
            <div class="kpi-label">CA du Mois</div>
            <div class="kpi-sub">${DB.AppState.currentUser?.role !== 'caissier' ? `Marge : ${marginPct}%` : 'Performance mensuelle'}</div>
          </div>
        </div>
        <div class="kpi-card kpi-orange ${lowStockProducts.length > 0 ? 'kpi-alert' : ''}">
          <div class="kpi-icon"><i data-lucide="package"></i></div>
          <div class="kpi-content">
            <div class="kpi-value" data-animate-value="${productCount}">0</div>
            <div class="kpi-label">Produits Actifs</div>
            <div class="kpi-sub">${lowStockProducts.length} en stock bas</div>
          </div>
        </div>
        <div class="kpi-card kpi-red ${unreadAlerts.length > 0 ? 'kpi-alert' : ''}">
          <div class="kpi-icon"><i data-lucide="bell"></i></div>
          <div class="kpi-content">
            <div class="kpi-value" data-animate-value="${unreadAlerts.length}">0</div>
            <div class="kpi-label">Alertes Actives</div>
            <div class="kpi-sub">À traiter rapidement</div>
          </div>
        </div>
      </div>

      <!-- Charts Row -->
      <div class="charts-row">
        <div class="chart-card">
          <div class="chart-header">
            <h3 class="chart-title">Ventes des 15 derniers jours</h3>
          </div>
          <canvas id="chart-sales" width="500" height="280"></canvas>
        </div>
        <div class="chart-card">
          <div class="chart-header">
            <h3 class="chart-title">Modes de paiement (mois)</h3>
          </div>
          <canvas id="chart-payments" width="500" height="280"></canvas>
        </div>
      </div>

      <!-- Bottom Row -->
      <div class="dashboard-bottom">
        <!-- Top Products -->
        <div class="dash-panel">
          <div class="panel-header">
            <h3 class="panel-title"><i data-lucide="award"></i> Top Produits du Mois</h3>
            ${DB.AppState.currentUser?.role !== 'caissier' ? `<button class="btn btn-sm btn-ghost" onclick="Router.navigate('reports')">Voir tout <i data-lucide="arrow-right"></i></button>` : ''}
          </div>
          <div class="top-products-list">
            ${topProducts.length === 0 ? '<p class="text-muted text-center">Aucune vente ce mois</p>' :
        topProducts.map(([name, rev], i) => `
                <div class="top-product-item">
                  <div class="top-rank">${i + 1}</div>
                  <div class="top-info">
                    <div class="top-name">${name}</div>
                    <div class="top-bar-wrap">
                      <div class="top-bar" style="width:${(rev / topProducts[0][1] * 100).toFixed(0)}%"></div>
                    </div>
                  </div>
                  <div class="top-revenue">${UI.formatCurrency(rev)}</div>
                </div>`).join('')}
          </div>
        </div>

        <!-- Alerts -->
        <div class="dash-panel">
          <div class="panel-header">
            <h3 class="panel-title"><i data-lucide="bell"></i> Alertes Récentes</h3>
            <button class="btn btn-sm btn-ghost" onclick="Router.navigate('alerts')">Voir tout <i data-lucide="arrow-right"></i></button>
          </div>
          <div class="alerts-list">
            ${unreadAlerts.length === 0 ? '<div class="empty-state-small"><i data-lucide="check-circle"></i> Aucune alerte active</div>' :
        unreadAlerts.slice(0, 5).map(a => `
                <div class="alert-item alert-${a.priority}">
                  <div class="alert-dot"></div>
                  <div class="alert-content">
                    <div class="alert-type">${alertTypeLabel(a.type)}</div>
                    <div class="alert-msg">${a.message}</div>
                  </div>
                  <button class="btn btn-xs" onclick="dismissAlert(${a.id})"><i data-lucide="check"></i></button>
                </div>`).join('')}
          </div>
        </div>

        <!-- Low Stock -->
        <div class="dash-panel">
          <div class="panel-header">
            <h3 class="panel-title"><i data-lucide="alert-triangle"></i> Stocks Bas</h3>
            ${DB.AppState.currentUser?.role !== 'caissier' ? `<button class="btn btn-sm btn-ghost" onclick="Router.navigate('stock')">Gérer <i data-lucide="arrow-right"></i></button>` : ''}
          </div>
          <div class="stock-alerts-list">
            ${lowStockProducts.length === 0 ? '<div class="empty-state-small"><i data-lucide="check-circle"></i> Tous les stocks sont corrects</div>' :
        lowStockProducts.slice(0, 6).map(p => {
          const stock = stockAll.find(s => s.productId === p.id);
          const qty = stock ? stock.quantity : 0;
          const pct = Math.min(100, (qty / (p.minStock * 2)) * 100);
          return `
                  <div class="stock-alert-item">
                    <div class="stock-info">
                      <span class="stock-name">${p.name}</span>
                      <span class="stock-qty ${qty === 0 ? 'text-danger' : 'text-warning'}">${qty} unités</span>
                    </div>
                    <div class="stock-bar-wrap">
                      <div class="stock-bar ${qty === 0 ? 'bar-danger' : 'bar-warning'}" style="width:${pct}%"></div>
                    </div>
                  </div>`;
        }).join('')}
          </div>
        </div>
      </div>
    `;

    // Construire les données des graphiques
    const payKeys = Object.keys(payBreakdown);
    const payColors = ['#0B3D6F', '#0D9B6C', '#E8913A', '#2B7BC0', '#D63B3B'];
    const chartData = {
      last15, last15Labels,
      payKeys, payBreakdown, payLabels, payColors,
    };

    // ── SAUVEGARDER DANS LE CACHE MÉMOIRE ──
    _dashCache.html = html;
    _dashCache.chartData = chartData;
    _dashCache.ts = Date.now();

    // ── RENDRE (seulement si on est encore sur le dashboard) ──
    if (Router.currentPage === 'dashboard') {
      container.innerHTML = html;
      _drawCharts(chartData);
      if (window.lucide) lucide.createIcons();
      // Phase 1 v9.4 — Animations KPI count-up
      if (window.animateAllKPIs) setTimeout(animateAllKPIs, 100);
    }

  } catch (err) {
    console.error(err);
    // Seulement afficher l'erreur s'il n'y a aucun cache
    if (!_dashCache.html) {
      container.innerHTML = `<div class="error-state">Erreur de chargement : ${err.message}</div>`;
    }
  }
}

function _drawCharts(chartData) {
  if (!chartData) return;
  requestAnimationFrame(() => {
    try {
      Charts.line('chart-sales', chartData.last15Labels, [{
        data: chartData.last15,
        color: '#0B3D6F'
      }], { title: '' });

      Charts.donut('chart-payments',
        chartData.payKeys.map(k => chartData.payLabels[k] || k),
        chartData.payKeys.map(k => chartData.payBreakdown[k]),
        chartData.payColors
      );
    } catch (e) { /* Canvas pas encore prêt */ }
  });
}

// ═══════════════════════════════════════════════════════════════════
// INVALIDATION DU CACHE
// ═══════════════════════════════════════════════════════════════════
// Invalider le cache quand une vente est faite ou un stock modifié
window._invalidateDashCache = function() {
  _dashCache.ts = 0; // Force refresh au prochain accès
};

function alertTypeLabel(type) {
  const labels = {
    LOW_STOCK: '<i data-lucide="package"></i> Stock bas',
    EXPIRY_SOON: '<i data-lucide="clock"></i> Expiration proche',
    EXPIRY_CRITICAL: '<i data-lucide="alert-octagon"></i> Expiration critique',
    RUPTURE: '<i data-lucide="x-circle"></i> Rupture de stock',
  };
  return labels[type] || type;
}

async function dismissAlert(alertId) {
  const alert = await DB.dbGet('alerts', alertId);
  if (alert) {
    await DB.dbPut('alerts', { ...alert, status: 'read' });
    _dashCache.ts = 0; // Invalider le cache
    UI.toast('Alerte marquée comme lue', 'success');
    Router.navigate('dashboard');
  }
}

window.dismissAlert = dismissAlert;
Router.register('dashboard', renderDashboard);
