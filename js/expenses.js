/* ============================================================
   expenses.js — Cœur de l'application (version Firestore).
   Deux parties :
   A) Accès aux données (getExpenses, addExpense, updateExpense,
      deleteExpense) — réutilisées par le tableau de bord et les stats.
   B) Interface de la page expenses.html (formulaire + liste +
      filtres). Cette partie ne s'exécute QUE sur la page Dépenses.
   ============================================================ */

/* ========== A) ACCÈS AUX DONNÉES ========== */

// Récupère les dépenses de l'utilisateur, avec leur catégorie
// (résolue à partir de la liste des catégories) et leurs tags.
// filters = { from, to, categoryId, tagName } (tous optionnels).
//
// Note NoSQL : Firestore ne fait pas de « jointure » comme en SQL.
// On charge donc les dépenses ET les catégories, puis on relie les
// deux côté application grâce à l'identifiant category_id.
async function getExpenses(filters = {}) {
  const uid = currentUser().uid;

  const [snap, categories] = await Promise.all([
    window.db.collection("expenses").where("userId", "==", uid).get(),
    getCategories(),
  ]);

  // Dictionnaire id -> catégorie, pour relier chaque dépense.
  const catMap = {};
  categories.forEach((c) => (catMap[c.id] = c));

  // Conversion des documents Firestore en objets simples.
  let list = snap.docs.map((doc) => {
    const d = doc.data();
    const cat = d.category_id ? catMap[d.category_id] : null;
    return {
      id: doc.id,
      amount: Number(d.amount) || 0,
      description: d.description || "",
      expense_date: d.expense_date,
      category_id: d.category_id || null,
      tags: d.tags || [],
      category: cat ? { id: cat.id, name: cat.name, color: cat.color } : null,
      created_at: d.created_at || null,
    };
  });

  // Tri par date décroissante (le plus récent en premier).
  list.sort((a, b) => {
    if (a.expense_date !== b.expense_date) {
      return a.expense_date < b.expense_date ? 1 : -1;
    }
    const ta = a.created_at?.seconds || 0;
    const tb = b.created_at?.seconds || 0;
    return tb - ta;
  });

  // Filtres appliqués côté client.
  if (filters.from) list = list.filter((e) => e.expense_date >= filters.from);
  if (filters.to) list = list.filter((e) => e.expense_date <= filters.to);
  if (filters.categoryId) list = list.filter((e) => e.category_id === filters.categoryId);
  if (filters.tagName) list = filterByTag(list, filters.tagName);

  return list;
}

// Ajoute une dépense (les tags sont stockés dans le document même).
async function addExpense({ amount, description, expense_date, category_id, tagNames }) {
  const uid = currentUser().uid;
  await window.db.collection("expenses").add({
    userId: uid,
    amount: Number(amount),
    description: description || null,
    expense_date: expense_date || today(),
    category_id: category_id || null,
    tags: parseTags(tagNames),
    created_at: firebase.firestore.FieldValue.serverTimestamp(),
  });
}

// Modifie une dépense existante.
async function updateExpense(id, { amount, description, expense_date, category_id, tagNames }) {
  await window.db.collection("expenses").doc(id).update({
    amount: Number(amount),
    description: description || null,
    expense_date: expense_date || today(),
    category_id: category_id || null,
    tags: parseTags(tagNames),
  });
}

// Supprime une dépense.
async function deleteExpense(id) {
  await window.db.collection("expenses").doc(id).delete();
}

/* ========== B) INTERFACE DE LA PAGE DÉPENSES ========== */

let EXP_categories = [];
let EXP_editingId = null; // id de la dépense en cours de modification
let EXP_lastList = [];    // dernière liste affichée (pour l'export CSV)

document.addEventListener("DOMContentLoaded", () => {
  if (document.getElementById("expense-form")) {
    initExpensesPage();
  }
});

async function initExpensesPage() {
  const user = await requireAuth();
  if (!user) return;

  setupOfflineBanner();
  highlightNav();

  const form = document.getElementById("expense-form");
  const categorySelect = document.getElementById("exp-category");
  const filterCategory = document.getElementById("filter-category");
  const cancelBtn = document.getElementById("cancel-edit");

  document.getElementById("exp-date").value = today();

  // Si les catégories ne se chargent pas (réseau, règles Firestore...),
  // on prévient l'utilisateur mais on tente quand même la liste.
  try {
    await refreshCategories(categorySelect, filterCategory);
  } catch (err) {
    toast("Catégories indisponibles : " + err.message, "danger");
  }
  await refreshExpenseList();

  // --- Soumission du formulaire (ajout ou modification) ---
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const payload = {
      amount: document.getElementById("exp-amount").value,
      description: document.getElementById("exp-desc").value.trim(),
      expense_date: document.getElementById("exp-date").value,
      category_id: categorySelect.value || null,
      tagNames: document.getElementById("exp-tags").value, // chaîne "a, b"
    };

    if (!payload.amount || Number(payload.amount) < 0) {
      toast("Montant invalide", "danger");
      return;
    }

    try {
      if (EXP_editingId) {
        await updateExpense(EXP_editingId, payload);
        toast("Dépense modifiée", "success");
      } else {
        await addExpense(payload);
        toast("Dépense ajoutée", "success");
      }
      resetForm();
      await refreshExpenseList();
    } catch (err) {
      toast("Erreur : " + err.message, "danger");
    }
  });

  cancelBtn.addEventListener("click", resetForm);

  // --- Export CSV de la liste filtrée (voir export.js) ---
  document.getElementById("export-csv").addEventListener("click", () => {
    exportExpensesCSV(EXP_lastList);
  });
  document.getElementById("apply-filters").addEventListener("click", refreshExpenseList);
  document.getElementById("clear-filters").addEventListener("click", async () => {
    resetFilters();
    await refreshExpenseList();
  });

  // --- Ajout rapide d'une catégorie ---
  document.getElementById("add-category").addEventListener("click", async () => {
    const name = prompt("Nom de la nouvelle catégorie :");
    if (!name) return;
    try {
      const cat = await addCategory(name, randomCategoryColor());
      await refreshCategories(categorySelect, filterCategory);
      categorySelect.value = cat.id;
      toast("Catégorie créée", "success");
    } catch (err) {
      toast("Erreur : " + err.message, "danger");
    }
  });
}

