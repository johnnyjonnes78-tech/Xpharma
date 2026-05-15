/**
 * OrdiveX — Module Patients
 * Dossiers patients, historique médicaments, allergies
 */

async function renderPatients(container) {
  UI.loading(container, 'Chargement des dossiers patients...');
  const [patients, prescriptions, sales] = await Promise.all([
    DB.dbGetAll('patients'),
    DB.dbGetAll('prescriptions'),
    DB.dbGetAll('sales'),
  ]);

  const sorted = patients.sort((a, b) => (a.name || '').localeCompare(b.name || ''));

  container.innerHTML = `
    <div class="page-header">
      <div>
        <h1 class="page-title">Dossiers Patients</h1>
        <p class="page-subtitle">${patients.length} patients enregistrés — Données confidentielles</p>
      </div>
      <div class="header-actions">
        <button class="btn btn-secondary" onclick="showImportPatientsModal()"><i data-lucide="upload"></i> Importer</button>
        <button class="btn btn-secondary" onclick="exportPatients()"><i data-lucide="download"></i> Exporter</button>
        <button class="btn btn-primary" onclick="showAddPatient()"><i data-lucide="plus"></i> Nouveau Patient</button>
      </div>
    </div>

    <div class="privacy-banner">
      <i data-lucide="lock"></i> <strong>Données de santé protégées</strong> — Accès restreint au personnel soignant habilité. Archivage conforme DNPM.
    </div>

    <div class="filter-bar">
      <input type="text" id="patient-search" placeholder="Rechercher patient (nom, téléphone)..." class="filter-input" oninput="filterPatients()">
    </div>

    <div id="patients-table-container"></div>
  `;

  window._patientsData = sorted;
  window._patientsPrescriptions = prescriptions;
  filterPatients();
  if (window.lucide) lucide.createIcons();
}

function filterPatients() {
  const search = document.getElementById('patient-search')?.value.toLowerCase() || '';
  let data = window._patientsData || [];
  if (search) data = data.filter(p =>
    (p.name || '').toLowerCase().includes(search) ||
    (p.phone || '').toLowerCase().includes(search)
  );

  const container = document.getElementById('patients-table-container');
  if (!container) return;

  // Pagination
  const PAGE_SIZE = 100;
  window._filteredPatients = data;
  window._patientsPage = window._patientsPage || 1;
  if (data !== window._lastFilteredPatients) {
    window._patientsPage = 1;
    window._lastFilteredPatients = data;
  }
  const totalPages = Math.max(1, Math.ceil(data.length / PAGE_SIZE));
  if (window._patientsPage > totalPages) window._patientsPage = totalPages;
  const start = (window._patientsPage - 1) * PAGE_SIZE;
  const pageData = data.slice(start, start + PAGE_SIZE);

  const rxMap = {};
  (window._patientsPrescriptions || []).forEach(rx => {
    if (!rxMap[rx.patientId]) rxMap[rx.patientId] = 0;
    rxMap[rx.patientId]++;
  });

  UI.table(container, [
    {
      label: 'Patient', render: r => `
      <div class="patient-name-cell">
        <div class="patient-avatar-sm">${r.name?.charAt(0).toUpperCase() || '?'}</div>
        <div><strong>${r.name}</strong><br><span class="text-muted text-sm">${r.phone || '—'}</span></div>
      </div>` },
    { label: 'Date de naissance', render: r => r.dob ? `${UI.formatDate(r.dob)} <span class="text-muted text-sm">(${calcAge(r.dob)} ans)</span>` : '—' },
    { label: 'Allergies', render: r => r.allergies ? `<span class="badge badge-danger"><i data-lucide="alert-triangle"></i> ${r.allergies}</span>` : '<span class="text-muted">Aucune connue</span>' },
    { label: 'Ordonnances', render: r => `<span class="badge badge-info">${rxMap[r.id] || 0}</span>` },
    { label: 'Adresse', render: r => r.address || '—' },
    {
      label: 'Actions', render: r => `
      <div class="actions-cell">
        <button class="btn btn-xs btn-primary" onclick="viewPatient(${r.id})"><i data-lucide="folder"></i> Dossier</button>
        <button class="btn btn-xs btn-secondary" onclick="editPatient(${r.id})"><i data-lucide="edit-3"></i></button>
      </div>` },
  ], pageData, { emptyMessage: 'Aucun patient trouvé', emptyIcon: 'user' });

  // Pagination controls
  const pagDiv = document.createElement('div');
  pagDiv.style.cssText = 'display:flex;justify-content:space-between;align-items:center;padding:16px 0;gap:12px;flex-wrap:wrap;';
  pagDiv.innerHTML = `
    <span style="font-size:13px;color:var(--text-muted)">${data.length.toLocaleString()} patients — Page ${window._patientsPage}/${totalPages}</span>
    <div style="display:flex;gap:8px;">
      <button class="btn btn-secondary btn-sm" ${window._patientsPage <= 1 ? 'disabled' : ''} onclick="window._patientsPage--;filterPatients()">◀ Précédent</button>
      <button class="btn btn-secondary btn-sm" ${window._patientsPage >= totalPages ? 'disabled' : ''} onclick="window._patientsPage++;filterPatients()">Suivant ▶</button>
    </div>
  `;
  container.appendChild(pagDiv);
  if (window.lucide) lucide.createIcons();
}

