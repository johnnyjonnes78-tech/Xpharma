/**
 * PHARMA_PROJET — Catalogue Produits
 */

async function renderProducts(container) {
  UI.loading(container, 'Chargement des produits...');
  const products = await DB.dbGetAll('products');

  container.innerHTML = `
    <div class="page-header">
      <div>
        <h1 class="page-title">Catalogue Médicaments</h1>
        <p class="page-subtitle">${products.length} produits référencés</p>
      </div>
      <div class="header-actions">
        <button class="btn btn-secondary" onclick="showImportModal()"><i data-lucide="upload"></i> Importer</button>
        <button class="btn btn-secondary" onclick="exportProducts()"><i data-lucide="download"></i> Exporter</button>
        <button class="btn btn-primary" onclick="showAddProduct()"><i data-lucide="plus"></i> Nouveau Produit</button>
      </div>
    </div>
    <div class="filter-bar">
      <input type="text" id="prod-search" placeholder="Rechercher..." class="filter-input" oninput="filterProducts()">
      <select id="prod-cat" class="filter-select" onchange="filterProducts()">
        <option value="">Toutes catégories</option>
        ${[...new Set(products.map(p => p.category))].map(c => `<option value="${c}">${c}</option>`).join('')}
      </select>
      <select id="prod-rx" class="filter-select" onchange="filterProducts()">
        <option value="">Rx + OTC</option>
        <option value="1">Ordonnance (Rx)</option>
        <option value="0">Sans ordonnance (OTC)</option>
      </select>
    </div>
    <div id="prod-table-container"></div>
  `;

  window._productsData = products;
  renderProductsTable(products);
  if (window.lucide) lucide.createIcons();
}

function filterProducts() {
  const search = document.getElementById('prod-search')?.value.toLowerCase() || '';
  const cat = document.getElementById('prod-cat')?.value || '';
  const rx = document.getElementById('prod-rx')?.value;
  let data = window._productsData || [];
  if (search) data = data.filter(p => p.name.toLowerCase().includes(search) || (p.dci || '').toLowerCase().includes(search) || (p.code || '').toLowerCase().includes(search));
  if (cat) data = data.filter(p => p.category === cat);
  if (rx !== '') data = data.filter(p => p.requiresPrescription === (rx === '1'));
  renderProductsTable(data);
}

function renderProductsTable(data) {
  const container = document.getElementById('prod-table-container');
  if (!container) return;

  // Pagination
  const PAGE_SIZE = 50;
  window._filteredProducts = data;
  window._prodPage = window._prodPage || 1;
  // Reset page when filter changes
  if (data !== window._lastFilteredData) {
    window._prodPage = 1;
    window._lastFilteredData = data;
  }

  const totalPages = Math.max(1, Math.ceil(data.length / PAGE_SIZE));
  if (window._prodPage > totalPages) window._prodPage = totalPages;
  const start = (window._prodPage - 1) * PAGE_SIZE;
  const pageData = data.slice(start, start + PAGE_SIZE);

  const columns = [
    { label: 'Code', render: r => `<code class="code-tag">${r.code}</code>` },
    { label: 'Médicament', render: r => `<div><strong>${r.name}</strong><br><span class="text-muted text-sm">${r.dci || ''} ${r.dosage || ''}</span></div>` },
    { label: 'Marque', key: 'brand' },
    { label: 'Forme', key: 'form' },
    { label: 'Catégorie', render: r => `<span class="category-tag">${r.category}</span>` },
    { label: 'Statut', render: r => {
      let badges = r.requiresPrescription ? '<span class="badge badge-warning">Rx</span>' : '<span class="badge badge-success">OTC</span>';
      if (r.isControlled) badges += ` <span class="badge badge-danger" title="${r.controlledClass || 'Substance Contrôlée'}">SC</span>`;
      return badges;
    }},
    { label: 'Prix Vente', render: r => `<strong>${UI.formatCurrency(r.salePrice)}</strong>` },
    { label: 'Péremption', render: r => r.expiryDate ? UI.expiryBadge ? UI.expiryBadge(r.expiryDate) : r.expiryDate : '<span class="text-muted">—</span>' },
    { label: 'Prix Achat', render: r => UI.formatCurrency(r.purchasePrice) },
    {
      label: 'Marge', render: r => {
        const m = r.salePrice && r.purchasePrice ? ((r.salePrice - r.purchasePrice) / r.salePrice * 100).toFixed(0) : 0;
        return `<span class="badge badge-${m >= 30 ? 'success' : m >= 20 ? 'warning' : 'danger'}">${m}%</span>`;
      }
    },
    {
      label: 'Actions', render: r => `
      <div class="actions-cell">
        <button class="btn btn-xs btn-primary" onclick="viewProduct(${r.id})"><i data-lucide="eye"></i></button>
        <button class="btn btn-xs btn-secondary" onclick="editProductForm(${r.id})"><i data-lucide="edit-3"></i></button>
      </div>` },
  ];

  // Render table with only the current page
  UI.table(container, columns, pageData, { emptyMessage: 'Aucun produit trouvé', emptyIcon: 'pill' });

  // Pagination controls
  const pagDiv = document.createElement('div');
  pagDiv.style.cssText = 'display:flex;justify-content:space-between;align-items:center;padding:16px 0;gap:12px;flex-wrap:wrap;';
  pagDiv.innerHTML = `
    <span style="font-size:13px;color:var(--text-muted)">${data.length.toLocaleString()} produits — Page ${window._prodPage}/${totalPages}</span>
    <div style="display:flex;gap:8px;">
      <button class="btn btn-secondary btn-sm" ${window._prodPage <= 1 ? 'disabled' : ''} onclick="window._prodPage--;renderProductsTable(window._filteredProducts)">◀ Précédent</button>
      <button class="btn btn-secondary btn-sm" ${window._prodPage >= totalPages ? 'disabled' : ''} onclick="window._prodPage++;renderProductsTable(window._filteredProducts)">Suivant ▶</button>
    </div>
  `;
  container.appendChild(pagDiv);
  if (window.lucide) lucide.createIcons();
}

