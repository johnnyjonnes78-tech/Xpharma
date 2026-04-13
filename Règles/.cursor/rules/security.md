# 🛡️ Règles de Sécurité — OBLIGATOIRES

> Ces règles s'appliquent à CHAQUE ligne de code générée. Aucune exception.

---

## 🔑 Secrets & Clés API

- JAMAIS de clé API, token ou mot de passe en dur dans le code
- TOUS les secrets vont dans `.env.local` (jamais commité)
- `.env` doit être dans `.gitignore` AVANT le premier commit
- **Côté client** : uniquement les variables préfixées (`NEXT_PUBLIC_`, `VITE_`, etc.)
- **Côté serveur** : clés sensibles (Stripe secret, Supabase service key) jamais exposées au frontend

---

## 🗄️ Base de données (Supabase )

- RLS (Row Level Security) ACTIVÉ sur TOUTES les tables sans exception
- Chaque table a au minimum : 1 policy SELECT + 1 UPDATE + 1 DELETE
- Policy par défaut = RESTRICTIVE (tout bloqué sauf ce qui est autorisé explicitement)
- Utiliser UNIQUEMENT `auth.uid()` dans les policies — JAMAIS `user_metadata`
- `service_key` Supabase = BACKEND UNIQUEMENT, jamais dans le code client
- Côté client = uniquement la `anon key`
- Ajouter `WITH CHECK` sur toutes les policies UPDATE et INSERT
- Créer un index sur `user_id` pour chaque table avec RLS

---

## 🔐 Authentification

- Toute page protégée redirige vers `/login` si non connecté
- Tokens JWT validés CÔTÉ SERVEUR, pas uniquement côté client
- Le logout invalide la session complètement (pas juste un redirect)
- Cookies : `Secure`, `HttpOnly`, `SameSite=Strict`
- Refresh token : 15 min access / 7 jours refresh

---

## 🛡️ Inputs utilisateur — Injections

```js
// ❌ INTERDIT
db.query("SELECT * FROM users WHERE id = " + userId)

// ✅ CORRECT
db.query("SELECT * FROM users WHERE id = $1", [userId])
```

- JAMAIS de `innerHTML` ou `dangerouslySetInnerHTML` avec du contenu utilisateur
- Valider ET sanitiser chaque input CÔTÉ SERVEUR (pas seulement côté client)
- Échapper tout output affiché dans le HTML

---

## 🌐 API & Réseau

```
❌ Access-Control-Allow-Origin: *
✅ Access-Control-Allow-Origin: https://monapp.com
```

- HTTPS obligatoire en production
- CORS restreint : domaines autorisés listés explicitement
- Rate limiting sur les endpoints sensibles (login, signup, paiement)
- JAMAIS de secrets dans les URLs (`?apiKey=xxx` → interdit)

---

## 📦 Dépendances & Packages

- Vérifier chaque package ajouté par l'IA dans `package.json` AVANT de commit
- Lancer `npm audit` régulièrement
- Méfiance pour les packages peu connus (< 1 000 téléchargements/semaine)
- JAMAIS de `eval()`, `Function()`, ni exécution dynamique de code

---

## 🚀 Déploiement

- Variables d'environnement configurées dans le dashboard d'hébergement
- Le fichier `.env` n'est PAS dans le repo Git
- Tester en staging avant production
- Aucune erreur n'affiche de stack trace en production
- Headers requis : `Content-Security-Policy`, `X-Frame-Options`, `Strict-Transport-Security`

---

## ⚡ Les 7 failles à éviter absolument

| # | Faille | Fix |
|---|--------|-----|
| 1 | Service key Supabase en frontend | `anon key` côté client uniquement |
| 2 | RLS désactivé | RLS + policies `auth.uid()` sur toutes les tables |
| 3 | Clé Stripe en dur dans le code | `.env.local` + variable d'environnement |
| 4 | Pas de validation côté serveur | Toujours valider backend |
| 5 | CORS grand ouvert (`*`) | Whitelister les domaines explicitement |
| 6 | Pas de rate limiting | Rate limiting sur endpoints sensibles |
| 7 | Dépendances fantômes | Vérifier chaque package avant install |

---

## 🔍 Prompt d'audit — À utiliser après chaque build

```
Fais un audit de sécurité de mon code actuel. Vérifie :

1. SECRETS     : clés API, tokens ou mots de passe en dur dans le code ?
2. RLS         : activé sur toutes les tables ? policies avec auth.uid() ?
3. INJECTIONS  : concaténations SQL ? innerHTML avec contenu utilisateur ?
4. AUTH        : pages protégées vérifiées ? logout invalide la session ?
5. CORS        : headers restrictifs (pas de wildcard *) ?
6. DEPS        : packages suspects dans package.json ?

Pour chaque problème : ligne exacte + risque en 1 phrase + fix exact.
Ne fais AUCUNE modification sans mon accord. Liste d'abord.
```
