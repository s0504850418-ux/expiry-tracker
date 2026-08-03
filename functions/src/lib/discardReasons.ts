// רשימה סגורה וקבועה מראש של סיבות פחת — לא שדה טקסט חופשי (ראו
// CLAUDE.md, "החלטות מוצר נעולות"). מוגדרת זהה גם בצד הלקוח
// (src/lib/discardReasons.ts) כדי שהתצוגה תתאים בדיוק לרשימה שהשרת מאמת.
export const DISCARD_REASONS = [
  "פג תוקף",
  "הכנת יתר",
  "בעיית איכות",
  "נפילה/זיהום",
  "טעות בהכנה",
  "אחר",
] as const;

export type DiscardReason = (typeof DISCARD_REASONS)[number];
