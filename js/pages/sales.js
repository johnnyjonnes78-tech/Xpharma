/**
 * OrdiveX — Ventes & Rapports Financiers
 */

async function renderSales(container) {
  UI.loading(container, 'Chargement des ventes...');
  const [sales, saleItems, allReturns] = await Promise.all([
    DB.dbGetAll('sales'),
    DB.dbGetAll('saleItems'),
    DB.dbGetAll('returns'),
  ]);

  const sorted = sales.sort((a, b) => new Date(b.date) - new Date(a.date));
  const today = new Date();
  const startOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);
  const monthSales = sales.filter(s => new Date(s.date) >= startOfMonth);

  const totalRevMonth = monthSales.reduce((a, s) => a + s.total, 0);
  const monthReturns = allReturns.filter(r => new Date(r.date) >= startOfMonth && r.status === 'approved');
  const monthRefunds = monthReturns.reduce((a, r) => a + (r.refundAmount || 0), 0);
  const netRevMonth = totalRevMonth - monthRefunds;

  const monthItems = saleItems.filter(si => monthSales.some(s => s.id === si.saleId));
  const rawMonthCOGS = monthItems.reduce((a, si) => a + (si.purchasePrice || 0) * si.quantity, 0);

  const monthRefundsCOGS = monthReturns.reduce((a, r) => {
    return a + (r.items || []).reduce((acc, ri) => {
      const si = saleItems.find(s => s.id === ri.saleItemId);
      return acc + (si?.purchasePrice || 0) * ri.quantity;
    }, 0);
  }, 0);

  const netMonthCOGS = rawMonthCOGS - monthRefundsCOGS;
  const monthProfit = netRevMonth - netMonthCOGS;

  // Payment breakdown
  const payCount = {};
  monthSales.forEach(s => { payCount[s.paymentMethod] = (payCount[s.paymentMethod] || 0) + 1; });

  container.innerHTML = `
    <div class="page-header">
      <div>
        <h1 class="page-title">Ventes & Rapports</h1>
        <p class="page-subtitle">Historique complet des transactions</p>
      </div>
      <div class="header-actions">
        ${DB.AppState.currentUser?.role !== 'caissier' ? `<button class="btn btn-secondary" onclick="Router.navigate('reports')"><i data-lucide="bar-chart-3"></i> Rapports avancés</button>` : ''}
        <button class="btn btn-primary" onclick="Router.navigate('pos')"><i data-lucide="shopping-cart"></i> Nouvelle Vente</button>
      </div>
    </div>

    <div class="kpi-grid kpi-grid-3">
      <div class="kpi-card kpi-blue">
        <div class="kpi-icon"><i data-lucide="banknote"></i></div>
        <div class="kpi-content">
          <div class="kpi-value">${UI.formatCurrency(netRevMonth)}</div>
          <div class="kpi-label">CA du mois (Net)</div>
          <div class="kpi-sub">${monthSales.length} ventes · ${monthReturns.length} retours</div>
        </div>
      </div>
      ${DB.AppState.currentUser?.role !== 'caissier' ? `
      <div class="kpi-card kpi-green">
        <div class="kpi-icon"><i data-lucide="trending-up"></i></div>
        <div class="kpi-content">
          <div class="kpi-value">${UI.formatCurrency(monthProfit)}</div>
          <div class="kpi-label">Marge brute mois (Net)</div>
          <div class="kpi-sub">${netRevMonth > 0 ? (monthProfit / netRevMonth * 100).toFixed(1) : 0}% du CA net</div>
        </div>
      </div>` : ''}
      <div class="kpi-card kpi-orange">
        <div class="kpi-icon"><i data-lucide="shopping-bag"></i></div>
        <div class="kpi-content">
          <div class="kpi-value">${monthSales.length > 0 ? UI.formatCurrency(netRevMonth / monthSales.length) : '—'}</div>
          <div class="kpi-label">Panier moyen (Net)</div>
          <div class="kpi-sub">Ce mois</div>
        </div>
      </div>
    </div>

    <div class="filter-bar">
      <input type="date" id="sales-from" class="filter-input" style="max-width:180px" onchange="filterSales()">
      <span class="filter-sep"><i data-lucide="arrow-right"></i></span>
      <input type="date" id="sales-to" class="filter-input" style="max-width:180px" onchange="filterSales()">
      <select id="sales-pay" class="filter-select" onchange="filterSales()">
        <option value="">Tous paiements</option>
        <option value="cash">Espèces</option>
        <option value="orange_money">Orange Money</option>
        <option value="mtn_momo">MTN MoMo</option>
        <option value="credit">Crédit</option>
        <option value="transfer">Virement</option>
      </select>
      <select id="sales-return-status" class="filter-select" onchange="filterSales()">
        <option value="">Tous statuts</option>
        <option value="normal">Ventes normales</option>
        <option value="partially_returned">Retour partiel</option>
        <option value="fully_returned">Entièrement retourné</option>
      </select>
      <button class="btn btn-ghost" onclick="exportSales()"><i data-lucide="download"></i> CSV</button>
    </div>

    <div id="sales-table-container"></div>
  `;

  // Set default date range (this month)
  document.getElementById('sales-from').value = startOfMonth.toISOString().split('T')[0];
  document.getElementById('sales-to').value = today.toISOString().split('T')[0];

  window._salesData = sorted;
  window._saleItemsData = saleItems;
  filterSales();
  if (window.lucide) lucide.createIcons();
}

