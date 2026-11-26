/* ============================================================
   config.js — Configuration et connexion à Firebase.
   -> C'est le SEUL fichier à modifier avec TES identifiants.

   Où trouver ces valeurs ?
   1. Va sur https://console.firebase.google.com et crée un projet.
   2. Dans le projet : ⚙ (Paramètres du projet) > onglet « Général ».
   3. Section « Vos applications » > icône Web (</>) > enregistre l'app.
   4. Firebase te donne un objet « firebaseConfig » : copie ses
      valeurs ci-dessous.

   Ces clés sont PUBLIQUES (elles identifient le projet côté web).
   La sécurité est assurée par les « Règles de sécurité » Firestore
   (voir le fichier firestore.rules).
   ============================================================ */

const firebaseConfig = {
  apiKey: "AIzaSyAFvNtmw57XnMas6mdH98e1fXRrkbv5Ru8",
  authDomain: "esame-39403.firebaseapp.com",
  projectId: "esame-39403",
  storageBucket: "esame-39403.firebasestorage.app",
  messagingSenderId: "492050764426",
  appId: "1:492050764426:web:9f6bfd8e843a8b75df9373",
  measurementId: "G-1PM1YECGM0",
};

// Les librairies Firebase (compat) sont chargées via <script> dans
// les pages HTML. Elles exposent un objet global « firebase ».
firebase.initializeApp(firebaseConfig);

// Services utilisés dans toute l'application.
const auth = firebase.auth();   // authentification (comptes, sessions)
const db = firebase.firestore(); // base de données NoSQL (Firestore)

// Persistance hors ligne : Firestore garde une copie locale des
// données déjà chargées. L'application reste consultable sans réseau.
// Mode « un seul onglet » : chaque onglet garde sa propre connexion
// au serveur (évite qu'un vieil onglet ouvert avec une session
// expirée fasse refuser les requêtes des autres onglets).
db.enablePersistence().catch((err) => {
  // Échoue si un autre onglet utilise déjà la persistance ou si le
  // navigateur n'est pas compatible : ce n'est pas bloquant, l'onglet
  // fonctionne alors normalement en ligne.
  console.warn("Persistance hors ligne indisponible :", err.code);
});

// On rend les services accessibles partout via window.
window.auth = auth;
window.db = db;
