/**
 * OrdiveX — Settings, Users, Login
 */

function renderLogin(container) {
  document.getElementById('app-sidebar')?.style.setProperty('display', 'none');
  document.getElementById('app-topbar')?.style.setProperty('display', 'none');
  document.getElementById('app-content').style.marginLeft = '0';
  if (window.hideSupportWidget) hideSupportWidget();
  document.getElementById('app-content').style.paddingTop = '0';

  container.innerHTML = `
    <div class="login-wrapper">
      <div class="login-aside">
        <div class="login-aside-content">
          <div class="login-header">
            <div class="login-logo-elite">
              <i data-lucide="activity"></i>
            </div>
            <h1 class="login-title-elite">Ordive<span>X</span></h1>
            <p class="login-subtitle-elite">L'excellence opérationnelle pour votre officine.</p>
          </div>

          <form id="login-form" class="login-form-elite" onsubmit="handleLogin(event)">
            <div class="input-group-elite">
              <label for="login-username">Identifiant</label>
              <div class="input-wrapper-elite">
                <i data-lucide="user"></i>
                <input type="text" id="login-username" placeholder="votre identifiant" required>
              </div>
            </div>
            
            <div class="input-group-elite">
              <label for="login-password">Mot de passe</label>
              <div class="input-wrapper-elite">
                <i data-lucide="lock"></i>
                <input type="password" id="login-password" placeholder="••••••••" required>
              </div>
            </div>

            <div id="login-error" class="login-error-elite" style="display:none"></div>

            <button type="submit" class="login-submit-elite" id="login-submit">
              <span>Se connecter</span>
              <i data-lucide="chevron-right"></i>
            </button>
          </form>

        </div>
        
        <div class="login-footer-elite">
          <span class="version-tag">OrdiveX v9.4.1</span>
          <div class="network-tag ${navigator.onLine ? 'online' : 'offline'}">
            <i data-lucide="${navigator.onLine ? 'wifi' : 'wifi-off'}"></i>
            ${navigator.onLine ? 'Système synchronisé' : 'Mode hors-ligne'}
          </div>
        </div>
      </div>

      <div class="login-visual">
        <div class="mesh-gradient"></div>
        <div class="visual-content">
          <div class="glass-card">
            <div class="glass-icon"><i data-lucide="shield-check"></i></div>
            <h2>Sécurisez votre pharmacie</h2>
            <ul class="feature-list-elite">
              <li><i data-lucide="check"></i> Traçabilité patient de bout en bout</li>
              <li><i data-lucide="check"></i> Intelligence de gestion de stock</li>
              <li><i data-lucide="check"></i> Conformité DNPM Guinée garantie</li>
              <li><i data-lucide="check"></i> Paiements mobiles intégrés</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  `;

  if (window.lucide) lucide.createIcons();
}

function setDemo(u, p) {
  document.getElementById('login-username').value = u;
  document.getElementById('login-password').value = p;
}

async function handleLogin(event) {
  event.preventDefault();
  const username = document.getElementById('login-username').value;
  const password = document.getElementById('login-password').value;
  const btn = document.getElementById('login-submit');
  const errEl = document.getElementById('login-error');

  btn.disabled = true;
  btn.textContent = 'Connexion...';
  errEl.style.display = 'none';

  try {
    const user = await Auth.login(username, password);
    if (user) {
      document.getElementById('app-sidebar')?.style.removeProperty('display');
      document.getElementById('app-topbar')?.style.removeProperty('display');
      document.getElementById('app-content').style.marginLeft = '';
      document.getElementById('app-content').style.paddingTop = '';
      // Log access
      await DB.writeAudit('LOGIN', 'user', user.id, { username: user.username });

      // Navigate to dashboard
      initSidebar();
      updateTopbar();
      if (window.updatePharmacyDisplay) await updatePharmacyDisplay();
      if (window.initSupportWidget) initSupportWidget();

      // --- PIN POST-LOGIN ---
      await _showPinGate(user);
    } else {
      errEl.textContent = 'Identifiant ou mot de passe incorrect';
      errEl.style.display = 'block';
    }
  } catch (err) {
    errEl.textContent = 'Erreur de connexion : ' + err.message;
    errEl.style.display = 'block';
  } finally {
    btn.disabled = false;
    btn.innerHTML = `Connexion <i data-lucide="arrow-right"></i>`;
    if (window.lucide) lucide.createIcons();
  }
}
// ═══════════════════════════════════════════════════════════════════
// PIN POST-LOGIN GATE
// After username+password, user must enter a 4-digit PIN
// If no PIN is set, user is prompted to create one
// ═══════════════════════════════════════════════════════════════════
async function _showPinGate(user) {
  const pinKey = 'pin_user_' + user.id;
  const settings = await DB.dbGetAll('settings');
  let savedPin = settings.find(s => s.key === pinKey)?.value;

  // If no PIN set yet, auto-create default 0000
  if (!savedPin) {
    savedPin = '0000';
    await DB.dbPut('settings', { key: pinKey, value: '0000', updatedAt: Date.now() });
  }

  // Show PIN verification screen
  return new Promise((resolve) => {
    const firstName = (user.name || user.username || 'U').split(' ')[0];
    const initials = firstName.charAt(0).toUpperCase();
    let attempts = 0;
    const MAX_ATTEMPTS = 5;
    let currentPin = '';

    const overlay = document.createElement('div');
    overlay.id = 'pin-gate-overlay';
    overlay.innerHTML = `
      <div class="pin-gate-box">
        <div class="pin-gate-avatar">${initials}</div>
        <div class="pin-gate-name">${firstName}</div>
        <div class="pin-gate-subtitle">Entrez votre code PIN</div>
        <div class="pin-gate-dots" id="pin-gate-dots">
          <span class="pin-dot"></span>
          <span class="pin-dot"></span>
          <span class="pin-dot"></span>
          <span class="pin-dot"></span>
        </div>
        <div id="pin-gate-error" class="pin-gate-error"></div>
        <div class="pin-gate-numpad" id="pin-gate-numpad">
          <button class="pin-num" data-n="1">1</button>
          <button class="pin-num" data-n="2">2</button>
          <button class="pin-num" data-n="3">3</button>
          <button class="pin-num" data-n="4">4</button>
          <button class="pin-num" data-n="5">5</button>
          <button class="pin-num" data-n="6">6</button>
          <button class="pin-num" data-n="7">7</button>
          <button class="pin-num" data-n="8">8</button>
          <button class="pin-num" data-n="9">9</button>
          <button class="pin-num pin-clear" data-n="clear">C</button>
          <button class="pin-num" data-n="0">0</button>
          <button class="pin-num pin-back" data-n="back">&larr;</button>
        </div>
        <button id="pin-gate-logout" class="pin-gate-logout">Changer d'utilisateur</button>
      </div>
    `;
    document.body.appendChild(overlay);
    requestAnimationFrame(() => overlay.classList.add('visible'));

    const dots = overlay.querySelectorAll('.pin-dot');
    const errEl = overlay.querySelector('#pin-gate-error');
    const numpad = overlay.querySelector('#pin-gate-numpad');
    const logoutBtn = overlay.querySelector('#pin-gate-logout');

    function updateDots() {
      dots.forEach((d, i) => d.classList.toggle('filled', i < currentPin.length));
    }

    function shakeDots() {
      const dotsWrap = overlay.querySelector('.pin-gate-dots');
      dotsWrap.classList.add('shake');
      setTimeout(() => dotsWrap.classList.remove('shake'), 500);
    }

    async function checkPin() {
      if (currentPin === savedPin) {
        // Success
        dots.forEach(d => d.classList.add('success'));
        setTimeout(() => {
          overlay.classList.remove('visible');
          setTimeout(() => overlay.remove(), 300);
          _finishLogin(user);
          // If default PIN 0000, force user to change it
          if (savedPin === '0000') {
            setTimeout(() => _promptSetPin(user, true), 800);
          }
          resolve();
        }, 400);
      } else {
        attempts++;
        if (attempts >= MAX_ATTEMPTS) {
          errEl.textContent = 'Trop de tentatives. Reconnectez-vous.';
          setTimeout(() => {
            overlay.remove();
            if (window.Auth?.logout) Auth.logout();
          }, 1500);
          return;
        }
        errEl.textContent = 'Code PIN incorrect (' + (MAX_ATTEMPTS - attempts) + ' essais restants)';
        shakeDots();
        currentPin = '';
        setTimeout(updateDots, 500);
      }
    }

    numpad.addEventListener('click', (e) => {
      const btn = e.target.closest('.pin-num');
      if (!btn) return;
      const n = btn.dataset.n;
      errEl.textContent = '';

      if (n === 'clear') {
        currentPin = '';
        updateDots();
      } else if (n === 'back') {
        currentPin = currentPin.slice(0, -1);
        updateDots();
      } else {
        if (currentPin.length < 4) {
          currentPin += n;
          updateDots();
          if (currentPin.length === 4) {
            setTimeout(checkPin, 200);
          }
        }
      }
    });

    // Keyboard support
    document.addEventListener('keydown', function _pinKeyHandler(e) {
      if (!document.getElementById('pin-gate-overlay')) {
        document.removeEventListener('keydown', _pinKeyHandler);
        return;
      }
      if (e.key >= '0' && e.key <= '9' && currentPin.length < 4) {
        currentPin += e.key;
        updateDots();
        errEl.textContent = '';
        if (currentPin.length === 4) setTimeout(checkPin, 200);
      } else if (e.key === 'Backspace') {
        currentPin = currentPin.slice(0, -1);
        updateDots();
      } else if (e.key === 'Escape') {
        currentPin = '';
        updateDots();
      }
    });

    logoutBtn.addEventListener('click', () => {
      overlay.remove();
      if (window.Auth?.logout) Auth.logout();
      else window.location.reload();
    });
  });
}

