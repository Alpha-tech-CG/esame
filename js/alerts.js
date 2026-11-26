/* ============================================================
   alerts.js — Alertes de dépassement de budget (fonctionnalité avancée).

   Deux niveaux :
   - « warning » : 80 % ou plus du budget est utilisé
   - « danger »  : le budget est dépassé
   On vérifie le budget global du mois ET chaque budget par catégorie.

   Affichage :
   - dans l'application : petites notifications (toast)
   - en plus, si l'utilisateur l'a autorisé : notification du
     navigateur (API Notification), une seule fois par jour et par
     alerte pour ne pas le harceler.
   (Les notifications « push » envoyées par un serveur sont hors
    périmètre du projet, voir cahier des charges.)
   ============================================================ */

// Calcule la liste des alertes.
// - budgetAmount : budget global du mois (ou 0)
// - monthExpenses : dépenses du mois en cours
// - categoryBudgets : { idCategorie: montant } (voir budget.js)
// - categories : liste des catégories (pour les noms)
function computeAlerts(budgetAmount, monthExpenses, categoryBudgets, categories) {
  const alerts = [];

  // 1) Budget global
  const budget = Number(budgetAmount) || 0;
  const total = sumExpenses(monthExpenses);
  if (budget > 0) {
    const pct = (total / budget) * 100;
    if (pct >= 100) {
      alerts.push({
        key: "global",
        level: "danger",
        message: `Budget du mois dépassé de ${formatMoney(total - budget)}`,
      });
    } else if (pct >= 80) {
      alerts.push({
        key: "global",
        level: "warning",
        message: `${Math.round(pct)} % du budget du mois déjà utilisé`,
      });
    }
  }

  // 2) Budgets par catégorie
  const names = {};
  (categories || []).forEach((c) => (names[c.id] = c.name));

  Object.entries(categoryBudgets || {}).forEach(([catId, limit]) => {
    if (!limit) return;
    const spent = sumExpenses(monthExpenses.filter((e) => e.category_id === catId));
    const pct = (spent / limit) * 100;
    const name = names[catId] || "Catégorie";
    if (pct >= 100) {
      alerts.push({
        key: "cat_" + catId,
        level: "danger",
        message: `${name} : budget dépassé de ${formatMoney(spent - limit)}`,
      });
    } else if (pct >= 80) {
      alerts.push({
        key: "cat_" + catId,
        level: "warning",
        message: `${name} : ${Math.round(pct)} % du budget utilisé`,
      });
    }
  });

  // Les dépassements d'abord.
  return alerts.sort((a, b) => (a.level === "danger" ? -1 : 1) - (b.level === "danger" ? -1 : 1));
}

// Affiche les alertes : toasts dans l'app + notification navigateur.
function showAlerts(alerts) {
  alerts.slice(0, 3).forEach((a, i) => {
    // On décale un peu les toasts pour qu'ils ne s'empilent pas d'un coup.
    setTimeout(() => toast(a.message, a.level === "danger" ? "danger" : ""), i * 400);
  });
  alerts.forEach(sendSystemNotification);
}

/* ---------- Notifications du navigateur ---------- */

function notificationsSupported() {
  return "Notification" in window;
}

// "granted" (autorisées), "denied" (refusées), "default" (pas encore demandé)
function notificationState() {
  return notificationsSupported() ? Notification.permission : "unsupported";
}

// Demande l'autorisation à l'utilisateur (doit venir d'un clic).
async function requestNotifications() {
  if (!notificationsSupported()) return "unsupported";
  return Notification.requestPermission();
}

// Envoie une notification système, au maximum une fois par jour par alerte.
function sendSystemNotification(alert) {
  if (notificationState() !== "granted") return;
  const key = `bs_notif_${alert.key}_${alert.level}_${today()}`;
  if (localStorage.getItem(key)) return; // déjà envoyée aujourd'hui
  localStorage.setItem(key, "1");
  try {
    new Notification("BudgetShare", {
      body: alert.message,
      icon: "./icons/icon-192.png",
      tag: alert.key, // remplace une ancienne notification du même type
    });
  } catch (e) {
    /* certains navigateurs mobiles exigent le service worker : on ignore */
  }
}
