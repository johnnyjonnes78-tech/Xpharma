/**
 * PHARMA_PROJET — Module Achats & Fournisseurs
 * Commandes, réceptions, litiges, évaluation fournisseurs
 */

async function renderSuppliers(container) {
  UI.loading(container, 'Chargement des fournisseurs...');
  const [suppliers, orders] = await Promise.all([
    DB.dbGetAll('suppliers'),
    DB.dbGetAll('purchaseOrders'),
  ]);

  // Stats per supplier
  const supplierStats = {};
  orders.forEach(o => {
    if (!supplierStats[o.supplierId]) supplierStats[o.supplierId] = { total: 0, count: 0, lastOrder: null };
    supplierStats[o.supplierId].total += o.totalAmount || 0;
    supplierStats[o.supplierId].count++;
    if (!supplierStats[o.supplierId].lastOrder || o.date > supplierStats[o.supplierId].lastOrder) {
      supplierStats[o.supplierId].lastOrder = o.date;
    }
  });

  const totalOrders = orders.length;
  const pendingOrders = orders.filter(o => o.status === 'pending' || o.status === 'sent').length;
  const totalSpent = orders.filter(o => o.status === 'received').reduce((a, o) => a + (o.totalAmount || 0), 0);

  container.innerHTML = `
    <div class="page-header">
      <div>
        <h1 class="page-title">Achats & Fournisseurs</h1>
        <p class="page-subtitle">${suppliers.length} fournisseurs — ${totalOrders} commandes</p>
      </div>
      <div class="header-actions">
        <button class="btn btn-secondary" onclick="Router.navigate('purchase-orders')"><i data-lucide="file-text"></i> Bons de Commande</button>
        <button class="btn btn-primary" onclick="showAddSupplier()"><i data-lucide="plus"></i> Nouveau Fournisseur</button>
      </div>
    </div>

    <div class="kpi-grid kpi-grid-3">
      <div class="kpi-card kpi-blue">
        <div class="kpi-icon"><i data-lucide="factory"></i></div>
        <div class="kpi-content">
          <div class="kpi-value">${suppliers.length}</div>
          <div class="kpi-label">Fournisseurs actifs</div>
        </div>
      </div>
      <div class="kpi-card kpi-orange ${pendingOrders > 0 ? 'kpi-alert' : ''}">
        <div class="kpi-icon"><i data-lucide="package"></i></div>
        <div class="kpi-content">
          <div class="kpi-value">${pendingOrders}</div>
          <div class="kpi-label">Commandes en cours</div>
        </div>
      </div>
      <div class="kpi-card kpi-green">
        <div class="kpi-icon"><i data-lucide="credit-card"></i></div>
        <div class="kpi-content">
          <div class="kpi-value">${UI.formatCurrency(totalSpent)}</div>
          <div class="kpi-label">Achats total</div>
        </div>
      </div>
    </div>

    <div id="suppliers-grid" class="suppliers-grid">
      ${suppliers.length === 0 ? '<div class="empty-state"><div class="empty-icon"><i data-lucide="factory"></i></div><p>Aucun fournisseur enregistré</p></div>' :
      suppliers.map(sup => {
        const stats = supplierStats[sup.id] || { total: 0, count: 0, lastOrder: null };
        // Calcul du score fournisseur réel
        const supOrders = orders.filter(o => o.supplierId === sup.id);
        let score = 50; // Base
        if (supOrders.length > 0) {
          // 1. Taux de livraison à temps (40%)
          const deliveredOrders = supOrders.filter(o => o.status === 'received');
          const onTimeOrders = deliveredOrders.filter(o => {
            if (!o.expectedDate || !o.receivedAt) return true; // Pas d'info = considéré OK
            return new Date(o.receivedAt) <= new Date(o.expectedDate);
          });
          const onTimeRate = deliveredOrders.length > 0 ? onTimeOrders.length / deliveredOrders.length : 0.5;
          // 2. Taux de complétion (40%) — commandes reçues vs total
          const completionRate = deliveredOrders.length / supOrders.length;
          // 3. Volume bonus (20%) — plus de commandes = plus fiable
          const volumeBonus = Math.min(1, supOrders.length / 10); // Plafond à 10 commandes
          score = Math.round((onTimeRate * 40) + (completionRate * 40) + (volumeBonus * 20));
          score = Math.max(10, Math.min(100, score)); // Clamp 10-100
        }
        return `
          <div class="supplier-card">
            <div class="supplier-card-header">
              <div class="supplier-avatar">${sup.name?.charAt(0) || 'S'}</div>
              <div class="supplier-info">
                <h3 class="supplier-name">${sup.name}</h3>
                <div class="supplier-meta">
                  ${sup.agrément ? `<code class="code-tag">${sup.agrément}</code>` : ''}
                  <span class="badge badge-${sup.status === 'active' ? 'success' : 'neutral'}">${sup.status === 'active' ? 'Actif' : 'Inactif'}</span>
                </div>
              </div>
              <div class="supplier-score">
                <div class="score-circle score-${score >= 80 ? 'good' : score >= 60 ? 'medium' : 'bad'}">${score}</div>
                <span class="score-label">Score</span>
              </div>
            </div>
            <div class="supplier-contact">
              ${sup.phone ? `<span><i data-lucide="phone"></i> ${sup.phone}</span>` : ''}
              ${sup.email ? `<span><i data-lucide="mail"></i> ${sup.email}</span>` : ''}
            </div>
            <div class="supplier-stats-row">
              <div class="supplier-stat">
                <span class="stat-val-sm">${stats.count}</span>
                <span class="stat-lbl-sm">Commandes</span>
              </div>
              <div class="supplier-stat">
                <span class="stat-val-sm">${UI.formatCurrency(stats.total)}</span>
                <span class="stat-lbl-sm">Total achats</span>
              </div>
              <div class="supplier-stat">
                <span class="stat-val-sm">${sup.paymentTerms || 30}j</span>
                <span class="stat-lbl-sm">Délai paiement</span>
              </div>
            </div>
            <div class="supplier-actions">
              <button class="btn btn-sm btn-primary" onclick="showNewOrder(${sup.id}, '${sup.name}')"><i data-lucide="plus"></i> Commander</button>
              <button class="btn btn-sm btn-secondary" onclick="viewSupplierDetail(${sup.id})">Détail <i data-lucide="arrow-right"></i></button>
            </div>
          </div>`;
      }).join('')}
    </div>
  `;
  if (window.lucide) lucide.createIcons();
}

