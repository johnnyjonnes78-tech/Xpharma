/**
 * PHARMA_PROJET — Module Ordonnances
 * Enregistrement, validation, archivage légal 10 ans
 */

async function renderPrescriptions(container) {
  try {
    UI.loading(container, 'Chargement des ordonnances...');

    const [prescriptions, patients, products] = await Promise.all([
      DB.dbGetAll('prescriptions'),
      DB.dbGetAll('patients'),
      DB.dbGetAll('products'),
    ]);

    const patientMap = {};
    patients.forEach(p => { patientMap[p.id] = p; });

    const sorted = prescriptions.sort((a, b) => {
      const da = a.date ? new Date(a.date) : 0;
      const db = b.date ? new Date(b.date) : 0;
      return db - da;
    });

    const today = new Date().toISOString().split('T')[0];
    const todayRx = prescriptions.filter(p => p.date && p.date.startsWith(today));
    const pending = prescriptions.filter(p => p.status === 'pending');
    const dispensed = prescriptions.filter(p => p.status === 'dispensed');

    // Base d'interactions pour le module ordonnances
    window.RX_INTERACTIONS = [
      ['methotrexate','trimethoprime','grave','Risque de pancytopénie potentiellement fatale'],
      ['warfarine','aspirine','grave','Hémorragie sévère — surveillance INR obligatoire'],
      ['warfarine','ibuprofène','grave','Hémorragie digestive — AINS contre-indiqués'],
      ['warfarine','fluconazole','grave','Augmentation effet anticoagulant — hémorragie'],
      ['metformine','produit de contraste iodé','modéré','Risque acidose lactique'],
      ['ciprofloxacine','théophylline','grave','Convulsions — surdosage théophylline'],
      ['érythromycine','simvastatine','grave','Rhabdomyolyse — toxicité musculaire'],
      ['clarithromycine','simvastatine','grave','Rhabdomyolyse — toxicité musculaire'],
      ['fluconazole','simvastatine','grave','Rhabdomyolyse — inhibition CYP3A4'],
      ['métronidazole','alcool','grave','Effet antabuse — nausées, vomissements sévères'],
      ['ciprofloxacine','fer','modéré','Absorption réduite de la ciprofloxacine'],
      ['tétracycline','calcium','modéré','Chélation — perte d\'efficacité antibiotique'],
      ['doxycycline','calcium','modéré','Absorption réduite de la doxycycline'],
      ['amoxicilline','méthotrexate','grave','Toxicité méthotrexate augmentée'],
      ['lithium','ibuprofène','grave','Toxicité lithium — insuffisance rénale'],
      ['lithium','diclofénac','grave','Toxicité lithium — insuffisance rénale'],
      ['digoxine','amiodarone','grave','Toxicité digitale — bradycardie sévère'],
      ['digoxine','vérapamil','grave','Bradycardie sévère — bloc AV'],
      ['carbamazépine','érythromycine','grave','Toxicité carbamazépine — ataxie, nystagmus'],
      ['phénytoïne','fluconazole','grave','Toxicité phénytoïne augmentée'],
      ['captopril','spironolactone','modéré','Hyperkaliémie — surveillance potassium'],
      ['énalapril','spironolactone','modéré','Hyperkaliémie — surveillance potassium'],
      ['cisapride','fluconazole','grave','Allongement QT — arythmie cardiaque'],
      ['tramadol','carbamazépine','modéré','Efficacité tramadol réduite — induction enzymatique'],
      ['clopidogrel','oméprazole','modéré','Efficacité clopidogrel réduite — éviter association'],
      ['sildenafil','nitrate','grave','Hypotension sévère potentiellement fatale'],
      ['isoniazide','rifampicine','modéré','Hépatotoxicité — surveillance hépatique obligatoire'],
      ['amiodarone','simvastatine','grave','Rhabdomyolyse — limiter dose statine'],
      ['métoclopramide','lévodopa','modéré','Antagonisme dopaminergique — perte d\'efficacité'],
      ['furosémide','gentamicine','grave','Ototoxicité et néphrotoxicité augmentées'],
    ];

    container.innerHTML = `
      <div class="page-header">
        <div>
          <h1 class="page-title">Gestion des Ordonnances</h1>
          <p class="page-subtitle">Archivage numérique conforme — Conservation 10 ans</p>
        </div>
        <div class="header-actions">
          <button class="btn btn-secondary" onclick="exportPrescriptions()"><i data-lucide="download"></i> Exporter</button>
          <button class="btn btn-primary" onclick="showNewPrescription()"><i data-lucide="plus"></i> Nouvelle Ordonnance</button>
        </div>
      </div>

      <div class="stats-bar">
        <div class="stat-chip stat-blue"><span class="stat-val">${prescriptions.length}</span><span class="stat-label">Total</span></div>
        <div class="stat-chip stat-orange"><span class="stat-val">${pending.length}</span><span class="stat-label">En attente</span></div>
        <div class="stat-chip stat-green"><span class="stat-val">${dispensed.length}</span><span class="stat-label">Dispensées</span></div>
        <div class="stat-chip stat-blue"><span class="stat-val">${todayRx.length}</span><span class="stat-label">Aujourd'hui</span></div>
      </div>

      <div class="filter-bar">
        <input type="text" id="rx-search" placeholder="Chercher patient, médecin, médicament..." class="filter-input" oninput="filterPrescriptions()">
        <select id="rx-status" class="filter-select" onchange="filterPrescriptions()">
          <option value="">Tous statuts</option>
          <option value="pending">En attente</option>
          <option value="validated">Validée</option>
          <option value="dispensed">Dispensée</option>
          <option value="partial">Partielle</option>
          <option value="refused">Refusée</option>
          <option value="archived">Archivée</option>
        </select>
        <input type="date" id="rx-date-from" class="filter-input" style="max-width:160px" onchange="filterPrescriptions()">
        <span class="filter-sep"><i data-lucide="arrow-right"></i></span>
        <input type="date" id="rx-date-to" class="filter-input" style="max-width:160px" onchange="filterPrescriptions()">
      </div>

      <div id="rx-table-container"></div>
    `;

    window._rxData = sorted;
    window._rxPatientMap = patientMap;
    window._rxProducts = products;
    filterPrescriptions();
  } catch (err) {
    console.error('[RX] Render error:', err);
    UI.empty(container, 'Erreur lors du chargement des ordonnances : ' + err.message, 'alert-circle');
  }
  if (window.lucide) lucide.createIcons();
}

