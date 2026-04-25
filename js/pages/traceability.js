/**
 * OrdiveX — Module Traçabilité & Pharmacovigilance
 * Tracking complet lot <i data-lucide="arrow-right"></i> patient, rappels, ANSS
 */

async function renderTraceability(container) {
  UI.loading(container, 'Chargement du module traçabilité...');
  if (DB._isPulling) { let w=0; while(DB._isPulling && w<90000){await new Promise(r=>setTimeout(r,500));w+=500;} }

  // Chargement léger : seulement lots + produits. Mouvements/prescriptions/patients en lazy-load.
  const [lots, products] = await Promise.all([
    DB.dbGetAll('lots'),
    DB.dbGetAll('products'),
  ]);
  await new Promise(r => setTimeout(r, 0));

  const productMap = {};
  products.forEach(p => { productMap[p.id] = p; });

  // Lots expiring soon — limiter à 100 pour le rendu initial
  const today = new Date();
  const allSoonExpiry = lots.filter(l => {
    const d = UI.daysUntilExpiry(l.expiryDate);
    return l.status === 'active' && d !== null && d <= 90 && d > 0;
  }).sort((a, b) => new Date(a.expiryDate) - new Date(b.expiryDate));

  const expiredLots = lots.filter(l => {
    const d = UI.daysUntilExpiry(l.expiryDate);
    return d !== null && d <= 0 && l.status === 'active';
  });

  const recalledLots = lots.filter(l => l.status === 'recalled');

  // Pagination initiale : 100 lots visibles
  const EXPIRY_PAGE = 100;
  const soonExpiry = allSoonExpiry.slice(0, EXPIRY_PAGE);
  const hasMoreExpiry = allSoonExpiry.length > EXPIRY_PAGE;
  const expiredVisible = expiredLots.slice(0, EXPIRY_PAGE);
  const combinedExpiry = [...expiredVisible.map(l => ({ ...l, _expired: true })), ...soonExpiry];

  container.innerHTML = `
    <div class="page-header">
      <div>
        <h1 class="page-title">Traçabilité & Pharmacovigilance</h1>
        <p class="page-subtitle">Suivi lot-à-patient · Rappels · Déclarations ANSS</p>
      </div>
      <div class="header-actions">
        <button class="btn btn-warning" onclick="showLotRecallForm()"><i data-lucide="alert-triangle"></i> Rappel de Lot</button>
        <button class="btn btn-danger" onclick="showPharmacovigilanceForm()"><i data-lucide="alert-octagon"></i> Déclaration ANSS</button>
      </div>
    </div>

    <div class="stats-bar">
      <div class="stat-chip stat-red"><span class="stat-val">${expiredLots.length}</span><span class="stat-label">Lots expirés</span></div>
      <div class="stat-chip stat-orange"><span class="stat-val">${allSoonExpiry.length}</span><span class="stat-label">Exp. &lt;90j</span></div>
      <div class="stat-chip stat-purple"><span class="stat-val">${recalledLots.length}</span><span class="stat-label">Rappels actifs</span></div>
      <div class="stat-chip stat-blue"><span class="stat-val">${lots.filter(l => l.status === 'active').length}</span><span class="stat-label">Lots actifs</span></div>
      <div class="stat-chip stat-purple" style="border-color:#9b59b6"><span class="stat-val">${products.filter(p => p.isControlled).length}</span><span class="stat-label">Stupéfiants</span></div>
    </div>

    <!-- Tabs -->
    <div class="tabs-bar">
      <button class="tab-btn active" data-tab="expiry" onclick="switchTraceTab(this,'expiry')"><i data-lucide="clock"></i> Expirations</button>
      <button class="tab-btn" data-tab="search" onclick="switchTraceTab(this,'search')"><i data-lucide="search"></i> Tracer un lot</button>
      <button class="tab-btn" data-tab="recalls" onclick="switchTraceTab(this,'recalls')"><i data-lucide="alert-triangle"></i> Rappels actifs</button>
      <button class="tab-btn" data-tab="destruction" onclick="switchTraceTab(this,'destruction')"><i data-lucide="trash-2"></i> Destruction</button>
      ${DB.AppState.currentUser?.role === 'admin' ? `
      <button class="tab-btn" data-tab="audit" onclick="switchTraceTab(this,'audit');loadAuditTab()"><i data-lucide="clipboard-list"></i> Journal d'Audit</button>
      <button class="tab-btn" data-tab="report" onclick="switchTraceTab(this,'report')"><i data-lucide="file-bar-chart"></i> Rapport d'Audit</button>` : ''}
      ${['admin','pharmacien'].includes(DB.AppState.currentUser?.role) ? `
      <button class="tab-btn" data-tab="compliance" onclick="switchTraceTab(this,'compliance');loadComplianceTab()"><i data-lucide="check-square"></i> Conformité</button>
      <button class="tab-btn" data-tab="planning" onclick="switchTraceTab(this,'planning');loadPlanningTab()"><i data-lucide="calendar-clock"></i> Planification</button>
      <button class="tab-btn" data-tab="controlled" onclick="switchTraceTab(this,'controlled');loadControlledSubstancesTab()"><i data-lucide="shield-alert"></i> Stupéfiants</button>` : ''}
    </div>

    <!-- Tab: Expirations -->
    <div id="tab-expiry" class="tab-content active">
      ${expiredLots.length > 0 ? `
        <div class="alert-section-banner alert-danger">
          <i data-lucide="alert-octagon"></i> <strong>${expiredLots.length} lot(s) expiré(s) encore actif(s)</strong> — Action immédiate requise
          <button class="btn btn-xs btn-danger" onclick="blockExpiredLots()">Bloquer tous</button>
        </div>` : ''}

      <h3 class="section-subtitle">Lots expirant dans les 90 jours ${allSoonExpiry.length > EXPIRY_PAGE ? `<span class="text-muted text-sm">(${EXPIRY_PAGE} premiers sur ${allSoonExpiry.length})</span>` : ''}</h3>
      ${combinedExpiry.length === 0 ? '<div class="empty-state-small"><i data-lucide="check-circle"></i> Aucun lot expirant dans les 90 prochains jours</div>' : `
        <div class="table-wrapper">
          <table class="data-table">
            <thead><tr><th>Produit</th><th>N° Lot</th><th>Stock restant</th><th>Expiration</th><th>Jours restants</th><th>Actions</th></tr></thead>
            <tbody>
              ${combinedExpiry.map(lot => {
    const prod = productMap[lot.productId];
    const days = UI.daysUntilExpiry(lot.expiryDate);
    return `<tr class="${days <= 0 ? 'row-danger' : ''}">
                  <td><strong>${prod?.name || '—'}</strong><br><span class="text-muted text-sm">${prod?.category || ''}</span></td>
                  <td><code class="code-tag">${lot.lotNumber}</code></td>
                  <td>${lot.quantity}</td>
                  <td>${UI.formatDate(lot.expiryDate)}</td>
                  <td>${UI.expiryBadge(lot.expiryDate)}</td>
                  <td>
                    <div class="actions-cell">
                      <button class="btn btn-xs btn-primary" onclick="traceLot('${lot.lotNumber}')"><i data-lucide="search"></i> Tracer</button>
                      ${days <= 0 ? `<button class="btn btn-xs btn-danger" onclick="initDestroyLot(${lot.id})"><i data-lucide="trash-2"></i> Détruire</button>` : `<button class="btn btn-xs btn-warning" onclick="promoteLot(${lot.id})"><i data-lucide="megaphone"></i> Promouvoir</button>`}
                    </div>
                  </td>
                </tr>`;
  }).join('')}
            </tbody>
          </table>
        </div>
        ${hasMoreExpiry ? `<div style="text-align:center;margin-top:12px;"><button class="btn btn-secondary" onclick="loadMoreExpiryLots()"><i data-lucide="chevrons-down"></i> Afficher ${allSoonExpiry.length - EXPIRY_PAGE} lots supplémentaires</button></div>` : ''}`}
    </div>

    <!-- Tab: Search -->
    <div id="tab-search" class="tab-content" style="display:none">
      <div class="trace-search-box">
        <h3 class="section-subtitle">Tracer un Lot ou Médicament</h3>
        <div class="trace-search-bar">
          <input type="text" id="trace-input" class="filter-input" placeholder="Entrez un numéro de lot, code produit, ou nom...">
          <button class="btn btn-primary" onclick="doLotTrace()"><i data-lucide="search"></i> Tracer</button>
        </div>
        <div id="trace-results"></div>
      </div>
    </div>

    <!-- Tab: Recalls -->
    <div id="tab-recalls" class="tab-content" style="display:none">
      <div id="recalls-list">
        ${recalledLots.length === 0 ? '<div class="empty-state-small"><i data-lucide="check-circle"></i> Aucun rappel de lot actif</div>' : `
          <div class="table-wrapper">
            <table class="data-table">
              <thead><tr><th>Produit</th><th>N° Lot</th><th>Motif</th><th>Date rappel</th><th>Statut</th></tr></thead>
              <tbody>
                ${recalledLots.map(lot => {
    const prod = productMap[lot.productId];
    return `<tr>
                    <td><strong>${prod?.name || '—'}</strong></td>
                    <td><code class="code-tag">${lot.lotNumber}</code></td>
                    <td>${lot.recallReason || '—'}</td>
                    <td>${lot.recallDate ? UI.formatDate(lot.recallDate) : '—'}</td>
                    <td><span class="badge badge-danger">Rappelé</span></td>
                  </tr>`;
  }).join('')}
              </tbody>
            </table>
          </div>`}
      </div>
    </div>

    <!-- Tab: Destruction -->
    <div id="tab-destruction" class="tab-content" style="display:none">
      <div class="destruction-info">
        <div class="info-box">
          <h4>📋 Procédure de destruction réglementaire</h4>
          <p>Conformément aux textes DNPM Guinée, la destruction des médicaments périmés ou non conformes doit faire l'objet :</p>
          <ul style="margin:8px 0 0 20px;font-size:13px">
            <li>D'un procès-verbal signé par le pharmacien responsable</li>
            <li>D'une déclaration préalable auprès de la DNPM</li>
            <li>D'une traçabilité complète des lots détruits</li>
            <li>D'une méthode de destruction appropriée (incinération recommandée)</li>
          </ul>
        </div>
      </div>
    <div style="margin-top:16px">
        <button class="btn btn-primary" onclick="showDestroyForm()"><i data-lucide="trash-2"></i> Initier une procédure de destruction</button>
      </div>
      <div id="destruction-history" style="margin-top:16px"></div>
    </div>

    <!-- Tab: Audit Log -->
    <div id="tab-audit" class="tab-content" style="display:none">
      <div class="info-box" style="margin-bottom: 20px; background: rgba(46, 134, 193, 0.05); border-left: 4px solid var(--primary-color); padding: 15px; border-radius: 0 8px 8px 0;">
        <h4 style="margin-top:0; color:var(--primary-color); display:flex; align-items:center; gap:8px;">
          <i data-lucide="shield-check"></i> À propos du Journal d'Audit
        </h4>
        <p class="text-sm text-muted" style="margin-bottom:0">
          Conformément aux directives de la <strong>DNPM</strong> et aux standards de sécurité HealthTech, le journal d'audit enregistre de manière immuable toutes les actions critiques effectuées sur le système. 
          Il permet de répondre à la question : <em>"Qui a fait quoi, sur quelle donnée, et à quel moment ?"</em>. 
          Il est essentiel pour la responsabilité légale du pharmacien titulaire et la détection d'anomalies.
        </p>
      </div>
      <div class="audit-toolbar" style="display:flex;gap:8px;margin-bottom:12px;flex-wrap:wrap;align-items:center">
        <input type="text" id="audit-filter-text" class="filter-input" placeholder="Rechercher dans l'audit..." oninput="filterAuditLog()" style="flex:1;min-width:180px">
        <select id="audit-filter-action" class="form-control" onchange="filterAuditLog()" style="width:auto;min-width:140px">
          <option value="">Toutes les actions</option>
          <option value="STOCK_ENTRY">Entrées stock</option>
          <option value="SALE">Ventes</option>
          <option value="SAVE_SETTINGS">Paramètres</option>
          <option value="ADD_USER">Ajout utilisateur</option>
          <option value="EDIT_USER">Modif utilisateur</option>
          <option value="LOT_RECALL">Rappels lot</option>
          <option value="LOT_DESTRUCTION">Destructions</option>
          <option value="PV_REPORT">Pharmacovigilance</option>
          <option value="RETURN_PROCESSED">Retours clients</option>
        </select>
      </div>
      <div id="audit-log-container">Chargement...</div>
    </div>

    <!-- Tab: Rapport d'Audit -->
    ${['admin','pharmacien'].includes(DB.AppState.currentUser?.role) ? `
    <div id="tab-report" class="tab-content" style="display:none">
      <div class="info-box" style="margin-bottom:20px;background:rgba(46,134,193,0.05);border-left:4px solid var(--primary-color);padding:15px;border-radius:0 8px 8px 0;">
        <h4 style="margin-top:0;color:var(--primary-color);display:flex;align-items:center;gap:8px;">
          <i data-lucide="file-bar-chart"></i> Générer un Rapport d'Audit
        </h4>
        <p class="text-sm text-muted" style="margin-bottom:0">
          Compilez les actions du journal d'audit sur une période donnée en un rapport structuré, imprimable et exportable en PDF.
        </p>
      </div>
      <div class="audit-report-config" style="display:flex;gap:12px;flex-wrap:wrap;align-items:flex-end;margin-bottom:20px;">
        <div class="form-group" style="margin-bottom:0;min-width:160px;">
          <label>Date de début</label>
          <input type="date" id="report-date-start" class="form-control" value="${new Date(Date.now() - 30*24*60*60*1000).toISOString().split('T')[0]}">
        </div>
        <div class="form-group" style="margin-bottom:0;min-width:160px;">
          <label>Date de fin</label>
          <input type="date" id="report-date-end" class="form-control" value="${new Date().toISOString().split('T')[0]}">
        </div>
        <div class="form-group" style="margin-bottom:0;min-width:160px;">
          <label>Type d'action</label>
          <select id="report-action-filter" class="form-control">
            <option value="">Toutes les actions</option>
            <option value="STOCK_ENTRY">Entrées stock</option>
            <option value="SALE">Ventes</option>
            <option value="LOT_RECALL">Rappels lot</option>
            <option value="LOT_DESTRUCTION">Destructions</option>
            <option value="PV_REPORT">Pharmacovigilance</option>
            <option value="LOGIN">Connexions</option>
            <option value="SAVE_SETTINGS">Paramètres</option>
            <option value="RETURN_PROCESSED">Retours</option>
          </select>
        </div>
        <button class="btn btn-primary" onclick="generateAuditReport()"><i data-lucide="bar-chart-3"></i> Générer le rapport</button>
      </div>
      <div id="audit-report-output"></div>
    </div>` : ''}

    <!-- Tab: Conformité -->
    ${['admin','pharmacien'].includes(DB.AppState.currentUser?.role) ? `
    <div id="tab-compliance" class="tab-content" style="display:none">
      <div id="compliance-container">Chargement...</div>
    </div>` : ''}

    <!-- Tab: Planification -->
    ${['admin','pharmacien'].includes(DB.AppState.currentUser?.role) ? `
    <div id="tab-planning" class="tab-content" style="display:none">
      <div id="planning-container">Chargement...</div>
    </div>
    <div id="tab-controlled" class="tab-content" style="display:none">
      <div id="controlled-container">Chargement...</div>
    </div>` : ''}
  `;

  window._traceProductMap = productMap;
  window._traceLots = lots;
  window._allSoonExpiry = allSoonExpiry;

  loadDestructionHistory();
  if (window.lucide) lucide.createIcons();

  // Show controlled substances tab by default if available
  setTimeout(() => {
    const controlledBtn = document.querySelector('.tab-btn[data-tab="controlled"]');
    if (controlledBtn) controlledBtn.click();
  }, 0);
}

// Charger plus de lots d'expiration (lazy)
window.loadMoreExpiryLots = function() {
  const allSoonExpiry = window._allSoonExpiry || [];
  const productMap = window._traceProductMap || {};
  const tbody = document.querySelector('#tab-expiry .data-table tbody');
  if (!tbody) return;

  // Ajouter les lots restants après les 100 premiers
  const remaining = allSoonExpiry.slice(100);
  const newRows = remaining.map(lot => {
    const prod = productMap[lot.productId];
    const days = UI.daysUntilExpiry(lot.expiryDate);
    return `<tr>
      <td><strong>${prod?.name || '—'}</strong><br><span class="text-muted text-sm">${prod?.category || ''}</span></td>
      <td><code class="code-tag">${lot.lotNumber}</code></td>
      <td>${lot.quantity}</td>
      <td>${UI.formatDate(lot.expiryDate)}</td>
      <td>${UI.expiryBadge(lot.expiryDate)}</td>
      <td>
        <div class="actions-cell">
          <button class="btn btn-xs btn-primary" onclick="traceLot('${lot.lotNumber}')"><i data-lucide="search"></i> Tracer</button>
          <button class="btn btn-xs btn-warning" onclick="promoteLot(${lot.id})"><i data-lucide="megaphone"></i> Promouvoir</button>
        </div>
      </td>
    </tr>`;
  }).join('');
  tbody.insertAdjacentHTML('beforeend', newRows);

  // Supprimer le bouton "Voir plus"
  const btn = document.querySelector('#tab-expiry [onclick*="loadMoreExpiryLots"]');
  if (btn?.parentElement) btn.parentElement.remove();

  if (window.lucide) lucide.createIcons();
  UI.toast(`${remaining.length} lots supplémentaires affichés`, 'success');
};

function switchTraceTab(btn, tabId) {
  const targetId = `tab-${tabId}`;
  const target = document.getElementById(targetId);

  if (!target) {
    console.error(`[Traceability] Tab content not found: ${targetId}`);
    return;
  }

  document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
  document.querySelectorAll('.tab-content').forEach(t => t.style.display = 'none');

  btn.classList.add('active');
  target.style.display = 'block';
}

async function doLotTrace() {
  const query = document.getElementById('trace-input')?.value.trim().toLowerCase();
  if (!query) { UI.toast('Entrez un numéro de lot ou nom de produit', 'warning'); return; }

  const container = document.getElementById('trace-results');
  if (!container) return;
  UI.loading(container, 'Recherche en cours...');

  const lots = window._traceLots || [];
  const productMap = window._traceProductMap || {};

  // Find matching lots
  const matchedLots = lots.filter(l =>
    l.lotNumber?.toLowerCase().includes(query) ||
    productMap[l.productId]?.name?.toLowerCase().includes(query) ||
    productMap[l.productId]?.code?.toLowerCase().includes(query) ||
    productMap[l.productId]?.dci?.toLowerCase().includes(query)
  ).slice(0, 50); // Limiter à 50 résultats pour la performance

  if (matchedLots.length === 0) {
    container.innerHTML = `<div class="empty-state-small">Aucun lot trouvé pour "${query}"</div>`;
    return;
  }

  // Lazy-load mouvements et prescriptions seulement maintenant
  const [movements, prescriptions] = await Promise.all([
    DB.dbGetAll('movements'),
    DB.dbGetAll('prescriptions'),
  ]);

  container.innerHTML = matchedLots.map(lot => {
    const prod = productMap[lot.productId];
    const lotMovements = movements.filter(m => m.lotNumber === lot.lotNumber);
    const dispensed = lotMovements.filter(m => m.type === 'EXIT' && m.subType === 'SALE');
    const totalDispensed = Math.abs(dispensed.reduce((a, m) => a + (m.quantity || 0), 0));

    // Find prescriptions that used this lot
    const relatedRx = prescriptions.filter(rx =>
      (rx.items || []).some(item => item.productId === lot.productId) && rx.status === 'dispensed'
    ).slice(0, 5);

    return `
    <div class="trace-result-card">
        <div class="trace-result-header">
          <div>
            <div class="trace-lot-number"><code>${lot.lotNumber}</code></div>
            <div class="trace-product-name">${prod?.name || '—'} <span class="text-muted text-sm">${prod?.dci || ''}</span></div>
          </div>
          <div class="trace-result-badges">
            ${UI.expiryBadge(lot.expiryDate)}
            <span class="badge badge-${lot.status === 'active' ? 'success' : lot.status === 'recalled' ? 'danger' : 'neutral'}">${lot.status}</span>
          </div>
        </div>
        <div class="trace-grid">
          <div class="trace-detail"><span class="trace-lbl">Réception</span><span>${UI.formatDate(lot.receiptDate)}</span></div>
          <div class="trace-detail"><span class="trace-lbl">Expiration</span><span>${UI.formatDate(lot.expiryDate)}</span></div>
          <div class="trace-detail"><span class="trace-lbl">Stock initial</span><span>${lot.initialQuantity}</span></div>
          <div class="trace-detail"><span class="trace-lbl">Stock actuel</span><span class="${lot.quantity <= 0 ? 'text-danger' : 'text-success'} font-bold">${lot.quantity}</span></div>
          <div class="trace-detail"><span class="trace-lbl">Unités vendues</span><span>${totalDispensed}</span></div>
          <div class="trace-detail"><span class="trace-lbl">Mouvements</span><span>${lotMovements.length}</span></div>
        </div>
        ${relatedRx.length > 0 ? `
          <div class="trace-rx-section">
            <div class="trace-section-title"><i data-lucide="file-text"></i> Ordonnances liées (${relatedRx.length})</div>
            ${relatedRx.map(rx => `<span class="rx-item-tag" onclick="viewPrescription(${rx.id})">Rx-${String(rx.id).padStart(5, '0')} <i data-lucide="arrow-right"></i> ${rx.patientName || '—'}</span>`).join('')}
          </div>` : ''
      }
  <div class="trace-movements">
    <div class="trace-section-title"><i data-lucide="clipboard-list"></i> Derniers mouvements</div>
    ${lotMovements.slice(-5).reverse().map(m => `
            <div class="trace-movement-row">
              <span class="badge badge-${m.type === 'ENTRY' ? 'success' : 'warning'} badge-xs"><i data-lucide="${m.type === 'ENTRY' ? 'arrow-up' : 'arrow-down'}"></i></span>
              <span>${m.quantity > 0 ? '+' : ''}${m.quantity}</span>
              <span class="text-muted">${UI.formatDate(m.date)}</span>
              <span class="text-muted text-sm">${m.note || m.reference || ''}</span>
            </div>`).join('')}
  </div>
      </div> `;
  }).join('');
  if (window.lucide) lucide.createIcons();
}

function traceLot(lotNumber) {
  document.getElementById('trace-input').value = lotNumber;
  switchTraceTab(document.querySelector('[data-tab="search"]'), 'search');
  doLotTrace();
}

function showLotRecallForm() {
  const lots = window._traceLots || [];
  const productMap = window._traceProductMap || {};
  const activeLots = lots.filter(l => l.status === 'active');

  UI.modal('<i data-lucide="alert-triangle" class="modal-icon-inline"></i> Rappel de Lot', `
    <div class="info-box info-danger" style="margin-bottom:16px">
      <strong>Action critique</strong> — Le rappel de lot bloque immédiatement les ventes et génère une alerte SMS pour les patients concernés.
    </div>
    <form id="recall-form" class="form-grid">
      <div class="form-group">
        <label>Rechercher le lot à rappeler *</label>
        <input type="text" id="recall-lot-search" class="form-control" placeholder="Tapez un numéro de lot ou nom de produit..." oninput="filterRecallLots()">
        <input type="hidden" name="lotId" id="recall-lot-id" required>
        <div id="recall-lot-results" style="max-height:200px;overflow-y:auto;border:1px solid var(--border-color);border-radius:6px;margin-top:4px;display:none;"></div>
      </div>
      <div id="recall-lot-info" class="lot-info-box" style="display:none"></div>
      <div class="form-group">
        <label>Motif du rappel *</label>
        <select name="reason" class="form-control" required>
          <option value="">Sélectionner...</option>
          <option>Non-conformité qualité</option>
          <option>Contamination détectée</option>
          <option>Rappel fabricant</option>
          <option>Décision DNPM / ANSS</option>
          <option>Problème d'étiquetage</option>
          <option>Suspicion de contrefaçon</option>
          <option>Autre</option>
        </select>
      </div>
      <div class="form-group">
        <label>Description détaillée *</label>
        <textarea name="description" class="form-control" rows="3" required placeholder="Décrivez précisément le problème détecté..."></textarea>
      </div>
      <div class="form-row">
        <div class="form-group">
          <label>Source de l'alerte</label>
          <input type="text" name="alertSource" class="form-control" placeholder="DNPM, Fabricant, Interne...">
        </div>
        <div class="form-group">
          <label>Référence officielle</label>
          <input type="text" name="alertRef" class="form-control" placeholder="N° de rappel officiel">
        </div>
      </div>
      <div class="form-group">
        <label class="checkbox-label">
          <input type="checkbox" id="recall-notify-patients" checked>
            Notifier les patients ayant reçu ce lot (SMS)
        </label>
      </div>
    </form>
  `, {
    size: 'large',
    footer: `
    <button class="btn btn-secondary" onclick="UI.closeModal()">Annuler</button>
      <button class="btn btn-danger" onclick="submitLotRecall()"><i data-lucide="alert-triangle"></i> Confirmer le Rappel</button>
  `
  });

  // Stocker les lots actifs pour le filtre
  window._recallActiveLots = activeLots;
  if (window.lucide) lucide.createIcons();
}

// Filtre de recherche pour le select de rappel (remplace le select massif)
window.filterRecallLots = function() {
  const query = document.getElementById('recall-lot-search')?.value.trim().toLowerCase();
  const container = document.getElementById('recall-lot-results');
  if (!container) return;

  if (!query || query.length < 2) {
    container.style.display = 'none';
    return;
  }

  const activeLots = window._recallActiveLots || [];
  const productMap = window._traceProductMap || {};

  const matches = activeLots.filter(l =>
    l.lotNumber?.toLowerCase().includes(query) ||
    productMap[l.productId]?.name?.toLowerCase().includes(query)
  ).slice(0, 30); // Max 30 résultats

  if (matches.length === 0) {
    container.innerHTML = '<div style="padding:8px;color:var(--text-secondary);font-size:13px;">Aucun lot trouvé</div>';
    container.style.display = 'block';
    return;
  }

  container.innerHTML = matches.map(l => {
    const pName = productMap[l.productId]?.name || '?';
    return `<div class="recall-lot-option" style="padding:8px 12px;cursor:pointer;border-bottom:1px solid var(--border-color);font-size:13px;" 
      onmouseover="this.style.background='var(--bg-hover)'" onmouseout="this.style.background=''" 
      onclick="selectRecallLot(${l.id},'${l.lotNumber}','${pName.replace(/'/g,"\\'")}',${l.quantity})">
      <strong>${l.lotNumber}</strong> — ${pName} <span style="color:var(--text-secondary)">(${l.quantity} en stock)</span>
    </div>`;
  }).join('');
  container.style.display = 'block';
};

window.selectRecallLot = function(id, lotNumber, productName, qty) {
  document.getElementById('recall-lot-id').value = id;
  document.getElementById('recall-lot-search').value = lotNumber + ' — ' + productName;
  document.getElementById('recall-lot-results').style.display = 'none';
  const info = document.getElementById('recall-lot-info');
  if (info) {
    info.style.display = 'block';
    info.innerHTML = `<strong>Produit :</strong> ${productName} · <strong>Stock actuel :</strong> ${qty} unités`;
    info.className = 'lot-info-box';
  }
};

function updateRecallInfo() {
  const sel = document.getElementById('recall-lot-select');
  const info = document.getElementById('recall-lot-info');
  if (!sel?.value || !info) return;
  const opt = sel.options[sel.selectedIndex];
  info.style.display = 'block';
  info.innerHTML = `<strong>Produit :</strong> ${opt.dataset.product} · <strong>Stock actuel :</strong> ${opt.dataset.qty} unités`;
  info.className = 'lot-info-box';
}

async function submitLotRecall() {
  const form = document.getElementById('recall-form');
  const lotIdInput = document.getElementById('recall-lot-id');
  if (!lotIdInput?.value) { UI.toast('Veuillez sélectionner un lot à rappeler', 'warning'); return; }
  if (!form?.checkValidity()) { form?.reportValidity(); return; }
  const data = Object.fromEntries(new FormData(form));
  const lotId = parseInt(data.lotId);
  const notifyPatients = document.getElementById('recall-notify-patients')?.checked;

  const ok = await UI.confirm(`⚠️ CONFIRMER LE RAPPEL ?\n\nCette action va: \n• Bloquer immédiatement les ventes de ce lot\n• Générer une alerte prioritaire\n${notifyPatients ? '• Notifier les patients concernés par SMS' : ''} \n\nCette action est irréversible.`);
  if (!ok) return;

  const lot = await DB.dbGet('lots', lotId);
  await DB.dbPut('lots', {
    ...lot,
    status: 'recalled',
    recallReason: data.reason,
    recallDescription: data.description,
    recallDate: new Date().toISOString().split('T')[0],
    recallSource: data.alertSource,
    recallRef: data.alertRef,
    recalledBy: DB.AppState.currentUser?.id,
  });

  // Generate high-priority alert
  await DB.dbAdd('alerts', {
    type: 'LOT_RECALL',
    productId: lot.productId,
    lotId,
    message: `RAPPEL LOT ${lot.lotNumber} — ${data.reason} `,
    description: data.description,
    status: 'unread',
    date: Date.now(),
    priority: 'critical',
  });

  await DB.writeAudit('LOT_RECALL', 'lots', lotId, { reason: data.reason, lotNumber: lot.lotNumber });

  if (notifyPatients) {
    UI.toast('📱 Notifications SMS envoyées aux patients concernés (simulation)', 'info', 4000);
  }

  UI.closeModal();
  UI.toast(`Lot ${lot.lotNumber} rappelé — Ventes bloquées`, 'error', 6000);
  Router.navigate('traceability');
}

function showPharmacovigilanceForm() {
  UI.modal('<i data-lucide="alert-octagon" class="modal-icon-inline"></i> Déclaration de Pharmacovigilance — ANSS', `
    <div class="info-box info-primary" style="margin-bottom:16px">
      Formulaire de déclaration d'effet indésirable médicamenteux conformément au cadre réglementaire de l'ANSS(Agence Nationale de Sécurité Sanitaire) de Guinée.
    </div>
    <form id="pv-form" class="form-grid">
      <div class="form-row">
        <div class="form-group">
          <label>Médicament suspecté *</label>
          <input type="text" name="suspectedDrug" class="form-control" required placeholder="Nom du médicament + dosage">
        </div>
        <div class="form-group">
          <label>N° de lot</label>
          <input type="text" name="lotNumber" class="form-control" placeholder="Si connu">
        </div>
      </div>
      <div class="form-row">
        <div class="form-group">
          <label>Âge du patient</label>
          <input type="number" name="patientAge" class="form-control" min="0" max="120">
        </div>
        <div class="form-group">
          <label>Sexe</label>
          <select name="patientGender" class="form-control">
            <option value="">Non précisé</option>
            <option>Masculin</option>
            <option>Féminin</option>
          </select>
        </div>
      </div>
      <div class="form-group">
        <label>Description de l'effet indésirable *</label>
        <textarea name="adverseEffect" class="form-control" rows="3" required placeholder="Décrivez précisément l'effet indésirable observé..."></textarea>
      </div>
      <div class="form-row">
        <div class="form-group">
          <label>Date de survenue</label>
          <input type="date" name="eventDate" class="form-control" value="${new Date().toISOString().split('T')[0]}">
        </div>
        <div class="form-group">
          <label>Gravité</label>
          <select name="severity" class="form-control">
            <option value="minor">Mineur</option>
            <option value="moderate">Modéré</option>
            <option value="severe">Sévère</option>
            <option value="lethal">Potentiellement fatal</option>
          </select>
        </div>
      </div>
      <div class="form-group">
        <label>Évolution</label>
        <select name="outcome" class="form-control">
          <option>Guéri sans séquelles</option>
          <option>Guéri avec séquelles</option>
          <option>En cours de guérison</option>
          <option>Non résolu</option>
          <option>Décès</option>
          <option>Inconnu</option>
        </select>
      </div>
      <div class="form-group">
        <label>Commentaires additionnels</label>
        <textarea name="comments" class="form-control" rows="2" placeholder="Médicaments associés, antécédents pertinents..."></textarea>
      </div>
      <div class="form-group">
        <label>Déclarant (pharmacien responsable) *</label>
        <input type="text" name="reporter" class="form-control" value="${DB.AppState.currentUser?.name || ''}" required>
      </div>
    </form>
  `, {
    size: 'large',
    footer: `
    <button class="btn btn-secondary" onclick="UI.closeModal()">Annuler</button>
      <button class="btn btn-ghost" onclick="previewPVReport()">👁 Prévisualiser</button>
      <button class="btn btn-danger" onclick="submitPVReport()">📤 Soumettre à l'ANSS</button>
  `
  });
  if (window.lucide) lucide.createIcons();
}

/**
 * Affiche un aperçu de la déclaration avant soumission à l'ANSS
 */
function previewPVReport() {
  const form = document.getElementById('pv-form');
  if (!form) return;
  const data = Object.fromEntries(new FormData(form));

  const severityMap = { minor: 'Mineur', moderate: 'Modéré', severe: 'Sévère', lethal: 'Potentiellement fatal' };
  const sevLabel = severityMap[data.severity] || data.severity;

  UI.modal('<i data-lucide="eye" class="modal-icon-inline"></i> Aperçu de la Déclaration ANSS', `
    <div class="pv-report-card">
      <div class="info-box info-primary" style="margin-bottom:16px">
        <strong>Mode Aperçu</strong> — Veuillez vérifier l'exactitude des informations ci-dessous avant la transmission réglementaire.
      </div>
      <div class="pv-report-grid">
        <div class="pv-report-row"><span class="pv-lbl">Médicament suspecté</span><span class="pv-val"><strong>${data.suspectedDrug}</strong></span></div>
        <div class="pv-report-row"><span class="pv-lbl">N° de lot</span><span class="pv-val"><code>${data.lotNumber || 'Non spécifié'}</code></span></div>
        <div class="pv-report-row"><span class="pv-lbl">Patient</span><span class="pv-val">${data.patientAge || '?'} ans · Sexe: ${data.patientGender || 'Non précisé'}</span></div>
        <div class="pv-report-row"><span class="pv-lbl">Description de l'effet</span><span class="pv-val italic">"${data.adverseEffect}"</span></div>
        <div class="pv-report-row"><span class="pv-lbl">Date de survenue</span><span class="pv-val">${UI.formatDate(data.eventDate)}</span></div>
        <div class="pv-report-row"><span class="pv-lbl">Gravité</span><span class="pv-val"><span class="badge badge-${data.severity === 'lethal' || data.severity === 'severe' ? 'danger' : 'warning'}">${sevLabel}</span></span></div>
        <div class="pv-report-row"><span class="pv-lbl">Évolution</span><span class="pv-val">${data.outcome}</span></div>
        <div class="pv-report-row"><span class="pv-lbl">Commentaires</span><span class="pv-val">${data.comments || 'Aucun'}</span></div>
        <div class="pv-report-row"><span class="pv-lbl">Déclarant</span><span class="pv-val">${data.reporter}</span></div>
      </div>
    </div>
  `, {
    size: 'large',
    footer: `
      <button class="btn btn-secondary" onclick="UI.closeModal(); showPharmacovigilanceForm()"><i data-lucide="edit-3"></i> Retour à la saisie</button>
      <button class="btn btn-danger" onclick="submitPVReport()"><i data-lucide="send"></i> Confirmer & Envoyer à l'ANSS</button>
    `
  });
  if (window.lucide) lucide.createIcons();
}

async function submitPVReport() {
  const form = document.getElementById('pv-form');
  if (!form?.checkValidity()) { form?.reportValidity(); return; }
  const data = Object.fromEntries(new FormData(form));

  const reportId = await DB.dbAdd('alerts', {
    type: 'PHARMACOVIGILANCE',
    message: `Déclaration PV — ${data.suspectedDrug} — ${data.severity} `,
    data,
    status: 'submitted',
    date: Date.now(),
    priority: data.severity === 'lethal' ? 'critical' : data.severity === 'severe' ? 'high' : 'medium',
  });

  await DB.writeAudit('PV_REPORT', 'alerts', reportId, { drug: data.suspectedDrug, severity: data.severity });
  UI.closeModal();
  UI.toast('Déclaration de pharmacovigilance enregistrée et transmise à l\'ANSS', 'success', 5000);
}

async function initDestroyLot(lotId) {
  const lot = await DB.dbGet('lots', lotId);
  const prod = lot ? window._traceProductMap?.[lot.productId] : null;
  if (!lot) return;

  UI.modal('<i data-lucide="trash-2" class="modal-icon-inline"></i> Destruction de Médicament', `
    <div class="info-box info-warning" style="margin-bottom:16px">
      <strong>⚠️ Procédure réglementaire</strong> — La destruction doit être consignée dans un procès-verbal officiel.
    </div>
    <form id="destroy-form" class="form-grid">
      <div class="detail-row"><span>Produit</span><span><strong>${prod?.name || '—'}</strong></span></div>
      <div class="detail-row"><span>Lot</span><span><code>${lot.lotNumber}</code></span></div>
      <div class="detail-row"><span>Quantité en stock</span><span><strong>${lot.quantity} unités</strong></span></div>
      <div class="detail-row"><span>Date d'expiration</span><span>${UI.expiryBadge(lot.expiryDate)}</span></div>

      <div class="form-group" style="margin-top:12px">
        <label>Quantité à détruire *</label>
        <input type="number" name="quantity" class="form-control" max="${lot.quantity}" value="${lot.quantity}" min="1" required>
      </div>
      <div class="form-group">
        <label>Motif de destruction *</label>
        <select name="reason" class="form-control" required>
          <option>Péremption</option>
          <option>Rappel de lot</option>
          <option>Non-conformité qualité</option>
          <option>Dommage physique</option>
          <option>Contamination</option>
          <option>Autre</option>
        </select>
      </div>
      <div class="form-group">
        <label>Méthode de destruction</label>
        <select name="method" class="form-control">
          <option>Incinération</option>
          <option>Dénaturation chimique</option>
          <option>Enfouissement sécurisé</option>
          <option>Retour fournisseur</option>
        </select>
      </div>
      <div class="form-group">
        <label>Témoin(s) présent(s)</label>
        <input type="text" name="witnesses" class="form-control" placeholder="Noms des témoins">
      </div>
    </form>
  `, {
    footer: `
    <button class="btn btn-secondary" onclick="UI.closeModal()">Annuler</button>
      <button class="btn btn-danger" onclick="confirmDestroyLot(${lotId})"><i data-lucide="trash-2"></i> Confirmer la Destruction</button>
  `
  });
  if (window.lucide) lucide.createIcons();
}

async function showDestroyForm() {
  const lots = window._traceLots || [];
  const productMap = window._traceProductMap || {};
  const expiredLots = lots.filter(l => {
    const d = UI.daysUntilExpiry(l.expiryDate);
    return l.status === 'active' && d !== null && d <= 30;
  });
  if (expiredLots.length === 0) {
    UI.toast('Aucun lot expiré ou proche de l\'expiration à détruire', 'info');
    return;
  }
  await initDestroyLot(expiredLots[0].id);
}

async function confirmDestroyLot(lotId) {
  const form = document.getElementById('destroy-form');
  if (!form?.checkValidity()) { form?.reportValidity(); return; }
  const data = Object.fromEntries(new FormData(form));
  const qty = parseInt(data.quantity);
  const lot = await DB.dbGet('lots', lotId);

  await DB.dbPut('lots', {
    ...lot,
    quantity: lot.quantity - qty,
    status: lot.quantity - qty <= 0 ? 'destroyed' : lot.status,
    destroyedQty: (lot.destroyedQty || 0) + qty,
    destructionDate: new Date().toISOString().split('T')[0],
    destructionReason: data.reason,
    destructionMethod: data.method,
    destructionWitnesses: data.witnesses,
    destructionBy: DB.AppState.currentUser?.name,
  });

  // Movement
  await DB.dbAdd('movements', {
    productId: lot.productId,
    type: 'EXIT',
    subType: 'DESTRUCTION',
    quantity: -qty,
    lotNumber: lot.lotNumber,
    date: new Date().toISOString(),
    userId: DB.AppState.currentUser?.id,
    note: `Destruction: ${data.reason} `,
  });

  // Update stock
  const stockAll = await DB.dbGetAll('stock');
  const stockEntry = stockAll.find(s => s.productId === lot.productId);
  if (stockEntry) {
    await DB.dbPut('stock', { ...stockEntry, quantity: Math.max(0, stockEntry.quantity - qty) });
  }

  await DB.writeAudit('LOT_DESTRUCTION', 'lots', lotId, { qty, reason: data.reason, lotNumber: lot.lotNumber });
  UI.closeModal();
  UI.toast(`Destruction de ${qty} unité(s) enregistrée — PV généré`, 'success');
  Router.navigate('traceability');
}

async function blockExpiredLots() {
  const ok = await UI.confirm('Bloquer tous les lots expirés actifs ?\n\nLes ventes seront automatiquement bloquées.');
  if (!ok) return;
  const lots = window._traceLots || [];
  let count = 0;
  for (const lot of lots) {
    const d = UI.daysUntilExpiry(lot.expiryDate);
    if (lot.status === 'active' && d !== null && d <= 0) {
      await DB.dbPut('lots', { ...lot, status: 'blocked' });
      count++;
    }
  }
  UI.toast(`${count} lot(s) expiré(s) bloqué(s)`, 'success');
  Router.navigate('traceability');
}

async function promoteLot(lotId) {
  UI.toast('Fonctionnalité : Promotion lot proche expiration — Newsletter & remises générées', 'info', 4000);
}

async function loadDestructionHistory() {
  const container = document.getElementById('destruction-history');
  if (!container) return;
  const lots = await DB.dbGetAll('lots');
  const destroyed = lots.filter(l => l.destructionDate);
  const productMap = window._traceProductMap || {};
  if (destroyed.length === 0) {
    container.innerHTML = '<div class="empty-state-small">Aucune destruction enregistrée</div>';
    return;
  }
  container.innerHTML = `<h3 class="section-subtitle" style="margin-bottom:8px">Historique des destructions</h3>` + `
    <div class="table-wrapper">
      <table class="data-table">
        <thead><tr><th>Produit</th><th>Lot</th><th>Qté détruite</th><th>Motif</th><th>Méthode</th><th>Date</th><th>Réalisé par</th></tr></thead>
        <tbody>
          ${destroyed.sort((a, b) => b.destructionDate?.localeCompare(a.destructionDate || '')).map(l => `
            <tr>
              <td>${productMap[l.productId]?.name || '—'}</td>
              <td><code class="code-tag">${l.lotNumber}</code></td>
              <td><strong>${l.destroyedQty || '—'}</strong></td>
              <td>${l.destructionReason || '—'}</td>
              <td>${l.destructionMethod || '—'}</td>
              <td>${UI.formatDate(l.destructionDate)}</td>
              <td>${l.destructionBy || '—'}</td>
            </tr>`).join('')}
        </tbody>
      </table>
    </div> `;
  if (window.lucide) lucide.createIcons();
}

// ═══════════════════════════════════════════════════════════════════
// Journal d'Audit — Onglet dédié dans Traçabilité
// ═══════════════════════════════════════════════════════════════════
let _auditData = [];

async function loadAuditTab() {
  const container = document.getElementById('audit-log-container');
  if (!container) return;

  if (DB.AppState.currentUser?.role !== 'admin') {
    container.innerHTML = '<div class="error-state">Accès réservé à l\'administrateur</div>';
    return;
  }

  container.innerHTML = '<div class="loading-state"><div class="spinner"></div><p>Chargement...</p></div>';

  // Charger les 200 dernières entrées au lieu de tout charger (performance)
  _auditData = await DB.dbGetRecent('auditLog', 'timestamp', 200);
  _auditPageSize = 50;
  _auditCurrentPage = 0;
  renderAuditTable(_auditData);
}

function filterAuditLog() {
  const text = (document.getElementById('audit-filter-text')?.value || '').toLowerCase();
  const action = document.getElementById('audit-filter-action')?.value || '';

  let filtered = _auditData;
  if (action) filtered = filtered.filter(l => l.action === action);
  if (text) filtered = filtered.filter(l =>
    (l.action || '').toLowerCase().includes(text) ||
    (l.username || '').toLowerCase().includes(text) ||
    (l.entity || '').toLowerCase().includes(text) ||
    JSON.stringify(l.details || {}).toLowerCase().includes(text)
  );
  renderAuditTable(filtered);
}

function formatAuditDetails(log) {
  const d = log.details || {};
  const user = log.username || 'Système';

  switch (log.action) {
    case 'LOGIN':
      return `Connexion réussie de <strong>${user}</strong>.`;
    case 'LOGOUT':
      return `Déconnexion de <strong>${user}</strong>.`;
    case 'CASH_ENTRY':
      const typeLabel = d.type === 'in' ? 'Entrée de' : 'Sortie de';
      const reasonStr = d.reason ? ` (Motif : ${d.reason})` : '';
      return `${typeLabel} <strong>${UI.formatCurrency(d.amount)}</strong> en ${UI.paymentMethodBadge(d.paymentMethod)}${reasonStr}.`;
    case 'CAISSE_CLOSURE':
      const ecart = (d.physical || 0) - (d.expected || 0);
      const ecartStatus = ecart === 0 ? 'Balance parfaite' : ecart < 0 ? `Déficit de ${UI.formatCurrency(Math.abs(ecart))}` : `Excédent de ${UI.formatCurrency(ecart)}`;
      return `Clôture de caisse du ${UI.formatDate(d.date)}. Physique : <strong>${UI.formatCurrency(d.physical)}</strong>. Résultat : <span class="${ecart < 0 ? 'text-danger' : 'text-success'}">${ecartStatus}</span>.`;
    case 'STOCK_ENTRY':
      return `Réception de <strong>${d.productName || 'produit'}</strong>. Quantité : ${d.quantity} unités. N° Lot : <code>${d.lotNumber || '—'}</code>.`;
    case 'SALE':
      const itemsCount = d.itemCount ? ` (${d.itemCount} articles)` : '';
      return `Vente #<strong>${String(log.entityId).padStart(6, '0')}</strong> pour un montant de <strong>${UI.formatCurrency(d.total)}</strong>${itemsCount}.`;
    case 'DEBT_REFUND':
      return `Règlement d'une dette de <strong>${UI.formatCurrency(d.amount)}</strong> pour la vente #<strong>${String(log.entityId).padStart(6, '0')}</strong>.`;
    case 'SAVE_SETTINGS':
      return `Modification des paramètres généraux : <em>${d.pharmacy_name || 'Configuration'}</em>.`;
    case 'ADD_USER':
      return `Création d'un nouvel accès pour <strong>${d.name || d.username}</strong> avec le rôle <em>${d.role}</em>.`;
    case 'EDIT_USER':
      return `Mise à jour du profil de l'utilisateur <strong>${d.name || 'Inconnu'}</strong>.`;
    case 'LOT_RECALL':
      return `<strong>ALERTE RAPPEL</strong> : Le lot <code>${d.lotNumber}</code> a été retiré de la vente. Motif : ${d.reason}.`;
    case 'LOT_DESTRUCTION':
      return `Destruction réglementaire de ${d.qty} unités du lot <code>${d.lotNumber}</code>. Motif : ${d.reason}.`;
    case 'PV_REPORT':
      const severityMap = { minor: 'Mineur', moderate: 'Modéré', severe: 'Sévère', lethal: 'Potentiellement fatal' };
      const sevLabel = severityMap[d.severity] || d.severity;
      return `Signalement d'effet indésirable (ANSS) pour <strong>${d.drug}</strong>. Gravité : <span class="badge badge-danger">${sevLabel}</span>.`;
    case 'RETURN_PROCESSED':
      return `<strong>RETOUR CLIENT</strong> : Vente #<strong>${String(d.saleId).padStart(6, '0')}</strong>. Montant remboursé : <strong>${UI.formatCurrency(d.refundAmount)}</strong>. Motif : ${d.reason}.`;
    case 'COMPLIANCE_CHECK':
      return `<strong>Évaluation de conformité</strong> — BPD : <span class="badge ${(d.bpdScore||0)>=80?'badge-success':'badge-warning'}">${d.bpdScore||0}%</span> · DNPM : <span class="badge ${(d.dnpmScore||0)>=80?'badge-success':'badge-warning'}">${d.dnpmScore||0}%</span> · Global : <strong>${d.globalScore||0}%</strong>.`;
    case 'AUDIT_PLANNED':
      return `Audit planifié : <strong>${d.title || '—'}</strong> (${d.auditType || 'Général'}) prévu le ${UI.formatDate(d.plannedDate)}. Responsable : ${d.responsible || '—'}.`;
    case 'AUDIT_STARTED':
      return `Audit démarré : <strong>${d.title || '—'}</strong> (${d.auditType || 'Général'}).`;
    case 'AUDIT_COMPLETED':
      return `Audit terminé avec succès : <strong>${d.title || '—'}</strong> (${d.auditType || 'Général'}).`;
    case 'AUDIT_CANCELLED':
      return `Audit annulé : <strong>${d.title || '—'}</strong> (${d.auditType || 'Général'}).`;
    case 'AUDIT_REPORT_GENERATED':
      return `Rapport d'audit généré pour la période <strong>${d.period || '—'}</strong>. ${d.entriesCount || 0} entrée(s) compilée(s).`;
    case 'CREATE_ORDER':
      return `Création du bon de commande #<strong>${String(log.entityId).padStart(6, '0')}</strong> pour le fournisseur ${d.supplierName || '—'}. Montant estimé : <strong>${UI.formatCurrency(d.totalAmount || 0)}</strong>.`;
    case 'RECEIVE_ORDER':
      return `Réception de la commande #<strong>${String(log.entityId).padStart(6, '0')}</strong>. Articles reçus : ${d.receivedItemsCount || 0}/${d.totalItemsCount || 0}.`;
    case 'BULK_IMPORT':
      return `Importation massive de données (${d.type || 'produits'}). ${d.count || 0} entrées traitées avec succès.`;
    case 'ADD_SUPPLIER':
      return `Ajout du fournisseur <strong>${d.name || '—'}</strong> au répertoire.`;
    case 'SEND_ORDER':
      return `Envoi du bon de commande #<strong>${String(log.entityId).padStart(6, '0')}</strong> au fournisseur.`;
    case 'INVENTORY':
      return `Inventaire réalisé. ${d.adjustments || 0} ajustement(s) effectué(s).`;
    case 'ADD_PRODUCT':
      return `Ajout du produit <strong>${d.name || '—'}</strong> au catalogue.`;
    case 'EDIT_PRODUCT':
      return `Modification du produit <strong>${d.name || '—'}</strong>.`;
    case 'DEACTIVATE_PRODUCT':
      return `Désactivation du produit <strong>${d.name || '—'}</strong>.`;
    case 'ADD_PRESCRIPTION':
      return `Enregistrement de l'ordonnance pour <strong>${d.patientName || '—'}</strong> (${d.itemCount || 0} médicament(s)). Dr ${d.doctorName || '—'}.`;
    case 'VALIDATE_PRESCRIPTION':
      return `Validation de l'ordonnance #<strong>${String(log.entityId).padStart(6, '0')}</strong>.`;
    case 'DISPENSE_PRESCRIPTION':
      return `Dispensation de l'ordonnance pour <strong>${d.patientName || '—'}</strong>.`;
    case 'VIEW_PATIENT':
      return `Consultation du dossier patient <strong>${d.patientName || '—'}</strong>.`;
    case 'ADD_PATIENT':
      return `Enregistrement du patient <strong>${d.name || '—'}</strong>.`;
    case 'EDIT_PATIENT':
      return `Modification du dossier patient <strong>${d.name || '—'}</strong>.`;
    case 'AUTO_ORDER':
      return `Commande automatique générée : ${d.itemCount || 0} article(s) pour un total de <strong>${UI.formatCurrency(d.totalAmount || 0)}</strong>.`;
    case 'RESTORE_ZERO_LOSS':
      return `Restauration de données système effectuée.`;
    default:
      // Si on ne connaît pas l'action, on essaie de construire une phrase générique
      if (d.name || d.productName) return `Action sur <strong>${d.name || d.productName}</strong>.`;
      return "Action système enregistrée.";
  }
}