function showAddSupplier() {
  UI.modal('<i data-lucide="factory" class="modal-icon-inline"></i> Nouveau Fournisseur', `
    <form id="supplier-form" class="form-grid">
      <div class="form-row">
        <div class="form-group">
          <label>Raison sociale *</label>
          <input type="text" name="name" class="form-control" required placeholder="Ex: LABOREX Guinée">
        </div>
        <div class="form-group">
          <label>N° Agrément DNPM</label>
          <input type="text" name="agrément" class="form-control" placeholder="DNPM-GRO-XXX">
        </div>
      </div>
      <div class="form-row">
        <div class="form-group">
          <label>Contact principal</label>
          <input type="text" name="contact" class="form-control" placeholder="Nom du contact">
        </div>
        <div class="form-group">
          <label>Téléphone</label>
          <input type="tel" name="phone" class="form-control" placeholder="+224 6XX XXX XXX">
        </div>
      </div>
      <div class="form-row">
        <div class="form-group">
          <label>Email</label>
          <input type="email" name="email" class="form-control">
        </div>
        <div class="form-group">
          <label>Délai de paiement (jours)</label>
          <input type="number" name="paymentTerms" class="form-control" value="30" min="0">
        </div>
      </div>
      <div class="form-group">
        <label>Adresse</label>
        <input type="text" name="address" class="form-control" placeholder="Adresse complète">
      </div>
      <div class="form-row">
        <div class="form-group">
          <label>Spécialité produits</label>
          <input type="text" name="specialty" class="form-control" placeholder="Ex: Génériques, Biologiques, ...">
        </div>
        <div class="form-group">
          <label>Statut</label>
          <select name="status" class="form-control"><option value="active">Actif</option><option value="inactive">Inactif</option></select>
        </div>
      </div>
      <div class="form-group">
        <label>Note</label>
        <textarea name="note" class="form-control" rows="2"></textarea>
      </div>
    </form>
  `, {
    footer: `
      <button class="btn btn-secondary" onclick="UI.closeModal()">Annuler</button>
      <button class="btn btn-primary" onclick="submitSupplier()"><i data-lucide="check"></i> Enregistrer</button>
    `
  });
  if (window.lucide) lucide.createIcons();
}

async function submitSupplier() {
  const form = document.getElementById('supplier-form');
  if (!form?.checkValidity()) { form?.reportValidity(); return; }
  const data = Object.fromEntries(new FormData(form));
  data.paymentTerms = parseInt(data.paymentTerms || 30);
  try {
    await DB.dbAdd('suppliers', data);
    await DB.writeAudit('ADD_SUPPLIER', 'suppliers', null, { name: data.name });
    UI.closeModal();
    UI.toast('Fournisseur ajouté', 'success');
    Router.navigate('suppliers');
  } catch (err) { UI.toast('Erreur : ' + err.message, 'error'); }
}