async function viewProduct(id) {
  const p = await DB.dbGet('products', id);
  if (!p) return;
  const margin = p.salePrice && p.purchasePrice ? ((p.salePrice - p.purchasePrice) / p.salePrice * 100).toFixed(1) : 0;
  const hasNotice = p.dosageInstructions || p.precautions || p.contraindications || p.sideEffects || p.medicalNotice;
  UI.modal(`<i data-lucide="pill" class="modal-icon-inline"></i> ${p.name}`, `
    <div class="product-detail-grid">
      <div class="detail-row"><span class="detail-label">Code</span><span><code>${p.code}</code></span></div>
      <div class="detail-row"><span class="detail-label">DCI</span><span>${p.dci || '—'}</span></div>
      <div class="detail-row"><span class="detail-label">Marque</span><span>${p.brand || '—'}</span></div>
      <div class="detail-row"><span class="detail-label">Forme</span><span>${p.form || '—'}</span></div>
      <div class="detail-row"><span class="detail-label">Dosage</span><span>${p.dosage || '—'}</span></div>
      <div class="detail-row"><span class="detail-label">Catégorie</span><span><span class="category-tag">${p.category}</span></span></div>
      <div class="detail-row"><span class="detail-label">Statut</span><span>${p.requiresPrescription ? '<span class="badge badge-warning">Ordonnance requise</span>' : '<span class="badge badge-success">OTC</span>'}${p.isControlled ? ` <span class="badge badge-danger">${p.controlledClass || 'Substance Contrôlée'}</span>` : ''}</span></div>
      <div class="detail-row"><span class="detail-label">Prix Vente</span><span class="text-success font-bold">${UI.formatCurrency(p.salePrice)}</span></div>
      <div class="detail-row"><span class="detail-label">Prix Achat</span><span>${UI.formatCurrency(p.purchasePrice)}</span></div>
      <div class="detail-row"><span class="detail-label">Marge</span><span class="font-bold">${margin}%</span></div>
      <div class="detail-row"><span class="detail-label">Date de Péremption</span><span>${p.expiryDate ? (UI.expiryBadge ? UI.expiryBadge(p.expiryDate) : p.expiryDate) : '<span class="text-muted">Non renseignée</span>'}</span></div>
      <div class="detail-row"><span class="detail-label">Seuil minimum</span><span>${p.minStock} unités</span></div>
      ${p.allowUnitSale ? `
      <div class="detail-row" style="grid-column:1/-1; background:var(--primary-light,rgba(46,134,193,0.1)); padding:8px 12px; border-radius:6px; margin-top:8px;">
        <div style="display:flex; align-items:center; gap:6px; font-weight:600; color:var(--primary); margin-bottom:4px"><i data-lucide="package-open" style="width:16px;height:16px"></i> Vente au détail autorisée</div>
        <div style="display:flex; justify-content:space-between; font-size:13px; margin-bottom:4px;">
          <span>Boîte de <strong>${p.subUnitsPerBox || 1}</strong> Plaquette(s)</span>
          <span>Prix de la plaquette : <strong>${UI.formatCurrency(p.pricePerSubUnit || p.salePrice)}</strong></span>
        </div>
        <div style="display:flex; justify-content:space-between; font-size:13px">
          <span>Plaquette de <strong>${p.unitsPerBox || 1}</strong> Unité(s)</span>
          <span>Prix de l'unité : <strong>${UI.formatCurrency(p.pricePerUnit || 0)}</strong></span>
        </div>
      </div>` : ''}
    </div>
    ${hasNotice ? `
      <div style="margin-top:20px; padding-top:16px; border-top:1px solid var(--border)">
        <h4 style="margin-bottom:12px; display:flex; align-items:center; gap:8px; font-size:14px"><i data-lucide="file-text"></i> Notice Médicale</h4>
        ${p.dosageInstructions ? `<div style="margin-bottom:12px"><strong style="font-size:12px;color:var(--primary)">📋 Posologie</strong><p style="margin:4px 0 0;font-size:13px;color:var(--text)">${p.dosageInstructions}</p></div>` : ''}
        ${p.precautions ? `<div style="margin-bottom:12px; padding:10px; background:rgba(232,145,58,0.08); border-radius:8px; border-left:3px solid var(--warning)"><strong style="font-size:12px;color:var(--warning)">⚠️ Précautions</strong><p style="margin:4px 0 0;font-size:13px">${p.precautions}</p></div>` : ''}
        ${p.contraindications ? `<div style="margin-bottom:12px; padding:10px; background:rgba(214,59,59,0.08); border-radius:8px; border-left:3px solid var(--danger)"><strong style="font-size:12px;color:var(--danger)">🚫 Contre-indications</strong><p style="margin:4px 0 0;font-size:13px">${p.contraindications}</p></div>` : ''}
        ${p.sideEffects ? `<div style="margin-bottom:12px"><strong style="font-size:12px;color:var(--text-muted)">💊 Effets indésirables</strong><p style="margin:4px 0 0;font-size:13px;color:var(--text)">${p.sideEffects}</p></div>` : ''}
        ${p.medicalNotice ? `<div style="margin-bottom:12px"><strong style="font-size:12px;color:var(--info)">📄 Notice complète</strong><p style="margin:4px 0 0;font-size:13px;color:var(--text);white-space:pre-line">${p.medicalNotice}</p></div>` : ''}
        ${p.noticePdfUrl ? `<div style="margin-top:12px; padding-top:12px; border-top:1px dashed var(--border)"><a href="${p.noticePdfUrl}" target="_blank" download="notice_${p.dci||p.name}.pdf" class="btn btn-sm btn-outline"><i data-lucide="file-down"></i> Télécharger la Notice PDF du Laboratoire</a></div>` : ''}
      </div>
    ` : '<div style="margin-top:16px;padding:12px;background:var(--surface-2);border-radius:8px;text-align:center;font-size:12px;color:var(--text-muted)"><i data-lucide="info" style="width:14px;height:14px;vertical-align:text-bottom"></i> Aucune notice médicale renseignée</div>'}
  `, { size: 'medium' });
}

