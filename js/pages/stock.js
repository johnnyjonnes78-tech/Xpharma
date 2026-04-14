/**
 * PHARMA_PROJET — Gestion des Stocks
 */

async function renderStock(container) {
  UI.loading(container, 'Chargement des stocks...');

  const [products, stockAll, lots] = await Promise.all([
    DB.dbGetAll('products'),
    DB.dbGetAll('stock'),
    DB.dbGetAll('lots'),
  ]);

  const stockMap = {};
  stockAll.forEach(s => { stockMap[s.productId] = s; });

  const stockData = products.map(p => ({
    ...p,
    currentStock: stockMap[p.id]?.quantity || 0,
    reservedQty: stockMap[p.id]?.reservedQuantity || 0,
    lots: lots.filter(l => l.productId === p.id && l.status === 'active'),
  }));

  // Stats
  const totalProducts = products.length;
  const inStock = stockData.filter(p => p.currentStock > 0).length;
  const ruptures = stockData.filter(p => p.currentStock === 0).length;
  const lowStock = stockData.filter(p => p.currentStock > 0 && p.currentStock <= p.minStock).length;

  const today = new Date();
  const alertExpiry = lots.filter(l => {
    const days = UI.daysUntilExpiry(l.expiryDate);
    return l.status === 'active' && days !== null && days <= 90;
  }).length;

  container.innerHTML = `
    <div class="page-header">
      <div>
        <h1 class="page-title">Gestion des Stocks</h1>
        <p class="page-subtitle">Inventaire temps réel — ${totalProducts} produits référencés</p>
      </div>
      <div class="header-actions">
        <button class="btn btn-secondary" onclick="renderStockInventory()"><i data-lucide="clipboard-list"></i> Inventaire</button>
        <button class="btn btn-primary" onclick="renderStockEntry()"><i data-lucide="plus"></i> Entrée Stock</button>
      </div>
    </div>

    <div class="stats-bar">
      <div class="stat-chip stat-blue"><span class="stat-val">${totalProducts}</span><span class="stat-label">Produits</span></div>
      <div class="stat-chip stat-green"><span class="stat-val">${inStock}</span><span class="stat-label">En Stock</span></div>
      <div class="stat-chip stat-orange"><span class="stat-val">${lowStock}</span><span class="stat-label">Stock Bas</span></div>
      <div class="stat-chip stat-red"><span class="stat-val">${ruptures}</span><span class="stat-label">Ruptures</span></div>
      <div class="stat-chip stat-purple"><span class="stat-val">${alertExpiry}</span><span class="stat-label">Exp. < 90j</span></div>
    </div>

    <!-- Filters -->
    <div class="filter-bar">
      <input type="text" id="stock-search" placeholder="Chercher un produit..." class="filter-input" oninput="filterStock()">
      <select id="stock-filter-status" class="filter-select" onchange="filterStock()">
        <option value="">Tous les états</option>
        <option value="ok">En stock normal</option>
        <option value="low">Stock bas</option>
        <option value="rupture">Rupture</option>
        <option value="expiry">Expiration proche</option>
      </select>
      <select id="stock-filter-category" class="filter-select" onchange="filterStock()">
        <option value="">Toutes catégories</option>
        ${[...new Set(products.map(p => p.category))].map(c => `<option value="${c}">${c}</option>`).join('')}
      </select>
    </div>

    <div id="stock-table-container"></div>
  `;

  window._stockData = stockData;
  renderStockTable(stockData);

  document.getElementById('stock-search').focus();
}