function filterSales() {
  const from = document.getElementById('sales-from')?.value;
  const to = document.getElementById('sales-to')?.value;
  const pay = document.getElementById('sales-pay')?.value;
  const returnStatus = document.getElementById('sales-return-status')?.value;

  let data = window._salesData || [];

  if (from) data = data.filter(s => new Date(s.date) >= new Date(from));
  if (to) data = data.filter(s => new Date(s.date) <= new Date(to + 'T23:59:59'));
  if (pay) data = data.filter(s => s.paymentMethod === pay);
  if (returnStatus === 'normal') data = data.filter(s => !s.returnStatus);
  else if (returnStatus === 'partially_returned') data = data.filter(s => s.returnStatus === 'partially_returned');
  else if (returnStatus === 'fully_returned') data = data.filter(s => s.returnStatus === 'fully_returned');

  renderSalesTable(data);
}

function renderSalesTable(data) {
  const container = document.getElementById('sales-table-container');
  if (!container) return;

  // Pagination
  const PAGE_SIZE = 100;
  window._filteredSales = data;
  window._salesPage = window._salesPage || 1;
  if (data !== window._lastFilteredSales) {
    window._salesPage = 1;
    window._lastFilteredSales = data;
  }
  const totalPages = Math.max(1, Math.ceil(data.length / PAGE_SIZE));
  if (window._salesPage > totalPages) window._salesPage = totalPages;
  const start = (window._salesPage - 1) * PAGE_SIZE;
  const pageData = data.slice(start, start + PAGE_SIZE);

  const columns = [
    { label: 'N° Vente', render: r => `<code class="code-tag">#${String(r.id).padStart(6, '0')}</code>` },
    { label: 'Date & Heure', render: r => UI.formatDateTime(new Date(r.date).getTime()) },
    { label: 'Articles', render: r => `<span class="badge badge-neutral">${r.itemCount || '—'} art.</span>` },
    { label: 'Remise', render: r => r.discount > 0 ? `<span class="text-warning">-${UI.formatCurrency(r.discount)}</span>` : '—' },
    { label: 'Total', render: r => {
      if (r.paymentMethod === 'assurance' && r.assuranceAmount && r.status === 'pending') {
        const patientPart = Math.max(0, r.total - r.assuranceAmount);
        return `<div style="line-height:1.4">
          <strong class="text-success">${UI.formatCurrency(r.total)}</strong>
          <div style="font-size:10px;color:var(--text-muted)">🛡️ ${UI.formatCurrency(r.assuranceAmount)} · 👤 ${UI.formatCurrency(patientPart)}</div>
        </div>`;
      }
      return `<strong class="text-success">${UI.formatCurrency(r.total)}</strong>`;
    }},
    { label: 'Paiement', render: r => UI.paymentMethodBadge(r.paymentMethod) },
    {
      label: 'Statut', render: r => {
        const isPaid = r.status === 'completed' || r.status === 'paid';
        const isReturned = r.returnStatus === 'fully_returned';
        const isPartial = r.returnStatus === 'partially_returned';
        const isDebt = ['credit', 'assurance'].includes(r.paymentMethod);
        const debtLabel = r.paymentMethod === 'assurance' ? 'Couverture' : 'Dette';
        
        const label = isReturned ? 'Retourné'
          : isPartial ? 'Ret. partiel'
          : isDebt ? (isPaid ? `${debtLabel} Réglée` : `${debtLabel} en cours`) : 'Payé';
        const cls = isReturned ? 'badge-neutral' : isPartial ? 'badge-warning' : isPaid ? 'badge-success' : 'badge-warning';
        return `<span class="badge ${cls}">${label}</span>`;
      }
    },
    {
      label: 'Actions', render: r => {
        const isPending = r.status === 'pending' && ['credit', 'assurance'].includes(r.paymentMethod);
        const canSms = r.paymentMethod === 'credit' && r.status === 'pending' && r.patientId;
        return `
          <button class="btn btn-xs btn-primary" onclick="viewSaleDetail(${r.id})">Détail</button>
          ${canSms ? `<button class="btn btn-xs" style="margin-left:4px;background:var(--info);color:white;border:none" onclick="openSmsModal(${r.patientId})" title="Envoyer rappel SMS"><i data-lucide="message-square" style="width:12px;height:12px"></i></button>` : ''}
          ${isPending ? `<button class="btn btn-xs btn-success" style="margin-left:4px" onclick="settleDebt(${r.id})"><i data-lucide="check-circle" style="width:12px;height:12px"></i> Encaisser</button>` : ''}
        `;
      }
    },
  ];

  UI.table(container, columns, pageData, { emptyMessage: 'Aucune vente pour cette période', emptyIcon: 'shopping-cart' });

  // Pagination controls
  const pagDiv = document.createElement('div');
  pagDiv.style.cssText = 'display:flex;justify-content:space-between;align-items:center;padding:16px 0;gap:12px;flex-wrap:wrap;';
  pagDiv.innerHTML = `
    <span style="font-size:13px;color:var(--text-muted)">${data.length.toLocaleString()} ventes — Page ${window._salesPage}/${totalPages}</span>
    <div style="display:flex;gap:8px;">
      <button class="btn btn-secondary btn-sm" ${window._salesPage <= 1 ? 'disabled' : ''} onclick="window._salesPage--;renderSalesTable(window._filteredSales)">◀ Précédent</button>
      <button class="btn btn-secondary btn-sm" ${window._salesPage >= totalPages ? 'disabled' : ''} onclick="window._salesPage++;renderSalesTable(window._filteredSales)">Suivant ▶</button>
    </div>
  `;
  container.appendChild(pagDiv);
  if (window.lucide) lucide.createIcons();
}