async function showAddProduct() {
  const products = await DB.dbGetAll('products');
  const codeAuto = 'P' + String(products.length + 1).padStart(3, '0');
  const categories = ['Antalgique', 'Antibiotique', 'Anti-inflammatoire', 'Antidiabétique', 'Antipaludique', 'Antihypertenseur', 'Antihistaminique', 'Gastroprotecteur', 'Hématologie', 'Réhydratation', 'Vitamine', 'Dermatologie', 'Ophtalmologie', 'Autre'];

  UI.modal('<i data-lucide="plus-circle" class="modal-icon-inline"></i> Nouveau Produit', `
    <form id="product-form" class="form-grid">
      <div class="form-row">
        <div class="form-group">
          <label>Code *</label>
          <input type="text" name="code" class="form-control" value="${codeAuto}" required>
        </div>
        <div class="form-group">
          <label>DCI (Nom générique) *</label>
          <div style="display:flex; gap:8px">
            <input type="text" name="dci" class="form-control" placeholder="Paracétamol" required>
            <button type="button" class="btn btn-secondary btn-sm" onclick="simulerVidalCloud('product-form')" style="white-space:nowrap" title="Bdd Claude Bernard"><i data-lucide="cloud-lightning"></i> Base Médicale</button>
          </div>
        </div>
      </div>
      <div class="form-row">
        <div class="form-group">
          <label>Nom commercial *</label>
          <input type="text" name="name" class="form-control" required>
        </div>
        <div class="form-group">
          <label>Marque / Laboratoire</label>
          <div style="display:flex;gap:4px">
            <input type="text" name="brand" class="form-control" placeholder="Labo ou Marque">
            <select name="manufacturer" class="form-control" style="width:120px">
              <option value="">Labo (Dict)</option>
              <option>Sanofi</option><option>Pfizer</option><option>GSK</option><option>Bayer</option><option>Novartis</option><option>AstraZeneca</option><option>Pierre Fabre</option><option>Biogaran</option>
            </select>
          </div>
        </div>
      </div>
      <div class="form-row">
        <div class="form-group">
          <label>Forme galénique</label>
          <input type="text" name="form" class="form-control" placeholder="Comprimé, Sirop...">
        </div>
        <div class="form-group">
          <label>Dosage</label>
          <input type="text" name="dosage" class="form-control" placeholder="500mg">
        </div>
      </div>
      <div class="form-row">
        <div class="form-group">
          <label>Catégorie *</label>
          <select name="category" class="form-control" required>
            <option value="">Choisir...</option>
            ${categories.map(c => `<option value="${c}">${c}</option>`).join('')}
          </select>
        </div>
        <div class="form-group">
          <label>Statut</label>
          <select name="requiresPrescription" class="form-control">
            <option value="0">OTC — Sans ordonnance</option>
            <option value="1">Rx — Sur ordonnance</option>
          </select>
        </div>
      </div>
      <div class="form-row">
        <div class="form-group">
          <label>Prix de vente (GNF) *</label>
          <input type="number" name="salePrice" class="form-control" min="0" required>
        </div>
        <div class="form-group">
          <label>Prix d'achat (GNF)</label>
          <input type="number" name="purchasePrice" class="form-control" min="0">
        </div>
      </div>
      <div class="form-row">
        <div class="form-group">
          <label>Seuil minimum (boîtes/unités brutes)</label>
          <input type="number" name="minStock" class="form-control" value="10" min="0">
        </div>
        <div class="form-group">
          <label>Type de produit</label>
          <input type="text" name="unit" class="form-control" value="boîte">
        </div>
      </div>
      <div style="margin-top:16px; padding-top:16px; border-top:1px solid var(--border)">
        <h4 style="margin-bottom:12px; font-size:14px; display:flex; align-items:center; gap:8px"><i data-lucide="package-open"></i> Déconditionnement (Vente à l'unité)</h4>
        <div class="form-group">
           <label style="display:flex; align-items:center; gap:8px">
             <input type="checkbox" name="allowUnitSale" id="allowUnitSaleCb" value="1" onchange="document.getElementById('unit-sale-group').style.display = this.checked ? 'block' : 'none'">
             <span>Autoriser la vente à l'unité (fractionner la boîte)</span>
           </label>
        </div>
        <div id="unit-sale-group" style="display:none; background:var(--surface-2); padding:10px; border-radius:6px; margin-top:8px">
          <div class="form-row">
            <div class="form-group">
              <label>Sous-unités par boîte (ex: 2 Plaquettes)</label>
              <input type="number" name="subUnitsPerBox" class="form-control" value="1" min="1" oninput="calcUnitPrice('product-form')">
            </div>
            <div class="form-group">
              <label>Prix de vente (Sous-unité / Plaquette)</label>
              <input type="number" name="pricePerSubUnit" class="form-control" value="0" min="0">
            </div>
          </div>
          <div class="form-row">
            <div class="form-group">
              <label>Unités par sous-unité (ex: 10 Gélules / Plaquette)</label>
              <input type="number" name="unitsPerBox" class="form-control" value="1" min="1" oninput="calcUnitPrice('product-form')">
            </div>
            <div class="form-group">
              <label>Prix de vente unitaire (Gélule)</label>
              <input type="number" name="pricePerUnit" class="form-control" value="0" min="0">
            </div>
          </div>
        </div>
      </div>
      <div class="form-row">
        <div class="form-group">
          <label>Date de Péremption</label>
          <input type="date" name="expiryDate" class="form-control">
        </div>
        <div class="form-group">
          <label>Substance Contrôlée</label>
          <select name="isControlled" class="form-control" onchange="document.getElementById('controlled-class-group').style.display = this.value === '1' ? 'block' : 'none'">
            <option value="0">Non</option>
            <option value="1">Oui — Substance réglementée</option>
          </select>
        </div>
      </div>
      <div class="form-row" id="controlled-class-group" style="display:none">
        <div class="form-group">
          <label>Classification</label>
          <select name="controlledClass" class="form-control">
            <option value="Stupéfiant">Stupéfiant (Tableau I)</option>
            <option value="Psychotrope">Psychotrope (Tableau II)</option>
            <option value="Précurseur">Précurseur chimique</option>
          </select>
        </div>
        <div class="form-group"></div>
      </div>
      <div style="margin-top:16px; padding-top:16px; border-top:1px solid var(--border)">
        <h4 style="margin-bottom:12px; font-size:14px; display:flex; align-items:center; gap:8px"><i data-lucide="file-text"></i> Notice Médicale</h4>
        <div class="form-group">
          <label>Posologie recommandée</label>
          <textarea name="dosageInstructions" class="form-control" rows="2" placeholder="Ex: Adulte : 1 comprimé 3 fois par jour, pendant 5 jours"></textarea>
        </div>
        <div class="form-group">
          <label>Précautions d'emploi</label>
          <textarea name="precautions" class="form-control" rows="2" placeholder="Ex: Ne pas dépasser la dose prescrite. Prudence en cas d'insuffisance hépatique."></textarea>
        </div>
        <div class="form-group">
          <label>Contre-indications</label>
          <textarea name="contraindications" class="form-control" rows="2" placeholder="Ex: Allergie connue au paracétamol. Insuffisance hépatique sévère."></textarea>
        </div>
        <div class="form-group">
          <label>Effets indésirables</label>
          <textarea name="sideEffects" class="form-control" rows="2" placeholder="Ex: Rarement : réactions cutanées, troubles digestifs."></textarea>
        </div>
        <div class="form-group">
          <label>Notice complète / RCP</label>
          <textarea name="medicalNotice" class="form-control" rows="3" placeholder="Résumé des Caractéristiques du Produit (texte libre)"></textarea>
        </div>
      </div>
    </form>
  `, {
    footer: `
      <button class="btn btn-secondary" onclick="UI.closeModal()">Annuler</button>
      <button class="btn btn-primary" onclick="submitProduct()"><i data-lucide="check"></i> Enregistrer</button>
    `
  });
}