function renderAuditTable(data) {
  const container = document.getElementById('audit-log-container');
  if (!container) return;

  const actionLabels = {
    STOCK_ENTRY: ['package-plus', 'Entrée Stock', 'badge-success'],
    SALE: ['shopping-cart', 'Vente', 'badge-info'],
    SAVE_SETTINGS: ['settings', 'Configuration', 'badge-neutral'],
    RETURN_PROCESSED: ['undo-2', 'Retour Client', 'badge-warning'],
    ADD_USER: ['user-plus', 'Nouvel Utilisateur', 'badge-info'],
    EDIT_USER: ['user-cog', 'Modif Utilisateur', 'badge-neutral'],
    LOT_RECALL: ['alert-triangle', 'Rappel Lot', 'badge-danger'],
    LOT_DESTRUCTION: ['trash-2', 'Destruction', 'badge-danger'],
    PV_REPORT: ['file-warning', 'Pharmacovigilance', 'badge-warning'],
    RESTORE_BACKUP: ['folder-open', 'Restauration', 'badge-warning'],
    LOGIN: ['log-in', 'Connexion', 'badge-neutral'],
    LOGOUT: ['log-out', 'Déconnexion', 'badge-neutral'],
    CASH_ENTRY: ['banknote', 'Mouv. Caisse', 'badge-info'],
    CAISSE_CLOSURE: ['lock', 'Clôture Caisse', 'badge-neutral'],
    DEBT_REFUND: ['check-circle', 'Réglt Dette', 'badge-success'],
    COMPLIANCE_CHECK: ['check-square', 'Conformité', 'badge-success'],
    AUDIT_PLANNED: ['calendar-clock', 'Audit Planifié', 'badge-info'],
    AUDIT_STARTED: ['play', 'Audit Démarré', 'badge-warning'],
    AUDIT_COMPLETED: ['check-circle', 'Audit Terminé', 'badge-success'],
    AUDIT_CANCELLED: ['x-circle', 'Audit Annulé', 'badge-danger'],
    AUDIT_REPORT_GENERATED: ['file-bar-chart', 'Rapport Généré', 'badge-info'],
    RECEIVE_ORDER: ['truck', 'Commande Reçue', 'badge-success'],
    CREATE_ORDER: ['file-plus', 'Commande Créée', 'badge-info'],
    BULK_IMPORT: ['upload-cloud', 'Import Massif', 'badge-warning'],
    ADD_SUPPLIER: ['truck', 'Ajout Fournisseur', 'badge-info'],
    SEND_ORDER: ['send', 'Envoi Commande', 'badge-info'],
    INVENTORY: ['clipboard-check', 'Inventaire', 'badge-warning'],
    ADD_PRODUCT: ['plus-circle', 'Ajout Produit', 'badge-success'],
    EDIT_PRODUCT: ['edit-3', 'Modif Produit', 'badge-neutral'],
    DEACTIVATE_PRODUCT: ['x-circle', 'Désactivation Produit', 'badge-danger'],
    ADD_PRESCRIPTION: ['file-plus', 'Ajout Ordonnance', 'badge-info'],
    VALIDATE_PRESCRIPTION: ['file-check', 'Validation Ordonnance', 'badge-success'],
    DISPENSE_PRESCRIPTION: ['pill', 'Dispensation', 'badge-success'],
    VIEW_PATIENT: ['eye', 'Consultation Patient', 'badge-neutral'],
    ADD_PATIENT: ['user-plus', 'Ajout Patient', 'badge-info'],
    EDIT_PATIENT: ['user-cog', 'Modif Patient', 'badge-neutral'],
    AUTO_ORDER: ['zap', 'Commande Auto', 'badge-warning'],
    RESTORE_ZERO_LOSS: ['shield', 'Restauration Données', 'badge-warning'],
  };

  if (data.length === 0) {
    container.innerHTML = '<div class="empty-state-small"><i data-lucide="clipboard-list"></i> Aucune entrée d\'audit trouvée</div>';
    if (window.lucide) lucide.createIcons();
    return;
  }

  // Pagination : afficher par tranches pour la performance
  const pageSize = window._auditPageSize || 50;
  const currentPage = window._auditCurrentPage || 0;
  const endIdx = Math.min((currentPage + 1) * pageSize, data.length);
  const displayData = data.slice(0, endIdx);
  const hasMore = endIdx < data.length;

  container.innerHTML = `
    <p class="text-muted text-sm" style="margin-bottom:8px">${data.length} entrée(s) — Affichage ${displayData.length} sur ${data.length}</p>
    <div class="table-wrapper">
      <table class="data-table">
        <thead><tr><th>Date / Heure</th><th>Utilisateur</th><th>Action</th><th>Détails</th></tr></thead>
        <tbody>
          ${displayData.map(log => {
    const [icon, label, cls] = actionLabels[log.action] || ['info', log.action, 'badge-neutral'];
    const humanDetails = formatAuditDetails(log);
    return `<tr>
              <td class="text-sm" style="white-space:nowrap">${UI.formatDateTime(log.timestamp)}</td>
              <td><code>${log.username || '—'}</code></td>
              <td><span class="badge ${cls}"><i data-lucide="${icon}"></i> ${label}</span></td>
              <td class="text-sm">${humanDetails}</td>
            </tr>`;
  }).join('')}
        </tbody>
      </table>
    </div>
    ${hasMore ? `<div style="text-align:center;margin-top:12px"><button class="btn btn-secondary" onclick="loadMoreAudit()"><i data-lucide="chevron-down"></i> Charger plus (${data.length - endIdx} restantes)</button></div>` : ''}
  `;
  if (window.lucide) lucide.createIcons();
}

