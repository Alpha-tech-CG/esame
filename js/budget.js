/* ============================================================
   budget.js — Accès au budget mensuel (Firestore) + calculs.
   Règle métier : budget restant = budget - total des dépenses.

   Astuce : on donne à chaque budget un identifiant de document
   déterministe « uid_année_mois » (ex. "abc123_2026_11"). Ainsi,
   lire ou enregistrer le budget d'un mois est direct, sans requête
   ni index, et il ne peut pas y avoir de doublon pour un mois.
   ============================================================ */

// Construit l'identifiant du document budget pour un mois donné.
function budgetDocId(uid, month, year) {
  return `${uid}_${year}_${month}`;
}

// Récupère le budget d'un mois/année (ou null s'il n'existe pas).
async function getBudget(month, year) {
  const uid = currentUser().uid;
  const doc = await window.db
    .collection("budgets")
    .doc(budgetDocId(uid, month, year))
    .get();
  return doc.exists ? doc.data() : null; // { amount, budget_month, budget_year } ou null
}

// Crée ou met à jour le budget d'un mois (set = upsert).
async function setBudget(amount, month, year) {
  const uid = currentUser().uid;
  const data = {
    userId: uid,
    amount: Number(amount),
    budget_month: month,
    budget_year: year,
  };
  await window.db
    .collection("budgets")
    .doc(budgetDocId(uid, month, year))
    .set(data, { merge: true });
  return data;
}

/* ---------- Budget par catégorie (fonctionnalité avancée) ----------
   Un budget mensuel « récurrent » par catégorie : il s'applique à
   chaque mois. Identifiant déterministe « uid_idCategorie ».
   Document : { userId, category_id, amount }                        */

function categoryBudgetDocId(uid, categoryId) {
  return `${uid}_${categoryId}`;
}

// Tous les budgets par catégorie de l'utilisateur -> { idCategorie: montant }
async function getCategoryBudgets() {
  const uid = currentUser().uid;
  const snap = await window.db
    .collection("category_budgets")
    .where("userId", "==", uid)
    .get();
  const map = {};
  snap.docs.forEach((doc) => {
    const d = doc.data();
    map[d.category_id] = Number(d.amount) || 0;
  });
  return map;
}

// Crée / modifie le budget d'une catégorie (montant 0 ou vide = suppression).
async function setCategoryBudget(categoryId, amount) {
  const uid = currentUser().uid;
  const ref = window.db
    .collection("category_budgets")
    .doc(categoryBudgetDocId(uid, categoryId));

  if (!amount || Number(amount) <= 0) {
    await ref.delete();
    return null;
  }
  const data = { userId: uid, category_id: categoryId, amount: Number(amount) };
  await ref.set(data, { merge: true });
  return data;
}

// Additionne les montants d'une liste de dépenses.
function sumExpenses(expenses) {
  return expenses.reduce((total, e) => total + Number(e.amount), 0);
}

// Calcule le résumé du budget pour l'affichage.
// Renvoie { budget, depense, restant, pourcentage }.
function computeBudgetSummary(budgetAmount, expenses) {
  const budget = Number(budgetAmount) || 0;
  const depense = sumExpenses(expenses);
  const restant = budget - depense;
  const pourcentage = budget > 0 ? Math.min((depense / budget) * 100, 100) : 0;
  return { budget, depense, restant, pourcentage };
}
