/* ============================================================
   filters.js — Lecture des champs de filtre et application.
   Les filtres disponibles : période (du / au), catégorie, tag.
   ============================================================ */

// Lit les valeurs des champs de filtre présents sur la page et
// renvoie un objet { from, to, categoryId, tagName }.
function readFilters() {
  const get = (id) => {
    const el = document.getElementById(id);
    return el ? el.value : "";
  };
  return {
    from: get("filter-from") || null,
    to: get("filter-to") || null,
    categoryId: get("filter-category") || null,
    tagName: (get("filter-tag") || "").trim().toLowerCase() || null,
  };
}

// Applique le filtre « tag » côté client : ne garde que les
// dépenses qui portent le tag recherché. Les tags sont stockés
// dans un tableau de chaînes sur chaque dépense (ex. ["courses"]).
function filterByTag(expenses, tagName) {
  if (!tagName) return expenses;
  return expenses.filter((e) =>
    (e.tags || []).map((t) => String(t).toLowerCase()).includes(tagName)
  );
}

// Remet les filtres à zéro.
function resetFilters() {
  ["filter-from", "filter-to", "filter-category", "filter-tag"].forEach((id) => {
    const el = document.getElementById(id);
    if (el) el.value = "";
  });
}
