/* ============================================================
   auth.js — Logique de la page de connexion / inscription.
   Utilise Firebase Authentication (e-mail + mot de passe).
   Un seul formulaire gère les deux modes :
   - « connexion » : e-mail + mot de passe
   - « inscription » : nom + e-mail + mot de passe
   ============================================================ */

let mode = "login"; // "login" ou "signup"

const form = document.getElementById("auth-form");
const nameGroup = document.getElementById("name-group");
const fullNameInput = document.getElementById("full_name");
const emailInput = document.getElementById("email");
const passwordInput = document.getElementById("password");
const submitBtn = document.getElementById("submit-btn");
const switchBtn = document.getElementById("switch-btn");
const switchText = document.getElementById("switch-text");

// Pendant une inscription, on ne redirige pas tout de suite : il faut
// d'abord finir d'enregistrer le nom et le profil (sinon la page change
// avant la fin et ces écritures sont perdues).
let signingUp = false;

// Si l'utilisateur est (déjà) connecté, on l'envoie au tableau de bord.
window.auth.onAuthStateChanged((user) => {
  if (user && !signingUp) window.location.replace("./dashboard.html");
});

// --- Basculer entre connexion et inscription ---
switchBtn.addEventListener("click", () => {
  mode = mode === "login" ? "signup" : "login";
  hideMessage();

  if (mode === "signup") {
    nameGroup.classList.remove("hidden");
    fullNameInput.required = true;
    submitBtn.textContent = "Créer mon compte";
    switchText.textContent = "Déjà un compte ?";
    switchBtn.textContent = "Se connecter";
    passwordInput.autocomplete = "new-password";
  } else {
    nameGroup.classList.add("hidden");
    fullNameInput.required = false;
    submitBtn.textContent = "Se connecter";
    switchText.textContent = "Pas encore de compte ?";
    switchBtn.textContent = "Créer un compte";
    passwordInput.autocomplete = "current-password";
  }
});

// --- Soumission du formulaire ---
form.addEventListener("submit", async (event) => {
  event.preventDefault();
  hideMessage();

  const email = emailInput.value.trim();
  const password = passwordInput.value;
  const fullName = fullNameInput.value.trim();

  submitBtn.disabled = true;
  submitBtn.textContent = mode === "signup" ? "Création…" : "Connexion…";

  try {
    if (mode === "signup") {
      await signUp(email, password, fullName);
    } else {
      await signIn(email, password);
    }
    // En cas de succès, la redirection est gérée par onAuthStateChanged.
  } catch (err) {
    signingUp = false;
    showMessage(traduireErreur(err.code || err.message), "error");
    submitBtn.disabled = false;
    submitBtn.textContent = mode === "signup" ? "Créer mon compte" : "Se connecter";
  }
});

// --- Inscription ---
async function signUp(email, password, fullName) {
  signingUp = true; // bloque la redirection automatique

  // 1) Création du compte dans Firebase Authentication.
  const cred = await window.auth.createUserWithEmailAndPassword(email, password);

  // 2) On enregistre le nom dans le profil Firebase...
  await cred.user.updateProfile({ displayName: fullName });

  // 3) ...et dans un document « profil » Firestore (collection users).
  await window.db.collection("users").doc(cred.user.uid).set({
    full_name: fullName,
    email: email.toLowerCase(),
    created_at: firebase.firestore.FieldValue.serverTimestamp(),
  });

  // 4) Tout est enregistré : on peut aller au tableau de bord.
  window.location.replace("./dashboard.html");
}

// --- Connexion ---
async function signIn(email, password) {
  await window.auth.signInWithEmailAndPassword(email, password);
}

// --- Traduction des codes d'erreur Firebase en français ---
function traduireErreur(code) {
  const c = (code || "").toLowerCase();
  if (c.includes("auth/invalid-credential") || c.includes("wrong-password") ||
      c.includes("user-not-found"))
    return "E-mail ou mot de passe incorrect.";
  if (c.includes("email-already-in-use")) return "Cet e-mail est déjà utilisé.";
  if (c.includes("weak-password")) return "Mot de passe trop court (6 caractères minimum).";
  if (c.includes("invalid-email")) return "Adresse e-mail invalide.";
  if (c.includes("network")) return "Connexion impossible. Vérifie ta configuration Firebase (config.js).";
  if (c.includes("api-key") || c.includes("configuration"))
    return "Configuration Firebase manquante ou invalide (config.js).";
  return "Une erreur est survenue : " + code;
}
