/* ============================================================
   dashboard.js — Logique du tableau de bord.
   On charge UNE fois le budget du mois et toutes les dépenses,
   puis chaque bloc de l'écran est calculé côté navigateur :
   - chiffres clés (budget, dépensé, restant, jours restants)
   - jauge du % utilisé + message d'analyse
   - répartition par catégorie (barres segmentées)
   - comparaison des semaines (cercles)
   - courbe des dépenses par jour (Chart.js)
   - ajout rapide d'une dépense (« 12,50 Cinéma »)
   ============================================================ */

// État de la page (données chargées + choix des boutons bascule).
const DASH = {
  all: [],          // toutes les dépenses de l'utilisateur
  month: [],        // dépenses du mois en cours
  budget: null,     // budget du mois (ou null)
  catRange: "month", // "month" ou "week" pour la carte « Par catégorie »
  trendDays: 7,     // 7 ou 30 pour la courbe
  chart: null,      // graphique Chart.js (pour le détruire avant de le recréer)
};

// Petits raccourcis.
const el = (id) => document.getElementById(id);
const setText = (id, value) => (el(id).textContent = value);

// Réglages globaux Chart.js (même police que le site).
if (window.Chart) {
  Chart.defaults.font.family = "Geist, Inter, system-ui, sans-serif";
  Chart.defaults.color = "#605f5f";
}

/* ========== Démarrage ========== */

(async function initDashboard() {
  const user = await requireAuth(); // redirige vers login.html si besoin
  if (!user) return;

  registerServiceWorker();
  setupOfflineBanner();
  highlightNav();

  // Nom + initiale de l'utilisateur en bas de la barre latérale.
  const name = user.displayName || user.email || "";
  setText("user-name", name);
  setText("user-avatar", (name.trim()[0] || "?").toUpperCase());

  // Déconnexion (barre latérale + bouton mobile).
  ["logout-link", "logout-mobile"].forEach((id) =>
    el(id).addEventListener("click", (e) => {
      e.preventDefault();
      logout();
    })
  );

  const { month, year } = currentMonthYear();
  setText("month-title", monthName(month) + " " + year);

  setupBudgetDialog(month, year);
  setupToggles();
  setupQuickAdd();

  await loadDashboard();
})();

/* ========== Chargement des données ========== */

async function loadDashboard() {
  const { month, year } = currentMonthYear();
  try {
    // Les deux requêtes partent en même temps (plus rapide).
    const [budget, all] = await Promise.all([getBudget(month, year), getExpenses()]);

    DASH.budget = budget;
    DASH.all = all;
    const prefix = `${year}-${String(month).padStart(2, "0")}`; // ex. "2026-11"
    DASH.month = all.filter((e) => (e.expense_date || "").startsWith(prefix));

    renderSummary();
    renderCategoryBars();
    renderWeeks();
    renderTrend();
    renderRecent(DASH.month.slice(0, 5));

    // Alertes de dépassement (budget global + budgets par catégorie).
    await checkAlerts();
  } catch (err) {
    toast("Erreur : " + err.message, "danger");
    el("recent-list").innerHTML =
      '<div class="empty">Erreur : ' + escapeHtml(err.message) + "</div>";
  }
}

/* ========== Outils de dates (en heure locale) ========== */

// "2026-11-25" -> objet Date local (sans décalage de fuseau).
function dateFromISO(iso) {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d);
}

// Date d'il y a n jours au format "AAAA-MM-JJ".
function daysAgoISO(n) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return toLocalISO(d);
}

function addDays(date, n) {
  const d = new Date(date);
  d.setDate(d.getDate() + n);
  return d;
}

// Lundi de la semaine d'une date (la semaine commence le lundi en France).
function startOfWeek(date) {
  const d = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const decalage = (d.getDay() + 6) % 7; // lundi = 0 ... dimanche = 6
  return addDays(d, -decalage);
}

// Dépenses des n derniers jours (aujourd'hui compris).
function lastDays(list, n) {
  const from = daysAgoISO(n - 1);
  const to = today();
  return list.filter((e) => e.expense_date >= from && e.expense_date <= to);
}

// Somme des dépenses entre deux dates (début inclus, fin exclue).
function sumBetween(start, endExclusive) {
  const from = toLocalISO(start);
  const to = toLocalISO(endExclusive);
  return sumExpenses(DASH.all.filter((e) => e.expense_date >= from && e.expense_date < to));
}

// Regroupe des dépenses par catégorie -> [{ name, color, total }] trié.
function groupByCat(list) {
  const map = {};
  list.forEach((e) => {
    const name = e.category?.name || "Sans catégorie";
    const color = e.category?.color || "#8a8a8a";
    if (!map[name]) map[name] = { name, color, total: 0 };
    map[name].total += Number(e.amount);
  });
  return Object.values(map).sort((a, b) => b.total - a.total);
}

