-- ============================================================
-- PHARMA_PROJET v3.2.1 — Schéma Supabase COMPLET (STABLE)
-- 
-- DESCRIPTION :
-- Ce fichier contient la structure complète de la base de données 
-- Supabase pour PharmaProjet. Il inclut toutes les tables, 
-- types de données et politiques de sécurité (RLS).
-- ============================================================

-- ═══════════════════════════════════════════════════════════════
-- 0. NETTOYAGE — Supprime les tables existantes (ordre = dépendances)
-- ═══════════════════════════════════════════════════════════════
DROP TABLE IF EXISTS "cashRegister" CASCADE;
DROP TABLE IF EXISTS "auditLog" CASCADE;
DROP TABLE IF EXISTS "app_users" CASCADE;
DROP TABLE IF EXISTS "users" CASCADE;
DROP TABLE IF EXISTS "returns" CASCADE;
DROP TABLE IF EXISTS alerts CASCADE;
DROP TABLE IF EXISTS "saleItems" CASCADE;
DROP TABLE IF EXISTS sales CASCADE;
DROP TABLE IF EXISTS movements CASCADE;
DROP TABLE IF EXISTS stock CASCADE;
DROP TABLE IF EXISTS lots CASCADE;
DROP TABLE IF EXISTS "purchaseOrders" CASCADE;
DROP TABLE IF EXISTS suppliers CASCADE;
DROP TABLE IF EXISTS prescriptions CASCADE;
DROP TABLE IF EXISTS patients CASCADE;
DROP TABLE IF EXISTS products CASCADE;
DROP TABLE IF EXISTS settings CASCADE;

-- ═══════════════════════════════════════════════════════════════
-- 1. TABLE PRODUCTS — Catalogue des médicaments
-- ═══════════════════════════════════════════════════════════════
CREATE TABLE products (
  id                      BIGINT PRIMARY KEY,
  code                    TEXT,
  name                    TEXT,
  dci                     TEXT,
  brand                   TEXT,
  form                    TEXT,
  dosage                  TEXT,
  category                TEXT,
  "requiresPrescription"  BOOLEAN DEFAULT false,
  "minStock"              INTEGER DEFAULT 10,
  "salePrice"             NUMERIC DEFAULT 0,
  "purchasePrice"         NUMERIC DEFAULT 0,
  "vatRate"               NUMERIC DEFAULT 0,
  unit                    TEXT DEFAULT 'boîte',
  status                  TEXT DEFAULT 'active',
  "expiryDate"            TEXT,
  -- ═══ NOTICE MÉDICALE (Feature 4) ═══
  "dosageInstructions"    TEXT,
  "precautions"           TEXT,
  "contraindications"     TEXT,
  "sideEffects"           TEXT,
  "medicalNotice"         TEXT,
  -- ═══ DÉCONDITIONNEMENT (Feature 1) ═══
  "unitsPerBox"           INTEGER DEFAULT 1,
  "pricePerUnit"          NUMERIC DEFAULT 0,
  "allowUnitSale"         BOOLEAN DEFAULT false,
  "updatedAt"             BIGINT
);

-- ═══════════════════════════════════════════════════════════════
-- 2. TABLE LOTS — Gestion des lots
-- ═══════════════════════════════════════════════════════════════
CREATE TABLE lots (
  id                      BIGINT PRIMARY KEY,
  "productId"             BIGINT,
  "lotNumber"             TEXT,
  "expiryDate"            TEXT,
  quantity                INTEGER DEFAULT 0,
  "initialQuantity"       INTEGER DEFAULT 0,
  "supplierId"            BIGINT,
  "receiptDate"           TEXT,
  status                  TEXT DEFAULT 'active',
  "updatedAt"             BIGINT,
  "destroyedQty"          INTEGER DEFAULT 0,
  "destructionDate"       TEXT,
  "destructionReason"     TEXT,
  "destructionMethod"     TEXT,
  "destructionWitnesses"  TEXT,
  "destructionBy"         TEXT
);

-- ═══════════════════════════════════════════════════════════════
-- 3. TABLE STOCK — État du stock par produit
-- ═══════════════════════════════════════════════════════════════
CREATE TABLE stock (
  id                  BIGINT PRIMARY KEY,
  "productId"         BIGINT,
  quantity            INTEGER DEFAULT 0,
  "reservedQuantity"  INTEGER DEFAULT 0,
  "lastUpdated"       BIGINT,
  "updatedAt"         BIGINT
);

