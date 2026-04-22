/**
 * OrdiveX — Database Engine
 * IndexedDB offline-first storage layer
 * Handles all local data persistence with sync queue
 */

const DB_NAME = 'OrdiveXDB';
const DB_VERSION = 2;

const STORES = {
  products: 'products',
  lots: 'lots',
  stock: 'stock',
  movements: 'movements',
  suppliers: 'suppliers',
  purchaseOrders: 'purchaseOrders',
  sales: 'sales',
  saleItems: 'saleItems',
  prescriptions: 'prescriptions',
  patients: 'patients',
  users: 'users',
  sessions: 'sessions',
  alerts: 'alerts',
  syncQueue: 'syncQueue',
  auditLog: 'auditLog',
  settings: 'settings',
  cashRegister: 'cashRegister',
  returns: 'returns',
};

let db = null;
let _supabaseInstance = null;

// App state manager
// Device Identity — ID unique déterministe basé sur l'empreinte du navigateur
// L'ID reste le MÊME pour le même appareil/navigateur, même si localStorage est vidé
function _generateStableDeviceId() {
  var fingerprint = [
    navigator.userAgent,
    screen.width + 'x' + screen.height,
    screen.colorDepth,
    Intl.DateTimeFormat().resolvedOptions().timeZone,
    navigator.language,
    navigator.hardwareConcurrency || 0
  ].join('|');
  // Simple hash FNV-1a
  var hash = 0x811c9dc5;
  for (var i = 0; i < fingerprint.length; i++) {
    hash ^= fingerprint.charCodeAt(i);
    hash = (hash * 0x01000193) >>> 0;
  }
  return 'DEV_' + hash.toString(36).toUpperCase();
}

var _stableId = _generateStableDeviceId();
// Forcer la migration vers l'ID stable — supprimer l'ancien aléatoire
var _oldDeviceId = localStorage.getItem('pharma_device_id');
if (_oldDeviceId && _oldDeviceId !== _stableId) {
  // Ancien ID aléatoire détecté — on le remplace et on nettoie
  localStorage.setItem('pharma_device_id', _stableId);
  // Supprimer l'ancienne entrée de Supabase au prochain sync
  localStorage.setItem('pharma_old_device_key', 'device_status_' + _oldDeviceId);
} else if (!_oldDeviceId) {
  localStorage.setItem('pharma_device_id', _stableId);
}
if (!localStorage.getItem('pharma_device_name')) {
  var isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry/i.test(navigator.userAgent);
  localStorage.setItem('pharma_device_name', isMobile ? 'Mobile Pharmacien' : 'PC Principal');
}

const AppState = {
  currentUser: null,
  currentPage: 'dashboard',
  theme: 'light',
  isOnline: navigator.onLine,
  pendingSyncCount: 0,
  deviceId: localStorage.getItem('pharma_device_id'),
  deviceName: localStorage.getItem('pharma_device_name'),
};

let _realtimeSubscription = null;
let _realtimeTimeout = null;

async function getSupabaseClient() {
  if (_supabaseInstance) {
    if (AppState.isOnline && navigator.onLine) _setupRealtime(_supabaseInstance);
    return _supabaseInstance;
  }
  try {
    const settings = await dbGetAll('settings');
    const url = settings.find(s => s.key === 'supabase_url')?.value;
    const key = settings.find(s => s.key === 'supabase_key')?.value;
    
    if (url && key && window.supabase) {
      _supabaseInstance = window.supabase.createClient(url.trim(), key.trim());
      
      // Auto-Login Anonyme pour satisfaire la politique stricte de RLS (auth.uid() IS NOT NULL)
      try {
        const { data: { session } } = await _supabaseInstance.auth.getSession();
        if (!session && _supabaseInstance.auth.signInAnonymously) {
           await _supabaseInstance.auth.signInAnonymously();
        }
      } catch(e) {
        console.warn('[Flash] Sécurité: Échec du login anonyme', e);
      }

      if (AppState.isOnline) _setupRealtime(_supabaseInstance);
      return _supabaseInstance;
    } else {
      console.warn('[Flash] Clés Supabase manquantes. Veuillez utiliser un Magic Link pour configurer l\'accès.');
    }
  } catch (e) {
    console.error('[Flash] Error initializing Supabase client:', e);
  }
  return null;
}

function _setupRealtime(sbClient) {
  if (_realtimeSubscription || !navigator.onLine) return;

  _realtimeSubscription = sbClient.channel('flash-sync-channel')
    .on('postgres_changes', { event: '*', schema: 'public' }, (payload) => {
      clearTimeout(_realtimeTimeout);
      _realtimeTimeout = setTimeout(() => {
        console.log('[Flash] ⚡ Changement distant détecté, déclenchement pull', payload.table);
        pullFromSupabase().catch(() => {});
      }, 1500);
    })
    .subscribe((status, err) => {
       if (status === 'SUBSCRIBED') {
         console.log('[Flash] 📡 Connecté au temps réel Supabase');
       } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
         // On ne force plus AppState.isOnline=false ici pour ne pas bloquer les Ventes
         try { sbClient.removeChannel(_realtimeSubscription).catch(()=>{}); } catch(e){}
         _realtimeSubscription = null;
       }
    });
}

