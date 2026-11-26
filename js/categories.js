/* ============================================================
   categories.js — Accès aux catégories dans Firestore.
   Collection « categories ». Chaque document contient :
   { userId, name, color, created_at }.
   La sécurité (chacun ne voit que ses catégories) est assurée
   par les règles Firestore (firestore.rules).
   ============================================================ */

// Récupère toutes les catégories de l'utilisateur connecté,
// triées par nom (le tri est fait côté client pour éviter la
// création d'un index composite dans Firestore).
async function getCategories() {
  const uid = currentUser().uid;
  const snap = await window.db
    .collection("categories")
    .where("userId", "==", uid)
    .get();

  // On transforme les documents en objets { id, ...données }.
  const cats = snap.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
  cats.sort((a, b) => a.name.localeCompare(b.name));
  return cats;
}

// Ajoute une nouvelle catégorie. Renvoie la catégorie créée (avec son id).
async function addCategory(name, color) {
  const uid = currentUser().uid;
  const ref = await window.db.collection("categories").add({
    userId: uid,
    name: name.trim(),
    color: color || "#4686fe",
    created_at: firebase.firestore.FieldValue.serverTimestamp(),
  });
  return { id: ref.id, name: name.trim(), color: color || "#4686fe" };
}

// Choisit une couleur dans une petite palette harmonisée avec le design,
// pour que chaque nouvelle catégorie ait sa propre teinte.
function randomCategoryColor() {
  const palette = ["#4686fe", "#3f9a24", "#f5a524", "#8b5cf6", "#e5484d", "#14b8a6", "#ec4899"];
  return palette[Math.floor(Math.random() * palette.length)];
}

// Supprime une catégorie.
async function deleteCategory(id) {
  await window.db.collection("categories").doc(id).delete();
}

// Remplit une liste déroulante <select> avec les catégories.
function fillCategorySelect(selectEl, categories, selectedId) {
  selectEl.innerHTML = '<option value="">— Aucune —</option>';
  categories.forEach((cat) => {
    const opt = document.createElement("option");
    opt.value = cat.id;
    opt.textContent = cat.name;
    if (cat.id === selectedId) opt.selected = true;
    selectEl.appendChild(opt);
  });
}