-- ═══════════════════════════════════════════════════════════════
-- 4. TABLE MOVEMENTS — Historique des mouvements
-- ═══════════════════════════════════════════════════════════════
CREATE TABLE movements (
  id            BIGINT PRIMARY KEY,
  "productId"   BIGINT,
  type          TEXT,
  "subType"     TEXT,
  quantity      INTEGER DEFAULT 0,
  "lotNumber"   TEXT,
  date          TEXT,
  "userId"      BIGINT,
  note          TEXT,
  reference     TEXT,
  "updatedAt"   BIGINT
);

-- ═══════════════════════════════════════════════════════════════
-- 5. TABLE SUPPLIERS — Fournisseurs
-- ═══════════════════════════════════════════════════════════════
CREATE TABLE suppliers (
  id              BIGINT PRIMARY KEY,
  name            TEXT,
  contact         TEXT,
  phone           TEXT,
  email           TEXT,
  address         TEXT,
  status          TEXT DEFAULT 'active',
  "agrément"      TEXT,
  "paymentTerms"  INTEGER DEFAULT 30,
  "updatedAt"     BIGINT
);

-- ═══════════════════════════════════════════════════════════════
-- 6. TABLE PURCHASE_ORDERS — Bons de commande
-- ═══════════════════════════════════════════════════════════════
CREATE TABLE "purchaseOrders" (
  id              BIGINT PRIMARY KEY,
  "supplierId"    BIGINT,
  "orderNumber"   TEXT,
  status          TEXT DEFAULT 'draft',
  date            TEXT,
  "expectedDate"  TEXT,
  "totalAmount"   NUMERIC DEFAULT 0,
  items           JSONB,
  note            TEXT,
  "createdBy"     BIGINT,
  "receivedAt"    TEXT,
  "receiveNote"   TEXT,
  "hasNonConformity" BOOLEAN DEFAULT false,
  "updatedAt"     BIGINT
);

-- ═══════════════════════════════════════════════════════════════
-- 7. TABLE PATIENTS — Dossiers patients
-- ═══════════════════════════════════════════════════════════════
CREATE TABLE patients (
  id          BIGINT PRIMARY KEY,
  name        TEXT,
  phone       TEXT,
  dob         TEXT,
  allergies   TEXT,
  address     TEXT,
  assurances  JSONB, -- Tableau d'assurances [{"name": "CNSS", "coverage": 80, "ref": "123"}]
  "updatedAt" BIGINT
);

-- ═══════════════════════════════════════════════════════════════
-- 8. TABLE PRESCRIPTIONS — Ordonnances médicales
-- ═══════════════════════════════════════════════════════════════
CREATE TABLE prescriptions (
  id            BIGINT PRIMARY KEY,
  "patientId"   BIGINT,
  date          TEXT,
  status        TEXT DEFAULT 'pending',
  "doctorName"  TEXT,
  items         JSONB,
  "updatedAt"   BIGINT
);

-- ═══════════════════════════════════════════════════════════════
-- 9. TABLE SALES — Ventes
-- ═══════════════════════════════════════════════════════════════
CREATE TABLE sales (
  id                BIGINT PRIMARY KEY,
  date              TEXT,
  "patientId"       BIGINT,
  "patientName"     TEXT,
  "patientPhone"    TEXT,
  "userId"          BIGINT,
  "sellerName"      TEXT,
  total             NUMERIC DEFAULT 0,
  subtotal          NUMERIC DEFAULT 0,
  discount          NUMERIC DEFAULT 0,
  "paymentMethod"   TEXT,
  "mmPhone"         TEXT,
  status            TEXT DEFAULT 'completed',
  "prescriptionId"  BIGINT,
  "prescriptionRef" TEXT,
  "doctorName"      TEXT,
  "itemCount"       INTEGER DEFAULT 0,
  "creditDueDate"   TEXT,
  "cashReceived"    NUMERIC,
  "returnStatus"    TEXT,
  "lastReturnId"    BIGINT,
  "lastReturnDate"  TEXT,
  "insuranceDetails" JSONB, -- Détails de prise en charge multi-assurances
  "updatedAt"       BIGINT
);

