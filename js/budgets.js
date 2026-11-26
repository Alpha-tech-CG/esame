/* ============================================================
   budgets.js — Page « Budgets » (fonctionnalité avancée).
   - Budget global du mois
   - Budget mensuel par catégorie, avec barre de progression
   - Liste des alertes + activation des notifications du navigateur
   ============================================================ */

const BUD = {
  budget: null,        // budget global du mois
  expenses: [],        // dépenses du mois
  categories: [],      // catégories de l'utilisateur
  catBudgets: {},      // { idCategorie: montant }
};

(async function initBudgetsPage() {
  const user = await requireAuth();
  if (!user) return;

  registerServiceWorker();
  setupOfflineBanner();
  highlightNav();

  const { month, year } = currentMonthYear();
  document.getElementById("month-label").textContent = monthName(month) + " " + year;

  // Enregistrer le budget global du mois.
  document.getElementById("month-budget-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    try {
      await setBudget(document.getElementById("month-budget").value, month, year);
      toast("Budget du mois enregistré", "success");
      await loadBudgetsPage();
    } catch (err) {
      toast("Erreur : " + err.message, "danger");
    }
  });

  // Bouton « Activer les notifications ».
  document.getElementById("notif-btn").addEventListener("click", async () => {
    const state = await requestNotifications();
    renderNotifState();
    if (state === "granted") {
      // Petite notification de confirmation.
      try {
        new Notification("BudgetShare", {
          body: "Notifications activées : vous serez prévenu en cas de dépassement.",
          icon: "./icons/icon-192.png",
        });
      } catch (err) { /* ignoré */ }
      computeAlerts(BUD.budget?.amount, BUD.expenses, BUD.catBudgets, BUD.categories)
        .forEach(sendSystemNotification);
    }
  });

  renderNotifState();
  await loadBudgetsPage();
})();

/* ========== Chargement ========== */

async function loadBudgetsPage() {
  const { month, year } = currentMonthYear();
  const mm = String(month).padStart(2, "0");
  try {
    const [budget, expenses, categories] = await Promise.all([
      getBudget(month, year),
      getExpenses({ from: `${year}-${mm}-01`, to: `${year}-${mm}-31` }),
      getCategories(),
    ]);

    // Les budgets par catégorie sont chargés à part : s'ils sont
    // indisponibles, le reste de la page s'affiche quand même.
    let catBudgets = {};
    BUD.catError = null;
    try {
      catBudgets = await getCategoryBudgets();
    } catch (err) {
      BUD.catError = err;
    }
    Object.assign(BUD, { budget, expenses, categories, catBudgets });

    renderMonthBudget();
    renderCategoryBudgets();
    renderAlertsList();
  } catch (err) {
    document.getElementById("cat-budget-list").innerHTML =
      '<div class="empty">Erreur : ' + escapeHtml(err.message) + "</div>";
  }
}

/* ========== Budget du mois ========== */

function renderMonthBudget() {
  const s = computeBudgetSummary(BUD.budget?.amount, BUD.expenses);
  if (BUD.budget) document.getElementById("month-budget").value = BUD.budget.amount;
  setProgress(
    document.getElementById("month-bar"),
    document.getElementById("month-text"),
    s.depense,
    s.budget
  );
}

// Met à jour une barre de progression + son texte (dépensé / limite).
function setProgress(barEl, textEl, spent, limit) {
  const pct = limit > 0 ? (spent / limit) * 100 : 0;
  barEl.style.width = Math.min(pct, 100) + "%";
  barEl.className = "progress-bar" + (pct >= 100 ? " danger" : pct >= 80 ? " warning" : "");
  textEl.textContent =
    limit > 0
      ? `${formatMoney(spent)} / ${formatMoney(limit)} — ${Math.round(pct)} %`
      : `${formatMoney(spent)} dépensés — pas de limite`;
}

/* ========== Budget par catégorie ========== */

