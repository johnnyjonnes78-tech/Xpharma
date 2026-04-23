/**
 * OrdiveX v3 — Point de Vente Professionnel
 * Panier · Client · Ordonnance · Mobile Money · Reçu officiel
 * FEFO · Interactions · Substitution Générique
 */

let posCart = [];
let posProducts = [];
let posStock = {};
let posLots = []; // Loaded for FEFO
let posSearch = '';
let posCurrentPatient = null;
let posCurrentRx = null;
let posActiveCategory = '';
let posMobilePayState = 'idle'; // idle | en_attente | confirme | echoue
let _posDataReady = false; // Cache session : données déjà chargées
let _posDataTime = 0; // Timestamp du dernier chargement
let posProductsCache = new Map(); // Cache pour les produits cliqués/ajoutés

// ═══════════════════════════════════════════════════════════════════
// INTERACTIONS MÉDICAMENTEUSES — Base statique des 30 combinaisons critiques
// Format: [DCI_A, DCI_B, niveau (grave/modéré), description]
// ═══════════════════════════════════════════════════════════════════
const DRUG_INTERACTIONS = [
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

/**
 * Vérifie les interactions médicamenteuses entre un nouveau produit et le panier actuel
 */
function checkDrugInteractions(newProduct) {
  if (!newProduct.dci) return [];
  const newDci = newProduct.dci.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  const alerts = [];
  for (const cartItem of posCart) {
    if (!cartItem.dci) continue;
    const cartDci = cartItem.dci.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    for (const [dciA, dciB, level, desc] of DRUG_INTERACTIONS) {
      const a = dciA.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
      const b = dciB.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
      if ((newDci.includes(a) && cartDci.includes(b)) || (newDci.includes(b) && cartDci.includes(a))) {
        alerts.push({ with: cartItem.name, level, desc });
      }
    }
  }
  return alerts;
}

/**
 * FEFO : Retourne le lot actif avec la DLC la plus proche pour un produit
 */
function getFEFOLot(productId) {
  try {
    const productLots = posLots
      .filter(l => l.productId === productId && l.status === 'active' && l.quantity > 0)
      .sort((a, b) => new Date(a.expiryDate) - new Date(b.expiryDate));
    return productLots[0] || null;
  } catch (e) { return null; }
}

/**
 * Substitution Générique : Trouve les alternatives DCI en stock
 */
function findGenericAlternatives(product) {
  if (!product.dci) return [];
  const dci = product.dci.toLowerCase();
  return posProducts.filter(p =>
    p.id !== product.id &&
    p.dci && p.dci.toLowerCase() === dci &&
    (posStock[p.id] || 0) > 0
  );
}

// Route registration is at the bottom of this file

// ═══════════════════════════════════════════════════════════════════
// RENDU PRINCIPAL & VÉRIFICATION SYNC
// ═══════════════════════════════════════════════════════════════════
async function checkSyncConflicts() {
   try {
       const sb = await getSupabaseClient();
       if (!sb || !navigator.onLine) return false;
       
       const { data, error } = await sb.from('settings').select('value').like('key', 'device_status_%');
       if (error) return false;
       
       let hasPendingOtherDevice = false;
       const localDeviceName = localStorage.getItem('pharma_device_name');
       
       for(const row of data) {
           try {
               const status = JSON.parse(row.value);
               if (status.name !== localDeviceName && status.pending > 0) {
                   hasPendingOtherDevice = true;
                   break;
               }
           } catch(e) {}
       }
       return hasPendingOtherDevice;
   } catch(e) {
       return false;
   }
}

async function renderPOS(container) {
  posCart = [];
  posCurrentPatient = null;
  posCurrentRx = null;
  posMobilePayState = 'idle';

  // 1. Rendu immédiat du squelette HTML (Instantané)
  container.innerHTML = `
    <div class="pos-wrap">
      <div id="pos-sync-warning" style="display:none; grid-column: 1 / -1; margin-bottom: 15px; background: rgba(239, 68, 68, 0.1); border-left: 4px solid var(--danger); padding: 12px 16px; border-radius: 8px;">
          <div style="display:flex; align-items:center; gap: 10px; color: var(--danger); font-weight: 600;">
              <i data-lucide="alert-octagon"></i>
              <span>Attention : Un autre appareil possède des données non synchronisées. Le stock affiché pourrait être inexact.</span>
          </div>
      </div>

      <div class="pos-left">
        <div class="pos-searchbar">
          <div class="pos-searchfield">
            <span class="pos-searchicon"><i data-lucide="search"></i></span>
            <input id="pos-search" type="text" class="pos-searchinput" placeholder="Chargement..." disabled>
          </div>
        </div>
        <div class="pos-catbar" id="pos-catbar">
           <div class="skeleton" style="width:100px;height:32px;border-radius:20px"></div>
        </div>
        <div id="pos-grid" class="pos-grid">
           <div class="loading-state" style="grid-column:1/-1;padding:40px"><div class="spinner"></div><p>Récupération des médicaments...</p></div>
        </div>
      </div>

      <div class="pos-right pos-cart-panel" id="pos-cart-panel">
        <div class="pos-cart-header">
            <div style="display:flex; align-items:center; gap:10px">
                <i data-lucide="shopping-basket"></i><span style="font-weight:700">Votre Panier</span>
            </div>
        </div>
        <div class="pos-section"><div class="pos-section-title">Patient</div><div id="client-search-trigger" class="client-selector-box"><span>...</span></div></div>
        <div class="pos-section pos-section-cart"><div class="pos-section-title">Panier</div><div class="pos-cart-body" id="pos-cart-items"></div></div>
        <div class="pos-totals-block">
           <div class="totals-row"><span>TOTAL À PAYER</span><span id="pos-total">0 GNF</span></div>
        </div>
        <div class="pos-actions-bar">
          <button class="btn btn-success pos-btn-validate" style="width:100%;opacity:0.5" disabled>Initialisation...</button>
        </div>
      </div>
    </div>
  `;
  if (window.lucide) lucide.createIcons();

  // 2. Cache session POS — si on revient dans < 2 min, rendu instantané
  const cacheAge = Date.now() - _posDataTime;
  if (_posDataReady && posProducts.length > 0 && cacheAge < 120000) {
    renderFullPOSUI(container);
  } else {
    const loadPOS = async () => {
      if (DB._isPulling) { let w=0; while(DB._isPulling && w<60000){await new Promise(r=>setTimeout(r,500));w+=500;} }
      const isMobile = /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent);
      const stockAll = await DB.dbGetAll('stock');
      posStock = {};
      stockAll.forEach(s => { posStock[s.productId] = s.quantity; });
      
      let products;
      if (isMobile) {
        products = await DB.dbSearchProducts('', 100);
      } else {
        products = await DB.dbGetAll('products');
      }
      posProducts = products.filter(p => p.status !== 'inactive');
      posProducts.forEach(p => posProductsCache.set(p.id, p));
      
      posLots = [];
      _posDataReady = true;
      _posDataTime = Date.now();
      renderFullPOSUI(container);
      // Patients/prescriptions en arrière-plan
      Promise.all([
        DB.dbGetAll('patients'),
        DB.dbGetAll('prescriptions'),
      ]).then(([patients, prescriptions]) => {
        window._posPatients = patients;
        window._posPrescriptions = prescriptions.filter(rx => ['pending', 'validated'].includes(rx.status));
      });
    };
    loadPOS();
  }

  // 4. Vérification des conflits (Réseau) - Totalement asynchrone
  checkSyncConflicts().then(hasSyncWarning => {
    const warnEl = document.getElementById('pos-sync-warning');
    if (warnEl && hasSyncWarning) warnEl.style.display = 'block';
  });
}

/**
 * Remplace le squelette par l'interface interactive une fois les données prêtes
 */
function renderFullPOSUI(container) {
  // On conserve le même wrap
  container.innerHTML = `
    <div class="pos-wrap">
      <div id="pos-sync-warning" style="display:none; grid-column: 1 / -1; margin-bottom: 15px; background: rgba(239, 68, 68, 0.1); border-left: 4px solid var(--danger); padding: 12px 16px; border-radius: 8px;">
          <div style="display:flex; align-items:center; gap: 10px; color: var(--danger); font-weight: 600;">
              <i data-lucide="alert-octagon"></i>
              <span>Attention : Un autre appareil possède des données non synchronisées. Le stock affiché pourrait être inexact.</span>
          </div>
      </div>

      <!-- ══ GAUCHE : Catalogue ══ -->
      <!-- ══ GAUCHE : Catalogue ══ -->
      <div class="pos-left">
        <div class="pos-main-header">
          <div class="pos-searchbar">
            <div class="pos-searchfield">
              <span class="pos-searchicon"><i data-lucide="search"></i></span>
              <input id="pos-search" type="text" class="pos-searchinput"
                placeholder="Nom, DCI, code-barres…" autocomplete="off">
              <button id="pos-clearsearch" class="pos-clearbtn" onclick="clearPosSearch()" style="display:none"><i data-lucide="x"></i></button>
            </div>
            <button class="btn btn-sm btn-ghost" onclick="startBarcodeScan()" title="Scanner (F2)"><i data-lucide="camera"></i></button>
          </div>
          <!-- Barre catégories + Tri -->
          <div style="display:flex; gap:8px; width:100%">
            <!-- Filtres catégories -->
            <div class="pos-catbar" id="pos-catbar" style="flex:1; min-width:0; overflow-x:auto;"></div>
            <!-- Menu Tri -->
            <div style="flex:1; min-width:0;">
              <select id="pos-sort" class="pos-sort-select" onchange="applySort(this.value)" style="width:100%">
                <option value="default">Tri: Défaut</option>
                <option value="name-az">Nom A→Z</option>
                <option value="name-za">Nom Z→A</option>
                <option value="price-asc">Prix ↑</option>
                <option value="price-desc">Prix ↓</option>
                <option value="stock-asc">Stock ↑</option>
                <option value="stock-desc">Stock ↓</option>
              </select>
            </div>
          </div>
        </div>
        <div id="pos-grid" class="pos-grid"></div>
      </div>

      <!-- ══ DROITE : Panier ══ -->
      <div class="pos-right" id="pos-cart-panel">
        <div class="pos-cart-header" onclick="this.parentElement.classList.toggle('expanded')">
            <div style="display:flex; align-items:center; gap:10px">
                <i data-lucide="shopping-basket"></i><span style="font-weight:700">Votre Panier</span>
            </div>
            <i data-lucide="chevron-up" class="cart-toggle-icon"></i>
        </div>

        <!-- CLIENT -->
        <div class="pos-section">
          <div class="pos-section-header">
            <span class="pos-section-icon"><i data-lucide="user"></i></span>
            <span class="pos-section-title">Patient</span>
            <button class="btn btn-xs btn-outline" onclick="showQuickNewClient()"><i data-lucide="plus"></i> Nouveau</button>
          </div>
          <div id="client-search-trigger" class="client-selector-box" onclick="showPatientRepertory()">
            <i data-lucide="search"></i><span>Choisir un patient...</span>
          </div>
          <div id="client-badge" style="display:none"></div>
        </div>

        <!-- ORDONNANCE -->
        <div class="pos-section pos-section-rx" id="pos-rx-section">
          <div class="pos-section-header">
            <span class="pos-section-icon"><i data-lucide="file-text"></i></span>
            <span class="pos-section-title">Ordonnance</span>
            <div style="flex:1"></div>
            <label class="toggle-switch"><input type="checkbox" id="rx-toggle" onchange="onRxToggle(this.checked)"><span class="toggle-track"><span class="toggle-thumb"></span></span></label>
          </div>
          <div id="rx-detail" style="display:none">
            <button class="btn btn-sm btn-primary" style="width:100%" onclick="openRxPicker()"><i data-lucide="link"></i> Lier une ordonnance</button>
            <div id="rx-badge" style="display:none; margin-top:10px"></div>
          </div>
        </div>

        <!-- PANIER ARTICLES -->
        <div class="pos-section pos-section-cart">
          <div class="pos-section-header">
            <span class="pos-section-icon"><i data-lucide="shopping-cart"></i></span>
            <span class="pos-section-title">Panier</span>
            <div style="flex:1"></div>
            <span class="cart-count-badge" id="cart-count">0 art.</span>
          </div>
          <div class="pos-cart-body" id="pos-cart-items"></div>
        </div>

        <!-- TOTAUX -->
        <div class="pos-totals-block">
          <div class="totals-row"><span>Sous-total</span><span id="pos-subtotal">0 GNF</span></div>
          <div class="totals-row"><span>Remise</span><input id="pos-discount" type="number" class="disc-input" value="0" min="0" oninput="refreshTotals()"></div>
          <div class="totals-row totals-total"><span>TOTAL À PAYER</span><span id="pos-total">0 GNF</span></div>
          <div id="assur-split-banner" style="display:none; margin-top:10px; padding:14px; border-radius:12px; background:#FFFFFF; border:2px solid #E8E8E8; box-shadow:0 2px 8px rgba(0,0,0,0.06)">
            <div style="display:grid; grid-template-columns:1fr 1fr; gap:10px">
              <div style="text-align:center; padding:10px 6px; background:#EBF5FB; border-radius:8px">
                <div style="font-size:9px; text-transform:uppercase; letter-spacing:1px; color:#1A56DB; font-weight:800; margin-bottom:4px">🛡️ PART ENTREPRISE</div>
                <div id="assur-split-enterprise" style="font-size:20px; font-weight:900; color:#1A56DB">0 GNF</div>
                <div style="font-size:9px; color:#7B8CA8; margin-top:2px">En attente de règlement</div>
              </div>
              <div style="text-align:center; padding:10px 6px; background:#E8F8EF; border-radius:8px">
                <div style="font-size:9px; text-transform:uppercase; letter-spacing:1px; color:#1E8449; font-weight:800; margin-bottom:4px">👤 PART PATIENT</div>
                <div id="assur-split-patient" style="font-size:20px; font-weight:900; color:#1E8449">0 GNF</div>
                <div style="font-size:9px; color:#7B8CA8; margin-top:2px">Encaissé maintenant</div>
              </div>
            </div>
          </div>
        </div>

        <!-- PAIEMENT -->
        <div class="pos-pay-block">
          <div class="pay-methods">
            <button class="pay-btn active" data-m="cash" onclick="selectPay(this)">
              <i data-lucide="banknote"></i><span>Espèces</span>
            </button>
            <button class="pay-btn" data-m="orange_money" onclick="selectPay(this)">
              <i data-lucide="smartphone"></i><span>O. Money</span>
            </button>
            <button class="pay-btn" data-m="mtn_momo" onclick="selectPay(this)">
              <i data-lucide="smartphone"></i><span>MTN MoMo</span>
            </button>
            <button class="pay-btn" data-m="combined" onclick="selectPay(this)">
              <i data-lucide="split"></i><span>Mixte</span>
            </button>
            <button class="pay-btn" data-m="assurance" onclick="selectPay(this)">
              <i data-lucide="shield-plus"></i><span>Assurance</span>
            </button>
            <button class="pay-btn" data-m="credit" onclick="selectPay(this)">
              <i data-lucide="file-clock"></i><span>Crédit</span>
            </button>
          </div>

          <div id="pay-cash" class="pay-detail">
             <label class="pay-detail-label">Montant encaissé</label>
             <input id="cash-in" type="number" class="pay-input" placeholder="0" oninput="refreshChange()">
             <div id="cash-shortcuts" class="cash-quick" style="margin-top:10px"></div>
             <div class="pay-detail-row" style="margin-top:14px"><span>Monnaie à rendre</span><strong id="cash-change">—</strong></div>
          </div>

          <div id="pay-mobile" class="pay-detail" style="display:none">
            <label class="pay-detail-label">Numéro de téléphone client</label>
            <input id="mm-phone" type="tel" class="pay-input" placeholder="6XX XXX XXX" oninput="refreshMmPhone()">
            <div id="mm-state" class="mm-state mm-idle" style="margin-top:12px">
              <button class="btn btn-sm btn-primary mm-send-btn" style="width:100%" onclick="initMobilePay()">
                <i data-lucide="send"></i> Envoyer la demande de paiement
              </button>
            </div>
          </div>

          <div id="pay-combined" class="pay-detail" style="display:none">
            <div class="combined-info" style="background:rgba(46,134,193,0.08);border:1px solid rgba(46,134,193,0.2);border-radius:8px;padding:10px 14px;margin-bottom:12px;font-size:12px;color:var(--text-muted)">
              <i data-lucide="info" style="width:14px;height:14px;vertical-align:text-bottom;margin-right:4px"></i>
              Saisissez les montants pour chaque mode de paiement.
            </div>
            <div class="combined-split-row" style="display:flex;gap:12px;flex-wrap:wrap;margin-bottom:12px">
              <div style="flex:1;min-width:140px">
                <select id="combined-method-1" class="pay-input" style="margin-bottom:8px" onchange="onCombinedChange()">
                  <option value="cash">Espèces</option>
                  <option value="orange_money">Orange Money</option>
                  <option value="mtn_momo">MTN MoMo</option>
                </select>
                <input id="combined-amount-1" type="number" class="pay-input" placeholder="Montant 1" oninput="refreshCombined()">
              </div>
              <div style="flex:1;min-width:140px">
                <select id="combined-method-2" class="pay-input" style="margin-bottom:8px" onchange="onCombinedChange()">
                  <option value="orange_money">Orange Money</option>
                  <option value="cash">Espèces</option>
                  <option value="mtn_momo">MTN MoMo</option>
                </select>
                <input id="combined-amount-2" type="number" class="pay-input" placeholder="Montant 2" oninput="refreshCombined()">
              </div>
            </div>
            <div id="combined-phone-row" style="display:none;margin-bottom:12px">
              <input id="combined-mm-phone" type="tel" class="pay-input" placeholder="6XX XXX XXX">
            </div>
            <div id="combined-status" style="padding:8px;font-size:13px;font-weight:600;text-align:center">Saisissez les montants</div>
          </div>

          <div id="pay-assurance" class="pay-detail" style="display:none">
            <div id="assur-dynamic-list">
              <label class="pay-detail-label">Organisme & Prise en charge</label>
              <input id="assur-name" type="text" class="pay-input assur-name-field" placeholder="Nom de l'assurance / Entreprise" style="margin-bottom:8px">
              <input id="assur-ref" type="text" class="pay-input assur-ref-field" placeholder="Réf. Prise en charge" style="margin-bottom:8px">
              <div style="margin-bottom:6px;font-size:11px;font-weight:700;color:#1A56DB">🛡️ Montant pris en charge par l'entreprise :</div>
              <input id="assur-amount" type="number" class="pay-input assur-amount-field" placeholder="Part couverte par l'assurance (pas le total)" oninput="calcAssurance()" style="border-color:#1A56DB">
            </div>
            
            <div style="margin:15px 0 10px 0; font-weight:700; color:var(--text-muted); font-size:12px; text-transform:uppercase; letter-spacing:0.5px">👤 Règlement Patient (Ticket modérateur)</div>
            <div style="background:#E8F8EF; padding:12px; border-radius:8px; border:1.5px solid #C3E6CB">
              <div style="display:flex; justify-content:space-between; margin-bottom:10px">
                <span style="font-size:13px;font-weight:600">Reste à payer par le patient :</span>
                <span id="assur-patient-part" style="font-weight:900; font-size:15px; color:#1E8449">0 GNF</span>
              </div>
              <div style="display:flex; gap:10px">
                 <select id="assur-patient-method" class="pay-input" style="flex:1" onchange="calcAssurance()">
                    <option value="cash">Espèces</option>
                    <option value="orange_money">Orange Money</option>
                    <option value="mtn_momo">MTN MoMo</option>
                 </select>
                 <input id="assur-patient-recv" type="number" class="pay-input" style="flex:1" placeholder="Montant reçu" oninput="calcAssurance()">
              </div>
              <div id="assur-patient-mobile" style="margin-top:10px; display:none">
                 <input id="assur-patient-phone" type="tel" class="pay-input" placeholder="6XX XXX XXX">
              </div>
            </div>
            <div id="assur-status" style="font-size:12px; margin-top:10px; text-align:center"></div>
          </div>

          <div id="pay-credit" class="pay-detail" style="display:none">
            <label class="pay-detail-label">Date d'échéance du crédit</label>
            <input id="credit-date" type="date" class="pay-input" value="${new Date(Date.now() + 30 * 864e5).toISOString().split('T')[0]}">
            <div class="info-box-small" style="margin-top:10px">
              <i data-lucide="info"></i>
              <span>Le patient doit être identifié pour valider une vente à crédit.</span>
            </div>
          </div>
        </div>

        <!-- ACTIONS -->
        <div class="pos-actions-bar">
          <button class="btn btn-ghost pos-btn-cancel" onclick="viderPanier()" title="Vider le panier (Échap)">
            <i data-lucide="trash-2"></i>
          </button>
          <button class="btn btn-secondary pos-btn-hold" onclick="mettreEnAttente()">
            <i data-lucide="pause"></i><span>Attente</span>
          </button>
          <button id="btn-valider" class="btn btn-success pos-btn-validate" onclick="validerVente()">
            <i data-lucide="check-circle"></i><span>Valider (F5)</span>
          </button>
        </div>

        <!-- DERNIÈRES VENTES -->
        <div class="pos-section pos-section-history" id="pos-recent-sales">
          <div class="pos-section-header">
            <span class="pos-section-icon"><i data-lucide="clock"></i></span>
            <span class="pos-section-title">Dernières ventes</span>
          </div>
          <div id="pos-recent-list" style="font-size:12px;color:var(--text-muted);padding:8px 0">Chargement...</div>
        </div>

      </div><!-- fin pos-right -->
    </div><!-- fin pos-wrap -->

  `;

  buildCatBar();
  refreshGrid();
  initPosSearch();
  initKeyboardShortcuts();
  loadRecentSales();
  if (typeof mobileInitPOS === 'function') mobileInitPOS();
  document.getElementById('pos-search').focus();

  // Restore held cart
  if (window._heldCart) {
    posCart = window._heldCart.items;
    posCurrentPatient = window._heldCart.patient;
    posCurrentRx = window._heldCart.rx;
    window._heldCart = null;
    refreshCartUI();
    if (posCurrentPatient) renderClientBadge(posCurrentPatient);
  }
  if (window.lucide) lucide.createIcons();
}