async function initDB() {
  // --- Magic Link Auto-Config ---
  const urlParams = new URLSearchParams(window.location.search);

  if (urlParams.get('reset') === 'true') {
    return new Promise((resolve, reject) => {
      const req = indexedDB.deleteDatabase(DB_NAME);
      req.onsuccess = () => {
        localStorage.clear();
        window.location.href = window.location.pathname;
      };
      req.onerror = () => {
        console.error("Failed to delete local DB");
        resolve(); // proceed anyway
      };
    });
  }

  const sbUrl = urlParams.get('sb_url');
  const sbKey = urlParams.get('sb_key');

  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onsuccess = async () => {
      db = request.result;

      // If URL params are present, update settings automatically
      if (sbUrl && sbKey) {

        try {
          const settings = await dbGetAll('settings');
          const existingUrl = settings.find(s => s.key === 'supabase_url')?.value;

          // Si l'URL Supabase change = nouvelle pharmacie → vider les données locales
          if (existingUrl && existingUrl.trim() !== sbUrl.trim()) {
            console.log('[Flash] Nouvelle pharmacie détectée — nettoyage des données locales...');
            db.close();
            db = null;
            await new Promise((res, rej) => {
              const delReq = indexedDB.deleteDatabase(DB_NAME);
              delReq.onsuccess = () => res();
              delReq.onerror = () => res();
              delReq.onblocked = () => res();
            });
            // Recharger la page pour recréer la DB fraîche avec le nouveau Magic Link
            window.location.reload();
            return;
          }

          const update = async (k, v) => {
            const ex = settings.find(s => s.key === k);
            if (ex) await dbPut('settings', { ...ex, value: v, updatedAt: Date.now() });
            else await dbAdd('settings', { key: k, value: v, updatedAt: Date.now() });
          };
          await update('supabase_url', sbUrl);
          await update('supabase_key', sbKey);

          // Clean URL to hide keys and avoid re-triggering
          window.history.replaceState({}, document.title, window.location.pathname);

          _supabaseInstance = null; // Force recreation
          await getSupabaseClient();
        } catch (e) {
          console.error('[DB] Magic Link failed:', e);
        }
      }
      resolve(db);
    };

    request.onerror = () => reject(request.error);

    request.onupgradeneeded = (event) => {
      const database = event.target.result;

      // Products store
      if (!database.objectStoreNames.contains('products')) {
        const ps = database.createObjectStore('products', { keyPath: 'id', autoIncrement: true });
        ps.createIndex('code', 'code', { unique: true });
        ps.createIndex('name', 'name');
        ps.createIndex('dci', 'dci');
        ps.createIndex('category', 'category');
        ps.createIndex('requiresPrescription', 'requiresPrescription');
        ps.createIndex('status', 'status');
      }

      // Lots store
      if (!database.objectStoreNames.contains('lots')) {
        const ls = database.createObjectStore('lots', { keyPath: 'id', autoIncrement: true });
        ls.createIndex('productId', 'productId');
        ls.createIndex('lotNumber', 'lotNumber');
        ls.createIndex('expiryDate', 'expiryDate');
        ls.createIndex('status', 'status');
      }

      // Stock store
      if (!database.objectStoreNames.contains('stock')) {
        const ss = database.createObjectStore('stock', { keyPath: 'id', autoIncrement: true });
        ss.createIndex('productId', 'productId', { unique: true });
        ss.createIndex('quantity', 'quantity');
      }

      // Movements store
      if (!database.objectStoreNames.contains('movements')) {
        const ms = database.createObjectStore('movements', { keyPath: 'id', autoIncrement: true });
        ms.createIndex('productId', 'productId');
        ms.createIndex('type', 'type');
        ms.createIndex('date', 'date');
        ms.createIndex('userId', 'userId');
      }

      // Suppliers store
      if (!database.objectStoreNames.contains('suppliers')) {
        const sus = database.createObjectStore('suppliers', { keyPath: 'id', autoIncrement: true });
        sus.createIndex('name', 'name');
        sus.createIndex('status', 'status');
      }

      // Purchase orders
      if (!database.objectStoreNames.contains('purchaseOrders')) {
        const pos = database.createObjectStore('purchaseOrders', { keyPath: 'id', autoIncrement: true });
        pos.createIndex('supplierId', 'supplierId');
        pos.createIndex('status', 'status');
        pos.createIndex('date', 'date');
      }

      // Sales store
      if (!database.objectStoreNames.contains('sales')) {
        const sal = database.createObjectStore('sales', { keyPath: 'id', autoIncrement: true });
        sal.createIndex('date', 'date');
        sal.createIndex('patientId', 'patientId');
        sal.createIndex('userId', 'userId');
        sal.createIndex('paymentMethod', 'paymentMethod');
      }

      // Sale items
      if (!database.objectStoreNames.contains('saleItems')) {
        const si = database.createObjectStore('saleItems', { keyPath: 'id', autoIncrement: true });
        si.createIndex('saleId', 'saleId');
        si.createIndex('productId', 'productId');
        si.createIndex('lotId', 'lotId');
      }

      // Prescriptions
      if (!database.objectStoreNames.contains('prescriptions')) {
        const prx = database.createObjectStore('prescriptions', { keyPath: 'id', autoIncrement: true });
        prx.createIndex('patientId', 'patientId');
        prx.createIndex('date', 'date');
        prx.createIndex('status', 'status');
      }

      // Patients
      if (!database.objectStoreNames.contains('patients')) {
        const pat = database.createObjectStore('patients', { keyPath: 'id', autoIncrement: true });
        pat.createIndex('name', 'name');
        pat.createIndex('phone', 'phone');
      }

      // Users
      if (!database.objectStoreNames.contains('users')) {
        const us = database.createObjectStore('users', { keyPath: 'id', autoIncrement: true });
        us.createIndex('username', 'username', { unique: true });
        us.createIndex('role', 'role');
      }

      // Sessions
      if (!database.objectStoreNames.contains('sessions')) {
        database.createObjectStore('sessions', { keyPath: 'id' });
      }

      // Alerts
      if (!database.objectStoreNames.contains('alerts')) {
        const als = database.createObjectStore('alerts', { keyPath: 'id', autoIncrement: true });
        als.createIndex('type', 'type');
        als.createIndex('status', 'status');
        als.createIndex('date', 'date');
      }

      // Sync queue
      if (!database.objectStoreNames.contains('syncQueue')) {
        const sq = database.createObjectStore('syncQueue', { keyPath: 'id', autoIncrement: true });
        sq.createIndex('status', 'status');
        sq.createIndex('timestamp', 'timestamp');
      }

      // Audit log
      if (!database.objectStoreNames.contains('auditLog')) {
        const al = database.createObjectStore('auditLog', { keyPath: 'id', autoIncrement: true });
        al.createIndex('userId', 'userId');
        al.createIndex('action', 'action');
        al.createIndex('timestamp', 'timestamp');
      }

      // Settings
      if (!database.objectStoreNames.contains('settings')) {
        database.createObjectStore('settings', { keyPath: 'key' });
      }

      // Cash register
      if (!database.objectStoreNames.contains('cashRegister')) {
        const cr = database.createObjectStore('cashRegister', { keyPath: 'id', autoIncrement: true });
        cr.createIndex('date', 'date');
        cr.createIndex('type', 'type');
      }

      // Returns (retours médicaments) — v2
      if (!database.objectStoreNames.contains('returns')) {
        const ret = database.createObjectStore('returns', { keyPath: 'id', autoIncrement: true });
        ret.createIndex('saleId', 'saleId');
        ret.createIndex('date', 'date');
        ret.createIndex('status', 'status');
        ret.createIndex('userId', 'userId');
        ret.createIndex('patientId', 'patientId');
      }
    };
  });
}

