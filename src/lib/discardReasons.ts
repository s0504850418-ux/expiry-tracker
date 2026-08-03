// רשימה סגורה וקבועה מראש של סיבות פחת — לא שדה טקסט חופשי (ראו
// CLAUDE.md, "החלטות מוצר נעולות"). מוגדרת זהה גם בצד השרת
// (functions/src/lib/discardReasons.ts) כדי שהאימות בקצה יתאים בדיוק
// לרשימה שמוצגת למשתמש/ת.
export const DISCARD_REASONS = [
  "פג תוקף",
  "הכנת יתר",
  "בעיית איכות",
  "נפילה/זיהום",
  "טעות בהכנה",
  "אחר",
] as const;

export type DiscardReason = (typeof DISCARD_REASONS)[number];
