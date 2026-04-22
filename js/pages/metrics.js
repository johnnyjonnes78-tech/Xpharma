/**
 * OrdiveX — metrics.js
 * Tableau de Bord Exécutif — Business Intelligence
 */

async function renderMetrics(container) {
  UI.loading(container, 'Analyse des données business...');

  try {
    // Chargement défensif : chaque table est chargée individuellement
    // pour éviter un crash global si une table n'existe pas encore
    const safeLoad = async (table) => { try { return await DB.dbGetAll(table) || []; } catch(e) { console.warn('[Metrics] Table manquante:', table); return []; } };
    
    // Charger tout en parallèle : stores légers + comptage products (pas de chargement séquentiel)
    const [sales, saleItems, stockAll, recentAudit, alerts, returns, cashRegister, productCount] = await Promise.all([
      safeLoad('sales'),
      safeLoad('saleItems'),
      safeLoad('stock'),
      DB.dbGetRecent('auditLog', 'timestamp', 5000).catch(() => []), // Derniers 5000 seulement
      safeLoad('alerts'),
      safeLoad('returns'),
      safeLoad('cashRegister'),
      DB.dbCount('products').catch(() => 0),
    ]);
    const auditLog = recentAudit;

    // Mode léger si catalogue > 50k : pseudo-produits depuis le stock
    let products;
    if (productCount > 50000) {
      products = stockAll.map(s => ({ id: s.productId, minStock: 10, purchasePrice: 0, salePrice: 0 }));
    } else {
      products = await safeLoad('products');
    }

    // Index rapide stock par productId pour éviter des .find() répétés
    const stockMap = {};
    stockAll.forEach(s => { stockMap[s.productId] = s; });

    // ── Filtres temporels ──
    const now = new Date();
    const today = now.toISOString().split('T')[0];
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0];
    const startOfLastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1).toISOString().split('T')[0];
    const endOfLastMonth = new Date(now.getFullYear(), now.getMonth(), 0).toISOString().split('T')[0];
    const last30 = new Date(); last30.setDate(last30.getDate() - 30);
    const last7 = new Date(); last7.setDate(last7.getDate() - 7);

    // ── Ventes globales ──
    // ── Filtres temporels croisés ──
    const globalStartDate = window._metricsStartDate || null;
    const globalEndDate = window._metricsEndDate || null;

    let filteredSales = sales;
    let filteredReturns = returns;
    if (globalStartDate || globalEndDate) {
        filteredSales = sales.filter(s => {
            const sd = s.date.split('T')[0];
            return (!globalStartDate || sd >= globalStartDate) && (!globalEndDate || sd <= globalEndDate);
        });
        filteredReturns = returns.filter(s => {
            const sd = s.date.split('T')[0];
            return (!globalStartDate || sd >= globalStartDate) && (!globalEndDate || sd <= globalEndDate);
        });
    }

    const approvedReturns = filteredReturns.filter(r => r.status === 'approved');
    const totalRefunds = approvedReturns.reduce((a, r) => a + (r.refundAmount || 0), 0);
    const completedSales = filteredSales.filter(s => ['completed', 'paid'].includes(s.status));
    
    window._metricsExportData = completedSales; // Pour l'export CSV
    
    const totalRevenue = completedSales.reduce((a, s) => a + (s.total || 0), 0) - totalRefunds;
    const totalTransactions = completedSales.length;
    const avgBasket = totalTransactions > 0 ? Math.round(totalRevenue / totalTransactions) : 0;

    // ── Ventes du mois courant ──
    const thisMonthSales = completedSales.filter(s => s.date && s.date >= startOfMonth);
    const thisMonthRevenue = thisMonthSales.reduce((a, s) => a + (s.total || 0), 0);
    const thisMonthReturns = approvedReturns.filter(r => r.date && r.date >= startOfMonth);
    const thisMonthRefunds = thisMonthReturns.reduce((a, r) => a + (r.refundAmount || 0), 0);
    const thisMonthNet = thisMonthRevenue - thisMonthRefunds;
    const thisMonthCount = thisMonthSales.length;

    // ── Ventes du mois précédent ──
    const lastMonthSales = completedSales.filter(s => s.date && s.date >= startOfLastMonth && s.date <= endOfLastMonth);
    const lastMonthRevenue = lastMonthSales.reduce((a, s) => a + (s.total || 0), 0);
    const lastMonthReturns = approvedReturns.filter(r => r.date && r.date >= startOfLastMonth && r.date <= endOfLastMonth);
    const lastMonthRefunds = lastMonthReturns.reduce((a, r) => a + (r.refundAmount || 0), 0);
    const lastMonthNet = lastMonthRevenue - lastMonthRefunds;
    const lastMonthCount = lastMonthSales.length;

    // ── Variation mensuelle ──
    const monthGrowth = lastMonthNet > 0 ? (((thisMonthNet - lastMonthNet) / lastMonthNet) * 100).toFixed(1) : 0;
    const monthCountGrowth = lastMonthCount > 0 ? (((thisMonthCount - lastMonthCount) / lastMonthCount) * 100).toFixed(1) : 0;

    // ── Ventes du jour ──
    const todaySales = completedSales.filter(s => s.date && s.date.startsWith(today));
    const todayRevenue = todaySales.reduce((a, s) => a + (s.total || 0), 0);
    const todayCount = todaySales.length;

    // ── Date de première utilisation ──
    const realSales = sales.filter(s => new Date(s.date).getFullYear() >= 2026);
    const firstSale = [...realSales].sort((a,b) => new Date(a.date) - new Date(b.date))[0];
    const startedUsingDate = firstSale ? new Date(firstSale.date).toLocaleDateString('fr-FR', {
      day: 'numeric', month: 'long', year: 'numeric'
    }) : "Aujourd'hui";
    const daysSinceStart = firstSale ? Math.max(1, Math.floor((now - new Date(firstSale.date)) / 86400000)) : 1;

    // ── Activité ──
    const activeDays = new Set(auditLog
      .filter(l => l.timestamp > last30.getTime())
      .map(l => new Date(l.timestamp).toDateString())
    ).size;
    const activityRate = Math.round((activeDays / 30) * 100);

    // ── Santé du Stock (utilise p.minStock comme le reste de l'app) ──
    const outOfStock = products.filter(p => {
      const s = stockMap[p.id];
      return !s || (s.quantity || 0) <= 0;
    }).length;
    const lowStock = products.filter(p => {
      const s = stockMap[p.id];
      const qty = s ? (s.quantity || 0) : 0;
      const minSeuil = p.minStock || 10;
      return qty > 0 && qty <= minSeuil;
    }).length;
    const healthyStock = Math.max(0, productCount - outOfStock - lowStock);
    const stockHealthPct = productCount > 0 ? Math.round((healthyStock / productCount) * 100) : 100;

    // ── Valeur du stock ──
    const totalStockValue = products.reduce((a, p) => {
      const qty = stockMap[p.id]?.quantity || 0;
      return a + (qty * (p.purchasePrice || 0));
    }, 0);
    const totalStockSellValue = products.reduce((a, p) => {
      const qty = stockMap[p.id]?.quantity || 0;
      return a + (qty * (p.salePrice || 0));
    }, 0);
    const potentialProfit = totalStockSellValue - totalStockValue;

    // ── Marges & COGS ──
    const filteredSaleIds = new Set(completedSales.map(s => s.id));
    const filteredSaleItems = saleItems.filter(si => filteredSaleIds.has(si.saleId));

    const rawCOGS = filteredSaleItems.reduce((a, si) => a + (si.purchasePrice || 0) * (si.quantity || 0), 0);
    const refundsCOGS = approvedReturns.reduce((a, r) => {
      return a + (r.items || []).reduce((acc, ri) => {
        const si = saleItems.find(s => s.id === ri.saleItemId);
        return acc + (si?.purchasePrice || 0) * (ri.quantity || 0);
      }, 0);
    }, 0);
    const totalCOGS = rawCOGS - refundsCOGS;
    const totalProfit = totalRevenue - totalCOGS;
    const globalMargin = totalRevenue > 0 ? (totalProfit / totalRevenue * 100).toFixed(1) : '0.0';

    // ── DSO — Délai Moyen de Recouvrement ──
    const creditSales = filteredSales.filter(s => ['credit', 'assurance'].includes(s.paymentMethod));
    const paidCredits = creditSales.filter(s => s.status === 'completed' || s.status === 'paid');
    const unpaidCredits = creditSales.filter(s => s.status === 'pending');
    const totalCreances = unpaidCredits.reduce((a, s) => {
        if (s.paymentMethod === 'assurance') {
            // Pour l'assurance, la créance est la part de l'assurance (total de la vente moins les paiements du patient et sans compter les autres paiements combinés s'ils existent)
            // Mais plus simplement, on peut prendre sale.total - (montant payé par patient) = dette assurance.
            // Actuellement la dette est calculée via reduce, prenons s.total pour simplifier, ou s.debtAmount si c'est enregistré.
            // On peut calculer la part assurance:
            let debtAmount = s.total || 0;
            if (s.paymentDetails && Array.isArray(s.paymentDetails)) {
                const assurDetail = s.paymentDetails.find(d => d.method === 'assurance');
                if (assurDetail) debtAmount = assurDetail.amount || 0;
            }
            return a + debtAmount;
        }
        return a + (s.total || 0);
    }, 0);
    let dsoAvg = 0;
    if (paidCredits.length > 0) {
      const dsoDays = paidCredits.map(s => {
        const saleDate = new Date(s.date);
        const paidDate = s.paidAt ? new Date(s.paidAt) : new Date();
        return Math.max(0, Math.floor((paidDate - saleDate) / 86400000));
      });
      dsoAvg = Math.round(dsoDays.reduce((a, d) => a + d, 0) / dsoDays.length);
    }
    const debtRecoveryRate = creditSales.length > 0 ? Math.round((paidCredits.length / creditSales.length) * 100) : 100;

    // ── Rotation des stocks ──
    const stockRotation = totalStockValue > 0 ? (totalCOGS / totalStockValue).toFixed(1) : 0;

    // ── Répartition par mode de paiement ──
    const payBreakdown = {};
    const payCount = {};
    completedSales.forEach(s => {
      const m = s.paymentMethod || 'cash';
      payBreakdown[m] = (payBreakdown[m] || 0) + (s.total || 0);
      payCount[m] = (payCount[m] || 0) + 1;
    });
    // Include pending credit and assurance sales too
    sales.filter(s => ['credit', 'assurance'].includes(s.paymentMethod) && s.status === 'pending').forEach(s => {
      const m = s.paymentMethod;
      let amount = s.total || 0;
      if (m === 'assurance' && s.paymentDetails && Array.isArray(s.paymentDetails)) {
          const assurDetail = s.paymentDetails.find(d => d.method === 'assurance');
          if (assurDetail) amount = assurDetail.amount || 0;
      }
      payBreakdown[m] = (payBreakdown[m] || 0) + amount;
      payCount[m] = (payCount[m] || 0) + 1;
    });
    const payLabels = { cash:'Espèces', orange_money:'Orange Money', mtn_momo:'MTN MoMo', credit:'Crédit', transfer:'Virement', mobile_money:'Mobile Money', carte:'Carte Bancaire', assurance: 'Couverture Assurance' };
    const payColors = { cash:'#F39C12', orange_money:'#E74C3C', mtn_momo:'#FFCD00', credit:'#9B59B6', transfer:'#2ECC71', mobile_money:'#3498DB', carte:'#1ABC9C', assurance: '#27AE60' };
    const defaultPayColor = '#95A5A6';

    // ── Tendance 7 jours ──
    const last7DaysLabels = [];
    const trendData = [];
    const trendCountData = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date(); d.setDate(d.getDate() - i);
      const ds = d.toISOString().split('T')[0];
      last7DaysLabels.push(d.toLocaleDateString('fr-FR', { weekday: 'short', day:'numeric' }));
      const daySales = completedSales.filter(s => s.date && s.date.startsWith(ds));
      trendData.push(daySales.reduce((a, s) => a + (s.total || 0), 0));
      trendCountData.push(daySales.length);
    }

    // ── Top Produits par Volume ET par Revenu ──
    const topByVolume = getTopProducts(filteredSaleItems, 'qty');
    const topByRevenue = getTopProducts(filteredSaleItems, 'revenue');

    // ── Moyenne journalière ──
    const avgDailyRevenue = daysSinceStart > 0 ? Math.round(totalRevenue / daysSinceStart) : 0;

    // ── KPI helpers ──
    function trendBadge(val) {
      const n = parseFloat(val);
      if (n > 0) return `<span style="color:#2ecc71; font-size:12px; font-weight:700; display:inline-flex; align-items:center; gap:2px;"><i data-lucide="trending-up" style="width:14px;height:14px;"></i> +${val}%</span>`;
      if (n < 0) return `<span style="color:#e74c3c; font-size:12px; font-weight:700; display:inline-flex; align-items:center; gap:2px;"><i data-lucide="trending-down" style="width:14px;height:14px;"></i> ${val}%</span>`;
      return `<span style="color:var(--text-muted); font-size:12px; font-weight:700;">= 0%</span>`;
    }

    function progressBar(pct, color) {
      const capped = Math.min(100, Math.max(0, pct));
      return `<div style="height:6px; background:var(--border); border-radius:3px; overflow:hidden; margin-top:8px;">
        <div style="height:100%; width:${capped}%; background:${color}; border-radius:3px; transition:width 0.6s ease;"></div>
      </div>`;
    }

    // ═══════════════════════════════════════════
    //  RENDER
    // ═══════════════════════════════════════════
    container.innerHTML = `
      <!-- EN-TÊTE -->
      <div class="bi-header" style="display:flex; justify-content:space-between; align-items:flex-end; margin-bottom:28px;">
        <div>
          <h1 class="bi-title" style="font-size:26px; font-weight:800; margin:0; display:flex; align-items:center; gap:10px; color:var(--text);">
            <div style="width:40px;height:40px;background:rgba(27,111,174,0.12);border-radius:12px;display:flex;align-items:center;justify-content:center;"><i data-lucide="bar-chart-2" style="color:var(--primary-color);width:22px;height:22px;"></i></div>
            Business Intelligence
          </h1>
          <p style="font-size:13px; color:var(--text-muted); margin:4px 0 0 50px;">Analyse financière complète · ${productCount} produits · ${totalTransactions} transactions</p>
        </div>
        <div class="bi-header-actions" style="display:flex; gap:8px; align-items:center;">
          <input type="date" id="metrics-start-date" class="form-control" style="width:130px; font-size:12px; height:32px" value="${window._metricsStartDate || ''}" onchange="updateMetricsFilter()">
          <span style="color:var(--text-muted); font-size:12px">au</span>
          <input type="date" id="metrics-end-date" class="form-control" style="width:130px; font-size:12px; height:32px" value="${window._metricsEndDate || ''}" onchange="updateMetricsFilter()">
          <button class="btn btn-sm btn-outline" onclick="exportMetricsCSV()" title="Exporter en CSV" style="height:32px; padding:0 10px"><i data-lucide="download" style="width:14px"></i> Export CSV</button>
          
          <div style="font-size:12px; background:rgba(46,204,113,0.1); border:1px solid rgba(46,204,113,0.3); padding:6px 14px; border-radius:8px; color:#27ae60; font-weight:600; margin-left:8px">
            ${activeDays}/30j actifs
          </div>
        </div>
      </div>

      <!-- ═══ SECTION 1 — HERO FINANCIER ═══ -->
      <div style="background:linear-gradient(135deg, #0c1e35 0%, #1a4a7a 50%, #1e6fa0 100%); border-radius:20px; padding:32px 36px; color:white; display:grid; grid-template-columns:1fr auto; gap:32px; margin-bottom:28px; box-shadow:0 16px 48px rgba(12,30,53,0.35); position:relative; overflow:hidden;">
        <div style="position:absolute;top:-80px;right:-40px;width:250px;height:250px;background:radial-gradient(circle,rgba(255,255,255,0.06)0%,transparent 70%);border-radius:50%;"></div>
        <div style="position:absolute;bottom:-60px;left:15%;width:180px;height:180px;background:radial-gradient(circle,rgba(46,204,113,0.1)0%,transparent 70%);border-radius:50%;"></div>
        
        <div style="z-index:2;">
          <div style="display:flex; align-items:center; gap:8px; margin-bottom:6px;">
            <span style="background:rgba(241,196,15,0.2); padding:4px 10px; border-radius:6px; font-size:11px; font-weight:800; letter-spacing:1px; text-transform:uppercase; color:#f1c40f;">⚡ Bénéfice Brut Total</span>
          </div>
          <div style="font-size:52px; font-weight:900; line-height:1.1; letter-spacing:-2px;">${UI.formatCurrency(totalProfit)}</div>
          <div style="display:flex; gap:20px; margin-top:18px; flex-wrap:wrap;">
            <div style="background:rgba(255,255,255,0.1); backdrop-filter:blur(6px); padding:10px 18px; border-radius:12px; border:1px solid rgba(255,255,255,0.08);">
              <div style="font-size:11px; text-transform:uppercase; color:rgba(255,255,255,0.6); font-weight:600; margin-bottom:2px;">CA Net Cumulé</div>
              <div style="font-size:20px; font-weight:800;">${UI.formatCurrency(totalRevenue)}</div>
            </div>
            <div style="background:rgba(255,255,255,0.1); backdrop-filter:blur(6px); padding:10px 18px; border-radius:12px; border:1px solid rgba(255,255,255,0.08);">
              <div style="font-size:11px; text-transform:uppercase; color:rgba(255,255,255,0.6); font-weight:600; margin-bottom:2px;">Marge Globale</div>
              <div style="font-size:20px; font-weight:800;">${globalMargin}%</div>
            </div>
            <div style="background:rgba(255,255,255,0.1); backdrop-filter:blur(6px); padding:10px 18px; border-radius:12px; border:1px solid rgba(255,255,255,0.08);">
              <div style="font-size:11px; text-transform:uppercase; color:rgba(255,255,255,0.6); font-weight:600; margin-bottom:2px;">Moy. Journalière</div>
              <div style="font-size:20px; font-weight:800;">${UI.formatCurrency(avgDailyRevenue)}</div>
            </div>
          </div>
        </div>

        <div style="z-index:2; display:flex; flex-direction:column; gap:16px; border-left:1px solid rgba(255,255,255,0.15); padding-left:32px; justify-content:center;">
          <div>
            <div style="font-size:11px; text-transform:uppercase; color:rgba(255,255,255,0.6); font-weight:600; margin-bottom:2px;">Coût Marchandises</div>
            <div style="font-size:18px; font-weight:700;">-${UI.formatCurrency(totalCOGS)}</div>
          </div>
          <div>
            <div style="font-size:11px; text-transform:uppercase; color:rgba(255,255,255,0.6); font-weight:600; margin-bottom:2px;">Retours/Remb.</div>
            <div style="font-size:18px; font-weight:700;">-${UI.formatCurrency(totalRefunds)}</div>
          </div>
          <div>
            <div style="font-size:11px; text-transform:uppercase; color:rgba(255,255,255,0.6); font-weight:600; margin-bottom:2px;">Transactions</div>
            <div style="font-size:18px; font-weight:700;">${totalTransactions}</div>
          </div>
        </div>
      </div>

      <!-- ═══ SECTION 2 — KPIs MENSUEL vs PRÉCÉDENT ═══ -->
      <div style="display:grid; grid-template-columns: repeat(4, 1fr); gap:20px; margin-bottom:28px;">
        
        <!-- KPI: CA Mois Courant -->
        <div style="background:var(--surface); border:1px solid var(--border); border-radius:14px; padding:20px; box-shadow:var(--shadow-sm); transition:transform .2s;" onmouseover="this.style.transform='translateY(-3px)'" onmouseout="this.style.transform='none'">
          <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:12px;">
            <div style="width:42px;height:42px;border-radius:12px;background:rgba(46,204,113,0.1);color:#27ae60;display:flex;align-items:center;justify-content:center;"><i data-lucide="trending-up" style="width:22px;height:22px;"></i></div>
            ${trendBadge(monthGrowth)}
          </div>
          <div style="font-size:24px; font-weight:800; color:var(--text); margin-bottom:4px;">${UI.formatCurrency(thisMonthNet)}</div>
          <div style="font-size:12px; color:var(--text-muted); font-weight:600; text-transform:uppercase; letter-spacing:0.3px;">CA Net du Mois</div>
          <div style="font-size:11px; color:var(--text-muted); margin-top:4px;">${thisMonthCount} ventes · Précédent: ${UI.formatCurrency(lastMonthNet)}</div>
        </div>

        <!-- KPI: Ventes Aujourd'hui -->
        <div style="background:var(--surface); border:1px solid var(--border); border-radius:14px; padding:20px; box-shadow:var(--shadow-sm); transition:transform .2s;" onmouseover="this.style.transform='translateY(-3px)'" onmouseout="this.style.transform='none'">
          <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:12px;">
            <div style="width:42px;height:42px;border-radius:12px;background:rgba(52,152,219,0.1);color:#3498db;display:flex;align-items:center;justify-content:center;"><i data-lucide="clock" style="width:22px;height:22px;"></i></div>
            <span style="font-size:12px;color:var(--text-muted);font-weight:600;">${todayCount} vente(s)</span>
          </div>
          <div style="font-size:24px; font-weight:800; color:var(--text); margin-bottom:4px;">${UI.formatCurrency(todayRevenue)}</div>
          <div style="font-size:12px; color:var(--text-muted); font-weight:600; text-transform:uppercase; letter-spacing:0.3px;">Recette du Jour</div>
          <div style="font-size:11px; color:var(--text-muted); margin-top:4px;">Moy/jour: ${UI.formatCurrency(avgDailyRevenue)}</div>
        </div>

        <!-- KPI: Panier Moyen -->
        <div style="background:var(--surface); border:1px solid var(--border); border-radius:14px; padding:20px; box-shadow:var(--shadow-sm); transition:transform .2s;" onmouseover="this.style.transform='translateY(-3px)'" onmouseout="this.style.transform='none'">
          <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:12px;">
            <div style="width:42px;height:42px;border-radius:12px;background:rgba(243,156,18,0.1);color:#f39c12;display:flex;align-items:center;justify-content:center;"><i data-lucide="shopping-cart" style="width:22px;height:22px;"></i></div>
          </div>
          <div style="font-size:24px; font-weight:800; color:var(--text); margin-bottom:4px;">${UI.formatCurrency(avgBasket)}</div>
          <div style="font-size:12px; color:var(--text-muted); font-weight:600; text-transform:uppercase; letter-spacing:0.3px;">Panier Moyen</div>
          <div style="font-size:11px; color:var(--text-muted); margin-top:4px;">Dépense moyenne par transaction</div>
        </div>

        <!-- KPI: Créances -->
        <div style="background:var(--surface); border:1px solid ${totalCreances > 0 ? 'rgba(231,76,60,0.3)' : 'var(--border)'}; border-radius:14px; padding:20px; box-shadow:var(--shadow-sm); cursor:pointer; transition:transform .2s;" onclick="Router.navigate('sales')" onmouseover="this.style.transform='translateY(-3px)'" onmouseout="this.style.transform='none'">
          <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:12px;">
            <div style="width:42px;height:42px;border-radius:12px;background:rgba(155,89,182,0.1);color:#9b59b6;display:flex;align-items:center;justify-content:center;"><i data-lucide="file-clock" style="width:22px;height:22px;"></i></div>
            <span style="font-size:12px;color:${totalCreances > 0 ? '#e74c3c' : '#27ae60'};font-weight:700;">${unpaidCredits.length} impayé(s)</span>
          </div>
          <div style="font-size:24px; font-weight:800; color:${totalCreances > 0 ? '#e74c3c' : 'var(--success-color)'}; margin-bottom:4px;">${totalCreances > 0 ? UI.formatCurrency(totalCreances) : '0 FG ✓'}</div>
          <div style="font-size:12px; color:var(--text-muted); font-weight:600; text-transform:uppercase; letter-spacing:0.3px;">Créances en Cours</div>
          <div style="font-size:11px; color:var(--text-muted); margin-top:4px;">DSO: ${dsoAvg}j · Taux recouvr.: ${debtRecoveryRate}%</div>
        </div>
      </div>

      <!-- ═══ SECTION 3 — INDICATEURS OPÉRATIONNELS ═══ -->
      <div style="display:grid; grid-template-columns: repeat(4, 1fr); gap:20px; margin-bottom:28px;">
        
        <!-- Marge Globale -->
        <div style="background:var(--surface); border:1px solid var(--border); border-radius:14px; padding:20px; box-shadow:var(--shadow-sm);">
          <div style="display:flex; align-items:center; gap:8px; margin-bottom:14px;">
            <div style="width:36px;height:36px;border-radius:10px;background:rgba(46,204,113,0.1);color:#27ae60;display:flex;align-items:center;justify-content:center;"><i data-lucide="percent" style="width:18px;height:18px;"></i></div>
            <span style="font-size:13px; font-weight:700; color:var(--text);">Marge Brute</span>
          </div>
          <div style="font-size:32px; font-weight:900; color:${parseFloat(globalMargin) >= 20 ? '#27ae60' : parseFloat(globalMargin) >= 10 ? '#f39c12' : '#e74c3c'};">${globalMargin}%</div>
          ${progressBar(parseFloat(globalMargin), parseFloat(globalMargin) >= 20 ? '#27ae60' : parseFloat(globalMargin) >= 10 ? '#f39c12' : '#e74c3c')}
          <div style="display:flex; justify-content:space-between; font-size:11px; color:var(--text-muted); margin-top:6px;">
            <span>0%</span><span>Objectif: 25%</span><span>50%</span>
          </div>
        </div>

        <!-- Rotation Stock -->
        <div style="background:var(--surface); border:1px solid var(--border); border-radius:14px; padding:20px; box-shadow:var(--shadow-sm);">
          <div style="display:flex; align-items:center; gap:8px; margin-bottom:14px;">
            <div style="width:36px;height:36px;border-radius:10px;background:rgba(26,188,156,0.1);color:#1abc9c;display:flex;align-items:center;justify-content:center;"><i data-lucide="refresh-cw" style="width:18px;height:18px;"></i></div>
            <span style="font-size:13px; font-weight:700; color:var(--text);">Rotation Stock</span>
          </div>
          <div style="font-size:32px; font-weight:900; color:var(--text);">${stockRotation}x</div>
          ${progressBar(Math.min(parseFloat(stockRotation) * 20, 100), '#1abc9c')}
          <div style="display:flex; justify-content:space-between; font-size:11px; color:var(--text-muted); margin-top:6px;">
            <span>Lent</span><span>COGS / Val. stock</span><span>Rapide</span>
          </div>
        </div>

        <!-- Santé du Stock -->
        <div style="background:var(--surface); border:1px solid var(--border); border-radius:14px; padding:20px; box-shadow:var(--shadow-sm);">
          <div style="display:flex; align-items:center; gap:8px; margin-bottom:14px;">
            <div style="width:36px;height:36px;border-radius:10px;background:rgba(52,152,219,0.1);color:#3498db;display:flex;align-items:center;justify-content:center;"><i data-lucide="package" style="width:18px;height:18px;"></i></div>
            <span style="font-size:13px; font-weight:700; color:var(--text);">Santé Stock</span>
          </div>
          <div style="font-size:32px; font-weight:900; color:${stockHealthPct >= 80 ? '#27ae60' : stockHealthPct >= 50 ? '#f39c12' : '#e74c3c'};">${stockHealthPct}%</div>
          ${progressBar(stockHealthPct, stockHealthPct >= 80 ? '#27ae60' : stockHealthPct >= 50 ? '#f39c12' : '#e74c3c')}
          <div style="display:flex; justify-content:space-between; font-size:11px; color:var(--text-muted); margin-top:6px;">
            <span style="color:#e74c3c;">${outOfStock} ruptures</span>
            <span style="color:#f39c12;">${lowStock} bas</span>
            <span style="color:#27ae60;">${healthyStock} ok</span>
          </div>
        </div>

        <!-- Taux de Recouvrement -->
        <div style="background:var(--surface); border:1px solid var(--border); border-radius:14px; padding:20px; box-shadow:var(--shadow-sm);">
          <div style="display:flex; align-items:center; gap:8px; margin-bottom:14px;">
            <div style="width:36px;height:36px;border-radius:10px;background:rgba(155,89,182,0.1);color:#9b59b6;display:flex;align-items:center;justify-content:center;"><i data-lucide="user-check" style="width:18px;height:18px;"></i></div>
            <span style="font-size:13px; font-weight:700; color:var(--text);">Recouvrement</span>
          </div>
          <div style="font-size:32px; font-weight:900; color:${debtRecoveryRate >= 80 ? '#27ae60' : debtRecoveryRate >= 50 ? '#f39c12' : '#e74c3c'};">${debtRecoveryRate}%</div>
          ${progressBar(debtRecoveryRate, debtRecoveryRate >= 80 ? '#27ae60' : debtRecoveryRate >= 50 ? '#f39c12' : '#e74c3c')}
          <div style="display:flex; justify-content:space-between; font-size:11px; color:var(--text-muted); margin-top:6px;">
            <span>DSO: ${dsoAvg}j</span>
            <span>${paidCredits.length} réglé(s) / ${creditSales.length} total</span>
          </div>
        </div>
      </div>

      <!-- ═══ SECTION 4 — GRAPHIQUES ═══ -->
      <div style="display:grid; grid-template-columns:1.5fr 1fr; gap:24px; margin-bottom:28px;">
        <div style="background:var(--surface); border:1px solid var(--border); border-radius:16px; padding:24px; box-shadow:var(--shadow-sm);">
          <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:20px;">
            <h3 style="font-size:15px; font-weight:700; margin:0; display:flex; align-items:center; gap:8px;">
              <i data-lucide="activity" style="color:var(--primary-color);width:18px;height:18px;"></i> Tendance des Ventes
            </h3>
            <div style="display:flex; gap:10px; align-items:center;">
              <span style="font-size:11px; color:var(--text-muted); background:var(--surface-2); padding:4px 10px; border-radius:6px; font-weight:600">7 derniers jours</span>
            </div>
          </div>
          <div style="font-size:36px; font-weight:900; color:var(--text); margin-bottom:16px; letter-spacing:-1px;">${UI.formatCurrency(trendData.reduce((a,b) => a+b, 0))}</div>
          <canvas id="metrics-chart-trend" width="700" height="280" style="width:100%; height:auto;"></canvas>
        </div>

        <div style="background:var(--surface); border:1px solid var(--border); border-radius:16px; padding:24px; box-shadow:var(--shadow-sm);">
          <h3 style="font-size:15px; font-weight:700; margin:0 0 20px 0; display:flex; align-items:center; gap:8px;">
            <i data-lucide="pie-chart" style="color:#3498DB;width:18px;height:18px;"></i> Répartition par Paiement
          </h3>
          <canvas id="metrics-chart-payments" width="500" height="350" style="width:100%; height:auto;"></canvas>
          <div style="display:flex; flex-direction:column; gap:6px; margin-top:16px; font-size:12px;">
            ${Object.entries(payBreakdown).filter(([,v]) => v > 0).sort((a,b) => b[1]-a[1]).map(([k, v]) => `
              <div style="display:flex; align-items:center; gap:8px;">
                <div style="width:10px;height:10px;border-radius:3px;background:${payColors[k] || defaultPayColor};flex-shrink:0;"></div>
                <span style="flex:1;color:var(--text-muted);">${payLabels[k] || k}</span>
                <strong>${UI.formatCurrency(v)}</strong>
                <span style="color:var(--text-muted);">(${payCount[k]})</span>
              </div>
            `).join('')}
          </div>
        </div>
      </div>

      <!-- ═══ SECTION 5 — TABLEAUX AVANCÉS ═══ -->
      <div style="display:grid; grid-template-columns: repeat(auto-fit, minmax(380px, 1fr)); gap:24px; margin-bottom:28px;">
        
        <!-- P&L -->
        <div style="background:var(--surface); border:1px solid var(--border); border-radius:16px; padding:24px; box-shadow:var(--shadow-sm);">
          <h3 style="font-size:15px; font-weight:700; margin:0 0 20px 0; padding-bottom:12px; border-bottom:1px solid var(--border); display:flex; align-items:center; gap:8px;">
            <i data-lucide="file-spreadsheet" style="width:18px;height:18px;"></i> Compte de Résultat
          </h3>
          <div style="display:flex; flex-direction:column; gap:12px; font-size:14px;">
            <div style="display:flex; justify-content:space-between;">
              <span style="color:var(--text-muted);">CA Brut (ventes)</span>
              <strong>${UI.formatCurrency(rawCOGS + totalProfit + totalRefunds)}</strong>
            </div>
            <div style="display:flex; justify-content:space-between; color:#e74c3c;">
              <span>− Retours clients</span>
              <strong>-${UI.formatCurrency(totalRefunds)}</strong>
            </div>
            <div style="display:flex; justify-content:space-between; border-top:1px dashed var(--border); padding-top:10px;">
              <span style="font-weight:700;">= CA Net</span>
              <strong style="font-size:15px;">${UI.formatCurrency(totalRevenue)}</strong>
            </div>
            <div style="display:flex; justify-content:space-between; color:#f39c12;">
              <span>− Coût d'Achat (COGS)</span>
              <strong>-${UI.formatCurrency(totalCOGS)}</strong>
            </div>
            <div style="background:linear-gradient(90deg, rgba(46,204,113,0.08), rgba(46,204,113,0.02)); padding:14px; border-radius:10px; border:1px dashed rgba(46,204,113,0.25); margin-top:6px; display:flex; justify-content:space-between; align-items:center;">
              <div>
                <div style="font-weight:800; color:var(--success-color); letter-spacing:0.3px;">= BÉNÉFICE BRUT</div>
                <div style="font-size:11px; color:var(--text-muted); margin-top:2px;">Marge: ${globalMargin}%</div>
              </div>
              <strong style="font-size:22px; font-weight:900; color:var(--success-color);">${UI.formatCurrency(totalProfit)}</strong>
            </div>
          </div>
        </div>

        <!-- Valorisation Stock -->
        <div style="background:var(--surface); border:1px solid var(--border); border-radius:16px; padding:24px; box-shadow:var(--shadow-sm);">
          <h3 style="font-size:15px; font-weight:700; margin:0 0 20px 0; padding-bottom:12px; border-bottom:1px solid var(--border); display:flex; align-items:center; gap:8px;">
            <i data-lucide="warehouse" style="width:18px;height:18px;"></i> Valorisation du Stock
          </h3>
          <div style="display:flex; flex-direction:column; gap:12px; font-size:14px;">
            <div style="display:flex; justify-content:space-between;">
              <span style="color:var(--text-muted);">Valeur d'achat (coût)</span>
              <strong>${UI.formatCurrency(totalStockValue)}</strong>
            </div>
            <div style="display:flex; justify-content:space-between;">
              <span style="color:var(--text-muted);">Valeur de vente (PV)</span>
              <strong>${UI.formatCurrency(totalStockSellValue)}</strong>
            </div>
            <div style="display:flex; justify-content:space-between; border-top:1px dashed var(--border); padding-top:10px;">
              <span style="font-weight:700; color:var(--success-color);">Gain potentiel</span>
              <strong style="color:var(--success-color);">${UI.formatCurrency(potentialProfit)}</strong>
            </div>
            <div style="margin-top:8px; padding:14px; background:var(--surface-2); border-radius:10px; border:1px solid var(--border);">
              <div style="display:flex; justify-content:space-between; margin-bottom:8px;">
                <span style="font-size:13px; font-weight:600;">Répartition stock</span>
                <span style="font-size:13px; font-weight:600;">${productCount} réf.</span>
              </div>
              <div style="display:flex; height:8px; border-radius:4px; overflow:hidden; gap:2px;">
                <div style="flex:${healthyStock}; background:#27ae60; border-radius:4px;" title="${healthyStock} OK"></div>
                <div style="flex:${lowStock || 0.1}; background:#f39c12; border-radius:4px;" title="${lowStock} Bas"></div>
                <div style="flex:${outOfStock || 0.1}; background:#e74c3c; border-radius:4px;" title="${outOfStock} Rupture"></div>
              </div>
              <div style="display:flex; justify-content:space-between; font-size:11px; color:var(--text-muted); margin-top:6px;">
                <span><span style="display:inline-block;width:8px;height:8px;border-radius:2px;background:#27ae60;margin-right:4px;"></span>${healthyStock} Normal</span>
                <span><span style="display:inline-block;width:8px;height:8px;border-radius:2px;background:#f39c12;margin-right:4px;"></span>${lowStock} Bas</span>
                <span><span style="display:inline-block;width:8px;height:8px;border-radius:2px;background:#e74c3c;margin-right:4px;"></span>${outOfStock} Rupture</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- ═══ SECTION 6 — TOP PRODUITS ═══ -->
      <div style="display:grid; grid-template-columns: 1fr 1fr; gap:24px;">
        
        <!-- Top par Volume -->
        <div style="background:var(--surface); border:1px solid var(--border); border-radius:16px; padding:24px; box-shadow:var(--shadow-sm);">
          <h3 style="font-size:15px; font-weight:700; margin:0 0 18px 0; padding-bottom:12px; border-bottom:1px solid var(--border); display:flex; align-items:center; gap:8px;">
            <i data-lucide="trophy" style="width:18px;height:18px;color:#f1c40f;"></i> Top 5 — Volume Vendu
          </h3>
          <div style="display:flex; flex-direction:column; gap:10px;">
            ${topByVolume.map((p, i) => `
              <div style="display:flex; align-items:center; gap:12px; padding:10px 14px; background:var(--surface-2); border-radius:10px; border:1px solid var(--border);">
                <div style="width:28px;height:28px;border-radius:8px;background:${i===0?'linear-gradient(135deg,#f1c40f,#e67e22)':i===1?'linear-gradient(135deg,#bdc3c7,#95a5a6)':i===2?'linear-gradient(135deg,#d35400,#e67e22)':'var(--border)'};color:${i<3?'#fff':'var(--text)'};display:flex;align-items:center;justify-content:center;font-weight:800;font-size:13px;flex-shrink:0;">${i+1}</div>
                <div style="flex:1;min-width:0;"><div style="font-weight:600;font-size:13px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${p.name}</div></div>
                <div style="background:rgba(41,128,185,0.1);color:#2980b9;padding:3px 10px;border-radius:16px;font-size:12px;font-weight:700;">${p.qty} unités</div>
              </div>
            `).join('')}
          </div>
        </div>

        <!-- Top par Revenu -->
        <div style="background:var(--surface); border:1px solid var(--border); border-radius:16px; padding:24px; box-shadow:var(--shadow-sm);">
          <h3 style="font-size:15px; font-weight:700; margin:0 0 18px 0; padding-bottom:12px; border-bottom:1px solid var(--border); display:flex; align-items:center; gap:8px;">
            <i data-lucide="banknote" style="width:18px;height:18px;color:#27ae60;"></i> Top 5 — Chiffre d'Affaires
          </h3>
          <div style="display:flex; flex-direction:column; gap:10px;">
            ${topByRevenue.map((p, i) => `
              <div style="display:flex; align-items:center; gap:12px; padding:10px 14px; background:var(--surface-2); border-radius:10px; border:1px solid var(--border);">
                <div style="width:28px;height:28px;border-radius:8px;background:${i===0?'linear-gradient(135deg,#27ae60,#2ecc71)':i===1?'linear-gradient(135deg,#16a085,#1abc9c)':i===2?'linear-gradient(135deg,#2980b9,#3498db)':'var(--border)'};color:${i<3?'#fff':'var(--text)'};display:flex;align-items:center;justify-content:center;font-weight:800;font-size:13px;flex-shrink:0;">${i+1}</div>
                <div style="flex:1;min-width:0;"><div style="font-weight:600;font-size:13px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${p.name}</div></div>
                <div style="background:rgba(39,174,96,0.1);color:#27ae60;padding:3px 10px;border-radius:16px;font-size:12px;font-weight:700;">${UI.formatCurrency(p.revenue)}</div>
              </div>
            `).join('')}
          </div>
        </div>
      </div>
    `;

    if (window.lucide) lucide.createIcons();

    // ─── Rendus graphiques ───
    requestAnimationFrame(() => {
      Charts.line('metrics-chart-trend', last7DaysLabels, [{
        data: trendData,
        color: '#7C3AED',
        gradient: ['rgba(124,58,237,0.35)', 'rgba(196,167,255,0.08)']
      }], { title: '' });

      // Donut des modes de paiement
      const payChartLabels = [];
      const payChartData = [];
      const payChartColors = [];
      Object.entries(payBreakdown).filter(([,v]) => v > 0).sort((a,b) => b[1]-a[1]).forEach(([k, v]) => {
        payChartLabels.push(payLabels[k] || k);
        payChartData.push(v);
        payChartColors.push(payColors[k] || defaultPayColor);
      });
      if (payChartData.length > 0) {
        Charts.donut('metrics-chart-payments', payChartLabels, payChartData, payChartColors);
      }

      if (window.lucide) lucide.createIcons();
    });

  } catch (err) {
    console.error(err);
    container.innerHTML = `<div class="error-state">Erreur d'analyse : ${err.message}</div>`;
  }
}