/**
 * Rafraîchit les données du POS (produits/stocks) depuis la DB locale.
 * Utile pour les mises à jour en arrière-plan sans recharger toute la page.
 */
async function refreshPOSData() {
  const isMobile = /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent);
  const stockAll = await DB.dbGetAll('stock');
  posStock = {};
  stockAll.forEach(s => { posStock[s.productId] = s.quantity; });
  
  let products;
  if (isMobile) {
    products = await DB.dbSearchProducts(posSearch || '', 100);
  } else {
    products = await DB.dbGetAll('products');
  }
  posProducts = products.filter(p => p.status !== 'inactive');
  posProducts.forEach(p => posProductsCache.set(p.id, p));
  if (typeof refreshGrid === 'function') refreshGrid();
}

// ═══════════════════════════════════════════════════════════════════
// CATALOGUE
// ═══════════════════════════════════════════════════════════════════
function buildCatBar() {
  const cats = [...new Set(posProducts.map(p => p.category).filter(Boolean))].sort();
  const el = document.getElementById('pos-catbar');
  if (!el) return;
  
  if (window.innerWidth <= 767) {
    el.innerHTML = `
      <select class="pos-sort-select" style="width:100%" onchange="posActiveCategory = this.value; refreshGrid();">
        <option value="">Catégorie : Toutes</option>
        ${cats.map(c => `<option value="${c}">${c}</option>`).join('')}
      </select>
    `;
  } else {
    el.innerHTML = `<button class="cat-pill active" onclick="filterCat(this,'')">Tous</button>`
      + cats.map(c => `<button class="cat-pill" onclick="filterCat(this,'${c}')">${c}</button>`).join('');
  }
}

function filterCat(btn, cat) {
  document.querySelectorAll('.cat-pill').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  posActiveCategory = cat;
  refreshGrid();
}

let _posSearchTimer = null;
function initPosSearch() {
  const input = document.getElementById('pos-search');
  if (!input) return;
  input.addEventListener('input', e => {
    posSearch = e.target.value.toLowerCase();
    document.getElementById('pos-clearsearch').style.display = posSearch ? 'flex' : 'none';
    posCurrentPage = 0; // Reset à la page 1 quand on cherche
    // Debounce: attend 250ms après la dernière frappe avant de filtrer
    clearTimeout(_posSearchTimer);
    _posSearchTimer = setTimeout(async () => {
      const isMobile = /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent);
      if (isMobile) {
         const res = await DB.dbSearchProducts(posSearch, 100);
         posProducts = res;
         posProducts.forEach(p => posProductsCache.set(p.id, p));
      }
      refreshGrid();
    }, 250);
  });
}

function clearPosSearch() {
  posSearch = '';
  posCurrentPage = 0;
  const inp = document.getElementById('pos-search');
  if (inp) inp.value = '';
  document.getElementById('pos-clearsearch').style.display = 'none';
  const isMobile = /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent);
  if (isMobile) {
    DB.dbSearchProducts('', 100).then(res => {
      posProducts = res;
      posProducts.forEach(p => posProductsCache.set(p.id, p));
      refreshGrid();
    });
  } else {
    refreshGrid();
  }
}

let posSortMode = 'default';
let posPageSize = /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent) ? 50 : 100;
let posCurrentPage = 0;

function applySort(mode) {
  posSortMode = mode;
  posCurrentPage = 0;
  refreshGrid();
}

function posNextPage() { posCurrentPage++; refreshGrid(); }
function posPrevPage() { if (posCurrentPage > 0) { posCurrentPage--; refreshGrid(); } }
function posGoToPage(n) { posCurrentPage = n; refreshGrid(); }

function refreshGrid() {
  const grid = document.getElementById('pos-grid');
  if (!grid) return;
  const isAdmin = ['admin', 'pharmacien'].includes(DB.AppState.currentUser?.role);

  let list = posProducts;
  if (posActiveCategory) list = list.filter(p => p.category === posActiveCategory);
  if (posSearch) {
    list = list.filter(p =>
      (p.name || '').toLowerCase().includes(posSearch) ||
      (p.dci || '').toLowerCase().includes(posSearch) ||
      (p.code || '').toLowerCase().includes(posSearch) ||
      (p.ean || '').toLowerCase().includes(posSearch) ||
      (p.cip || '').toLowerCase().includes(posSearch)
    );
  }

  list = [...list].sort((a, b) => {
    const qa = posStock[a.id] || 0, qb = posStock[b.id] || 0;
    // Toujours mettre les ruptures en fin
    if ((qa > 0) !== (qb > 0)) return qa > 0 ? -1 : 1;
    // Tri utilisateur
    switch (posSortMode) {
      case 'name-az': return (a.name || '').localeCompare(b.name || '', 'fr');
      case 'name-za': return (b.name || '').localeCompare(a.name || '', 'fr');
      case 'price-asc': return (a.salePrice || 0) - (b.salePrice || 0);
      case 'price-desc': return (b.salePrice || 0) - (a.salePrice || 0);
      case 'stock-asc': return qa - qb;
      case 'stock-desc': return qb - qa;
      default: return (a.name || '').localeCompare(b.name || '', 'fr');
    }
  });

  if (!list.length) {
    grid.innerHTML = `<div class="grid-empty"><i data-lucide="search"></i> Aucun médicament trouvé${posSearch ? ` pour "<b>${posSearch}</b>"` : ''}</div>`;
    if (window.lucide) lucide.createIcons();
    return;
  }

  // ── Pagination ──
  const totalPages = Math.ceil(list.length / posPageSize);
  if (posCurrentPage >= totalPages) posCurrentPage = totalPages - 1;
  if (posCurrentPage < 0) posCurrentPage = 0;
  const start = posCurrentPage * posPageSize;
  const visibleList = list.slice(start, start + posPageSize);

  grid.innerHTML = visibleList.map(p => {
    const q = posStock[p.id] || 0;
    const inCart = posCart.find(c => c.productId === p.id);
    const rupt = q === 0;
    const low = q > 0 && q <= (p.minStock || 10);
    const isRx = p.requiresPrescription;
    const marginInfo = isAdmin && p.purchasePrice ? `<span class="prod-margin">Marge: ${Math.round(((p.salePrice - p.purchasePrice) / p.salePrice) * 100)}%</span>` : '';

    // Forme pharmaceutique intelligente
    const unitLabels = { 'boîte': 'bte', 'flacon': 'fl', 'tube': 'tube', 'sachet': 'sach', 'ampoule': 'amp', 'suppositoire': 'sup', 'spray': 'spray', 'patch': 'patch', 'seringue': 'ser', 'poche': 'poche' };
    const rawUnit = (p.unit || 'boîte').toLowerCase();
    const unitShort = unitLabels[rawUnit] || rawUnit.substring(0, 4);
    const unitFull = p.unit || 'Boîte';

    // Stock affiché de manière intelligente
    let stockText = '';
    if (rupt) {
      stockText = '<i data-lucide="x-circle"></i> Rupture';
    } else if (p.allowUnitSale) {
      const totU = (p.unitsPerBox || 1) * (p.subUnitsPerBox || 1);
      const boxes = Math.floor(q / totU);
      const remain = q % totU;
      stockText = (low ? '<i data-lucide="alert-triangle"></i> ' : '') + boxes + ' ' + unitShort + (remain > 0 ? ' +' + remain + 'u' : '');
    } else {
      stockText = (low ? '<i data-lucide="alert-triangle"></i> ' : '') + q + ' ' + unitShort;
    }

    return `<div class="prod-card ${rupt ? 'prod-rupt' : ''} ${inCart ? 'prod-incart' : ''} ${low ? 'prod-low' : ''}" data-pid="${p.id}"
       onclick="${rupt ? `handleRuptureClick(${p.id})` : `addToCart(${p.id})`}">
      <div class="prod-top">
        ${isRx ? '<span class="tag-rx">Rx</span>' : '<span class="tag-otc">OTC</span>'}
        ${p.isControlled ? '<span class="tag-rx" style="background:#e74c3c">SC</span>' : ''}
        ${inCart ? `<span class="tag-cart">${inCart.qty}</span>` : ''}
      </div>
      <div class="prod-cat">${p.category || ''}</div>
      <div class="prod-name">${p.name}</div>
      <div class="prod-dci">${p.dci || p.brand || ''}</div>
      ${marginInfo}
      <div class="prod-foot">
        <span class="prod-price">${UI.formatCurrency(p.salePrice)} <small style="font-size:9px;color:var(--text-muted)">/ ${unitShort}</small></span>
        <span class="prod-stock ${rupt ? 's-rupt' : low ? 's-low' : 's-ok'}">${stockText}</span>
      </div>
      <div style="display:flex; gap:3px; margin-top:4px; flex-wrap:wrap;">
        ${!rupt ? `<button class="btn btn-xs btn-primary" style="flex:1;min-width:28%;padding:3px 4px;font-size:10px" onclick="event.stopPropagation(); addToCart(${p.id}, 'box')"><i data-lucide="package" style="width:11px;height:11px"></i> ${unitFull}</button>` : ''}
        ${!rupt && p.allowUnitSale && p.subUnitsPerBox > 1 ? `<button class="btn btn-xs btn-secondary" style="flex:1;min-width:28%;padding:3px 4px;font-size:10px" onclick="event.stopPropagation(); addToCart(${p.id}, 'subunit')"><i data-lucide="layout-grid" style="width:11px;height:11px"></i> Plaq.</button>` : ''}
        ${!rupt && p.allowUnitSale ? `<button class="btn btn-xs btn-secondary" style="flex:1;min-width:28%;padding:3px 4px;font-size:10px" onclick="event.stopPropagation(); addToCart(${p.id}, 'unit')"><i data-lucide="pill" style="width:11px;height:11px"></i> Unité</button>` : ''}
        <button class="btn btn-xs btn-ghost" style="min-width:26px;padding:3px;color:var(--info);border:1px solid var(--border)" onclick="event.stopPropagation(); showProductNotice(${p.id})" title="Notice"><i data-lucide="info" style="width:11px;height:11px"></i></button>
      </div>
    </div>`;
  }).join('');

  // ── Barre de Pagination ──
  if (totalPages > 1) {
    const pageInfo = `Page ${posCurrentPage + 1} / ${totalPages} — ${list.length.toLocaleString('fr')} produits`;
    grid.insertAdjacentHTML('beforeend', `
      <div class="pos-pagination" style="grid-column:1/-1; display:flex; justify-content:center; align-items:center; gap:8px; padding:16px 0; flex-wrap:wrap;">
        <button class="btn btn-sm btn-secondary" onclick="posGoToPage(0)" ${posCurrentPage === 0 ? 'disabled' : ''} style="padding:6px 10px">
          <i data-lucide="chevrons-left" style="width:14px;height:14px"></i>
        </button>
        <button class="btn btn-sm btn-secondary" onclick="posPrevPage()" ${posCurrentPage === 0 ? 'disabled' : ''} style="padding:6px 12px">
          <i data-lucide="chevron-left" style="width:14px;height:14px"></i> Préc.
        </button>
        <span style="font-size:13px; font-weight:600; color:var(--text-muted); padding:0 8px">${pageInfo}</span>
        <button class="btn btn-sm btn-secondary" onclick="posNextPage()" ${posCurrentPage >= totalPages - 1 ? 'disabled' : ''} style="padding:6px 12px">
          Suiv. <i data-lucide="chevron-right" style="width:14px;height:14px"></i>
        </button>
        <button class="btn btn-sm btn-secondary" onclick="posGoToPage(${totalPages - 1})" ${posCurrentPage >= totalPages - 1 ? 'disabled' : ''} style="padding:6px 10px">
          <i data-lucide="chevrons-right" style="width:14px;height:14px"></i>
        </button>
      </div>
    `);
  }
  // Lucide uniquement sur la grille (pas tout le DOM)
  if (window.lucide) { const g = document.getElementById('pos-grid'); if (g) lucide.createIcons({node: g}); }
}

