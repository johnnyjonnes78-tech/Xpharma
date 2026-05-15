/**
 * OrdiveX — Animations Utilitaires v9.4
 * Effets Count-up pour KPIs et configuration Charts
 */

/**
 * Anime un nombre de `start` à `end` dans un élément HTML
 * @param {HTMLElement} element - L'élément DOM cible
 * @param {number} start - Valeur de départ (généralement 0)
 * @param {number} end - Valeur finale
 * @param {number} duration - Durée en ms (défaut: 800)
 * @param {string} prefix - Préfixe (ex: '')
 * @param {string} suffix - Suffixe (ex: ' GNF', ' %')
 */
function animateValue(element, start, end, duration = 800, prefix = '', suffix = '') {
  if (!element) return;

  // Sécurité : si la valeur finale est invalide, afficher directement
  if (isNaN(end) || end === null || end === undefined) {
    element.textContent = prefix + '0' + suffix;
    return;
  }

  // Détection appareil lent : skip l'animation
  if (navigator.hardwareConcurrency && navigator.hardwareConcurrency < 4) {
    element.textContent = prefix + Math.floor(end).toLocaleString('fr-FR') + suffix;
    return;
  }

  const range = end - start;
  if (range === 0) {
    element.textContent = prefix + Math.floor(end).toLocaleString('fr-FR') + suffix;
    return;
  }

  const startTime = performance.now();

  function step(currentTime) {
    const elapsed = currentTime - startTime;
    const progress = Math.min(elapsed / duration, 1);
    // easeOutCubic pour un ralentissement naturel à la fin
    const eased = 1 - Math.pow(1 - progress, 3);
    const current = Math.floor(start + range * eased);
    element.textContent = prefix + current.toLocaleString('fr-FR') + suffix;
    if (progress < 1) {
      requestAnimationFrame(step);
    }
  }

  requestAnimationFrame(step);
}

/**
 * Anime tous les KPIs visibles sur la page
 * Cherche les éléments avec l'attribut data-animate-value
 * Usage HTML: <span class="kpi-value" data-animate-value="15450000" data-suffix=" GNF">0</span>
 */
function animateAllKPIs() {
  const kpis = document.querySelectorAll('[data-animate-value]');
  kpis.forEach((el, index) => {
    const end = parseFloat(el.getAttribute('data-animate-value'));
    const prefix = el.getAttribute('data-prefix') || '';
    const suffix = el.getAttribute('data-suffix') || '';
    const duration = 600 + (index * 100); // Décalage progressif entre KPIs
    // Petit délai pour que l'animation soit visible (pas au premier render)
    setTimeout(() => {
      animateValue(el, 0, end, duration, prefix, suffix);
    }, 150 + (index * 80));
  });
}

/**
 * Anime un élément KPI manuellement (pour les pages qui construisent le HTML en JS)
 * @param {string} selector - Sélecteur CSS de l'élément
 * @param {number} value - Valeur à animer
 * @param {string} suffix - Suffixe optionnel
 */
function animateKPI(selector, value, suffix = '') {
  const el = document.querySelector(selector);
  if (el) {
    animateValue(el, 0, value, 800, '', suffix);
  }
}

// Exposer globalement
window.animateValue = animateValue;
window.animateAllKPIs = animateAllKPIs;
window.animateKPI = animateKPI;