async function viewSaleDetail(saleId) {
  const [sale, items] = await Promise.all([
    DB.dbGet('sales', saleId),
    DB.dbGetAll('saleItems', 'saleId', saleId),
  ]);

  if (!sale) return;

  const profit = items.reduce((a, i) => a + ((i.unitPrice - (i.purchasePrice || 0)) * i.quantity), 0);

  UI.modal(`<i data-lucide="shopping-bag" class="modal-icon-inline"></i> Vente #${String(saleId).padStart(6, '0')}`, `
      <div class="sale-detail">
      <div class="detail-meta">
        <span><i data-lucide="calendar"></i> ${UI.formatDateTime(new Date(sale.date).getTime())}</span>
        <span><i data-lucide="user"></i> Patient: <strong>${sale.patientName || 'Patient Comptant'}</strong></span>
        <span><i data-lucide="user-check"></i> Vendeur: <strong>${sale.sellerName || (sale.userId ? 'Utilisateur #' + sale.userId : '—')}</strong></span>
        <span>${UI.paymentMethodBadge(sale.paymentMethod)}</span>
      </div>
      
      ${sale.insuranceDetails && sale.insuranceDetails.length > 0 ? `
        <div style="background:var(--bg); border:1px solid var(--border); border-radius:6px; padding:10px; margin-top:12px; font-size:12px;">
          <h5 style="margin:0 0 8px 0; font-size:12px; color:var(--text)"><i data-lucide="shield"></i> Prise(s) en charge</h5>
          <div style="display:grid; gap:6px;">
            ${sale.insuranceDetails.map(ins => `
              <div style="display:flex; justify-content:space-between">
                <span>${ins.name} ${ins.ref ? `<span style="color:var(--text-muted)">(${ins.ref})</span>` : ''}</span>
                <strong style="color:#1A56DB">${UI.formatCurrency(ins.amount)}</strong>
              </div>
            `).join('')}
          </div>
        </div>
      ` : (sale.paymentMethod === 'assurance' && sale.assuranceName ? `
        <div style="background:var(--bg); border:1px solid var(--border); border-radius:6px; padding:10px; margin-top:12px; font-size:12px; display:flex; justify-content:space-between">
          <span><i data-lucide="shield"></i> <strong>${sale.assuranceName}</strong> ${sale.assuranceRef ? `(${sale.assuranceRef})` : ''}</span>
          <strong style="color:#1A56DB">${UI.formatCurrency(sale.assuranceAmount)}</strong>
        </div>
      ` : '')}

      <table class="data-table" style="margin-top:12px">
        <thead><tr><th>Médicament</th><th>Qté</th><th>Prix unit.</th><th>Total</th></tr></thead>
        <tbody>
          ${items.map(i => `
            <tr>
              <td>${i.productName}</td>
              <td>${i.quantity}</td>
              <td>${UI.formatCurrency(i.unitPrice)}</td>
              <td><strong>${UI.formatCurrency(i.total)}</strong></td>
            </tr>`).join('')}
        </tbody>
        <tfoot>
          <tr class="table-footer-row">
            <td colspan="3"><strong>Total</strong></td>
            <td><strong class="text-success">${UI.formatCurrency(sale.total)}</strong></td>
          </tr>
          ${DB.AppState.currentUser?.role !== 'caissier' ? `
          <tr class="table-footer-row">
            <td colspan="3">Marge brute</td>
            <td><strong>${UI.formatCurrency(profit)}</strong></td>
          </tr>` : ''}
        </tfoot>
      </table>
    </div>
    ${['credit', 'assurance'].includes(sale.paymentMethod) && sale.status !== 'paid' && sale.status !== 'completed' ? `
      <div class="modal-actions" style="margin-top:20px; border-top: 1px solid var(--border); padding-top:15px; display:flex; justify-content:flex-end;">
        <button class="btn btn-success" onclick="UI.closeModal(); settleDebt(${saleId})">
          <i data-lucide="check-circle"></i> ${sale.paymentMethod === 'assurance' ? 'Encaisser la part Assurance' : 'Encaisser la dette'}
        </button>
      </div>
    ` : ''}
  `, { size: 'large', footer: ' ' });
  if (window.lucide) lucide.createIcons();

  // Injecter les boutons d'actions supplémentaires (Facture & Retour)
  const _saleAge = Date.now() - new Date(sale.date).getTime();
  const _RETURN_MS = 72 * 60 * 60 * 1000;
  const _canReturn = _saleAge <= _RETURN_MS
    && ['completed', 'paid'].includes(sale.status)
    && sale.returnStatus !== 'fully_returned'
    && DB.AppState.currentUser?.role !== 'caissier';

  const _footer = document.querySelector('.modal-footer');
  if (_footer) {
    _footer.style.justifyContent = 'space-between';

    const _leftActions = document.createElement('div');
    _leftActions.style.display = 'flex';
    _leftActions.style.gap = '8px';

    // Bouton de retour (si autorisé)
    if (_canReturn && typeof openNewReturn === 'function') {
      const _hoursLeft = Math.max(0, Math.round((_RETURN_MS - _saleAge) / 3600000));
      const _btnR = document.createElement('button');
      _btnR.className = 'btn btn-warning';
      _btnR.innerHTML = `<i data-lucide="undo-2"></i> Initier un Retour <span style="font-size:0.78em;opacity:0.8;margin-left:4px">(${_hoursLeft}h)</span>`;
      _btnR.onclick = () => { UI.closeModal(); setTimeout(() => openNewReturn(saleId), 200); };
      _leftActions.appendChild(_btnR);
    }

    // Bouton Facture PRO
    const _btnFacture = document.createElement('button');
    _btnFacture.className = 'btn btn-primary';
    _btnFacture.innerHTML = `<i data-lucide="printer"></i> Imprimer Facture PRO`;
    _btnFacture.onclick = () => { 
      UI.closeModal(); 
      if (typeof afficherRecu === 'function') {
        setTimeout(() => afficherRecu(saleId, items, sale), 200); 
      } else {
        UI.toast('Module reçu indisponible', 'error');
      }
    };
    _leftActions.appendChild(_btnFacture);

    _footer.insertBefore(_leftActions, _footer.firstChild);
    if (window.lucide) lucide.createIcons();
  }
}

