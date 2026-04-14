/**
 * PHARMA_PROJET — UI Utilities
 */

const UI = {
  formatCurrency(amount) {
    return new Intl.NumberFormat('fr-GN', { style: 'currency', currency: 'GNF', minimumFractionDigits: 0 }).format(amount || 0);
  },

  formatDate(dateStr) {
    if (!dateStr) return '—';
    const d = new Date(dateStr);
    return d.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' });
  },

  formatDateTime(ts) {
    if (!ts) return '—';
    const d = new Date(ts);
    return d.toLocaleString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  },

  daysUntilExpiry(dateStr) {
    if (!dateStr) return null;
    const expiry = new Date(dateStr);
    const today = new Date();
    return Math.ceil((expiry - today) / (1000 * 60 * 60 * 24));
  },

  expiryBadge(dateStr) {
    const days = this.daysUntilExpiry(dateStr);
    if (days === null) return '';
    if (days < 0) return `<span class="badge badge-danger">Expiré</span>`;
    if (days <= 30) return `<span class="badge badge-danger">J-${days}</span>`;
    if (days <= 90) return `<span class="badge badge-warning">J-${days}</span>`;
    return `<span class="badge badge-success">${this.formatDate(dateStr)}</span>`;
  },

  stockBadge(qty, minStock, product = null) {
    let displayStr = qty;
    if (product && product.allowUnitSale && product.unitsPerBox > 1) {
      displayStr = `${Math.floor(qty / product.unitsPerBox)} bt ${qty % product.unitsPerBox} u`;
      minStock = minStock * product.unitsPerBox; // Optionnel : ajuster le test bas/rupture selon le seuil si exprimé en boîtes
    }
    if (qty === 0) return `<span class="badge badge-danger">Rupture</span>`;
    if (qty <= minStock) return `<span class="badge badge-warning">${displayStr} (bas)</span>`;
    return `<span class="badge badge-success">${displayStr}</span>`;
  },

  toast(message, type = 'info', duration = 3500) {
    const container = document.getElementById('toast-container') || (() => {
      const c = document.createElement('div');
      c.id = 'toast-container';
      document.body.appendChild(c);
      return c;
    })();

    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    const icons = { success: 'check-circle', error: 'alert-circle', warning: 'alert-triangle', info: 'info' };
    toast.innerHTML = `<span class="toast-icon"><i data-lucide="${icons[type] || 'info'}"></i></span><span class="toast-msg">${message}</span>`;
    container.appendChild(toast);
    if (window.lucide) lucide.createIcons({ props: { size: 18 } });
    requestAnimationFrame(() => toast.classList.add('show'));
    setTimeout(() => {
      toast.classList.remove('show');
      setTimeout(() => toast.remove(), 400);
    }, duration);
  },

  confirm(message) {
    return new Promise(resolve => {
      const overlay = document.createElement('div');
      overlay.className = 'modal-overlay';
      overlay.innerHTML = `
        <div class="modal-box confirm-box">
          <div class="modal-icon"><i data-lucide="alert-triangle"></i></div>
          <p class="modal-msg">${message}</p>
          <div class="modal-actions">
            <button class="btn btn-secondary" id="confirm-no">Annuler</button>
            <button class="btn btn-danger" id="confirm-yes">Confirmer</button>
          </div>
        </div>`;
      document.body.appendChild(overlay);
      if (window.lucide) lucide.createIcons();
      document.getElementById('confirm-yes').onclick = () => { overlay.remove(); resolve(true); };
      document.getElementById('confirm-no').onclick = () => { overlay.remove(); resolve(false); };
    });
  },

  modal(title, contentHTML, options = {}) {
    const existing = document.getElementById('global-modal');
    if (existing) existing.remove();

    const overlay = document.createElement('div');
    overlay.id = 'global-modal';
    overlay.className = 'modal-overlay';
    overlay.innerHTML = `
      <div class="modal-box ${options.size === 'large' ? 'modal-large' : ''}">
        <div class="modal-header">
          <h3 class="modal-title">${title}</h3>
          <button class="modal-close" id="modal-close-btn">✕</button>
        </div>
        <div class="modal-body">${contentHTML}</div>
        ${options.footer ? `<div class="modal-footer">${options.footer}</div>` : ''}
      </div>`;
    document.body.appendChild(overlay);
    if (window.lucide) lucide.createIcons();
    document.getElementById('modal-close-btn').onclick = () => overlay.remove();
    if (options.onClose) overlay.addEventListener('click', e => { if (e.target === overlay) options.onClose(); });
    return overlay;
  },

  closeModal() {
    const m = document.getElementById('global-modal');
    if (m) m.remove();
  },

  loading(container, message = 'Chargement...') {
    if (window._isBackgroundRefresh) return;
    container.innerHTML = `<div class="loading-state"><div class="spinner"></div><p>${message}</p></div>`;
  },

  empty(container, message = 'Aucune donnée', icon = 'package') {
    container.innerHTML = `<div class="empty-state"><div class="empty-icon"><i data-lucide="${icon}"></i></div><p>${message}</p></div>`;
    if (window.lucide) lucide.createIcons();
  },

  table(container, columns, rows, options = {}) {
    if (!rows.length) {
      this.empty(container, options.emptyMessage || 'Aucun résultat', options.emptyIcon);
      return;
    }

    // Auto-pagination pour prévenir les crashs
    const pageSize = options.pageSize || 50;
    const isPaginated = options.paginate !== false && rows.length > pageSize;
    let currentPage = parseInt(container.dataset.page || '1');
    
    const totalPages = Math.ceil(rows.length / pageSize);
    if (currentPage > totalPages) currentPage = totalPages;
    if (currentPage < 1) currentPage = 1;

    let displayRows = rows;
    if (isPaginated) {
      const start = (currentPage - 1) * pageSize;
      displayRows = rows.slice(start, start + pageSize);
    }

    const thead = columns.map(c => `<th>${c.label}</th>`).join('');
    const tbody = displayRows.map((row, ri) => {
      const globalIdx = isPaginated ? ((currentPage - 1) * pageSize + ri) : ri;
      const cells = columns.map(c => {
        const val = typeof c.render === 'function' ? c.render(row, globalIdx) : (row[c.key] ?? '—');
        const label = c.label || '';
        return `<td data-label="${label}">${val}</td>`;
      }).join('');
      return `<tr ${options.onRowClick ? `class="clickable" data-idx="${globalIdx}"` : ''}>${cells}</tr>`;
    }).join('');

    const wrapper = document.createElement('div');
    wrapper.className = 'table-wrapper';
    wrapper.innerHTML = `
      <table class="data-table">
        <thead><tr>${thead}</tr></thead>
        <tbody>${tbody}</tbody>
      </table>`;
    
    container.innerHTML = '';
    container.appendChild(wrapper);

    if (isPaginated) {
      const pagDiv = document.createElement('div');
      pagDiv.style.cssText = 'display:flex;justify-content:space-between;align-items:center;padding:16px 0;gap:12px;flex-wrap:wrap;';
      pagDiv.innerHTML = `
        <span style="font-size:13px;color:var(--text-muted)">${rows.length.toLocaleString()} données — Page ${currentPage}/${totalPages}</span>
        <div style="display:flex;gap:8px;">
          <button class="btn btn-secondary btn-sm" id="ui-btn-prev" ${currentPage <= 1 ? 'disabled' : ''}>◀ Précédent</button>
          <button class="btn btn-secondary btn-sm" id="ui-btn-next" ${currentPage >= totalPages ? 'disabled' : ''}>Suivant ▶</button>
        </div>
      `;
      container.appendChild(pagDiv);
      
      const prevBtn = container.querySelector('#ui-btn-prev');
      const nextBtn = container.querySelector('#ui-btn-next');
      if (prevBtn) prevBtn.onclick = () => { container.dataset.page = currentPage - 1; UI.table(container, columns, rows, options); };
      if (nextBtn) nextBtn.onclick = () => { container.dataset.page = currentPage + 1; UI.table(container, columns, rows, options); };
    }

    if (options.onRowClick) {
      wrapper.querySelectorAll('tr[data-idx]').forEach(tr => {
        tr.onclick = () => options.onRowClick(rows[parseInt(tr.dataset.idx)]);
      });
    }
    if (window.lucide) lucide.createIcons({ root: container });
  },

  paymentMethodBadge(method) {
    const m = { cash: ['banknote', 'Espèces', 'badge-neutral'], orange_money: ['smartphone', 'Orange Money', 'badge-orange'], mtn_momo: ['smartphone', 'MTN MoMo', 'badge-yellow'], credit: ['file-clock', 'Crédit', 'badge-warning'], transfer: ['building-2', 'Virement', 'badge-info'] };
    const [icon, label, cls] = m[method] || ['help-circle', method, 'badge-neutral'];
    return `<span class="badge ${cls}"><i data-lucide="${icon}" style="width:12px;height:12px;margin-right:4px"></i> ${label}</span>`;
  },

  roleBadge(role) {
    const r = { admin: ['shield-alert', 'Administrateur', 'badge-danger'], pharmacien: ['user-check', 'Pharmacien', 'badge-success'], caissier: ['user', 'Caissier', 'badge-info'] };
    const [icon, label, cls] = r[role] || ['help-circle', role, 'badge-neutral'];
    return `<span class="badge ${cls}"><i data-lucide="${icon}" style="width:12px;height:12px;margin-right:4px"></i> ${label}</span>`;
  },

  /* ── Master Theme Management (Dark Mode) ── */
  initTheme() {
    const saved = localStorage.getItem('pharma-theme') || 'light';
    this.setTheme(saved);
  },

  setTheme(theme) {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('pharma-theme', theme);
    // Notify charts to re-render if needed
    window.dispatchEvent(new CustomEvent('themechanged', { detail: { theme } }));
  },

  toggleTheme() {
    const current = document.documentElement.getAttribute('data-theme') || 'light';
    this.setTheme(current === 'light' ? 'dark' : 'light');
  },

  getThemeColor(varName) {
    return getComputedStyle(document.documentElement).getPropertyValue(varName).trim();
  },

  // ── Sync Monitoring (Intelligent) ──
  async openSyncMonitor() {
    var modal = document.getElementById('sync-monitor-modal');
    var list = document.getElementById('sync-monitor-list');
    document.getElementById('current-device-id-display').textContent = 'ID : ' + (DB.AppState.deviceId || localStorage.getItem('pharma_device_id') || '?');
    
    list.innerHTML = '<div style="text-align:center; padding: 20px;"><div class="spinner"></div><p>Analyse du réseau...</p></div>';
    modal.style.display = 'flex';

    if (!navigator.onLine) {
        list.innerHTML = '<div style="padding:20px; text-align:center; color:var(--text-muted);"><i data-lucide="wifi-off" style="width:40px;height:40px;margin-bottom:8px;"></i><p>Vous êtes hors ligne</p></div>';
        if (window.lucide) lucide.createIcons({ root: list });
        return;
    }

    try {
        var sb = await DB.getSupabaseClient();
        if (!sb) throw new Error('Supabase non configuré');

        var res = await sb.from('settings').select('key, value').like('key', 'device_status_%');
        if (res.error) throw res.error;
        var data = res.data || [];

        // Parse tous les appareils
        var allDevices = [];
        data.forEach(function(row) {
            try {
                var s = JSON.parse(row.value);
                s._key = row.key;
                allDevices.push(s);
            } catch(e) {}
        });

        // Chaque appareil a un device_id unique (clé device_status_DEV_XXX)
        // Pas de déduplication par nom — chaque device_id est un appareil distinct
        var now = Date.now();
        var ACTIVE_THRESHOLD = 48 * 60 * 60 * 1000; // 48h

        // Filtrer : garder uniquement les appareils actifs (<48h)
        var devices = allDevices.filter(function(d) { return (now - d.last_sync) < ACTIVE_THRESHOLD; });

        // Trier : en ligne d'abord, puis par date
        devices.sort(function(a, b) {
            var aOnline = a.online && (now - a.last_sync < 3600000);
            var bOnline = b.online && (now - b.last_sync < 3600000);
            if (aOnline && !bOnline) return -1;
            if (!aOnline && bOnline) return 1;
            return b.last_sync - a.last_sync;
        });

        // Compteurs
        var activeDevices = devices;
        var onlineCount = 0;
        var pendingCount = 0;
        var hasAlerts = false;

        activeDevices.forEach(function(d) {
            if (d.online && (now - d.last_sync < 3600000)) onlineCount++;
            if (d.pending > 0) { pendingCount++; if (d.name !== (DB.AppState.deviceName || localStorage.getItem('pharma_device_name'))) hasAlerts = true; }
        });

        // SVG Icons professionnels
        var pcSvg = '<svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="3" width="20" height="14" rx="2"/><line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/></svg>';
        var mobileSvg = '<svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><rect x="5" y="2" width="14" height="20" rx="2"/><line x1="12" y1="18" x2="12.01" y2="18"/></svg>';

        // Résumé
        var summaryHtml = '<div style="display:flex; justify-content:space-around; padding:16px; margin-bottom:16px; background:linear-gradient(135deg, rgba(46,134,193,0.08), rgba(46,134,193,0.02)); border-radius:12px; border:1px solid var(--border);">'
           + '<div style="text-align:center;"><div style="font-size:2rem; font-weight:800; color:var(--primary);">' + activeDevices.length + '</div><div style="font-size:0.7rem; color:var(--text-muted); text-transform:uppercase; letter-spacing:1px;">Appareils</div></div>'
           + '<div style="width:1px; background:var(--border);"></div>'
           + '<div style="text-align:center;"><div style="font-size:2rem; font-weight:800; color:var(--success);">' + onlineCount + '</div><div style="font-size:0.7rem; color:var(--text-muted); text-transform:uppercase; letter-spacing:1px;">En ligne</div></div>'
           + '<div style="width:1px; background:var(--border);"></div>'
           + '<div style="text-align:center;"><div style="font-size:2rem; font-weight:800; color:' + (pendingCount > 0 ? 'var(--warning)' : 'var(--text-muted)') + ';">' + pendingCount + '</div><div style="font-size:0.7rem; color:var(--text-muted); text-transform:uppercase; letter-spacing:1px;">En attente</div></div>'
           + '</div>';

        // Liste des appareils
        var html = '';
        var _myDeviceId = localStorage.getItem('pharma_device_id');
        devices.forEach(function(status) {
            var isCurrent = status._key === ('device_status_' + _myDeviceId);
            var isActive = (now - status.last_sync) < ACTIVE_THRESHOLD;
            var isOnline = status.online && (now - status.last_sync < 3600000);
            var hasPending = status.pending > 0;

            if (!isActive) return; // Masquer les appareils inactifs >48h

            // Détection intelligente : type explicite OU déduction par le nom
            var nameLower = (status.name || '').toLowerCase();
            var isMobile = status.type === 'mobile' || /mobile|phone|smartphone|téléphone|android|iphone/i.test(nameLower);
            var icon = isMobile ? mobileSvg : pcSvg;
            var deviceLabel = isMobile ? '📱 Mobile' : '🖥️ Bureau';
            var iconColor = isOnline ? 'var(--primary)' : 'var(--text-muted)';
            var borderColor = hasPending ? 'var(--warning)' : (isOnline ? 'var(--success)' : '#ddd');

            var statusLabel = hasPending ? '<span style="color:var(--warning); font-weight:700;">' + status.pending + ' en attente</span>'
                            : (isOnline ? '<span style="color:var(--success); font-weight:600;">Synchronisé</span>'
                            : '<span style="color:var(--text-muted);">Hors ligne</span>');

            var timeDiff = now - status.last_sync;
            var timeAgo = '';
            if (timeDiff < 60000) timeAgo = 'À l\'instant';
            else if (timeDiff < 3600000) timeAgo = Math.floor(timeDiff / 60000) + ' min';
            else if (timeDiff < 86400000) timeAgo = Math.floor(timeDiff / 3600000) + 'h';
            else timeAgo = Math.floor(timeDiff / 86400000) + 'j';

            var pulseAnim = isOnline ? 'style="width:8px;height:8px;border-radius:50%;background:var(--success);box-shadow:0 0 0 0 rgba(34,197,94,0.4);animation:pulse 2s infinite;"' : 'style="width:8px;height:8px;border-radius:50%;background:#ccc;"';

            html += '<div style="display:flex; align-items:center; gap:14px; padding:14px 16px; background:var(--surface); border-radius:12px; border:1px solid var(--border); border-left:4px solid ' + borderColor + '; transition:all 0.2s;">'
               + '<div style="color:' + iconColor + '; flex-shrink:0;">' + icon + '</div>'
               + '<div style="flex:1; min-width:0;">'
               + '<div style="display:flex; align-items:center; gap:8px;">'
               + '<span style="font-weight:700; font-size:0.95rem;">' + status.name + '</span>'
               + (isCurrent ? '<span style="background:var(--primary); color:white; font-size:0.6rem; padding:2px 6px; border-radius:4px; font-weight:600;">VOUS</span>' : '')
               + '<div ' + pulseAnim + '></div>'
               + '</div>'
               + '<div style="display:flex; align-items:center; gap:12px; margin-top:4px; font-size:0.8rem; color:var(--text-muted);">'
               + '<span>' + deviceLabel + '</span>'
               + '<span>·</span>'
               + '<span>' + timeAgo + '</span>'
               + '<span>·</span>'
               + statusLabel
               + '</div>'
               + '</div>'
               + '</div>';
        });

        if (html === '') {
            html = '<div style="text-align:center; padding:30px; color:var(--text-muted);"><p>Aucun appareil actif détecté</p></div>';
        }

        // Nettoyer les entrées très anciennes (>7 jours) dans Supabase
        var STALE_THRESHOLD = 7 * 24 * 60 * 60 * 1000;
        var staleKeys = allDevices.filter(function(d) { return (now - d.last_sync) > STALE_THRESHOLD; });
        if (staleKeys.length > 0) {
            staleKeys.forEach(function(d) {
                sb.from('settings').delete().eq('key', d._key).then(function(){}).catch(function(){});
            });
        }

        // Pulse animation CSS
        var styleTag = '<style>@keyframes pulse{0%{box-shadow:0 0 0 0 rgba(34,197,94,0.4)}70%{box-shadow:0 0 0 6px rgba(34,197,94,0)}100%{box-shadow:0 0 0 0 rgba(34,197,94,0)}}</style>';

        // Bouton purge si doublons détectés
        var purgeHtml = '';
        if (devices.length > 1) {
          purgeHtml = '<div style="text-align:center; margin-top:12px; padding-top:12px; border-top:1px dashed var(--border);">'
            + '<button onclick="window._purgeOldDevices()" style="background:none; border:1px solid var(--danger); color:var(--danger); padding:6px 16px; border-radius:8px; cursor:pointer; font-size:0.8rem;">'
            + '🧹 Purger les anciens appareils (garder seulement le mien)'
            + '</button></div>';
        }

        list.innerHTML = styleTag + summaryHtml + html + purgeHtml;
        if (window.lucide) lucide.createIcons({ root: list });

        // Stocker les données pour la purge
        window._monitorAllDevices = allDevices;

        // Badge topbar
        var badge = document.getElementById('device-sync-badge');
        var iconEl = document.getElementById('device-sync-icon');
        if (badge && iconEl) {
           iconEl.style.color = hasAlerts ? 'var(--warning)' : 'var(--success)';
           badge.style.display = activeDevices.length > 0 ? 'inline-block' : 'none';
           badge.textContent = activeDevices.length;
           badge.style.background = hasAlerts ? 'var(--warning)' : 'var(--primary)';
        }

    } catch (e) {
        list.innerHTML = '<div style="padding:20px; text-align:center; color:var(--danger);"><p>Erreur : ' + e.message + '</p></div>';
    }
  }
};