// ═══════════════════════════════════════════════════════════════════
// PANIER
// ═══════════════════════════════════════════════════════════════════
function addToCart(productId, mode = 'box') {
  const p = posProductsCache.get(productId) || posProducts.find(x => x.id === productId);
  if (!p) return;
  const avail = posStock[productId] || 0;
  const existing = posCart.find(c => c.productId === productId && (c.saleMode || 'box') === mode);
  
  // Calcul unités requises
  let unitFactor = 1;
  const totU = (p.unitsPerBox || 1) * (p.subUnitsPerBox || 1);
  if (p.allowUnitSale) {
     if (mode === 'box') unitFactor = totU;
     else if (mode === 'subunit') unitFactor = p.unitsPerBox || 1;
     else unitFactor = 1;
  }
  
  const currentlyInCart = posCart.filter(c => c.productId === productId).reduce((sum, c) => {
     let f = 1;
     if (p.allowUnitSale) {
        if (c.saleMode === 'box') f = totU;
        else if (c.saleMode === 'subunit') f = p.unitsPerBox || 1;
        else f = 1;
     }
     return sum + (c.qty * f);
  }, 0);
  
  if ((currentlyInCart + unitFactor) > avail) {
    UI.toast(`Stock insuffisant (${Math.floor(avail/totU)} boîte(s) dispo)`, 'warning'); return;
  }
  
  // Alerte allergie patient
  if (posCurrentPatient?.allergies) {
    const txt = (p.name + ' ' + (p.dci || '')).toLowerCase();
    const hits = posCurrentPatient.allergies.split(/[,;]/).map(s => s.trim().toLowerCase()).filter(a => a && txt.includes(a));
    if (hits.length) UI.toast(`⚠️ ALLERGIE — ${posCurrentPatient.name} : ${hits.join(', ')}`, 'error', 8000);
  }
  // Vérification interactions médicamenteuses
  try {
    const interactions = checkDrugInteractions(p);
    for (const inter of interactions) {
      const icon = inter.level === 'grave' ? '🚨' : '⚠️';
      UI.toast(`${icon} INTERACTION ${inter.level.toUpperCase()} — ${p.name} + ${inter.with}\n${inter.desc}`, 'error', 10000);
    }
  } catch(e) { console.warn('[Interactions] Erreur vérification:', e); }

  // FEFO : identifier le lot
  const fefoLot = getFEFOLot(productId);

  if (existing) { existing.qty++; existing.total = existing.qty * existing.unitPrice; }
  else {
    const price = mode === 'unit' ? (p.pricePerUnit || 0) : (mode === 'subunit' ? (p.pricePerSubUnit || 0) : p.salePrice);
    posCart.push({
      productId, name: p.name, dci: p.dci || '', dosage: p.dosage || '',
      unitPrice: price, purchasePrice: p.purchasePrice || 0,
      qty: 1, total: price, requiresPrescription: !!p.requiresPrescription,
      isControlled: !!p.isControlled, controlledClass: p.controlledClass || null,
      fefoLotNumber: fefoLot?.lotNumber || null, fefoLotId: fefoLot?.id || null,
      saleMode: mode
    });
  }
  // Feedback visuel + sonore
  posAddFeedback(p.name + (mode === 'unit' ? ' (Unité)' : ''));
  refreshCartUI(); updateCardUI(productId);
}

function checkStockCart(productId) {
  const p = posProductsCache.get(productId) || posProducts.find(x => x.id === productId);
  const avail = posStock[productId] || 0;
  const totU = (p.unitsPerBox || 1) * (p.subUnitsPerBox || 1);
  const currentlyInCart = posCart.filter(c => c.productId === productId).reduce((sum, c) => {
     let f = 1;
     if (p?.allowUnitSale) {
        if (c.saleMode === 'box') f = totU;
        else if (c.saleMode === 'subunit') f = p.unitsPerBox || 1;
        else f = 1;
     }
     return sum + (c.qty * f);
  }, 0);
  return currentlyInCart <= avail;
}

function changeQty(productId, mode, delta) {
  const item = posCart.find(c => c.productId === productId && c.saleMode === mode);
  if (!item) return;
  const nq = item.qty + delta;
  if (nq <= 0) {
    posCart = posCart.filter(c => !(c.productId === productId && c.saleMode === mode));
  } else {
    item.qty = nq; 
    if (!checkStockCart(productId)) { 
      item.qty -= delta; // rollback
      UI.toast('Stock insuffisant', 'warning'); return; 
    }
    item.total = nq * item.unitPrice;
  }
  refreshCartUI(); updateCardUI(productId);
}

function setQtyDirect(productId, mode, val) {
  const nq = parseInt(val);
  if (isNaN(nq) || nq < 1) return;
  const item = posCart.find(c => c.productId === productId && c.saleMode === mode);
  if (!item) return;
  const oldQty = item.qty;
  item.qty = nq;
  if (!checkStockCart(productId)) { 
    item.qty = oldQty; // rollback
    UI.toast('Stock insuffisant', 'warning'); return; 
  }
  item.total = nq * item.unitPrice;
  refreshCartUI(); updateCardUI(productId);
}

function removeItem(productId, mode) {
  posCart = posCart.filter(c => !(c.productId === productId && c.saleMode === mode));
  refreshCartUI(); updateCardUI(productId);
}

/**
 * Met à jour UNIQUEMENT la carte d'un produit spécifique (class + badge qty)
 * au lieu de re-générer toute la grille. ~50ms au lieu de ~5s sur mobile.
 */
function updateCardUI(productId) {
  const card = document.querySelector(`.prod-card[data-pid="${productId}"]`);
  if (!card) return;
  const inCart = posCart.find(c => c.productId === productId);
  // Toggle classe visuelle
  if (inCart) {
    card.classList.add('prod-incart');
  } else {
    card.classList.remove('prod-incart');
  }
  // Mettre à jour le badge quantité dans prod-top
  const topDiv = card.querySelector('.prod-top');
  if (topDiv) {
    const existingBadge = topDiv.querySelector('.tag-cart');
    if (inCart) {
      const totalQty = posCart.filter(c => c.productId === productId).reduce((s, c) => s + c.qty, 0);
      if (existingBadge) {
        existingBadge.textContent = totalQty;
      } else {
        topDiv.insertAdjacentHTML('beforeend', `<span class="tag-cart">${totalQty}</span>`);
      }
    } else if (existingBadge) {
      existingBadge.remove();
    }
  }
}

function viderPanier() {
  const pids = [...new Set(posCart.map(c => c.productId))]; // IDs uniques
  posCart = [];
  clearClientUI();
  detachRx();
  const rt = document.getElementById('rx-toggle');
  if (rt) { rt.checked = false; onRxToggle(false); }
  const disc = document.getElementById('pos-discount');
  if (disc) disc.value = 0;
  const ci = document.getElementById('cash-in');
  if (ci) ci.value = '';
  refreshCartUI();
  // Mettre à jour uniquement les cartes qui étaient dans le panier
  pids.forEach(pid => updateCardUI(pid));
}

function refreshCartUI() {
  const body = document.getElementById('pos-cart-items');
  if (!body) return;

  // Update count badge
  const total = posCart.reduce((a, c) => a + c.qty, 0);
  const countBadge = document.getElementById('cart-count');
  if (countBadge) countBadge.textContent = total > 0 ? `${total} article${total > 1 ? 's' : ''}` : '0 article';

  if (!posCart.length) {
    body.innerHTML = `<div class="cart-placeholder"><div class="cart-placeholder-icon"><i data-lucide="shopping-cart"></i></div><div class="cart-placeholder-text">Panier vide</div><div class="cart-placeholder-sub">Cliquez sur un médicament à gauche</div></div>`;
    refreshTotals();
    if (window.lucide) lucide.createIcons();
    return;
  }

  body.innerHTML = posCart.map(item => `
    <div class="cart-line">
      <div class="cart-line-info">
        <div class="cart-line-name">${item.name}${item.requiresPrescription ? ' <span class="tag-rx-xs">Rx</span>' : ''}</div>
        ${item.dci ? `<div class="cart-line-dci">${item.dci}${item.dosage ? ' · ' + item.dosage : ''}</div>` : ''}
        <div class="cart-line-pu">${UI.formatCurrency(item.unitPrice)} / ${item.saleMode === 'unit' ? 'unité' : (item.saleMode === 'subunit' ? 'plaquette' : 'boîte')}</div>
      </div>
      <div class="cart-line-qty">
        <button class="qty-ctrl" onclick="changeQty(${item.productId}, '${item.saleMode}', -1)">−</button>
        <input type="number" class="qty-direct" value="${item.qty}" min="1"
          onchange="setQtyDirect(${item.productId}, '${item.saleMode}', this.value)"
          onfocus="this.select()">
        <button class="qty-ctrl" onclick="changeQty(${item.productId}, '${item.saleMode}', +1)">+</button>
      </div>
      <div class="cart-line-right">
        <div class="cart-line-total">${UI.formatCurrency(item.total)}</div>
        <button class="cart-notice-btn" onclick="showProductNotice(${item.productId})" title="Notice médicale" style="background:none;border:1px solid var(--border);border-radius:6px;padding:3px 6px;cursor:pointer;color:var(--info);font-size:12px;transition:all 0.2s"><i data-lucide="info" style="width:14px;height:14px"></i></button>
        <button class="cart-line-del" onclick="removeItem(${item.productId}, '${item.saleMode}')" title="Retirer"><i data-lucide="trash-2"></i></button>
      </div>
    </div>`).join('');

  refreshTotals();
  // Lucide uniquement sur le panier (pas tout le DOM)
  if (window.lucide) { const b = document.getElementById('pos-cart-items'); if (b) lucide.createIcons({node: b}); }
}

function refreshTotals() {
  const sub = posCart.reduce((a, c) => a + c.total, 0);
  const disc = Math.max(0, parseFloat(document.getElementById('pos-discount')?.value || 0));
  const tot = Math.max(0, sub - disc);
  const el1 = document.getElementById('pos-subtotal');
  const el2 = document.getElementById('pos-total');
  if (el1) el1.textContent = UI.formatCurrency(sub);
  if (el2) el2.textContent = UI.formatCurrency(tot);

  // Générer les raccourcis de paiement cash
  if (typeof buildCashShortcuts === 'function') buildCashShortcuts(tot);

  // Protection marge : vérifier que la remise ne fait pas passer sous le prix d'achat
  const totalPurchase = posCart.reduce((a, c) => a + (c.purchasePrice || 0) * c.qty, 0);
  const marginWarn = document.getElementById('margin-warning');
  if (disc > 0 && tot < totalPurchase) {
    const role = DB.AppState.currentUser?.role;
    if (role === 'caissier') {
      // Blocage dur pour les caissiers
      const el = document.getElementById('pos-discount');
      const maxDisc = Math.max(0, sub - totalPurchase);
      if (el) el.value = maxDisc;
      const correctedTot = Math.max(0, sub - maxDisc);
      if (el2) el2.textContent = UI.formatCurrency(correctedTot);
      UI.toast('⛔ Remise bloquée — interdit de vendre en dessous du prix d\'achat', 'error', 4000);
    }
    if (!marginWarn) {
      const warn = document.createElement('div');
      warn.id = 'margin-warning';
      warn.className = 'margin-warning-banner';
      warn.innerHTML = '<i data-lucide="alert-triangle"></i> <span>Attention : la remise fait passer en dessous du coût d\'achat !</span>';
      warn.style.cssText = 'display:flex;align-items:center;gap:8px;padding:8px 12px;background:rgba(231,76,60,0.1);border:1px solid rgba(231,76,60,0.3);border-radius:8px;color:#e74c3c;font-size:12px;font-weight:600;margin-top:8px';
      document.querySelector('.pos-totals-block')?.appendChild(warn);
      if (window.lucide) lucide.createIcons();
    }
  } else {
    if (marginWarn) marginWarn.remove();
  }

  buildCashShortcuts(tot);
  refreshChange();
  if (getPayMethod() === 'combined') refreshCombined();
  if (getPayMethod() === 'assurance') {
    calcAssurance();
  } else {
    // Cacher le bandeau ventilation si on n'est plus en mode assurance
    const splitBanner = document.getElementById('assur-split-banner');
    if (splitBanner) splitBanner.style.display = 'none';
  }
}

function quickDiscount(pct) {
  const sub = posCart.reduce((a, c) => a + c.total, 0);
  const totalPurchase = posCart.reduce((a, c) => a + (c.purchasePrice || 0) * c.qty, 0);
  const discAmount = Math.round(sub * pct / 100);
  const role = DB.AppState.currentUser?.role;
  // Caissier : plafonner la remise à (sub - totalPurchase)
  const finalDisc = (role === 'caissier' && (sub - discAmount) < totalPurchase)
    ? Math.max(0, sub - totalPurchase)
    : discAmount;
  const el = document.getElementById('pos-discount');
  if (el) { el.value = finalDisc; refreshTotals(); }
}

// ═══════════════════════════════════════════════════════════════════
// PAIEMENT
// ═══════════════════════════════════════════════════════════════════
function getTotal() { const s = posCart.reduce((a, c) => a + c.total, 0); return Math.max(0, s - getDiscount()); }
function getDiscount() { return Math.max(0, parseFloat(document.getElementById('pos-discount')?.value || 0)); }
function getPayMethod() { return document.querySelector('.pay-btn.active')?.dataset.m || 'cash'; }