function filterStock() {
  const search = document.getElementById('stock-search')?.value.toLowerCase() || '';
  const status = document.getElementById('stock-filter-status')?.value || '';
  const category = document.getElementById('stock-filter-category')?.value || '';

  let data = window._stockData || [];

  if (search) data = data.filter(p =>
    p.name.toLowerCase().includes(search) ||
    (p.dci || '').toLowerCase().includes(search) ||
    (p.code || '').toLowerCase().includes(search)
  );

  if (category) data = data.filter(p => p.category === category);

  if (status === 'rupture') data = data.filter(p => p.currentStock === 0);
  else if (status === 'low') data = data.filter(p => p.currentStock > 0 && p.currentStock <= p.minStock);
  else if (status === 'ok') data = data.filter(p => p.currentStock > p.minStock);
  else if (status === 'expiry') data = data.filter(p =>
    p.lots.some(l => { const d = UI.daysUntilExpiry(l.expiryDate); return d !== null && d <= 90; })
  );

  renderStockTable(data);
}

function renderStockTable(data) {
  const container = document.getElementById('stock-table-container');
  if (!container) return;

  // Pagination
  const PAGE_SIZE = 50;
  window._filteredStock = data;
  window._stockPage = window._stockPage || 1;
  if (data !== window._lastFilteredStock) {
    window._stockPage = 1;
    window._lastFilteredStock = data;
  }
  const totalPages = Math.max(1, Math.ceil(data.length / PAGE_SIZE));
  if (window._stockPage > totalPages) window._stockPage = totalPages;
  const start = (window._stockPage - 1) * PAGE_SIZE;
  const pageData = data.slice(start, start + PAGE_SIZE);

  const columns = [
    { label: 'Code', key: 'code', render: r => `<code class="code-tag">${r.code}</code>` },
    {
      label: 'Médicament', render: r => `
      <div class="product-name-cell">
        <strong>${r.name}</strong>
        <span class="text-muted text-sm">${r.dci || r.brand || ''}</span>
      </div>` },
    { label: 'Catégorie', render: r => `<span class="category-tag">${r.category}</span>` },
    { label: 'Stock', render: r => UI.stockBadge(r.currentStock, r.minStock, r) },
    { label: 'Min. Seuil', key: 'minStock' },
    { label: 'Lots actifs', render: r => `<span class="text-center">${r.lots.length}</span>` },
    {
      label: 'Prochaine Exp.', render: r => {
        if (!r.lots.length) return '—';
        const nearestLot = r.lots.sort((a, b) => new Date(a.expiryDate) - new Date(b.expiryDate))[0];
        return UI.expiryBadge(nearestLot.expiryDate);
      }
    },
    { label: 'Prix Vente', render: r => UI.formatCurrency(r.salePrice) },
    { label: 'Rx', render: r => r.requiresPrescription ? '<span class="badge badge-warning">Rx</span>' : '<span class="badge badge-neutral">OTC</span>' },
    {
      label: 'Actions', render: r => `
      <div class="actions-cell">
        <button class="btn btn-xs btn-primary" onclick="viewProductLots(${r.id})" title="Voir les lots"><i data-lucide="package"></i></button>
        <button class="btn btn-xs btn-secondary" onclick="showStockMovements(${r.id})" title="Mouvements"><i data-lucide="clipboard-list"></i></button>
        <button class="btn btn-xs btn-ghost" onclick="editProduct(${r.id})" title="Modifier"><i data-lucide="edit-3"></i></button>
      </div>` },
  ];

  UI.table(container, columns, pageData, {
    emptyMessage: 'Aucun produit trouvé',
    emptyIcon: 'package',
  });

  // Pagination controls
  const pagDiv = document.createElement('div');
  pagDiv.style.cssText = 'display:flex;justify-content:space-between;align-items:center;padding:16px 0;gap:12px;flex-wrap:wrap;';
  pagDiv.innerHTML = `
    <span style="font-size:13px;color:var(--text-muted)">${data.length.toLocaleString()} produits — Page ${window._stockPage}/${totalPages}</span>
    <div style="display:flex;gap:8px;">
      <button class="btn btn-secondary btn-sm" ${window._stockPage <= 1 ? 'disabled' : ''} onclick="window._stockPage--;renderStockTable(window._filteredStock)">◀ Précédent</button>
      <button class="btn btn-secondary btn-sm" ${window._stockPage >= totalPages ? 'disabled' : ''} onclick="window._stockPage++;renderStockTable(window._filteredStock)">Suivant ▶</button>
    </div>
  `;
  container.appendChild(pagDiv);
  if (window.lucide) lucide.createIcons();
}