function exportSales() {
  const data = window._salesData || [];
  const csv = '\uFEFFN° Vente,Date,Total,Remise,Paiement,Statut\n' +
    data.map(s => [s.id, UI.formatDateTime(new Date(s.date).getTime()), s.total, s.discount || 0, s.paymentMethod, s.status].join(',')).join('\n');
  const blob = new Blob([csv], { type: 'text/csv' });
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob);
  a.download = 'ventes_' + new Date().toISOString().split('T')[0] + '.csv';
  a.click();
  UI.toast('Export CSV téléchargé', 'success');
}

async function renderReports(container) {
  UI.loading(container, 'Génération des rapports...');

  // Attendre que le pull finisse
  if (DB._isPulling) {
    let waited = 0;
    while (DB._isPulling && waited < 90000) {
      await new Promise(r => setTimeout(r, 500));
      waited += 500;
    }
  }

  const productCount = await DB.dbCount('products').catch(() => 0);
  const [sales, saleItems, stockAll, allReturns] = await Promise.all([
    DB.dbGetAll('sales'),
    DB.dbGetAll('saleItems'),
    DB.dbGetAll('stock'),
    DB.dbGetAll('returns'),
  ]);

  // Mode léger si catalogue > 50k
  let products;
  if (productCount > 50000) {
    products = stockAll.map(s => ({ id: s.productId, category: 'Catalogue', purchasePrice: 0, salePrice: 0 }));
  } else {
    products = await DB.dbGetAll('products');
  }

  // Index rapide pour éviter les .find() O(n²)
  const stockMap = {};
  stockAll.forEach(s => { stockMap[s.productId] = s; });
  const productMap = {};
  products.forEach(p => { productMap[p.id] = p; });

  await new Promise(r => setTimeout(r, 10));

  const today = new Date();
  // Last 6 months
  const months = [];
  const monthLabels = [];
  const monthRevenues = [];
  const monthProfits = [];
  for (let m = 5; m >= 0; m--) {
    const d = new Date(today.getFullYear(), today.getMonth() - m, 1);
    const end = new Date(today.getFullYear(), today.getMonth() - m + 1, 0, 23, 59, 59);
    const ms = sales.filter(s => { const sd = new Date(s.date); return sd >= d && sd <= end && ['completed', 'paid'].includes(s.status); });
    const rs = allReturns.filter(r => { const rd = new Date(r.date); return rd >= d && rd <= end && r.status === 'approved'; });

    const rev = ms.reduce((a, s) => a + s.total, 0) - rs.reduce((a, r) => a + (r.refundAmount || 0), 0);

    // Index saleIds pour O(1) lookup au lieu de .some() O(n)
    const msIds = new Set(ms.map(s => s.id));
    const mis = saleItems.filter(si => msIds.has(si.saleId));
    const rawCogs = mis.reduce((a, i) => a + (i.purchasePrice || 0) * i.quantity, 0);
    const returnCogs = rs.reduce((a, r) => {
      return a + (r.items || []).reduce((acc, ri) => {
        const si = saleItems.find(s => s.id === ri.saleItemId);
        return acc + (si?.purchasePrice || 0) * ri.quantity;
      }, 0);
    }, 0);
    const netCogs = rawCogs - returnCogs;

    monthLabels.push(['Jan', 'Fév', 'Mar', 'Avr', 'Mai', 'Jun', 'Jul', 'Aoû', 'Sep', 'Oct', 'Nov', 'Déc'][d.getMonth()]);
    monthRevenues.push(rev);
    monthProfits.push(rev - netCogs);
  }

  // Top products all time
  const prodRevenue = {};
  saleItems.forEach(si => { prodRevenue[si.productName] = (prodRevenue[si.productName] || 0) + si.total; });
  const topProds = Object.entries(prodRevenue).sort((a, b) => b[1] - a[1]).slice(0, 10);

  // Category breakdown — utiliser productMap O(1) au lieu de .find() O(n)
  const catRevenue = {};
  saleItems.forEach(si => {
    const p = productMap[si.productId];
    const cat = p?.category || 'Autre';
    catRevenue[cat] = (catRevenue[cat] || 0) + si.total;
  });

  // Stock value — utiliser stockMap O(1) au lieu de .find() O(n)
  const stockValue = products.reduce((a, p) => {
    const s = stockMap[p.id];
    return a + (s ? s.quantity * (p.purchasePrice || 0) : 0);
  }, 0);
  const stockSaleValue = products.reduce((a, p) => {
    const s = stockMap[p.id];
    return a + (s ? s.quantity * (p.salePrice || 0) : 0);
  }, 0);

  container.innerHTML = `
    <div class="page-header">
      <div>
        <h1 class="page-title">Rapports & Analytique</h1>
        <p class="page-subtitle">Intelligence décisionnelle — ${productCount.toLocaleString()} produits · ${sales.length} ventes</p>
      </div>
      <div class="header-actions">
        <button class="btn btn-secondary" onclick="window.print()"><i data-lucide="printer"></i> Imprimer</button>
      </div>
    </div>

    <div class="kpi-grid">
      <div class="kpi-card kpi-blue">
        <div class="kpi-icon"><i data-lucide="banknote"></i></div>
        <div class="kpi-content">
          <div class="kpi-value">${UI.formatCurrency(monthRevenues[monthRevenues.length - 1])}</div>
          <div class="kpi-label">CA Mois en Cours</div>
        </div>
      </div>
      <div class="kpi-card kpi-green">
        <div class="kpi-icon"><i data-lucide="package"></i></div>
        <div class="kpi-content">
          <div class="kpi-value">${stockValue > 0 ? UI.formatCurrency(stockValue) : (productCount > 50000 ? productCount.toLocaleString() + ' réf.' : '0 FG')}</div>
          <div class="kpi-label">${stockValue > 0 ? 'Valeur stock (achat)' : 'Produits en catalogue'}</div>
          <div class="kpi-sub">${stockValue > 0 ? 'Vente: ' + UI.formatCurrency(stockSaleValue) : stockAll.length + ' entrées en stock'}</div>
        </div>
      </div>
      <div class="kpi-card kpi-orange">
        <div class="kpi-icon"><i data-lucide="bar-chart-3"></i></div>
        <div class="kpi-content">
          <div class="kpi-value">${(() => {
      const curr = monthRevenues[monthRevenues.length - 1] || 0;
      const prev = monthRevenues[monthRevenues.length - 2] || 0;
      if (prev > 0) return ((curr - prev) / prev * 100).toFixed(1) + '%';
      if (curr > 0) return '↑ Nouveau';
      return '0%';
    })()}</div>
          <div class="kpi-label">Évolution vs mois précédent</div>
          <div class="kpi-sub">${(() => {
      const curr = monthRevenues[monthRevenues.length - 1] || 0;
      const prev = monthRevenues[monthRevenues.length - 2] || 0;
      if (prev > 0 && curr > prev) return '📈 En hausse';
      if (prev > 0 && curr < prev) return '📉 En baisse';
      if (prev > 0 && curr === prev) return '➡️ Stable';
      if (prev === 0 && curr > 0) return 'Aucune donnée mois passé';
      return 'Pas de ventes';
    })()}</div>
        </div>
      </div>
      <div class="kpi-card kpi-green">
        <div class="kpi-icon"><i data-lucide="trending-up"></i></div>
        <div class="kpi-content">
          <div class="kpi-value">${monthRevenues[monthRevenues.length - 1] > 0 ?
      (monthProfits[monthProfits.length - 1] / monthRevenues[monthRevenues.length - 1] * 100).toFixed(1) + '%' : '—'}</div>
          <div class="kpi-label">Taux de marge brute</div>
        </div>
      </div>
    </div>

    <div class="charts-row">
      <div class="chart-card">
        <div class="chart-header"><h3 class="chart-title">Évolution CA et Marge (6 mois)</h3></div>
        <canvas id="chart-monthly" width="500" height="280"></canvas>
      </div>
      <div class="chart-card" style="display: flex; flex-direction: column;">
        <div class="chart-header"><h3 class="chart-title">CA par Catégorie</h3></div>
        <div id="chart-categories-container" style="flex: 1; overflow-y: auto; padding-right: 8px; max-height: 280px; margin-top: 10px;"></div>
      </div>
    </div>

    <div class="reports-bottom">
      <div class="dash-panel panel-wide">
        <div class="panel-header"><h3 class="panel-title">🏆 Top 10 Produits — Tous Temps</h3></div>
        <div class="table-wrapper">
          <table class="data-table">
            <thead><tr><th>#</th><th>Produit</th><th>CA Total</th><th>Part</th></tr></thead>
            <tbody>
              ${(() => {
      const totalRev = topProds.reduce((a, b) => a + b[1], 0);
      return topProds.map(([name, rev], i) => `
                <tr>
                  <td><strong>${i + 1}</strong></td>
                  <td>${name}</td>
                  <td><strong>${UI.formatCurrency(rev)}</strong></td>
                  <td>
                    <div style="display:flex;align-items:center;gap:8px">
                      <div style="background:#e2e8f0;border-radius:3px;height:6px;width:80px;overflow:hidden">
                        <div style="background:#2E86C1;height:100%;width:${(rev / topProds[0][1] * 100).toFixed(0)}%"></div>
                      </div>
                      ${totalRev > 0 ? (rev / totalRev * 100).toFixed(1) : 0}%
                    </div>
                  </td>
                </tr>`).join('');
    })()}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  `;
  if (window.lucide) lucide.createIcons();

  requestAnimationFrame(() => {
    Charts.bar('chart-monthly', monthLabels, [
      { data: monthRevenues, color: '#2E86C1' },
      { data: monthProfits, color: '#1ABC9C' }
    ]);

    const catKeys = Object.keys(catRevenue).sort((a,b) => catRevenue[b] - catRevenue[a]);
    const totalCatRev = catKeys.reduce((acc, k) => acc + catRevenue[k], 0);
    const catContainer = document.getElementById('chart-categories-container');
    if (catContainer) {
      if (catKeys.length === 0) {
        catContainer.innerHTML = '<div class="empty-state-small">Aucune donnée</div>';
      } else {
        catContainer.innerHTML = catKeys.map(k => {
          const pct = totalCatRev > 0 ? (catRevenue[k] / totalCatRev * 100).toFixed(1) : 0;
          return `
            <div style="margin-bottom: 14px;">
              <div style="display:flex; justify-content:space-between; font-size:13px; font-weight:500; margin-bottom:4px; color:var(--text)">
                <span style="white-space:nowrap; overflow:hidden; text-overflow:ellipsis; max-width:60%;">${k}</span>
                <strong style="color:var(--text)">${UI.formatCurrency(catRevenue[k])} <span style="font-weight:normal; color:var(--text-muted); font-size:11px;">(${pct}%)</span></strong>
              </div>
              <div style="background:var(--border); height:8px; border-radius:4px; overflow:hidden;">
                 <div style="background:#3498db; height:100%; width:${pct}%; border-radius:4px;"></div>
              </div>
            </div>
          `;
        }).join('');
      }
    }
  });
}