function filterPrescriptions() {
  const search = document.getElementById('rx-search')?.value.toLowerCase() || '';
  const status = document.getElementById('rx-status')?.value || '';
  const from = document.getElementById('rx-date-from')?.value;
  const to = document.getElementById('rx-date-to')?.value;

  let data = window._rxData || [];

  if (search) {
    data = data.filter(rx => {
      const patient = window._rxPatientMap?.[rx.patientId];
      return (patient?.name || '').toLowerCase().includes(search) ||
        (rx.doctorName || '').toLowerCase().includes(search) ||
        (rx.items || []).some(i => i.productName?.toLowerCase().includes(search));
    });
  }
  if (status) data = data.filter(rx => rx.status === status);
  if (from) data = data.filter(rx => rx.date >= from);
  if (to) data = data.filter(rx => rx.date <= to + 'T23:59:59');

  renderPrescriptionsTable(data);
}

function renderPrescriptionsTable(data) {
  const container = document.getElementById('rx-table-container');
  if (!container) return;

  const statusConfig = {
    pending: { label: 'En attente', cls: 'badge-warning' },
    validated: { label: 'Validée', cls: 'badge-info' },
    dispensed: { label: 'Dispensée', cls: 'badge-success' },
    partial: { label: 'Partielle', cls: 'badge-orange' },
    refused: { label: 'Refusée', cls: 'badge-danger' },
    archived: { label: 'Archivée', cls: 'badge-neutral' },
  };

  const columns = [
    { label: 'N° Rx', render: r => `<code class="code-tag">Rx-${String(r.id).padStart(5, '0')}</code>` },
    { label: 'Date', render: r => UI.formatDate(r.date) },
    {
      label: 'Patient', render: r => {
        const p = window._rxPatientMap?.[r.patientId];
        return p ? `<div><strong>${p.name}</strong><br><span class="text-muted text-sm">${p.phone || ''}</span></div>` : `<span class="text-muted">${r.patientName || 'Non identifié'}</span>`;
      }
    },
    { label: 'Médecin', render: r => `<div><span>${r.doctorName || '—'}</span><br><span class="text-muted text-sm">${r.doctorSpecialty || ''}</span></div>` },
    {
      label: 'Médicaments', render: r => {
        const items = r.items || [];
        if (!items.length) return '—';
        return `<div class="rx-items-preview">${items.slice(0, 2).map(i => `<span class="rx-item-tag">${i.productName || i.dci}</span>`).join('')}${items.length > 2 ? `<span class="rx-item-tag rx-item-more">+${items.length - 2}</span>` : ''}</div>`;
      }
    },
    { label: 'Renouvelable', render: r => r.renewable ? `<span class="badge badge-info"><i data-lucide="refresh-cw"></i> ${r.renewCount || 1}x</span>` : '<span class="badge badge-neutral">Non</span>' },
    {
      label: 'Statut', render: r => {
        const s = statusConfig[r.status] || { label: r.status, cls: 'badge-neutral' };
        return `<span class="badge ${s.cls}">${s.label}</span>`;
      }
    },
    {
      label: 'Actions', render: r => `
      <div class="actions-cell">
        <button class="btn btn-xs btn-primary" onclick="viewPrescription(${r.id})" title="Voir détail"><i data-lucide="eye"></i></button>
        ${r.status === 'pending' || r.status === 'validated' ? `<button class="btn btn-xs btn-success" onclick="dispensePrescription(${r.id})" title="Dispenser"><i data-lucide="pill"></i></button>` : ''}
        ${r.status === 'pending' ? `<button class="btn btn-xs btn-secondary" onclick="validatePrescription(${r.id})" title="Valider"><i data-lucide="check"></i></button>` : ''}
        <button class="btn btn-xs btn-ghost" onclick="printPrescriptionLabel(${r.id})" title="Étiquette"><i data-lucide="printer"></i></button>
      </div>` },
  ];

  UI.table(container, columns, data, {
    emptyMessage: 'Aucune ordonnance trouvée',
    emptyIcon: 'file-text',
    pageSize: 20
  });
  if (window.lucide) lucide.createIcons();
}