function loadMoreAudit() {
  window._auditCurrentPage = (window._auditCurrentPage || 0) + 1;
  const text = (document.getElementById('audit-filter-text')?.value || '').toLowerCase();
  const action = document.getElementById('audit-filter-action')?.value || '';
  let filtered = _auditData;
  if (action) filtered = filtered.filter(l => l.action === action);
  if (text) filtered = filtered.filter(l =>
    (l.action || '').toLowerCase().includes(text) ||
    (l.username || '').toLowerCase().includes(text) ||
    (l.entity || '').toLowerCase().includes(text) ||
    JSON.stringify(l.details || {}).toLowerCase().includes(text)
  );
  renderAuditTable(filtered);
}

window.switchTraceTab = switchTraceTab;
window.doLotTrace = doLotTrace;
window.traceLot = traceLot;
window.showLotRecallForm = showLotRecallForm;
window.updateRecallInfo = updateRecallInfo;
window.submitLotRecall = submitLotRecall;
window.showPharmacovigilanceForm = showPharmacovigilanceForm;
window.previewPVReport = previewPVReport;
window.submitPVReport = submitPVReport;
window.initDestroyLot = initDestroyLot;
window.showDestroyForm = showDestroyForm;
window.confirmDestroyLot = confirmDestroyLot;
window.blockExpiredLots = blockExpiredLots;
window.promoteLot = promoteLot;
window.loadAuditTab = loadAuditTab;
window.filterAuditLog = filterAuditLog;
window.loadMoreAudit = loadMoreAudit;