/* ========== Chiffres clés + jauge + message ========== */

function renderSummary() {
  const s = computeBudgetSummary(DASH.budget?.amount, DASH.month);

  // Jours restants dans le mois (aujourd'hui compris).
  const now = new Date();
  const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
  const daysLeft = daysInMonth - now.getDate() + 1;
  const perDay = s.restant > 0 ? s.restant / daysLeft : 0;

  setText("val-budget", formatMoney(s.budget));
  setText("val-depense", formatMoney(s.depense));
  const restEl = el("val-restant");
  restEl.textContent = formatMoney(s.restant);
  restEl.className = "chip-value" + (s.restant < 0 ? " negative" : "");
  setText("val-days", daysLeft + " j");
  setText("val-perday", formatMoney(perDay));

  // Pourcentage réel (peut dépasser 100 %) et niveau d'alerte.
  const pct = s.budget > 0 ? (s.depense / s.budget) * 100 : 0;
  const level = pct >= 100 ? "danger" : pct >= 80 ? "warning" : "";

  // Jauge SVG : on « découvre » le cercle grâce à stroke-dashoffset.
  // Circonférence = 2 × π × rayon (rayon 50 dans le SVG).
  const circonference = 2 * Math.PI * 50;
  const fill = el("gauge-fill");
  fill.style.strokeDashoffset = circonference * (1 - s.pourcentage / 100);
  fill.setAttribute("class", "gauge-fill " + level);
  el("gauge-value").innerHTML = Math.round(pct) + "<span>%</span>";

  const pill = el("status-pill");
  pill.className = "status-pill " + level;
  pill.textContent =
    s.budget === 0 ? "Pas de budget"
      : level === "danger" ? "Budget dépassé"
      : level === "warning" ? "Attention"
      : "Dans le budget";

  renderAdvice(s, pct, daysLeft, perDay, level);
  renderCategoryTiles();
}

// Vérifie les budgets (global + par catégorie) et affiche les alertes.
async function checkAlerts() {
  let categoryBudgets = {};
  let categories = [];
  try {
    [categoryBudgets, categories] = await Promise.all([getCategoryBudgets(), getCategories()]);
  } catch (err) {
    // Pas bloquant : on vérifie au moins le budget global.
    console.warn("Budgets par catégorie indisponibles :", err.code || err.message);
  }
  const alerts = computeAlerts(DASH.budget?.amount, DASH.month, categoryBudgets, categories);
  showAlerts(alerts);
}

// Message d'analyse en grand sur le fond bleu.
// (Les valeurs insérées sont des nombres formatés, pas du texte saisi.)
function renderAdvice(s, pct, daysLeft, perDay, level) {
  const text = el("advice-text");
  const btn = el("advice-btn");
  btn.textContent = "Voir les dépenses";
  btn.href = "./expenses.html";
  btn.onclick = null;

  if (s.budget === 0) {
    text.innerHTML =
      "Aucun budget pour ce mois. <strong>Définissez un budget</strong> pour savoir combien il vous reste à dépenser.";
    btn.textContent = "Définir le budget";
    btn.href = "#";
    btn.onclick = (e) => {
      e.preventDefault();
      openBudgetDialog();
    };
  } else if (level === "danger") {
    text.innerHTML = `Budget <strong>dépassé de ${formatMoney(-s.restant)}</strong>. Limitez les dépenses non essentielles jusqu'à la fin du mois.`;
  } else if (level === "warning") {
    text.innerHTML = `<strong>${Math.round(pct)} % du budget</strong> est déjà utilisé. Il reste <strong>${formatMoney(s.restant)}</strong> pour ${daysLeft} jour(s).`;
  } else {
    text.innerHTML = `Tout va bien : il vous reste <strong>${formatMoney(s.restant)}</strong>, soit environ <strong>${formatMoney(perDay)} par jour</strong> jusqu'à la fin du mois.`;
  }
}

