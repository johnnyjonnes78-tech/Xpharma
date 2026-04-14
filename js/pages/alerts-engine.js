/**
 * PHARMA_PROJET — Moteur d'Alertes Automatiques
 * Scan périodique : stocks bas, expirations, anomalies
 */

const AlertsEngine = {
  intervalId: null,
  lastRun: null,

  async start() {

    // Run immediately then every 15 minutes
    await this.run();
    this.intervalId = setInterval(() => this.run(), 15 * 60 * 1000);
  },

  stop() {
    if (this.intervalId) clearInterval(this.intervalId);

  },

  async run() {
    if (!DB.AppState.currentUser) return;
    this.lastRun = Date.now();


    try {
      await Promise.all([
        this.checkStockAlerts(),
        this.checkExpiryAlerts(),
        this.checkPendingOrders(),
        this.checkCaisseReminder(),
      ]);
    } catch (e) {
      console.warn('[AlertsEngine] Erreur:', e.message);
    }
  },

  async checkStockAlerts() {
    const [products, stockAll, existingAlerts] = await Promise.all([
      DB.dbGetAll('products'),
      DB.dbGetAll('stock'),
      DB.dbGetAll('alerts'),
    ]);

    const stockMap = {};
    stockAll.forEach(s => { stockMap[s.productId] = s.quantity; });

    const today = new Date().toISOString().split('T')[0];

    for (const product of products) {
      if (product.status !== 'active') continue;
      const qty = stockMap[product.id] || 0;
      const min = product.minStock || 10;

      // Check if alert already exists today
      const hasAlert = existingAlerts.some(a =>
        a.productId === product.id &&
        a.status === 'unread' &&
        (a.type === 'LOW_STOCK' || a.type === 'RUPTURE') &&
        new Date(a.date).toISOString().split('T')[0] === today
      );
      if (hasAlert) continue;

      if (qty === 0) {
        await DB.dbAdd('alerts', {
          type: 'RUPTURE',
          productId: product.id,
          productName: product.name,
          message: `RUPTURE : ${product.name} — Stock épuisé`,
          status: 'unread',
          date: Date.now(),
          priority: 'critical',
        });
      } else if (qty <= min) {
        await DB.dbAdd('alerts', {
          type: 'LOW_STOCK',
          productId: product.id,
          productName: product.name,
          message: `Stock bas : ${product.name} — ${qty} unités (seuil: ${min})`,
          status: 'unread',
          date: Date.now(),
          priority: qty <= Math.floor(min / 2) ? 'high' : 'medium',
        });
      }
    }
  },

  async checkExpiryAlerts() {
    const [lots, products, existingAlerts] = await Promise.all([
      DB.dbGetAll('lots'),
      DB.dbGetAll('products'),
      DB.dbGetAll('alerts'),
    ]);

    const productMap = {};
    products.forEach(p => { productMap[p.id] = p; });
    const today = new Date().toISOString().split('T')[0];

    for (const lot of lots) {
      if (lot.status !== 'active') continue;
      const days = UI.daysUntilExpiry(lot.expiryDate);
      if (days === null) continue;

      const prod = productMap[lot.productId];
      if (!prod) continue;

      // Don't re-alert same lot same day
      const hasAlert = existingAlerts.some(a =>
        a.lotId === lot.id &&
        a.status === 'unread' &&
        new Date(a.date).toISOString().split('T')[0] === today
      );
      if (hasAlert) continue;

      if (days <= 0) {
        await DB.dbAdd('alerts', {
          type: 'EXPIRY_CRITICAL',
          productId: lot.productId,
          lotId: lot.id,
          productName: prod.name,
          message: `LOT EXPIRÉ : ${prod.name} — Lot ${lot.lotNumber} — ${lot.quantity} unités à détruire`,
          status: 'unread',
          date: Date.now(),
          priority: 'critical',
        });
        // Auto-block lot
        await DB.dbPut('lots', { ...lot, status: 'blocked' });
      } else if (days <= 30) {
        await DB.dbAdd('alerts', {
          type: 'EXPIRY_CRITICAL',
          productId: lot.productId,
          lotId: lot.id,
          productName: prod.name,
          message: `Expiration dans ${days} jours — ${prod.name} (Lot ${lot.lotNumber}) — ${lot.quantity} unités`,
          status: 'unread',
          date: Date.now(),
          priority: 'high',
        });
      } else if (days <= 90) {
        await DB.dbAdd('alerts', {
          type: 'EXPIRY_SOON',
          productId: lot.productId,
          lotId: lot.id,
          productName: prod.name,
          message: `Expiration dans ${days} jours — ${prod.name} (Lot ${lot.lotNumber})`,
          status: 'unread',
          date: Date.now(),
          priority: days <= 60 ? 'medium' : 'low',
        });
      }
    }
  },

  async checkPendingOrders() {
    const orders = await DB.dbGetAll('purchaseOrders');
    const existingAlerts = await DB.dbGetAll('alerts');
    const today = new Date().toISOString().split('T')[0];

    for (const order of orders) {
      if (order.status !== 'sent') continue;
      if (!order.expectedDate) continue;

      const daysLate = Math.floor((new Date() - new Date(order.expectedDate)) / 86400000);
      if (daysLate < 3) continue;

      const hasAlert = existingAlerts.some(a =>
        a.orderId === order.id && a.type === 'ORDER_LATE' && a.status === 'unread'
      );
      if (hasAlert) continue;

      await DB.dbAdd('alerts', {
        type: 'ORDER_LATE',
        orderId: order.id,
        message: `Commande en retard : ${order.orderNumber} — ${daysLate} jours de retard`,
        status: 'unread',
        date: Date.now(),
        priority: daysLate >= 7 ? 'high' : 'medium',
      });
    }
  },

  async checkCaisseReminder() {
    // Remind at end of day if caisse not closed
    const now = new Date();
    if (now.getHours() < 18) return; // Only after 18h

    const today = now.toISOString().split('T')[0];
    const cashRegister = await DB.dbGetAll('cashRegister');
    const todayClosed = cashRegister.some(c => c.type === 'closure' && c.date === today);
    if (todayClosed) return;

    const existingAlerts = await DB.dbGetAll('alerts');
    const hasAlert = existingAlerts.some(a =>
      a.type === 'CAISSE_REMINDER' && a.status === 'unread' &&
      new Date(a.date).toISOString().split('T')[0] === today
    );
    if (hasAlert) return;

    await DB.dbAdd('alerts', {
      type: 'CAISSE_REMINDER',
      message: `Rappel : Clôture de caisse journalière non effectuée`,
      status: 'unread',
      date: Date.now(),
      priority: 'medium',
    });
  },
};