// Sync debounce & guard
let _syncTimer = null;
let _syncInProgress = false;
let _restoreInProgress = false;

function _scheduleSyncToSupabase() {
  if (!navigator.onLine || _restoreInProgress) return; // Ne rien faire si hors-ligne ou restauration en cours
  if (_syncTimer) clearTimeout(_syncTimer);
  _syncTimer = setTimeout(() => {
    _syncTimer = null;
    if (!navigator.onLine) return; // Double vérification
    syncToSupabase().catch(() => { });
  }, 2000); // Réduit de 5s → 2s pour une réactivité cloud optimale
}

// Internal put that does NOT reset _synced and does NOT trigger sync
// Used exclusively by syncToSupabase to mark items as synced
function _dbPutRaw(storeName, data) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readwrite');
    const store = tx.objectStore(storeName);
    const req = store.put(data);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

// Generic CRUD operations
async function dbAdd(storeName, data) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readwrite');
    const store = tx.objectStore(storeName);
    const req = store.add({ ...data, _createdAt: Date.now(), _updatedAt: Date.now(), _synced: false });
    req.onsuccess = () => {
      resolve(req.result);
      if (navigator.onLine) _scheduleSyncToSupabase();
    };
    req.onerror = () => reject(req.error);
  });
}

async function dbPut(storeName, data) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readwrite');
    const store = tx.objectStore(storeName);
    const req = store.put({ ...data, _updatedAt: Date.now(), _synced: false });
    req.onsuccess = () => {
      resolve(req.result);
      if (navigator.onLine) _scheduleSyncToSupabase();
    };
    req.onerror = () => reject(req.error);
  });
}

async function dbGet(storeName, id) {
  if (!db) await initDB();
  return new Promise((resolve, reject) => {
    try {
      const tx = db.transaction(storeName, 'readonly');
      const store = tx.objectStore(storeName);
      const req = store.get(id);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => { console.error(`[DB] Erreur get ${storeName}/${id}:`, req.error); resolve(null); };
    } catch (e) {
      console.error(`[DB] Exception dans dbGet(${storeName}, ${id}):`, e);
      resolve(null);
    }
  });
}

async function dbGetAll(storeName, indexName, query) {
  if (!db) { console.warn('[DB] Base non initialisée, tentative de reconnexion...'); await initDB(); }
  return new Promise((resolve, reject) => {
    try {
      const tx = db.transaction(storeName, 'readonly');
      const store = tx.objectStore(storeName);
      let req;
      if (indexName && query !== undefined) {
        const index = store.index(indexName);
        req = index.getAll(query);
      } else {
        req = store.getAll();
      }
      req.onsuccess = () => resolve(req.result || []);
      req.onerror = () => { console.error(`[DB] Erreur lecture ${storeName}:`, req.error); resolve([]); };
      tx.onerror = () => { console.error(`[DB] Transaction erreur ${storeName}`); resolve([]); };
    } catch (e) {
      console.error(`[DB] Exception dans dbGetAll(${storeName}):`, e);
      resolve([]); // Ne jamais rejeter pour éviter les cascades d'erreurs
    }
  });
}

/**
 * Chargement paginé par curseur pour les stores très volumineux (audit, mouvements)
 * Retourne les N derniers éléments triés par index décroissant
 */
async function dbGetRecent(storeName, indexName, limit = 200) {
  if (!db) await initDB();
  return new Promise((resolve) => {
    try {
      const tx = db.transaction(storeName, 'readonly');
      const store = tx.objectStore(storeName);
      const source = indexName ? store.index(indexName) : store;
      const results = [];
      const cursorReq = source.openCursor(null, 'prev'); // Du plus récent au plus ancien
      cursorReq.onsuccess = (e) => {
        const cursor = e.target.result;
        if (cursor && results.length < limit) {
          results.push(cursor.value);
          cursor.continue();
        } else {
          resolve(results);
        }
      };
      cursorReq.onerror = () => resolve([]);
    } catch (e) {
      console.error(`[DB] Erreur curseur ${storeName}:`, e);
      resolve([]);
    }
  });
}

async function dbDelete(storeName, id) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readwrite');
    const store = tx.objectStore(storeName);
    const req = store.delete(id);
    req.onsuccess = () => resolve(true);
    req.onerror = () => reject(req.error);
  });
}

async function dbCount(storeName) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readonly');
    const store = tx.objectStore(storeName);
    const req = store.count();
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

/**
 * Bulk Put — Insertion/mise à jour de masse via UNE SEULE transaction IndexedDB.
 * Conçu pour supporter des centaines de milliers d'enregistrements sans geler le navigateur.
 * @param {string} storeName - Nom du store IndexedDB
 * @param {Array} dataArray - Tableau d'objets à insérer/mettre à jour
 * @returns {Promise<number>} - Nombre d'objets traités avec succès
 */
async function dbBulkPut(storeName, dataArray) {
  if (!db) await initDB();
  if (!dataArray || dataArray.length === 0) return 0;

  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readwrite');
    const store = tx.objectStore(storeName);
    let count = 0;

    for (const item of dataArray) {
      try {
        store.put({ ...item, _updatedAt: item._updatedAt || Date.now(), _synced: item._synced !== undefined ? item._synced : true });
        count++;
      } catch (e) {
        console.warn(`[DB] BulkPut erreur item:`, e);
      }
    }

    tx.oncomplete = () => resolve(count);
    tx.onerror = () => {
      console.error(`[DB] BulkPut transaction erreur:`, tx.error);
      reject(tx.error);
    };
    tx.onabort = () => {
      console.error(`[DB] BulkPut transaction annulée:`, tx.error);
      reject(tx.error);
    };
  });
}

// Audit log writer
async function writeAudit(action, entity, entityId, details, userId) {
  try {
    await dbAdd('auditLog', {
      action,
      entity,
      entityId,
      details,
      userId: userId || AppState.currentUser?.id,
      username: AppState.currentUser?.username,
      timestamp: Date.now(),
      ip: 'local'
    });
  } catch (e) {
    console.warn('Audit write failed:', e);
  }
}

