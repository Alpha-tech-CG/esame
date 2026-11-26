/* ============================================================
   groups.js — Groupes et dépenses partagées (fonctionnalité avancée).

   Modèle Firestore :
   - groups/{id} : { name, ownerId, memberIds: [uid...],
                     members: { uid: { name, email } }, created_at }
   - groups/{id}/expenses/{id} : { amount, description, expense_date,
                     paidBy, splitMode: "equal"|"custom",
                     shares: { uid: montant }, createdBy, created_at }
   - userLookup/{email} : { uid, name, email } -> pour ajouter un
     membre à partir de son e-mail.

   Sécurité (firestore.rules) : seuls les membres d'un groupe peuvent
   lire ou écrire le groupe et ses dépenses.
   ============================================================ */

const GRP = {
  groups: [],       // mes groupes
  current: null,    // groupe sélectionné
  expenses: [],     // dépenses du groupe sélectionné
};

const $ = (id) => document.getElementById(id);

/* ========== Démarrage ========== */

(async function initGroupsPage() {
  const user = await requireAuth();
  if (!user) return;

  registerServiceWorker();
  setupOfflineBanner();
  highlightNav();

  $("ge-date").value = today();

  $("create-group-form").addEventListener("submit", onCreateGroup);
  $("add-member-form").addEventListener("submit", onAddMember);
  $("group-expense-form").addEventListener("submit", onAddGroupExpense);
  $("delete-group").addEventListener("click", onDeleteGroup);
  $("payer-filter").addEventListener("change", renderGroupExpenses);
  $("ge-amount").addEventListener("input", renderSplitBox);
  document.querySelectorAll('input[name="split"]').forEach((r) =>
    r.addEventListener("change", renderSplitBox)
  );

  // Clic sur un groupe de la liste (délégation d'événement).
  $("group-list").addEventListener("click", (e) => {
    const btn = e.target.closest("[data-group]");
    if (btn) selectGroup(btn.dataset.group);
  });

  await loadGroups();
})();

/* ========== Accès aux données ========== */