function calcAge(dob) {
  if (!dob) return '—';
  const birth = new Date(dob);
  const today = new Date();
  return today.getFullYear() - birth.getFullYear() - (today.getMonth() < birth.getMonth() || (today.getMonth() === birth.getMonth() && today.getDate() < birth.getDate()) ? 1 : 0);
}

async function viewPatient(patientId) {
  const [patient, prescriptions, allSales] = await Promise.all([
    DB.dbGet('patients', patientId),
    DB.dbGetAll('prescriptions'),
    DB.dbGetAll('sales'),
  ]);
  if (!patient) return;

  // Filtrer les ventes de ce patient
  const patientSales = allSales.filter(s => s.patientId === patientId || s.patientName === patient.name);
  const patientRx = prescriptions.filter(r => r.patientId === patientId);
  const sortedRx = patientRx.sort((a, b) => new Date(b.date) - new Date(a.date));

  // KPIs financiers
  const totalSpent = patientSales.reduce((sum, s) => sum + (s.total || 0), 0);
  const avgBasket = patientSales.length > 0 ? Math.round(totalSpent / patientSales.length) : 0;
  const lastVisitDate = patientSales.length > 0 ? patientSales.sort((a,b) => new Date(b.date) - new Date(a.date))[0].date : null;
  const creditSales = patientSales.filter(s => s.paymentMethod === 'credit' && s.creditStatus !== 'paid');
  const totalCredit = creditSales.reduce((sum, s) => sum + (s.total || 0), 0);

  // Drug history from prescriptions
  const drugHistory = {};
  patientRx.forEach(rx => {
    (rx.items || []).forEach(item => {
      if (!drugHistory[item.productName]) drugHistory[item.productName] = { count: 0, lastDate: null };
      drugHistory[item.productName].count++;
      if (!drugHistory[item.productName].lastDate || rx.date > drugHistory[item.productName].lastDate) {
        drugHistory[item.productName].lastDate = rx.date;
      }
    });
  });
  const topDrugs = Object.entries(drugHistory).sort((a, b) => b[1].count - a[1].count).slice(0, 5);

  UI.modal(`<i data-lucide="folder" class="modal-icon-inline"></i> Dossier — ${patient.name}`, `
    <div class="patient-detail">
      <div class="patient-detail-header">
        <div class="patient-avatar-lg">${patient.name?.charAt(0).toUpperCase() || '?'}</div>
        <div class="patient-detail-info">
          <h2>${patient.name}</h2>
          <div class="patient-detail-meta">
            ${patient.dob ? `<span><i data-lucide="calendar"></i> ${UI.formatDate(patient.dob)} (${calcAge(patient.dob)} ans)</span>` : ''}
            ${patient.phone ? `<span style="display:inline-flex;align-items:center;gap:6px"><i data-lucide="phone"></i> ${patient.phone} <button class="btn btn-xs btn-primary" onclick="openSmsModal(${patient.id})" title="Envoyer un SMS"><i data-lucide="message-square" style="width:12px;height:12px"></i></button></span>` : ''}
            ${patient.address ? `<span><i data-lucide="map-pin"></i> ${patient.address}</span>` : ''}
          </div>
          ${patient.allergies ? `<div class="allergy-alert"><i data-lucide="alert-triangle"></i> Allergie : <strong>${patient.allergies}</strong></div>` : ''}
          <div style="margin-top:12px;display:flex;gap:12px;">
            <span class="badge badge-${patient.status === 'ayant_droit' ? 'warning' : 'primary'}"><i data-lucide="users" style="width:12px;height:12px;margin-right:4px;"></i> ${patient.status === 'ayant_droit' ? 'Ayant Droit' : 'Souscripteur Principal'}</span>
            ${patient.creditLimit > 0 ? `<span class="badge badge-success"><i data-lucide="file-clock" style="width:12px;height:12px;margin-right:4px;"></i> Crédit autorisé: ${UI.formatCurrency(patient.creditLimit)}</span>` : `<span class="badge badge-danger"><i data-lucide="lock" style="width:12px;height:12px;margin-right:4px;"></i> Crédit bloqué</span>`}
          </div>
          ${patient.assurances && patient.assurances.length > 0 ? `
            <div style="margin-top:12px;display:flex;gap:8px;flex-wrap:wrap;">
              ${patient.assurances.map(a => `<span class="badge badge-info"><i data-lucide="shield" style="width:12px;height:12px;margin-right:4px;"></i> <b>${a.name}</b> ${a.enterprise ? `[${a.enterprise}]` : ''} (${a.coverage}%) ${a.ref ? `- Police: ${a.ref}` : ''}</span>`).join('')}
            </div>
          ` : ''}
        </div>
      </div>

      <!-- KPIs 360° -->
      <div class="patient-stats-row" style="grid-template-columns: repeat(auto-fit, minmax(120px, 1fr));">
        <div class="patient-stat-card">
          <div class="patient-stat-val kpi-value">${UI.formatCurrency(totalSpent)}</div>
          <div class="patient-stat-label">Total dépensé</div>
        </div>
        <div class="patient-stat-card">
          <div class="patient-stat-val kpi-value">${patientSales.length}</div>
          <div class="patient-stat-label">Visites</div>
        </div>
        <div class="patient-stat-card">
          <div class="patient-stat-val kpi-value">${UI.formatCurrency(avgBasket)}</div>
          <div class="patient-stat-label">Panier moyen</div>
        </div>
        <div class="patient-stat-card">
          <div class="patient-stat-val">${lastVisitDate ? UI.formatDate(lastVisitDate) : '—'}</div>
          <div class="patient-stat-label">Dernière visite</div>
        </div>
        ${totalCredit > 0 ? `<div class="patient-stat-card" style="border-color:var(--danger);">
          <div class="patient-stat-val kpi-value" style="color:var(--danger)">${UI.formatCurrency(totalCredit)}</div>
          <div class="patient-stat-label">Crédit en cours</div>
        </div>` : ''}
        <div class="patient-stat-card">
          <div class="patient-stat-val">${patientRx.length}</div>
          <div class="patient-stat-label">Ordonnances</div>
        </div>
      </div>

      <!-- Onglets -->
      <div style="margin-top:16px;">
        <div class="patient360-tabs" style="display:flex;gap:4px;border-bottom:2px solid var(--border);margin-bottom:12px;">
          <button class="patient360-tab active" onclick="document.querySelectorAll('.p360-panel').forEach(e=>e.style.display='none');document.getElementById('p360-summary').style.display='';document.querySelectorAll('.patient360-tab').forEach(e=>e.classList.remove('active'));this.classList.add('active')">Résumé</button>
          <button class="patient360-tab" onclick="document.querySelectorAll('.p360-panel').forEach(e=>e.style.display='none');document.getElementById('p360-purchases').style.display='';document.querySelectorAll('.patient360-tab').forEach(e=>e.classList.remove('active'));this.classList.add('active')">Achats (${patientSales.length})</button>
          ${totalCredit > 0 ? `<button class="patient360-tab" onclick="document.querySelectorAll('.p360-panel').forEach(e=>e.style.display='none');document.getElementById('p360-credits').style.display='';document.querySelectorAll('.patient360-tab').forEach(e=>e.classList.remove('active'));this.classList.add('active')" style="color:var(--danger)">Crédits (${creditSales.length})</button>` : ''}
          <button class="patient360-tab" onclick="document.querySelectorAll('.p360-panel').forEach(e=>e.style.display='none');document.getElementById('p360-rx').style.display='';document.querySelectorAll('.patient360-tab').forEach(e=>e.classList.remove('active'));this.classList.add('active')">Ordonnances (${patientRx.length})</button>
        </div>

        <!-- Panel Résumé -->
        <div id="p360-summary" class="p360-panel">
          ${topDrugs.length > 0 ? `
            <div class="patient-drugs-section">
              <h4><i data-lucide="pill"></i> Médicaments fréquents</h4>
              <div class="drugs-grid">
                ${topDrugs.map(([name, data]) => `
                  <div class="drug-chip">
                    <span class="drug-name">${name}</span>
                    <span class="drug-count">${data.count}x</span>
                  </div>`).join('')}
              </div>
            </div>` : '<p class="text-muted">Aucun médicament récurrent enregistré</p>'}
          ${patient.medicalHistory ? `<div style="margin-top:12px;padding:10px;background:var(--surface-2);border-radius:8px;"><strong style="font-size:12px;color:var(--text-muted)">Antécédents médicaux</strong><p style="margin:4px 0 0;font-size:13px;">${patient.medicalHistory}</p></div>` : ''}
          ${patient.note ? `<div class="patient-note"><h4><i data-lucide="file-edit"></i> Notes</h4><p>${patient.note}</p></div>` : ''}
        </div>

        <!-- Panel Achats -->
        <div id="p360-purchases" class="p360-panel" style="display:none;">
          ${patientSales.length === 0 ? '<p class="text-muted">Aucun achat enregistré</p>' : `
            <table class="data-table">
              <thead><tr><th>Date</th><th>Montant</th><th>Paiement</th><th>Articles</th><th>Vendeur</th></tr></thead>
              <tbody>
                ${patientSales.sort((a,b) => new Date(b.date) - new Date(a.date)).slice(0, 30).map(s => `
                  <tr>
                    <td>${UI.formatDate(s.date)}</td>
                    <td><strong>${UI.formatCurrency(s.total || 0)}</strong></td>
                    <td><span class="badge badge-${s.paymentMethod === 'credit' ? 'danger' : s.paymentMethod === 'cash' ? 'success' : 'info'}">${s.paymentMethod || 'Espèces'}</span></td>
                    <td>${(s.items || []).slice(0,2).map(i => i.productName || i.name || '').join(', ')}${(s.items||[]).length > 2 ? '...' : ''}</td>
                    <td class="text-muted text-sm">${s.sellerName || '—'}</td>
                  </tr>`).join('')}
              </tbody>
            </table>
            ${patientSales.length > 30 ? `<p class="text-muted text-sm" style="margin-top:8px">Affichage limité aux 30 derniers achats</p>` : ''}
          `}
        </div>

        <!-- Panel Crédits -->
        ${totalCredit > 0 ? `<div id="p360-credits" class="p360-panel" style="display:none;">
          <div style="padding:12px;background:rgba(214,59,59,0.06);border-radius:8px;margin-bottom:12px;border-left:3px solid var(--danger);">
            <strong style="color:var(--danger)">Encours total : ${UI.formatCurrency(totalCredit)}</strong>
            <span class="text-muted text-sm"> — ${creditSales.length} vente(s) à crédit non réglée(s)</span>
          </div>
          <table class="data-table">
            <thead><tr><th>Date</th><th>Montant</th><th>Articles</th><th>Statut</th></tr></thead>
            <tbody>
              ${creditSales.sort((a,b) => new Date(b.date) - new Date(a.date)).map(s => `
                <tr>
                  <td>${UI.formatDate(s.date)}</td>
                  <td><strong style="color:var(--danger)">${UI.formatCurrency(s.total || 0)}</strong></td>
                  <td>${(s.items || []).slice(0,2).map(i => i.productName || i.name || '').join(', ')}</td>
                  <td><span class="badge badge-warning">${s.creditStatus || 'En attente'}</span></td>
                </tr>`).join('')}
            </tbody>
          </table>
        </div>` : ''}

        <!-- Panel Ordonnances -->
        <div id="p360-rx" class="p360-panel" style="display:none;">
          ${sortedRx.length === 0 ? '<p class="text-muted">Aucune ordonnance enregistrée</p>' : `
            <table class="data-table">
              <thead><tr><th>N° Rx</th><th>Date</th><th>Médecin</th><th>Médicaments</th><th>Statut</th></tr></thead>
              <tbody>
                ${sortedRx.slice(0, 15).map(rx => `
                  <tr>
                    <td><code class="code-tag">Rx-${String(rx.id).padStart(5, '0')}</code></td>
                    <td>${UI.formatDate(rx.date)}</td>
                    <td>${rx.doctorName || '—'}</td>
                    <td>${(rx.items || []).slice(0, 2).map(i => i.productName).join(', ')}${(rx.items || []).length > 2 ? '...' : ''}</td>
                    <td><span class="badge badge-${rx.status === 'dispensed' ? 'success' : 'warning'}">${rx.status}</span></td>
                  </tr>`).join('')}
              </tbody>
            </table>`}
        </div>
      </div>

      <div class="patient-legal-footer">
        <span class="text-muted text-sm"><i data-lucide="lock"></i> Données confidentielles — Accès tracé — Conservation conforme DNPM</span>
      </div>
    </div>
  `, { size: 'large' });
  if (window.lucide) lucide.createIcons();
  if (window._autoAnimateKPIValues) setTimeout(_autoAnimateKPIValues, 100);
  // Log access to patient data
  await DB.writeAudit('VIEW_PATIENT', 'patients', patientId, { patientName: patient.name });
}