// Initialisation des paramètres de base (aucune donnée de test)
async function seedDemoData() {
  // Vérifier si déjà initialisé
  const settings = await dbGetAll('settings');
  const alreadySeeded = settings.find(s => s.key === 'seeded');
  if (alreadySeeded) return;



  // Settings essentiels uniquement
  await dbPut('settings', { key: 'currency', value: 'GNF' });
  await dbPut('settings', { key: 'seeded', value: true });


}

async function trackInstallation() {
  // Enregistrement facultatif dans une table pharmacies_registry.
  // Si la table n'existe pas dans le Supabase du client, on ignore silencieusement.
  try {
    const sb = await getSupabaseClient();
    if (!sb) return;
    const settings = await dbGetAll('settings');
    const name = settings.find(s => s.key === 'pharmacy_name')?.value || 'Inconnue';
    const address = settings.find(s => s.key === 'pharmacy_address')?.value || 'Inconnue';

    await sb.from('pharmacies_registry').insert([
      { name, address, installed_at: new Date().toISOString() }
    ]);

  } catch (e) {
    // Table might not exist — this is expected and safe to ignore
    console.warn('[DB] Tracking skipped (table may not exist):', e.message);
  }
}

async function syncToSupabase() {
  if (_syncInProgress) return;
  _syncInProgress = true;

  try {
    const sb = await getSupabaseClient();
    if (!sb) return;
    if (!navigator.onLine) return;

    const storesToSync = ['products', 'lots', 'stock', 'movements', 'suppliers', 'purchaseOrders', 'sales', 'saleItems', 'patients', 'prescriptions', 'alerts', 'cashRegister', 'auditLog', 'users', 'settings', 'returns'];

    let totalPendingCount = 0;

    // Cache des colonnes invalides : éviter les 400 inutiles
    // Colonnes CONNUES comme inexistantes dans Supabase (fallback hardcodé)
    var _knownBadCols = {
      saleItems: ['lotNumber'],
      sales: ['paymentDetails']
    };
    var _colCache = {};
    try { _colCache = JSON.parse(localStorage.getItem('pharma_bad_columns') || '{}'); } catch(e) {}
    // Fusionner le hardcodé avec le cache dynamique
    for (var tbl in _knownBadCols) {
      if (!_colCache[tbl]) _colCache[tbl] = [];
      for (var ci = 0; ci < _knownBadCols[tbl].length; ci++) {
        if (_colCache[tbl].indexOf(_knownBadCols[tbl][ci]) === -1) _colCache[tbl].push(_knownBadCols[tbl][ci]);
      }
    }

    // --- PROBE METIER (Sonde) ---
    try {
      const probeRes = await fetch(`${sb.supabaseUrl}/rest/v1/settings?select=key&limit=1`, {
        method: 'GET',
        headers: { 'apikey': sb.supabaseKey, 'Authorization': `Bearer ${sb.supabaseKey}` },
        cache: 'no-store'
      });
      if (!probeRes.ok) throw new Error('Probe Fail');
      AppState.isOnline = true;
    } catch(err) {
      AppState.isOnline = false;
      return; 
    }

    // ⚡ FLASH SEND — Envoi parallèle de toutes les tables simultanément
    await Promise.all(storesToSync.map(async (storeName) => {
      try {
        const all = await dbGetAll(storeName);
        const pending = all.filter(item => item._synced === false);

        if (pending.length === 0) return;
        totalPendingCount += pending.length;

        const payloads = pending.map(item => {
          const payload = {};
          for (const [key, value] of Object.entries(item)) {
            if (!key.startsWith('_')) {
              const mustBeString = [
                'username', 'password', 'code', 'lotNumber', 'phone', 'dnpm',
                'pharmacy_phone', 'pharmacy_dnpm', 'pharmacy_name', 'key', 'value'
              ];

              if (mustBeString.includes(key)) {
                payload[key] = (value !== null && value !== undefined) ? String(value) : value;
                continue;
              }

              if (typeof value === 'string') {
                if (value.startsWith('session_')) {
                  payload[key] = parseInt(value.replace('session_', '')) || 1;
                } else if (/^\d+$/.test(value) && !value.startsWith('0')) {
                  payload[key] = parseInt(value);
                } else {
                  payload[key] = value;
                }
              } else {
                payload[key] = value;
              }
            }
          }
          if (item._updatedAt) payload.updatedAt = item._updatedAt;

          const tablesWithUserId = ['sales', 'movements', 'cashRegister', 'auditLog'];
          if (tablesWithUserId.includes(storeName)) {
            if (payload.userId === undefined || payload.userId === null) {
              payload.userId = AppState.currentUser?.id || 1;
            }
          }

          // --- FILTRAGE PROACTIF DES COLONNES LOCALES ---
          // Ces colonnes n'existent pas sur Supabase et causeraient des erreurs 400
          const _localOnlyColumns = {
            products: ['subUnitsPerBox', 'pricePerSubUnit', 'controlledClass', 'isControlled', 'manufacturer', 'noticePdfUrl'],
            lots: ['productionDate'],
            stock: ['lastUpdate', 'minQuantity'],
            patients: ['createdAt', 'creditLimit'],
            prescriptions: ['notes', 'patientName', 'dispensedAt', 'dispensedBy', 'saleId'],
            sales: ['assuranceName', 'assuranceRef', 'assuranceAmount', 'paymentDetails', 'paidAt', 'paidDate', 'paidMethod', 'returnStatus', 'lastReturnId', 'lastReturnDate', 'patientName', 'patientPhone'],
            cashRegister: ['reference', 'saleId'],
          };
          const localOnly = _localOnlyColumns[storeName];
          if (localOnly) {
            localOnly.forEach(c => delete payload[c]);
          }

          // Filtrer les colonnes invalides DANS le payload (via auto-apprentissage du cache)
          var storeBadCols = _colCache[storeName] || [];
          if (storeBadCols.length > 0) {
            for (var bi = 0; bi < storeBadCols.length; bi++) {
              delete payload[storeBadCols[bi]];
            }
          }

          return payload;
        });

        var currentPayloads = payloads;

        let retries = 0;
        const maxRetries = 10;
        let lastError = null;

        // Découper en lots de 500 pour éviter les timeouts Supabase
        const PUSH_BATCH = 500;
        let allSuccess = true;

        while (retries <= maxRetries) {
          lastError = null;
          allSuccess = true;

          for (let bi = 0; bi < currentPayloads.length; bi += PUSH_BATCH) {
            const batch = currentPayloads.slice(bi, bi + PUSH_BATCH);
            const { error } = await sb
              .from(storeName === 'users' ? 'app_users' : storeName)
              .upsert(batch, {
                onConflict: storeName === 'settings' ? 'key' : 'id',
                ignoreDuplicates: false
              });

            if (error) {
              lastError = error;
              allSuccess = false;
              break;
            }

            // Marquer les items de ce batch comme synchronisés
            const batchPending = pending.slice(bi, bi + PUSH_BATCH);
            for (const item of batchPending) {
              item._synced = true;
              await _dbPutRaw(storeName, item);
            }
          }

          if (allSuccess) {
            lastError = null;
            break;
          }

          const colMatch = (lastError?.message || '').match(/Could not find the '([^']+)' column/);
          if (colMatch && retries < maxRetries) {
            const badCol = colMatch[1];
            // On ne log que si c'est une nouvelle découverte
            if (!_colCache[storeName] || !_colCache[storeName].includes(badCol)) {
              console.log('[Flash] ⚡ ' + storeName + ': apprentissage nouvelle colonne local-only \'' + badCol + '\'');
            }
            currentPayloads = currentPayloads.map(p => {
              const { [badCol]: _, ...rest } = p;
              return rest;
            });
            // Sauvegarder dans le cache
            if (!_colCache[storeName]) _colCache[storeName] = [];
            if (!_colCache[storeName].includes(badCol)) _colCache[storeName].push(badCol);
            localStorage.setItem('pharma_bad_columns', JSON.stringify(_colCache));
            retries++;
          } else {
            break;
          }
        }

        if (lastError && navigator.onLine) {
          // Ignorer les erreurs RLS connues (settings upsert en anon mode)
          if (!lastError.message?.includes('row-level security')) {
            console.error(`[Flash] ❌ ${storeName}:`, lastError.message || lastError);
          }
        }
      } catch (storeError) {
        // Silencieux si hors-ligne
        if (navigator.onLine) console.error(`[Flash] Exception ${storeName}:`, storeError);
      }
    }));

    // 📡 Push Device Heartbeat — permet aux autres appareils de voir notre état
    try {
      var currentDeviceName = localStorage.getItem('pharma_device_name') || AppState.deviceName;
      var currentDeviceId = localStorage.getItem('pharma_device_id') || AppState.deviceId;
      const isMobileDevice = /Android|webOS|iPhone|iPad|iPod|BlackBerry/i.test(navigator.userAgent);
      const deviceStatus = {
        name: currentDeviceName,
        last_sync: Date.now(),
        pending: 0,
        online: true,
        type: isMobileDevice ? 'mobile' : 'desktop'
      };
      var hbPayload = {
        key: 'device_status_' + currentDeviceId,
        value: JSON.stringify(deviceStatus)
      };
      // Pré-filtrer les colonnes invalides connues pour settings
      var settingsBadCols = _colCache['settings'] || [];
      settingsBadCols.forEach(function(c) { delete hbPayload[c]; });
      // Retry avec suppression de colonnes inconnues (comme le sync principal)
      for (var hbRetry = 0; hbRetry < 3; hbRetry++) {
        var hbRes = await sb.from('settings').upsert(hbPayload, { onConflict: 'key' });
        if (!hbRes.error) break;
        var hbCol = (hbRes.error.message || '').match(/Could not find the '([^']+)' column/);
        if (hbCol) {
          delete hbPayload[hbCol[1]];
        } else {
          break;
        }
      }
    } catch (heartbeatErr) {
      // Silently ignore heartbeat errors
    }

    // 🧹 Nettoyer l'ancien device_id migré (si applicable)
    try {
      var oldKey = localStorage.getItem('pharma_old_device_key');
      if (oldKey) {
        await sb.from('settings').delete().eq('key', oldKey);
        localStorage.removeItem('pharma_old_device_key');
        console.log('[Flash] 🧹 Ancien appareil nettoyé : ' + oldKey);
      }
    } catch(e) {}

    if (totalPendingCount > 0) console.log(`[Flash] ⚡ Sync terminée — ${totalPendingCount} éléments envoyés`);

    // ── TRACKING DU PUSH (SAUVEGARDE) POUR LE SUIVI ADMINISTRATEUR ──
    if (totalPendingCount > 0) {
      try {
        const settings = await DB.dbGetAll('settings');
        const pharmacyName = settings.find(s => s.key === 'pharmacy_name')?.value || 'Inconnu';
        await sb.from('push_tracking').insert([{
          device_id: currentDeviceId,
          device_name: currentDeviceName,
          pharmacy_name: pharmacyName,
          user_name: AppState.currentUser?.name || AppState.currentUser?.username || 'Système',
          items_pushed: totalPendingCount,
          pushed_at: new Date().toISOString()
        }]);
      } catch (trackErr) {
        // Silent error pour ne pas bloquer l'UI
      }
    }

  } catch (globalError) {
    console.error('[Flash] Critical sync error:', globalError);
  } finally {
    _syncInProgress = false;
  }
}