async function submitProduct() {
  const form = document.getElementById('product-form');
  if (!form?.checkValidity()) { form?.reportValidity(); return; }
  const data = Object.fromEntries(new FormData(form));
  data.requiresPrescription = data.requiresPrescription === '1';
  data.isControlled = data.isControlled === '1';
  data.controlledClass = data.isControlled ? (data.controlledClass || 'Stupéfiant') : null;
  data.salePrice = parseFloat(data.salePrice);
  data.purchasePrice = parseFloat(data.purchasePrice || 0);
  data.minStock = parseInt(data.minStock || 10);
  data.manufacturer = data.manufacturer || null;
  data.noticePdfUrl = data.noticePdfUrl || null;
  data.allowUnitSale = !!data.allowUnitSale;
  data.subUnitsPerBox = parseInt(data.subUnitsPerBox || 1);
  data.pricePerSubUnit = parseFloat(data.pricePerSubUnit || 0);
  data.unitsPerBox = parseInt(data.unitsPerBox || 1);
  data.pricePerUnit = parseFloat(data.pricePerUnit || 0);
  data.expiryDate = data.expiryDate || null;
  data.status = 'active';
  try {
    await DB.dbAdd('products', data);
    await DB.writeAudit('ADD_PRODUCT', 'products', null, data);
    UI.closeModal();
    UI.toast('Produit ajouté avec succès', 'success');
    Router.navigate('products');
  } catch (err) {
    UI.toast('Erreur : ' + (err.message.includes('unique') ? 'Ce code produit existe déjà' : err.message), 'error');
  }
}