async function settleDebt(saleId) {
  const sale = await DB.dbGet('sales', saleId);
  if (!sale) { UI.toast('Vente introuvable', 'error'); return; }

  const isAssurance = sale.paymentMethod === 'assurance';
  const debtAmount = isAssurance ? (sale.assuranceAmount || sale.total) : sale.total;
  const patientPart = isAssurance ? Math.max(0, sale.total - debtAmount) : 0;

  UI.modal('<i data-lucide="receipt" class="modal-icon-inline"></i> Encaissement', `
    <div style="display:flex;flex-direction:column;gap:16px">

      <!-- MONTANT PRINCIPAL -->
      <div style="text-align:center;padding:20px;background:#F8FAFC;border-radius:14px;border:2px solid #E2E8F0">
        <div style="font-size:11px;text-transform:uppercase;letter-spacing:1.5px;color:#64748B;font-weight:700;margin-bottom:6px">
          ${isAssurance ? '\ud83d\udee1\ufe0f Montant d\u00fb par l\'entreprise' : '\ud83d\udcb0 Montant total \u00e0 encaisser'}
        </div>
        <div style="font-size:38px;font-weight:900;color:#0F172A;letter-spacing:-1px">${UI.formatCurrency(debtAmount)}</div>
        <div style="font-size:12px;color:#94A3B8;margin-top:6px">
          Vente <strong style="color:#475569">#${String(saleId).padStart(6, '0')}</strong>
          ${sale.patientName ? ' \u00b7 <strong style="color:#475569">' + sale.patientName + '</strong>' : ''}
        </div>
      </div>

      ${isAssurance ? `
      <!-- VENTILATION -->
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">
        <div style="background:#EBF5FB;border-radius:10px;padding:14px;text-align:center;border:2px solid #BEE3F8">
          <div style="font-size:9px;text-transform:uppercase;letter-spacing:1px;color:#1E40AF;font-weight:800;margin-bottom:5px">\ud83d\udee1\ufe0f PART ENTREPRISE</div>
          <div style="font-size:20px;font-weight:900;color:#1E40AF">${UI.formatCurrency(debtAmount)}</div>
          <div style="font-size:10px;color:#6B7280;margin-top:3px">${sale.assuranceName || 'Assurance'}</div>
        </div>
        <div style="background:#ECFDF5;border-radius:10px;padding:14px;text-align:center;border:2px solid #A7F3D0">
          <div style="font-size:9px;text-transform:uppercase;letter-spacing:1px;color:#065F46;font-weight:800;margin-bottom:5px">\ud83d\udc64 PART PATIENT</div>
          <div style="font-size:20px;font-weight:900;color:#065F46">${UI.formatCurrency(patientPart)}</div>
          <div style="font-size:10px;color:#6B7280;margin-top:3px">${patientPart > 0 ? '\u00c0 encaisser' : 'D\u00e9j\u00e0 pay\u00e9'}</div>
        </div>
      </div>
      ` : ''}

      <!-- MODE DE PAIEMENT -->
      <div>
        <div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.8px;color:#64748B;margin-bottom:8px">Mode de r\u00e8glement</div>
        <div style="display:grid;grid-template-columns:repeat(2, 1fr);gap:8px" id="debt-pay-methods">
          <button type="button" class="pay-method-btn active" data-method="cash" onclick="selectDebtPayMethod(this)"
            style="display:flex;align-items:center;gap:8px;padding:12px;border:2px solid #1E40AF;border-radius:10px;background:#EBF5FB;cursor:pointer;font-family:inherit;text-align:left">
            <span style="font-size:18px">\ud83d\udcb5</span>
            <div><div style="font-size:12px;font-weight:700;color:#1E40AF">Esp\u00e8ces</div><div style="font-size:9px;color:#6B7280">Liquide</div></div>
          </button>
          <button type="button" class="pay-method-btn" data-method="orange_money" onclick="selectDebtPayMethod(this)"
            style="display:flex;align-items:center;gap:8px;padding:12px;border:2px solid #E2E8F0;border-radius:10px;background:#FFFFFF;cursor:pointer;font-family:inherit;text-align:left">
            <span style="font-size:18px">\ud83d\udcf1</span>
            <div><div style="font-size:12px;font-weight:700;color:#0F172A">Orange Money</div><div style="font-size:9px;color:#6B7280">Mobile</div></div>
          </button>
          <button type="button" class="pay-method-btn" data-method="mtn_momo" onclick="selectDebtPayMethod(this)"
            style="display:flex;align-items:center;gap:8px;padding:12px;border:2px solid #E2E8F0;border-radius:10px;background:#FFFFFF;cursor:pointer;font-family:inherit;text-align:left">
            <span style="font-size:18px">\ud83d\udcf2</span>
            <div><div style="font-size:12px;font-weight:700;color:#0F172A">MTN MoMo</div><div style="font-size:9px;color:#6B7280">Mobile</div></div>
          </button>
          <button type="button" class="pay-method-btn" data-method="transfer" onclick="selectDebtPayMethod(this)"
            style="display:flex;align-items:center;gap:8px;padding:12px;border:2px solid #E2E8F0;border-radius:10px;background:#FFFFFF;cursor:pointer;font-family:inherit;text-align:left">
            <span style="font-size:18px">\ud83c\udfe6</span>
            <div><div style="font-size:12px;font-weight:700;color:#0F172A">Virement / Ch\u00e8que</div><div style="font-size:9px;color:#6B7280">Bancaire</div></div>
          </button>
        </div>
      </div>

      <!-- RÉFÉRENCE -->
      <div>
        <label style="font-size:11px;font-weight:600;color:#64748B;display:block;margin-bottom:5px">R\u00e9f\u00e9rence (optionnel)</label>
        <input type="text" id="debt-pay-ref" style="width:100%;padding:10px 14px;border:2px solid #E2E8F0;border-radius:8px;font-size:13px;font-family:inherit;background:#FFFFFF" placeholder="N\u00b0 transaction, re\u00e7u...">
      </div>

    </div>
  `, {
    footer: `
      <button class="btn btn-secondary" onclick="UI.closeModal()">Annuler</button>
      <button class="btn btn-success" style="padding:10px 20px;font-size:13px;font-weight:700" onclick="confirmSettleDebt(${saleId})"><i data-lucide="check-circle"></i> Encaisser ${UI.formatCurrency(debtAmount)}</button>
    `
  });

  if (window.lucide) lucide.createIcons();
}