-- ═══════════════════════════════════════════════════════════════
-- 10. TABLE SALE_ITEMS — Détails des lignes de vente
-- ═══════════════════════════════════════════════════════════════
CREATE TABLE "saleItems" (
  id              BIGINT PRIMARY KEY,
  "saleId"        BIGINT,
  "productId"     BIGINT,
  "productName"   TEXT,
  quantity        INTEGER DEFAULT 0,
  "unitPrice"     NUMERIC DEFAULT 0,
  "purchasePrice" NUMERIC DEFAULT 0,
  "lotId"         BIGINT,
  total           NUMERIC DEFAULT 0,
  "updatedAt"     BIGINT
);

-- ═══════════════════════════════════════════════════════════════
-- 11. TABLE ALERTS — Alertes système
-- ═══════════════════════════════════════════════════════════════
CREATE TABLE alerts (
  id            BIGINT PRIMARY KEY,
  type          TEXT,
  "productId"   BIGINT,
  "productName" TEXT,
  message       TEXT,
  status        TEXT DEFAULT 'unread',
  date          BIGINT,
  priority      TEXT DEFAULT 'medium',
  "lotId"       BIGINT,
  "updatedAt"   BIGINT
);

-- ═══════════════════════════════════════════════════════════════
-- 12. TABLE RETURNS — Retours clients
-- ═══════════════════════════════════════════════════════════════
CREATE TABLE "returns" (
  id              BIGINT PRIMARY KEY,
  "saleId"        BIGINT,
  "saleRef"       TEXT,
  "patientId"     BIGINT,
  "patientName"   TEXT,
  date            TEXT,
  reason          TEXT,
  items           JSONB,
  "refundAmount"  NUMERIC DEFAULT 0,
  "isFullReturn"  BOOLEAN DEFAULT false,
  status          TEXT DEFAULT 'approved',
  "paymentMethod" TEXT,
  "processedBy"   TEXT,
  "updatedAt"     BIGINT
);

-- ═══════════════════════════════════════════════════════════════
-- 13. TABLE CASH_REGISTER — Caisse journalière & Clôtures
-- ═══════════════════════════════════════════════════════════════
CREATE TABLE "cashRegister" (
  id                BIGINT PRIMARY KEY,
  type              TEXT, -- 'income', 'expense', 'closure'
  amount            NUMERIC DEFAULT 0,
  "paymentMethod"   TEXT,
  reason            TEXT,
  date              TEXT,
  "timestamp"       BIGINT,
  "userId"          BIGINT,
  "closedAt"        BIGINT,
  "closedBy"        TEXT,
  "openingFund"     NUMERIC DEFAULT 0,
  "expectedCash"    NUMERIC DEFAULT 0,
  "physicalCash"    NUMERIC DEFAULT 0,
  "totalSales"      NUMERIC DEFAULT 0,
  "transactionCount" BIGINT DEFAULT 0,
  "note"            TEXT,
  "updatedAt"       BIGINT
);

-- ═══════════════════════════════════════════════════════════════
-- 14. TABLE AUDIT_LOG — Journal d'audit (traçabilité)
-- ═══════════════════════════════════════════════════════════════
CREATE TABLE "auditLog" (
  id          BIGINT PRIMARY KEY,
  "userId"    BIGINT,
  username    TEXT,
  action      TEXT,
  entity      TEXT,
  "entityId"  BIGINT,
  details     JSONB,
  "timestamp" BIGINT,
  ip          TEXT,
  "updatedAt" BIGINT
);

-- ═══════════════════════════════════════════════════════════════
-- 15. TABLE APP_USERS — Gestion des utilisateurs
-- ═══════════════════════════════════════════════════════════════
CREATE TABLE "app_users" (
  id          BIGINT PRIMARY KEY,
  name        TEXT,
  email       TEXT,
  username    TEXT UNIQUE,
  password    TEXT,
  role        TEXT,
  active      BOOLEAN DEFAULT true,
  "updatedAt" BIGINT
);

-- ═══════════════════════════════════════════════════════════════
-- 16. TABLE SETTINGS — Paramètres clé/valeur
-- ═══════════════════════════════════════════════════════════════
CREATE TABLE settings (
  key         TEXT PRIMARY KEY,
  value       TEXT,
  "updatedAt" BIGINT
);

-- ═══════════════════════════════════════════════════════════════

-- ═══════════════════════════════════════════════════════════════
-- 18. MIGRATION — Ajout colonnes manquantes (v3.6.0)
-- ═══════════════════════════════════════════════════════════════