async function editProductForm(id) {
  const p = await DB.dbGet('products', id);
  if (!p) { UI.toast('Produit introuvable', 'error'); return; }
  const categories = ['Antalgique', 'Antibiotique', 'Anti-inflammatoire', 'Antidiabétique', 'Antipaludique', 'Antihypertenseur', 'Antihistaminique', 'Gastroprotecteur', 'Hématologie', 'Réhydratation', 'Vitamine', 'Dermatologie', 'Ophtalmologie', 'Autre'];
  UI.modal('<i data-lucide="edit-3" class="modal-icon-inline"></i> Modifier le Produit', `
    <form id="edit-product-form" class="form-grid">
      <input type="hidden" name="id" value="${p.id}">
      <div class="form-row">
        <div class="form-group">
          <label>Code *</label>
          <input type="text" name="code" class="form-control" value="${p.code || ''}" required>
        </div>
        <div class="form-group">
          <label>DCI (Nom générique) *</label>
          <div style="display:flex;gap:8px">
            <input type="text" name="dci" class="form-control" value="${p.dci || ''}" required>
            <button type="button" class="btn btn-secondary btn-sm" onclick="simulerVidalCloud('edit-product-form')" style="white-space:nowrap"><i data-lucide="cloud-lightning"></i> Base Médicale</button>
          </div>
        </div>
      </div>
      <div class="form-row">
        <div class="form-group">
          <label>Nom commercial *</label>
          <input type="text" name="name" class="form-control" value="${p.name || ''}" required>
        </div>
        <div class="form-group">
          <label>Marque / Laboratoire</label>
          <div style="display:flex;gap:4px">
            <input type="text" name="brand" class="form-control" value="${p.brand || ''}">
            <select name="manufacturer" class="form-control" style="width:120px">
              <option value="">Labo (Dict)</option>
              <option ${p.manufacturer==='Sanofi'?'selected':''}>Sanofi</option><option ${p.manufacturer==='Pfizer'?'selected':''}>Pfizer</option><option ${p.manufacturer==='GSK'?'selected':''}>GSK</option><option ${p.manufacturer==='Bayer'?'selected':''}>Bayer</option><option ${p.manufacturer==='Novartis'?'selected':''}>Novartis</option><option ${p.manufacturer==='AstraZeneca'?'selected':''}>AstraZeneca</option><option ${p.manufacturer==='Pierre Fabre'?'selected':''}>Pierre Fabre</option><option ${p.manufacturer==='Biogaran'?'selected':''}>Biogaran</option>
            </select>
          </div>
        </div>
      </div>
      <div class="form-row">
        <div class="form-group">
          <label>Forme galénique</label>
          <input type="text" name="form" class="form-control" value="${p.form || ''}">
        </div>
        <div class="form-group">
          <label>Dosage</label>
          <input type="text" name="dosage" class="form-control" value="${p.dosage || ''}">
        </div>
      </div>
      <div class="form-row">
        <div class="form-group">
          <label>Catégorie *</label>
          <select name="category" class="form-control" required>
            ${categories.map(c => `<option value="${c}" ${p.category === c ? 'selected' : ''}>${c}</option>`).join('')}
          </select>
        </div>
        <div class="form-group">
          <label>Statut</label>
          <select name="requiresPrescription" class="form-control">
            <option value="0" ${!p.requiresPrescription ? 'selected' : ''}>OTC — Sans ordonnance</option>
            <option value="1" ${p.requiresPrescription ? 'selected' : ''}>Rx — Sur ordonnance</option>
          </select>
        </div>
      </div>
      <div class="form-row">
        <div class="form-group">
          <label>Prix de vente (GNF) *</label>
          <input type="number" name="salePrice" class="form-control" value="${p.salePrice || 0}" min="0" required>
        </div>
        <div class="form-group">
          <label>Prix d'achat (GNF)</label>
          <input type="number" name="purchasePrice" class="form-control" value="${p.purchasePrice || 0}" min="0">
        </div>
      </div>
      <div class="form-row">
        <div class="form-group">
          <label>Seuil minimum (boîtes)</label>
          <input type="number" name="minStock" class="form-control" value="${p.minStock || 10}" min="0">
        </div>
        <div class="form-group">
          <label>Type de produit</label>
          <input type="text" name="unit" class="form-control" value="${p.unit || 'boîte'}">
        </div>
      </div>
      <div style="margin-top:16px; padding-top:16px; border-top:1px solid var(--border)">
        <h4 style="margin-bottom:12px; font-size:14px; display:flex; align-items:center; gap:8px"><i data-lucide="package-open"></i> Déconditionnement (Vente à l'unité)</h4>
        <div class="form-group">
           <label style="display:flex; align-items:center; gap:8px">
             <input type="checkbox" name="allowUnitSale" id="allowUnitSaleCb_edit" value="1" ${p.allowUnitSale ? 'checked' : ''} onchange="document.getElementById('edit-unit-sale-group').style.display = this.checked ? 'block' : 'none'">
             <span>Autoriser la vente à l'unité (fractionner la boîte)</span>
           </label>
        </div>
        <div id="edit-unit-sale-group" style="display:${p.allowUnitSale ? 'block' : 'none'}; background:var(--surface-2); padding:10px; border-radius:6px; margin-top:8px">
          <div class="form-row">
            <div class="form-group">
              <label>Sous-unités par boîte (ex: 2 Plaquettes)</label>
              <input type="number" name="subUnitsPerBox" class="form-control" value="${p.subUnitsPerBox || 1}" min="1" oninput="calcUnitPrice('edit-product-form')">
            </div>
            <div class="form-group">
              <label>Prix de vente (Sous-unité / Plaquette)</label>
              <input type="number" name="pricePerSubUnit" class="form-control" value="${p.pricePerSubUnit || 0}" min="0">
            </div>
          </div>
          <div class="form-row">
            <div class="form-group">
              <label>Unités par sous-unité (ex: 10 Gélules / Plaquette)</label>
              <input type="number" name="unitsPerBox" class="form-control" value="${p.unitsPerBox || 1}" min="1" oninput="calcUnitPrice('edit-product-form')">
            </div>
            <div class="form-group">
              <label>Prix de vente unitaire (Gélule)</label>
              <input type="number" name="pricePerUnit" class="form-control" value="${p.pricePerUnit || 0}" min="0">
            </div>
          </div>
        </div>
      </div>
      <div class="form-row">
        <div class="form-group">
          <label>Date de Péremption</label>
          <input type="date" name="expiryDate" class="form-control" value="${p.expiryDate || ''}">
        </div>
        <div class="form-group">
          <label>Statut produit</label>
          <select name="status" class="form-control">
            <option value="active" ${p.status === 'active' ? 'selected' : ''}>Actif</option>
            <option value="inactive" ${p.status === 'inactive' ? 'selected' : ''}>Inactif — Retiré du catalogue</option>
          </select>
        </div>
      </div>
      <div class="form-row">
        <div class="form-group">
          <label>Substance Contrôlée</label>
          <select name="isControlled" class="form-control" onchange="document.getElementById('edit-controlled-class-group').style.display = this.value === '1' ? 'block' : 'none'">
            <option value="0" ${!p.isControlled ? 'selected' : ''}>Non</option>
            <option value="1" ${p.isControlled ? 'selected' : ''}>Oui — Substance réglementée</option>
          </select>
        </div>
        <div class="form-group" id="edit-controlled-class-group" style="display:${p.isControlled ? 'block' : 'none'}">
          <label>Classification</label>
          <select name="controlledClass" class="form-control">
            <option value="Stupéfiant" ${p.controlledClass === 'Stupéfiant' ? 'selected' : ''}>Stupéfiant (Tableau I)</option>
            <option value="Psychotrope" ${p.controlledClass === 'Psychotrope' ? 'selected' : ''}>Psychotrope (Tableau II)</option>
            <option value="Précurseur" ${p.controlledClass === 'Précurseur' ? 'selected' : ''}>Précurseur chimique</option>
          </select>
        </div>
      </div>
      <div style="margin-top:16px; padding-top:16px; border-top:1px solid var(--border)">
        <h4 style="margin-bottom:12px; font-size:14px; display:flex; align-items:center; gap:8px"><i data-lucide="file-text"></i> Notice Médicale</h4>
        <div class="form-group">
          <label>Posologie recommandée</label>
          <textarea name="dosageInstructions" class="form-control" rows="2">${p.dosageInstructions || ''}</textarea>
        </div>
        <div class="form-group">
          <label>Précautions d'emploi</label>
          <textarea name="precautions" class="form-control" rows="2">${p.precautions || ''}</textarea>
        </div>
        <div class="form-group">
          <label>Contre-indications</label>
          <textarea name="contraindications" class="form-control" rows="2">${p.contraindications || ''}</textarea>
        </div>
        <div class="form-group">
          <label>Effets indésirables</label>
          <textarea name="sideEffects" class="form-control" rows="2">${p.sideEffects || ''}</textarea>
        </div>
        <div class="form-group">
          <label>Notice complète / RCP</label>
          <textarea name="medicalNotice" class="form-control" rows="3">${p.medicalNotice || ''}</textarea>
        </div>
      </div>
    </form>
  `, {
    footer: `
      <button class="btn btn-secondary" onclick="UI.closeModal()">Annuler</button>
      <button class="btn btn-primary" onclick="updateProduct(${p.id})"><i data-lucide="save"></i> Enregistrer les modifications</button>
    `
  });
}