function showAddPatient() {
  UI.modal('<i data-lucide="user-plus" class="modal-icon-inline"></i> Nouveau Patient', `
    <form id="patient-form" class="form-grid">
      <div class="form-row">
        <div class="form-group">
          <label>Nom complet *</label>
          <input type="text" name="name" class="form-control" required placeholder="Prénom Nom">
        </div>
        <div class="form-group">
          <label>Téléphone</label>
          <input type="tel" name="phone" class="form-control" placeholder="+224 6XX XXX XXX">
        </div>
      </div>
      <div class="form-row">
        <div class="form-group">
          <label>Date de naissance</label>
          <input type="date" name="dob" class="form-control">
        </div>
      <div class="form-row">
        <div class="form-group">
          <label>Sexe</label>
          <select name="gender" class="form-control">
            <option value="">Non précisé</option>
            <option value="M">Masculin</option>
            <option value="F">Féminin</option>
          </select>
        </div>
        <div class="form-group">
          <label>Statut Assuré / Client</label>
          <select name="status" class="form-control">
            <option value="principal">Souscripteur Principal</option>
            <option value="ayant_droit">Ayant droit (Enfant / Conjoint)</option>
          </select>
        </div>
      </div>
      <div class="form-row">
        <div class="form-group">
          <label>Adresse</label>
          <input type="text" name="address" class="form-control" placeholder="Quartier, commune, ville">
        </div>
        <div class="form-group">
           <label><i data-lucide="file-clock"></i> Plafond de crédit (GNF)</label>
           <input type="number" name="creditLimit" class="form-control" placeholder="0 = Bloqué" value="0">
        </div>
      </div>
      <div class="form-group">
        <label><i data-lucide="alert-triangle"></i> Allergies connues</label>
        <input type="text" name="allergies" class="form-control" placeholder="Ex: Pénicilline, Aspirine, Sulfamides... (laisser vide si aucune)">
      </div>
      <div class="form-group">
        <label>Antécédents médicaux</label>
        <textarea name="medicalHistory" class="form-control" rows="2" placeholder="HTA, Diabète, Asthme..."></textarea>
      </div>
      <div class="form-group">
        <label>Note</label>
        <textarea name="note" class="form-control" rows="2"></textarea>
      </div>
      <div style="grid-column: 1 / -1; margin-top: 16px; padding-top: 16px; border-top: 1px solid var(--border)">
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom: 12px;">
          <h4 style="font-size:14px; margin:0;"><i data-lucide="shield"></i> Couvertures d'Assurance</h4>
          <button type="button" class="btn btn-xs btn-primary" onclick="addAssuranceRow('patient-assurances-container')"><i data-lucide="plus"></i> Ajouter</button>
        </div>
        <div id="patient-assurances-container"></div>
      </div>
    </form>
  `, {
    footer: `
      <button class="btn btn-secondary" onclick="UI.closeModal()">Annuler</button>
      <button class="btn btn-primary" onclick="submitPatient()"><i data-lucide="check"></i> Enregistrer</button>
    `
  });
  if (window.lucide) lucide.createIcons();
}