function _finishLogin(user) {
  Router.navigate('dashboard');
  UI.toast('Bienvenue, ' + (user.name || user.username) + ' !', 'success');
  window.dispatchEvent(new CustomEvent('ordivex-login'));
}

function _promptSetPin(user, mandatory) {
  const pinKey = 'pin_user_' + user.id;
  const titleText = mandatory ? 'Changez votre code PIN par defaut' : 'Configurer votre code PIN';
  const descText = mandatory
    ? 'Votre PIN est actuellement 0000. Pour la securite de votre pharmacie, vous devez le changer maintenant.'
    : 'Pour renforcer la securite, definissez un code PIN a 4 chiffres. Il sera demande apres chaque connexion.';
  const modalEl = UI.modal(titleText,
    '<p style="margin-bottom:16px;color:var(--text-muted)">' + descText + '</p>' +
    '<div style="display:flex;gap:8px;justify-content:center;margin-bottom:16px">' +
    '<input type="password" id="new-pin-1" maxlength="1" style="width:50px;height:56px;text-align:center;font-size:24px;border-radius:12px;border:2px solid var(--border);background:var(--surface-2);color:var(--text);font-weight:700" inputmode="numeric" pattern="[0-9]">' +
    '<input type="password" id="new-pin-2" maxlength="1" style="width:50px;height:56px;text-align:center;font-size:24px;border-radius:12px;border:2px solid var(--border);background:var(--surface-2);color:var(--text);font-weight:700" inputmode="numeric" pattern="[0-9]">' +
    '<input type="password" id="new-pin-3" maxlength="1" style="width:50px;height:56px;text-align:center;font-size:24px;border-radius:12px;border:2px solid var(--border);background:var(--surface-2);color:var(--text);font-weight:700" inputmode="numeric" pattern="[0-9]">' +
    '<input type="password" id="new-pin-4" maxlength="1" style="width:50px;height:56px;text-align:center;font-size:24px;border-radius:12px;border:2px solid var(--border);background:var(--surface-2);color:var(--text);font-weight:700" inputmode="numeric" pattern="[0-9]">' +
    '</div>' +
    '<div id="set-pin-error" style="color:#e74c3c;font-size:13px;text-align:center;min-height:20px;margin-bottom:8px"></div>' +
    '<div style="display:flex;gap:8px;justify-content:center">' +
    (mandatory ? '' : '<button class="btn btn-secondary" onclick="UI.closeModal()">Plus tard</button>') +
    '<button class="btn btn-primary" id="save-pin-btn">Enregistrer le PIN</button>' +
    '</div>'
  );
  // If mandatory, hide close button and prevent clicking outside to close
  if (mandatory && modalEl) {
    const closeBtn = modalEl.querySelector('#modal-close-btn');
    if (closeBtn) closeBtn.style.display = 'none';
    modalEl.onclick = null; // Prevent closing by clicking overlay
  }

  // Auto-focus and auto-advance
  setTimeout(() => {
    const inputs = [1,2,3,4].map(i => document.getElementById('new-pin-' + i));
    if (inputs[0]) inputs[0].focus();
    inputs.forEach((inp, idx) => {
      if (!inp) return;
      inp.addEventListener('input', () => {
        inp.value = inp.value.replace(/[^0-9]/g, '');
        if (inp.value && idx < 3) inputs[idx + 1]?.focus();
      });
      inp.addEventListener('keydown', (e) => {
        if (e.key === 'Backspace' && !inp.value && idx > 0) inputs[idx - 1]?.focus();
      });
    });

    const saveBtn = document.getElementById('save-pin-btn');
    if (saveBtn) {
      saveBtn.addEventListener('click', async () => {
        const pin = inputs.map(i => i?.value || '').join('');
        const errEl = document.getElementById('set-pin-error');
        if (pin.length !== 4) {
          if (errEl) errEl.textContent = 'Le PIN doit contenir 4 chiffres';
          return;
        }
        if (pin === '0000') {
          if (errEl) errEl.textContent = 'Le code 0000 n\'est pas autorise. Choisissez un autre PIN.';
          return;
        }
        await DB.dbPut('settings', { key: pinKey, value: pin, updatedAt: Date.now() });
        UI.closeModal();
        UI.toast('Code PIN enregistre avec succes', 'success');
      });
    }
  }, 300);
}