Router.register('traceability', renderTraceability);

// ═══════════════════════════════════════════════════════════════════
// GATEWAY ANSS — Déclarations de Pharmacovigilance (v3)
// ═══════════════════════════════════════════════════════════════════
const ANSSGateway = {
  // Point d'accès ANSS Guinée (simulation — à remplacer par l'URL réelle)
  endpoint: 'https://anss.gov.gn/api/pharmacovigilance/v1/declarations',
  apiKey: 'ANSS-PV-KEY-DEMO-2024', // Clé API à configurer en production

  async submitDeclaration(data) {
    // Préparer le payload normalisé ANSS
    const payload = {
      type: 'ADVERSE_DRUG_REACTION',
      version: '1.0',
      pharmacy: {
        name: data.pharmacyName,
        dnpm: data.pharmacyDnpm,
        phone: data.pharmacyPhone,
        reporter: data.reporter,
      },
      patient: {
        age: data.patientAge || null,
        gender: data.patientGender || null,
        anonymized: true,
      },
      medication: {
        name: data.suspectedDrug,
        lotNumber: data.lotNumber || null,
        manufacturer: data.manufacturer || null,
      },
      event: {
        description: data.adverseEffect,
        date: data.eventDate,
        severity: data.severity,
        outcome: data.outcome,
        causality: data.causality || 'possible',
        comments: data.comments || '',
      },
      submittedAt: new Date().toISOString(),
      submissionId: `PV - ${Date.now()} `,
    };

    // Tentative d'envoi réel (timeout 5s)
    let serverResponse = null;
    let sendError = null;
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 5000);
      const resp = await fetch(this.endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-API-Key': this.apiKey,
          'X-Pharmacy-DNPM': data.pharmacyDnpm || '',
        },
        body: JSON.stringify(payload),
        signal: controller.signal,
      });
      clearTimeout(timeout);
      if (resp.ok) {
        serverResponse = await resp.json();
      } else {
        sendError = `HTTP ${resp.status} `;
      }
    } catch (e) {
      sendError = e.name === 'AbortError' ? 'Délai dépassé (serveur ANSS)' : e.message;
    }

    // Enregistrer la déclaration localement avec son statut
    const declarationRecord = {
      ...payload,
      localId: Date.now(),
      serverResponse,
      sendError,
      status: serverResponse ? 'submitted' : 'queued_offline',
      savedAt: new Date().toISOString(),
    };

    // Sauvegarder dans la base locale (queue de sync)
    await DB.dbAdd('alerts', {
      type: 'PHARMACOVIGILANCE',
      message: `Déclaration PV — ${data.suspectedDrug} — ${data.severity} `,
      data: declarationRecord,
      status: serverResponse ? 'submitted' : 'pending_sync',
      date: Date.now(),
      priority: data.severity === 'lethal' ? 'critical' : data.severity === 'severe' ? 'high' : 'medium',
    });

    await DB.dbAdd('syncQueue', {
      type: 'PV_DECLARATION',
      data: payload,
      status: serverResponse ? 'synced' : 'pending',
      createdAt: new Date().toISOString(),
      retries: 0,
    });

    return {
      success: !!serverResponse,
      submissionId: payload.submissionId,
      serverResponse,
      sendError,
      offline: !serverResponse,
    };
  },

  async retryPendingDeclarations() {
    const queue = await DB.dbGetAll('syncQueue');
    const pending = queue.filter(q => q.type === 'PV_DECLARATION' && q.status === 'pending');
    let synced = 0;
    for (const item of pending) {
      try {
        const resp = await fetch(this.endpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'X-API-Key': this.apiKey },
          body: JSON.stringify(item.data),
        });
        if (resp.ok) {
          await DB.dbPut('syncQueue', { ...item, status: 'synced', syncedAt: new Date().toISOString() });
          synced++;
        }
      } catch (e) {
        await DB.dbPut('syncQueue', { ...item, retries: (item.retries || 0) + 1 });
      }
    }
    return synced;
  },
};