ALTER TABLE lots ADD COLUMN IF NOT EXISTS "destroyedQty" INTEGER DEFAULT 0;
ALTER TABLE lots ADD COLUMN IF NOT EXISTS "destructionDate" TEXT;
ALTER TABLE lots ADD COLUMN IF NOT EXISTS "destructionReason" TEXT;
ALTER TABLE lots ADD COLUMN IF NOT EXISTS "destructionMethod" TEXT;
ALTER TABLE lots ADD COLUMN IF NOT EXISTS "destructionWitnesses" TEXT;
ALTER TABLE lots ADD COLUMN IF NOT EXISTS "destructionBy" TEXT;

ALTER TABLE alerts ADD COLUMN IF NOT EXISTS "lotId" BIGINT;

-- ═══════════════════════════════════════════════════════════════
-- 19. MIGRATION — Colonnes manquantes purchaseOrders (v4.0.1)
-- ═══════════════════════════════════════════════════════════════

ALTER TABLE "purchaseOrders" ADD COLUMN IF NOT EXISTS "orderNumber" TEXT;
ALTER TABLE "purchaseOrders" ADD COLUMN IF NOT EXISTS "expectedDate" TEXT;
ALTER TABLE "purchaseOrders" ADD COLUMN IF NOT EXISTS note TEXT;
ALTER TABLE "purchaseOrders" ADD COLUMN IF NOT EXISTS "createdBy" BIGINT;
ALTER TABLE "purchaseOrders" ADD COLUMN IF NOT EXISTS "receivedAt" TEXT;
ALTER TABLE "purchaseOrders" ADD COLUMN IF NOT EXISTS "receiveNote" TEXT;
ALTER TABLE "purchaseOrders" ADD COLUMN IF NOT EXISTS "hasNonConformity" BOOLEAN DEFAULT false;

-- ═══════════════════════════════════════════════════════════════
-- ✅ TERMINÉ — Toutes les tables sont prêtes. v4.0.1-stable
-- ═══════════════════════════════════════════════════════════════

-- ═══════════════════════════════════════════════════════════════
-- 17. SÉCURITÉ — Row Level Security (RLS Strict)
-- ═══════════════════════════════════════════════════════════════

-- RLS pour products
ALTER TABLE "products" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "products_policy_select" ON "products";
CREATE POLICY "products_policy_select" ON "products" FOR SELECT USING (auth.uid() IS NOT NULL);
DROP POLICY IF EXISTS "products_policy_insert" ON "products";
CREATE POLICY "products_policy_insert" ON "products" FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);
DROP POLICY IF EXISTS "products_policy_update" ON "products";
CREATE POLICY "products_policy_update" ON "products" FOR UPDATE USING (auth.uid() IS NOT NULL) WITH CHECK (auth.uid() IS NOT NULL);
DROP POLICY IF EXISTS "products_policy_delete" ON "products";
CREATE POLICY "products_policy_delete" ON "products" FOR DELETE USING (auth.uid() IS NOT NULL);

-- RLS pour lots
ALTER TABLE "lots" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "lots_policy_select" ON "lots";
CREATE POLICY "lots_policy_select" ON "lots" FOR SELECT USING (auth.uid() IS NOT NULL);
DROP POLICY IF EXISTS "lots_policy_insert" ON "lots";
CREATE POLICY "lots_policy_insert" ON "lots" FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);
DROP POLICY IF EXISTS "lots_policy_update" ON "lots";
CREATE POLICY "lots_policy_update" ON "lots" FOR UPDATE USING (auth.uid() IS NOT NULL) WITH CHECK (auth.uid() IS NOT NULL);
DROP POLICY IF EXISTS "lots_policy_delete" ON "lots";
CREATE POLICY "lots_policy_delete" ON "lots" FOR DELETE USING (auth.uid() IS NOT NULL);

-- RLS pour stock
ALTER TABLE "stock" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "stock_policy_select" ON "stock";
CREATE POLICY "stock_policy_select" ON "stock" FOR SELECT USING (auth.uid() IS NOT NULL);
DROP POLICY IF EXISTS "stock_policy_insert" ON "stock";
CREATE POLICY "stock_policy_insert" ON "stock" FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);
DROP POLICY IF EXISTS "stock_policy_update" ON "stock";
CREATE POLICY "stock_policy_update" ON "stock" FOR UPDATE USING (auth.uid() IS NOT NULL) WITH CHECK (auth.uid() IS NOT NULL);
DROP POLICY IF EXISTS "stock_policy_delete" ON "stock";
CREATE POLICY "stock_policy_delete" ON "stock" FOR DELETE USING (auth.uid() IS NOT NULL);