async function viewProductLots(productId) {
  const [product, lots, stock] = await Promise.all([
    DB.dbGet('products', productId),
    DB.dbGetAll('lots', 'productId', productId),
    DB.dbGetAll('stock', 'productId', productId),
  ]);

  const lotsHTML = lots.length === 0 ? '<p class="text-muted text-center">Aucun lot enregistré</p>' : `
    <table class="data-table">
      <thead>
        <tr><th>N° Lot</th><th>Quantité</th><th>Expiration</th><th>Réception</th><th>Statut</th></tr>
      </thead>
      <tbody>
        ${lots.map(l => `
          <tr>
            <td><code>${l.lotNumber}</code></td>
            <td><strong>${l.quantity}</strong> / ${l.initialQuantity}</td>
            <td>${UI.expiryBadge(l.expiryDate)}</td>
            <td>${UI.formatDate(l.receiptDate)}</td>
            <td><span class="badge badge-${l.status === 'active' ? 'success' : 'neutral'}">${l.status}</span></td>
          </tr>`).join('')}
      </tbody>
    </table>`;

  UI.modal(`<i data-lucide="package" class="modal-icon-inline"></i> Lots — ${product?.name}`, lotsHTML, { size: 'large' });
  if (window.lucide) lucide.createIcons();
}

async function showStockMovements(productId) {
  const [product, movements] = await Promise.all([
    DB.dbGet('products', productId),
    DB.dbGetAll('movements', 'productId', productId),
  ]);

  const sorted = movements.sort((a, b) => new Date(b.date) - new Date(a.date)).slice(0, 30);

  const movHTML = sorted.length === 0 ? '<p class="text-muted text-center">Aucun mouvement</p>' : `
    <table class="data-table">
      <thead><tr><th>Date</th><th>Type</th><th>Quantité</th><th>Réf.</th><th>Note</th></tr></thead>
      <tbody>
        ${sorted.map(m => `
          <tr>
            <td>${UI.formatDate(m.date)}</td>
            <td><span class="badge badge-${m.type === 'ENTRY' ? 'success' : 'warning'}">${m.type === 'ENTRY' ? '<i data-lucide="arrow-up"></i> Entrée' : '<i data-lucide="arrow-down"></i> Sortie'}</span></td>
            <td class="${m.quantity > 0 ? 'text-success' : 'text-danger'} font-bold">${m.quantity > 0 ? '+' : ''}${m.quantity}</td>
            <td><code class="code-tag">${m.reference || m.lotNumber || '—'}</code></td>
            <td class="text-muted">${m.note || '—'}</td>
          </tr>`).join('')}
      </tbody>
    </table>`;

  UI.modal(`<i data-lucide="clipboard-list" class="modal-icon-inline"></i> Mouvements — ${product?.name}`, movHTML, { size: 'large' });
  if (window.lucide) lucide.createIcons();
}