window.addAssuranceRow = function(containerId, data = null) {
  const container = document.getElementById(containerId);
  if (!container) return;
  const idx = Date.now() + Math.floor(Math.random() * 1000);
  const row = document.createElement('div');
  row.className = 'assurance-row';
  row.style.cssText = "display:flex; gap:8px; margin-bottom:8px; align-items:end; background:var(--surface); padding:8px; border-radius:6px; border:1px solid var(--border);";
  row.innerHTML = `
    <div style="flex:2">
      <label style="font-size:11px;color:var(--text-muted)">Entreprise (Employeur)</label>
      <input type="text" name="assurEnterprise_${idx}" class="form-control form-control-sm" value="${data?.enterprise || ''}" placeholder="Ex: Rio Tinto, Braguinée...">
    </div>
    <div style="flex:2">
      <label style="font-size:11px;color:var(--text-muted)">Assurance / Mutuelle</label>
      <input type="text" name="assurName_${idx}" class="form-control form-control-sm" value="${data?.name || ''}" placeholder="Ex: ASCOMA, CNSS..." required>
    </div>
    <div style="flex:1">
      <label style="font-size:11px;color:var(--text-muted)">Couverture (%)</label>
      <input type="number" name="assurCoverage_${idx}" class="form-control form-control-sm" value="${data?.coverage || 80}" min="1" max="100" required>
    </div>
    <div style="flex:2">
      <label style="font-size:11px;color:var(--text-muted)">N° Police / Matricule</label>
      <input type="text" name="assurRef_${idx}" class="form-control form-control-sm" value="${data?.ref || ''}" placeholder="Numéro assuré">
    </div>
    <div>
      <button type="button" class="btn btn-xs btn-danger" onclick="this.closest('.assurance-row').remove()"><i data-lucide="trash-2"></i></button>
    </div>
  `;
  container.appendChild(row);
  if (window.lucide) lucide.createIcons();
};