/**
 * PULL DEPUIS SUPABASE (Cloud → Local)
 * @param {boolean} isManual Indique si c'est un pull déclenché manuellement par l'utilisateur
 */
let _isPulling = false;
async function pullFromSupabase(isManual = false) {
  if (_isPulling) {
    console.log('[Flash] Pull déjà en cours, ignoré');
    return;
  }
  _isPulling = true;
  let hasChanges = false;
  let totalItemsPulled = 0;
  try {
    const sb = await getSupabaseClient();
    if (!sb) {
      console.warn('[Flash] Pull annulé: pas de client Supabase');
      return;
    }
    if (!navigator.onLine) {
      console.warn('[Flash] Pull annulé: hors ligne');
      return;
    }
    console.log('[Flash] 🔄 Pull démarré...');

    const storesToPull = [
      'users', 'settings',
      'products', 'lots', 'stock', 'movements', 'suppliers', 'purchaseOrders',
      'sales', 'saleItems', 'patients', 'prescriptions', 'alerts',
      'cashRegister', 'auditLog', 'returns'
    ];

    // --- PROBE METIER (Sonde) ---
    // Pour ne pas inonder la console si hors ligne
    try {
      const probeReq = await sb.from('settings').select('key').limit(1);
      if (probeReq.error) throw probeReq.error;
      AppState.isOnline = true;
    } catch(err) {
      AppState.isOnline = false;
      return; 
    }

    // Traitement séquentiel pour les grosses tables (products) afin d'éviter de surcharger la mémoire
    for (const storeName of storesToPull) {
      // Arrêter immédiatement si la connexion est coupée
      if (!navigator.onLine) {
        console.log('[Flash] ⚠️ Pull interrompu: connexion perdue');
        break;
      }
      try {
        let allData = [];
        
        // 1. Obtenir le nombre total d'items
        const countRes = await sb.from(storeName === 'users' ? 'app_users' : storeName).select('*', { count: 'exact', head: true });
        const totalCount = countRes.count || 0;

        if (totalCount > 0) {
          const fetchLimit = 1000;
          const tableName = storeName === 'users' ? 'app_users' : storeName;

          // Fetch par lots de 5, créés paresseusement pour éviter les requêtes inutiles si hors-ligne
          for (let offset = 0; offset < totalCount; offset += fetchLimit * 5) {
            if (!navigator.onLine) break; // Stop immédiat si connexion perdue
            const batch = [];
            for (let j = 0; j < 5 && (offset + j * fetchLimit) < totalCount; j++) {
              const o = offset + j * fetchLimit;
              batch.push(sb.from(tableName).select('*').range(o, o + fetchLimit - 1));
            }
            const results = await Promise.all(batch);
            for (const res of results) {
              if (res.error) throw res.error;
              if (res.data) allData = allData.concat(res.data);
            }
          }
        }

        if (allData.length > 0) {
          hasChanges = true;
          // Log uniquement au premier pull ou si beaucoup de données

          // Préparer tous les items
          const mustBeString = [
            'username', 'password', 'code', 'lotNumber', 'phone', 'dnpm',
            'pharmacy_phone', 'pharmacy_dnpm', 'pharmacy_name', 'key', 'value'
          ];

          const preparedItems = allData.map(item => {
            let localItem = { ...item, _synced: true, _updatedAt: item.updatedAt || Date.now() };
            for (const key of Object.keys(localItem)) {
              if (mustBeString.includes(key) || (storeName === 'settings' && key === 'value')) {
                if (localItem[key] !== undefined && localItem[key] !== null) {
                  localItem[key] = String(localItem[key]);
                }
              }
            }
            return localItem;
          }).filter(item => !(storeName === 'settings' && item.status === 'DELETED'));

          // ── BATCH WRITE OPTIMISÉ : 2000 items par transaction IndexedDB ──
          const BATCH_SIZE = 2000;
          for (let i = 0; i < preparedItems.length; i += BATCH_SIZE) {
            const batch = preparedItems.slice(i, i + BATCH_SIZE);
            await new Promise((resolve, reject) => {
              const tx = db.transaction(storeName, 'readwrite');
              const store = tx.objectStore(storeName);
              for (const item of batch) {
                store.put(item);
              }
              tx.oncomplete = () => resolve();
              tx.onerror = () => reject(tx.error);
              tx.onabort = () => reject(tx.error);
            });
            // Pause très courte pour la libération du thread UI
            if (i + BATCH_SIZE < preparedItems.length) {
              await new Promise(r => setTimeout(r, 5));
            }
          }
          totalItemsPulled += preparedItems.length;
          // Log silencieux en production
        }
      } catch (storeErr) {
        const errMsg = storeErr?.message || String(storeErr || '');
        const isNetworkError = errMsg.includes('Failed to fetch') || errMsg.includes('NetworkError') || errMsg.includes('ERR_INTERNET_DISCONNECTED') || errMsg.includes('ERR_QUIC_PROTOCOL_ERROR') || errMsg.includes('ERR_NAME_NOT_RESOLVED');
        if (isNetworkError) {
          AppState.isOnline = false;
          console.log('[Flash] ⚠️ Pull interrompu: erreur réseau détectée');
          break; // Stop le pull immédiatement
        }
        if (errMsg && !errMsg.includes('null')) {
          console.warn(`[Flash] Store error ${storeName}:`, errMsg);
        }
      }
    }

    if (hasChanges) console.log(`[Flash] ⚡ Pull terminé — ${totalItemsPulled} éléments mis à jour`);

    // ── TRACKING DU PULL POUR LE SUIVI PHARMACIEN ──
    if (isManual && totalItemsPulled > 0) {
      try {
        const settings = await DB.dbGetAll('settings');
        const pharmacyName = settings.find(s => s.key === 'pharmacy_name')?.value || 'Inconnu';
        await sb.from('pull_tracking').insert([{
          device_id: localStorage.getItem('pharma_device_id') || 'N/A',
          device_name: localStorage.getItem('pharma_device_name') || 'N/A',
          pharmacy_name: pharmacyName,
          user_name: AppState.currentUser?.name || AppState.currentUser?.username || 'Système',
          items_pulled: totalItemsPulled,
          pulled_at: new Date().toISOString()
        }]);
      } catch (trackErr) {
        console.warn('[Flash] Erreur tracking pull:', trackErr);
      }
    }

    // Final refresh of display if settings were updated
    if (window.updatePharmacyDisplay) {
      await window.updatePharmacyDisplay();
    }
    
    // Si le Point de Vente (POS) est ouvert, on rafraîchit les données localement
    if (window.location.hash === '#pos' && typeof refreshPOSData === 'function') {
        await refreshPOSData();
    }
    
  } catch (e) {
    const msg = e.message || '';
    if (!msg.includes('Failed to fetch') && !msg.includes('NetworkError') && !msg.includes('network error')) {
      console.warn('[Flash] Pull general error:', e);
    }
  } finally {
    _isPulling = false;
  }
}