function selectPay(btn) {
  document.querySelectorAll('.pay-btn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  const m = btn.dataset.m;
  document.getElementById('pay-cash').style.display = m === 'cash' ? 'block' : 'none';
  document.getElementById('pay-mobile').style.display = ['orange_money', 'mtn_momo'].includes(m) ? 'block' : 'none';
  document.getElementById('pay-combined').style.display = m === 'combined' ? 'block' : 'none';
  document.getElementById('pay-assurance').style.display = m === 'assurance' ? 'block' : 'none';
  document.getElementById('pay-credit').style.display = m === 'credit' ? 'block' : 'none';
  posMobilePayState = 'idle';
  resetMobilePayUI();
  if (['orange_money', 'mtn_momo'].includes(m) && posCurrentPatient?.phone) {
    document.getElementById('mm-phone').value = posCurrentPatient.phone;
  }
  if (m === 'combined') {
    refreshCombined();
    onCombinedChange();
  }
  if (m === 'assurance') {
    renderDynamicAssurances();
    calcAssurance();
    if (posCurrentPatient?.phone) {
        const ph = document.getElementById('assur-patient-phone');
        if (ph && !ph.value) ph.value = posCurrentPatient.phone;
    }
  }
}

function renderDynamicAssurances() {
  const container = document.getElementById('assur-dynamic-list');
  if (!container) return;
  
  if (posCurrentPatient && posCurrentPatient.assurances && posCurrentPatient.assurances.length > 0) {
    const total = getTotal();
    let html = '';
    posCurrentPatient.assurances.forEach((assur, idx) => {
      const covAmt = total * (assur.coverage / 100);
      html += `
        <div class="dynamic-assur-block" style="padding:10px; border:1px solid var(--border); border-radius:8px; margin-bottom:10px; background:var(--surface)">
          <div style="display:flex; justify-content:space-between; margin-bottom:8px">
            <strong><i data-lucide="shield" style="width:14px;height:14px;margin-right:4px"></i>${assur.name} (${assur.coverage}%)</strong>
            <span style="color:var(--text-muted); font-size:11px">${assur.ref || 'Sans réf.'}</span>
          </div>
          <input type="hidden" class="assur-name-field" value="${assur.name}">
          <input type="hidden" class="assur-ref-field" value="${assur.ref}">
          <div style="font-size:11px;font-weight:700;color:#1A56DB; margin-bottom:6px">🛡️ Part prise en charge :</div>
          <input type="number" class="pay-input assur-amount-field" value="${covAmt}" oninput="calcAssurance()" style="border-color:#1A56DB">
        </div>
      `;
    });
    container.innerHTML = html;
    if (window.lucide) lucide.createIcons();
  } else {
    // Default single assurance manual form
    container.innerHTML = `
      <label class="pay-detail-label">Organisme & Prise en charge</label>
      <input id="assur-name" type="text" class="pay-input assur-name-field" placeholder="Nom de l'assurance / Entreprise" style="margin-bottom:8px">
      <input id="assur-ref" type="text" class="pay-input assur-ref-field" placeholder="Réf. Prise en charge" style="margin-bottom:8px">
      <div style="margin-bottom:6px;font-size:11px;font-weight:700;color:#1A56DB">🛡️ Montant pris en charge par l'entreprise :</div>
      <input id="assur-amount" type="number" class="pay-input assur-amount-field" placeholder="Part couverte par l'assurance (pas le total)" oninput="calcAssurance()" style="border-color:#1A56DB">
    `;
  }
}


// ═══════════════════════════════════════════════════════════════════
// PAIEMENT COMBINÉ — Split Payment (2 modes max)
// ═══════════════════════════════════════════════════════════════════
function refreshCombined() {
  const total = getTotal();
  const a1 = parseFloat(document.getElementById('combined-amount-1')?.value || 0);
  const a2 = parseFloat(document.getElementById('combined-amount-2')?.value || 0);
  const sum = a1 + a2;
  const el = document.getElementById('combined-status');
  if (!el) return;
  if (sum === 0) {
    el.style.background = 'var(--bg)';
    el.style.color = 'var(--text-muted)';
    el.innerHTML = 'Saisissez les montants';
  } else if (sum < total) {
    const rest = total - sum;
    el.style.background = 'rgba(231,76,60,0.1)';
    el.style.color = '#e74c3c';
    el.innerHTML = `<i data-lucide="alert-circle" style="width:16px;height:16px;vertical-align:text-bottom;margin-right:4px"></i> Insuffisant — Manque ${UI.formatCurrency(rest)}`;
  } else if (sum > total) {
    const change = sum - total;
    el.style.background = 'rgba(46,175,125,0.1)';
    el.style.color = '#2eaf7d';
    el.innerHTML = `<i data-lucide="check-circle" style="width:16px;height:16px;vertical-align:text-bottom;margin-right:4px"></i> OK — Monnaie à rendre : ${UI.formatCurrency(change)}`;
  } else {
    el.style.background = 'rgba(46,175,125,0.1)';
    el.style.color = '#2eaf7d';
    el.innerHTML = `<i data-lucide="check-circle" style="width:16px;height:16px;vertical-align:text-bottom;margin-right:4px"></i> Montant exact — Parfait !`;
  }
  if (window.lucide) lucide.createIcons();
}

function onCombinedChange() {
  const m1 = document.getElementById('combined-method-1')?.value || 'cash';
  const m2 = document.getElementById('combined-method-2')?.value || 'orange_money';
  const hasMM = [m1, m2].some(m => ['orange_money', 'mtn_momo'].includes(m));
  const phoneRow = document.getElementById('combined-phone-row');
  if (phoneRow) phoneRow.style.display = hasMM ? 'block' : 'none';
  if (hasMM && posCurrentPatient?.phone) {
    const ph = document.getElementById('combined-mm-phone');
    if (ph && !ph.value) ph.value = posCurrentPatient.phone;
  }
}

// ═══════════════════════════════════════════════════════════════════
// PRISE EN CHARGE (Assurance / Tiers payant)
// ═══════════════════════════════════════════════════════════════════
function calcAssurance() {
  const total = getTotal();
  
  // Aggregate all assurance amounts
  let assurAmt = 0;
  document.querySelectorAll('.assur-amount-field').forEach(input => {
    assurAmt += parseFloat(input.value || 0);
  });
  
  const patientPart = Math.max(0, total - assurAmt);
  
  const elPatientPart = document.getElementById('assur-patient-part');
  if (elPatientPart) {
    elPatientPart.textContent = UI.formatCurrency(patientPart);
  }

  // Mise à jour du bandeau ventilation dans les totaux
  const splitBanner = document.getElementById('assur-split-banner');
  if (splitBanner) {
    if (assurAmt > 0) {
      splitBanner.style.display = 'block';
      const elEnterprise = document.getElementById('assur-split-enterprise');
      const elPatient = document.getElementById('assur-split-patient');
      if (elEnterprise) elEnterprise.textContent = UI.formatCurrency(Math.min(assurAmt, total));
      if (elPatient) elPatient.textContent = UI.formatCurrency(patientPart);
    } else {
      splitBanner.style.display = 'none';
    }
  }

  // Toggle fields based on patient's payment method
  const pMethod = document.getElementById('assur-patient-method')?.value || 'cash';
  const pRecvWrap = document.getElementById('assur-patient-recv-wrap');
  const pPhoneWrap = document.getElementById('assur-patient-phone-wrap');
  
  if (pMethod === 'cash') {
    if (pRecvWrap) pRecvWrap.style.display = 'block';
    if (pPhoneWrap) pPhoneWrap.style.display = 'none';
  } else {
    // Mobile money
    if (pRecvWrap) pRecvWrap.style.display = 'none';
    if (pPhoneWrap) pPhoneWrap.style.display = 'block';
  }

  // Status for cash change
  const statEl = document.getElementById('assur-status');
  if (statEl) {
    if (patientPart === 0) {
      statEl.innerHTML = '<span style="color:#2eaf7d"><i data-lucide="check-circle" style="width:14px;height:14px;vertical-align:text-bottom"></i> Couverture totale — Rien à payer par le patient.</span>';
    } else if (pMethod === 'cash') {
      const recv = parseFloat(document.getElementById('assur-patient-recv')?.value || 0);
      if (recv < patientPart) {
        statEl.innerHTML = `<span style="color:#e74c3c"><i data-lucide="alert-circle" style="width:14px;height:14px;vertical-align:text-bottom"></i> Manque ${UI.formatCurrency(patientPart - recv)}</span>`;
      } else {
        statEl.innerHTML = `<span style="color:#2eaf7d"><i data-lucide="check-circle" style="width:14px;height:14px;vertical-align:text-bottom"></i> Monnaie à rendre : ${UI.formatCurrency(recv - patientPart)}</span>`;
      }
    } else {
      statEl.innerHTML = `<span style="color:#2E86C1"><i data-lucide="info" style="width:14px;height:14px;vertical-align:text-bottom"></i> ${UI.formatCurrency(patientPart)} seront prélevés par Mobile Money.</span>`;
    }
    if (window.lucide) lucide.createIcons();
  }
}

function buildCashShortcuts(total) {
  const el = document.getElementById('cash-shortcuts');
  if (!el) return;
  if (!total) { el.innerHTML = ''; return; }
  const bills = [1000, 2000, 5000, 10000, 20000, 50000, 100000, 200000, 500000];
  const shown = bills.filter(b => b >= total).slice(0, 4);
  if (!shown.length || shown[0] !== total) shown.unshift(total);
  el.innerHTML = shown.slice(0, 5).map(b =>
    `<button class="cash-pill" onclick="setCashIn(${b})">${UI.formatCurrency(b)}</button>`
  ).join('');
}

function setCashIn(v) {
  const el = document.getElementById('cash-in');
  if (el) { el.value = v; refreshChange(); }
}

function refreshChange() {
  const total = getTotal();
  const recv = parseFloat(document.getElementById('cash-in')?.value || 0);
  const el = document.getElementById('cash-change');
  if (!el) return;
  if (!recv) { el.textContent = '—'; el.className = 'change-amount'; return; }
  const diff = recv - total;
  el.textContent = diff >= 0
    ? `${UI.formatCurrency(diff)} GNF`
    : `Insuffisant — Manque ${UI.formatCurrency(Math.abs(diff))}`;
  el.className = 'change-amount ' + (diff >= 0 ? 'change-ok' : 'change-ko');
}

function refreshMmPhone() {
  // Reset payment state when phone changes
  posMobilePayState = 'idle';
  resetMobilePayUI();
}

// ═══════════════════════════════════════════════════════════════════
// MOBILE MONEY — Vrai Gateway avec simulation API
// ═══════════════════════════════════════════════════════════════════


function resetMobilePayUI() {
  const el = document.getElementById('mm-state');
  if (!el) return;
  el.className = 'mm-state mm-idle';
  el.innerHTML = `<button class="btn btn-sm btn-primary mm-send-btn" onclick="initMobilePay()"><i data-lucide="send"></i> Envoyer la demande de paiement</button>`;
  if (window.lucide) lucide.createIcons();
}

async function initMobilePay() {
  const phone = document.getElementById('mm-phone')?.value?.trim();
  if (!phone) { UI.toast('Entrez le numéro de téléphone du client', 'warning'); return; }
  const total = getTotal();
  if (total <= 0) { UI.toast('Panier vide ou montant nul', 'error'); return; }
  const method = getPayMethod();
  const desc = `Pharmacie — ${posCart.length} article(s) — ${UI.formatCurrency(total)}`;
  posMobilePayState = 'en_attente';
  await MobileMoneyGateway.initiatePayment({
    method, phone, amount: total, description: desc,
    onSuccess: () => { posMobilePayState = 'confirme'; },
    onFailure: (msg) => { posMobilePayState = 'echoue'; },
  });
}

// ═══════════════════════════════════════════════════════════════════
// CLIENT / PATIENT
// ═══════════════════════════════════════════════════════════════════
/** Positionne le dropdown client-suggest en position: fixed par rapport à l'input */
function positionClientDropdown() {
  const input = document.getElementById('client-input');
  const dd = document.getElementById('client-suggest');
  if (!input || !dd) return;
  const rect = input.getBoundingClientRect();
  const ddWidth = Math.max(320, rect.width); // Plus large pour le mobile et la lisibilité

  let left = rect.left;
  const screenWidth = window.innerWidth;

  // Si on est trop à droite, on aligne la droite du dropdown avec la droite de l'input
  if (left + ddWidth > screenWidth - 20) {
    left = rect.right - ddWidth;
  }

  // Sécurité bord gauche
  if (left < 10) left = 10;

  dd.style.top = (rect.bottom + 5) + 'px';
  dd.style.left = left + 'px';
  dd.style.width = ddWidth + 'px';
}

function onClientFocus() { showPatientRepertory(); }

// Fermer le dropdown quand on clique ailleurs (obsolète mais gardé pour compatibilité structurelle si besoin)
document.addEventListener('click', function (e) {
  if (!e.target.closest || !e.target.closest('.client-field-wrap')) {
    const dd = document.getElementById('client-suggest');
    if (dd) dd.style.display = 'none';
  }
});

async function selectPatient(id) {
  const pt = (window._posPatients || []).find(p => p.id === id);
  if (!pt) return;
  posCurrentPatient = pt;
  renderClientBadge(pt);
  if (pt.phone) {
    const ph = document.getElementById('mm-phone');
    if (ph) ph.value = pt.phone;
  }
  if (pt.allergies) UI.toast(`Allergie connue — ${pt.name} : ${pt.allergies}`, 'error', 7000);
}

function renderClientBadge(pt) {
  const el = document.getElementById('client-badge');
  if (!el) return;
  el.style.display = 'block';
  el.innerHTML = `
    <div class="client-badge-card premium-badge">
      <div class="cb-avatar">${(pt.name || '?').charAt(0).toUpperCase()}</div>
      <div class="cb-info">
        <div class="cb-header">
          <div class="cb-name">${pt.name}</div>
          <button class="cb-clear-btn" onclick="clearClientUI()" title="Retirer le patient"><i data-lucide="x"></i></button>
        </div>
        <div class="cb-details">
          <span class="cb-detail-item"><i data-lucide="phone"></i> ${pt.phone || '—'}</span>
          <span class="cb-detail-item"><i data-lucide="calendar"></i> ${pt.dob ? calcAge(pt.dob) + ' ans' : '—'}</span>
          <span class="cb-detail-item"><i data-lucide="map-pin"></i> ${pt.address || '—'}</span>
        </div>
        ${pt.allergies ? `<div class="cb-allergy"><i data-lucide="alert-triangle"></i> Allergies : ${pt.allergies}</div>` : ''}
      </div>
    </div>`;
  if (window.lucide) lucide.createIcons({ props: { size: 14 } });
}

function clearClientUI() {
  posCurrentPatient = null;
  const inp = document.getElementById('client-input');
  if (inp) inp.value = '';
  const badge = document.getElementById('client-badge');
  if (badge) badge.style.display = 'none';
}

function calcAge(dob) {
  if (!dob) return '?';
  const today = new Date(), birth = new Date(dob);
  let age = today.getFullYear() - birth.getFullYear();
  if (today < new Date(today.getFullYear(), birth.getMonth(), birth.getDate())) age--;
  return age;
}

async function showPatientRepertory() {
  const patients = await DB.dbGetAll('patients');
  window._repertoryPatients = patients.sort((a, b) => (a.name || '').localeCompare(b.name || '', 'fr'));
  window._repertoryPage = 1;

  const content = `
    <div style="margin-bottom:15px">
      <div class="pos-searchfield">
        <span class="pos-searchicon"><i data-lucide="search"></i></span>
        <input type="text" class="pos-searchinput" placeholder="Chercher un nom, téléphone ou adresse..." oninput="filterRepertory(this.value)" autofocus>
      </div>
    </div>
    <div id="repertory-list" style="max-height:450px; overflow-y:auto; border:1px solid var(--border); border-radius:var(--radius-sm); background:var(--surface)"></div>
  `;

  UI.modal('Répertoire des Patients', content, { size: 'large' });
  if (window.lucide) lucide.createIcons();
  renderRepertoryPage(1);
}

function renderRepertoryPage(page) {
  window._repertoryPage = page || 1;
  const PAGE_SIZE = 50;
  const list = window._repertoryFilteredPatients || window._repertoryPatients || [];
  const totalPages = Math.ceil(list.length / PAGE_SIZE) || 1;
  const p = Math.max(1, Math.min(window._repertoryPage, totalPages));
  const start = (p - 1) * PAGE_SIZE;
  const pageItems = list.slice(start, start + PAGE_SIZE);

  let html = renderRepertoryItems(pageItems);

  if (totalPages > 1) {
    html += `
      <div style="display:flex; justify-content:space-between; align-items:center; padding:12px 16px; border-top:1px solid var(--border); background:var(--bg)">
        <span style="font-size:12px; color:var(--text-muted)">Page ${p} / ${totalPages} (${list.length} patients)</span>
        <div style="display:flex; gap:8px">
          <button class="btn btn-sm btn-secondary" onclick="renderRepertoryPage(${p - 1})" ${p <= 1 ? 'disabled' : ''}>◀ Préc.</button>
          <button class="btn btn-sm btn-secondary" onclick="renderRepertoryPage(${p + 1})" ${p >= totalPages ? 'disabled' : ''}>Suiv. ▶</button>
        </div>
      </div>
    `;
  }

  const container = document.getElementById('repertory-list');
  if (container) {
    container.innerHTML = html;
    if (window.lucide) lucide.createIcons();
  }
}

function renderRepertoryItems(list) {
  if (!list.length) return '<div style="padding:40px; text-align:center; color:var(--text-muted)"><i data-lucide="search-x" style="width:40px;height:40px;opacity:0.2;margin-bottom:10px"></i><br>Aucun patient trouvé</div>';
  return list.map(p => `
    <div class="user-item" style="cursor:pointer; padding:12px 18px; border-bottom:1px solid var(--bg); transition:background 0.2s" 
         onclick="selectPatient(${p.id}); UI.closeModal()" onmouseover="this.style.background='var(--bg)'" onmouseout="this.style.background='transparent'">
      <div class="user-avatar" style="background:var(--primary-light)">${(p.name || '?').charAt(0).toUpperCase()}</div>
      <div class="user-info">
        <div class="user-name" style="font-weight:600">${p.name}</div>
        <div class="user-meta">${p.phone || '—'} · <span style="opacity:0.7">${p.address || 'Sans adresse'}</span></div>
      </div>
      <i data-lucide="chevron-right" style="opacity:0.3"></i>
    </div>
  `).join('');
}

window.filterRepertory = (val) => {
  const q = val.toLowerCase();
  const all = window._repertoryPatients || [];
  if (!q) {
    window._repertoryFilteredPatients = null;
    renderRepertoryPage(1);
    return;
  }
  window._repertoryFilteredPatients = all.filter(p =>
    (p.name || '').toLowerCase().includes(q) ||
    (p.phone || '').includes(q) ||
    (p.address || '').toLowerCase().includes(q)
  );
  renderRepertoryPage(1);
};

function showQuickNewClient(prefill) {
  const dd = document.getElementById('client-suggest');
  if (dd) dd.style.display = 'none';
  UI.modal('👤 Nouveau Patient', `
    <form id="qp-form" class="form-grid">
      <div class="form-row">
        <div class="form-group">
          <label>Nom complet *</label>
          <input type="text" name="name" class="form-control" value="${prefill || ''}" required autofocus>
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
          <select name="gender" class="form-control"><option value="">—</option><option>Masculin</option><option>Féminin</option></select>
        </div>
      </div>
      <div class="form-group">
        <label>Allergies connues</label>
        <input type="text" name="allergies" class="form-control" placeholder="Ex : Pénicilline, Aspirine">
      </div>
      <div class="form-group">
        <label>Adresse</label>
        <input type="text" name="address" class="form-control" placeholder="Quartier, Commune">
      </div>
    </form>`,
    { footer: `<button class="btn btn-secondary" onclick="UI.closeModal()">Annuler</button><button class="btn btn-primary" onclick="saveQuickClient()">✓ Enregistrer</button>` });
}

async function saveQuickClient() {
  const form = document.getElementById('qp-form');
  if (!form?.checkValidity()) { form?.reportValidity(); return; }
  const data = Object.fromEntries(new FormData(form));
  const id = await DB.dbAdd('patients', { ...data, createdAt: new Date().toISOString() });
  const newPt = { ...data, id };
  window._posPatients = [...(window._posPatients || []), newPt];
  UI.closeModal();
  await selectPatient(id);
  UI.toast(`✅ Patient ${data.name} enregistré`, 'success');
}

// ═══════════════════════════════════════════════════════════════════
// ORDONNANCE
// ═══════════════════════════════════════════════════════════════════
function onRxToggle(checked) {
  const detail = document.getElementById('rx-detail');
  const section = document.getElementById('pos-rx-section');
  if (detail) detail.style.display = checked ? 'block' : 'none';
  if (section) section.classList.toggle('pos-section-rx-active', checked);
  if (!checked) detachRx();
}

function detachRx() {
  posCurrentRx = null;
  const el = document.getElementById('rx-badge');
  if (el) el.style.display = 'none';
}

async function openRxPicker() {
  const rxList = window._posPrescriptions || [];
  const filtered = posCurrentPatient
    ? rxList.filter(rx => rx.patientId === posCurrentPatient.id || !rx.patientId)
    : rxList;

  if (!filtered.length) {
    showQuickNewRx();
    return;
  }

  UI.modal('📄 Sélectionner une Ordonnance', `
    <div class="rx-picker-list">
      ${filtered.map(rx => `
        <div class="rx-pick-card" onclick="attachRx(${rx.id})">
          <div class="rx-pick-ref-block">
            <div class="rx-pick-ref">Rx-${String(rx.id).padStart(5, '0')}</div>
            <div class="rx-pick-date">${UI.formatDate(rx.date)}</div>
            <span class="badge badge-${rx.status === 'validated' ? 'success' : 'warning'} badge-sm">${rx.status === 'validated' ? '<i data-lucide="check-circle"></i> Validée' : '<i data-lucide="clock"></i> En attente'}</span>
          </div>
          <div class="rx-pick-body">
            <div class="rx-pick-patient"><i data-lucide="user"></i> ${rx.patientName || 'Patient anonyme'}</div>
            <div class="rx-pick-doctor"><i data-lucide="stethoscope"></i> Dr ${rx.doctorName || '—'} ${rx.specialty ? '· ' + rx.specialty : ''}</div>
            <div class="rx-pick-drugs">${(rx.items || []).map(i => `<span class="tag-drug">${i.productName}</span>`).join('')}</div>
          </div>
        </div>`).join('')}
    </div>`, { size: 'large' });
}

async function attachRx(rxId) {
  const rx = (window._posPrescriptions || []).find(r => r.id === rxId);
  if (!rx) return;
  posCurrentRx = rx;

  if (!posCurrentPatient && rx.patientId) await selectPatient(rx.patientId);

  // Charger les médicaments prescrits dans le panier
  let added = 0, skipped = [];
  for (const item of (rx.items || [])) {
    const prod = posProductsCache.get(item.productId) || posProducts.find(p => p.id === item.productId);
    if (prod && (posStock[prod.id] || 0) > 0) {
      const want = item.quantity || 1;
      const have = posStock[prod.id] || 0;
      const take = Math.min(want, have);
      const ex = posCart.find(c => c.productId === prod.id);
      if (ex) { ex.qty += take; ex.total = ex.qty * ex.unitPrice; }
      else posCart.push({ productId: prod.id, name: prod.name, dci: prod.dci || '', dosage: prod.dosage || '', unitPrice: prod.salePrice, purchasePrice: prod.purchasePrice || 0, qty: take, total: take * prod.salePrice, requiresPrescription: !!prod.requiresPrescription });
      added += take;
    } else {
      skipped.push(item.productName || 'Produit inconnu');
    }
  }

  UI.closeModal();
  refreshCartUI(); refreshGrid();

  const el = document.getElementById('rx-badge');
  if (el) {
    el.style.display = 'block';
    el.innerHTML = `
      <div class="rx-linked-pill">
        <div class="rx-linked-info">
          <span class="rx-linked-ref"><i data-lucide="file-text"></i> Rx-${String(rxId).padStart(5, '0')}</span>
          <span>Dr ${rx.doctorName || '—'} · ${UI.formatDate(rx.date)}</span>
          ${skipped.length ? `<span class="rx-skipped"><i data-lucide="alert-triangle"></i> Rupture : ${skipped.join(', ')}</span>` : ''}
        </div>
        <button class="btn btn-xs btn-ghost" onclick="detachRx()"><i data-lucide="x"></i></button>
      </div>`;
    if (window.lucide) lucide.createIcons({ props: { size: 14 } });
  }
  UI.toast(`Ordonnance liée — ${added} unité(s) ajoutée(s) au panier`, 'success', 4000);
  if (skipped.length) UI.toast(`Rupture de stock : ${skipped.join(', ')}`, 'warning', 5000);
}

function mettreEnAttente() {
  if (!posCart.length) { UI.toast('Panier vide', 'warning'); return; }
  window._heldCart = { items: [...posCart], patient: posCurrentPatient, rx: posCurrentRx };
  viderPanier();
  UI.toast('Panier mis en attente — Il sera restauré à votre retour', 'info', 5000);
}

// ═══════════════════════════════════════════════════════════════════
// VALIDATION VENTE
// ═══════════════════════════════════════════════════════════════════
async function validerVente() {
  if (!posCart.length) { UI.toast('Le panier est vide', 'warning'); return; }

  // ── Vérification clôture de caisse ──
  const today = new Date().toISOString().split('T')[0];
  const cashRegister = await DB.dbGetAll('cashRegister');
  const todayClosure = cashRegister.find(c => c.date === today && c.type === 'closure');
  if (todayClosure) {
    UI.toast(
      `🔒 Caisse clôturée — Aucune vente possible.\nClôture effectuée à ${UI.formatDateTime(todayClosure.closedAt)} par ${todayClosure.closedBy}.`,
      'error', 7000
    );
    return;
  }

  const method = getPayMethod();
  const total = getTotal();
  const disc = getDiscount();
  const sub = posCart.reduce((a, c) => a + c.total, 0);

  // ── Gate substances contrôlées ──
  const hasControlled = posCart.some(i => i.isControlled);
  if (hasControlled) {
    if (!posCurrentPatient) {
      UI.toast('⛔ Substance contrôlée — Un patient identifié est OBLIGATOIRE', 'error', 6000);
      return;
    }
    const rxCheckedForCtrl = document.getElementById('rx-toggle')?.checked;
    if (!rxCheckedForCtrl || !posCurrentRx) {
      const okCtrl = await UI.confirm('⚠️ SUBSTANCE CONTRÔLÉE\n\nLe panier contient des substances réglementées.\nUne ordonnance doit être liée pour la traçabilité.\n\nContinuer sans ordonnance ?\n(Votre responsabilité est ENGAGÉE)');
      if (!okCtrl) return;
    }
  }

  // ── Protection marge finale ──
  const totalPurchase = posCart.reduce((a, c) => a + (c.purchasePrice || 0) * c.qty, 0);
  if (total < totalPurchase && DB.AppState.currentUser?.role === 'caissier') {
    UI.toast('⛔ Vente refusée — le total est inférieur au coût d\'achat. Contactez le pharmacien.', 'error', 6000);
    return;
  }
  if (total < totalPurchase) {
    const okMargin = await UI.confirm(`⚠️ ATTENTION MARGE\n\nLe total (${UI.formatCurrency(total)}) est inférieur au coût d'achat (${UI.formatCurrency(totalPurchase)}).\n\nVous perdrez ${UI.formatCurrency(totalPurchase - total)} sur cette vente.\n\nConfirmer quand même ?`);
    if (!okMargin) return;
  }

  // Contrôles ordonnance
  const hasRxItems = posCart.some(i => i.requiresPrescription);
  const rxChecked = document.getElementById('rx-toggle')?.checked;
  if (hasRxItems && !rxChecked) {
    const ok = await UI.confirm('Médicament(s) sur ordonnance dans le panier.\n\nConfirmer la vente sans ordonnance liée ?\n(La responsabilité du pharmacien est engagée)');
    if (!ok) return;
  }

  // Contrôles paiement
  if (method === 'cash') {
    const recv = parseFloat(document.getElementById('cash-in')?.value || 0);
    if (recv < total) { UI.toast('Montant reçu insuffisant par rapport au total', 'error'); return; }
  }

  if (['orange_money', 'mtn_momo'].includes(method) && posMobilePayState !== 'confirme') {
    const ok = await UI.confirm('Le paiement Mobile Money n\'est pas encore confirmé.\nValider la vente quand même ?');
    if (!ok) return;
  }

  if (method === 'combined') {
    const a1 = parseFloat(document.getElementById('combined-amount-1')?.value || 0);
    const a2 = parseFloat(document.getElementById('combined-amount-2')?.value || 0);
    if ((a1 + a2) < total) {
      UI.toast('Le total des paiements combinés est insuffisant', 'error');
      return;
    }
  }

  if (method === 'assurance') {
    if (!posCurrentPatient) {
      UI.toast('Un patient doit être sélectionné pour une prise en charge', 'error'); return;
    }
    
    let assurAmt = 0;
    let hasValidationErrors = false;
    document.querySelectorAll('.assur-amount-field').forEach(input => {
      const val = parseFloat(input.value || 0);
      if (val < 0) hasValidationErrors = true;
      assurAmt += val;
    });
    
    if (hasValidationErrors) { UI.toast('Le montant pris en charge est invalide', 'error'); return; }
    if (assurAmt <= 0) {
      UI.toast('Le montant pris en charge global doit être supérieur à zéro', 'error'); return;
    }
    if (assurAmt > total) {
      UI.toast('Le montant assurance global ne peut pas dépasser la facture (' + UI.formatCurrency(total) + ')', 'error'); return;
    }
    // Check patient part rules
    const patientPart = Math.max(0, total - assurAmt);
    const pMethod = document.getElementById('assur-patient-method')?.value || 'cash';
    if (patientPart > 0 && pMethod === 'cash') {
      const pRecv = parseFloat(document.getElementById('assur-patient-recv')?.value || 0);
      if (pRecv < patientPart) {
        UI.toast('La part patient reçue en espèces est insuffisante', 'error'); return;
      }
    }
  }

  if (method === 'credit') {
    if (!posCurrentPatient) {
      UI.toast('Un patient doit être sélectionné pour une vente à crédit', 'error'); return;
    }
    const limit = parseFloat(posCurrentPatient.creditLimit) || 0;
    if (limit <= 0) {
      UI.toast('⛔ Le crédit est bloqué pour ce patient (Plafond à 0).', 'error', 5000); return;
    }
    
    // Check pending debt
    try {
      const allSales = await DB.dbGetAll('sales', 'patientId', posCurrentPatient.id);
      const pendingSales = allSales.filter(s => s.status === 'pending' && s.paymentMethod === 'credit');
      const totalDebt = pendingSales.reduce((a, s) => a + (s.total || 0), 0);
      
      if ((totalDebt + total) > limit) {
        UI.toast(`⛔ Plafond de crédit dépassé.\n\nDettes actuelles: ${UI.formatCurrency(totalDebt)}\nTotal demandé: ${UI.formatCurrency(total)}\n\nPlafond autorisé: ${UI.formatCurrency(limit)}`, 'error', 10000);
        return;
      }
    } catch (e) {
      console.error('[Credit Check Error]', e);
    }
  }

  const btn = document.getElementById('btn-valider');
  if (btn) { btn.disabled = true; btn.textContent = '⏳ Traitement…'; }

  try {
    // Lazy-load lots pour FEFO (chargés à la demande, pas au démarrage)
    if (!posLots.length) {
      const allLots = await DB.dbGetAll('lots');
      posLots = allLots.filter(l => l.status === 'active');
    }

    // Build combined payment details if applicable
    let combinedDetails = null;
    let combinedMmPhone = null;
    if (method === 'combined') {
      const m1 = document.getElementById('combined-method-1')?.value || 'cash';
      const m2 = document.getElementById('combined-method-2')?.value || 'orange_money';
      const a1 = parseFloat(document.getElementById('combined-amount-1')?.value || 0);
      const a2 = parseFloat(document.getElementById('combined-amount-2')?.value || 0);
      combinedDetails = [{ method: m1, amount: a1 }, { method: m2, amount: a2 }];
      combinedMmPhone = document.getElementById('combined-mm-phone')?.value || null;
    }

    // Build assurance data
    let assurData = {};
    let insuranceDetails = null;
    if (method === 'assurance') {
      let assurAmt = 0;
      insuranceDetails = [];
      const blocks = document.querySelectorAll('#assur-dynamic-list .dynamic-assur-block');
      if (blocks.length > 0) {
        blocks.forEach(block => {
          const name = block.querySelector('.assur-name-field').value;
          const ref = block.querySelector('.assur-ref-field').value;
          const amt = parseFloat(block.querySelector('.assur-amount-field').value || 0);
          if (amt > 0) {
            insuranceDetails.push({ name, ref, amount: amt });
            assurAmt += amt;
          }
        });
      } else {
        const name = document.getElementById('assur-name')?.value.trim();
        const ref = document.getElementById('assur-ref')?.value.trim();
        const amt = parseFloat(document.getElementById('assur-amount')?.value || 0);
        if (amt > 0) {
          insuranceDetails.push({ name, ref, amount: amt });
          assurAmt += amt;
        }
      }

      const patientPart = Math.max(0, total - assurAmt);
      const pMethod = document.getElementById('assur-patient-method')?.value || 'cash';
      
      assurData = {
         assuranceName: insuranceDetails.length === 1 ? insuranceDetails[0].name : 'Multi-Assurances',
         assuranceRef: insuranceDetails.length === 1 ? insuranceDetails[0].ref : 'Multiple',
         assuranceAmount: assurAmt,
         insuranceDetails: insuranceDetails.length > 0 ? insuranceDetails : null
      };
      
      combinedDetails = [...insuranceDetails.map(ins => ({ method: 'assurance', amount: ins.amount, entity: ins.name }))];
      if (patientPart > 0) {
         combinedDetails.push({ method: pMethod, amount: patientPart, label: 'Ticket modérateur' });
      }
      
      if (pMethod !== 'cash') {
         combinedMmPhone = document.getElementById('assur-patient-phone')?.value;
      }
    }

    // Calcul du cash reçu formel
    let cashRcv = 0;
    if (method === 'cash') cashRcv = parseFloat(document.getElementById('cash-in')?.value || 0);
    else if (method === 'combined') cashRcv = combinedDetails?.find(d => d.method === 'cash')?.amount || 0;
    else if (method === 'assurance') {
       const pMethod = document.getElementById('assur-patient-method')?.value || 'cash';
       if (pMethod === 'cash') {
           // L'argent reçu physiquement par le patient
           cashRcv = parseFloat(document.getElementById('assur-patient-recv')?.value || 0);
       }
    }

    // Status: credit = pending debt for FULL total
    // assurance = pending debt ONLY for assurance portion (patient part is paid)
    const assurAmt = method === 'assurance' ? parseFloat(document.getElementById('assur-amount')?.value || 0) : 0;
    const patientPart = method === 'assurance' ? Math.max(0, total - assurAmt) : 0;
    const finalStatus = method === 'credit' ? 'pending' : (method === 'assurance' ? 'pending' : 'completed');

    const saleData = {
      ...assurData,
      date: new Date().toISOString(),
      patientId: posCurrentPatient?.id || null,
      patientName: posCurrentPatient?.name || null,
      patientPhone: posCurrentPatient?.phone || null,
      userId: DB.AppState.currentUser?.id,
      sellerName: DB.AppState.currentUser?.name || 'Vendeur inconnu',
      total, subtotal: sub, discount: disc,
      paymentMethod: method,
      paymentDetails: combinedDetails,
      mmPhone: method === 'combined' || method === 'assurance' ? combinedMmPhone : (['orange_money', 'mtn_momo'].includes(method) ? document.getElementById('mm-phone')?.value : null),
      status: finalStatus,
      prescriptionId: posCurrentRx?.id || null,
      prescriptionRef: posCurrentRx ? `Rx-${String(posCurrentRx.id).padStart(5, '0')}` : null,
      doctorName: posCurrentRx?.doctorName || null,
      itemCount: posCart.length,
      creditDueDate: method === 'credit' ? document.getElementById('credit-date')?.value : null,
      cashReceived: cashRcv > 0 ? cashRcv : null,
      insuranceDetails: assurData.insuranceDetails || null
    };

    const saleId = await DB.dbAdd('sales', saleData);

    // Charger le stock UNE SEULE FOIS (pas dans la boucle !)
    const stockAll = await DB.dbGetAll('stock');
    const stockMap = new Map();
    stockAll.forEach(s => stockMap.set(s.productId, s));

    // Traiter tous les articles en parallèle
    const itemPromises = posCart.map(async (item) => {
      const p = posProductsCache.get(item.productId) || posProducts.find(x => x.id === item.productId);
      const isBox = (item.saleMode === 'box');
      const isSub = (item.saleMode === 'subunit');
      let deductQty = item.qty;
      if (p?.allowUnitSale) {
         if (isBox) deductQty = item.qty * (p.unitsPerBox || 1) * (p.subUnitsPerBox || 1);
         else if (isSub) deductQty = item.qty * (p.unitsPerBox || 1);
      }
      
      // FEFO: décrémentation du lot le plus proche de l'expiration
      let assignedLotNumber = item.fefoLotNumber || null;
      let remainingQty = deductQty;
      try {
        const productLots = posLots
          .filter(l => l.productId === item.productId && l.status === 'active' && l.quantity > 0)
          .sort((a, b) => new Date(a.expiryDate) - new Date(b.expiryDate));
        for (const lot of productLots) {
          if (remainingQty <= 0) break;
          const take = Math.min(remainingQty, lot.quantity);
          lot.quantity -= take;
          remainingQty -= take;
          assignedLotNumber = assignedLotNumber || lot.lotNumber;
          await DB.dbPut('lots', lot);
        }
      } catch(e) { console.warn('[FEFO] Erreur décrément lot:', e); }

      await DB.dbAdd('saleItems', {
        saleId, productId: item.productId, productName: item.name,
        quantity: item.qty, unitPrice: item.unitPrice,
        purchasePrice: item.purchasePrice, total: item.total,
        lotNumber: assignedLotNumber, saleMode: item.saleMode || 'box'
      });
      
      // Lookup stock direct via Map O(1) au lieu de dbGetAll
      const se = stockMap.get(item.productId);
      if (se) {
        const nq = Math.max(0, se.quantity - deductQty);
        await DB.dbPut('stock', { ...se, quantity: nq });
        posStock[item.productId] = nq;
      }
      await DB.dbAdd('movements', {
        productId: item.productId, type: 'EXIT', subType: 'SALE',
        quantity: -deductQty, date: new Date().toISOString(),
        userId: DB.AppState.currentUser?.id,
        reference: `SALE-${saleId}`,
        lotNumber: assignedLotNumber,
        note: posCurrentPatient ? `Patient: ${posCurrentPatient.name}` : 'Vente comptoir',
      });
    });
    await Promise.all(itemPromises);

    if (posCurrentRx?.id) {
      const rx = await DB.dbGet('prescriptions', posCurrentRx.id);
      if (rx) await DB.dbPut('prescriptions', { ...rx, status: 'dispensed', dispensedAt: Date.now(), dispensedBy: DB.AppState.currentUser?.id, saleId });
    }

    await DB.writeAudit('SALE', 'sales', saleId, { total, items: posCart.length, method, patient: posCurrentPatient?.name });

    // ── ASSURANCE : Enregistrer la part patient en caisse immédiatement ──
    if (method === 'assurance' && patientPart > 0) {
      const pMethod = document.getElementById('assur-patient-method')?.value || 'cash';
      const today = new Date().toISOString().split('T')[0];
      try {
        await DB.dbAdd('cashRegister', {
          type: 'sale',
          amount: patientPart,
          paymentMethod: pMethod,
          reason: `Ticket modérateur — Vente #${String(saleId).padStart(6, '0')} · ${posCurrentPatient?.name || 'Patient'} (Part patient sur assurance ${saleData.assuranceName || ''})`,
          date: today,
          timestamp: Date.now(),
          userId: DB.AppState.currentUser?.id,
        });
      } catch (e) { console.warn('[Caisse] Erreur enregistrement ticket modérateur:', e); }
    }

    // Envoi SMS reçu après paiement confirmé
    if (['orange_money', 'mtn_momo'].includes(method) && saleData.mmPhone) {
      await MobileMoneyGateway.sendSMSReceipt(saleData.mmPhone, method, total, saleId);
    }

    triggerFeedback('success', `Vente #${String(saleId).padStart(6, '0')} validée !`);

    // Afficher reçu officiel
    const soldPids = [...new Set(posCart.map(c => c.productId))];
    await afficherRecu(saleId, [...posCart], saleData);

    // Reset POS
    posCart = []; posCurrentPatient = null; posCurrentRx = null; posMobilePayState = 'idle';
    const disc2 = document.getElementById('pos-discount'); if (disc2) disc2.value = 0;
    const ci = document.getElementById('cash-in'); if (ci) ci.value = '';
    clearClientUI();
    const rxtog = document.getElementById('rx-toggle');
    if (rxtog) { rxtog.checked = false; onRxToggle(false); }
    resetMobilePayUI();
    refreshCartUI();
    // Mettre à jour uniquement les cartes des produits vendus
    soldPids.forEach(pid => updateCardUI(pid));
    if (typeof updateAlertBadge === 'function') updateAlertBadge();

  } catch (err) {
    console.error(err);
    UI.toast('Erreur : ' + err.message, 'error');
  } finally {
    if (btn) { btn.disabled = false; btn.innerHTML = '<i data-lucide="check-circle"></i> Valider (F5)'; const g = document.getElementById('pos-grid'); if (g && window.lucide) lucide.createIcons({node: g}); }
  }
}

// ═══════════════════════════════════════════════════════════════════
// REÇU OFFICIEL v3 — Professionnel et complet
// ═══════════════════════════════════════════════════════════════════
async function afficherRecu(saleId, items, saleData) {
  // ── Defensive: normaliser les items pour accepter les 2 formats ──
  // posCart: { name, qty, unitPrice, total, dci, dosage, requiresPrescription }
  // saleItems: { productName, quantity, unitPrice, total }
  const normalizedItems = (items || []).map(i => ({
    name: i.name || i.productName || 'Article',
    qty: i.qty || i.quantity || 0,
    unitPrice: i.unitPrice || 0,
    total: i.total || ((i.qty || i.quantity || 0) * (i.unitPrice || 0)),
    dci: i.dci || null,
    dosage: i.dosage || null,
    requiresPrescription: i.requiresPrescription || false,
  }));

  // ── Defensive: saleData fallbacks ──
  saleData = saleData || {};
  saleData.total = saleData.total || 0;
  saleData.discount = saleData.discount || 0;
  saleData.subtotal = saleData.subtotal || saleData.total;
  saleData.paymentMethod = saleData.paymentMethod || 'cash';
  saleData.patientName = saleData.patientName || null;
  saleData.patientPhone = saleData.patientPhone || null;
  saleData.sellerName = saleData.sellerName || null;
  saleData.paymentDetails = Array.isArray(saleData.paymentDetails) ? saleData.paymentDetails : [];

  const settings = await DB.dbGetAll('settings');
  const gs = k => settings.find(s => s.key === k)?.value;
  const nomPharma = gs('pharmacy_name') || 'Pharmacie Centrale de Conakry';
  const addrPharma = gs('pharmacy_address') || 'Avenue de la République, Conakry, Guinée';
  const telPharma = gs('pharmacy_phone') || '+224 620 000 000';
  const emailPharma = gs('pharmacy_email') || '';
  const dnpmPharma = gs('pharmacy_dnpm') || 'LIC-DNPM-2024-001';
  const respPharma = gs('pharmacy_resp') || 'Pharmacien Responsable';
  const payLabels = { cash: 'Espèces', orange_money: 'Orange Money Guinée', mtn_momo: 'MTN Mobile Money', credit: 'Vente à crédit', transfer: 'Virement bancaire', assurance: 'Assurance / Tiers Payant' };
  const now = saleData.date ? new Date(saleData.date) : new Date();
  const cashRecv = saleData.cashReceived || 0;
  const change = saleData.paymentMethod === 'cash' ? Math.max(0, cashRecv - saleData.total) : 0;
  const refNum = String(saleId).padStart(8, '0');

  UI.modal(`🧾 Reçu de Vente — Réf. ${refNum}`, `
    <div class="recu-pro" id="recu-printable">

      <!-- EN-TÊTE -->
      <div class="recu-header">
        <div class="recu-logo-block">
          <div class="recu-logo">💠</div>
        </div>
        <div class="recu-org">
          <div class="recu-orgname">${nomPharma}</div>
          <div class="recu-orgdetail">${addrPharma}</div>
          <div class="recu-orgdetail">Tél : ${telPharma}${emailPharma ? ' · ' + emailPharma : ''}</div>
          <div class="recu-orgdnpm">Licence DNPM : ${dnpmPharma}</div>
        </div>
        <div class="recu-docblock">
          <div class="recu-doctype" style="background:#0c1e35; color:white; padding:4px 8px; border-radius:4px;">${saleData.paymentMethod === 'assurance' ? 'FACTURE / REÇU' : 'REÇU DE VENTE'}</div>
          <div class="recu-docnum">N° ${refNum}</div>
          <div class="recu-docdate">${now.toLocaleDateString('fr-FR', { day: '2-digit', month: 'long', year: 'numeric' })}</div>
          <div class="recu-doctime">${now.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}</div>
        </div>
      </div>
      <div class="recu-sep"></div>

      ${saleData.paymentMethod === 'assurance' ? `
      <!-- ENCART ASSURANCE / PATIENT (FORMAT FACTURE) -->
      <div style="display:flex; justify-content:space-between; margin-bottom:15px; padding:12px; background:var(--surface); border:1px solid var(--border); border-radius:var(--radius-sm);">
        <div>
          <div style="font-size:10px; font-weight:800; color:var(--text-muted); text-transform:uppercase; margin-bottom:4px;">Facturé à (Prise en charge)</div>
          <div style="font-size:16px; font-weight:800; color:var(--primary-color);">${saleData.assuranceName || "Nom de l'assurance"}</div>
          <div style="font-size:13px; color:var(--text); margin-top:2px;">N° Prise en Charge : <strong>${saleData.assuranceRef || "Non Renseigné"}</strong></div>
        </div>
        <div style="text-align:right;">
          <div style="font-size:10px; font-weight:800; color:var(--text-muted); text-transform:uppercase; margin-bottom:4px;">Patient Bénéficiaire</div>
          <div style="font-size:16px; font-weight:700; color:var(--text-color);">${saleData.patientName || 'Nom du patient'}</div>
          ${saleData.patientPhone ? `<div style="font-size:13px; color:var(--text-muted); margin-top:2px;">Contact : ${saleData.patientPhone}</div>` : ''}
        </div>
      </div>
      ` : ''}

      <!-- INFORMATIONS TRANSACTION -->
      <div class="recu-transaction-grid">
        <div class="recu-tx-block recu-tx-client">
          <div class="recu-tx-label">CLIENT</div>
          ${saleData.patientName ? `
            <div class="recu-tx-name">${saleData.patientName}</div>
            ${saleData.patientPhone ? `<div class="recu-tx-sub">${saleData.patientPhone}</div>` : ''}
          ` : `<div class="recu-tx-name recu-tx-anon">Client de passage</div>`}
        </div>
        <div class="recu-tx-block recu-tx-payment">
          <div class="recu-tx-label">PAIEMENT</div>
          <div class="recu-tx-name">${saleData.paymentMethod === 'combined' ? 'Paiement Mixte' : (payLabels[saleData.paymentMethod] || saleData.paymentMethod)}</div>
          ${saleData.paymentMethod === 'assurance' ? `
            <div class="recu-tx-sub" style="font-weight:800; color:var(--primary); margin-top:4px;">${saleData.assuranceName || 'Assurance'}</div>
            <div class="recu-tx-sub">N° ${saleData.assuranceRef || 'Non Renseigné'}</div>
          ` : ''}
          ${saleData.mmPhone && saleData.paymentMethod !== 'assurance' ? `<div class="recu-tx-sub">${saleData.mmPhone}</div>` : ''}
          ${saleData.creditDueDate ? `<div class="recu-tx-sub">Échéance : ${UI.formatDate(saleData.creditDueDate)}</div>` : ''}
        </div>
        <div class="recu-tx-block recu-tx-caissier">
          <div class="recu-tx-label">CAISSIER</div>
          <div class="recu-tx-name">${saleData.sellerName || DB.AppState.currentUser?.name || '—'}</div>
        </div>
        ${saleData.prescriptionRef ? `
        <div class="recu-tx-block recu-tx-rx">
          <div class="recu-tx-label">ORDONNANCE</div>
          <div class="recu-tx-name">${saleData.prescriptionRef}</div>
          ${saleData.doctorName ? `<div class="recu-tx-sub">Dr ${saleData.doctorName}</div>` : ''}
        </div>` : ''}
      </div>
      <div class="recu-sep"></div>

      <!-- TABLEAU DES MÉDICAMENTS -->
      <table class="recu-table">
        <thead>
          <tr>
            <th class="recu-th-product">Médicament / Désignation</th>
            <th class="recu-th-qty ta-c">Qté</th>
            <th class="recu-th-pu ta-r">P.U. (GNF)</th>
            <th class="recu-th-total ta-r">Total (GNF)</th>
          </tr>
        </thead>
        <tbody>
          ${normalizedItems.map((i, idx) => `
            <tr class="${idx % 2 === 0 ? 'recu-row-even' : ''}">
              <td>
                <div class="recu-drug-name">${i.name}${i.requiresPrescription ? ` <span class="tag-rx-print">Rx</span>` : ''}</div>
                ${i.dci ? `<div class="recu-drug-sub">${i.dci}${i.dosage ? ' · ' + i.dosage : ''}</div>` : ''}
              </td>
              <td class="ta-c recu-td-qty">${i.qty}</td>
              <td class="ta-r">${UI.formatCurrency(i.unitPrice)}</td>
              <td class="ta-r recu-td-total">${UI.formatCurrency(i.total)}</td>
            </tr>`).join('')}
        </tbody>
      </table>
      <div class="recu-sep"></div>

      <!-- TOTAUX -->
      <div class="recu-totaux-block">
        <div class="recu-totaux">
          ${saleData.discount > 0 ? `
            <div class="recu-tot-row">
              <span>Sous-total</span>
              <span>${UI.formatCurrency(saleData.subtotal)}</span>
            </div>
            <div class="recu-tot-row recu-remise">
              <span>Remise accordée</span>
              <span>− ${UI.formatCurrency(saleData.discount)}</span>
            </div>` : ''}
          <div class="recu-tot-row recu-tot-main">
            <span>TOTAL FACTURE (TTC)</span>
            <span>${UI.formatCurrency(saleData.total)}</span>
          </div>

          ${saleData.paymentMethod === 'assurance' && saleData.assuranceAmount ? `
            <div style="margin-top:12px; padding-top:12px; border-top:1px dashed var(--border);">
              <div style="font-size:10px; font-weight:800; color:var(--text-muted); text-transform:uppercase; letter-spacing:1px; margin-bottom:8px;">Ventilation du Règlement</div>
              <div class="recu-tot-row" style="font-size:13px; margin-bottom:6px;">
                <span>🛡️ Prise en charge <strong>${saleData.assuranceName || 'Assurance'}</strong></span>
                <span style="font-weight:800; color:var(--primary-color);">${UI.formatCurrency(saleData.assuranceAmount)}</span>
              </div>
              <div class="recu-tot-row" style="font-size:13px; margin-bottom:4px;">
                <span>👤 Part patient (Ticket modérateur)</span>
                <span style="font-weight:700;">${UI.formatCurrency(Math.max(0, saleData.total - saleData.assuranceAmount))}</span>
              </div>
              ${saleData.assuranceRef ? `<div style="font-size:11px; color:var(--text-muted); margin-top:6px;">Réf. Prise en charge : <strong>${saleData.assuranceRef}</strong></div>` : ''}
            </div>
          ` : ''}

          ${saleData.paymentMethod !== 'assurance' && saleData.paymentDetails && saleData.paymentDetails.length > 0 ? `
            <div style="margin-top:12px; padding-top:12px; border-top:1px dashed var(--border);">
              <div style="font-size:10px; font-weight:800; color:var(--text-muted); text-transform:uppercase; letter-spacing:1px; margin-bottom:6px;">Détail du Règlement</div>
              ${saleData.paymentDetails.map(d => `
                <div class="recu-tot-row" style="font-size:12px; margin-bottom:4px;">
                  <span>${d.method === 'assurance' ? 'Prise en charge (Tiers Payant)' : (d.label || payLabels[d.method] || d.method)}</span>
                  <span style="font-weight:${d.method === 'assurance' ? '800' : '600'}; color:${d.method === 'assurance' ? 'var(--primary-color)' : 'inherit'};">${UI.formatCurrency(d.amount)}</span>
                </div>
              `).join('')}
            </div>
          ` : ''}

          ${saleData.paymentMethod === 'cash' && cashRecv > 0 ? `
            <div style="margin-top:12px; padding-top:12px; border-top:1px dashed var(--border);">
              <div class="recu-tot-row" style="font-size:12px;">
                <span>Espèces reçues</span>
                <span>${UI.formatCurrency(cashRecv)}</span>
              </div>
              <div class="recu-tot-row recu-monnaie" style="font-size:12px; margin-top:4px;">
                <span>Monnaie rendue</span>
                <span>${UI.formatCurrency(change)}</span>
              </div>
            </div>` : ''}
        </div>
      </div>
      <div class="recu-sep"></div>

      <!-- PIED DE PAGE -->
      <div class="recu-footer">
        <div class="recu-footer-conseils">
          <p>📋 <em>Respectez scrupuleusement vos prescriptions médicales</em></p>
          <p>💊 <em>Conservez les médicaments hors de portée des enfants</em></p>
          <p>☎️ <em>Pour toute question : ${telPharma}</em></p>
        </div>
        <div class="recu-footer-legal">
          <p>Établi par : ${respPharma}</p>
          <p>Document officiel — Réf. ${refNum} — ${dnpmPharma}</p>
          <p>Imprimé le ${now.toLocaleDateString('fr-FR')} à ${now.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}</p>
          <p class="recu-merci">✨ Merci pour votre confiance</p>
        </div>
      </div>

    </div>

    <div class="recu-actions" id="recu-actions">
      <button class="btn btn-ghost" onclick="imprimerTicket()">🖨️ Ticket thermique</button>
      <button class="btn btn-secondary" onclick="PrintEngine ? PrintEngine.printInvoice(${saleId}) : UI.toast('Module impression non chargé','warning')">📄 Facture A4</button>
      ${saleData.mmPhone ? `<button class="btn btn-info" onclick="MobileMoneyGateway.sendSMSReceipt('${saleData.mmPhone}','${saleData.paymentMethod}',${saleData.total},${saleId}).then(()=>UI.toast('📱 SMS envoyé','success'))">📱 Renvoyer SMS</button>` : ''}
      <button class="btn btn-primary" onclick="UI.closeModal()">✓ Fermer</button>
    </div>
  `, { size: 'large' });
}

// ═══════════════════════════════════════════════════════════════════
// IMPRESSION TICKET THERMIQUE
// ═══════════════════════════════════════════════════════════════════
function imprimerTicket() {
  const el = document.getElementById('recu-printable');
  if (!el) return;
  const w = window.open('', '_blank', 'width=420,height=750');
  w.document.write(`<!DOCTYPE html><html lang="fr"><head><meta charset="UTF-8"><title>Ticket</title><style>
    *{box-sizing:border-box;margin:0;padding:0}
    body{font-family:'Courier New',monospace;font-size:11px;width:80mm;margin:0 auto;padding:4px;color:#000;background:#fff}
    .recu-header{display:flex;flex-direction:column;align-items:center;text-align:center;margin-bottom:6px}
    .recu-logo{font-size:24px;margin-bottom:2px}
    .recu-orgname{font-size:13px;font-weight:bold;margin:2px 0}
    .recu-orgdetail,.recu-orgdnpm{font-size:9px;color:#555;line-height:1.4}
    .recu-docblock{margin-top:4px;text-align:center}
    .recu-doctype{font-size:12px;font-weight:bold;letter-spacing:1px}
    .recu-docnum{font-size:11px;font-weight:bold;color:#333}
    .recu-docdate,.recu-doctime{font-size:9px;color:#666}
    .recu-sep{border-top:1px dashed #999;margin:4px 0}
    .recu-transaction-grid{margin:4px 0}
    .recu-tx-block{margin-bottom:4px}
    .recu-tx-label{font-size:8px;font-weight:bold;text-transform:uppercase;color:#999;letter-spacing:.5px}
    .recu-tx-name{font-size:11px;font-weight:bold}
    .recu-tx-sub{font-size:9px;color:#666}
    .recu-tx-anon{color:#999;font-style:italic}
    .recu-table{width:100%;border-collapse:collapse;margin:4px 0}
    .recu-th-product,.recu-th-qty,.recu-th-pu,.recu-th-total{font-size:8px;font-weight:bold;border-bottom:1px solid #ccc;padding:2px;text-transform:uppercase;color:#444}
    .recu-table td{padding:3px 2px;vertical-align:top;font-size:10px}
    .recu-row-even{background:#f9f9f9}
    .recu-drug-name{font-weight:bold}
    .recu-drug-sub{font-size:8px;color:#777}
    .recu-td-qty{text-align:center;font-weight:bold}
    .recu-td-total{text-align:right;font-weight:bold}
    .tag-rx-print{font-size:7px;background:#fee;color:#c00;padding:0 2px;border-radius:2px;border:1px solid #f00}
    .ta-c{text-align:center}.ta-r{text-align:right}
    .recu-totaux-block{display:flex;justify-content:flex-end}
    .recu-totaux{width:60%;font-size:10px}
    .recu-tot-row{display:flex;justify-content:space-between;padding:2px 0}
    .recu-remise{color:#c00}
    .recu-tot-main{font-size:13px;font-weight:bold;border-top:2px solid #000;margin-top:3px;padding-top:3px}
    .recu-monnaie{color:#060;font-weight:bold}
    .recu-footer{text-align:center;margin-top:6px}
    .recu-footer-conseils p{font-size:9px;color:#666;margin-bottom:1px}
    .recu-footer-legal p{font-size:8px;color:#999;margin-bottom:1px}
    .recu-merci{font-size:10px;font-weight:bold;color:#000;margin-top:4px!important}
    .recu-actions,.recu-logo-block{display:none}
  </style></head><body>${el.outerHTML}</body></html>`);
  w.document.close();
  w.onload = () => { setTimeout(() => w.print(), 200); };
}

async function startBarcodeScan() {
  // Check for BarcodeDetector API (Chrome/Edge) or fallback to manual entry
  const hasBarcodeAPI = 'BarcodeDetector' in window;
  const hasCamera = !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia);

  if (!hasCamera) {
    // Fallback: manual code entry
    showManualBarcodeEntry();
    return;
  }

  UI.modal('📷 Scanner un Code-Barres', `
    <div class="barcode-scanner-module">
      <div class="scanner-preview-wrap">
        <video id="barcode-video" autoplay playsinline muted style="width:100%;max-height:300px;border-radius:8px;background:#000"></video>
        <div class="scanner-overlay">
          <div class="scanner-line"></div>
        </div>
      </div>
      <div class="scanner-status" id="scanner-status">
        <span class="scanner-status-dot"></span>
        Recherche de code-barres en cours…
      </div>
      <div class="scanner-manual" style="margin-top:12px">
        <p class="text-muted text-sm">Ou saisissez le code manuellement :</p>
        <div class="form-row" style="gap:8px;align-items:flex-end">
          <input type="text" id="manual-barcode" class="form-control" placeholder="Code EAN-13 ou CIP..." style="flex:1">
          <button class="btn btn-primary btn-sm" onclick="searchByBarcode(document.getElementById('manual-barcode').value)">🔍 Chercher</button>
        </div>
      </div>
    </div>
  `, { size: 'medium' });

  // Start camera
  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: 'environment', width: { ideal: 640 }, height: { ideal: 480 } }
    });
    const video = document.getElementById('barcode-video');
    if (!video) { stream.getTracks().forEach(t => t.stop()); return; }
    video.srcObject = stream;
    window._scannerStream = stream;

    // Use BarcodeDetector if available
    if (hasBarcodeAPI) {
      const detector = new BarcodeDetector({ formats: ['ean_13', 'ean_8', 'code_128', 'qr_code'] });
      const scanInterval = setInterval(async () => {
        if (!document.getElementById('barcode-video')) {
          clearInterval(scanInterval);
          stream.getTracks().forEach(t => t.stop());
          return;
        }
        try {
          const barcodes = await detector.detect(video);
          if (barcodes.length > 0) {
            clearInterval(scanInterval);
            stream.getTracks().forEach(t => t.stop());
            const code = barcodes[0].rawValue;
            UI.closeModal();
            searchByBarcode(code);
          }
        } catch (e) { /* continue scanning */ }
      }, 500);
      window._scanInterval = scanInterval;
    }
  } catch (err) {
    const status = document.getElementById('scanner-status');
    if (status) {
      status.innerHTML = '<span class="text-warning">⚠️ Caméra non disponible — utilisez la saisie manuelle ci-dessous</span>';
    }
  }

  // Cleanup on modal close
  const origClose = UI.closeModal;
  UI.closeModal = function () {
    if (window._scannerStream) {
      window._scannerStream.getTracks().forEach(t => t.stop());
      window._scannerStream = null;
    }
    if (window._scanInterval) {
      clearInterval(window._scanInterval);
      window._scanInterval = null;
    }
    origClose.call(UI);
    UI.closeModal = origClose;
  };
}