function extractAssurances(data) {
  const assurances = [];
  Object.keys(data).forEach(k => {
    if (k.startsWith('assurName_')) {
      const idx = k.split('_')[1];
      assurances.push({
        name: data[k],
        enterprise: data['assurEnterprise_' + idx] || '',
        coverage: parseInt(data['assurCoverage_' + idx] || 0),
        ref: data['assurRef_' + idx] || ''
      });
      delete data[k];
      delete data['assurEnterprise_' + idx];
      delete data['assurCoverage_' + idx];
      delete data['assurRef_' + idx];
    }
  });
  return assurances;
}

async function submitPatient() {
  const form = document.getElementById('patient-form');
  if (!form?.checkValidity()) { form?.reportValidity(); return; }
  const data = Object.fromEntries(new FormData(form));
  data.assurances = extractAssurances(data);
  try {
    const id = await DB.dbAdd('patients', data);
    await DB.writeAudit('ADD_PATIENT', 'patients', id, { name: data.name });
    UI.closeModal();
    UI.toast('Patient enregistré', 'success');
    Router.navigate('patients');
  } catch (err) { UI.toast('Erreur : ' + err.message, 'error'); }
}

async function editPatient(patientId) {
  const patient = await DB.dbGet('patients', patientId);
  if (!patient) return;
  UI.modal('<i data-lucide="edit-3" class="modal-icon-inline"></i> Modifier Patient', `
    <form id="edit-patient-form" class="form-grid">
      <div class="form-row">
        <div class="form-group"><label>Nom complet *</label><input type="text" name="name" class="form-control" value="${patient.name || ''}" required></div>
        <div class="form-group"><label>Téléphone</label><input type="tel" name="phone" class="form-control" value="${patient.phone || ''}"></div>
      </div>
      <div class="form-row">
        <div class="form-group"><label>Date de naissance</label><input type="date" name="dob" class="form-control" value="${patient.dob || ''}"></div>
        <div class="form-group">
          <label>Sexe</label>
          <select name="gender" class="form-control">
            <option ${!patient.gender ? 'selected' : ''}>Non précisé</option>
            <option value="M" ${patient.gender === 'M' ? 'selected' : ''}>Masculin</option>
            <option value="F" ${patient.gender === 'F' ? 'selected' : ''}>Féminin</option>
          </select>
        </div>
      </div>
      <div class="form-row">
        <div class="form-group">
          <label>Statut Assuré / Client</label>
          <select name="status" class="form-control">
            <option value="principal" ${patient.status !== 'ayant_droit' ? 'selected' : ''}>Souscripteur Principal</option>
            <option value="ayant_droit" ${patient.status === 'ayant_droit' ? 'selected' : ''}>Ayant droit (Enfant / Conjoint)</option>
          </select>
        </div>
        <div class="form-group">
           <label><i data-lucide="file-clock"></i> Plafond de crédit (GNF)</label>
           <input type="number" name="creditLimit" class="form-control" placeholder="0 = Bloqué" value="${patient.creditLimit || 0}">
        </div>
      </div>
      <div class="form-group"><label>Adresse</label><input type="text" name="address" class="form-control" value="${patient.address || ''}"></div>
      <div class="form-group"><label><i data-lucide="alert-triangle"></i> Allergies</label><input type="text" name="allergies" class="form-control" value="${patient.allergies || ''}"></div>
      <div class="form-group"><label>Antécédents</label><textarea name="medicalHistory" class="form-control" rows="2">${patient.medicalHistory || ''}</textarea></div>
      <div style="grid-column: 1 / -1; margin-top: 16px; padding-top: 16px; border-top: 1px solid var(--border)">
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom: 12px;">
          <h4 style="font-size:14px; margin:0;"><i data-lucide="shield"></i> Couvertures d'Assurance</h4>
          <button type="button" class="btn btn-xs btn-primary" onclick="addAssuranceRow('edit-patient-assurances-container')"><i data-lucide="plus"></i> Ajouter</button>
        </div>
        <div id="edit-patient-assurances-container"></div>
      </div>
    </form>
  `, {
    footer: `
      <button class="btn btn-secondary" onclick="UI.closeModal()">Annuler</button>
      <button class="btn btn-primary" onclick="updatePatient(${patientId})"><i data-lucide="save"></i> Mettre à jour</button>
    `
  });
  if (window.lucide) lucide.createIcons();
  if (patient.assurances && patient.assurances.length) {
    patient.assurances.forEach(assur => window.addAssuranceRow('edit-patient-assurances-container', assur));
  }
}