/**
 * FORCE SYNC: Re-mark everything as pending and push to cloud
 */
async function forceSyncAll() {
  const stores = [
    'products', 'lots', 'stock', 'movements', 'suppliers', 'purchaseOrders',
    'sales', 'saleItems', 'patients', 'prescriptions', 'alerts',
    'cashRegister', 'auditLog', 'users', 'settings', 'returns'
  ];

  let totalMarked = 0;
  console.log('[Flash] 🔄 Force sync: marquage de tous les items...');

  for (const s of stores) {
    const all = await dbGetAll(s);
    if (all.length === 0) continue;

    // Marquer _synced: false par chunks de 10k
    const marked = all.map(item => ({ ...item, _synced: false, _updatedAt: item._updatedAt || Date.now() }));
    const chunkSize = 10000;
    for (let i = 0; i < marked.length; i += chunkSize) {
      await dbBulkPut(s, marked.slice(i, i + chunkSize));
    }
    totalMarked += all.length;
    console.log(`[Flash] ✅ ${s}: ${all.length} items marqués pour sync`);
  }

  console.log(`[Flash] 🚀 ${totalMarked} items au total, lancement du push...`);
  return syncToSupabase();
}

/**
 * AUTO-BACKUP : Sauvegarde automatique locale (localStorage) et périodique
 * - Backup silencieux dans localStorage toutes les 30 minutes
 * - Structure : pharma_backup_<date> = JSON de toutes les données
 */