function showNewPrescription() {
  const patients = Object.values(window._rxPatientMap || {});
  const products = (window._rxProducts || []).filter(p => p.requiresPrescription);

  const modal = UI.modal('<i data-lucide="file-text" class="modal-icon-inline"></i> Nouvelle Ordonnance', `
    <div class="rx-form-layout">
      <!-- Section Patient -->
      <div class="rx-section">
        <h4 class="rx-section-title"><i data-lucide="user"></i> Patient</h4>
        <div class="form-row">
          <div class="form-group">
            <label>Patient existant</label>
            <select id="rx-patient-select" class="form-control" onchange="fillPatientData()">
              <option value="">— Nouveau patient —</option>
              ${patients.map(p => `<option value="${p.id}">${p.name} (${p.phone || '—'})</option>`).join('')}
            </select>
          </div>
          <div class="form-group">
            <label>Nom complet *</label>
            <input type="text" id="rx-patient-name" class="form-control" placeholder="Prénom Nom" required>
          </div>
        </div>
        <div class="form-row">
          <div class="form-group">
            <label>Téléphone</label>
            <input type="tel" id="rx-patient-phone" class="form-control" placeholder="+224 6XX XXX XXX">
          </div>
          <div class="form-group">
            <label>Date de naissance</label>
            <input type="date" id="rx-patient-dob" class="form-control">
          </div>
        </div>
        <div class="form-group">
          <label>Allergies connues</label>
          <input type="text" id="rx-patient-allergies" class="form-control" placeholder="Ex: Pénicilline, Aspirine...">
        </div>
      </div>

      <!-- Section Médecin -->
      <div class="rx-section">
        <h4 class="rx-section-title"><i data-lucide="stethoscope"></i> Prescripteur</h4>
        <div class="form-row">
          <div class="form-group">
            <label>Nom du médecin *</label>
            <input type="text" id="rx-doctor-name" class="form-control" required>
          </div>
          <div class="form-group">
            <label>Spécialité</label>
            <select id="rx-doctor-specialty" class="form-control">
              <option>Médecin généraliste</option>
              <option>Pédiatre</option>
              <option>Cardiologue</option>
              <option>Interniste</option>
              <option>Gynécologue</option>
              <option>Pneumologue</option>
              <option>Diabétologue</option>
              <option>Autre spécialiste</option>
            </select>
          </div>
        </div>
        <div class="form-row">
          <div class="form-group">
            <label>N° Ordre médecin</label>
            <input type="text" id="rx-doctor-order" class="form-control" placeholder="OM-GN-XXXX">
          </div>
          <div class="form-group">
            <label>Établissement</label>
            <input type="text" id="rx-doctor-establishment" class="form-control" placeholder="Hôpital / Clinique">
          </div>
        </div>
        <div class="form-row">
          <div class="form-group">
            <label>Date de prescription *</label>
            <input type="date" id="rx-date" class="form-control" value="${new Date().toISOString().split('T')[0]}" required>
          </div>
          <div class="form-group">
            <label>Date de validité</label>
            <input type="date" id="rx-validity" class="form-control" value="${new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]}">
          </div>
        </div>
      </div>

      <!-- Section Médicaments -->
      <div class="rx-section">
        <div class="rx-section-header">
          <h4 class="rx-section-title"><i data-lucide="pill"></i> Médicaments Prescrits</h4>
          <button type="button" class="btn btn-sm btn-primary" onclick="addRxItem()"><i data-lucide="plus"></i> Ajouter</button>
        </div>
        <div id="rx-items-list">
          <div class="rx-empty-items">Cliquez sur "<i data-lucide="plus"></i> Ajouter" pour ajouter un médicament</div>
        </div>
      </div>

      <!-- Section Options -->
      <div class="rx-section">
        <h4 class="rx-section-title"><i data-lucide="settings"></i> Options</h4>
        <div class="form-row">
          <div class="form-group">
            <label class="checkbox-label">
              <input type="checkbox" id="rx-renewable"> Ordonnance renouvelable
            </label>
          </div>
          <div class="form-group">
            <label>Nombre de renouvellements</label>
            <input type="number" id="rx-renew-count" class="form-control" value="2" min="1" max="12">
          </div>
        </div>
        <div class="form-group">
          <label>Note du pharmacien</label>
          <textarea id="rx-note" class="form-control" rows="2" placeholder="Observations, interactions détectées..."></textarea>
        </div>
        <div class="form-group">
          <label><i data-lucide="camera"></i> Photo de l'ordonnance originale</label>
          <div class="upload-zone" onclick="document.getElementById('rx-photo-input').click()">
            <span><i data-lucide="camera"></i> Cliquer pour prendre une photo ou importer</span>
            <input type="file" id="rx-photo-input" accept="image/*" capture="environment" style="display:none" onchange="previewRxPhoto(this)">
          </div>
          <div id="rx-photo-preview"></div>
        </div>
      </div>
    </div>
  `, {
    size: 'large',
    footer: `
      <button class="btn btn-secondary" onclick="UI.closeModal()">Annuler</button>
      <button class="btn btn-warning" onclick="submitPrescription('pending')"><i data-lucide="save"></i> Enregistrer en attente</button>
      <button class="btn btn-primary" onclick="submitPrescription('validated')"><i data-lucide="check"></i> Valider & Enregistrer</button>
    `
  });
  if (window.lucide) lucide.createIcons();

  window._rxItemCounter = 0;
  window._rxItemsData = [];
}

