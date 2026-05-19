/**
 * OrdiveX — DevTools Guard v9.4.6
 * Bloque l'acces aux outils developpeur pour les utilisateurs finaux
 * 
 * ACTIVATION : localStorage.setItem('ordivex_production_mode', 'true')
 * DESACTIVATION : localStorage.setItem('ordivex_production_mode', 'false')
 * 
 * Par defaut : DESACTIVE (mode developpement/test)
 * Ce fichier est 100% autonome — il ne modifie AUCUNE variable/fonction existante
 */
(function () {
  'use strict';

  // ── SECURITE : tout est wrappe pour ne JAMAIS crasher l'app ──
  try {

    // Verifier si le mode production est active
    function _isProductionMode() {
      try {
        return localStorage.getItem('ordivex_production_mode') === 'true';
      } catch (e) {
        return false; // Si localStorage est inaccessible, ne rien bloquer
      }
    }

    // Ne rien faire si le mode production n'est pas active
    if (!_isProductionMode()) return;

    // ═══════════════════════════════════════════════════════════════
    // 1. BLOQUER LES RACCOURCIS CLAVIER DevTools
    // ═══════════════════════════════════════════════════════════════
    // Liste des raccourcis OrdiveX a NE PAS bloquer :
    // Ctrl+1-5 (navigation), Ctrl+P (print), Ctrl+B (backup),
    // Ctrl+K (command palette), Escape (fermer modal), F5 (valider vente)
    document.addEventListener('keydown', function (e) {
      if (!_isProductionMode()) return; // Re-verifier a chaque frappe

      // F12 — Ouvrir DevTools
      if (e.key === 'F12') {
        e.preventDefault();
        e.stopPropagation();
        return false;
      }

      // Ctrl+Shift+I — Inspecter
      if (e.ctrlKey && e.shiftKey && e.key === 'I') {
        e.preventDefault();
        e.stopPropagation();
        return false;
      }

      // Ctrl+Shift+J — Console
      if (e.ctrlKey && e.shiftKey && e.key === 'J') {
        e.preventDefault();
        e.stopPropagation();
        return false;
      }

      // Ctrl+Shift+C — Selecteur d'elements
      if (e.ctrlKey && e.shiftKey && e.key === 'C') {
        e.preventDefault();
        e.stopPropagation();
        return false;
      }

      // Ctrl+U — Voir le code source
      if (e.ctrlKey && e.key === 'u') {
        e.preventDefault();
        e.stopPropagation();
        return false;
      }
    }, true); // 'true' = capture phase, intercepte AVANT les autres handlers

    // ═══════════════════════════════════════════════════════════════
    // 2. DESACTIVER LE CLIC DROIT (menu "Inspecter")
    // ═══════════════════════════════════════════════════════════════
    document.addEventListener('contextmenu', function (e) {
      if (!_isProductionMode()) return;
      e.preventDefault();
      return false;
    }, true);

    // ═══════════════════════════════════════════════════════════════
    // 3. DETECTION DevTools OUVERT (fallback si contournement)
    // ═══════════════════════════════════════════════════════════════
    // Technique : mesurer le temps d'execution de debugger
    // Si DevTools est ouvert, debugger pause l'execution → temps > seuil
    var _devtoolsWarned = false;
    function _checkDevTools() {
      if (!_isProductionMode()) return;
      var t0 = performance.now();
      // Cette ligne ne fait rien sauf si DevTools est ouvert
      // (debugger est ignore quand DevTools est ferme)
      (function () {}).constructor('debugger')();
      var t1 = performance.now();
      if (t1 - t0 > 100 && !_devtoolsWarned) {
        _devtoolsWarned = true;
        // Avertissement discret — pas de crash, pas de redirect
        if (window.UI && UI.toast) {
          UI.toast('Acces non autorise aux outils developpeur', 'warning', 5000);
        }
        // Reset apres 30s pour permettre une nouvelle detection
        setTimeout(function () { _devtoolsWarned = false; }, 30000);
      }
    }
    // Verifier toutes les 3 secondes (leger, pas de surcharge CPU)
    setInterval(_checkDevTools, 3000);

    // ═══════════════════════════════════════════════════════════════
    // 4. VIDER LA CONSOLE (si quelqu'un arrive a l'ouvrir)
    // ═══════════════════════════════════════════════════════════════
    setInterval(function () {
      if (!_isProductionMode()) return;
      try { console.clear(); } catch (e) { }
    }, 2000);

  } catch (e) {
    // Si QUOI QUE CE SOIT echoue, on ne fait RIEN
    // L'app continue de fonctionner normalement
  }
})();