async function autoBackupToStorage() {
  try {
    const stores = [
      'products', 'lots', 'stock', 'movements', 'suppliers', 'purchaseOrders',
      'sales', 'saleItems', 'patients', 'prescriptions', 'alerts',
      'cashRegister', 'auditLog', 'users', 'settings', 'returns'
    ];

    const backup = {
      version: window.APP_VERSION || '3.5.0',
      exportedAt: new Date().toISOString(),
      exportedBy: AppState.currentUser?.name || 'Système',
      pharmacy: null,
      data: {}
    };

    for (const s of stores) {
      backup.data[s] = await dbGetAll(s);
    }

    // Récupérer le nom de la pharmacie pour le backup
    const settings = backup.data.settings || [];
    backup.pharmacy = settings.find(s => s.key === 'pharmacy_name')?.value || 'OrdiveX';

    // Stocker dans localStorage (backup silencieux)
    const key = `pharma_auto_backup_${new Date().toISOString().split('T')[0]}`;
    const json = JSON.stringify(backup);
    // Vérifier que la taille ne dépasse pas 4 MB (limite localStorage ~5-10 MB)
    if (json.length > 4 * 1024 * 1024) {
      console.log('[Backup] ⚠️ Base trop volumineuse pour localStorage (' + (json.length / 1024 / 1024).toFixed(1) + ' MB), backup silencieux ignoré. Utilisez le backup manuel.');
      localStorage.setItem('pharma_last_backup', new Date().toISOString());
      return backup;
    }
    localStorage.setItem(key, json);
    localStorage.setItem('pharma_last_backup', new Date().toISOString());

    // Nettoyer les vieux backups (garder seulement les 7 derniers jours)
    const keysToDelete = Object.keys(localStorage)
      .filter(k => k.startsWith('pharma_auto_backup_'))
      .sort()
      .reverse()
      .slice(7);
    keysToDelete.forEach(k => localStorage.removeItem(k));

    console.log('[Backup] ✅ Sauvegarde automatique effectuée:', key);
    return backup;
  } catch (e) {
    console.warn('[Backup] Échec backup automatique:', e);
    return null;
  }
}

/**
 * BACKUP MANUEL : Télécharge un fichier JSON complet (déclenché par bouton)
 */