// Auto-generate stock suggestions for low stock
async function generateReorderSuggestions() {
  const [products, stockAll, movements] = await Promise.all([
    DB.dbGetAll('products'),
    DB.dbGetAll('stock'),
    DB.dbGetAll('movements'),
  ]);

  const stockMap = {};
  stockAll.forEach(s => { stockMap[s.productId] = s.quantity; });

  const thirtyDaysAgo = Date.now() - 30 * 24 * 60 * 60 * 1000;
  const recentSales = movements.filter(m => m.type === 'EXIT' && m.subType === 'SALE' && new Date(m.date).getTime() > thirtyDaysAgo);

  const suggestions = [];

  for (const product of products.filter(p => p.status === 'active')) {
    const qty = stockMap[product.id] || 0;
    if (qty > product.minStock * 1.5) continue;

    // Calculate average daily consumption
    const productSales = recentSales.filter(m => m.productId === product.id);
    const totalSold = Math.abs(productSales.reduce((a, m) => a + (m.quantity || 0), 0));
    const avgDailyConsumption = totalSold / 30;

    // Days of stock remaining
    const daysRemaining = avgDailyConsumption > 0 ? Math.floor(qty / avgDailyConsumption) : 999;

    // Suggested order quantity (30-day supply)
    const suggestedQty = Math.max(product.minStock * 3, Math.ceil(avgDailyConsumption * 30));

    suggestions.push({
      product,
      currentStock: qty,
      avgDailyConsumption: avgDailyConsumption.toFixed(2),
      daysRemaining,
      suggestedQty,
      urgency: daysRemaining <= 7 ? 'critical' : daysRemaining <= 14 ? 'high' : 'medium',
    });
  }

  return suggestions.sort((a, b) => a.daysRemaining - b.daysRemaining);
}