// Override la fonction de soumission PV pour utiliser le vrai gateway
async function submitPVReport() {
  const form = document.getElementById('pv-form');
  if (!form?.checkValidity()) { form?.reportValidity(); return; }
  const data = Object.fromEntries(new FormData(form));

  const btn = document.querySelector('.modal-footer .btn-danger');
  if (btn) { btn.disabled = true; btn.textContent = '⏳ Envoi en cours…'; }

  try {
    // Charger infos pharmacie
    const settings = await DB.dbGetAll('settings');
    const gs = k => settings.find(s => s.key === k)?.value;
    data.pharmacyName = gs('pharmacy_name') || 'Pharmacie Centrale';
    data.pharmacyDnpm = gs('pharmacy_dnpm') || 'LIC-DNPM-2024-001';
    data.pharmacyPhone = gs('pharmacy_phone') || '+224 620 000 000';

    const result = await ANSSGateway.submitDeclaration(data);

    await DB.writeAudit('PV_REPORT', 'alerts', null, {
      drug: data.suspectedDrug,
      severity: data.severity,
      submissionId: result.submissionId,
      status: result.success ? 'sent' : 'queued',
    });

    UI.closeModal();

    if (result.success) {
      UI.toast(`✅ Déclaration PV transmise à l'ANSS — Réf. ${result.submissionId}`, 'success', 6000);
    } else {
      UI.toast(`📥 Déclaration PV enregistrée localement (ANSS hors ligne)\nElle sera transmise automatiquement lors de la prochaine connexion.`, 'warning', 8000);
    }

    // Afficher le rapport de confirmation
    _showPVConfirmation(data, result);

  } catch (e) {
    console.error(e);
    UI.toast('Erreur lors de l\'envoi : ' + e.message, 'error');
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = '📤 Soumettre à l\'ANSS'; }
  }
}

function _showPVConfirmation(data, result) {
  UI.modal('📋 Rapport de Déclaration ANSS', `
    <div class="pv-report-card">
      <div class="pv-report-status ${result.success ? 'status-sent' : 'status-queued'}">
        ${result.success
      ? '✅ Déclaration transmise à l\'ANSS avec succès'
      : '📥 Déclaration enregistrée — Transmission en attente (mode hors ligne)'}
      </div>

      <div class="pv-report-grid">
        <div class="pv-report-row"><span class="pv-lbl">Réf. déclaration</span><span class="pv-val"><code>${result.submissionId}</code></span></div>
        <div class="pv-report-row"><span class="pv-lbl">Médicament suspecté</span><span class="pv-val">${data.suspectedDrug}</span></div>
        <div class="pv-report-row"><span class="pv-lbl">Gravité</span><span class="pv-val"><span class="badge badge-${data.severity === 'lethal' || data.severity === 'severe' ? 'danger' : 'warning'}">${data.severity}</span></span></div>
        <div class="pv-report-row"><span class="pv-lbl">Déclarant</span><span class="pv-val">${data.reporter}</span></div>
        <div class="pv-report-row"><span class="pv-lbl">Date</span><span class="pv-val">${new Date().toLocaleDateString('fr-FR')}</span></div>
        <div class="pv-report-row"><span class="pv-lbl">Statut envoi ANSS</span><span class="pv-val">${result.success ? '<span class="badge badge-success">Envoyé</span>' : '<span class="badge badge-warning">En attente de synchro</span>'}</span></div>
        ${result.sendError ? `<div class="pv-report-row"><span class="pv-lbl">Note technique</span><span class="pv-val text-muted">${result.sendError}</span></div>` : ''}
      </div>

      ${!result.success ? `
        <div class="info-box info-warning" style="margin-top:12px">
          <strong>Mode hors ligne :</strong> La déclaration est sauvegardée localement et sera automatiquement transmise à l'ANSS lors de la prochaine connexion réseau.
          <button class="btn btn-xs btn-primary" style="margin-top:8px;display:block" onclick="ANSSGateway.retryPendingDeclarations().then(n=>UI.toast(n+' déclaration(s) synchronisée(s)','success'))">🔄 Réessayer maintenant</button>
        </div>` : ''}
    </div>
  `, {
    footer: `<button class="btn btn-secondary" onclick="UI.closeModal()">Fermer</button>
             <button class="btn btn-primary" onclick="UI.closeModal();printPVReport('${result.submissionId}')">🖨️ Imprimer</button>`
  });
}

function printPVReport(submissionId) {
  UI.toast('🖨️ Impression du rapport PV en cours...', 'info');
}

window.ANSSGateway = ANSSGateway;
window.previewPVReport = previewPVReport;
window.submitPVReport = submitPVReport;
window.printPVReport = printPVReport;

// ═══════════════════════════════════════════════════════════════════
// FEATURE 1 — Génération de Rapports d'Audit
// ═══════════════════════════════════════════════════════════════════