async function doBackup() {
  try {
    const backup = await autoBackupToStorage();
    if (!backup) throw new Error('Échec de la génération du backup');

    const json = JSON.stringify(backup, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    const dateStr = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    a.href = url;
    a.download = `OrdiveX_backup_${dateStr}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    if (window.UI) UI.toast('💾 Sauvegarde téléchargée avec succès', 'success');
    return true;
  } catch (e) {
    console.error('[Backup] Erreur export manuel:', e);
    if (window.UI) UI.toast('Erreur lors de la sauvegarde : ' + e.message, 'error');
    return false;
  }
}

/**
 * DÉMARRAGE AUTO-BACKUP : Lance le backup automatique périodique
 * Appelé une fois au démarrage de l'app
 */
function startAutoBackup() {
  // Backup initial au démarrage (après 10 secondes pour laisser l'app s'initialiser)
  setTimeout(async () => {
    await autoBackupToStorage();
  }, 10000);

  // Backup toutes les 30 minutes
  setInterval(async () => {
    await autoBackupToStorage();
    // Si en ligne, synchroniser aussi vers le cloud
    if (AppState.isOnline) {
      syncToSupabase().catch(() => { });
    }
  }, 30 * 60 * 1000); // 30 minutes

  console.log('[Backup] ✅ Auto-backup démarré (toutes les 30 min)');
}

let _autoPullTimer = null;
/**
 * AUTO-PULL : Synchronisation cloud → local automatique
 * Boucle récursive stabilisée à 15 secondes pour éviter de saturer le mobile.
 */
function startAutoPull() {
  if (_autoPullTimer) clearTimeout(_autoPullTimer);
  
  const loop = async () => {
    if (navigator.onLine && AppState.isOnline !== false) {
      try {
        await pullFromSupabase();
      } catch (e) { }
    }
    // En mode hors ligne : vérifier toutes les 60s. En ligne : toutes les 15s.
    const delay = (!navigator.onLine || AppState.isOnline === false) ? 60000 : 15000;
    _autoPullTimer = setTimeout(loop, delay); 
  };
  
  // On attend 5 secondes au démarrage de l'app avant de lancer la première boucle
  // pour laisser l'interface (POS) se charger sans concurrence
  _autoPullTimer = setTimeout(loop, 5000);
}

/**
 * RESTAURATION SÉCURISÉE "ZERO LOSS"
 * Procédure : Backup de secours auto -> Backup localStorage -> Wipe -> Restore -> Audit
 */
async function restoreFromBackup(backupData) {
  try {
    _restoreInProgress = true;
    // 1. PHASE DE PRÉSERVATION (Auto-download de l'état actuel)
    console.log('[Restore] 🛡️ Phase 1 : Sauvegarde de secours automatique...');
    await doBackup();

    // 2. PHASE D'URGENCE (Copie en localStorage)
    console.log('[Restore] 🛡️ Phase 2 : Copie d\'urgence en localStorage...');
    const emergencyBackup = await autoBackupToStorage();
    if (emergencyBackup) {
      localStorage.setItem('pharma_emergency_restore', JSON.stringify(emergencyBackup));
    }

    // 3. PHASE DE VALIDATION DU FICHIER
    console.log('[Restore] 🛡️ Phase 3 : Validation du fichier...');
    if (!backupData || typeof backupData !== 'object') throw new Error('Données de sauvegarde invalides');

    // Support des deux formats (ancien _exportDate et nouveau exportedAt)
    const isPharmaBackup = backupData.data || backupData.products;
    if (!isPharmaBackup) throw new Error('Ce fichier ne semble pas être une sauvegarde OrdiveX valide.');

    // 4. PHASE DE NETTOYAGE (Wipe)
    console.log('[Restore] 🛡️ Phase 4 : Nettoyage de la base de données locale...');
    const storesToClear = [
      'products', 'lots', 'stock', 'movements', 'suppliers', 'purchaseOrders',
      'sales', 'saleItems', 'patients', 'prescriptions', 'alerts',
      'cashRegister', 'auditLog', 'settings', 'returns'
    ];

    const db = await initDB();
    for (const storeName of storesToClear) {
      await new Promise((resolve, reject) => {
        const transaction = db.transaction([storeName], 'readwrite');
        const store = transaction.objectStore(storeName);
        const request = store.clear();
        request.onsuccess = () => resolve();
        request.onerror = () => reject(request.error);
      });
    }

    // 5. PHASE D'INJECTION
    console.log('[Restore] 🛡️ Phase 5 : Injection des nouvelles données...');
    const dataToImport = backupData.data || backupData; // Gère les deux structures de backup possible

    for (const storeName of storesToClear) {
      const items = dataToImport[storeName];
      if (items && Array.isArray(items) && items.length > 0) {
        // Marquer chaque item comme non-synchronisé pour le push Supabase
        const markedItems = items.map(item => ({
          ...item,
          _synced: false,
          _updatedAt: item._updatedAt || Date.now()
        }));
        // Découpage en lots (chunks) de 10 000 pour éviter de bloquer l'interface
        const chunkSize = 10000;
        for (let i = 0; i < markedItems.length; i += chunkSize) {
          const chunk = markedItems.slice(i, i + chunkSize);
          await dbBulkPut(storeName, chunk);
        }
      }
    }

    // 6. PHASE D'AUDIT ET FINALISATION
    console.log('[Restore] ✅ Restauration terminée avec succès.');
    await writeAudit('RESTORE_ZERO_LOSS', 'system', null, {
      timestamp: Date.now(),
      version: backupData.version || 'unknown'
    });

    _restoreInProgress = false;
    return { success: true };
  } catch (e) {
    _restoreInProgress = false;
    console.error('[Restore] ❌ Erreur critique lors de la restauration:', e);
    throw e;
  }
}

function resetSupabaseClient() {
  _supabaseInstance = null;
}

// ═══════════════════════════════════════════════════════════════════
// GLOBAL ERROR HANDLERS — Protection contre les crashes silencieux
// ═══════════════════════════════════════════════════════════════════
window.addEventListener('error', function(event) {
  // Silencer les erreurs réseau (hors-ligne)
  const msg = event.message || '';
  if (msg.includes('ERR_INTERNET_DISCONNECTED') || msg.includes('Failed to fetch') || msg.includes('NetworkError') || msg.includes('net::ERR_')) return;
  console.error('[GLOBAL ERROR]', msg, event.filename, event.lineno);
  // Ne pas afficher de toast pour les erreurs de scripts externes (CDN)
  if (event.filename && !event.filename.includes(location.hostname) && !event.filename.includes('localhost')) return;
  if (window.UI && UI.toast) {
    UI.toast('Erreur système détectée — L\'application continue de fonctionner', 'warning', 3000);
  }
});

window.addEventListener('unhandledrejection', function(event) {
  const msg = String(event.reason?.message || event.reason || '');
  // Silencer les erreurs réseau (hors-ligne) — comportement normal en PWA
  if (msg.includes('ERR_INTERNET_DISCONNECTED') || msg.includes('Failed to fetch') || msg.includes('NetworkError') || msg.includes('net::ERR_') || msg.includes('refresh_token')) {
    event.preventDefault();
    return;
  }
  console.error('[UNHANDLED PROMISE]', event.reason);
  event.preventDefault();
});

// Protection IndexedDB — reconnexion automatique si la connexion est perdue
if (typeof indexedDB !== 'undefined') {
  const _origTransaction = IDBDatabase.prototype.transaction;
  // On ne surcharge pas pour garder la stabilité, mais on surveille
  window.addEventListener('beforeunload', () => {
    if (db) { try { db.close(); } catch(e) {} }
  });
}

// Intercepteurs stricts pour supprimer totalement les tentatives réseau hors ligne
window.addEventListener('online', () => {
  AppState.isOnline = true;
  console.log('[App] 🟢 Connexion internet rétablie.');
  syncToSupabase().catch(()=>{});
});

window.addEventListener('offline', () => {
  AppState.isOnline = false;
  console.log('[App] 🔴 Connexion perdue — mode hors-ligne activé');
  // Destruction complète du client Supabase pour stopper les retry internes (refresh_token, WebSocket)
  if (_supabaseInstance) {
    try {
      // Stopper le rafraîchissement automatique du token
      if (_supabaseInstance.auth?.stopAutoRefresh) {
        _supabaseInstance.auth.stopAutoRefresh();
      }
      // Fermer les channels realtime
      if (_realtimeSubscription) {
        _supabaseInstance.removeChannel(_realtimeSubscription).catch(() => {});
        _realtimeSubscription = null;
      }
      // Déconnecter le realtime complètement
      _supabaseInstance.realtime?.disconnect();
    } catch (e) {}
    // Détruire l'instance — sera recréée au retour en ligne
    _supabaseInstance = null;
  }
});

window.DB = { initDB, dbAdd, dbPut, dbBulkPut, dbGet, dbGetAll, dbGetRecent, dbDelete, dbCount, writeAudit, seedDemoData, syncToSupabase, pullFromSupabase, resetSupabaseClient, forceSyncAll, trackInstallation, getSupabaseClient, STORES, AppState, doBackup, startAutoBackup, startAutoPull, autoBackupToStorage, restoreFromBackup };
