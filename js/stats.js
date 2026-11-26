/* ============================================================
   stats.js — Page Statistiques.
   Calcule les totaux d'un mois choisi puis demande à charts.js
   de dessiner les graphiques.
   ============================================================ */

document.addEventListener("DOMContentLoaded", () => {
  if (document.getElementById("stats-page")) {
    initStatsPage();
  }
});

async function initStatsPage() {
  const user = await requireAuth();
  if (!user) return;

  registerServiceWorker();
  setupOfflineBanner();
  highlightNav();

  document.getElementById("logout-link").addEventListener("click", (e) => {
    e.preventDefault();
    logout();
  });

  // Sélecteur de mois (input type=month), par défaut le mois courant.
  const { month, year } = currentMonthYear();
  const monthInput = document.getElementById("stats-month");
  monthInput.value = `${year}-${String(month).padStart(2, "0")}`;

  // Recharge quand on change de mois.
  monthInput.addEventListener("change", loadStats);

  await loadStats();
}

async function loadStats() {
  const monthInput = document.getElementById("stats-month");
  // La valeur est "AAAA-MM". On en extrait l'année et le mois.
  const [year, month] = monthInput.value.split("-").map(Number);

  const from = `${year}-${String(month).padStart(2, "0")}-01`;
  const to = `${year}-${String(month).padStart(2, "0")}-31`;

  try {
    const [budget, expenses] = await Promise.all([
      getBudget(month, year),
      getExpenses({ from, to }),
    ]);

    const summary = computeBudgetSummary(budget?.amount, expenses);

    // --- Cartes chiffrées ---
    document.getElementById("stat-total").textContent = formatMoney(summary.depense);
    document.getElementById("stat-budget").textContent = formatMoney(summary.budget);
    const restEl = document.getElementById("stat-restant");
    restEl.textContent = formatMoney(summary.restant);
    restEl.className = "stat-value " + (summary.restant < 0 ? "negative" : "positive");
    document.getElementById("stat-count").textContent = expenses.length;

    // --- Données pour les graphiques ---
    const byCategory = groupByCategory(expenses);
    const byDay = groupByDay(expenses, year, month);

    // Message si aucune dépense.
    const emptyMsg = document.getElementById("stats-empty");
    if (expenses.length === 0) {
      emptyMsg.classList.remove("hidden");
    } else {
      emptyMsg.classList.add("hidden");
    }

    renderCategoryChart(document.getElementById("chart-category"), byCategory);
    renderTrendChart(document.getElementById("chart-trend"), byDay);
  } catch (err) {
    toast("Erreur : " + err.message, "danger");
  }
}

// Regroupe les dépenses par catégorie -> [{ name, color, total }]
function groupByCategory(expenses) {
  const map = {};
  expenses.forEach((e) => {
    const name = e.category?.name || "Sans catégorie";
    const color = e.category?.color || "#94a3b8";
    if (!map[name]) map[name] = { name, color, total: 0 };
    map[name].total += Number(e.amount);
  });
  // Trié du plus gros au plus petit.
  return Object.values(map).sort((a, b) => b.total - a.total);
}

// Regroupe les dépenses par jour du mois -> [{ label: "01", total }]
// On crée une entrée pour chaque jour du mois (même à 0) afin
// d'avoir une courbe continue.
function groupByDay(expenses, year, month) {
  const daysInMonth = new Date(year, month, 0).getDate(); // nb de jours
  const totals = {};
  for (let d = 1; d <= daysInMonth; d++) {
    totals[d] = 0;
  }
  expenses.forEach((e) => {
    const day = new Date(e.expense_date).getDate();
    if (totals[day] !== undefined) totals[day] += Number(e.amount);
  });
  return Object.keys(totals).map((d) => ({
    label: String(d).padStart(2, "0"),
    total: totals[d],
  }));
}