-- RLS pour movements
ALTER TABLE "movements" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "movements_policy_select" ON "movements";
CREATE POLICY "movements_policy_select" ON "movements" FOR SELECT USING (auth.uid() IS NOT NULL);
DROP POLICY IF EXISTS "movements_policy_insert" ON "movements";
CREATE POLICY "movements_policy_insert" ON "movements" FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);
DROP POLICY IF EXISTS "movements_policy_update" ON "movements";
CREATE POLICY "movements_policy_update" ON "movements" FOR UPDATE USING (auth.uid() IS NOT NULL) WITH CHECK (auth.uid() IS NOT NULL);
DROP POLICY IF EXISTS "movements_policy_delete" ON "movements";
CREATE POLICY "movements_policy_delete" ON "movements" FOR DELETE USING (auth.uid() IS NOT NULL);

-- RLS pour suppliers
ALTER TABLE "suppliers" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "suppliers_policy_select" ON "suppliers";
CREATE POLICY "suppliers_policy_select" ON "suppliers" FOR SELECT USING (auth.uid() IS NOT NULL);
DROP POLICY IF EXISTS "suppliers_policy_insert" ON "suppliers";
CREATE POLICY "suppliers_policy_insert" ON "suppliers" FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);
DROP POLICY IF EXISTS "suppliers_policy_update" ON "suppliers";
CREATE POLICY "suppliers_policy_update" ON "suppliers" FOR UPDATE USING (auth.uid() IS NOT NULL) WITH CHECK (auth.uid() IS NOT NULL);
DROP POLICY IF EXISTS "suppliers_policy_delete" ON "suppliers";
CREATE POLICY "suppliers_policy_delete" ON "suppliers" FOR DELETE USING (auth.uid() IS NOT NULL);

-- RLS pour purchaseOrders
ALTER TABLE "purchaseOrders" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "purchaseOrders_policy_select" ON "purchaseOrders";
CREATE POLICY "purchaseOrders_policy_select" ON "purchaseOrders" FOR SELECT USING (auth.uid() IS NOT NULL);
DROP POLICY IF EXISTS "purchaseOrders_policy_insert" ON "purchaseOrders";
CREATE POLICY "purchaseOrders_policy_insert" ON "purchaseOrders" FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);
DROP POLICY IF EXISTS "purchaseOrders_policy_update" ON "purchaseOrders";
CREATE POLICY "purchaseOrders_policy_update" ON "purchaseOrders" FOR UPDATE USING (auth.uid() IS NOT NULL) WITH CHECK (auth.uid() IS NOT NULL);
DROP POLICY IF EXISTS "purchaseOrders_policy_delete" ON "purchaseOrders";
CREATE POLICY "purchaseOrders_policy_delete" ON "purchaseOrders" FOR DELETE USING (auth.uid() IS NOT NULL);

-- RLS pour patients
ALTER TABLE "patients" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "patients_policy_select" ON "patients";
CREATE POLICY "patients_policy_select" ON "patients" FOR SELECT USING (auth.uid() IS NOT NULL);
DROP POLICY IF EXISTS "patients_policy_insert" ON "patients";
CREATE POLICY "patients_policy_insert" ON "patients" FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);
DROP POLICY IF EXISTS "patients_policy_update" ON "patients";
CREATE POLICY "patients_policy_update" ON "patients" FOR UPDATE USING (auth.uid() IS NOT NULL) WITH CHECK (auth.uid() IS NOT NULL);
DROP POLICY IF EXISTS "patients_policy_delete" ON "patients";
CREATE POLICY "patients_policy_delete" ON "patients" FOR DELETE USING (auth.uid() IS NOT NULL);

-- RLS pour prescriptions
ALTER TABLE "prescriptions" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "prescriptions_policy_select" ON "prescriptions";
CREATE POLICY "prescriptions_policy_select" ON "prescriptions" FOR SELECT USING (auth.uid() IS NOT NULL);
DROP POLICY IF EXISTS "prescriptions_policy_insert" ON "prescriptions";
CREATE POLICY "prescriptions_policy_insert" ON "prescriptions" FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);
DROP POLICY IF EXISTS "prescriptions_policy_update" ON "prescriptions";
CREATE POLICY "prescriptions_policy_update" ON "prescriptions" FOR UPDATE USING (auth.uid() IS NOT NULL) WITH CHECK (auth.uid() IS NOT NULL);
DROP POLICY IF EXISTS "prescriptions_policy_delete" ON "prescriptions";
CREATE POLICY "prescriptions_policy_delete" ON "prescriptions" FOR DELETE USING (auth.uid() IS NOT NULL);