async function updateProduct(id) {
  const form = document.getElementById('edit-product-form');
  if (!form?.checkValidity()) { form?.reportValidity(); return; }
  const data = Object.fromEntries(new FormData(form));
  const original = await DB.dbGet('products', id);
  if (!original) return;
  const updated = {
    ...original,
    code: data.code,
    name: data.name,
    dci: data.dci,
    brand: data.brand,
    form: data.form,
    dosage: data.dosage,
    category: data.category,
    requiresPrescription: data.requiresPrescription === '1',
    isControlled: data.isControlled === '1',
    controlledClass: data.isControlled === '1' ? (data.controlledClass || 'Stupéfiant') : null,
    salePrice: parseFloat(data.salePrice),
    purchasePrice: parseFloat(data.purchasePrice || 0),
    minStock: parseInt(data.minStock || 10),
    allowUnitSale: !!data.allowUnitSale,
    subUnitsPerBox: parseInt(data.subUnitsPerBox || 1),
    pricePerSubUnit: parseFloat(data.pricePerSubUnit || 0),
    unitsPerBox: parseInt(data.unitsPerBox || 1),
    pricePerUnit: parseFloat(data.pricePerUnit || 0),
    unit: data.unit || 'boîte',
    status: data.status || 'active',
    expiryDate: data.expiryDate || null,
    dosageInstructions: data.dosageInstructions || null,
    precautions: data.precautions || null,
    contraindications: data.contraindications || null,
    sideEffects: data.sideEffects || null,
    medicalNotice: data.medicalNotice || null,
    manufacturer: data.manufacturer || null,
    noticePdfUrl: data.noticePdfUrl || original.noticePdfUrl || null
  };
  try {
    await DB.dbPut('products', updated);
    await DB.writeAudit('EDIT_PRODUCT', 'products', id, { name: updated.name, changes: data });
    UI.closeModal();
    UI.toast('Produit modifié avec succès', 'success');
    Router.navigate('products');
  } catch (err) {
    UI.toast('Erreur : ' + err.message, 'error');
  }
}

async function deleteProduct(id) {
  const p = await DB.dbGet('products', id);
  if (!p) return;
  const ok = await UI.confirm(`Êtes-vous sûr de vouloir désactiver "${p.name}" ?\n\nLe produit ne sera plus visible dans le catalogue ni au point de vente.`);
  if (!ok) return;
  await DB.dbPut('products', { ...p, status: 'inactive' });
  await DB.writeAudit('DEACTIVATE_PRODUCT', 'products', id, { name: p.name });
  UI.toast('Produit désactivé', 'success');
  Router.navigate('products');
}