// Render reorder suggestions panel
async function renderReorderSuggestions(container) {
  UI.loading(container, 'Calcul des suggestions de réapprovisionnement...');

  const suggestions = await generateReorderSuggestions();
  
  // Initialiser les stats de liste pour la pagination
  suggestions.forEach(s => {
    s.selected = true;
    s.suggestedQtyToOrder = s.suggestedQty;
  });
  window._reorderSuggestions = suggestions;
  window._reorderPage = 1;

  if (suggestions.length === 0) {
    UI.empty(container, 'Tous les stocks sont suffisants', 'package');
    return;
  }

  const criticalCount = suggestions.filter(s => s.urgency === 'critical').length;
  const highCount = suggestions.filter(s => s.urgency === 'high').length;

  container.innerHTML = `
    <div class="page-header">
      <div>
        <h1 class="page-title">Suggestions de Réapprovisionnement</h1>
        <p class="page-subtitle">Basé sur la consommation des 30 derniers jours</p>
      </div>
      <div class="header-actions">
        <button class="btn btn-secondary" onclick="Router.navigate('purchase-orders')"><i data-lucide="file-text"></i> Bons de Commande</button>
      </div>
    </div>

    <div class="stats-bar">
      <div class="stat-chip stat-red"><span class="stat-val">${criticalCount}</span><span class="stat-label">Urgents &lt;7j</span></div>
      <div class="stat-chip stat-orange"><span class="stat-val">${highCount}</span><span class="stat-label">Prioritaires &lt;14j</span></div>
      <div class="stat-chip stat-blue"><span class="stat-val">${suggestions.length}</span><span class="stat-label">Total à commander</span></div>
    </div>

    <div id="reorder-table-container"></div>
  `;
  renderReorderTable();
}

function updateReorderState(idx, key, val) {
  if (!window._reorderSuggestions) return;
  if (key === 'selected') window._reorderSuggestions[idx].selected = val;
  if (key === 'qty') window._reorderSuggestions[idx].suggestedQtyToOrder = parseInt(val) || 0;
}

function renderReorderTable() {
  const container = document.getElementById('reorder-table-container');
  if (!container) return;

  const suggestions = window._reorderSuggestions || [];
  const PAGE_SIZE = 50;
  const totalPages = Math.max(1, Math.ceil(suggestions.length / PAGE_SIZE));
  if (window._reorderPage > totalPages) window._reorderPage = totalPages;
  const start = (window._reorderPage - 1) * PAGE_SIZE;
  const pageData = suggestions.slice(start, start + PAGE_SIZE);

  container.innerHTML = `
    <div class="table-wrapper">
      <table class="data-table">
        <thead>
          <tr>
            <th><input type="checkbox" id="select-all-suggestions" onchange="toggleAllSuggestions(this)" checked></th>
            <th>Produit</th>
            <th>Stock actuel</th>
            <th>Conso/jour</th>
            <th>Jours restants</th>
            <th>Qté suggérée</th>
            <th>Urgence</th>
            <th>Commander</th>
          </tr>
        </thead>
        <tbody>
          ${pageData.map((s, i) => {
            const originalIdx = start + i;
            return `
            <tr>
              <td><input type="checkbox" class="suggestion-cb" data-idx="${originalIdx}" ${s.selected ? 'checked' : ''} onchange="updateReorderState(${originalIdx}, 'selected', this.checked)"></td>
              <td>
                <div><strong>${s.product.name}</strong></div>
                <div class="text-muted text-sm">${s.product.category}</div>
              </td>
              <td>
                <span class="${s.currentStock === 0 ? 'text-danger' : s.currentStock <= s.product.minStock ? 'text-warning' : 'text-success'} font-bold">${s.currentStock}</span>
                <span class="text-muted text-sm"> / min ${s.product.minStock}</span>
              </td>
              <td>${s.avgDailyConsumption}</td>
              <td>
                <span class="badge badge-${s.urgency === 'critical' ? 'danger' : s.urgency === 'high' ? 'warning' : 'info'}">
                  ${s.daysRemaining >= 999 ? '∞' : s.daysRemaining + 'j'}
                </span>
              </td>
              <td><input type="number" class="input-sm" id="suggest-qty-${originalIdx}" value="${s.suggestedQtyToOrder}" min="1" style="width:70px" onchange="updateReorderState(${originalIdx}, 'qty', this.value)"></td>
              <td><span class="badge badge-${s.urgency === 'critical' ? 'danger' : s.urgency === 'high' ? 'warning' : 'info'}">${s.urgency === 'critical' ? 'Critique' : s.urgency === 'high' ? 'Haute' : 'Normale'}</span></td>
              <td>
                <button class="btn btn-xs btn-primary" onclick="quickOrder(${s.product.id}, '${s.product.name.replace(/'/g, "\\'")}')">Commander</button>
              </td>
            </tr>`;
          }).join('')}
        </tbody>
      </table>
    </div>
    
    <div style="margin-top:16px; margin-bottom:16px;">
      <button class="btn btn-primary btn-block" onclick="createOrderFromSuggestions()"><i data-lucide="shopping-cart"></i> Générer le Bon de Commande MASSIVE</button>
    </div>

    <div style="display:flex;justify-content:space-between;align-items:center;padding:16px 0;gap:12px;flex-wrap:wrap;">
      <span style="font-size:13px;color:var(--text-muted)">${suggestions.length.toLocaleString()} suggestions — Page ${window._reorderPage}/${totalPages}</span>
      <div style="display:flex;gap:8px;">
        <button class="btn btn-secondary btn-sm" ${window._reorderPage <= 1 ? 'disabled' : ''} onclick="window._reorderPage--;renderReorderTable()">◀ Précédent</button>
        <button class="btn btn-secondary btn-sm" ${window._reorderPage >= totalPages ? 'disabled' : ''} onclick="window._reorderPage++;renderReorderTable()">Suivant ▶</button>
      </div>
    </div>
  `;
  if (window.lucide) lucide.createIcons();
}