async function refreshCategories(categorySelect, filterCategory) {
  EXP_categories = await getCategories();
  fillCategorySelect(categorySelect, EXP_categories, categorySelect.value);
  filterCategory.innerHTML = '<option value="">Toutes catégories</option>';
  EXP_categories.forEach((cat) => {
    const opt = document.createElement("option");
    opt.value = cat.id;
    opt.textContent = cat.name;
    filterCategory.appendChild(opt);
  });
}

async function refreshExpenseList() {
  const listEl = document.getElementById("expense-list");
  listEl.innerHTML = '<div class="empty">Chargement…</div>';
  try {
    const filters = readFilters();
    const expenses = await getExpenses(filters);
    EXP_lastList = expenses;
    renderExpenses(expenses, listEl);

    const total = sumExpenses(expenses);
    document.getElementById("list-total").textContent =
      expenses.length + " dépense(s) — total " + formatMoney(total);
  } catch (err) {
    listEl.innerHTML =
      '<div class="empty">Impossible de charger les dépenses.<br>' +
      escapeHtml(err.message) + "</div>";
  }
}

function renderExpenses(expenses, listEl) {
  if (expenses.length === 0) {
    listEl.innerHTML =
      '<div class="empty"><i data-lucide="receipt"></i>Aucune dépense pour ces filtres.</div>';
    refreshIcons();
    return;
  }

  listEl.innerHTML = "";
  expenses.forEach((e) => {
    const color = e.category?.color || "#8a8a8a";
    const catName = e.category?.name || "Sans catégorie";
    const tags = e.tags || [];

    const item = document.createElement("div");
    item.className = "expense-item";
    // La pastille d'icône prend la couleur de la catégorie (variable --c).
    item.innerHTML = `
      <span class="expense-icon" style="--c:${escapeHtml(color)}">
        <i data-lucide="receipt"></i>
      </span>
      <div class="expense-main">
        <div class="expense-desc">${escapeHtml(e.description || "(sans description)")}</div>
        <div class="expense-meta">
          <span>${formatDate(e.expense_date)}</span>
          <span class="badge">${escapeHtml(catName)}</span>
          ${tags.map((t) => `<span class="badge tag">#${escapeHtml(t)}</span>`).join("")}
        </div>
      </div>
      <div class="expense-amount">− ${formatMoney(e.amount)}</div>
      <div class="expense-actions">
        <button class="btn btn-icon" data-edit="${e.id}" title="Modifier" aria-label="Modifier">
          <i data-lucide="pencil"></i>
        </button>
        <button class="btn btn-icon btn-danger" data-del="${e.id}" title="Supprimer" aria-label="Supprimer">
          <i data-lucide="trash-2"></i>
        </button>
      </div>
    `;
    item.querySelector("[data-edit]").addEventListener("click", () => startEdit(e));
    item.querySelector("[data-del]").addEventListener("click", () => confirmDelete(e));
    listEl.appendChild(item);
  });

  // Transforme les <i data-lucide> ajoutés en vraies icônes SVG.
  refreshIcons();
}

function startEdit(expense) {
  EXP_editingId = expense.id;
  document.getElementById("exp-amount").value = expense.amount;
  document.getElementById("exp-desc").value = expense.description || "";
  document.getElementById("exp-date").value = expense.expense_date;
  document.getElementById("exp-category").value = expense.category_id || "";
  document.getElementById("exp-tags").value = (expense.tags || []).join(", ");

  document.getElementById("form-title").textContent = "Modifier la dépense";
  document.getElementById("submit-expense").textContent = "Enregistrer";
  document.getElementById("cancel-edit").classList.remove("hidden");
  window.scrollTo({ top: 0, behavior: "smooth" });
}

async function confirmDelete(expense) {
  if (!confirm(`Supprimer « ${expense.description || "cette dépense"} » ?`)) return;
  try {
    await deleteExpense(expense.id);
    toast("Dépense supprimée", "success");
    if (EXP_editingId === expense.id) resetForm();
    await refreshExpenseList();
  } catch (err) {
    toast("Erreur : " + err.message, "danger");
  }
}

function resetForm() {
  EXP_editingId = null;
  document.getElementById("expense-form").reset();
  document.getElementById("exp-date").value = today();
  document.getElementById("form-title").textContent = "Nouvelle dépense";
  document.getElementById("submit-expense").textContent = "Ajouter";
  document.getElementById("cancel-edit").classList.add("hidden");
}