function renderCategoryBudgets() {
  const box = document.getElementById("cat-budget-list");

  if (BUD.catError) {
    box.innerHTML = `
      <div class="message error">
        <i data-lucide="triangle-alert"></i>
        Budgets par catégorie indisponibles (${escapeHtml(BUD.catError.code || BUD.catError.message)}).
        Vérifiez que les règles de firestore.rules sont bien publiées dans la console Firebase.
      </div>`;
    refreshIcons();
    return;
  }

  if (BUD.categories.length === 0) {
    box.innerHTML = `
      <div class="empty">
        <i data-lucide="tag"></i>
        Aucune catégorie pour l'instant.
        <a class="btn btn-sm btn-dark" href="./expenses.html"><i data-lucide="plus"></i>Créer une catégorie</a>
      </div>`;
    refreshIcons();
    return;
  }

  box.innerHTML = "";
  BUD.categories.forEach((cat) => {
    const spent = sumExpenses(BUD.expenses.filter((e) => e.category_id === cat.id));
    const limit = BUD.catBudgets[cat.id] || 0;

    const row = document.createElement("form");
    row.className = "budget-row";
    row.innerHTML = `
      <div class="budget-row-head">
        <span class="expense-icon" style="--c:${escapeHtml(cat.color || "#8a8a8a")}"><i data-lucide="tag"></i></span>
        <div class="budget-row-name">${escapeHtml(cat.name)}</div>
        <input class="input budget-input" type="number" step="0.01" min="0"
               placeholder="Aucune limite" value="${limit || ""}"
               aria-label="Budget mensuel ${escapeHtml(cat.name)}" />
        <button type="submit" class="btn btn-icon btn-dark" title="Enregistrer" aria-label="Enregistrer">
          <i data-lucide="check"></i>
        </button>
        <button type="button" class="btn btn-icon btn-danger" data-delete
                title="Supprimer la catégorie" aria-label="Supprimer la catégorie ${escapeHtml(cat.name)}">
          <i data-lucide="trash-2"></i>
        </button>
      </div>
      <div class="progress"><div class="progress-bar"></div></div>
      <div class="progress-text"></div>
    `;
    setProgress(row.querySelector(".progress-bar"), row.querySelector(".progress-text"), spent, limit);

    // Bouton poubelle : supprimer la catégorie.
    row.querySelector("[data-delete]").addEventListener("click", () => onDeleteCategory(cat));

    row.addEventListener("submit", async (e) => {
      e.preventDefault();
      const value = row.querySelector(".budget-input").value;
      // Champ vidé alors qu'il n'y avait pas de limite : rien à faire
      // (supprimer un document qui n'existe pas serait refusé par Firestore).
      if (!(Number(value) > 0) && !limit) {
        toast(`Pas de limite pour « ${cat.name} »`);
        return;
      }
      try {
        await setCategoryBudget(cat.id, value);
        toast(value && Number(value) > 0 ? `Budget « ${cat.name} » enregistré` : `Limite « ${cat.name} » supprimée`, "success");
        await loadBudgetsPage();
      } catch (err) {
        toast("Erreur : " + err.message, "danger");
      }
    });

    box.appendChild(row);
  });
  refreshIcons();
}

// Supprime une catégorie (après confirmation).
// - Les dépenses liées ne sont PAS supprimées : elles s'affichent
//   ensuite en « Sans catégorie » (getExpenses ne trouve plus la catégorie).
// - Sa limite de budget est supprimée aussi, pour ne pas laisser de
//   donnée orpheline.
async function onDeleteCategory(cat) {
  const nbDepenses = BUD.expenses.filter((e) => e.category_id === cat.id).length;
  const avertissement = nbDepenses
    ? `\n\n${nbDepenses} dépense(s) de ce mois passeront en « Sans catégorie » (elles ne sont pas supprimées).`
    : "";
  if (!confirm(`Supprimer la catégorie « ${cat.name} » ?${avertissement}`)) return;

  try {
    if (BUD.catBudgets[cat.id]) await setCategoryBudget(cat.id, 0); // supprime la limite
    await deleteCategory(cat.id);
    toast(`Catégorie « ${cat.name} » supprimée`, "success");
    await loadBudgetsPage();
  } catch (err) {
    toast("Erreur : " + err.message, "danger");
  }
}

/* ========== Alertes ========== */

function renderAlertsList() {
  const alerts = computeAlerts(BUD.budget?.amount, BUD.expenses, BUD.catBudgets, BUD.categories);
  const box = document.getElementById("alerts-list");

  if (alerts.length === 0) {
    box.innerHTML =
      '<div class="message success"><i data-lucide="circle-check"></i>Aucune alerte : vos budgets sont respectés.</div>';
  } else {
    box.innerHTML = alerts
      .map(
        (a) => `<div class="message ${a.level === "danger" ? "error" : "warning"}">
                  <i data-lucide="triangle-alert"></i>${escapeHtml(a.message)}
                </div>`
      )
      .join("");
  }
  refreshIcons();
}

function renderNotifState() {
  const state = notificationState();
  const text = document.getElementById("notif-state");
  const btn = document.getElementById("notif-btn");
  const labels = {
    granted: "Notifications du navigateur : activées.",
    denied: "Notifications bloquées dans les réglages du navigateur.",
    default: "Recevez aussi une notification du navigateur en cas de dépassement.",
    unsupported: "Ce navigateur ne gère pas les notifications.",
  };
  text.textContent = labels[state];
  btn.classList.toggle("hidden", state !== "default");
}
