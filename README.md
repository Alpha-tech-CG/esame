# 💰 BudgetShare

**BudgetShare** est une *Progressive Web App* (PWA) de gestion de budget
personnel et partagé. Elle permet d'enregistrer ses dépenses, de les classer
par catégories et tags, de définir un budget mensuel et de visualiser ses
finances à travers des graphiques filtrables.

Application réalisée en **HTML / CSS / JavaScript (ES6+)** avec **Firebase**
(Firestore + Authentication) et **Chart.js** (graphiques). Aucun serveur à
développer : le front-end communique directement avec Firebase.

---

## ✨ Fonctionnalités

- Inscription / connexion / déconnexion (Firebase Authentication)
- Ajout, modification et suppression de dépenses
- Catégories personnalisées (avec couleur) et tags multiples
- Budget mensuel + calcul automatique du montant restant
- Filtres par date, catégorie et tag
- Statistiques : total, répartition par catégorie, évolution quotidienne
- Graphiques (camembert + courbe) avec Chart.js
- Design épuré et responsive (police Geist, icônes Lucide, barre d'onglets
  flottante sur mobile)
- Installable comme application (PWA) et **consultable hors ligne** grâce à la
  persistance intégrée de Firestore
- **Bannière « Installer BudgetShare »** qui apparaît puis disparaît toute seule
  (bouton d'installation sur Android/ordinateur, explication sur iPhone)

**Fonctionnalités avancées**

- **Budget par catégorie** (page Budgets) avec barres de progression
- **Alertes** à 80 % et en cas de dépassement, + notifications du navigateur
- **Export CSV** de la liste de dépenses filtrée
- **Groupes** : membres ajoutés par e-mail, dépenses partagées en **parts
  égales** ou **personnalisées**, soldes « qui doit combien » et filtre par membre

---

## 🗂 Structure du projet

```
budgetshare-pwa/
├─ index.html          # point d'entrée (redirige selon la connexion)
├─ login.html          # connexion / inscription
├─ dashboard.html      # tableau de bord (budget + dernières dépenses)
├─ expenses.html       # liste, ajout, modification, filtres
├─ budgets.html        # budget du mois, budgets par catégorie, alertes
├─ groups.html         # groupes et dépenses partagées
├─ stats.html          # statistiques et graphiques
├─ seed-demo.html      # insertion des données de démonstration
├─ css/                # reset, styles, responsive, dashboard
├─ js/                 # config, auth, expenses, categories, tags,
│                      # budget, stats, charts, filters, utils, dashboard
├─ img/                # fond décoratif du tableau de bord (contours.svg)
├─ icons/              # icônes PWA (192 et 512)
├─ manifest.json       # manifeste PWA
├─ service-worker.js   # cache / mode hors ligne
└─ firestore.rules     # règles de sécurité Firestore
```

---

## 🚀 Installation et lancement

### 1. Créer le projet Firebase

1. Va sur [console.firebase.google.com](https://console.firebase.google.com).
2. **Ajouter un projet**, donne un nom (ex. `budgetshare`), tu peux désactiver
   Google Analytics. Attends la création.

### 2. Activer l'authentification

1. Menu **Build → Authentication → Get started**.
2. Onglet **Sign-in method** → active **Adresse e-mail/Mot de passe** → Enregistrer.

### 3. Créer la base Firestore

1. Menu **Build → Firestore Database → Créer une base de données**.
2. Choisis un emplacement (Europe), démarre en **mode production**.
3. Onglet **Règles (Rules)** → remplace tout par le contenu de
   `firestore.rules` → **Publier**.

### 4. Connecter l'application à Firebase

1. Dans la Console : ⚙ **Paramètres du projet** → onglet **Général**.
2. Section **Vos applications** → icône **Web `</>`** → enregistre une app
   (coche *aussi* l'hébergement si tu veux, sinon non).
3. Firebase affiche un objet `firebaseConfig`. Copie ses valeurs dans
   `js/config.js` :

```js
const firebaseConfig = {
  apiKey: "…",
  authDomain: "ton-projet.firebaseapp.com",
  projectId: "ton-projet",
  storageBucket: "ton-projet.appspot.com",
  messagingSenderId: "…",
  appId: "…",
};
```

> Ces clés sont **publiques** par conception : elles identifient le projet côté
> web. La vraie sécurité repose sur les **règles Firestore** (`firestore.rules`),
> qui s'appliquent côté serveur : chaque utilisateur ne voit que ses données.

### 5. Lancer l'application en local

Une PWA doit être servie par un serveur HTTP (pas en ouvrant le fichier
directement). Au choix :

```bash
python -m http.server 5500
# ou
npx serve .
# ou l'extension « Live Server » de VS Code
```

Puis ouvre **http://localhost:5500**.

### 6. (Optionnel) Données de démonstration

1. Crée un compte et connecte-toi dans l'application.
2. Ouvre **http://localhost:5500/seed-demo.html** et clique sur
   **Insérer les données de démonstration**.

---

## 📱 Installer la PWA sur téléphone

1. Déploie l'application (voir ci-dessous) pour avoir une URL en HTTPS.
2. Ouvre l'URL dans Chrome / Safari / Edge sur le téléphone.
3. Menu du navigateur → **Ajouter à l'écran d'accueil**.

---

## ☁️ Déploiement

Le projet est 100 % statique : il se déploie tel quel sur **Firebase Hosting**,
**GitHub Pages**, **Netlify** ou **Vercel**.

- **Firebase Hosting** : `npm i -g firebase-tools`, puis `firebase login`,
  `firebase init hosting` (dossier public = ce dossier), `firebase deploy`.
- **Netlify / Vercel** : glisse le dossier ou connecte le dépôt GitHub.
- **GitHub Pages** : pousse le code, **Settings → Pages**.

> ⚠️ Dans la Console Firebase → **Authentication → Settings → Authorized
> domains**, ajoute le domaine de ton site déployé (et `localhost` y est déjà).

---

## 🧱 Modèle de données (Firestore, NoSQL)

| Collection | Rôle |
|---|---|
| `users` | Profil lié au compte (nom complet) |
| `categories` | Catégories (nom + couleur) |
| `expenses` | Dépenses (montant, date, description, categoryId, **tags[]**) |
| `budgets` | Budget mensuel (id = `uid_année_mois`) |
| `category_budgets` | Budget mensuel par catégorie (id = `uid_idCatégorie`) |
| `groups` | Groupes : nom, propriétaire, `memberIds`, membres |
| `groups/{id}/expenses` | Dépenses partagées : payeur, parts de chaque membre |
| `userLookup` | Annuaire e-mail → compte, pour ajouter un membre |

> ⚠️ Après une mise à jour du code, **republie `firestore.rules`** dans la
> console Firebase : les nouvelles collections ont besoin de leurs règles.

> Les **tags** sont stockés directement dans chaque dépense (tableau), il n'y a
> donc pas de collection de liaison.

**Règle métier principale :** `budget restant = budget - total des dépenses`.

---

## 🔐 Compte de démonstration

- **E-mail :** celui que tu créeras dans l'application
- **Mot de passe :** celui que tu auras choisi (6 caractères min.)

---

## 🛠 Technologies

HTML5 · CSS3 · JavaScript ES6+ · Firebase (Firestore + Authentication) ·
Chart.js · Lucide (icônes) · Geist (police) · Manifest + Service Worker (PWA)