// Inject PIN gate CSS
(function() {
  const s = document.createElement('style');
  s.textContent = `
    #pin-gate-overlay {
      position:fixed; inset:0; z-index:99998;
      background:rgba(9,26,50,0.92);
      backdrop-filter:blur(24px); -webkit-backdrop-filter:blur(24px);
      display:flex; align-items:center; justify-content:center;
      opacity:0; transition:opacity 0.3s;
    }
    #pin-gate-overlay.visible { opacity:1; }
    .pin-gate-box {
      text-align:center; padding:40px 36px; width:340px; max-width:92vw;
      background:rgba(255,255,255,0.05); border:1px solid rgba(255,255,255,0.08);
      border-radius:24px;
    }
    .pin-gate-avatar {
      width:68px; height:68px; margin:0 auto 14px; border-radius:50%;
      font-size:26px; font-weight:800;
      background:linear-gradient(135deg,#2E86C1,#1a5276);
      color:#fff; display:flex; align-items:center; justify-content:center;
      box-shadow:0 4px 20px rgba(46,134,193,0.3);
    }
    .pin-gate-name { color:#fff; font-size:18px; font-weight:700; margin-bottom:2px; }
    .pin-gate-subtitle { color:rgba(255,255,255,0.45); font-size:13px; margin-bottom:24px; }
    .pin-gate-dots {
      display:flex; gap:14px; justify-content:center; margin-bottom:16px;
    }
    .pin-gate-dots.shake { animation:pinShake 0.4s ease-in-out; }
    .pin-dot {
      width:16px; height:16px; border-radius:50%;
      border:2px solid rgba(255,255,255,0.25);
      transition:background 0.15s, border-color 0.15s;
    }
    .pin-dot.filled {
      background:#2E86C1; border-color:#2E86C1;
    }
    .pin-dot.success {
      background:#2ecc71; border-color:#2ecc71;
    }
    .pin-gate-error { color:#f87171; font-size:12px; min-height:18px; margin-bottom:10px; }
    .pin-gate-numpad {
      display:grid; grid-template-columns:repeat(3,1fr); gap:10px;
      max-width:240px; margin:0 auto 16px;
    }
    .pin-num {
      width:100%; aspect-ratio:1.5; border:none; border-radius:14px;
      background:rgba(255,255,255,0.08); color:#fff; font-size:22px; font-weight:600;
      cursor:pointer; transition:background 0.15s, transform 0.1s;
      font-family:inherit; display:flex; align-items:center; justify-content:center;
    }
    .pin-num:hover { background:rgba(255,255,255,0.15); }
    .pin-num:active { transform:scale(0.93); background:rgba(46,134,193,0.3); }
    .pin-clear { font-size:16px; color:rgba(255,255,255,0.5); }
    .pin-back { font-size:20px; }
    .pin-gate-logout {
      background:none; border:none; color:rgba(255,255,255,0.35);
      font-size:12px; cursor:pointer; margin-top:12px; padding:6px;
      transition:color 0.2s; font-family:inherit;
    }
    .pin-gate-logout:hover { color:rgba(255,255,255,0.6); }
  `;
  document.head.appendChild(s);
})();