function showManualBarcodeEntry() {
  UI.modal('🔢 Saisie manuelle du code', `
    <div class="form-grid">
      <div class="form-group">
        <label>Code-barres (EAN-13, CIP, Code interne)</label>
        <input type="text" id="manual-barcode" class="form-control" placeholder="Ex: 3400936... ou P001" autofocus>
      </div>
      <div class="info-box-small" style="margin-top:8px">
        <i data-lucide="info"></i>
        <span>Saisissez le code inscrit sur l'emballage du médicament ou le code interne du produit.</span>
      </div>
    </div>
  `, {
    footer: `
      <button class="btn btn-secondary" onclick="UI.closeModal()">Annuler</button>
      <button class="btn btn-primary" onclick="searchByBarcode(document.getElementById('manual-barcode').value)"><i data-lucide="search"></i> Chercher</button>
    `
  });
  if (window.lucide) lucide.createIcons();
  setTimeout(() => document.getElementById('manual-barcode')?.focus(), 100);
}

/**
 * Création rapide d'une ordonnance directement dans le POS
 */
function showQuickNewRx() {
  const patientName = posCurrentPatient ? posCurrentPatient.name : "Patient Anonyme";
  UI.modal('📄 Nouvelle Ordonnance (Saisie Rapide)', `
    <div class="form-grid">
      <div class="form-row">
        <div class="form-group">
          <label>Patient</label>
          <input type="text" class="form-control" value="${patientName}" readonly>
        </div>
        <div class="form-group">
          <label>Médecin prescripteur</label>
          <input type="text" id="qrx-doctor" class="form-control" placeholder="Nom du médecin">
        </div>
      </div>
      <div class="form-group">
        <label>Médicaments prescrits (Note informative)</label>
        <textarea id="qrx-notes" class="form-control" rows="3" placeholder="Saisissez ici les détails de l'ordonnance si nécessaire..."></textarea>
      </div>
      <div class="info-box">
        💡 Les médicaments ajoutés au panier seront liés à cette ordonnance lors de la validation.
      </div>
    </div>
  `, {
    footer: `
      <button class="btn btn-secondary" onclick="UI.closeModal()">Annuler</button>
      <button class="btn btn-primary" onclick="saveQuickRx()">✓ Valider l'ordonnance</button>
    `
  });
}