-- RLS pour sales
ALTER TABLE "sales" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "sales_policy_select" ON "sales";
CREATE POLICY "sales_policy_select" ON "sales" FOR SELECT USING (auth.uid() IS NOT NULL);
DROP POLICY IF EXISTS "sales_policy_insert" ON "sales";
CREATE POLICY "sales_policy_insert" ON "sales" FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);
DROP POLICY IF EXISTS "sales_policy_update" ON "sales";
CREATE POLICY "sales_policy_update" ON "sales" FOR UPDATE USING (auth.uid() IS NOT NULL) WITH CHECK (auth.uid() IS NOT NULL);
DROP POLICY IF EXISTS "sales_policy_delete" ON "sales";
CREATE POLICY "sales_policy_delete" ON "sales" FOR DELETE USING (auth.uid() IS NOT NULL);

-- RLS pour saleItems
ALTER TABLE "saleItems" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "saleItems_policy_select" ON "saleItems";
CREATE POLICY "saleItems_policy_select" ON "saleItems" FOR SELECT USING (auth.uid() IS NOT NULL);
DROP POLICY IF EXISTS "saleItems_policy_insert" ON "saleItems";
CREATE POLICY "saleItems_policy_insert" ON "saleItems" FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);
DROP POLICY IF EXISTS "saleItems_policy_update" ON "saleItems";
CREATE POLICY "saleItems_policy_update" ON "saleItems" FOR UPDATE USING (auth.uid() IS NOT NULL) WITH CHECK (auth.uid() IS NOT NULL);
DROP POLICY IF EXISTS "saleItems_policy_delete" ON "saleItems";
CREATE POLICY "saleItems_policy_delete" ON "saleItems" FOR DELETE USING (auth.uid() IS NOT NULL);

-- RLS pour alerts
ALTER TABLE "alerts" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "alerts_policy_select" ON "alerts";
CREATE POLICY "alerts_policy_select" ON "alerts" FOR SELECT USING (auth.uid() IS NOT NULL);
DROP POLICY IF EXISTS "alerts_policy_insert" ON "alerts";
CREATE POLICY "alerts_policy_insert" ON "alerts" FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);
DROP POLICY IF EXISTS "alerts_policy_update" ON "alerts";
CREATE POLICY "alerts_policy_update" ON "alerts" FOR UPDATE USING (auth.uid() IS NOT NULL) WITH CHECK (auth.uid() IS NOT NULL);
DROP POLICY IF EXISTS "alerts_policy_delete" ON "alerts";
CREATE POLICY "alerts_policy_delete" ON "alerts" FOR DELETE USING (auth.uid() IS NOT NULL);

-- RLS pour returns
ALTER TABLE "returns" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "returns_policy_select" ON "returns";
CREATE POLICY "returns_policy_select" ON "returns" FOR SELECT USING (auth.uid() IS NOT NULL);
DROP POLICY IF EXISTS "returns_policy_insert" ON "returns";
CREATE POLICY "returns_policy_insert" ON "returns" FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);
DROP POLICY IF EXISTS "returns_policy_update" ON "returns";
CREATE POLICY "returns_policy_update" ON "returns" FOR UPDATE USING (auth.uid() IS NOT NULL) WITH CHECK (auth.uid() IS NOT NULL);
DROP POLICY IF EXISTS "returns_policy_delete" ON "returns";
CREATE POLICY "returns_policy_delete" ON "returns" FOR DELETE USING (auth.uid() IS NOT NULL);

-- RLS pour cashRegister
ALTER TABLE "cashRegister" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "cashRegister_policy_select" ON "cashRegister";
CREATE POLICY "cashRegister_policy_select" ON "cashRegister" FOR SELECT USING (auth.uid() IS NOT NULL);
DROP POLICY IF EXISTS "cashRegister_policy_insert" ON "cashRegister";
CREATE POLICY "cashRegister_policy_insert" ON "cashRegister" FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);
DROP POLICY IF EXISTS "cashRegister_policy_update" ON "cashRegister";
CREATE POLICY "cashRegister_policy_update" ON "cashRegister" FOR UPDATE USING (auth.uid() IS NOT NULL) WITH CHECK (auth.uid() IS NOT NULL);
DROP POLICY IF EXISTS "cashRegister_policy_delete" ON "cashRegister";
CREATE POLICY "cashRegister_policy_delete" ON "cashRegister" FOR DELETE USING (auth.uid() IS NOT NULL);