async function renderSettings(container) {
  if (DB.AppState.currentUser?.role !== 'admin') {
    container.innerHTML = `<div class="error-state">Accès refusé — Réservé à l'administrateur</div>`;
    return;
  }

  const [users, auditLog, settingsData] = await Promise.all([
    DB.dbGetAll('users'),
    DB.dbGetAll('auditLog'),
    DB.dbGetAll('settings'),
  ]);

  // Load settings into a map
  const gs = k => settingsData.find(s => s.key === k)?.value || '';
  const smsConfigStr = settingsData.find(s => s.key === 'sms_config')?.value;
  let smsConfig = { provider: 'africastalking', enabled: false, apiKey: '', username: '', senderId: 'OrdiveX', countryCode: '+224' };
  try { if (smsConfigStr) smsConfig = JSON.parse(smsConfigStr); } catch(e) { /* corrupted sms config — use defaults */ }

  const recentAudit = auditLog.sort((a, b) => b.timestamp - a.timestamp).slice(0, 20);

  container.innerHTML = `
    <div class="page-header">
      <div>
        <h1 class="page-title">Paramètres & Administration</h1>
        <p class="page-subtitle">Gestion des utilisateurs, sécurité et configuration</p>
      </div>
    </div>

    <div class="settings-grid">
      <!-- Pharmacy Info -->
      <div class="settings-card">
        <h3 class="settings-card-title"><i data-lucide="hospital"></i> Informations Pharmacie</h3>
        <form id="settings-form" class="form-grid">
          <div class="form-group">
            <label>Nom de la pharmacie</label>
            <input type="text" name="pharmacy_name" class="form-control" value="${gs('pharmacy_name') || 'Pharmacie Centrale de Conakry'}">
          </div>
          <div class="form-group">
            <label>Adresse</label>
            <input type="text" name="pharmacy_address" class="form-control" value="${gs('pharmacy_address') || 'Avenue de la République, Conakry'}">
          </div>
          <div class="form-group">
            <label>Slogan / Phrase d'accroche</label>
            <input type="text" name="pharmacy_slogan" class="form-control" value="${gs('pharmacy_slogan') || 'Santé & Technologie'}" placeholder="Ex: Votre santé, notre priorité">
          </div>
          <div class="form-group">
            <label>Logo de la pharmacie</label>
            <div id="logo-preview-container" class="settings-logo-container">
              ${gs('pharmacy_logo') ? `
                <img src="${gs('pharmacy_logo')}" id="settings-logo-img" style="max-height: 80px; object-fit: contain; margin-bottom: 0.5rem; display: block;">
                <button type="button" class="btn btn-xs btn-danger" onclick="removeLogo()"><i data-lucide="trash-2"></i> Supprimer le logo</button>
              ` : `
                <div class="logo-placeholder" style="width: 60px; height: 60px; border: 2px dashed #ccc; border-radius: 8px; display: flex; align-items: center; justify-content: center; font-size: 1.5rem; margin-bottom: 0.5rem;"><i data-lucide="image"></i></div>
                <button type="button" class="btn btn-xs btn-secondary" onclick="document.getElementById('logo-upload').click()"><i data-lucide="upload"></i> Choisir un logo...</button>
              `}
              <input type="file" id="logo-upload" accept="image/*" style="display: none;" onchange="handleLogoUpload(event)">
              <input type="hidden" name="pharmacy_logo" id="pharmacy-logo-input" value="${gs('pharmacy_logo') || ''}">
            </div>
          </div>
          <div class="form-row">
            <div class="form-group">
              <label>Téléphone</label>
              <input type="text" name="pharmacy_phone" class="form-control" value="${gs('pharmacy_phone') || '+224 620 000 000'}">
            </div>
            <div class="form-group">
              <label>Email</label>
              <input type="email" name="pharmacy_email" class="form-control" value="${gs('pharmacy_email') || ''}">
            </div>
          </div>
          <div class="form-row">
            <div class="form-group">
              <label>N° Licence DNPM</label>
              <input type="text" name="pharmacy_dnpm" class="form-control" value="${gs('pharmacy_dnpm') || 'LIC-DNPM-2024-001'}">
            </div>
            <div class="form-group">
              <label>Pharmacien responsable</label>
              <input type="text" name="pharmacy_resp" class="form-control" value="${gs('pharmacy_resp') || 'Pharmacien Responsable'}">
            </div>
          </div>
          <div class="form-row">
            <div class="form-group">
              <label>Seuil alerte stock</label>
              <input type="number" name="min_stock_alert" class="form-control" value="${gs('min_stock_alert') || '10'}">
            </div>
            <div class="form-group">
              <label>Alerte expiration (jours)</label>
              <input type="number" name="expiry_alert_days" class="form-control" value="${gs('expiry_alert_days') || '90'}">
            </div>
          </div>
          <button type="button" class="btn btn-primary" onclick="saveSettings()"><i data-lucide="save"></i> Sauvegarder les paramètres</button>
        </form>
      </div>

      <!-- Configuration SMS -->
      <div class="settings-card">
        <div style="display:flex; align-items:center; justify-content:space-between; margin-bottom:16px;">
          <h3 class="settings-card-title" style="margin:0"><i data-lucide="message-square"></i> Configuration SMS</h3>
          <label style="display:flex; align-items:center; gap:6px; cursor:pointer">
            <input type="checkbox" id="sms-enabled-cb" ${smsConfig.enabled ? 'checked' : ''} onchange="document.getElementById('sms-settings-box').style.opacity = this.checked ? '1' : '0.5'; document.getElementById('sms-settings-box').style.pointerEvents = this.checked ? 'auto' : 'none';">
            <span style="font-weight:600; font-size:13px">Activer les SMS</span>
          </label>
        </div>
        <div id="sms-settings-box" style="opacity: ${smsConfig.enabled ? '1' : '0.5'}; pointer-events: ${smsConfig.enabled ? 'auto' : 'none'}; transition: all 0.3s">
          <form id="sms-config-form" class="form-grid">
            <div class="form-row">
              <div class="form-group">
                <label>Fournisseur API</label>
                <select name="provider" class="form-control" onchange="document.getElementById('sms-username-group').style.display = this.value === 'africastalking' ? 'block' : 'none'">
                  <option value="africastalking" ${smsConfig.provider === 'africastalking' ? 'selected' : ''}>AfricasTalking (Recommandé)</option>
                  <option value="twilio" ${smsConfig.provider === 'twilio' ? 'selected' : ''}>Twilio</option>
                  <option value="orange" ${smsConfig.provider === 'orange' ? 'selected' : ''}>Orange SMS API</option>
                </select>
              </div>
              <div class="form-group">
                <label>Nom de l'Expéditeur (Sender ID)</label>
                <input type="text" name="senderId" class="form-control" value="${smsConfig.senderId || 'OrdiveX'}" placeholder="Max 11 caractères">
              </div>
            </div>
            <div class="form-group" id="sms-username-group" style="display: ${smsConfig.provider === 'africastalking' ? 'block' : 'none'}">
              <label>Nom d'utilisateur (Username)</label>
              <input type="text" name="username" class="form-control" value="${smsConfig.username || ''}" placeholder="Ex: sandbox ou votre_nom">
            </div>
            <div class="form-group">
              <label>Clé API (API Key)</label>
              <input type="password" name="apiKey" class="form-control" value="${smsConfig.apiKey || ''}" placeholder="Votre clé secrète">
            </div>
            <div class="form-row">
              <div class="form-group">
                <label>Préfixe téléphonique pays</label>
                <input type="text" name="countryCode" class="form-control" value="${smsConfig.countryCode || '+224'}" placeholder="Ex: +224">
              </div>
            </div>
            <div style="display:flex; gap:8px">
              <button type="button" class="btn btn-primary" onclick="saveSmsConfig()"><i data-lucide="save"></i> Enregistrer Config SMS</button>
              <button type="button" class="btn btn-secondary" onclick="testSmsConnection()"><i data-lucide="send"></i> Tester l'envoi</button>
            </div>
          </form>
        </div>
      </div>

      <!-- Users Management (Admin Only) -->
      ${DB.AppState.currentUser?.role === 'admin' ? `
      <div class="settings-card">
        <div class="panel-header" style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:10px">
          <h3 class="settings-card-title"><i data-lucide="users"></i> Gestion des Utilisateurs</h3>
          <button class="btn btn-sm btn-primary" onclick="showAddUser()"><i data-lucide="plus"></i> Ajouter</button>
        </div>
        <div class="users-list" style="display:flex;flex-direction:column;gap:8px;margin-top:12px">
          ${users.map(u => `
            <div class="user-item-card" style="display:flex;align-items:center;gap:12px;padding:14px 16px;background:var(--bg);border:1px solid var(--border);border-radius:12px;flex-wrap:wrap">
              <div class="user-avatar" style="width:42px;height:42px;border-radius:50%;background:var(--primary-light,rgba(46,134,193,0.15));color:var(--primary-color,#2E86C1);display:flex;align-items:center;justify-content:center;font-weight:700;font-size:16px;flex-shrink:0">${u.name?.charAt(0).toUpperCase() || '?'}</div>
              <div class="user-info" style="flex:1;min-width:120px">
                <div class="user-name" style="font-weight:600;font-size:14px">${u.name}</div>
                <div class="user-meta" style="display:flex;gap:6px;flex-wrap:wrap;align-items:center;margin-top:4px">
                  <code style="font-size:11px;background:var(--surface);padding:2px 6px;border-radius:4px">${u.username}</code>
                  ${UI.roleBadge(u.role)}
                  <span class="badge badge-${u.active ? 'success' : 'neutral'}">${u.active ? 'Actif' : 'Inactif'}</span>
                </div>
              </div>
              <button class="btn btn-sm btn-primary" onclick="viewEmployee360(${u.id})" style="flex-shrink:0;min-width:70px;justify-content:center"><i data-lucide="bar-chart-3"></i> Profil</button>
              <button class="btn btn-sm btn-secondary" onclick="editUser(${u.id})" style="flex-shrink:0;min-width:90px;justify-content:center"><i data-lucide="edit-3"></i> Modifier</button>
              <button class="btn btn-sm btn-ghost" onclick="resetUserPin(${u.id}, '${(u.name||'').replace(/'/g,'')}')" style="flex-shrink:0;min-width:80px;justify-content:center" title="Reinitialiser le PIN a 0000"><i data-lucide="key-round"></i> PIN</button>
            </div>`).join('')}
        </div>
      </div>` : ''}

      <!-- Sync Status (GAUCHE) -->
      <div class="settings-card">
        <h3 class="settings-card-title"><i data-lucide="rotate-cw"></i> Synchronisation & Sauvegarde</h3>
        <div class="sync-panel">
          <div class="sync-status-row">
            <span>Statut réseau</span>
            <span class="${navigator.onLine ? 'text-success' : 'text-danger'}">${navigator.onLine ? '<i data-lucide="wifi"></i> En ligne' : '<i data-lucide="wifi-off"></i> Hors ligne'}</span>
          </div>
          <div class="sync-status-row">
            <span>Dernière sync</span>
            <span class="text-muted">${UI.formatDateTime(Date.now())}</span>
          </div>
          <div class="sync-status-row">
            <span>Mode opération</span>
            <span class="badge badge-success">Offline-First <i data-lucide="check"></i></span>
          </div>
          <div class="sync-status-row">
            <span><i data-lucide="monitor" style="width:14px;height:14px;vertical-align:middle;margin-right:4px;"></i> Appareils connectés</span>
            <span>
              <span id="settings-device-count" class="badge badge-info" style="font-size:0.85rem; cursor:pointer;" onclick="if(window.UI && UI.openSyncMonitor) UI.openSyncMonitor(); loadDeviceCount();">Chargement...</span>
            </span>
          </div>
          <div class="sync-actions">
            <button class="btn btn-secondary" onclick="doBackup()"><i data-lucide="save"></i> Sauvegarder maintenant</button>
            <button class="btn btn-ghost" onclick="restoreBackup()"><i data-lucide="folder-open"></i> Restaurer une sauvegarde</button>
          </div>
          <div class="sync-repair-zone" style="margin-top: 1rem; padding-top: 1rem; border-top: 1px dashed rgba(0,0,0,0.1);">
             <div style="display:flex; flex-direction:column; gap:0.5rem">
                <button class="btn btn-sm btn-primary" onclick="triggerPull()"><i data-lucide="cloud-download"></i> Récupérer les données du Cloud (PULL)</button>
                <button class="btn btn-sm btn-secondary" onclick="DB.syncToSupabase()"><i data-lucide="cloud-lightning"></i> Envoi forcé vers le Cloud (PUSH)</button>
                <button class="btn btn-xs btn-outline-danger" onclick="repairSync()"><i data-lucide="wrench"></i> ⚙️ Réparer l'envoi Cloud</button>
             </div>
          </div>
        </div>
      </div>

      <!-- Appareil & Cloud Config (DROITE) -->
      <div class="settings-card">
        <h3 class="settings-card-title"><i data-lucide="monitor"></i> Appareil & Cloud</h3>
        <div class="sync-panel">
          <h4 style="margin-bottom: 0.5rem; font-size: 0.9rem;">Identité de cet Appareil</h4>
          <p style="font-size: 0.8rem; color: var(--text-muted); margin-bottom: 12px;">Nom affiché dans le Moniteur de Réseau.</p>
          <div class="form-grid" style="margin-bottom: 16px;">
            <div class="form-row">
              <div class="form-group">
                <label>Nom de l'appareil</label>
                <input type="text" id="device-name-input" class="form-control" value="${localStorage.getItem('pharma_device_name') || 'Caisse 1'}" placeholder="Ex: PC Bureau, Mobile Vente...">
              </div>
              <div class="form-group" style="display:flex;align-items:flex-end;">
                <button type="button" class="btn btn-sm btn-primary" onclick="saveDeviceName()"><i data-lucide="save"></i> Enregistrer</button>
              </div>
            </div>
            <div style="font-size:0.75rem; color:var(--text-muted)">ID : <code>${localStorage.getItem('pharma_device_id') || 'N/A'}</code></div>
          </div>
          <hr style="margin: 1rem 0; opacity: 0.1;">
          <h4 style="margin-bottom: 0.5rem; font-size: 0.9rem;">Configuration Supabase</h4>
          <form id="supabase-config-form" class="form-grid">
            <div class="form-group">
              <label>URL Supabase</label>
              <input type="password" name="supabase_url" class="form-control" value="${gs('supabase_url') || ''}" placeholder="https://xyz.supabase.co">
            </div>
            <div class="form-group">
              <label>Clé Supabase (Anon Public)</label>
              <input type="password" name="supabase_key" class="form-control" value="${gs('supabase_key') || ''}" placeholder="eyJhbGciOiJI...">
            </div>
            <button type="button" class="btn btn-xs btn-secondary" onclick="saveSupabaseConfig()">Enregistrer la config Cloud</button>
          </form>
        </div>
      </div>

      <!-- Audit Log -->
      <div class="settings-card settings-card-wide">
        <h3 class="settings-card-title"><i data-lucide="clipboard-list"></i> Journal d'Audit (20 dernières actions)</h3>
        <div class="table-wrapper">
          <table class="data-table">
            <thead><tr><th>Date/Heure</th><th>Utilisateur</th><th>Action</th><th>Entité</th><th>Détails</th></tr></thead>
            <tbody>
              ${recentAudit.map(log => `
                <tr>
                  <td class="text-sm">${UI.formatDateTime(log.timestamp)}</td>
                  <td><code>${log.username || '—'}</code></td>
                  <td><span class="badge badge-neutral">${log.action}</span></td>
                  <td>${log.entity || '—'}</td>
                  <td class="text-muted text-sm">${JSON.stringify(log.details || {}).substring(0, 60)}...</td>
                </tr>`).join('')}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  `;

  // Rendre les icônes Lucide IMMÉDIATEMENT pour éviter le layout shift
  if (window.lucide) lucide.createIcons();

  // Charger le compteur d'appareils automatiquement
  setTimeout(() => { if (window.loadDeviceCount) loadDeviceCount(); }, 500);
}

