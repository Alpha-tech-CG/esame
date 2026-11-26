/* ============================================================
   utils.js
   Fonctions utilitaires réutilisées dans toute l'application :
   formatage des montants/dates, messages, protection des pages,
   gestion du mode hors ligne, etc.
   ============================================================ */

/* ---------- Formatage ---------- */

// Transforme un nombre en montant lisible : 842.5 -> "842,50 €"
function formatMoney(value) {
  const n = Number(value) || 0;
  return n.toLocaleString("fr-FR", {
    style: "currency",
    currency: "EUR",
    minimumFractionDigits: 2,
  });
}

// Transforme une date ISO (2026-11-22) en "22/11/2026"
function formatDate(isoDate) {
  if (!isoDate) return "";
  const d = new Date(isoDate);
  return d.toLocaleDateString("fr-FR");
}

// Transforme une date en "AAAA-MM-JJ" selon l'heure LOCALE.
// (toISOString() utilise l'heure UTC : juste après minuit en France,
//  il renverrait encore la date de la veille.)
function toLocalISO(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

// Renvoie la date du jour au format "AAAA-MM-JJ" (pour les <input type=date>)
function today() {
  return toLocalISO(new Date());
}

// Renvoie le mois (1-12) et l'année en cours.
function currentMonthYear() {
  const d = new Date();
  return { month: d.getMonth() + 1, year: d.getFullYear() };
}

// Nom du mois en français à partir de son numéro (1 = Janvier).
function monthName(month) {
  const noms = [
    "Janvier", "Février", "Mars", "Avril", "Mai", "Juin",
    "Juillet", "Août", "Septembre", "Octobre", "Novembre", "Décembre",
  ];
  return noms[month - 1] || "";
}

/* ---------- Sécurité XSS ---------- */

// Échappe le texte saisi par l'utilisateur avant de l'insérer
// dans le HTML (évite l'injection de code).
function escapeHtml(text) {
  const div = document.createElement("div");
  div.textContent = text == null ? "" : String(text);
  return div.innerHTML;
}

/* ---------- Messages et notifications ---------- */

// Affiche un message dans un conteneur (#message par défaut).
// type = "error" | "success" | "info"
function showMessage(text, type = "info", selector = "#message") {
  const box = document.querySelector(selector);
  if (!box) return;
  box.textContent = text;
  box.className = "message " + type;
  box.classList.remove("hidden");
}

function hideMessage(selector = "#message") {
  const box = document.querySelector(selector);
  if (box) box.classList.add("hidden");
}

// Affiche une petite notification flottante (toast) en bas.
function toast(text, type = "") {
  let container = document.querySelector(".toast-container");
  if (!container) {
    container = document.createElement("div");
    container.className = "toast-container";
    document.body.appendChild(container);
  }
  const el = document.createElement("div");
  el.className = "toast " + type;
  el.textContent = text;
  container.appendChild(el);
  // Disparaît au bout de 3 secondes.
  setTimeout(() => el.remove(), 3000);
}

/* ---------- Protection des pages ---------- */

// À appeler en haut des pages privées (dashboard, dépenses, stats).
// Redirige vers login.html si l'utilisateur n'est pas connecté.
// Renvoie l'utilisateur connecté (ou null).
// On attend que Firebase ait restauré la session (c'est asynchrone).
function requireAuth() {
  return new Promise((resolve) => {
    const unsub = window.auth.onAuthStateChanged((user) => {
      unsub(); // on n'écoute qu'une fois
      if (!user) {
        window.location.href = "./login.html";
        resolve(null);
      } else {
        ensureUserLookup(user); // pas besoin d'attendre
        renderSidebarUser(user);
        resolve(user);
      }
    });
  });
}

// Enregistre l'utilisateur dans l'annuaire « userLookup » (id = e-mail),
// pour que les autres puissent l'ajouter à un groupe avec son e-mail.
// Fait une seule fois par navigateur (repère dans localStorage).
async function ensureUserLookup(user) {
  if (!user || !user.email) return;
  const flag = "bs_lookup_" + user.uid;
  if (localStorage.getItem(flag)) return;
  try {
    const email = user.email.toLowerCase();
    await window.db.collection("userLookup").doc(email).set({
      uid: user.uid,
      name: user.displayName || user.email,
      email,
    });
    localStorage.setItem(flag, "1");
  } catch (err) {
    // Pas bloquant (ex. règles pas encore publiées) : on réessaiera.
    console.warn("Annuaire non mis à jour :", err.code || err.message);
  }
}

// Renvoie l'utilisateur actuellement connecté (ou null).
function currentUser() {
  return window.auth.currentUser;
}

// Déconnexion : termine la session puis renvoie vers la connexion.
async function logout() {
  await window.auth.signOut();
  window.location.href = "./login.html";
}

// Tout élément portant l'attribut data-logout (bouton de la barre
// latérale, bouton du bandeau mobile...) déconnecte l'utilisateur.
// Une seule règle pour toutes les pages (délégation d'événement).
document.addEventListener("click", (e) => {
  const bouton = e.target.closest("[data-logout]");
  if (!bouton) return;
  e.preventDefault();
  logout();
});

// Affiche le nom et l'initiale de l'utilisateur en bas de la barre latérale.
function renderSidebarUser(user) {
  const nameEl = document.getElementById("user-name");
  const avatarEl = document.getElementById("user-avatar");
  const name = user.displayName || user.email || "";
  if (nameEl) nameEl.textContent = name;
  if (avatarEl) avatarEl.textContent = (name.trim()[0] || "?").toUpperCase();
}

/* ---------- Mode hors ligne ---------- */

// Affiche/masque une bannière quand la connexion est perdue.
function setupOfflineBanner() {
  function update() {
    let banner = document.querySelector(".offline-banner");
    if (!navigator.onLine) {
      if (!banner) {
        banner = document.createElement("div");
        banner.className = "offline-banner";
        banner.innerHTML =
          '<i data-lucide="wifi-off"></i> Mode hors ligne — données déjà chargées';
        document.body.prepend(banner);
        refreshIcons();
      }
    } else if (banner) {
      banner.remove();
    }
  }
  window.addEventListener("online", update);
  window.addEventListener("offline", update);
  update();
}

/* ---------- Cache local (mode hors ligne) ---------- */

// Sauvegarde des données dans le navigateur pour les relire hors ligne.
function cacheSet(key, value) {
  try {
    localStorage.setItem("bs_" + key, JSON.stringify(value));
  } catch (e) {
    /* stockage plein ou indisponible : on ignore */
  }
}

function cacheGet(key) {
  try {
    const raw = localStorage.getItem("bs_" + key);
    return raw ? JSON.parse(raw) : null;
  } catch (e) {
    return null;
  }
}

/* ---------- Service worker ---------- */

// Enregistre le service worker (active la PWA + le hors ligne).
function registerServiceWorker() {
  if ("serviceWorker" in navigator) {
    window.addEventListener("load", () => {
      navigator.serviceWorker
        .register("./service-worker.js")
        .catch((err) => console.warn("Service worker non enregistré :", err));
    });
  }
}

/* ---------- Icônes Lucide ---------- */

// Lucide remplace chaque <i data-lucide="nom"> par l'icône SVG
// correspondante. Il faut l'appeler au chargement de la page ET
// après chaque contenu ajouté dynamiquement (liste de dépenses...).
function refreshIcons() {
  if (window.lucide) window.lucide.createIcons();
}

// Premier remplacement des icônes quand la page est prête.
document.addEventListener("DOMContentLoaded", refreshIcons);

/* ---------- Surlignage du lien de navigation actif ---------- */

// Ajoute la classe "active" au lien correspondant à la page courante.
function highlightNav() {
  const page = window.location.pathname.split("/").pop() || "index.html";
  document.querySelectorAll(".nav a, .side-nav a, .tabbar a").forEach((a) => {
    const href = a.getAttribute("href");
    if (href && href.endsWith(page)) a.classList.add("active");
  });
}