function getTopProducts(items, mode = 'qty') {
  const map = {};
  items.forEach(it => {
    const key = it.productName || 'Inconnu';
    if (!map[key]) map[key] = { qty: 0, revenue: 0 };
    map[key].qty += it.quantity || 0;
    map[key].revenue += (it.unitPrice || it.total / (it.quantity || 1) || 0) * (it.quantity || 0);
  });
  return Object.entries(map)
    .sort((a, b) => mode === 'revenue' ? b[1].revenue - a[1].revenue : b[1].qty - a[1].qty)
    .slice(0, 5)
    .map(([name, data]) => ({ name, qty: data.qty, revenue: data.revenue }));
}

window.updateMetricsFilter = function() {
    window._metricsStartDate = document.getElementById('metrics-start-date').value;
    window._metricsEndDate = document.getElementById('metrics-end-date').value;
    Router.navigate('metrics');
}

window.exportMetricsCSV = function() {
    const data = window._metricsExportData || [];
    if(!data.length) { UI.toast("Aucune donnée à exporter pour cette période", "warning"); return; }
    
    let csvStr = "\uFEFFDate,Facture,Patient,Montant Total GNF,ModePaiement,Statut\n";
    data.forEach(s => {
       csvStr += `${s.date},${s.id},"${(s.patientName||'Comptoir Vente Directe').replace(/"/g, '""')}",${s.total},${s.paymentMethod},${s.status}\n`;
    });
    
    const blob = new Blob([csvStr], { type: 'text/csv;charset=utf-8;' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `Export_Pharma_BI_${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    UI.toast("Export complet !", "success");
}

window.renderMetrics = renderMetrics;
