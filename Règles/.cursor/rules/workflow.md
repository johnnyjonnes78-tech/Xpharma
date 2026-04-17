# ⚙️ Workflow & Process de Travail

> Processus à suivre à chaque session de développement avec l'IA.

---

## 🚀 Commandes principales

```bash
# Développement
npm run dev          # Lancer le serveur local

# Build & Test
npm run build        # Build de production
npm run test         # Lancer les tests
npm run lint         # Vérifier le code (ESLint)
npm run type-check   # Vérifier les types TypeScript

# Base de données
npm run db:migrate   # Appliquer les migrations
npm run db:seed      # Peupler avec des données de test
```

---

## 🔁 Workflow par session

### Début de session
1. Lire `CLAUDE.md`, `security.md`, `stack.md`
2. Rappeler à l'IA le contexte du projet
3. Définir l'objectif de la session en 1 phrase

### Pendant le développement
1. Développer la feature par petites étapes
2. Tester localement après chaque changement
3. Faire un audit sécurité après chaque build (`security.md` → Prompt d'audit)
4. Committer régulièrement avec des messages clairs

### Fin de session
1. Demander à l'IA de mettre à jour les fichiers `.md`
2. Ajouter les décisions prises dans `stack.md`
3. Ajouter les erreurs corrigées dans ce fichier
4. Committer tous les fichiers `.md` mis à jour

---

## 📋 Checklist avant chaque commit

```
[ ] npm run lint → 0 erreur
[ ] npm run type-check → 0 erreur
[ ] npm run test → tous les tests passent
[ ] Pas de console.log() oublié
[ ] Pas de clé API ou secret dans le code
[ ] .env.local NON inclus dans le commit
[ ] Message de commit clair (voir format ci-dessous)
```

---

## ✍️ Format des commits

```
type(scope): description courte

feat(auth): ajouter la connexion Google OAuth
fix(api): corriger la validation des inputs du formulaire
chore(deps): mettre à jour les dépendances npm
docs(readme): documenter les variables d'environnement
refactor(db): extraire la logique RLS dans un helper
```

**Types** : `feat` · `fix` · `chore` · `docs` · `refactor` · `test` · `style`

---

## 🔍 Commandes de vérification sécurité

```bash
# Chercher des secrets exposés dans le code
grep -rn "password\|secret\|token\|api_key\|apiKey\|SUPABASE_SERVICE" \
  --include="*.js" --include="*.ts" --include="*.jsx" --include="*.tsx" src/

# Vérifier que .env est bien ignoré par Git
git ls-files | grep -i "\.env"

# Auditer les dépendances
npm audit

# Détecter les patterns dangereux
grep -rn "innerHTML\|eval(\|dangerouslySetInnerHTML\|Function(" \
  --include="*.js" --include="*.ts" --include="*.jsx" --include="*.tsx" src/
```

```sql
-- Vérifier le RLS Supabase (dans l'éditeur SQL)
SELECT schemaname, tablename, rowsecurity
FROM pg_tables
WHERE schemaname = 'public' AND rowsecurity = false;
-- Si résultats → activer RLS immédiatement
```

---

## 🐛 Erreurs corrigées en session

> Tenir ce journal pour éviter de répéter les mêmes erreurs.

| Date | Erreur rencontrée | Solution appliquée |
|------|-------------------|-------------------|
| 2026-04-17 | Import 50k produits freeze + crash navigateur | `dbBulkPut()` — 1 transaction IndexedDB par lot de 5000 au lieu de 50k transactions individuelles |
| 2026-04-17 | Sidebar vide après login (rôle `manager` non reconnu) | Ajout puis suppression du rôle `manager`, standardisé sur `admin` uniquement |
| 2026-04-17 | Erreur SQL `syntax error near TABLE` dans supabase_schema.sql | Fragment de code `CREATE TABLE pull_tracking` coupé en deux par erreur d'insertion |

---

## 📈 Features développées

> Historique de ce qui a été fait.

| Date | Feature | Statut |
|------|---------|--------|
| 2026-04-17 | `dbBulkPut()` — Méthode d'import en masse IndexedDB | `✅ Done` |
| 2026-04-17 | Import CSV médicaments optimisé (architecture 4 phases) | `✅ Done` |
| 2026-04-17 | Import CSV patients (nouveau module complet) | `✅ Done` |
| 2026-04-17 | Chatbot Naomie (renommage + conversation naturelle + FAQ enrichie) | `✅ Done` |
| 2026-04-17 | Tracking push/pull Cloud (tables Supabase) | `✅ Done` |