async function updatePatient(patientId) {
  const form = document.getElementById('edit-patient-form');
  if (!form?.checkValidity()) { form?.reportValidity(); return; }
  const data = Object.fromEntries(new FormData(form));
  data.assurances = extractAssurances(data);
  const existing = await DB.dbGet('patients', patientId);
  await DB.dbPut('patients', { ...existing, ...data });
  await DB.writeAudit('EDIT_PATIENT', 'patients', patientId, { name: data.name });
  UI.closeModal();
  UI.toast('Dossier patient mis à jour', 'success');
  Router.navigate('patients');
}
function exportPatients() {
  // Export anonymized (no names - just stats)
  const data = window._patientsData || [];
  const csv = ['ID,Age,Genre,Allergies,Ville'].join('\n') + '\n' +
    data.map((p, i) => [
      `P${String(i + 1).padStart(4, '0')}`,
      p.dob ? calcAge(p.dob) : '',
      p.gender || '',
      p.allergies ? 'Oui' : 'Non',
      p.address ? p.address.split(',').pop().trim() : '',
    ].join(',')).join('\n');
  const blob = new Blob([csv], { type: 'text/csv' });
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob);
  a.download = `patients_anonymises_${new Date().toISOString().split('T')[0]}.csv`;
  a.click();
  UI.toast('Export anonymisé téléchargé', 'success');
}

// ═══════════════════════════════════════════════════════════════
// NOTIFICATION SMS (Feature 3)
// ═══════════════════════════════════════════════════════════════
async function openSmsModal(patientId) {
  const patient = await DB.dbGet('patients', patientId);
  if (!patient) return;
  if (!patient.phone) {
    UI.toast('Ce patient n\'a pas de numéro de téléphone enregistré', 'warning');
    return;
  }

  UI.modal(`<i data-lucide="message-square" class="modal-icon-inline"></i> Envoyer un SMS à ${patient.name}`, `
    <div style="font-size:13px; color:var(--text-muted); margin-bottom:16px;">
      Numéro destinataire : <strong>${patient.phone}</strong>
    </div>
    <form id="sms-patient-form">
      <div class="form-group">
        <label>Type de message</label>
        <select name="type" class="form-control" onchange="document.getElementById('sms-custom-group').style.display = this.value === 'custom' || this.value === 'renewal' || this.value === 'appointment' ? 'block' : 'none'">
          <option value="debt">Rappel de dette (généré auto)</option>
          <option value="renewal">Renouvellement traitement</option>
          <option value="appointment">Rappel rendez-vous</option>
          <option value="custom">Message personnalisé</option>
        </select>
      </div>
      <div class="form-group" id="sms-custom-group" style="display:none">
        <label>Détail / Message</label>
        <textarea name="customMessage" class="form-control" rows="3" placeholder="Saisissez votre message ou les détails (nom du médicament, date)..."></textarea>
      </div>
    </form>
  `, {
    footer: `
      <button class="btn btn-secondary" onclick="UI.closeModal()">Annuler</button>
      <button class="btn btn-primary" onclick="sendPatientSms(${patientId})"><i data-lucide="send"></i> Envoyer le SMS</button>
    `
  });
  if (window.lucide) lucide.createIcons();
}