// Fonction de purge globale
window._purgeOldDevices = async function() {
  if (!confirm('Supprimer TOUS les appareils sauf le vôtre ?\nLes autres appareils réapparaîtront à leur prochaine connexion.')) return;
  try {
    var sb = await DB.getSupabaseClient();
    if (!sb) return;
    var myKey = 'device_status_' + (DB.AppState.deviceId || localStorage.getItem('pharma_device_id'));
    var allDevices = window._monitorAllDevices || [];
    var deleted = 0;
    for (var i = 0; i < allDevices.length; i++) {
      if (allDevices[i]._key !== myKey) {
        await sb.from('settings').delete().eq('key', allDevices[i]._key);
        deleted++;
      }
    }
    if (window.UI && UI.toast) UI.toast('🧹 ' + deleted + ' ancien(s) appareil(s) supprimé(s)', 'success');
    if (window.UI && UI.openSyncMonitor) UI.openSyncMonitor();
  } catch(e) {
    if (window.UI && UI.toast) UI.toast('Erreur : ' + e.message, 'danger');
  }
};

window.addEventListener('themechanged', () => {
  if (window.Router && Router.currentPage) {
    Router.render(Router.currentPage);
  }
});

// Chart utilities
const Charts = {
  bar(canvasId, labels, datasets, options = {}) {
    const canvas = document.getElementById(canvasId);
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const maxVal = Math.max(...datasets.flatMap(d => d.data));
    const w = canvas.width, h = canvas.height;
    const pad = { top: 50, right: 20, bottom: 50, left: 60 };
    const chartW = w - pad.left - pad.right;
    const chartH = h - pad.top - pad.bottom;

    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = UI.getThemeColor('--surface');
    ctx.fillRect(0, 0, w, h);

    const barW = Math.floor(chartW / labels.length * 0.6);
    const gap = chartW / labels.length;

    // Grid lines
    for (let i = 0; i <= 5; i++) {
      const y = pad.top + chartH - (i / 5) * chartH;
      ctx.strokeStyle = UI.getThemeColor('--border');
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(pad.left, y);
      ctx.lineTo(w - pad.right, y);
      ctx.stroke();

      ctx.fillStyle = UI.getThemeColor('--text-muted');
      ctx.font = '11px system-ui';
      ctx.textAlign = 'right';
      ctx.fillText(Math.round(maxVal * i / 5).toLocaleString('fr-FR'), pad.left - 8, y + 4);
    }

    // Bars
    datasets.forEach((dataset, di) => {
      const color = dataset.color || `hsl(${200 + di * 40}, 70%, 55%)`;
      dataset.data.forEach((val, i) => {
        const barH = maxVal > 0 ? (val / maxVal) * chartH : 0;
        const x = pad.left + gap * i + gap * 0.2 + di * (barW / datasets.length);
        const y = pad.top + chartH - barH;

        const grad = ctx.createLinearGradient(0, y, 0, pad.top + chartH);
        grad.addColorStop(0, color);
        grad.addColorStop(1, color + '88');
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.roundRect(x, y, barW / datasets.length - 2, barH, 3);
        ctx.fill();
      });
    });

    // Labels
    labels.forEach((label, i) => {
      ctx.fillStyle = UI.getThemeColor('--text-muted');
      ctx.font = '11px system-ui';
      ctx.textAlign = 'center';
      const x = pad.left + gap * i + gap * 0.5;
      ctx.fillText(label.length > 8 ? label.substring(0, 8) + '..' : label, x, h - 10);
    });

    // Title
    if (options.title) {
      ctx.fillStyle = UI.getThemeColor('--text');
      ctx.font = 'bold 13px system-ui';
      ctx.textAlign = 'center';
      ctx.fillText(options.title, w / 2, 18);
    }
  },

  donut(canvasId, labels, data, colors) {
    const canvas = document.getElementById(canvasId);
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const w = canvas.width, h = canvas.height;
    const cx = w * 0.38, cy = h * 0.45; // Décentrer à gauche
    const R = Math.min(w, h) * 0.35; // Rayon optimal
    const r = R * 0.6;
    const total = data.reduce((a, b) => a + b, 0);

    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = UI.getThemeColor('--surface');
    ctx.fillRect(0, 0, w, h);

    if (total === 0) {
      ctx.fillStyle = '#94a3b8';
      ctx.font = '14px system-ui';
      ctx.textAlign = 'center';
      ctx.fillText('Aucune donnée', cx, cy);
      return;
    }

    let startAngle = -Math.PI / 2;
    data.forEach((val, i) => {
      const slice = (val / total) * 2 * Math.PI;
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.arc(cx, cy, R, startAngle, startAngle + slice);
      ctx.closePath();
      ctx.fillStyle = colors[i % colors.length];
      ctx.fill();
      ctx.strokeStyle = '#fff';
      ctx.lineWidth = 2;
      ctx.stroke();
      startAngle += slice;
    });

    // Center hole
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, 2 * Math.PI);
    ctx.fillStyle = UI.getThemeColor('--surface'); // Match background
    ctx.fill();

    // Center text
    ctx.fillStyle = UI.getThemeColor('--text');
    ctx.font = 'bold 16px system-ui';
    ctx.textAlign = 'center';
    ctx.fillText(total.toLocaleString('fr-FR'), cx, cy + 5);
    ctx.font = '11px system-ui';
    ctx.fillStyle = UI.getThemeColor('--text-muted');
    ctx.fillText('Total', cx, cy + 20);

    // Legend (bottom)
    const legY = h - (Math.ceil(labels.length / 2) * 20) - 5;
    labels.forEach((label, i) => {
      const row = Math.floor(i / 2);
      const col = i % 2;
      const lx = col === 0 ? w * 0.72 : w * 0.72; // Colonne unique à droite ou ajustée
      const ly = (h * 0.15) + i * 22; // Légende verticale à droite
      ctx.fillStyle = colors[i % colors.length];
      ctx.beginPath();
      ctx.roundRect(lx, ly - 9, 10, 10, 2);
      ctx.fill();
      ctx.fillStyle = UI.getThemeColor('--text-muted');
      ctx.font = '500 10px system-ui';
      ctx.textAlign = 'left';
      const pct = total > 0 ? ((data[i] / total) * 100).toFixed(1) : 0;
      ctx.fillText(`${label.substring(0, 15)} (${pct}%)`, lx + 15, ly);
    });
  },

  line(canvasId, labels, datasets, options = {}) {
    const canvas = document.getElementById(canvasId);
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const w = canvas.width, h = canvas.height;
    const pad = { top: 50, right: 20, bottom: 45, left: 65 };
    const chartW = w - pad.left - pad.right;
    const chartH = h - pad.top - pad.bottom;
    const allVals = datasets.flatMap(d => d.data);
    const maxVal = Math.max(...allVals, 1);

    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = UI.getThemeColor('--surface');
    ctx.fillRect(0, 0, w, h);

    // Grid
    for (let i = 0; i <= 5; i++) {
      const y = pad.top + chartH - (i / 5) * chartH;
      ctx.strokeStyle = UI.getThemeColor('--border');
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(pad.left, y);
      ctx.lineTo(w - pad.right, y);
      ctx.stroke();
      ctx.fillStyle = UI.getThemeColor('--text-muted');
      ctx.font = '10px system-ui';
      ctx.textAlign = 'right';
      ctx.fillText(Math.round(maxVal * i / 5).toLocaleString('fr-FR'), pad.left - 6, y + 3);
    }

    datasets.forEach((dataset, di) => {
      const color = dataset.color || `hsl(${180 + di * 60}, 70%, 50%)`;
      const points = dataset.data.map((val, i) => ({
        x: pad.left + (i / (labels.length - 1)) * chartW,
        y: pad.top + chartH - (val / maxVal) * chartH
      }));

      // Area fill
      ctx.beginPath();
      ctx.moveTo(points[0].x, pad.top + chartH);
      points.forEach(p => ctx.lineTo(p.x, p.y));
      ctx.lineTo(points[points.length - 1].x, pad.top + chartH);
      ctx.closePath();
      ctx.fillStyle = color + '22';
      ctx.fill();

      // Line
      ctx.beginPath();
      ctx.moveTo(points[0].x, points[0].y);
      points.forEach((p, i) => {
        if (i > 0) {
          const cp = { x: (points[i - 1].x + p.x) / 2, y: (points[i - 1].y + p.y) / 2 };
          ctx.quadraticCurveTo(points[i - 1].x, points[i - 1].y, cp.x, cp.y);
        }
      });
      ctx.lineTo(points[points.length - 1].x, points[points.length - 1].y);
      ctx.strokeStyle = color;
      ctx.lineWidth = 2.5;
      ctx.stroke();

      // Points
      points.forEach(p => {
        ctx.beginPath();
        ctx.arc(p.x, p.y, 4, 0, 2 * Math.PI);
        ctx.fillStyle = '#fff';
        ctx.fill();
        ctx.strokeStyle = color;
        ctx.lineWidth = 2;
        ctx.stroke();
      });
    });

    // X labels
    labels.forEach((label, i) => {
      const x = pad.left + (i / (labels.length - 1)) * chartW;
      ctx.fillStyle = UI.getThemeColor('--text-muted');
      ctx.font = '10px system-ui';
      ctx.textAlign = 'center';
      ctx.fillText(label, x, h - 8);
    });

    if (options.title) {
      ctx.fillStyle = '#1e293b';
      ctx.font = 'bold 13px system-ui';
      ctx.textAlign = 'center';
      ctx.fillText(options.title, w / 2, 18);
    }
  }
};

window.UI = UI;
window.Charts = Charts;
