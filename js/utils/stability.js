/**
 * OrdiveX — Module de Stabilite v9.4.1
 * Bouclier d'erreurs global + Verification de version + Auto-recovery
 * Ce fichier DOIT etre charge en DERNIER pour wrapper tous les modules
 */

(function() {
  'use strict';

  // ═══════════════════════════════════════════════════════════════════
  // 1. BOUCLIER GLOBAL — Capture TOUTES les erreurs non gerees
  // ═══════════════════════════════════════════════════════════════════

  var _errorCount = 0;
  var _maxErrorsBeforeReload = 50; // Si 50+ erreurs en une session, proposer un reload
  var _errorLog = [];

  // Renforcer le handler global deja present dans db.js
  window.addEventListener('error', function(e) {
    _errorCount++;
    _errorLog.push({
      time: Date.now(),
      msg: (e.message || '').substring(0, 200),
      file: (e.filename || '').split('/').pop(),
      line: e.lineno,
      col: e.colno
    });
    // Garder seulement les 20 dernieres erreurs en memoire
    if (_errorLog.length > 20) _errorLog.shift();

    // Si trop d'erreurs, proposer un reload (mais ne JAMAIS forcer)
    if (_errorCount === _maxErrorsBeforeReload && window.UI && UI.toast) {
      UI.toast('L\'application a rencontre des erreurs. Rechargez si necessaire (Ctrl+Shift+R).', 'warning', 8000);
    }

    // Empecher le crash — toujours
    e.preventDefault();
  });

  window.addEventListener('unhandledrejection', function(e) {
    _errorCount++;
    var reason = '';
    try { reason = String(e.reason?.message || e.reason || '').substring(0, 200); } catch(x) {}

    _errorLog.push({ time: Date.now(), msg: 'Promise: ' + reason });
    if (_errorLog.length > 20) _errorLog.shift();

    // Empecher le crash — toujours
    e.preventDefault();
  });

  // ═══════════════════════════════════════════════════════════════════
  // 2. ROUTER SAFETY WRAPPER — Protege chaque rendu de page
  // ═══════════════════════════════════════════════════════════════════

  function _wrapRouter() {
    if (!window.Router || !Router.render || Router._stabilityWrapped) return;
    Router._stabilityWrapped = true;

    var _origRender = Router.render.bind(Router);
    Router.render = function(page) {
      try {
        _origRender(page);
      } catch (err) {
        console.error('[Stability] Erreur rendu page "' + page + '":', err);
        var container = document.getElementById('app-content');
        if (container) {
          container.innerHTML =
            '<div style="padding:60px 20px;text-align:center">' +
            '<div style="font-size:48px;margin-bottom:16px">⚠️</div>' +
            '<h2 style="color:var(--text);margin-bottom:8px">Erreur de chargement</h2>' +
            '<p style="color:var(--text-muted);margin-bottom:20px">La page "' + page + '" n\'a pas pu se charger.</p>' +
            '<button class="btn btn-primary" onclick="Router.navigate(\'dashboard\')">Retour au tableau de bord</button>' +
            ' <button class="btn btn-secondary" onclick="location.reload()">Recharger l\'app</button>' +
            '</div>';
        }
      }
    };
  }

  // ═══════════════════════════════════════════════════════════════════
  // 3. INDEXEDDB RECOVERY — Gestion quota, corruption, blocage
  // ═══════════════════════════════════════════════════════════════════

  function _wrapDBOperations() {
    if (!window.DB || DB._stabilityWrapped) return;
    DB._stabilityWrapped = true;

    // Wrapper dbAdd pour gerer QuotaExceededError
    var _origAdd = DB.dbAdd;
    if (_origAdd) {
      DB.dbAdd = async function(storeName, data) {
        try {
          return await _origAdd.call(DB, storeName, data);
        } catch (err) {
          var msg = String(err?.message || err || '');
          if (msg.indexOf('QuotaExceeded') !== -1 || msg.indexOf('quota') !== -1) {
            if (window.UI && UI.toast) {
              UI.toast('Espace de stockage plein. Exportez vos donnees et nettoyez les anciennes.', 'error', 10000);
            }
            throw new Error('QUOTA_EXCEEDED');
          }
          // IndexedDB bloque parfois apres un upgrade
          if (msg.indexOf('transaction') !== -1 || msg.indexOf('objectStore') !== -1) {
            console.warn('[Stability] DB transaction error on ' + storeName + ', retrying...');
            // Un seul retry apres 500ms
            await new Promise(function(r) { setTimeout(r, 500); });
            return await _origAdd.call(DB, storeName, data);
          }
          throw err;
        }
      };
    }

    // Wrapper dbPut pour gerer QuotaExceededError
    var _origPut = DB.dbPut;
    if (_origPut) {
      DB.dbPut = async function(storeName, data) {
        try {
          return await _origPut.call(DB, storeName, data);
        } catch (err) {
          var msg = String(err?.message || err || '');
          if (msg.indexOf('QuotaExceeded') !== -1 || msg.indexOf('quota') !== -1) {
            if (window.UI && UI.toast) {
              UI.toast('Espace de stockage plein. Exportez vos donnees.', 'error', 10000);
            }
            throw new Error('QUOTA_EXCEEDED');
          }
          throw err;
        }
      };
    }

    // Wrapper dbGetAll pour JAMAIS crasher (retourne [] en cas d'erreur)
    var _origGetAll = DB.dbGetAll;
    if (_origGetAll) {
      DB.dbGetAll = async function(storeName, indexName, indexValue) {
        try {
          return await _origGetAll.call(DB, storeName, indexName, indexValue);
        } catch (err) {
          console.warn('[Stability] dbGetAll("' + storeName + '") failed:', err?.message || err);
          return []; // Retourner un tableau vide au lieu de crasher
        }
      };
    }

    // Wrapper dbGet pour JAMAIS crasher (retourne null en cas d'erreur)
    var _origGet = DB.dbGet;
    if (_origGet) {
      DB.dbGet = async function(storeName, id) {
        try {
          return await _origGet.call(DB, storeName, id);
        } catch (err) {
          console.warn('[Stability] dbGet("' + storeName + '", ' + id + ') failed:', err?.message || err);
          return null;
        }
      };
    }
  }

  // ═══════════════════════════════════════════════════════════════════
  // 4. NETWORK RESILIENCE — Fetch securise qui ne crashe jamais
  // ═══════════════════════════════════════════════════════════════════

  window.safeFetch = async function(url, options, timeoutMs) {
    timeoutMs = timeoutMs || 10000;
    if (!navigator.onLine) return { ok: false, offline: true, data: null };

    var controller = new AbortController();
    var timer = setTimeout(function() { controller.abort(); }, timeoutMs);
    try {
      var resp = await fetch(url, Object.assign({}, options || {}, { signal: controller.signal }));
      clearTimeout(timer);
      return { ok: resp.ok, status: resp.status, data: resp };
    } catch (err) {
      clearTimeout(timer);
      return { ok: false, offline: !navigator.onLine, error: err?.message || 'Network error', data: null };
    }
  };

  // ═══════════════════════════════════════════════════════════════════
  // 5. VERSION CHECKER — Verifie si une nouvelle version est dispo
  // ═══════════════════════════════════════════════════════════════════

  var _versionCheckInterval = 4 * 60 * 60 * 1000; // Toutes les 4 heures
  var _versionCheckKey = 'ordivex_last_version_check';
  var _latestVersionKey = 'ordivex_latest_version';
  var _versionDismissedKey = 'ordivex_version_dismissed';

  async function checkForUpdates(silent) {
    // Ne jamais checker hors-ligne
    if (!navigator.onLine) return null;

    // Throttle: ne pas checker plus d'une fois toutes les 4h
    try {
      var lastCheck = parseInt(localStorage.getItem(_versionCheckKey) || '0');
      if (Date.now() - lastCheck < _versionCheckInterval && silent) return null;
    } catch(e) {}

    // Detecter l'URL de base (GitHub Pages ou local)
    var baseUrl = '';
    try {
      var loc = window.location;
      if (loc.hostname.indexOf('github.io') !== -1) {
        // GitHub Pages: https://user.github.io/repo/
        baseUrl = loc.origin + loc.pathname.replace(/\/[^\/]*$/, '/');
      } else {
        baseUrl = loc.origin + '/';
      }
    } catch(e) { return null; }

    var result = await safeFetch(baseUrl + 'version.json?_=' + Date.now(), null, 8000);
    if (!result.ok || !result.data) {
      // Offline ou erreur — silencieux, pas de crash
      return null;
    }

    try {
      var remote = await result.data.json();
      localStorage.setItem(_versionCheckKey, String(Date.now()));
      localStorage.setItem(_latestVersionKey, JSON.stringify(remote));

      var currentVersion = window.APP_VERSION || '0.0.0';
      if (remote.version && remote.version !== currentVersion) {
        var dismissed = localStorage.getItem(_versionDismissedKey);
        if (dismissed === remote.version && silent) return remote; // Deja vu, ne pas re-notifier

        return remote;
      }
      return null; // Meme version
    } catch(e) {
      return null; // JSON invalide — silencieux
    }
  }

  // Notification de mise a jour (non-bloquante)
  function _showUpdateNotification(remote) {
    if (!remote || !remote.version) return;
    if (!window.UI) return;

    var msg = 'Nouvelle version disponible : v' + remote.version;
    if (remote.changelog) msg += ' — ' + remote.changelog;

    // Toast non-bloquant
    UI.toast(msg + '. Rechargez pour mettre a jour (Ctrl+Shift+R).', 'info', 15000);

    // Marquer comme vu
    try { localStorage.setItem(_versionDismissedKey, remote.version); } catch(e) {}
  }

  // Ajouter dans Naomie la reponse dynamique
  function _injectNaomieVersionCheck() {
    if (!window.CONVERSATIONS) {
      // CONVERSATIONS n'est pas encore disponible, reessayer plus tard
      setTimeout(_injectNaomieVersionCheck, 2000);
      return;
    }

    // Verifier si deja injecte
    var alreadyHas = CONVERSATIONS.some(function(c) {
      return c.triggers && c.triggers.indexOf('mise a jour disponible') !== -1;
    });
    if (alreadyHas) return;

    CONVERSATIONS.push({
      triggers: ['mise a jour disponible', 'nouvelle version', 'update disponible', 'derniere version', 'a jour'],
      dynamic: true,
      responses: [],
      getResponse: async function() {
        var currentVersion = window.APP_VERSION || '0.0.0';

        // Essayer de checker en live
        if (navigator.onLine) {
          var remote = await checkForUpdates(false);
          if (remote && remote.version && remote.version !== currentVersion) {
            return '🆕 <strong>Mise a jour disponible !</strong><br><br>' +
              'Version actuelle : <strong>v' + currentVersion + '</strong><br>' +
              'Nouvelle version : <strong>v' + remote.version + '</strong><br>' +
              (remote.changelog ? 'Nouveautes : ' + remote.changelog + '<br>' : '') +
              (remote.date ? 'Date : ' + remote.date + '<br>' : '') +
              '<br>Pour mettre a jour : <strong>Ctrl+Shift+R</strong> (ou fermez et rouvrez l\'app). ' +
              'Vos donnees sont conservees ! 💾';
          } else {
            return '✅ Vous utilisez deja la <strong>derniere version</strong> d\'OrdiveX : <strong>v' + currentVersion + '</strong> !<br><br>' +
              'Aucune mise a jour disponible pour le moment. Je verifierai automatiquement toutes les 4 heures ! 🔄';
          }
        } else {
          // Hors-ligne : utiliser le cache
          try {
            var cached = JSON.parse(localStorage.getItem(_latestVersionKey) || 'null');
            if (cached && cached.version && cached.version !== currentVersion) {
              return '🆕 Une <strong>mise a jour</strong> a ete detectee lors de la derniere verification :<br><br>' +
                'Version actuelle : <strong>v' + currentVersion + '</strong><br>' +
                'Disponible : <strong>v' + cached.version + '</strong><br><br>' +
                '⚠️ Vous etes <strong>hors-ligne</strong>. Connectez-vous a internet puis rechargez pour mettre a jour.';
            }
          } catch(e) {}
          return '📡 Vous etes actuellement <strong>hors-ligne</strong>, {name}.<br><br>' +
            'Version actuelle : <strong>v' + currentVersion + '</strong><br><br>' +
            'Je ne peux pas verifier les mises a jour sans connexion internet. ' +
            'Connectez-vous au Wi-Fi et reposez-moi la question ! 😊';
        }
      }
    });
  }

  // ═══════════════════════════════════════════════════════════════════
  // 6. WATCHDOG MEMOIRE — Alerter si memoire faible
  // ═══════════════════════════════════════════════════════════════════

  function _memoryWatchdog() {
    if (!navigator.storage || !navigator.storage.estimate) return;
    navigator.storage.estimate().then(function(est) {
      var usedMB = Math.round((est.usage || 0) / 1024 / 1024);
      var quotaMB = Math.round((est.quota || 0) / 1024 / 1024);
      var pct = quotaMB > 0 ? Math.round((usedMB / quotaMB) * 100) : 0;
      if (pct > 85 && window.UI && UI.toast) {
        UI.toast('Stockage utilise a ' + pct + '% (' + usedMB + ' Mo / ' + quotaMB + ' Mo). Pensez a exporter vos donnees.', 'warning', 10000);
      }
    }).catch(function() { /* Silencieux */ });
  }

  // ═══════════════════════════════════════════════════════════════════
  // 7. PROTECTION DES FONCTIONS CRITIQUES
  // ═══════════════════════════════════════════════════════════════════

  // Empecher les fonctions window.* globales de crasher l'app
  function _safeGlobal(fnName) {
    var orig = window[fnName];
    if (typeof orig !== 'function') return;
    window[fnName] = function() {
      try {
        return orig.apply(this, arguments);
      } catch(err) {
        console.error('[Stability] ' + fnName + '() crashed:', err?.message || err);
        if (window.UI && UI.toast) {
          UI.toast('Erreur dans ' + fnName + '. Veuillez reessayer.', 'error');
        }
      }
    };
  }

  // ═══════════════════════════════════════════════════════════════════
  // 8. PROTECTION SERVICE WORKER — eviter les caches corrompus
  // ═══════════════════════════════════════════════════════════════════

  function _cleanStaleSW() {
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.getRegistrations().then(function(regs) {
        // S'il y a un SW casse, le nettoyer
        regs.forEach(function(reg) {
          if (reg.active && reg.active.state === 'redundant') {
            reg.unregister();
          }
        });
      }).catch(function() { /* Silencieux */ });
    }
  }

  // ═══════════════════════════════════════════════════════════════════
  // 9. DIAGNOSTIC — Accessible via console pour le support
  // ═══════════════════════════════════════════════════════════════════

  window.OrdiveXDiag = {
    version: function() { return window.APP_VERSION || 'unknown'; },
    errors: function() { return _errorLog.slice(); },
    errorCount: function() { return _errorCount; },
    storage: async function() {
      if (!navigator.storage || !navigator.storage.estimate) return 'Non supporte';
      var est = await navigator.storage.estimate();
      return {
        usedMB: Math.round((est.usage || 0) / 1024 / 1024),
        quotaMB: Math.round((est.quota || 0) / 1024 / 1024),
        pct: Math.round(((est.usage || 0) / (est.quota || 1)) * 100)
      };
    },
    checkUpdate: function() { return checkForUpdates(false); },
    clearCache: function() {
      if (caches) {
        caches.keys().then(function(names) {
          names.forEach(function(n) { caches.delete(n); });
        });
      }
      localStorage.removeItem(_versionCheckKey);
      localStorage.removeItem(_versionDismissedKey);
      console.log('[Diag] Cache nettoye. Rechargez la page.');
    }
  };

  // ═══════════════════════════════════════════════════════════════════
  // 10. SAFE JSON — Parse qui ne crashe jamais
  // ═══════════════════════════════════════════════════════════════════

  window.safeJSON = function(str, fallback) {
    if (fallback === undefined) fallback = null;
    if (!str || typeof str !== 'string') return fallback;
    try { return JSON.parse(str); } catch(e) { return fallback; }
  };

  // ═══════════════════════════════════════════════════════════════════
  // 11. ASYNC RENDER PROTECTION — Wrappe les render* async des pages
  // ═══════════════════════════════════════════════════════════════════

  function _wrapAsyncRenders() {
    if (!window.Router || !Router.routes) return;
    var _wrapped = {};
    Object.keys(Router.routes).forEach(function(page) {
      var origFn = Router.routes[page];
      if (typeof origFn !== 'function' || _wrapped[page]) return;
      _wrapped[page] = true;
      Router.routes[page] = async function(container) {
        try {
          await origFn(container);
        } catch(err) {
          console.error('[Stability] Page "' + page + '" async error:', err);
          if (container) {
            container.innerHTML =
              '<div style="padding:60px 20px;text-align:center">' +
              '<div style="font-size:48px;margin-bottom:16px">⚠️</div>' +
              '<h2 style="color:var(--text);margin-bottom:8px">Erreur sur la page ' + page + '</h2>' +
              '<p style="color:var(--text-muted);margin-bottom:20px">' + (err?.message || 'Erreur inconnue').substring(0, 150) + '</p>' +
              '<button class="btn btn-primary" onclick="Router.navigate(\'dashboard\')">Tableau de bord</button>' +
              ' <button class="btn btn-secondary" onclick="location.reload()">Recharger</button>' +
              '</div>';
          }
        }
      };
    });
  }

  // ═══════════════════════════════════════════════════════════════════
  // 12. SAFE NUMBERS — Protections contre NaN, Infinity, division/0
  // ═══════════════════════════════════════════════════════════════════

  window.safeDiv = function(a, b, decimals) {
    if (!b || b === 0 || isNaN(a) || isNaN(b)) return 0;
    var result = a / b;
    if (!isFinite(result)) return 0;
    return decimals !== undefined ? parseFloat(result.toFixed(decimals)) : result;
  };

  window.safeNum = function(val, fallback) {
    if (fallback === undefined) fallback = 0;
    var n = parseFloat(val);
    return isNaN(n) || !isFinite(n) ? fallback : n;
  };

  // ═══════════════════════════════════════════════════════════════════
  // 13. ONLINE/OFFLINE INDICATOR — Feedback visuel reseau
  // ═══════════════════════════════════════════════════════════════════

  function _setupNetworkIndicator() {
    window.addEventListener('offline', function() {
      if (window.UI && UI.toast) {
        UI.toast('Connexion perdue. L\'app fonctionne hors-ligne.', 'warning', 5000);
      }
    });
    window.addEventListener('online', function() {
      if (window.UI && UI.toast) {
        UI.toast('Connexion retablie.', 'success', 3000);
      }
    });
  }

  // ═══════════════════════════════════════════════════════════════════
  // INIT — Activer toutes les protections
  // ═══════════════════════════════════════════════════════════════════

  function _initStability() {
    _wrapRouter();
    _wrapDBOperations();
    _wrapAsyncRenders();
    _cleanStaleSW();
    _injectNaomieVersionCheck();
    _setupNetworkIndicator();

    // Proteger les fonctions onclick globales critiques
    var criticalFns = [
      'submitProduct', 'updateProduct', 'submitUser', 'updateUser',
      'saveSettings', 'doBackup', 'restoreBackup', 'submitCashEntry',
      'confirmCaisseClose', 'resetUserPin', 'validerVente',
      'openAddCashEntry', 'exportDayTransactions',
      'submitFreeQuestion', 'printInvoice', 'printSaleReceipt'
    ];
    criticalFns.forEach(_safeGlobal);

    // Version check toutes les 4h (silencieux)
    setTimeout(function() {
      checkForUpdates(true).then(function(remote) {
        if (remote) _showUpdateNotification(remote);
      });
    }, 15000); // 15s apres le chargement

    setInterval(function() {
      checkForUpdates(true).then(function(remote) {
        if (remote) _showUpdateNotification(remote);
      });
    }, _versionCheckInterval);

    // Watchdog memoire toutes les 30 min
    setTimeout(_memoryWatchdog, 60000); // 1 min apres le chargement
    setInterval(_memoryWatchdog, 30 * 60 * 1000);

    console.log('[Stability] Bouclier de stabilite v9.4.1 active — ' + new Date().toLocaleTimeString('fr-FR'));
  }

  // Demarrer une fois le DOM pret
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function() { setTimeout(_initStability, 500); });
  } else {
    setTimeout(_initStability, 500);
  }

})();