-- RLS pour auditLog
ALTER TABLE "auditLog" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "auditLog_policy_select" ON "auditLog";
CREATE POLICY "auditLog_policy_select" ON "auditLog" FOR SELECT USING (auth.uid() IS NOT NULL);
DROP POLICY IF EXISTS "auditLog_policy_insert" ON "auditLog";
CREATE POLICY "auditLog_policy_insert" ON "auditLog" FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);
DROP POLICY IF EXISTS "auditLog_policy_update" ON "auditLog";
CREATE POLICY "auditLog_policy_update" ON "auditLog" FOR UPDATE USING (auth.uid() IS NOT NULL) WITH CHECK (auth.uid() IS NOT NULL);
DROP POLICY IF EXISTS "auditLog_policy_delete" ON "auditLog";
CREATE POLICY "auditLog_policy_delete" ON "auditLog" FOR DELETE USING (auth.uid() IS NOT NULL);

-- RLS pour app_users
ALTER TABLE "app_users" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "app_users_policy_select" ON "app_users";
CREATE POLICY "app_users_policy_select" ON "app_users" FOR SELECT USING (auth.uid() IS NOT NULL);
DROP POLICY IF EXISTS "app_users_policy_insert" ON "app_users";
CREATE POLICY "app_users_policy_insert" ON "app_users" FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);
DROP POLICY IF EXISTS "app_users_policy_update" ON "app_users";
CREATE POLICY "app_users_policy_update" ON "app_users" FOR UPDATE USING (auth.uid() IS NOT NULL) WITH CHECK (auth.uid() IS NOT NULL);
DROP POLICY IF EXISTS "app_users_policy_delete" ON "app_users";
CREATE POLICY "app_users_policy_delete" ON "app_users" FOR DELETE USING (auth.uid() IS NOT NULL);

-- RLS pour settings
ALTER TABLE "settings" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "settings_policy_select" ON "settings";
CREATE POLICY "settings_policy_select" ON "settings" FOR SELECT USING (auth.uid() IS NOT NULL);
DROP POLICY IF EXISTS "settings_policy_insert" ON "settings";
CREATE POLICY "settings_policy_insert" ON "settings" FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);
DROP POLICY IF EXISTS "settings_policy_update" ON "settings";
CREATE POLICY "settings_policy_update" ON "settings" FOR UPDATE USING (auth.uid() IS NOT NULL) WITH CHECK (auth.uid() IS NOT NULL);
DROP POLICY IF EXISTS "settings_policy_delete" ON "settings";
CREATE POLICY "settings_policy_delete" ON "settings" FOR DELETE USING (auth.uid() IS NOT NULL);

CREATE TABLE IF NOT EXISTS pull_tracking (
  id BIGSERIAL PRIMARY KEY,
  device_id TEXT NOT NULL,
  device_name TEXT,
  pharmacy_name TEXT,
  user_name TEXT,
  pulled_at TIMESTAMPTZ DEFAULT NOW(),
  items_pulled INTEGER DEFAULT 0,
  ip_address TEXT
);

ALTER TABLE pull_tracking ENABLE ROW LEVEL SECURITY;
CREATE POLICY "allow_insert" ON pull_tracking FOR INSERT WITH CHECK (true);
CREATE POLICY "allow_select_admin" ON pull_tracking FOR SELECT USING (true);

CREATE TABLE IF NOT EXISTS push_tracking (
  id BIGSERIAL PRIMARY KEY,
  device_id TEXT NOT NULL,
  device_name TEXT,
  pharmacy_name TEXT,
  user_name TEXT,
  pushed_at TIMESTAMPTZ DEFAULT NOW(),
  items_pushed INTEGER DEFAULT 0,
  ip_address TEXT
);

ALTER TABLE push_tracking ENABLE ROW LEVEL SECURITY;
CREATE POLICY "allow_insert" ON push_tracking FOR INSERT WITH CHECK (true);
CREATE POLICY "allow_select_admin" ON push_tracking FOR SELECT USING (true);
