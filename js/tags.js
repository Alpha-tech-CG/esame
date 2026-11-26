/* ============================================================
   tags.js — Gestion des tags (étiquettes).

   Choix de conception NoSQL : avec Firestore, on ne crée PAS de
   table de liaison. Les tags d'une dépense sont stockés
   directement dans le document de la dépense, sous forme de
   tableau de chaînes, ex. : tags: ["courses", "promo"].
   C'est la façon idiomatique de modéliser ce genre de relation
   en base de données orientée documents.
   ============================================================ */

// Transforme une saisie libre ("courses, Promo ,") en tableau
// propre : minuscules, sans espaces, sans doublons, sans vide.
function parseTags(input) {
  if (!input) return [];
  const parts = Array.isArray(input) ? input : String(input).split(",");
  return [
    ...new Set(
      parts
        .map((t) => t.trim().toLowerCase())
        .filter((t) => t.length > 0)
    ),
  ];
}