async function saveSettings() {
  const form = document.getElementById('settings-form');
  if (!form) return;
  const data = Object.fromEntries(new FormData(form));
  try {
    for (const [key, value] of Object.entries(data)) {
      const existing = (await DB.dbGetAll('settings')).find(s => s.key === key);
      if (existing) {
        await DB.dbPut('settings', { ...existing, value, updatedAt: Date.now() });
      } else {
        await DB.dbAdd('settings', { key, value, updatedAt: Date.now() });
      }
    }
    await DB.writeAudit('SAVE_SETTINGS', 'settings', null, data);
    updatePharmacyDisplay();
    UI.toast('Paramètres sauvegardés avec succès', 'success');
  } catch (err) {
    UI.toast('Erreur : ' + err.message, 'error');
  }
}

function showAddUser() {
  UI.modal('<i data-lucide="user-plus" class="modal-icon-inline"></i> Nouvel Utilisateur', `
    <form id="user-form" class="form-grid">
      <div class="form-row">
        <div class="form-group">
          <label>Nom complet *</label>
          <input type="text" name="name" class="form-control" required>
        </div>
        <div class="form-group">
          <label>Identifiant *</label>
          <input type="text" name="username" class="form-control" required>
        </div>
      </div>
      <div class="form-row">
        <div class="form-group">
          <label>Mot de passe *</label>
          <input type="password" name="password" class="form-control" required>
        </div>
        <div class="form-group">
          <label>Rôle *</label>
          <select name="role" class="form-control" required>
            <option value="caissier">Caissier</option>
            <option value="pharmacien">Pharmacien</option>
            <option value="admin">Administrateur</option>
          </select>
        </div>
      </div>
      <div class="form-group">
        <label>Email</label>
        <input type="email" name="email" class="form-control">
      </div>
    </form>
  `, {
    footer: `
      <button class="btn btn-secondary" onclick="UI.closeModal()">Annuler</button>
      <button class="btn btn-primary" onclick="submitUser()"><i data-lucide="check"></i> Créer</button>
    `
  });
  if (window.lucide) lucide.createIcons();
}

async function submitUser() {
  const form = document.getElementById('user-form');
  if (!form?.checkValidity()) { form?.reportValidity(); return; }
  const data = Object.fromEntries(new FormData(form));
  data.active = true;
  try {
    await DB.dbAdd('users', data);
    await DB.writeAudit('ADD_USER', 'users', null, { name: data.name, username: data.username, role: data.role });
    UI.closeModal();
    UI.toast('Utilisateur créé', 'success');
    Router.navigate('settings');
  } catch (err) {
    UI.toast('Erreur : ' + (err.message.includes('unique') ? 'Cet identifiant existe déjà' : err.message), 'error');
  }
}