window._rxItemCounter = 0;
window._rxItemsData = [];

function addRxItem() {
  const products = (window._rxProducts || []).filter(p => p.requiresPrescription || true);
  const listEl = document.getElementById('rx-items-list');
  if (!listEl) return;

  const emptyEl = listEl.querySelector('.rx-empty-items');
  if (emptyEl) emptyEl.remove();

  const idx = window._rxItemCounter++;
  const itemDiv = document.createElement('div');
  itemDiv.className = 'rx-item-row';
  itemDiv.id = `rx-item-${idx}`;
  itemDiv.innerHTML = `
    <div class="rx-item-fields">
      <div class="form-group flex-grow">
        <select class="form-control" id="rx-prod-${idx}" onchange="updateRxItemDosage(${idx})">
          <option value="">Sélectionner médicament...</option>
          ${products.map(p => `<option value="${p.id}" data-name="${p.name}" data-dci="${p.dci || ''}">${p.name} — ${p.dci || ''}</option>`).join('')}
        </select>
      </div>
      <div class="form-group" style="width:100px">
        <input type="number" class="form-control" id="rx-qty-${idx}" placeholder="Qté" min="1" value="1">
      </div>
      <div class="form-group flex-grow">
        <input type="text" class="form-control" id="rx-dosage-${idx}" placeholder="Posologie (ex: 1 cp x 3/j pendant 7j)">
      </div>
      <div class="form-group" style="width:80px">
        <select class="form-control" id="rx-unit-${idx}">
          <option>boîte</option><option>comprimé</option><option>flacon</option><option>sachet</option><option>ampoule</option>
        </select>
      </div>
      <button type="button" class="btn btn-xs btn-danger" onclick="removeRxItem(${idx})"><i data-lucide="trash-2"></i></button>
    </div>
    <div class="rx-item-dci" id="rx-dci-${idx}"></div>
  `;
  listEl.appendChild(itemDiv);
  if (window.lucide) lucide.createIcons();
}