async function viewSupplierDetail(supId) {
  const [sup, orders] = await Promise.all([
    DB.dbGet('suppliers', supId),
    DB.dbGetAll('purchaseOrders', 'supplierId', supId),
  ]);
  if (!sup) return;
  const sortedOrders = orders.sort((a, b) => new Date(b.date) - new Date(a.date));
  const complaints = sup.complaints || [];
  const openComplaints = complaints.filter(c => c.status === 'open').length;

  UI.modal(`<i data-lucide="factory" class="modal-icon-inline"></i> ${sup.name}`, `
    <div class="supplier-detail">
      <div class="rx-detail-grid" style="margin-bottom:16px">
        <div class="rx-detail-card">
          <h4>Informations</h4>
          <div class="detail-row"><span>Agrément</span><span><code>${sup.agrément || '—'}</code></span></div>
          <div class="detail-row"><span>Contact</span><span>${sup.contact || '—'}</span></div>
          <div class="detail-row"><span>Téléphone</span><span>${sup.phone || '—'}</span></div>
          <div class="detail-row"><span>Email</span><span>${sup.email || '—'}</span></div>
          <div class="detail-row"><span>Délai paiement</span><span>${sup.paymentTerms || 30} jours</span></div>
        </div>
        <div class="rx-detail-card">
          <h4>Statistiques</h4>
          <div class="detail-row"><span>Total commandes</span><span><strong>${orders.length}</strong></span></div>
          <div class="detail-row"><span>Total achats</span><span><strong>${UI.formatCurrency(orders.reduce((a, o) => a + (o.totalAmount || 0), 0))}</strong></span></div>
          <div class="detail-row"><span>Dernière commande</span><span>${orders[0]?.date ? UI.formatDate(orders[0].date) : '—'}</span></div>
          <div class="detail-row"><span>Statut</span><span><span class="badge badge-${sup.status === 'active' ? 'success' : 'neutral'}">${sup.status}</span></span></div>
          <div class="detail-row"><span>Réclamations ouvertes</span><span>${openComplaints > 0 ? `<span class="badge badge-danger">${openComplaints}</span>` : '<span class="text-muted">0</span>'}</span></div>
        </div>
      </div>
      <h4 style="margin-bottom:8px">Historique des commandes</h4>
      ${sortedOrders.length === 0 ? '<p class="text-muted">Aucune commande</p>' : `
        <table class="data-table"><thead><tr><th>N° BC</th><th>Date</th><th>Montant</th><th>Statut</th></tr></thead>
        <tbody>${sortedOrders.slice(0, 10).map(o => `
          <tr>
            <td><code>${o.orderNumber || o.id}</code></td>
            <td>${UI.formatDate(o.date)}</td>
            <td>${UI.formatCurrency(o.totalAmount || 0)}</td>
            <td><span class="badge badge-${o.status === 'received' ? 'success' : o.status === 'sent' ? 'info' : o.status === 'cancelled' ? 'danger' : 'warning'}">${({pending:'Brouillon',sent:'Envoyée',partial:'Partielle',received:'Reçue',cancelled:'Annulée'})[o.status] || o.status}</span></td>
          </tr>`).join('')}</tbody>
        </table>`}

      <!-- RÉCLAMATIONS -->
      <div style="margin-top:24px; border-top:1px solid var(--border); padding-top:16px">
        <div style="display:flex; align-items:center; justify-content:space-between; margin-bottom:12px">
          <h4 style="margin:0"><i data-lucide="alert-circle"></i> Réclamations</h4>
          <button class="btn btn-sm btn-danger" onclick="showAddComplaint(${supId})"><i data-lucide="plus"></i> Nouvelle réclamation</button>
        </div>
        <div id="complaints-list-${supId}">
          ${complaints.length === 0 ? '<p class="text-muted" style="font-size:13px">Aucune réclamation enregistrée pour ce fournisseur.</p>' :
          complaints.sort((a, b) => new Date(b.date) - new Date(a.date)).map((c, idx) => `
            <div class="complaint-card">
              <div class="complaint-header">
                <span class="complaint-type ${c.type}">${({quality:'Qualité', delivery:'Livraison', missing:'Manquant', other:'Autre'})[c.type] || c.type}</span>
                <span class="complaint-date">${UI.formatDate(c.date)}</span>
              </div>
              <div class="complaint-desc">${c.description}</div>
              ${c.orderRef ? `<div style="font-size:11px;color:var(--text-muted);margin-top:4px">Réf. commande : <code>${c.orderRef}</code></div>` : ''}
              <div style="display:flex; align-items:center; justify-content:space-between; margin-top:8px">
                <span class="complaint-status ${c.status}">
                  ${c.status === 'open' ? '⏳ Ouverte' : '✅ Résolue'}
                </span>
                ${c.status === 'open' ? `<button class="btn btn-xs btn-success" onclick="resolveComplaint(${supId}, ${idx})"><i data-lucide="check"></i> Résoudre</button>` : ''}
              </div>
              ${c.resolution ? `<div style="margin-top:8px; padding:8px 10px; background:rgba(46,175,125,0.06); border-radius:6px; font-size:12px; color:var(--text-muted)"><strong>Résolution :</strong> ${c.resolution}</div>` : ''}
            </div>`).join('')}
        </div>
      </div>
    </div>
  `, { size: 'large' });
  if (window.lucide) lucide.createIcons();
}