async function saveQuickRx() {
  const doctor = document.getElementById('qrx-doctor')?.value || "Non spécifié";
  const notes = document.getElementById('qrx-notes')?.value || "";

  const rxData = {
    patientId: posCurrentPatient?.id || null,
    patientName: posCurrentPatient?.name || "Patient Anonyme",
    doctorName: doctor,
    date: new Date().toISOString(),
    status: 'validated',
    items: posCart.map(item => ({
      productId: item.productId,
      productName: item.name,
      quantity: item.qty
    })),
    notes: notes
  };

  const id = await DB.dbAdd('prescriptions', rxData);
  const newRx = { ...rxData, id };
  window._posPrescriptions = [...(window._posPrescriptions || []), newRx];

  UI.closeModal();
  attachRx(id);
  UI.toast('✅ Ordonnance créée et liée au panier', 'success');
}

window.showQuickNewRx = showQuickNewRx;
window.saveQuickRx = saveQuickRx;

async function searchByBarcode(code) {
  if (!code || !code.trim()) { UI.toast('Veuillez entrer un code', 'warning'); return; }
  code = code.trim().toUpperCase();
  let product = posProducts.find(p =>
    (p.code || '').toUpperCase() === code ||
    (p.ean || '').toUpperCase() === code ||
    (p.cip || '').toUpperCase() === code
  );
  
  if (!product) {
     const res = await DB.dbSearchProducts(code, 10);
     product = res.find(p => (p.code || '').toUpperCase() === code || (p.ean || '').toUpperCase() === code || (p.cip || '').toUpperCase() === code);
  }

  UI.closeModal();
  if (product) {
    posProductsCache.set(product.id, product);
    addToCart(product.id);
    UI.toast(`✅ ${product.name} ajouté au panier`, 'success');
  } else {
    UI.toast(`❌ Aucun produit trouvé pour le code "${code}"`, 'error');
    // Set the search field to the code for manual search
    const searchInput = document.getElementById('pos-search');
    if (searchInput) {
      searchInput.value = code;
      posSearch = code.toLowerCase();
      searchInput.dispatchEvent(new Event('input'));
    }
  }
}