async function sendPatientSms(patientId) {
  if (!window.SMS) { UI.toast('Module SMS introuvable', 'error'); return; }
  
  const form = document.getElementById('sms-patient-form');
  const type = form.type.value;
  const customMessage = form.customMessage.value;

  const btn = event.currentTarget;
  const originalHtml = btn.innerHTML;
  btn.disabled = true;
  btn.innerHTML = '<i class="spinner-inline"></i> Envoi...';

  try {
    const res = await SMS.quickSend(patientId, type, customMessage);
    if (res.success) {
      UI.toast('SMS envoyé avec succès !', 'success');
      UI.closeModal();
    } else {
      UI.toast('Erreur d\'envoi : ' + (res.error || 'Vérifiez la configuration'), 'error');
    }
  } catch(e) {
    UI.toast('Erreur : ' + e.message, 'error');
  } finally {
    btn.disabled = false;
    btn.innerHTML = originalHtml;
  }
}

/* ══════════════════════════════════════════════════════
 * IMPORT CSV PATIENTS — Architecture Bulk (dbBulkPut)
 * ══════════════════════════════════════════════════════ */

function showImportPatientsModal() {
  UI.modal('<i data-lucide="upload" class="modal-icon-inline"></i> Importation de Patients (CSV)', `
    <div class="import-container">
      <p class="mb-1 text-sm">Importez vos dossiers patients depuis un fichier CSV. Colonnes attendues : <strong>Nom, Téléphone, Adresse, Sexe, Allergies</strong>.</p>
      
      <div id="import-patients-drop-zone" class="import-drop-zone">
        <i data-lucide="file-up"></i>
        <div>
          <strong>Cliquez pour choisir un fichier</strong> ou glissez-le ici
          <p class="text-sm text-muted mt-0-5">Format CSV (.csv) uniquement</p>
        </div>
        <input type="file" id="import-patients-file-input" accept=".csv" hidden>
      </div>

      <div id="import-patients-progress" class="import-progress-container">
        <div class="import-progress-bar"><div id="import-patients-progress-fill" class="import-progress-fill"></div></div>
        <div id="import-patients-status" class="import-status-text">Préparation...</div>
      </div>

      <div id="import-patients-results" class="import-results"></div>

      <a href="#" class="import-template-link" onclick="downloadPatientsTemplate(event)">
        <i data-lucide="download" style="width:12px;height:12px"></i> Télécharger un modèle de fichier
      </a>
    </div>
  `, {
    footer: `<button class="btn btn-secondary" onclick="UI.closeModal()">Fermer</button>`
  });

  const zone = document.getElementById('import-patients-drop-zone');
  const input = document.getElementById('import-patients-file-input');

  if (zone && input) {
    zone.onclick = () => input.click();
    input.onchange = (e) => handleImportPatientsFile(e.target.files[0]);
    zone.ondragover = (e) => { e.preventDefault(); zone.classList.add('dragover'); };
    zone.ondragleave = () => zone.classList.remove('dragover');
    zone.ondrop = (e) => {
      e.preventDefault();
      zone.classList.remove('dragover');
      if (e.dataTransfer.files.length) handleImportPatientsFile(e.dataTransfer.files[0]);
    };
  }
  if (window.lucide) lucide.createIcons();
}

async function handleImportPatientsFile(file) {
  if (!file) return;
  if (!file.name.endsWith('.csv')) { UI.toast('Veuillez sélectionner un fichier CSV', 'error'); return; }

  const zone = document.getElementById('import-patients-drop-zone');
  const progress = document.getElementById('import-patients-progress');
  const results = document.getElementById('import-patients-results');
  if (zone) zone.style.display = 'none';
  if (progress) progress.style.display = 'block';
  if (results) results.style.display = 'none';

  const reader = new FileReader();
  reader.onload = async (e) => await processImportPatientsCSV(e.target.result);
  reader.onerror = () => UI.toast('Erreur de lecture du fichier', 'error');
  reader.readAsText(file, 'UTF-8');
}

