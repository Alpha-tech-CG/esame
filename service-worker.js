/* ============================================================
   service-worker.js
   Gère le cache de l'application pour le mode hors ligne (PWA).
   Stratégie :
   - Les fichiers de l'application (HTML, CSS, JS, icônes) sont
     mis en cache à l'installation => consultation hors ligne.
   - Les appels à Supabase (API/Auth) passent toujours par le
     réseau : on ne met JAMAIS en cache les données privées
     ni les jetons d'authentification.
   ============================================================ */

// Nom + version du cache. On incrémente la version (v1 -> v2...)
// à chaque modification des fichiers pour forcer la mise à jour.
const CACHE_NAME = "budgetshare-v6";

// Liste des fichiers composant le « squelette » de l'application.
// Ce sont eux qui seront disponibles hors ligne.
const APP_SHELL = [
  "./",
  "./index.html",
  "./login.html",
  "./dashboard.html",
  "./expenses.html",
  "./stats.html",
  "./budgets.html",
  "./groups.html",
  "./js/alerts.js",
  "./js/budgets.js",
  "./js/groups.js",
  "./js/export.js",
  "./manifest.json",
  "./css/reset.css",
  "./css/styles.css",
  "./css/responsive.css",
  "./css/dashboard.css",
  "./img/contours.svg",
  "./js/dashboard.js",
  "./js/config.js",
  "./js/utils.js",
  "./js/auth.js",
  "./js/expenses.js",
  "./js/categories.js",
  "./js/tags.js",
  "./js/budget.js",
  "./js/stats.js",
  "./js/charts.js",
  "./js/filters.js",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
  // Librairies externes (CDN) : on les met aussi en cache pour que
  // l'application puisse se charger hors ligne.
  "https://www.gstatic.com/firebasejs/10.12.5/firebase-app-compat.js",
  "https://www.gstatic.com/firebasejs/10.12.5/firebase-auth-compat.js",
  "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore-compat.js",
  "https://cdn.jsdelivr.net/npm/chart.js@4",
  "https://unpkg.com/lucide@1.80.0/dist/umd/lucide.min.js",
  "https://fonts.googleapis.com/css2?family=Geist:wght@400;500;600&display=swap"
];

// 1) INSTALLATION : on pré-charge le squelette dans le cache.
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      // addAll échoue si UN SEUL fichier manque : on utilise donc
      // une boucle tolérante pour ne pas bloquer l'installation.
      return Promise.allSettled(
        APP_SHELL.map((url) => cache.add(url))
      );
    })
  );
  // Active le nouveau service worker immédiatement.
  self.skipWaiting();
});

// 2) ACTIVATION : on supprime les anciens caches (anciennes versions).
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((key) => key !== CACHE_NAME)
          .map((key) => caches.delete(key))
      )
    )
  );
  // Prend le contrôle des pages déjà ouvertes.
  self.clients.claim();
});

// 3) INTERCEPTION DES REQUÊTES (fetch).
self.addEventListener("fetch", (event) => {
  const request = event.request;
  const url = new URL(request.url);

  // On ne gère que les requêtes GET (pas les POST/PUT de Supabase).
  if (request.method !== "GET") {
    return;
  }

  // Les requêtes vers l'API Firebase (Firestore + authentification)
  // passent toujours par le réseau : c'est Firestore lui-même qui
  // gère son cache hors ligne. On ne les intercepte pas.
  // (La police Google Fonts, elle, est mise en cache normalement.)
  const firebaseHosts = [
    "firestore.googleapis.com",
    "identitytoolkit.googleapis.com",
    "securetoken.googleapis.com",
    "firebaseinstallations.googleapis.com",
  ];
  if (
    firebaseHosts.includes(url.hostname) ||
    url.hostname.endsWith("firebaseio.com") ||
    url.hostname.endsWith("firebaseapp.com")
  ) {
    return; // laisse le navigateur / Firebase gérer normalement
  }

  // Pour les fichiers de l'app : stratégie « cache d'abord ».
  // Si le fichier est en cache on le renvoie (rapide + hors ligne),
  // sinon on va le chercher sur le réseau puis on le met en cache.
  event.respondWith(
    caches.match(request).then((cached) => {
      if (cached) {
        return cached;
      }
      return fetch(request)
        .then((response) => {
          // On met en cache une copie des réponses valides, qu'elles
          // viennent de l'app (type "basic") ou d'un CDN (type "cors").
          if (response && (response.status === 200 || response.type === "opaque")) {
            const copy = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
          }
          return response;
        })
        .catch(() => {
          // Hors ligne et fichier absent du cache : on renvoie
          // la page d'accueil pour les navigations HTML.
          if (request.mode === "navigate") {
            return caches.match("./index.html");
          }
        });
    })
  );
});