// ===== PURCHASE ORDERS =====
async function renderPurchaseOrders(container) {
  UI.loading(container, 'Chargement des commandes...');
  const [orders, suppliers, products] = await Promise.all([
    DB.dbGetAll('purchaseOrders'),
    DB.dbGetAll('suppliers'),
    DB.dbGetAll('products'),
  ]);

  const supplierMap = {};
  suppliers.forEach(s => { supplierMap[s.id] = s; });

  const sorted = orders.sort((a, b) => new Date(b.date) - new Date(a.date));
  const pending = orders.filter(o => ['pending', 'sent'].includes(o.status));
  const received = orders.filter(o => o.status === 'received');

  container.innerHTML = `
    <div class="page-header">
      <div>
        <h1 class="page-title">Bons de Commande</h1>
        <p class="page-subtitle">${orders.length} commandes — ${pending.length} en attente de réception</p>
      </div>
      <div class="header-actions">
        <button class="btn btn-secondary" onclick="Router.navigate('suppliers')"><i data-lucide="factory"></i> Fournisseurs</button>
        <button class="btn btn-primary" onclick="showNewOrderForm()"><i data-lucide="plus"></i> Nouvelle Commande</button>
      </div>
    </div>

    <div class="stats-bar">
      <div class="stat-chip stat-orange"><span class="stat-val">${pending.length}</span><span class="stat-label">En attente</span></div>
      <div class="stat-chip stat-green"><span class="stat-val">${received.length}</span><span class="stat-label">Reçues</span></div>
      <div class="stat-chip stat-blue"><span class="stat-val">${UI.formatCurrency(pending.reduce((a, o) => a + (o.totalAmount || 0), 0))}</span><span class="stat-label">Valeur en attente</span></div>
    </div>

    <div class="filter-bar">
      <select id="po-status" class="filter-select" onchange="filterOrders()">
        <option value="">Tous statuts</option>
        <option value="pending">En attente</option>
        <option value="sent">Envoyée</option>
        <option value="partial">Partielle</option>
        <option value="received">Reçue</option>
        <option value="cancelled">Annulée</option>
      </select>
      <select id="po-supplier" class="filter-select" onchange="filterOrders()">
        <option value="">Tous fournisseurs</option>
        ${suppliers.map(s => `<option value="${s.id}">${s.name}</option>`).join('')}
      </select>
    </div>

    <div id="po-table-container"></div>
  `;

  window._ordersData = sorted;
  window._ordersSupplierMap = supplierMap;
  window._ordersProducts = products;
  filterOrders();
}

function filterOrders() {
  const status = document.getElementById('po-status')?.value || '';
  const supId = document.getElementById('po-supplier')?.value;
  let data = window._ordersData || [];
  if (status) data = data.filter(o => o.status === status);
  if (supId) data = data.filter(o => o.supplierId === parseInt(supId));

  const container = document.getElementById('po-table-container');
  if (!container) return;

  const statusConfig = {
    pending: { label: 'Brouillon', cls: 'badge-neutral' },
    sent: { label: 'Envoyée', cls: 'badge-info' },
    partial: { label: 'Partielle', cls: 'badge-warning' },
    received: { label: 'Reçue', cls: 'badge-success' },
    cancelled: { label: 'Annulée', cls: 'badge-danger' },
  };

  UI.table(container, [
    { label: 'N° BC', render: r => `<code class="code-tag">${r.orderNumber || 'BC-' + String(r.id).padStart(5, '0')}</code>` },
    { label: 'Date', render: r => UI.formatDate(r.date) },
    {
      label: 'Fournisseur', render: r => {
        const s = window._ordersSupplierMap?.[r.supplierId];
        return s ? `<strong>${s.name}</strong>` : '—';
      }
    },
    { label: 'Articles', render: r => `${(r.items || []).length} référence(s)` },
    { label: 'Montant Total', render: r => `<strong>${UI.formatCurrency(r.totalAmount || 0)}</strong>` },
    { label: 'Date livraison prévue', render: r => r.expectedDate ? UI.formatDate(r.expectedDate) : '—' },
    {
      label: 'Statut', render: r => {
        const s = statusConfig[r.status] || { label: r.status, cls: 'badge-neutral' };
        return `<span class="badge ${s.cls}">${s.label}</span>`;
      }
    },
    {
      label: 'Actions', render: r => `
      <div class="actions-cell">
        <button class="btn btn-xs btn-primary" onclick="viewOrder(${r.id})"><i data-lucide="eye"></i> Voir</button>
        ${r.status === 'pending' ? `<button class="btn btn-xs btn-secondary" onclick="sendOrder(${r.id})"><i data-lucide="send"></i> Envoyer</button>` : ''}
        ${['sent', 'partial'].includes(r.status) ? `<button class="btn btn-xs btn-success" onclick="receiveOrder(${r.id})"><i data-lucide="package"></i> Réceptionner</button>` : ''}
      </div>` },
  ], data, { emptyMessage: 'Aucune commande', emptyIcon: 'file-text' });
  if (window.lucide) lucide.createIcons();
}

