/* ============================================================
   install.js — Proposition d'installation de la PWA.

   Une bannière APPARAÎT toute seule (glisse depuis le bas),
   propose d'installer l'application, puis DISPARAÎT toute seule
   après quelques secondes (une barre montre le temps restant).

   - Android / ordinateur (Chrome, Edge) : le navigateur envoie
     l'événement « beforeinstallprompt » quand l'app est installable.
     On le garde de côté, et le bouton « Installer » ouvre la vraie
     fenêtre d'installation du navigateur.
   - iPhone / iPad (Safari) : cet événement n'existe pas. On affiche
     simplement la marche à suivre (Partager > Sur l'écran d'accueil).

   Pour ne pas déranger :
   - une seule fois par visite (sessionStorage) ;
   - si on ferme avec la croix : pas avant 3 jours (localStorage) ;
   - jamais si l'application est déjà installée.
   ============================================================ */

(function () {
  const DELAI_MS = 1500;     // attente avant l'apparition
  const VISIBLE_MS = 12000;  // durée d'affichage avant disparition
  const PAUSE_JOURS = 3;     // après un refus

  let deferredPrompt = null; // événement gardé pour lancer l'installation
  let banniere = null;
  let minuteur = null;
  let debut = 0;
  let reste = VISIBLE_MS;

  // --- Conditions d'affichage ---
  const dejaInstallee = () =>
    window.matchMedia("(display-mode: standalone)").matches || window.navigator.standalone === true;

  const refusRecent = () => {
    const t = Number(localStorage.getItem("bs_install_refus") || 0);
    return Date.now() - t < PAUSE_JOURS * 24 * 3600 * 1000;
  };

  const dejaVueCetteVisite = () => sessionStorage.getItem("bs_install_vue") === "1";

  const peutAfficher = () => !dejaInstallee() && !refusRecent() && !dejaVueCetteVisite();

  const estIOS = () =>
    /iphone|ipad|ipod/i.test(navigator.userAgent) ||
    (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1); // iPad récent

  // --- Android / ordinateur : l'application est installable ---
  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault();  // on empêche la mini-bannière par défaut du navigateur...
    deferredPrompt = e;  // ...et on garde l'événement pour notre bouton
    if (peutAfficher()) setTimeout(() => afficher("android"), DELAI_MS);
  });

  // L'installation a réussi.
  window.addEventListener("appinstalled", () => {
    deferredPrompt = null;
    cacher();
    if (typeof toast === "function") toast("BudgetShare est installée", "success");
  });

  // --- iPhone / iPad : on explique la marche à suivre ---
  window.addEventListener("load", () => {
    if (estIOS() && peutAfficher()) setTimeout(() => afficher("ios"), DELAI_MS);
  });

  /* ---------- Affichage de la bannière ---------- */

  function afficher(mode) {
    if (banniere) return;
    sessionStorage.setItem("bs_install_vue", "1");

    const texte =
      mode === "ios"
        ? 'Touchez <b>Partager</b> <i data-lucide="share"></i> puis <b>« Sur l\'écran d\'accueil »</b>.'
        : "Ajoutez-la à votre écran d'accueil, sans passer par un store.";

    banniere = document.createElement("div");
    banniere.className = "install-banner";
    banniere.setAttribute("role", "dialog");
    banniere.setAttribute("aria-label", "Installer BudgetShare");
    banniere.innerHTML = `
      <img class="install-icon" src="./icons/icon-192.png" alt="" />
      <div class="install-text">
        <strong>Installer BudgetShare</strong>
        <span>${texte}</span>
      </div>
      ${mode === "ios" ? "" : '<button type="button" class="btn btn-sm btn-dark install-ok"><i data-lucide="download"></i>Installer</button>'}
      <button type="button" class="install-close" aria-label="Fermer"><i data-lucide="x"></i></button>
      <span class="install-timer" style="animation-duration:${VISIBLE_MS}ms"></span>
    `;
    document.body.appendChild(banniere);
    if (typeof refreshIcons === "function") refreshIcons();

    // Apparition animée (on attend que le navigateur ait dessiné la bannière).
    requestAnimationFrame(() => requestAnimationFrame(() => banniere && banniere.classList.add("show")));

    // Croix : on ne la remontre pas avant quelques jours.
    banniere.querySelector(".install-close").addEventListener("click", () => {
      localStorage.setItem("bs_install_refus", String(Date.now()));
      cacher();
    });

    const ok = banniere.querySelector(".install-ok");
    if (ok) ok.addEventListener("click", installer);

    // Disparition automatique, en pause tant que la souris est dessus.
    reste = VISIBLE_MS;
    demarrerMinuteur();
    banniere.addEventListener("mouseenter", mettreEnPause);
    banniere.addEventListener("mouseleave", demarrerMinuteur);
  }

  function demarrerMinuteur() {
    if (!banniere) return;
    banniere.classList.remove("paused");
    debut = Date.now();
    clearTimeout(minuteur);
    minuteur = setTimeout(cacher, reste);
  }

  function mettreEnPause() {
    if (!banniere) return;
    clearTimeout(minuteur);
    reste -= Date.now() - debut;
    banniere.classList.add("paused"); // fige aussi la barre de temps (CSS)
  }

  // Disparition animée puis suppression de la bannière.
  function cacher() {
    if (!banniere) return;
    clearTimeout(minuteur);
    const b = banniere;
    banniere = null;
    b.classList.remove("show");
    setTimeout(() => b.remove(), 450);
  }

  // Ouvre la vraie fenêtre d'installation du navigateur.
  async function installer() {
    if (!deferredPrompt) return;
    cacher();
    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice; // "accepted" ou "dismissed"
    if (outcome === "dismissed") localStorage.setItem("bs_install_refus", String(Date.now()));
    deferredPrompt = null; // l'événement ne peut servir qu'une fois
  }

  // Pour la démonstration : forcer l'affichage depuis la console
  // (ex. showInstallBanner("ios")), même si elle a déjà été vue.
  window.showInstallBanner = (mode) => afficher(mode || (estIOS() ? "ios" : "android"));
})();