async function editUser(id) {
  const u = await DB.dbGet('users', id);
  if (!u) { UI.toast('Utilisateur introuvable', 'error'); return; }

  UI.modal('<i data-lucide="edit-3" class="modal-icon-inline"></i> Modifier l\'utilisateur', `
    <form id="edit-user-form" class="form-grid">
      <div class="form-row">
        <div class="form-group">
          <label>Nom complet *</label>
          <input type="text" name="name" class="form-control" value="${u.name || ''}" required>
        </div>
        <div class="form-group">
          <label>Identifiant</label>
          <input type="text" class="form-control" value="${u.username}" disabled>
        </div>
      </div>
      <div class="form-row">
        <div class="form-group">
          <label>Nouveau mot de passe</label>
          <input type="password" name="password" class="form-control" placeholder="(laisser vide pour ne pas changer)">
        </div>
        <div class="form-group">
          <label>Rôle *</label>
          <select name="role" class="form-control" required>
            <option value="caissier" ${u.role === 'caissier' ? 'selected' : ''}>Caissier</option>
            <option value="pharmacien" ${u.role === 'pharmacien' ? 'selected' : ''}>Pharmacien</option>
            <option value="admin" ${u.role === 'admin' ? 'selected' : ''}>Administrateur</option>
          </select>
        </div>
      </div>
      <div class="form-row">
        <div class="form-group">
          <label>Email</label>
          <input type="email" name="email" class="form-control" value="${u.email || ''}">
        </div>
        <div class="form-group">
          <label>Statut</label>
          <select name="active" class="form-control">
            <option value="true" ${u.active ? 'selected' : ''}>Actif</option>
            <option value="false" ${!u.active ? 'selected' : ''}>Inactif — Désactivé</option>
          </select>
        </div>
      </div>
    </form>
  `, {
    footer: `
      <button class="btn btn-secondary" onclick="UI.closeModal()">Annuler</button>
      <button class="btn btn-primary" onclick="updateUser(${u.id})"><i data-lucide="check"></i> Enregistrer</button>
    `
  });
  if (window.lucide) lucide.createIcons();
}

async function updateUser(id) {
  const form = document.getElementById('edit-user-form');
  if (!form?.checkValidity()) { form?.reportValidity(); return; }
  const data = Object.fromEntries(new FormData(form));
  const original = await DB.dbGet('users', id);
  if (!original) return;

  const updated = {
    ...original,
    name: data.name,
    role: data.role,
    email: data.email || '',
    active: data.active === 'true',
  };
  if (data.password && data.password.trim()) {
    updated.password = data.password;
  }

  try {
    await DB.dbPut('users', updated);
    await DB.writeAudit('EDIT_USER', 'users', id, { name: updated.name, role: updated.role, active: updated.active });
    UI.closeModal();
    UI.toast('Utilisateur modifié', 'success');
    Router.navigate('settings');
  } catch (err) {
    UI.toast('Erreur : ' + err.message, 'error');
  }
}

async function doBackup() {
  const stores = ['products', 'lots', 'stock', 'movements', 'suppliers', 'purchaseOrders', 'sales', 'saleItems', 'prescriptions', 'patients', 'users', 'auditLog', 'settings', 'alerts', 'cashRegister', 'returns'];
  const backup = {};
  for (const s of stores) {
    backup[s] = await DB.dbGetAll(s);
  }
  backup._exportDate = new Date().toISOString();
  backup._version = '1.0';

  const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' });
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob);
  a.download = `pharma_backup_${new Date().toISOString().split('T')[0]}.json`;
  a.click();
  UI.toast('Sauvegarde téléchargée', 'success');
}

/**
 * RESTAURATION DE SAUVEGARDE (Protocole Zero Loss)
 */
function restoreBackup() {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = '.json';
  input.onchange = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    // Double confirmation de sécurité
    const ok1 = await UI.confirm(`⚠️ ATTENTION : La restauration remplacera TOUTES vos données actuelles par celles du fichier "${file.name}".\n\nSouhaitez-vous continuer ?`);
    if (!ok1) return;

    const ok2 = await UI.confirm(`🛡️ SÉCURITÉ : Un fichier de secours de vos données actuelles va être téléchargé automatiquement AVANT la restauration.\n\nConfirmer le lancement du protocole "Zéro Perte" ?`);
    if (!ok2) return;

    try {
      UI.toast('⏳ Analyse du fichier et préparation du secours...', 'info', 3000);
      const text = await file.text();
      const data = JSON.parse(text);

      const result = await DB.restoreFromBackup(data);
      if (result.success) {
        UI.toast('✅ Restauration réussie ! Redémarrage du système...', 'success', 5000);
        setTimeout(() => location.reload(), 2000);
      }
    } catch (err) {
      console.error('Erreur restauration:', err);
      UI.toast('❌ Échec de la restauration : ' + err.message, 'error', 10000);
    }
  };
  input.click();
}

async function updatePharmacyDisplay() {
  const settings = await DB.dbGetAll('settings');
  const gs = k => settings.find(s => s.key === k)?.value || '';

  const name = gs('pharmacy_name') || 'OrdiveX';
  const slogan = gs('pharmacy_slogan') || 'Santé & Technologie';
  const logo = gs('pharmacy_logo');

  const nameEl = document.getElementById('pharmacy-name-display');
  const sloganEl = document.getElementById('pharmacy-slogan-display');
  const logoEl = document.getElementById('sidebar-logo-icon');

  if (nameEl) nameEl.textContent = name;
  if (sloganEl) sloganEl.textContent = slogan;
  if (logoEl) {
    if (logo) {
      logoEl.innerHTML = `<img src="${logo}" style="width:100%; height:100%; object-fit:contain; border-radius:4px;">`;
    } else {
      logoEl.innerHTML = '<i data-lucide="activity"></i>';
    }
    if (window.lucide) lucide.createIcons();
  }
}

async function handleLogoUpload(event) {
  const file = event.target.files[0];
  if (!file) return;

  if (file.size > 1024 * 1024) { // 1MB limit for IndexedDB/Supabase safety
    UI.toast('L\'image est trop lourde (max 1Mo)', 'error');
    return;
  }

  const reader = new FileReader();
  reader.onload = async (e) => {
    const base64 = e.target.result;
    document.getElementById('pharmacy-logo-input').value = base64;

    const container = document.getElementById('logo-preview-container');
    // Preserve the hidden input and file input
    const hiddenInput = document.getElementById('pharmacy-logo-input');
    const fileInput = document.getElementById('logo-upload');
    container.innerHTML = `
      <img src="${base64}" id="settings-logo-img" style="max-height: 80px; object-fit: contain; margin-bottom: 0.5rem; display: block;">
      <button type="button" class="btn btn-xs btn-danger" onclick="removeLogo()"><i data-lucide="trash-2"></i> Supprimer le logo</button>
    `;
    container.appendChild(fileInput);
    container.appendChild(hiddenInput);
    hiddenInput.value = base64;
    UI.toast('Logo prêt (cliquez sur Sauvegarder pour appliquer)', 'info');
    if (window.lucide) lucide.createIcons();
  };
  reader.readAsDataURL(file);
}

function removeLogo() {
  document.getElementById('pharmacy-logo-input').value = '';
  const container = document.getElementById('logo-preview-container');
  container.innerHTML = `
    <div class="logo-placeholder" style="width: 60px; height: 60px; border: 2px dashed #ccc; border-radius: 8px; display: flex; align-items: center; justify-content: center; font-size: 1.5rem; margin-bottom: 0.5rem;"><i data-lucide="image"></i></div>
    <button type="button" class="btn btn-xs btn-secondary" onclick="document.getElementById('logo-upload').click()"><i data-lucide="upload"></i> Choisir un logo...</button>
    <input type="file" id="logo-upload" accept="image/*" style="display: none;" onchange="handleLogoUpload(event)">
    <input type="hidden" name="pharmacy_logo" id="pharmacy-logo-input" value="">
  `;
  if (window.lucide) lucide.createIcons();
}