async function fetchGroups() {
  const uid = currentUser().uid;
  // « array-contains » : les groupes dont memberIds contient mon uid.
  const snap = await window.db
    .collection("groups")
    .where("memberIds", "array-contains", uid)
    .get();
  return snap.docs
    .map((d) => ({ id: d.id, ...d.data() }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

async function createGroup(name) {
  const u = currentUser();
  const ref = await window.db.collection("groups").add({
    name: name.trim(),
    ownerId: u.uid,
    memberIds: [u.uid],
    members: {
      [u.uid]: { name: u.displayName || u.email, email: (u.email || "").toLowerCase() },
    },
    created_at: firebase.firestore.FieldValue.serverTimestamp(),
  });
  return ref.id;
}

// Ajoute un membre en cherchant son compte grâce à son e-mail.
async function addMemberByEmail(group, email) {
  const key = email.trim().toLowerCase();
  const snap = await window.db.collection("userLookup").doc(key).get();
  if (!snap.exists) {
    throw new Error(
      "Aucun compte BudgetShare avec cet e-mail. La personne doit s'inscrire et se connecter au moins une fois."
    );
  }
  const m = snap.data();
  if (group.memberIds.includes(m.uid)) {
    throw new Error("Cette personne est déjà membre du groupe.");
  }
  await window.db.collection("groups").doc(group.id).update({
    // arrayUnion ajoute l'uid sans créer de doublon.
    memberIds: firebase.firestore.FieldValue.arrayUnion(m.uid),
    ["members." + m.uid]: { name: m.name || key, email: key },
  });
}

function groupExpensesRef(groupId) {
  return window.db.collection("groups").doc(groupId).collection("expenses");
}

async function fetchGroupExpenses(groupId) {
  const snap = await groupExpensesRef(groupId).get();
  return snap.docs
    .map((d) => ({ id: d.id, ...d.data() }))
    .sort((a, b) => {
      if (a.expense_date !== b.expense_date) return a.expense_date < b.expense_date ? 1 : -1;
      return (b.created_at?.seconds || 0) - (a.created_at?.seconds || 0);
    });
}

async function addGroupExpense(groupId, data) {
  await groupExpensesRef(groupId).add({
    ...data,
    createdBy: currentUser().uid,
    created_at: firebase.firestore.FieldValue.serverTimestamp(),
  });
}

async function deleteGroupExpense(groupId, expenseId) {
  await groupExpensesRef(groupId).doc(expenseId).delete();
}

// Supprime le groupe ET ses dépenses en une seule opération (batch).
async function deleteGroup(group) {
  const snap = await groupExpensesRef(group.id).get();
  const batch = window.db.batch();
  snap.docs.forEach((d) => batch.delete(d.ref));
  batch.delete(window.db.collection("groups").doc(group.id));
  await batch.commit();
}

/* ========== Calculs : répartition et soldes ========== */

// Parts égales, au centime près : 10 € pour 3 -> 3,34 / 3,33 / 3,33.
// On travaille en centimes (entiers) pour éviter les erreurs d'arrondi.
function equalShares(amount, memberIds) {
  const cents = Math.round(amount * 100);
  const n = memberIds.length;
  const base = Math.floor(cents / n);
  let reste = cents - base * n; // centimes restants à distribuer
  const shares = {};
  memberIds.forEach((id) => {
    shares[id] = (base + (reste > 0 ? 1 : 0)) / 100;
    if (reste > 0) reste--;
  });
  return shares;
}

// Solde de chaque membre = ce qu'il a payé − ce qu'il doit (sa part).
// Positif : on lui doit de l'argent. Négatif : il doit de l'argent.
function computeBalances(group, expenses) {
  const bal = {};
  group.memberIds.forEach((id) => (bal[id] = 0));
  expenses.forEach((e) => {
    bal[e.paidBy] = (bal[e.paidBy] || 0) + Number(e.amount);
    Object.entries(e.shares || {}).forEach(([id, part]) => {
      bal[id] = (bal[id] || 0) - Number(part);
    });
  });
  Object.keys(bal).forEach((id) => (bal[id] = Math.round(bal[id] * 100) / 100));
  return bal;
}

// Propose une liste minimale de remboursements « qui paie qui ».
// Méthode simple : le plus gros débiteur rembourse le plus gros créancier,
// et on recommence jusqu'à ce que tout le monde soit à 0.
function computeSettlements(bal) {
  const debiteurs = [];
  const creanciers = [];
  Object.entries(bal).forEach(([id, v]) => {
    if (v < -0.004) debiteurs.push({ id, v: -v });
    else if (v > 0.004) creanciers.push({ id, v });
  });
  debiteurs.sort((a, b) => b.v - a.v);
  creanciers.sort((a, b) => b.v - a.v);

  const result = [];
  let i = 0;
  let j = 0;
  while (i < debiteurs.length && j < creanciers.length) {
    const montant = Math.min(debiteurs[i].v, creanciers[j].v);
    result.push({ from: debiteurs[i].id, to: creanciers[j].id, amount: Math.round(montant * 100) / 100 });
    debiteurs[i].v -= montant;
    creanciers[j].v -= montant;
    if (debiteurs[i].v < 0.005) i++;
    if (creanciers[j].v < 0.005) j++;
  }
  return result;
}

/* ========== Affichage ========== */

function memberName(uid) {
  const m = GRP.current?.members?.[uid];
  const name = m?.name || "Membre";
  return uid === currentUser().uid ? name + " (vous)" : name;
}

function initials(uid) {
  const m = GRP.current?.members?.[uid];
  return ((m?.name || "?").trim()[0] || "?").toUpperCase();
}

async function loadGroups(selectId) {
  try {
    GRP.groups = await fetchGroups();
  } catch (err) {
    $("group-list").innerHTML = '<div class="empty">Erreur : ' + escapeHtml(err.message) + "</div>";
    return;
  }
  renderGroupList();

  const id = selectId || GRP.current?.id || GRP.groups[0]?.id;
  if (id && GRP.groups.some((g) => g.id === id)) {
    await selectGroup(id);
  } else {
    GRP.current = null;
    $("group-detail").classList.add("hidden");
    $("group-empty").classList.remove("hidden");
  }
}

function renderGroupList() {
  const box = $("group-list");
  if (GRP.groups.length === 0) {
    box.innerHTML = '<p class="panel-sub" style="margin-bottom:0.5rem">Aucun groupe pour l\'instant.</p>';
    return;
  }
  box.innerHTML = GRP.groups
    .map(
      (g) => `
      <button type="button" class="group-item ${g.id === GRP.current?.id ? "active" : ""}" data-group="${g.id}">
        <span class="group-icon"><i data-lucide="users"></i></span>
        <span style="min-width:0">
          <span class="group-item-name">${escapeHtml(g.name)}</span>
          <span class="group-item-sub">${g.memberIds.length} membre(s)</span>
        </span>
      </button>`
    )
    .join("");
  refreshIcons();
}

async function selectGroup(id) {
  GRP.current = GRP.groups.find((g) => g.id === id) || null;
  if (!GRP.current) return;

  renderGroupList();
  $("group-empty").classList.add("hidden");
  $("group-detail").classList.remove("hidden");

  renderGroupHeader();
  renderPayerSelects();
  renderSplitBox();

  try {
    GRP.expenses = await fetchGroupExpenses(id);
  } catch (err) {
    GRP.expenses = [];
    toast("Erreur : " + err.message, "danger");
  }
  renderBalances();
  renderGroupExpenses();
}

function renderGroupHeader() {
  const g = GRP.current;
  $("group-title").textContent = g.name;
  // Seul le propriétaire peut supprimer le groupe.
  $("delete-group").classList.toggle("hidden", g.ownerId !== currentUser().uid);

  $("member-chips").innerHTML = g.memberIds
    .map(
      (id) => `
      <span class="member-chip">
        <span class="avatar-sm">${escapeHtml(initials(id))}</span>
        ${escapeHtml(memberName(id))}
        ${id === g.ownerId ? '<span class="badge">créateur</span>' : ""}
      </span>`
    )
    .join("");
}

// Remplit « Payé par » et le filtre par membre.
function renderPayerSelects() {
  const g = GRP.current;
  const me = currentUser().uid;
  const options = g.memberIds
    .map((id) => `<option value="${id}">${escapeHtml(memberName(id))}</option>`)
    .join("");
  $("ge-payer").innerHTML = options;
  $("ge-payer").value = me;
  $("payer-filter").innerHTML = '<option value="">Tous les membres</option>' + options;
}

function splitMode() {
  return document.querySelector('input[name="split"]:checked').value;
}

// Zone sous le choix de répartition : aperçu (égal) ou champs par membre (perso).
function renderSplitBox() {
  if (!GRP.current) return;
  const box = $("split-box");
  const ids = GRP.current.memberIds;
  const amount = Number($("ge-amount").value) || 0;

  if (splitMode() === "equal") {
    const shares = amount > 0 ? equalShares(amount, ids) : null;
    box.innerHTML = `<p class="split-info">${
      shares
        ? `${ids.length} part(s) de ${formatMoney(shares[ids[ids.length - 1]])} environ.`
        : `Le montant sera divisé entre les ${ids.length} membre(s).`
    }</p>`;
    return;
  }

  // Parts personnalisées : on garde les valeurs déjà tapées si on redessine.
  const old = {};
  box.querySelectorAll(".split-input").forEach((i) => (old[i.dataset.uid] = i.value));

  box.innerHTML =
    ids
      .map(
        (id) => `
        <div class="split-row">
          <span class="split-name"><span class="avatar-sm">${escapeHtml(initials(id))}</span>${escapeHtml(memberName(id))}</span>
          <input class="input split-input" type="number" step="0.01" min="0" data-uid="${id}"
                 value="${old[id] ?? ""}" placeholder="0,00" aria-label="Part de ${escapeHtml(memberName(id))}" />
        </div>`
      )
      .join("") + '<p class="split-info" id="split-remaining"></p>';

  box.querySelectorAll(".split-input").forEach((i) => i.addEventListener("input", updateRemaining));
  updateRemaining();
}

// Affiche combien il reste à répartir en mode personnalisé.
function updateRemaining() {
  const info = $("split-remaining");
  if (!info) return;
  const amountCents = Math.round((Number($("ge-amount").value) || 0) * 100);
  const sumCents = Object.values(readCustomShares()).reduce((t, v) => t + Math.round(v * 100), 0);
  const resteCents = amountCents - sumCents;
  info.className = "split-info " + (resteCents === 0 && amountCents > 0 ? "ok" : "bad");
  info.textContent =
    resteCents === 0
      ? amountCents > 0 ? "Répartition complète." : "Saisissez d'abord le montant."
      : resteCents > 0
        ? `Reste à répartir : ${formatMoney(resteCents / 100)}`
        : `Trop réparti de ${formatMoney(-resteCents / 100)}`;
}

function readCustomShares() {
  const shares = {};
  document.querySelectorAll(".split-input").forEach((i) => {
    shares[i.dataset.uid] = Number(i.value) || 0;
  });
  return shares;
}

function renderBalances() {
  const g = GRP.current;
  const bal = computeBalances(g, GRP.expenses);

  $("balances").innerHTML = g.memberIds
    .map((id) => {
      const v = bal[id] || 0;
      const cls = v > 0 ? "positive" : v < 0 ? "negative" : "";
      const label = v > 0 ? "récupère" : v < 0 ? "doit" : "à l'équilibre";
      return `
        <div class="balance-row">
          <span class="avatar-sm">${escapeHtml(initials(id))}</span>
          <span class="balance-name">${escapeHtml(memberName(id))}</span>
          <span class="balance-amount ${cls}">${label} ${v !== 0 ? formatMoney(Math.abs(v)) : ""}</span>
        </div>`;
    })
    .join("");

  const settlements = computeSettlements(bal);
  $("settlements").innerHTML =
    settlements.length === 0
      ? '<div class="settle-list"><div class="message success" style="margin:0"><i data-lucide="circle-check"></i>Tout le monde est à l\'équilibre.</div></div>'
      : `<div class="settle-list">
           <div class="panel-sub">Remboursements conseillés</div>
           ${settlements
             .map(
               (s) => `<div class="settle-item">
                         ${escapeHtml(memberName(s.from))}
                         <i data-lucide="arrow-right"></i>
                         ${escapeHtml(memberName(s.to))}
                         <b>${formatMoney(s.amount)}</b>
                       </div>`
             )
             .join("")}
         </div>`;
  refreshIcons();
}

function renderGroupExpenses() {
  const box = $("group-expenses");
  const payer = $("payer-filter").value; // filtre « par utilisateur »
  const list = payer ? GRP.expenses.filter((e) => e.paidBy === payer) : GRP.expenses;

  if (list.length === 0) {
    box.innerHTML = '<div class="empty"><i data-lucide="receipt"></i>Aucune dépense partagée.</div>';
    refreshIcons();
    return;
  }

  box.innerHTML = "";
  list.forEach((e) => {
    const parts = Object.entries(e.shares || {})
      .map(([id, v]) => `${escapeHtml(memberName(id))} ${formatMoney(v)}`)
      .join(" · ");
    const item = document.createElement("div");
    item.className = "expense-item";
    item.innerHTML = `
      <span class="expense-icon" style="--c:#4686fe"><i data-lucide="${e.splitMode === "custom" ? "split" : "users"}"></i></span>
      <div class="expense-main">
        <div class="expense-desc">${escapeHtml(e.description || "(sans description)")}</div>
        <div class="expense-meta">
          <span>${formatDate(e.expense_date)}</span>
          <span class="badge">payé par ${escapeHtml(memberName(e.paidBy))}</span>
          <span class="badge tag">${e.splitMode === "custom" ? "parts personnalisées" : "parts égales"}</span>
        </div>
        <div class="expense-shares">${parts}</div>
      </div>
      <div class="expense-amount">${formatMoney(e.amount)}</div>
      <div class="expense-actions">
        <button class="btn btn-icon btn-danger" title="Supprimer" aria-label="Supprimer"><i data-lucide="trash-2"></i></button>
      </div>`;
    item.querySelector("button").addEventListener("click", async () => {
      if (!confirm(`Supprimer « ${e.description || "cette dépense"} » ?`)) return;
      try {
        await deleteGroupExpense(GRP.current.id, e.id);
        toast("Dépense supprimée", "success");
        await refreshCurrentGroup();
      } catch (err) {
        toast("Erreur : " + err.message, "danger");
      }
    });
    box.appendChild(item);
  });
  refreshIcons();
}

async function refreshCurrentGroup() {
  GRP.expenses = await fetchGroupExpenses(GRP.current.id);
  renderBalances();
  renderGroupExpenses();
}

/* ========== Actions des formulaires ========== */

async function onCreateGroup(e) {
  e.preventDefault();
  const name = $("group-name").value.trim();
  if (!name) return;
  try {
    const id = await createGroup(name);
    $("group-name").value = "";
    toast("Groupe créé", "success");
    await loadGroups(id);
  } catch (err) {
    toast("Erreur : " + err.message, "danger");
  }
}

async function onAddMember(e) {
  e.preventDefault();
  const email = $("member-email").value;
  try {
    await addMemberByEmail(GRP.current, email);
    $("member-email").value = "";
    toast("Membre ajouté", "success");
    await loadGroups(GRP.current.id); // recharge la liste des membres
  } catch (err) {
    toast(err.message, "danger");
  }
}

async function onAddGroupExpense(e) {
  e.preventDefault();
  const g = GRP.current;
  const amount = Number($("ge-amount").value);
  if (!amount || amount <= 0) {
    toast("Montant invalide", "danger");
    return;
  }

  let shares;
  if (splitMode() === "equal") {
    shares = equalShares(amount, g.memberIds);
  } else {
    shares = readCustomShares();
    const total = Object.values(shares).reduce((t, v) => t + Math.round(v * 100), 0);
    if (total !== Math.round(amount * 100)) {
      toast("La somme des parts doit être égale au montant", "danger");
      return;
    }
  }

  try {
    await addGroupExpense(g.id, {
      amount,
      description: $("ge-desc").value.trim() || null,
      expense_date: $("ge-date").value || today(),
      paidBy: $("ge-payer").value,
      splitMode: splitMode(),
      shares,
    });
    toast("Dépense partagée ajoutée", "success");
    $("ge-amount").value = "";
    $("ge-desc").value = "";
    renderSplitBox();
    await refreshCurrentGroup();
  } catch (err) {
    toast("Erreur : " + err.message, "danger");
  }
}

async function onDeleteGroup() {
  const g = GRP.current;
  if (!confirm(`Supprimer le groupe « ${g.name} » et toutes ses dépenses ? C'est définitif.`)) return;
  try {
    await deleteGroup(g);
    toast("Groupe supprimé", "success");
    GRP.current = null;
    await loadGroups();
  } catch (err) {
    toast("Erreur : " + err.message, "danger");
  }
}