function updateRxItemDosage(idx) {
  const sel = document.getElementById(`rx-prod-${idx}`);
  const dciEl = document.getElementById(`rx-dci-${idx}`);
  if (sel && dciEl) {
    const opt = sel.options[sel.selectedIndex];
    const dci = opt?.dataset?.dci || '';
    dciEl.innerHTML = dci ? `DCI: <strong>${dci}</strong>` : '';
    dciEl.style.color = '#64748b';
    dciEl.style.fontSize = '11px';
    
    // Vérification des interactions avec les autres produits sélectionnés
    checkPrescriptionInteractions();
  }
}

function checkPrescriptionInteractions() {
  const selectedDCIs = [];
  const selectedNames = [];
  document.querySelectorAll('.rx-item-row').forEach(row => {
    const idx = row.id.replace('rx-item-', '');
    const prodSel = document.getElementById(`rx-prod-${idx}`);
    if (prodSel?.value) {
      const opt = prodSel.options[prodSel.selectedIndex];
      if (opt?.dataset?.dci) {
        selectedDCIs.push(opt.dataset.dci.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, ''));
        selectedNames.push(opt.dataset.name);
      }
    }
  });

  const alerts = [];
  for (let i = 0; i < selectedDCIs.length; i++) {
    for (let j = i + 1; j < selectedDCIs.length; j++) {
      for (const [dciA, dciB, level, desc] of (window.RX_INTERACTIONS || [])) {
        const a = dciA.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
        const b = dciB.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
        if ((selectedDCIs[i].includes(a) && selectedDCIs[j].includes(b)) || 
            (selectedDCIs[i].includes(b) && selectedDCIs[j].includes(a))) {
          alerts.push({ p1: selectedNames[i], p2: selectedNames[j], level, desc });
        }
      }
    }
  }

  // Vérification des allergies du patient
  const allergiesInput = document.getElementById('rx-patient-allergies')?.value;
  if (allergiesInput) {
    const patientAllergies = allergiesInput.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').split(/[,\s]+/);
    selectedDCIs.forEach((dci, index) => {
      patientAllergies.forEach(allergy => {
        if (allergy.length > 3 && dci.includes(allergy)) {
          alerts.push({ p1: selectedNames[index], p2: 'ALLERGIE PATIENT', level: 'grave', desc: `Le patient est allergique à ${allergy} (DCI: ${dci})` });
        }
      });
    });
  }

  const interactionsContainer = document.getElementById('rx-interactions-alert') || (() => {
    const div = document.createElement('div');
    div.id = 'rx-interactions-alert';
    div.style.marginTop = '15px';
    const listEl = document.getElementById('rx-items-list');
    listEl.parentElement.insertBefore(div, listEl.nextSibling);
    return div;
  })();

  if (alerts.length > 0) {
    interactionsContainer.innerHTML = alerts.map(a => `
      <div class="alert-section-banner alert-${a.level === 'grave' ? 'danger' : 'warning'}" style="margin-bottom:10px">
        <i data-lucide="${a.level === 'grave' ? 'alert-octagon' : 'alert-triangle'}"></i>
        <strong>Interaction ${a.level.toUpperCase()} : ${a.p1} + ${a.p2}</strong><br>
        <span style="font-size:12px">${a.desc}</span>
      </div>
    `).join('');
    // Auto-remplir la note du pharmacien
    const noteArea = document.getElementById('rx-note');
    if (noteArea && !noteArea.value.includes('Interactions détectées')) {
      noteArea.value = `⚠️ Interactions détectées :\n${alerts.map(a => `- ${a.p1} / ${a.p2} : ${a.desc}`).join('\n')}\n${noteArea.value}`;
    }
  } else {
    interactionsContainer.innerHTML = '';
  }
  if (window.lucide) lucide.createIcons();
}

function removeRxItem(idx) {
  const el = document.getElementById(`rx-item-${idx}`);
  if (el) el.remove();
}

function fillPatientData() {
  const sel = document.getElementById('rx-patient-select');
  const patientId = parseInt(sel?.value);
  if (!patientId) return;
  const patient = window._rxPatientMap?.[patientId];
  if (!patient) return;
  document.getElementById('rx-patient-name').value = patient.name || '';
  document.getElementById('rx-patient-phone').value = patient.phone || '';
  document.getElementById('rx-patient-dob').value = patient.dob || '';
  document.getElementById('rx-patient-allergies').value = patient.allergies || '';

  if (patient.allergies) {
    UI.toast(`Allergie connue : ${patient.allergies}`, 'warning', 5000);
  }
}

