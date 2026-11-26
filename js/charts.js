/* ============================================================
   charts.js — Création des graphiques avec Chart.js.
   Deux graphiques :
   - un camembert (doughnut) : répartition par catégorie
   - une courbe (line) : évolution des dépenses jour par jour
   Chart.js est chargé via <script> dans stats.html (objet global « Chart »).
   ============================================================ */

// On garde une référence aux graphiques existants pour pouvoir
// les détruire avant d'en recréer (sinon ils se superposent).
let categoryChart = null;
let trendChart = null;

// Réglages globaux de Chart.js : même police et même gris que le site.
if (window.Chart) {
  Chart.defaults.font.family = 'Geist, Inter, system-ui, sans-serif';
  Chart.defaults.color = "#605f5f";
}

// Couleur du texte adaptée au thème clair/sombre.
function chartTextColor() {
  return getComputedStyle(document.documentElement)
    .getPropertyValue("--text")
    .trim() || "#0f172a";
}

// --- Camembert : répartition des dépenses par catégorie ---
// data = [{ name, color, total }]
function renderCategoryChart(canvas, data) {
  if (categoryChart) categoryChart.destroy();

  // Si aucune donnée, on n'affiche rien (le message vide est géré ailleurs).
  if (!data || data.length === 0) return;

  categoryChart = new Chart(canvas, {
    type: "doughnut",
    data: {
      labels: data.map((d) => d.name),
      datasets: [
        {
          data: data.map((d) => d.total),
          backgroundColor: data.map((d) => d.color),
          borderWidth: 2,
          borderColor: getComputedStyle(document.documentElement)
            .getPropertyValue("--surface").trim() || "#fff",
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      cutout: "68%",        // anneau fin, style moderne
      plugins: {
        legend: {
          position: "bottom",
          labels: { color: chartTextColor(), usePointStyle: true, padding: 16 },
        },
        tooltip: {
          callbacks: {
            // Affiche le montant formaté dans l'infobulle.
            label: (ctx) => ` ${ctx.label} : ${formatMoney(ctx.parsed)}`,
          },
        },
      },
    },
  });
}

// --- Courbe : évolution des dépenses par jour ---
// data = [{ label: "01", total: 45.2 }]
function renderTrendChart(canvas, data) {
  if (trendChart) trendChart.destroy();
  if (!data || data.length === 0) return;

  const primary = getComputedStyle(document.documentElement)
    .getPropertyValue("--color-primary").trim() || "#2563eb";

  trendChart = new Chart(canvas, {
    type: "line",
    data: {
      labels: data.map((d) => d.label),
      datasets: [
        {
          label: "Dépenses (€)",
          data: data.map((d) => d.total),
          borderColor: primary,
          backgroundColor: "rgba(70, 134, 254, 0.12)",
          borderWidth: 2.5,
          fill: true,
          tension: 0.35,     // courbe légèrement arrondie
          pointRadius: 0,    // pas de points, ligne épurée
          pointHoverRadius: 5,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { labels: { color: chartTextColor() } },
        tooltip: {
          callbacks: {
            label: (ctx) => ` ${formatMoney(ctx.parsed.y)}`,
          },
        },
      },
      scales: {
        x: { ticks: { color: chartTextColor() }, grid: { display: false } },
        y: {
          ticks: {
            color: chartTextColor(),
            callback: (v) => v + " €",
          },
          grid: { color: "#f0f0f0" },
          border: { display: false },
          beginAtZero: true,
        },
      },
    },
  });
}