window.searchByBarcode = searchByBarcode;
window.showManualBarcodeEntry = showManualBarcodeEntry;

// Note: le listener pour fermer le dropdown client-suggest est déjà défini plus haut (L530-536)

// ─── Exports globaux ──────────────────────────────────────────────
window.addToCart = addToCart;
window.handleRuptureClick = handleRuptureClick;
window.showGenericAlternatives = showGenericAlternatives;
window.changeQty = changeQty;
window.setQtyDirect = setQtyDirect;
window.removeItem = removeItem;
window.viderPanier = viderPanier;
window.mettreEnAttente = mettreEnAttente;
window.validerVente = validerVente;
window.selectPay = selectPay;
window.setCashIn = setCashIn;
window.refreshChange = refreshChange;
window.refreshTotals = refreshTotals;
window.quickDiscount = quickDiscount;
window.initMobilePay = initMobilePay;
window.resetMobilePayUI = resetMobilePayUI;
window.refreshMmPhone = refreshMmPhone;
window.refreshCombined = refreshCombined;
window.onCombinedChange = onCombinedChange;
window.calcAssurance = calcAssurance;
window.filterCat = filterCat;
window.clearPosSearch = clearPosSearch;
window.onClientFocus = onClientFocus;
window.selectPatient = selectPatient;
window.clearClientUI = clearClientUI;
window.showQuickNewClient = showQuickNewClient;
window.saveQuickClient = saveQuickClient;
window.onRxToggle = onRxToggle;
window.openRxPicker = openRxPicker;
window.attachRx = attachRx;
window.detachRx = detachRx;
window.renderPOS = renderPOS;
window.imprimerTicket = imprimerTicket;
window.afficherRecu = afficherRecu;
window.startBarcodeScan = startBarcodeScan;
window.MobileMoneyGateway = MobileMoneyGateway;
window.showGenericAlternatives = showGenericAlternatives;
window.applySort = applySort;
window.loadRecentSales = loadRecentSales;
window.showPatientRepertory = showPatientRepertory;
window.renderRepertoryPage = renderRepertoryPage;