function renderStockEntry() {
  const products = window._stockData || [];
  const formHTML = `
    <form id="stock-entry-form" class="form-grid">
      <div class="form-group">
        <label>Produit *</label>
        <select name="productId" class="form-control" required>
          <option value="">Sélectionner un produit...</option>
          ${products.map(p => `<option value="${p.id}">${p.name} (${p.code})</option>`).join('')}
        </select>
      </div>
      <div class="form-row">
        <div class="form-group">
          <label>N° de Lot *</label>
          <input type="text" name="lotNumber" class="form-control" placeholder="LOT-2024-XXX" required>
        </div>
        <div class="form-group">
          <label>Quantité reçue *</label>
          <input type="number" name="quantity" class="form-control" min="1" required>
        </div>
      </div>
      <div class="form-row">
        <div class="form-group">
          <label>Date de fabrication</label>
          <input type="date" name="manufactureDate" class="form-control">
        </div>
        <div class="form-group">
          <label>Date d'expiration *</label>
          <input type="date" name="expiryDate" class="form-control" required>
        </div>
      </div>
      <div class="form-row">
        <div class="form-group">
          <label>Fournisseur</label>
          <input type="text" name="supplier" class="form-control" placeholder="Nom du fournisseur">
        </div>
        <div class="form-group">
          <label>Prix d'achat unitaire</label>
          <input type="number" name="purchasePrice" class="form-control" placeholder="0 GNF">
        </div>
      </div>
      <div class="form-group">
        <label>Note</label>
        <textarea name="note" class="form-control" rows="2" placeholder="Observations..."></textarea>
      </div>
    </form>
  `;

  const modal = UI.modal('<i data-lucide="plus-circle" class="modal-icon-inline"></i> Entrée Stock', formHTML, {
    footer: `
      <button class="btn btn-secondary" onclick="UI.closeModal()">Annuler</button>
      <button class="btn btn-primary" onclick="submitStockEntry()"><i data-lucide="check"></i> Enregistrer l'entrée</button>
    `
  });
  if (window.lucide) lucide.createIcons();
}

async function submitStockEntry() {
  const form = document.getElementById('stock-entry-form');
  if (!form || !form.checkValidity()) { form?.reportValidity(); return; }

  const data = Object.fromEntries(new FormData(form));

  try {
    const productId = parseInt(data.productId);

    // Add lot
    await DB.dbAdd('lots', {
      productId,
      lotNumber: data.lotNumber,
      expiryDate: data.expiryDate,
      manufactureDate: data.manufactureDate,
      quantity: parseInt(data.quantity),
      initialQuantity: parseInt(data.quantity),
      receiptDate: new Date().toISOString().split('T')[0],
      status: 'active',
    });

    // Update stock
    const stockAll = await DB.dbGetAll('stock');
    const existing = stockAll.find(s => s.productId === productId);
    if (existing) {
      await DB.dbPut('stock', { ...existing, quantity: existing.quantity + parseInt(data.quantity) });
    } else {
      await DB.dbAdd('stock', { productId, quantity: parseInt(data.quantity), reservedQuantity: 0 });
    }

    // Movement
    await DB.dbAdd('movements', {
      productId,
      type: 'ENTRY',
      subType: 'PURCHASE',
      quantity: parseInt(data.quantity),
      lotNumber: data.lotNumber,
      reference: data.lotNumber,
      date: new Date().toISOString(),
      userId: DB.AppState.currentUser?.id,
      note: data.note || 'Entrée stock',
    });

    await DB.writeAudit('STOCK_ENTRY', 'stock', productId, data);
    UI.closeModal();
    UI.toast('Entrée stock enregistrée', 'success');
    Router.navigate('stock');
  } catch (err) {
    UI.toast('Erreur : ' + err.message, 'error');
  }
}

async function editProduct(productId) {
  if (typeof editProductForm === 'function') {
    editProductForm(productId);
  } else {
    UI.toast('Module d\'édition non disponible', 'warning');
  }
}

