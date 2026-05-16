/**
 * OrdiveX — Module Impressions & Documents
 * Tickets, factures, PV destruction, rapports officiels DNPM
 */

const PrintEngine = {
  pharmacyInfo: {
    name: 'Pharmacie Centrale de Conakry',
    address: 'Avenue de la République, Conakry, Guinée',
    phone: '+224 620 000 000',
    email: 'contact@pharmacie.gn',
    dnpm: 'LIC-DNPM-2024-001',
    responsable: 'Dr. Kouyaté Ahmed',
  },

  async loadSettings() {
    try {
      const settings = await DB.dbGetAll('settings');
      const get = (key) => settings.find(s => s.key === key)?.value;
      this.pharmacyInfo.name = get('pharmacy_name') || this.pharmacyInfo.name;
      this.pharmacyInfo.address = get('pharmacy_address') || this.pharmacyInfo.address;
      this.pharmacyInfo.phone = get('pharmacy_phone') || this.pharmacyInfo.phone;
      this.pharmacyInfo.email = get('pharmacy_email') || this.pharmacyInfo.email;
      this.pharmacyInfo.dnpm = get('pharmacy_dnpm') || this.pharmacyInfo.dnpm;
      this.pharmacyInfo.responsable = get('pharmacy_resp') || this.pharmacyInfo.responsable;
    } catch (e) { }
  },

  header(title = '') {
    const info = this.pharmacyInfo;
    return `
      <div class="print-header">
        <div class="print-logo">💊</div>
        <div class="print-org">
          <h1>${info.name}</h1>
          <p>${info.address}</p>
          <p>Tél: ${info.phone} ${info.email ? '· ' + info.email : ''}</p>
          <p>Licence DNPM: ${info.dnpm}</p>
        </div>
        <div class="print-doc-ref">
          <div class="print-doc-type">${title}</div>
          <div class="print-date">${new Date().toLocaleDateString('fr-FR', { day: '2-digit', month: 'long', year: 'numeric' })}</div>
        </div>
      </div>
      <div class="print-divider"></div>`;
  },

  footer() {
    const info = this.pharmacyInfo;
    return `
      <div class="print-footer">
        <div class="print-footer-left">
          <div class="print-sig-block">
            <p>Cachet et signature du pharmacien responsable</p>
            <div class="sig-line"></div>
            <p>${info.responsable}</p>
          </div>
        </div>
        <div class="print-footer-center">
          <p class="print-legal">Document généré par OrdiveX v9.4.3</p>
          <p class="print-legal">Imprimé le ${new Date().toLocaleDateString('fr-FR')} à ${new Date().toLocaleTimeString('fr-FR')}</p>
        </div>
        <div class="print-footer-right">
          <div class="print-sig-block">
            <p>Visa DNPM</p>
            <div class="sig-line"></div>
            <p>Inspection pharmaceutique</p>
          </div>
        </div>
      </div>`;
  },

  async printSaleReceipt(saleId) {
    await this.loadSettings();
    const [sale, items, allSettings] = await Promise.all([
      DB.dbGet('sales', saleId),
      DB.dbGetAll('saleItems', 'saleId', saleId),
      DB.dbGetAll('settings'),
    ]);
    if (!sale) return;

    const get = (key) => allSettings.find(s => s.key === key)?.value || '';
    const pName = get('pharmacy_name') || this.pharmacyInfo.name;
    const pAddr = get('pharmacy_address') || this.pharmacyInfo.address;
    const pPhone = get('pharmacy_phone') || this.pharmacyInfo.phone;
    const pDnpm = get('pharmacy_dnpm') || this.pharmacyInfo.dnpm;
    const pResp = get('pharmacy_resp') || this.pharmacyInfo.responsable;
    const payLabels = { cash: 'Especes', orange_money: 'Orange Money', mtn_momo: 'MTN MoMo', credit: 'Credit', transfer: 'Virement', assurance: 'Assurance', combined: 'Paiement Mixte' };
    const subtotal = items.reduce((a, i) => a + (i.total || 0), 0);
    const discount = sale.discount || 0;
    const total = sale.total || subtotal - discount;
    const saleDate = sale.date ? new Date(sale.date) : new Date();

    const win = this._openPrintWindow('Ticket de Caisse');
    win.document.write(`
      ${this._printStyles()}
      <div class="ticket-container">
        <h2 class="ticket-name">${pName}</h2>
        <p class="ticket-addr">${pAddr}</p>
        <p class="ticket-phone">${pPhone}</p>
        ${pDnpm ? '<p class="ticket-phone">DNPM: ' + pDnpm + '</p>' : ''}
        <div class="ticket-divider">================================</div>
        <div class="ticket-meta">
          <div class="ticket-row"><span>N Vente</span><span>#${String(saleId).padStart(6, '0')}</span></div>
          <div class="ticket-row"><span>Date</span><span>${saleDate.toLocaleDateString('fr-FR')} ${saleDate.toLocaleTimeString('fr-FR', {hour:'2-digit',minute:'2-digit'})}</span></div>
          <div class="ticket-row"><span>Vendeur</span><span>${sale.sellerName || DB.AppState.currentUser?.name || '---'}</span></div>
          ${sale.preparerName && sale.preparerName !== sale.sellerName ? '<div class="ticket-row"><span>Preparateur</span><span>' + sale.preparerName + '</span></div>' : ''}
          ${sale.patientName && sale.patientName !== 'Client comptoir' ? '<div class="ticket-row"><span>Patient</span><span>' + sale.patientName + '</span></div>' : ''}
          ${sale.patientPhone ? '<div class="ticket-row"><span>Tel Patient</span><span>' + sale.patientPhone + '</span></div>' : ''}
          ${sale.prescriptionRef ? '<div class="ticket-row"><span>Ordonnance</span><span>' + sale.prescriptionRef + '</span></div>' : ''}
          ${sale.doctorName ? '<div class="ticket-row"><span>Medecin</span><span>Dr. ' + sale.doctorName + '</span></div>' : ''}
        </div>
        ${sale.paymentMethod === 'assurance' && sale.insuranceDetails ? `
        <div class="ticket-divider">--------ASSURANCE---------</div>
        <div class="ticket-row"><span>Organisme</span><span>${sale.insuranceDetails.name || sale.assuranceName || '---'}</span></div>
        <div class="ticket-row"><span>N Prise en ch.</span><span>${sale.insuranceDetails.ref || sale.assuranceRef || '---'}</span></div>
        <div class="ticket-row"><span>Part Entreprise</span><span>${UI.formatCurrency(sale.insuranceDetails.amount || 0)}</span></div>
        <div class="ticket-row"><span>Part Patient</span><span>${UI.formatCurrency(total - (sale.insuranceDetails.amount || 0))}</span></div>
        ` : ''}
        <div class="ticket-divider">================================</div>
        <table class="ticket-items">
          ${items.map(i => `
            <tr>
              <td class="item-name">${i.productName}${i.dci ? '<br><span style="font-size:9px;color:#777">' + [i.dci, i.dosage].filter(Boolean).join(' ') + '</span>' : ''}</td>
              <td class="item-qty">${i.quantity}x</td>
              <td class="item-price">${UI.formatCurrency(i.unitPrice)}</td>
              <td class="item-total">${UI.formatCurrency(i.total)}</td>
            </tr>`).join('')}
        </table>
        <div class="ticket-divider">================================</div>
        <div class="ticket-row"><span>Sous-total</span><span>${UI.formatCurrency(subtotal)}</span></div>
        ${discount > 0 ? '<div class="ticket-row"><span>Remise</span><span>-' + UI.formatCurrency(discount) + '</span></div>' : ''}
        <div class="ticket-total"><span>TOTAL</span><span>${UI.formatCurrency(total)}</span></div>
        <div class="ticket-row"><span>Paiement</span><span>${payLabels[sale.paymentMethod] || sale.paymentMethod}</span></div>
        ${sale.paymentMethod === 'cash' && sale.cashReceived ? '<div class="ticket-row"><span>Recu</span><span>' + UI.formatCurrency(sale.cashReceived) + '</span></div><div class="ticket-row"><span>Monnaie</span><span>' + UI.formatCurrency(sale.cashReceived - total) + '</span></div>' : ''}
        ${sale.paymentMethod === 'combined' && sale.paymentDetails ? '<div class="ticket-row"><span>' + (sale.paymentDetails.method1 || 'Mode 1') + '</span><span>' + UI.formatCurrency(sale.paymentDetails.amount1 || 0) + '</span></div><div class="ticket-row"><span>' + (sale.paymentDetails.method2 || 'Mode 2') + '</span><span>' + UI.formatCurrency(sale.paymentDetails.amount2 || 0) + '</span></div>' : ''}
        ${sale.paymentMethod === 'credit' && sale.creditDueDate ? '<div class="ticket-row" style="color:#c00"><span>Echeance</span><span>' + UI.formatDate(sale.creditDueDate) + '</span></div>' : ''}
        <div class="ticket-divider">================================</div>
        <p class="ticket-thanks">Merci pour votre confiance</p>
        <p class="ticket-advice">Respectez les prescriptions medicales</p>
        <p class="ticket-legal">${pResp} - Pharmacien responsable</p>
        <p class="ticket-legal">OrdiveX v9.4.3 - ${saleDate.toLocaleDateString('fr-FR')}</p>
      </div>
    `);
    win.document.close();
    win.onload = () => win.print();
  },

  async printInvoice(saleId) {
    await this.loadSettings();
    const [sale, items, allSettings] = await Promise.all([
      DB.dbGet('sales', saleId),
      DB.dbGetAll('saleItems', 'saleId', saleId),
      DB.dbGetAll('settings'),
    ]);
    if (!sale) return;

    const get = (key) => allSettings.find(s => s.key === key)?.value || '';
    const pharmacyLogo = get('pharmacy_logo');
    const pName = get('pharmacy_name') || this.pharmacyInfo.name;
    const pAddr = get('pharmacy_address') || this.pharmacyInfo.address;
    const pPhone = get('pharmacy_phone') || this.pharmacyInfo.phone;
    const pEmail = get('pharmacy_email') || this.pharmacyInfo.email;
    const pDnpm = get('pharmacy_dnpm') || this.pharmacyInfo.dnpm;
    const pResp = get('pharmacy_resp') || this.pharmacyInfo.responsable;

    const payLabels = { cash: 'Espèces', orange_money: 'Orange Money', mtn_momo: 'MTN MoMo', credit: 'Crédit', transfer: 'Virement', assurance: 'Assurance', combined: 'Paiement Mixte' };
    const subtotal = items.reduce((a, i) => a + (i.total || 0), 0);
    const discount = sale.discount || 0;
    const total = sale.total || subtotal - discount;
    const saleDate = sale.date ? new Date(sale.date) : new Date();
    const invoiceRef = 'FAC-' + String(saleId).padStart(8, '0');

    const win = this._openPrintWindow('Facture ' + invoiceRef);
    win.document.write(`
      <style>
        * { margin:0; padding:0; box-sizing:border-box; }
        body { font-family: 'Segoe UI', Arial, sans-serif; font-size: 12px; color: #222; background: white; }
        .inv { max-width:210mm; margin:0 auto; padding:24px 28px; }
        .inv-hdr { display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:18px; }
        .inv-brand { display:flex; align-items:center; gap:14px; }
        .inv-logo { width:56px; height:56px; border-radius:12px; object-fit:contain; }
        .inv-lp { width:56px; height:56px; border-radius:12px; background:linear-gradient(135deg,#1B4F72,#2E86C1); display:flex; align-items:center; justify-content:center; color:#fff; font-size:26px; font-weight:800; }
        .inv-pn { font-size:20px; font-weight:800; color:#1B4F72; margin-bottom:2px; }
        .inv-pi { font-size:10px; color:#666; line-height:1.5; }
        .inv-rb { text-align:right; }
        .inv-rt { font-size:22px; font-weight:800; color:#1B4F72; letter-spacing:2px; }
        .inv-rn { font-size:13px; font-weight:700; color:#2E86C1; margin-top:4px; }
        .inv-rd { font-size:11px; color:#888; margin-top:2px; }
        .inv-sep { height:3px; background:linear-gradient(to right,#1B4F72,#2E86C1,transparent); margin:16px 0; border-radius:2px; }
        .inv-parties { display:flex; gap:20px; margin-bottom:20px; }
        .inv-pbox { flex:1; background:#f8f9fa; border:1px solid #e9ecef; border-radius:8px; padding:14px 16px; }
        .inv-plbl { font-size:9px; text-transform:uppercase; letter-spacing:1.5px; color:#2E86C1; font-weight:700; margin-bottom:8px; }
        .inv-pnm { font-size:14px; font-weight:700; color:#1B4F72; }
        .inv-pd { font-size:11px; color:#555; margin-top:2px; }
        .inv-tbl { width:100%; border-collapse:collapse; margin-bottom:16px; }
        .inv-tbl thead th { background:#1B4F72; color:#fff; padding:10px 12px; font-size:11px; text-transform:uppercase; letter-spacing:.5px; font-weight:700; }
        .inv-tbl thead th:first-child { border-radius:6px 0 0 0; }
        .inv-tbl thead th:last-child { border-radius:0 6px 0 0; text-align:right; }
        .inv-tbl tbody td { padding:10px 12px; border-bottom:1px solid #eee; font-size:11px; vertical-align:top; }
        .inv-tbl tbody tr:nth-child(even) { background:#f8f9fa; }
        .inv-im { font-weight:700; color:#222; }
        .inv-is { font-size:10px; color:#777; margin-top:1px; }
        .inv-ar { text-align:right; }
        .inv-ac { text-align:center; }
        .inv-tots { display:flex; justify-content:flex-end; margin-bottom:20px; }
        .inv-tb { width:260px; }
        .inv-tr { display:flex; justify-content:space-between; padding:6px 12px; font-size:12px; }
        .inv-tr.disc { color:#e74c3c; }
        .inv-tr.gt { background:#1B4F72; color:#fff; font-size:15px; font-weight:800; border-radius:6px; padding:10px 14px; margin-top:4px; }
        .inv-pb { display:inline-block; background:#e8f4fd; color:#1B4F72; padding:4px 14px; border-radius:20px; font-size:11px; font-weight:700; margin-bottom:16px; }
        .inv-ft { display:flex; justify-content:space-between; align-items:flex-end; margin-top:40px; padding-top:16px; border-top:1px solid #ddd; }
        .inv-sig { text-align:center; }
        .inv-sl { width:150px; border-bottom:1px solid #333; margin:30px auto 6px; }
        .inv-sn { font-size:11px; font-weight:700; }
        .inv-sr { font-size:10px; color:#888; }
        .inv-lg { text-align:center; font-size:9px; color:#aaa; margin-top:16px; padding-top:8px; border-top:1px dashed #ddd; }
        @media print { .inv { padding:0; } }
      </style>
      <div class="inv">
        <div class="inv-hdr">
          <div class="inv-brand">
            ${pharmacyLogo
              ? '<img src="' + pharmacyLogo + '" class="inv-logo" alt="Logo"/>'
              : '<div class="inv-lp">' + pName.charAt(0) + '</div>'}
            <div>
              <div class="inv-pn">${pName}</div>
              <div class="inv-pi">${pAddr}<br>Tél: ${pPhone}${pEmail ? ' · ' + pEmail : ''}<br>${pDnpm ? 'Licence DNPM: ' + pDnpm : ''}</div>
            </div>
          </div>
          <div class="inv-rb">
            <div class="inv-rt">FACTURE</div>
            <div class="inv-rn">${invoiceRef}</div>
            <div class="inv-rd">${saleDate.toLocaleDateString('fr-FR', { day:'2-digit', month:'long', year:'numeric' })}</div>
            <div class="inv-rd">${saleDate.toLocaleTimeString('fr-FR', { hour:'2-digit', minute:'2-digit' })}</div>
          </div>
        </div>
        <div class="inv-sep"></div>
        <div class="inv-parties">
          <div class="inv-pbox">
            <div class="inv-plbl">Patient / Client</div>
            <div class="inv-pnm">${sale.patientName || 'Client comptoir'}</div>
            ${sale.patientPhone ? '<div class="inv-pd">Tél: ' + sale.patientPhone + '</div>' : ''}
            ${sale.patientId ? '<div class="inv-pd">ID: P-' + String(sale.patientId).padStart(4, '0') + '</div>' : ''}
          </div>
          <div class="inv-pbox">
            <div class="inv-plbl">Vendeur / Dispensation</div>
            <div class="inv-pnm">${sale.sellerName || DB.AppState.currentUser?.name || '—'}</div>
            ${sale.preparerName ? '<div class="inv-pd">Préparateur: ' + sale.preparerName + '</div>' : ''}
            ${sale.prescriptionRef ? '<div class="inv-pd">Ordonnance: ' + sale.prescriptionRef + '</div>' : ''}
            ${sale.doctorName ? '<div class="inv-pd">Médecin: Dr. ' + sale.doctorName + '</div>' : ''}
          </div>
        </div>
        <table class="inv-tbl">
          <thead><tr><th style="width:30px">#</th><th>Désignation</th><th class="inv-ac">Qté</th><th class="inv-ar">Prix unit.</th><th class="inv-ar">Total</th></tr></thead>
          <tbody>
            ${items.map((it, idx) => '<tr><td>' + (idx+1) + '</td><td><div class="inv-im">' + (it.productName || '—') + '</div>' + (it.dci || it.dosage ? '<div class="inv-is">' + [it.dci, it.dosage].filter(Boolean).join(' · ') + '</div>' : '') + '</td><td class="inv-ac">' + it.quantity + '</td><td class="inv-ar">' + UI.formatCurrency(it.unitPrice) + '</td><td class="inv-ar"><strong>' + UI.formatCurrency(it.total) + '</strong></td></tr>').join('')}
          </tbody>
        </table>
        <div class="inv-tots"><div class="inv-tb">
          <div class="inv-tr"><span>Sous-total (${items.length} article${items.length > 1 ? 's' : ''})</span><span>${UI.formatCurrency(subtotal)}</span></div>
          ${discount > 0 ? '<div class="inv-tr disc"><span>Remise accordée</span><span>-' + UI.formatCurrency(discount) + '</span></div>' : ''}
          <div class="inv-tr gt"><span>TOTAL TTC</span><span>${UI.formatCurrency(total)}</span></div>
        </div></div>
        <div class="inv-pb">Mode de paiement : ${payLabels[sale.paymentMethod] || sale.paymentMethod || '—'}</div>
        ${sale.paymentMethod === 'cash' && sale.cashReceived ? '<div style="font-size:11px;color:#555;margin-bottom:4px;">Reçu: ' + UI.formatCurrency(sale.cashReceived) + ' · Monnaie: ' + UI.formatCurrency(sale.cashReceived - total) + '</div>' : ''}
        ${sale.paymentMethod === 'combined' && sale.paymentDetails ? '<div style="font-size:11px;color:#555;margin-bottom:4px;">' + (sale.paymentDetails.method1 || 'Mode 1') + ': ' + UI.formatCurrency(sale.paymentDetails.amount1 || 0) + ' · ' + (sale.paymentDetails.method2 || 'Mode 2') + ': ' + UI.formatCurrency(sale.paymentDetails.amount2 || 0) + '</div>' : ''}
        ${sale.paymentMethod === 'assurance' && sale.insuranceDetails ? '<div style="font-size:11px;color:#1B4F72;margin-bottom:4px;">Assurance: ' + (sale.insuranceDetails.name || sale.assuranceName || '') + ' · N° ' + (sale.insuranceDetails.ref || sale.assuranceRef || '') + '<br>Part Entreprise: ' + UI.formatCurrency(sale.insuranceDetails.amount || 0) + ' · Part Patient: ' + UI.formatCurrency(total - (sale.insuranceDetails.amount || 0)) + '</div>' : ''}
        ${sale.paymentMethod === 'credit' && sale.creditDueDate ? '<div style="font-size:11px;color:#e74c3c;margin-bottom:4px;">Échéance: ' + UI.formatDate(sale.creditDueDate) + '</div>' : ''}
        <div class="inv-ft">
          <div class="inv-sig"><div class="inv-sl"></div><div class="inv-sn">${pResp}</div><div class="inv-sr">Pharmacien responsable</div></div>
          <div style="text-align:center"><div style="font-size:10px;color:#888">Ce document tient lieu de facture officielle.</div><div style="font-size:10px;color:#888">Conservez-le comme preuve d'achat.</div></div>
          <div class="inv-sig"><div class="inv-sl"></div><div class="inv-sn">Cachet</div><div class="inv-sr">& Signature</div></div>
        </div>
        <div class="inv-lg">Document généré par OrdiveX v9.4.3 · Imprimé le ${new Date().toLocaleDateString('fr-FR')} à ${new Date().toLocaleTimeString('fr-FR')} · ${pName}</div>
      </div>
    `);
    win.document.close();
    win.onload = () => win.print();
  },

  async printStockReport(mode) {
    mode = mode || 'full';
    await this.loadSettings();
    UI.toast('Préparation du rapport...', 'info');

    const [products, stockAll, lots] = await Promise.all([
      DB.dbGetAll('products'),
      DB.dbGetAll('stock'),
      DB.dbGetAll('lots'),
    ]);

    const stockMap = {};
    stockAll.forEach(s => { stockMap[s.productId] = s.quantity; });

    // Pré-calculer la date d'expiration la plus proche par produit
    const expiryMap = {};
    const now = new Date();
    const in90Days = new Date(now.getTime() + 90 * 24 * 60 * 60 * 1000);
    lots.filter(l => l.status === 'active').forEach(l => {
      if (!expiryMap[l.productId] || new Date(l.expiryDate) < new Date(expiryMap[l.productId])) {
        expiryMap[l.productId] = l.expiryDate;
      }
    });

    // Totaux globaux
    const totalValAchat = products.reduce((a, p) => a + (stockMap[p.id] || 0) * (p.purchasePrice || 0), 0);
    const totalValVente = products.reduce((a, p) => a + (stockMap[p.id] || 0) * (p.salePrice || 0), 0);

    // Filtrer selon le mode
    let filtered = [];
    let reportTitle = '';
    let reportSubtitle = '';
    const LIMIT = 2000;

    if (mode === 'ruptures') {
      filtered = products.filter(p => (stockMap[p.id] || 0) === 0);
      reportTitle = 'RAPPORT DES RUPTURES DE STOCK';
      reportSubtitle = filtered.length + ' produit(s) en rupture totale';
    } else if (mode === 'low') {
      filtered = products.filter(p => { const q = stockMap[p.id] || 0; return q > 0 && q <= (p.minStock || 0); });
      reportTitle = 'RAPPORT DES STOCKS BAS';
      reportSubtitle = filtered.length + ' produit(s) sous le seuil minimum';
    } else if (mode === 'expiring') {
      filtered = products.filter(p => { const e = expiryMap[p.id]; return e && new Date(e) <= in90Days; })
        .sort((a, b) => new Date(expiryMap[a.id]) - new Date(expiryMap[b.id]));
      reportTitle = 'RAPPORT DES EXPIRATIONS PROCHES (90 JOURS)';
      reportSubtitle = filtered.length + ' produit(s) expirant bientôt';
    } else {
      filtered = products;
      reportTitle = 'RAPPORT D\'INVENTAIRE COMPLET';
      if (filtered.length > LIMIT) {
        reportSubtitle = 'Limité aux ' + LIMIT.toLocaleString() + ' premiers produits sur ' + filtered.length.toLocaleString() + '. Utilisez les rapports ciblés.';
        filtered = filtered.slice(0, LIMIT);
      } else {
        reportSubtitle = filtered.length.toLocaleString() + ' produit(s)';
      }
    }

    if (filtered.length === 0) {
      UI.toast('Aucun produit ne correspond à ce filtre.', 'info');
      return;
    }

    // Pagination : 200 lignes par page
    const PAGE_SIZE = 200;
    const totalPages = Math.ceil(filtered.length / PAGE_SIZE);
    const filteredValAchat = filtered.reduce((a, p) => a + (stockMap[p.id] || 0) * (p.purchasePrice || 0), 0);
    const filteredValVente = filtered.reduce((a, p) => a + (stockMap[p.id] || 0) * (p.salePrice || 0), 0);

    const win = this._openPrintWindow(reportTitle);
    win.document.write(this._printStyles());
    win.document.write('<style>.row-expiring{background:#fff3e0;}</style>');

    // Page de synthèse
    win.document.write(`
      <div class="report-container" style="page-break-after:always;">
        ${this.header(reportTitle)}
        <h3>${reportSubtitle}</h3>
        <p style="font-size:11px;color:#666;margin-bottom:16px;">${new Date().toLocaleDateString('fr-FR', {weekday:'long',day:'2-digit',month:'long',year:'numeric'})}</p>
        <table class="report-table" style="max-width:500px;">
          <tbody>
            <tr><td><strong>Produits dans ce rapport</strong></td><td><strong>${filtered.length.toLocaleString()}</strong></td></tr>
            <tr><td>Total en base</td><td>${products.length.toLocaleString()}</td></tr>
            <tr><td><strong>Valeur achat (rapport)</strong></td><td><strong>${UI.formatCurrency(filteredValAchat)}</strong></td></tr>
            <tr><td><strong>Valeur vente (rapport)</strong></td><td><strong>${UI.formatCurrency(filteredValVente)}</strong></td></tr>
            <tr><td>Valeur achat globale</td><td>${UI.formatCurrency(totalValAchat)}</td></tr>
            <tr><td>Valeur vente globale</td><td>${UI.formatCurrency(totalValVente)}</td></tr>
          </tbody>
        </table>
        <div class="report-legend" style="margin-top:20px;">
          <span class="legend-item"><span class="legend-box row-zero"></span> Rupture</span>
          <span class="legend-item"><span class="legend-box row-low"></span> Stock bas</span>
          <span class="legend-item"><span class="legend-box row-expiring"></span> Expiration proche</span>
        </div>
      </div>
    `);

    // Pages détaillées
    for (let pg = 0; pg < totalPages; pg++) {
      const s = pg * PAGE_SIZE;
      const e = Math.min(s + PAGE_SIZE, filtered.length);
      const slice = filtered.slice(s, e);
      let rows = '';
      for (let i = 0; i < slice.length; i++) {
        const p = slice[i];
        const qty = stockMap[p.id] || 0;
        const exp = expiryMap[p.id];
        const isExp = exp && new Date(exp) <= in90Days;
        let cls = '';
        if (qty === 0) cls = 'row-zero';
        else if (qty <= (p.minStock || 0)) cls = 'row-low';
        else if (isExp) cls = 'row-expiring';
        rows += '<tr' + (cls ? ' class="' + cls + '"' : '') + '>'
          + '<td>' + (s + i + 1) + '</td>'
          + '<td><strong>' + p.name + '</strong>' + (p.dci ? '<br><small>' + p.dci + '</small>' : '') + '</td>'
          + '<td>' + (p.category || '') + '</td>'
          + '<td class="text-center">' + qty + '</td>'
          + '<td>' + UI.formatCurrency(qty * (p.purchasePrice || 0)) + '</td>'
          + '<td>' + UI.formatCurrency(qty * (p.salePrice || 0)) + '</td>'
          + '<td>' + (exp ? UI.formatDate(exp) : '') + '</td></tr>';
      }
      win.document.write(
        '<div class="report-container"' + (pg < totalPages - 1 ? ' style="page-break-after:always;"' : '') + '>'
        + '<div style="display:flex;justify-content:space-between;border-bottom:2px solid #1B4F72;padding-bottom:6px;margin-bottom:8px;">'
        + '<span style="font-size:11px;font-weight:bold;color:#1B4F72;">' + this.pharmacyInfo.name + '</span>'
        + '<span style="font-size:10px;color:#666;">Page ' + (pg + 2) + '/' + (totalPages + 1) + '</span></div>'
        + '<table class="report-table"><thead><tr><th>#</th><th>Désignation</th><th>Cat.</th><th>Qté</th><th>Achat</th><th>Vente</th><th>Exp.</th></tr></thead>'
        + '<tbody>' + rows + '</tbody></table></div>'
      );
    }

    win.document.write('<div class="report-container">' + this.footer() + '</div>');
    win.document.close();
    win.onload = function() { UI.toast('Rapport prêt', 'success'); win.print(); };
  },

  async printDestructionPV(lotId) {
    await this.loadSettings();
    const lot = await DB.dbGet('lots', lotId);
    if (!lot?.destructionDate) return;
    const products = await DB.dbGetAll('products');
    const prod = products.find(p => p.id === lot.productId);

    const win = this._openPrintWindow('Procès-Verbal de Destruction');
    win.document.write(`
      ${this._printStyles()}
      <div class="report-container">
        ${this.header('PROCÈS-VERBAL DE DESTRUCTION')}
        <h3>Procès-Verbal N° PV-DEST-${String(lotId).padStart(6, '0')}</h3>
        <div class="pv-body">
          <p>Le soussigné, <strong>${lot.destructionBy || this.pharmacyInfo.responsable}</strong>, Pharmacien responsable de l'établissement ${this.pharmacyInfo.name}, certifie avoir procédé à la destruction des médicaments suivants :</p>
          <table class="report-table" style="margin:16px 0">
            <thead><tr><th>Désignation</th><th>N° Lot</th><th>Qté détruite</th><th>Date exp.</th><th>Motif</th></tr></thead>
            <tbody>
              <tr>
                <td><strong>${prod?.name || '—'}</strong><br><small>${prod?.dci || ''} ${prod?.dosage || ''}</small></td>
                <td>${lot.lotNumber}</td>
                <td><strong>${lot.destroyedQty}</strong> unités</td>
                <td>${UI.formatDate(lot.expiryDate)}</td>
                <td>${lot.destructionReason}</td>
              </tr>
            </tbody>
          </table>
          <div class="pv-details">
            <p><strong>Méthode de destruction :</strong> ${lot.destructionMethod || '—'}</p>
            <p><strong>Date de destruction :</strong> ${UI.formatDate(lot.destructionDate)}</p>
            <p><strong>Témoins :</strong> ${lot.destructionWitnesses || 'Néant'}</p>
          </div>
          <p>Ce procès-verbal a été établi pour servir et valoir ce que de droit.</p>
          <p>Fait à Conakry, le ${new Date().toLocaleDateString('fr-FR')}</p>
        </div>
        ${this.footer()}
      </div>
    `);
    win.document.close();
    win.onload = () => win.print();
  },

  async printCaisseReport(date) {
    await this.loadSettings();
    date = date || new Date().toISOString().split('T')[0];
    const [sales, cashRegister] = await Promise.all([
      DB.dbGetAll('sales'),
      DB.dbGetAll('cashRegister'),
    ]);

    const daySales = sales.filter(s => s.date?.startsWith(date) && s.status === 'completed');
    const dayClosure = cashRegister.find(c => c.type === 'closure' && c.date === date);

    const breakdown = {};
    daySales.forEach(s => {
      if (!breakdown[s.paymentMethod]) breakdown[s.paymentMethod] = 0;
      breakdown[s.paymentMethod] += s.total;
    });
    const payLabels = { cash: 'Espèces', orange_money: 'Orange Money', mtn_momo: 'MTN MoMo', credit: 'Crédit', transfer: 'Virement' };
    const total = daySales.reduce((a, s) => a + s.total, 0);
    const totalDiscount = daySales.reduce((a, s) => a + (s.discount || 0), 0);

    const win = this._openPrintWindow('Rapport de Caisse');
    win.document.write(`
      ${this._printStyles()}
      <div class="report-container">
        ${this.header('RAPPORT DE CAISSE JOURNALIÈRE')}
        <h3>Journée du ${new Date(date).toLocaleDateString('fr-FR', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' })}</h3>

        <table class="report-table" style="margin-bottom:16px">
          <thead><tr><th>Mode de paiement</th><th>Nombre de ventes</th><th>Montant total</th></tr></thead>
          <tbody>
            ${Object.entries(breakdown).map(([m, t]) => `
              <tr><td>${payLabels[m] || m}</td><td>${daySales.filter(s => s.paymentMethod === m).length}</td><td>${UI.formatCurrency(t)}</td></tr>
            `).join('')}
          </tbody>
          <tfoot>
            <tr><td><strong>Remises accordées</strong></td><td></td><td>-${UI.formatCurrency(totalDiscount)}</td></tr>
            <tr class="invoice-total-row"><td colspan="2"><strong>TOTAL ENCAISSÉ</strong></td><td><strong>${UI.formatCurrency(total)}</strong></td></tr>
          </tfoot>
        </table>

        ${dayClosure ? `
          <div class="pv-details">
            <p><strong>Fond d'ouverture :</strong> ${UI.formatCurrency(dayClosure.openingFund || 0)}</p>
            <p><strong>Espèces attendues :</strong> ${UI.formatCurrency(dayClosure.expectedCash || 0)}</p>
            <p><strong>Espèces comptées :</strong> ${UI.formatCurrency(dayClosure.physicalCash || 0)}</p>
            <p><strong>Écart de caisse :</strong> ${UI.formatCurrency((dayClosure.physicalCash || 0) - (dayClosure.expectedCash || 0))}</p>
            <p><strong>Clôturé par :</strong> ${dayClosure.closedBy || '—'}</p>
            ${dayClosure.note ? `<p><strong>Observations :</strong> ${dayClosure.note}</p>` : ''}
          </div>` : '<p class="text-warning"><strong>⚠️ Caisse non clôturée pour cette journée</strong></p>'}

        ${this.footer()}
      </div>
    `);
    win.document.close();
    win.onload = () => win.print();
  },

  async printPrescription(rxId) {
    await this.loadSettings();
    const rx = await DB.dbGet('prescriptions', rxId);
    if (!rx) return;

    const win = this._openPrintWindow(`Ordonnance — Rx-${String(rxId).padStart(5, '0')}`);
    win.document.write(`
      ${this._printStyles()}
      <div class="report-container">
        ${this.header('ORDONNANCE MÉDICALE')}
        
        <div class="rx-header-info" style="display:flex; justify-content:space-between; margin-bottom:24px;">
          <div class="rx-patient-side">
            <p><strong>PATIENT :</strong></p>
            <p style="font-size:14px; font-weight:bold;">${rx.patientName || 'Patient anonyme'}</p>
            ${rx.patientId ? `<p>ID: P-${String(rx.patientId).padStart(4, '0')}</p>` : ''}
          </div>
          <div class="rx-doc-side" style="text-align:right;">
            <p><strong>MÉDECIN / PRESCRIPTEUR :</strong></p>
            <p style="font-size:14px; font-weight:bold;">Dr. ${rx.doctorName || '—'}</p>
            <p>${rx.specialty || ''}</p>
          </div>
        </div>

        <div class="rx-body" style="min-height:300px; border:1px solid #1B4F72; padding:20px; border-radius:4px;">
          <h4 style="border-bottom:2px solid #1B4F72; padding-bottom:8px; margin-bottom:16px; color:#1B4F72;">MÉDICAMENTS PRESCRITS</h4>
          <table style="width:100%; border-collapse:collapse;">
            <thead>
              <tr style="text-align:left; border-bottom:1px solid #ddd;">
                <th style="padding:10px 0;">Désignation</th>
                <th style="padding:10px 0;">Posologie & Durée</th>
                <th style="padding:10px 0; text-align:right;">Qté</th>
              </tr>
            </thead>
            <tbody>
              ${(rx.items || []).map(item => `
                <tr style="border-bottom:1px solid #eee;">
                  <td style="padding:12px 0;">
                    <strong style="font-size:13px;">${item.productName}</strong>
                  </td>
                  <td style="font-style:italic; color:#444;">${item.instruction || 'Selon prescription'}</td>
                  <td style="text-align:right; font-weight:bold;">${item.quantity}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>
          
          ${rx.notes ? `
            <div style="margin-top:24px; padding-top:16px; border-top:1px dashed #ccc;">
              <strong>Notes complémentaires :</strong>
              <p style="margin-top:4px;">${rx.notes}</p>
            </div>` : ''}
        </div>

        <div style="margin-top:20px; font-size:11px; color:#666; font-style:italic;">
          * Cette ordonnance a été numérisée pour archivage et dispensation contrôlée.
        </div>

        ${this.footer()}
      </div>
    `);
    win.document.close();
    win.onload = () => win.print();
  },

  _openPrintWindow(title) {
    const win = window.open('', '_blank', 'width=900,height=700');
    win.document.write(`<!DOCTYPE html><html lang="fr"><head><meta charset="UTF-8"><title>${title} — ${this.pharmacyInfo.name}</title></head><body>`);
    return win;
  },

  _printStyles() {
    return `<style>
      * { margin:0; padding:0; box-sizing:border-box; }
      body { font-family: 'Arial', sans-serif; font-size: 12px; color: #000; background: white; }

      /* Ticket */
      .ticket-container { width: 80mm; margin: 0 auto; padding: 8px; font-family: monospace; }
      .ticket-logo { font-size: 28px; text-align: center; margin-bottom: 4px; }
      .ticket-name { font-size: 14px; font-weight: bold; text-align: center; }
      .ticket-addr, .ticket-phone { font-size: 10px; text-align: center; color: #666; }
      .ticket-divider { text-align: center; font-size: 11px; margin: 6px 0; color: #999; }
      .ticket-meta { margin: 6px 0; }
      .ticket-row { display: flex; justify-content: space-between; font-size: 11px; padding: 2px 0; }
      .ticket-items { width: 100%; font-size: 11px; }
      .ticket-items td { padding: 2px 2px; }
      .item-name { flex: 1; }
      .item-qty { text-align: center; width: 25px; }
      .item-price { text-align: right; width: 60px; }
      .item-total { text-align: right; font-weight: bold; width: 65px; }
      .ticket-total { display: flex; justify-content: space-between; font-size: 15px; font-weight: bold; padding: 6px 0; border-top: 2px solid #000; margin-top: 4px; }
      .ticket-thanks, .ticket-advice, .ticket-legal { text-align: center; font-size: 10px; margin-top: 4px; color: #666; }

      /* Report & Invoice */
      .report-container, .invoice-container { max-width: 210mm; margin: 0 auto; padding: 20px; }
      .print-header { display: flex; align-items: flex-start; gap: 20px; margin-bottom: 16px; }
      .print-logo { font-size: 48px; }
      .print-org { flex: 1; }
      .print-org h1 { font-size: 18px; font-weight: bold; margin-bottom: 4px; }
      .print-org p { font-size: 11px; color: #666; line-height: 1.4; }
      .print-doc-ref { text-align: right; }
      .print-doc-type { font-size: 16px; font-weight: bold; color: #1B4F72; }
      .print-date { font-size: 11px; color: #666; margin-top: 4px; }
      .print-divider { border-top: 2px solid #1B4F72; margin: 12px 0; }
      .invoice-ref { font-size: 13px; font-weight: bold; margin-bottom: 12px; color: #1B4F72; }

      .report-table, .invoice-table { width: 100%; border-collapse: collapse; margin-bottom: 12px; font-size: 11px; }
      .report-table th, .invoice-table th { background: #1B4F72; color: white; padding: 6px 8px; text-align: left; }
      .report-table td, .invoice-table td { padding: 5px 8px; border-bottom: 1px solid #eee; }
      .report-table tfoot td, .invoice-table tfoot td { font-weight: bold; border-top: 2px solid #1B4F72; background: #f5f5f5; padding: 6px 8px; }
      .invoice-total-row td { font-size: 14px; background: #1B4F72 !important; color: white !important; }
      .row-low { background: #fff8e1; }
      .row-zero { background: #ffebee; }
      .text-danger { color: #c0392b; font-weight: bold; }
      .text-warning { color: #e67e22; }

      .pv-body p { margin-bottom: 8px; line-height: 1.6; font-size: 12px; }
      .pv-details { background: #f9f9f9; border: 1px solid #ddd; padding: 12px; border-radius: 4px; margin: 12px 0; }
      .pv-details p { margin-bottom: 4px; }

      .print-footer { display: flex; justify-content: space-between; margin-top: 40px; padding-top: 20px; border-top: 1px solid #ddd; }
      .print-sig-block { text-align: center; font-size: 11px; }
      .sig-line { width: 140px; border-bottom: 1px solid #000; margin: 30px auto 4px; }
      .print-footer-center { text-align: center; }
      .print-legal { font-size: 10px; color: #999; }
      .report-legend { display: flex; gap: 20px; margin-top: 8px; font-size: 11px; }
      .legend-item { display: flex; align-items: center; gap: 6px; }
      .legend-box { width: 14px; height: 14px; display: inline-block; border: 1px solid #ddd; }
      .legend-box.row-low { background: #fff8e1; }
      .legend-box.row-zero { background: #ffebee; }

      @media print {
        body { margin: 0; }
        .report-container, .invoice-container { padding: 0; }
      }
    </style>`;
  },
};

// Register print commands globally
window.PrintEngine = PrintEngine;

// Quick-access print functions
window.printReceipt = (id) => PrintEngine.printSaleReceipt(id);
window.printInvoice = (id) => PrintEngine.printInvoice(id);
window.printStockReport = (mode) => PrintEngine.printStockReport(mode);
window.printCaisseReport = (date) => PrintEngine.printCaisseReport(date);
window.printDestructionPV = (id) => PrintEngine.printDestructionPV(id);
window.printPrescription = (id) => PrintEngine.printPrescription(id);

Router.register('print', (container) => {
  container.innerHTML = `
    <div class="page-header">
      <h1 class="page-title">Centre d'Impression</h1>
    </div>

    <h3 style="margin:0 0 12px;color:var(--text-primary);">Rapports de Stock</h3>
    <div class="print-center-grid">
      <div class="print-card" onclick="printStockReport('ruptures')">
        <div class="print-card-icon" style="color:#e74c3c;"><i data-lucide="alert-circle"></i></div>
        <h3>Ruptures de Stock</h3>
        <p>Produits avec 0 unité en stock</p>
        <button class="btn btn-primary">Imprimer</button>
      </div>
      <div class="print-card" onclick="printStockReport('low')">
        <div class="print-card-icon" style="color:#f39c12;"><i data-lucide="alert-triangle"></i></div>
        <h3>Stocks Bas</h3>
        <p>Produits sous le seuil minimum configuré</p>
        <button class="btn btn-primary">Imprimer</button>
      </div>
      <div class="print-card" onclick="printStockReport('expiring')">
        <div class="print-card-icon" style="color:#e67e22;"><i data-lucide="clock"></i></div>
        <h3>Expirations Proches</h3>
        <p>Lots expirant dans les 90 prochains jours</p>
        <button class="btn btn-primary">Imprimer</button>
      </div>
      <div class="print-card" onclick="printStockReport('full')">
        <div class="print-card-icon"><i data-lucide="package"></i></div>
        <h3>Inventaire Complet</h3>
        <p>Rapport global (limité à 2 000 produits)</p>
        <button class="btn btn-primary">Imprimer</button>
      </div>
    </div>

    <h3 style="margin:24px 0 12px;color:var(--text-primary);">Autres Documents</h3>
    <div class="print-center-grid">
      <div class="print-card" onclick="printCaisseReport()">
        <div class="print-card-icon"><i data-lucide="banknote"></i></div>
        <h3>Rapport de Caisse du Jour</h3>
        <p>Récapitulatif des encaissements journaliers</p>
        <button class="btn btn-primary">Imprimer</button>
      </div>
      <div class="print-card" onclick="Router.navigate('sales')">
        <div class="print-card-icon"><i data-lucide="file-text"></i></div>
        <h3>Facture / Ticket de Caisse</h3>
        <p>Imprimer depuis l'historique des ventes</p>
        <button class="btn btn-secondary">Aller aux ventes <i data-lucide="arrow-right"></i></button>
      </div>
      <div class="print-card" onclick="Router.navigate('traceability')">
        <div class="print-card-icon"><i data-lucide="trash-2"></i></div>
        <h3>PV de Destruction</h3>
        <p>Procès-verbal réglementaire de destruction</p>
        <button class="btn btn-secondary">Aller à la traçabilité <i data-lucide="arrow-right"></i></button>
      </div>
      <div class="print-card" onclick="Router.navigate('suppliers')">
        <div class="print-card-icon"><i data-lucide="clipboard-list"></i></div>
        <h3>Bon de Commande Fournisseur</h3>
        <p>Imprimer un bon de commande depuis les fournisseurs</p>
        <button class="btn btn-secondary">Aller aux fournisseurs <i data-lucide="arrow-right"></i></button>
      </div>
    </div>`;
  if (window.lucide) lucide.createIcons();
});

// ═══════════════════════════════════════════════════════════════════
// IMPRESSION BON DE COMMANDE FOURNISSEUR
// ═══════════════════════════════════════════════════════════════════
PrintEngine.printPurchaseOrder = async function(orderId) {
  await this.loadSettings();
  const [order, allSettings, suppliers] = await Promise.all([
    DB.dbGet('purchaseOrders', orderId),
    DB.dbGetAll('settings'),
    DB.dbGetAll('suppliers'),
  ]);
  if (!order) { UI.toast('Commande introuvable', 'error'); return; }

  const get = (key) => allSettings.find(s => s.key === key)?.value || '';
  const pName = get('pharmacy_name') || this.pharmacyInfo.name;
  const pAddr = get('pharmacy_address') || this.pharmacyInfo.address;
  const pPhone = get('pharmacy_phone') || this.pharmacyInfo.phone;
  const pDnpm = get('pharmacy_dnpm') || this.pharmacyInfo.dnpm;
  const pResp = get('pharmacy_resp') || this.pharmacyInfo.responsable;

  const supplier = suppliers.find(s => s.id === order.supplierId) || {};
  const orderDate = order.date ? new Date(order.date) : new Date();
  const orderRef = 'BC-' + String(orderId).padStart(6, '0');
  const orderItems = order.items || [];
  const totalHT = orderItems.reduce((a, i) => a + ((i.unitPrice || 0) * (i.quantity || 0)), 0);

  const statusLabels = { draft: 'Brouillon', sent: 'Envoyée', partial: 'Partielle', received: 'Réceptionnée', cancelled: 'Annulée' };

  const win = this._openPrintWindow('Bon de Commande ' + orderRef);
  win.document.write(`
    <style>
      * { margin:0; padding:0; box-sizing:border-box; }
      body { font-family: 'Segoe UI', Arial, sans-serif; font-size: 12px; color: #222; background: white; }
      .bc { max-width:210mm; margin:0 auto; padding:24px 28px; }
      .bc-hdr { display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:18px; }
      .bc-pn { font-size:20px; font-weight:800; color:#1B4F72; margin-bottom:2px; }
      .bc-pi { font-size:10px; color:#666; line-height:1.5; }
      .bc-rt { font-size:22px; font-weight:800; color:#1B4F72; letter-spacing:2px; }
      .bc-rn { font-size:13px; font-weight:700; color:#2E86C1; margin-top:4px; }
      .bc-rd { font-size:11px; color:#888; margin-top:2px; }
      .bc-sep { height:3px; background:linear-gradient(to right,#1B4F72,#2E86C1,transparent); margin:16px 0; border-radius:2px; }
      .bc-parties { display:flex; gap:20px; margin-bottom:20px; }
      .bc-pbox { flex:1; background:#f8f9fa; border:1px solid #e9ecef; border-radius:8px; padding:14px 16px; }
      .bc-plbl { font-size:9px; text-transform:uppercase; letter-spacing:1.5px; color:#2E86C1; font-weight:700; margin-bottom:8px; }
      .bc-pnm { font-size:14px; font-weight:700; color:#1B4F72; }
      .bc-pd { font-size:11px; color:#555; margin-top:2px; }
      .bc-tbl { width:100%; border-collapse:collapse; margin-bottom:16px; }
      .bc-tbl thead th { background:#1B4F72; color:#fff; padding:10px 12px; font-size:11px; text-transform:uppercase; letter-spacing:.5px; font-weight:700; }
      .bc-tbl thead th:first-child { border-radius:6px 0 0 0; }
      .bc-tbl thead th:last-child { border-radius:0 6px 0 0; text-align:right; }
      .bc-tbl tbody td { padding:10px 12px; border-bottom:1px solid #eee; font-size:11px; }
      .bc-tbl tbody tr:nth-child(even) { background:#f8f9fa; }
      .bc-ar { text-align:right; } .bc-ac { text-align:center; }
      .bc-tot { display:flex; justify-content:flex-end; margin-bottom:20px; }
      .bc-tb { width:260px; }
      .bc-tr { display:flex; justify-content:space-between; padding:6px 12px; font-size:12px; }
      .bc-tr.gt { background:#1B4F72; color:#fff; font-size:15px; font-weight:800; border-radius:6px; padding:10px 14px; margin-top:4px; }
      .bc-status { display:inline-block; padding:4px 14px; border-radius:20px; font-size:11px; font-weight:700; margin-bottom:16px; }
      .bc-ft { display:flex; justify-content:space-between; margin-top:40px; padding-top:16px; border-top:1px solid #ddd; }
      .bc-sig { text-align:center; }
      .bc-sl { width:150px; border-bottom:1px solid #333; margin:30px auto 6px; }
      .bc-sn { font-size:11px; font-weight:700; }
      .bc-sr { font-size:10px; color:#888; }
      .bc-lg { text-align:center; font-size:9px; color:#aaa; margin-top:16px; padding-top:8px; border-top:1px dashed #ddd; }
      @media print { .bc { padding:0; } }
    </style>
    <div class="bc">
      <div class="bc-hdr">
        <div>
          <div class="bc-pn">${pName}</div>
          <div class="bc-pi">${pAddr}<br>Tél: ${pPhone}${pDnpm ? '<br>DNPM: ' + pDnpm : ''}</div>
        </div>
        <div style="text-align:right">
          <div class="bc-rt">BON DE COMMANDE</div>
          <div class="bc-rn">${orderRef}</div>
          <div class="bc-rd">${orderDate.toLocaleDateString('fr-FR', { day:'2-digit', month:'long', year:'numeric' })}</div>
        </div>
      </div>
      <div class="bc-sep"></div>
      <div class="bc-parties">
        <div class="bc-pbox">
          <div class="bc-plbl">Pharmacie (Commanditaire)</div>
          <div class="bc-pnm">${pName}</div>
          <div class="bc-pd">${pAddr}</div>
          <div class="bc-pd">Tél: ${pPhone}</div>
        </div>
        <div class="bc-pbox">
          <div class="bc-plbl">Fournisseur</div>
          <div class="bc-pnm">${supplier.name || order.supplierName || '---'}</div>
          ${supplier.phone ? '<div class="bc-pd">Tél: ' + supplier.phone + '</div>' : ''}
          ${supplier.email ? '<div class="bc-pd">Email: ' + supplier.email + '</div>' : ''}
          ${supplier.address ? '<div class="bc-pd">' + supplier.address + '</div>' : ''}
        </div>
      </div>
      <div class="bc-status" style="background:${order.status === 'received' ? '#d4edda;color:#155724' : order.status === 'sent' ? '#cce5ff;color:#004085' : '#fff3cd;color:#856404'}">
        Statut : ${statusLabels[order.status] || order.status || 'Brouillon'}
      </div>
      <table class="bc-tbl">
        <thead><tr><th style="width:30px">#</th><th>Désignation</th><th class="bc-ac">Qté</th><th class="bc-ar">P.U.</th><th class="bc-ar">Total</th></tr></thead>
        <tbody>
          ${orderItems.map((it, idx) => '<tr><td>' + (idx+1) + '</td><td><strong>' + (it.productName || it.name || '—') + '</strong></td><td class="bc-ac">' + (it.quantity || 0) + '</td><td class="bc-ar">' + UI.formatCurrency(it.unitPrice || 0) + '</td><td class="bc-ar"><strong>' + UI.formatCurrency((it.unitPrice || 0) * (it.quantity || 0)) + '</strong></td></tr>').join('')}
        </tbody>
      </table>
      <div class="bc-tot"><div class="bc-tb">
        <div class="bc-tr"><span>Nombre d'articles</span><span>${orderItems.length}</span></div>
        <div class="bc-tr gt"><span>TOTAL HT</span><span>${UI.formatCurrency(totalHT)}</span></div>
      </div></div>
      ${order.note || order.notes ? '<div style="background:#f8f9fa;padding:12px;border-radius:8px;margin-bottom:16px;font-size:11px;"><strong>Notes :</strong> ' + (order.note || order.notes) + '</div>' : ''}
      <div class="bc-ft">
        <div class="bc-sig"><div class="bc-sl"></div><div class="bc-sn">${pResp}</div><div class="bc-sr">Pharmacien responsable</div></div>
        <div class="bc-sig"><div class="bc-sl"></div><div class="bc-sn">Fournisseur</div><div class="bc-sr">Signature & Cachet</div></div>
      </div>
      <div class="bc-lg">Document généré par OrdiveX v9.4.3 · ${new Date().toLocaleDateString('fr-FR')} · ${pName}</div>
    </div>
  `);
  win.document.close();
  win.onload = () => win.print();
};

window.printPurchaseOrder = function(id) { PrintEngine.printPurchaseOrder(id); };