function exportProducts() {
  const data = window._productsData || [];
  const csv = '\uFEFFCode,Nom,DCI,Marque,Categorie,Prix Vente,Prix Achat,Rx\n' +
    data.map(p => [p.code, '"' + (p.name || '').replace(/"/g, '""') + '"', p.dci || '', p.brand || '', p.category, p.salePrice, p.purchasePrice || 0, p.requiresPrescription ? 'Oui' : 'Non'].join(',')).join('\n');
  const blob = new Blob([csv], { type: 'text/csv' });
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob);
  a.download = 'produits_pharma_' + new Date().toISOString().split('T')[0] + '.csv';
  a.click();
  UI.toast('Export CSV téléchargé', 'success');
}

window.filterProducts = filterProducts;
window.viewProduct = viewProduct;
window.showAddProduct = showAddProduct;
window.submitProduct = submitProduct;
window.editProductForm = editProductForm;
window.updateProduct = updateProduct;
window.deleteProduct = deleteProduct;
window.exportProducts = exportProducts;

/* ── Bulk Import Logic ── */

function showImportModal() {
  UI.modal('<i data-lucide="upload" class="modal-icon-inline"></i> Importation de Produits (CSV)', `
    <div class="import-container">
      <p class="mb-1 text-sm">Importez votre catalogue existant depuis un fichier CSV (Excel). Les colonnes attendues sont : <strong>Code, Nom, DCI, Marque, Categorie, Prix Vente, Prix Achat, Rx</strong>.</p>
      
      <div id="import-drop-zone" class="import-drop-zone">
        <i data-lucide="file-up"></i>
        <div>
          <strong>Cliquez pour choisir un fichier</strong> ou glissez-le ici
          <p class="text-sm text-muted mt-0-5">Format CSV (.csv) uniquement</p>
        </div>
        <input type="file" id="import-file-input" accept=".csv" hidden>
      </div>

      <div id="import-progress" class="import-progress-container">
        <div class="import-progress-bar"><div id="import-progress-fill" class="import-progress-fill"></div></div>
        <div id="import-status" class="import-status-text">Préparation...</div>
      </div>

      <div id="import-results" class="import-results"></div>

      <a href="#" class="import-template-link" onclick="downloadImportTemplate(event)">
        <i data-lucide="download" style="width:12px;height:12px"></i> Télécharger un modèle de fichier
      </a>
    </div>
  `, {
    footer: `<button class="btn btn-secondary" onclick="UI.closeModal()">Fermer</button>`
  });

  const zone = document.getElementById('import-drop-zone');
  const input = document.getElementById('import-file-input');

  if (zone && input) {
    zone.onclick = () => input.click();
    input.onchange = (e) => handleImportFile(e.target.files[0]);

    zone.ondragover = (e) => { e.preventDefault(); zone.classList.add('dragover'); };
    zone.ondragleave = () => zone.classList.remove('dragover');
    zone.ondrop = (e) => {
      e.preventDefault();
      zone.classList.remove('dragover');
      if (e.dataTransfer.files.length) handleImportFile(e.dataTransfer.files[0]);
    };
  }
  if (window.lucide) lucide.createIcons();
}

async function handleImportFile(file) {
  if (!file) return;
  if (!file.name.endsWith('.csv')) {
    UI.toast('Veuillez sélectionner un fichier CSV', 'error');
    return;
  }

  const zone = document.getElementById('import-drop-zone');
  const progress = document.getElementById('import-progress');
  const results = document.getElementById('import-results');

  if (zone) zone.style.display = 'none';
  if (progress) progress.style.display = 'block';
  if (results) results.style.display = 'none';

  const reader = new FileReader();
  reader.onload = async (e) => {
    const text = e.target.result;
    await processImportCSV(text);
  };
  reader.onerror = () => UI.toast('Erreur de lecture du fichier', 'error');
  reader.readAsText(file, 'UTF-8');
}

async function processImportCSV(content) {
  const status = document.getElementById('import-status');
  const fill = document.getElementById('import-progress-fill');
  const results = document.getElementById('import-results');

  const lines = content.split(/\r?\n/).filter(line => line.trim() !== '');
  if (lines.length <= 1) {
    showImportError('Le fichier est vide ou ne contient que l\'en-tête.');
    return;
  }

  // Detect separator
  const header = lines[0];
  const sep = header.includes(';') ? ';' : ',';
  const columns = header.split(sep).map(c => c.replace(/"/g, '').trim().toLowerCase());

  // Required columns check (relaxed names)
  const map = {
    code: columns.findIndex(c => c.includes('code')),
    name: columns.findIndex(c => c.includes('nom') || c.includes('name')),
    dci: columns.findIndex(c => c.includes('dci')),
    salePrice: columns.findIndex(c => c.includes('vente') || c.includes('sale')),
  };

  if (map.code === -1 || map.name === -1 || map.salePrice === -1) {
    showImportError('Colonnes obligatoires manquantes (Code, Nom, Prix Vente).');
    return;
  }

  // Optional columns
  map.brand = columns.findIndex(c => c.includes('marque') || c.includes('brand'));
  map.category = columns.findIndex(c => c.includes('cat'));
  map.purchasePrice = columns.findIndex(c => c.includes('achat') || c.includes('purchase'));
  map.rx = columns.findIndex(c => c.includes('rx') || c.includes('ord'));

  let imported = 0;
  let errors = 0;
  const total = lines.length - 1;

  // 1. Charger tous les produits existants d'un coup (Évite 50,000 requêtes unitaires)
  const allExistingProducts = await DB.dbGetAll('products');
  const codeMap = new Map();
  allExistingProducts.forEach(p => codeMap.set(p.code.toLowerCase(), p));

  // 2. Traitement par lot (Batching) pour ne pas geler le navigateur
  const BATCH_SIZE = 500;
  
  for (let i = 1; i < lines.length; i += BATCH_SIZE) {
    const batch = lines.slice(i, i + BATCH_SIZE);
    const dbOperations = [];

    for (const line of batch) {
      try {
        const row = line.split(sep).map(v => v.replace(/"/g, '').trim());
        if (row.length < columns.length) continue;

        const product = {
          code: row[map.code],
          name: row[map.name],
          dci: map.dci !== -1 ? row[map.dci] : '',
          brand: map.brand !== -1 ? row[map.brand] : '',
          category: map.category !== -1 ? row[map.category] : 'Autre',
          salePrice: parseFloat(row[map.salePrice].replace(/[^\d.]/g, '')) || 0,
          purchasePrice: map.purchasePrice !== -1 ? parseFloat(row[map.purchasePrice].replace(/[^\d.]/g, '')) || 0 : 0,
          requiresPrescription: map.rx !== -1 ? (row[map.rx].toLowerCase().includes('oui') || row[map.rx] === '1') : false,
          minStock: 10,
          status: 'active',
          unit: 'boîte'
        };

        if (!product.code || !product.name) {
          errors++;
          continue;
        }

        // Vérification ultra rapide depuis la Map
        const existing = codeMap.get(product.code.toLowerCase());
        
        if (existing) {
          dbOperations.push(DB.dbPut('products', { ...existing, ...product }));
        } else {
          dbOperations.push(DB.dbAdd('products', product));
          // Ajouter au codeMap en cas de doublons dans le même fichier
          codeMap.set(product.code.toLowerCase(), product);
        }

        imported++;
      } catch (err) {
        console.warn('Import row error:', err);
        errors++;
      }
    }

    // Exécuter le lot en parallèle
    await Promise.all(dbOperations);

    // Mettre à jour l'UI asynchronement et laisser respirer le navigateur (évite le freeze)
    const currentProgress = Math.min(i + BATCH_SIZE - 1, total);
    const pct = Math.round((currentProgress / total) * 100);
    if (fill) fill.style.width = pct + '%';
    if (status) status.textContent = `Importation : ${currentProgress} / ${total}...`;

    // Pause de 10ms pour permettre au navigateur de rendre la barre de progression
    await new Promise(r => setTimeout(r, 10));
  }

  // Final Results
  if (status) status.textContent = 'Importation terminée.';
  if (results) {
    results.style.display = 'block';
    results.className = `import-results ${imported > 0 ? 'success' : 'error'}`;
    results.innerHTML = `<strong>Résultat :</strong> ${imported} produits importés avec succès. ${errors > 0 ? `<br><small>${errors} lignes ignorées ou en erreur.</small>` : ''}`;
  }

  await DB.writeAudit('BULK_IMPORT', 'products', null, { imported, errors });
  setTimeout(() => renderProducts(document.getElementById('app-content')), 1500);
}

function showImportError(msg) {
  const status = document.getElementById('import-status');
  const results = document.getElementById('import-results');
  if (status) status.textContent = 'Échec de l\'importation.';
  if (results) {
    results.style.display = 'block';
    results.className = 'import-results error';
    results.innerHTML = `<strong>Erreur :</strong> ${msg}`;
  }
}

function downloadImportTemplate(e) {
  e.preventDefault();
  const csv = '\uFEFFCode,Nom,DCI,Marque,Categorie,Prix Vente,Prix Achat,Rx\nP001,Paracetamole 500mg,Paracétamol,Doliprane,Antalgique,5000,3500,Non\nP002,Amoxicilline 1g,Amoxicilline,Clamoxyl,Antibiotique,12000,8500,Oui';
  const blob = new Blob([csv], { type: 'text/csv' });
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob);
  a.download = 'modele_import_pharma.csv';
  a.click();
}

function calcUnitPrice(formId) {
  const form = document.getElementById(formId);
  if (!form) return;
  const salePrice = parseFloat(form.salePrice.value) || 0;
  const subUnitsPerBox = parseInt(form.subUnitsPerBox.value) || 1;
  const unitsPerBox = parseInt(form.unitsPerBox.value) || 1;
  
  const allowUnitSaleCb = form.querySelector('[name="allowUnitSale"]');
  if (allowUnitSaleCb && allowUnitSaleCb.checked) {
     if (subUnitsPerBox > 1) {
        form.pricePerSubUnit.value = Math.ceil(salePrice / subUnitsPerBox);
     } else {
        form.pricePerSubUnit.value = salePrice;
     }
     
     if (unitsPerBox > 1) {
        // Price per unit is computed from the subunit price
        const currentSubUnitPrice = Math.ceil(salePrice / subUnitsPerBox);
        form.pricePerUnit.value = Math.ceil(currentSubUnitPrice / unitsPerBox);
     }
  }
}

window.showImportModal = showImportModal;
window.downloadImportTemplate = downloadImportTemplate;
window.calcUnitPrice = calcUnitPrice;

function handlePdfUpload(e, formId) {
  const file = e.target.files[0];
  if (!file) return;
  if(file.size > 2 * 1024 * 1024) { UI.toast("Le PDF est trop volumineux (Max 2Mo)", "error"); return; }
  const reader = new FileReader();
  reader.onload = (evt) => {
     const b64Input = document.getElementById(formId + '-pdf-b64');
     const nameSpan = document.getElementById(formId + '-pdf-name');
     if(b64Input) b64Input.value = evt.target.result;
     if(nameSpan) nameSpan.textContent = "📄 " + file.name;
     UI.toast("Fichier compressé et rattaché avec succès.", "success");
  };
  reader.readAsDataURL(file);
}

function simulerVidalCloud(formId) {
  const form = document.getElementById(formId);
  if (!form) return;
  const dciStr = form.dci.value.trim().toLowerCase();
  if(!dciStr) { UI.toast("Veuillez saisir une DCI ou appuyer sur la touche Entrée d'abord.", "warning"); return; }
  
  UI.toast("Connexion à la Base Claude Bernard...", "info");
  const btn = document.querySelector(`#${formId} button[onclick="simulerVidalCloud('${formId}')"]`);
  if(btn) { btn.disabled = true; btn.innerHTML = '<i data-lucide="loader" class="spin"></i> Sync...'; if(window.lucide)lucide.createIcons(); }
  
  setTimeout(() => {
     if(btn) { btn.disabled = false; btn.innerHTML = '<i data-lucide="cloud-lightning"></i> Base Médicale'; if(window.lucide)lucide.createIcons(); }
     let data = null;
     if (dciStr.includes('parac') || dciStr.includes('paracetamol')) {
         data = { brand: form.brand.value || 'Doliprane', category: 'Antalgique', dosageInstructions: 'Adultes : 500mg à 1g par prise, espacées de 4h à 6h (Max 4g/j).\nEnfant : 15mg/kg toutes les 6 heures.', precautions: 'Prudence en cas de pathologie hépatique sévère ou de malnutrition chronique. Éviter la consommation d\'alcool.', contraindications: 'Hypersensibilité au paracétamol. Insuffisance hépatique sévère.', sideEffects: 'Rares : éruptions cutanées, thrombopénie.' };
     } else if (dciStr.includes('amoxi')) {
         data = { brand: form.brand.value || 'Clamoxyl', category: 'Antibiotique', dosageInstructions: 'Adultes: 1g à 2g/jour en 2 ou 3 prises.\nEnfant: 50mg/kg/jour en 3 prises.', precautions: 'Prudence en cas d\'insuffisance rénale (ajustement).', contraindications: 'Allergie aux pénicillines ou céphalosporines.', sideEffects: 'Fréquents : Nausées, diarrhées, éruptions cutanées maculopapuleuses, candidose.' };
     } else if (dciStr.includes('ibupro')) {
         data = { brand: form.brand.value || 'Advil', category: 'Anti-inflammatoire', dosageInstructions: 'Adultes: 200 à 400mg par prise. Max 1200mg/j. Au cours des repas.', precautions: 'Éviter chez la femme enceinte au 3e trimestre. Risque gastro-intestinal.', contraindications: 'Ulcère gastro-duodénal évolutif, insuffisance rénale sévère.', sideEffects: 'Nausées, gastralgies, vertiges, éruptions.' };
     } else if (dciStr.includes('chlor')) {
         data = { category: 'Antipaludique', dosageInstructions: 'Adultes : Traitement curatif de 3 jours, dose totale 25mg/kg base.', precautions: 'Surveillance ophtalmologique si traitement prolongé.', contraindications: 'Rétinopathie, hypersensibilité connue.', sideEffects: 'Troubles digestifs, prurit, troubles de l\'accommodation.' };
     } else {
         UI.toast("DCI introuvable dans le référentiel Vidal de démonstration locale.", "warning");
         return;
     }
     
     if(data) {
        if(data.brand && !form.brand.value) form.brand.value = data.brand;
        if(form.category && data.category) form.category.value = data.category;
        if(form.dosageInstructions) form.dosageInstructions.value = data.dosageInstructions;
        if(form.precautions) form.precautions.value = data.precautions;
        if(form.contraindications) form.contraindications.value = data.contraindications;
        if(form.sideEffects) form.sideEffects.value = data.sideEffects;
        UI.toast("✅ RCP (Résumé des Caractéristiques) complété auto.", "success");
     }
  }, 1200);
}

window.handlePdfUpload = handlePdfUpload;
window.simulerVidalCloud = simulerVidalCloud;

Router.register('products', renderProducts);