async function processImportPatientsCSV(content) {
  const status = document.getElementById('import-patients-status');
  const fill = document.getElementById('import-patients-progress-fill');
  const results = document.getElementById('import-patients-results');

  const lines = content.split(/\r?\n/).filter(l => l.trim() !== '');
  if (lines.length <= 1) {
    if (status) status.textContent = 'Fichier vide.';
    if (results) { results.style.display='block'; results.className='import-results error'; results.innerHTML='<strong>Erreur :</strong> Le fichier est vide.'; }
    return;
  }

  const header = lines[0];
  const sep = header.includes(';') ? ';' : ',';
  const cols = header.split(sep).map(c => c.replace(/"/g, '').trim().toLowerCase());

  const map = {
    name: cols.findIndex(c => c.includes('nom') || c.includes('name')),
    phone: cols.findIndex(c => c.includes('tel') || c.includes('phone') || c.includes('mobile')),
    address: cols.findIndex(c => c.includes('adresse') || c.includes('address')),
    sex: cols.findIndex(c => c.includes('sexe') || c.includes('sex') || c.includes('genre')),
    allergies: cols.findIndex(c => c.includes('allergie') || c.includes('allerg')),
    email: cols.findIndex(c => c.includes('email') || c.includes('mail')),
    dob: cols.findIndex(c => c.includes('naissance') || c.includes('birth') || c.includes('dob')),
  };

  if (map.name === -1) {
    if (status) status.textContent = 'Colonne Nom manquante.';
    if (results) { results.style.display='block'; results.className='import-results error'; results.innerHTML='<strong>Erreur :</strong> La colonne "Nom" est obligatoire.'; }
    return;
  }

  // Phase 1 : Charger les patients existants pour dédoublonnage par téléphone
  if (status) status.textContent = 'Chargement de la base existante...';
  const allExisting = await DB.dbGetAll('patients');
  const phoneMap = new Map();
  allExisting.forEach(p => { if (p.phone) phoneMap.set(p.phone.replace(/\s/g, ''), p); });

  // Phase 2 : Parser toutes les lignes en mémoire
  if (status) status.textContent = 'Analyse du fichier...';
  const parsed = [];
  let errors = 0;

  for (let i = 1; i < lines.length; i++) {
    try {
      const row = lines[i].split(sep).map(v => v.replace(/"/g, '').trim());
      const name = row[map.name] || '';
      if (!name) { errors++; continue; }

      const phone = map.phone !== -1 ? (row[map.phone] || '') : '';
      const existing = phone ? phoneMap.get(phone.replace(/\s/g, '')) : null;

      const patient = {
        ...(existing || {}),
        name,
        phone,
        address: map.address !== -1 ? (row[map.address] || '') : (existing?.address || ''),
        sex: map.sex !== -1 ? (row[map.sex] || '') : (existing?.sex || ''),
        allergies: map.allergies !== -1 ? (row[map.allergies] || '') : (existing?.allergies || ''),
        email: map.email !== -1 ? (row[map.email] || '') : (existing?.email || ''),
        dateOfBirth: map.dob !== -1 ? (row[map.dob] || '') : (existing?.dateOfBirth || ''),
        status: 'active',
        _createdAt: existing?._createdAt || Date.now()
      };

      parsed.push(patient);
      if (phone) phoneMap.set(phone.replace(/\s/g, ''), patient);
    } catch (err) { errors++; }
  }

  // Phase 3 : Écriture IndexedDB par lots via dbBulkPut
  const BULK_SIZE = 1000;
  let imported = 0;

  for (let i = 0; i < parsed.length; i += BULK_SIZE) {
    const chunk = parsed.slice(i, i + BULK_SIZE);
    try {
      await DB.dbBulkPut('patients', chunk);
      imported += chunk.length;
    } catch (err) {
      console.error('[Import Patients] Erreur bulk:', err);
      errors += chunk.length;
    }
    const done = Math.min(i + BULK_SIZE, parsed.length);
    const pct = Math.round((done / parsed.length) * 100);
    if (fill) fill.style.width = pct + '%';
    if (status) status.textContent = `Écriture : ${done.toLocaleString()} / ${parsed.length.toLocaleString()}...`;
    
    // Pause de 50ms pour laisser l'interface graphique se rafraîchir sans geler
    await new Promise(r => setTimeout(r, 50));
  }

  // Phase 4 : Résultats
  if (fill) fill.style.width = '100%';
  if (status) status.textContent = 'Importation terminée.';
  if (results) {
    results.style.display = 'block';
    results.className = `import-results ${imported > 0 ? 'success' : 'error'}`;
    results.innerHTML = `<strong>Résultat :</strong> ${imported} patients importés. ${errors > 0 ? `<br><small>${errors} lignes ignorées.</small>` : ''}`;
  }
  await DB.writeAudit('BULK_IMPORT_PATIENTS', 'patients', null, { imported, errors });
  setTimeout(() => renderPatients(document.getElementById('app-content')), 1500);
}

function downloadPatientsTemplate(e) {
  e.preventDefault();
  const csv = '\uFEFFNom,Téléphone,Adresse,Sexe,Allergies,Email,Date de naissance\nMamadou Diallo,625000000,Conakry Kaloum,M,Pénicilline,mamadou@email.com,1985-03-15\nFatoumata Bah,621000000,Conakry Ratoma,F,,fatou@email.com,1990-07-22';
  const blob = new Blob([csv], { type: 'text/csv' });
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob);
  a.download = 'modele_patients.csv'; a.click();
  UI.toast('Modèle téléchargé', 'success');
}

window.filterPatients = filterPatients;
window.viewPatient = viewPatient;
window.showAddPatient = showAddPatient;
window.submitPatient = submitPatient;
window.editPatient = editPatient;
window.updatePatient = updatePatient;
window.exportPatients = exportPatients;
window.openSmsModal = openSmsModal;
window.sendPatientSms = sendPatientSms;
window.showImportPatientsModal = showImportPatientsModal;
window.downloadPatientsTemplate = downloadPatientsTemplate;

Router.register('patients', renderPatients);