function previewRxPhoto(input) {
  const preview = document.getElementById('rx-photo-preview');
  if (!preview || !input.files[0]) return;
  const reader = new FileReader();
  reader.onload = e => {
    preview.innerHTML = `<img src="${e.target.result}" style="max-width:100%;max-height:200px;border-radius:8px;margin-top:8px;border:2px solid #1ABC9C;">`;
    window._rxPhotoData = e.target.result;
  };
  reader.readAsDataURL(input.files[0]);
}

async function submitPrescription(status) {
  const patientName = document.getElementById('rx-patient-name')?.value;
  const doctorName = document.getElementById('rx-doctor-name')?.value;
  const rxDate = document.getElementById('rx-date')?.value;

  if (!patientName || !doctorName || !rxDate) {
    UI.toast('Champs obligatoires manquants (patient, médecin, date)', 'error');
    return;
  }

  // Collect items
  const items = [];
  document.querySelectorAll('.rx-item-row').forEach(row => {
    const idx = row.id.replace('rx-item-', '');
    const prodSel = document.getElementById(`rx-prod-${idx}`);
    const qty = parseInt(document.getElementById(`rx-qty-${idx}`)?.value || 1);
    const dosage = document.getElementById(`rx-dosage-${idx}`)?.value || '';
    const unit = document.getElementById(`rx-unit-${idx}`)?.value || 'boîte';
    if (prodSel?.value) {
      const opt = prodSel.options[prodSel.selectedIndex];
      items.push({
        productId: parseInt(prodSel.value),
        productName: opt?.dataset?.name || '',
        dci: opt?.dataset?.dci || '',
        quantity: qty,
        dosage,
        unit,
        dispensed: 0,
      });
    }
  });

  if (items.length === 0) {
    UI.toast('Ajoutez au moins un médicament à l\'ordonnance', 'warning');
    return;
  }

  // Check or create patient
  let patientId = parseInt(document.getElementById('rx-patient-select')?.value) || null;
  if (!patientId && patientName) {
    patientId = await DB.dbAdd('patients', {
      name: patientName,
      phone: document.getElementById('rx-patient-phone')?.value || '',
      dob: document.getElementById('rx-patient-dob')?.value || '',
      allergies: document.getElementById('rx-patient-allergies')?.value || '',
    });
  }

  const rxData = {
    patientId,
    patientName,
    doctorName,
    doctorSpecialty: document.getElementById('rx-doctor-specialty')?.value || '',
    doctorOrderNumber: document.getElementById('rx-doctor-order')?.value || '',
    doctorEstablishment: document.getElementById('rx-doctor-establishment')?.value || '',
    date: rxDate,
    validityDate: document.getElementById('rx-validity')?.value || '',
    items,
    renewable: document.getElementById('rx-renewable')?.checked || false,
    renewCount: parseInt(document.getElementById('rx-renew-count')?.value || 1),
    renewUsed: 0,
    status,
    note: document.getElementById('rx-note')?.value || '',
    photoData: window._rxPhotoData || null,
    validatedBy: status === 'validated' ? DB.AppState.currentUser?.id : null,
    validatedAt: status === 'validated' ? Date.now() : null,
    archiveDate: new Date(Date.now() + 10 * 365.25 * 24 * 60 * 60 * 1000).toISOString(),
  };

  try {
    const rxId = await DB.dbAdd('prescriptions', rxData);
    await DB.writeAudit('ADD_PRESCRIPTION', 'prescriptions', rxId, { patientName, doctorName, status, itemCount: items.length });

    UI.closeModal();
    UI.toast(`Ordonnance Rx-${String(rxId).padStart(5, '0')} enregistrée`, 'success', 4000);
    delete window._rxPhotoData;
    Router.navigate('prescriptions');
  } catch (err) {
    UI.toast('Erreur : ' + err.message, 'error');
  }
}