async function showNewOrder(supplierId, supplierName, preselectedProductId) {
  const products = window._allProducts || await DB.dbGetAll('products');
  const suppliers = await DB.dbGetAll('suppliers');

  UI.modal('<i data-lucide="file-text" class="modal-icon-inline"></i> Nouvelle Commande', `
    <form id="order-form" class="form-grid">
      <div class="form-row">
        <div class="form-group">
          <label>Fournisseur *</label>
          <select name="supplierId" id="order-supplier" class="form-control" required>
            <option value="">Sélectionner...</option>
            ${suppliers.map(s => `<option value="${s.id}" ${s.id === supplierId ? 'selected' : ''}>${s.name}</option>`).join('')}
          </select>
        </div>
        <div class="form-group">
          <label>Date de livraison prévue</label>
          <input type="date" name="expectedDate" class="form-control" value="${new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]}">
        </div>
      </div>
      <div class="form-group">
        <label>Note / Urgence</label>
        <textarea name="note" class="form-control" rows="2" placeholder="Commande urgente, spécifications spéciales..."></textarea>
      </div>
    </form>

    <div class="rx-section" style="margin-top:16px">
      <div class="rx-section-header">
        <h4 class="rx-section-title"><i data-lucide="package"></i> Articles à Commander</h4>
        <button type="button" class="btn btn-sm btn-primary" onclick="addOrderItem()"><i data-lucide="plus"></i> Ajouter article</button>
      </div>
      <div id="order-items-list">
        <div class="rx-empty-items">Ajoutez les produits à commander</div>
      </div>
      <div class="order-total-bar" id="order-total-bar" style="display:none">
        <strong>Total estimé : <span id="order-total-display">0 GNF</span></strong>
      </div>
    </div>
  `, {
    size: 'large',
    footer: `
      <button class="btn btn-secondary" onclick="UI.closeModal()">Annuler</button>
      <button class="btn btn-warning" onclick="submitOrder('pending')"><i data-lucide="save"></i> Brouillon</button>
      <button class="btn btn-primary" onclick="submitOrder('sent')"><i data-lucide="send"></i> Créer & Envoyer</button>
    `
  });
  if (window.lucide) lucide.createIcons();
  window._orderItemCounter = 0;
  window._allProducts = products;

  // Auto-ajouter le produit pré-sélectionné s'il est fourni
  if (preselectedProductId) {
    const pid = parseInt(preselectedProductId);
    addOrderItem();
    // Sélectionner automatiquement le produit dans le premier item ajouté
    setTimeout(() => {
      const sel = document.getElementById('order-prod-0');
      if (sel) {
        sel.value = String(pid);
        // Déclencher la mise à jour du prix et du total
        const opt = sel.options[sel.selectedIndex];
        if (opt && opt.dataset.price) {
          const priceInput = document.getElementById('order-price-0');
          if (priceInput) priceInput.value = opt.dataset.price;
        }
        updateOrderTotal();
      }
    }, 100);
  }
}

function showNewOrderForm() {
  showNewOrder(null, null);
}

function addOrderItem() {
  const products = window._allProducts || [];
  const listEl = document.getElementById('order-items-list');
  if (!listEl) return;
  listEl.querySelector('.rx-empty-items')?.remove();
  document.getElementById('order-total-bar')?.style.setProperty('display', 'block');

  const idx = window._orderItemCounter++;
  const div = document.createElement('div');
  div.className = 'rx-item-row';
  div.id = `order-item-${idx}`;
  div.innerHTML = `
    <div class="rx-item-fields">
      <div class="form-group flex-grow">
        <select class="form-control" id="order-prod-${idx}" onchange="updateOrderTotal()">
          <option value="">Sélectionner produit...</option>
          ${products.map(p => `<option value="${p.id}" data-price="${p.purchasePrice || 0}" data-name="${p.name}">${p.name} (${p.code})</option>`).join('')}
        </select>
      </div>
      <div class="form-group" style="width:100px">
        <input type="number" class="form-control" id="order-qty-${idx}" placeholder="Qté" min="1" value="1" oninput="updateOrderTotal()">
      </div>
      <div class="form-group" style="width:140px">
        <input type="number" class="form-control" id="order-price-${idx}" placeholder="Prix unit." min="0" oninput="updateOrderTotal()">
      </div>
      <button type="button" class="btn btn-xs btn-danger" onclick="removeOrderItem(${idx})"><i data-lucide="trash-2"></i></button>
    </div>`;
  listEl.appendChild(div);
  if (window.lucide) lucide.createIcons();
}

function removeOrderItem(idx) {
  document.getElementById(`order-item-${idx}`)?.remove();
  updateOrderTotal();
}

function updateOrderTotal() {
  let total = 0;
  document.querySelectorAll('.rx-item-row[id^="order-item-"]').forEach(row => {
    const idx = row.id.replace('order-item-', '');
    const qty = parseFloat(document.getElementById(`order-qty-${idx}`)?.value || 0);
    const sel = document.getElementById(`order-prod-${idx}`);
    let price = parseFloat(document.getElementById(`order-price-${idx}`)?.value || 0);
    if (!price && sel?.value) {
      price = parseFloat(sel.options[sel.selectedIndex]?.dataset?.price || 0);
      const priceInput = document.getElementById(`order-price-${idx}`);
      if (priceInput && !priceInput.value) priceInput.placeholder = price.toString();
    }
    total += qty * price;
  });
  const el = document.getElementById('order-total-display');
  if (el) el.textContent = UI.formatCurrency(total);
  return total;
}