async function generateAuditReport() {
  const container = document.getElementById('audit-report-output');
  if (!container) return;

  const startDate = document.getElementById('report-date-start')?.value;
  const endDate = document.getElementById('report-date-end')?.value;
  const actionFilter = document.getElementById('report-action-filter')?.value;

  if (!startDate || !endDate) {
    UI.toast('Veuillez sélectionner une période', 'warning');
    return;
  }

  UI.loading(container, 'Génération du rapport en cours...');

  const allAudit = await DB.dbGetAll('auditLog');
  const startTs = new Date(startDate).getTime();
  const endTs = new Date(endDate + 'T23:59:59').getTime();

  let filtered = allAudit.filter(log => {
    const ts = log.timestamp || 0;
    return ts >= startTs && ts <= endTs;
  });

  if (actionFilter) {
    filtered = filtered.filter(log => log.action === actionFilter);
  }

  filtered.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));

  // Statistiques par type d'action
  const actionStats = {};
  filtered.forEach(log => {
    const act = log.action || 'INCONNU';
    actionStats[act] = (actionStats[act] || 0) + 1;
  });

  // Utilisateurs actifs
  const userStats = {};
  filtered.forEach(log => {
    const user = log.username || 'Système';
    userStats[user] = (userStats[user] || 0) + 1;
  });

  // Labels d'actions
  const actionLabels = {
    STOCK_ENTRY: 'Entrée Stock', SALE: 'Vente', SAVE_SETTINGS: 'Configuration',
    RETURN_PROCESSED: 'Retour Client', ADD_USER: 'Ajout Utilisateur', EDIT_USER: 'Modif Utilisateur',
    LOT_RECALL: 'Rappel Lot', LOT_DESTRUCTION: 'Destruction', PV_REPORT: 'Pharmacovigilance',
    LOGIN: 'Connexion', LOGOUT: 'Déconnexion', CASH_ENTRY: 'Mouv. Caisse',
    CAISSE_CLOSURE: 'Clôture Caisse', DEBT_REFUND: 'Réglt Dette', RESTORE_BACKUP: 'Restauration',
    COMPLIANCE_CHECK: 'Audit Conformité', AUDIT_PLANNED: 'Audit Planifié',
    AUDIT_STARTED: 'Audit Démarré', AUDIT_COMPLETED: 'Audit Terminé',
    AUDIT_CANCELLED: 'Audit Annulé', AUDIT_REPORT_GENERATED: 'Rapport Généré',
    RECEIVE_ORDER: 'Commande Reçue', CREATE_ORDER: 'Commande Créée', BULK_IMPORT: 'Import Massif',
  };

  // Charger infos pharmacie
  const settings = await DB.dbGetAll('settings');
  const gs = k => settings.find(s => s.key === k)?.value;
  const pharmacyName = gs('pharmacy_name') || 'OrdiveX';
  const pharmacyAddress = gs('pharmacy_address') || '';
  const pharmacyPhone = gs('pharmacy_phone') || '';

  container.innerHTML = `
    <div class="audit-report-printable" id="audit-report-printable">
      <div class="audit-report-header">
        <div class="audit-report-logo">
          <i data-lucide="shield-check" style="width:32px;height:32px"></i>
          <div>
            <h2 style="margin:0;font-size:20px">${pharmacyName}</h2>
            <p class="text-sm text-muted" style="margin:0">${pharmacyAddress}${pharmacyPhone ? ' · ' + pharmacyPhone : ''}</p>
          </div>
        </div>
        <div style="text-align:right">
          <h3 style="margin:0;color:var(--primary-color)">Rapport d'Audit</h3>
          <p class="text-sm text-muted" style="margin:4px 0 0">Du ${UI.formatDate(startDate)} au ${UI.formatDate(endDate)}</p>
          <p class="text-sm text-muted" style="margin:2px 0 0">Généré le ${new Date().toLocaleDateString('fr-FR')} à ${new Date().toLocaleTimeString('fr-FR', {hour:'2-digit',minute:'2-digit'})}</p>
        </div>
      </div>

      <div class="audit-report-summary">
        <div class="audit-report-stat-card">
          <div class="audit-report-stat-val">${filtered.length}</div>
          <div class="audit-report-stat-lbl">Actions enregistrées</div>
        </div>
        <div class="audit-report-stat-card">
          <div class="audit-report-stat-val">${Object.keys(actionStats).length}</div>
          <div class="audit-report-stat-lbl">Types d'actions</div>
        </div>
        <div class="audit-report-stat-card">
          <div class="audit-report-stat-val">${Object.keys(userStats).length}</div>
          <div class="audit-report-stat-lbl">Utilisateurs actifs</div>
        </div>
        <div class="audit-report-stat-card">
          <div class="audit-report-stat-val">${Math.ceil((endTs - startTs) / (1000*60*60*24))}</div>
          <div class="audit-report-stat-lbl">Jours couverts</div>
        </div>
      </div>

      <h4 class="audit-report-section-title"><i data-lucide="pie-chart"></i> Répartition par type d'action</h4>
      <div class="audit-report-breakdown">
        ${Object.entries(actionStats).sort((a, b) => b[1] - a[1]).map(([action, count]) => {
          const pct = filtered.length > 0 ? ((count / filtered.length) * 100).toFixed(1) : 0;
          return `<div class="audit-report-breakdown-row">
            <span class="audit-report-breakdown-label">${actionLabels[action] || action}</span>
            <div class="audit-report-breakdown-bar-bg"><div class="audit-report-breakdown-bar" style="width:${pct}%"></div></div>
            <span class="audit-report-breakdown-count">${count} <span class="text-muted">(${pct}%)</span></span>
          </div>`;
        }).join('')}
      </div>

      <h4 class="audit-report-section-title"><i data-lucide="users"></i> Activité par utilisateur</h4>
      <div class="audit-report-users">
        ${Object.entries(userStats).sort((a, b) => b[1] - a[1]).map(([user, count]) => `
          <div class="audit-report-user-chip">
            <span class="audit-report-user-avatar">${(user || '?').charAt(0).toUpperCase()}</span>
            <span><strong>${user}</strong></span>
            <span class="badge badge-neutral">${count} action(s)</span>
          </div>
        `).join('')}
      </div>

      <h4 class="audit-report-section-title"><i data-lucide="list"></i> Journal détaillé (${Math.min(filtered.length, 200)} entrées)</h4>
      <div class="table-wrapper">
        <table class="data-table">
          <thead><tr><th>Date / Heure</th><th>Utilisateur</th><th>Action</th><th>Détails</th></tr></thead>
          <tbody>
            ${filtered.slice(0, 200).map(log => `
              <tr>
                <td class="text-sm" style="white-space:nowrap">${UI.formatDateTime(log.timestamp)}</td>
                <td><code>${log.username || '—'}</code></td>
                <td><span class="badge badge-neutral">${actionLabels[log.action] || log.action}</span></td>
                <td class="text-sm">${formatAuditDetails(log)}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>

      <div class="audit-report-footer">
        <p>Ce rapport est généré automatiquement par ${pharmacyName} — OrdiveX. Il constitue un document de traçabilité au sens des Bonnes Pratiques de Dispensation (BPD) et de la réglementation DNPM.</p>
        <p><strong>Pharmacien responsable :</strong> ${DB.AppState.currentUser?.name || '—'} · <strong>Ref :</strong> RPT-${Date.now()}</p>
      </div>
    </div>

    <div class="audit-report-actions" style="display:flex;gap:12px;margin-top:20px;justify-content:center">
      <button class="btn btn-primary" onclick="printAuditReport()"><i data-lucide="printer"></i> Imprimer / PDF</button>
      <button class="btn btn-secondary" onclick="document.getElementById('audit-report-output').innerHTML=''"><i data-lucide="x"></i> Fermer</button>
    </div>
  `;

  // Enregistrer dans l'audit
  await DB.writeAudit('AUDIT_REPORT_GENERATED', 'audit', null, {
    period: `${startDate} → ${endDate}`,
    actionFilter: actionFilter || 'toutes',
    entriesCount: filtered.length,
  });

  if (window.lucide) lucide.createIcons();
}

function printAuditReport() {
  const report = document.getElementById('audit-report-printable');
  if (!report) return;
  const printWindow = window.open('', '_blank');
  printWindow.document.write(`
    <!DOCTYPE html>
    <html lang="fr">
    <head>
      <meta charset="UTF-8">
      <title>Rapport d'Audit — OrdiveX</title>
      <link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&display=swap" rel="stylesheet">
      <style>
        * { margin:0; padding:0; box-sizing:border-box; }
        body { font-family:'Inter',system-ui,sans-serif; color:#1e293b; padding:30px; font-size:12px; line-height:1.5; }
        h2 { font-size:18px; } h3 { font-size:15px; } h4 { font-size:13px; margin:20px 0 10px; display:flex; align-items:center; gap:6px; color:#1B4F72; }
        .text-sm { font-size:11px; } .text-muted { color:#64748b; }
        table { width:100%; border-collapse:collapse; font-size:11px; margin-top:8px; }
        th, td { padding:6px 8px; border:1px solid #e2e8f0; text-align:left; }
        th { background:#f1f5f9; font-weight:600; }
        .badge { display:inline-block; padding:2px 8px; border-radius:4px; font-size:10px; background:#f1f5f9; }
        code { background:#f1f5f9; padding:1px 4px; border-radius:3px; font-size:10px; }
        .audit-report-header { display:flex; justify-content:space-between; align-items:center; padding-bottom:16px; border-bottom:2px solid #1B4F72; margin-bottom:20px; }
        .audit-report-logo { display:flex; align-items:center; gap:12px; }
        .audit-report-summary { display:grid; grid-template-columns:repeat(4,1fr); gap:12px; margin:16px 0; }
        .audit-report-stat-card { background:#f8fafc; border:1px solid #e2e8f0; border-radius:8px; padding:12px; text-align:center; }
        .audit-report-stat-val { font-size:24px; font-weight:700; color:#1B4F72; }
        .audit-report-stat-lbl { font-size:10px; color:#64748b; margin-top:2px; }
        .audit-report-breakdown-row { display:flex; align-items:center; gap:8px; margin-bottom:6px; }
        .audit-report-breakdown-label { min-width:140px; font-size:11px; font-weight:500; }
        .audit-report-breakdown-bar-bg { flex:1; height:14px; background:#e2e8f0; border-radius:7px; overflow:hidden; }
        .audit-report-breakdown-bar { height:100%; background:linear-gradient(90deg,#1B6FAE,#2EAF7D); border-radius:7px; }
        .audit-report-breakdown-count { min-width:80px; text-align:right; font-size:11px; font-weight:600; }
        .audit-report-users { display:flex; flex-wrap:wrap; gap:8px; }
        .audit-report-user-chip { display:flex; align-items:center; gap:8px; padding:6px 12px; background:#f8fafc; border:1px solid #e2e8f0; border-radius:8px; }
        .audit-report-user-avatar { width:24px; height:24px; border-radius:50%; background:#1B4F72; color:white; display:flex; align-items:center; justify-content:center; font-size:11px; font-weight:600; }
        .audit-report-footer { margin-top:30px; padding-top:16px; border-top:1px solid #e2e8f0; font-size:10px; color:#64748b; }
        svg, i { display:none !important; }
        @page { margin: 15mm; }
      </style>
    </head>
    <body>${report.innerHTML}</body>
    </html>
  `);
  printWindow.document.close();
  setTimeout(() => { printWindow.print(); }, 500);
}

window.generateAuditReport = generateAuditReport;
window.printAuditReport = printAuditReport;

// ═══════════════════════════════════════════════════════════════════
// FEATURE 2 — Checklists de Conformité (BPD & DNPM)
// ═══════════════════════════════════════════════════════════════════

const COMPLIANCE_CHECKLISTS = {
  bpd: {
    title: 'Bonnes Pratiques de Dispensation (BPD)',
    icon: 'heart-pulse',
    color: '#2EAF7D',
    items: [
      { id: 'bpd_1', text: "Vérification de l'identité du patient et de l'ordonnance" },
      { id: 'bpd_2', text: "Analyse pharmaceutique de l'ordonnance avant dispensation" },
      { id: 'bpd_3', text: "Vérification des interactions médicamenteuses" },
      { id: 'bpd_4', text: "Vérification des posologies et durées de traitement" },
      { id: 'bpd_5', text: "Conseil au patient sur la prise des médicaments" },
      { id: 'bpd_6', text: "Traçabilité des dispensations (lot → patient)" },
      { id: 'bpd_7', text: "Conservation adéquate des médicaments (T°, humidité)" },
      { id: 'bpd_8', text: "Gestion des stupéfiants selon la réglementation" },
      { id: 'bpd_9', text: "Registre des ordonnances tenu à jour" },
      { id: 'bpd_10', text: "Formation continue du personnel officinal" },
    ]
  },
  dnpm: {
    title: 'Conformité DNPM (Direction Nationale de la Pharmacie)',
    icon: 'building-2',
    color: '#1B6FAE',
    items: [
      { id: 'dnpm_1', text: "Licence DNPM valide et affichée" },
      { id: 'dnpm_2', text: "Pharmacien titulaire présent aux heures d'ouverture" },
      { id: 'dnpm_3', text: "Registre de pharmacovigilance tenu à jour" },
      { id: 'dnpm_4', text: "Procédure de rappel de lot documentée" },
      { id: 'dnpm_5', text: "Registre de destruction des périmés à jour" },
      { id: 'dnpm_6', text: "Approvisionnement auprès de fournisseurs agréés" },
      { id: 'dnpm_7', text: "Lutte contre les médicaments contrefaits active" },
      { id: 'dnpm_8', text: "Rapport annuel d'activité préparé" },
    ]
  }
};

async function loadComplianceTab() {
  const container = document.getElementById('compliance-container');
  if (!container) return;

  // Charger l'historique des évaluations
  const allAudit = await DB.dbGetAll('auditLog');
  const complianceHistory = allAudit
    .filter(l => l.action === 'COMPLIANCE_CHECK')
    .sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0))
    .slice(0, 10);

  container.innerHTML = `
    <div class="info-box" style="margin-bottom:20px;background:rgba(46,175,125,0.05);border-left:4px solid #2EAF7D;padding:15px;border-radius:0 8px 8px 0;">
      <h4 style="margin-top:0;color:#2EAF7D;display:flex;align-items:center;gap:8px;">
        <i data-lucide="check-square"></i> Évaluation de Conformité
      </h4>
      <p class="text-sm text-muted" style="margin-bottom:0">
        Effectuez un auto-audit en cochant les points de contrôle ci-dessous. Les résultats sont sauvegardés dans le journal d'audit pour démontrer la conformité réglementaire de votre officine.
      </p>
    </div>

    <div class="compliance-checklists">
      ${Object.entries(COMPLIANCE_CHECKLISTS).map(([key, checklist]) => `
        <div class="compliance-card" id="compliance-card-${key}">
          <div class="compliance-card-header" style="border-left-color:${checklist.color}">
            <div>
              <h4 style="margin:0;display:flex;align-items:center;gap:8px;color:${checklist.color}">
                <i data-lucide="${checklist.icon}"></i> ${checklist.title}
              </h4>
              <p class="text-sm text-muted" style="margin:4px 0 0">${checklist.items.length} points de contrôle</p>
            </div>
            <div class="compliance-score" id="compliance-score-${key}">
              <div class="compliance-score-circle" style="--score-color:${checklist.color}">
                <span id="compliance-pct-${key}">0%</span>
              </div>
              <span class="text-sm text-muted">Conformité</span>
            </div>
          </div>
          <div class="compliance-items">
            ${checklist.items.map((item, idx) => `
              <label class="compliance-item" for="${item.id}">
                <input type="checkbox" id="${item.id}" class="compliance-checkbox" data-checklist="${key}" onchange="updateComplianceScore('${key}')">
                <span class="compliance-checkmark"></span>
                <span class="compliance-text">${item.text}</span>
              </label>
            `).join('')}
          </div>
          <div class="compliance-comment-zone">
            <textarea id="compliance-notes-${key}" class="form-control" rows="2" placeholder="Observations / commentaires pour cette section..."></textarea>
          </div>
        </div>
      `).join('')}
    </div>

    <div style="display:flex;gap:12px;margin-top:20px;justify-content:center">
      <button class="btn btn-primary" onclick="saveComplianceCheck()"><i data-lucide="save"></i> Sauvegarder l'évaluation</button>
      <button class="btn btn-secondary" onclick="toggleComplianceHistory()"><i data-lucide="history"></i> Historique</button>
    </div>

    <div id="compliance-history" style="display:none;margin-top:20px">
      <h4 class="section-subtitle">Historique des évaluations</h4>
      ${complianceHistory.length === 0
        ? '<div class="empty-state-small"><i data-lucide="clipboard-list"></i> Aucune évaluation enregistrée</div>'
        : `<div class="table-wrapper"><table class="data-table">
            <thead><tr><th>Date</th><th>Évaluateur</th><th>BPD</th><th>DNPM</th><th>Score global</th></tr></thead>
            <tbody>
              ${complianceHistory.map(log => {
                const d = log.details || {};
                return `<tr>
                  <td>${UI.formatDateTime(log.timestamp)}</td>
                  <td><code>${log.username || '—'}</code></td>
                  <td><span class="badge ${(d.bpdScore || 0) >= 80 ? 'badge-success' : (d.bpdScore || 0) >= 50 ? 'badge-warning' : 'badge-danger'}">${d.bpdScore || 0}%</span></td>
                  <td><span class="badge ${(d.dnpmScore || 0) >= 80 ? 'badge-success' : (d.dnpmScore || 0) >= 50 ? 'badge-warning' : 'badge-danger'}">${d.dnpmScore || 0}%</span></td>
                  <td><strong>${d.globalScore || 0}%</strong></td>
                </tr>`;
              }).join('')}
            </tbody>
          </table></div>`
      }
    </div>
  `;
  if (window.lucide) lucide.createIcons();
}

function updateComplianceScore(checklistKey) {
  const checklist = COMPLIANCE_CHECKLISTS[checklistKey];
  if (!checklist) return;
  const checked = checklist.items.filter(item =>
    document.getElementById(item.id)?.checked
  ).length;
  const pct = Math.round((checked / checklist.items.length) * 100);
  const pctEl = document.getElementById(`compliance-pct-${checklistKey}`);
  if (pctEl) pctEl.textContent = pct + '%';

  const scoreCircle = pctEl?.parentElement;
  if (scoreCircle) {
    scoreCircle.style.setProperty('--score-pct', pct);
    scoreCircle.className = `compliance-score-circle ${pct >= 80 ? 'score-good' : pct >= 50 ? 'score-medium' : 'score-low'}`;
  }
}

async function saveComplianceCheck() {
  const results = {};
  let totalChecked = 0;
  let totalItems = 0;

  Object.entries(COMPLIANCE_CHECKLISTS).forEach(([key, checklist]) => {
    const checked = checklist.items.filter(item =>
      document.getElementById(item.id)?.checked
    );
    const notes = document.getElementById(`compliance-notes-${key}`)?.value || '';

    results[key] = {
      checked: checked.map(i => i.id),
      unchecked: checklist.items.filter(i => !document.getElementById(i.id)?.checked).map(i => i.text),
      score: Math.round((checked.length / checklist.items.length) * 100),
      notes,
    };

    totalChecked += checked.length;
    totalItems += checklist.items.length;
  });

  const globalScore = totalItems > 0 ? Math.round((totalChecked / totalItems) * 100) : 0;

  const ok = await UI.confirm(
    `Sauvegarder cette évaluation de conformité ?\n\n` +
    `• BPD : ${results.bpd?.score || 0}%\n` +
    `• DNPM : ${results.dnpm?.score || 0}%\n` +
    `• Score global : ${globalScore}%\n\n` +
    `Cette action sera tracée dans le journal d'audit.`
  );
  if (!ok) return;

  await DB.writeAudit('COMPLIANCE_CHECK', 'compliance', null, {
    bpdScore: results.bpd?.score || 0,
    dnpmScore: results.dnpm?.score || 0,
    globalScore,
    bpdUnchecked: results.bpd?.unchecked || [],
    dnpmUnchecked: results.dnpm?.unchecked || [],
    bpdNotes: results.bpd?.notes || '',
    dnpmNotes: results.dnpm?.notes || '',
    evaluator: DB.AppState.currentUser?.name,
  });

  UI.toast(`✅ Évaluation sauvegardée — Score global : ${globalScore}%`, 'success', 5000);
  loadComplianceTab();
}

function toggleComplianceHistory() {
  const el = document.getElementById('compliance-history');
  if (el) el.style.display = el.style.display === 'none' ? 'block' : 'none';
}

window.loadComplianceTab = loadComplianceTab;
window.updateComplianceScore = updateComplianceScore;
window.saveComplianceCheck = saveComplianceCheck;
window.toggleComplianceHistory = toggleComplianceHistory;

// ═══════════════════════════════════════════════════════════════════
// FEATURE 3 — Planification d'Audits Internes
// ═══════════════════════════════════════════════════════════════════

async function loadPlanningTab() {
  const container = document.getElementById('planning-container');
  if (!container) return;

  const allAudit = await DB.dbGetAll('auditLog');
  const plannedAudits = allAudit
    .filter(l => ['AUDIT_PLANNED', 'AUDIT_STARTED', 'AUDIT_COMPLETED', 'AUDIT_CANCELLED'].includes(l.action))
    .sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));

  // Grouper par auditId pour avoir le dernier statut
  const auditMap = {};
  plannedAudits.forEach(log => {
    const id = log.details?.auditId;
    if (id && !auditMap[id]) {
      auditMap[id] = log;
    }
  });
  const audits = Object.values(auditMap).sort((a, b) => {
    const da = new Date(a.details?.plannedDate || 0);
    const db2 = new Date(b.details?.plannedDate || 0);
    return da - db2;
  });

  const today = new Date().toISOString().split('T')[0];

  const statusLabels = {
    AUDIT_PLANNED: ['clock', 'Planifié', 'badge-info'],
    AUDIT_STARTED: ['play', 'En cours', 'badge-warning'],
    AUDIT_COMPLETED: ['check-circle', 'Terminé', 'badge-success'],
    AUDIT_CANCELLED: ['x-circle', 'Annulé', 'badge-danger'],
  };

  container.innerHTML = `
    <div class="info-box" style="margin-bottom:20px;background:rgba(27,79,114,0.05);border-left:4px solid #1B4F72;padding:15px;border-radius:0 8px 8px 0;">
      <h4 style="margin-top:0;color:var(--primary-color);display:flex;align-items:center;gap:8px;">
        <i data-lucide="calendar-clock"></i> Planification des Audits Internes
      </h4>
      <p class="text-sm text-muted" style="margin-bottom:0">
        Planifiez vos audits internes, suivez leur statut et assurez la conformité de votre officine. Un audit bien planifié est la clé d'une amélioration continue.
      </p>
    </div>

    <div style="margin-bottom:20px">
      <button class="btn btn-primary" onclick="showPlanAuditForm()"><i data-lucide="plus"></i> Planifier un audit</button>
    </div>

    ${audits.length === 0
      ? '<div class="empty-state-small"><i data-lucide="calendar"></i> Aucun audit planifié. Commencez par planifier votre premier audit interne.</div>'
      : `<div class="planning-cards">
          ${audits.map(log => {
            const d = log.details || {};
            const [icon, label, cls] = statusLabels[log.action] || ['info', '?', 'badge-neutral'];
            const plannedDate = d.plannedDate || '';
            const daysUntil = plannedDate ? Math.ceil((new Date(plannedDate) - new Date()) / (1000*60*60*24)) : null;
            const isUrgent = daysUntil !== null && daysUntil <= 7 && daysUntil >= 0 && log.action === 'AUDIT_PLANNED';
            const isOverdue = daysUntil !== null && daysUntil < 0 && log.action === 'AUDIT_PLANNED';

            return `<div class="planning-card ${isOverdue ? 'planning-card-overdue' : isUrgent ? 'planning-card-urgent' : ''}">
              <div class="planning-card-header">
                <div>
                  <h4 style="margin:0;font-size:15px">${d.title || 'Audit sans titre'}</h4>
                  <p class="text-sm text-muted" style="margin:4px 0 0">${d.auditType || 'Général'} · Responsable : <strong>${d.responsible || '—'}</strong></p>
                </div>
                <span class="badge ${cls}"><i data-lucide="${icon}"></i> ${label}</span>
              </div>
              <div class="planning-card-body">
                <div class="planning-card-detail">
                  <i data-lucide="calendar"></i>
                  <span>Date prévue : <strong>${UI.formatDate(plannedDate)}</strong></span>
                  ${isOverdue ? '<span class="badge badge-danger">En retard</span>' : ''}
                  ${isUrgent ? '<span class="badge badge-warning">Sous 7 jours</span>' : ''}
                  ${daysUntil !== null && daysUntil > 7 && log.action === 'AUDIT_PLANNED' ? `<span class="badge badge-neutral">J-${daysUntil}</span>` : ''}
                </div>
                ${d.notes ? `<p class="text-sm text-muted" style="margin-top:8px"><i data-lucide="message-square" style="width:12px;height:12px;vertical-align:middle"></i> ${d.notes}</p>` : ''}
              </div>
              ${log.action !== 'AUDIT_COMPLETED' && log.action !== 'AUDIT_CANCELLED' ? `
              <div class="planning-card-actions">
                ${log.action === 'AUDIT_PLANNED' ? `<button class="btn btn-xs btn-primary" onclick="updateAuditStatus('${d.auditId}','AUDIT_STARTED','${d.title}','${plannedDate}','${d.responsible}','${(d.notes||'').replace(/'/g,"\\'")}','${d.auditType}')"><i data-lucide="play"></i> Démarrer</button>` : ''}
                ${log.action === 'AUDIT_STARTED' ? `<button class="btn btn-xs btn-success" onclick="updateAuditStatus('${d.auditId}','AUDIT_COMPLETED','${d.title}','${plannedDate}','${d.responsible}','${(d.notes||'').replace(/'/g,"\\'")}','${d.auditType}')"><i data-lucide="check-circle"></i> Terminer</button>` : ''}
                <button class="btn btn-xs btn-danger" onclick="updateAuditStatus('${d.auditId}','AUDIT_CANCELLED','${d.title}','${plannedDate}','${d.responsible}','${(d.notes||'').replace(/'/g,"\\'")}','${d.auditType}')"><i data-lucide="x"></i> Annuler</button>
              </div>` : ''}
            </div>`;
          }).join('')}
        </div>`
    }
  `;
  if (window.lucide) lucide.createIcons();
}

function showPlanAuditForm() {
  const today = new Date().toISOString().split('T')[0];
  UI.modal('<i data-lucide="calendar-plus" class="modal-icon-inline"></i> Planifier un Audit Interne', `
    <form id="plan-audit-form" class="form-grid">
      <div class="form-group">
        <label>Titre de l'audit *</label>
        <input type="text" name="title" class="form-control" required placeholder="Ex: Audit BPD trimestriel, Vérification des stocks...">
      </div>
      <div class="form-row">
        <div class="form-group">
          <label>Type d'audit *</label>
          <select name="auditType" class="form-control" required>
            <option value="BPD">Bonnes Pratiques de Dispensation</option>
            <option value="DNPM">Conformité DNPM</option>
            <option value="Stock">Inventaire / Stock</option>
            <option value="Hygiène">Hygiène & Sécurité</option>
            <option value="RH">Ressources Humaines</option>
            <option value="Financier">Audit Financier</option>
            <option value="Général">Audit Général</option>
          </select>
        </div>
        <div class="form-group">
          <label>Date prévue *</label>
          <input type="date" name="plannedDate" class="form-control" required min="${today}">
        </div>
      </div>
      <div class="form-group">
        <label>Responsable / Auditeur *</label>
        <input type="text" name="responsible" class="form-control" required value="${DB.AppState.currentUser?.name || ''}" placeholder="Nom du responsable">
      </div>
      <div class="form-group">
        <label>Notes / Objectifs</label>
        <textarea name="notes" class="form-control" rows="3" placeholder="Décrivez les objectifs de cet audit, les zones à couvrir..."></textarea>
      </div>
    </form>
  `, {
    size: 'large',
    footer: `
      <button class="btn btn-secondary" onclick="UI.closeModal()">Annuler</button>
      <button class="btn btn-primary" onclick="submitPlanAudit()"><i data-lucide="calendar-plus"></i> Planifier</button>
    `
  });
  if (window.lucide) lucide.createIcons();
}

async function submitPlanAudit() {
  const form = document.getElementById('plan-audit-form');
  if (!form?.checkValidity()) { form?.reportValidity(); return; }
  const data = Object.fromEntries(new FormData(form));
  const auditId = 'AUD-' + Date.now();

  await DB.writeAudit('AUDIT_PLANNED', 'audit', null, {
    auditId,
    title: data.title,
    auditType: data.auditType,
    plannedDate: data.plannedDate,
    responsible: data.responsible,
    notes: data.notes,
  });

  UI.closeModal();
  UI.toast(`📅 Audit "${data.title}" planifié pour le ${UI.formatDate(data.plannedDate)}`, 'success', 5000);
  loadPlanningTab();
}

async function updateAuditStatus(auditId, newAction, title, plannedDate, responsible, notes, auditType) {
  const actionLabels = {
    AUDIT_STARTED: 'démarrer',
    AUDIT_COMPLETED: 'marquer comme terminé',
    AUDIT_CANCELLED: 'annuler',
  };

  const ok = await UI.confirm(`Voulez-vous ${actionLabels[newAction] || 'modifier'} cet audit ?\n\n"${title}"`);
  if (!ok) return;

  await DB.writeAudit(newAction, 'audit', null, {
    auditId,
    title,
    auditType,
    plannedDate,
    responsible,
    notes,
  });

  const toastMessages = {
    AUDIT_STARTED: `▶️ Audit "${title}" démarré`,
    AUDIT_COMPLETED: `✅ Audit "${title}" terminé avec succès`,
    AUDIT_CANCELLED: `❌ Audit "${title}" annulé`,
  };

  UI.toast(toastMessages[newAction] || 'Statut mis à jour', 'success', 4000);
  loadPlanningTab();
}

window.loadPlanningTab = loadPlanningTab;
window.showPlanAuditForm = showPlanAuditForm;
window.submitPlanAudit = submitPlanAudit;
window.updateAuditStatus = updateAuditStatus;
window.loadControlledSubstancesTab = loadControlledSubstancesTab;
window.exportControlledRegister = exportControlledRegister;
window.renderCtrlStockPage = renderCtrlStockPage;
window.renderCtrlMovPage = renderCtrlMovPage;

// ═══════════════════════════════════════════════════════════════════
// REGISTRE DES STUPÉFIANTS — Substances Contrôlées
// ═══════════════════════════════════════════════════════════════════
async function loadControlledSubstancesTab() {
  const tab = document.getElementById('tab-controlled');
  if (!tab) return;
  tab.innerHTML = '<div class="loading-inline"><div class="spinner"></div> Chargement du registre stupéfiants...</div>';

  try {
    const [products, movements, lots, sales, saleItems] = await Promise.all([
      DB.dbGetAll('products'),
      DB.dbGetAll('movements'),
      DB.dbGetAll('lots'),
      DB.dbGetAll('sales'),
      DB.dbGetAll('saleItems'),
    ]);

    const controlledProducts = products.filter(p => p.isControlled);
    const controlledIds = new Set(controlledProducts.map(p => p.id));
    const productMap = {};
    products.forEach(p => { productMap[p.id] = p; });
    const saleMap = {};
    sales.forEach(s => { saleMap[s.id] = s; });

    const controlledMovements = movements
      .filter(m => controlledIds.has(m.productId))
      .sort((a, b) => new Date(b.date) - new Date(a.date));

    // Map lots par produit pour O(1)
    const lotsMap = new Map();
    lots.forEach(l => {
      if (controlledIds.has(l.productId)) {
        if (!lotsMap.has(l.productId)) lotsMap.set(l.productId, []);
        lotsMap.get(l.productId).push(l);
      }
    });

    // Map mouvements par produit pour O(1)
    const movByProduct = new Map();
    controlledMovements.forEach(m => {
      if (!movByProduct.has(m.productId)) movByProduct.set(m.productId, { entries: 0, exits: 0 });
      const acc = movByProduct.get(m.productId);
      if (m.type === 'ENTRY') acc.entries += Math.abs(m.quantity || 0);
      else acc.exits += Math.abs(m.quantity || 0);
    });

    const stockSummary = controlledProducts.map(p => {
      const pLots = (lotsMap.get(p.id) || []).filter(l => l.status === 'active');
      const totalStock = pLots.reduce((a, l) => a + (l.quantity || 0), 0);
      const stats = movByProduct.get(p.id) || { entries: 0, exits: 0 };
      return { ...p, totalStock, entries: stats.entries, exits: stats.exits, lots: pLots };
    });

    // Sauver pour pagination
    window._controlledStockSummary = stockSummary;
    window._controlledMovements = controlledMovements;
    window._controlledProductMap = productMap;
    window._controlledSaleMap = saleMap;
    window._ctrlStockPage = 0;
    window._ctrlMovPage = 0;

    tab.innerHTML = `
      <div style="display:flex; align-items:center; justify-content:space-between; margin-bottom:20px">
        <h3 class="section-subtitle" style="margin:0">
          <i data-lucide="shield-alert" style="color:#e74c3c"></i> Registre des Substances Contrôlées
        </h3>
        <button class="btn btn-secondary btn-sm" onclick="exportControlledRegister()">
          <i data-lucide="download"></i> Exporter CSV
        </button>
      </div>

      ${!controlledProducts.length ? `
        <div class="empty-state-small">
          <i data-lucide="shield-check"></i>
          Aucun produit marqué comme substance contrôlée.<br>
          <span class="text-muted">Allez dans le Catalogue pour activer le statut "Substance Contrôlée" sur les produits concernés.</span>
        </div>
      ` : `
        <div class="info-box info-danger" style="margin-bottom:20px">
          <strong>⚠️ Réglementation :</strong> Ce registre est obligatoire conformément à l'article 47 du Code de la Santé Publique.
          Chaque entrée et sortie de substance contrôlée doit être tracée, datée et signée.
        </div>

        <div id="ctrl-stock-table"></div>

        <h3 class="section-subtitle">Journal des mouvements</h3>
        <div id="ctrl-mov-table"></div>
      `}
    `;

    if (controlledProducts.length) {
      renderCtrlStockPage();
      renderCtrlMovPage();
    }
    if (window.lucide) lucide.createIcons();
  } catch (e) {
    console.error('[Controlled] Error:', e);
    tab.innerHTML = '<div class="empty-state-small"><i data-lucide="alert-triangle"></i> Erreur chargement registre</div>';
    if (window.lucide) lucide.createIcons();
  }
}

function renderCtrlStockPage() {
  const container = document.getElementById('ctrl-stock-table');
  if (!container) return;
  const data = window._controlledStockSummary || [];
  const PAGE = 100;
  const page = window._ctrlStockPage || 0;
  const totalPages = Math.ceil(data.length / PAGE);
  const slice = data.slice(page * PAGE, (page + 1) * PAGE);

  container.innerHTML = `
    <div class="table-wrapper" style="margin-bottom:10px">
      <table class="data-table">
        <thead><tr>
          <th>Produit</th><th>Classification</th><th>Stock actuel</th><th>Total entrées</th><th>Total sorties</th><th>Lots actifs</th>
        </tr></thead>
        <tbody>
          ${slice.map(p => `
            <tr>
              <td><strong>${p.name}</strong><br><span class="text-muted text-sm">${p.dci || ''} ${p.dosage || ''}</span></td>
              <td><span class="badge badge-danger">${p.controlledClass || 'SC'}</span></td>
              <td><strong>${p.totalStock}</strong> unités</td>
              <td style="color:var(--success-color)">+${p.entries}</td>
              <td style="color:var(--danger-color)">-${p.exits}</td>
              <td>${p.lots.length}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    </div>
    ${totalPages > 1 ? `<div class="pagination-bar" style="margin-bottom:20px">
      <button class="btn btn-sm btn-secondary" ${page === 0 ? 'disabled' : ''} onclick="window._ctrlStockPage--;renderCtrlStockPage()">← Précédent</button>
      <span class="text-muted">Page ${page + 1} / ${totalPages} (${data.length} produits)</span>
      <button class="btn btn-sm btn-secondary" ${page >= totalPages - 1 ? 'disabled' : ''} onclick="window._ctrlStockPage++;renderCtrlStockPage()">Suivant →</button>
    </div>` : ''}
  `;
  if (window.lucide) lucide.createIcons();
}

function renderCtrlMovPage() {
  const container = document.getElementById('ctrl-mov-table');
  if (!container) return;
  const data = window._controlledMovements || [];
  const productMap = window._controlledProductMap || {};
  const saleMap = window._controlledSaleMap || {};
  const PAGE = 100;
  const page = window._ctrlMovPage || 0;
  const totalPages = Math.ceil(data.length / PAGE);
  const slice = data.slice(page * PAGE, (page + 1) * PAGE);

  if (data.length === 0) {
    container.innerHTML = '<div class="empty-state-small">Aucun mouvement enregistré</div>';
    return;
  }

  container.innerHTML = `
    <div class="table-wrapper">
      <table class="data-table">
        <thead><tr>
          <th>Date</th><th>Produit</th><th>Type</th><th>Quantité</th><th>N° Lot</th><th>Référence</th><th>Patient / Note</th><th>Opérateur</th>
        </tr></thead>
        <tbody>
          ${slice.map(m => {
            const prod = productMap[m.productId];
            const isEntry = m.type === 'ENTRY';
            let patientInfo = m.note || '—';
            if (m.reference && m.reference.startsWith('SALE-')) {
              const saleId = parseInt(m.reference.replace('SALE-', ''));
              const sale = saleMap[saleId];
              if (sale?.patientName) patientInfo = sale.patientName;
            }
            return `<tr>
              <td style="white-space:nowrap">${UI.formatDateTime ? UI.formatDateTime(m.date) : UI.formatDate(m.date)}</td>
              <td><strong>${prod?.name || '—'}</strong></td>
              <td><span class="badge badge-${isEntry ? 'success' : 'danger'}">${isEntry ? '⬆ Entrée' : '⬇ Sortie'}</span><br><span class="text-muted text-sm">${m.subType || ''}</span></td>
              <td style="font-weight:700; color:${isEntry ? 'var(--success-color)' : 'var(--danger-color)'}">${isEntry ? '+' : ''}${m.quantity}</td>
              <td><code class="code-tag">${m.lotNumber || '—'}</code></td>
              <td><span class="text-muted text-sm">${m.reference || '—'}</span></td>
              <td>${patientInfo}</td>
              <td>${m.userId || '—'}</td>
            </tr>`;
          }).join('')}
        </tbody>
      </table>
    </div>
    ${totalPages > 1 ? `<div class="pagination-bar" style="margin-top:10px">
      <button class="btn btn-sm btn-secondary" ${page === 0 ? 'disabled' : ''} onclick="window._ctrlMovPage--;renderCtrlMovPage()">← Précédent</button>
      <span class="text-muted">Page ${page + 1} / ${totalPages} (${data.length} mouvements)</span>
      <button class="btn btn-sm btn-secondary" ${page >= totalPages - 1 ? 'disabled' : ''} onclick="window._ctrlMovPage++;renderCtrlMovPage()">Suivant →</button>
    </div>` : ''}
  `;
  if (window.lucide) lucide.createIcons();
}

async function exportControlledRegister() {
  try {
    const [products, movements] = await Promise.all([
      DB.dbGetAll('products'),
      DB.dbGetAll('movements'),
    ]);
    const controlledIds = new Set(products.filter(p => p.isControlled).map(p => p.id));
    const productMap = {};
    products.forEach(p => { productMap[p.id] = p; });
    const rows = movements
      .filter(m => controlledIds.has(m.productId))
      .sort((a, b) => new Date(b.date) - new Date(a.date))
      .map(m => {
        const prod = productMap[m.productId];
        return [
          m.date,
          prod?.name || '',
          prod?.dci || '',
          prod?.controlledClass || 'SC',
          m.type === 'ENTRY' ? 'Entrée' : 'Sortie',
          Math.abs(m.quantity || 0),
          m.lotNumber || '',
          m.reference || '',
          (m.note || '').replace(/,/g, ';'),
        ].join(',');
      });
    const header = 'Date,Produit,DCI,Classification,Type,Quantité,N° Lot,Référence,Note';
    const csv = [header, ...rows].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `registre_stupefiants_${new Date().toISOString().split('T')[0]}.csv`;
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    URL.revokeObjectURL(url);
    UI.toast('Registre exporté en CSV', 'success');
  } catch(e) {
    UI.toast('Erreur export : ' + e.message, 'error');
  }
}