function toggleAllSuggestions(cb) {
  if (!window._reorderSuggestions) return;
  window._reorderSuggestions.forEach(s => s.selected = cb.checked);
  renderReorderTable();
}

async function createOrderFromSuggestions() {
  const suggestions = window._reorderSuggestions || [];
  const selected = suggestions.filter(s => s.selected);

  if (selected.length === 0) {
    UI.toast('Sélectionnez au moins un produit', 'warning');
    return;
  }

  const suppliers = await DB.dbGetAll('suppliers');
  if (suppliers.length === 0) {
    UI.toast('Aucun fournisseur enregistré', 'warning');
    return;
  }

  // Get quantities from state
  const items = selected.map((s, i) => {
    return { 
      productId: s.product.id, 
      productName: s.product.name, 
      quantity: s.suggestedQtyToOrder || s.suggestedQty, 
      unitPrice: s.product.purchasePrice || 0, 
      receivedQty: 0 
    };
  });

  const totalAmount = items.reduce((a, i) => a + i.quantity * i.unitPrice, 0);
  const orderId = await DB.dbAdd('purchaseOrders', {
    supplierId: suppliers[0].id,
    orderNumber: `BC-AUTO-${new Date().getFullYear()}-${String(Date.now()).slice(-5)}`,
    date: new Date().toISOString().split('T')[0],
    expectedDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
    items,
    totalAmount,
    status: 'pending',
    note: 'Commande générée automatiquement depuis les suggestions de réapprovisionnement',
    createdBy: DB.AppState.currentUser?.id,
  });

  await DB.writeAudit('AUTO_ORDER', 'purchaseOrders', orderId, { itemCount: items.length, totalAmount });
  UI.toast(`Bon de commande BC-AUTO créé — ${items.length} produit(s)`, 'success', 4000);
  Router.navigate('purchase-orders');
}

async function quickOrder(productId, productName) {
  const suppliers = await DB.dbGetAll('suppliers');
  if (suppliers.length === 0) {
    UI.toast('Ajoutez d\'abord un fournisseur', 'warning');
    return;
  }
  await showNewOrder(suppliers[0].id, suppliers[0].name, productId);
}

window.AlertsEngine = AlertsEngine;
window.generateReorderSuggestions = generateReorderSuggestions;
window.renderReorderSuggestions = renderReorderSuggestions;
window.toggleAllSuggestions = toggleAllSuggestions;
window.createOrderFromSuggestions = createOrderFromSuggestions;
window.quickOrder = quickOrder;

Router.register('reorder', (container) => renderReorderSuggestions(container));