async function viewPrescription(rxId) {
  const rx = await DB.dbGet('prescriptions', rxId);
  if (!rx) return;
  const patient = rx.patientId ? await DB.dbGet('patients', rx.patientId) : null;

  const statusConfig = {
    pending: { label: 'En attente', cls: 'badge-warning' },
    validated: { label: 'Validée', cls: 'badge-info' },
    dispensed: { label: 'Dispensée', cls: 'badge-success' },
    partial: { label: 'Partielle', cls: 'badge-orange' },
    refused: { label: 'Refusée', cls: 'badge-danger' },
    archived: { label: 'Archivée', cls: 'badge-neutral' },
  };
  const s = statusConfig[rx.status] || { label: rx.status, cls: 'badge-neutral' };

  UI.modal(`<i data-lucide="file-text" class="modal-icon-inline"></i> Ordonnance Rx-${String(rxId).padStart(5, '0')}`, `
    <div class="rx-detail">
      <div class="rx-detail-header">
        <div class="rx-detail-info">
          <div class="rx-ref-badge">Rx-${String(rxId).padStart(5, '0')}</div>
          <span class="badge ${s.cls}">${s.label}</span>
          ${rx.renewable ? `<span class="badge badge-info"><i data-lucide="refresh-cw"></i> Renouvelable ${rx.renewCount}x</span>` : ''}
        </div>
        <div class="rx-dates">
          <span><i data-lucide="calendar"></i> Prescrite le ${UI.formatDate(rx.date)}</span>
          ${rx.validityDate ? `<span><i data-lucide="clock"></i> Valide jusqu'au ${UI.formatDate(rx.validityDate)}</span>` : ''}
        </div>
      </div>

      <div class="rx-detail-grid">
        <div class="rx-detail-card">
          <h4><i data-lucide="user"></i> Patient</h4>
          <div class="detail-row"><span>Nom</span><span><strong>${rx.patientName || (patient?.name || '—')}</strong></span></div>
          <div class="detail-row"><span>Téléphone</span><span>${patient?.phone || '—'}</span></div>
          <div class="detail-row"><span>Date de naissance</span><span>${patient?.dob ? UI.formatDate(patient.dob) : '—'}</span></div>
          ${patient?.allergies ? `<div class="detail-row allergy-row"><span><i data-lucide="alert-triangle"></i> Allergies</span><span class="text-danger"><strong>${patient.allergies}</strong></span></div>` : ''}
        </div>
        <div class="rx-detail-card">
          <h4><i data-lucide="stethoscope"></i> Médecin Prescripteur</h4>
          <div class="detail-row"><span>Nom</span><span><strong>${rx.doctorName}</strong></span></div>
          <div class="detail-row"><span>Spécialité</span><span>${rx.doctorSpecialty || '—'}</span></div>
          <div class="detail-row"><span>N° Ordre</span><span>${rx.doctorOrderNumber || '—'}</span></div>
          <div class="detail-row"><span>Établissement</span><span>${rx.doctorEstablishment || '—'}</span></div>
        </div>
      </div>

      <div class="rx-items-section">
        <h4><i data-lucide="pill"></i> Médicaments Prescrits</h4>
        <table class="data-table">
          <thead><tr><th>Médicament</th><th>DCI</th><th>Qté</th><th>Posologie</th><th>Dispensé</th></tr></thead>
          <tbody>
            ${(rx.items || []).map(item => `
              <tr>
                <td><strong>${item.productName}</strong></td>
                <td class="text-muted">${item.dci || '—'}</td>
                <td>${item.quantity} ${item.unit}</td>
                <td class="text-sm">${item.dosage || '—'}</td>
                <td>${item.dispensed > 0 ? `<span class="badge badge-success">${item.dispensed} dispensé(s)</span>` : '<span class="badge badge-neutral">Non dispensé</span>'}</td>
              </tr>`).join('')}
          </tbody>
        </table>
      </div>

      ${rx.note ? `<div class="rx-note-section"><h4><i data-lucide="file-edit"></i> Note Pharmacien</h4><p>${rx.note}</p></div>` : ''}

      ${rx.photoData ? `
        <div class="rx-photo-section">
          <h4><i data-lucide="file-image"></i> Document original</h4>
          <img src="${rx.photoData}" style="max-width:100%;max-height:300px;border-radius:8px;border:1px solid #e2e8f0;">
        </div>` : ''}

      <div class="rx-audit">
        <span class="text-muted text-sm">Archivage légal jusqu'au ${rx.archiveDate ? UI.formatDate(rx.archiveDate) : '—'}</span>
        ${rx.validatedBy ? `<span class="text-muted text-sm">Validé par utilisateur #${rx.validatedBy}</span>` : ''}
      </div>
    </div>
  `, {
    size: 'large',
    footer: `
      ${rx.status === 'pending' ? `<button class="btn btn-secondary" onclick="validatePrescription(${rxId}); UI.closeModal()"><i data-lucide="check"></i> Valider</button>` : ''}
      ${['pending', 'validated', 'partial'].includes(rx.status) ? `<button class="btn btn-primary" onclick="dispensePrescription(${rxId}); UI.closeModal()"><i data-lucide="pill"></i> Dispenser</button>` : ''}
      <button class="btn btn-ghost" onclick="printPrescription(${rxId})"><i data-lucide="printer"></i> Imprimer</button>
      <button class="btn btn-secondary" onclick="UI.closeModal()">Fermer</button>
    `
  });
  if (window.lucide) lucide.createIcons();
}

async function validatePrescription(rxId) {
  const rx = await DB.dbGet('prescriptions', rxId);
  if (!rx) return;

  if (!Auth.can('validate_prescription')) {
    UI.toast('Droits insuffisants — Validation réservée au pharmacien', 'error');
    return;
  }

  await DB.dbPut('prescriptions', {
    ...rx,
    status: 'validated',
    validatedBy: DB.AppState.currentUser?.id,
    validatedAt: Date.now(),
  });

  await DB.writeAudit('VALIDATE_PRESCRIPTION', 'prescriptions', rxId, {});
  UI.toast(`Ordonnance Rx-${String(rxId).padStart(5, '0')} validée`, 'success');
  Router.navigate('prescriptions');
}

async function dispensePrescription(rxId) {
  const rx = await DB.dbGet('prescriptions', rxId);
  if (!rx) return;

  // Check interactions & allergies
  const patient = rx.patientId ? await DB.dbGet('patients', rx.patientId) : null;
  if (patient?.allergies) {
    const itemNames = (rx.items || []).map(i => i.productName + ' ' + (i.dci || '')).join(' ').toLowerCase();
    const allergyWords = patient.allergies.toLowerCase().split(/[,;]/);
    const risk = allergyWords.some(a => itemNames.includes(a.trim()));
    if (risk) {
      const confirm = await UI.confirm(`ALERTE ALLERGIE !\n\nLe patient présente une allergie à : ${patient.allergies}\n\nVérifiez les médicaments prescrits.\n\nConfirmer quand même la dispensation ?`);
      if (!confirm) return;
    }
  }

  // Mark as dispensed and send to POS
  const updated = { ...rx, status: 'dispensed', dispensedAt: Date.now(), dispensedBy: DB.AppState.currentUser?.id };
  (updated.items || []).forEach(i => { i.dispensed = i.quantity; });
  await DB.dbPut('prescriptions', updated);
  await DB.writeAudit('DISPENSE_PRESCRIPTION', 'prescriptions', rxId, { patientName: rx.patientName });

  UI.toast(`💊 Ordonnance dispensée — Redirection vers la caisse`, 'success', 3000);

  // Pre-fill POS cart with prescribed items
  setTimeout(() => {
    Router.navigate('pos');
    setTimeout(async () => {
      const prods = await DB.dbGetAll('products');
      for (const item of (rx.items || [])) {
        const prod = prods.find(p => p.id === item.productId);
        if (prod) {
          for (let i = 0; i < item.quantity; i++) addToCart(prod.id);
        }
      }
      // Check prescription checkbox
      const rxToggle = document.getElementById('rx-toggle');
      if (rxToggle) { rxToggle.checked = true; onRxToggle(true); }
      UI.toast(`${rx.items?.length || 0} médicament(s) ajouté(s) au panier depuis l'ordonnance`, 'info', 4000);
    }, 500);
  }, 1500);
}