async function submitOrder(status) {
  const form = document.getElementById('order-form');
  const supplierId = parseInt(document.getElementById('order-supplier')?.value);
  if (!supplierId) { UI.toast('Sélectionnez un fournisseur', 'error'); return; }

  const items = [];
  document.querySelectorAll('.rx-item-row[id^="order-item-"]').forEach(row => {
    const idx = row.id.replace('order-item-', '');
    const sel = document.getElementById(`order-prod-${idx}`);
    const qty = parseInt(document.getElementById(`order-qty-${idx}`)?.value || 0);
    const price = parseFloat(document.getElementById(`order-price-${idx}`)?.value || sel?.options[sel.selectedIndex]?.dataset?.price || 0);
    if (sel?.value && qty > 0) {
      items.push({ productId: parseInt(sel.value), productName: sel.options[sel.selectedIndex]?.dataset?.name, quantity: qty, unitPrice: price, receivedQty: 0 });
    }
  });

  if (!items.length) { UI.toast('Ajoutez au moins un article', 'warning'); return; }

  const formData = form ? Object.fromEntries(new FormData(form)) : {};
  const totalAmount = items.reduce((a, i) => a + i.quantity * i.unitPrice, 0);
  const orderId = await DB.dbAdd('purchaseOrders', {
    supplierId,
    orderNumber: `BC-${new Date().getFullYear()}-${String(Date.now()).slice(-5)}`,
    date: new Date().toISOString().split('T')[0],
    expectedDate: formData.expectedDate || '',
    items,
    totalAmount,
    status,
    note: formData.note || '',
    createdBy: DB.AppState.currentUser?.id,
  });

  await DB.writeAudit('CREATE_ORDER', 'purchaseOrders', orderId, { supplierId, itemCount: items.length, totalAmount });
  UI.closeModal();
  UI.toast(`Commande créée — ${UI.formatCurrency(totalAmount)}`, 'success');
  Router.navigate('purchase-orders');
}

async function sendOrder(orderId) {
  const order = await DB.dbGet('purchaseOrders', orderId);
  if (!order) return;
  await DB.dbPut('purchaseOrders', { ...order, status: 'sent', sentAt: Date.now() });
  await DB.writeAudit('SEND_ORDER', 'purchaseOrders', orderId, {});
  UI.toast('Commande marquée comme envoyée', 'success');
  Router.navigate('purchase-orders');
}

async function receiveOrder(orderId) {
  const [order, products] = await Promise.all([
    DB.dbGet('purchaseOrders', orderId),
    DB.dbGetAll('products'),
  ]);
  if (!order) return;

  window._currentReceiveOrder = JSON.parse(JSON.stringify(order));
  (window._currentReceiveOrder.items || []).forEach((item, idx) => {
    item._recvQty = item.quantity;
    item._recvLot = `LOT-AUTO-${Date.now()}-${idx}`;
    item._recvExpiry = '';
    item._recvConform = '1';
  });
  window._recvOrderPage = 1;

  UI.modal('<i data-lucide="package" class="modal-icon-inline"></i> Réception de Commande', `
    <div class="receive-form">
      <div class="receive-header">
        <code class="code-tag">${order.orderNumber}</code>
        <span>Date de réception : <strong>${new Date().toLocaleDateString('fr-FR')}</strong></span>
      </div>
      <div id="receive-items-container"></div>
      <div class="form-group" style="margin-top:16px">
        <label>Observations</label>
        <textarea id="recv-note" class="form-control" rows="2" placeholder="Dommages, manquants, non-conformités..."></textarea>
      </div>
    </div>
  `, {
    size: 'large',
    footer: `
      <button class="btn btn-secondary" onclick="UI.closeModal()">Annuler</button>
      <button class="btn btn-primary" onclick="confirmReceiveOrder(${orderId})"><i data-lucide="check"></i> Confirmer la réception</button>
    `
  });
  if (window.lucide) lucide.createIcons();
  
  setTimeout(() => renderReceivePagination(), 100);
}

function renderReceivePagination(page) {
  if (page !== undefined) window._recvOrderPage = page;
  const p = window._recvOrderPage || 1;
  const PAGE_SIZE = 50;
  const items = window._currentReceiveOrder?.items || [];
  const totalPages = Math.ceil(items.length / PAGE_SIZE) || 1;
  const start = (p - 1) * PAGE_SIZE;
  const pageItems = items.slice(start, start + PAGE_SIZE);

  const itemsHTML = pageItems.map((item, localIdx) => {
    const idx = start + localIdx;
    return `
    <div class="receive-item-row">
      <div class="receive-item-info">
        <strong>${item.productName}</strong>
        <span class="text-muted text-sm">Commandé : ${item.quantity}</span>
      </div>
      <div class="receive-item-fields">
        <div class="form-group">
          <label>Qté reçue</label>
          <input type="number" class="form-control" value="${item._recvQty}" min="0" max="${item.quantity}" onchange="window._currentReceiveOrder.items[${idx}]._recvQty = parseInt(this.value)||0">
        </div>
        <div class="form-group">
          <label>N° de Lot</label>
          <input type="text" class="form-control" value="${item._recvLot}" placeholder="LOT-XXXX" onchange="window._currentReceiveOrder.items[${idx}]._recvLot = this.value">
        </div>
        <div class="form-group">
          <label>Date expiration</label>
          <input type="date" class="form-control" value="${item._recvExpiry}" onchange="window._currentReceiveOrder.items[${idx}]._recvExpiry = this.value">
        </div>
        <div class="form-group">
          <label>Conforme ?</label>
          <select class="form-control" onchange="window._currentReceiveOrder.items[${idx}]._recvConform = this.value">
            <option value="1" ${item._recvConform === '1' ? 'selected' : ''}>Conforme</option>
            <option value="0" ${item._recvConform === '0' ? 'selected' : ''}>Non conforme</option>
          </select>
        </div>
      </div>
    </div>`;
  }).join('');

  let navHTML = '';
  if (totalPages > 1) {
    navHTML = `
      <div style="display:flex; justify-content:space-between; align-items:center; margin-top:16px; padding-top:16px; border-top:1px solid var(--border)">
        <span class="text-muted text-sm">Page ${p} / ${totalPages} (${items.length} articles)</span>
        <div style="display:flex; gap:8px">
          <button class="btn btn-sm btn-secondary" onclick="renderReceivePagination(${p - 1})" ${p <= 1 ? 'disabled' : ''}>◀ Précédent</button>
          <button class="btn btn-sm btn-secondary" onclick="renderReceivePagination(${p + 1})" ${p >= totalPages ? 'disabled' : ''}>Suivant ▶</button>
        </div>
      </div>
    `;
  }

  const container = document.getElementById('receive-items-container');
  if (container) container.innerHTML = itemsHTML + navHTML;
}

