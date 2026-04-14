/**
 * PHARMA_PROJET — Module Patients
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
        <button class="btn btn-secondary" onclick="exportPatients()"><i data-lucide="download"></i> Exporter (anonymisé)</button>
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
  const PAGE_SIZE = 50;
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
  const [patient, prescriptions, saleItems] = await Promise.all([
    DB.dbGet('patients', patientId),
    DB.dbGetAll('prescriptions', 'patientId', patientId),
    DB.dbGetAll('saleItems'),
  ]);
  if (!patient) return;

  const sortedRx = prescriptions.sort((a, b) => new Date(b.date) - new Date(a.date));

  // Drug history from prescriptions
  const drugHistory = {};
  prescriptions.forEach(rx => {
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
          ${patient.assurances && patient.assurances.length > 0 ? `
            <div style="margin-top:12px;display:flex;gap:8px;flex-wrap:wrap;">
              ${patient.assurances.map(a => `<span class="badge badge-info"><i data-lucide="shield" style="width:12px;height:12px;margin-right:4px;"></i> ${a.name} (${a.coverage}%) ${a.ref ? `- ${a.ref}` : ''}</span>`).join('')}
            </div>
          ` : ''}
        </div>
      </div>

      <div class="patient-stats-row">
        <div class="patient-stat-card">
          <div class="patient-stat-val">${prescriptions.length}</div>
          <div class="patient-stat-label">Ordonnances</div>
        </div>
        <div class="patient-stat-card">
          <div class="patient-stat-val">${prescriptions.filter(r => r.status === 'dispensed').length}</div>
          <div class="patient-stat-label">Dispensées</div>
        </div>
        <div class="patient-stat-card">
          <div class="patient-stat-val">${topDrugs.length}</div>
          <div class="patient-stat-label">Médicaments utilisés</div>
        </div>
      </div>

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
        </div>` : ''}

      <div class="patient-rx-history">
        <h4><i data-lucide="file-text"></i> Historique des Ordonnances</h4>
        ${sortedRx.length === 0 ? '<p class="text-muted">Aucune ordonnance enregistrée</p>' : `
          <table class="data-table">
            <thead><tr><th>N° Rx</th><th>Date</th><th>Médecin</th><th>Médicaments</th><th>Statut</th></tr></thead>
            <tbody>
              ${sortedRx.slice(0, 10).map(rx => `
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

      ${patient.note ? `<div class="patient-note"><h4><i data-lucide="file-edit"></i> Notes</h4><p>${patient.note}</p></div>` : ''}

      <div class="patient-legal-footer">
        <span class="text-muted text-sm"><i data-lucide="lock"></i> Données confidentielles — Accès tracé — Conservation conforme DNPM</span>
      </div>
    </div>
  `, { size: 'large' });
  if (window.lucide) lucide.createIcons();
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
        <div class="form-group">
          <label>Sexe</label>
          <select name="gender" class="form-control">
            <option value="">Non précisé</option>
            <option value="M">Masculin</option>
            <option value="F">Féminin</option>
          </select>
        </div>
      </div>
      <div class="form-group">
        <label>Adresse</label>
        <input type="text" name="address" class="form-control" placeholder="Quartier, commune, ville">
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
      <label style="font-size:11px;color:var(--text-muted)">Nom de l'organisme / Employeur</label>
      <input type="text" name="assurName_${idx}" class="form-control form-control-sm" value="${data?.name || ''}" placeholder="Ex: ASCOMA, CNSS..." required>
    </div>
    <div style="flex:1">
      <label style="font-size:11px;color:var(--text-muted)">Couverture (%)</label>
      <input type="number" name="assurCoverage_${idx}" class="form-control form-control-sm" value="${data?.coverage || 80}" min="1" max="100" required>
    </div>
    <div style="flex:2">
      <label style="font-size:11px;color:var(--text-muted)">N° Matricule / Référence</label>
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
        coverage: parseInt(data['assurCoverage_' + idx] || 0),
        ref: data['assurRef_' + idx] || ''
      });
      delete data[k];
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
        <div class="form-group"><label>Sexe</label><select name="gender" class="form-control"><option ${!patient.gender ? 'selected' : ''}>Non précisé</option><option value="M" ${patient.gender === 'M' ? 'selected' : ''}>Masculin</option><option value="F" ${patient.gender === 'F' ? 'selected' : ''}>Féminin</option></select></div>
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

window.filterPatients = filterPatients;
window.viewPatient = viewPatient;
window.showAddPatient = showAddPatient;
window.submitPatient = submitPatient;
window.editPatient = editPatient;
window.updatePatient = updatePatient;
window.exportPatients = exportPatients;
window.openSmsModal = openSmsModal;
window.sendPatientSms = sendPatientSms;

Router.register('patients', renderPatients);