async function printPrescriptionLabel(rxId) {
  const rx = await DB.dbGet('prescriptions', rxId);
  if (!rx) return;
  UI.toast('Impression étiquette ordonnance...', 'info');
  printPrescription(rxId);
}

async function exportPrescriptions() {
  const data = window._rxData || [];
  const csv = '\uFEFFN° Rx,Date,Patient,Médecin,Statut,Médicaments\n' +
    data.map(rx => [
      `Rx-${String(rx.id).padStart(5, '0')}`,
      rx.date,
      rx.patientName || '',
      rx.doctorName || '',
      rx.status,
      (rx.items || []).map(i => i.productName).join(';')
    ].join(',')).join('\n');
  const blob = new Blob([csv], { type: 'text/csv' });
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob);
  a.download = `ordonnances_${new Date().toISOString().split('T')[0]}.csv`;
  a.click();
  UI.toast('Export CSV téléchargé', 'success');
}

window.filterPrescriptions = filterPrescriptions;
window.showNewPrescription = showNewPrescription;
window.addRxItem = addRxItem;
window.removeRxItem = removeRxItem;
window.updateRxItemDosage = updateRxItemDosage;
window.fillPatientData = fillPatientData;
window.previewRxPhoto = previewRxPhoto;
window.submitPrescription = submitPrescription;
window.viewPrescription = viewPrescription;
window.validatePrescription = validatePrescription;
window.dispensePrescription = dispensePrescription;
window.printPrescriptionLabel = printPrescriptionLabel;
window.exportPrescriptions = exportPrescriptions;

Router.register('prescriptions', renderPrescriptions);