async function confirmReceiveOrder(orderId) {
  const order = window._currentReceiveOrder;
  if (!order) return;

  let hasNonConformity = false;
  const updatedItems = [];

  for (let idx = 0; idx < (order.items || []).length; idx++) {
    const item = order.items[idx];
    const qtyReceived = parseInt(item._recvQty) || 0;
    const lotNumber = item._recvLot || `LOT-AUTO-${Date.now()}-${idx}`;
    const expiryDate = item._recvExpiry || '';
    const conform = item._recvConform === '1';

    if (!conform) hasNonConformity = true;

    updatedItems.push({ 
      productId: item.productId, 
      productName: item.productName, 
      quantity: item.quantity, 
      unitPrice: item.unitPrice, 
      receivedQty: qtyReceived, 
      lotNumber, 
      expiryDate, 
      conform 
    });

    if (qtyReceived > 0 && conform) {
      // Add to stock
      await DB.dbAdd('lots', {
        productId: item.productId,
        lotNumber,
        expiryDate,
        quantity: qtyReceived,
        initialQuantity: qtyReceived,
        receiptDate: new Date().toISOString().split('T')[0],
        supplierId: order.supplierId,
        status: 'active',
      });

      const stockAll = await DB.dbGetAll('stock');
      const existing = stockAll.find(s => s.productId === item.productId);
      if (existing) {
        await DB.dbPut('stock', { ...existing, quantity: existing.quantity + qtyReceived });
      } else {
        await DB.dbAdd('stock', { productId: item.productId, quantity: qtyReceived, reservedQuantity: 0 });
      }

      await DB.dbAdd('movements', {
        productId: item.productId, type: 'ENTRY', subType: 'PURCHASE',
        quantity: qtyReceived, lotNumber, date: new Date().toISOString(),
        userId: DB.AppState.currentUser?.id, reference: order.orderNumber,
      });
    }
  }

  const note = document.getElementById('recv-note')?.value || '';
  const allReceived = updatedItems.every(i => i.receivedQty >= i.quantity);

  await DB.dbPut('purchaseOrders', {
    ...order,
    items: updatedItems,
    status: hasNonConformity ? 'partial' : (allReceived ? 'received' : 'partial'),
    receivedAt: Date.now(),
    receiveNote: note,
    hasNonConformity,
  });

  await DB.writeAudit('RECEIVE_ORDER', 'purchaseOrders', orderId, { hasNonConformity });

  if (hasNonConformity) {
    await DB.dbAdd('alerts', {
      type: 'NON_CONFORMITY',
      message: `Non-conformité détectée à la réception — ${order.orderNumber}`,
      status: 'unread', date: Date.now(), priority: 'high',
    });
  }

  UI.closeModal();
  UI.toast(hasNonConformity ? 'Réception avec non-conformités enregistrée' : 'Réception confirmée — Stock mis à jour', hasNonConformity ? 'warning' : 'success', 4000);
  Router.navigate('purchase-orders');
}

async function viewOrder(orderId) {
  const [order, suppliers] = await Promise.all([
    DB.dbGet('purchaseOrders', orderId),
    DB.dbGetAll('suppliers'),
  ]);
  if (!order) return;
  const sup = suppliers.find(s => s.id === order.supplierId);

  UI.modal('<i data-lucide="file-text" class="modal-icon-inline"></i> ' + order.orderNumber, `
    <div class="detail-row"><span>Fournisseur</span><span><strong>${sup?.name || '—'}</strong></span></div>
    <div class="detail-row"><span>Date</span><span>${UI.formatDate(order.date)}</span></div>
    <div class="detail-row"><span>Livraison prévue</span><span>${order.expectedDate ? UI.formatDate(order.expectedDate) : '—'}</span></div>
    <div class="detail-row"><span>Statut</span><span><span class="badge badge-${order.status === 'received' ? 'success' : order.status === 'sent' ? 'info' : order.status === 'cancelled' ? 'danger' : order.status === 'partial' ? 'warning' : 'neutral'}">${({pending:'Brouillon',sent:'Envoyée',partial:'Partielle',received:'Reçue',cancelled:'Annulée'})[order.status] || order.status}</span></span></div>
    <h4 style="margin:16px 0 8px">Articles (Total: <strong>${UI.formatCurrency(order.totalAmount || 0)}</strong>)</h4>
    <div id="view-order-items-table"></div>
    ${order.receiveNote ? `<p class="text-muted" style="margin-top:12px">Note réception : ${order.receiveNote}</p>` : ''}
  `, { size: 'large' });
  if (window.lucide) lucide.createIcons();

  const container = document.getElementById('view-order-items-table');
  if (container) {
    UI.table(container, [
      { label: 'Produit', render: r => r.productName },
      { label: 'Qté commandée', render: r => r.quantity },
      { label: 'Prix unit.', render: r => UI.formatCurrency(r.unitPrice || 0) },
      { label: 'Total', render: r => UI.formatCurrency((r.unitPrice || 0) * r.quantity) },
      { label: 'Lot reçu', render: r => r.lotNumber ? `<code class="code-tag">${r.lotNumber}</code>` : '—' }
    ], order.items || [], { emptyMessage: 'Aucun article', pageSize: 50 });
  }
}

