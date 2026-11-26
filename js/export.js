/* ============================================================
   export.js — Export CSV des dépenses (fonctionnalité avancée).
   On exporte la liste ACTUELLEMENT affichée, donc avec les filtres
   appliqués (date, catégorie, tag).

   Choix pour que le fichier s'ouvre bien dans Excel en français :
   - séparateur « ; » (la virgule sert déjà aux décimales)
   - montants avec une virgule : 45,20
   - « BOM » UTF-8 au début du fichier pour les accents
   ============================================================ */

// Protège une valeur pour le format CSV.
function csvCell(value) {
  let s = value == null ? "" : String(value);
  // Sécurité : une cellule qui commence par = + - @ pourrait être
  // interprétée comme une FORMULE par Excel (« injection CSV »).
  // On la préfixe d'une apostrophe pour la forcer en texte.
  if (/^[=+\-@]/.test(s)) s = "'" + s;
  // Guillemets si la valeur contient ; " ou un retour à la ligne.
  if (/[";\n\r]/.test(s)) s = '"' + s.replace(/"/g, '""') + '"';
  return s;
}

// Transforme une liste de dépenses en texte CSV.
function expensesToCSV(expenses) {
  const header = ["Date", "Description", "Catégorie", "Tags", "Montant (€)"];
  const rows = expenses.map((e) => [
    e.expense_date,
    e.description || "",
    e.category?.name || "Sans catégorie",
    (e.tags || []).join(", "),
    Number(e.amount).toFixed(2).replace(".", ","),
  ]);
  return [header, ...rows].map((row) => row.map(csvCell).join(";")).join("\r\n");
}

// Fait télécharger un texte comme fichier, sans serveur :
// on crée un « Blob » en mémoire et un lien <a download> temporaire.
function downloadTextFile(content, filename, mime) {
  const blob = new Blob(["﻿" + content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000); // libère la mémoire
}

// Exporte la liste donnée en fichier « depenses-AAAA-MM-JJ.csv ».
function exportExpensesCSV(expenses) {
  if (!expenses || expenses.length === 0) {
    toast("Aucune dépense à exporter avec ces filtres", "danger");
    return;
  }
  downloadTextFile(expensesToCSV(expenses), `depenses-${today()}.csv`, "text/csv;charset=utf-8");
  toast(`${expenses.length} dépense(s) exportée(s)`, "success");
}