async function saveSupabaseConfig() {
  const form = document.getElementById('supabase-config-form');
  if (!form) return;
  const data = Object.fromEntries(new FormData(form));
  try {
    for (const [key, value] of Object.entries(data)) {
      const existing = (await DB.dbGetAll('settings')).find(s => s.key === key);
      if (existing) {
        await DB.dbPut('settings', { ...existing, value, updatedAt: Date.now() });
      } else {
        await DB.dbAdd('settings', { key, value, updatedAt: Date.now() });
      }
    }
    UI.toast('Configuration Supabase enregistrée', 'success');
    setTimeout(() => location.reload(), 1500);
  } catch (err) {
    UI.toast('Erreur : ' + err.message, 'error');
  }
}

async function repairSync() {
  const ok = await UI.confirm("Cette action va marquer TOUTES vos données locales comme 'non synchronisées' pour forcer un renvoi complet vers Supabase.\n\nCela peut prendre quelques minutes et réparera les problèmes de comptes manquants sur mobile.\n\nContinuer ?");
  if (!ok) return;

  const btn = event.currentTarget;
  const originalText = btn.innerHTML;
  btn.disabled = true;
  btn.innerHTML = '<i class="spinner-inline"></i> Réparation en cours...';

  try {
    await DB.forceSyncAll();
    UI.toast('Synchronisation Cloud réparée et relancée !', 'success');
  } catch (err) {
    UI.toast('Erreur lors de la réparation : ' + err.message, 'error');
  } finally {
    btn.disabled = false;
    btn.innerHTML = originalText;
  }
}

async function triggerPull() {
  const btn = event.currentTarget;
  const originalText = btn.innerHTML;
  btn.disabled = true;
  btn.innerHTML = '<i class="spinner-inline"></i> Récupération...';

  try {
    UI.toast('Début de la récupération des données...', 'info');
    await DB.pullFromSupabase(true);
    UI.toast('Données récupérées avec succès ! Vos catalogues sont à jour.', 'success');
    setTimeout(() => location.reload(), 2000);
  } catch (err) {
    UI.toast('Erreur lors de la récupération : ' + err.message, 'error', 10000);
  } finally {
    btn.disabled = false;
    btn.innerHTML = originalText;
  }
}


async function saveSmsConfig() {
  const form = document.getElementById('sms-config-form');
  if (!form) return;
  const data = Object.fromEntries(new FormData(form));
  data.enabled = document.getElementById('sms-enabled-cb').checked;
  try {
    if (window.SMS) {
      await SMS.saveConfig(data);
      UI.toast('Configuration SMS enregistrée', 'success');
      await DB.writeAudit('SAVE_SMS_CONFIG', 'settings', null, { provider: data.provider, enabled: data.enabled });
    } else {
      UI.toast('Module SMS introuvable !', 'error');
    }
  } catch(e) {
    UI.toast('Erreur: ' + e.message, 'error');
  }
}

async function testSmsConnection() {
  if (!window.SMS) {
    UI.toast('Module SMS introuvable !', 'error');
    return;
  }
  const btn = event.currentTarget;
  const originalText = btn.innerHTML;
  btn.disabled = true;
  btn.innerHTML = '<i class="spinner-inline"></i> Test en cours...';

  try {
    // Save current unsubmitted form state to config first for testing
    const form = document.getElementById('sms-config-form');
    const data = Object.fromEntries(new FormData(form));
    data.enabled = document.getElementById('sms-enabled-cb').checked;
    await SMS.saveConfig(data);

    const res = await SMS.testConnection();
    if (res.success) {
      UI.toast('Test réussi ! SMS envoyé à TrillionX.', 'success');
    } else {
      UI.toast('Erreur d\'envoi: ' + (res.error || 'Vérifiez vos paramètres'), 'error');
    }
  } catch (e) {
    UI.toast('Erreur: ' + e.message, 'error');
  } finally {
    btn.disabled = false;
    btn.innerHTML = originalText;
  }
}

window.updatePharmacyDisplay = updatePharmacyDisplay;
window.saveSupabaseConfig = saveSupabaseConfig;
window.saveSmsConfig = saveSmsConfig;
window.testSmsConnection = testSmsConnection;
window.handleLogoUpload = handleLogoUpload;
window.removeLogo = removeLogo;
window.handleLogin = handleLogin;
window.setDemo = setDemo;
window.showAddUser = showAddUser;
window.submitUser = submitUser;
window.editUser = editUser;
window.updateUser = updateUser;
window.saveSettings = saveSettings;
window.doBackup = doBackup;
window.restoreBackup = restoreBackup;
window.repairSync = repairSync;
window.triggerPull = triggerPull;
window.viewEmployee360 = viewEmployee360;
window.resetUserPin = resetUserPin;

async function resetUserPin(userId, userName) {
  const ok = await UI.confirm('Reinitialiser le PIN de ' + userName + ' a 0000 ?');
  if (!ok) return;
  const pinKey = 'pin_user_' + userId;
  await DB.dbPut('settings', { key: pinKey, value: '0000', updatedAt: Date.now() });
  UI.toast('PIN de ' + userName + ' reinitialise a 0000', 'success');
}