// Tuiles des 3 catégories qui coûtent le plus ce mois + tuile « Ajouter ».
function renderCategoryTiles() {
  const cats = groupByCat(DASH.month).slice(0, 3);
  const tiles = cats.map(
    (c) => `
      <div class="cat-tile">
        <span class="cat-tile-icon" style="--c:${escapeHtml(c.color)}"><i data-lucide="tag"></i></span>
        <div style="min-width:0">
          <div class="cat-tile-name">${escapeHtml(c.name)}</div>
          <div class="cat-tile-amount">${formatMoney(c.total)}</div>
        </div>
      </div>`
  );
  // Cases vides si moins de 3 catégories.
  while (tiles.length < 3) {
    tiles.push(`
      <div class="cat-tile">
        <span class="cat-tile-icon"><i data-lucide="tag"></i></span>
        <div><div class="cat-tile-name">—</div><div class="cat-tile-amount">Aucune dépense</div></div>
      </div>`);
  }
  tiles.push(`
    <a class="cat-tile add" href="./expenses.html">
      <span class="plus"><i data-lucide="plus"></i></span>Ajouter
    </a>`);

  el("cat-tiles").innerHTML = tiles.join("");
  refreshIcons();
}

/* ========== Carte « Par catégorie » (barres segmentées) ========== */

function renderCategoryBars() {
  const list = DASH.catRange === "week" ? lastDays(DASH.all, 7) : DASH.month;
  const total = sumExpenses(list);
  const cats = groupByCat(list).slice(0, 3);
  const box = el("cat-bars");

  if (cats.length === 0) {
    box.innerHTML =
      '<div class="empty"><i data-lucide="chart-pie"></i>Aucune dépense sur cette période.</div>';
    refreshIcons();
    return;
  }

  box.innerHTML = cats
    .map((c) => {
      const pct = total > 0 ? Math.round((c.total / total) * 100) : 0;
      // 10 segments = 100 % ; au moins 1 segment allumé si la part n'est pas nulle.
      const allumes = pct > 0 ? Math.max(1, Math.round(pct / 10)) : 0;
      const segments = Array.from({ length: 10 }, (_, i) =>
        `<i class="${i < allumes ? "on" : ""}"></i>`
      ).join("");
      return `
        <div class="seg-row">
          <div class="seg-label">
            <span>${escapeHtml(c.name)}</span>
            <span><b>${pct}</b>/100</span>
          </div>
          <div class="segments">${segments}</div>
        </div>`;
    })
    .join("");
}

/* ========== Carte « Semaines » (cercles) ========== */

function renderWeeks() {
  const debutSemaine = startOfWeek(new Date());
  const semaineDerniere = sumBetween(addDays(debutSemaine, -7), debutSemaine);
  const cetteSemaine = sumBetween(debutSemaine, addDays(debutSemaine, 7));
  const moyenne4 = sumBetween(addDays(debutSemaine, -28), debutSemaine) / 4;

  const items = [
    { label: "Sem. dernière", value: semaineDerniere, motif: "stripes" },
    { label: "Cette semaine", value: cetteSemaine, motif: "dots" },
    { label: "Moy. 4 sem.", value: moyenne4, motif: "rings" },
  ];

  // La taille du cercle est proportionnelle au montant (entre 80 et 110 px).
  const max = Math.max(...items.map((i) => i.value), 1);
  el("bubbles").innerHTML = items
    .map((i) => {
      const size = Math.round(80 + 30 * (i.value / max));
      return `
        <div class="bubble">
          <div class="bubble-slot">
            <div class="bubble-circle ${i.motif}" style="--size:${size}px">
              ${Math.round(i.value).toLocaleString("fr-FR")} €
            </div>
          </div>
          <span class="bubble-label">${i.label}</span>
        </div>`;
    })
    .join("");
}

/* ========== Carte « Dépenses par jour » (Chart.js) ========== */