// ═══════════════════════════════════════════════════════════════
// RÉCLAMATIONS FOURNISSEUR
// ═══════════════════════════════════════════════════════════════
function showAddComplaint(supId) {
  UI.modal('<i data-lucide="alert-circle" class="modal-icon-inline"></i> Nouvelle Réclamation', `
    <form id="complaint-form" class="form-grid">
      <div class="form-row">
        <div class="form-group">
          <label>Type de réclamation *</label>
          <select name="type" class="form-control" required>
            <option value="delivery">Erreur de livraison</option>
            <option value="quality">Problème de qualité</option>
            <option value="missing">Produit manquant</option>
            <option value="other">Autre</option>
          </select>
        </div>
        <div class="form-group">
          <label>Réf. commande (optionnel)</label>
          <input type="text" name="orderRef" class="form-control" placeholder="BC-2026-XXXXX">
        </div>
      </div>
      <div class="form-group">
        <label>Description détaillée *</label>
        <textarea name="description" class="form-control" rows="3" required placeholder="Décrivez le problème rencontré..."></textarea>
      </div>
    </form>
  `, {
    footer: `
      <button class="btn btn-secondary" onclick="UI.closeModal()">Annuler</button>
      <button class="btn btn-danger" onclick="submitComplaint(${supId})"><i data-lucide="alert-circle"></i> Enregistrer</button>
    `
  });
  if (window.lucide) lucide.createIcons();
}

async function submitComplaint(supId) {
  const form = document.getElementById('complaint-form');
  if (!form?.checkValidity()) { form?.reportValidity(); return; }
  const data = Object.fromEntries(new FormData(form));
  const sup = await DB.dbGet('suppliers', supId);
  if (!sup) return;

  const complaint = {
    type: data.type,
    description: data.description,
    orderRef: data.orderRef || null,
    date: new Date().toISOString().split('T')[0],
    status: 'open',
    resolution: null,
    createdBy: DB.AppState.currentUser?.name || 'Inconnu',
  };

  const complaints = sup.complaints || [];
  complaints.push(complaint);
  await DB.dbPut('suppliers', { ...sup, complaints });
  await DB.writeAudit('ADD_COMPLAINT', 'suppliers', supId, { type: complaint.type, description: complaint.description });
  UI.closeModal();
  UI.toast('Réclamation enregistrée', 'success');
  viewSupplierDetail(supId);
}

async function resolveComplaint(supId, complaintIdx) {
  const resolution = prompt('Comment ce problème a-t-il été résolu ?');
  if (resolution === null) return;
  const sup = await DB.dbGet('suppliers', supId);
  if (!sup || !sup.complaints?.[complaintIdx]) return;

  sup.complaints[complaintIdx].status = 'resolved';
  sup.complaints[complaintIdx].resolution = resolution || 'Résolu sans commentaire';
  sup.complaints[complaintIdx].resolvedAt = new Date().toISOString();
  sup.complaints[complaintIdx].resolvedBy = DB.AppState.currentUser?.name || 'Inconnu';

  await DB.dbPut('suppliers', sup);
  await DB.writeAudit('RESOLVE_COMPLAINT', 'suppliers', supId, { idx: complaintIdx });
  UI.toast('Réclamation marquée comme résolue', 'success');
  viewSupplierDetail(supId);
}

window.showAddSupplier = showAddSupplier;
window.submitSupplier = submitSupplier;
window.viewSupplierDetail = viewSupplierDetail;
window.showNewOrder = showNewOrder;
window.showNewOrderForm = showNewOrderForm;
window.addOrderItem = addOrderItem;
window.removeOrderItem = removeOrderItem;
window.updateOrderTotal = updateOrderTotal;
window.submitOrder = submitOrder;
window.filterOrders = filterOrders;
window.sendOrder = sendOrder;
window.receiveOrder = receiveOrder;
window.renderReceivePagination = renderReceivePagination;
window.confirmReceiveOrder = confirmReceiveOrder;
window.viewOrder = viewOrder;
window.showAddComplaint = showAddComplaint;
window.submitComplaint = submitComplaint;
window.resolveComplaint = resolveComplaint;

Router.register('suppliers', renderSuppliers);
Router.register('purchase-orders', renderPurchaseOrders);