// ═══════════════════════════════════════════════════════════════════
// INVENTAIRE PHYSIQUE
// ═══════════════════════════════════════════════════════════════════
async function renderStockInventory() {
  const [products, stockAll] = await Promise.all([
    DB.dbGetAll('products'),
    DB.dbGetAll('stock'),
  ]);

  const stockMap = {};
  stockAll.forEach(s => { stockMap[s.productId] = s.quantity || 0; });

  const inventoryItems = products.filter(p => p.status === 'active').map(p => ({
    id: p.id,
    code: p.code,
    name: p.name,
    category: p.category,
    systemQty: stockMap[p.id] || 0,
    physicalQty: stockMap[p.id] || 0,
    justification: '',
  }));

  UI.modal('<i data-lucide="clipboard-list" class="modal-icon-inline"></i> Inventaire Physique', `
    <div class="inventory-module">
      <div class="inventory-header-info">
        <p><strong>Date :</strong> ${new Date().toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}</p>
        <p><strong>Responsable :</strong> ${DB.AppState.currentUser?.name || '—'}</p>
        <p class="text-muted">Saisissez la quantité physique comptée pour chaque produit. Les écarts seront automatiquement calculés.</p>
      </div>
      <div class="filter-bar" style="margin:12px 0">
        <input type="text" id="inv-search" placeholder="Filtrer les produits..." class="filter-input" oninput="filterInventory()">
      </div>
      <div class="table-wrapper" style="max-height:50vh;overflow-y:auto">
        <table class="data-table" id="inventory-table">
          <thead>
            <tr>
              <th>Code</th>
              <th>Produit</th>
              <th>Catégorie</th>
              <th>Stock Système</th>
              <th>Qté Physique</th>
              <th>Écart</th>
              <th>Justification</th>
            </tr>
          </thead>
          <tbody>
            ${inventoryItems.map((item, i) => `
              <tr id="inv-row-${item.id}" data-name="${item.name.toLowerCase()}" data-code="${item.code.toLowerCase()}">
                <td><code class="code-tag">${item.code}</code></td>
                <td><strong>${item.name}</strong></td>
                <td><span class="category-tag">${item.category}</span></td>
                <td class="ta-c"><strong>${item.systemQty}</strong></td>
                <td>
                  <input type="number" class="form-control inv-qty-input" id="inv-qty-${item.id}"
                    value="${item.systemQty}" min="0" style="width:80px"
                    oninput="calcInventoryGap(${item.id}, ${item.systemQty})">
                </td>
                <td class="ta-c" id="inv-gap-${item.id}">
                  <span class="badge badge-success">0</span>
                </td>
                <td>
                  <input type="text" class="form-control" id="inv-just-${item.id}"
                    placeholder="Motif si écart..." style="width:150px">
                </td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
      <div class="inventory-summary" id="inv-summary" style="margin-top:12px;padding:12px;background:var(--bg-secondary,#f8f9fa);border-radius:8px">
        <strong>Résumé :</strong> <span id="inv-gap-count">0</span> écart(s) détecté(s)
      </div>
    </div>
  `, {
    size: 'large',
    footer: `
      <button class="btn btn-secondary" onclick="UI.closeModal()">Annuler</button>
      <button class="btn btn-warning" onclick="exportInventory()"><i data-lucide="download"></i> Exporter PV</button>
      <button class="btn btn-primary" onclick="validateInventory()"><i data-lucide="check-circle"></i> Valider l'inventaire</button>
    `
  });
  if (window.lucide) lucide.createIcons();
  window._inventoryItems = inventoryItems;
}

function filterInventory() {
  const q = document.getElementById('inv-search')?.value.toLowerCase() || '';
  document.querySelectorAll('#inventory-table tbody tr').forEach(row => {
    const name = row.dataset.name || '';
    const code = row.dataset.code || '';
    row.style.display = (!q || name.includes(q) || code.includes(q)) ? '' : 'none';
  });
}

function calcInventoryGap(productId, systemQty) {
  const physical = parseInt(document.getElementById(`inv-qty-${productId}`)?.value || 0);
  const gap = physical - systemQty;
  const el = document.getElementById(`inv-gap-${productId}`);
  if (el) {
    const cls = gap === 0 ? 'badge-success' : gap > 0 ? 'badge-info' : 'badge-danger';
    const prefix = gap > 0 ? '+' : '';
    el.innerHTML = `<span class="badge ${cls}">${prefix}${gap}</span>`;
  }
  // Update the items data
  const item = (window._inventoryItems || []).find(i => i.id === productId);
  if (item) item.physicalQty = physical;

  // Update total gap count
  const totalGaps = (window._inventoryItems || []).filter(i => {
    const qty = parseInt(document.getElementById(`inv-qty-${i.id}`)?.value || 0);
    return qty !== i.systemQty;
  }).length;
  const summary = document.getElementById('inv-gap-count');
  if (summary) summary.textContent = totalGaps;
}

async function validateInventory() {
  const items = window._inventoryItems || [];
  const gaps = [];

  for (const item of items) {
    const physical = parseInt(document.getElementById(`inv-qty-${item.id}`)?.value || 0);
    const justification = document.getElementById(`inv-just-${item.id}`)?.value || '';
    const gap = physical - item.systemQty;

    if (gap !== 0) {
      if (!justification.trim()) {
        UI.toast(`Justification requise pour ${item.name} (écart de ${gap > 0 ? '+' : ''}${gap})`, 'warning');
        document.getElementById(`inv-just-${item.id}`)?.focus();
        return;
      }
      gaps.push({ ...item, physical, gap, justification });
    }
  }

  if (gaps.length === 0) {
    UI.toast('Aucun écart détecté — Stock conforme', 'success');
    UI.closeModal();
    return;
  }

  const ok = await UI.confirm(`${gaps.length} écart(s) détecté(s).\n\nConfirmer l'ajustement des stocks ?\nCette opération est tracée dans le journal d'audit.`);
  if (!ok) return;

  try {
    for (const g of gaps) {
      const stockAll = await DB.dbGetAll('stock');
      const se = stockAll.find(s => s.productId === g.id);
      if (se) {
        await DB.dbPut('stock', { ...se, quantity: g.physical });
      } else {
        await DB.dbAdd('stock', { productId: g.id, quantity: g.physical, reservedQuantity: 0 });
      }

      await DB.dbAdd('movements', {
        productId: g.id,
        type: g.gap > 0 ? 'ENTRY' : 'EXIT',
        subType: 'INVENTORY_ADJUSTMENT',
        quantity: g.gap,
        date: new Date().toISOString(),
        userId: DB.AppState.currentUser?.id,
        reference: 'INVENTAIRE-' + new Date().toISOString().split('T')[0],
        note: `Ajustement inventaire : ${g.justification}`,
      });
    }

    await DB.writeAudit('INVENTORY', 'stock', null, {
      date: new Date().toISOString(),
      adjustments: gaps.length,
      details: gaps.map(g => ({ product: g.name, system: g.systemQty, physical: g.physical, gap: g.gap })),
    });

    UI.closeModal();
    UI.toast(`Inventaire validé — ${gaps.length} ajustement(s) appliqué(s)`, 'success', 5000);
    Router.navigate('stock');
  } catch (err) {
    UI.toast('Erreur : ' + err.message, 'error');
  }
}

function exportInventory() {
  const items = window._inventoryItems || [];
  const rows = items.map(item => {
    const physical = parseInt(document.getElementById(`inv-qty-${item.id}`)?.value || 0);
    const gap = physical - item.systemQty;
    const just = document.getElementById(`inv-just-${item.id}`)?.value || '';
    return [item.code, item.name, item.category, item.systemQty, physical, gap, just].join(',');
  });
  const csv = '\uFEFFCode,Produit,Catégorie,Stock Système,Stock Physique,Écart,Justification\n' + rows.join('\n');
  const blob = new Blob([csv], { type: 'text/csv' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `inventaire_${new Date().toISOString().split('T')[0]}.csv`;
  a.click();
  UI.toast('PV d\'inventaire exporté en CSV', 'success');
}

window.filterStock = filterStock;
window.viewProductLots = viewProductLots;
window.showStockMovements = showStockMovements;
window.renderStockEntry = renderStockEntry;
window.submitStockEntry = submitStockEntry;
window.editProduct = editProduct;
window.renderStockInventory = renderStockInventory;
window.filterInventory = filterInventory;
window.calcInventoryGap = calcInventoryGap;
window.validateInventory = validateInventory;
window.exportInventory = exportInventory;

Router.register('stock', renderStock);