// ═══════════════════════════════════════════════════════════════════
// PHASE 5 — Vue 360° Employé (Admin uniquement)
// ═══════════════════════════════════════════════════════════════════
async function viewEmployee360(userId) {
  if (DB.AppState.currentUser?.role !== 'admin') {
    UI.toast('Accès réservé à l\'administrateur', 'error');
    return;
  }
  const [user, allSales, auditLog] = await Promise.all([
    DB.dbGet('users', userId),
    DB.dbGetAll('sales'),
    DB.dbGetAll('auditLog'),
  ]);
  if (!user) return;

  // Filtrer les ventes de cet employé
  const empSales = allSales.filter(s => s.userId === userId || s.sellerName === user.name);
  const totalCA = empSales.reduce((sum, s) => sum + (s.total || 0), 0);
  const avgTicket = empSales.length > 0 ? Math.round(totalCA / empSales.length) : 0;
  const lastSale = empSales.length > 0 ? empSales.sort((a,b) => new Date(b.date) - new Date(a.date))[0].date : null;

  // Dernière connexion depuis l'audit
  const logins = auditLog.filter(l => l.action === 'LOGIN' && (l.userId === userId || l.username === user.username));
  const lastLogin = logins.length > 0 ? logins.sort((a,b) => b.timestamp - a.timestamp)[0].timestamp : null;

  // Ventes par mois (3 derniers mois)
  const now = new Date();
  const months = [];
  for (let i = 2; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const key = d.toISOString().substring(0, 7);
    const label = d.toLocaleDateString('fr-FR', { month: 'short', year: 'numeric' });
    const sales = empSales.filter(s => s.date && s.date.substring(0, 7) === key);
    months.push({ label, count: sales.length, total: sales.reduce((sum,s) => sum + (s.total||0), 0) });
  }

  UI.modal(`<i data-lucide="bar-chart-3" class="modal-icon-inline"></i> Profil — ${user.name}`, `
    <div class="patient-detail">
      <div class="patient-detail-header">
        <div class="patient-avatar-lg" style="background:var(--primary-light);color:var(--primary)">${user.name?.charAt(0).toUpperCase() || '?'}</div>
        <div class="patient-detail-info">
          <h2>${user.name}</h2>
          <div class="patient-detail-meta">
            <span><i data-lucide="user"></i> <code>${user.username}</code></span>
            <span>${UI.roleBadge(user.role)}</span>
            <span class="badge badge-${user.active ? 'success' : 'neutral'}">${user.active ? 'Actif' : 'Inactif'}</span>
          </div>
          <div style="margin-top:8px;color:var(--text-muted);font-size:12px;">
            <i data-lucide="clock" style="width:12px;height:12px"></i> Dernière connexion : ${lastLogin ? UI.formatDateTime(lastLogin) : 'Jamais'}
          </div>
        </div>
      </div>

      <div class="patient-stats-row" style="grid-template-columns: repeat(auto-fit, minmax(120px, 1fr));">
        <div class="patient-stat-card">
          <div class="patient-stat-val kpi-value">${UI.formatCurrency(totalCA)}</div>
          <div class="patient-stat-label">CA généré</div>
        </div>
        <div class="patient-stat-card">
          <div class="patient-stat-val kpi-value">${empSales.length}</div>
          <div class="patient-stat-label">Ventes</div>
        </div>
        <div class="patient-stat-card">
          <div class="patient-stat-val kpi-value">${UI.formatCurrency(avgTicket)}</div>
          <div class="patient-stat-label">Ticket moyen</div>
        </div>
        <div class="patient-stat-card">
          <div class="patient-stat-val">${lastSale ? UI.formatDate(lastSale) : '—'}</div>
          <div class="patient-stat-label">Dernière vente</div>
        </div>
      </div>

      <!-- Performance 3 mois -->
      <div style="margin-top:16px;">
        <h4 style="font-size:14px;margin-bottom:8px;"><i data-lucide="trending-up"></i> Performance (3 derniers mois)</h4>
        <table class="data-table">
          <thead><tr><th>Mois</th><th>Nb Ventes</th><th>CA</th></tr></thead>
          <tbody>
            ${months.map(m => `<tr><td>${m.label}</td><td><strong>${m.count}</strong></td><td>${UI.formatCurrency(m.total)}</td></tr>`).join('')}
          </tbody>
        </table>
      </div>

      <!-- Dernières ventes -->
      <div style="margin-top:16px;">
        <h4 style="font-size:14px;margin-bottom:8px;"><i data-lucide="receipt"></i> Dernières ventes</h4>
        ${empSales.length === 0 ? '<p class="text-muted">Aucune vente enregistrée</p>' : `
          <table class="data-table">
            <thead><tr><th>Date</th><th>Patient</th><th>Montant</th><th>Paiement</th></tr></thead>
            <tbody>
              ${empSales.sort((a,b) => new Date(b.date) - new Date(a.date)).slice(0, 15).map(s => `
                <tr>
                  <td>${UI.formatDate(s.date)}</td>
                  <td>${s.patientName || '<span class="text-muted">—</span>'}</td>
                  <td><strong>${UI.formatCurrency(s.total || 0)}</strong></td>
                  <td><span class="badge badge-${s.paymentMethod === 'credit' ? 'danger' : 'success'}">${s.paymentMethod || 'Espèces'}</span></td>
                </tr>`).join('')}
            </tbody>
          </table>
        `}
      </div>
    </div>
  `, { size: 'large' });
  if (window.lucide) lucide.createIcons();
  if (window._autoAnimateKPIValues) setTimeout(_autoAnimateKPIValues, 100);
}

async function saveDeviceName() {
  var input = document.getElementById('device-name-input');
  if (!input || !input.value.trim()) {
    UI.toast('Veuillez entrer un nom pour cet appareil', 'warning');
    return;
  }
  var name = input.value.trim();
  localStorage.setItem('pharma_device_name', name);
  if (DB.AppState) DB.AppState.deviceName = name;

  // Pousser le nouveau nom DIRECTEMENT vers Supabase
  try {
    var sb = await DB.getSupabaseClient();
    if (sb) {
      var deviceId = localStorage.getItem('pharma_device_id');
      var isMobileDevice = /Android|webOS|iPhone|iPad|iPod|BlackBerry/i.test(navigator.userAgent);
      var heartbeat = {
        key: 'device_status_' + deviceId,
        value: JSON.stringify({
          name: name,
          last_sync: Date.now(),
          pending: 0,
          online: true,
          type: isMobileDevice ? 'mobile' : 'desktop'
        })
      };
      var res = await sb.from('settings').upsert(heartbeat, { onConflict: 'key' });
      if (res.error) {
        console.error('[Device] Erreur upsert:', res.error.message);
        UI.toast('Nom sauvegardé localement', 'info');
      } else {
        UI.toast('✅ "' + name + '" — synchronisé !', 'success');
        console.log('[Device] ✅ Nom mis à jour : ' + name);
        // Re-push après 2s pour écraser tout heartbeat automatique
        setTimeout(async function() {
          try {
            heartbeat.value = JSON.stringify({ name: name, last_sync: Date.now(), pending: 0, online: true, type: isMobileDevice ? 'mobile' : 'desktop' });
            await sb.from('settings').upsert(heartbeat, { onConflict: 'key' });
          } catch(e2) {}
        }, 2000);
      }
      if (window.loadDeviceCount) loadDeviceCount();
      // Toujours rafraîchir le moniteur
      if (window.UI && UI.openSyncMonitor) {
        var monitorModal = document.getElementById('sync-monitor-modal');
        if (monitorModal && monitorModal.style.display === 'flex') {
          setTimeout(function() { UI.openSyncMonitor(); }, 500);
        }
      }
    } else {
      UI.toast('Nom sauvegardé localement', 'info');
    }
  } catch(e) {
    console.error('[Device] Exception:', e);
    UI.toast('Nom sauvegardé localement', 'info');
  }
}

window.saveDeviceName = saveDeviceName;

async function loadDeviceCount() {
  const el = document.getElementById('settings-device-count');
  if (!el) return;
  try {
    if (!navigator.onLine) { el.textContent = 'Hors ligne'; return; }
    const sb = await DB.getSupabaseClient();
    if (!sb) { el.textContent = 'Non configuré'; return; }
    const { data, error } = await sb.from('settings').select('value').like('key', 'device_status_%');
    if (error) { el.textContent = 'Erreur'; return; }

    // Chaque device_id = un appareil distinct (pas de dédup par nom)
    var allDevices = [];
    var now = Date.now();
    var ACTIVE_THRESHOLD = 48 * 3600000;
    (data || []).forEach(function(row) {
      try {
        var s = JSON.parse(row.value);
        allDevices.push(s);
      } catch(e) {}
    });
    var devices = allDevices.filter(function(d) { return (now - d.last_sync) < ACTIVE_THRESHOLD; });
    var count = devices.length;
    var onlineNow = devices.filter(function(d) { return d.online && (now - d.last_sync < 3600000); }).length;

    el.textContent = count + ' appareil' + (count > 1 ? 's' : '') + ' (' + onlineNow + ' en ligne)';
    el.className = 'badge ' + (count > 1 ? 'badge-warning' : 'badge-info');
    el.style.fontSize = '0.85rem';
    el.style.cursor = 'pointer';
  } catch(e) {
    el.textContent = 'Erreur réseau';
  }
}

window.loadDeviceCount = loadDeviceCount;

Router.register('login', renderLogin);
Router.register('settings', renderSettings);