// ═══════════════════════════════════════════════════════════════════
// FEEDBACK AJOUT PANIER — Son + Animation
// ═══════════════════════════════════════════════════════════════════
function posAddFeedback(productName) {
  // Son bip court
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain); gain.connect(ctx.destination);
    osc.frequency.value = 800;
    gain.gain.value = 0.08;
    osc.start(); osc.stop(ctx.currentTime + 0.08);
  } catch (e) { /* AudioContext non disponible */ }

  // Flash visuel sur le panier
  const panel = document.getElementById('pos-cart-panel');
  if (panel) {
    panel.style.transition = 'box-shadow 0.2s ease';
    panel.style.boxShadow = '0 0 0 3px var(--success), var(--shadow-md)';
    setTimeout(() => { panel.style.boxShadow = 'var(--shadow-md)'; }, 400);
  }
}

// ═══════════════════════════════════════════════════════════════════
// RACCOURCIS CLAVIER — F2 = Scan, F5 = Valider, Échap = Vider
// ═══════════════════════════════════════════════════════════════════
function initKeyboardShortcuts() {
  document.addEventListener('keydown', function _posKeys(e) {
    // Ne pas interférer si on est dans un input/textarea/modal
    const tag = document.activeElement?.tagName?.toLowerCase();
    const inInput = tag === 'input' || tag === 'textarea' || tag === 'select';

    if (e.key === 'F2') {
      e.preventDefault();
      if (typeof startBarcodeScan === 'function') startBarcodeScan();
    }
    if (e.key === 'F5') {
      e.preventDefault();
      if (typeof validerVente === 'function') validerVente();
    }
    if (e.key === 'Escape' && !inInput) {
      e.preventDefault();
      if (typeof viderPanier === 'function') viderPanier();
    }
    // Ctrl+F = Focus recherche
    if ((e.ctrlKey || e.metaKey) && e.key === 'f') {
      e.preventDefault();
      document.getElementById('pos-search')?.focus();
    }
  });
}

// ═══════════════════════════════════════════════════════════════════
// HISTORIQUE — 5 dernières ventes (PRO)
// ═══════════════════════════════════════════════════════════════════
async function loadRecentSales() {
  const el = document.getElementById('pos-recent-list');
  if (!el) return;
  try {
    const sales = await DB.dbGetAll('sales');
    const recent = sales
      .filter(s => s.status !== 'cancelled')
      .sort((a, b) => new Date(b.date) - new Date(a.date))
      .slice(0, 10);

    if (!recent.length) {
      el.innerHTML = '<div style="text-align:center;padding:12px;opacity:0.5;font-size:12px">Aucune vente récente</div>';
      return;
    }

    el.style.maxHeight = '320px';
    el.style.overflowY = 'auto';

    el.innerHTML = recent.map((s, i) => {
      const d = new Date(s.date);
      const time = d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
      const dateStr = d.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit' });
      const payIcons = { cash: '💵', orange_money: '📱', mtn_momo: '📲', credit: '📝', assurance: '🛡️', combined: '🔀' };
      const statusColors = { completed: '#1E8449', paid: '#1E8449', pending: '#E67E22' };
      const statusLabels = { completed: 'Payé', paid: 'Réglé', pending: 'En attente' };
      const bgColor = i % 2 === 0 ? 'transparent' : 'rgba(0,0,0,0.015)';
      return `<div style="display:grid;grid-template-columns:auto 1fr auto auto;gap:8px;align-items:center;padding:8px 10px;border-bottom:1px solid rgba(0,0,0,0.05);background:${bgColor};font-size:12px;cursor:pointer" onclick="if(typeof viewSaleDetail==='function')viewSaleDetail(${s.id})" title="Voir le détail">
        <span style="font-size:16px">${payIcons[s.paymentMethod] || '💰'}</span>
        <div style="min-width:0">
          <div style="font-weight:700;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">#${String(s.id).padStart(4,'0')} · ${s.patientName || 'Comptoir'}</div>
          <div style="font-size:10px;color:#888">${s.itemCount || '?'} art. · ${dateStr} ${time}</div>
        </div>
        <div style="font-weight:800;color:#1A56DB;white-space:nowrap">${UI.formatCurrency(s.total)}</div>
        <span style="font-size:9px;font-weight:700;padding:2px 6px;border-radius:4px;background:${(statusColors[s.status] || '#888') + '18'};color:${statusColors[s.status] || '#888'}">${statusLabels[s.status] || s.status}</span>
      </div>`;
    }).join('');
  } catch (e) {
    el.innerHTML = '<div style="text-align:center;padding:8px;opacity:0.4">—</div>';
  }
}

// ═══════════════════════════════════════════════════════════════════
// SUBSTITUTION GÉNÉRIQUE — Popup alternatives DCI
// ═══════════════════════════════════════════════════════════════════
async function handleRuptureClick(productId) {
  const p = posProductsCache.get(productId) || posProducts.find(x => x.id === productId);
  if (!p || !p.dci) { UI.toast('Rupture de stock — aucune alternative DCI en stock','error'); return; }
  
  const isMobile = /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent);
  let alts = [];
  if (isMobile) {
    const res = await DB.dbSearchProducts(p.dci, 50);
    alts = res.filter(a => a.id !== p.id && a.dci === p.dci && (posStock[a.id] || 0) > 0);
  } else {
    alts = posProducts.filter(a => a.id !== p.id && a.dci === p.dci && (posStock[a.id] || 0) > 0);
  }
  
  if (alts.length > 0) {
    alts.forEach(a => posProductsCache.set(a.id, a));
    showGenericAlternatives(p, alts);
  } else {
    UI.toast('Rupture de stock — aucune alternative DCI en stock','error');
  }
}

function showGenericAlternatives(p, alts) {
  if (!alts.length) { UI.toast('Aucune alternative générique en stock', 'info'); return; }
  UI.modal(`<i data-lucide="repeat" class="modal-icon-inline"></i> Alternatives Génériques — ${p.dci}`, `
    <div class="info-box info-primary" style="margin-bottom:16px">
      <strong>${p.name}</strong> est en rupture de stock. Voici les alternatives avec la même DCI (<strong>${p.dci}</strong>) disponibles :
    </div>
    <div style="display:flex; flex-direction:column; gap:10px;">
      ${alts.map(a => `
        <div style="display:flex; align-items:center; justify-content:space-between; padding:14px 18px; background:var(--surface); border:1px solid var(--border); border-radius:12px; cursor:pointer; transition:all 0.2s"
             onmouseover="this.style.borderColor='var(--primary-color)';this.style.transform='translateX(5px)'" 
             onmouseout="this.style.borderColor='var(--border)';this.style.transform='none'"
             onclick="UI.closeModal(); addToCart(${a.id})">
          <div>
            <div style="font-weight:700; font-size:15px;">${a.name}</div>
            <div style="color:var(--text-muted); font-size:13px;">${a.dci} ${a.dosage || ''} · ${a.form || ''} · ${a.brand || ''}</div>
          </div>
          <div style="text-align:right">
            <div style="font-weight:800; color:var(--primary-color)">${UI.formatCurrency(a.salePrice)}</div>
            <div style="font-size:12px; color:var(--success-color);">${posStock[a.id] || 0} en stock</div>
          </div>
        </div>
      `).join('')}
    </div>
  `, { size: 'medium' });
  if (window.lucide) lucide.createIcons();
}

Router.register('pos', renderPOS);

// ═══════════════════════════════════════════════════════════════════
// NOTICE MÉDICALE — Consultation rapide depuis le panier
// ═══════════════════════════════════════════════════════════════════
async function showProductNotice(productId) {
  const p = await DB.dbGet('products', productId);
  if (!p) return;

  const hasNotice = p.dosageInstructions || p.precautions || p.contraindications || p.sideEffects || p.medicalNotice;

  UI.modal(`<i data-lucide="file-text" class="modal-icon-inline"></i> Notice — ${p.name}`, `
    ${hasNotice ? `
      <div style="display:flex;flex-direction:column;gap:12px">
        ${p.dosageInstructions ? `<div><strong style="font-size:12px;color:var(--primary)">📋 Posologie recommandée</strong><p style="margin:4px 0 0;font-size:13px">${p.dosageInstructions}</p></div>` : ''}
        ${p.precautions ? `<div style="padding:10px;background:rgba(232,145,58,0.08);border-radius:8px;border-left:3px solid var(--warning)"><strong style="font-size:12px;color:var(--warning)">⚠️ Précautions d'emploi</strong><p style="margin:4px 0 0;font-size:13px">${p.precautions}</p></div>` : ''}
        ${p.contraindications ? `<div style="padding:10px;background:rgba(214,59,59,0.08);border-radius:8px;border-left:3px solid var(--danger)"><strong style="font-size:12px;color:var(--danger)">🚫 Contre-indications</strong><p style="margin:4px 0 0;font-size:13px">${p.contraindications}</p></div>` : ''}
        ${p.sideEffects ? `<div><strong style="font-size:12px;color:var(--text-muted)">💊 Effets indésirables</strong><p style="margin:4px 0 0;font-size:13px">${p.sideEffects}</p></div>` : ''}
        ${p.medicalNotice ? `<div style="border-top:1px solid var(--border);padding-top:12px"><strong style="font-size:12px;color:var(--info)">📄 Notice complète / RCP</strong><p style="margin:4px 0 0;font-size:13px;white-space:pre-line">${p.medicalNotice}</p></div>` : ''}
      </div>
    ` : `
      <div style="text-align:center;padding:24px;color:var(--text-muted)">
        <i data-lucide="info" style="width:32px;height:32px;margin-bottom:8px;opacity:0.5"></i>
        <p style="font-size:14px">Aucune notice médicale renseignée pour ce produit.</p>
        <p style="font-size:12px;margin-top:4px">Vous pouvez l'ajouter depuis <strong>Catalogue → Modifier le produit</strong>.</p>
      </div>
    `}
  `, { size: 'medium' });
  if (window.lucide) lucide.createIcons();
}
window.showProductNotice = showProductNotice;

// ═══════════════════════════════════════════════════════════════════
// MOBILE — Navigation 3 vues (Produits | Panier | Menu)
// ═══════════════════════════════════════════════════════════════════
let _mobileCurrentVue = 'produits';

function mobileShowVue(vue) {
  if (window.innerWidth > 767) return; // Desktop — pas de tab bar

  _mobileCurrentVue = vue;
  const posLeft = document.querySelector('.pos-left');
  const posRight = document.querySelector('.pos-right');
  const sidebar = document.getElementById('app-sidebar');
  const cartPanel = document.querySelector('.pos-cart-panel');

  // Cacher tous les panneaux
  if (posLeft) posLeft.style.display = 'none';
  if (posRight) posRight.style.display = 'none';

  // Désactiver le mode panel glissant en mode tab
  if (cartPanel) {
    cartPanel.style.position = 'relative';
    cartPanel.style.transform = 'none';
    cartPanel.style.maxHeight = 'none';
    cartPanel.style.boxShadow = 'none';
    cartPanel.style.borderRadius = '0';
  }

  if (vue === 'produits') {
    if (posLeft) posLeft.style.display = 'block';
  } else if (vue === 'panier') {
    if (posRight) posRight.style.display = 'block';
    if (cartPanel) cartPanel.classList.add('expanded');
  } else if (vue === 'menu') {
    // Garder la vue produits visible en arrière-plan
    if (posLeft) posLeft.style.display = 'block';
    // Ouvrir la sidebar via la fonction existante
    if (typeof toggleSidebar === 'function') {
      toggleSidebar();
    }
    // Remettre l'onglet Produits comme actif
    vue = 'produits';
  }

  // Mettre à jour les onglets actifs
  document.querySelectorAll('#mobile-pos-tabbar .tab-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.vue === vue);
  });
}

function mobileUpdateCartBadge() {
  const badge = document.getElementById('mobile-cart-badge');
  if (!badge) return;
  const count = posCart.reduce((a, c) => a + c.qty, 0);
  if (count > 0) {
    badge.style.display = 'flex';
    badge.textContent = count > 99 ? '99+' : count;
  } else {
    badge.style.display = 'none';
  }
}

// Afficher / masquer la tab bar quand on entre/quitte le POS
function mobileInitPOS() {
  const tabbar = document.getElementById('mobile-pos-tabbar');
  if (window.innerWidth > 767 || !tabbar) return;

  tabbar.style.display = 'flex';
  mobileShowVue('produits');
  mobileUpdateCartBadge();
}

function mobileCleanupPOS() {
  const tabbar = document.getElementById('mobile-pos-tabbar');
  if (tabbar) tabbar.style.display = 'none';

  // Restaurer les styles normaux
  const posLeft = document.querySelector('.pos-left');
  const posRight = document.querySelector('.pos-right');
  const cartPanel = document.querySelector('.pos-cart-panel');
  if (posLeft) posLeft.style.display = '';
  if (posRight) posRight.style.display = '';
  if (cartPanel) {
    cartPanel.style.position = '';
    cartPanel.style.transform = '';
    cartPanel.style.maxHeight = '';
    cartPanel.style.boxShadow = '';
    cartPanel.style.borderRadius = '';
  }
}

// Hook dans refreshCartUI pour mettre à jour le badge
const _origRefreshCartUI = refreshCartUI;
window._refreshCartUI = refreshCartUI;
refreshCartUI = function() {
  _origRefreshCartUI();
  mobileUpdateCartBadge();
};

// Exposer les fonctions globalement
window.mobileShowVue = mobileShowVue;
window.mobileInitPOS = mobileInitPOS;
window.mobileCleanupPOS = mobileCleanupPOS;
window.mobileUpdateCartBadge = mobileUpdateCartBadge;