function renderTrend() {
  const n = DASH.trendDays;
  const labels = [];
  const data = [];

  for (let i = n - 1; i >= 0; i--) {
    const iso = daysAgoISO(i);
    const d = dateFromISO(iso);
    labels.push(
      n === 7
        ? d.toLocaleDateString("fr-FR", { weekday: "short" }) // lun., mar. ...
        : String(d.getDate()).padStart(2, "0")
    );
    data.push(sumExpenses(DASH.all.filter((e) => e.expense_date === iso)));
  }

  // Jour le plus dépensier, affiché au-dessus du graphique.
  const maxValue = Math.max(...data);
  const maxIndex = data.indexOf(maxValue);
  el("trend-max").innerHTML =
    '<i data-lucide="trending-up"></i>' +
    (maxValue > 0
      ? `Max ${formatMoney(maxValue)} · ${formatDate(daysAgoISO(n - 1 - maxIndex))}`
      : "Aucune dépense");
  refreshIcons();
  setText("trend-sub", n + " derniers jours");

  if (DASH.chart) DASH.chart.destroy();
  DASH.chart = new Chart(el("chart-daily"), {
    type: "line",
    data: {
      labels,
      datasets: [
        {
          data,
          borderColor: "#16224a",
          backgroundColor: "rgba(22, 34, 74, 0.07)",
          fill: true,
          tension: 0.35,
          borderWidth: 2,
          // Seul le point du maximum est affiché.
          pointRadius: data.map((v, i) => (i === maxIndex && v > 0 ? 4 : 0)),
          pointBackgroundColor: "#16224a",
          pointHoverRadius: 5,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: { callbacks: { label: (ctx) => " " + formatMoney(ctx.parsed.y) } },
      },
      scales: {
        x: {
          grid: { display: false },
          ticks: { maxRotation: 0, autoSkip: true, maxTicksLimit: n === 7 ? 7 : 8, font: { size: 11 } },
        },
        y: { display: false, beginAtZero: true },
      },
    },
  });
}

/* ========== Boutons bascule ========== */

function setupToggles() {
  // Active le bouton cliqué et désactive les autres du même groupe.
  const activer = (groupe, bouton) =>
    groupe.querySelectorAll("button").forEach((b) => b.classList.toggle("on", b === bouton));

  el("cat-toggle").addEventListener("click", (e) => {
    const b = e.target.closest("button");
    if (!b) return;
    activer(el("cat-toggle"), b);
    DASH.catRange = b.dataset.range;
    renderCategoryBars();
  });

  el("trend-toggle").addEventListener("click", (e) => {
    const b = e.target.closest("button");
    if (!b) return;
    activer(el("trend-toggle"), b);
    DASH.trendDays = Number(b.dataset.days);
    renderTrend();
  });
}

/* ========== Fenêtre « Budget du mois » ========== */

function openBudgetDialog() {
  if (DASH.budget) el("budget-amount").value = DASH.budget.amount;
  el("budget-dialog").showModal(); // <dialog> natif HTML
  el("budget-amount").focus();
}

function setupBudgetDialog(month, year) {
  el("edit-budget").addEventListener("click", openBudgetDialog);
  el("budget-cancel").addEventListener("click", () => el("budget-dialog").close());

  el("budget-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    try {
      await setBudget(el("budget-amount").value, month, year);
      el("budget-dialog").close();
      toast("Budget enregistré", "success");
      await loadDashboard();
    } catch (err) {
      toast("Erreur : " + err.message, "danger");
    }
  });
}

/* ========== Ajout rapide (« 12,50 Cinéma ») ========== */

// Extrait le montant (premier nombre trouvé) et la description (le reste).
// "12,50 Cinéma" -> { amount: 12.5, description: "Cinéma" }
function parseQuickAdd(text) {
  const match = text.match(/(\d+(?:[.,]\d{1,2})?)/);
  if (!match) return null;
  const amount = Number(match[1].replace(",", "."));
  const description = (text.slice(0, match.index) + text.slice(match.index + match[0].length))
    .replace(/€/g, "")
    .replace(/\beuros?\b/gi, "")
    .replace(/\s+/g, " ")
    .trim();
  return { amount, description };
}

function setupQuickAdd() {
  el("quick-add").addEventListener("submit", async (e) => {
    e.preventDefault();
    const input = el("quick-input");
    const parsed = parseQuickAdd(input.value);

    if (!parsed || parsed.amount <= 0) {
      toast("Écrivez un montant, ex. « 12,50 Cinéma »", "danger");
      return;
    }

    try {
      await addExpense({
        amount: parsed.amount,
        description: parsed.description || "Dépense rapide",
        expense_date: today(),
        category_id: null,
        tagNames: "",
      });
      input.value = "";
      toast("Dépense ajoutée : " + formatMoney(parsed.amount), "success");
      await loadDashboard();
    } catch (err) {
      toast("Erreur : " + err.message, "danger");
    }
  });
}

/* ========== Dernières dépenses ========== */

function renderRecent(expenses) {
  const box = el("recent-list");
  if (expenses.length === 0) {
    box.innerHTML = '<div class="empty"><i data-lucide="receipt"></i>Aucune dépense ce mois-ci.</div>';
    refreshIcons();
    return;
  }
  box.innerHTML = "";
  expenses.forEach((e) => {
    const color = e.category?.color || "#8a8a8a";
    const catName = e.category?.name || "Sans catégorie";
    const item = document.createElement("div");
    item.className = "expense-item";
    item.innerHTML = `
      <span class="expense-icon" style="--c:${escapeHtml(color)}"><i data-lucide="receipt"></i></span>
      <div class="expense-main">
        <div class="expense-desc">${escapeHtml(e.description || "(sans description)")}</div>
        <div class="expense-meta">
          <span>${formatDate(e.expense_date)}</span>
          <span class="badge">${escapeHtml(catName)}</span>
        </div>
      </div>
      <div class="expense-amount">− ${formatMoney(e.amount)}</div>
    `;
    box.appendChild(item);
  });
  refreshIcons();
}