function selectDebtPayMethod(btn) {
  btn.closest('#debt-pay-methods').querySelectorAll('.pay-method-btn').forEach(b => {
    b.style.borderColor = '#E2E8F0';
    b.style.background = '#FFFFFF';
    b.classList.remove('active');
  });
  btn.classList.add('active');
  btn.style.borderColor = '#1E40AF';
  btn.style.background = '#EBF5FB';
}

async function confirmSettleDebt(saleId) {
  const methodBtn = document.querySelector('#debt-pay-methods .pay-method-btn.active');
  const paymentMethod = methodBtn ? methodBtn.dataset.method : 'cash';
  const reference = document.getElementById('debt-pay-ref')?.value || '';

  const ok = await UI.confirm('Confirmer l\'encaissement de cette dette ?\n\nLa vente sera marquée comme réglée.');
  if (!ok) return;

  try {
    const sale = await DB.dbGet('sales', saleId);
    if (!sale) throw new Error('Vente introuvable');

    const today = new Date().toISOString().split('T')[0];
    const debtAmount = sale.paymentMethod === 'assurance' ? (sale.assuranceAmount || sale.total) : sale.total;

    // 1. Update the sale status
    sale.status = 'paid';
    sale.paidAt = Date.now();
    sale.paidDate = today;
    sale.paidMethod = paymentMethod;
    await DB.dbPut('sales', sale);

    // 2. Record payment in cashRegister so it appears in today's caisse
    await DB.dbAdd('cashRegister', {
      type: 'debt_in',
      amount: debtAmount,
      paymentMethod: paymentMethod,
      reason: `Règlement dette — Vente #${String(saleId).padStart(6, '0')}${sale.patientName ? ' · ' + sale.patientName : ''}${sale.paymentMethod === 'assurance' ? ' ('+sale.assuranceName+')' : ''}`,
      reference: reference,
      saleId: saleId,
      date: today,
      timestamp: Date.now(),
      userId: DB.AppState.currentUser?.id,
    });

    // 3. Audit trace
    await DB.writeAudit('DEBT_REFUND', 'sales', saleId, { amount: sale.total, patient: sale.patientName, paymentMethod });

    UI.toast('Dette réglée avec succès !', 'success');
    UI.closeModal();

    // Refresh view
    if (Router.currentPage === 'sales') {
      const container = document.getElementById('app-content');
      await renderSales(container);
    } else if (Router.currentPage === 'caisse') {
      Router.navigate('caisse');
    }

    // Trigger Sync if online
    if (typeof DB.syncToSupabase === 'function') {
      DB.syncToSupabase().catch(console.error);
    }

  } catch (err) {
    console.error(err);
    UI.toast('Erreur : ' + err.message, 'error');
  }
}

window.filterSales = filterSales;
window.viewSaleDetail = viewSaleDetail;
window.exportSales = exportSales;
window.settleDebt = settleDebt;
window.selectDebtPayMethod = selectDebtPayMethod;
window.confirmSettleDebt = confirmSettleDebt;

Router.register('sales', renderSales);
Router.register('reports', renderReports);
